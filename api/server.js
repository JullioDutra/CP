import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { WebSocketServer } from 'ws';
import { publicPath } from '../server/static.js';
import { localBackend } from '../server/local-backend.js';

const ROOT = new URL('../', import.meta.url);
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css', txt: 'text/plain; charset=utf-8', svg: 'image/svg+xml', webmanifest: 'application/manifest+json' };
// Com SUPABASE_DB_URL, o jogo roda aqui mesmo (instância da Vercel fica "quente":
// dicionário e conexões reaproveitados). Sem ela, chama a Edge Function do Supabase.
const inProcess = process.env.SUPABASE_DB_URL ? localBackend(process.env.SUPABASE_DB_URL) : null;

export async function backend(payload) {
  if (inProcess) return (await inProcess)(payload);
  if (!process.env.TRAMA_BACKEND_URL || !process.env.TRAMA_BACKEND_SECRET) throw new Error('Backend não configurado');
  const response = await fetch(process.env.TRAMA_BACKEND_URL, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-trama-backend': process.env.TRAMA_BACKEND_SECRET },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Backend ${response.status}`);
  return response.json();
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'https://trama.invalid');
    if (url.pathname === '/healthz') { res.end('ok'); return; }
    if (url.pathname.startsWith('/api/')) {
      let body = '';
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 65536) { res.writeHead(413); res.end(); return; } }
      const result = await backend({ action: 'api', path: url.pathname + url.search, method: req.method,
        profile: req.headers['x-trama-perfil'], body, ip: req.headers['x-vercel-forwarded-for'] || req.socket.remoteAddress });
      res.writeHead(result.status, result.headers); res.end(result.body); return;
    }
    const rel = publicPath(url.pathname);
    const file = new URL(rel, ROOT);
    if (!file.href.startsWith(ROOT.href)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[rel.split('.').pop()] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(await readFile(file));
  } catch (e) {
    console.error('[trama]', e.message);
    if (!res.headersSent) res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ erro: 'Serviço temporariamente indisponível. Tente novamente.' }));
  }
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', (ws) => {
  const session = randomUUID();
  let queue = Promise.resolve(), queued = 0, closed = false, timer;
  const send = (message) => { if (ws.readyState === 1) ws.send(JSON.stringify(message)); };
  const run = (msg) => {
    if (queued >= 24) { send({ t: 'error', message: 'Devagar!' }); return; }
    queued++;
    queue = queue.then(async () => {
      const messages = await backend({ action: 'multi', session, msg });
      for (const message of messages) send(message);
    }).catch(e => { console.error('[multi]', e.message); if (!closed) ws.close(1011, 'Reconectando'); }).finally(() => queued--);
    return queue;
  };
  ws.on('message', data => {
    let msg;
    try { msg = JSON.parse(String(data)); } catch { return; }
    if (!msg || typeof msg !== 'object' || !['create','join','quick','resume','watch','ready','options','start','next','rematch','act','react','leave','ping'].includes(msg.t)) return;
    run(msg);
  });
  const poll = async () => { if (closed) return; if (!queued) await run({ t: 'poll' }); if (!closed) timer = setTimeout(poll, 1000); };
  timer = setTimeout(poll, 1000);
  ws.on('close', () => { closed = true; clearTimeout(timer); run({ t: 'disconnect' }); });
});
export default server;
