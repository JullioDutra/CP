// Tabuleiro do Caça-Palavras Corrida (jogador e telão).
import { h } from '../core/ui.js';
import { attachSelection } from '../core/wordsearch.js';

export function createWsBoard({ grid, size, free = false, interactive = true, onMark }) {
  const board = h('div', { class: `board ws ${interactive ? '' : 'tv-board'}`, style: `--n:${size}` });
  const cells = grid.map((l, i) => h('div', { class: 'cell', 'data-i': i }, l.toUpperCase()));
  board.append(...cells);
  const paintSel = (line) => cells.forEach((c, i) => c.classList.toggle('sel', line.includes(i)));
  if (interactive) {
    attachSelection(board, { size, mode: free ? 'free' : 'line', onPaint: paintSel, onDone: (sel) => { if (sel.length >= 2) onMark(sel); } });
  }

  const flash = (sel, cls) => sel.forEach((i) => { cells[i].classList.add(cls); setTimeout(() => cells[i].classList.remove(cls), 450); });
  return {
    el: board,
    flash,
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
