// Efeitos visuais leves (sem bibliotecas): pontos que sobem e confete.
// Respeitam "reduzir movimento" do sistema.
import { h } from './ui.js';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// "+12" subindo a partir de um elemento (ex.: a última peça da palavra).
export function floatPoints(anchor, text, kind = 'good') {
  if (!anchor?.getBoundingClientRect || reduced()) return;
  const r = anchor.getBoundingClientRect();
  const el = h('span', { class: `float-pts ${kind}`, style: `left:${r.left + r.width / 2}px;top:${r.top}px` }, text);
  document.body.append(el);
  el.addEventListener('animationend', () => el.remove());
  setTimeout(() => el.remove(), 1600);
}

// Chuva de confete (vitória, recorde).
export function confetti({ count = 90, duration = 2600 } = {}) {
  if (reduced() || typeof document === 'undefined') return;
  const colors = ['#2563eb', '#f0b429', '#16a34a', '#e11d48', '#7c3aed', '#0ea5e9'];
  const layer = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < count; i++) {
    const x = Math.random() * 100;
    const delay = Math.random() * 0.6;
    const dur = (duration / 1000) * (0.7 + Math.random() * 0.6);
    const rot = Math.floor(Math.random() * 720 - 360);
    const drift = Math.floor(Math.random() * 160 - 80);
    layer.append(h('i', {
      style: `left:${x}vw;background:${colors[i % colors.length]};animation-delay:${delay}s;animation-duration:${dur}s;--rot:${rot}deg;--drift:${drift}px;${i % 3 ? '' : 'border-radius:50%;'}`,
    }));
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), duration + 900);
}
