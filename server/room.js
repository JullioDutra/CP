// Motor de uma sala multijogador. Não sabe nada de rede: recebe ações e
// chama `onChange` quando o estado muda. O servidor é a autoridade:
// sorteia o jogo, controla o relógio e valida cada jogada.
// A lógica de cada tipo de jogo fica em server/games/*.js.
import { randomBytes } from 'node:crypto';
import { createRng } from '../js/core/rng.js';
import { normalize } from '../js/core/dict.js';
import { MULTI_MODES, AVATARS, DEFAULT_OPTIONS, sanitizeOptions } from '../js/core/multimodes.js';
import grade from './games/grade.js';
import wordsearch from './games/wordsearch.js';
import sudoku from './games/sudoku.js';

export const GAMES = { grade, wordsearch, sudoku };
export const MAX_PLAYERS = 12;
const COUNTDOWN_MS = 3500;
export const GRACE_MS = 400; // tolerância de rede no fim da rodada
const RATE_LIMIT = 10; // ações por segundo
const BAD_NAMES = ['porra', 'caralho', 'puta', 'merda', 'buceta', 'viado', 'cuzao', 'foder', 'fdp', 'pqp', 'arrombado'];

export function cleanName(raw) {
  let name = String(raw || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
  const n = normalize(name);
  if (BAD_NAMES.some((b) => n.includes(b))) name = 'Jogador';
  return name || 'Jogador';
}

export class Room {
  constructor(code, { now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, onChange = () => {}, onFinal = () => {}, seed, verifier = null } = {}) {
    this.onFinal = onFinal;
    this.code = code;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.onChange = onChange;
    this.verifier = verifier;
    this.rng = createRng(seed ?? randomBytes(4).readUInt32LE());
    this.players = new Map();
    this.spectators = new Set(); // telões
    this.order = 0;
    this.hostId = null;
    this.options = { ...DEFAULT_OPTIONS };
    this.phase = 'lobby'; // lobby | countdown | playing | reveal | final
    this.round = 0;
    this.rd = null; // dados da rodada (do jogo)
    this.endsAt = null;
    this.timer = null;
    this.closing = false;
    this.pending = new Set();
    this.rounds = []; // resultados de cada rodada
    this.lastActivity = now();
  }

  get mode() { return MULTI_MODES[this.options.mode]; }
  get game() { return GAMES[this.mode.game]; }

  // ---------- jogadores ----------
  addPlayer({ name, avatar, profileId = null }) {
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
      rs: null, // estado do jogador na rodada
      acts: [],
      joinOrder: this.order++,
      profileId,
    };
    this.players.set(p.id, p);
    if (this.rd && this.phase === 'playing') this.game.initPlayer(p, this);
    if (!this.hostId) this.hostId = p.id;
    this.touch();
    return p;
  }

  addSpectator() {
    const id = `tv-${randomBytes(4).toString('hex')}`;
    this.spectators.add(id);
    this.touch();
    return id;
  }

  removeSpectator(id) {
    this.spectators.delete(id);
    this.touch();
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
    return [...this.players.values()].filter((p) => p.connected).length + this.spectators.size;
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
    this.rd = null;
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
    this.rd = null;
    for (const p of this.players.values()) Object.assign(p, { total: 0, ready: false, rs: null });
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
    this.closing = false;
    this.game.start(this);
    this.phase = 'playing';
    this.endsAt = this.now() + this.options.seconds * 1000;
    this.schedule(this.options.seconds * 1000 + GRACE_MS, () => this.endRound());
    this.touch();
  }

  // Ação de jogo (palavra, marcação, número…). Pode responder na hora ou devolver Promise.
  act(id, msg) {
    const p = this.players.get(id);
    if (!p) return { ok: false, reason: 'Jogador não está na sala' };
    if (this.phase !== 'playing' || this.closing || !p.rs) return { ok: false, reason: 'A rodada não está valendo' };
    if (this.now() > this.endsAt + GRACE_MS) return { ok: false, reason: 'Tempo esgotado' };
    const t = this.now();
    p.acts = p.acts.filter((s) => t - s < 1000);
    if (p.acts.length >= RATE_LIMIT) return { ok: false, reason: 'Devagar!' };
    p.acts.push(t);
    const fn = this.game.actions[msg?.a];
    if (!fn) return { ok: false, reason: 'Ação desconhecida' };
    return fn(this, p, msg);
  }

  // a rodada só fecha depois que as verificações em andamento (IA) terminarem
  trackPending(promise) {
    this.pending.add(promise);
    promise.finally(() => this.pending.delete(promise));
  }

  endRound() {
    if (this.phase !== 'playing' || this.closing) return;
    this.closing = true;
    this.clearTimer(this.timer);
    const finalize = () => {
      if (this.phase !== 'playing') return;
      const { scores, detail } = this.game.finish(this);
      for (const [id, s] of Object.entries(scores)) {
        const p = this.players.get(id);
        if (p) p.total += s;
      }
      this.rounds.push({ round: this.round, mode: this.options.mode, scores, ...detail });
      this.phase = this.round >= this.options.rounds ? 'final' : 'reveal';
      this.endsAt = null;
      this.closing = false;
      if (this.phase === 'final') this.onFinal(this);
      this.touch();
    };
    if (this.pending.size) Promise.allSettled([...this.pending]).then(finalize);
    else finalize();
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

  // Resumo da partida para o ranking global (posições com empate dividem o lugar).
  matchSummary() {
    const mode = this.mode;
    const variant = mode.game === 'grade' ? String(this.options.size) : mode.game === 'sudoku' ? this.options.difficulty : '';
    const standings = this.standings();
    const players = standings.map((st) => {
      const p = this.players.get(st.id);
      let words = 0, unique = 0, longest = null;
      for (const r of this.rounds) {
        const d = r.players?.[st.id];
        if (!d) continue;
        if (r.type === 'grade') {
          words += d.words.length;
          unique += d.unique;
          for (const w of d.words) if (!longest || w.w.length > longest.length) longest = w.w;
        } else if (r.type === 'wordsearch') {
          words += d.found.length;
        } else if (r.type === 'sudoku') {
          words += d.filled;
        }
      }
      const place = standings.findIndex((x) => x.total === st.total) + 1;
      return { profileId: p.profileId, name: p.name, avatar: p.avatar, score: st.total, place, words, unique, longest };
    });
    return { mode: this.options.mode, variant, kind: 'multi', room: this.code, players };
  }

  // ---------- estado enviado a cada jogador / telão ----------
  standings() {
    return [...this.players.values()].map((p) => ({ id: p.id, total: p.total })).sort((a, b) => b.total - a.total);
  }

  stateFor(id) {
    const me = this.players.get(id) || null;
    const playing = this.phase === 'playing' && this.rd;
    const last = this.rounds[this.rounds.length - 1];
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      you: id,
      spectator: !me,
      tv: this.spectators.size > 0,
      options: this.options,
      round: this.round,
      serverNow: this.now(),
      endsAt: this.endsAt,
      play: playing ? this.game.publicFor(this, me) : undefined,
      players: [...this.players.values()]
        .sort((a, b) => a.joinOrder - b.joinOrder)
        .map((p) => {
          // durante a rodada todos veem pontos e progresso, mas não as jogadas dos outros
          const prog = playing && p.rs ? this.game.progress(p, this) : { points: 0, label: '' };
          return { id: p.id, name: p.name, avatar: p.avatar, connected: p.connected, ready: p.ready, total: p.total, hue: p.joinOrder, roundPoints: prog.points, roundLabel: prog.label };
        }),
      lastRound: ['reveal', 'final'].includes(this.phase) ? last : undefined,
      history: this.phase === 'final' ? this.rounds.map((r) => ({ round: r.round, scores: r.scores })) : undefined,
      standings: this.standings(),
    };
  }
}
