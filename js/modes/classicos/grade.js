// MODO CLÁSSICO — Grade Relâmpago
// Grade 4×4, 3 minutos. Ligue letras vizinhas (inclusive na diagonal) para formar palavras.
import { h, createTimer, fmtTime, toast, hud } from '../../core/ui.js';
import { createRng } from '../../core/rng.js';
import { makeGrid, wordPoints } from '../../core/letters.js';
import { createWordGrid } from '../../core/wordgrid.js';
import { foundPanel, missedWords, confirmWord } from '../shared-wordlist.js';

export default {
  id: 'classico-grade',
  category: 'classico',
  name: 'Grade Relâmpago',
  icon: '⚡',
  tagline: 'Grade 4×4, 5×5 ou 6×6 · 3 minutos',
  options: { key: 'size', label: 'Grade', choices: [['4', '4×4'], ['5', '5×5'], ['6', '6×6']], default: '4' },
  rankingKey: (opts) => (opts.size && opts.size !== '4' ? `classico-grade-${opts.size}` : 'classico-grade'),
  rankingVariants: [['classico-grade', '4×4'], ['classico-grade-5', '5×5'], ['classico-grade-6', '6×6']],
  rules: [
    'Ligue letras vizinhas (horizontal, vertical ou diagonal) para formar palavras de 3+ letras.',
    'Cada peça só pode ser usada uma vez por palavra.',
    'Pontos (mínimo 3 letras): 3 = 1 · 4 = 2 · 5 = 4 · 6 = 7 · 7 = 11 · 8 = 16 · 9 = 22 · cada letra a mais +7.',
    'Arraste o dedo/mouse, toque peça por peça ou digite no teclado e aperte Enter.',
  ],
  start(root, api, opts = {}) {
    const size = Number(opts.size) || 4;
    const rng = createRng();
    const { grid, words } = makeGrid(rng, size, { minWords: { 4: 35, 5: 90, 6: 150 }[size], tries: size === 6 ? 25 : 60 });
    const found = new Set();
    let score = 0;

    const top = hud([['time', 'Tempo'], ['score', 'Pontos'], ['count', 'Palavras']]);
    const panel = foundPanel();
    const wg = createWordGrid({
      size,
      letters: grid,
      async onSubmit(w) {
        if (w.length < 3) { toast(root, 'Mínimo 3 letras', 'bad'); return { ok: false }; }
        if (found.has(w)) { toast(root, 'Já encontrada', 'dup'); return { dup: true }; }
        const v = await confirmWord(root, w, () => ended);
        if (!v.ok) return { ok: false };
        if (found.has(w)) return { dup: true };
        found.add(w);
        const pts = wordPoints(w);
        score += pts;
        panel.add(w, pts, v.ai);
        top.set('score', score);
        top.set('count', `${found.size}/${words.length}`);
        toast(root, `+${pts}`, 'good');
        return { ok: true };
      },
    });
    top.set('score', 0);
    top.set('count', `0/${words.length}`);

    const timer = createTimer({
      seconds: 180,
      onTick: (r) => top.set('time', fmtTime(r)),
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
        summary: [['Palavras', found.size], ['Possíveis', words.length], ['Maior palavra', [...found].sort((a, b) => b.length - a.length)[0]?.toUpperCase() || '—']],
        extra: missedWords(words, found),
      });
    }

    root.append(
      top.el,
      h('div', { class: 'play-area' }, wg.el, panel.el),
      h('div', { class: 'row-actions' }, h('button', { class: 'btn ghost', onclick: finish }, 'Encerrar partida'))
    );
    return () => { timer.stop(); wg.destroy(); };
  },
};
