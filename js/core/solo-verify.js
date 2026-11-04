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
