// Armazenamento de perfis, partidas e rankings.
// Usa o SQLite embutido do Node (node:sqlite, Node 22.13+): nenhum banco para instalar.
// A interface (métodos públicos abaixo) é pequena de propósito: para hospedar com
// Postgres (Vercel/Supabase/Neon) basta reimplementar estes métodos.
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

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

export function createStore(file = ':memory:', { now = Date.now } = {}) {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, avatar TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY, mode TEXT NOT NULL, variant TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL,
      room TEXT, players_count INTEGER NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS match_players (
      match_id TEXT NOT NULL REFERENCES matches(id), profile_id TEXT, name TEXT NOT NULL, avatar TEXT NOT NULL,
      score INTEGER NOT NULL, place INTEGER NOT NULL, words INTEGER NOT NULL DEFAULT 0,
      unique_words INTEGER NOT NULL DEFAULT 0, longest TEXT, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS mp_rank ON match_players(created_at, score);
    CREATE INDEX IF NOT EXISTS mp_profile ON match_players(profile_id, created_at);
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, mode TEXT NOT NULL, variant TEXT NOT NULL,
      data TEXT NOT NULL, started_at INTEGER NOT NULL, duration INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, ranked INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS tk_profile ON tickets(profile_id, mode, variant);
  `);

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
    SELECT mp.profile_id AS profileId, COALESCE(pr.name, mp.name) AS name, COALESCE(pr.avatar, mp.avatar) AS avatar,
      MAX(mp.score) AS score, mp.created_at AS at, m.players_count AS players, mp.place, m.variant AS variant
    FROM match_players mp JOIN matches m ON m.id = mp.match_id LEFT JOIN profiles pr ON pr.id = mp.profile_id
    WHERE m.mode = ? ${withVariant ? 'AND m.variant = ?' : ''} AND mp.created_at >= ? AND mp.score > 0
    GROUP BY COALESCE(mp.profile_id, 'nome:' || mp.name)
    ORDER BY score DESC, at ASC LIMIT ?`;
  const lbAll = db.prepare(leaderboardSql(false));
  const lbVar = db.prepare(leaderboardSql(true));
  const winsSql = db.prepare(`
    SELECT mp.profile_id AS profileId, COALESCE(pr.name, mp.name) AS name, COALESCE(pr.avatar, mp.avatar) AS avatar, COUNT(*) AS wins, SUM(mp.score) AS points
    FROM match_players mp JOIN matches m ON m.id = mp.match_id LEFT JOIN profiles pr ON pr.id = mp.profile_id
    WHERE m.kind = 'multi' AND m.players_count >= 2 AND mp.place = 1 AND mp.created_at >= ? AND mp.profile_id IS NOT NULL
    GROUP BY mp.profile_id ORDER BY wins DESC, points DESC LIMIT ?`);
  const statsSql = db.prepare(`
    SELECT COUNT(*) AS matches, COALESCE(MAX(score), 0) AS best, COALESCE(ROUND(AVG(score)), 0) AS avg,
      COALESCE(SUM(words), 0) AS words, COALESCE(SUM(unique_words), 0) AS uniqueWords,
      COALESCE(SUM(CASE WHEN mp.place = 1 AND m.players_count >= 2 THEN 1 ELSE 0 END), 0) AS wins,
      COALESCE(SUM(CASE WHEN m.kind = 'multi' THEN 1 ELSE 0 END), 0) AS multi
    FROM match_players mp JOIN matches m ON m.id = mp.match_id WHERE mp.profile_id = ?`);
  const longestSql = db.prepare(`SELECT longest FROM match_players WHERE profile_id = ? AND longest IS NOT NULL ORDER BY LENGTH(longest) DESC, created_at ASC LIMIT 1`);
  const recentSql = db.prepare(`
    SELECT m.mode, m.variant, m.kind, m.players_count AS players, mp.score, mp.place, mp.words, mp.longest, mp.created_at AS at
    FROM match_players mp JOIN matches m ON m.id = mp.match_id WHERE mp.profile_id = ? ORDER BY mp.created_at DESC LIMIT ?`);
  const favSql = db.prepare(`SELECT m.mode, COUNT(*) AS n FROM match_players mp JOIN matches m ON m.id = mp.match_id WHERE mp.profile_id = ? GROUP BY m.mode ORDER BY n DESC LIMIT 1`);

  return {
    // ---------- perfis ----------
    createProfile({ name, avatar }) {
      const id = newId(6);
      const token = newId(16);
      const t = now();
      q.insProfile.run(id, hash(token), name, avatar, t, t);
      return { id, token, name, avatar };
    },
    profileByToken(token) {
      if (!token || typeof token !== 'string' || token.length > 100) return null;
      return q.byToken.get(hash(token)) || null;
    },
    profileById(id) {
      return q.byId.get(id) || null;
    },
    updateProfile(id, { name, avatar }) {
      q.updProfile.run(name, avatar, now(), id);
      return q.byId.get(id);
    },

    // ---------- partidas ----------
    /**
     * @param {{mode:string, variant?:string, kind:'multi'|'solo', room?:string,
     *   players:{profileId?:string, name:string, avatar:string, score:number, place:number, words?:number, unique?:number, longest?:string}[]}} m
     */
    recordMatch(m) {
      const id = newId(8);
      const t = now();
      db.exec('BEGIN');
      try {
        q.insMatch.run(id, m.mode, m.variant || '', m.kind, m.room || null, m.players.length, t);
        for (const p of m.players) {
          q.insMP.run(id, p.profileId || null, p.name, p.avatar, Math.round(p.score), p.place, p.words || 0, p.unique || 0, p.longest || null, t);
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      return id;
    },

    leaderboard({ mode, variant = null, period = 'semana', limit = 20 }) {
      const since = periodStart(period, now());
      const rows = variant ? lbVar.all(mode, variant, since, limit) : lbAll.all(mode, since, limit);
      return rows.map((r, i) => ({ pos: i + 1, ...r }));
    },

    // posição da melhor partida de um perfil no ranking (mesmo fora do top)
    positionOf({ mode, variant = null, period = 'semana', profileId }) {
      const all = this.leaderboard({ mode, variant, period, limit: 100000 });
      return all.find((r) => r.profileId === profileId) || null;
    },

    winners({ period = 'semana', limit = 10 }) {
      return winsSql.all(periodStart(period, now()), limit).map((r, i) => ({ pos: i + 1, ...r }));
    },

    profileStats(profileId) {
      const s = statsSql.get(profileId);
      return { ...s, longest: longestSql.get(profileId)?.longest || null, favorite: favSql.get(profileId)?.mode || null, recent: recentSql.all(profileId, 15) };
    },

    // ---------- tickets das partidas solo verificadas ----------
    createTicket({ profileId, mode, variant, data, duration, ranked = true }) {
      const id = newId(10);
      q.insTicket.run(id, profileId, mode, variant, JSON.stringify(data), now(), duration, ranked ? 1 : 0);
      return id;
    },
    hasRankedTicket({ profileId, mode, variant }) {
      return q.rankedTicketToday.get(profileId, mode, variant).n > 0;
    },
    ticketsSince(profileId, since) {
      return q.recentTickets.get(profileId, since).n;
    },
    takeTicket(id) {
      const t = q.getTicket.get(id);
      if (!t) return null;
      const r = q.useTicket.run(id);
      if (r.changes !== 1) return { ...t, data: JSON.parse(t.data), alreadyUsed: true };
      return { ...t, data: JSON.parse(t.data) };
    },

    close() { db.close(); },
  };
}
