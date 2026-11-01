// Lógica das grades de letras: sorteio ponderado, busca de caminhos e solucionador.
import { allWords } from './dict.js';

// Frequência aproximada das letras no português (Q e H reduzidos de propósito).
const WEIGHTS = {
  a: 14.6, e: 12.6, o: 10.7, s: 7.8, r: 6.5, i: 6.2, n: 5.0, d: 5.0, m: 4.7,
  u: 4.6, t: 4.3, c: 3.9, l: 2.8, p: 2.5, v: 1.7, g: 1.3, h: 0.6, q: 0.4,
  b: 1.0, f: 1.0, z: 0.5, j: 0.4, x: 0.25,
};
const LETTERS = Object.keys(WEIGHTS);
const TOTAL = LETTERS.reduce((s, l) => s + WEIGHTS[l], 0);
export const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

export function randomLetter(rng) {
  let r = rng.next() * TOTAL;
  for (const l of LETTERS) {
    r -= WEIGHTS[l];
    if (r <= 0) return l;
  }
  return 'a';
}

export function randomVowel(rng) {
  return rng.pick(['a', 'a', 'e', 'e', 'o', 'o', 'i', 'u']);
}

export function neighbors(i, size) {
  const r = Math.floor(i / size), c = i % size, out = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size) out.push(nr * size + nc);
    }
  return out;
}

export const isAdjacent = (a, b, size) =>
  a !== b &&
  Math.abs(Math.floor(a / size) - Math.floor(b / size)) <= 1 &&
  Math.abs((a % size) - (b % size)) <= 1;

// Encontra um caminho de peças adjacentes (sem repetir peça) que forme a palavra.
export function findPath(grid, size, word) {
  const path = [];
  const used = new Uint8Array(grid.length);
  const dfs = (i, k) => {
    if (grid[i] !== word[k]) return false;
    used[i] = 1;
    path.push(i);
    if (k === word.length - 1) return true;
    for (const n of neighbors(i, size)) if (!used[n] && dfs(n, k + 1)) return true;
    used[i] = 0;
    path.pop();
    return false;
  };
  for (let i = 0; i < grid.length; i++) if (dfs(i, 0)) return path;
  return null;
}

// Lista todas as palavras do dicionário que existem na grade.
export function solve(grid, size, maxLen = 9) {
  const count = new Uint8Array(26);
  for (const l of grid) count[l.charCodeAt(0) - 97]++;
  const out = [];
  const tmp = new Uint8Array(26);
  for (const w of allWords()) {
    if (w.length > maxLen || w.length > grid.length) continue;
    tmp.set(count);
    let ok = true;
    for (let k = 0; k < w.length; k++) {
      const c = w.charCodeAt(k) - 97;
      if (c < 0 || c > 25 || tmp[c]-- === 0) { ok = false; break; }
    }
    if (ok && findPath(grid, size, w)) out.push(w);
  }
  return out;
}

export function makeGrid(rng, size, { minWords = 20, tries = 60 } = {}) {
  let best = null;
  for (let t = 0; t < tries; t++) {
    const grid = Array.from({ length: size * size }, () => randomLetter(rng));
    const vowels = grid.filter((l) => VOWELS.has(l)).length;
    const ratio = vowels / grid.length;
    if (ratio < 0.3 || ratio > 0.55) continue;
    const found = solve(grid, size);
    if (!best || found.length > best.words.length) best = { grid, words: found };
    if (found.length >= minWords) break;
  }
  return best;
}

// Pontuação por tamanho da palavra (tabela própria do Trama).
const POINTS = [0, 0, 0, 1, 2, 3, 5, 8, 11, 15];
export const wordPoints = (w) => POINTS[Math.min(w.length, 9)] + Math.max(0, w.length - 9) * 4;
