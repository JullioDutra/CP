// Edge Function do Supabase (plano B do servidor): mesma lógica de server/backend.js.
// Só aceita chamadas da Vercel com o segredo TRAMA_BACKEND_SECRET (hash em trama.backend_keys).
import postgres from 'npm:postgres@3.4.7';
import { createHash } from 'node:crypto';
import { createBackend, PG_OPTIONS } from '../server/backend.js';
import { createVerifier } from '../server/ai.js';
import { setDictWords } from '../js/core/dict.js';
import { dictionary, common } from './dictionary.js';

setDictWords(dictionary.split('\n'), common.split('\n'));
const db = postgres(Deno.env.get('SUPABASE_DB_URL')!, { ...PG_OPTIONS, max: 1 });
const handle = createBackend({ db, verifier: createVerifier({ env: {} }) });

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
    return Response.json(await handle(JSON.parse(raw)));
  } catch (e) {
    console.error('trama-backend', e.message);
    return Response.json({ error: 'Erro interno' }, { status: 500 });
  }
});
