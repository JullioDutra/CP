// Fio, o novelo ajudante do Trama: aparece no canto com comentários curtos durante o jogo.
// Pode ser ligado/desligado (fica guardado no aparelho). Personagem original do Trama.
import { h } from './ui.js';

const KEY = 'trama.mascote';
let enabled = (() => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } })();
let root = null, bubble = null, hideTimer = null, lastAt = 0;
const listeners = new Set();

// Frases por situação. {word}, {pts}, {combo}, {letter} são trocados pelos valores.
const LINES = {
  start: ['Bora! Valendo!', 'Dedos aquecidos?', 'Vamos tecer umas palavras!'],
  word: ['Boa!', 'Isso aí!', 'Mais uma!', 'Tá voando!', 'Gostei dessa!', 'Na mosca!'],
  big: ['{word}? Que palavra grande!', 'Uau, {word}! +{pts}', 'Essa valeu ouro!', 'Palavra longa, ponto gordo!'],
  mult: ['Multiplicou! +{pts}', 'Pontos em dobro, que delícia!', 'Olha o bônus aí!'],
  combo: ['Combo de {combo}! Não para!', '{combo} seguidas! Pegando fogo!', 'Que ritmo! Combo {combo}!'],
  hot: ['Agora a letra quente é {letter}!', 'Procura palavras com {letter}!', '{letter} vale o dobro agora!'],
  bad: ['Hmm, essa não vale…', 'Quase!', 'Tenta outra!', 'Essa eu não conheço.'],
  time: ['Corre! Últimos segundos!', 'Rápido, rápido!', 'O tempo tá acabando!'],
  win: ['Você venceu! Quero um autógrafo!', 'Campeão! Que partida!', 'Vitória! Eu sabia!'],
  lose: ['Foi por pouco! Revanche?', 'Na próxima é sua!', 'Bora mais uma?'],
  round: ['Boa rodada! Próxima!', 'Vamos ver o placar…'],
  record: ['Novo recorde! Vou pendurar na geladeira!', 'Recorde batido! Que orgulho!'],
  end: ['Fim de partida! Bora de novo?', 'Mandou bem!'],
};
const MOOD = { start: 'happy', word: 'happy', big: 'wow', mult: 'wow', combo: 'wow', hot: 'happy', bad: 'sad', time: 'nervous', win: 'wow', lose: 'sad', round: 'happy', record: 'wow', end: 'happy' };
// chance de comentar (para não falar o tempo todo) e se pode interromper a fala atual
const CHANCE = { word: 0.18, bad: 0.35, big: 0.8, mult: 0.7 };
const URGENT = new Set(['win', 'lose', 'record', 'time', 'hot', 'combo', 'start']);

export const mascotEnabled = () => enabled;
export function setMascotEnabled(on) {
  enabled = !!on;
  try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch { /* ignore */ }
  if (!enabled) root?.classList.remove('show');
  listeners.forEach((fn) => fn(enabled));
}

// Interruptor reutilizável (perfil e canto da tela).
export function mascotToggle(cls = 'btn ghost small') {
  const btn = h('button', { type: 'button', class: `${cls} mascot-toggle`, onclick: () => setMascotEnabled(!enabled) });
  const paint = () => {
    btn.replaceChildren(fioSvg('mini'), h('span', {}, enabled ? 'Fio ligado' : 'Fio desligado'));
    btn.setAttribute('aria-pressed', String(enabled));
    btn.title = enabled ? 'Desligar o Fio, o novelo ajudante' : 'Ligar o Fio, o novelo ajudante';
  };
  paint();
  listeners.add(paint);
  return btn;
}

function fill(text, data) {
  return text.replace(/\{(\w+)\}/g, (_, k) => (k === 'word' ? String(data.word || '').toUpperCase() : data[k] ?? ''));
}

export function mascotSay(kind, data = {}) {
  if (!enabled || typeof document === 'undefined') return;
  const lines = LINES[kind];
  if (!lines) return;
  if (Math.random() > (CHANCE[kind] ?? 1)) return;
  const now = Date.now();
  if (!URGENT.has(kind) && now - lastAt < 3500) return; // não atropela a fala anterior
  lastAt = now;
  mount();
  root.dataset.mood = MOOD[kind] || 'happy';
  bubble.textContent = fill(lines[Math.floor(Math.random() * lines.length)], data);
  root.classList.remove('show', 'talk');
  void root.offsetWidth;
  root.classList.add('show', 'talk');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => root.classList.remove('show'), kind === 'win' || kind === 'record' ? 4200 : 2800);
}

function mount() {
  if (root?.isConnected) return;
  bubble = h('div', { class: 'fio-bubble', role: 'status', 'aria-live': 'polite' });
  root = h('div', { class: 'fio', 'aria-hidden': 'false' },
    bubble,
    h('button', { type: 'button', class: 'fio-body', title: 'Fio, o novelo ajudante (toque para esconder)', 'aria-label': 'Esconder o Fio', onclick: () => root.classList.remove('show') }, fioSvg()));
  document.body.append(root);
}

// Desenho do Fio: um novelo com olhos, boca que muda com o humor e um fio solto.
export function fioSvg(cls = '') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('class', `fio-svg ${cls}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <path class="fio-thread" d="M88 92 C 100 104, 112 96, 108 84 C 105 74, 116 70, 118 64" fill="none" stroke-width="4" stroke-linecap="round"/>
    <circle class="fio-ball" cx="60" cy="62" r="40"/>
    <path class="fio-yarn" d="M26 50 C 45 40, 75 40, 96 54 M22 66 C 45 54, 80 56, 99 72 M30 86 C 50 72, 78 74, 92 90 M44 26 C 38 50, 40 78, 52 100 M70 23 C 82 48, 82 76, 72 101" fill="none" stroke-width="3" stroke-linecap="round"/>
    <g class="fio-face">
      <ellipse class="fio-eye" cx="46" cy="58" rx="6" ry="7.5"/>
      <ellipse class="fio-eye" cx="74" cy="58" rx="6" ry="7.5"/>
      <circle class="fio-shine" cx="48" cy="55" r="2"/>
      <circle class="fio-shine" cx="76" cy="55" r="2"/>
      <circle class="fio-cheek" cx="36" cy="72" r="5"/>
      <circle class="fio-cheek" cx="84" cy="72" r="5"/>
      <path class="fio-mouth m-happy" d="M50 74 Q 60 84 70 74" fill="none" stroke-width="3.5" stroke-linecap="round"/>
      <ellipse class="fio-mouth m-wow" cx="60" cy="78" rx="6" ry="7"/>
      <path class="fio-mouth m-sad" d="M50 80 Q 60 71 70 80" fill="none" stroke-width="3.5" stroke-linecap="round"/>
      <path class="fio-mouth m-nervous" d="M48 78 l4 -3 l4 3 l4 -3 l4 3 l4 -3 l4 3" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`;
  return svg;
}
