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

export async function handleMulti(sql, store, { session, msg }, now = Date.now()) {
  if (!/^[a-f0-9-]{36}$/.test(session || '')) throw new Error('Sessão inválida');
  // Serializes the small matchmaking directory and room transitions across instances.
  await sql`SELECT pg_advisory_xact_lock(71903201)`;
  await sql`DELETE FROM connections WHERE seen < ${now - 86400000}`;
  await sql`DELETE FROM rooms WHERE updated_at < ${now - 86400000}`;
  let [conn] = await sql`SELECT * FROM connections WHERE id = ${session}`;
  if (!conn) {
    [conn] = await sql`INSERT INTO connections (id, seen) VALUES (${session}, ${now}) RETURNING *`;
  }
  const out = [];
  const load = async (code) => {
    const [row] = await sql`SELECT state FROM rooms WHERE code = ${code || ''}`;
    return row ? restoreRoom(row.state) : null;
  };
  const save = async (r) => {
    await advanceRoom(r, store, now);
    await sql`INSERT INTO rooms (code, state, updated_at) VALUES (${r.code}, ${sql.json(snapshotRoom(r))}, ${now})
      ON CONFLICT(code) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`;
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
    return new Room(code, { isPublic, setTimer: () => null, clearTimer: () => {} });
  };
  const attach = (p) => {
    conn.code = room.code; conn.player_id = p.id; conn.is_tv = false;
    out.push({ t: 'joined', code: room.code, id: p.id, token: p.token });
  };
  const m = msg || { t: 'poll' };
  try {
    if (m.t === 'create' || m.t === 'join' || m.t === 'quick') {
      if (room) await detach();
      if (m.t === 'create') room = await create();
      if (m.t === 'join') room = await load(String(m.code || '').toUpperCase().trim());
      if (m.t === 'quick') {
        const candidates = await sql`SELECT state FROM rooms WHERE state->>'public' = 'true' AND state->>'phase' = 'lobby' AND updated_at > ${now - 30000} ORDER BY updated_at DESC`;
        for (const candidate of candidates) {
          const r = restoreRoom(candidate.state);
          if (r.players.size < ARENA_MAX) { room = r; break; }
        }
        if (!room) room = await create(true);
      }
      if (!room) throw new Error('Sala não encontrada. Confira o código.');
      const profile = await store.profileByToken(m.profile);
      attach(room.addPlayer({ name: m.name, avatar: m.avatar, profileId: profile?.id || null }));
    } else if (m.t === 'resume') {
      const candidate = await load(String(m.code || '').toUpperCase());
      const p = candidate?.resume(m.id, m.token);
      if (!p) out.push({ t: 'expired' });
      else { room = candidate; attach(p); }
    } else if (m.t === 'watch') {
      room = m.create ? await create() : await load(String(m.code || '').toUpperCase());
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
          case 'rematch': room.rematch(id); break;
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
    if (!conn.is_tv) {
      const p = room.players.get(conn.player_id);
      if (p) { p.connected = true; p.lastSeen = now; }
    }
    for (const p of [...room.players.values()]) {
      if (p.connected && p.lastSeen && p.lastSeen < now - 20000) room.disconnect(p.id);
    }
    await save(room);
    for (const reaction of room.reactions || []) if (reaction.at > Number(conn.seen)) out.push({ t: 'reaction', ...reaction });
    out.push({ t: 'state', state: room.stateFor(conn.player_id) });
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
