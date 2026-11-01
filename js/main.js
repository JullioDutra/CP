import { h } from './core/ui.js';
import { loadDict } from './core/dict.js';
import { getRanking, addScore, qualifies, getPlayerName, setPlayerName, clearRanking } from './core/ranking.js';

// Modos clássicos e modos novos ficam em pastas e seções separadas.
import grade from './modes/classicos/grade.js';
import cacapalavras from './modes/classicos/cacapalavras.js';
import sudoku from './modes/classicos/sudoku.js';
import sobrevivencia from './modes/novos/sobrevivencia.js';
import diario from './modes/novos/diario.js';
import { initMulti, openMulti, roomCodeFromUrl, multiRankingModes } from './multi/multi.js';

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
    h('header', { class: 'brand' }, h('h1', {}, 'Trama'), h('p', {}, 'Jogos de letras e lógica')),
    h(
      'section',
      { class: 'mode-section multi' },
      h('h2', {}, '👥 Jogar com amigos ', h('span', { class: 'tag live' }, 'ao vivo')),
      h('p', { class: 'section-sub' }, 'Todos na mesma grade, ao mesmo tempo. Sem cadastro: coloque seu nome, escolha um avatar e crie a sala.'),
      h(
        'div',
        { class: 'multi-cta' },
        h('button', { class: 'btn big', onclick: () => openMulti() }, 'Criar ou entrar numa sala'),
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
    h('div', { class: 'row-actions center' }, h('button', { class: 'btn', onclick: () => showRanking() }, '🏆 Ranking'))
  );
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
  return h('div', { class: 'topbar' }, h('button', { class: 'btn ghost small', onclick: showMenu }, '← Menu'), h('span', {}, `${m.icon} ${m.name}`));
}

// ---------- Partida ----------
function play(m, opts = {}) {
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
  setTimeout(() => {
    root.replaceChildren();
    cleanup = m.start(root, api, opts) || null;
  }, 30);
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
      saveArea,
      result.extra || null,
      h('h3', {}, 'Ranking — ' + m.name + (m.options ? ` (${m.options.choices.find(([v]) => v === opts[m.options.key])?.[1]})` : '')),
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

function showRanking(selected) {
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
          label ? h('h3', {}, label) : null,
          rankingTable(id),
          getRanking(id).length
            ? h('button', {
                class: 'btn ghost small',
                onclick: () => { if (confirm('Apagar este ranking?')) { clearRanking(id); select(m); } },
              }, 'Limpar ranking')
            : null
        )
      )
    );
  }

  const group = (title, list) =>
    h('div', { class: 'tab-group' }, h('span', { class: 'tab-title' }, title), list.map((m) => h('button', { class: `chip ${m.category}`, 'data-id': m.id, onclick: () => select(m) }, `${m.icon} ${m.name}`)));
  tabs.append(group('Em grupo', multiRankingModes), group('Clássicos', CLASSICOS), group('Novos', NOVOS));

  screen(
    h('div', { class: 'topbar' }, h('button', { class: 'btn ghost small', onclick: showMenu }, '← Menu'), h('span', {}, '🏆 Ranking')),
    h('div', { class: 'card' }, h('p', { class: 'section-sub' }, 'Suas maiores pontuações por partida em cada modo (top 10, salvo neste aparelho). Em grupo, o pódio de cada partida aparece no fim do jogo.'), tabs, body)
  );
  select(selected);
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
    if (roomCodeFromUrl() || hasSession()) openMulti();
    else showMenu();
  } catch (e) {
    app.replaceChildren(
      h('div', { class: 'card' }, h('h2', {}, 'Erro ao carregar'), h('p', {}, e.message), h('p', {}, 'Abra o jogo por um servidor local (veja o README), não direto pelo arquivo.'))
    );
  }
})();
