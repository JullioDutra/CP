import { Buffer } from 'node:buffer';
// Rotas HTTP /api/* — IA de palavras, QR code, perfis, ranking global e partidas solo verificadas.
import QRCode from 'qrcode';
import { AVATARS, MULTI_MODES } from '../js/core/multimodes.js';
import { createRng } from '../js/core/rng.js';
import { makeGrid } from '../js/core/letters.js';
import { SOLO_RANKED, MIN_WORDS, dailyPuzzle, scoreWords } from '../js/core/solo.js';
import { cleanName } from './room.js';
import { seasonOf } from '../js/core/leagues.js';
import { newSeed, setupWordSearch, scoreWordSearch, setupSudoku, scoreSudokuLog, replaySurvival, WS_TIME } from '../js/core/solo-verify.js';

// Confere uma partida com semente (refaz o jogo no servidor) e devolve os pontos oficiais.
function verifySeeded(mode, data, log, elapsedSec) {
  if (mode === 'classico-cacapalavras') return scoreWordSearch(setupWordSearch(data.seed, data.variant), log, WS_TIME - elapsedSec + 3);
  if (mode === 'classico-sudoku') return scoreSudokuLog(setupSudoku(data.seed, data.variant), data.variant, log, elapsedSec);
  if (mode === 'novo-sobrevivencia') return replaySurvival(data.seed, log, elapsedSec + 3);
  return { score: 0, words: 0, longest: null };
}

const PERIODS = ['hoje', 'semana', 'sempre'];
export const RANKED_MODES = new Set([...Object.keys(MULTI_MODES), ...Object.keys(SOLO_RANKED)]);
const GRACE_MS = 20000;

// hoje em Brasília (UTC−3), no formato AAAA-MM-DD
export function brDay(now = Date.now()) {
  return new Date(now - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

export function createApi({ verifier, store, now = Date.now, arenaStatus = () => ({ waiting: 0, playing: 0 }) }) {
  const hits = new Map();
  function allow(key, max, windowMs = 60000) {
    const t = now();
    const list = (hits.get(key) || []).filter((x) => t - x < windowMs);
    if (list.length >= max) return false;
    list.push(t);
    hits.set(key, list);
    return true;
  }

  const json = (res, code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(obj));
  };

  async function body(req) {
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > 64 * 1024) throw Object.assign(new Error('Requisição grande demais'), { status: 413 });
      chunks.push(c);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('JSON inválido'), { status: 400 }); }
  }

  const profileOf = async (req) => (await store.profileByToken(req.headers['x-trama-perfil']));
  const cleanProfile = (b) => ({ name: cleanName(b.name), avatar: AVATARS.includes(b.avatar) ? b.avatar : AVATARS[0] });

  async function positions(mode, variant, profileId) {
    return Object.fromEntries(await Promise.all(PERIODS.map(async (period) => [period, (await store.positionOf({ mode, variant, period, profileId }))?.pos ?? null])));
  }

  const routes = {
    'GET /api/status': async () => [200, { ia: verifier.enabled, modelo: verifier.enabled ? verifier.model : null, ranking: true }],

    'GET /api/aprendidas': async (req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache' });
      res.end(verifier.learned().join('\n'));
    },

    'GET /api/qr': async (req, res, url) => {
      const data = String(url.searchParams.get('d') || '').slice(0, 300);
      const svg = await QRCode.toString(data, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
      res.writeHead(200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=3600' });
      res.end(svg);
    },

    // ---------- perfil sem login ----------
    'POST /api/perfil': async (req) => {
      // numa festa, todos no mesmo Wi-Fi compartilham o IP: limite folgado
      if (!allow(`perfil:${req.socket.remoteAddress}`, 40, 3600 * 1000)) return [429, { erro: 'Muitos perfis criados, tente mais tarde' }];
      const p = (await store.createProfile(cleanProfile(await body(req))));
      return [200, p];
    },
    'GET /api/perfil': async (req) => {
      const p = (await profileOf(req));
      if (!p) return [404, { erro: 'Perfil não encontrado' }];
      return [200, { perfil: p, stats: (await store.profileStats(p.id)) }];
    },
    'PATCH /api/perfil': async (req) => {
      const p = (await profileOf(req));
      if (!p) return [404, { erro: 'Perfil não encontrado' }];
      return [200, { perfil: (await store.updateProfile(p.id, cleanProfile(await body(req)))) }];
    },

    // ---------- ranking ----------
    'GET /api/ranking': async (req, res, url) => {
      const mode = url.searchParams.get('modo');
      if (!RANKED_MODES.has(mode)) return [400, { erro: 'Modo inválido' }];
      const variant = url.searchParams.get('variante') || null;
      const period = PERIODS.includes(url.searchParams.get('periodo')) ? url.searchParams.get('periodo') : 'semana';
      const rows = (await store.leaderboard({ mode, variant, period, limit: 20 }));
      const me = (await profileOf(req));
      const voce = me ? (await store.positionOf({ mode, variant, period, profileId: me.id })) : null;
      return [200, { rows, voce }];
    },
    // ---------- ligas (temporada do mês) ----------
    'GET /api/ligas': async (req) => {
      const me = (await profileOf(req));
      const season = seasonOf(now());
      return [200, { temporada: season, rows: (await store.leagueTable({ season, limit: 30 })), voce: me ? (await store.ratingOf(me.id, season)) : null }];
    },

    // ---------- Arena Pública ----------
    'GET /api/arena': async () => [200, (await arenaStatus())],

    // ---------- denúncia de jogador ----------
    'POST /api/denuncia': async (req) => {
      const me = (await profileOf(req));
      if (!allow(`denuncia:${req.socket.remoteAddress}`, 10, 3600 * 1000)) return [429, { erro: 'Muitas denúncias, tente mais tarde' }];
      const b = await body(req);
      if (!b.nome) return [400, { erro: 'Quem você quer denunciar?' }];
      (await store.report({ reporterId: me?.id, reportedId: null, reportedName: b.nome, room: b.sala, reason: b.motivo }));
      return [200, { ok: true }];
    },

    'GET /api/vencedores': async (req, res, url) => {
      const period = PERIODS.includes(url.searchParams.get('periodo')) ? url.searchParams.get('periodo') : 'semana';
      return [200, { rows: (await store.winners({ period, limit: 10 })) }];
    },

    // ---------- partidas solo verificadas ----------
    'POST /api/solo/inicio': async (req) => {
      const p = (await profileOf(req));
      if (!p) return [401, { erro: 'Crie um perfil para entrar no ranking' }];
      if ((await store.ticketsSince(p.id, now() - 3600 * 1000)) >= 60) return [429, { erro: 'Muitas partidas seguidas, descanse um pouco' }];
      const b = await body(req);
      const cfg = SOLO_RANKED[b.modo];
      if (!cfg) return [400, { erro: 'Modo sem ranking global' }];
      let variant, data, ranked = true;
      if (cfg.seeded) {
        variant = cfg.variants.includes(String(b.variante)) ? String(b.variante) : cfg.variants[0];
        data = { seed: newSeed(), variant };
      } else if (cfg.daily) {
        variant = brDay(now());
        // aceita o dia do aparelho se for ontem/hoje/amanhã em relação ao servidor (fusos)
        if (/^\d{4}-\d{2}-\d{2}$/.test(b.dia || '') && Math.abs(Date.parse(b.dia) - Date.parse(variant)) <= 86400000) variant = b.dia;
        const { grid, bonus } = dailyPuzzle(variant);
        data = { grid, size: 4, bonus };
        ranked = !(await store.hasRankedTicket({ profileId: p.id, mode: b.modo, variant }));
      } else {
        variant = cfg.variants.includes(String(b.variante)) ? String(b.variante) : cfg.variants[0];
        const size = Number(variant);
        const { grid } = makeGrid(createRng(), size, { minWords: MIN_WORDS[size], tries: size === 6 ? 25 : 60 });
        data = { grid, size, bonus: {} };
      }
      const ticket = (await store.createTicket({ profileId: p.id, mode: b.modo, variant, data, duration: cfg.duration, ranked }));
      return [200, { ticket, ...data, variante: variant, duracao: cfg.duration, ranked }];
      // (modos com semente devolvem { seed }; os de grade devolvem { grid, size, bonus })
    },

    'POST /api/solo/fim': async (req) => {
      const p = (await profileOf(req));
      if (!p) return [401, { erro: 'Perfil não encontrado' }];
      const b = await body(req);
      const t = (await store.takeTicket(String(b.ticket || ''), p.id));
      if (!t || t.profile_id !== p.id) return [404, { erro: 'Partida não encontrada' }];
      if (t.alreadyUsed) return [409, { erro: 'Essa partida já foi enviada' }];
      const elapsed = now() - t.started_at;
      if (elapsed > t.duration * 1000 + GRACE_MS) return [200, { ok: false, ranked: false, erro: 'Tempo da partida excedido; não entrou no ranking' }];
      let r;
      if (t.data?.seed != null) {
        const v = verifySeeded(t.mode, t.data, b.log && typeof b.log === 'object' ? b.log : {}, elapsed / 1000);
        r = { score: v.score, accepted: { length: v.words }, rejected: [], longest: v.longest };
      } else {
        r = scoreWords(t.data, Array.isArray(b.palavras) ? b.palavras : []);
      }
      let conquistas = [];
      if (t.ranked && r.score > 0) {
        conquistas = (await store.recordMatch({
          mode: t.mode, variant: t.variant, kind: 'solo',
          players: [{ profileId: p.id, name: p.name, avatar: p.avatar, score: r.score, place: 1, words: r.accepted.length, unique: 0, longest: r.longest }],
        })).achievements[p.id] || [];
      }
      return [200, {
        ok: true, ranked: !!t.ranked, score: r.score, conquistas, palavras: r.accepted.length, recusadas: r.rejected,
        posicao: t.ranked && r.score > 0 ? (await positions(t.mode, t.variant, p.id)) : null,
      }];
    },
  };

  return async function handle(req, res, url) {
    try {
      if (url.pathname.startsWith('/api/palavra/')) {
        if (!allow(`palavra:${req.socket.remoteAddress}`, 90)) return json(res, 429, { ok: false, motivo: 'Muitas verificações, espere um pouco' });
        return json(res, 200, await verifier.verify(decodeURIComponent(url.pathname.slice('/api/palavra/'.length))));
      }
      const fn = routes[`${req.method} ${url.pathname}`];
      if (!fn) return json(res, 404, { erro: 'não encontrado' });
      const out = await fn(req, res, url);
      if (out) json(res, out[0], out[1]);
    } catch (e) {
      json(res, e.status || 500, { erro: e.status ? e.message : 'Erro interno' });
      if (!e.status) console.error('[api]', e);
    }
  };
}
