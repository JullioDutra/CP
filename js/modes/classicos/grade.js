// MODO CLÁSSICO — Grade Relâmpago
// Grade 4×4, 3 minutos. Ligue letras vizinhas (inclusive na diagonal) para formar palavras.
import { h, createTimer, fmtTime, toast, hud } from '../../core/ui.js';
import { createRng } from '../../core/rng.js';
import { makeGrid, wordPoints } from '../../core/letters.js';
import { isWord } from '../../core/dict.js';
import { createWordGrid } from '../../core/wordgrid.js';
import { foundPanel, missedWords } from '../shared-wordlist.js';

export default {
  id: 'classico-grade',
  category: 'classico',
  name: 'Grade Relâmpago',
  icon: '⚡',
  tagline: 'Grade 4×4 · 3 minutos',
  rules: [
    'Ligue letras vizinhas (horizontal, vertical ou diagonal) para formar palavras de 3+ letras.',
    'Cada peça só pode ser usada uma vez por palavra.',
    'Pontos (mínimo 3 letras): 3 = 1 · 4 = 2 · 5 = 4 · 6 = 7 · 7 = 11 · 8 = 16 · 9 = 22 · cada letra a mais +7.',
    'Arraste o dedo/mouse, toque peça por peça ou digite no teclado e aperte Enter.',
  ],
  start(root, api) {
    const rng = createRng();
    const { grid, words } = makeGrid(rng, 4, { minWords: 35 });
    const found = new Set();
    let score = 0;

    const top = hud([['time', 'Tempo'], ['score', 'Pontos'], ['count', 'Palavras']]);
    const panel = foundPanel();
    const wg = createWordGrid({
      size: 4,
      letters: grid,
      onSubmit(w) {
        if (w.length < 3) { toast(root, 'Mínimo 3 letras', 'bad'); return { ok: false }; }
        if (found.has(w)) { toast(root, 'Já encontrada', 'dup'); return { dup: true }; }
        if (!isWord(w)) { toast(root, `${w.toUpperCase()} não está no dicionário`, 'bad'); return { ok: false }; }
        found.add(w);
        const pts = wordPoints(w);
        score += pts;
        panel.add(w, pts);
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

    function finish() {
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
