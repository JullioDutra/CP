// Telas do multijogador: perfil (nome + avatar), saguão, rodada, revelação e pódio.
import { h, fmtTime, toast } from '../core/ui.js';
import { createWordGrid } from '../core/wordgrid.js';
import { AVATARS, MULTI_MODES, OPTION_CHOICES } from '../core/multimodes.js';
import { getPlayerName, setPlayerName, addScore } from '../core/ranking.js';
import { createNet } from './net.js';

const SESSION_KEY = 'trama.session';
const AVATAR_KEY = 'trama.avatar';

let ctx = null; // { screen, setCleanup, showMenu }
let net = null;
let state = null;
let offset = 0; // diferença entre o relógio do servidor e o local
let root = null; // container da sala
let view = null; // { key, update(state) }
let raf = null;
let savedFinal = null;

export const multiRankingModes = Object.values(MULTI_MODES).map((m) => ({ ...m, id: `multi-${m.id}` }));

export function initMulti(c) {
  ctx = c;
}

const store = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};
const getAvatar = () => { try { return localStorage.getItem(AVATAR_KEY) || AVATARS[0]; } catch { return AVATARS[0]; } };
const setAvatar = (a) => { try { localStorage.setItem(AVATAR_KEY, a); } catch { /* ignore */ } };
const serverNow = () => Date.now() + offset;
const me = () => state?.players.find((p) => p.id === state.you);
const isHost = () => state?.hostId === state?.you;
const modeOf = (s = state) => MULTI_MODES[s.options.mode];

function setUrl(code) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('sala', code);
  else url.searchParams.delete('sala');
  history.replaceState(null, '', url);
}

export function roomCodeFromUrl() {
  return (new URLSearchParams(location.search).get('sala') || '').toUpperCase().slice(0, 4);
}

// ---------- conexão ----------
function ensureNet(onFail) {
  if (net) return net;
  net = createNet({
    onOpen: () => {
      // ao (re)conectar, volta para a sala em que estava
      const s = store.get(SESSION_KEY);
      if (s) net.send({ t: 'resume', ...s });
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
    setUrl(msg.code);
  } else if (msg.t === 'state') {
    offset = msg.state.serverNow - Date.now();
    const first = !state;
    state = msg.state;
    if (first || !root?.isConnected) mountRoom();
    render();
  } else if (msg.t === 'error') {
    if (root?.isConnected) toast(root, msg.message, 'bad');
    else showHome({ error: msg.message });
  } else if (msg.t === 'expired') {
    store.set(SESSION_KEY, null);
    setUrl(null);
    showHome({ error: 'Essa sala não existe mais. Crie uma nova!' });
  } else if (msg.t === 'left') {
    store.set(SESSION_KEY, null);
  }
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
  if (s && (!urlCode || urlCode === s.code)) {
    // voltar para a sala em que já estava (ex.: recarregou a página)
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

  function go(action) {
    const name = nameInput.value.trim();
    if (!name) { errEl.textContent = 'Digite seu nome.'; nameInput.focus(); return; }
    if (action.t === 'join' && action.code.length !== 4) { errEl.textContent = 'O código da sala tem 4 letras.'; codeInput.focus(); return; }
    setPlayerName(name);
    setAvatar(avatar);
    store.set(SESSION_KEY, null);
    errEl.textContent = '';
    showConnecting();
    ensureNet((err) => showHome({ code: codeInput.value, error: err })).send({ ...action, name, avatar });
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
      h('p', { class: 'section-sub center' }, 'Sem cadastro: só nome e avatar. Quem criar a sala escolhe o modo e manda o código ou o link para os amigos.')
    )
  );
  if (code) nameInput.value ? codeInput.focus() : nameInput.focus();
}

// ---------- sala ----------
function mountRoom() {
  root = h('div', { class: 'room' });
  view = null;
  ctx.screen(root);
  ctx.setCleanup(() => { cancelAnimationFrame(raf); view?.destroy?.(); view = null; });
  const loop = () => {
    root.querySelectorAll('[data-clock]').forEach((el) => {
      const left = (state?.endsAt ?? 0) - serverNow();
      el.textContent = el.dataset.clock === 'count' ? Math.max(1, Math.ceil(left / 1000)) : fmtTime(left / 1000);
      el.classList.toggle('danger', el.dataset.clock !== 'count' && left < 10000);
    });
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

function render() {
  const key = `${state.phase}-${state.round}`;
  if (view?.key === key) { view.update(state); return; }
  view?.destroy?.();
  const make = { lobby: lobbyView, countdown: countdownView, playing: playingView, reveal: resultsView, final: resultsView }[state.phase];
  view = make(state);
  view.key = key;
  root.replaceChildren(roomHeader(), view.el);
  view.update(state);
}

function roomHeader() {
  return h(
    'div',
    { class: 'topbar room-top' },
    h('button', { class: 'btn ghost small', onclick: () => { if (state.phase === 'lobby' || confirm('Sair da sala?')) leaveRoom(); } }, '← Sair'),
    h('span', {}, `${modeOf().icon} ${modeOf().name}`),
    h('span', { class: 'room-code-small' }, 'Sala ', h('strong', {}, state.code))
  );
}

function playerRow(p, right = []) {
  return h(
    'li',
    { class: `player ${p.connected ? '' : 'off'} ${p.id === state.you ? 'me' : ''}` },
    h('span', { class: 'avatar' }, p.avatar),
    h('span', { class: 'pname' }, p.name, p.id === state.you ? h('small', {}, ' (você)') : null, p.id === state.hostId ? h('span', { title: 'Anfitrião' }, ' 👑') : null, p.connected ? null : h('small', {}, ' · desconectado')),
    right
  );
}

// ----- saguão -----
function lobbyView() {
  const el = h('div', { class: 'lobby' });
  return {
    el,
    update(s) {
      const host = isHost();
      const link = `${location.origin}${location.pathname}?sala=${s.code}`;
      const readyCount = s.players.filter((p) => p.ready || p.id === s.hostId).length;
      const opt = (key, label, fmt) =>
        h('div', { class: 'opt-row' }, h('span', {}, label),
          h('div', { class: 'chips' }, OPTION_CHOICES[key].map((v) =>
            h('button', { class: `chip ${s.options[key] === v ? 'on' : ''}`, disabled: !host, onclick: () => net.send({ t: 'options', options: { [key]: v } }) }, fmt(v)))));
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
            navigator.share ? h('button', { class: 'btn ghost small', onclick: () => navigator.share({ title: 'Trama', text: `Entra na minha sala do Trama! Código ${s.code}`, url: link }).catch(() => {}) }, '📤 Compartilhar') : null)),
        h('div', { class: 'lobby-grid' },
          h('div', { class: 'card' },
            h('h3', {}, `Jogadores (${s.players.length})`),
            h('ul', { class: 'players' }, s.players.map((p) => playerRow(p, h('span', { class: 'ready' }, p.id === s.hostId ? '' : p.ready ? '✅ pronto' : '⏳'))))),
          h('div', { class: 'card' },
            h('h3', {}, host ? 'Escolha o modo' : 'Modo escolhido'),
            h('p', { class: 'group-label' }, 'Clássico'),
            h('div', { class: 'mode-grid tight' }, modes.filter((m) => m.category === 'classico').map(modeCard)),
            h('p', { class: 'group-label novo' }, 'Novo · exclusivo Trama'),
            h('div', { class: 'mode-grid tight' }, modes.filter((m) => m.category === 'novo').map(modeCard)),
            h('ul', { class: 'rules' }, modeOf(s).rules.map((r) => h('li', {}, r))),
            opt('rounds', 'Rodadas', (v) => v),
            opt('seconds', 'Tempo', (v) => fmtTime(v)),
            opt('size', 'Grade', (v) => `${v}×${v}`))),
        h('div', { class: 'row-actions center' },
          host
            ? h('button', { class: 'btn big', onclick: () => net.send({ t: 'start' }) }, `Começar partida (${readyCount}/${s.players.length} prontos)`)
            : h('button', { class: `btn big ${me()?.ready ? 'ghost' : ''}`, onclick: () => net.send({ t: 'ready', ready: !me()?.ready }) }, me()?.ready ? 'Não estou pronto' : 'Estou pronto!')),
        !host ? h('p', { class: 'section-sub center' }, 'Aguardando o anfitrião começar a partida…') : s.players.length < 2 ? h('p', { class: 'section-sub center' }, 'Mande o código para os amigos. Dá para começar sozinho para testar.') : ''
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

// ----- rodada -----
function playingView(s) {
  const wg = createWordGrid({
    size: s.size,
    letters: s.grid,
    onSubmit: async (w, path) => {
      const r = await net.submit(w, path);
      if (r.ok) toast(root, `+${r.pts}`, 'good');
      else toast(root, r.reason, r.dup ? 'dup' : 'bad');
      return r;
    },
  });
  const scoreboard = h('ol', { class: 'live-board' });
  const mine = h('ul', { class: 'found' });
  const myPts = h('strong', {}, '0');
  const myCount = h('h3', {}, 'Minhas palavras');
  const el = h('div', { class: 'playing' },
    h('div', { class: 'hud' },
      h('div', { class: 'hud-item' }, h('span', {}, 'Tempo'), h('strong', { 'data-clock': 'time' }, '')),
      h('div', { class: 'hud-item' }, h('span', {}, 'Rodada'), h('strong', {}, `${s.round}/${s.options.rounds}`)),
      h('div', { class: 'hud-item' }, h('span', {}, 'Meus pontos'), myPts)),
    h('div', { class: 'play-area' },
      wg.el,
      h('div', { class: 'side-col' },
        h('div', { class: 'found-panel' }, h('h3', {}, 'Placar ao vivo'), scoreboard,
          modeOf(s).sharedFactor === 0 ? h('p', { class: 'hint' }, 'Provisório: palavras repetidas serão anuladas no fim.') : null),
        h('div', { class: 'found-panel' }, myCount, mine))));
  return {
    el,
    update(st) {
      const players = st.players.slice().sort((a, b) => b.roundPoints - a.roundPoints);
      scoreboard.replaceChildren(...players.map((p) => playerRow(p, h('span', { class: 'live-pts' }, `${p.roundPoints} pts · ${p.roundWords} pal.`))));
      const words = st.myWords || [];
      myPts.textContent = me()?.roundPoints ?? 0;
      myCount.textContent = `Minhas palavras (${words.length})`;
      mine.replaceChildren(...words.slice().reverse().map((w) => h('li', {}, w.toUpperCase())));
    },
    destroy: () => wg.destroy(),
  };
}

// ----- revelação / pódio -----
function resultsView(s) {
  const final = s.phase === 'final';
  const r = s.lastRound;
  const byId = Object.fromEntries(s.players.map((p) => [p.id, p]));
  const standings = s.standings.filter((x) => byId[x.id]);
  const mode = modeOf(s);

  if (final) saveFinal(s, standings);

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
    : null;

  let delay = 0;
  const wordChip = (w) =>
    h('span', { class: `wchip ${w.status}`, style: `animation-delay:${Math.min((delay += 0.05), 4)}s`, title: w.status === 'cancelled' ? 'Anulada: outra pessoa também achou' : w.status === 'unique' ? 'Só você achou' : 'Outras pessoas também acharam' },
      w.w.toUpperCase(), h('small', {}, w.status === 'cancelled' ? '0' : `+${w.pts}`));

  const rows = standings.map((x, i) => {
    const p = byId[x.id];
    const pr = r.players[x.id] || { score: 0, words: [] };
    return h('div', { class: `result-player ${x.id === s.you ? 'me' : ''}` },
      h('div', { class: 'rp-head' },
        h('span', { class: 'rp-pos' }, i + 1, 'º'),
        h('span', { class: 'avatar' }, p.avatar),
        h('strong', {}, p.name),
        h('span', { class: 'rp-round' }, `+${pr.score} na rodada`),
        h('span', { class: 'rp-total' }, `${x.total} pts`)),
      h('div', { class: 'wchips' }, pr.words.length ? pr.words.map(wordChip) : h('small', { class: 'muted' }, 'Nenhuma palavra')));
  });

  const legend = h('p', { class: 'legend' },
    h('span', { class: 'wchip unique' }, 'só um achou'),
    mode.sharedFactor === 0 ? h('span', { class: 'wchip cancelled' }, 'anulada (repetida)') : h('span', { class: 'wchip shared' }, 'repetida'));

  const actions = h('div', { class: 'row-actions center' });
  const el = h('div', { class: 'results card' },
    h('h2', {}, final ? '🏆 Fim de jogo!' : `Fim da rodada ${s.round} de ${s.options.rounds}`),
    podium,
    r.longest ? h('p', { class: 'highlight' }, '📏 Maior palavra da rodada: ', h('strong', {}, r.longest.w.toUpperCase()), ` (${byId[r.longest.id]?.name || '—'})`) : null,
    legend,
    h('div', { class: 'result-list' }, rows),
    r.missed?.length ? h('div', { class: 'missed' }, h('h4', {}, `Palavras que ninguém achou (${r.possible} possíveis na grade):`), h('p', {}, r.missed.map((w) => w.toUpperCase()).join(' · '))) : null,
    actions);

  return {
    el,
    update(st) {
      state = st;
      const host = isHost();
      actions.replaceChildren(
        host
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
