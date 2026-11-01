// Utilitários de interface compartilhados pelos modos.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

// Cronômetro regressivo (ou progressivo se seconds = null).
export function createTimer({ seconds = null, onTick, onEnd }) {
  let remaining = seconds;
  let elapsed = 0;
  let last = performance.now();
  let running = true;
  let raf;
  const loop = (now) => {
    if (!running) return;
    const dt = (now - last) / 1000;
    last = now;
    elapsed += dt;
    if (remaining != null) {
      remaining -= dt;
      if (remaining <= 0) {
        remaining = 0;
        running = false;
        onTick?.(0, elapsed);
        onEnd?.();
        return;
      }
    }
    onTick?.(remaining, elapsed);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return {
    add(s) { if (remaining != null) remaining += s; },
    get remaining() { return remaining; },
    get elapsed() { return elapsed; },
    stop() { running = false; cancelAnimationFrame(raf); },
  };
}

export function toast(container, text, kind = '') {
  const el = h('div', { class: `toast ${kind}` }, text);
  container.append(el);
  setTimeout(() => el.remove(), 1400);
}

export function hud(items) {
  const values = {};
  const el = h(
    'div',
    { class: 'hud' },
    items.map(([key, label]) => {
      values[key] = h('strong', {}, '—');
      return h('div', { class: `hud-item hud-${key}` }, h('span', {}, label), values[key]);
    })
  );
  return { el, set: (key, v) => (values[key].textContent = v) };
}
