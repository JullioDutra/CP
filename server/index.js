// Servidor do Trama: entrega os arquivos do jogo, a API (/api/*) e as salas em tempo real (WebSocket).
// Uso: npm start   →   http://localhost:8080
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadServerDict } from './dict-node.js';
import { RoomManager } from './rooms.js';
import { sharePage } from './share-page.js';
import { createVerifier, loadDotEnv } from './ai.js';
import { createStore } from './store.js';
import { createApi } from './api.js';
import { publicPath } from './static.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotEnv(path.join(ROOT, '.env'));
const PORT = Number(process.env.PORT) || 8080;
const DATA_DIR = process.env.TRAMA_DATA_DIR || path.join(ROOT, 'data', 'runtime');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

loadServerDict();

const verifier = createVerifier({
  cacheFile: path.join(DATA_DIR, 'ia-cache.json'),
  learnedFile: path.join(DATA_DIR, 'aprendidas.txt'),
});
const store = createStore(process.env.TRAMA_DB || path.join(DATA_DIR, 'trama.db'));
const manager = new RoomManager({ verifier, store });
const api = createApi({ verifier, store, arenaStatus: () => manager.arenaStatus() });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/healthz') { res.end('ok'); return; }
    if (url.pathname.startsWith('/api/')) { await api(req, res, url); return; }
    const share = /^\/s\/([A-Za-z]{4})$/.exec(url.pathname);
    if (share) {
      const code = share[1].toUpperCase();
      const r = manager.rooms.get(code);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(sharePage(code, r ? { mode: r.options.mode, phase: r.phase, players: r.players.size, title: r.title } : null, `http://${req.headers.host}`, url.searchParams.get('p')));
      return;
    }
    const rel = publicPath(url.pathname);
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep)) throw new Error('caminho inválido');
    if (!(await stat(file)).isFile()) throw new Error('não é arquivo');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Não encontrado');
  }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  const client = manager.connect((msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg)));
  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    client.handle(msg);
  });
  ws.on('close', () => client.close());
});

// derruba conexões mortas
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000).unref();

server.listen(PORT, () => {
  console.log(`Trama rodando em http://localhost:${PORT}`);
  console.log(verifier.enabled ? `  IA de palavras: ligada (${verifier.model})` : '  IA de palavras: desligada (configure LLM_BASE_URL no .env)');
  for (const list of Object.values(networkInterfaces()))
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  na mesma rede Wi-Fi: http://${a.address}:${PORT}`);
});
