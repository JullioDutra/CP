import assert from 'node:assert/strict';
import { buildEvents, delays } from '../js/multi/reveal.js';
import { buildDrops } from '../js/multi/tankreveal.js';

// grade: palavras únicas do grupo, da menor pontuação para a maior; repetida junta os jogadores
const r = { type: 'grade', players: {
  a: { words: [{ w: 'casamento', pts: 22 }, { w: 'casa', pts: 2 }] },
  b: { words: [{ w: 'casa', pts: 2 }, { w: 'bolo', pts: 2 }, { w: 'sapato', pts: 7, ai: true }] },
} };
const ev = buildEvents(r);
assert.deepEqual(ev.map((e) => e.label), ['BOLO', 'CASA', 'SAPATO', 'CASAMENTO']);
assert.deepEqual(ev[1].gains.map((g) => g.id), ['a', 'b']);
assert.equal(ev[2].ai, true);
// caça-palavras e sudoku
assert.deepEqual(buildEvents({ type: 'wordsearch', words: [{ display: 'leão', by: 'a' }, { display: 'gato', by: null }, { display: 'tartaruga', by: 'b' }] }).map((e) => [e.label, e.pts]), [['LEÃO', 40], ['TARTARUGA', 90]]);
assert.deepEqual(buildEvents({ type: 'sudoku', players: { a: { done: true, place: 1, score: 3000, filled: 40 }, b: { done: false, filled: 10, score: 100 } } }).map((e) => e.pts), [100, 3000]);
// tempos: começa rápido, termina devagar (suspense); duração total razoável
for (const n of [3, 20, 120]) {
  const d = delays(n);
  assert.ok(d[n - 1] >= d[0] * 2.5, 'última espera bem maior que a primeira');
  const total = d.reduce((x, y) => x + y, 0);
  assert.ok(total < 22000, `total ${total}ms para ${n} palavras`);
}
// Tanques: repetidas primeiro (caem para todos que acharam), depois únicas alternando entre jogadores
{
  const r = { type: 'grade', players: {
    a: { words: [{ w: 'casa', pts: 2 }, { w: 'mesa', pts: 2 }, { w: 'pato', pts: 2 }, { w: 'cadeira', pts: 11 }] },
    b: { words: [{ w: 'casa', pts: 2 }, { w: 'mesa', pts: 2 }, { w: 'sol', pts: 1 }] },
    c: { words: [{ w: 'casa', pts: 2 }, { w: 'lua', pts: 1 }, { w: 'rio', pts: 1 }] },
  }, extras: [{ id: 'b', label: 'Bônus', pts: 5 }] };
  const d = buildDrops(r, ['a', 'b', 'c']);
  assert.deepEqual(d.map((x) => x.kind), ['shared', 'shared', 'unique', 'unique', 'unique', 'unique', 'unique', 'bonus']);
  assert.deepEqual(d[0].gains.map((g) => g.id).sort(), ['a', 'b', 'c'].filter((id) => d[0].label === 'CASA' || id !== 'c').sort());
  // rodada 1 das únicas: a, b, c (menores primeiro); rodada 2: a (cadeira), c (rio)
  assert.deepEqual(d.slice(2, 7).map((x) => x.gains[0].id), ['a', 'b', 'c', 'a', 'c']);
  assert.equal(d[5].label, 'CADEIRA');
  const sum = (id) => d.flatMap((x) => x.gains).filter((g) => g.id === id).reduce((s, g) => s + g.pts, 0);
  assert.equal(sum('a'), 17);
  assert.equal(sum('b'), 10);
}
console.log('ok reveal');
