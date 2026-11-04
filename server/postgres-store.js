// Armazenamento de perfis, partidas e rankings.
// PostgreSQL: executado em uma transação por requisição no Supabase.
// A interface (métodos públicos abaixo) é pequena de propósito: para hospedar com
// Postgres (Vercel/Supabase/Neon) basta reimplementar estes métodos.
import { createHash, randomBytes } from 'node:crypto';
import { START_RATING, eloDeltas, leagueOf, seasonOf } from '../js/core/leagues.js';
import { ACHIEVEMENTS } from '../js/core/achievements.js';
import { extraQueries } from './store-extra.js';

const hash = (t) => createHash('sha256').update(String(t)).digest('hex');
const newId = (n = 8) => randomBytes(n).toString('hex');

// Fuso do Brasil (UTC−3, sem horário de verão desde 2019) para "hoje" e "semana".
const TZ_OFFSET_MS = -3 * 3600 * 1000;
export function periodStart(period, now = Date.now()) {
  if (period === 'sempre') return 0;
  const local = new Date(now + TZ_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  if (period === 'semana') {
    const dow = (local.getUTCDay() + 6) % 7; // segunda = 0
    local.setUTCDate(local.getUTCDate() - dow);
  }
  return local.getTime() - TZ_OFFSET_MS;
}

// sql must be a transaction-scoped postgres.js connection; caller commits atomically.
export function createPostgresStore(sql, { now = Date.now } = {}) {
  const db = { prepare(query) {
    let i = 0;
    const text = query.replace(/\?/g, () => '$' + (++i));
    const run = (...args) => sql.unsafe(text, args);
    return {
      async get(...args) { return (await run(...args))[0]; },
      async all(...args) { return [...await run(...args)]; },
      async run(...args) { const r = await run(...args); return { changes: r.count }; },
    };
  }};
  const q = {
    insProfile: db.prepare('INSERT INTO profiles (id, token_hash, name, avatar, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'),
    byToken: db.prepare('SELECT id, name, avatar, created_at FROM profiles WHERE token_hash = ?'),
    byId: db.prepare('SELECT id, name, avatar, created_at FROM profiles WHERE id = ?'),
    updProfile: db.prepare('UPDATE profiles SET name = ?, avatar = ?, updated_at = ? WHERE id = ?'),
    insMatch: db.prepare('INSERT INTO matches (id, mode, variant, kind, room, players_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    insMP: db.prepare('INSERT INTO match_players (match_id, profile_id, name, avatar, score, place, words, unique_words, longest, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    insTicket: db.prepare('INSERT INTO tickets (id, profile_id, mode, variant, data, started_at, duration, ranked) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    getTicket: db.prepare('SELECT * FROM tickets WHERE id = ?'),
    useTicket: db.prepare('UPDATE tickets SET used = 1 WHERE id = ? AND used = 0'),
    rankedTicketToday: db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE profile_id = ? AND mode = ? AND variant = ? AND ranked = 1'),
    recentTickets: db.prepare('SELECT COUNT(*) AS n FROM tickets WHERE profile_id = ? AND started_at >= ?'),
  };

  // melhor partida de cada jogador no período (um por pessoa)
  const leaderboardSql = (withVariant) => `
    SELECT "profileId", name, avatar, score, at, players, place, variant FROM (
      SELECT mp.profile_id AS "profileId", COALESCE(pr.name, mp.name) AS name,
        COALESCE(pr.avatar, mp.avatar) AS avatar, mp.score, mp.created_at AS at,
        m.players_count AS players, mp.place, m.variant,
        row_number() OVER (PARTITION BY COALESCE(mp.profile_id, 'nome:' || mp.name)
          ORDER BY mp.score DESC, mp.created_at ASC, m.id ASC) AS rn
      FROM match_players mp JOIN matches m ON m.id = mp.match_id LEFT JOIN profiles pr ON pr.id = mp.profile_id
      WHERE m.mode = ? ${withVariant ? 'AND m.variant = ?' : ''} AND mp.created_at >= ? AND mp.score > 0
    ) ranked WHERE rn = 1 ORDER BY score DESC, at ASC LIMIT ?`;
  const lbAll = db.prepare(leaderboardSql(false));
  const lbVar = db.prepare(leaderboardSql(true));
  const winsSql = db.prepare(`
    SELECT mp.profile_id AS "profileId", COALESCE(pr.name, mp.name) AS name, COALESCE(pr.avatar, mp.avatar) AS avatar, COUNT(*) AS wins, SUM(mp.score) AS points
    FROM match_players mp JOIN matches m ON m.id = mp.match_id LEFT JOIN profiles pr ON pr.id = mp.profile_id
    WHERE m.kind IN ('multi', 'arena') AND m.players_count >= 2 AND mp.place = 1 AND mp.created_at >= ? AND mp.profile_id IS NOT NULL
    GROUP BY mp.profile_id, COALESCE(pr.name, mp.name), COALESCE(pr.avatar, mp.avatar) ORDER BY wins DESC, points DESC LIMIT ?`);
  const statsSql = db.prepare(`
    SELECT COUNT(*) AS matches, COALESCE(MAX(score), 0) AS best, COALESCE(ROUND(AVG(score)), 0) AS avg,
      COALESCE(SUM(words), 0) AS words, COALESCE(SUM(unique_words), 0) AS "uniqueWords",
      COALESCE(SUM(CASE WHEN mp.place = 1 AND m.players_count >= 2 THEN 1 ELSE 0 END), 0) AS wins,
      COALESCE(SUM(CASE WHEN m.kind IN ('multi', 'arena') THEN 1 ELSE 0 END), 0) AS multi,
      COALESCE(SUM(CASE WHEN m.kind = 'arena' THEN 1 ELSE 0 END), 0) AS arena
    FROM match_players mp JOIN matches m ON m.id = mp.match_id WHERE mp.profile_id = ?`);
  const longestSql = db.prepare(`SELECT longest FROM match_players WHERE profile_id = ? AND longest IS NOT NULL ORDER BY LENGTH(longest) DESC, created_at ASC LIMIT 1`);
  const recentSql = db.prepare(`
    SELECT m.mode, m.variant, m.kind, m.players_count AS players, mp.score, mp.place, mp.words, mp.longest, mp.created_at AS at
    FROM match_players mp JOIN matches m ON m.id = mp.match_id WHERE mp.profile_id = ? ORDER BY mp.created_at DESC LIMIT ?`);
  const q2 = {
    getRating: db.prepare('SELECT rating, peak, games FROM ratings WHERE profile_id = ? AND season = ?'),
    upsertRating: db.prepare(`INSERT INTO ratings (profile_id, season, rating, peak, games) VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(profile_id, season) DO UPDATE SET rating = excluded.rating, peak = GREATEST(ratings.peak, excluded.rating), games = ratings.games + 1`),
    leagueTable: db.prepare(`SELECT r.profile_id AS "profileId", p.name, p.avatar, r.rating, r.games FROM ratings r JOIN profiles p ON p.id = r.profile_id
      WHERE r.season = ? ORDER BY r.rating DESC, r.games DESC LIMIT ?`),
    achs: db.prepare('SELECT key, at FROM achievements WHERE profile_id = ? ORDER BY at'),
    addAch: db.prepare('INSERT INTO achievements (profile_id, key, at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING'),
    dailyDays: db.prepare(`SELECT DISTINCT m.variant AS day FROM match_players mp JOIN matches m ON m.id = mp.match_id
      WHERE mp.profile_id = ? AND m.mode = 'novo-diario' ORDER BY day DESC LIMIT 400`),
    addReport: db.prepare('INSERT INTO reports (reporter_id, reported_id, reported_name, room, reason, at) VALUES (?, ?, ?, ?, ?, ?)'),
  };
  const favSql = db.prepare(`SELECT m.mode, COUNT(*) AS n FROM match_players mp JOIN matches m ON m.id = mp.match_id WHERE mp.profile_id = ? GROUP BY m.mode ORDER BY n DESC LIMIT 1`);

  return {
    ...extraQueries(db, now),
    // ---------- perfis ----------
    async createProfile({ name, avatar }) {
      const id = newId(6);
      const token = newId(16);
      const t = now();
      (await q.insProfile.run(id, hash(token), name, avatar, t, t));
      return { id, token, name, avatar };
    },
    async profileByToken(token) {
      if (!token || typeof token !== 'string' || token.length > 100) return null;
      return (await q.byToken.get(hash(token))) || null;
    },
    async profileById(id) {
      return (await q.byId.get(id)) || null;
    },
    async updateProfile(id, { name, avatar }) {
      (await q.updProfile.run(name, avatar, now(), id));
      return (await q.byId.get(id));
    },

    // ---------- partidas ----------
    /**
     * @param {{mode:string, variant?:string, kind:'multi'|'solo', room?:string,
     *   players:{profileId?:string, name:string, avatar:string, score:number, place:number, words?:number, unique?:number, longest?:string}[]}} m
     */
    async recordMatch(m) {
      const id = newId(8);
      const t = now();

      try {
        (await q.insMatch.run(id, m.mode, m.variant || '', m.kind, m.room || null, m.players.length, t));
        for (const p of m.players) {
          (await q.insMP.run(id, p.profileId || null, p.name, p.avatar, Math.round(p.score), p.place, p.words || 0, p.unique || 0, p.longest || null, t));
        }

      } catch (e) {

        throw e;
      }
      // Elo só na Arena Pública (partidas contra desconhecidos)
      const ratings = m.kind === 'arena' ? (await this.applyElo(m.players)) : {};
      const achievements = {};
      for (const p of m.players) if (p.profileId) achievements[p.profileId] = (await this.checkAchievements(p.profileId, p));
      return { id, ratings, achievements };
    },

    async leaderboard({ mode, variant = null, period = 'semana', limit = 20 }) {
      const since = periodStart(period, now());
      const rows = variant ? (await lbVar.all(mode, variant, since, limit)) : (await lbAll.all(mode, since, limit));
      return rows.map((r, i) => ({ pos: i + 1, ...r }));
    },

    // posição da melhor partida de um perfil no ranking (mesmo fora do top)
    async positionOf({ mode, variant = null, period = 'semana', profileId }) {
      const all = (await this.leaderboard({ mode, variant, period, limit: 100000 }));
      return all.find((r) => r.profileId === profileId) || null;
    },

    async winners({ period = 'semana', limit = 10 }) {
      return (await winsSql.all(periodStart(period, now()), limit)).map((r, i) => ({ pos: i + 1, ...r }));
    },

    async profileStats(profileId) {
      const s = (await statsSql.get(profileId));
      return {
        ...s,
        longest: (await longestSql.get(profileId))?.longest || null,
        favorite: (await favSql.get(profileId))?.mode || null,
        recent: (await recentSql.all(profileId, 15)),
        streak: (await this.streak(profileId)),
        rating: (await this.ratingOf(profileId)),
        achievements: (await q2.achs.all(profileId)),
      };
    },

    // ---------- sequência de dias no Desafio do Dia ----------
    async streak(profileId) {
      const days = (await q2.dailyDays.all(profileId)).map((r) => r.day);
      if (!days.length) return 0;
      const dayMs = 86400000;
      const today = Date.parse(new Date(now() - 3 * 3600 * 1000).toISOString().slice(0, 10));
      let expected = Date.parse(days[0]);
      if (today - expected > dayMs) return 0; // a última foi antes de ontem: sequência quebrou
      let n = 0;
      for (const d of days) {
        if (Date.parse(d) !== expected) break;
        n++;
        expected -= dayMs;
      }
      return n;
    },

    // ---------- ligas (Elo por temporada mensal) ----------
    async ratingOf(profileId, season = seasonOf(now())) {
      const r = (await q2.getRating.get(profileId, season));
      const rating = r ? Math.round(r.rating) : START_RATING;
      return { season, rating, peak: r ? Math.round(r.peak) : START_RATING, games: r?.games || 0, league: leagueOf(rating).key };
    },
    /** @param {{profileId:string, place:number}[]} players  @returns {Object<string, {before:number, after:number, delta:number, league:string}>} */
    async applyElo(players) {
      const season = seasonOf(now());
      const list = await Promise.all(players.filter((p) => p.profileId).map(async (p) => ({ id: p.profileId, place: p.place, rating: (await this.ratingOf(p.profileId, season)).rating })));
      if (list.length < 2) return {};
      const deltas = eloDeltas(list);
      const out = {};
      for (const p of list) {
        const after = Math.max(0, p.rating + deltas[p.id]);
        (await q2.upsertRating.run(p.id, season, after, after));
        out[p.id] = { before: p.rating, after, delta: deltas[p.id], league: leagueOf(after).key };
      }
      return out;
    },
    async leagueTable({ season = seasonOf(now()), limit = 30 } = {}) {
      return (await q2.leagueTable.all(season, limit)).map((r, i) => ({ pos: i + 1, ...r, rating: Math.round(r.rating), league: leagueOf(r.rating).key }));
    },

    // ---------- conquistas ----------
    /** Confere as conquistas depois de uma partida. Retorna as novas. */
    async checkAchievements(profileId, match = null) {
      const have = new Set((await q2.achs.all(profileId)).map((a) => a.key));
      const ctx = { stats: { ...(await statsSql.get(profileId)), streak: (await this.streak(profileId)) }, rating: (await this.ratingOf(profileId)), match };
      const fresh = [];
      for (const a of ACHIEVEMENTS) {
        if (have.has(a.key)) continue;
        let ok = false;
        try { ok = a.check(ctx); } catch { ok = false; }
        if (ok) { (await q2.addAch.run(profileId, a.key, now())); fresh.push(a.key); }
      }
      return fresh;
    },

    // ---------- denúncias ----------
    async report({ reporterId, reportedId, reportedName, room, reason }) {
      (await q2.addReport.run(reporterId || null, reportedId || null, String(reportedName || '').slice(0, 40), room || null, String(reason || '').slice(0, 200), now()));
    },

    // ---------- tickets das partidas solo verificadas ----------
    async createTicket({ profileId, mode, variant, data, duration, ranked = true }) {
      const id = newId(10);
      (await q.insTicket.run(id, profileId, mode, variant, JSON.stringify(data), now(), duration, ranked ? 1 : 0));
      return id;
    },
    async hasRankedTicket({ profileId, mode, variant }) {
      return (await q.rankedTicketToday.get(profileId, mode, variant)).n > 0;
    },
    async ticketsSince(profileId, since) {
      return (await q.recentTickets.get(profileId, since)).n;
    },
    async takeTicket(id, profileId) {
      const t = (await q.getTicket.get(id));
      if (!t || (profileId && t.profile_id !== profileId)) return null;
      const r = (await q.useTicket.run(id));
      if (r.changes !== 1) return { ...t, data: JSON.parse(t.data), alreadyUsed: true };
      return { ...t, data: JSON.parse(t.data) };
    },

    async close() {},
  };
}
