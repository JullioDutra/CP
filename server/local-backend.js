// Backend em processo (Node): usado pela função da Vercel quando SUPABASE_DB_URL está
// configurada, e pelos testes. Carrega o dicionário uma vez por instância.
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { setDictWords, allWords } from '../js/core/dict.js';
import { createVerifier } from './ai.js';
import { createBackend, PG_OPTIONS } from './backend.js';

const DATA = new URL('../data/', import.meta.url);

export async function localBackend(databaseUrl, { max = 5, verifier = createVerifier() } = {}) {
  if (!allWords().length) {
    const [all, common] = await Promise.all([readFile(new URL('palavras.txt', DATA), 'utf8'), readFile(new URL('comuns.txt', DATA), 'utf8')]);
    setDictWords(all.split('\n'), common.split('\n'));
  }
  const db = postgres(databaseUrl, { ...PG_OPTIONS, max });
  const handle = createBackend({ db, verifier });
  handle.close = () => db.end({ timeout: 2 });
  return handle;
}
