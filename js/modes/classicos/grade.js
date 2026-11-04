// MODO CLÁSSICO — Grade Relâmpago
// Grade 4×4, 3 minutos. Ligue letras vizinhas (inclusive na diagonal) para formar palavras.
import { h, createTimer, fmtTime, toast, hud } from '../../core/ui.js';
import { createRng } from '../../core/rng.js';
import { makeGrid, wordPoints, solve, longestWord } from '../../core/letters.js';
import { startOnline } from '../../core/online-solo.js';
import { createWordGrid } from '../../core/wordgrid.js';
import { foundPanel, missedWords, confirmWord, createGoals, giveHint } from '../shared-wordlist.js';

export default {
  id: 'classico-grade',
  category: 'classico',
  name: 'Grade Relâmpago',
  icon: '⚡',
  tagline: 'Grade 4×4, 5×5 ou 6×6 · 3 minutos',
  options: { key: 'size', label: 'Grade', choices: [['4', '4×4'], ['5', '5×5'], ['6', '6×6']], default: '4' },
  rankingKey: (opts) => (opts.size && opts.size !== '4' ? `classico-grade-${opts.size}` : 'classico-grade'),
  rankingVariants: [['classico-grade', '4×4'], ['classico-grade-5', '5×5'], ['classico-grade-6', '6×6']],
  globalRanking: true,
  // pede a grade ao servidor para a partida valer no ranking global
  prepare: (opts) => startOnline('classico-grade', { variante: opts.size || '4' }),
  scoring: true,
  practice: true,
  rules: [
    'Ligue letras vizinhas (horizontal, vertical ou diagonal) para formar palavras de 3+ letras.',
    'Cada peça só pode ser usada uma vez por palavra.',
    'Arraste o dedo/mouse, toque peça por peça ou digite no teclado e aperte Enter.',
  ],
  start(root, api, opts = {}) {
    const practice = !!opts.practice;
    const online = practice ? null : opts.online;
    const size = online ? online.size : Number(opts.size) || 4;
    const { grid, words } = online
      ? { grid: online.grid, words: solve(online.grid, online.size) }
      : makeGrid(createRng(), size, { minWords: { 4: 35, 5: 90, 6: 150 }[size], tries: size === 6 ? 25 : 60 });
    const found = new Set();
    const paths = {};
    const items = []; // para a revelação animada do fim
    let score = 0;

    const top = hud([['time', practice ? 'Treino' : 'Tempo'], ['score', 'Pontos'], ['count', 'Palavras']]);
    const panel = foundPanel();
    const goals = createGoals(size);
    let longest = 0;
    const wg = createWordGrid({
      size,
      letters: grid,
      async onSubmit(w, path) {
        if (w.length < 3) return { ok: false };
        if (found.has(w)) return { dup: true };
        const v = await confirmWord(root, w, () => ended);
        if (!v.ok) return { ok: false };
        if (found.has(w)) return { dup: true };
        found.add(w);
        paths[w] = path;
        const pts = wordPoints(w);
        score += pts;
        panel.add(w, pts, v.ai);
        items.push({ label: w, pts, ai: v.ai });
        top.set('score', score);
        top.set('count', found.size);
        longest = Math.max(longest, w.length);
        goals.update({ words: found.size, longest, score });
        return { ok: true, pts };
      },
    });
    top.set('score', 0);
    top.set('count', 0);

    const timer = createTimer({
      seconds: practice ? null : 180,
      onTick: (r, el) => top.set('time', fmtTime(practice ? el : r)),
      onEnd: finish,
    });

    let ended = false;
    function finish() {
      if (ended) return;
      ended = true;
      timer.stop();
      wg.disable();
      api.end({
        score,
        revealItems: items,
        ranked: practice ? false : undefined,
        summary: [['Metas', `${goals.done}/${goals.total}`], ['Palavras', found.size], ['Maior encontrada', longestWord([...found], false)?.toUpperCase() || '—'], ['Maior da grade', longestWord(words)?.toUpperCase() || '—']],
        longest: { found: longestWord([...found], false), possible: longestWord(words) },
        extra: missedWords(words, found, 40, grid, size),
        online: online && { ticket: online.ticket, palavras: [...found].map((w) => ({ w, path: paths[w] })) },
      });
    }

    const hintBtn = h('button', { class: 'btn ghost small', onclick: () => {
      if (giveHint(root, wg, words, found, size) && !practice) timer.add(-10);
    } }, practice ? 'Dica' : 'Dica (−10 s)');
    root.append(
      top.el,
      goals.el,
      h('div', { class: 'play-area' }, wg.el),
      h('div', { class: 'row-actions center game-foot' }, hintBtn, h('button', { class: 'btn ghost small', onclick: finish }, 'Encerrar'))
    );
    return () => { timer.stop(); wg.destroy(); };
  },
};
