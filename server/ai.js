// Verificador de palavras com IA.
// Quando um jogador envia uma palavra que NÃO está no dicionário, perguntamos a um
// modelo de linguagem se ela existe no português. As respostas ficam em cache (em
// memória e em disco) e as palavras aprovadas passam a valer para todo mundo.
//
// Funciona com qualquer API compatível com OpenAI (/v1/chat/completions):
//   FreeLLMAPI (proxy local de LLMs grátis), Groq, OpenRouter, Gemini (modo OpenAI), Ollama…
// Configuração por variáveis de ambiente (ou arquivo .env na raiz):
//   LLM_BASE_URL  ex.: http://localhost:3001/v1   (obrigatório para ligar a IA)
//   LLM_API_KEY   chave do provedor (opcional para servidores locais)
//   LLM_MODEL     nome do modelo (ex.: llama-3.3-70b-versatile)
//   LLM_TIMEOUT_MS  padrão 6000
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { normalize, isPlayable, isWord, addWords } from '../js/core/dict.js';

const MIN_CONFIDENCE = 0.7;
const MAX_PER_MINUTE = 60;

export const SYSTEM_PROMPT = `Você é o juiz de palavras de um jogo de palavras em português do Brasil.
Recebe UMA sequência de letras SEM ACENTOS (ex.: "voce" = "você", "acao" = "ação").
Decida se ela é uma palavra válida do português brasileiro para o jogo.

VALE: substantivos, adjetivos, verbos em qualquer conjugação, plurais, femininos,
diminutivos e aumentativos de uso real, advérbios, pronomes, preposições e palavras
de dicionário (Houaiss, Aurélio, Michaelis, VOLP), incluindo gírias dicionarizadas.
NÃO VALE: nomes próprios (pessoas, cidades, marcas), siglas, abreviações, palavras
estrangeiras não aportuguesadas, erros de digitação e sequências inventadas.

Responda SOMENTE com JSON, sem texto extra:
{"existe": true|false, "forma": "palavra com acentos ou null", "confianca": 0.0-1.0, "motivo": "até 10 palavras"}`;

export function createVerifier({
  env = process.env,
  cacheFile,
  learnedFile,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  log = console,
} = {}) {
  const baseUrl = (env.LLM_BASE_URL || '').replace(/\/+$/, '');
  const apiKey = env.LLM_API_KEY || '';
  const model = env.LLM_MODEL || 'llama-3.3-70b-versatile';
  const timeoutMs = Number(env.LLM_TIMEOUT_MS) || 6000;
  const enabled = !!baseUrl;

  const cache = new Map(); // palavra -> { ok, forma, motivo, model, at }
  const inflight = new Map();
  let calls = [];

  if (cacheFile && existsSync(cacheFile)) {
    try {
      for (const [w, v] of Object.entries(JSON.parse(readFileSync(cacheFile, 'utf8')))) cache.set(w, v);
    } catch (e) {
      log.warn?.('[ia] cache inválido, ignorando:', e.message);
    }
  }
  // palavras já aprovadas voltam para o dicionário ao reiniciar
  addWords([...cache].filter(([, v]) => v.ok).map(([w]) => w));

  let saveTimer = null;
  function persist() {
    if (!cacheFile) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        mkdirSync(path.dirname(cacheFile), { recursive: true });
        writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(cache), null, 1));
        if (learnedFile) writeFileSync(learnedFile, learned().join('\n'));
      } catch (e) {
        log.warn?.('[ia] não foi possível salvar o cache:', e.message);
      }
    }, 500);
    saveTimer.unref?.();
  }

  const learned = () => [...cache].filter(([, v]) => v.ok).map(([w]) => w).sort();

  async function askModel(word) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: 120,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Palavra: "${word}"` },
          ],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return parseAnswer(data?.choices?.[0]?.message?.content ?? '', word);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Verifica uma palavra. Nunca lança erro.
   * @returns {Promise<{ok:boolean, fonte:'dicionario'|'ia'|'cache'|'indisponivel'|'invalida', forma?:string, motivo?:string}>}
   */
  async function verify(raw) {
    const word = normalize(raw);
    if (!isPlayable(word)) return { ok: false, fonte: 'invalida', motivo: 'Use de 3 a 12 letras' };
    if (isWord(word)) return { ok: true, fonte: 'dicionario' };
    if (cache.has(word)) return { ...cache.get(word), fonte: 'cache' };
    if (!enabled) return { ok: false, fonte: 'indisponivel' };
    if (inflight.has(word)) return inflight.get(word);

    const t = now();
    calls = calls.filter((c) => t - c < 60000);
    if (calls.length >= MAX_PER_MINUTE) return { ok: false, fonte: 'indisponivel', motivo: 'IA ocupada, tente de novo' };
    calls.push(t);

    const p = askModel(word)
      .then((ans) => {
        const entry = { ok: ans.ok, forma: ans.forma, motivo: ans.motivo, model, at: new Date(t).toISOString() };
        cache.set(word, entry);
        if (ans.ok) addWords([word]);
        persist();
        log.info?.(`[ia] ${word}: ${ans.ok ? 'VALE' : 'não vale'} (${ans.motivo || ''})`);
        return { ...entry, fonte: 'ia' };
      })
      .catch((e) => {
        log.warn?.(`[ia] falha ao verificar "${word}": ${e.message}`);
        return { ok: false, fonte: 'indisponivel', motivo: 'IA indisponível' };
      })
      .finally(() => inflight.delete(word));
    inflight.set(word, p);
    return p;
  }

  return { enabled, model, verify, learned, cache };
}

// Interpreta a resposta do modelo de forma tolerante (JSON puro, com ``` ou com texto ao redor).
export function parseAnswer(text, word) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, motivo: 'resposta sem JSON' };
  let j;
  try { j = JSON.parse(m[0]); } catch { return { ok: false, motivo: 'JSON inválido' }; }
  const existe = j.existe === true || j.existe === 'true';
  const conf = Number(j.confianca ?? j.confidence ?? 1);
  const forma = typeof j.forma === 'string' ? j.forma.trim().slice(0, 30) : null;
  // a forma acentuada sugerida precisa bater com as letras enviadas
  const formaOk = !forma || normalize(forma) === word;
  return {
    ok: existe && conf >= MIN_CONFIDENCE && formaOk,
    forma: formaOk ? forma : null,
    motivo: String(j.motivo || '').slice(0, 80),
  };
}

// Carrega um arquivo .env simples (CHAVE=valor) sem dependências.
export function loadDotEnv(file, env = process.env) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
