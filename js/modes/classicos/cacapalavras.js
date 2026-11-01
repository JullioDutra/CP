// MODO CLÁSSICO — Caça-Palavras Temático
// Palavras escondidas numa grade 12×12, em 8 direções. 4 minutos.
import { h, createTimer, fmtTime, toast, hud } from '../../core/ui.js';
import { createRng } from '../../core/rng.js';
import { normalize } from '../../core/dict.js';
import { TEMAS } from '../../../data/temas.js';

const SIZE = 12;
const COUNT = 10;
const TIME = 240;
const DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
const ALPHA = 'aaaabcdeeeefghiiijlmnoooopqrrsssttuuvxz';

export function buildWordSearch(rng, words, size = SIZE) {
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
    if (placed.length >= COUNT) break;
  }
  for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = ALPHA[rng.int(ALPHA.length)];
  return { grid, placed };
}

export default {
  id: 'classico-cacapalavras',
  category: 'classico',
  name: 'Caça-Palavras',
  icon: '🔍',
  tagline: 'Grade 12×12 · tema surpresa · 4 min',
  rules: [
    'Encontre as 10 palavras do tema escondidas na grade.',
    'Elas podem estar na horizontal, vertical ou diagonal — e também de trás para frente.',
    'Arraste do começo ao fim da palavra para marcá-la.',
    'Pontos: 10 por letra + 2 por segundo restante se achar todas.',
  ],
  start(root, api) {
    const rng = createRng();
    const temaNome = rng.pick(Object.keys(TEMAS));
    const pool = rng.shuffle(TEMAS[temaNome]);
    const { grid, placed } = buildWordSearch(rng, pool);
    const foundIds = new Set();
    let score = 0;

    const top = hud([['time', 'Tempo'], ['score', 'Pontos'], ['count', 'Achadas']]);
    top.set('score', 0);
    top.set('count', `0/${placed.length}`);

    const board = h('div', { class: 'board ws', style: `--n:${SIZE}` });
    const cells = grid.map((l, i) => h('div', { class: 'cell', 'data-i': i }, l.toUpperCase()));
    board.append(...cells);
    const listEl = h('ul', { class: 'ws-list' }, placed.map((p, k) => h('li', { 'data-k': k }, p.display.toUpperCase())));

    let start = null;
    let line = [];
    const cellAt = (x, y) => {
      const el = document.elementFromPoint(x, y)?.closest?.('.cell');
      return el && board.contains(el) ? Number(el.dataset.i) : null;
    };
    const lineBetween = (a, b) => {
      const r1 = Math.floor(a / SIZE), c1 = a % SIZE, r2 = Math.floor(b / SIZE), c2 = b % SIZE;
      const dr = Math.sign(r2 - r1), dc = Math.sign(c2 - c1);
      const len = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1));
      if (!(r1 === r2 || c1 === c2 || Math.abs(r2 - r1) === Math.abs(c2 - c1))) return null;
      return Array.from({ length: len + 1 }, (_, k) => (r1 + dr * k) * SIZE + (c1 + dc * k));
    };
    const paint = () => cells.forEach((c, i) => c.classList.toggle('sel', line.includes(i)));

    board.addEventListener('pointerdown', (e) => {
      const i = cellAt(e.clientX, e.clientY);
      if (i == null) return;
      e.preventDefault();
      board.setPointerCapture?.(e.pointerId);
      start = i;
      line = [i];
      paint();
    });
    board.addEventListener('pointermove', (e) => {
      if (start == null) return;
      const i = cellAt(e.clientX, e.clientY);
      if (i == null) return;
      const l = lineBetween(start, i);
      if (l) { line = l; paint(); }
    });
    const up = () => {
      if (start == null) return;
      start = null;
      const key = line.join(',');
      const rev = line.slice().reverse().join(',');
      const k = placed.findIndex((p, idx) => !foundIds.has(idx) && (p.cells.join(',') === key || p.cells.join(',') === rev));
      if (k >= 0) {
        foundIds.add(k);
        const pts = placed[k].word.length * 10;
        score += pts;
        const hue = (foundIds.size * 47) % 360;
        placed[k].cells.forEach((i) => { cells[i].classList.add('found'); cells[i].style.setProperty('--hue', hue); });
        listEl.querySelector(`[data-k="${k}"]`).classList.add('done');
        top.set('score', score);
        top.set('count', `${foundIds.size}/${placed.length}`);
        toast(root, `${placed[k].display.toUpperCase()} +${pts}`, 'good');
        if (foundIds.size === placed.length) finish(true);
      } else if (line.length > 2) {
        toast(root, 'Não é uma das palavras', 'bad');
      }
      line = [];
      paint();
    };
    board.addEventListener('pointerup', up);
    board.addEventListener('pointercancel', up);

    const timer = createTimer({ seconds: TIME, onTick: (r) => top.set('time', fmtTime(r)), onEnd: () => finish(false) });

    let ended = false;
    function finish(all) {
      if (ended) return;
      ended = true;
      timer.stop();
      let bonus = 0;
      if (all) { bonus = Math.ceil(timer.remaining) * 2; score += bonus; }
      placed.forEach((p, k) => { if (!foundIds.has(k)) p.cells.forEach((i) => cells[i].classList.add('reveal')); });
      board.classList.add('disabled');
      api.end({
        score,
        summary: [['Tema', temaNome], ['Achadas', `${foundIds.size}/${placed.length}`], ['Bônus de tempo', bonus]],
        extra: h('p', {}, 'Palavras não encontradas ficaram destacadas na grade.'),
      });
    }

    root.append(
      top.el,
      h('h2', { class: 'theme-title' }, `Tema: ${temaNome}`),
      h('div', { class: 'play-area' }, board, listEl),
      h('div', { class: 'row-actions' }, h('button', { class: 'btn ghost', onclick: () => finish(false) }, 'Encerrar partida'))
    );
    return () => timer.stop();
  },
};
