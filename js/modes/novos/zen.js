// MODO NOVO (solo) — Zen: sem relógio e sem ranking. Ache palavras no seu ritmo;
// quando quiser (ou quando achar metade das palavras conhecidas), vem uma grade nova.
import { h, hud, toast } from '../../core/ui.js';
import { createRng } from '../../core/rng.js';
import { makeGrid, wordPoints, longestWord } from '../../core/letters.js';
import { isCommon } from '../../core/dict.js';
import { createWordGrid } from '../../core/wordgrid.js';
import { foundPanel, confirmWord, missedWords } from '../shared-wordlist.js';
import { mascotSay } from '../../core/mascot.js';

export default {
  id: 'novo-zen',
  category: 'novo',
  name: 'Modo Zen',
  icon: '🍃',
  tagline: 'Sem relógio, sem pressa · grades sem fim',
  scoring: true,
  rules: [
    'Sem tempo e sem ranking: ache palavras no seu ritmo.',
    'Quando achar metade das palavras conhecidas da grade, vem uma grade nova sozinha.',
    'Ou toque em "Nova grade" quando quiser trocar.',
  ],
  start(root, api) {
    const rng = createRng();
    const size = 5;
    let grid, words, common, found;
    let score = 0, total = 0, grids = 0;
    const allFound = new Set();
    const items = [];
    const top = hud([['score', 'Pontos'], ['count', 'Palavras'], ['grids', 'Grades']]);
    const panel = foundPanel();
    const progress = h('div', { class: 'zen-progress' }, h('span'));
    const wg = createWordGrid({
      size,
      letters: Array(size * size).fill('a'),
      async onSubmit(w, path) {
        if (w.length < 3) return { ok: false };
        if (found.has(w)) return { dup: true };
        const v = await confirmWord(root, w);
        if (!v.ok) return { ok: false };
        found.add(w);
        allFound.add(w);
        const pts = wordPoints(w);
        score += pts; total++;
        panel.add(w, pts, v.ai);
        items.push({ label: w, pts });
        top.set('score', score);
        top.set('count', total);
        const got = common.filter((x) => found.has(x)).length;
        progress.firstChild.style.width = `${Math.min(100, (got / Math.max(1, Math.ceil(common.length / 2))) * 100)}%`;
        if (got >= Math.ceil(common.length / 2)) setTimeout(() => { toast(root, 'Grade completa! Lá vem outra.', 'good'); newGrid(); }, 600);
        return { ok: true, pts };
      },
    });
    function newGrid() {
      ({ grid, words } = makeGrid(rng, size, { minWords: 70, tries: 30 }));
      common = words.filter((w) => isCommon(w));
      found = new Set();
      grids++;
      wg.setLetters(grid, [...Array(size * size).keys()]);
      top.set('grids', grids);
      progress.firstChild.style.width = '0%';
      if (grids > 1) mascotSay('rain');
    }
    newGrid();
    top.set('score', 0);
    top.set('count', 0);
    const finish = () => api.end({
      score,
      ranked: false,
      revealItems: items,
      summary: [['Palavras', total], ['Grades', grids], ['Maior palavra', longestWord([...allFound], false)?.toUpperCase() || '—']],
      extra: missedWords(words, found, 30, grid, size),
    });
    root.append(
      top.el,
      h('div', { class: 'zen-bar' }, h('span', { class: 'group-label' }, 'Até a próxima grade'), progress),
      h('div', { class: 'play-area' }, wg.el),
      h('div', { class: 'row-actions center game-foot' },
        h('button', { class: 'btn ghost small', onclick: newGrid }, 'Nova grade'),
        h('button', { class: 'btn ghost small', onclick: finish }, 'Terminar')));
    return () => wg.destroy();
  },
};
