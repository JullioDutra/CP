// MODO CLÁSSICO — Caça-Palavras Temático
// Palavras escondidas numa grade 12×12, em 8 direções. 4 minutos.
import { h, createTimer, fmtTime, toast, hud } from '../../core/ui.js';
import { createRng } from '../../core/rng.js';
import { buildWordSearch, lineBetween as line2, matchPlaced, WS_SIZE } from '../../core/wordsearch.js';
import { TEMAS } from '../../../data/temas.js';

const SIZE = WS_SIZE;
const TIME = 240;

export { buildWordSearch };

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
    const lineBetween = (a, b) => line2(a, b, SIZE);
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
      const k = matchPlaced(placed, line, (idx) => foundIds.has(idx));
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
