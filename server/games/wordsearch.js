// Caça-Palavras Corrida: grade compartilhada; quem marca primeiro leva a palavra.
import { buildWordSearch, matchPlaced, lineBetween, WS_SIZE } from '../../js/core/wordsearch.js';
import { TEMAS } from '../../data/temas.js';

const POINTS_PER_LETTER = 10;

const game = {
  start(room) {
    const rd0 = room.rd;
    // evita repetir o tema da rodada anterior
    const themes = Object.keys(TEMAS).filter((t) => t !== rd0?.theme);
    const theme = room.rng.pick(themes);
    const { grid, placed } = buildWordSearch(room.rng, room.rng.shuffle(TEMAS[theme]));
    room.rd = { grid, size: WS_SIZE, theme, placed, foundBy: {} };
    for (const p of room.players.values()) game.initPlayer(p);
  },

  initPlayer(p) {
    p.rs = { found: [], pts: 0 };
  },

  actions: {
    mark(room, p, msg) {
      const rd = room.rd;
      const cells = Array.isArray(msg.cells) ? msg.cells.slice(0, WS_SIZE) : [];
      if (cells.length < 2 || !cells.every((i) => Number.isInteger(i) && i >= 0 && i < rd.grid.length)) return { ok: false, reason: 'Seleção inválida' };
      const line = lineBetween(cells[0], cells[cells.length - 1], rd.size);
      if (!line || line.join(',') !== cells.join(',')) return { ok: false, reason: 'Marque em linha reta' };
      const k = matchPlaced(rd.placed, cells);
      if (k < 0) return { ok: false, reason: 'Não é uma das palavras' };
      if (rd.foundBy[k]) {
        const by = room.players.get(rd.foundBy[k]);
        return { ok: false, dup: true, reason: by && by.id !== p.id ? `${by.name} achou primeiro!` : 'Você já achou essa' };
      }
      rd.foundBy[k] = p.id;
      const pts = rd.placed[k].word.length * POINTS_PER_LETTER;
      p.rs.found.push(k);
      p.rs.pts += pts;
      room.touch();
      if (game.allDone(room)) room.endRound();
      return { ok: true, word: rd.placed[k].display, pts };
    },
  },

  publicFor(room) {
    const rd = room.rd;
    return {
      grid: rd.grid,
      size: rd.size,
      theme: rd.theme,
      words: rd.placed.map((pl, k) => ({ display: pl.display, by: rd.foundBy[k] || null, cells: rd.foundBy[k] ? pl.cells : null })),
    };
  },

  progress(p) {
    return { points: p.rs?.pts ?? 0, label: `${p.rs?.found.length ?? 0} achadas` };
  },

  allDone(room) {
    return Object.keys(room.rd.foundBy).length === room.rd.placed.length;
  },

  finish(room) {
    const rd = room.rd;
    const scores = {};
    const players = {};
    for (const p of room.players.values()) {
      scores[p.id] = p.rs?.pts ?? 0;
      players[p.id] = { score: scores[p.id], found: (p.rs?.found || []).map((k) => rd.placed[k].display) };
    }
    return {
      scores,
      detail: {
        type: 'wordsearch',
        theme: rd.theme,
        grid: rd.grid,
        size: rd.size,
        words: rd.placed.map((pl, k) => ({ display: pl.display, cells: pl.cells, by: rd.foundBy[k] || null })),
        players,
      },
    };
  },
};

export default game;
