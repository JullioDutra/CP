// MODO NOVO — Sobrevivência
// Grade 5×5 viva: o relógio está sempre correndo e cada palavra devolve segundos.
// Palavras de 6+ letras "explodem": as peças usadas são trocadas por letras novas.
import { h, createTimer, fmtTime, toast, hud } from '../../core/ui.js';
import { createRng } from '../../core/rng.js';
import { makeGrid, wordPoints, randomLetter, randomVowel, VOWELS } from '../../core/letters.js';
import { createWordGrid } from '../../core/wordgrid.js';
import { foundPanel, confirmWord } from '../shared-wordlist.js';

const START = 60;
const SHUFFLE_COST = 10;

// Segundos ganhos por palavra: diminui conforme a partida avança (fica mais difícil).
export function timeGain(word, elapsed) {
  const base = 2 + word.length * 2;
  const factor = Math.max(0.35, 1 - elapsed / 300);
  return Math.round(base * factor);
}

export default {
  id: 'novo-sobrevivencia',
  category: 'novo',
  name: 'Sobrevivência',
  icon: '⏳',
  tagline: 'Grade 5×5 viva · o tempo é sua vida',
  rules: [
    `Você começa com ${START} segundos. Cada palavra devolve tempo (palavras maiores dão mais).`,
    'Quanto mais a partida dura, menos tempo cada palavra devolve.',
    'Palavras com 6+ letras explodem: as peças usadas viram letras novas.',
    `Travou? "Renovar grade" troca todas as letras por −${SHUFFLE_COST}s.`,
    'Pontos como na Grade Relâmpago, + 1 ponto a cada 10 s sobrevividos.',
  ],
  start(root, api) {
    const rng = createRng();
    const size = 5;
    const { grid } = makeGrid(rng, size, { minWords: 70 });
    const found = new Set();
    let score = 0;

    const top = hud([['time', 'Vida'], ['score', 'Pontos'], ['alive', 'Sobrevivido']]);
    top.set('score', 0);
    const panel = foundPanel();

    function refill(letters, indexes) {
      const next = letters.slice();
      for (const i of indexes) next[i] = randomLetter(rng);
      const vowels = next.filter((l) => VOWELS.has(l)).length;
      if (vowels < Math.round(next.length * 0.32)) {
        for (const i of indexes) if (!VOWELS.has(next[i])) { next[i] = randomVowel(rng); break; }
      }
      return next;
    }

    const wg = createWordGrid({
      size,
      letters: grid,
      async onSubmit(w, path) {
        if (w.length < 3) { toast(root, 'Mínimo 3 letras', 'bad'); return { ok: false }; }
        if (found.has(w)) { toast(root, 'Já usada', 'dup'); return { dup: true }; }
        const v = await confirmWord(root, w, () => ended);
        if (!v.ok) return { ok: false };
        if (found.has(w)) return { dup: true };
        found.add(w);
        const pts = wordPoints(w);
        const gain = timeGain(w, timer.elapsed);
        score += pts;
        timer.add(gain);
        panel.add(w, pts, v.ai);
        top.set('score', score);
        toast(root, `+${pts} pts · +${gain}s`, 'good');
        if (w.length >= 6 && path) {
          setTimeout(() => wg.setLetters(refill(wg.letters, path), path), 250);
          toast(root, 'Explosão de letras!', 'good');
        }
        return { ok: true };
      },
    });

    const timer = createTimer({
      seconds: START,
      onTick: (r, el) => {
        top.set('time', fmtTime(r));
        top.set('alive', fmtTime(el));
        top.el.classList.toggle('danger', r < 10);
      },
      onEnd: finish,
    });

    const shuffleBtn = h('button', {
      class: 'btn ghost',
      onclick: () => {
        if (timer.remaining <= SHUFFLE_COST + 1) { toast(root, 'Sem tempo para renovar', 'bad'); return; }
        timer.add(-SHUFFLE_COST);
        const all = [...Array(size * size).keys()];
        wg.setLetters(makeGrid(rng, size, { minWords: 60, tries: 15 }).grid, all);
      },
    }, `Renovar grade (−${SHUFFLE_COST}s)`);

    let ended = false;
    function finish() {
      if (ended) return;
      ended = true;
      timer.stop();
      wg.disable();
      const survived = Math.floor(timer.elapsed);
      const bonus = Math.floor(survived / 10);
      score += bonus;
      api.end({
        score,
        summary: [['Sobreviveu', fmtTime(survived)], ['Palavras', found.size], ['Bônus de sobrevivência', bonus]],
      });
    }

    root.append(
      top.el,
      h('div', { class: 'play-area' }, wg.el, panel.el),
      h('div', { class: 'row-actions' }, shuffleBtn, h('button', { class: 'btn ghost', onclick: finish }, 'Encerrar'))
    );
    return () => { timer.stop(); wg.destroy(); };
  },
};
