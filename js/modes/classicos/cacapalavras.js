// MODO CLÁSSICO — Caça-Palavras Temático
// Palavras escondidas numa grade 12×12, em 8 direções. 4 minutos.
import { h, createTimer, fmtTime, toast, hud } from '../../core/ui.js';
import { createRng } from '../../core/rng.js';
import { buildWordSearch, buildMixedSearch, attachSelection, matchPlaced, matchFree, WS_SIZE, MIX_EXTRA_MIN, MIX_EXTRA_PTS } from '../../core/wordsearch.js';
import { isCommon } from '../../core/dict.js';
import { TEMAS } from '../../../data/temas.js';
import { MISTURA } from '../../../data/mistura.js';

const SIZE = WS_SIZE;
const TIME = 240;

export { buildWordSearch };

export default {
  id: 'classico-cacapalavras',
  category: 'classico',
  name: 'Caça-Palavras',
  icon: '🔍',
  tagline: 'Grade 12×12 · tema surpresa ou Mistura · 4 min',
  options: { key: 'tema', label: 'Tema', choices: [['surpresa', 'Tema surpresa'], ['mistura', '🎲 Mistura (sem tema)']], default: 'surpresa' },
  rankingKey: (opts) => (opts.tema === 'mistura' ? 'classico-cacapalavras-mistura' : 'classico-cacapalavras'),
  rankingVariants: [['classico-cacapalavras', 'Tema'], ['classico-cacapalavras-mistura', 'Mistura']],
  rules: [
    'Tema surpresa: encontre as 10 palavras do tema, em linha reta (8 direções, até de trás para frente). Arraste do começo ao fim.',
    'Mistura: palavras de todo tipo, cruzadas umas nas outras — algumas dobram juntando horizontal e vertical. Arraste passando letra por letra.',
    'Na Mistura, outras palavras comuns de 5+ letras que você formar arrastando também valem pontos (extras)!',
    'Pontos: 10 por letra (extras: 4 por letra) + 2 por segundo restante se achar todas da lista.',
  ],
  start(root, api, opts = {}) {
    const rng = createRng();
    const mix = opts.tema === 'mistura';
    const temaNome = mix ? 'Mistura' : rng.pick(Object.keys(TEMAS));
    const { grid, placed } = mix ? buildMixedSearch(rng, rng.shuffle(MISTURA)) : buildWordSearch(rng, rng.shuffle(TEMAS[temaNome]));
    const extras = new Set();
    const foundIds = new Set();
    const items = [];
    let score = 0;

    const top = hud([['time', 'Tempo'], ['score', 'Pontos'], ['count', 'Achadas']]);
    top.set('score', 0);
    top.set('count', 0);

    const board = h('div', { class: 'board ws', style: `--n:${SIZE}` });
    const cells = grid.map((l, i) => h('div', { class: 'cell', 'data-i': i }, l.toUpperCase()));
    board.append(...cells);
    const listEl = h('ul', { class: 'ws-list' }, placed.map((p, k) => h('li', { 'data-k': k }, p.display.toUpperCase())));

    const extraList = h('ul', { class: 'ws-list extras' });
    const flash = (sel, cls) => sel.forEach((i) => { cells[i].classList.add(cls); setTimeout(() => cells[i].classList.remove(cls), 450); });
    const paint = (sel) => cells.forEach((c, i) => c.classList.toggle('sel', sel.includes(i)));

    attachSelection(board, { size: SIZE, mode: mix ? 'free' : 'line', onPaint: paint, onDone: (line) => {
      if (ended) return;
      const k = mix ? matchFree(placed, grid, line, (idx) => foundIds.has(idx)) : matchPlaced(placed, line, (idx) => foundIds.has(idx));
      if (k >= 0) {
        foundIds.add(k);
        const pts = placed[k].word.length * 10;
        score += pts;
        items.push({ label: placed[k].display, pts });
        const hue = (foundIds.size * 47) % 360;
        placed[k].cells.forEach((i) => { cells[i].classList.add('found'); cells[i].style.setProperty('--hue', hue); });
        listEl.querySelector(`[data-k="${k}"]`).classList.add('done');
        top.set('score', score);
        top.set('count', foundIds.size + extras.size);
        toast(root, `${placed[k].display.toUpperCase()} +${pts}`, 'good');
        if (foundIds.size === placed.length) finish(true);
        return;
      }
      const w = line.map((i) => grid[i]).join('');
      if (mix && w.length >= MIX_EXTRA_MIN && isCommon(w) && !extras.has(w) && !placed.some((p) => p.word === w)) {
        extras.add(w);
        const pts = w.length * MIX_EXTRA_PTS;
        score += pts;
        items.push({ label: w, pts });
        extraList.prepend(h('li', { class: 'done' }, w.toUpperCase(), h('small', {}, ` +${pts}`)));
        top.set('score', score);
        top.set('count', foundIds.size + extras.size);
        flash(line, 'good');
        toast(root, `Extra! ${w.toUpperCase()} +${pts}`, 'good');
      } else if (line.length > 2) flash(line, extras.has(w) || placed.some((p) => p.word === w) ? 'dup' : 'bad');
    } });

    const timer = createTimer({ seconds: TIME, onTick: (r) => top.set('time', fmtTime(r)), onEnd: () => finish(false) });

    let ended = false;
    function finish(all) {
      if (ended) return;
      ended = true;
      timer.stop();
      let bonus = 0;
      if (all) { bonus = Math.ceil(timer.remaining) * 2; score += bonus; items.push({ label: '⏱ Bônus', pts: bonus }); }
      placed.forEach((p, k) => { if (!foundIds.has(k)) p.cells.forEach((i) => cells[i].classList.add('reveal')); });
      board.classList.add('disabled');
      api.end({
        score,
        revealItems: items,
        summary: [['Tema', temaNome], ['Da lista', foundIds.size], ...(mix ? [['Extras', extras.size]] : []), ['Bônus de tempo', bonus]],
        extra: h('p', {}, 'Palavras não encontradas ficaram destacadas na grade.'),
      });
    }

    root.append(
      top.el,
      h('h2', { class: 'theme-title' }, mix ? '🎲 Mistura · sem tema' : `Tema: ${temaNome}`),
      h('div', { class: 'play-area' }, board, mix ? h('div', { class: 'side-col' }, listEl, h('h3', { class: 'extras-title' }, 'Extras'), extraList) : listEl),
      h('div', { class: 'row-actions' }, h('button', { class: 'btn ghost', onclick: () => finish(false) }, 'Encerrar partida'))
    );
    return () => timer.stop();
  },
};
