// Partidas solo com semente: o "celular" joga e o servidor refaz a partida e chega aos mesmos pontos.
import assert from 'node:assert/strict';
import { loadTestDict } from './helpers.mjs';
import { solve, findPath, wordPoints } from '../js/core/letters.js';
import { isWord, isCommon } from '../js/core/dict.js';
import { MIX_EXTRA_MIN, MIX_EXTRA_PTS, WS_SIZE } from '../js/core/wordsearch.js';
import { sudokuScore } from '../js/core/sudoku.js';
import {
  setupWordSearch, scoreWordSearch, setupSudoku, scoreSudokuLog, setupSurvival, survivalRefill, survivalRenew,
  replaySurvival, timeGain, SURV_START, SURV_SHUFFLE_COST, setupGradeVariant, variantGrid, variantPoints, replayGradeVariant,
} from '../js/core/solo-verify.js';

loadTestDict();

// ---------- Caça-Palavras: tema e Mistura ----------
{
  const a = setupWordSearch(123, 'surpresa'), b = setupWordSearch(123, 'surpresa');
  assert.deepEqual(a.grid, b.grid, 'mesma semente, mesma grade');
  assert.notDeepEqual(setupWordSearch(124, 'surpresa').grid, a.grid);
  const all = scoreWordSearch(a, { found: a.placed.map((_, k) => k), remaining: 100 });
  const letters = a.placed.reduce((s, p) => s + p.word.length * 10, 0);
  assert.equal(all.score, letters + 200, 'todas + bônus de tempo');
  assert.equal(scoreWordSearch(a, { found: a.placed.map((_, k) => k), remaining: 100 }, 50).score, letters + 100, 'bônus limitado pelo relógio do servidor');
  assert.equal(scoreWordSearch(a, { found: [0, 0, 0, 99, -1, 'x'] }).score, a.placed[0].word.length * 10, 'repetidas e inválidas não contam');
  assert.equal(scoreWordSearch(a, { found: [0], extras: [[0, 1, 2, 3, 4]] }).score, a.placed[0].word.length * 10, 'extras só na Mistura');

  const m = setupWordSearch(77, 'mistura');
  assert.equal(m.mix, true);
  // acha uma palavra extra de verdade na grade
  let extra = null;
  const listed = new Set(m.placed.map((p) => p.word));
  const dfs = (path) => {
    if (extra) return;
    const w = path.map((i) => m.grid[i]).join('');
    if (w.length >= MIX_EXTRA_MIN && isCommon(w) && !listed.has(w)) { extra = path; return; }
    if (w.length >= MIX_EXTRA_MIN) return;
    const i = path[path.length - 1];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const r = Math.floor(i / WS_SIZE) + dr, c = (i % WS_SIZE) + dc, j = r * WS_SIZE + c;
      if ((dr || dc) && r >= 0 && c >= 0 && r < WS_SIZE && c < WS_SIZE && !path.includes(j)) dfs([...path, j]);
    }
  };
  for (let i = 0; i < m.grid.length && !extra; i++) dfs([i]);
  assert.ok(extra);
  const ms = scoreWordSearch(m, { found: [1], extras: [extra, extra, [0, 50]] });
  assert.equal(ms.score, m.placed[1].word.length * 10 + extra.length * MIX_EXTRA_PTS, 'extra vale uma vez; caminho quebrado não vale');
}

// ---------- Sudoku ----------
{
  const s = setupSudoku(42, 'facil');
  assert.deepEqual(s.solution, setupSudoku(42, 'facil').solution);
  assert.equal(scoreSudokuLog(s, 'facil', { solved: true, board: s.solution, errors: 1, seconds: 100 }, 90).score, sudokuScore('facil', 100, 1));
  assert.equal(scoreSudokuLog(s, 'facil', { solved: true, board: s.solution, errors: 0, seconds: 10 }, 300).score, sudokuScore('facil', 295, 0), 'não dá para dizer que foi mais rápido que o relógio do servidor');
  const wrong = s.solution.slice(); wrong[0] = wrong[0] === 1 ? 2 : 1;
  assert.equal(scoreSudokuLog(s, 'facil', { solved: true, board: wrong }, 60).score, 0, 'grade errada não pontua');
  assert.equal(scoreSudokuLog(s, 'facil', { solved: false, board: s.solution }, 60).score, 0);
}

// ---------- Sobrevivência: o "celular" joga e o servidor refaz ----------
{
  const seed = 2024;
  const { rng, grid: g0 } = setupSurvival(seed);
  let grid = g0;
  const events = [];
  const found = new Set();
  let score = 0, gains = 0, renews = 0, t = 0;
  for (let turn = 0; turn < 14; turn++) {
    t += 2.5;
    if (turn === 6) { events.push({ renew: true, t }); renews++; grid = survivalRenew(rng); continue; }
    const words = solve(grid, 5).filter((w) => !found.has(w)).sort((a, b) => b.length - a.length);
    const w = turn % 3 === 0 ? words[0] : words[words.length - 1]; // alterna grandes (explodem) e pequenas
    if (!w) break;
    const path = findPath(grid, 5, w);
    found.add(w);
    score += wordPoints(w);
    gains += timeGain(w, t);
    events.push({ w, path, t });
    if (w.length >= 6) grid = survivalRefill(rng, grid, path);
  }
  const survived = Math.floor(Math.min(t + 20, SURV_START + gains - SURV_SHUFFLE_COST * renews));
  const clientScore = score + Math.floor(survived / 10);
  const r = replaySurvival(seed, { events, survived }, 9999);
  assert.equal(r.score, clientScore, 'servidor chega aos mesmos pontos do celular');
  assert.equal(r.words, found.size);
  assert.ok(events.some((e) => e.w?.length >= 6), 'teve explosão de letras no teste');
  // trapaças
  assert.equal(replaySurvival(seed, { events: [{ w: 'casa', path: [0, 1, 2, 3], t: 1 }], survived: 30 }, 9999).words, 0, 'palavra que não está na grade não vale');
  const deathAt = SURV_START + gains - SURV_SHUFFLE_COST * renews;
  assert.equal(replaySurvival(seed, { events, survived: 99999 }, 99999).score, score + Math.floor(deathAt / 10), 'não dá para sobreviver além da hora em que a vida acaba');
  assert.equal(replaySurvival(seed, { events, survived }, 30).score, score + 3, 'tempo limitado pelo relógio do servidor');
  assert.equal(isWord(events[0].w), true);
}
// ---------- Grade Combo, Letra da Vez e Chuva de Letras (solo) ----------
for (const kind of ['combo', 'letra', 'chuva']) {
  const seed = 555 + kind.length;
  const setup = setupGradeVariant(seed, kind);
  const st = {};
  const events = [];
  const found = new Set();
  let score = 0;
  // o "celular" acha palavras ao longo de 2 minutos, inclusive depois de chuvas
  for (let t = 1500; t < 118000; t += kind === 'combo' ? 2500 : 6100) {
    const grid = variantGrid(setup, t);
    const w = solve(grid, setup.size).filter((x) => !found.has(x)).sort((a, b) => b.length - a.length)[found.size % 3];
    if (!w) continue;
    const path = findPath(grid, setup.size, w);
    found.add(w);
    score += variantPoints(setup, kind, w, path, t, st).pts;
    events.push({ w, path, t });
  }
  const r = replayGradeVariant(seed, kind, { events }, 200);
  assert.equal(r.score, score, `${kind}: servidor chega aos mesmos pontos`);
  assert.equal(r.words, found.size);
  assert.ok(score > found.size, `${kind}: teve multiplicador`);
  // trapaça: tempo além do medido pelo servidor não vale
  assert.ok(replayGradeVariant(seed, kind, { events }, 30).score < score, `${kind}: relógio do servidor limita`);
}
console.log('ok solo-verify');
