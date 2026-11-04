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
  // Chuva de Letras: gotas descendo
  rain: () => { [1320, 1100, 990, 1180, 880].forEach((f, i) => tone(f, i * 0.06, 0.07, { type: 'sine', vol: 0.07, slide: 0.6 })); },
  tick: () => tone(1200, 0, 0.04, { type: 'square', vol: 0.04 }),
  // fim de tempo: batida grave + bipe agudo (mais dramático)
  alarm: () => { tone(110, 0, 0.18, { type: 'sine', vol: 0.22, slide: 0.6 }); tone(1480, 0.02, 0.09, { type: 'square', vol: 0.05 }); },
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
  const btn = h('button', { class: 'btn ghost small icon-btn mute', type: 'button', 'aria-label': 'Ligar ou desligar o som', onclick: () => { setMuted(!muted); if (!muted) play('good'); } });
  const paint = () => {
    btn.replaceChildren(svg(muted ? MUTE : VOL));
    btn.title = muted ? 'Som desligado' : 'Som ligado';
  };
  paint();
  listeners.add(paint);
  return btn;
}

const VOL = '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>';
const MUTE = '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6M16 9l6 6"/>';
function svg(inner) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('class', 'ico');
  el.setAttribute('aria-hidden', 'true');
  for (const [k, v] of Object.entries({ fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) el.setAttribute(k, v);
  el.innerHTML = inner;
  return el;
}

// ---------- vibração (celular) ----------
const VKEY = 'trama.vibrar';
let vibrateOn = (() => { try { return localStorage.getItem(VKEY) !== '0'; } catch { return true; } })();
export const vibrationEnabled = () => vibrateOn;
export function setVibration(on) { vibrateOn = !!on; try { localStorage.setItem(VKEY, on ? '1' : '0'); } catch { /* ignore */ } }
export function buzz(kind) {
  if (!vibrateOn || typeof navigator === 'undefined' || !navigator.vibrate) return;
  try { navigator.vibrate(kind === 'good' ? 25 : kind === 'big' ? [30, 40, 60] : [50, 40, 50]); } catch { /* ignore */ }
}

// Combo: a nota sobe a cada palavra seguida.
export function comboNote(combo) {
  if (muted) return;
  try { tone(440 * Math.pow(2, Math.min(combo, 12) / 12), 0, 0.12, { type: 'triangle', vol: 0.1 }); } catch { /* ignore */ }
}

// Chuva fraquinha de fundo (Chuva de Letras). Devolve a função que para o som.
export function rainAmbience() {
  const a = !muted && ac();
  if (!a) return () => {};
  const buf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (Math.random() < 0.002 ? 1 : 0.25);
  const src = a.createBufferSource();
  src.buffer = buf; src.loop = true;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass'; filter.frequency.value = 2400; filter.Q.value = 0.6;
  const gain = a.createGain();
  gain.gain.value = 0.025;
  src.connect(filter).connect(gain).connect(a.destination);
  src.start();
  return () => { try { gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.4); src.stop(a.currentTime + 0.45); } catch { /* ignore */ } };
}
