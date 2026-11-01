import { h } from './core/ui.js';
import { loadDict } from './core/dict.js';
import { getRanking, addScore, qualifies, getPlayerName, setPlayerName, clearRanking } from './core/ranking.js';

// Modos clássicos e modos novos ficam em pastas e seções separadas.
import grade from './modes/classicos/grade.js';
import cacapalavras from './modes/classicos/cacapalavras.js';
import sudoku from './modes/classicos/sudoku.js';
import sobrevivencia from './modes/novos/sobrevivencia.js';
import diario from './modes/novos/diario.js';
import { initMulti, openMulti, openTv, roomCodeFromUrl, tvFromUrl, multiRankingModes } from './multi/multi.js';
import { muteButton } from './core/sound.js';
import { POINTS_HINT } from './core/letters.js';
import { showRanking as showRankingScreen, showProfile } from './screens/global.js';
import { saveIdentity, localProfile, getAvatar, serverStatus } from './core/profile.js';
import { finishOnline } from './core/online-solo.js';

const CLASSICOS = [grade, cacapalavras, sudoku];
const NOVOS = [sobrevivencia, diario];

const app = document.getElementById('app');
let cleanup = null;

function setCleanup(fn) {
  cleanup = fn;
}

function screen(...children) {
  cleanup?.();
  cleanup = null;
  app.replaceChildren(...children);
  window.scrollTo(0, 0);
}

const rankingVariants = (m) => m.rankingVariants || [[m.id, null]];

// ---------- Menu ----------
function modeCard(m) {
  return h(
    'button',
    { class: `mode-card ${m.category}`, onclick: () => showIntro(m) },
    h('span', { class: 'mode-icon' }, m.icon),
    h('span', { class: 'mode-text' }, h('strong', {}, m.name), h('small', {}, m.tagline)),
    h('span', { class: 'mode-best' }, bestLabel(m))
  );
}

function bestLabel(m) {
  const best = Math.max(0, ...rankingVariants(m).map(([id]) => getRanking(id)[0]?.score || 0));
  return best ? `Recorde ${best}` : '';
}

function showMenu() {
  screen(
    h('div', { class: 'menu-top' }, h('span', { class: 'spacer' }), profileChip()),
    h('header', { class: 'brand' }, h('h1', {}, 'Trama'), h('p', {}, 'Jogos de letras e lógica')),
    h(
      'section',
      { class: 'mode-section multi' },
      h('h2', {}, '👥 Jogar com amigos ', h('span', { class: 'tag live' }, 'ao vivo')),
      h('p', { class: 'section-sub' }, 'Todos no mesmo jogo, ao mesmo tempo. Sem cadastro: coloque seu nome, escolha um avatar e crie a sala. Tem TV? Abra o Telão e jogue pelo celular.'),
      h(
        'div',
        { class: 'multi-cta' },
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn big', onclick: () => openMulti() }, 'Criar ou entrar numa sala'),
          h('button', { class: 'btn ghost big', onclick: () => { history.replaceState(null, '', '?tela=1'); openTv(); } }, '📺 Abrir Telão')),
        h('div', { class: 'multi-modes' }, multiRankingModes.map((m) => h('span', { class: `pill ${m.category}` }, `${m.icon} ${m.name} · ${m.category === 'classico' ? 'clássico' : 'novo'}`)))
      )
    ),
    h(
      'section',
      { class: 'mode-section' },
      h('h2', {}, 'Modos Clássicos · solo'),
      h('p', { class: 'section-sub' }, 'Os formatos tradicionais do gênero, com regras conhecidas.'),
      h('div', { class: 'mode-grid' }, CLASSICOS.map(modeCard))
    ),
    h(
      'section',
      { class: 'mode-section novos' },
      h('h2', {}, 'Modos Novos · solo ', h('span', { class: 'tag' }, 'exclusivos Trama')),
      h('p', { class: 'section-sub' }, 'Variações criadas para o Trama, com mecânicas diferentes.'),
      h('div', { class: 'mode-grid' }, NOVOS.map(modeCard))
    ),
    h('div', { class: 'row-actions center' },
      h('button', { class: 'btn', onclick: () => showRanking() }, '🏆 Ranking global'),
      h('button', { class: 'btn ghost', onclick: () => showProfile(ctx) }, '👤 Meu perfil'))
  );
}

function profileChip() {
  const p = localProfile();
  const name = p?.name || getPlayerName();
  return h('button', { class: 'profile-chip', onclick: () => showProfile(ctx), title: 'Meu perfil' },
    h('span', { class: 'pc-avatar' }, p?.avatar || getAvatar()), name ? h('span', {}, name) : h('span', {}, 'Criar perfil'));
}

// ---------- Introdução do modo ----------
function showIntro(m) {
  const opts = {};
  let optEl = null;
  if (m.options) {
    opts[m.options.key] = m.options.default;
    const btns = m.options.choices.map(([val, label]) =>
      h('button', {
        class: `chip ${val === m.options.default ? 'on' : ''}`,
        onclick: (e) => {
          opts[m.options.key] = val;
          btns.forEach((b) => b.classList.remove('on'));
          e.currentTarget.classList.add('on');
        },
      }, label)
    );
    optEl = h('div', { class: 'options' }, h('span', {}, m.options.label + ':'), btns);
  }
  screen(
    topBar(m),
    h(
      'div',
      { class: 'intro card' },
      h('div', { class: 'intro-icon' }, m.icon),
      h('h2', {}, m.name),
      h('p', { class: 'badge ' + m.category }, m.category === 'classico' ? 'Modo clássico' : 'Modo novo'),
      h('ul', { class: 'rules' }, m.rules.map((r) => h('li', {}, r))),
      optEl,
      m.scoring ? h('p', { class: 'points-table' }, h('strong', {}, 'Pontos por palavra: '), POINTS_HINT) : '',
      m.globalRanking ? h('p', { class: 'hint center' }, '🌍 Este modo vale para o ranking global (com o servidor ligado).') : '',
      h(
        'div',
        { class: 'row-actions center' },
        h('button', { class: 'btn big', onclick: () => play(m, opts) }, 'Jogar'),
        h('button', { class: 'btn ghost', onclick: () => showRanking(m) }, 'Ver ranking')
      )
    )
  );
}

function topBar(m) {
  return h('div', { class: 'topbar' }, h('button', { class: 'btn ghost small', onclick: showMenu }, '← Menu'), h('span', {}, `${m.icon} ${m.name}`), h('span', { class: 'spacer' }), muteButton(h));
}

// ---------- Partida ----------
function play(m, baseOpts = {}) {
  const opts = { ...baseOpts };
  const root = h('div', { class: `game ${m.id}` });
  screen(topBar(m), root);
  let finished = false;
  const api = {
    end(result) {
      if (finished) return;
      finished = true;
      setTimeout(() => showResult(m, opts, result), 600);
    },
  };
  // pequena espera para a interface aparecer antes de gerar a grade
  root.append(h('p', { class: 'loading' }, 'Preparando…'));
  (async () => {
    // modos com ranking global pedem a grade ao servidor (se ele não responder, joga local)
    if (m.prepare) opts.online = await Promise.race([m.prepare(opts), new Promise((r) => setTimeout(() => r(null), 5000))]);
    await new Promise((r) => setTimeout(r, 30));
    if (!root.isConnected) return;
    root.replaceChildren();
    cleanup = m.start(root, api, opts) || null;
  })();
}

// Envia a partida solo ao servidor, que confere as palavras e devolve a posição no ranking global.
function onlineResult(result, m) {
  const el = h('div', { class: 'global-pos' }, h('p', { class: 'muted' }, '🌍 Enviando para o ranking global…'));
  finishOnline(result.online.ticket, result.online.palavras)
    .then((r) => {
      if (!r.ok) { el.replaceChildren(h('p', { class: 'notice' }, r.erro || 'A partida não entrou no ranking global.')); return; }
      if (!r.ranked) { el.replaceChildren(h('p', { class: 'muted' }, '🌍 Partida de treino: não conta no ranking global.')); return; }
      const pos = r.posicao;
      el.replaceChildren(pos
        ? h('div', { class: 'pos-cards' },
            h('p', {}, '🌍 Ranking global (conferido pelo servidor: ', h('strong', {}, `${r.score} pts`), ')'),
            h('div', { class: 'pos-row' }, (m.id === 'novo-diario' ? [['hoje', 'Desafio de hoje']] : [['hoje', 'Hoje'], ['semana', 'Semana'], ['sempre', 'Sempre']]).map(([k, label]) =>
              h('div', { class: 'pos-card' }, h('strong', {}, pos[k] ? `${pos[k]}º` : '—'), h('span', {}, label)))),
            h('button', { class: 'btn ghost small', onclick: () => showRanking(m) }, 'Ver ranking global'))
        : h('p', { class: 'muted' }, '🌍 Faça pelo menos 1 ponto para entrar no ranking global.'));
    })
    .catch((e) => el.replaceChildren(h('p', { class: 'muted' }, `🌍 Ranking global indisponível (${e.message}).`)));
  return el;
}

function showResult(m, opts, result) {
  const rankId = m.rankingKey ? m.rankingKey(opts) : m.id;
  const ranked = result.ranked !== false;
  const canRank = ranked && qualifies(rankId, result.score);
  const nameInput = h('input', { type: 'text', maxlength: 20, placeholder: 'Seu nome', value: getPlayerName() });
  const saveArea = h('div', { class: 'save' });
  const rankArea = h('div');

  function renderRank(highlight) {
    rankArea.replaceChildren(rankingTable(rankId, highlight));
  }

  if (canRank) {
    saveArea.append(
      h('p', { class: 'new-record' }, getRanking(rankId)[0]?.score < result.score || !getRanking(rankId).length ? '🏆 Novo recorde!' : 'Você entrou no ranking!'),
      h('form', {
        class: 'save-form',
        onsubmit: (e) => {
          e.preventDefault();
          const name = nameInput.value.trim() || 'Jogador';
          setPlayerName(name);
          saveIdentity(name, getAvatar()); // mantém o nome do perfil global igual
          const res = addScore(rankId, { name, score: result.score, detail: result.detail || null });
          saveArea.replaceChildren(h('p', { class: 'saved' }, res ? `Salvo! Você está em ${res.pos}º lugar.` : 'Salvo!'));
          renderRank(res?.id);
        },
      }, nameInput, h('button', { class: 'btn', type: 'submit' }, 'Salvar no ranking'))
    );
  } else if (!ranked) {
    saveArea.append(h('p', {}, 'Esta partida não conta para o ranking.'));
  } else if (result.score > 0) {
    saveArea.append(h('p', {}, 'Não foi dessa vez — o ranking guarda as 10 melhores partidas.'));
  }
  renderRank();

  screen(
    topBar(m),
    h(
      'div',
      { class: 'result card' },
      h('h2', {}, 'Fim de partida'),
      h('div', { class: 'big-score' }, result.score, h('small', {}, ' pontos')),
      h('dl', { class: 'summary' }, (result.summary || []).flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      result.online ? onlineResult(result, m) : '',
      saveArea,
      result.extra || '',
      h('h3', {}, 'Ranking neste aparelho — ' + m.name + (m.options ? ` (${m.options.choices.find(([v]) => v === opts[m.options.key])?.[1]})` : '')),
      rankArea,
      h(
        'div',
        { class: 'row-actions center' },
        h('button', { class: 'btn big', onclick: () => play(m, opts) }, 'Jogar de novo'),
        h('button', { class: 'btn ghost', onclick: showMenu }, 'Menu')
      )
    )
  );
  if (canRank) nameInput.focus();
}

// ---------- Ranking ----------
function rankingTable(rankId, highlightId) {
  const rows = getRanking(rankId);
  if (!rows.length) return h('p', { class: 'empty' }, 'Nenhuma partida registrada ainda. Seja o primeiro!');
  const medal = ['🥇', '🥈', '🥉'];
  return h(
    'table',
    { class: 'ranking' },
    h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Jogador'), h('th', {}, 'Pontos'), h('th', {}, 'Data'))),
    h(
      'tbody',
      {},
      rows.map((r, i) =>
        h(
          'tr',
          { class: r.id === highlightId ? 'me' : '' },
          h('td', {}, medal[i] || i + 1),
          h('td', {}, r.name),
          h('td', { class: 'num' }, r.score),
          h('td', { class: 'date' }, new Date(r.date).toLocaleDateString('pt-BR'))
        )
      )
    )
  );
}

// Ranking deste aparelho (localStorage), mostrado na aba "Neste aparelho".
function renderLocalRanking(container, selected) {
  const all = [...multiRankingModes, ...CLASSICOS, ...NOVOS];
  selected ||= all.find((m) => rankingVariants(m).some(([id]) => getRanking(id).length)) || all[0];
  const tabs = h('div', { class: 'tabs' });
  const body = h('div', { class: 'ranking-body' });

  function select(m) {
    tabs.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.id === m.id));
    body.replaceChildren(
      ...rankingVariants(m).map(([id, label]) =>
        h(
          'div',
          { class: 'rank-block' },
          label ? h('h3', {}, label) : '',
          rankingTable(id),
          getRanking(id).length
            ? h('button', {
                class: 'btn ghost small',
                onclick: () => { if (confirm('Apagar este ranking?')) { clearRanking(id); select(m); } },
              }, 'Limpar ranking')
            : ''
        )
      )
    );
  }

  const group = (title, list) =>
    h('div', { class: 'tab-group' }, h('span', { class: 'tab-title' }, title), list.map((m) => h('button', { class: `chip ${m.category}`, 'data-id': m.id, onclick: () => select(m) }, `${m.icon} ${m.name}`)));
  tabs.append(group('Em grupo', multiRankingModes), group('Clássicos', CLASSICOS), group('Novos', NOVOS));
  container.replaceChildren(h('p', { class: 'section-sub' }, 'Suas 10 maiores pontuações por partida em cada modo, salvas só neste aparelho.'), tabs, body);
  select(selected);
}

const ctx = { screen, showMenu, renderLocal: (el) => renderLocalRanking(el) };

function showRanking(selected) {
  const globalId = selected && (selected.globalRanking ? selected.id : null);
  return showRankingScreen(ctx, globalId ? { mode: globalId, tab: 'global' } : selected ? { tab: 'local' } : {});
}

// ---------- Início ----------
function hasSession() {
  try { return !!sessionStorage.getItem('trama.session'); } catch { return false; }
}

(async function init() {
  app.replaceChildren(h('p', { class: 'loading' }, 'Carregando dicionário…'));
  try {
    await loadDict();
    initMulti({ screen, setCleanup, showMenu });
    serverStatus(); // já descobre se há servidor (ranking global, IA)
    if (tvFromUrl() != null) openTv();
    else if (roomCodeFromUrl() || hasSession()) openMulti();
    else showMenu();
  } catch (e) {
    app.replaceChildren(
      h('div', { class: 'card' }, h('h2', {}, 'Erro ao carregar'), h('p', {}, e.message), h('p', {}, 'Abra o jogo por um servidor local (veja o README), não direto pelo arquivo.'))
    );
  }
})();
