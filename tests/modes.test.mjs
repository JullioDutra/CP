import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { setDictWords } from '../js/core/dict.js';
import { createRng } from '../js/core/rng.js';
import { generateSudoku, countSolutions } from '../js/core/sudoku.js';
import { findPath } from '../js/core/letters.js';
setDictWords(readFileSync(new URL('../data/palavras.txt', import.meta.url), 'utf8').split('\n'), readFileSync(new URL('../data/comuns.txt', import.meta.url), 'utf8').split('\n'));

// localStorage fake para o ranking
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] };
// Os módulos de modo importam só utilitários; ui.js usa document apenas em runtime.
const { buildWordSearch } = await import('../js/modes/classicos/cacapalavras.js');
const { dailyPuzzle, dailyPoints } = await import('../js/modes/novos/diario.js');
const { timeGain } = await import('../js/modes/novos/sobrevivencia.js');
const { sudokuScore } = await import('../js/modes/classicos/sudoku.js');
const ranking = await import('../js/core/ranking.js');

// Sudoku: solução única e consistente
for (const d of ['facil', 'medio', 'dificil']) {
  const t0 = performance.now();
  const { puzzle, solution } = generateSudoku(createRng(7), d);
  assert.equal(countSolutions(puzzle.slice()), 1);
  puzzle.forEach((v, i) => v && assert.equal(v, solution[i]));
  console.log(`sudoku ${d}: ${puzzle.filter(Boolean).length} pistas, ${(performance.now() - t0).toFixed(0)}ms`);
}
assert.equal(sudokuScore('medio', 100, 1), 3000 - 200 - 150);
assert.equal(sudokuScore('facil', 10000, 3), 100);

// Caça-palavras: cada palavra posicionada está de fato na grade, em linha reta
const { grid, placed } = buildWordSearch(createRng(3), ['cachorro', 'gato', 'leão', 'onça', 'tucano', 'arara', 'baleia', 'urso', 'lobo', 'tatu', 'zebra']);
assert.equal(placed.length, 10);
for (const p of placed) assert.equal(p.cells.map((i) => grid[i]).join(''), p.word);
assert.ok(placed.some((p) => p.word === 'leao'));

// Desafio do dia: determinístico
const a = dailyPuzzle('2026-11-01'), b = dailyPuzzle('2026-11-01'), c = dailyPuzzle('2026-11-02');
assert.deepEqual(a.grid, b.grid);
assert.deepEqual(a.bonus, b.bonus);
assert.notDeepEqual(a.grid, c.grid);
const bi = Object.keys(a.bonus).map(Number);
assert.equal(dailyPoints('casas', [bi[0], bi[1]], a.bonus), 4 * 6);
const w = a.words[0];
assert.ok(findPath(a.grid, 4, w));

// Sobrevivência: tempo ganho diminui com a partida
assert.ok(timeGain('casa', 0) > timeGain('casa', 250));

// Ranking: ordena por pontuação, mantém top 10, separado por modo
for (let i = 1; i <= 12; i++) ranking.addScore('m1', { name: 'p' + i, score: i * 10 });
const r = ranking.getRanking('m1');
assert.equal(r.length, 10);
assert.equal(r[0].score, 120);
assert.equal(r[9].score, 30);
assert.equal(ranking.qualifies('m1', 25), false);
assert.equal(ranking.qualifies('m1', 35), true);
assert.equal(ranking.addScore('m1', { name: 'x', score: 5 }), null);
assert.equal(ranking.addScore('m1', { name: 'top', score: 999 }).pos, 1);
assert.equal(ranking.getRanking('m2').length, 0);
console.log('ok modes');
