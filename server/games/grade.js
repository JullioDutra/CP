// Jogo de grade de letras: Grade em Grupo, Grade Bônus, Arena Sobrevivência e Times.
// Palavras repetidas entre jogadores valem pontos normalmente; ser única ou
// repetida só aparece nas estatísticas do fim da rodada (o "tanque").
import { makeGrid, solve, findPath, isAdjacent, wordPoints, sortMissed, longestWord, MIN_LETTERS } from '../../js/core/letters.js';
import { isWord, normalize } from '../../js/core/dict.js';
import { makeRain, rainStep, rainGrid, freshCells, rainMult, RAIN } from '../../js/core/rain.js';
import { scoreRound, bonusCells, bonusMultiplier, SURVIVAL, COMBO, comboMult, HOT, hotLetterAt, hotMult } from '../../js/core/multimodes.js';

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
    if (room.mode.rain) {
      const drops = makeRain(room.rng, grid, size, room.options.seconds * 1000);
      room.rd.rain = { drops, startedAt: room.now(), everyMs: RAIN.everyMs };
      // palavras possíveis em todas as versões da grade (para "ninguém achou" e "maior da grade")
      const all = new Set(words);
      for (let k = 1; k <= drops.length; k++) for (const w of solve(rainGrid(grid, drops, k), size)) all.add(w);
      room.rd.possible = [...all];
      // servidor local: avisa os celulares quando a chuva cai (o durável usa o prazo da sala)
      for (let k = 1; k <= drops.length; k++) room.setTimer(() => room.phase === 'playing' && room.touch(), k * RAIN.everyMs + 50);
    }
    if (room.mode.hot) {
      // letras quentes: as da grade, em ordem sorteada (as mais frequentes aparecem primeiro)
      const counts = {};
      for (const l of grid) counts[l] = (counts[l] || 0) + 1;
      const letters = room.rng.shuffle(Object.keys(counts)).sort((a, b) => counts[b] - counts[a]).slice(0, 8);
      room.rd.hot = { letters: room.rng.shuffle(letters), startedAt: room.now(), everyMs: HOT.everyMs };
    }
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
      // Chuva de Letras: vale a grade de agora (ou a anterior, por até 1,5 s depois da chuva)
      let path = pathFor(rd, word, msg.path, currentGrid(rd, room.now()));
      if (!path && rd.rain) {
        const k = rainStep(room.now() - rd.rain.startedAt);
        if (k > 0 && room.now() - (rd.rain.startedAt + k * RAIN.everyMs) < 1500) path = pathFor(rd, word, msg.path, rainGrid(rd.grid, rd.rain.drops, k - 1));
      }
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
    const out = { grid: currentGrid(rd, room.now()), size: rd.size, bonus: rd.bonus };
    if (rd.rain) {
      // só a grade de agora e quando cai a próxima chuva (as letras futuras não vão para o celular)
      const k = rainStep(room.now() - rd.rain.startedAt);
      out.rain = { step: k, fresh: freshCells(rd.rain.drops, k), nextAt: k < rd.rain.drops.length ? rd.rain.startedAt + (k + 1) * rd.rain.everyMs : null };
    }
    if (rd.hot) out.hot = rd.hot;
    if (p) {
      out.myWords = p.rs.words;
      out.myAi = p.rs.ai;
      if (room.mode.combo) out.combo = { count: p.rs.combo || 0, lastAt: p.rs.lastAt || 0, windowMs: COMBO.windowMs };
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
      // Chuva de Letras: todas as versões da grade (para mostrar onde estava cada palavra)
      grids: rd.rain ? Array.from({ length: rd.rain.drops.length + 1 }, (_, k) => rainGrid(rd.grid, rd.rain.drops, k)) : undefined,
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
  const t = room.now();
  let mult = bonusMultiplier(path, room.rd.bonus);
  let combo = 0, hot = null;
  if (room.mode.combo) {
    combo = p.rs.lastAt && t - p.rs.lastAt <= COMBO.windowMs ? (p.rs.combo || 0) + 1 : 1;
    p.rs.combo = combo;
    p.rs.lastAt = t;
    mult *= comboMult(combo);
  }
  if (room.mode.hot) {
    hot = hotLetterAt(room.rd.hot, t)?.letter || null;
    mult *= hotMult(word, hot);
  }
  if (room.mode.rain) mult *= rainMult(path, freshCells(room.rd.rain.drops, rainStep(t - room.rd.rain.startedAt)));
  const pts = Math.round(wordPoints(word) * mult);
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
  return { ok: true, word, pts, mult, ai: viaAi, gain: gain / 1000, combo: room.mode.combo ? combo : undefined, hot: hot || undefined };
}

// Caminho válido para a palavra: usa o que o jogador desenhou ou procura um na grade.
function pathFor(rd, word, path, grid = rd.grid) {
  const { size } = rd;
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

// Grade valendo agora (muda na Chuva de Letras).
function currentGrid(rd, now) {
  return rd.rain ? rainGrid(rd.grid, rd.rain.drops, rainStep(now - rd.rain.startedAt)) : rd.grid;
}
