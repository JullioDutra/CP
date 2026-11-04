import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { WebSocketServer } from 'ws';
import { publicPath } from '../server/static.js';
import { sharePage } from '../server/share-page.js';
import { localBackend } from '../server/local-backend.js';

const ROOT = new URL('../', import.meta.url);
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css', txt: 'text/plain; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
// Com um Postgres configurado, o jogo roda aqui mesmo (instância da Vercel fica "quente":
// dicionário e conexões reaproveitados). Vale o do Supabase (SUPABASE_DB_URL) ou um
// banco criado pela própria Vercel, como o Neon (DATABASE_URL / POSTGRES_URL).
// Sem nenhum, chama a Edge Function do Supabase.
const DB_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;
const inProcess = DB_URL ? localBackend(DB_URL) : null;

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
    // link da sala com prévia (WhatsApp, Telegram…): /s/ABCD → página com título/descrição e redireciona
    const share = /^\/s\/([A-Za-z]{4})$/.exec(url.pathname);
    if (share) {
      const code = share[1].toUpperCase();
      const info = await backend({ action: 'room', code }).catch(() => null);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(sharePage(code, info, `https://${req.headers.host}`, url.searchParams.get('p')));
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      let body = '';
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 65536) { res.writeHead(413); res.end(); return; } }
      const t0 = performance.now();
      const result = await backend({ action: 'api', path: url.pathname + url.search, method: req.method,
        profile: req.headers['x-trama-perfil'], body, ip: req.headers['x-vercel-forwarded-for'] || req.socket.remoteAddress });
      // tempo gasto no banco/servidor do jogo (ajuda a medir a latência em produção)
      res.writeHead(result.status, { ...result.headers, 'server-timing': `backend;desc="${inProcess ? 'postgres' : 'edge'}";dur=${(performance.now() - t0).toFixed(0)}` });
      res.end(result.body); return;
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
// ---------- métricas: cada instância soma por minuto e grava uma linha por tipo ----------
const metrics = new Map(); // kind -> { calls, total_ms, max_ms, errors, empty }
function metric(kind, ms, { error = false, empty = false } = {}) {
  const m = metrics.get(kind) || { calls: 0, total_ms: 0, max_ms: 0, errors: 0, empty: 0 };
  m.calls++; m.total_ms += Math.round(ms); m.max_ms = Math.max(m.max_ms, Math.round(ms));
  if (error) m.errors++;
  if (empty) m.empty++;
  metrics.set(kind, m);
}
setInterval(() => {
  if (!metrics.size) return;
  const rows = [...metrics].map(([kind, m]) => ({ at: Date.now(), kind, ...m }));
  metrics.clear();
  backend({ action: 'metrics', rows }).catch(() => {});
}, 60000).unref?.();

// ---------- aviso instantâneo (LISTEN/NOTIFY) ----------
// Com uma conexão direta ao Postgres (sem pooler), esta instância escuta 'trama_room': quando
// qualquer instância grava uma sala, os celulares dela aqui consultam na hora. A consulta
// periódica continua como reserva, só que mais espaçada.
const LISTEN_URL = inProcess ? process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING : null;
const watchers = new Map(); // código da sala -> Set(função que consulta já)
let listening = false;
if (LISTEN_URL && process.env.TRAMA_LISTEN !== '0') {
  import('postgres').then(({ default: postgres }) => {
    const pg = postgres(LISTEN_URL, { max: 1, idle_timeout: 0, connect_timeout: 10, onnotice: () => {} });
    return pg.listen('trama_room', (code) => { for (const wake of watchers.get(code) || []) wake(); },
      () => { listening = true; }); // chamado também ao reconectar
  }).catch((e) => { listening = false; console.error('[listen]', e.message); });
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Falhas passageiras do banco (conexões cheias, timeout): tenta de novo antes de desistir.
async function backendRetry(payload, tries) {
  for (let k = 0; ; k++) {
    try { return await backend(payload); } catch (e) {
      if (k >= tries - 1) throw e;
      await sleep(250 * 3 ** k);
    }
  }
}
wss.on('connection', (ws) => {
  const session = randomUUID();
  let queue = Promise.resolve(), queued = 0, closed = false, timer, failures = 0, phase = 'lobby';
  let version = null, since = 0; // versão da sala que este celular já tem e última reação entregue
  let roomCode = null;
  const wake = () => { if (closed) return; if (queued) { setTimeout(wake, 150); return; } clearTimeout(timer); poll(); };
  const watch = (code) => {
    if (code === roomCode) return;
    if (roomCode) watchers.get(roomCode)?.delete(wake);
    roomCode = code || null;
    if (roomCode) { if (!watchers.has(roomCode)) watchers.set(roomCode, new Set()); watchers.get(roomCode).add(wake); }
  };
  const send = (message) => { if (ws.readyState === 1) ws.send(JSON.stringify(message)); };
  const run = (msg) => {
    if (queued >= 24) { send({ t: 'error', message: 'Devagar!' }); return; }
    queued++;
    queue = queue.then(async () => {
      // jogadas e comandos tentam até 3 vezes; a consulta periódica, 1 vez (a próxima vem logo)
      const t0 = performance.now();
      const messages = await backendRetry({ action: 'multi', session, msg }, msg.t === 'poll' ? 1 : 3)
        .catch((e) => { metric(msg.t === 'poll' ? 'poll' : msg.t === 'act' ? 'act' : 'cmd', performance.now() - t0, { error: true }); throw e; });
      metric(msg.t === 'poll' ? 'poll' : msg.t === 'act' ? 'act' : 'cmd', performance.now() - t0, { empty: !messages.length });
      failures = 0;
      for (const message of messages) {
        if (message.t === 'state') {
          if (message.state?.phase) phase = message.state.phase;
          if (message.state?.code) watch(message.state.code);
          if (message.v != null) version = message.v;
          delete message.v;
        }
        if (message.t === 'reaction') since = Math.max(since, message.at || 0);
        send(message);
      }
    }).catch(e => {
      console.error('[multi]', e.message);
      failures++;
      // a palavra não se perde em silêncio: o celular avisa para enviar de novo (amarelo, não vermelho)
      if (msg.t === 'act') send({ t: 'res', rid: msg.rid, result: { ok: false, retry: true, reason: 'Conexão instável. Envie de novo.' } });
      else if (msg.t !== 'poll' && msg.t !== 'disconnect') send({ t: 'error', message: 'Conexão instável. Tente de novo.' });
      // só reconecta depois de várias falhas seguidas
      if (failures >= 6 && !closed) ws.close(1011, 'Reconectando');
    }).finally(() => queued--);
    return queue;
  };
  ws.on('message', data => {
    let msg;
    try { msg = JSON.parse(String(data)); } catch { return; }
    if (!msg || typeof msg !== 'object' || !['create','join','quick','resume','watch','ready','options','start','next','rematch','want','host','privacy','act','react','leave','ping'].includes(msg.t)) return;
    run(msg);
  });
  // durante a rodada consulta a cada 1 s; no saguão/resultados, a cada 2,5 s (menos carga no banco).
  // Com o aviso instantâneo ligado, a consulta é só reserva (e para o relógio da rodada).
  const pollEvery = () => (phase === 'playing' || phase === 'countdown' ? (listening ? 1500 : 1000) : (listening ? 5000 : 2500)) + (failures ? Math.min(4000, 1000 * failures) : 0);
  const poll = async () => { if (closed) return; if (!queued) await run({ t: 'poll', v: version, since }); if (!closed) timer = setTimeout(poll, pollEvery()); };
  timer = setTimeout(poll, 1000);
  // a função da Vercel vive no máximo 300 s: aos 240 s o celular abre outra conexão e volta
  // para a sala sozinho (sem aviso de "reconectando")
  const rotate = setTimeout(() => send({ t: 'rotate' }), Number(process.env.TRAMA_ROTATE_MS) || 240000);
  ws.on('close', () => { closed = true; clearTimeout(timer); clearTimeout(rotate); watch(null); run({ t: 'disconnect' }); });
});
export default server;

export { sharePage } from '../server/share-page.js';
