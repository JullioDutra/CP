import { Buffer } from 'node:buffer';
import postgres from 'npm:postgres@3.4.7';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { createPostgresStore } from '../server/postgres-store.js';
import { createApi } from '../server/api.js';
import { createVerifier } from '../server/ai.js';
import { handleMulti, arenaStatus } from '../server/durable-rooms.js';
import { setDictWords } from '../js/core/dict.js';
import { dictionary, common } from './dictionary.js';

setDictWords(dictionary.split('\n'), common.split('\n'));
const db = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1, idle_timeout: 20,
  types: { bigint: { to: 20, from: [20, 1700], serialize: String, parse: Number } } });
const verifier = createVerifier({ env: {} });

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const token = request.headers.get('x-trama-backend') || '';
  if (token.length !== 64) return new Response('Unauthorized', { status: 401 });
  try {
    const digest = createHash('sha256').update(token).digest('hex');
    const keys = await db`SELECT 1 FROM trama.backend_keys WHERE hash = ${digest}`;
    if (!keys.length) return new Response('Unauthorized', { status: 401 });
    const raw = await request.text();
    if (raw.length > 100000) return new Response('Too large', { status: 413 });
    const input = JSON.parse(raw);
    const result = await db.begin(async sql => {
      await sql`SET LOCAL search_path = trama, public`;
      await sql`SET LOCAL statement_timeout = '15s'`;
      const store = createPostgresStore(sql);
      if (input.action === 'multi') return await handleMulti(sql, store, input);
      if (input.action !== 'api') throw new Error('Invalid action');
      const url = new URL(input.path, 'https://trama.invalid');
      const method = input.method;
      const profile = String(input.profile || '').slice(0, 100);
      // Lock per profile: prevents simultaneous daily tickets and result submissions.
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
    return Response.json(result);
  } catch (e) {
    console.error('trama-backend', e.message);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
});
