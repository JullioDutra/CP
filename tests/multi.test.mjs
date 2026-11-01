import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { setDictWords } from '../js/core/dict.js';
import { wordPoints, solve } from '../js/core/letters.js';
import { scoreRound, sanitizeOptions } from '../js/core/multimodes.js';
import { Room, cleanName } from '../server/room.js';
setDictWords(readFileSync(new URL('../data/palavras.txt', import.meta.url), 'utf8').split('\n'));

// Pontuação: cresce com o tamanho, mínimo 3 letras
assert.deepEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(wordPoints), [0, 1, 2, 4, 7, 11, 16, 22, 29, 36]);

// Regras de rodada
const byPlayer = { a: ['casa', 'gato', 'sapato'], b: ['casa', 'rato'], c: [] };
const cl = scoreRound('grupo-classico', byPlayer);
assert.equal(cl.players.a.score, 2 + 7); // casa anulada
assert.equal(cl.players.b.score, 2);
assert.equal(cl.players.a.words.find((w) => w.w === 'casa').status, 'cancelled');
const am = scoreRound('grupo-amigavel', byPlayer);
assert.equal(am.players.a.score, 2 + 3 + Math.ceil(7 * 1.5)); // casa 2 (shared), gato 3, sapato 11
assert.equal(am.players.c.score, 0);
assert.deepEqual(sanitizeOptions({ mode: 'x', rounds: 99, seconds: 90, size: 5 }), { mode: 'grupo-classico', rounds: 3, seconds: 90, size: 5 });
assert.equal(cleanName('  <b>Ana</b>  '), 'bAna/b');
assert.equal(cleanName(''), 'Jogador');

// Sala com relógio falso
let t = 1000;
const timers = [];
const room = new Room('ABCD', { now: () => t, setTimer: (fn, ms) => { const o = { fn, at: t + ms }; timers.push(o); return o; }, clearTimer: (o) => { const i = timers.indexOf(o); if (i >= 0) timers.splice(i, 1); }, seed: 5 });
const advance = (ms) => {
  const target = t + ms;
  for (;;) {
    const o = timers.filter((x) => x.at <= target).sort((a, b) => a.at - b.at)[0];
    if (!o) break;
    t = o.at;
    timers.splice(timers.indexOf(o), 1);
    o.fn();
  }
  t = target;
};
const ana = room.addPlayer({ name: 'Ana', avatar: '🦊' });
const bia = room.addPlayer({ name: 'ana', avatar: '🐼' });
assert.equal(bia.name, 'ana 2');
assert.equal(room.hostId, ana.id);
assert.throws(() => room.start(bia.id), /anfitrião/);
room.setOptions(ana.id, { rounds: 2, seconds: 60, mode: 'grupo-classico' });
room.start(ana.id);
assert.equal(room.phase, 'countdown');
assert.equal(room.submit(ana.id, 'casa').ok, false);
advance(3500);
assert.equal(room.phase, 'playing');
assert.equal(room.stateFor(bia.id).grid.length, 16);
const words = solve(room.grid, 4).sort((a, b) => b.length - a.length);
const [w1, w2] = words;
assert.ok(room.submit(ana.id, w1).ok);
assert.ok(room.submit(ana.id, w2).ok);
assert.equal(room.submit(ana.id, w1).dup, true);
assert.ok(room.submit(bia.id, w2).ok);
assert.equal(room.submit(bia.id, 'ab').ok, false);
assert.match(room.submit(bia.id, 'zzzzz').reason, /grade/);
// estado não vaza as palavras dos outros
const s = room.stateFor(bia.id);
assert.deepEqual(s.myWords, [w2]);
assert.equal(s.players.find((p) => p.id === ana.id).roundWords, 2);
assert.equal(JSON.stringify(s).includes(`"${w1}"`), false);
// fim da rodada
advance(60000);
assert.equal(room.phase, 'playing'); // tolerância de rede
assert.ok(room.submit(bia.id, words[2]).ok); // dentro da tolerância
advance(400);
assert.equal(room.phase, 'reveal');
assert.equal(room.players.get(ana.id).total, wordPoints(w1)); // w2 anulada
assert.equal(room.players.get(bia.id).total, wordPoints(words[2]));
assert.equal(room.submit(ana.id, words[3]).ok, false);
// reconexão e troca de anfitrião
room.disconnect(ana.id);
assert.equal(room.hostId, bia.id);
assert.equal(room.resume(ana.id, 'errado'), null);
assert.ok(room.resume(ana.id, ana.token));
room.next(bia.id);
advance(3500 + 60400);
assert.equal(room.phase, 'final');
assert.equal(room.stateFor(ana.id).history.length, 2);
room.rematch(bia.id);
assert.equal(room.phase, 'lobby');
assert.equal(room.players.get(ana.id).total, 0);
console.log('ok multi');
