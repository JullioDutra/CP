// "Onde estava essa palavra?": toque numa palavra do resultado e uma grade pequena mostra o
// caminho acendendo letra por letra. `grids` pode ter várias versões (Chuva de Letras).
import { h } from './ui.js';
import { findPath } from './letters.js';
import { icon } from './icons.js';

export function showWordPath(word, grids, size, { pts = null, who = '' } = {}) {
  const list = Array.isArray(grids[0]) ? grids : [grids];
  let grid = list[0], path = null;
  for (const g of list) { path = findPath(g, size, word); if (path) { grid = g; break; } }
  const tiles = grid.map((l) => h('span', { class: 'wp-tile' }, l.toUpperCase()));
  const board = h('div', { class: 'wp-board', style: `--n:${size}` }, tiles);
  const close = () => { sheet.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => e.key === 'Escape' && close();
  const sheet = h('div', { class: 'sheet-backdrop', onclick: (e) => e.target === sheet && close() },
    h('div', { class: 'sheet wordpath', role: 'dialog', 'aria-label': `Onde estava ${word.toUpperCase()}` },
      h('div', { class: 'wp-head' },
        h('div', {}, h('strong', { class: 'wp-word' }, word.toUpperCase()), h('span', { class: 'muted' }, [`${word.length} letras`, pts != null ? `+${pts} pts` : '', who].filter(Boolean).join(' · '))),
        h('button', { class: 'btn ghost small icon-btn', 'aria-label': 'Fechar', onclick: close }, icon('close'))),
      board,
      path ? h('button', { class: 'btn ghost small', onclick: () => animate() }, icon('refresh'), 'Ver de novo') : h('p', { class: 'hint' }, 'Essa palavra estava numa versão da grade que já mudou.')));
  document.body.append(sheet);
  document.addEventListener('keydown', onKey);
  let timers = [];
  function animate() {
    timers.forEach(clearTimeout);
    timers = [];
    tiles.forEach((t) => t.classList.remove('on', 'end'));
    (path || []).forEach((i, k) => timers.push(setTimeout(() => {
      tiles[i].classList.add('on');
      if (k === path.length - 1) tiles[i].classList.add('end');
    }, 160 + k * 230)));
  }
  animate();
}
