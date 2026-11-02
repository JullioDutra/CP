// Jogo de grade de letras: Grade em Grupo, Grade Bônus, Arena Sobrevivência e Times.
// Palavras repetidas entre jogadores valem pontos normalmente; ser única ou
// repetida só aparece nas estatísticas do fim da rodada (o "tanque").
import { makeGrid, findPath, isAdjacent, wordPoints, sortMissed, longestWord, MIN_LETTERS } from '../../js/core/letters.js';
import { isWord, normalize } from '../../js/core/dict.js';
import { scoreRound, bonusCells, bonusMultiplier, SURVIVAL } from '../../js/core/multimodes.js';

const MIN_WORDS = { 4: 40, 5: 90, 6: 150 };

const newPlayerState = (room) => ({
  words: [], ai: [], wordPts: {}, pts: 0, pending: new Set(),
  // Arena Sobrevivência: cada um tem a própria "vida" (relógio)
  lifeEndsAt: room.mode.survival ? room.now() + SURVIVAL.startMs : null,
  alive: true,
});

const teamOf = (room, p) => room.teams[p.id] || null;
const teammates = (room, p) => [...room.players.values()].filter((q) => q.rs && teamOf(room, q) && teamOf(room, q) === teamOf(room, p));

const game = {
  start(room) {
    const size = room.options.size;
    const { grid, words } = makeGrid(room.rng, size, { minWords: MIN_WORDS[size] || 40, tries: size === 6 ? 25 : 60 });
    const bonus = room.mode.bonus ? bonusCells(room.rng, size) : {};
    room.rd = { grid, size, possible: words, bonus, eliminated: [] };
    for (const p of room.players.values()) p.rs = newPlayerState(room);
  },

  initPlayer(p, room) {
    p.rs = newPlayerState(room);
    // quem entra no meio da Sobrevivência não ganha vida cheia
    if (room.mode.survival && room.rd) p.rs.lifeEndsAt = room.now() + SURVIVAL.startMs / 2;
  },

  actions: {
    submit(room, p, msg) {
      const rd = room.rd;
      if (!p.rs.alive) return { ok: false, reason: 'Você foi eliminado — acompanhe a rodada!' };
      const word = normalize(String(msg.word || '')).slice(0, 25);
      if (word.length < MIN_LETTERS) return { ok: false, reason: `Mínimo ${MIN_LETTERS} letras`, word };
      if (p.rs.words.includes(word) || p.rs.pending.has(word)) return { ok: false, dup: true, reason: 'Você já achou essa', word };
      if (room.mode.teams && teammates(room, p).some((q) => q.rs.words.includes(word))) return { ok: false, dup: true, reason: 'Seu time já achou essa', word };
      const path = pathFor(rd, word, msg.path);
      if (!path) return { ok: false, reason: 'Essa palavra não está na grade', word };

      if (isWord(word)) return accept(room, p, word, path, false);
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
        return accept(room, p, word, path, true);
      });
      room.trackPending(work);
      return work;
    },
  },

  // Arena Sobrevivência: elimina quem ficou sem tempo; acaba quando sobra 1.
  tick(room) {
    if (!room.mode.survival) return;
    const t = room.now();
    let changed = false;
    for (const p of room.players.values()) {
      if (p.rs?.alive && p.rs.lifeEndsAt <= t) {
        p.rs.alive = false;
        room.rd.eliminated.push(p.id);
        changed = true;
      }
    }
    const inGame = [...room.players.values()].filter((p) => p.rs);
    const alive = inGame.filter((p) => p.rs.alive).length;
    if (changed) room.touch();
    if (alive === 0 || (inGame.length > 1 && alive <= 1)) room.endRound();
  },

  publicFor(room, p) {
    const rd = room.rd;
    const out = { grid: rd.grid, size: rd.size, bonus: rd.bonus, possible: rd.possible.length };
    if (p) {
      out.myWords = p.rs.words;
      out.myAi = p.rs.ai;
      if (room.mode.survival) { out.lifeEndsAt = p.rs.lifeEndsAt; out.alive = p.rs.alive; }
      if (room.mode.teams) out.teamWords = teammates(room, p).flatMap((q) => q.rs.words);
    }
    return out;
  },

  progress(p, room) {
    const words = p.rs?.words.length ?? 0;
    if (room.mode.survival) {
      if (!p.rs?.alive) return { points: -1, label: `💀 fora · ${words} pal.` };
      const left = Math.max(0, Math.ceil((p.rs.lifeEndsAt - room.now()) / 1000));
      return { points: left, label: `❤️ ${left}s · ${words} pal.` };
    }
    return { points: p.rs?.pts ?? 0, label: `${p.rs?.pts ?? 0} pts · ${words} pal.` };
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
    const { players, counts, totals } = scoreRound(byPlayer, (id, w) => room.players.get(id)?.rs?.wordPts[w] ?? wordPoints(w));
    let longest = null;
    for (const [id, r] of Object.entries(players)) {
      for (const w of r.words) {
        if (aiWords.has(w.w)) w.ai = true;
        if (!longest || w.w.length > longest.w.length) longest = { w: w.w, id };
      }
    }
    const scores = Object.fromEntries(Object.entries(players).map(([id, r]) => [id, r.score]));

    // Sobrevivência: colocação = quem durou mais; bônus para o pódio
    const extras = [];
    let placement = null;
    if (room.mode.survival) {
      const inGame = [...room.players.values()].filter((p) => p.rs);
      const alive = inGame.filter((p) => p.rs.alive).sort((a, b) => b.rs.lifeEndsAt - a.rs.lifeEndsAt).map((p) => p.id);
      placement = [...alive, ...rd.eliminated.slice().reverse()].filter((id) => scores[id] !== undefined);
      placement.forEach((id, i) => {
        const b = SURVIVAL.bonus[i];
        if (!b) return;
        scores[id] += b;
        players[id].score += b;
        extras.push({ id, label: `${['🥇', '🥈', '🥉'][i]} Sobreviveu`, pts: b });
      });
    }

    const allFound = new Set(Object.keys(counts));
    const detail = {
      type: 'grade',
      grid: rd.grid,
      size: rd.size,
      bonus: rd.bonus,
      players,
      totals,
      longest,
      longestPossible: longestWord(rd.possible),
      extras,
      placement,
      missed: sortMissed(rd.possible.filter((w) => !allFound.has(w))).slice(0, 30),
      possible: rd.possible.length,
    };
    if (room.mode.teams) {
      const teamScores = { A: 0, B: 0 };
      for (const [id, sc] of Object.entries(scores)) if (room.teams[id]) teamScores[room.teams[id]] += sc;
      detail.teamOf = { ...room.teams };
      detail.teamScores = teamScores;
    }
    return { scores, detail };
  },
};

function accept(room, p, word, path, viaAi) {
  if (p.rs.words.includes(word)) return { ok: false, dup: true, reason: 'Você já achou essa', word };
  if (room.mode.teams && teammates(room, p).some((q) => q !== p && q.rs.words.includes(word))) return { ok: false, dup: true, reason: 'Seu time já achou essa', word };
  const mult = bonusMultiplier(path, room.rd.bonus);
  const pts = wordPoints(word) * mult;
  p.rs.words.push(word);
  p.rs.wordPts[word] = pts;
  if (viaAi) p.rs.ai.push(word);
  p.rs.pts += pts;
  let gain = 0;
  if (room.mode.survival && p.rs.alive) {
    // ganha tempo e rouba 1 s de cada adversário vivo
    const t = room.now();
    gain = word.length * SURVIVAL.gainPerLetterMs;
    p.rs.lifeEndsAt = Math.min(t + SURVIVAL.maxMs, p.rs.lifeEndsAt + gain);
    for (const q of room.players.values()) if (q !== p && q.rs?.alive) q.rs.lifeEndsAt -= SURVIVAL.stealMs;
  }
  room.touch();
  return { ok: true, word, pts, mult, ai: viaAi, gain: gain / 1000 };
}

// Caminho válido para a palavra: usa o que o jogador desenhou ou procura um na grade.
function pathFor(rd, word, path) {
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
    if (ok) return path;
  }
  return findPath(grid, size, word);
}

export default game;
