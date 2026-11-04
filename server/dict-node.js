// Carrega o dicionário no Node (servidor local, função da Vercel e testes).
// Inclui as formas flexionadas (data/formas.txt.gz), que só existem no servidor.
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { setDictWords, setBlocked, addForms, allWords } from '../js/core/dict.js';

const DATA = new URL('../data/', import.meta.url);
const list = (f) => readFileSync(new URL(f, DATA), 'utf8').split('\n');

export function loadServerDict({ forms = true } = {}) {
  if (allWords().length) return;
  setBlocked(existsSync(new URL('bloqueadas.txt', DATA)) ? list('bloqueadas.txt') : []);
  setDictWords(list('palavras.txt'), list('comuns.txt'));
  if (forms && existsSync(new URL('formas.txt.gz', DATA))) {
    addForms(gunzipSync(readFileSync(new URL('formas.txt.gz', DATA))).toString('utf8'));
  }
}
