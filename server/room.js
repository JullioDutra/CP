// Motor de uma sala multijogador. Não sabe nada de rede: recebe ações e
// chama `onChange` quando o estado muda. O servidor é a autoridade:
// sorteia a grade, controla o relógio e valida cada palavra.
import { randomBytes } from 'node:crypto';
import { createRng } from '../js/core/rng.js';
import { makeGrid, findPath, isAdjacent, wordPoints, MIN_LETTERS } from '../js/core/letters.js';
import { isWord, normalize } from '../js/core/dict.js';
import { MULTI_MODES, AVATARS, DEFAULT_OPTIONS, sanitizeOptions, scoreRound } from '../js/core/multimodes.js';

export const MAX_PLAYERS = 12;
const COUNTDOWN_MS = 3500;
const GRACE_MS = 400; // tolerância de rede no fim da rodada
const RATE_LIMIT = 10; // envios por segundo
const BAD_NAMES = ['porra', 'caralho', 'puta', 'merda', 'buceta', 'viado', 'cuzao', 'foder', 'fdp', 'pqp', 'arrombado'];

export function cleanName(raw) {
  let name = String(raw || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
  const n = normalize(name);
  if (BAD_NAMES.some((b) => n.includes(b))) name = 'Jogador';
  return name || 'Jogador';
}

export class Room {
  constructor(code, { now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, onChange = () => {}, seed } = {}) {
    this.code = code;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.onChange = onChange;
    this.rng = createRng(seed ?? randomBytes(4).readUInt32LE());
    this.players = new Map();
    this.order = 0;
    this.hostId = null;
    this.options = { ...DEFAULT_OPTIONS };
    this.phase = 'lobby'; // lobby | countdown | playing | reveal | final
    this.round = 0;
    this.grid = null;
    this.size = 4;
    this.possible = [];
    this.endsAt = null;
    this.timer = null;
    this.rounds = []; // resultados de cada rodada
    this.lastActivity = now();
  }

  // ---------- jogadores ----------
  addPlayer({ name, avatar }) {
    if (this.players.size >= MAX_PLAYERS) throw new Error('Sala cheia');
    let clean = cleanName(name);
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    for (let i = 2; taken.has(clean.toLowerCase()); i++) clean = `${cleanName(name).slice(0, 13)} ${i}`;
    const p = {
      id: randomBytes(6).toString('hex'),
      token: randomBytes(16).toString('hex'),
      name: clean,
      avatar: AVATARS.includes(avatar) ? avatar : AVATARS[this.players.size % AVATARS.length],
      connected: true,
      ready: false,
      total: 0,
      words: [],
      provisional: 0,
      submits: [],
      joinOrder: this.order++,
    };
    this.players.set(p.id, p);
    if (!this.hostId) this.hostId = p.id;
    this.touch();
    return p;
  }

  resume(id, token) {
    const p = this.players.get(id);
    if (!p || p.token !== token) return null;
    p.connected = true;
    if (!this.players.get(this.hostId)?.connected) this.hostId = p.id;
    this.touch();
    return p;
  }

  disconnect(id) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = false;
    if (this.hostId === id) this.passHost();
    this.touch();
  }

  leave(id) {
    if (!this.players.has(id)) return;
    this.players.delete(id);
    if (this.hostId === id) this.passHost();
    this.touch();
  }

  passHost() {
    const next = [...this.players.values()].filter((p) => p.connected).sort((a, b) => a.joinOrder - b.joinOrder)[0];
    this.hostId = next ? next.id : [...this.players.keys()][0] || null;
  }

  get connectedCount() {
    return [...this.players.values()].filter((p) => p.connected).length;
  }

  // ---------- saguão ----------
  setReady(id, ready) {
    const p = this.players.get(id);
    if (!p || this.phase !== 'lobby') return;
    p.ready = !!ready;
    this.touch();
  }

  setOptions(id, opts) {
    this.assertHost(id);
    if (this.phase !== 'lobby') throw new Error('Só dá para mudar as regras no saguão');
    this.options = sanitizeOptions(opts, this.options);
    this.touch();
  }

  start(id) {
    this.assertHost(id);
    if (this.phase !== 'lobby') throw new Error('A partida já começou');
    this.round = 0;
    this.rounds = [];
    for (const p of this.players.values()) p.total = 0;
    this.countdown();
  }

  next(id) {
    this.assertHost(id);
    if (this.phase !== 'reveal') throw new Error('Ainda não dá para avançar');
    this.countdown();
  }

  rematch(id) {
    this.assertHost(id);
    if (this.phase !== 'final') throw new Error('A partida ainda não acabou');
    this.phase = 'lobby';
    this.round = 0;
    this.rounds = [];
    this.grid = null;
    for (const p of this.players.values()) Object.assign(p, { total: 0, ready: false, words: [], provisional: 0 });
    this.touch();
  }

  assertHost(id) {
    if (id !== this.hostId) throw new Error('Só o anfitrião pode fazer isso');
  }

  // ---------- rodadas ----------
  countdown() {
    this.phase = 'countdown';
    this.endsAt = this.now() + COUNTDOWN_MS;
    this.schedule(COUNTDOWN_MS, () => this.startRound());
    this.touch();
  }

  startRound() {
    this.round++;
    this.size = this.options.size;
    const { grid, words } = makeGrid(this.rng, this.size, { minWords: this.size === 4 ? 40 : 90 });
    this.grid = grid;
    this.possible = words;
    for (const p of this.players.values()) { p.words = []; p.provisional = 0; }
    this.phase = 'playing';
    this.endsAt = this.now() + this.options.seconds * 1000;
    this.schedule(this.options.seconds * 1000 + GRACE_MS, () => this.endRound());
    this.touch();
  }

  submit(id, rawWord, path) {
    const p = this.players.get(id);
    if (!p) return { ok: false, reason: 'Jogador não está na sala' };
    if (this.phase !== 'playing') return { ok: false, reason: 'A rodada não está valendo' };
    if (this.now() > this.endsAt + GRACE_MS) return { ok: false, reason: 'Tempo esgotado' };
    const t = this.now();
    p.submits = p.submits.filter((s) => t - s < 1000);
    if (p.submits.length >= RATE_LIMIT) return { ok: false, reason: 'Devagar!' };
    p.submits.push(t);

    const word = normalize(String(rawWord || '')).slice(0, 25);
    if (word.length < MIN_LETTERS) return { ok: false, reason: `Mínimo ${MIN_LETTERS} letras`, word };
    if (p.words.includes(word)) return { ok: false, dup: true, reason: 'Você já achou essa', word };
    if (!this.validPath(word, path)) return { ok: false, reason: 'Essa palavra não está na grade', word };
    if (!isWord(word)) return { ok: false, reason: `${word.toUpperCase()} não está no dicionário`, word };
    p.words.push(word);
    const pts = wordPoints(word);
    p.provisional += pts;
    this.touch();
    return { ok: true, word, pts };
  }

  validPath(word, path) {
    const n = this.grid.length;
    if (Array.isArray(path) && path.length === word.length) {
      const seen = new Set();
      for (let k = 0; k < path.length; k++) {
        const i = path[k];
        if (!Number.isInteger(i) || i < 0 || i >= n || seen.has(i) || this.grid[i] !== word[k]) return !!findPath(this.grid, this.size, word);
        if (k > 0 && !isAdjacent(path[k - 1], i, this.size)) return !!findPath(this.grid, this.size, word);
        seen.add(i);
      }
      return true;
    }
    return !!findPath(this.grid, this.size, word);
  }

  endRound() {
    if (this.phase !== 'playing') return;
    const byPlayer = {};
    for (const p of this.players.values()) byPlayer[p.id] = p.words;
    const { players, counts } = scoreRound(this.options.mode, byPlayer);
    for (const [id, r] of Object.entries(players)) this.players.get(id).total += r.score;
    const allFound = new Set(Object.keys(counts));
    let longest = null;
    for (const [id, r] of Object.entries(players))
      for (const w of r.words) if (!longest || w.w.length > longest.w.length) longest = { w: w.w, id };
    this.rounds.push({
      round: this.round,
      grid: this.grid,
      size: this.size,
      players,
      longest,
      missed: this.possible.filter((w) => !allFound.has(w)).sort((a, b) => b.length - a.length || a.localeCompare(b)).slice(0, 30),
      possible: this.possible.length,
    });
    this.phase = this.round >= this.options.rounds ? 'final' : 'reveal';
    this.endsAt = null;
    this.touch();
  }

  schedule(ms, fn) {
    this.clearTimer(this.timer);
    this.timer = this.setTimer(fn, ms);
  }

  destroy() {
    this.clearTimer(this.timer);
  }

  touch() {
    this.lastActivity = this.now();
    this.onChange(this);
  }

  // ---------- estado enviado a cada jogador ----------
  standings() {
    return [...this.players.values()]
      .map((p) => ({ id: p.id, total: p.total }))
      .sort((a, b) => b.total - a.total);
  }

  stateFor(id) {
    const me = this.players.get(id);
    const showGrid = ['playing', 'reveal', 'final'].includes(this.phase);
    const last = this.rounds[this.rounds.length - 1];
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      you: id,
      options: this.options,
      round: this.round,
      serverNow: this.now(),
      endsAt: this.endsAt,
      grid: showGrid ? this.grid : null,
      size: this.size,
      possible: this.phase === 'playing' ? this.possible.length : undefined,
      players: [...this.players.values()]
        .sort((a, b) => a.joinOrder - b.joinOrder)
        .map((p) => ({
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          connected: p.connected,
          ready: p.ready,
          total: p.total,
          // durante a rodada todos veem pontos e quantidade, mas não as palavras
          roundWords: p.words.length,
          roundPoints: p.provisional,
        })),
      myWords: me && this.phase === 'playing' ? me.words : undefined,
      lastRound: ['reveal', 'final'].includes(this.phase) ? last : undefined,
      history: this.phase === 'final' ? this.rounds.map((r) => ({ round: r.round, scores: Object.fromEntries(Object.entries(r.players).map(([pid, x]) => [pid, x.score])) })) : undefined,
      standings: this.standings(),
    };
  }
}
