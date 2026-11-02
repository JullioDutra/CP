// Backend em processo (Node): usado pela função da Vercel quando SUPABASE_DB_URL está
// configurada, e pelos testes. Carrega o dicionário uma vez por instância.
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { setDictWords, allWords } from '../js/core/dict.js';
import { createVerifier } from './ai.js';
import { createBackend, PG_OPTIONS } from './backend.js';

const DATA = new URL('../data/', import.meta.url);

// Cria as tabelas na primeira vez (banco novo, ex.: Neon pela Vercel). Funciona também
// fora do Supabase, onde não existem os papéis anon/authenticated.
export async function ensureSchema(db) {
  const [{ ok }] = await db`SELECT to_regclass('trama.rooms') IS NOT NULL AS ok`;
  if (ok) return false;
  let sql = await readFile(new URL('../deployment/schema.sql', import.meta.url), 'utf8');
  const [{ n }] = await db`SELECT COUNT(*)::int AS n FROM pg_roles WHERE rolname IN ('anon', 'authenticated')`;
  if (n < 2) sql = sql.replaceAll(', anon, authenticated', '');
  await db.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(71903299)`;
    const [{ ok: again }] = await tx`SELECT to_regclass('trama.rooms') IS NOT NULL AS ok`;
    if (!again) await tx.unsafe(sql);
  });
  return true;
}

export async function localBackend(databaseUrl, { max = 5, verifier = createVerifier() } = {}) {
  if (!allWords().length) {
    const [all, common] = await Promise.all([readFile(new URL('palavras.txt', DATA), 'utf8'), readFile(new URL('comuns.txt', DATA), 'utf8')]);
    setDictWords(all.split('\n'), common.split('\n'));
  }
  const db = postgres(databaseUrl, { ...PG_OPTIONS, max, onnotice: () => {} });
  await ensureSchema(db);
  const handle = createBackend({ db, verifier });
  handle.close = () => db.end({ timeout: 2 });
  return handle;
}
