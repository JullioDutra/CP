// Jogo de grade de letras (Grade em Grupo / Grade Amigável).
import { makeGrid, findPath, isAdjacent, wordPoints, sortMissed, MIN_LETTERS } from '../../js/core/letters.js';
import { isWord, normalize } from '../../js/core/dict.js';
import { scoreRound } from '../../js/core/multimodes.js';

const game = {
  start(room) {
    const size = room.options.size;
    const { grid, words } = makeGrid(room.rng, size, { minWords: size === 4 ? 40 : 90 });
    room.rd = { grid, size, possible: words };
    for (const p of room.players.values()) p.rs = { words: [], ai: [], pts: 0, pending: new Set() };
  },

  initPlayer(p) {
    p.rs = { words: [], ai: [], pts: 0, pending: new Set() };
  },

  actions: {
    submit(room, p, msg) {
      const rd = room.rd;
      const word = normalize(String(msg.word || '')).slice(0, 25);
      if (word.length < MIN_LETTERS) return { ok: false, reason: `Mínimo ${MIN_LETTERS} letras`, word };
      if (p.rs.words.includes(word) || p.rs.pending.has(word)) return { ok: false, dup: true, reason: 'Você já achou essa', word };
      if (!validPath(rd, word, msg.path)) return { ok: false, reason: 'Essa palavra não está na grade', word };

      if (isWord(word)) return accept(room, p, word, false);
      if (!room.verifier?.enabled) return { ok: false, reason: `${word.toUpperCase()} não está no dicionário`, word };
      // pergunta à IA; a rodada só fecha depois que essa verificação terminar
      p.rs.pending.add(word);
      const round = room.round;
      const work = room.verifier.verify(word).then((v) => {
        p.rs.pending.delete(word);
        if (room.round !== round || room.phase !== 'playing') return { ok: false, reason: 'A rodada acabou', word };
        if (!v.ok) {
          return { ok: false, reason: v.fonte === 'indisponivel' ? `${word.toUpperCase()} não está no dicionário (IA indisponível)` : `${word.toUpperCase()} não existe (verificado pela IA)`, word };
        }
        return accept(room, p, word, true);
      });
      room.trackPending(work);
      return work;
    },
  },

  publicFor(room, p) {
    const rd = room.rd;
    return { grid: rd.grid, size: rd.size, possible: rd.possible.length, myWords: p ? p.rs.words : undefined, myAi: p ? p.rs.ai : undefined };
  },

  progress(p) {
    return { points: p.rs?.pts ?? 0, label: `${p.rs?.words.length ?? 0} pal.` };
  },

  allDone() {
    return false;
  },

  finish(room) {
    const rd = room.rd;
    const byPlayer = {};
    const aiWords = new Set();
    for (const p of room.players.values()) {
      byPlayer[p.id] = p.rs?.words || [];
      for (const w of p.rs?.ai || []) aiWords.add(w);
    }
    const { players, counts } = scoreRound(room.options.mode, byPlayer);
    let longest = null;
    for (const [id, r] of Object.entries(players)) {
      for (const w of r.words) {
        if (aiWords.has(w.w)) w.ai = true;
        if (!longest || w.w.length > longest.w.length) longest = { w: w.w, id };
      }
    }
    const allFound = new Set(Object.keys(counts));
    return {
      scores: Object.fromEntries(Object.entries(players).map(([id, r]) => [id, r.score])),
      detail: {
        type: 'grade',
        grid: rd.grid,
        size: rd.size,
        players,
        longest,
        missed: sortMissed(rd.possible.filter((w) => !allFound.has(w))).slice(0, 30),
        possible: rd.possible.length,
      },
    };
  },
};

function accept(room, p, word, viaAi) {
  if (p.rs.words.includes(word)) return { ok: false, dup: true, reason: 'Você já achou essa', word };
  p.rs.words.push(word);
  if (viaAi) p.rs.ai.push(word);
  const pts = wordPoints(word);
  p.rs.pts += pts;
  room.touch();
  return { ok: true, word, pts, ai: viaAi };
}

function validPath(rd, word, path) {
  const { grid, size } = rd;
  if (Array.isArray(path) && path.length === word.length) {
    const seen = new Set();
    let ok = true;
    for (let k = 0; k < path.length && ok; k++) {
      const i = path[k];
      if (!Number.isInteger(i) || i < 0 || i >= grid.length || seen.has(i) || grid[i] !== word[k]) ok = false;
      else if (k > 0 && !isAdjacent(path[k - 1], i, size)) ok = false;
      seen.add(i);
    }
    if (ok) return true;
  }
  return !!findPath(grid, size, word);
}

export default game;
