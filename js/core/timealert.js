// Alerta de fim de tempo: nos últimos 10 s o cronômetro fica vermelho e pulsa,
// a borda da tela escurece em vermelho e um tique toca a cada segundo
// (mais forte nos 5 finais). Só vale para contagem regressiva.
import { play } from './sound.js';

const LIMIT = 10;
const state = new WeakMap();

export function clearTimeAlert() {
  document.body.classList.remove('time-low', 'time-critical');
}

// el: elemento que mostra o tempo; secs: segundos restantes (pode ser fracionário)
export function timeAlert(el, secs) {
  if (!el || secs == null || Number.isNaN(secs)) return;
  const s = Math.ceil(secs);
  const st = state.get(el) || { prev: null, last: null };
  const counting = st.prev != null && secs < st.prev;
  st.prev = secs;
  state.set(el, st);
  const low = counting && s > 0 && s <= LIMIT && el.isConnected;
  if (low && !document.getElementById('time-vignette')) {
    const v = document.createElement('div');
    v.id = 'time-vignette';
    v.setAttribute('aria-hidden', 'true');
    document.body.append(v);
  }
  el.classList.toggle('time-warn', low);
  el.classList.toggle('time-crit', low && s <= 5);
  document.body.classList.toggle('time-low', low);
  document.body.classList.toggle('time-critical', low && s <= 5);
  if (low && st.last !== s) {
    st.last = s;
    el.classList.remove('time-beat');
    void el.offsetWidth; // reinicia a animação a cada segundo
    el.classList.add('time-beat');
    play(s <= 5 ? 'alarm' : 'tick');
  }
  if (s <= 0 && st.last !== 0) { st.last = 0; clearTimeAlert(); }
}

// "1:05" -> 65
export const parseClock = (text) => {
  const m = /^(\d+):(\d{2})$/.exec(String(text).trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
