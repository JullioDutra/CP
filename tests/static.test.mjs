// O servidor só entrega arquivos públicos, mesmo com truques de caminho.
import assert from 'node:assert/strict';
import { publicPath } from '../server/static.js';
const ok = { '/': 'index.html', '/js/main.js': 'js/main.js', '/css/style.css': 'css/style.css', '/data/comuns.txt': 'data/comuns.txt', '/sw.js': 'sw.js', '/js/core/../main.js': 'js/main.js' };
for (const [p, want] of Object.entries(ok)) assert.equal(publicPath(p), want, p);
for (const bad of ['/.env', '/server/store.js', '/js/../server/store.js', '/js/..%2fserver/store.js', '/js/..%2f.env', '/js/%2e%2e/%2e%2e/etc/passwd',
  '/css/..%2f..%2fdata/runtime/trama.db', '/js/..%5cserver%5cstore.js', '/data/runtime/trama.db', '/package.json', '/node_modules/ws/index.js', '/%E0%A4%A']) {
  assert.equal(publicPath(bad), 'index.html', bad);
}
console.log('ok static');
