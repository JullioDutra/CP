import assert from 'node:assert/strict';
import http from 'node:http';
import { loadTestDict, fakeClock } from './helpers.mjs';
import { createStore, periodStart } from '../server/store.js';
import { createApi, brDay } from '../server/api.js';
import { createVerifier } from '../server/ai.js';
import { Room } from '../server/room.js';
import { solve, findPath, wordPoints } from '../js/core/letters.js';
loadTestDict();

// ---------- períodos (Brasília, UTC−3) ----------
const qua = Date.parse('2026-11-04T15:00:00Z'); // quarta, 12h em Brasília
assert.equal(new Date(periodStart('hoje', qua)).toISOString(), '2026-11-04T03:00:00.000Z');
assert.equal(new Date(periodStart('semana', qua)).toISOString(), '2026-11-02T03:00:00.000Z'); // segunda
assert.equal(periodStart('sempre', qua), 0);
assert.equal(brDay(Date.parse('2026-11-05T02:00:00Z')), '2026-11-04');

// ---------- store ----------
let t = qua;
const store = createStore(':memory:', { now: () => t });
const ana = store.createProfile({ name: 'Ana', avatar: '🦊' });
const beto = store.createProfile({ name: 'Beto', avatar: '🐼' });
assert.equal(store.profileByToken(ana.token).id, ana.id);
assert.equal(store.profileByToken('x'), null);
assert.equal(store.updateProfile(ana.id, { name: 'Aninha', avatar: '🐸' }).name, 'Aninha');
const P = (p, score, place, extra = {}) => ({ profileId: p.id, name: p.name, avatar: p.avatar, score, place, ...extra });
store.recordMatch({ mode: 'grupo-classico', variant: '4', kind: 'multi', players: [P(ana, 50, 1, { words: 10, unique: 4, longest: 'casamento' }), P(beto, 30, 2, { words: 8, unique: 2, longest: 'bolo' })] });
store.recordMatch({ mode: 'grupo-classico', variant: '4', kind: 'multi', players: [P(beto, 80, 1), P(ana, 70, 2)] });
store.recordMatch({ mode: 'grupo-classico', variant: '5', kind: 'multi', players: [P(ana, 200, 1)] }); // sozinha: não conta vitória
t -= 10 * 86400 * 1000; // partida antiga (fora da semana)
store.recordMatch({ mode: 'grupo-classico', variant: '4', kind: 'multi', players: [P(ana, 999, 1), P(beto, 1, 2)] });
t = qua;
let lb = store.leaderboard({ mode: 'grupo-classico', variant: '4', period: 'semana' });
assert.deepEqual(lb.map((r) => [r.name, r.score]), [['Beto', 80], ['Aninha', 70]], 'melhor partida de cada um na semana, com o nome atual do perfil');
lb = store.leaderboard({ mode: 'grupo-classico', variant: '4', period: 'sempre' });
assert.equal(lb[0].score, 999);
assert.equal(store.leaderboard({ mode: 'grupo-classico', period: 'semana' })[0].score, 200, 'sem variante: todos os tamanhos');
assert.equal(store.positionOf({ mode: 'grupo-classico', variant: '4', period: 'semana', profileId: ana.id }).pos, 2);
const wins = store.winners({ period: 'semana' });
assert.deepEqual(wins.map((w) => w.wins), [1, 1], 'Beto e Ana: 1 vitória cada na semana (a partida solo não conta)');
assert.deepEqual(new Set(wins.map((w) => w.profileId)), new Set([ana.id, beto.id]));
const st = store.profileStats(ana.id);
assert.equal(st.matches, 4);
assert.equal(st.best, 999);
assert.equal(st.wins, 2); // 1ª partida + partida antiga (vs Beto); a solo não conta
assert.equal(st.longest, 'casamento');
assert.equal(st.recent.length, 4);
// tickets: uso único
const tk = store.createTicket({ profileId: ana.id, mode: 'classico-grade', variant: '4', data: { grid: ['a'] }, duration: 180 });
assert.equal(store.takeTicket(tk).alreadyUsed, undefined);
assert.equal(store.takeTicket(tk).alreadyUsed, true);

// ---------- sala → ranking (matchSummary) ----------
{
  const clock = fakeClock();
  const recorded = [];
  const room = new Room('ABCD', { now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, seed: 7, onFinal: (r) => recorded.push(r.matchSummary()) });
  const a = room.addPlayer({ name: 'Ana', profileId: ana.id });
  const b = room.addPlayer({ name: 'Beto', profileId: beto.id });
  room.setOptions(a.id, { rounds: 1, seconds: 60, size: 5 });
  room.start(a.id);
  clock.advance(3500);
  const ws = solve(room.rd.grid, 5).sort((x, y) => y.length - x.length);
  room.act(a.id, { a: 'submit', word: ws[0] });
  clock.advance(200);
  room.act(a.id, { a: 'submit', word: ws[1] });
  room.act(b.id, { a: 'submit', word: ws[1] });
  clock.advance(60400);
  assert.equal(recorded.length, 1);
  const sm = recorded[0];
  assert.equal(sm.mode, 'grupo-classico');
  assert.equal(sm.variant, '5');
  assert.equal(sm.players[0].profileId, ana.id);
  assert.equal(sm.players[0].place, 1);
  assert.equal(sm.players[0].words, 2);
  assert.equal(sm.players[0].unique, 1);
  assert.equal(sm.players[0].longest, ws[0]);
  assert.equal(sm.players[1].score, wordPoints(ws[1]));
}

// ---------- API HTTP ----------
const api = createApi({ verifier: createVerifier({ env: {}, log: { info() {}, warn() {} } }), store, now: () => t });
const srv = http.createServer((req, res) => api(req, res, new URL(req.url, 'http://x')));
await new Promise((r) => srv.listen(0, r));
const base = `http://localhost:${srv.address().port}`;
const call = async (method, path, { body, token } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { 'x-trama-perfil': token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json() };
};
const cria = await call('POST', '/api/perfil', { body: { name: '  <Caio>  ', avatar: '🦉' } });
assert.equal(cria.status, 200);
assert.equal(cria.data.name, 'Caio');
const tok = cria.data.token;
assert.equal((await call('GET', '/api/perfil', { token: tok })).data.perfil.name, 'Caio');
assert.equal((await call('PATCH', '/api/perfil', { token: tok, body: { name: 'Caio M', avatar: '🐝' } })).data.perfil.avatar, '🐝');
assert.equal((await call('GET', '/api/perfil', { token: 'nada' })).status, 404);
assert.equal((await call('POST', '/api/solo/inicio', { body: { modo: 'classico-grade' } })).status, 401);

// partida solo verificada: o servidor dá a grade e recalcula os pontos
const ini = await call('POST', '/api/solo/inicio', { token: tok, body: { modo: 'classico-grade', variante: '5' } });
assert.equal(ini.status, 200);
assert.equal(ini.data.grid.length, 25);
const possible = solve(ini.data.grid, 5).sort((x, y) => y.length - x.length).slice(0, 5);
const palavras = [...possible.map((w) => ({ w, path: findPath(ini.data.grid, 5, w) })), { w: 'zzzzz' }, { w: possible[0] }];
t += 60 * 1000;
const fim = await call('POST', '/api/solo/fim', { token: tok, body: { ticket: ini.data.ticket, palavras } });
assert.equal(fim.data.ok, true);
assert.equal(fim.data.palavras, 5, 'duplicada e inexistente não contam');
assert.deepEqual(fim.data.recusadas, ['zzzzz']);
assert.equal(fim.data.score, possible.reduce((s, w) => s + wordPoints(w), 0));
assert.equal(fim.data.posicao.semana, 1);
assert.equal((await call('POST', '/api/solo/fim', { token: tok, body: { ticket: ini.data.ticket, palavras } })).status, 409, 'não reenvia');
// tempo estourado
const ini2 = await call('POST', '/api/solo/inicio', { token: tok, body: { modo: 'classico-grade', variante: '4' } });
t += 10 * 60 * 1000;
assert.equal((await call('POST', '/api/solo/fim', { token: tok, body: { ticket: ini2.data.ticket, palavras: [] } })).data.ok, false);
// Desafio do Dia: só a 1ª partida do dia vale
const d1 = await call('POST', '/api/solo/inicio', { token: tok, body: { modo: 'novo-diario', dia: brDay(t) } });
const d2 = await call('POST', '/api/solo/inicio', { token: tok, body: { modo: 'novo-diario', dia: brDay(t) } });
assert.equal(d1.data.ranked, true);
assert.equal(d2.data.ranked, false);
assert.equal(Object.keys(d1.data.bonus).length, 2);
// ranking
const rk = await call('GET', '/api/ranking?modo=classico-grade&variante=5&periodo=hoje', { token: tok });
assert.equal(rk.data.rows[0].name, 'Caio M');
assert.equal(rk.data.voce.pos, 1);
assert.equal((await call('GET', '/api/ranking?modo=xxx')).status, 400);
assert.equal((await call('GET', '/api/vencedores?periodo=semana')).data.rows.length, 2);
// amigos, recordes, evolução e saúde do servidor
const rec = await call('GET', '/api/recordes', { token: tok });
assert.equal(rec.status, 200);
assert.ok(rec.data.recordes.some((r) => r.mode === 'classico-grade' && r.variant === '5' && r.best === fim.data.score));
const evo = await call('GET', '/api/evolucao', { token: tok });
assert.equal(evo.status, 200);
assert.equal(evo.data.semanas.length, 8);
assert.ok(evo.data.semanas.reduce((s, w) => s + w.matches, 0) >= 1);
const ami = await call('GET', '/api/amigos', { token: tok });
assert.equal(ami.status, 200);
assert.ok(Array.isArray(ami.data.rows));
assert.equal((await call('GET', '/api/amigos')).status, 404);
await store.addMetrics([{ at: t, kind: 'poll', calls: 10, total_ms: 50, max_ms: 9, errors: 1, empty: 8 }]);
const sau = await call('GET', '/api/saude');
assert.equal(sau.status, 200);
srv.close();
console.log('ok store');
