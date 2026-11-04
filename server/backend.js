// Lógica do servidor hospedado, comum à Vercel (Node) e à Edge Function do Supabase (Deno).
// Cada chamada roda numa transação do Postgres: perfis/ranking (action "api") e
// comandos das salas multijogador (action "multi").
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { createPostgresStore } from './postgres-store.js';
import { createApi } from './api.js';
import { handleMulti, arenaStatus } from './durable-rooms.js';

/**
 * @param {object} o
 * @param {import('postgres').Sql} o.db  cliente postgres.js (pooler em modo transação, prepare: false)
 * @param {object} o.verifier  verificador de palavras (IA)
 */
export function createBackend({ db, verifier }) {
  return async function handle(input) {
    return db.begin(async (sql) => {
      await sql`SET LOCAL search_path = trama, public`;
      await sql`SET LOCAL statement_timeout = '15s'`;
      const store = createPostgresStore(sql);
      if (input.action === 'multi') return await handleMulti(sql, store, input);
      if (input.action === 'metrics') { await store.addMetrics(Array.isArray(input.rows) ? input.rows : []); return { ok: true }; }
      if (input.action === 'room') {
        const [row] = await sql`SELECT state->'options'->>'mode' AS mode, state->>'phase' AS phase, jsonb_array_length(COALESCE(state->'players'->'__map', '[]'::jsonb)) AS players
          FROM rooms WHERE code = ${String(input.code || '').toUpperCase().slice(0, 8)}`;
        return row ? { mode: row.mode, phase: row.phase, players: Number(row.players) } : null;
      }
      if (input.action !== 'api') throw new Error('Invalid action');
      const url = new URL(input.path, 'https://trama.invalid');
      const method = input.method;
      const profile = String(input.profile || '').slice(0, 100);
      // Trava por perfil: evita tickets diários e envios de resultado simultâneos.
      if (profile) await sql`SELECT pg_advisory_xact_lock(hashtextextended(${profile}, 1))`;
      const ip = String(input.ip || 'unknown').slice(0, 100);
      const now = Date.now();
      if (method !== 'GET') {
        const cap = url.pathname === '/api/perfil' && method === 'POST' ? 40 : 600;
        const key = createHash('sha256').update(ip + ':' + url.pathname).digest('hex');
        const [rate] = await sql`INSERT INTO rate_limits (key, hits, expires_at) VALUES (${key}, 1, ${now + 3600000})
          ON CONFLICT(key) DO UPDATE SET hits = CASE WHEN rate_limits.expires_at < ${now} THEN 1 ELSE rate_limits.hits + 1 END,
          expires_at = CASE WHEN rate_limits.expires_at < ${now} THEN ${now + 3600000} ELSE rate_limits.expires_at END RETURNING hits`;
        if (rate.hits > cap) return { status: 429, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ erro: 'Muitas requisições, tente mais tarde' }) };
      }
      const req = Readable.from([Buffer.from(input.body || '')]);
      Object.assign(req, { method, headers: { 'x-trama-perfil': profile }, socket: { remoteAddress: ip } });
      let status = 200, headers = {}, body = '';
      const res = { writeHead(code, h) { status = code; headers = h; }, end(data) { body = String(data || ''); } };
      await createApi({ verifier, store, arenaStatus: () => arenaStatus(sql) })(req, res, url);
      if (status >= 500) throw new Error('API transaction failed');
      return { status, headers, body };
    });
  };
}

// Opções do postgres.js para o pooler do Supabase (modo transação).
export const PG_OPTIONS = {
  prepare: false,
  idle_timeout: 20,
  types: { bigint: { to: 20, from: [20, 1700], serialize: String, parse: Number } },
};
