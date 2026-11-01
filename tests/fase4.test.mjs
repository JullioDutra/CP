import assert from 'node:assert/strict';
import { loadTestDict, fakeClock } from './helpers.mjs';
import { Room, ARENA_WAIT_MS, ARENA_NEXT_MS } from '../server/room.js';
import { RoomManager } from '../server/rooms.js';
import { createStore } from '../server/store.js';
import { eloDeltas, leagueOf, seasonOf } from '../js/core/leagues.js';
import { solve, wordPoints } from '../js/core/letters.js';
import { SURVIVAL } from '../js/core/multimodes.js';
loadTestDict();

// ---------- Elo / ligas ----------
const d = eloDeltas([{ id: 'a', rating: 1000, place: 1 }, { id: 'b', rating: 1000, place: 2 }]);
assert.deepEqual(d, { a: 16, b: -16 });
const d3 = eloDeltas([{ id: 'a', rating: 1000, place: 1 }, { id: 'b', rating: 1000, place: 2 }, { id: 'c', rating: 1000, place: 3 }]);
assert.equal(d3.a + d3.b + d3.c, 0);
assert.ok(d3.a > 0 && d3.c < 0 && d3.b === 0);
assert.equal(leagueOf(1000).key, 'bronze');
assert.equal(leagueOf(1210).key, 'ouro');
assert.equal(seasonOf(Date.parse('2026-12-01T02:00:00Z')), '2026-11', 'fuso de Brasília');

const mk = (clock, extra = {}) => new Room('ABCD', { now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, seed: 3, ...extra });

// ---------- Arena Pública: sem anfitrião, começa sozinha ----------
{
  const clock = fakeClock();
  const finals = [];
  const room = mk(clock, { isPublic: true, onFinal: (r) => { finals.push(r.matchSummary()); return { ratings: {}, achievements: {} }; } });
  const a = room.addPlayer({ name: 'Ana' });
  assert.equal(room.hostId, null);
  assert.equal(room.endsAt, null, 'sozinha não começa');
  assert.throws(() => room.start(a.id), /Arena/);
  const b = room.addPlayer({ name: 'Beto' });
  assert.ok(room.endsAt, 'com 2 pessoas agenda o início');
  room.disconnect(b.id); // saiu da fila
  assert.equal(room.players.size, 1);
  assert.equal(room.endsAt, null);
  room.addPlayer({ name: 'Caio' });
  clock.advance(ARENA_WAIT_MS + 3500);
  assert.equal(room.phase, 'playing');
  assert.throws(() => room.addPlayer({ name: 'Atrasado' }), /começou/);
  clock.advance(room.options.seconds * 1000 + 400);
  assert.equal(room.phase, 'reveal');
  clock.advance(ARENA_NEXT_MS + 3500);
  assert.equal(room.phase, 'playing', 'avança sozinha para a 2ª rodada');
  clock.advance(room.options.seconds * 1000 + 400);
  assert.equal(room.phase, 'final');
  assert.equal(finals[0].kind, 'arena');
}

// ---------- Arena Sobrevivência ----------
{
  const clock = fakeClock();
  const room = mk(clock);
  const a = room.addPlayer({ name: 'Ana' });
  const b = room.addPlayer({ name: 'Beto' });
  room.setOptions(a.id, { mode: 'arena-sobrevivencia', size: 5 });
  room.start(a.id);
  clock.advance(3500);
  assert.equal(room.stateFor(a.id).play.alive, true);
  const ws = solve(room.rd.grid, 5).sort((x, y) => y.length - x.length);
  const lifeB = room.players.get(b.id).rs.lifeEndsAt;
  const r = room.act(a.id, { a: 'submit', word: ws[0] });
  assert.ok(r.ok);
  assert.equal(r.gain, Math.min(ws[0].length, 30));
  assert.equal(room.players.get(b.id).rs.lifeEndsAt, lifeB - SURVIVAL.stealMs, 'roubou 1 s do Beto');
  // Beto fica sem tempo e é eliminado; Ana vence
  clock.advance(60000);
  assert.equal(room.phase, 'final');
  const det = room.rounds[0];
  assert.deepEqual(det.placement, [a.id, b.id]);
  assert.equal(room.players.get(a.id).total, wordPoints(ws[0]) + SURVIVAL.bonus[0]);
  assert.equal(det.extras[0].pts, SURVIVAL.bonus[0]);
  assert.equal(room.act(b.id, { a: 'submit', word: ws[1] }).ok, false);
}

// ---------- Times ----------
{
  const clock = fakeClock();
  const room = mk(clock);
  const ps = ['Ana', 'Beto', 'Caio', 'Duda'].map((n) => room.addPlayer({ name: n }));
  room.setOptions(ps[0].id, { mode: 'times', rounds: 1, seconds: 60, size: 5 });
  room.start(ps[0].id);
  const teams = room.teams;
  assert.equal(Object.values(teams).filter((t) => t === 'A').length, 2);
  clock.advance(3500);
  const ws = solve(room.rd.grid, 5);
  const [x, y] = ps.filter((p) => teams[p.id] === 'A');
  const [z] = ps.filter((p) => teams[p.id] === 'B');
  assert.ok(room.act(x.id, { a: 'submit', word: ws[0] }).ok);
  assert.match(room.act(y.id, { a: 'submit', word: ws[0] }).reason, /time já achou/);
  assert.ok(room.act(z.id, { a: 'submit', word: ws[0] }).ok, 'o outro time pode achar a mesma');
  assert.ok(room.act(z.id, { a: 'submit', word: ws[1] }).ok);
  assert.deepEqual(room.stateFor(y.id).play.teamWords, [ws[0]]);
  clock.advance(60400);
  const r = room.rounds[0];
  assert.equal(r.teamScores.A, wordPoints(ws[0]));
  assert.equal(r.teamScores.B, wordPoints(ws[0]) + wordPoints(ws[1]));
  const sm = room.matchSummary();
  assert.equal(sm.players.find((p) => p.name === y.name).place, 2, 'colocação do time');
  assert.equal(sm.players.find((p) => p.name === z.name).place, 1);
}

// ---------- Elo gravado só na Arena + conquistas + sequência ----------
{
  let t = Date.parse('2026-11-04T15:00:00Z');
  const store = createStore(':memory:', { now: () => t });
  const ana = store.createProfile({ name: 'Ana', avatar: '🦊' });
  const beto = store.createProfile({ name: 'Beto', avatar: '🐼' });
  const P = (p, score, place, extra = {}) => ({ profileId: p.id, name: p.name, avatar: p.avatar, score, place, ...extra });
  let res = store.recordMatch({ mode: 'grupo-classico', variant: '4', kind: 'multi', players: [P(ana, 120, 1, { longest: 'estacionamento', unique: 12 }), P(beto, 10, 2)] });
  assert.deepEqual(res.ratings, {}, 'sala privada não mexe no nível');
  assert.deepEqual(res.achievements[ana.id].sort(), ['palavra10', 'palavra8', 'pontos100', 'primeira', 'unicas10', 'vitoria'].sort());
  res = store.recordMatch({ mode: 'grupo-classico', variant: '4', kind: 'arena', players: [P(ana, 50, 1), P(beto, 10, 2)] });
  assert.equal(res.ratings[ana.id].after, 1016);
  assert.equal(res.ratings[beto.id].after, 984);
  assert.ok(res.achievements[ana.id].includes('arena'));
  assert.equal(store.leagueTable()[0].name, 'Ana');
  assert.equal(store.ratingOf(beto.id).rating, 984);
  // sequência de 3 dias no Desafio do Dia
  for (const day of ['2026-11-02', '2026-11-03', '2026-11-04']) store.recordMatch({ mode: 'novo-diario', variant: day, kind: 'solo', players: [P(beto, 5, 1)] });
  assert.equal(store.streak(beto.id), 3);
  assert.ok(store.profileStats(beto.id).achievements.some((a) => a.key === 'sequencia3'));
  t += 3 * 86400000;
  assert.equal(store.streak(beto.id), 0, 'pulou dias: sequência zera');
  store.report({ reporterId: ana.id, reportedName: 'Beto', room: 'ABCD', reason: 'nome ofensivo' });
}

// ---------- RoomManager: fila da Arena e reações ----------
{
  const mgr = new RoomManager({});
  const msgs = [[], []];
  const c1 = mgr.connect((m) => msgs[0].push(m));
  const c2 = mgr.connect((m) => msgs[1].push(m));
  c1.handle({ t: 'quick', name: 'Ana' });
  c2.handle({ t: 'quick', name: 'Beto' });
  const code1 = msgs[0].find((m) => m.t === 'joined').code;
  const code2 = msgs[1].find((m) => m.t === 'joined').code;
  assert.equal(code1, code2, 'os dois caem na mesma Arena');
  assert.deepEqual(mgr.arenaStatus(), { waiting: 2, playing: 0 });
  c1.handle({ t: 'react', emoji: '🔥' });
  c1.handle({ t: 'react', emoji: '🔥' }); // limitado
  c1.handle({ t: 'react', emoji: '💩' }); // não permitido
  assert.equal(msgs[1].filter((m) => m.t === 'reaction').length, 1);
  c2.handle({ t: 'start' });
  assert.match(msgs[1].at(-1).message, /Arena/);
  for (const r of mgr.rooms.values()) r.destroy();
}
console.log('ok fase4');
