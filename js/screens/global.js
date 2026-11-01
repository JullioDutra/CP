// Telas da Fase 3: ranking global (servidor) e perfil sem login.
import { h, toast } from '../core/ui.js';
import { MULTI_MODES, AVATARS, formatOption } from '../core/multimodes.js';
import { SOLO_RANKED } from '../core/solo.js';
import { todayKey } from '../core/rng.js';
import { getPlayerName } from '../core/ranking.js';
import { api, serverStatus, ensureProfile, localProfile, saveIdentity, importProfileCode, getAvatar } from '../core/profile.js';
import { LEAGUES, leagueOf, seasonLabel } from '../core/leagues.js';
import { ACHIEVEMENTS, THEMES, achievementByKey } from '../core/achievements.js';
import { applyTheme, currentTheme, unlockedThemes } from '../core/theme.js';

const PERIODS = [['hoje', 'Hoje'], ['semana', 'Semana'], ['sempre', 'Sempre']];
const MEDALS = ['🥇', '🥈', '🥉'];

// Modos com ranking global e suas variantes (tamanho da grade, nível do sudoku…).
export const GLOBAL_MODES = [
  ...Object.values(MULTI_MODES).map((m) => {
    const spec = m.options.size || m.options.difficulty;
    return {
      id: m.id, group: 'Em grupo', name: m.name, icon: m.icon, category: m.category,
      variants: spec ? [['', 'Todas'], ...spec.choices.map((v) => [String(v), formatOption(spec, v)])] : [['', 'Todas']],
    };
  }),
  ...Object.entries(SOLO_RANKED).map(([id, cfg]) => ({
    id, group: 'Solo', name: cfg.name, icon: cfg.icon, category: cfg.category, daily: !!cfg.daily,
    variants: cfg.daily ? [] : [['', 'Todas'], ...cfg.variants.map((v) => [v, cfg.variantLabel(v)])],
  })),
];

export const modeName = (id) => MULTI_MODES[id]?.name || SOLO_RANKED[id]?.name || id;
export const modeIcon = (id) => MULTI_MODES[id]?.icon || SOLO_RANKED[id]?.icon || '🎮';
const fmtDate = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

function chipRow(label, items, current, onPick) {
  return h('div', { class: 'opt-row' }, label ? h('span', {}, label) : '',
    h('div', { class: 'chips' }, items.map(([v, text]) => h('button', { class: `chip ${v === current ? 'on' : ''}`, onclick: () => onPick(v) }, text))));
}

function table(rows, meId, { showPlayers = false } = {}) {
  if (!rows.length) return h('p', { class: 'empty' }, 'Ninguém pontuou neste período ainda. Que tal ser o primeiro?');
  return h('table', { class: 'ranking global' },
    h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Jogador'), h('th', {}, 'Pontos'), h('th', {}, showPlayers ? 'Partida' : 'Data'))),
    h('tbody', {}, rows.map((r) => h('tr', { class: r.profileId && r.profileId === meId ? 'me' : '' },
      h('td', { class: 'pos' }, MEDALS[r.pos - 1] || r.pos),
      h('td', {}, h('span', { class: 'rank-avatar' }, r.avatar), ' ', r.name, r.profileId && r.profileId === meId ? h('small', { class: 'muted' }, ' (você)') : ''),
      h('td', { class: 'num' }, r.score ?? r.wins),
      h('td', { class: 'date' }, showPlayers ? `${r.players} jog. · ${fmtDate(r.at)}` : fmtDate(r.at))))));
}

function winsTable(rows, meId) {
  return h('table', { class: 'ranking global' },
    h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Jogador'), h('th', {}, 'Vitórias'), h('th', {}, 'Pontos somados'))),
    h('tbody', {}, rows.map((r) => h('tr', { class: r.profileId === meId ? 'me' : '' },
      h('td', { class: 'pos' }, MEDALS[r.pos - 1] || r.pos),
      h('td', {}, h('span', { class: 'rank-avatar' }, r.avatar), ' ', r.name, r.profileId === meId ? h('small', { class: 'muted' }, ' (você)') : ''),
      h('td', { class: 'num' }, r.wins),
      h('td', { class: 'date' }, r.points)))));
}

/**
 * Ranking: aba Global (servidor) e aba Neste aparelho (local).
 * @param ctx {{ screen, showMenu, renderLocal: (el) => void }}
 */
export async function showRanking(ctx, { mode = null, tab = null } = {}) {
  const online = await serverStatus();
  const state = { tab: tab || (online ? 'global' : 'local'), mode: mode || GLOBAL_MODES[0].id, variant: '', period: 'semana' };
  const content = h('div');
  const tabsEl = h('div', { class: 'seg' });
  const meId = localProfile()?.id;

  function renderTabs() {
    tabsEl.replaceChildren(
      h('button', { class: `seg-btn ${state.tab === 'global' ? 'on' : ''}`, onclick: () => { state.tab = 'global'; render(); } }, '🌍 Global'),
      h('button', { class: `seg-btn ${state.tab === 'ligas' ? 'on' : ''}`, onclick: () => { state.tab = 'ligas'; render(); } }, '🏅 Ligas'),
      h('button', { class: `seg-btn ${state.tab === 'local' ? 'on' : ''}`, onclick: () => { state.tab = 'local'; render(); } }, '📱 Neste aparelho'));
  }

  async function render() {
    renderTabs();
    if (state.tab === 'local') { ctx.renderLocal(content); return; }
    if (state.tab === 'ligas') { renderLeagues(content, online, meId); return; }
    if (!online) {
      content.replaceChildren(h('p', { class: 'notice' }, 'O ranking global precisa do servidor do Trama (npm start). Por enquanto, veja o ranking deste aparelho.'));
      return;
    }
    const m = GLOBAL_MODES.find((x) => x.id === state.mode);
    if (!m.variants.some(([v]) => v === state.variant)) state.variant = '';
    const groups = [...new Set(GLOBAL_MODES.map((x) => x.group))];
    const list = h('div', {}, h('p', { class: 'loading' }, 'Carregando…'));
    content.replaceChildren(
      ...groups.map((g) => h('div', { class: 'tab-group' }, h('span', { class: 'tab-title' }, g),
        GLOBAL_MODES.filter((x) => x.group === g).map((x) => h('button', { class: `chip ${x.id === state.mode ? 'on' : ''}`, onclick: () => { state.mode = x.id; render(); } }, `${x.icon} ${x.name}`)))),
      m.variants.length ? chipRow(m.id.startsWith('sudoku') ? 'Nível' : 'Grade', m.variants, state.variant, (v) => { state.variant = v; render(); }) : '',
      m.daily ? h('p', { class: 'hint' }, `Desafio de hoje (${todayKey().split('-').reverse().join('/')}): só a primeira partida de cada pessoa vale.`) : chipRow('Período', PERIODS, state.period, (v) => { state.period = v; render(); }),
      list);
    try {
      const variant = m.daily ? todayKey() : state.variant;
      const period = m.daily ? 'sempre' : state.period;
      const r = await api(`ranking?modo=${m.id}${variant ? `&variante=${variant}` : ''}&periodo=${period}`);
      const parts = [
        h('h3', {}, `Maiores pontuações por partida — ${m.name}`),
        h('p', { class: 'hint' }, 'Cada pessoa aparece uma vez, com a sua melhor partida.'),
        table(r.rows, meId, { showPlayers: m.group === 'Em grupo' }),
      ];
      if (r.voce && !r.rows.some((x) => x.profileId === meId)) parts.push(h('p', { class: 'you-pos' }, `Sua melhor partida: ${r.voce.pos}º lugar (${r.voce.score} pts)`));
      if (m.group === 'Em grupo') {
        const w = await api(`vencedores?periodo=${state.period}`);
        parts.push(h('h3', { class: 'wins-title' }, '🏅 Mais vitórias em grupo'),
          w.rows.length ? winsTable(w.rows, meId) : h('p', { class: 'empty' }, 'Ainda sem vitórias neste período (só contam partidas com 2+ pessoas).'));
      }
      list.replaceChildren(...parts);
    } catch (e) {
      list.replaceChildren(h('p', { class: 'notice' }, `Não foi possível carregar o ranking: ${e.message}`));
    }
  }

  ctx.screen(
    h('div', { class: 'topbar' }, h('button', { class: 'btn ghost small', onclick: ctx.showMenu }, '← Menu'), h('span', {}, '🏆 Ranking'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn ghost small', onclick: () => showProfile(ctx) }, '👤 Meu perfil')),
    h('div', { class: 'card' }, tabsEl, content));
  render();
}

// ---------- Perfil sem login ----------
export async function showProfile(ctx) {
  const online = await serverStatus();
  const body = h('div', {}, h('p', { class: 'loading' }, 'Carregando perfil…'));
  ctx.screen(
    h('div', { class: 'topbar' }, h('button', { class: 'btn ghost small', onclick: ctx.showMenu }, '← Menu'), h('span', {}, '👤 Meu perfil'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn ghost small', onclick: () => showRanking(ctx) }, '🏆 Ranking')),
    body);

  let avatar = localProfile()?.avatar || getAvatar();
  const nameInput = h('input', { type: 'text', maxlength: 16, value: localProfile()?.name || getPlayerName() || '', placeholder: 'Seu nome' });
  const avatars = AVATARS.map((a) => h('button', { type: 'button', class: `avatar-pick ${a === avatar ? 'on' : ''}`, 'aria-label': `Avatar ${a}`, onclick: (e) => { avatar = a; avatars.forEach((b) => b.classList.remove('on')); e.currentTarget.classList.add('on'); } }, a));
  const identity = h('div', { class: 'card profile-id' },
    h('label', { class: 'field' }, h('span', {}, 'Nome'), nameInput),
    h('div', { class: 'field' }, h('span', {}, 'Avatar'), h('div', { class: 'avatar-grid' }, avatars)),
    h('div', { class: 'row-actions' }, h('button', { class: 'btn', onclick: async () => {
      const name = nameInput.value.trim();
      if (!name) { toast(body, 'Digite um nome', 'bad'); return; }
      const p = await saveIdentity(name, avatar);
      toast(body, p ? 'Perfil salvo!' : 'Salvo neste aparelho', 'good');
      if (p) load();
    } }, 'Salvar')),
    h('p', { class: 'hint' }, 'Sem cadastro e sem senha: seu perfil fica guardado neste aparelho.'));

  if (!online) {
    body.replaceChildren(identity, h('p', { class: 'notice' }, 'Estatísticas e ranking global aparecem quando o jogo roda pelo servidor (npm start).'));
    return;
  }

  async function load() {
    const p = await ensureProfile({ name: nameInput.value.trim() || 'Jogador', avatar });
    if (!p) { body.replaceChildren(identity, h('p', { class: 'notice' }, 'Não foi possível falar com o servidor.')); return; }
    const { stats } = await api('perfil');
    const card = (label, value, icon) => h('div', { class: `stat ${typeof value === 'string' && value.length > 6 ? 'text' : ''}` }, h('span', { class: 'stat-icon' }, icon), h('strong', {}, value), h('span', {}, label));
    const codeEl = h('code', { class: 'secret' }, '••••••••••••••••');
    const importInput = h('input', { type: 'text', placeholder: 'Cole aqui o código do outro aparelho', class: 'import-input' });
    body.replaceChildren(
      h('div', { class: 'profile-head' }, h('div', { class: 'profile-avatar' }, p.avatar),
        h('div', {}, h('h2', {}, p.name),
          h('p', { class: 'muted' }, `${stats.matches} ${stats.matches === 1 ? 'partida jogada' : 'partidas jogadas'}`),
          h('div', { class: 'badges' },
            h('span', { class: 'badge-pill' }, `${leagueOf(stats.rating.rating).icon} ${leagueOf(stats.rating.rating).name} · ${stats.rating.rating}`),
            stats.streak ? h('span', { class: 'badge-pill fire' }, `🔥 ${stats.streak} ${stats.streak === 1 ? 'dia' : 'dias'} seguidos`) : ''))),
      h('div', { class: 'stats-grid' },
        card('Partidas', stats.matches, '🎮'),
        card('Vitórias em grupo', stats.wins, '🏆'),
        card('Melhor partida', stats.best, '⭐'),
        card('Média por partida', stats.avg, '📈'),
        card('Palavras achadas', stats.words, '🔤'),
        card('Palavras únicas', stats.uniqueWords, '★'),
        card('Maior palavra', stats.longest ? stats.longest.toUpperCase() : '—', '📏'),
        card('Modo favorito', stats.favorite ? modeName(stats.favorite) : '—', modeIcon(stats.favorite))),
      h('div', { class: 'card' },
        h('h3', {}, 'Últimas partidas'),
        stats.recent.length
          ? h('ul', { class: 'recent' }, stats.recent.map((r) => h('li', {},
              h('span', { class: 'r-mode' }, `${modeIcon(r.mode)} ${modeName(r.mode)}`, r.variant && !SOLO_RANKED[r.mode]?.daily ? h('small', {}, ` · ${variantLabel(r.mode, r.variant)}`) : ''),
              h('span', { class: 'r-place' }, r.kind !== 'solo' ? `${r.kind === 'arena' ? '🌐 ' : ''}${r.players > 1 ? `${MEDALS[r.place - 1] || ''} ${r.place}º de ${r.players}` : 'sozinho'}` : 'solo'),
              h('strong', {}, `${r.score} pts`),
              h('small', { class: 'muted' }, fmtDate(r.at)))))
          : h('p', { class: 'empty' }, 'Jogue uma partida em grupo ou um modo solo com ranking para ver seu histórico aqui.')),
      achievementsCard(stats.achievements),
      themesCard(stats.achievements),
      identity,
      h('div', { class: 'card' },
        h('h3', {}, '📲 Usar este perfil em outro aparelho'),
        h('p', { class: 'hint' }, 'Copie o código e cole no outro aparelho. Não compartilhe: quem tiver o código usa o seu perfil.'),
        h('div', { class: 'row-actions' },
          codeEl,
          h('button', { class: 'btn ghost small', onclick: () => (codeEl.textContent = codeEl.textContent.startsWith('•') ? p.token : '••••••••••••••••') }, 'Mostrar'),
          h('button', { class: 'btn ghost small', onclick: () => navigator.clipboard?.writeText(p.token).then(() => toast(body, 'Código copiado!', 'good')).catch(() => prompt('Copie o código:', p.token)) }, 'Copiar')),
        h('form', { class: 'join-form import', onsubmit: async (e) => {
          e.preventDefault();
          try {
            await importProfileCode(importInput.value);
            toast(body, 'Perfil carregado!', 'good');
            showProfile(ctx);
          } catch (err) { toast(body, err.message, 'bad'); }
        } }, importInput, h('button', { class: 'btn', type: 'submit' }, 'Usar código'))));
  }
  load().catch((e) => body.replaceChildren(identity, h('p', { class: 'notice' }, e.message)));
}

function variantLabel(mode, v) {
  if (SOLO_RANKED[mode]) return SOLO_RANKED[mode].variantLabel(v);
  const m = MULTI_MODES[mode];
  const spec = m?.options.size || m?.options.difficulty;
  return spec ? formatOption(spec, typeof spec.default === 'number' ? Number(v) : v) : v;
}

// Ligas da temporada (mês): nível de cada pessoa nas partidas da Arena Pública.
async function renderLeagues(content, online, meId) {
  if (!online) { content.replaceChildren(h('p', { class: 'notice' }, 'As ligas precisam do servidor do Trama (npm start).')); return; }
  content.replaceChildren(h('p', { class: 'loading' }, 'Carregando…'));
  try {
    const r = await api('ligas');
    const ladder = h('div', { class: 'ladder' }, LEAGUES.map((l) => h('div', { class: `ladder-step ${r.voce && r.voce.league === l.key ? 'me' : ''}` }, h('span', {}, l.icon), h('strong', {}, l.name), h('small', {}, `${l.min}+`))));
    content.replaceChildren(
      h('h3', {}, `Temporada de ${seasonLabel(r.temporada)}`),
      h('p', { class: 'hint' }, 'Todo mundo começa em 1000 (Bronze). O nível só muda nas partidas da ⚡ Arena Pública: ganhar de quem tem nível maior vale mais. Zera a cada mês.'),
      ladder,
      r.voce ? h('p', { class: 'you-pos' }, `${leagueOf(r.voce.rating).icon} Você: nível ${r.voce.rating} · ${leagueOf(r.voce.rating).name} · ${r.voce.games} partida(s) na Arena`) : '',
      r.rows.length
        ? h('table', { class: 'ranking global' },
            h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Jogador'), h('th', {}, 'Nível'), h('th', {}, 'Liga'))),
            h('tbody', {}, r.rows.map((x) => h('tr', { class: x.profileId === meId ? 'me' : '' },
              h('td', { class: 'pos' }, MEDALS[x.pos - 1] || x.pos),
              h('td', {}, h('span', { class: 'rank-avatar' }, x.avatar), ' ', x.name, x.profileId === meId ? h('small', { class: 'muted' }, ' (você)') : ''),
              h('td', { class: 'num' }, x.rating),
              h('td', {}, `${leagueOf(x.rating).icon} ${leagueOf(x.rating).name}`)))))
        : h('p', { class: 'empty' }, 'Ninguém jogou na Arena nesta temporada ainda. Seja o primeiro!'));
  } catch (e) {
    content.replaceChildren(h('p', { class: 'notice' }, e.message));
  }
}

function achievementsCard(list = []) {
  const got = new Map(list.map((a) => [a.key, a.at]));
  return h('div', { class: 'card' },
    h('h3', {}, `🏅 Conquistas (${got.size}/${ACHIEVEMENTS.length})`),
    h('div', { class: 'achv-grid' }, ACHIEVEMENTS.map((a) => h('div', { class: `achv ${got.has(a.key) ? 'got' : 'locked'}`, title: a.desc },
      h('span', { class: 'achv-icon' }, got.has(a.key) ? a.icon : '🔒'),
      h('strong', {}, a.name),
      h('small', {}, got.has(a.key) ? `Conquistada em ${fmtDate(got.get(a.key))}` : a.desc)))));
}

function themesCard(list = []) {
  const unlocked = new Set(unlockedThemes(list.map((a) => a.key)));
  const wrap = h('div', { class: 'themes' });
  const draw = () => wrap.replaceChildren(...THEMES.map((t) => {
    const ok = unlocked.has(t.key);
    return h('button', {
      class: `theme-opt ${currentTheme() === t.key ? 'on' : ''} ${ok ? '' : 'locked'}`,
      disabled: !ok,
      title: ok ? t.name : `Desbloqueie com a conquista "${achievementByKey[t.unlock]?.name}"`,
      onclick: () => { applyTheme(t.key); draw(); },
    }, h('span', { class: 'swatch', style: `background: linear-gradient(135deg, ${t.swatch[0]} 50%, ${t.swatch[1]} 50%)` }), h('span', {}, ok ? t.name : `🔒 ${t.name}`),
      ok ? '' : h('small', {}, achievementByKey[t.unlock]?.name || ''));
  }));
  draw();
  return h('div', { class: 'card' }, h('h3', {}, '🎨 Temas'), h('p', { class: 'hint' }, 'Novos temas se desbloqueiam com conquistas.'), wrap);
}
