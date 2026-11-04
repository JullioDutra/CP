// Componente de grade de letras: arrastar, tocar peça por peça ou digitar no teclado.
import { h } from './ui.js';
import { isAdjacent, findPath } from './letters.js';
import { play, buzz } from './sound.js';
import { mascotSay } from './mascot.js';
import { floatPoints } from './fx.js';

export function createWordGrid({ size, letters, bonus = {}, onSubmit }) {
  let grid = letters.slice();
  let path = [];
  let dragging = false;
  let movedInGesture = false;
  let typed = '';

  const current = h('div', { class: 'current-word' }, ' ');
  const board = h('div', { class: 'board fill', style: `--n:${size}` });
  const tiles = []; // por índice ORIGINAL da grade (o servidor só conhece esse)
  let rot = 0; // quantas vezes a grade foi girada 90° (só muda o desenho)
  const marks = {}; // classes que sobrevivem a redesenhos (ex.: letras da chuva)

  // posição na tela → índice original (girar não muda quem é vizinho de quem)
  const toOrig = (d) => {
    let r = Math.floor(d / size), c = d % size;
    for (let k = 0; k < rot; k++) [r, c] = [size - 1 - c, r];
    return r * size + c;
  };

  function renderTiles() {
    board.replaceChildren();
    tiles.length = 0;
    for (let d = 0; d < size * size; d++) {
      const i = toOrig(d);
      const l = grid[i];
      const t = h(
        'button',
        { class: 'tile', 'data-i': i, type: 'button', 'aria-label': l.toUpperCase() },
        h('span', {}, l.toUpperCase()),
        bonus[i] ? h('em', { class: 'bonus' }, bonus[i]) : null
      );
      if (bonus[i]) t.classList.add('has-bonus');
      tiles[i] = t;
      board.append(t);
    }
    board.append(trace);
    for (const [cls, cells] of Object.entries(marks)) cells.forEach((i) => tiles[i]?.classList.add(cls));
    paint();
    board.dispatchEvent(new CustomEvent('rendered', { bubbles: true })); // quem marca peças (letra quente) remarca
  }

  const word = () => path.map((i) => grid[i]).join('');

  // traço ligando as peças escolhidas (desenhado por cima da grade)
  const trace = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  trace.setAttribute('class', 'trace');
  trace.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  trace.append(line);
  function drawTrace() {
    if (path.length < 2) { line.setAttribute('points', ''); return; }
    const b = board.getBoundingClientRect();
    trace.setAttribute('viewBox', `0 0 ${b.width} ${b.height}`);
    line.setAttribute('points', path.map((i) => { const r = tiles[i].getBoundingClientRect(); return `${r.left - b.left + r.width / 2},${r.top - b.top + r.height / 2}`; }).join(' '));
  }

  function paint() {
    tiles.forEach((t, i) => {
      t.classList.toggle('sel', path.includes(i));
      t.classList.toggle('last', path[path.length - 1] === i);
    });
    drawTrace();
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
    // jogada otimista: as peças já acendem enquanto o servidor confere
    p.forEach((i) => tiles[i]?.classList.add('pending'));
    current.textContent = w.toUpperCase();
    current.classList.add('checking');
    // onSubmit pode responder na hora ou devolver uma Promise (multijogador)
    Promise.resolve(onSubmit(w, p)).then((res) => {
      p.forEach((i) => tiles[i]?.classList.remove('pending'));
      current.classList.remove('checking');
      if (!path.length && !typed) current.textContent = ' ';
      buzz(res?.ok ? (w.length >= 6 ? 'big' : 'good') : 'bad');
      flash(p, res?.ok ? 'good' : res?.dup ? 'dup' : 'bad');
      play(res?.ok ? (w.length >= 6 ? 'big' : 'good') : res?.dup ? 'dup' : 'bad');
      if (res?.ok && res.pts) floatPoints(tiles[p[p.length - 1]], `+${res.pts}`, res.mult > 1 || w.length >= 7 ? 'big' : 'good');
      if (res?.ok) mascotSay(res.combo >= 3 ? 'combo' : res.mult > 1 ? 'mult' : w.length >= 7 ? 'big' : 'word', { word: w, pts: res.pts, combo: res.combo });
      else if (!res?.dup) mascotSay('bad', { word: w });
    });
  }

  // Peça sob o ponto, pela geometria do tabuleiro (funciona também nos espaços entre peças).
  // Vizinha reta (horizontal/vertical) aceita quase a peça toda; diagonal exige chegar
  // mais perto do centro, para não pegar a peça do lado sem querer.
  function tileAt(x, y) {
    const shown = board.querySelectorAll('.tile');
    const a = shown[0]?.getBoundingClientRect(), b = shown[shown.length - 1]?.getBoundingClientRect();
    if (!a || !b) return null;
    const cw = (b.right - a.left) / size, ch = (b.bottom - a.top) / size;
    const fx = (x - a.left) / cw, fy = (y - a.top) / ch;
    const c = Math.floor(fx), r = Math.floor(fy);
    if (c < 0 || r < 0 || c >= size || r >= size) return null;
    const i = toOrig(r * size + c);
    const last = path[path.length - 1];
    const diag = last != null && Math.floor(last / size) !== Math.floor(i / size) && last % size !== i % size;
    const limit = last == null ? 0.5 : diag ? 0.4 : 0.52;
    return Math.hypot(fx - c - 0.5, fy - r - 0.5) <= limit ? i : null;
  }

  // Arrasto rápido: passa por pontos intermediários para não pular peças.
  let lastPt = null;
  function dragTo(x, y) {
    const [x0, y0] = lastPt || [x, y];
    const step = Math.max(4, (tiles[0]?.getBoundingClientRect().width || 40) / 4);
    const n = Math.max(1, Math.ceil(Math.hypot(x - x0, y - y0) / step));
    for (let k = 1; k <= n; k++) extend(tileAt(x0 + ((x - x0) * k) / n, y0 + ((y - y0) * k) / n));
    lastPt = [x, y];
  }

  function extend(i) {
    if (i == null || i === path[path.length - 1]) return;
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
    lastPt = [e.clientX, e.clientY];
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
    dragTo(e.clientX, e.clientY);
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
    // girar a grade: mesmas letras, outro ângulo (ajuda a enxergar palavras novas)
    h('button', { class: 'btn ghost icon-btn rotate-btn', type: 'button', title: 'Girar a grade', 'aria-label': 'Girar a grade', onclick: () => {
      rot = (rot + 1) % 4; path = []; typed = '';
      renderTiles();
      board.classList.remove('turned'); void board.offsetWidth; board.classList.add('turned');
      play('tick');
    } }, rotateIcon()),
    h('button', { class: 'btn', type: 'button', onclick: submit }, 'Enviar')
  );

  renderTiles();

  return {
    el: h('div', { class: 'wordgrid' }, current, board, actions),
    get letters() { return grid; },
    setLetters(next, changed = []) {
      grid = next.slice();
      path = [];
      renderTiles();
      flash(changed, 'fresh');
    },
    setBonus(b) { bonus = b; renderTiles(); },
    // marca peças com uma classe (ex.: letras que acabaram de cair na Chuva de Letras)
    mark(cells, cls) { marks[cls] = cells.slice(); tiles.forEach((t, i) => t.classList.toggle(cls, cells.includes(i))); },
    disable() {
      document.removeEventListener('keydown', onKey);
      board.classList.add('disabled');
    },
    destroy() { document.removeEventListener('keydown', onKey); },
  };
}

function rotateIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ico');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path d="M21 12a9 9 0 1 1-3-6.7L21 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 3v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  return svg;
}
