// MODOS NOVOS (solo) — Grade Combo, Letra da Vez e Chuva de Letras.
// Mesma grade 5×5 da Grade Relâmpago com uma regra extra. Valem para o ranking global:
// o servidor manda a semente e, no fim, refaz a partida com o registro de palavras (solo-verify.js).
import { h, createTimer, fmtTime, toast, hud } from '../../core/ui.js';
import { solve, longestWord } from '../../core/letters.js';
import { createWordGrid } from '../../core/wordgrid.js';
import { foundPanel, missedWords, confirmWord } from '../shared-wordlist.js';
import { startOnline } from '../../core/online-solo.js';
import { setupGradeVariant, variantGrid, variantPoints, newSeed, VARIANT_TIME } from '../../core/solo-verify.js';
import { rainGrid, rainStep, freshCells, RAIN } from '../../core/rain.js';
import { comboMeter, hotLetterUi, rainChip } from '../../core/grade-extras.js';
import { MULTI_MODES } from '../../core/multimodes.js';

function variantMode({ id, kind, group, tagline }) {
  const g = MULTI_MODES[group];
  return {
    id,
    category: 'novo',
    name: g.name,
    icon: g.icon,
    tagline,
    scoring: true,
    globalRanking: true,
    globalVariant: () => '5',
    prepare: () => startOnline(id, { variante: '5' }),
    rules: [...g.rules.filter((r) => !/Várias pessoas|Todos recebem/.test(r)), 'Grade 5×5 · 2 minutos. Ligue letras vizinhas (inclusive na diagonal), mínimo de 3 letras.'],
    start(root, api, opts = {}) {
      const online = opts.online?.seed != null ? opts.online : null;
      const setup = setupGradeVariant(online ? online.seed : newSeed(), kind);
      const size = setup.size;
      const t0 = performance.now();
      const now = () => performance.now() - t0; // ms desde o início (mesma base do servidor)
      const found = new Set();
      const events = []; // registro: { w, path, t }
      const items = [];
      const st = {}; // estado do combo
      let score = 0;
      let possible = new Set(solve(setup.grid, size));
      if (setup.drops) for (let k = 1; k <= setup.drops.length; k++) for (const w of solve(rainGrid(setup.grid, setup.drops, k), size)) possible.add(w);
      possible = [...possible];

      const top = hud([['time', 'Tempo'], ['score', 'Pontos'], ['count', 'Palavras']]);
      const panel = foundPanel();
      const wg = createWordGrid({
        size,
        letters: setup.grid,
        async onSubmit(w, path) {
          if (w.length < 3) return { ok: false };
          if (found.has(w)) return { dup: true };
          const t = now();
          const v = await confirmWord(root, w, () => ended);
          if (!v.ok || ended) return { ok: false };
          if (found.has(w)) return { dup: true };
          found.add(w);
          const r = variantPoints(setup, kind, w, path, t, st);
          events.push({ w, path: path ? path.slice() : null, t: Math.round(t) });
          score += r.pts;
          panel.add(w, r.pts, v.ai);
          items.push({ label: w, pts: r.pts });
          top.set('score', score);
          top.set('count', found.size);
          if (r.mult > 1) toast(root, `×${String(r.mult).replace('.', ',')}! +${r.pts}`, 'good');
          if (kind === 'combo') comboUi.hit(r.combo);
          return { ok: true, pts: r.pts, mult: r.mult, combo: r.combo };
        },
      });

      const comboUi = kind === 'combo' ? comboMeter(now) : null;
      const hotUi = kind === 'letra' ? hotLetterUi({ hot: setup.hot, grid: setup.grid }, wg.el, now) : null;
      // Chuva: a cada 20 s troca as peças sorteadas e marca as novas (×2)
      let step = 0;
      const rainInfo = () => ({ nextAt: step < (setup.drops?.length || 0) ? (step + 1) * RAIN.everyMs : null });
      const rainUi = kind === 'chuva' ? rainChip({ rain: rainInfo() }, now) : null;
      const rainIv = kind === 'chuva' ? setInterval(() => {
        const k = rainStep(now());
        if (k === step || k > setup.drops.length) return;
        const prev = wg.letters;
        step = k;
        const next = variantGrid(setup, now());
        wg.setLetters(next, next.map((l, i) => (l !== prev[i] ? i : -1)).filter((i) => i >= 0));
        wg.mark(freshCells(setup.drops, k), 'rain-new');
        rainUi.sync(rainInfo());
        rainUi.fell();
      }, 200) : null;

      top.set('score', 0);
      top.set('count', 0);
      const timer = createTimer({ seconds: VARIANT_TIME, onTick: (r) => top.set('time', fmtTime(r)), onEnd: finish });

      let ended = false;
      function finish() {
        if (ended) return;
        ended = true;
        timer.stop();
        clearInterval(rainIv);
        hotUi?.destroy();
        rainUi?.destroy();
        wg.disable();
        api.end({
          score,
          revealItems: items,
          summary: [['Palavras', found.size], ['Maior encontrada', longestWord([...found], false)?.toUpperCase() || '—'], ['Maior da grade', longestWord(possible)?.toUpperCase() || '—']],
          longest: { found: longestWord([...found], false), possible: longestWord(possible) },
          extra: missedWords(possible, found, 40, setup.drops ? Array.from({ length: setup.drops.length + 1 }, (_, k) => rainGrid(setup.grid, setup.drops, k)) : setup.grid, size),
          online: online && { ticket: online.ticket, log: { events } },
        });
      }

      root.append(
        top.el,
        comboUi?.el || '', hotUi?.el || '', rainUi?.el || '',
        h('div', { class: 'play-area' }, wg.el),
        h('div', { class: 'row-actions center game-foot' }, h('button', { class: 'btn ghost small', onclick: finish }, 'Encerrar'))
      );
      return () => { timer.stop(); clearInterval(rainIv); hotUi?.destroy(); rainUi?.destroy(); wg.destroy(); };
    },
  };
}

export const comboSolo = variantMode({ id: 'novo-combo', kind: 'combo', group: 'grupo-combo', tagline: 'Palavras seguidas multiplicam até ×3 · 2 min' });
export const letraSolo = variantMode({ id: 'novo-letra', kind: 'letra', group: 'grupo-letra', tagline: 'A letra quente vale ×2 · troca a cada 20 s' });
export const chuvaSolo = variantMode({ id: 'novo-chuva', kind: 'chuva', group: 'grupo-chuva', tagline: 'Letras novas caem a cada 20 s · valem ×2' });
