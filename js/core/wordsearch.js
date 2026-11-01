// Gerador de caça-palavras (usado no modo solo e na Corrida multijogador).
import { normalize } from './dict.js';

export const WS_SIZE = 12;
export const WS_COUNT = 10;
// Mistura (sem tema): mais palavras, encaixadas umas nas outras e algumas "dobrando"
export const MIX_COUNT = 18;
// palavras extras (fora da lista): só palavras comuns de 5+ letras, 4 pontos por letra
export const MIX_EXTRA_MIN = 5;
export const MIX_EXTRA_PTS = 4;
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

// Modo livre (Mistura): vale a palavra da lista soletrada por qualquer caminho de vizinhas,
// mesmo que não seja exatamente o caminho em que ela foi escondida.
export function matchFree(placed, grid, cells, isFound = () => false) {
  const k = matchPlaced(placed, cells, isFound);
  if (k >= 0) return k;
  const w = cells.map((i) => grid[i]).join('');
  const rev = [...w].reverse().join('');
  return placed.findIndex((p, j) => !isFound(j) && (p.word === w || p.word === rev));
}

// Caminho livre: cada célula vizinha da anterior (inclusive diagonal), sem repetir.
export function isFreePath(cells, size = WS_SIZE) {
  if (new Set(cells).size !== cells.length) return false;
  for (let k = 1; k < cells.length; k++) {
    const a = cells[k - 1], b = cells[k];
    const dr = Math.abs(Math.floor(a / size) - Math.floor(b / size)), dc = Math.abs((a % size) - (b % size));
    if (dr > 1 || dc > 1 || (dr === 0 && dc === 0)) return false;
  }
  return true;
}

// Formatos possíveis de uma palavra a partir de (r0,c0): reta em 8 direções ou
// "cobrinha" que junta horizontal e vertical (vira 1 ou 2 vezes).
function shapeCells(rng, len, size) {
  const r0 = rng.int(size), c0 = rng.int(size);
  const cells = [r0 * size + c0];
  if (rng.next() < 0.45) {
    const [dr, dc] = DIRS[rng.int(8)];
    for (let k = 1; k < len; k++) {
      const r = r0 + dr * k, c = c0 + dc * k;
      if (r < 0 || c < 0 || r >= size || c >= size) return null;
      cells.push(r * size + c);
    }
    return cells;
  }
  const ORTHO = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  let [dr, dc] = ORTHO[rng.int(4)];
  let r = r0, c = c0, turns = 0;
  for (let k = 1; k < len; k++) {
    // vira no máximo 2 vezes, nunca logo na primeira ou na última letra
    if (k > 1 && k < len - 1 && turns < 2 && rng.next() < 0.3) {
      [dr, dc] = rng.next() < 0.5 ? [dc, -dr] : [-dc, dr];
      turns++;
    }
    r += dr; c += dc;
    const i = r * size + c;
    if (r < 0 || c < 0 || r >= size || c >= size || cells.includes(i)) return null;
    cells.push(i);
  }
  return cells;
}

// Caça-palavras sem tema: escolhe o encaixe com MAIS letras compartilhadas para
// cada palavra, deixando a grade bem cruzada (mais composições possíveis).
export function buildMixedSearch(rng, pool, size = WS_SIZE, count = MIX_COUNT) {
  const grid = Array(size * size).fill(null);
  const placed = [];
  const used = new Set();
  for (const display of pool) {
    const w = normalize(display);
    if (w.length < 4 || w.length > 9 || used.has(w)) continue;
    let best = null, bestScore = -1;
    for (let t = 0; t < 160; t++) {
      const cells = shapeCells(rng, w.length, size);
      if (!cells) continue;
      let overlap = 0, ok = true;
      for (let k = 0; k < cells.length; k++) {
        const g = grid[cells[k]];
        if (g == null) continue;
        if (g !== w[k]) { ok = false; break; }
        overlap++;
      }
      if (!ok || overlap === w.length) continue;
      if (overlap > bestScore) { best = cells; bestScore = overlap; }
    }
    // depois das primeiras, só aceita palavras que cruzam com alguma já posta
    if (!best || (placed.length >= 4 && bestScore < 1)) continue;
    best.forEach((i, k) => (grid[i] = w[k]));
    placed.push({ display: w, word: w, cells: best });
    used.add(w);
    if (placed.length >= count) break;
  }
  for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = ALPHA[rng.int(ALPHA.length)];
  return { grid, placed };
}

// Seleção por arrasto num tabuleiro de células (caça-palavras).
// mode 'line': do começo ao fim em linha reta. mode 'free': passa de vizinha em vizinha
// (vale juntar horizontal, vertical e diagonal; voltar uma casa desfaz).
export function attachSelection(board, { size, mode = 'line', onPaint, onDone }) {
  let start = null;
  let sel = [];
  let lastPt = null;
  // área das células (ignora padding/borda do tabuleiro)
  const area = () => {
    const a = board.firstElementChild.getBoundingClientRect(), b = board.lastElementChild.getBoundingClientRect();
    return { left: a.left, top: a.top, width: b.right - a.left, height: b.bottom - a.top };
  };
  const cellFromPoint = (x, y, strict) => {
    const r = area();
    const cw = r.width / size, ch = r.height / size;
    const c = Math.floor((x - r.left) / cw), row = Math.floor((y - r.top) / ch);
    if (c < 0 || row < 0 || c >= size || row >= size) return null;
    if (strict) {
      // perto do centro: facilita as diagonais no modo livre
      const dx = (x - r.left) / cw - c - 0.5, dy = (y - r.top) / ch - row - 0.5;
      if (Math.hypot(dx, dy) > strict) return null;
    }
    return row * size + c;
  };
  const freeStep = (i) => {
    if (i == null || i === sel[sel.length - 1]) return;
    if (sel.length >= 2 && sel[sel.length - 2] === i) { sel.pop(); return; }
    if (sel.includes(i) || !isFreePath([sel[sel.length - 1], i], size)) return;
    sel.push(i);
  };
  const move = (x, y) => {
    if (mode === 'line') {
      const i = cellFromPoint(x, y);
      const l = i == null ? null : lineBetween(start, i, size);
      if (l) sel = l;
      return;
    }
    // interpola entre os pontos para não pular casas em arrastos rápidos
    const r = area();
    const stepPx = Math.max(4, r.width / size / 4);
    const [x0, y0] = lastPt || [x, y];
    const n = Math.max(1, Math.ceil(Math.hypot(x - x0, y - y0) / stepPx));
    for (let k = 1; k <= n; k++) {
      const px = x0 + ((x - x0) * k) / n, py = y0 + ((y - y0) * k) / n;
      const last = sel[sel.length - 1];
      const cand = cellFromPoint(px, py);
      if (cand == null || cand === last) continue;
      const diag = Math.floor(cand / size) !== Math.floor(last / size) && cand % size !== last % size;
      freeStep(cellFromPoint(px, py, diag ? 0.4 : 0.5));
    }
    lastPt = [x, y];
  };
  board.addEventListener('pointerdown', (e) => {
    const i = cellFromPoint(e.clientX, e.clientY);
    if (i == null) return;
    e.preventDefault();
    board.setPointerCapture?.(e.pointerId);
    start = i;
    sel = [i];
    lastPt = [e.clientX, e.clientY];
    onPaint(sel);
  });
  board.addEventListener('pointermove', (e) => {
    if (start == null) return;
    move(e.clientX, e.clientY);
    onPaint(sel);
  });
  const up = () => {
    if (start == null) return;
    start = null;
    const out = sel;
    sel = [];
    onPaint(sel);
    onDone(out);
  };
  board.addEventListener('pointerup', up);
  board.addEventListener('pointercancel', up);
}
