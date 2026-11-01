// Sudoku Duelo: mesmo tabuleiro para todos; a solução fica só no servidor.
import { generateSudoku } from '../../js/core/sudoku.js';
import { sudokuDuelScore } from '../../js/core/multimodes.js';

const game = {
  start(room) {
    const { puzzle, solution } = generateSudoku(room.rng, room.options.difficulty);
    room.rd = { puzzle, solution, startedAt: room.now(), finishers: [] };
    for (const p of room.players.values()) game.initPlayer(p, room);
  },

  initPlayer(p, room) {
    p.rs = { board: room.rd ? room.rd.puzzle.slice() : [], errors: 0, filled: 0, done: false, seconds: null };
  },

  actions: {
    cell(room, p, msg) {
      const rd = room.rd;
      const i = Number(msg.i), v = Number(msg.v);
      if (!Number.isInteger(i) || i < 0 || i > 80 || !Number.isInteger(v) || v < 1 || v > 9) return { ok: false, reason: 'Jogada inválida' };
      if (p.rs.done) return { ok: false, reason: 'Você já terminou!' };
      if (rd.puzzle[i] || p.rs.board[i]) return { ok: false, reason: 'Essa casa já está preenchida' };
      if (rd.solution[i] !== v) {
        p.rs.errors++;
        room.touch();
        return { ok: false, wrong: true, errors: p.rs.errors, reason: 'Número errado! −150' };
      }
      p.rs.board[i] = v;
      p.rs.filled++;
      if (!p.rs.board.includes(0)) {
        p.rs.done = true;
        p.rs.seconds = (room.now() - rd.startedAt) / 1000;
        rd.finishers.push(p.id);
      }
      room.touch();
      if (game.allDone(room)) room.endRound();
      return { ok: true, done: p.rs.done, place: p.rs.done ? rd.finishers.length : undefined };
    },
  },

  publicFor(room, p) {
    const rd = room.rd;
    return { puzzle: rd.puzzle, board: p ? p.rs.board : undefined, errors: p ? p.rs.errors : undefined, done: p ? p.rs.done : undefined };
  },

  progress(p, room) {
    const empty = room.rd.puzzle.filter((x) => !x).length || 1;
    const pct = Math.round(((p.rs?.filled ?? 0) / empty) * 100);
    return { points: pct, label: p.rs?.done ? `✅ ${Math.round(p.rs.seconds)}s` : `${pct}% · ${p.rs?.errors ?? 0} erro(s)` };
  },

  allDone(room) {
    const active = [...room.players.values()].filter((p) => p.connected);
    return active.length > 0 && active.every((p) => p.rs?.done);
  },

  finish(room) {
    const rd = room.rd;
    const scores = {};
    const players = {};
    for (const p of room.players.values()) {
      const place = rd.finishers.indexOf(p.id);
      const rs = p.rs || { done: false, errors: 0, filled: 0 };
      const score = sudokuDuelScore({ difficulty: room.options.difficulty, done: rs.done, seconds: rs.seconds, errors: rs.errors, filled: rs.filled, place });
      scores[p.id] = score;
      players[p.id] = { score, done: rs.done, seconds: rs.seconds, errors: rs.errors, filled: rs.filled, place: place >= 0 ? place + 1 : null };
    }
    return { scores, detail: { type: 'sudoku', difficulty: room.options.difficulty, empty: rd.puzzle.filter((x) => !x).length, players } };
  },
};

export default game;
