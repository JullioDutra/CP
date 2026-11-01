// Gerador de caça-palavras (usado no modo solo e na Corrida multijogador).
import { normalize } from './dict.js';

export const WS_SIZE = 12;
export const WS_COUNT = 10;
const DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
const ALPHA = 'aaaabcdeeeefghiiijlmnoooopqrrsssttuuvxz';

export function buildWordSearch(rng, words, size = WS_SIZE, count = WS_COUNT) {
  const grid = Array(size * size).fill(null);
  const placed = [];
  const sorted = words.slice().sort((a, b) => normalize(b).length - normalize(a).length);
  for (const display of sorted) {
    const w = normalize(display);
    if (w.length > size) continue;
    let ok = false;
    for (let t = 0; t < 300 && !ok; t++) {
      // direções invertidas são menos frequentes (mais fáceis no começo)
      const [dr, dc] = rng.next() < 0.7 ? DIRS[rng.int(4)] : DIRS[4 + rng.int(4)];
      const r0 = rng.int(size), c0 = rng.int(size);
      const cells = [];
      for (let k = 0; k < w.length; k++) {
        const r = r0 + dr * k, c = c0 + dc * k;
        if (r < 0 || c < 0 || r >= size || c >= size) break;
        const i = r * size + c;
        if (grid[i] && grid[i] !== w[k]) break;
        cells.push(i);
      }
      if (cells.length !== w.length) continue;
      cells.forEach((i, k) => (grid[i] = w[k]));
      placed.push({ display, word: w, cells });
      ok = true;
    }
    if (placed.length >= count) break;
  }
  for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = ALPHA[rng.int(ALPHA.length)];
  return { grid, placed };
}


// Lista de células entre a e b se estiverem em linha reta (horizontal, vertical ou diagonal).
export function lineBetween(a, b, size = WS_SIZE) {
  const r1 = Math.floor(a / size), c1 = a % size, r2 = Math.floor(b / size), c2 = b % size;
  if (!(r1 === r2 || c1 === c2 || Math.abs(r2 - r1) === Math.abs(c2 - c1))) return null;
  const dr = Math.sign(r2 - r1), dc = Math.sign(c2 - c1);
  const len = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1));
  return Array.from({ length: len + 1 }, (_, k) => (r1 + dr * k) * size + (c1 + dc * k));
}

// Índice da palavra (não encontrada) que corresponde às células marcadas, ou -1.
export function matchPlaced(placed, cells, isFound = () => false) {
  const key = cells.join(','), rev = cells.slice().reverse().join(',');
  return placed.findIndex((p, k) => !isFound(k) && (p.cells.join(',') === key || p.cells.join(',') === rev));
}
