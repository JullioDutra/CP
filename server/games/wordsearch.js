// Caça-Palavras Corrida: grade compartilhada; quem marca primeiro leva a palavra.
import { buildWordSearch, buildMixedSearch, matchPlaced, matchFree, lineBetween, isFreePath, WS_SIZE, MIX_EXTRA_MIN, MIX_EXTRA_PTS } from '../../js/core/wordsearch.js';
import { isCommon } from '../../js/core/dict.js';
import { TEMAS } from '../../data/temas.js';
import { MISTURA } from '../../data/mistura.js';

const POINTS_PER_LETTER = 10;

const game = {
  start(room) {
    const rd0 = room.rd;
    if (room.options.tema === 'mistura') {
      const { grid, placed } = buildMixedSearch(room.rng, room.rng.shuffle(MISTURA));
      room.rd = { grid, size: WS_SIZE, theme: 'Mistura', free: true, placed, foundBy: {} };
    } else {
      // evita repetir o tema da rodada anterior
      const themes = Object.keys(TEMAS).filter((t) => t !== rd0?.theme);
      const theme = room.rng.pick(themes);
      const { grid, placed } = buildWordSearch(room.rng, room.rng.shuffle(TEMAS[theme]));
      room.rd = { grid, size: WS_SIZE, theme, placed, foundBy: {} };
    }
    for (const p of room.players.values()) game.initPlayer(p);
  },

  initPlayer(p) {
    p.rs = { found: [], extras: [], pts: 0 };
  },

  actions: {
    mark(room, p, msg) {
      const rd = room.rd;
      const cells = Array.isArray(msg.cells) ? msg.cells.slice(0, WS_SIZE) : [];
      if (cells.length < 2 || !cells.every((i) => Number.isInteger(i) && i >= 0 && i < rd.grid.length)) return { ok: false, reason: 'Seleção inválida' };
      if (rd.free) {
        if (!isFreePath(cells, rd.size)) return { ok: false, reason: 'Passe por letras vizinhas' };
      } else {
        const line = lineBetween(cells[0], cells[cells.length - 1], rd.size);
        if (!line || line.join(',') !== cells.join(',')) return { ok: false, reason: 'Marque em linha reta' };
      }
      let k = rd.free ? matchFree(rd.placed, rd.grid, cells, (j) => !!rd.foundBy[j]) : matchPlaced(rd.placed, cells);
      if (k < 0 && rd.free) k = matchFree(rd.placed, rd.grid, cells); // já achada por alguém
      if (k < 0) {
        // Mistura: outras palavras do dicionário formadas na grade também valem
        const w = cells.map((i) => rd.grid[i]).join('');
        if (!rd.free || w.length < MIX_EXTRA_MIN || !isCommon(w) || rd.placed.some((pl) => pl.word === w)) return { ok: false, reason: 'Não é uma das palavras' };
        p.rs.extras ||= [];
        if (p.rs.extras.includes(w)) return { ok: false, dup: true, reason: 'Você já achou essa' };
        const pts = w.length * MIX_EXTRA_PTS;
        p.rs.extras.push(w);
        p.rs.pts += pts;
        room.touch();
        return { ok: true, extra: true, word: w, pts };
      }
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
      free: !!rd.free,
      words: rd.placed.map((pl, k) => ({ display: pl.display, by: rd.foundBy[k] || null, cells: rd.foundBy[k] ? pl.cells : null })),
    };
  },

  progress(p) {
    return { points: p.rs?.pts ?? 0, label: `${(p.rs?.found.length ?? 0) + (p.rs?.extras?.length ?? 0)} achadas` };
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
      players[p.id] = { score: scores[p.id], found: (p.rs?.found || []).map((k) => rd.placed[k].display), extras: p.rs?.extras || [] };
    }
    return {
      scores,
      detail: {
        type: 'wordsearch',
        theme: rd.theme,
        free: !!rd.free,
        grid: rd.grid,
        size: rd.size,
        words: rd.placed.map((pl, k) => ({ display: pl.display, cells: pl.cells, by: rd.foundBy[k] || null })),
        players,
      },
    };
  },
};

export default game;
