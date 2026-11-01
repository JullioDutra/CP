// Regras compartilhadas (navegador + servidor) das partidas solo que valem no
// ranking global. O servidor entrega a grade, guarda um "ticket" e, no fim,
// recalcula os pontos a partir das palavras e caminhos enviados.
import { createRng, seedFromString, todayKey } from './rng.js';
import { makeGrid, wordPoints, findPath, isAdjacent, MIN_LETTERS } from './letters.js';
import { isWord, normalize } from './dict.js';
import { bonusMultiplier } from './multimodes.js';

// Desafio do Dia: mesma grade para todos no mesmo dia (semente pela data).
export function dailyPuzzle(day = todayKey()) {
  const rng = createRng(seedFromString(`trama-${day}`));
  const { grid, words } = makeGrid(rng, 4, { minWords: 40 });
  const cells = rng.shuffle([...Array(16).keys()]);
  const bonus = { [cells[0]]: '×2', [cells[1]]: '×3' };
  return { grid, words, bonus };
}

export function dailyPoints(word, path, bonus) {
  return wordPoints(word) * bonusMultiplier(path, bonus);
}

// Modos solo com ranking global e suas variantes.
export const SOLO_RANKED = {
  'classico-grade': { name: 'Grade Relâmpago', icon: '⚡', category: 'classico', duration: 180, variants: ['4', '5', '6'], variantLabel: (v) => `${v}×${v}` },
  'novo-diario': { name: 'Desafio do Dia', icon: '📅', category: 'novo', duration: 120, daily: true, variantLabel: (v) => v.split('-').reverse().join('/') },
};

export const MIN_WORDS = { 4: 35, 5: 90, 6: 150 };

// Recalcula a pontuação de uma partida de grade a partir das palavras enviadas.
export function scoreWords({ grid, size, bonus = {} }, submitted = []) {
  const seen = new Set();
  const accepted = [];
  const rejected = [];
  for (const item of submitted.slice(0, 600)) {
    const w = normalize(item?.w || '');
    if (!w || seen.has(w)) continue;
    seen.add(w);
    if (w.length < MIN_LETTERS || !isWord(w)) { rejected.push(w); continue; }
    let path = Array.isArray(item.path) && item.path.length === w.length ? item.path : null;
    if (path) {
      const used = new Set();
      for (let k = 0; k < path.length && path; k++) {
        const i = path[k];
        if (!Number.isInteger(i) || i < 0 || i >= grid.length || used.has(i) || grid[i] !== w[k] || (k > 0 && !isAdjacent(path[k - 1], i, size))) path = null;
        else used.add(i);
      }
    }
    path ||= findPath(grid, size, w);
    if (!path) { rejected.push(w); continue; }
    accepted.push({ w, pts: wordPoints(w) * bonusMultiplier(path, bonus) });
  }
  const score = accepted.reduce((s, x) => s + x.pts, 0);
  const longest = accepted.reduce((l, x) => (!l || x.w.length > l.length ? x.w : l), null);
  return { score, accepted, rejected, longest };
}
