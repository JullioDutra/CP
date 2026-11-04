// Painel de palavras encontradas + resumo de palavras perdidas (usado pelos modos de grade).
import { h, toast } from '../core/ui.js';
import { isWord } from '../core/dict.js';
import { checkWord } from '../core/verify.js';
import { wordPoints, sortMissed } from '../core/letters.js';
import { showWordPath } from '../core/wordpath.js';

export function foundPanel() {
  const list = h('ul', { class: 'found' });
  const title = h('h3', {}, 'Palavras (0)');
  let n = 0;
  return {
    el: h('div', { class: 'found-panel' }, title, list),
    add(w, pts, ai = false) {
      n++;
      title.textContent = `Palavras (${n})`;
      list.prepend(h('li', {}, w.toUpperCase(), h('small', {}, `+${pts}`)));
    },
  };
}

// grids/size: com a grade, cada palavra vira um botão que mostra onde ela estava.
export function missedWords(all, found, limit = 40, grids = null, size = null) {
  const missed = sortMissed(all.filter((w) => !found.has(w)));
  if (!missed.length) return h('p', {}, 'Você encontrou todas as palavras!');
  const list = missed.slice(0, limit);
  return h(
    'div',
    { class: 'missed' },
    h('h4', {}, grids ? 'Algumas palavras que ficaram de fora (toque para ver onde estavam):' : 'Algumas palavras que ficaram de fora:'),
    grids
      ? h('div', { class: 'wchips' }, list.map((w) => h('button', { type: 'button', class: 'wchip missed-chip', onclick: () => showWordPath(w, grids, size, { pts: wordPoints(w) }) }, w.toUpperCase(), h('small', {}, `+${wordPoints(w)}`))))
      : h('p', {}, list.map((w) => `${w.toUpperCase()} (${wordPoints(w)})`).join(' · '))
  );
}

// Palavra fora do dicionário? Confere no servidor (IA) antes de recusar, sem avisar o jogador.
export async function confirmWord(root, w, isOver = () => false) {
  if (isWord(w)) return { ok: true, ai: false };
  // verificação silenciosa: se não existir, a grade só pisca em vermelho
  const r = await checkWord(w);
  if (isOver()) return { ok: false };
  return { ok: r.ok, ai: r.ok };
}
