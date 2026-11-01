// Painel de palavras encontradas + resumo de palavras perdidas (usado pelos modos de grade).
import { h, toast } from '../core/ui.js';
import { isWord } from '../core/dict.js';
import { checkWord } from '../core/verify.js';
import { wordPoints, sortMissed } from '../core/letters.js';

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

export function missedWords(all, found, limit = 40) {
  const missed = sortMissed(all.filter((w) => !found.has(w)));
  if (!missed.length) return h('p', {}, 'Você encontrou todas as palavras!');
  return h(
    'div',
    { class: 'missed' },
    h('h4', {}, 'Algumas palavras que ficaram de fora:'),
    h('p', {}, missed.slice(0, limit).map((w) => `${w.toUpperCase()} (${wordPoints(w)})`).join(' · '))
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
