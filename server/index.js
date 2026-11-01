// Servidor do Trama: entrega os arquivos do jogo e cuida das salas em tempo real (WebSocket).
// Uso: npm start   →   http://localhost:8080
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { setDictWords } from '../js/core/dict.js';
import { RoomManager } from './rooms.js';
import { createVerifier, loadDotEnv } from './ai.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotEnv(path.join(ROOT, '.env'));
const PORT = Number(process.env.PORT) || 8080;
const DATA_DIR = process.env.TRAMA_DATA_DIR || path.join(ROOT, 'data', 'runtime');
const PUBLIC = ['index.html', 'css/', 'js/', 'data/palavras.txt', 'data/comuns.txt', 'data/temas.js'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const readList = (f) => readFileSync(path.join(ROOT, 'data', f), 'utf8').split('\n');
setDictWords(readList('palavras.txt'), readList('comuns.txt'));

const verifier = createVerifier({
  cacheFile: path.join(DATA_DIR, 'ia-cache.json'),
  learnedFile: path.join(DATA_DIR, 'aprendidas.txt'),
});

// limite simples por IP para a API de verificação
const apiHits = new Map();
function allowApi(ip, max = 30) {
  const t = Date.now();
  const list = (apiHits.get(ip) || []).filter((x) => t - x < 60000);
  if (list.length >= max) return false;
  list.push(t);
  apiHits.set(ip, list);
  return true;
}

const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
};

async function api(url, req, res) {
  const p = url.pathname;
  if (p === '/api/status') return json(res, 200, { ia: verifier.enabled, modelo: verifier.enabled ? verifier.model : null });
  if (p === '/api/aprendidas') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache' });
    return res.end(verifier.learned().join('\n'));
  }
  if (p.startsWith('/api/palavra/')) {
    if (!allowApi(req.socket.remoteAddress)) return json(res, 429, { ok: false, motivo: 'Muitas verificações, espere um pouco' });
    const word = decodeURIComponent(p.slice('/api/palavra/'.length));
    return json(res, 200, await verifier.verify(word));
  }
  if (p === '/api/qr') {
    const data = String(url.searchParams.get('d') || '').slice(0, 300);
    const svg = await QRCode.toString(data, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=3600' });
    return res.end(svg);
  }
  return json(res, 404, { erro: 'não encontrado' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    if (url.pathname === '/healthz') { res.end('ok'); return; }
    if (url.pathname.startsWith('/api/')) { await api(url, req, res); return; }
    if (!PUBLIC.some((p) => rel === p || (p.endsWith('/') && rel.startsWith(p)))) rel = 'index.html';
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

const manager = new RoomManager({ verifier });
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
