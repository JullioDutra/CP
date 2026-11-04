// Peças de tela dos modos de grade com regra extra (em grupo e no solo):
// medidor do combo, letra da vez e contagem da chuva. `now` é o relógio usado
// (servidor no modo em grupo; tempo de partida no solo).
import { h } from './ui.js';
import { icon } from './icons.js';
import { play, comboNote, rainAmbience } from './sound.js';
import { mascotSay } from './mascot.js';
import { COMBO, comboMult, hotLetterAt } from './multimodes.js';

// Medidor do combo (Grade Combo): sobe a cada palavra seguida e esvazia em 7 s.
export function comboMeter(now = Date.now) {
  const label = h('strong', { class: 'cm-mult' }, '×1');
  const count = h('span', { class: 'cm-count' }, 'Ache palavras em sequência!');
  const bar = h('div', { class: 'cm-bar' }, h('span', {}));
  const el = h('div', { class: 'combo-meter' }, h('div', { class: 'cm-top' }, icon('flame'), label, count), bar);
  let timer = null;
  const set = (combo, leftMs) => {
    const mult = comboMult(Math.max(1, combo));
    label.textContent = `×${String(mult).replace('.', ',')}`;
    count.textContent = combo > 1 ? `${combo} seguidas` : 'Ache palavras em sequência!';
    el.dataset.level = String(Math.min(4, Math.floor((mult - 1) * 2)));
    const fill = bar.firstChild;
    fill.style.transition = 'none';
    fill.style.width = leftMs > 0 ? `${(leftMs / COMBO.windowMs) * 100}%` : '0%';
    void fill.offsetWidth;
    if (leftMs > 0) { fill.style.transition = `width ${leftMs}ms linear`; fill.style.width = '0%'; }
    clearTimeout(timer);
    if (leftMs > 0) timer = setTimeout(() => { count.textContent = 'Combo perdido'; label.textContent = '×1'; el.dataset.level = '0'; }, leftMs);
  };
  return {
    el,
    hit(combo) {
      set(combo, COMBO.windowMs);
      comboNote(combo);
      el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    },
    sync({ count: c, lastAt }) {
      const left = lastAt ? lastAt + COMBO.windowMs - now() : 0;
      if (left > 0 && !el.dataset.synced) { el.dataset.synced = '1'; set(c, left); }
    },
  };
}

// Letra da Vez: mostra a letra quente, quanto falta para trocar e faz as peças brilharem.
export function hotLetterUi(play, gridEl, now = Date.now) {
  const letterEl = h('strong', { class: 'hl-letter' }, '');
  const ring = h('span', { class: 'hl-ring' });
  const nextEl = h('span', { class: 'hl-next' }, '');
  const el = h('div', { class: 'hot-letter' }, h('span', { class: 'hl-label' }, 'Letra da vez'), h('span', { class: 'hl-chip' }, ring, letterEl), h('span', { class: 'hl-hint' }, '×2 por letra', nextEl));
  let current = null;
  const tick = () => {
    const cur = hotLetterAt(play.hot, now());
    if (!cur) return;
    const left = Math.max(0, cur.endsAt - now());
    ring.style.setProperty('--p', String(left / play.hot.everyMs));
    nextEl.textContent = ` · troca em ${Math.ceil(left / 1000)}s`;
    if (cur.letter !== current) {
      current = cur.letter;
      letterEl.textContent = current.toUpperCase();
      el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap');
      gridEl.querySelectorAll('.tile').forEach((t, i) => t.classList.toggle('hot', play.grid[Number(t.dataset.i ?? i)] === current));
      if (current) mascotSay('hot', { letter: current.toUpperCase() });
    }
  };
  tick();
  const iv = setInterval(tick, 250);
  gridEl.addEventListener('rendered', () => gridEl.querySelectorAll('.tile').forEach((t, i) => t.classList.toggle('hot', play.grid[Number(t.dataset.i ?? i)] === current)));
  return { el, destroy: () => clearInterval(iv) };
}


// Chuva de Letras: quanto falta para a próxima chuva.
export function rainChip(info, now = Date.now) {
  const left = h('strong', {}, '');
  const el = h('div', { class: 'rain-chip' }, icon('rain'), h('span', {}, 'Próxima chuva em '), left, h('span', { class: 'rc-hint' }, ' · letras novas valem ×2'));
  let nextAt = info.rain?.nextAt ?? null;
  const tick = () => {
    if (nextAt == null) { left.textContent = '—'; el.classList.add('done'); return; }
    left.textContent = `${Math.max(0, Math.ceil((nextAt - now()) / 1000))}s`;
  };
  tick();
  const iv = setInterval(tick, 250);
  const stopRain = rainAmbience(); // chuvinha de fundo enquanto o modo durar
  return {
    el,
    sync(r) { nextAt = r.nextAt; tick(); },
    fell() {
      el.classList.remove('pour'); void el.offsetWidth; el.classList.add('pour');
      play('rain'); mascotSay('rain');
    },
    destroy: () => { clearInterval(iv); stopRain(); },
  };
}
