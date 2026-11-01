// Efeitos sonoros sintetizados (Web Audio) — sem arquivos de áudio.
const KEY = 'trama.muted';
let ctx = null;
let muted = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
const listeners = new Set();

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, { type = 'sine', vol = 0.15, slide = 0 } = {}) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  good: () => { tone(660, 0, 0.09); tone(990, 0.07, 0.14); },
  big: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.06, 0.16, { vol: 0.13 })); },
  bad: () => tone(180, 0, 0.18, { type: 'square', vol: 0.06, slide: 0.7 }),
  dup: () => { tone(440, 0, 0.08, { type: 'triangle' }); tone(440, 0.1, 0.08, { type: 'triangle' }); },
  tick: () => tone(1200, 0, 0.04, { type: 'square', vol: 0.04 }),
  count: () => tone(520, 0, 0.12, { type: 'triangle', vol: 0.12 }),
  go: () => tone(880, 0, 0.3, { type: 'triangle', vol: 0.14 }),
  end: () => { [784, 659, 523].forEach((f, i) => tone(f, i * 0.12, 0.2, { type: 'triangle', vol: 0.12 })); },
  win: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.2, { vol: 0.13 })); },
  steal: () => tone(300, 0, 0.25, { type: 'sawtooth', vol: 0.05, slide: 1.8 }),
};

export function play(name) {
  if (muted) return;
  try { SOUNDS[name]?.(); } catch { /* áudio indisponível */ }
}

export const isMuted = () => muted;

export function setMuted(m) {
  muted = !!m;
  try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* ignore */ }
  listeners.forEach((fn) => fn(muted));
}

// Botão 🔊/🔇 reutilizável.
export function muteButton(h) {
  const btn = h('button', { class: 'btn ghost small mute', type: 'button', 'aria-label': 'Som', onclick: () => { setMuted(!muted); if (!muted) play('good'); } });
  const paint = () => (btn.textContent = muted ? '🔇' : '🔊');
  paint();
  listeners.add(paint);
  return btn;
}
