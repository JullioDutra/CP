// MODO NOVO — Sobrevivência
// Grade 5×5 viva: o relógio está sempre correndo e cada palavra devolve segundos.
// Palavras de 6+ letras "explodem": as peças usadas são trocadas por letras novas.
import { h, createTimer, fmtTime, toast, hud } from '../../core/ui.js';
import { wordPoints } from '../../core/letters.js';
import { createWordGrid } from '../../core/wordgrid.js';
import { foundPanel, confirmWord } from '../shared-wordlist.js';
import { startOnline } from '../../core/online-solo.js';
import { timeGain, setupSurvival, survivalRefill, survivalRenew, newSeed, SURV_START as START, SURV_SHUFFLE_COST as SHUFFLE_COST } from '../../core/solo-verify.js';

export { timeGain };

export default {
  id: 'novo-sobrevivencia',
  category: 'novo',
  name: 'Sobrevivência',
  icon: '⏳',
  tagline: 'Grade 5×5 viva · o tempo é sua vida',
  scoring: true,
  globalRanking: true,
  globalVariant: () => '5',
  // pede a semente ao servidor para a partida valer no ranking global
  prepare: () => startOnline('novo-sobrevivencia', { variante: '5' }),
  rules: [
    `Você começa com ${START} segundos. Cada palavra devolve tempo (palavras maiores dão mais).`,
    'Quanto mais a partida dura, menos tempo cada palavra devolve.',
    'Palavras com 6+ letras explodem: as peças usadas viram letras novas.',
    `Travou? "Renovar grade" troca todas as letras por −${SHUFFLE_COST}s.`,
    'Pontos como na Grade Relâmpago, + 1 ponto a cada 10 s sobrevividos.',
  ],
  start(root, api, opts = {}) {
    const online = opts.online?.seed != null ? opts.online : null;
    const size = 5;
    const { rng, grid } = setupSurvival(online ? online.seed : newSeed());
    const events = []; // registro da partida (o servidor refaz e confere)
    const found = new Set();
    const items = [];
    let score = 0;

    const top = hud([['time', 'Vida'], ['score', 'Pontos'], ['alive', 'Sobrevivido']]);
    top.set('score', 0);
    const panel = foundPanel();

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
        const pts = wordPoints(w);
        const t = timer.elapsed;
        const gain = timeGain(w, t);
        events.push({ w, path: path ? path.slice() : null, t: Math.round(t * 1000) / 1000 });
        score += pts;
        timer.add(gain);
        panel.add(w, pts, v.ai);
        items.push({ label: w, pts, ai: v.ai });
        top.set('score', score);
        toast(root, `+${pts} pts · +${gain}s`, 'good');
        if (w.length >= 6 && path) {
          // sorteia as letras novas já (mesma ordem do servidor) e mostra logo depois do brilho
          const next = survivalRefill(rng, wg.letters, path);
          setTimeout(() => wg.setLetters(next, path), 250);
          toast(root, 'Explosão de letras!', 'good');
        }
        return { ok: true, pts };
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
        events.push({ renew: true, t: Math.round(timer.elapsed * 1000) / 1000 });
        timer.add(-SHUFFLE_COST);
        const all = [...Array(size * size).keys()];
        wg.setLetters(survivalRenew(rng), all);
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
      if (bonus) items.push({ label: 'Bônus de tempo', pts: bonus });
      api.end({
        score,
        revealItems: items,
        summary: [['Sobreviveu', fmtTime(survived)], ['Palavras', found.size], ['Bônus de sobrevivência', bonus]],
        online: online && { ticket: online.ticket, log: { events, survived } },
      });
    }

    root.append(
      top.el,
      h('div', { class: 'play-area' }, wg.el),
      h('div', { class: 'row-actions center game-foot' }, shuffleBtn, h('button', { class: 'btn ghost small', onclick: finish }, 'Encerrar'))
    );
    return () => { timer.stop(); wg.destroy(); };
  },
};
