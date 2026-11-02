// Telas do multijogador: perfil (nome + avatar), saguão, rodada, revelação, pódio e Telão.
import { h, fmtTime, toast } from '../core/ui.js';
import { timeAlert, clearTimeAlert } from '../core/timealert.js';
import { icon, modeIcon } from '../core/icons.js';
import { createWordGrid } from '../core/wordgrid.js';
import { POINTS_HINT } from '../core/letters.js';
import { AVATARS, MULTI_MODES, PLAYER_HUES, formatOption, TEAMS, REACTIONS } from '../core/multimodes.js';
import { leagueOf } from '../core/leagues.js';
import { achievementByKey } from '../core/achievements.js';
import { getPlayerName, addScore } from '../core/ranking.js';
import { getAvatar, saveIdentity, api } from '../core/profile.js';
import { markSeenAchievements } from '../core/achv-toast.js';
import { play, muteButton } from '../core/sound.js';
import { createNet } from './net.js';
import { createWsBoard } from './wsboard.js';
import { createSudokuDuel } from './sudokuduel.js';
import { createReveal } from './reveal.js';

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
  } else if (msg.t === 'reaction') {
    showReaction(msg);
  }
}

// Reações rápidas: o emoji sobe pela tela de todo mundo (inclusive no telão).
function showReaction({ emoji, avatar, name }) {
  if (!root?.isConnected) return;
  const el = h('div', { class: 'float-react', style: `left:${10 + Math.random() * 80}%` }, h('span', { class: 'fr-emoji' }, emoji), h('small', {}, `${avatar} ${name}`));
  root.append(el);
  setTimeout(() => el.remove(), 2600);
}

function reactionsBar() {
  return h('div', { class: 'reactions' }, REACTIONS.map((e) => h('button', { class: 'react-btn', type: 'button', 'aria-label': `Reagir ${e}`, onclick: () => net?.send({ t: 'react', emoji: e }) }, e)));
}

function phaseSounds(prev, s) {
  if (prev?.phase === s.phase) return;
  if (s.phase === 'playing') play('go');
  // o som do fim da rodada toca no final da revelação animada
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
// opts.code: código digitado no início; opts.auto: entra direto se já tiver nome;
// opts.create: cria a sala direto se já tiver nome.
export function openMulti(opts = {}) {
  const s = store.get(SESSION_KEY);
  const urlCode = opts.code || roomCodeFromUrl();
  if (!opts.code && !opts.create && s && !s.tv && (!urlCode || urlCode === s.code)) {
    showConnecting();
    ensureNet((err) => showHome({ error: err }));
    return;
  }
  showHome({ code: urlCode, auto: opts.auto ? 'join' : opts.create ? 'create' : null });
}

// Arena Pública: entra numa partida com desconhecidos (sem código).
export async function openArena() {
  const name = getPlayerName();
  if (!name) { showHome({ arena: true }); return; }
  store.set(SESSION_KEY, null);
  showConnecting('Procurando partida na Arena…');
  const avatar = getAvatar();
  const prof = await saveIdentity(name, avatar);
  ensureNet((err) => showHome({ arena: true, error: err })).send({ t: 'quick', name, avatar, profile: prof?.token });
}

async function requeueArena() {
  const p = me();
  const prof = await saveIdentity(p?.name || getPlayerName() || 'Jogador', p?.avatar || getAvatar());
  net.send({ t: 'quick', name: p?.name || getPlayerName(), avatar: p?.avatar || getAvatar(), profile: prof?.token });
}

function showConnecting(text = 'Conectando à sala…') {
  ctx.screen(h('p', { class: 'loading' }, text));
}

function showHome({ code = '', error = '', arena = false, auto = null } = {}) {
  state = null;
  view = null;
  let avatar = getAvatar();
  const invited = !arena && code && code.length === 4;
  const nameInput = h('input', { id: 'mh-name', type: 'text', maxlength: 16, placeholder: 'Seu nome', value: getPlayerName(), autocomplete: 'nickname', required: true });
  const codeInput = h('input', { id: 'mh-code', type: 'text', maxlength: 4, placeholder: 'ABCD', value: code, class: 'code-input', autocapitalize: 'characters', autocomplete: 'off', 'aria-label': 'Código da sala' });
  codeInput.addEventListener('input', () => (codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '')));
  const errEl = h('p', { class: 'form-error' }, error);
  const avatarBtn = h('button', { type: 'button', class: 'avatar-current', 'aria-label': 'Trocar avatar', title: 'Trocar avatar' }, avatar);
  const avatars = AVATARS.map((a) =>
    h('button', {
      type: 'button',
      class: `avatar-pick ${a === avatar ? 'on' : ''}`,
      'aria-label': `Avatar ${a}`,
      onclick: (e) => {
        avatar = a;
        avatarBtn.textContent = a;
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
    showConnecting(action.t === 'join' ? `Entrando na sala ${action.code}…` : 'Criando a sala…');
    // perfil sem login: junta as partidas no ranking global e nas estatísticas
    const prof = await saveIdentity(name, avatar);
    ensureNet((err) => showHome({ code: codeInput.value, error: err })).send({ ...action, name, avatar, profile: prof?.token });
  }
  const join = () => go({ t: 'join', code: codeInput.value });

  // quem já tem nome e veio do início com um código (ou "Criar sala") vai direto
  if (auto && getPlayerName() && !error) { auto === 'join' && code ? join() : go({ t: 'create' }); return; }

  const who = h('div', { class: 'who' },
    h('p', { class: 'step-label' }, 'Você'),
    h('div', { class: 'who-row' }, avatarBtn, h('label', { class: 'field grow' }, h('span', { class: 'sr-only' }, 'Nome'), nameInput)),
    h('div', { class: 'avatar-grid' }, avatars));

  const joinCard = h('form', { class: `choice join ${invited ? 'invited' : ''}`, onsubmit: (e) => { e.preventDefault(); join(); } },
    h('div', { class: 'choice-head' }, icon('enter'), h('h3', {}, invited ? `Convite para a sala ${code}` : 'Entrar numa sala')),
    h('p', { class: 'hint' }, invited ? 'Confira seu nome e toque em Entrar.' : 'Digite o código de 4 letras que seu amigo mandou.'),
    h('div', { class: 'join-row' }, codeInput, h('button', { class: 'btn', type: 'submit' }, 'Entrar')));
  const createCard = h('div', { class: 'choice create' },
    h('div', { class: 'choice-head' }, icon('plus'), h('h3', {}, 'Criar sala nova')),
    h('p', { class: 'hint' }, 'Você escolhe o modo e manda o link para os amigos.'),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => go({ t: 'create' }) }, 'Criar sala'));

  ctx.screen(
    h('div', { class: 'topbar' }, h('button', { class: 'btn ghost small', onclick: () => { setUrl(null); ctx.showMenu(); } }, icon('back'), 'Menu'), h('span', { class: 'topbar-title' }, icon('users', 'tiny'), arena ? 'Arena Pública' : 'Jogar com amigos')),
    h('div', { class: 'card multi-home' },
      who,
      errEl,
      arena
        ? h('div', { class: 'row-actions' }, h('button', { class: 'btn big', onclick: () => go({ t: 'quick' }) }, icon('zap'), 'Entrar na Arena'))
        : h('div', { class: 'choices' }, joinCard, invited ? h('button', { class: 'link-btn small center', type: 'button', onclick: () => go({ t: 'create' }) }, 'Prefiro criar uma sala nova') : createCard),
      arena ? '' : h('div', { class: 'home-extra' },
        h('button', { class: 'link-btn', type: 'button', onclick: () => go({ t: 'quick' }) }, icon('zap'), 'Arena Pública: jogar com desconhecidos'),
        h('a', { class: 'link-btn', href: '?tela=1', onclick: (e) => { e.preventDefault(); setUrl({ tela: '1' }); openTv(); } }, icon('tv'), 'Vai jogar na TV? Abrir o Telão')))
  );
  if (invited) nameInput.value ? codeInput.closest('form').querySelector('button[type=submit]').focus() : nameInput.focus();
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
    h('div', { class: 'topbar' }, h('button', { class: 'btn ghost small', onclick: () => { setUrl(null); ctx.showMenu(); } }, icon('back'), 'Menu'), h('span', { class: 'topbar-title' }, icon('tv', 'tiny'), 'Telão')),
    h('div', { class: 'card multi-home' },
      h('h2', {}, 'Modo Telão'),
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
    // Arena Sobrevivência: a sua vida
    const life = state?.play?.lifeEndsAt != null ? (state.play.alive ? state.play.lifeEndsAt - serverNow() : 0) : null;
    root.querySelectorAll('[data-life]').forEach((el) => {
      el.textContent = state.play.alive ? fmtTime(life / 1000) : '0:00';
      el.classList.toggle('danger', life < 10000);
    });
    // contagem 3-2-1 com bipe; nos últimos 10 s da rodada (ou da sua vida) o alerta dramático
    const sec = Math.ceil((life ?? left) / 1000);
    if (state?.endsAt && sec !== lastSecond && sec > 0 && state.phase === 'countdown' && sec <= 3) play('count');
    if (state?.phase === 'playing' && !state.spectator) {
      const lifeEl = root.querySelector('[data-life]');
      const clockEl = lifeEl && state.play.alive ? lifeEl : root.querySelector('[data-clock="time"]');
      timeAlert(clockEl, (lifeEl && state.play.alive ? life : left) / 1000);
    } else if (state?.phase === 'playing' && state.spectator) timeAlert(root.querySelector('[data-clock="time"]'), left / 1000);
    else clearTimeAlert();
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
    h('button', { class: 'btn ghost small', onclick: () => { if (tv || state.phase === 'lobby' || confirm('Sair da sala?')) leaveRoom(); } }, tv ? ['Fechar telão'] : [icon('back'), 'Sair']),
    h('span', { class: 'topbar-title' }, modeIcon(modeOf().id, 'tiny'), modeOf().name),
    h('span', { class: 'room-code-small' }, 'Sala ', h('strong', {}, state.code)),
    !tv ? h('a', { class: 'btn ghost small', href: `?tela=${state.code}`, target: '_blank', rel: 'noopener', title: 'Abrir o telão em outra aba/tela', 'aria-label': 'Abrir o telão' }, icon('tv')) : '',
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
    h('span', { class: 'pname' }, p.name, p.id === state.you ? h('small', {}, ' (você)') : '', p.id === state.hostId ? h('span', { class: 'host-mark', title: 'Anfitrião' }, icon('crown', 'tiny')) : '', p.connected ? '' : h('small', {}, ' · desconectado')),
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
function arenaLobby(s, el) {
  const mode = modeOf(s);
  const need = Math.max(0, 2 - s.players.length);
  el.replaceChildren(
    h('div', { class: 'card code-card arena-card' },
      h('p', { class: 'eyebrow' }, icon('zap', 'tiny'), ' Arena Pública'),
      h('h2', {}, mode.name),
      h('p', { class: 'hint' }, Object.entries(mode.options).map(([k, spec]) => `${spec.label}: ${formatOption(spec, s.options[k])}`).join(' · ')),
      s.endsAt
        ? h('div', { class: 'arena-count' }, 'Começa em ', h('strong', { 'data-clock': 'count' }, ''), 's')
        : h('div', { class: 'arena-count waiting' }, need ? `Esperando mais ${need} pessoa${need > 1 ? 's' : ''}…` : 'Preparando…')),
    h('div', { class: 'card' },
      h('h3', {}, `Na fila (${s.players.length}/8)`),
      h('ul', { class: 'players' }, s.players.map((p) => playerRow(p, ''))),
      h('p', { class: 'hint' }, 'Partidas da Arena valem para o seu nível na liga da temporada.')),
    reactionsBar(),
    h('ul', { class: 'rules' }, mode.rules.map((r) => h('li', {}, r))));
}

// Convite: mandar o link da sala pelo WhatsApp, pelo menu do celular, copiar ou QR.
function shareBox(code, link, mode) {
  const text = `Bora jogar Trama comigo? ${mode ? `${mode.name} · ` : ''}sala ${code}: ${link}`;
  const qr = h('img', { class: 'qr share-qr hidden', alt: `QR code para entrar na sala ${code}` });
  return h('div', { class: 'share-box' },
    h('a', { class: 'link-text', href: link, onclick: (e) => { e.preventDefault(); copy(link); } }, link.replace(/^https?:\/\//, '')),
    h('div', { class: 'row-actions center' },
      h('a', { class: 'btn whatsapp', href: `https://wa.me/?text=${encodeURIComponent(text)}`, target: '_blank', rel: 'noopener' }, icon('chat'), 'Enviar no WhatsApp'),
      navigator.share ? h('button', { class: 'btn ghost', onclick: () => navigator.share({ title: 'Trama', text, url: link }).catch(() => {}) }, icon('share'), 'Enviar link') : '',
      h('button', { class: 'btn ghost', onclick: () => copy(link) }, icon('link'), 'Copiar link')),
    h('div', { class: 'row-actions center' },
      h('button', { class: 'btn ghost small', onclick: () => { if (!qr.src) qr.src = `api/qr?d=${encodeURIComponent(link)}`; qr.classList.toggle('hidden'); } }, icon('qr'), 'QR code'),
      h('a', { class: 'btn ghost small', href: `?tela=${code}`, target: '_blank', rel: 'noopener' }, icon('tv'), 'Abrir telão (TV)')),
    qr);
}

function lobbyView() {
  const el = h('div', { class: 'lobby' });
  return {
    el,
    update(s) {
      if (s.public) { arenaLobby(s, el); return; }
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
          h('span', { class: 'mode-icon' }, modeIcon(m.id)), h('span', { class: 'mode-text' }, h('strong', {}, m.name), h('small', {}, m.short)));
      const modes = Object.values(MULTI_MODES);
      el.replaceChildren(
        h('div', { class: 'card code-card' },
          h('p', {}, 'Código da sala'),
          h('div', { class: 'room-code' }, s.code),
          shareBox(s.code, link, mode)),
        h('div', { class: 'lobby-grid' },
          h('div', { class: 'card' },
            h('h3', {}, `Jogadores (${s.players.length})`),
            h('ul', { class: 'players' }, s.players.map((p) => playerRow(p, h('span', { class: 'ready' }, p.id === s.hostId ? '' : p.ready ? h('span', { class: 'ok' }, icon('check', 'tiny'), 'pronto') : h('span', { class: 'muted' }, 'esperando'))))),
            s.tv ? h('p', { class: 'hint' }, icon('tv', 'inline'), ' Telão conectado: a partida aparece grande na TV.') : ''),
          h('div', { class: 'card' },
            h('h3', {}, host ? 'Escolha o modo' : 'Modo escolhido'),
            h('p', { class: 'group-label' }, 'Clássicos'),
            h('div', { class: 'mode-grid tight' }, modes.filter((m) => m.category === 'classico').map(modeCard)),
            h('p', { class: 'group-label novo' }, 'Novos · exclusivos Trama'),
            h('div', { class: 'mode-grid tight' }, modes.filter((m) => m.category === 'novo').map(modeCard)),
            h('ul', { class: 'rules' }, mode.rules.map((r) => h('li', {}, r)), mode.game === 'grade' ? h('li', {}, `Pontos: ${POINTS_HINT}`) : ''),
            Object.entries(mode.options).map(([k, spec]) => opt(k, spec)))),
        h('div', { class: 'row-actions center' },
          host
            ? h('button', { class: 'btn big', onclick: () => net.send({ t: 'start' }) }, `Começar partida (${readyCount}/${s.players.length} prontos)`)
            : h('button', { class: `btn big ${me()?.ready ? 'ghost' : ''}`, onclick: () => net.send({ t: 'ready', ready: !me()?.ready }) }, me()?.ready ? 'Não estou pronto' : 'Estou pronto!')),
        !host ? h('p', { class: 'section-sub center' }, 'Aguardando o anfitrião começar a partida…') : s.players.length < 2 ? h('p', { class: 'section-sub center' }, 'Mande o código para os amigos. Dá para começar sozinho para testar.') : '',
        reactionsBar()
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
          h('h3', {}, modeIcon(mode.id, 'tiny'), ` ${mode.name} `, h('span', { class: `badge ${mode.category}` }, mode.category === 'classico' ? 'clássico' : 'novo')),
          h('ul', { class: 'rules' }, mode.rules.map((r) => h('li', {}, r))),
          h('p', { class: 'hint' }, Object.entries(mode.options).map(([k, spec]) => `${spec.label}: ${formatOption(spec, s.options[k])}`).join(' · '))),
        h('div', { class: 'tv-players' },
          s.players.length
            ? s.players.map((p) => h('div', { class: `tv-player ${p.connected ? '' : 'off'}` }, h('div', { class: 'tv-avatar', style: `--hue:${hueOf(p.id)}` }, p.avatar), h('div', {}, p.name), h('small', {}, p.id === s.hostId ? 'anfitrião' : p.ready ? 'pronto' : '…')))
            : h('p', { class: 'section-sub' }, 'Ninguém entrou ainda. O primeiro a entrar vira o anfitrião.')),
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
      h('p', { class: 'section-sub' }, `${modeOf(s).name} — ${modeOf(s).short}`),
      s.teams && s.teams.of[s.you] ? h('p', { class: 'team-banner', style: `--hue:${TEAMS[s.teams.of[s.you]].hue}` }, `Você está no ${TEAMS[s.teams.of[s.you]].avatar} ${TEAMS[s.teams.of[s.you]].name}`) : ''),
    update() {},
  };
}

function hudBar(s, ...extra) {
  return h('div', { class: 'hud' },
    h('div', { class: 'hud-item hud-time' }, h('span', {}, 'Tempo'), h('strong', { 'data-clock': 'time' }, '')),
    h('div', { class: 'hud-item' }, h('span', {}, 'Rodada'), h('strong', {}, `${s.round}/${s.options.rounds}`)),
    ...extra);
}

// ----- Grade (jogador) -----
function gradePlay(s) {
  const wg = createWordGrid({
    size: s.play.size,
    letters: s.play.grid,
    bonus: s.play.bonus || {},
    onSubmit: async (w, path) => {
      const r = await net.act('submit', { word: w, path });
      // erro só pisca em vermelho/amarelo na grade; acerto mostra os pontos
      if (r.ok) toast(root, `${r.mult > 1 ? `×${r.mult}! ` : ''}+${r.pts}${r.gain ? ` · ❤️+${r.gain}s` : ''}`, 'good');
      return r;
    },
  });
  const mode = modeOf(s);
  const myPts = h('strong', {}, '0');
  const myCount = h('strong', {}, '0');
  const aliveEl = h('strong', {}, '');
  const teamEl = h('strong', { class: 'team-score' }, '');
  const deadEl = h('div', { class: 'eliminated hidden' }, h('strong', {}, 'Você foi eliminado'), h('span', {}, 'Acompanhe quem vai sobreviver!'));
  const hud = mode.survival
    ? h('div', { class: 'hud' },
        h('div', { class: 'hud-item hud-time life' }, h('span', {}, 'Sua vida'), h('strong', { 'data-life': '1' }, '')),
        h('div', { class: 'hud-item' }, h('span', {}, 'Vivos'), aliveEl),
        h('div', { class: 'hud-item' }, h('span', {}, 'Pontos'), myPts),
        h('div', { class: 'hud-item' }, h('span', {}, 'Palavras'), myCount))
    : hudBar(s,
        mode.teams ? h('div', { class: 'hud-item' }, h('span', {}, 'Times'), teamEl) : h('div', { class: 'hud-item' }, h('span', {}, 'Pontos'), myPts),
        h('div', { class: 'hud-item' }, h('span', {}, 'Palavras'), myCount));
  const el = h('div', { class: 'playing' }, hud, h('div', { class: 'play-area' }, wg.el, deadEl));
  return {
    el,
    update(st) {
      myPts.textContent = me()?.roundPoints ?? 0;
      myCount.textContent = st.play?.myWords?.length ?? 0;
      if (mode.survival) {
        aliveEl.textContent = `${st.players.filter((p) => p.roundPoints >= 0).length}/${st.players.length}`;
        if (st.play && !st.play.alive && deadEl.classList.contains('hidden')) { deadEl.classList.remove('hidden'); wg.disable(); play('end'); }
      }
      if (mode.teams && st.teams) {
        const sum = { A: st.teams.totals.A, B: st.teams.totals.B };
        for (const p of st.players) if (p.team) sum[p.team] += p.roundPoints;
        teamEl.textContent = `🔴 ${sum.A} × ${sum.B} 🔵`;
        myCount.textContent = st.play?.teamWords?.length ?? myCount.textContent;
      }
    },
    destroy: () => wg.destroy(),
  };
}

// ----- Grade (telão) -----
function gradeTv(s) {
  const bonus = s.play.bonus || {};
  const tiles = h('div', { class: 'board tv-board', style: `--n:${s.play.size}` }, s.play.grid.map((l, i) => h('div', { class: `tile ${bonus[i] ? 'has-bonus' : ''}` }, h('span', {}, l.toUpperCase()), bonus[i] ? h('em', { class: 'bonus' }, bonus[i]) : '')));
  const board = liveBoard(s, { title: modeOf(s).survival ? '❤️ Vidas' : 'Placar ao vivo' });
  const teamEl = h('div', { class: 'tv-teams' });
  return {
    el: h('div', { class: 'playing' }, hudBar(s), teamEl, h('div', { class: 'play-area' }, tiles, board.el)),
    update: (st) => {
      board.update(st);
      if (st.teams) {
        const sum = { A: st.teams.totals.A, B: st.teams.totals.B };
        for (const p of st.players) if (p.team) sum[p.team] += p.roundPoints;
        teamEl.replaceChildren(...['A', 'B'].map((k) => h('div', { class: 'tv-team', style: `--hue:${TEAMS[k].hue}` }, `${TEAMS[k].avatar} ${TEAMS[k].name}`, h('strong', {}, sum[k]))));
      }
    },
  };
}

// ----- Caça-Palavras Corrida (jogador e telão) -----
function wsPlay(s, interactive) {
  const ws = createWsBoard({
    grid: s.play.grid,
    size: s.play.size,
    free: !!s.play.free,
    interactive,
    onMark: async (cells) => {
      const r = await net.act('mark', { cells });
      if (r.ok) {
        toast(root, `${r.extra ? 'Extra! ' : ''}${r.word.toUpperCase()} +${r.pts}`, 'good');
        play(r.extra ? 'good' : 'big');
        if (r.extra) { ws.flash(cells, 'good'); extras.prepend(h('li', { class: 'done' }, r.word.toUpperCase(), h('small', {}, ` +${r.pts}`))); }
      } else if (r.dup && !/primeiro/.test(r.reason || '')) { ws.flash(cells, 'dup'); play('dup'); }
      else if (r.dup) { toast(root, r.reason, 'dup'); play('steal'); }
      else { ws.flash(cells, 'bad'); play('bad'); }
    },
  });
  const extras = h('ul', { class: 'ws-list extras' });
  const list = h('ul', { class: 'ws-list race' });
  const board = liveBoard(s);
  const myPts = h('strong', {}, '0');
  let known = 0;
  const el = h('div', { class: 'playing' },
    hudBar(s, h('div', { class: 'hud-item' }, h('span', {}, interactive ? 'Meus pontos' : 'Achadas'), interactive ? myPts : h('strong', { class: 'ws-count' }, '0'))),
    h('h2', { class: 'theme-title' }, s.play.free ? 'Mistura · sem tema' : `Tema: ${s.play.theme}`),
    h('div', { class: 'play-area' }, ws.el, h('div', { class: 'side-col' },
      h('div', { class: 'found-panel' }, h('h3', {}, 'Palavras'), list),
      s.play.free && interactive ? h('div', { class: 'found-panel' }, h('h3', {}, 'Suas extras'), extras) : '',
      interactive ? '' : board.el)));
  return {
    el,
    update(st) {
      ws.update(st.play.words, hueOf);
      board.update(st);
      myPts.textContent = me()?.roundPoints ?? 0;
      const found = st.play.words.filter((w) => w.by).length;
      if (!interactive) {
        if (found > known) play('good');
        el.querySelector('.ws-count').textContent = found;
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

  const teamMode = !!r.teamScores;
  const podium = final && teamMode
    ? h('div', { class: 'tv-teams final' }, ['A', 'B'].map((k) => h('div', { class: `tv-team ${s.teams.totals[k] >= s.teams.totals[k === 'A' ? 'B' : 'A'] ? 'win' : ''}`, style: `--hue:${TEAMS[k].hue}` }, `${TEAMS[k].avatar} ${TEAMS[k].name}`, h('strong', {}, s.teams.totals[k]))))
    : final
    ? h('div', { class: 'podium' }, [1, 0, 2].map((i) => {
        const x = standings[i];
        if (!x) return h('div', { class: 'podium-spot empty' });
        const p = byId[x.id];
        return h('div', { class: `podium-spot p${i + 1}` },
          h('div', { class: 'podium-avatar' }, p.avatar),
          h('div', { class: 'podium-name' }, p.name),
          h('div', { class: 'podium-pts' }, `${x.total} pts`),
          h('div', { class: 'podium-block' }, `${i + 1}º`));
      }))
    : '';

  let delay = 0;
  const stagger = () => `animation-delay:${Math.min((delay += 0.02), 0.8)}s`;
  const wordChip = (w) =>
    h('span', { class: `wchip ${w.status}`, style: stagger(), title: w.status === 'unique' ? 'Só esta pessoa achou' : `${w.by} pessoas acharam` },
      w.status === 'unique' ? '★ ' : '', w.w.toUpperCase(), w.status === 'shared' ? h('span', { class: 'by-count', 'aria-label': `${w.by} pessoas` }, `×${w.by}`) : '', h('small', {}, `+${w.pts}`));

  const detailFor = (id) => {
    const d = r.players?.[id];
    if (!d) return h('small', { class: 'muted' }, 'Entrou depois desta rodada');
    if (r.type === 'grade') return d.words.length ? [tank(d.unique, d.shared, 'small'), ...d.words.map(wordChip)] : h('small', { class: 'muted' }, 'Nenhuma palavra');
    if (r.type === 'wordsearch') {
      const ex = d.extras || [];
      return d.found.length || ex.length
        ? [...d.found.map((w) => h('span', { class: 'wchip mine', style: `${stagger()};--hue:${hueOf(id)}` }, w.toUpperCase())),
          ...ex.map((w) => h('span', { class: 'wchip', style: stagger(), title: 'Palavra extra' }, '+ ', w.toUpperCase()))]
        : h('small', { class: 'muted' }, 'Nenhuma palavra');
    }
    if (r.type === 'sudoku') {
      return h('small', {}, d.done ? `Terminou em ${d.place}º · ${fmtTime(d.seconds)} · ${d.errors} erro(s)` : `Não terminou · ${d.filled}/${r.empty} números certos · ${d.errors} erro(s)`);
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
        h('span', { class: 'rp-total' }, `${x.total} pts`),
        x.id !== s.you && !s.spectator ? h('button', { class: 'report-btn', title: `Denunciar ${p.name}`, onclick: () => reportPlayer(p, s.code), 'aria-label': `Denunciar ${p.name}` }, icon('flag', 'tiny')) : ''),
      h('div', { class: 'wchips' }, detailFor(x.id)));
  });

  let extra = '';
  let legend = '';
  if (r.type === 'grade') {
    legend = h('p', { class: 'legend' },
      h('span', { class: 'wchip unique' }, '★ única'),
      h('span', { class: 'wchip shared' }, 'repetida ', h('span', { class: 'by-count' }, '×2')),
      h('span', { class: 'legend-note' }, 'Únicas e repetidas valem os mesmos pontos.'));
    extra = h('div', {},
      r.totals ? h('div', { class: 'tank-box' }, h('h3', {}, 'Tanque da rodada'), tank(r.totals.unique, r.totals.shared, 'big'), h('p', { class: 'hint' }, `${r.totals.distinct} palavras diferentes achadas por todos`)) : '',
      r.missed?.length ? h('div', { class: 'missed' }, h('h4', {}, 'Algumas palavras que ninguém achou:'), h('p', {}, r.missed.map((w) => w.toUpperCase()).join(' · '))) : '');
  } else if (r.type === 'wordsearch') {
    const missing = r.words.filter((w) => !w.by);
    extra = h('p', { class: 'highlight' }, r.free ? 'Mistura' : `Tema: ${r.theme}`, missing.length ? ` · Ninguém achou: ${missing.map((w) => w.display.toUpperCase()).join(', ')}` : ' · Todas as palavras foram achadas!');
  } else if (r.type === 'sudoku') {
    extra = h('p', { class: 'highlight' }, `Sudoku ${DIFF[r.difficulty]} · bônus de pódio: 1º +500 · 2º +250 · 3º +100`);
  }

  const actions = h('div', { class: 'row-actions center hidden' });
  const globalEl = h('div', { class: 'global-pos' });
  const progressEl = h('div', { class: 'global-pos' }); // nível e conquistas novas
  const statsPanel = h('div', { class: 'stats-panel hidden' }, extra, legend, h('div', { class: 'result-list' }, rows));
  const statsBtn = h('button', { class: 'btn ghost', onclick: () => {
    const open = statsPanel.classList.toggle('hidden') === false;
    statsBtn.replaceChildren(icon('chart'), open ? 'Fechar estatísticas' : 'Mais estatísticas');
    if (open) statsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } }, icon('chart'), 'Mais estatísticas');
  const after = h('div', { class: 'after-reveal hidden' }, podium, longestCards(r, byId), progressEl, globalEl, h('div', { class: 'row-actions center' }, statsBtn), statsPanel);

  // 1º a animação; depois pódio, posição global, estatísticas e botões
  const teamRound = teamMode ? teamRoundFor(r, s) : null;
  const reveal = createReveal({
    round: teamRound || r,
    players: teamMode ? ['A', 'B'].map((k) => ({ id: k, name: TEAMS[k].name, avatar: TEAMS[k].avatar })) : s.players.filter((p) => r.scores && p.id in r.scores),
    totals: teamMode ? { ...s.teams.totals } : Object.fromEntries(s.standings.map((x) => [x.id, x.total])),
    you: teamMode ? s.teams.of[s.you] : s.you,
    hueOf: teamMode ? (k) => TEAMS[k].hue : hueOf,
    final,
    onDone: () => {
      after.classList.remove('hidden');
      actions.classList.remove('hidden');
      if (final && !s.spectator) {
        showGlobalPosition(s, globalEl);
        showRatingAndAchievements(s, progressEl);
      }
    },
  });

  const el = h('div', { class: 'results card' },
    h('h2', {}, final ? 'Fim de jogo!' : `Fim da rodada ${s.round} de ${s.options.rounds}`),
    reveal.el,
    after,
    actions,
    s.spectator ? '' : reactionsBar());

  return {
    el,
    destroy: () => reveal.destroy(),
    update(st) {
      if (st.spectator) {
        const hp = playerById(st.hostId);
        actions.replaceChildren(h('p', { class: 'section-sub' }, hp ? `${hp.name} ${final ? 'pode iniciar a revanche' : 'inicia a próxima rodada'} pelo celular.` : ''));
        return;
      }
      if (st.public) {
        actions.replaceChildren(
          final
            ? h('button', { class: 'btn big', onclick: requeueArena }, '⚡ Jogar outra na Arena')
            : h('p', { class: 'section-sub' }, 'Próxima rodada em ', h('strong', { 'data-clock': 'count' }, ''), 's'),
          h('button', { class: 'btn ghost', onclick: leaveRoom }, 'Sair'));
        return;
      }
      actions.replaceChildren(
        isHost()
          ? h('button', { class: 'btn big', onclick: () => net.send({ t: final ? 'rematch' : 'next' }) }, final ? 'Revanche' : 'Próxima rodada')
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

// Times: a animação mostra o time ganhando pontos (palavras dos integrantes somadas).
function teamRoundFor(r, s) {
  const players = { A: { words: [] }, B: { words: [] } };
  for (const [id, d] of Object.entries(r.players || {})) {
    const t = r.teamOf?.[id];
    if (t) players[t].words.push(...d.words);
  }
  return { ...r, players, scores: { ...r.teamScores }, extras: [] };
}

// Nível (Elo) da Arena e conquistas novas, depois do pódio.
function showRatingAndAchievements(s, el) {
  const mine = s.players.find((p) => p.id === s.you);
  if (mine?.rating) {
    const r = mine.rating;
    const before = leagueOf(r.before);
    const after = leagueOf(r.after);
    el.append(h('p', { class: `rating-change ${r.delta >= 0 ? 'up' : 'down'}` },
      `Nível ${r.before} → `, h('strong', {}, String(r.after)), ` (${r.delta >= 0 ? '+' : ''}${r.delta})`,
      before.key !== after.key ? h('span', { class: 'league-up' }, r.delta > 0 ? ` · Subiu para ${after.name}!` : ` · Caiu para ${after.name}`) : ` · ${after.name}`));
  }
  const fresh = (s.myAchievements || []).map((k) => achievementByKey[k]).filter(Boolean);
  if (fresh.length) {
    markSeenAchievements(fresh.map((a) => a.key));
    el.append(h('div', { class: 'achv-new' }, h('p', {}, icon('medal', 'inline'), ' Conquista nova!'), h('div', { class: 'achv-list' }, fresh.map((a) => h('span', { class: 'achv-pill' }, a.name)))));
    play('win');
  }
}

async function reportPlayer(p, room) {
  const motivo = prompt(`Denunciar ${p.name}? Conte rapidamente o motivo (nome ofensivo, trapaça, etc.):`);
  if (motivo == null) return;
  try {
    await api('denuncia', { method: 'POST', body: { nome: p.name, sala: room, motivo } });
    toast(root, 'Denúncia enviada. Obrigado!', 'good');
  } catch (e) {
    toast(root, e.message, 'bad');
  }
}

// Maior palavra que existia na grade × maior palavra que alguém achou.
function longestCards(r, byId) {
  if (r.type !== 'grade' || (!r.longestPossible && !r.longest)) return '';
  const card = (label, w, who) => h('div', { class: 'longest-card' },
    h('span', { class: 'lc-label' }, label),
    h('strong', { class: 'lc-word' }, w ? w.toUpperCase() : '—'),
    h('span', { class: 'lc-sub' }, w ? `${w.length} letras${who ? ` · ${who}` : ''}` : 'ninguém achou'));
  return h('div', { class: 'longest-row' },
    card('Maior palavra encontrada', r.longest?.w, r.longest ? byId[r.longest.id]?.name : ''),
    card('Maior palavra da grade', r.longestPossible, ''));
}
