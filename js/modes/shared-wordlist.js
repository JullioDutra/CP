// Painel de palavras encontradas + resumo de palavras perdidas (usado pelos modos de grade).
import { h, toast } from '../core/ui.js';
import { isWord } from '../core/dict.js';
import { checkWord } from '../core/verify.js';
import { wordPoints, sortMissed, findPath } from '../core/letters.js';
import { confetti } from '../core/fx.js';
import { mascotSay } from '../core/mascot.js';
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

// ---------- Metas da partida (solo) ----------
// Três metas simples que vão ficando verdes durante a partida.
const GOALS = { 4: { words: 8, pts: 30 }, 5: { words: 12, pts: 50 }, 6: { words: 15, pts: 80 } };
export function createGoals(size = 5) {
  const g = GOALS[size] || GOALS[5];
  const long = size >= 6 ? 7 : 6;
  const list = [
    { label: `${g.words} palavras`, ok: (s) => s.words >= g.words },
    { label: `Uma de ${long}+ letras`, ok: (s) => s.longest >= long },
    { label: `${g.pts} pontos`, ok: (s) => s.score >= g.pts },
  ];
  const chips = list.map((m) => h('span', { class: 'goal' }, h('i', { 'aria-hidden': 'true' }), m.label));
  const el = h('div', { class: 'goals', 'aria-label': 'Metas da partida' }, h('span', { class: 'group-label' }, 'Metas'), chips);
  let done = 0;
  return {
    el,
    update(s) {
      list.forEach((m, i) => {
        if (!chips[i].classList.contains('done') && m.ok(s)) {
          chips[i].classList.add('done');
          done++;
          if (done === list.length) { confetti({ count: 50 }); mascotSay('record'); }
        }
      });
    },
    get done() { return done; },
    total: list.length,
  };
}

// ---------- Dica: mostra a 1ª letra de uma palavra grande ainda não achada ----------
export function giveHint(root, wg, words, found, size) {
  const grid = wg.letters;
  const options = words.filter((w) => w.length >= 6 && !found.has(w)).map((w) => [w, findPath(grid, size, w)]).filter(([, p]) => p);
  if (!options.length) { toast(root, 'Sem dica agora: tente palavras menores!', 'dup'); return false; }
  const [w, path] = options[Math.floor(Math.random() * options.length)];
  wg.mark([path[0]], 'hint-tile');
  setTimeout(() => wg.mark([], 'hint-tile'), 3500);
  toast(root, `Dica: começa com ${w[0].toUpperCase()} e tem ${w.length} letras`, 'good');
  return true;
}
