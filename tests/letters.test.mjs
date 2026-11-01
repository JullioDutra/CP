import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { setDictWords } from '../js/core/dict.js';
import { makeGrid, findPath, solve } from '../js/core/letters.js';
import { createRng } from '../js/core/rng.js';
setDictWords(readFileSync(new URL('../data/palavras.txt', import.meta.url), 'utf8').split('\n'), readFileSync(new URL('../data/comuns.txt', import.meta.url), 'utf8').split('\n'));
const rng = createRng(42);
for (const size of [4, 5]) {
  const t0 = performance.now();
  const g = makeGrid(rng, size, { minWords: size === 4 ? 30 : 60 });
  const ms = performance.now() - t0;
  console.log(`size ${size}: ${g.words.length} palavras em ${ms.toFixed(0)}ms`, g.grid.join(''));
  assert.ok(g.words.length >= 20);
  for (const w of g.words.slice(0, 50)) assert.ok(findPath(g.grid, size, w), w);
}
const grid = 'gatoxxxxxxxxxxxx'.split('');
assert.ok(solve(grid, 4).includes('gato'));
assert.equal(findPath(grid, 4, 'gatx').length, 4);
assert.equal(findPath(grid, 4, 'gog'), null);
console.log('ok letters');
