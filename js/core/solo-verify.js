// Partidas solo com ranking global: o servidor sorteia a SEMENTE, o celular monta o jogo a
// partir dela e, no fim, envia o que aconteceu (registro). O servidor monta o mesmo jogo
// com a mesma semente e recalcula os pontos — assim o ranking global não depende de
// confiar no número que o aparelho mandou.
// Usado pelo navegador (para montar o jogo) e pelo servidor (para conferir).
import { createRng } from './rng.js';
import { normalize, isWord, isCommon } from './dict.js';
import { makeGrid, wordPoints, isAdjacent, randomLetter, randomVowel, VOWELS, MIN_LETTERS } from './letters.js';
import { buildWordSearch, buildMixedSearch, isFreePath, WS_SIZE, MIX_EXTRA_MIN, MIX_EXTRA_PTS } from './wordsearch.js';
import { generateSudoku, sudokuScore } from './sudoku.js';
import { COMBO, comboMult, HOT, hotLetterAt, hotMult } from './multimodes.js';
import { makeRain, rainGrid, rainStep, freshCells, rainMult, RAIN } from './rain.js';
import { TEMAS } from '../../data/temas.js';
import { MISTURA } from '../../data/mistura.js';

export const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

// ---------- Caça-Palavras ----------
export const WS_TIME = 240;
export const WS_POINTS_PER_LETTER = 10;

export function setupWordSearch(seed, tema = 'surpresa') {
  const rng = createRng(seed);
  if (tema === 'mistura') {
    const { grid, placed } = buildMixedSearch(rng, rng.shuffle(MISTURA));
    return { grid, placed, temaNome: 'Mistura', mix: true };
  }
  const temaNome = rng.pick(Object.keys(TEMAS));
  const { grid, placed } = buildWordSearch(rng, rng.shuffle(TEMAS[temaNome]));
  return { grid, placed, temaNome, mix: false };
}

// log: { found: [índices da lista], extras: [[células]...], remaining: segundos que sobraram }
export function scoreWordSearch(setup, log = {}, maxRemaining = WS_TIME) {
  const found = [...new Set((Array.isArray(log.found) ? log.found : []).filter((k) => Number.isInteger(k) && k >= 0 && k < setup.placed.length))];
  let score = found.reduce((s, k) => s + setup.placed[k].word.length * WS_POINTS_PER_LETTER, 0);
  const extras = [];
  if (setup.mix) {
    const listed = new Set(setup.placed.map((p) => p.word));
    for (const cells of (Array.isArray(log.extras) ? log.extras : []).slice(0, 200)) {
      if (!Array.isArray(cells) || cells.length > WS_SIZE || !cells.every((i) => Number.isInteger(i) && i >= 0 && i < setup.grid.length)) continue;
      if (!isFreePath(cells, WS_SIZE)) continue;
      const w = cells.map((i) => setup.grid[i]).join('');
      if (w.length < MIX_EXTRA_MIN || !isCommon(w) || listed.has(w) || extras.includes(w)) continue;
      extras.push(w);
      score += w.length * MIX_EXTRA_PTS;
    }
  }
  let bonus = 0;
  if (found.length === setup.placed.length) {
    const rem = Math.max(0, Math.min(Number(log.remaining) || 0, maxRemaining));
    bonus = Math.ceil(rem) * 2;
  }
  const words = [...found.map((k) => setup.placed[k].word), ...extras];
  return { score: score + bonus, words: words.length, longest: words.sort((a, b) => b.length - a.length)[0] || null };
}

// ---------- Sudoku ----------
export const setupSudoku = (seed, difficulty = 'medio') => generateSudoku(createRng(seed), difficulty);

// log: { solved, board: [81 números], errors, seconds }
export function scoreSudokuLog(setup, difficulty, log = {}, serverSeconds = 0) {
  const board = Array.isArray(log.board) ? log.board : [];
  const solved = !!log.solved && board.length === 81 && board.every((v, i) => v === setup.solution[i]);
  if (!solved) return { score: 0, words: 0, longest: null };
  const errors = Math.max(0, Math.min(3, Math.floor(Number(log.errors) || 0)));
  // o tempo vale o maior entre o informado e o medido pelo servidor (com folga para a rede)
  const seconds = Math.max(Number(log.seconds) || 0, serverSeconds - 5);
  return { score: sudokuScore(difficulty, seconds, errors), words: 0, longest: null };
}

// ---------- Sobrevivência ----------
export const SURV_START = 60;
export const SURV_SHUFFLE_COST = 10;
export const SURV_SIZE = 5;

// Segundos ganhos por palavra: diminui conforme a partida avança (fica mais difícil).
export function timeGain(word, elapsed) {
  const base = 2 + word.length * 2;
  const factor = Math.max(0.35, 1 - elapsed / 300);
  return Math.round(base * factor);
}

export function setupSurvival(seed) {
  const rng = createRng(seed);
  return { rng, grid: makeGrid(rng, SURV_SIZE, { minWords: 70 }).grid };
}

// Palavra de 6+ letras: as peças usadas viram letras novas (mesma sequência no celular e no servidor).
export function survivalRefill(rng, letters, indexes) {
  const next = letters.slice();
  for (const i of indexes) next[i] = randomLetter(rng);
  const vowels = next.filter((l) => VOWELS.has(l)).length;
  if (vowels < Math.round(next.length * 0.32)) {
    for (const i of indexes) if (!VOWELS.has(next[i])) { next[i] = randomVowel(rng); break; }
  }
  return next;
}

export const survivalRenew = (rng) => makeGrid(rng, SURV_SIZE, { minWords: 60, tries: 15 }).grid;

// log: { events: [{ w, path, t } | { renew: true, t }], survived }
export function replaySurvival(seed, log = {}, maxSurvived = Infinity) {
  // mesma sequência de sorteios do celular: grade inicial, explosões e renovações
  let { rng, grid } = setupSurvival(seed);
  const found = new Set();
  let score = 0, gains = 0, renews = 0, lastT = 0;
  for (const e of (Array.isArray(log.events) ? log.events : []).slice(0, 500)) {
    const t = Number(e?.t);
    if (!Number.isFinite(t) || t < lastT) break;
    lastT = t;
    const life = SURV_START + gains - SURV_SHUFFLE_COST * renews - t;
    if (life <= 0) break;
    if (e.renew) {
      if (life <= SURV_SHUFFLE_COST + 1) continue;
      renews++;
      grid = survivalRenew(rng);
      continue;
    }
    const w = normalize(e.w || '');
    const path = Array.isArray(e.path) ? e.path : null;
    // o caminho precisa bater com as letras da grade naquele momento
    const pathOk = path && path.length === w.length && path.every((i, k) => Number.isInteger(i) && grid[i] === w[k] && path.indexOf(i) === k && (k === 0 || isAdjacent(path[k - 1], i, SURV_SIZE)));
    if (!pathOk) continue;
    if (w.length >= MIN_LETTERS && !found.has(w) && isWord(w)) {
      found.add(w);
      score += wordPoints(w);
      gains += timeGain(w, t);
    }
    // o celular só registra palavras que aceitou (inclusive confirmadas pela IA) e explode
    // as de 6+ letras; refaz a explosão aqui mesmo que a palavra não valha ponto, para a
    // grade continuar igual à do celular
    if (w.length >= 6) grid = survivalRefill(rng, grid, path);
  }
  const deathAt = SURV_START + gains - SURV_SHUFFLE_COST * renews;
  const survived = Math.max(0, Math.floor(Math.min(Number(log.survived) || 0, deathAt, maxSurvived)));
  const bonus = Math.floor(survived / 10);
  const words = [...found].sort((a, b) => b.length - a.length);
  return { score: score + bonus, words: words.length, longest: words[0] || null };
}

// ---------- Grade Combo, Letra da Vez e Chuva de Letras (solo) ----------
export const VARIANT_TIME = 120;
export const VARIANT_SIZE = 5;

const MIN_WORDS_BY_SIZE = { 4: 35, 5: 90, 6: 150 };
export function setupGradeVariant(seed, kind, size = VARIANT_SIZE) {
  size = [4, 5, 6].includes(Number(size)) ? Number(size) : VARIANT_SIZE;
  const rng = createRng(seed);
  const { grid } = makeGrid(rng, size, { minWords: MIN_WORDS_BY_SIZE[size], tries: size === 6 ? 25 : 40 });
  const out = { grid, size };
  if (kind === 'letra') {
    const counts = {};
    for (const l of grid) counts[l] = (counts[l] || 0) + 1;
    const letters = rng.shuffle(Object.keys(counts)).sort((a, b) => counts[b] - counts[a]).slice(0, 8);
    out.hot = { letters: rng.shuffle(letters), startedAt: 0, everyMs: HOT.everyMs };
  }
  if (kind === 'chuva') out.drops = makeRain(rng, grid, size, VARIANT_TIME * 1000);
  return out;
}

// Grade valendo no instante t (ms desde o início da partida).
export const variantGrid = (setup, t) => (setup.drops ? rainGrid(setup.grid, setup.drops, rainStep(t)) : setup.grid);

// Pontos de uma palavra aceita no instante t; `st` guarda o combo entre uma palavra e outra.
export function variantPoints(setup, kind, word, path, t, st) {
  let mult = 1;
  if (kind === 'combo') {
    st.combo = st.lastAt != null && t - st.lastAt <= COMBO.windowMs ? (st.combo || 0) + 1 : 1;
    st.lastAt = t;
    mult *= comboMult(st.combo);
  }
  if (kind === 'letra') mult *= hotMult(word, hotLetterAt(setup.hot, t)?.letter);
  if (kind === 'chuva') mult *= rainMult(path, freshCells(setup.drops, rainStep(t)));
  return { pts: Math.round(wordPoints(word) * mult), mult, combo: st.combo };
}

const pathFits = (grid, size, w, path) => Array.isArray(path) && path.length === w.length
  && path.every((i, k) => Number.isInteger(i) && grid[i] === w[k] && path.indexOf(i) === k && (k === 0 || isAdjacent(path[k - 1], i, size)));

// log: { events: [{ w, path, t (ms) }] } — refaz a partida e devolve os pontos oficiais.
export function replayGradeVariant(seed, kind, log = {}, maxElapsedSec = VARIANT_TIME + 3, size = VARIANT_SIZE) {
  const setup = setupGradeVariant(seed, kind, size);
  const limit = Math.min(maxElapsedSec, VARIANT_TIME + 3) * 1000;
  const found = new Set();
  const st = {};
  let score = 0, lastT = 0, maxCombo = 0, hotWords = 0, rainWords = 0;
  for (const e of (Array.isArray(log.events) ? log.events : []).slice(0, 400)) {
    const t = Number(e?.t);
    if (!Number.isFinite(t) || t < lastT || t > limit) break;
    lastT = t;
    const w = normalize(e.w || '');
    if (w.length < MIN_LETTERS || found.has(w) || !isWord(w)) continue;
    let grid = variantGrid(setup, t);
    if (!pathFits(grid, setup.size, w, e.path) && setup.drops) {
      // logo depois da chuva, ainda vale a grade anterior (atraso de toque/rede)
      const k = rainStep(t);
      if (k > 0 && t - k * RAIN.everyMs < 1500) grid = rainGrid(setup.grid, setup.drops, k - 1);
    }
    if (!pathFits(grid, setup.size, w, e.path)) continue;
    found.add(w);
    const r = variantPoints(setup, kind, w, e.path, t, st);
    score += r.pts;
    maxCombo = Math.max(maxCombo, st.combo || 0);
    if (kind === 'letra' && r.mult > 1) hotWords++;
    if (kind === 'chuva' && r.mult > 1) rainWords++;
  }
  const words = [...found].sort((a, b) => b.length - a.length);
  return { score, words: words.length, longest: words[0] || null, maxCombo, hotWords, rainWords };
}
