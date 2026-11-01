// Gerador/solucionador de Sudoku 9×9 com garantia de solução única.
const canPlace = (b, i, v) => {
  const r = Math.floor(i / 9), c = i % 9;
  for (let k = 0; k < 9; k++) {
    if (b[r * 9 + k] === v || b[k * 9 + c] === v) return false;
  }
  const br = r - (r % 3), bc = c - (c % 3);
  for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) if (b[(br + dr) * 9 + bc + dc] === v) return false;
  return true;
};

function fill(b, rng) {
  const i = b.indexOf(0);
  if (i < 0) return true;
  for (const v of rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (canPlace(b, i, v)) {
      b[i] = v;
      if (fill(b, rng)) return true;
      b[i] = 0;
    }
  }
  return false;
}

export function countSolutions(b, limit = 2) {
  // escolhe a célula vazia com menos candidatos (rápido)
  let best = -1, bestCands = null;
  for (let i = 0; i < 81; i++) {
    if (b[i]) continue;
    const cands = [];
    for (let v = 1; v <= 9; v++) if (canPlace(b, i, v)) cands.push(v);
    if (!cands.length) return 0;
    if (!bestCands || cands.length < bestCands.length) { best = i; bestCands = cands; if (cands.length === 1) break; }
  }
  if (best < 0) return 1;
  let n = 0;
  for (const v of bestCands) {
    b[best] = v;
    n += countSolutions(b, limit - n);
    b[best] = 0;
    if (n >= limit) break;
  }
  return n;
}

export const DIFFICULTY = {
  facil: { label: 'Fácil', clues: 40, base: 1500 },
  medio: { label: 'Médio', clues: 32, base: 3000 },
  dificil: { label: 'Difícil', clues: 27, base: 5000 },
};

export function generateSudoku(rng, difficulty = 'medio') {
  const solution = Array(81).fill(0);
  fill(solution, rng);
  const puzzle = solution.slice();
  const target = DIFFICULTY[difficulty].clues;
  let filled = 81;
  for (const i of rng.shuffle([...Array(81).keys()])) {
    if (filled <= target) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle.slice()) !== 1) puzzle[i] = keep;
    else filled--;
  }
  return { puzzle, solution };
}
