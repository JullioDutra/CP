import assert from 'node:assert/strict';
import { loadTestDict, fakeClock, fakeLlmFetch } from './helpers.mjs';
import { wordPoints, solve } from '../js/core/letters.js';
import { isWord, isCommon } from '../js/core/dict.js';
import { hotLetterAt } from '../js/core/multimodes.js';
import { scoreRound, sanitizeOptions, defaultOptions, sudokuDuelScore, bonusCells, bonusMultiplier } from '../js/core/multimodes.js';
import { createRng } from '../js/core/rng.js';
import { Room, cleanName } from '../server/room.js';
import { createVerifier } from '../server/ai.js';
loadTestDict();

// ---------- regras ----------
assert.deepEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(wordPoints), [0, 1, 2, 4, 7, 11, 16, 22, 29, 36]);
const byPlayer = { a: ['casa', 'gato', 'sapato'], b: ['casa', 'rato'], c: [] };
const sr = scoreRound(byPlayer);
assert.equal(sr.players.a.score, 2 + 2 + 7, 'repetida vale pontos normalmente');
assert.equal(sr.players.b.score, 2 + 2);
assert.equal(sr.players.a.words.find((w) => w.w === 'casa').status, 'shared');
assert.equal(sr.players.a.words.find((w) => w.w === 'casa').by, 2);
assert.equal(sr.players.a.unique, 2);
assert.equal(sr.players.a.shared, 1);
assert.deepEqual(sr.totals, { distinct: 4, unique: 3, shared: 1 });
assert.equal(scoreRound({ a: ['casa'] }, () => 10).players.a.score, 10);
// bônus
assert.equal(bonusMultiplier([0, 1, 2], { 1: '×2', 2: '×3' }), 6);
assert.equal(Object.keys(bonusCells(createRng(1), 6)).length, 4);
// opções por modo
assert.deepEqual(sanitizeOptions({ mode: 'x', rounds: 99, seconds: 90, size: 6 }), { mode: 'grupo-classico', rounds: 3, seconds: 90, size: 6 });
assert.equal(sanitizeOptions({ size: 7 }).size, 4);
assert.deepEqual(sanitizeOptions({ mode: 'sudoku-duelo' }, defaultOptions()), { mode: 'sudoku-duelo', rounds: 1, difficulty: 'medio', seconds: 600 });
assert.equal(sanitizeOptions({ difficulty: 'dificil', seconds: 60 }, defaultOptions('sudoku-duelo')).difficulty, 'dificil');
assert.equal(sanitizeOptions({ seconds: 60 }, defaultOptions('sudoku-duelo')).seconds, 600);
assert.equal(sudokuDuelScore({ difficulty: 'medio', done: true, seconds: 100, errors: 1, place: 0 }), 3000 - 200 - 150 + 500);
assert.equal(sudokuDuelScore({ difficulty: 'medio', done: false, filled: 20, errors: 1 }), 50);
assert.equal(cleanName('  <b>Ana</b>  '), 'bAna/b');

const mkRoom = (clock, extra = {}) => new Room('ABCD', { now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, seed: 5, ...extra });

// ---------- Grade em Grupo ----------
{
  const clock = fakeClock();
  const room = mkRoom(clock);
  const ana = room.addPlayer({ name: 'Ana', avatar: '🦊' });
  const bia = room.addPlayer({ name: 'ana', avatar: '🐼' });
  assert.equal(bia.name, 'ana 2');
  assert.throws(() => room.start(bia.id), /anfitrião/);
  room.setOptions(ana.id, { rounds: 2, seconds: 60 });
  room.start(ana.id);
  assert.equal(room.act(ana.id, { a: 'submit', word: 'casa' }).ok, false);
  clock.advance(3500);
  assert.equal(room.phase, 'playing');
  const words = solve(room.rd.grid, 4).sort((a, b) => b.length - a.length);
  const [w1, w2] = words;
  assert.ok(room.act(ana.id, { a: 'submit', word: w1 }).ok);
  assert.ok(room.act(ana.id, { a: 'submit', word: w2 }).ok);
  assert.equal(room.act(ana.id, { a: 'submit', word: w1 }).dup, true);
  assert.ok(room.act(bia.id, { a: 'submit', word: w2 }).ok);
  assert.equal(room.act(bia.id, { a: 'submit', word: 'ab' }).ok, false);
  assert.match(room.act(bia.id, { a: 'submit', word: 'zzzzz' }).reason, /grade/);
  assert.equal(room.act(bia.id, { a: 'xpto' }).ok, false);
  const s = room.stateFor(bia.id);
  assert.deepEqual(s.play.myWords, [w2]);
  assert.match(s.players.find((p) => p.id === ana.id).roundLabel, /· 2 pal./);
  assert.equal(JSON.stringify(s).includes(`"${w1}"`), false, 'não vaza palavras dos outros');
  clock.advance(60000);
  assert.ok(room.act(bia.id, { a: 'submit', word: words[2] }).ok, 'tolerância de rede');
  clock.advance(400);
  assert.equal(room.phase, 'reveal');
  assert.equal(room.players.get(ana.id).total, wordPoints(w1) + wordPoints(w2), 'repetida também vale');
  assert.equal(room.players.get(bia.id).total, wordPoints(w2) + wordPoints(words[2]));
  assert.equal(room.rounds[0].players[ana.id].shared, 1);
  assert.equal(room.rounds[0].totals.shared, 1);
  assert.equal(room.stateFor(ana.id).lastRound.type, 'grade');
  room.disconnect(ana.id);
  assert.equal(room.hostId, bia.id);
  assert.equal(room.resume(ana.id, 'errado'), null);
  assert.ok(room.resume(ana.id, ana.token));
  room.next(bia.id);
  clock.advance(3500 + 60400);
  assert.equal(room.phase, 'final');
  assert.equal(room.stateFor(ana.id).history.length, 2);
  room.rematch(bia.id);
  assert.equal(room.phase, 'lobby');
}

// ---------- Grade com IA: palavra fora do dicionário ----------
{
  const clock = fakeClock();
  const verifier = createVerifier({ env: { LLM_BASE_URL: 'http://x/v1' }, log: { info() {}, warn() {} }, fetchImpl: null });
  const room = mkRoom(clock, { verifier });
  const ana = room.addPlayer({ name: 'Ana' });
  room.setOptions(ana.id, { rounds: 1, seconds: 60 });
  room.start(ana.id);
  clock.advance(3500);
  // escolhe uma sequência da grade que não está no dicionário e "ensina" a IA a aprová-la
  let fake = null;
  const g = room.rd.grid;
  for (let i = 0; i < 16 && !fake; i++) for (let j = 0; j < 16 && !fake; j++) for (let k = 0; k < 16 && !fake; k++) {
    const path = [i, j, k];
    const ok = new Set(path).size === 3 && Math.abs(Math.floor(i / 4) - Math.floor(j / 4)) <= 1 && Math.abs((i % 4) - (j % 4)) <= 1 && Math.abs(Math.floor(j / 4) - Math.floor(k / 4)) <= 1 && Math.abs((j % 4) - (k % 4)) <= 1;
    const w = path.map((x) => g[x]).join('');
    if (ok && !isWord(w)) fake = { w, path };
  }
  let resolveLlm;
  const gate = new Promise((r) => (resolveLlm = r));
  const realFetch = fakeLlmFetch({ [fake.w]: `{"existe": true, "forma": "${fake.w}", "confianca": 0.9}` });
  const v2 = createVerifier({ env: { LLM_BASE_URL: 'http://x/v1' }, log: { info() {}, warn() {} }, fetchImpl: async (...a) => { await gate; return realFetch(...a); } });
  room.verifier = v2;
  const pending = room.act(ana.id, { a: 'submit', word: fake.w, path: fake.path });
  assert.ok(pending instanceof Promise);
  assert.equal(room.act(ana.id, { a: 'submit', word: fake.w }).dup, true, 'mesma palavra em verificação');
  clock.advance(60400); // tempo acaba enquanto a IA pensa
  assert.equal(room.phase, 'playing', 'rodada espera a IA');
  resolveLlm();
  const r = await pending;
  assert.equal(r.ok, true);
  assert.equal(r.ai, true);
  await new Promise((res) => setTimeout(res, 10));
  assert.equal(room.phase, 'final');
  const mine = room.rounds[0].players[ana.id].words.find((w) => w.w === fake.w);
  assert.equal(mine.ai, true);
  assert.equal(room.players.get(ana.id).total, wordPoints(fake.w));
}

// ---------- Grade Bônus 6×6 ----------
{
  const clock = fakeClock();
  const room = mkRoom(clock);
  const ana = room.addPlayer({ name: 'Ana' });
  room.setOptions(ana.id, { mode: 'grupo-bonus', size: 6, rounds: 1 });
  room.start(ana.id);
  clock.advance(3500);
  assert.equal(room.rd.grid.length, 36);
  assert.equal(Object.keys(room.rd.bonus).length, 4);
  assert.deepEqual(room.stateFor(ana.id).play.bonus, room.rd.bonus);
  // acha uma palavra que passa por uma casa bônus, se houver
  const words = solve(room.rd.grid, 6);
  const { findPath } = await import('../js/core/letters.js');
  let pick = null;
  for (const w of words) { const p = findPath(room.rd.grid, 6, w); if (p.some((i) => room.rd.bonus[i])) { pick = { w, p }; break; } }
  if (pick) {
    const r = room.act(ana.id, { a: 'submit', word: pick.w, path: pick.p });
    assert.ok(r.ok);
    assert.ok(r.mult > 1);
    assert.equal(r.pts, wordPoints(pick.w) * r.mult);
    clock.advance(120 * 1000 + 400);
    assert.equal(room.players.get(ana.id).total, r.pts, 'bônus conta no total');
  }
}

// ---------- Caça-Palavras Corrida ----------
{
  const clock = fakeClock();
  const room = mkRoom(clock);
  const ana = room.addPlayer({ name: 'Ana' });
  const beto = room.addPlayer({ name: 'Beto' });
  const tv = room.addSpectator();
  room.setOptions(ana.id, { mode: 'corrida-cacapalavras', rounds: 1 });
  assert.equal(room.options.seconds, 180);
  room.start(ana.id);
  clock.advance(3500);
  const placed = room.rd.placed;
  const sTv = room.stateFor(tv);
  assert.equal(sTv.spectator, true);
  assert.equal(sTv.play.words.length, placed.length);
  assert.equal(JSON.stringify(sTv.play.words).includes('"cells":['), false, 'não revela células antes');
  assert.equal(room.act(ana.id, { a: 'mark', cells: [0, 13] }).ok, false);
  const r = room.act(ana.id, { a: 'mark', cells: placed[0].cells.slice().reverse() });
  assert.ok(r.ok);
  assert.equal(r.pts, placed[0].word.length * 10);
  const dup = room.act(beto.id, { a: 'mark', cells: placed[0].cells });
  assert.match(dup.reason, /Ana achou primeiro/);
  assert.deepEqual(room.stateFor(beto.id).play.words[0].cells, placed[0].cells);
  for (let k = 1; k < placed.length; k++) { clock.advance(150); assert.ok(room.act(beto.id, { a: 'mark', cells: placed[k].cells }).ok); }
  assert.equal(room.phase, 'final', 'termina quando todas são achadas');
  assert.equal(room.rounds[0].type, 'wordsearch');
  assert.ok(room.players.get(beto.id).total > room.players.get(ana.id).total);
}

// ---------- Caça-Palavras Corrida · Mistura (sem tema, caminho livre, extras) ----------
{
  const clock = fakeClock();
  const room = mkRoom(clock);
  const ana = room.addPlayer({ name: 'Ana' });
  const beto = room.addPlayer({ name: 'Beto' });
  room.setOptions(ana.id, { mode: 'corrida-cacapalavras', rounds: 1, tema: 'mistura' });
  assert.equal(room.options.tema, 'mistura');
  room.start(ana.id);
  clock.advance(3500);
  const { placed, grid } = room.rd;
  assert.equal(room.stateFor(ana.id).play.free, true);
  assert.ok(placed.length >= 15, 'muitas palavras');
  const cnt = {};
  placed.forEach((p) => p.cells.forEach((c) => (cnt[c] = (cnt[c] || 0) + 1)));
  assert.ok(Object.values(cnt).some((n) => n > 1), 'palavras se cruzam');
  assert.equal(room.act(ana.id, { a: 'mark', cells: [0, 2] }).ok, false, 'precisa ser vizinha');
  const r = room.act(ana.id, { a: 'mark', cells: placed[0].cells });
  assert.ok(r.ok && !r.extra);
  // procura uma palavra extra (fora da lista) formada por um caminho livre
  const N = 12;
  const listed = new Set(placed.map((p) => p.word));
  let extra = null;
  const dfs = (path) => {
    if (extra) return;
    const w = path.map((i) => grid[i]).join('');
    if (w.length >= 5 && isCommon(w) && !listed.has(w)) { extra = path.slice(); return; }
    if (w.length >= 5) return;
    const i = path[path.length - 1];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = Math.floor(i / N) + dr, cc = (i % N) + dc;
      const j = rr * N + cc;
      if ((dr || dc) && rr >= 0 && cc >= 0 && rr < N && cc < N && !path.includes(j)) dfs([...path, j]);
    }
  };
  for (let i = 0; i < N * N && !extra; i++) dfs([i]);
  assert.ok(extra, 'achou uma extra para testar');
  {
    const e = room.act(beto.id, { a: 'mark', cells: extra });
    assert.ok(e.ok && e.extra, 'extra vale');
    assert.equal(e.pts, extra.length * 4);
    assert.equal(room.act(beto.id, { a: 'mark', cells: extra }).dup, true);
    assert.ok(room.act(ana.id, { a: 'mark', cells: extra }).ok, 'cada um pode achar a mesma extra');
  }
  clock.advance(180 * 1000 + 400);
  assert.equal(room.phase, 'final');
  assert.equal(room.rounds[0].players[beto.id].extras.length, 1);
}

// ---------- Coroa de vitórias seguidas + Jogar novamente ----------
{
  const clock = fakeClock();
  const room = mkRoom(clock);
  const ana = room.addPlayer({ name: 'Ana' });
  const beto = room.addPlayer({ name: 'Beto' });
  room.setOptions(ana.id, { mode: 'grupo-classico', rounds: 1, seconds: 60 });
  const words = () => solve(room.rd.grid, room.rd.size).sort((a, b) => b.length - a.length);
  // partida em que `winner` faz mais pontos (ou empate, se tie)
  const playMatch = (winner, tie = false) => {
    clock.advance(3500);
    const ws = words();
    room.act(winner.id, { a: 'submit', word: ws[0] });
    const other = winner.id === ana.id ? beto : ana;
    if (tie) room.act(other.id, { a: 'submit', word: ws[0] });
    else room.act(other.id, { a: 'submit', word: ws[ws.length - 1] });
    clock.advance(60 * 1000 + 400);
    assert.equal(room.phase, 'final');
  };
  room.start(ana.id);
  playMatch(ana);
  assert.deepEqual(room.crown, { id: ana.id, streak: 1 });
  assert.equal(room.crownEvent.type, 'first');
  assert.equal(room.stateFor(beto.id).players.find((p) => p.id === ana.id).crown, 1);
  assert.throws(() => room.rematch(beto.id, true), /anfitrião/);
  room.rematch(ana.id, true); // Jogar novamente: mesmas opções, já começa
  assert.equal(room.phase, 'countdown');
  assert.equal(room.options.seconds, 60);
  playMatch(ana);
  assert.deepEqual(room.crown, { id: ana.id, streak: 2 }, 'sequência continua');
  assert.equal(room.crownEvent.type, 'streak');
  room.rematch(ana.id, true);
  playMatch(ana, true);
  assert.deepEqual(room.crown, { id: ana.id, streak: 2 }, 'empate: dona da coroa segura');
  assert.equal(room.crownEvent.type, 'kept');
  room.rematch(ana.id); // Trocar modo: volta ao saguão, coroa continua
  assert.equal(room.phase, 'lobby');
  assert.equal(room.crown.id, ana.id);
  room.start(ana.id);
  playMatch(beto);
  assert.deepEqual(room.crown, { id: beto.id, streak: 1 }, 'outra pessoa vence: a coroa passa');
  assert.equal(room.crownEvent.type, 'stolen');
  assert.equal(room.crownEvent.from, ana.id);
  assert.equal(room.crownEvent.fromStreak, 2);
  room.leave(beto.id);
  assert.equal(room.crown, null, 'quem sai da sala perde a coroa');
}

// ---------- Grade Combo e Letra da Vez ----------
{
  const clock = fakeClock();
  const room = mkRoom(clock);
  const ana = room.addPlayer({ name: 'Ana' });
  room.addPlayer({ name: 'Beto' });
  room.setOptions(ana.id, { mode: 'grupo-combo', rounds: 1, seconds: 90, size: 5 });
  room.start(ana.id);
  clock.advance(3500);
  const ws = solve(room.rd.grid, 5).sort((a, b) => a.length - b.length);
  const results = [];
  for (let k = 0; k < 5; k++) { clock.advance(2000); results.push(room.act(ana.id, { a: 'submit', word: ws[k] })); }
  assert.deepEqual(results.map((r) => r.combo), [1, 2, 3, 4, 5]);
  assert.equal(results[2].pts, Math.round(wordPoints(ws[2]) * 1.5), '3ª palavra seguida ×1,5');
  assert.equal(results[4].pts, Math.round(wordPoints(ws[4]) * 2), '5ª ×2');
  clock.advance(8000);
  const slow = room.act(ana.id, { a: 'submit', word: ws[5] });
  assert.equal(slow.combo, 1, 'demorou: combo recomeça');
  assert.equal(room.stateFor(ana.id).play.combo.count, 1);
}
{
  const clock = fakeClock();
  const room = mkRoom(clock);
  const ana = room.addPlayer({ name: 'Ana' });
  room.addPlayer({ name: 'Beto' });
  room.setOptions(ana.id, { mode: 'grupo-letra', rounds: 1, seconds: 120, size: 5 });
  room.start(ana.id);
  clock.advance(3500);
  const hot = room.stateFor(ana.id).play.hot;
  assert.ok(hot.letters.length >= 3 && hot.everyMs === 20000);
  const cur = hotLetterAt(hot, clock.now()).letter;
  const ws = solve(room.rd.grid, 5);
  const withIt = ws.find((w) => w.split(cur).length === 2);
  const without = ws.find((w) => !w.includes(cur));
  if (withIt) assert.equal(room.act(ana.id, { a: 'submit', word: withIt }).pts, wordPoints(withIt) * 2, 'letra quente ×2');
  if (without) assert.equal(room.act(ana.id, { a: 'submit', word: without }).pts, wordPoints(without), 'sem a letra: normal');
  clock.advance(20000);
  assert.notEqual(hotLetterAt(hot, clock.now()).letter === cur && hot.letters[1] !== cur, true, 'a letra troca a cada 20 s');
}

// ---------- Sudoku Duelo ----------
{
  const clock = fakeClock();
  const room = mkRoom(clock);
  const ana = room.addPlayer({ name: 'Ana' });
  const beto = room.addPlayer({ name: 'Beto' });
  room.setOptions(ana.id, { mode: 'sudoku-duelo', difficulty: 'facil' });
  room.start(ana.id);
  clock.advance(3500);
  const { puzzle, solution } = room.rd;
  const sAna = room.stateFor(ana.id);
  assert.equal(JSON.stringify(sAna).includes(solution.join(',')), false, 'solução não vaza');
  const empty = puzzle.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  const wrongV = (solution[empty[0]] % 9) + 1;
  assert.equal(room.act(beto.id, { a: 'cell', i: empty[0], v: wrongV }).wrong, true);
  assert.equal(room.act(beto.id, { a: 'cell', i: 0, v: 99 }).ok, false);
  clock.advance(1000);
  for (const i of empty) { clock.advance(150); room.act(ana.id, { a: 'cell', i, v: solution[i] }); }
  assert.equal(room.players.get(ana.id).rs.done, true);
  assert.equal(room.phase, 'playing');
  assert.match(room.stateFor(beto.id).players[0].roundLabel, /✅/);
  for (const i of empty.slice(0, 10)) { clock.advance(150); room.act(beto.id, { a: 'cell', i, v: solution[i] }); }
  room.disconnect(beto.id); // Beto saiu: só falta quem está conectado → todos terminaram
  room.act(ana.id, { a: 'cell', i: empty[0], v: solution[empty[0]] });
  clock.advance(600 * 1000 + 400);
  assert.equal(room.phase, 'final');
  const det = room.rounds[0].players;
  assert.equal(det[ana.id].place, 1);
  assert.equal(det[beto.id].done, false);
  assert.equal(det[beto.id].filled, 10);
  assert.equal(det[beto.id].score, Math.max(0, 10 * 10 - 150));
  assert.equal(det[ana.id].score, 1500 - Math.round(room.rounds[0].players[ana.id].seconds) * 2 + 500);
}
console.log('ok multi');
