// Garante que o modo offline (sw.js) guarda todos os arquivos do jogo.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
const root = new URL('..', import.meta.url).pathname;
const sw = readFileSync(path.join(root, 'sw.js'), 'utf8');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
for (const f of walk(path.join(root, 'js')).map((f) => path.relative(root, f))) assert.ok(sw.includes(`'${f}'`), `sw.js não guarda ${f}`);
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.short_name, 'Trama');
assert.ok(readFileSync(path.join(root, 'index.html'), 'utf8').includes('manifest.webmanifest'));
console.log('ok pwa');
