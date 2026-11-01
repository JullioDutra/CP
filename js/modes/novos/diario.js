// MODO NOVO — Desafio do Dia
// Mesma grade para todos os jogadores no mesmo dia, com casas bônus. Uma tentativa válida por dia.
import { h, createTimer, fmtTime, toast, hud } from '../../core/ui.js';
import { createRng, seedFromString, todayKey } from '../../core/rng.js';
import { makeGrid, wordPoints } from '../../core/letters.js';
import { createWordGrid } from '../../core/wordgrid.js';
import { foundPanel, missedWords, confirmWord } from '../shared-wordlist.js';

const TIME = 120;
const PLAYED_KEY = 'trama.daily.played';

export function dailyPuzzle(day = todayKey()) {
  const rng = createRng(seedFromString(`trama-${day}`));
  const { grid, words } = makeGrid(rng, 4, { minWords: 40 });
  const cells = rng.shuffle([...Array(16).keys()]);
  // ×2 na palavra e ×3 na palavra
  const bonus = { [cells[0]]: '×2', [cells[1]]: '×3' };
  return { grid, words, bonus };
}

export function dailyPoints(word, path, bonus) {
  let mult = 1;
  for (const i of path || []) {
    if (bonus[i] === '×2') mult *= 2;
    if (bonus[i] === '×3') mult *= 3;
  }
  return wordPoints(word) * mult;
}

function playedToday() {
  try {
    const v = JSON.parse(localStorage.getItem(PLAYED_KEY));
    return v && v.day === todayKey() ? v : null;
  } catch { return null; }
}

export default {
  id: 'novo-diario',
  category: 'novo',
  name: 'Desafio do Dia',
  icon: '📅',
  tagline: 'Mesma grade para todos · casas bônus · 2 min',
  rules: [
    'Todo dia uma grade nova, igual para todos os jogadores.',
    'Casas ×2 e ×3 multiplicam os pontos da palavra que passar por elas (se passar pelas duas, ×6!).',
    'Só a primeira partida do dia vale para o ranking — depois disso é treino.',
    `${TIME / 60} minutos.`,
  ],
  start(root, api) {
    const day = todayKey();
    const prev = playedToday();
    const practice = !!prev;
    const { grid, words, bonus } = dailyPuzzle(day);
    const found = new Set();
    let score = 0;

    const top = hud([['time', 'Tempo'], ['score', 'Pontos'], ['count', 'Palavras']]);
    top.set('score', 0);
    top.set('count', 0);
    const panel = foundPanel();

    const wg = createWordGrid({
      size: 4,
      letters: grid,
      bonus,
      async onSubmit(w, path) {
        if (w.length < 3) { toast(root, 'Mínimo 3 letras', 'bad'); return { ok: false }; }
        if (found.has(w)) { toast(root, 'Já encontrada', 'dup'); return { dup: true }; }
        const v = await confirmWord(root, w, () => ended);
        if (!v.ok) return { ok: false };
        if (found.has(w)) return { dup: true };
        found.add(w);
        const pts = dailyPoints(w, path, bonus);
        score += pts;
        panel.add(w, pts, v.ai);
        top.set('score', score);
        top.set('count', found.size);
        toast(root, `+${pts}`, 'good');
        return { ok: true };
      },
    });

    if (!practice) {
      try { localStorage.setItem(PLAYED_KEY, JSON.stringify({ day, score: 0 })); } catch { /* ignore */ }
    }

    const timer = createTimer({ seconds: TIME, onTick: (r) => top.set('time', fmtTime(r)), onEnd: finish });

    let ended = false;
    function finish() {
      if (ended) return;
      ended = true;
      timer.stop();
      wg.disable();
      if (!practice) {
        try { localStorage.setItem(PLAYED_KEY, JSON.stringify({ day, score })); } catch { /* ignore */ }
      }
      api.end({
        score,
        ranked: !practice,
        detail: day,
        summary: [['Dia', day.split('-').reverse().join('/')], ['Palavras', `${found.size}/${words.length}`], ['Partida', practice ? 'Treino (não conta)' : 'Oficial']],
        extra: missedWords(words, found),
      });
    }

    root.append(
      top.el,
      practice ? h('p', { class: 'notice' }, `Você já jogou hoje (${prev.score} pts). Esta partida é só treino.`) : '',
      h('div', { class: 'play-area' }, wg.el, panel.el),
      h('div', { class: 'row-actions' }, h('button', { class: 'btn ghost', onclick: finish }, 'Encerrar partida'))
    );
    return () => { timer.stop(); wg.destroy(); };
  },
};
