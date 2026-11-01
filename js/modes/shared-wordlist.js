// Painel de palavras encontradas + resumo de palavras perdidas (usado pelos modos de grade).
import { h } from '../core/ui.js';
import { wordPoints } from '../core/letters.js';

export function foundPanel() {
  const list = h('ul', { class: 'found' });
  const title = h('h3', {}, 'Palavras (0)');
  let n = 0;
  return {
    el: h('div', { class: 'found-panel' }, title, list),
    add(w, pts) {
      n++;
      title.textContent = `Palavras (${n})`;
      list.prepend(h('li', {}, w.toUpperCase(), h('small', {}, `+${pts}`)));
    },
  };
}

export function missedWords(all, found, limit = 40) {
  const missed = all.filter((w) => !found.has(w)).sort((a, b) => b.length - a.length || a.localeCompare(b));
  if (!missed.length) return h('p', {}, 'Você encontrou todas as palavras!');
  return h(
    'div',
    { class: 'missed' },
    h('h4', {}, `Algumas palavras que ficaram de fora (${missed.length} no total):`),
    h('p', {}, missed.slice(0, limit).map((w) => `${w.toUpperCase()} (${wordPoints(w)})`).join(' · '))
  );
}
