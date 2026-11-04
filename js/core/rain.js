// Chuva de Letras: a cada 20 s algumas peças da grade são trocadas por letras novas.
// Palavras que usam uma letra recém-caída valem ×2 até a próxima chuva.
// Tudo sai da mesma semente, então celular, servidor e conferência do solo chegam à mesma grade.
import { randomLetter, randomVowel, VOWELS } from './letters.js';

export const RAIN = { everyMs: 20000, cells: { 4: 3, 5: 4, 6: 5 }, mult: 2 };

// Sorteia todas as chuvas da rodada de uma vez (a k-ésima cai aos (k+1)·20 s).
export function makeRain(rng, grid, size, totalMs) {
  const n = Math.max(0, Math.ceil(totalMs / RAIN.everyMs) - 1);
  const drops = [];
  const g = grid.slice();
  for (let k = 0; k < n; k++) {
    const cells = rng.shuffle([...Array(size * size).keys()]).slice(0, RAIN.cells[size] || 4).sort((a, b) => a - b);
    const letters = cells.map(() => randomLetter(rng));
    // mantém vogais suficientes na grade
    const after = g.slice();
    cells.forEach((c, j) => (after[c] = letters[j]));
    if (after.filter((l) => VOWELS.has(l)).length < Math.round(after.length * 0.32)) {
      const j = letters.findIndex((l) => !VOWELS.has(l));
      if (j >= 0) letters[j] = randomVowel(rng);
    }
    cells.forEach((c, j) => (g[c] = letters[j]));
    drops.push({ cells, letters });
  }
  return drops;
}

export const rainStep = (elapsedMs) => Math.max(0, Math.floor(elapsedMs / RAIN.everyMs));

// Grade depois de k chuvas.
export function rainGrid(base, drops, k) {
  const g = base.slice();
  for (let i = 0; i < Math.min(k, drops.length); i++) drops[i].cells.forEach((c, j) => (g[c] = drops[i].letters[j]));
  return g;
}

// Peças que acabaram de cair (valem ×2 até a próxima chuva).
export const freshCells = (drops, k) => (k > 0 && k <= drops.length ? drops[k - 1].cells : []);
export const rainMult = (path, fresh) => (path?.some((i) => fresh.includes(i)) ? RAIN.mult : 1);
