// Revelação "tanques" das partidas de grade em grupo.
// Um tanque pequeno no alto guarda todas as palavras da rodada: a parte azul são as
// repetidas (achadas por 2+ pessoas) e a dourada, as únicas. As palavras vão caindo
// nos tanques dos jogadores: primeiro as repetidas (a mesma palavra cai para todos que
// acharam), depois as únicas, alternando entre os jogadores. O nível de cada tanque
// sobe com os pontos; no fim, o maior tanque vence.
import { h } from '../core/ui.js';
import { play } from '../core/sound.js';
import { icon } from '../core/icons.js';
import { delays } from './reveal.js';

// Monta a fila de quedas: repetidas (menor → maior), únicas alternando, bônus no fim.
export function buildDrops(r, playerIds) {
  const byWord = new Map();
  for (const [id, d] of Object.entries(r.players || {})) {
    for (const w of d.words || []) {
      const e = byWord.get(w.w) || { label: w.w.toUpperCase(), len: w.w.length, gains: [] };
      e.gains.push({ id, pts: w.pts });
      byWord.set(w.w, e);
    }
  }
  const all = [...byWord.values()].map((e) => ({ ...e, pts: Math.max(...e.gains.map((g) => g.pts)) }));
  const asc = (a, b) => a.pts - b.pts || a.len - b.len || a.label.localeCompare(b.label);
  const shared = all.filter((e) => e.gains.length > 1).sort(asc).map((e) => ({ ...e, kind: 'shared' }));
  const queues = playerIds.map((id) => all.filter((e) => e.gains.length === 1 && e.gains[0].id === id).sort(asc));
  const unique = [];
  for (let k = 0; queues.some((q) => k < q.length); k++) {
    for (const q of queues) if (q[k]) unique.push({ ...q[k], kind: 'unique' });
  }
  const bonus = (r.extras || []).map((x) => ({ label: x.label, len: 0, pts: x.pts, gains: [{ id: x.id, pts: x.pts }], kind: 'bonus' }));
  return [...shared, ...unique, ...bonus];
}

export function createTankReveal({ round, players, totals, you, hueOf, final, onDone, onPlayer = null }) {
  const ids = players.map((p) => p.id);
  const drops = buildDrops(round, ids);
  const state = Object.fromEntries(players.map((p) => [p.id, { total: (totals[p.id] ?? 0) - (round.scores?.[p.id] ?? 0), shared: 0, unique: 0, words: 0 }]));
  // nível máximo = maior pontuação da rodada (o tanque mais cheio chega a 100%)
  const roundPts = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const d of drops) for (const g of d.gains) roundPts[g.id] += g.pts;
  const maxPts = Math.max(1, ...Object.values(roundPts));
  const nShared = drops.filter((d) => d.kind === 'shared').length;
  const nUnique = drops.filter((d) => d.kind === 'unique').length;
  let leftShared = nShared, leftUnique = nUnique;

  const card = h('div', { class: 'reveal-card idle' }, h('div', { class: 'rc-word' }, final ? 'Quem vai encher mais o tanque?' : 'Enchendo os tanques…'));

  // tanque de origem
  const srcShared = h('div', { class: 'src-fill shared' });
  const srcUnique = h('div', { class: 'src-fill unique' });
  const srcSharedN = h('strong', {}, String(nShared));
  const srcUniqueN = h('strong', {}, String(nUnique));
  const source = h('div', { class: 'tr-source' },
    h('div', { class: 'src-tank' }, srcUnique, srcShared),
    h('div', { class: 'src-legend' },
      h('span', { class: 'lg shared' }, srcSharedN, nShared === 1 ? ' igual' : ' iguais'),
      h('span', { class: 'lg unique' }, srcUniqueN, nUnique === 1 ? ' única' : ' únicas')));

  // tanques dos jogadores
  const tanks = {};
  const row = h('div', { class: 'tr-players', style: `--n:${players.length}` });
  for (const p of players) {
    const fillS = h('div', { class: 'tr-fill shared' });
    const fillU = h('div', { class: 'tr-fill unique' });
    const level = h('span', { class: 'tr-level' }, '0');
    const tank = h('div', { class: 'tr-tank', style: `--hue:${hueOf(p.id)}` }, fillU, fillS, level);
    const total = h('strong', { class: 'tr-total' }, String(state[p.id].total));
    const words = h('span', { class: 'tr-words' }, '0 palavras');
    const el = h('div', { class: `tr-player ${p.id === you ? 'me' : ''}` },
      tank,
      h('span', { class: 'tr-avatar', style: `--hue:${hueOf(p.id)}` }, p.avatar),
      h('span', { class: 'tr-name', title: p.name }, p.name),
      total, words);
    tanks[p.id] = { el, tank, fillS, fillU, level, total, words };
    row.append(el);
  }

  const stage = h('div', { class: 'tr-stage' }, source, row);
  const progress = h('div', { class: 'reveal-progress' }, h('div', { class: 'rp-fill' }));
  const skipBtn = h('button', { class: 'btn ghost small', onclick: () => finish(true) }, 'Pular');
  const el = h('div', { class: 'reveal tank-reveal' }, card, stage, progress, h('div', { class: 'row-actions center' }, skipBtn));

  function paintSource() {
    srcSharedN.textContent = String(leftShared);
    srcUniqueN.textContent = String(leftUnique);
    const tot = Math.max(1, nShared + nUnique);
    srcShared.style.height = `${(leftShared / tot) * 100}%`;
    srcUnique.style.height = `${(leftUnique / tot) * 100}%`;
  }

  function paintTank(id) {
    const s = state[id], t = tanks[id];
    t.fillS.style.height = `${(s.shared / maxPts) * 100}%`;
    t.fillU.style.height = `${(s.unique / maxPts) * 100}%`;
    t.level.textContent = String(s.shared + s.unique);
    t.total.textContent = String(s.total);
    t.words.textContent = `${s.words} ${s.words === 1 ? 'palavra' : 'palavras'}`;
  }

  function credit(d) {
    for (const g of d.gains) {
      const s = state[g.id];
      if (!s) continue;
      if (d.kind === 'shared') s.shared += g.pts; else s.unique += g.pts;
      s.total += g.pts;
      if (d.kind !== 'bonus') s.words += 1;
    }
    if (d.kind === 'shared') leftShared--;
    if (d.kind === 'unique') leftUnique--;
  }

  // a palavra sai do tanque de cima e cai em cada tanque de quem achou
  function fly(d, ms) {
    const sr = stage.getBoundingClientRect();
    const from = source.querySelector('.src-tank').getBoundingClientRect();
    const x0 = from.left + from.width / 2 - sr.left, y0 = from.bottom - sr.top - 8;
    let landed = 0;
    for (const g of d.gains) {
      const t = tanks[g.id];
      if (!t) continue;
      const to = t.tank.getBoundingClientRect();
      const x1 = to.left + to.width / 2 - sr.left, y1 = to.top - sr.top + 10;
      const chip = h('span', { class: `drop ${d.kind}`, style: `--hue:${hueOf(g.id)}` }, d.label, h('small', {}, `+${g.pts}`));
      stage.append(chip);
      const w = chip.offsetWidth;
      const dx = x1 - x0, mid = Math.min(y0, y1) - 40;
      const anim = chip.animate([
        { transform: `translate(${x0 - w / 2}px, ${y0}px) scale(.6)`, opacity: 0 },
        { transform: `translate(${x0 + dx * 0.35 - w / 2}px, ${mid}px) scale(1.05)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${x1 - w / 2}px, ${y1}px) scale(.8)`, opacity: 1, offset: 0.85 },
        { transform: `translate(${x1 - w / 2}px, ${y1 + 26}px) scale(.4)`, opacity: 0 },
      ], { duration: ms, easing: 'cubic-bezier(.3,.7,.4,1)' });
      const land = () => {
        chip.remove();
        t.tank.classList.remove('splash');
        void t.tank.offsetWidth;
        t.tank.classList.add('splash');
        if (++landed === 1) paintAll();
      };
      anim.onfinish = land;
      anim.oncancel = land;
    }
    if (!d.gains.length) paintAll();
  }
  const paintAll = () => { for (const id of ids) paintTank(id); };

  let i = 0, timer = null, done = false, phase = null;
  const waits = delays(drops.length).map((x) => Math.max(110, x));

  function show(d) {
    if (d.kind !== phase) {
      phase = d.kind;
      el.dataset.phase = phase;
    }
    const big = d.len >= 7 || d.pts >= 11;
    card.className = `reveal-card ${big ? 'big' : ''} ${d.kind}`;
    card.replaceChildren(
      h('div', { class: `rc-word ${d.label.length > 10 ? 'long' : ''}` }, d.label),
      h('div', { class: 'rc-meta' },
        h('span', { class: 'rc-kind' }, d.kind === 'shared' ? `igual · ${d.gains.length} acharam` : d.kind === 'unique' ? 'única' : 'bônus'),
        h('span', { class: 'rc-pts' }, `+${d.pts}`)));
    void card.offsetWidth;
    card.classList.add('pop');
  }

  function next() {
    if (i >= drops.length) { timer = setTimeout(() => finish(false), 700); return; }
    const d = drops[i];
    const wait = waits[i];
    if (drops.length - i <= 2 && drops.length > 3) {
      card.className = 'reveal-card suspense';
      card.replaceChildren(h('div', { class: 'rc-word' }, drops.length - i === 1 ? 'E a última…' : '…'));
    }
    timer = setTimeout(() => {
      show(d);
      credit(d);
      paintSource();
      fly(d, Math.min(900, Math.max(380, wait * 1.4)));
      if (wait >= 160 || i % 3 === 0) play(d.len >= 7 || d.pts >= 11 ? 'big' : d.kind === 'shared' ? 'tick' : 'good');
      progress.firstChild.style.width = `${((i + 1) / drops.length) * 100}%`;
      i++;
      next();
    }, wait);
  }

  function finish(skipped) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    for (const a of stage.getAnimations({ subtree: true })) a.finish();
    if (skipped) for (; i < drops.length; i++) credit(drops[i]);
    paintSource();
    paintAll();
    progress.firstChild.style.width = '100%';
    const order = players.slice().sort((a, b) => state[b.id].total - state[a.id].total || a.name.localeCompare(b.name));
    const leader = order[0];
    if (leader) {
      tanks[leader.id].el.classList.add('leader');
      tanks[leader.id].el.prepend(h('span', { class: 'tr-crown' }, icon('crown')));
    }
    card.className = 'reveal-card done';
    const label = leader ? `${leader.avatar} ${leader.name}` : 'Fim!';
    card.replaceChildren(
      h('div', { class: `rc-word ${[...label].length > 16 ? 'xlong' : [...label].length > 10 ? 'long' : ''}` }, label),
      h('div', { class: 'rc-meta' }, h('span', { class: 'rc-pts' }, final ? 'venceu a partida!' : 'lidera a partida!')));
    skipBtn.remove();
    // depois da animação, cada tanque vira um botão: mostra as palavras daquele jogador
    if (onPlayer) {
      for (const p of players) {
        const el = tanks[p.id].el;
        el.classList.add('clickable');
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.title = `Ver as palavras de ${p.name}`;
        el.addEventListener('click', () => onPlayer(p.id));
        el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onPlayer(p.id)));
      }
      stage.append(h('p', { class: 'hint tr-tip' }, 'Toque num tanque para ver as palavras de cada um.'));
    }
    play(final ? 'win' : 'end');
    setTimeout(() => onDone?.(), skipped ? 0 : 450);
  }

  paintSource();
  paintAll();
  if (!drops.length) setTimeout(() => finish(false), 600);
  else setTimeout(next, 900);
  return { el, skip: () => finish(true), destroy: () => { done = true; clearTimeout(timer); } };
}
