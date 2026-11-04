// Consultas extras, iguais no SQLite (servidor local) e no Postgres (hospedado):
// ranking entre amigos, recordes de cada modo, evolução por semana e métricas do servidor.
// `db.prepare(sql)` devolve get/all/run (síncrono no SQLite, assíncrono no Postgres — sempre com await).
import { periodStart } from './postgres-store.js';

const WEEK = 7 * 86400000;
const n = (v) => Number(v) || 0;

export function extraQueries(db, now) {
  return {
    // Amigos = quem jogou partidas em grupo com você nos últimos 60 dias.
    // Placar da semana: pontos de cada um nas partidas que jogaram juntos.
    async friends(profileId) {
      const since = now() - 60 * 86400000;
      const week = periodStart('semana', now());
      const rows = await db.prepare(`
        SELECT p.id AS "profileId", p.name, p.avatar,
          COUNT(DISTINCT me.match_id) AS games,
          SUM(CASE WHEN other.place = 1 THEN 1 ELSE 0 END) AS wins,
          SUM(CASE WHEN other.created_at >= ? THEN other.score ELSE 0 END) AS week
        FROM match_players me
        JOIN match_players other ON other.match_id = me.match_id AND other.profile_id IS NOT NULL AND other.profile_id <> me.profile_id
        JOIN profiles p ON p.id = other.profile_id
        WHERE me.profile_id = ? AND me.created_at >= ?
        GROUP BY p.id, p.name, p.avatar
        ORDER BY week DESC, games DESC LIMIT 30`).all(week, profileId, since);
      const [mine] = await db.prepare(`
        SELECT SUM(CASE WHEN me.created_at >= ? THEN me.score ELSE 0 END) AS week,
          SUM(CASE WHEN me.place = 1 THEN 1 ELSE 0 END) AS wins, COUNT(*) AS games
        FROM match_players me JOIN matches m ON m.id = me.match_id
        WHERE me.profile_id = ? AND me.created_at >= ? AND m.players_count > 1`).all(week, profileId, since);
      return {
        rows: rows.map((r) => ({ profileId: r.profileId, name: r.name, avatar: r.avatar, games: n(r.games), wins: n(r.wins), week: n(r.week) })),
        voce: { week: n(mine?.week), wins: n(mine?.wins), games: n(mine?.games) },
      };
    },

    // Melhor pontuação da pessoa em cada modo/variante (para os cartões do início).
    async bests(profileId) {
      const rows = await db.prepare(`SELECT m.mode, m.variant, MAX(mp.score) AS best FROM match_players mp JOIN matches m ON m.id = mp.match_id
        WHERE mp.profile_id = ? GROUP BY m.mode, m.variant`).all(profileId);
      return rows.map((r) => ({ mode: r.mode, variant: r.variant, best: n(r.best) }));
    },

    // Pontos e partidas por semana (últimas 8), para o gráfico do perfil.
    async weekly(profileId) {
      const start = periodStart('semana', now()) - 7 * WEEK;
      const rows = await db.prepare('SELECT score, created_at FROM match_players WHERE profile_id = ? AND created_at >= ?').all(profileId, start);
      const weeks = Array.from({ length: 8 }, (_, i) => ({ start: start + i * WEEK, points: 0, matches: 0 }));
      for (const r of rows) {
        const w = weeks[Math.min(7, Math.floor((n(r.created_at) - start) / WEEK))];
        if (w) { w.points += n(r.score); w.matches++; }
      }
      return weeks;
    },

    // Métricas agregadas por minuto (enviadas por cada instância do servidor).
    async addMetrics(rows) {
      const ins = db.prepare('INSERT INTO metrics (at, kind, calls, total_ms, max_ms, errors, empty) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const r of rows.slice(0, 50)) await ins.run(n(r.at), String(r.kind).slice(0, 20), n(r.calls), n(r.total_ms), n(r.max_ms), n(r.errors), n(r.empty));
      await db.prepare('DELETE FROM metrics WHERE at < ?').run(now() - 3 * 86400000);
    },
    async metricsSummary(hours = 24) {
      const since = now() - hours * 3600000;
      const rows = await db.prepare(`SELECT kind, SUM(calls) AS calls, SUM(total_ms) AS total, MAX(max_ms) AS max, SUM(errors) AS errors, SUM(empty) AS empty
        FROM metrics WHERE at >= ? GROUP BY kind`).all(since);
      const byHour = await db.prepare(`SELECT at, kind, calls, errors FROM metrics WHERE at >= ? ORDER BY at`).all(since);
      const hourly = {};
      for (const r of byHour) {
        const hr = Math.floor(n(r.at) / 3600000) * 3600000;
        const h = (hourly[hr] ||= { at: hr, calls: 0, errors: 0 });
        h.calls += n(r.calls); h.errors += n(r.errors);
      }
      return {
        hours,
        kinds: rows.map((r) => ({ kind: r.kind, calls: n(r.calls), avgMs: n(r.calls) ? Math.round(n(r.total) / n(r.calls)) : 0, maxMs: n(r.max), errors: n(r.errors), empty: n(r.empty) })),
        hourly: Object.values(hourly).sort((a, b) => a.at - b.at),
      };
    },
  };
}
