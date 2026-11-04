import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadTestDict, fakeLlmFetch } from './helpers.mjs';
import { isWord } from '../js/core/dict.js';
import { createVerifier, parseAnswer } from '../server/ai.js';
loadTestDict();
const quiet = { info() {}, warn() {} };

// parseAnswer: tolerante a texto ao redor, exige confiança e forma compatível
assert.equal(parseAnswer('```json\n{"existe": true, "forma": "zoeira", "confianca": 0.95}\n```', 'zoeira').ok, true);
assert.equal(parseAnswer('{"existe": true, "confianca": 0.4}', 'x').ok, false);
assert.equal(parseAnswer('{"existe": true, "forma": "casa", "confianca": 1}', 'zoeira').ok, false);
assert.equal(parseAnswer('não sei', 'x').ok, false);

// Palavras comuns agora estão no dicionário (conjugações etc.)
for (const w of ['comeu', 'gostei', 'falamos', 'como', 'essa']) assert.ok(isWord(w), w);
// formas flexionadas (servidor) e palavras bloqueadas
for (const w of ['comemos', 'pulamos', 'sorriram', 'casinhas', 'bebemos', 'zoo', 'transe']) assert.ok(isWord(w), w);
for (const w of ['merda', 'porra', 'caralho', 'viado', 'mano', 'pra', 'pedro', 'jane', 'helena']) assert.ok(!isWord(w), w);

const dir = mkdtempSync(path.join(tmpdir(), 'trama-'));
const calls = [];
const v = createVerifier({
  env: { LLM_BASE_URL: 'http://llm.local/v1/', LLM_API_KEY: 'k', LLM_MODEL: 'teste' },
  cacheFile: path.join(dir, 'cache.json'),
  learnedFile: path.join(dir, 'aprendidas.txt'),
  fetchImpl: fakeLlmFetch({ printaram: '{"existe": true, "forma": "printaram", "confianca": 0.9, "motivo": "verbo printar"}', bugado: 'erro' }, calls),
  log: quiet,
});
assert.equal(v.enabled, true);
assert.deepEqual(await v.verify('casa'), { ok: true, fonte: 'dicionario' });
assert.equal((await v.verify('ab')).fonte, 'invalida');
// palavrão, gíria ou nome: recusado sem nem perguntar à IA
for (const w of ['merda', 'zoeira', 'pedro']) assert.equal((await v.verify(w)).fonte, 'bloqueada', w);
assert.equal(calls.length, 0);
// duas verificações simultâneas da mesma palavra = 1 chamada
const [r1, r2] = await Promise.all([v.verify('printaram'), v.verify('PRINTARAM')]);
assert.equal(r1.ok, true);
assert.equal(r1.fonte, 'ia');
assert.equal(r2.ok, true);
assert.equal(calls.length, 1);
assert.equal(calls[0].url, 'http://llm.local/v1/chat/completions');
assert.equal(calls[0].auth, 'Bearer k');
assert.ok(isWord('printaram'), 'palavra aprovada entra no dicionário');
assert.equal((await v.verify('printaram')).fonte, 'dicionario');
// rejeitada fica em cache
assert.equal((await v.verify('xablau')).ok, false);
assert.equal((await v.verify('xablau')).fonte, 'cache');
assert.equal(calls.length, 2);
// erro de rede: não aprova e não guarda em cache
assert.equal((await v.verify('bugado')).fonte, 'indisponivel');
assert.equal((await v.verify('bugado')).fonte, 'indisponivel');
assert.equal(calls.length, 4);
await new Promise((r) => setTimeout(r, 700));
assert.ok(existsSync(path.join(dir, 'cache.json')));
assert.equal(readFileSync(path.join(dir, 'aprendidas.txt'), 'utf8'), 'printaram');
// IA desligada sem LLM_BASE_URL
const off = createVerifier({ env: {}, log: quiet });
assert.equal(off.enabled, false);
assert.equal((await off.verify('xpto')).fonte, 'indisponivel');
console.log('ok ai');
