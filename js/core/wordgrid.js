// Componente de grade de letras: arrastar, tocar peça por peça ou digitar no teclado.
import { h } from './ui.js';
import { isAdjacent, findPath, POINTS_HINT } from './letters.js';

export function createWordGrid({ size, letters, bonus = {}, onSubmit }) {
  let grid = letters.slice();
  let path = [];
  let dragging = false;
  let movedInGesture = false;
  let typed = '';

  const current = h('div', { class: 'current-word' }, ' ');
  const board = h('div', { class: 'board', style: `--n:${size}` });
  const tiles = [];

  function renderTiles() {
    board.replaceChildren();
    tiles.length = 0;
    grid.forEach((l, i) => {
      const t = h(
        'button',
        { class: 'tile', 'data-i': i, type: 'button', 'aria-label': l.toUpperCase() },
        h('span', {}, l.toUpperCase()),
        bonus[i] ? h('em', { class: 'bonus' }, bonus[i]) : null
      );
      if (bonus[i]) t.classList.add('has-bonus');
      tiles.push(t);
      board.append(t);
    });
    paint();
  }

  const word = () => path.map((i) => grid[i]).join('');

  function paint() {
    tiles.forEach((t, i) => {
      t.classList.toggle('sel', path.includes(i));
      t.classList.toggle('last', path[path.length - 1] === i);
    });
    const w = typed || word();
    current.textContent = w ? w.toUpperCase() : ' ';
  }

  function flash(indexes, cls) {
    indexes.forEach((i) => {
      tiles[i]?.classList.add(cls);
      setTimeout(() => tiles[i]?.classList.remove(cls), 450);
    });
  }

  function submit() {
    const p = path.slice();
    const w = word();
    path = [];
    typed = '';
    paint();
    if (w.length === 0) return;
    // onSubmit pode responder na hora ou devolver uma Promise (multijogador)
    Promise.resolve(onSubmit(w, p)).then((res) => flash(p, res?.ok ? 'good' : res?.dup ? 'dup' : 'bad'));
  }

  function tileAt(x, y) {
    const el = document.elementFromPoint(x, y)?.closest?.('.tile');
    if (!el || !board.contains(el)) return null;
    // Só conta perto do centro da peça, para diagonais funcionarem bem.
    const r = el.getBoundingClientRect();
    const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) > r.width * 0.42) return null;
    return Number(el.dataset.i);
  }

  function extend(i) {
    if (i == null) return;
    typed = '';
    const last = path[path.length - 1];
    if (path.length >= 2 && path[path.length - 2] === i) {
      path.pop(); // voltar uma peça
    } else if (!path.includes(i) && (last == null || isAdjacent(last, i, size))) {
      path.push(i);
    } else return;
    movedInGesture = true;
    paint();
  }

  board.addEventListener('pointerdown', (e) => {
    const i = tileAt(e.clientX, e.clientY) ?? (e.target.closest('.tile') ? Number(e.target.closest('.tile').dataset.i) : null);
    if (i == null) return;
    e.preventDefault();
    board.setPointerCapture?.(e.pointerId);
    dragging = true;
    movedInGesture = false;
    const last = path[path.length - 1];
    if (i === last && path.length > 0) {
      // tocar novamente na última peça envia a palavra
      dragging = false;
      submit();
      return;
    }
    if (path.length && !isAdjacent(last, i, size)) path = [];
    extend(i);
    movedInGesture = false;
  });
  board.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    extend(tileAt(e.clientX, e.clientY));
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    if (movedInGesture && path.length > 1) submit();
  };
  board.addEventListener('pointerup', end);
  board.addEventListener('pointercancel', end);

  function onKey(e) {
    if (e.target.closest?.('input, textarea')) return;
    if (e.key === 'Enter') {
      if (typed) {
        const p = findPath(grid, size, typed);
        if (p) { path = p; typed = ''; submit(); }
        else { const w = typed; typed = ''; paint(); onSubmit(w, null); }
      } else submit();
    } else if (e.key === 'Backspace') {
      if (typed) typed = typed.slice(0, -1);
      else path.pop();
      paint();
    } else if (e.key === 'Escape') {
      typed = ''; path = []; paint();
    } else if (/^[a-zA-Z]$/.test(e.key)) {
      path = [];
      typed += e.key.toLowerCase();
      const p = findPath(grid, size, typed);
      tiles.forEach((t, i) => t.classList.toggle('sel', !!p?.includes(i)));
      current.textContent = typed.toUpperCase();
      current.classList.toggle('invalid', !p);
      return;
    } else return;
    current.classList.remove('invalid');
  }
  document.addEventListener('keydown', onKey);

  const actions = h(
    'div',
    { class: 'grid-actions' },
    h('button', { class: 'btn ghost', type: 'button', onclick: () => { path = []; typed = ''; paint(); } }, 'Limpar'),
    h('button', { class: 'btn', type: 'button', onclick: submit }, 'Enviar')
  );

  renderTiles();

  return {
    el: h('div', { class: 'wordgrid' }, current, board, actions, h('p', { class: 'points-hint' }, 'Pontos: ' + POINTS_HINT)),
    get letters() { return grid; },
    setLetters(next, changed = []) {
      grid = next.slice();
      path = [];
      renderTiles();
      flash(changed, 'fresh');
    },
    setBonus(b) { bonus = b; renderTiles(); },
    disable() {
      document.removeEventListener('keydown', onKey);
      board.classList.add('disabled');
    },
    destroy() { document.removeEventListener('keydown', onKey); },
  };
}
