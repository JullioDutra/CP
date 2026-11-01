// Tabuleiro do Sudoku Duelo: o servidor confere cada número (a solução não vem para o navegador).
import { h, toast } from '../core/ui.js';
import { play } from '../core/sound.js';

export function createSudokuDuel({ puzzle, board, onCell, toastRoot }) {
  let current = board.slice();
  let selected = puzzle.indexOf(0);
  let notesMode = false;
  const notes = Array.from({ length: 81 }, () => new Set());
  let disabled = false;

  const grid = h('div', { class: 'board sudoku', style: '--n:9' });
  const cells = puzzle.map((v, i) => h('button', { class: `scell ${v ? 'given' : ''}`, type: 'button', onclick: () => { selected = i; paint(); } }));
  grid.append(...cells);

  const notesBtn = h('button', {
    class: 'btn ghost', type: 'button',
    onclick: () => { notesMode = !notesMode; notesBtn.classList.toggle('on', notesMode); notesBtn.textContent = notesMode ? 'Notas: ligado' : 'Notas: desligado'; },
  }, 'Notas: desligado');
  const pad = h('div', { class: 'numpad' },
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => h('button', { class: 'btn num', type: 'button', 'data-n': n, onclick: () => input(n) }, n)),
    h('button', { class: 'btn ghost num', type: 'button', onclick: () => input(0) }, '⌫'));

  function paint() {
    const sv = current[selected];
    cells.forEach((c, i) => {
      const r = Math.floor(i / 9), col = i % 9, sr = Math.floor(selected / 9), sc = selected % 9;
      const peer = r === sr || col === sc || (Math.floor(r / 3) === Math.floor(sr / 3) && Math.floor(col / 3) === Math.floor(sc / 3));
      c.classList.toggle('selected', i === selected);
      c.classList.toggle('peer', peer && i !== selected);
      c.classList.toggle('same', !!sv && current[i] === sv && i !== selected);
      c.classList.toggle('br', col === 2 || col === 5);
      c.classList.toggle('bb', r === 2 || r === 5);
      if (current[i]) c.textContent = current[i];
      else if (notes[i].size) c.replaceChildren(h('div', { class: 'notes' }, [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => h('span', {}, notes[i].has(n) ? n : ''))));
      else c.textContent = '';
    });
    pad.querySelectorAll('[data-n]').forEach((b) => (b.disabled = current.filter((v) => v === Number(b.dataset.n)).length >= 9));
  }

  async function input(n) {
    if (disabled || puzzle[selected] || current[selected]) return;
    const i = selected;
    if (n === 0) { notes[i].clear(); paint(); return; }
    if (notesMode) { notes[i].has(n) ? notes[i].delete(n) : notes[i].add(n); paint(); return; }
    const r = await onCell(i, n);
    if (r.ok) {
      current[i] = n;
      cells[i].classList.add('ok');
      const ri = Math.floor(i / 9), ci = i % 9;
      notes.forEach((s, j) => {
        const rj = Math.floor(j / 9), cj = j % 9;
        if (rj === ri || cj === ci || (Math.floor(rj / 3) === Math.floor(ri / 3) && Math.floor(cj / 3) === Math.floor(ci / 3))) s.delete(n);
      });
      play(r.done ? 'win' : 'good');
      if (r.done) toast(toastRoot, `Terminou em ${r.place}º lugar!`, 'good');
    } else {
      cells[i].classList.add('wrong');
      setTimeout(() => cells[i].classList.remove('wrong'), 500);
      play('bad');
      toast(toastRoot, r.reason, 'bad');
    }
    paint();
  }

  function onKey(e) {
    if (/^[1-9]$/.test(e.key)) input(Number(e.key));
    else if (e.key === 'Backspace' || e.key === 'Delete') input(0);
    else if (e.key.toLowerCase() === 'n') notesBtn.click();
    else {
      const mv = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
      if (mv) { e.preventDefault(); selected = (selected + mv + 81) % 81; paint(); }
    }
  }
  document.addEventListener('keydown', onKey);
  paint();

  return {
    el: h('div', { class: 'play-area' }, grid, h('div', { class: 'side' }, pad, notesBtn)),
    sync(serverBoard, done) {
      current = serverBoard.slice();
      if (done && !disabled) { disabled = true; grid.classList.add('disabled'); }
      paint();
    },
    destroy() { document.removeEventListener('keydown', onKey); },
  };
}
