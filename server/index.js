// Servidor do Trama: entrega os arquivos do jogo e cuida das salas em tempo real (WebSocket).
// Uso: npm start   →   http://localhost:8080
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { setDictWords } from '../js/core/dict.js';
import { RoomManager } from './rooms.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8080;
const PUBLIC = ['index.html', 'css/', 'js/', 'data/palavras.txt', 'data/temas.js'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

setDictWords(readFileSync(path.join(ROOT, 'data/palavras.txt'), 'utf8').split('\n'));

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    if (url.pathname === '/healthz') { res.end('ok'); return; }
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

const manager = new RoomManager();
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
  for (const list of Object.values(networkInterfaces()))
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  na mesma rede Wi-Fi: http://${a.address}:${PORT}`);
});
