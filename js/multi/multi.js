// Telas do multijogador: perfil (nome + avatar), saguão, rodada, revelação, pódio e Telão.
import { h, fmtTime, toast } from '../core/ui.js';
import { createWordGrid } from '../core/wordgrid.js';
import { AVATARS, MULTI_MODES, PLAYER_HUES, formatOption } from '../core/multimodes.js';
import { getPlayerName, addScore } from '../core/ranking.js';
import { getAvatar, saveIdentity, api } from '../core/profile.js';
import { play, muteButton } from '../core/sound.js';
import { createNet } from './net.js';
import { createWsBoard } from './wsboard.js';
import { createSudokuDuel } from './sudokuduel.js';

const SESSION_KEY = 'trama.session';
const DIFF = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' };

let ctx = null; // { screen, setCleanup, showMenu }
let net = null;
let state = null;
let offset = 0; // diferença entre o relógio do servidor e o local
let root = null;
let view = null;
let raf = null;
let savedFinal = null;
let lastSecond = null;

export const multiRankingModes = Object.values(MULTI_MODES).map((m) => ({ ...m, id: `multi-${m.id}` }));

export function initMulti(c) {
  ctx = c;
}

const store = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};
const serverNow = () => Date.now() + offset;
const me = () => state?.players.find((p) => p.id === state.you);
const isHost = () => state?.hostId === state?.you;
const modeOf = (s = state) => MULTI_MODES[s.options.mode];
const playerById = (id) => state?.players.find((p) => p.id === id);
const hueOf = (id) => PLAYER_HUES[(playerById(id)?.hue ?? 0) % PLAYER_HUES.length];
const joinLink = (code) => `${location.origin}${location.pathname}?sala=${code}`;

function setUrl(params) {
  const url = new URL(location.href);
  url.searchParams.delete('sala');
  url.searchParams.delete('tela');
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  history.replaceState(null, '', url);
}

export function roomCodeFromUrl() {
  return (new URLSearchParams(location.search).get('sala') || '').toUpperCase().slice(0, 4);
}
export function tvFromUrl() {
  const v = new URLSearchParams(location.search).get('tela');
  return v == null ? null : v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

// ---------- conexão ----------
function ensureNet(onFail) {
  if (net) return net;
  net = createNet({
    onOpen: () => {
      // ao (re)conectar, volta para a sala em que estava
      const s = store.get(SESSION_KEY);
      if (s?.tv) net.send({ t: 'watch', code: s.code });
      else if (s) net.send({ t: 'resume', ...s });
    },
    onStatus: (st) => {
      document.body.classList.toggle('offline', st !== 'online');
      if (st === 'unavailable') {
        net.close();
        net = null;
        onFail?.('Servidor multijogador indisponível. Para jogar em grupo, rode "npm start" e abra o endereço que aparecer.');
      }
    },
    onMessage,
  });
  return net;
}

function onMessage(msg) {
  if (msg.t === 'joined') {
    store.set(SESSION_KEY, { code: msg.code, id: msg.id, token: msg.token });
    setUrl({ sala: msg.code });
  } else if (msg.t === 'watching') {
    store.set(SESSION_KEY, { tv: true, code: msg.code });
    setUrl({ tela: msg.code });
  } else if (msg.t === 'state') {
    offset = msg.state.serverNow - Date.now();
    const prev = state;
    state = msg.state;
    if (!prev || !root?.isConnected) mountRoom();
    phaseSounds(prev, state);
    render();
  } else if (msg.t === 'error') {
    if (root?.isConnected) toast(root, msg.message, 'bad');
    else if (store.get(SESSION_KEY)?.tv || tvFromUrl() != null) showTvHome(msg.message);
    else showHome({ error: msg.message });
  } else if (msg.t === 'expired') {
    store.set(SESSION_KEY, null);
    setUrl(null);
    showHome({ error: 'Essa sala não existe mais. Crie uma nova!' });
  } else if (msg.t === 'left') {
    store.set(SESSION_KEY, null);
  }
}

function phaseSounds(prev, s) {
  if (prev?.phase === s.phase) return;
  if (s.phase === 'playing') play('go');
  if (s.phase === 'reveal') play('end');
  if (s.phase === 'final') play(s.standings[0]?.id === s.you || s.spectator ? 'win' : 'end');
}

function leaveRoom() {
  net?.send({ t: 'leave' });
  store.set(SESSION_KEY, null);
  setUrl(null);
  state = null;
  view = null;
  ctx.showMenu();
}

// ---------- tela inicial: nome + avatar ----------
export function openMulti() {
  const s = store.get(SESSION_KEY);
  const urlCode = roomCodeFromUrl();
  if (s && !s.tv && (!urlCode || urlCode === s.code)) {
    showConnecting();
    ensureNet((err) => showHome({ error: err }));
    return;
  }
  showHome({ code: urlCode });
}

function showConnecting() {
  ctx.screen(h('p', { class: 'loading' }, 'Conectando à sala…'));
}

function showHome({ code = '', error = '' } = {}) {
  state = null;
  view = null;
  let avatar = getAvatar();
  const nameInput = h('input', { type: 'text', maxlength: 16, placeholder: 'Seu nome', value: getPlayerName(), autocomplete: 'nickname', required: true });
  const codeInput = h('input', { type: 'text', maxlength: 4, placeholder: 'CÓDIGO', value: code, class: 'code-input', autocapitalize: 'characters' });
  codeInput.addEventListener('input', () => (codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '')));
  const errEl = h('p', { class: 'form-error' }, error);
  const avatars = AVATARS.map((a) =>
    h('button', {
      type: 'button',
      class: `avatar-pick ${a === avatar ? 'on' : ''}`,
      'aria-label': `Avatar ${a}`,
      onclick: (e) => {
        avatar = a;
        avatars.forEach((b) => b.classList.remove('on'));
        e.currentTarget.classList.add('on');
      },
    }, a)
  );

  async function go(action) {
    const name = nameInput.value.trim();
    if (!name) { errEl.textContent = 'Digite seu nome.'; nameInput.focus(); return; }
    if (action.t === 'join' && action.code.length !== 4) { errEl.textContent = 'O código da sala tem 4 letras.'; codeInput.focus(); return; }
    store.set(SESSION_KEY, null);
    showConnecting();
    // perfil sem login: junta as partidas no ranking global e nas estatísticas
    const prof = await saveIdentity(name, avatar);
    ensureNet((err) => showHome({ code: codeInput.value, error: err })).send({ ...action, name, avatar, profile: prof?.token });
  }

  ctx.screen(
    h('div', { class: 'topbar' }, h('button', { class: 'btn ghost small', onclick: () => { setUrl(null); ctx.showMenu(); } }, '← Menu'), h('span', {}, '👥 Jogar com amigos')),
    h(
      'div',
      { class: 'card multi-home' },
      h('h2', {}, 'Quem é você?'),
      h('label', { class: 'field' }, h('span', {}, 'Nome'), nameInput),
      h('div', { class: 'field' }, h('span', {}, 'Avatar'), h('div', { class: 'avatar-grid' }, avatars)),
      errEl,
      h('div', { class: 'row-actions center' }, h('button', { class: 'btn big', onclick: () => go({ t: 'create' }) }, 'Criar sala')),
      h('div', { class: 'divider' }, h('span', {}, 'ou entre com um código')),
      h('form', { class: 'join-form', onsubmit: (e) => { e.preventDefault(); go({ t: 'join', code: codeInput.value }); } }, codeInput, h('button', { class: 'btn', type: 'submit' }, 'Entrar')),
      h('p', { class: 'section-sub center' }, 'Sem cadastro: só nome e avatar. Quem criar a sala escolhe o modo e manda o código ou o link para os amigos.'),
      h('p', { class: 'section-sub center' }, '📺 Vai jogar na TV? ', h('a', { href: '?tela=1', onclick: (e) => { e.preventDefault(); setUrl({ tela: '1' }); openTv(); } }, 'Abrir o Telão'))
    )
  );
  if (code) nameInput.value ? codeInput.focus() : nameInput.focus();
}

// ---------- Telão (TV/computador mostrando a partida) ----------
export function openTv() {
  const code = tvFromUrl();
  if (code && code.length === 4) {
    store.set(SESSION_KEY, null);
    showConnecting();
    ensureNet((err) => showTvHome(err)).send({ t: 'watch', code });
    return;
  }
  showTvHome();
}

function showTvHome(error = '') {
  state = null;
  view = null;
  const codeInput = h('input', { type: 'text', maxlength: 4, placeholder: 'CÓDIGO', class: 'code-input', autocapitalize: 'characters' });
  codeInput.addEventListener('input', () => (codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '')));
  const watch = (msg) => {
    store.set(SESSION_KEY, null);
    showConnecting();
    ensureNet((err) => showTvHome(err)).send(msg);
  };
  ctx.screen(
    h('div', { class: 'topbar' }, h('button', { class: 'btn ghost small', onclick: () => { setUrl(null); ctx.showMenu(); } }, '← Menu'), h('span', {}, '📺 Telão')),
    h('div', { class: 'card multi-home' },
      h('h2', {}, '📺 Modo Telão'),
      h('p', { class: 'center' }, 'Abra esta tela na TV ou no computador. A grade aparece grande aqui e cada pessoa joga pelo celular, lendo o QR code.'),
      h('p', { class: 'form-error' }, error),
      h('div', { class: 'row-actions center' }, h('button', { class: 'btn big', onclick: () => watch({ t: 'watch', create: true }) }, 'Criar sala neste telão')),
      h('div', { class: 'divider' }, h('span', {}, 'ou mostre uma sala que já existe')),
      h('form', { class: 'join-form', onsubmit: (e) => { e.preventDefault(); if (codeInput.value.length === 4) watch({ t: 'watch', code: codeInput.value }); } }, codeInput, h('button', { class: 'btn', type: 'submit' }, 'Mostrar'))));
}

// ---------- sala ----------
function mountRoom() {
  root = h('div', { class: 'room' });
  view = null;
  ctx.screen(root);
  ctx.setCleanup(() => { cancelAnimationFrame(raf); view?.destroy?.(); view = null; });
  const loop = () => {
    const left = (state?.endsAt ?? 0) - serverNow();
    root.querySelectorAll('[data-clock]').forEach((el) => {
      el.textContent = el.dataset.clock === 'count' ? Math.max(1, Math.ceil(left / 1000)) : fmtTime(left / 1000);
      el.classList.toggle('danger', el.dataset.clock !== 'count' && left < 10000);
    });
    // bipes: contagem 3-2-1 e últimos 10 segundos
    const sec = Math.ceil(left / 1000);
    if (state?.endsAt && sec !== lastSecond && sec > 0) {
      if (state.phase === 'countdown' && sec <= 3) play('count');
      if (state.phase === 'playing' && sec <= 10) play('tick');
    }
    lastSecond = sec;
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

const PLAY_VIEWS = {
  grade: { player: gradePlay, tv: gradeTv },
  wordsearch: { player: (s) => wsPlay(s, true), tv: (s) => wsPlay(s, false) },
  sudoku: { player: sudokuPlay, tv: sudokuTv },
};

function render() {
  const tv = state.spectator;
  root.className = `room ${tv ? 'tv' : ''} ${state.tv && !tv ? 'with-tv' : ''}`;
  const key = `${state.phase}-${state.round}-${state.options.mode}`;
  if (view?.key === key) { view.update(state); return; }
  view?.destroy?.();
  const game = modeOf().game;
  const make = {
    lobby: tv ? tvLobbyView : lobbyView,
    countdown: countdownView,
    playing: PLAY_VIEWS[game][tv ? 'tv' : 'player'],
    reveal: resultsView,
    final: resultsView,
  }[state.phase];
  view = make(state);
  view.key = key;
  root.replaceChildren(roomHeader(), view.el);
  view.update(state);
}

function roomHeader() {
  const tv = state.spectator;
  return h(
    'div',
    { class: 'topbar room-top' },
    h('button', { class: 'btn ghost small', onclick: () => { if (tv || state.phase === 'lobby' || confirm('Sair da sala?')) leaveRoom(); } }, tv ? '← Fechar telão' : '← Sair'),
    h('span', {}, `${modeOf().icon} ${modeOf().name}`),
    h('span', { class: 'room-code-small' }, 'Sala ', h('strong', {}, state.code)),
    !tv ? h('a', { class: 'btn ghost small', href: `?tela=${state.code}`, target: '_blank', rel: 'noopener', title: 'Abrir o telão em outra aba/tela' }, '📺') : '',
    muteButton(h)
  );
}

function avatarEl(p) {
  return h('span', { class: 'avatar', style: `--hue:${hueOf(p.id)}` }, p.avatar);
}

function playerRow(p, right = []) {
  return h(
    'li',
    { class: `player ${p.connected ? '' : 'off'} ${p.id === state.you ? 'me' : ''}` },
    avatarEl(p),
    h('span', { class: 'pname' }, p.name, p.id === state.you ? h('small', {}, ' (você)') : '', p.id === state.hostId ? h('span', { title: 'Anfitrião' }, ' 👑') : '', p.connected ? '' : h('small', {}, ' · desconectado')),
    right
  );
}

function liveBoard(s, { title = 'Placar ao vivo', hint = null } = {}) {
  const list = h('ol', { class: 'live-board' });
  const el = h('div', { class: 'found-panel live-panel' }, h('h3', {}, title), list, hint ? h('p', { class: 'hint' }, hint) : '');
  return {
    el,
    update(st) {
      const players = st.players.slice().sort((a, b) => b.roundPoints - a.roundPoints);
      list.replaceChildren(...players.map((p) => playerRow(p, h('span', { class: 'live-pts' }, p.roundLabel))));
    },
  };
}

// ----- saguão (jogador) -----
function lobbyView() {
  const el = h('div', { class: 'lobby' });
  return {
    el,
    update(s) {
      const host = isHost();
      const link = joinLink(s.code);
      const mode = modeOf(s);
      const readyCount = s.players.filter((p) => p.ready || p.id === s.hostId).length;
      const opt = (key, spec) =>
        h('div', { class: 'opt-row' }, h('span', {}, spec.label),
          h('div', { class: 'chips' }, spec.choices.map((v) =>
            h('button', { class: `chip ${s.options[key] === v ? 'on' : ''}`, disabled: !host, onclick: () => net.send({ t: 'options', options: { [key]: v } }) }, formatOption(spec, v)))));
      const modeCard = (m) =>
        h('button', { class: `mode-card small ${m.category} ${s.options.mode === m.id ? 'chosen' : ''}`, disabled: !host && s.options.mode !== m.id, onclick: () => host && net.send({ t: 'options', options: { mode: m.id } }) },
          h('span', { class: 'mode-icon' }, m.icon), h('span', { class: 'mode-text' }, h('strong', {}, m.name), h('small', {}, m.short)));
      const modes = Object.values(MULTI_MODES);
      el.replaceChildren(
        h('div', { class: 'card code-card' },
          h('p', {}, 'Código da sala'),
          h('div', { class: 'room-code' }, s.code),
          h('div', { class: 'row-actions center' },
            h('button', { class: 'btn ghost small', onclick: () => copy(link) }, '🔗 Copiar link'),
            navigator.share ? h('button', { class: 'btn ghost small', onclick: () => navigator.share({ title: 'Trama', text: `Entra na minha sala do Trama! Código ${s.code}`, url: link }).catch(() => {}) }, '📤 Compartilhar') : '',
            h('a', { class: 'btn ghost small', href: `?tela=${s.code}`, target: '_blank', rel: 'noopener' }, '📺 Abrir telão (TV)'))),
        h('div', { class: 'lobby-grid' },
          h('div', { class: 'card' },
            h('h3', {}, `Jogadores (${s.players.length})`),
            h('ul', { class: 'players' }, s.players.map((p) => playerRow(p, h('span', { class: 'ready' }, p.id === s.hostId ? '' : p.ready ? '✅ pronto' : '⏳')))),
            s.tv ? h('p', { class: 'hint' }, '📺 Telão conectado — a partida vai aparecer grande na TV.') : ''),
          h('div', { class: 'card' },
            h('h3', {}, host ? 'Escolha o modo' : 'Modo escolhido'),
            h('p', { class: 'group-label' }, 'Clássicos'),
            h('div', { class: 'mode-grid tight' }, modes.filter((m) => m.category === 'classico').map(modeCard)),
            h('p', { class: 'group-label novo' }, 'Novos · exclusivos Trama'),
            h('div', { class: 'mode-grid tight' }, modes.filter((m) => m.category === 'novo').map(modeCard)),
            h('ul', { class: 'rules' }, mode.rules.map((r) => h('li', {}, r))),
            Object.entries(mode.options).map(([k, spec]) => opt(k, spec)))),
        h('div', { class: 'row-actions center' },
          host
            ? h('button', { class: 'btn big', onclick: () => net.send({ t: 'start' }) }, `Começar partida (${readyCount}/${s.players.length} prontos)`)
            : h('button', { class: `btn big ${me()?.ready ? 'ghost' : ''}`, onclick: () => net.send({ t: 'ready', ready: !me()?.ready }) }, me()?.ready ? 'Não estou pronto' : 'Estou pronto!')),
        !host ? h('p', { class: 'section-sub center' }, 'Aguardando o anfitrião começar a partida…') : s.players.length < 2 ? h('p', { class: 'section-sub center' }, 'Mande o código para os amigos. Dá para começar sozinho para testar.') : ''
      );
    },
  };
}

// ----- saguão (telão) -----
function tvLobbyView() {
  const el = h('div', { class: 'tv-lobby' });
  return {
    el,
    update(s) {
      const link = joinLink(s.code);
      const mode = modeOf(s);
      const host = playerById(s.hostId);
      el.replaceChildren(
        h('div', { class: 'tv-join card' },
          h('img', { class: 'qr', src: `api/qr?d=${encodeURIComponent(link)}`, alt: `QR code para entrar na sala ${s.code}` }),
          h('div', {},
            h('p', { class: 'tv-step' }, 'Aponte a câmera do celular para o QR code', h('br'), 'ou entre em ', h('strong', {}, location.host), ' e digite o código:'),
            h('div', { class: 'room-code' }, s.code))),
        h('div', { class: 'card' },
          h('h3', {}, `${mode.icon} ${mode.name} `, h('span', { class: `badge ${mode.category}` }, mode.category === 'classico' ? 'clássico' : 'novo')),
          h('ul', { class: 'rules' }, mode.rules.map((r) => h('li', {}, r))),
          h('p', { class: 'hint' }, Object.entries(mode.options).map(([k, spec]) => `${spec.label}: ${formatOption(spec, s.options[k])}`).join(' · '))),
        h('div', { class: 'tv-players' },
          s.players.length
            ? s.players.map((p) => h('div', { class: `tv-player ${p.connected ? '' : 'off'}` }, h('div', { class: 'tv-avatar', style: `--hue:${hueOf(p.id)}` }, p.avatar), h('div', {}, p.name, p.id === s.hostId ? ' 👑' : ''), h('small', {}, p.id === s.hostId ? 'anfitrião' : p.ready ? '✅ pronto' : '…')))
            : h('p', { class: 'section-sub' }, 'Ninguém entrou ainda. O primeiro a entrar vira o anfitrião 👑.')),
        h('p', { class: 'section-sub center' }, host ? `${host.name} começa a partida pelo celular.` : '')
      );
    },
  };
}

function copy(text) {
  (navigator.clipboard?.writeText(text) || Promise.reject())
    .then(() => toast(root, 'Link copiado!', 'good'))
    .catch(() => prompt('Copie o link:', text));
}

// ----- contagem -----
function countdownView(s) {
  return {
    el: h('div', { class: 'countdown' },
      h('p', {}, `Rodada ${s.round + 1} de ${s.options.rounds}`),
      h('div', { class: 'count-num', 'data-clock': 'count' }, '3'),
      h('p', { class: 'section-sub' }, `${modeOf(s).name} — ${modeOf(s).short}`)),
    update() {},
  };
}

function hudBar(s, third) {
  return h('div', { class: 'hud' },
    h('div', { class: 'hud-item' }, h('span', {}, 'Tempo'), h('strong', { 'data-clock': 'time' }, '')),
    h('div', { class: 'hud-item' }, h('span', {}, 'Rodada'), h('strong', {}, `${s.round}/${s.options.rounds}`)),
    third);
}

// ----- Grade (jogador) -----
function gradePlay(s) {
  const wg = createWordGrid({
    size: s.play.size,
    letters: s.play.grid,
    bonus: s.play.bonus || {},
    onSubmit: async (w, path) => {
      const slow = setTimeout(() => toast(root, `Verificando ${w.toUpperCase()} com IA…`), 400);
      const r = await net.act('submit', { word: w, path });
      clearTimeout(slow);
      if (r.ok) toast(root, `${r.ai ? '✨ IA confirmou! ' : ''}${r.mult > 1 ? `×${r.mult}! ` : ''}+${r.pts}`, 'good');
      else toast(root, r.reason, r.dup ? 'dup' : 'bad');
      return r;
    },
  });
  const board = liveBoard(s);
  const mine = h('ul', { class: 'found' });
  const myPts = h('strong', {}, '0');
  const myCount = h('h3', {}, 'Minhas palavras');
  const el = h('div', { class: 'playing' },
    hudBar(s, h('div', { class: 'hud-item' }, h('span', {}, 'Meus pontos'), myPts)),
    h('div', { class: 'play-area' }, wg.el, h('div', { class: 'side-col' }, board.el, h('div', { class: 'found-panel' }, myCount, mine))));
  return {
    el,
    update(st) {
      board.update(st);
      const words = st.play?.myWords || [];
      const ai = new Set(st.play?.myAi || []);
      myPts.textContent = me()?.roundPoints ?? 0;
      myCount.textContent = `Minhas palavras (${words.length})`;
      mine.replaceChildren(...words.slice().reverse().map((w) => h('li', {}, w.toUpperCase(), ai.has(w) ? ' ✨' : '')));
    },
    destroy: () => wg.destroy(),
  };
}

// ----- Grade (telão) -----
function gradeTv(s) {
  const bonus = s.play.bonus || {};
  const tiles = h('div', { class: 'board tv-board', style: `--n:${s.play.size}` }, s.play.grid.map((l, i) => h('div', { class: `tile ${bonus[i] ? 'has-bonus' : ''}` }, h('span', {}, l.toUpperCase()), bonus[i] ? h('em', { class: 'bonus' }, bonus[i]) : '')));
  const board = liveBoard(s);
  return {
    el: h('div', { class: 'playing' }, hudBar(s, h('div', { class: 'hud-item' }, h('span', {}, 'Possíveis'), h('strong', {}, s.play.possible))), h('div', { class: 'play-area' }, tiles, board.el)),
    update: (st) => board.update(st),
  };
}

// ----- Caça-Palavras Corrida (jogador e telão) -----
function wsPlay(s, interactive) {
  const ws = createWsBoard({
    grid: s.play.grid,
    size: s.play.size,
    interactive,
    onMark: async (cells) => {
      const r = await net.act('mark', { cells });
      if (r.ok) { toast(root, `${r.word.toUpperCase()} +${r.pts}`, 'good'); play('big'); }
      else { toast(root, r.reason, r.dup ? 'dup' : 'bad'); play(r.dup ? 'steal' : 'bad'); }
    },
  });
  const list = h('ul', { class: 'ws-list race' });
  const board = liveBoard(s);
  const myPts = h('strong', {}, '0');
  let known = 0;
  const el = h('div', { class: 'playing' },
    hudBar(s, h('div', { class: 'hud-item' }, h('span', {}, interactive ? 'Meus pontos' : 'Achadas'), interactive ? myPts : h('strong', { class: 'ws-count' }, '0'))),
    h('h2', { class: 'theme-title' }, `Tema: ${s.play.theme}`),
    h('div', { class: 'play-area' }, ws.el, h('div', { class: 'side-col' }, h('div', { class: 'found-panel' }, h('h3', {}, 'Palavras'), list), board.el)));
  return {
    el,
    update(st) {
      ws.update(st.play.words, hueOf);
      board.update(st);
      myPts.textContent = me()?.roundPoints ?? 0;
      const found = st.play.words.filter((w) => w.by).length;
      if (!interactive) {
        if (found > known) play('good');
        el.querySelector('.ws-count').textContent = `${found}/${st.play.words.length}`;
      }
      known = found;
      list.replaceChildren(...st.play.words.map((w) => {
        const p = w.by ? playerById(w.by) : null;
        return h('li', { class: w.by ? 'done' : '', style: p ? `--hue:${hueOf(p.id)}` : '' }, w.display.toUpperCase(), p ? h('span', { class: 'by', title: p.name }, ` ${p.avatar}`) : '');
      }));
    },
  };
}

// ----- Sudoku Duelo (jogador) -----
function sudokuPlay(s) {
  const duel = createSudokuDuel({ puzzle: s.play.puzzle, board: s.play.board, toastRoot: root, onCell: (i, v) => net.act('cell', { i, v }) });
  const errs = h('strong', {}, '0');
  const board = liveBoard(s, { title: 'Progresso de todos' });
  return {
    el: h('div', { class: 'playing' }, hudBar(s, h('div', { class: 'hud-item' }, h('span', {}, 'Erros'), errs)), h('div', { class: 'play-area' }, duel.el, board.el)),
    update(st) {
      duel.sync(st.play.board, st.play.done);
      errs.textContent = st.play.errors;
      board.update(st);
    },
    destroy: () => duel.destroy(),
  };
}

// ----- Sudoku Duelo (telão): barras de progresso -----
function sudokuTv(s) {
  const bars = h('div', { class: 'race-bars' });
  return {
    el: h('div', { class: 'playing' }, hudBar(s, h('div', { class: 'hud-item' }, h('span', {}, 'Nível'), h('strong', {}, DIFF[s.options.difficulty]))), h('h2', { class: 'theme-title' }, 'Quem resolve primeiro?'), bars),
    update(st) {
      const players = st.players.slice().sort((a, b) => b.roundPoints - a.roundPoints);
      bars.replaceChildren(...players.map((p) => h('div', { class: 'race-row' },
        avatarEl(p), h('span', { class: 'pname' }, p.name),
        h('div', { class: 'race-track' }, h('div', { class: 'race-fill', style: `width:${p.roundPoints}%; --hue:${hueOf(p.id)}` })),
        h('span', { class: 'live-pts' }, p.roundLabel))));
    },
  };
}

// ----- revelação / pódio -----
function resultsView(s) {
  const final = s.phase === 'final';
  const r = s.lastRound;
  const byId = Object.fromEntries(s.players.map((p) => [p.id, p]));
  const standings = s.standings.filter((x) => byId[x.id]);

  if (final && !s.spectator) saveFinal(s, standings);

  const podium = final
    ? h('div', { class: 'podium' }, [1, 0, 2].map((i) => {
        const x = standings[i];
        if (!x) return h('div', { class: 'podium-spot empty' });
        const p = byId[x.id];
        return h('div', { class: `podium-spot p${i + 1}` },
          h('div', { class: 'podium-avatar' }, p.avatar),
          h('div', { class: 'podium-name' }, p.name),
          h('div', { class: 'podium-pts' }, `${x.total} pts`),
          h('div', { class: 'podium-block' }, ['🥇', '🥈', '🥉'][i]));
      }))
    : '';

  let delay = 0;
  const stagger = () => `animation-delay:${Math.min((delay += 0.05), 4)}s`;
  const wordChip = (w) =>
    h('span', { class: `wchip ${w.status}`, style: stagger(), title: w.status === 'unique' ? 'Só esta pessoa achou' : `${w.by} pessoas acharam` },
      w.status === 'unique' ? '★ ' : '', w.w.toUpperCase(), w.ai ? ' ✨' : '', w.status === 'shared' ? h('span', { class: 'by-count', 'aria-label': `${w.by} pessoas` }, `👥${w.by}`) : '', h('small', {}, `+${w.pts}`));

  const detailFor = (id) => {
    const d = r.players?.[id];
    if (!d) return h('small', { class: 'muted' }, 'Entrou depois desta rodada');
    if (r.type === 'grade') return d.words.length ? [tank(d.unique, d.shared, 'small'), ...d.words.map(wordChip)] : h('small', { class: 'muted' }, 'Nenhuma palavra');
    if (r.type === 'wordsearch') return d.found.length ? d.found.map((w) => h('span', { class: 'wchip mine', style: `${stagger()};--hue:${hueOf(id)}` }, w.toUpperCase())) : h('small', { class: 'muted' }, 'Nenhuma palavra');
    if (r.type === 'sudoku') {
      return h('small', {}, d.done ? `✅ Terminou em ${d.place}º · ${fmtTime(d.seconds)} · ${d.errors} erro(s)` : `Não terminou · ${d.filled}/${r.empty} números certos · ${d.errors} erro(s)`);
    }
    return '';
  };

  const rows = standings.map((x, i) => {
    const p = byId[x.id];
    return h('div', { class: `result-player ${x.id === s.you ? 'me' : ''}` },
      h('div', { class: 'rp-head' },
        h('span', { class: 'rp-pos' }, i + 1, 'º'),
        avatarEl(p),
        h('strong', {}, p.name),
        h('span', { class: 'rp-round' }, `+${r.scores?.[x.id] ?? 0} na rodada`),
        h('span', { class: 'rp-total' }, `${x.total} pts`)),
      h('div', { class: 'wchips' }, detailFor(x.id)));
  });

  let extra = '';
  let legend = '';
  if (r.type === 'grade') {
    legend = h('p', { class: 'legend' },
      h('span', { class: 'wchip unique' }, '★ única'),
      h('span', { class: 'wchip shared' }, 'repetida ', h('span', { class: 'by-count' }, '👥2')),
      h('span', { class: 'wchip' }, '✨ confirmada pela IA'),
      h('span', { class: 'legend-note' }, 'Únicas e repetidas valem os mesmos pontos.'));
    extra = h('div', {},
      r.totals ? h('div', { class: 'tank-box' }, h('h3', {}, 'Tanque da rodada'), tank(r.totals.unique, r.totals.shared, 'big'), h('p', { class: 'hint' }, `${r.totals.distinct} palavras diferentes achadas por todos`)) : '',
      r.longest ? h('p', { class: 'highlight' }, '📏 Maior palavra da rodada: ', h('strong', {}, r.longest.w.toUpperCase()), ` (${byId[r.longest.id]?.name || '—'})`) : '',
      r.missed?.length ? h('div', { class: 'missed' }, h('h4', {}, `Palavras que ninguém achou (${r.possible} possíveis na grade), as mais conhecidas primeiro:`), h('p', {}, r.missed.map((w) => w.toUpperCase()).join(' · '))) : '');
  } else if (r.type === 'wordsearch') {
    const missing = r.words.filter((w) => !w.by);
    extra = h('p', { class: 'highlight' }, `Tema: ${r.theme}`, missing.length ? ` · Ninguém achou: ${missing.map((w) => w.display.toUpperCase()).join(', ')}` : ' · Todas as palavras foram achadas!');
  } else if (r.type === 'sudoku') {
    extra = h('p', { class: 'highlight' }, `Sudoku ${DIFF[r.difficulty]} · bônus de pódio: 1º +500 · 2º +250 · 3º +100`);
  }

  const actions = h('div', { class: 'row-actions center' });
  const globalEl = h('div', { class: 'global-pos' });
  if (final && !s.spectator) showGlobalPosition(s, globalEl);
  const el = h('div', { class: 'results card' },
    h('h2', {}, final ? '🏆 Fim de jogo!' : `Fim da rodada ${s.round} de ${s.options.rounds}`),
    podium,
    globalEl,
    extra,
    legend,
    h('div', { class: 'result-list' }, rows),
    actions);

  return {
    el,
    update(st) {
      if (st.spectator) {
        const hp = playerById(st.hostId);
        actions.replaceChildren(h('p', { class: 'section-sub' }, hp ? `${hp.name} 👑 ${final ? 'pode iniciar a revanche' : 'inicia a próxima rodada'} pelo celular.` : ''));
        return;
      }
      actions.replaceChildren(
        isHost()
          ? h('button', { class: 'btn big', onclick: () => net.send({ t: final ? 'rematch' : 'next' }) }, final ? '🔁 Revanche' : 'Próxima rodada →')
          : h('p', { class: 'section-sub' }, final ? 'O anfitrião pode iniciar a revanche.' : 'Aguardando o anfitrião iniciar a próxima rodada…'),
        h('button', { class: 'btn ghost', onclick: leaveRoom }, 'Sair da sala'));
    },
  };
}

function saveFinal(s, standings) {
  const key = `${s.code}-${JSON.stringify(s.history)}`;
  if (savedFinal === key) return;
  savedFinal = key;
  const mine = standings.find((x) => x.id === s.you);
  const p = me();
  if (!mine || !p || mine.total <= 0) return;
  const pos = standings.indexOf(mine) + 1;
  addScore(`multi-${s.options.mode}`, { name: p.name, score: mine.total, detail: `${pos}º de ${standings.length} · sala ${s.code}` });
}

// "Tanque": barra cheia dividida entre palavras únicas e repetidas.
function tank(unique, shared, size = 'small') {
  const total = unique + shared || 1;
  return h('div', { class: `tank ${size}`, role: 'img', 'aria-label': `${unique} únicas e ${shared} repetidas` },
    h('div', { class: 'tank-bar' },
      unique ? h('div', { class: 'tank-unique', style: `width:${(unique / total) * 100}%` }, size === 'big' ? `${unique}` : '') : '',
      shared ? h('div', { class: 'tank-shared', style: `width:${(shared / total) * 100}%` }, size === 'big' ? `${shared}` : '') : ''),
    h('div', { class: 'tank-label' }, h('span', { class: 'u' }, `★ ${unique} única${unique === 1 ? '' : 's'}`), h('span', { class: 's' }, `${shared} repetida${shared === 1 ? '' : 's'}`)));
}

// Depois do pódio: em que lugar a sua partida ficou no ranking global da semana.
export function multiVariant(options) {
  const m = MULTI_MODES[options.mode];
  return m.game === 'grade' ? String(options.size) : m.game === 'sudoku' ? options.difficulty : '';
}

async function showGlobalPosition(s, el) {
  const variant = multiVariant(s.options);
  await new Promise((r) => setTimeout(r, 400)); // dá tempo do servidor gravar a partida
  try {
    const q = `ranking?modo=${s.options.mode}${variant ? `&variante=${variant}` : ''}&periodo=semana`;
    const r = await api(q);
    if (r.voce) el.replaceChildren(h('p', {}, '🌍 Sua melhor partida está em ', h('strong', {}, `${r.voce.pos}º lugar`), ' no ranking global da semana (', `${r.voce.score} pts`, ').'));
  } catch { /* sem servidor de ranking */ }
}
