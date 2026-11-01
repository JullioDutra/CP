// Revelação animada do fim da rodada: as palavras aparecem da menor para a maior
// e as barras de cada jogador sobem (e trocam de lugar) conforme os pontos entram.
// Começa rápido e vai desacelerando, com suspense nas maiores palavras.
import { h } from '../core/ui.js';
import { normalize } from '../core/dict.js';
import { play } from '../core/sound.js';

// Lista de "eventos" (palavra + quem ganhou pontos), do menor para o maior.
export function buildEvents(r) {
  if (r.type === 'grade') {
    const map = new Map();
    for (const [id, d] of Object.entries(r.players || {})) {
      for (const w of d.words) {
        const e = map.get(w.w) || { label: w.w.toUpperCase(), len: w.w.length, gains: [], ai: false };
        e.gains.push({ id, pts: w.pts, words: 1 });
        e.ai ||= !!w.ai;
        map.set(w.w, e);
      }
    }
    return [...map.values()]
      .map((e) => ({ ...e, pts: Math.max(...e.gains.map((g) => g.pts)) }))
      .sort((a, b) => a.pts - b.pts || a.len - b.len || a.label.localeCompare(b.label));
  }
  if (r.type === 'wordsearch') {
    return r.words
      .filter((w) => w.by)
      .map((w) => {
        const len = normalize(w.display).length;
        return { label: w.display.toUpperCase(), len, pts: len * 10, gains: [{ id: w.by, pts: len * 10, words: 1 }] };
      })
      .sort((a, b) => a.pts - b.pts || a.label.localeCompare(b.label));
  }
  if (r.type === 'sudoku') {
    return Object.entries(r.players || {})
      .map(([id, d]) => ({ label: d.done ? `Terminou em ${d.place}º` : `${d.filled} números certos`, len: 0, pts: d.score, gains: [{ id, pts: d.score, words: d.filled }], playerLabel: true }))
      .sort((a, b) => a.pts - b.pts);
  }
  return [];
}

// Pausa antes de cada evento: rápido no começo, devagar no fim (suspense).
// A duração total cabe num orçamento (6–16 s + suspense), seja qual for o número de palavras.
export function delays(n) {
  if (!n) return [];
  const budget = Math.min(16000, Math.max(6000, 4000 + n * 110));
  const weights = Array.from({ length: n }, (_, i) => 1 + 6 * Math.pow(n > 1 ? i / (n - 1) : 1, 3));
  const k = budget / weights.reduce((a, b) => a + b, 0);
  return weights.map((w, i) => {
    let d = Math.max(70, Math.min(1400, w * k));
    const fromEnd = n - 1 - i;
    if (fromEnd === 2) d += 500;
    if (fromEnd === 1) d += 900;
    if (fromEnd === 0) d += 1500;
    return Math.round(d);
  });
}

/**
 * @param {object} o
 * @param {object} o.round   lastRound (estado do servidor)
 * @param {{id, name, avatar, hue}[]} o.players
 * @param {Object<string, number>} o.totals   total de cada jogador depois da rodada
 * @param {string} o.you
 * @param {(id:string)=>number} o.hueOf
 * @param {boolean} o.final
 * @param {() => void} o.onDone
 */
export function createReveal({ round, players, totals, you, hueOf, final, onDone }) {
  const events = buildEvents(round);
  const countWords = round.type !== 'sudoku';
  const state = Object.fromEntries(players.map((p) => [p.id, { score: (totals[p.id] ?? 0) - (round.scores?.[p.id] ?? 0), words: 0 }]));
  const rowH = 58;

  const card = h('div', { class: 'reveal-card idle' }, h('div', { class: 'rc-word' }, final ? 'Quem vai vencer?' : 'Contando os pontos…'));
  const board = h('div', { class: 'race', style: `height:${players.length * rowH}px` });
  const progress = h('div', { class: 'reveal-progress' }, h('div', { class: 'rp-fill' }));
  const rows = {};
  for (const p of players) {
    const score = h('strong', { class: 'race-score' }, String(state[p.id].score));
    const words = h('span', { class: 'race-words' }, countWords ? '0 palavras' : '');
    const bar = h('div', { class: 'race-bar', style: `--hue:${hueOf(p.id)}` });
    const pos = h('span', { class: 'race-pos' }, '');
    const el = h('div', { class: `race-row2 ${p.id === you ? 'me' : ''}` },
      pos,
      h('span', { class: 'race-avatar', style: `--hue:${hueOf(p.id)}` }, p.avatar),
      h('div', { class: 'race-main' },
        h('div', { class: 'race-name' }, h('span', {}, p.name), words),
        h('div', { class: 'race-track2' }, bar)),
      score);
    rows[p.id] = { el, score, words, bar, pos };
    board.append(el);
  }

  const skipBtn = h('button', { class: 'btn ghost small', onclick: () => finish(true) }, 'Pular ⏭');
  const el = h('div', { class: 'reveal' }, card, board, progress, h('div', { class: 'row-actions center' }, skipBtn));

  function layout(animateFrom) {
    const order = players.slice().sort((a, b) => state[b.id].score - state[a.id].score || a.name.localeCompare(b.name));
    const max = Math.max(1, ...order.map((p) => state[p.id].score));
    order.forEach((p, i) => {
      const r = rows[p.id];
      r.el.style.transform = `translateY(${i * rowH}px)`;
      r.bar.style.width = `${Math.max(2, (state[p.id].score / max) * 100)}%`;
      r.pos.textContent = `${i + 1}º`;
      r.words.textContent = countWords ? `${state[p.id].words} ${state[p.id].words === 1 ? 'palavra' : 'palavras'}` : '';
      countUp(r.score, animateFrom?.[p.id] ?? state[p.id].score, state[p.id].score);
    });
  }

  function countUp(node, from, to) {
    if (from === to) { node.textContent = String(to); return; }
    const start = performance.now();
    const dur = 350;
    const step = (now) => {
      const k = Math.min(1, (now - start) / dur);
      node.textContent = String(Math.round(from + (to - from) * k));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function apply(e, i, silent = false) {
    const before = Object.fromEntries(players.map((p) => [p.id, state[p.id].score]));
    for (const g of e.gains) {
      if (!state[g.id]) continue;
      state[g.id].score += g.pts;
      state[g.id].words += g.words;
    }
    if (silent) return;
    const big = e.len >= 7 || e.pts >= 11;
    const who = e.gains.map((g) => players.find((p) => p.id === g.id)).filter(Boolean);
    card.className = `reveal-card ${big ? 'big' : ''}`;
    card.replaceChildren(
      h('div', { class: 'rc-word' }, e.playerLabel ? `${who[0]?.avatar} ${who[0]?.name}` : e.label, e.ai ? ' ✨' : ''),
      h('div', { class: 'rc-meta' },
        h('span', { class: 'rc-pts' }, e.playerLabel ? e.label : `+${e.pts}`),
        e.playerLabel ? '' : h('span', { class: 'rc-who' }, who.map((p) => h('span', { class: 'rc-av', style: `--hue:${hueOf(p.id)}`, title: p.name }, p.avatar))),
        e.gains.length > 1 ? h('span', { class: 'by-count' }, `👥${e.gains.length}`) : ''));
    void card.offsetWidth; // reinicia a animação do cartão
    card.classList.add('pop');
    progress.firstChild.style.width = `${((i + 1) / events.length) * 100}%`;
    for (const g of e.gains) rows[g.id]?.el.classList.remove('flash'), void rows[g.id]?.el.offsetWidth, rows[g.id]?.el.classList.add('flash');
    play(big ? 'big' : 'tick');
    layout(before);
  }

  let timer = null;
  let i = 0;
  let done = false;
  const waits = delays(events.length);

  function next() {
    if (i >= events.length) { finish(false); return; }
    // suspense: antes das 3 últimas, o cartão "pisca" esperando
    if (events.length - i <= 3 && events.length > 3) {
      card.className = 'reveal-card suspense';
      card.replaceChildren(h('div', { class: 'rc-word' }, events.length - i === 1 ? 'E a maior palavra é…' : '…'));
    }
    timer = setTimeout(() => { apply(events[i], i); i++; next(); }, waits[i]);
  }

  function finish(skipped) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (skipped) {
      for (; i < events.length; i++) apply(events[i], i, true);
      layout();
      progress.firstChild.style.width = '100%';
    }
    const order = players.slice().sort((a, b) => state[b.id].score - state[a.id].score);
    const leader = order[0];
    card.className = 'reveal-card done';
    card.replaceChildren(
      h('div', { class: 'rc-word' }, leader ? `${leader.avatar} ${leader.name}` : 'Fim!'),
      h('div', { class: 'rc-meta' }, h('span', { class: 'rc-pts' }, final ? '🏆 venceu a partida!' : 'lidera a partida!')));
    if (leader) rows[leader.id].el.classList.add('leader');
    skipBtn.remove();
    play(final ? 'win' : 'end');
    onDone?.();
  }

  layout();
  if (!events.length) setTimeout(() => finish(false), 600);
  else setTimeout(next, 700);
  return { el, skip: () => finish(true), destroy: () => { done = true; clearTimeout(timer); } };
}
