// Baixar o jogo (PWA): botão "Instalar app" quando o navegador permite;
// no iPhone/iPad mostra como adicionar à Tela de Início.
import { h } from './ui.js';
import { icon } from './icons.js';

let deferred = null;
const listeners = new Set();
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; listeners.forEach((f) => f()); });
window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((f) => f()); });

const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function iosSheet() {
  const close = () => sheet.remove();
  const sheet = h('div', { class: 'sheet-backdrop', onclick: (e) => e.target === sheet && close() },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Instalar o Trama' },
      h('h3', {}, 'Instalar o Trama'),
      h('ol', { class: 'steps' },
        h('li', {}, 'Toque em ', icon('share', 'inline'), ' Compartilhar, na barra do Safari.'),
        h('li', {}, 'Escolha "Adicionar à Tela de Início".'),
        h('li', {}, 'Toque em "Adicionar". O Trama abre como app, em tela cheia.')),
      h('button', { class: 'btn', onclick: close }, 'Entendi')));
  document.body.append(sheet);
}

// Botão que aparece só quando dá para instalar.
export function installButton(cls = 'btn ghost small') {
  const btn = h('button', { class: `${cls} install-btn`, type: 'button', onclick: async () => {
    if (deferred) { deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; paint(); }
    else if (isIos()) iosSheet();
  } }, icon('download'), h('span', {}, 'Baixar app'));
  const paint = () => { btn.hidden = standalone() || !(deferred || isIos()); };
  paint();
  listeners.add(paint);
  return btn;
}
