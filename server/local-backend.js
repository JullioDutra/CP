// Backend em processo (Node): usado pela função da Vercel quando SUPABASE_DB_URL está
// configurada, e pelos testes. Carrega o dicionário uma vez por instância.
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { loadServerDict } from './dict-node.js';
import { createVerifier } from './ai.js';
import { createBackend, PG_OPTIONS } from './backend.js';


// Cria as tabelas na primeira vez (banco novo, ex.: Neon pela Vercel). Funciona também
// fora do Supabase, onde não existem os papéis anon/authenticated.
export async function ensureSchema(db) {
  const [{ ok }] = await db`SELECT to_regclass('trama.rooms') IS NOT NULL AS ok`;
  if (ok) { await migrate(db); return false; }
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

// Colunas novas da tabela de salas (bancos criados antes delas).
async function migrate(db) {
  const [{ n }] = await db`SELECT COUNT(*)::int AS n FROM information_schema.columns WHERE table_schema = 'trama' AND table_name = 'rooms' AND column_name = 'player_ids'`;
  if (n) return;
  await db.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(71903299)`;
    await tx.unsafe(`ALTER TABLE trama.rooms ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE trama.rooms ADD COLUMN IF NOT EXISTS deadline BIGINT;
      ALTER TABLE trama.rooms ADD COLUMN IF NOT EXISTS final_pending BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE trama.rooms ADD COLUMN IF NOT EXISTS connected TEXT NOT NULL DEFAULT '';
      ALTER TABLE trama.rooms ADD COLUMN IF NOT EXISTS player_ids TEXT NOT NULL DEFAULT '';`);
  });
}

export async function localBackend(databaseUrl, { max = 5, verifier = createVerifier() } = {}) {
  loadServerDict();
  const db = postgres(databaseUrl, { ...PG_OPTIONS, max, onnotice: () => {} });
  await ensureSchema(db);
  const handle = createBackend({ db, verifier });
  handle.close = () => db.end({ timeout: 2 });
  return handle;
}
