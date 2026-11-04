// Salas persistidas no PostgreSQL. Cada comando é aplicado dentro de uma transação.
import { randomInt } from 'node:crypto';
import { Room, ARENA_MAX, GRACE_MS } from './room.js';
import { createRng } from '../js/core/rng.js';

const OMIT = new Set(['onFinal', 'now', 'setTimer', 'clearTimer', 'onChange', 'verifier', 'rng', 'timer', 'ticker', 'pending']);
export function snapshotRoom(room) {
  const state = Object.fromEntries(Object.entries(room).filter(([k]) => !OMIT.has(k)));
  state.rngState = room.rng.getState();
  return JSON.parse(JSON.stringify(state, (_, v) => v instanceof Map ? { __map: [...v] } : v instanceof Set ? { __set: [...v] } : v));
}
export function restoreRoom(state, options = {}) {
  const data = JSON.parse(JSON.stringify(state), (_, v) => v?.__map ? new Map(v.__map) : v?.__set ? new Set(v.__set) : v);
  const r = new Room(data.code, { ...options, setTimer: () => null, clearTimer: () => {} });
  Object.assign(r, data);
  r.rng = createRng(data.rngState);
  return r;
}
export async function advanceRoom(room, store, now = Date.now()) {
  // Restore the original deadlines, even when the last connected client was offline.
  for (let i = 0; i < 20; i++) {
    const deadline = room.endsAt;
    if (deadline == null || deadline + (room.phase === 'playing' ? GRACE_MS : 0) > now) break;
    const phase = room.phase;
    const previousNow = room.now;
    room.now = () => deadline + (phase === 'playing' ? GRACE_MS : 0);
    if (phase === 'lobby' && room.public) room.beginMatch();
    else if (phase === 'countdown') room.startRound();
    else if (phase === 'playing') room.endRound();
    else if (phase === 'reveal' && room.public) room.countdown();
    else { room.now = previousNow; break; }
    room.now = previousNow;
  }
  if (room.phase === 'playing' && room.game.tick) room.game.tick(room);
  if (room.phase === 'final' && !room.finalResult) room.finalResult = await store.recordMatch(room.matchSummary());
}

// Trava de uma sala (dentro da transação). Salas diferentes andam em paralelo.
const lockRoom = (sql, code) => sql`SELECT pg_advisory_xact_lock(hashtextextended(${'trama-room:' + code}, 7))`;
const roomCode = (c) => String(c || '').toUpperCase().trim().slice(0, 8);

const PRESENCE_MS = 20000;

// Quem está conectado em cada sala: vem da tabela de conexões (cada celular atualiza o seu
// "seen" a cada consulta), e não do estado da sala — assim a consulta de 1 s não precisa
// regravar a sala inteira.
async function presence(sql, code, now) {
  const rows = await sql`SELECT player_id, MAX(seen) AS seen FROM connections WHERE code = ${code} AND is_tv = false GROUP BY player_id`;
  const online = new Set();
  for (const r of rows) if (Number(r.seen) > now - PRESENCE_MS) online.add(r.player_id);
  return online;
}

// Resumo gravado junto com a sala: próximo prazo, quem está conectado e quem está na sala.
// A consulta rápida decide só com isso se precisa do caminho completo.
export function roomMeta(r) {
  let deadline = r.endsAt != null ? r.endsAt + (r.phase === 'playing' ? GRACE_MS : 0) : null;
  // Chuva de Letras: a próxima chuva também é um "prazo" (todos recebem a grade nova)
  if (r.phase === 'playing' && r.rd?.rain) {
    const { startedAt, everyMs, drops } = r.rd.rain;
    const k = Math.max(0, Math.floor((r.now() - startedAt) / everyMs));
    if (k < drops.length) deadline = Math.min(deadline ?? Infinity, startedAt + (k + 1) * everyMs);
  }
  if (r.phase === 'playing' && r.game?.tick) {
    for (const p of r.players.values()) if (p.rs?.alive && p.rs.lifeEndsAt != null) deadline = Math.min(deadline ?? Infinity, p.rs.lifeEndsAt);
  }
  const players = [...r.players.values()];
  return {
    deadline: Number.isFinite(deadline) ? Math.floor(deadline) : null,
    finalPending: r.phase === 'final' && !r.finalResult,
    connected: players.filter((p) => p.connected).map((p) => p.id).join(','),
    ids: players.map((p) => p.id).join(','),
  };
}
const ids = (s) => (s ? String(s).split(',').filter(Boolean) : []);
const SEEN_EVERY_MS = 5000; // "ainda estou aqui": grava no máximo a cada 5 s

export async function handleMulti(sql, store, { session, msg }, now = Date.now()) {
  if (!/^[a-f0-9-]{36}$/.test(session || '')) throw new Error('Sessão inválida');
  const m = msg || { t: 'poll' };
  // Caminho rápido da consulta periódica: o celular diz qual versão da sala já tem.
  // Se nada mudou, a resposta é vazia — sem ler o estado, sem travar e sem gravar.
  if (m.t === 'poll') {
    const v = Number.isFinite(Number(m.v)) ? Number(m.v) : -1;
    const [c] = await sql`SELECT c.code, c.player_id, c.is_tv, c.seen, r.version, r.deadline, r.final_pending, r.connected, r.player_ids,
      CASE WHEN r.version <> ${v} THEN r.state END AS state
      FROM connections c LEFT JOIN rooms r ON r.code = c.code WHERE c.id = ${session}`;
    if (c && c.version != null) {
      const connected = new Set(ids(c.connected));
      let fast = !(c.deadline != null && Number(c.deadline) <= now) && !c.final_pending;
      if (fast && !c.is_tv && !connected.has(c.player_id)) fast = false; // voltou: marca como conectado
      const touch = now - Number(c.seen) >= SEEN_EVERY_MS;
      if (fast && touch) {
        const online = await presence(sql, c.code, now);
        if (!c.is_tv) online.add(c.player_id);
        if (ids(c.player_ids).some((id) => connected.has(id) !== online.has(id))) fast = false; // alguém caiu/voltou
      }
      if (fast) {
        if (touch) await sql`UPDATE connections SET seen = ${now} WHERE id = ${session}`;
        if (c.state == null) return []; // nada mudou desde a última resposta
        const room = restoreRoom(c.state);
        const since = Number(m.since) || Number(c.seen);
        const out = [];
        for (const reaction of room.reactions || []) if (reaction.at > since) out.push({ t: 'reaction', ...reaction });
        out.push({ t: 'state', state: room.stateFor(c.player_id), v: Number(c.version) });
        return out;
      }
    }
  }
  // A trava global só protege o "diretório": criar sala e procurar partida na Arena.
  if (m.t === 'create' || m.t === 'quick' || (m.t === 'watch' && m.create)) await sql`SELECT pg_advisory_xact_lock(71903201)`;
  if (Math.random() < 0.02) {
    await sql`DELETE FROM connections WHERE seen < ${now - 86400000}`;
    await sql`DELETE FROM rooms WHERE updated_at < ${now - 86400000}`;
  }
  // registra a conexão (se for nova) e já lê o que ela tem, numa ida só ao banco
  const [conn] = await sql`INSERT INTO connections (id, seen) VALUES (${session}, ${now})
    ON CONFLICT (id) DO UPDATE SET id = excluded.id RETURNING *`;
  // Trava a sala atual e a sala de destino, sempre na mesma ordem (evita impasse).
  const target = m.t === 'join' || m.t === 'resume' || (m.t === 'watch' && !m.create) ? roomCode(m.code) : null;
  for (const code of [...new Set([conn.code, target].filter(Boolean))].sort()) await lockRoom(sql, code);
  const out = [];
  const load = async (code) => {
    const [row] = await sql`SELECT state FROM rooms WHERE code = ${code || ''}`;
    return row ? restoreRoom(row.state) : null;
  };
  let version = null;
  const save = async (r) => {
    await advanceRoom(r, store, now);
    const meta = roomMeta(r);
    const [row] = await sql`INSERT INTO rooms (code, state, updated_at, version, deadline, final_pending, connected, player_ids)
      VALUES (${r.code}, ${sql.json(snapshotRoom(r))}, ${now}, 1, ${meta.deadline}, ${meta.finalPending}, ${meta.connected}, ${meta.ids})
      ON CONFLICT(code) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at, version = rooms.version + 1,
        deadline = excluded.deadline, final_pending = excluded.final_pending, connected = excluded.connected, player_ids = excluded.player_ids
      RETURNING version`;
    if (r === room) version = Number(row.version);
  };
  let room = await load(conn.code);
  if (room) await advanceRoom(room, store, now);
  const detach = async () => {
    if (room) {
      if (conn.is_tv) room.removeSpectator(conn.player_id); else room.leave(conn.player_id);
      await save(room);
    }
    room = null; conn.code = null; conn.player_id = null; conn.is_tv = false;
  };
  const create = async (isPublic = false) => {
    const letters = 'BCDFGHJKLMNPQRSTVWXZ';
    let code;
    do { code = Array.from({ length: 4 }, () => letters[randomInt(letters.length)]).join(''); } while (await load(code));
    await lockRoom(sql, code);
    return new Room(code, { isPublic, setTimer: () => null, clearTimer: () => {} });
  };
  const attach = (p) => {
    conn.code = room.code; conn.player_id = p.id; conn.is_tv = false;
    out.push({ t: 'joined', code: room.code, id: p.id, token: p.token });
  };
  try {
    if (m.t === 'create' || m.t === 'join' || m.t === 'quick') {
      if (room) await detach();
      if (m.t === 'create') room = await create();
      if (m.t === 'join') room = await load(target);
      if (m.t === 'quick') {
        const candidates = await sql`SELECT code FROM rooms WHERE state->>'public' = 'true' AND state->>'phase' = 'lobby' AND updated_at > ${now - 30000} ORDER BY updated_at DESC LIMIT 10`;
        for (const candidate of candidates) {
          await lockRoom(sql, candidate.code);
          const r = await load(candidate.code); // relê com a sala travada
          if (r && r.public && r.phase === 'lobby' && r.players.size < ARENA_MAX) { room = r; break; }
        }
        if (!room) room = await create(true);
      }
      if (!room) throw new Error('Sala não encontrada. Confira o código.');
      const profile = await store.profileByToken(m.profile);
      if (m.t === 'join') room.checkPin(m.pin, { name: m.name, profileId: profile?.id || null });
      attach(room.addPlayer({ name: m.name, avatar: m.avatar, profileId: profile?.id || null }));
    } else if (m.t === 'resume') {
      const candidate = await load(target);
      const p = candidate?.resume(m.id, m.token);
      if (!p) out.push({ t: 'expired' });
      else { room = candidate; attach(p); }
    } else if (m.t === 'watch') {
      room = m.create ? await create() : await load(target);
      if (!room) throw new Error('Sala não encontrada. Confira o código.');
      conn.is_tv = true; conn.code = room.code; conn.player_id = room.addSpectator();
      out.push({ t: 'watching', code: room.code, id: conn.player_id });
    } else if (m.t === 'leave') { await detach(); out.push({ t: 'left' }); }
    else if (m.t === 'ping') out.push({ t: 'pong', now });
    else if (m.t === 'disconnect') {
      if (room) {
        if (conn.is_tv) room.removeSpectator(conn.player_id);
        else {
          // An old socket closing must not disconnect an already reconnected player.
          const newer = await sql`SELECT id FROM connections WHERE code = ${room.code} AND player_id = ${conn.player_id} AND id <> ${session} AND seen > ${now - 10000}`;
          if (!newer.length) room.disconnect(conn.player_id);
        }
        await save(room);
      }
      await sql`DELETE FROM connections WHERE id = ${session}`;
      return [];
    } else if (m.t !== 'poll') {
      if (!room) throw new Error('Você não está em uma sala');
      if (!conn.is_tv) {
        const id = conn.player_id;
        switch (m.t) {
          case 'ready': room.setReady(id, m.ready); break;
          case 'options': room.setOptions(id, m.options || {}); break;
          case 'start': room.start(id); break;
          case 'next': room.next(id); break;
          case 'rematch': room.rematch(id, !!m.again); break;
          case 'want': room.wantRematch(id, m.on !== false); break;
          case 'host': room.setHost(id, String(m.id || '')); break;
          case 'privacy': room.setPrivacy(id, { name: m.name, pin: m.pin }); break;
          case 'act': out.push({ t: 'res', rid: m.rid, result: await room.act(id, m) }); break;
          case 'react': {
            const reaction = room.react(id, m.emoji);
            if (reaction) room.reactions = [...(room.reactions || []).filter(x => x.at > now - 5000), { ...reaction, at: now }].slice(-24);
            break;
          }
        }
      }
    }
  } catch (e) { out.push({ t: 'error', message: e.message }); }
  if (room && conn.code === room.code) {
    const online = await presence(sql, room.code, now);
    if (!conn.is_tv) {
      online.add(conn.player_id);
      const p = room.players.get(conn.player_id);
      if (p) { p.connected = true; delete p.lastSeen; }
    }
    for (const p of [...room.players.values()]) {
      if (p.connected && !online.has(p.id)) room.disconnect(p.id);
      // quem voltou por outra conexão aparece de novo como conectado
      else if (!p.connected && online.has(p.id) && p.rs !== undefined) p.connected = true;
    }
    await save(room);
    for (const reaction of room.reactions || []) if (reaction.at > Number(conn.seen)) out.push({ t: 'reaction', ...reaction });
    out.push({ t: 'state', state: room.stateFor(conn.player_id), v: version });
  }
  await sql`UPDATE connections SET code = ${conn.code}, player_id = ${conn.player_id}, is_tv = ${conn.is_tv}, seen = ${now} WHERE id = ${session}`;
  return out;
}

export async function arenaStatus(sql) {
  const rows = await sql`SELECT state FROM rooms WHERE state->>'public' = 'true' AND updated_at > ${Date.now() - 30000}`;
  let waiting = 0, playing = 0;
  for (const { state } of rows) {
    const room = restoreRoom(state);
    if (room.phase === 'lobby') waiting += room.players.size;
    else if (room.phase !== 'final') playing += [...room.players.values()].filter(p => p.connected).length;
  }
  return { waiting, playing };
}
