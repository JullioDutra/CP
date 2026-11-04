import { h } from './core/ui.js';
import { icon, modeIcon } from './core/icons.js';
import { clearTimeAlert } from './core/timealert.js';
import { installButton } from './core/install.js';
import { mascotSay, mascotToggle } from './core/mascot.js';
import { confetti } from './core/fx.js';
import { loadDict } from './core/dict.js';
import { getRanking, addScore, qualifies, getPlayerName, setPlayerName, clearRanking } from './core/ranking.js';

// Modos clássicos e modos novos ficam em pastas e seções separadas.
import grade from './modes/classicos/grade.js';
import cacapalavras from './modes/classicos/cacapalavras.js';
import sudoku from './modes/classicos/sudoku.js';
import sobrevivencia from './modes/novos/sobrevivencia.js';
import diario from './modes/novos/diario.js';
import { initMulti, openMulti, openTv, openArena, roomCodeFromUrl, tvFromUrl, multiRankingModes } from './multi/multi.js';
import { applyTheme } from './core/theme.js';
import { achievementByKey } from './core/achievements.js';
import { markSeenAchievements } from './core/achv-toast.js';
import { muteButton } from './core/sound.js';
import { POINTS_HINT } from './core/letters.js';
import { showRanking as showRankingScreen, showProfile } from './screens/global.js';
import { saveIdentity, localProfile, getAvatar, serverStatus, api } from './core/profile.js';
import { createReveal } from './multi/reveal.js';
import { todayKey } from './core/rng.js';
import { finishOnline } from './core/online-solo.js';

const CLASSICOS = [grade, cacapalavras, sudoku];
const NOVOS = [sobrevivencia, diario];

const app = document.getElementById('app');
let cleanup = null;

function setCleanup(fn) {
  cleanup = fn;
}

function screen(...children) {
  clearTimeAlert();
  cleanup?.();
  cleanup = null;
  app.replaceChildren(...children);
  window.scrollTo(0, 0);
}

const rankingVariants = (m) => m.rankingVariants || [[m.id, null]];

// ---------- Menu ----------
function modeCard(m) {
  const best = bestLabel(m);
  return h(
    'button',
    { class: `mode-card ${m.category}`, onclick: () => showIntro(m) },
    h('span', { class: 'mode-icon' }, modeIcon(m.id)),
    h('span', { class: 'mode-text' }, h('strong', {}, m.name), h('small', {}, m.tagline)),
    best ? h('span', { class: 'mode-best' }, icon('star', 'tiny'), best) : ''
  );
}

function bestLabel(m) {
  const best = Math.max(0, ...rankingVariants(m).map(([id]) => getRanking(id)[0]?.score || 0));
  return best ? `${best}` : '';
}

// Marca: 2×2 peças com as letras T R A M.
function wordmark() {
  return h('div', { class: 'wordmark', 'aria-label': 'Trama' },
    h('span', { class: 'wm-tiles', 'aria-hidden': 'true' }, ['T', 'R', 'A', 'M'].map((l) => h('span', {}, l))),
    h('span', { class: 'wm-name' }, 'Trama'));
}

function showMenu() {
  const codeInput = h('input', { id: 'home-code', type: 'text', maxlength: 4, placeholder: 'ABCD', class: 'code-input', autocapitalize: 'characters', autocomplete: 'off', inputmode: 'text', 'aria-label': 'Código da sala' });
  codeInput.addEventListener('input', () => (codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '')));
  const joinErr = h('p', { class: 'form-error' });
  screen(
    h('header', { class: 'home-top' },
      wordmark(),
      h('span', { class: 'spacer' }),
      installButton('btn ghost small'),
      h('button', { class: 'btn ghost small icon-btn', onclick: () => showRanking(), title: 'Ranking', 'aria-label': 'Ranking' }, icon('trophy')),
      profileChip()),
    h('section', { class: 'hero' },
      h('div', { class: 'hero-text' },
        h('p', { class: 'eyebrow' }, h('span', { class: 'live-dot' }), 'Ao vivo · sem cadastro'),
        h('h1', {}, 'Palavras com os amigos, todo mundo ao mesmo tempo.'),
        h('p', { class: 'lead' }, 'Crie uma sala, mande o link no grupo e veja quem faz mais pontos. Funciona no celular, no computador e na TV.')),
      h('div', { class: 'join-panel' },
        h('form', { class: 'join-box', onsubmit: (e) => {
          e.preventDefault();
          if (codeInput.value.length !== 4) { joinErr.textContent = 'O código tem 4 letras.'; codeInput.focus(); return; }
          openMulti({ code: codeInput.value, auto: true });
        } },
          h('label', { for: 'home-code', class: 'join-label' }, 'Entrar com código'),
          h('div', { class: 'join-row' }, codeInput, h('button', { class: 'btn', type: 'submit' }, icon('enter'), 'Entrar')),
          joinErr),
        h('div', { class: 'or' }, h('span', {}, 'ou')),
        h('button', { class: 'btn ghost wide', onclick: () => openMulti({ create: true }) }, icon('plus'), 'Criar sala nova'),
        h('div', { class: 'hero-links' },
          h('button', { class: 'link-btn', onclick: () => openArena() }, icon('zap'), h('span', {}, 'Arena Pública', arenaStatusEl())),
          h('button', { class: 'link-btn', onclick: () => { history.replaceState(null, '', '?tela=1'); openTv(); } }, icon('tv'), 'Modo Telão')))),
    h('section', { class: 'home-section' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Jogar sozinho'), h('p', { class: 'section-sub' }, 'Treine, bata seu recorde e entre no ranking.')),
      h('p', { class: 'group-label' }, 'Clássicos'),
      h('div', { class: 'mode-grid' }, CLASSICOS.map(modeCard)),
      h('p', { class: 'group-label novo' }, 'Exclusivos do Trama'),
      h('div', { class: 'mode-grid' }, NOVOS.map(modeCard))),
    h('section', { class: 'home-section' },
      h('div', { class: 'section-head' }, h('h2', {}, 'Modos em grupo'), h('p', { class: 'section-sub' }, 'Quem cria a sala escolhe o modo.')),
      h('div', { class: 'group-modes' }, multiRankingModes.map((m) => h('div', { class: `gm ${m.category}` }, h('span', { class: 'gm-icon' }, modeIcon(m.id.replace(/^multi-/, ''))), h('span', {}, h('strong', {}, m.name), h('small', {}, m.short)))))),
    h('footer', { class: 'home-foot' },
      h('button', { class: 'link-btn', onclick: () => showRanking() }, icon('trophy'), 'Ranking global'),
      h('button', { class: 'link-btn', onclick: () => showProfile(ctx) }, icon('user'), 'Meu perfil'),
      installButton('link-btn'),
      mascotToggle('link-btn'))
  );
}

function profileChip() {
  const p = localProfile();
  const name = p?.name || getPlayerName();
  const extra = h('span', { class: 'pc-extra' });
  if (p?.token) api('perfil').then(({ stats }) => {
    extra.replaceChildren(stats.streak ? h('span', { class: 'pc-streak', title: 'Dias seguidos no Desafio do Dia' }, icon('flame', 'tiny'), stats.streak) : '');
  }).catch(() => {});
  return h('button', { class: 'profile-chip', onclick: () => showProfile(ctx), title: 'Meu perfil: trocar nome e avatar' },
    h('span', { class: 'pc-avatar' }, p?.avatar || getAvatar()), h('span', { class: 'pc-name' }, name || 'Criar perfil'), extra, icon('edit', 'tiny muted'));
}

// "3 esperando · 5 jogando" na Arena Pública
function arenaStatusEl() {
  const el = h('small', { class: 'arena-status' });
  serverStatus().then((ok) => ok && api('arena').then((a) => {
    el.textContent = a.waiting || a.playing ? ` ${a.waiting} esperando · ${a.playing} jogando` : '';
  })).catch(() => {});
  return el;
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
      h('div', { class: 'intro-icon' }, modeIcon(m.id)),
      h('h2', {}, m.name),
      h('p', { class: 'badge ' + m.category }, m.category === 'classico' ? 'Modo clássico' : 'Modo novo'),
      h('ul', { class: 'rules' }, m.rules.map((r) => h('li', {}, r))),
      optEl,
      m.scoring ? h('p', { class: 'points-table' }, h('strong', {}, 'Pontos por palavra: '), POINTS_HINT) : '',
      m.globalRanking ? h('p', { class: 'hint' }, icon('globe', 'inline'), ' Vale para o ranking global.') : '',
      h(
        'div',
        { class: 'row-actions center' },
        h('button', { class: 'btn big', onclick: () => play(m, opts) }, icon('play'), 'Jogar'),
        h('button', { class: 'btn ghost', onclick: () => showRanking(m) }, 'Ver ranking')
      )
    )
  );
}

function topBar(m) {
  return h('div', { class: 'topbar' }, h('button', { class: 'btn ghost small', onclick: showMenu }, icon('back'), 'Menu'), h('span', { class: 'topbar-title' }, modeIcon(m.id, 'tiny'), m.name), h('span', { class: 'spacer' }), muteButton(h));
}

// ---------- Partida ----------
function play(m, baseOpts = {}) {
  const opts = { ...baseOpts };
  const root = h('div', { class: `game ${m.id}` });
  screen(topBar(m), root);
  let finished = false;
  const gameApi = {
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
    cleanup = m.start(root, gameApi, opts) || null;
  })();
}

// Envia a partida solo ao servidor, que confere as palavras e devolve a posição no ranking global.
function onlineResult(result, m) {
  const el = h('div', { class: 'global-pos' }, h('p', { class: 'muted' }, 'Enviando para o ranking global…'));
  (result._online ||= finishOnline(result.online.ticket, result.online.palavras, result.online.log))
    .then((r) => {
      if (!r.ok) { el.replaceChildren(h('p', { class: 'notice' }, r.erro || 'A partida não entrou no ranking global.')); return; }
      if (!r.ranked) { el.replaceChildren(h('p', { class: 'muted' }, 'Partida de treino: não conta no ranking global.')); return; }
      const pos = r.posicao;
      const fresh = (r.conquistas || []).map((k) => achievementByKey[k]).filter(Boolean);
      if (fresh.length) markSeenAchievements(fresh.map((a) => a.key));
      el.replaceChildren(fresh.length ? h('div', { class: 'achv-new' }, h('p', {}, icon('medal', 'inline'), ' Conquista nova!'), h('div', { class: 'achv-list' }, fresh.map((a) => h('span', { class: 'achv-pill' }, a.name)))) : '', pos
        ? h('div', { class: 'pos-cards' },
            h('p', {}, 'Ranking global (conferido pelo servidor: ', h('strong', {}, `${r.score} pts`), ')'),
            h('div', { class: 'pos-row' }, (m.id === 'novo-diario' ? [['hoje', 'Desafio de hoje']] : [['hoje', 'Hoje'], ['semana', 'Semana'], ['sempre', 'Sempre']]).map(([k, label]) =>
              h('div', { class: 'pos-card' }, h('strong', {}, pos[k] ? `${pos[k]}º` : '—'), h('span', {}, label)))),
            h('button', { class: 'btn ghost small', onclick: () => showRanking(m) }, 'Ver ranking global'))
        : h('p', { class: 'muted' }, 'Faça pelo menos 1 ponto para entrar no ranking global.'));
    })
    .catch((e) => el.replaceChildren(h('p', { class: 'muted' }, `Ranking global indisponível (${e.message}).`)));
  return el;
}

// Fim da partida solo: revelação animada (você × seu recorde × 1º do dia no ranking global).
async function showSoloReveal(m, opts, result) {
  const rankId = m.rankingKey ? m.rankingKey(opts) : m.id;
  const record = getRanking(rankId)[0]?.score || 0;
  if (result.online) result._online = finishOnline(result.online.ticket, result.online.palavras, result.online.log).catch((e) => ({ ok: false, erro: e.message }));
  let top = null;
  if (m.globalRanking && (await serverStatus())) {
    const variant = m.id === 'novo-diario' ? todayKey() : m.globalVariant ? m.globalVariant(opts) : opts.size || '4';
    top = await Promise.race([
      api(`ranking?modo=${m.id}&variante=${variant}&periodo=${m.id === 'novo-diario' ? 'sempre' : 'hoje'}`).then((r) => r.rows[0] || null).catch(() => null),
      new Promise((r) => setTimeout(() => r(null), 1200)),
    ]);
  }
  const p = localProfile();
  const players = [{ id: 'me', name: p?.name || getPlayerName() || 'Você', avatar: p?.avatar || getAvatar() }];
  const totals = { me: result.score };
  if (record) { players.push({ id: 'rec', name: p?.name || getPlayerName() || 'Você', tag: 'seu recorde', avatar: '👻' }); totals.rec = record; }
  if (top && top.profileId !== p?.id) { players.push({ id: 'top', name: top.name, tag: '1º de hoje', avatar: top.avatar || '🌍' }); totals.top = top.score; }
  const hues = { me: 255, rec: 220, top: 40 };

  // salva no ranking deste aparelho automaticamente (com o nome do perfil)
  const ranked = result.ranked !== false;
  if (ranked && qualifies(rankId, result.score) && getPlayerName()) {
    result._saved = addScore(rankId, { name: getPlayerName(), score: result.score, detail: result.detail || null });
  }

  const after = h('div', { class: 'after-reveal hidden' });
  const reveal = createReveal({
    round: { type: 'list', items: result.revealItems.map((it) => ({ ...it, id: 'me' })), scores: { me: result.score } },
    players, totals, you: 'me', hueOf: (id) => hues[id] ?? 0, final: true,
    intro: record ? `Seu recorde: ${record} pts` : 'Contando seus pontos…',
    finishText: () => {
      if (!record) return { title: `${result.score} pontos`, sub: 'Primeira partida neste modo!' };
      if (result.score > record) { confetti(); mascotSay('record'); return { title: 'Novo recorde!', sub: `${result.score} pontos (antes: ${record})` }; }
      mascotSay('end');
      if (result.score === record) return { title: `${result.score} pontos`, sub: 'Empatou com o seu recorde!' };
      return { title: `${result.score} pontos`, sub: `Faltaram ${record - result.score + 1} para o recorde` };
    },
    onDone: () => {
      after.replaceChildren(
        result.longest ? h('div', { class: 'longest-row' },
          [['Maior palavra encontrada', result.longest.found], ['Maior palavra da grade', result.longest.possible]].map(([label, w]) =>
            h('div', { class: 'longest-card' }, h('span', { class: 'lc-label' }, label), h('strong', { class: 'lc-word' }, w ? w.toUpperCase() : '—'), h('span', { class: 'lc-sub' }, w ? `${w.length} letras` : 'nenhuma ainda')))) : '',
        result.online ? onlineResult(result, m) : '',
        h('div', { class: 'row-actions center' },
          h('button', { class: 'btn ghost', onclick: () => showResult(m, opts, { ...result, _revealed: true }) }, icon('chart'), 'Mais estatísticas'),
          h('button', { class: 'btn big', onclick: () => play(m, opts) }, icon('refresh'), 'Jogar de novo'),
          h('button', { class: 'btn ghost', onclick: showMenu }, 'Menu')));
      after.classList.remove('hidden');
    },
  });
  screen(topBar(m), h('div', { class: 'result card solo-reveal' }, h('h2', {}, 'Fim de partida'), reveal.el, after));
  setCleanup(() => reveal.destroy());
}

function showResult(m, opts, result) {
  if (result.revealItems && !result._revealed) return showSoloReveal(m, opts, result);
  const rankId = m.rankingKey ? m.rankingKey(opts) : m.id;
  const ranked = result.ranked !== false;
  const canRank = ranked && !result._saved && qualifies(rankId, result.score);
  const nameInput = h('input', { type: 'text', maxlength: 20, placeholder: 'Seu nome', value: getPlayerName() });
  const saveArea = h('div', { class: 'save' });
  const rankArea = h('div');

  function renderRank(highlight) {
    rankArea.replaceChildren(rankingTable(rankId, highlight));
  }

  if (canRank) {
    saveArea.append(
      h('p', { class: 'new-record' }, getRanking(rankId)[0]?.score < result.score || !getRanking(rankId).length ? 'Novo recorde!' : 'Você entrou no ranking!'),
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
  } else if (result._saved) {
    saveArea.append(h('p', { class: 'saved' }, `Salvo no ranking deste aparelho: ${result._saved.pos}º lugar.`));
  } else if (!ranked) {
    saveArea.append(h('p', {}, 'Esta partida não conta para o ranking.'));
  } else if (result.score > 0) {
    saveArea.append(h('p', {}, 'Não foi dessa vez — o ranking guarda as 10 melhores partidas.'));
  }
  renderRank(result._saved?.id);

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
        h('button', { class: 'btn big', onclick: () => play(m, opts) }, icon('refresh'), 'Jogar de novo'),
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
          h('td', {}, h('span', { class: `pos-badge p${i + 1}` }, i + 1)),
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
    h('div', { class: 'tab-group' }, h('span', { class: 'tab-title' }, title), list.map((m) => h('button', { class: `chip ${m.category}`, 'data-id': m.id, onclick: () => select(m) }, m.name)));
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

applyTheme();

// PWA: instala no celular e joga os modos solo offline
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
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
