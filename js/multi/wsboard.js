// Tabuleiro do Caça-Palavras Corrida (jogador e telão).
import { h } from '../core/ui.js';
import { lineBetween } from '../core/wordsearch.js';

export function createWsBoard({ grid, size, interactive = true, onMark }) {
  const board = h('div', { class: `board ws ${interactive ? '' : 'tv-board'}`, style: `--n:${size}` });
  const cells = grid.map((l, i) => h('div', { class: 'cell', 'data-i': i }, l.toUpperCase()));
  board.append(...cells);
  let start = null;
  let line = [];

  const paintSel = () => cells.forEach((c, i) => c.classList.toggle('sel', line.includes(i)));
  const cellAt = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest?.('.cell');
    return el && board.contains(el) ? Number(el.dataset.i) : null;
  };

  if (interactive) {
    board.addEventListener('pointerdown', (e) => {
      const i = cellAt(e.clientX, e.clientY);
      if (i == null) return;
      e.preventDefault();
      board.setPointerCapture?.(e.pointerId);
      start = i;
      line = [i];
      paintSel();
    });
    board.addEventListener('pointermove', (e) => {
      if (start == null) return;
      const i = cellAt(e.clientX, e.clientY);
      const l = i == null ? null : lineBetween(start, i, size);
      if (l) { line = l; paintSel(); }
    });
    const up = () => {
      if (start == null) return;
      start = null;
      const sel = line;
      line = [];
      paintSel();
      if (sel.length >= 2) onMark(sel);
    };
    board.addEventListener('pointerup', up);
    board.addEventListener('pointercancel', up);
  }

  return {
    el: board,
    // words: [{display, by, cells}] ; hueOf(playerId) -> número da cor
    update(words, hueOf) {
      cells.forEach((c) => { c.classList.remove('found'); c.style.removeProperty('--hue'); });
      for (const w of words) {
        if (!w.cells) continue;
        const hue = w.by ? hueOf(w.by) : 0;
        for (const i of w.cells) { cells[i].classList.add('found'); cells[i].style.setProperty('--hue', hue); }
      }
    },
    reveal(words) {
      for (const w of words) if (!w.by) w.cells.forEach((i) => cells[i].classList.add('reveal'));
    },
  };
}
