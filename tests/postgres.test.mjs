// Teste de integração com um Postgres de verdade (o mesmo esquema do Supabase).
// Roda só com TRAMA_TEST_PG=postgres://... (ex.: Postgres local); sem ela, é pulado.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { loadTestDict } from './helpers.mjs';
import { localBackend } from '../server/local-backend.js';
import { createPostgresStore } from '../server/postgres-store.js';
import { handleMulti } from '../server/durable-rooms.js';
import { PG_OPTIONS } from '../server/backend.js';
import { solve, findPath, wordPoints } from '../js/core/letters.js';
import { createVerifier } from '../server/ai.js';
import { setupSudoku, setupWordSearch } from '../js/core/solo-verify.js';

const URL_PG = process.env.TRAMA_TEST_PG;
if (!URL_PG) { console.log('pulado postgres (defina TRAMA_TEST_PG)'); process.exit(0); }
loadTestDict();

// banco limpo com o esquema do Supabase
const admin = postgres(URL_PG, { max: 1, onnotice: () => {} });
await admin.unsafe('DROP SCHEMA IF EXISTS trama CASCADE');
await admin.unsafe(`DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
await admin.unsafe(readFileSync(new URL('../deployment/schema.sql', import.meta.url), 'utf8'));

const handle = await localBackend(URL_PG, { verifier: createVerifier({ env: {}, log: { info() {}, warn() {} } }) });
const api = async (method, path, { body, profile } = {}) => {
  const r = await handle({ action: 'api', method, path, profile, body: body ? JSON.stringify(body) : '', ip: '10.0.0.1' });
  return { status: r.status, data: JSON.parse(r.body || 'null') };
};

// ---------- perfil, solo verificado, ranking ----------
const p = await api('POST', '/api/perfil', { body: { name: 'Ana', avatar: '🦊' } });
assert.equal(p.status, 200);
const tok = p.data.token;
assert.equal((await api('GET', '/api/perfil', { profile: tok })).data.perfil.name, 'Ana');
assert.equal((await api('PATCH', '/api/perfil', { profile: tok, body: { name: 'Aninha', avatar: '🐸' } })).data.perfil.avatar, '🐸');
const ini = await api('POST', '/api/solo/inicio', { profile: tok, body: { modo: 'classico-grade', variante: '4' } });
assert.equal(ini.status, 200);
const ws = solve(ini.data.grid, 4).sort((a, b) => b.length - a.length).slice(0, 3);
const fim = await api('POST', '/api/solo/fim', { profile: tok, body: { ticket: ini.data.ticket, palavras: ws.map((w) => ({ w, path: findPath(ini.data.grid, 4, w) })) } });
assert.equal(fim.data.ok, true);
assert.equal(fim.data.score, ws.reduce((s, w) => s + wordPoints(w), 0));
assert.equal(fim.data.posicao.semana, 1);
assert.ok(fim.data.conquistas.includes('primeira'));
assert.equal((await api('POST', '/api/solo/fim', { profile: tok, body: { ticket: ini.data.ticket, palavras: [] } })).status, 409);
const rk = await api('GET', '/api/ranking?modo=classico-grade&variante=4&periodo=hoje', { profile: tok });
assert.equal(rk.data.rows[0].name, 'Aninha');
assert.equal(rk.data.voce.pos, 1);
assert.equal((await api('GET', '/api/ligas', { profile: tok })).data.voce.rating, 1000);
assert.equal((await api('GET', '/api/vencedores?periodo=semana')).status, 200);
assert.equal((await api('POST', '/api/denuncia', { profile: tok, body: { nome: 'X', motivo: 'teste' } })).data.ok, true);
assert.deepEqual((await api('GET', '/api/arena')).data, { waiting: 0, playing: 0 });
const st = (await api('GET', '/api/perfil', { profile: tok })).data.stats;
assert.equal(st.matches, 1);
assert.ok(st.achievements.length >= 1);

// ---------- modos solo com semente: Sudoku e Caça-Palavras no ranking global ----------
{
  const su = await api('POST', '/api/solo/inicio', { profile: tok, body: { modo: 'classico-sudoku', variante: 'facil' } });
  assert.equal(su.status, 200);
  assert.equal(typeof su.data.seed, 'number');
  assert.equal(su.data.variante, 'facil');
  const { solution } = setupSudoku(su.data.seed, 'facil');
  const sf = await api('POST', '/api/solo/fim', { profile: tok, body: { ticket: su.data.ticket, log: { solved: true, board: solution, errors: 0, seconds: 30 } } });
  assert.ok(sf.data.score > 1000, 'sudoku resolvido pontua');
  const fake = await api('POST', '/api/solo/inicio', { profile: tok, body: { modo: 'classico-sudoku', variante: 'facil' } });
  const ff = await api('POST', '/api/solo/fim', { profile: tok, body: { ticket: fake.data.ticket, log: { solved: true, board: Array(81).fill(1), errors: 0, seconds: 30 } } });
  assert.equal(ff.data.score, 0, 'sudoku inventado não pontua');
  const rs = await api('GET', '/api/ranking?modo=classico-sudoku&variante=facil&periodo=hoje', { profile: tok });
  assert.equal(rs.data.rows[0].score, sf.data.score);

  const ws = await api('POST', '/api/solo/inicio', { profile: tok, body: { modo: 'classico-cacapalavras', variante: 'mistura' } });
  const setup = setupWordSearch(ws.data.seed, 'mistura');
  const wf = await api('POST', '/api/solo/fim', { profile: tok, body: { ticket: ws.data.ticket, log: { found: [0, 1, 2], extras: [], remaining: 0 } } });
  assert.equal(wf.data.score, [0, 1, 2].reduce((t, k) => t + setup.placed[k].word.length * 10, 0));
  assert.equal((await api('GET', '/api/ranking?modo=classico-cacapalavras&variante=mistura&periodo=hoje', { profile: tok })).data.rows.length, 1);
}

// ---------- partida em grupo pela sala durável (tempo controlado) ----------
const db = postgres(URL_PG, { ...PG_OPTIONS, max: 4 });
let T = Date.now();
const multi = (session, msg, now = T) => db.begin(async (sql) => {
  await sql`SET LOCAL search_path = trama, public`;
  return handleMulti(sql, createPostgresStore(sql, { now: () => now }), { session, msg }, now);
});
const s1 = randomUUID(), s2 = randomUUID();
let out = await multi(s1, { t: 'create', name: 'Ana', avatar: '🦊', profile: tok });
const code = out.find((x) => x.t === 'joined').code;
out = await multi(s2, { t: 'join', code, name: 'Beto', avatar: '🐼' });
const beto = out.find((x) => x.t === 'joined');
assert.equal(out.find((x) => x.t === 'state').state.players.length, 2);
await multi(s1, { t: 'options', options: { rounds: 1, seconds: 60, size: 4 } });
out = await multi(s1, { t: 'start' });
assert.equal(out.find((x) => x.t === 'state').state.phase, 'countdown');
T += 4000;
out = await multi(s2, { t: 'poll' }, T);
const state = out.find((x) => x.t === 'state').state;
assert.equal(state.phase, 'playing');
const words = solve(state.play.grid, 4).sort((a, b) => b.length - a.length);
out = await multi(s1, { t: 'act', a: 'submit', rid: 1, word: words[0] }, T + 1000);
assert.equal(out.find((x) => x.t === 'res').result.ok, true);
out = await multi(s2, { t: 'act', a: 'submit', rid: 1, word: words[0] }, T + 1500);
assert.equal(out.find((x) => x.t === 'res').result.ok, true, 'repetida também vale');
// consulta rápida com versão: sem mudança, resposta vazia; depois de uma jogada, estado novo
{
  const first = await multi(s2, { t: 'poll' }, T + 1600);
  const st = first.find((x) => x.t === 'state');
  assert.ok(st.v > 0, 'estado traz a versão');
  assert.deepEqual(await multi(s2, { t: 'poll', v: st.v }, T + 1700), [], 'nada mudou: resposta vazia');
  await multi(s1, { t: 'act', a: 'submit', rid: 2, word: words[1] }, T + 1750);
  const after = await multi(s2, { t: 'poll', v: st.v }, T + 1800);
  assert.ok(after.find((x) => x.t === 'state')?.v > st.v, 'mudou: manda o estado novo');
}
// reconexão: Beto volta com o token
out = await multi(randomUUID(), { t: 'resume', code, id: beto.id, token: beto.token }, T + 2000);
assert.ok(out.find((x) => x.t === 'joined'));
T += 61000;
const [fin1, fin2] = await Promise.all([multi(s1, { t: 'poll' }, T), multi(s2, { t: 'poll' }, T)]);
assert.equal(fin1.find((x) => x.t === 'state').state.phase, 'final');
assert.equal(fin2.find((x) => x.t === 'state').state.phase, 'final');
const [{ n }] = await admin`SELECT COUNT(*)::int AS n FROM trama.matches WHERE room = ${code}`;
assert.equal(n, 1, 'resultado gravado uma vez só, mesmo com duas consultas simultâneas');

// ---------- várias salas ao mesmo tempo (trava por sala) + Arena ----------
const rooms = await Promise.all(Array.from({ length: 6 }, async (_, i) => {
  const s = randomUUID();
  const o = await multi(s, { t: 'create', name: `P${i}` }, T);
  return { s, code: o.find((x) => x.t === 'joined').code };
}));
assert.equal(new Set(rooms.map((r) => r.code)).size, 6, 'códigos únicos');
const t0 = performance.now();
await Promise.all(rooms.flatMap((r) => Array.from({ length: 5 }, () => multi(r.s, { t: 'poll' }, T))));
console.log(`30 consultas em 6 salas: ${(performance.now() - t0).toFixed(0)} ms`);
const q1 = randomUUID(), q2 = randomUUID();
const agora = Date.now(); // a Arena usa o relógio real (as salas são criadas com ele)
const [a1, a2] = await Promise.all([multi(q1, { t: 'quick', name: 'Ivo' }, agora), multi(q2, { t: 'quick', name: 'Jade' }, agora)]);
assert.equal(a1.find((x) => x.t === 'joined').code, a2.find((x) => x.t === 'joined').code, 'os dois caem na mesma Arena');
assert.deepEqual((await api('GET', '/api/arena')).data, { waiting: 2, playing: 0 });

await handle.close();
await db.end();
await admin.end();
console.log('ok postgres');
