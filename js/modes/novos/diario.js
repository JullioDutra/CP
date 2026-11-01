// MODO NOVO — Desafio do Dia
// Mesma grade para todos os jogadores no mesmo dia, com casas bônus. Uma tentativa válida por dia.
import { h, createTimer, fmtTime, toast, hud } from '../../core/ui.js';
import { todayKey } from '../../core/rng.js';
import { dailyPuzzle, dailyPoints } from '../../core/solo.js';
import { createWordGrid } from '../../core/wordgrid.js';
import { foundPanel, missedWords, confirmWord } from '../shared-wordlist.js';
import { startOnline } from '../../core/online-solo.js';

const TIME = 120;
const PLAYED_KEY = 'trama.daily.played';

export { dailyPuzzle, dailyPoints };

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
  scoring: true,
  rules: [
    'Todo dia uma grade nova, igual para todos os jogadores.',
    'Casas ×2 e ×3 multiplicam os pontos da palavra que passar por elas (se passar pelas duas, ×6!).',
    'Só a primeira partida do dia vale para o ranking — depois disso é treino.',
    `${TIME / 60} minutos.`,
  ],
  globalRanking: true,
  prepare: () => startOnline('novo-diario', { dia: todayKey() }),
  start(root, api, opts = {}) {
    const online = opts.online;
    const day = online?.variante || todayKey();
    const prev = playedToday();
    // com servidor, quem decide se vale é o ranking global (1 partida oficial por perfil por dia)
    const practice = online ? !online.ranked : !!prev;
    const { grid, words, bonus } = dailyPuzzle(day);
    const found = new Set();
    const paths = {};
    const items = [];
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
        if (w.length < 3) return { ok: false };
        if (found.has(w)) return { dup: true };
        const v = await confirmWord(root, w, () => ended);
        if (!v.ok) return { ok: false };
        if (found.has(w)) return { dup: true };
        found.add(w);
        paths[w] = path;
        const pts = dailyPoints(w, path, bonus);
        score += pts;
        panel.add(w, pts, v.ai);
        items.push({ label: w, pts, ai: v.ai });
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
        revealItems: items,
        ranked: !practice,
        detail: day,
        summary: [['Dia', day.split('-').reverse().join('/')], ['Palavras', `${found.size}/${words.length}`], ['Partida', practice ? 'Treino (não conta)' : 'Oficial']],
        extra: missedWords(words, found),
        online: online && { ticket: online.ticket, palavras: [...found].map((w) => ({ w, path: paths[w] })) },
      });
    }

    root.append(
      top.el,
      practice ? h('p', { class: 'notice' }, prev ? `Você já jogou hoje (${prev.score} pts). Esta partida é só treino.` : 'Você já jogou o desafio de hoje. Esta partida é só treino.') : '',
      h('div', { class: 'play-area' }, wg.el),
      h('div', { class: 'row-actions center game-foot' }, h('button', { class: 'btn ghost small', onclick: finish }, 'Encerrar'))
    );
    return () => { timer.stop(); wg.destroy(); };
  },
};
