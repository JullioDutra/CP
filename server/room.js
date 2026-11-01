// Motor de uma sala multijogador. Não sabe nada de rede: recebe ações e
// chama `onChange` quando o estado muda. O servidor é a autoridade:
// sorteia o jogo, controla o relógio e valida cada jogada.
// A lógica de cada tipo de jogo fica em server/games/*.js.
//
// Salas privadas têm anfitrião (👑). Salas públicas (Arena) não: começam sozinhas
// quando há 2+ pessoas e avançam as rodadas automaticamente.
import { randomBytes } from 'node:crypto';
import { createRng } from '../js/core/rng.js';
import { normalize } from '../js/core/dict.js';
import { MULTI_MODES, AVATARS, DEFAULT_OPTIONS, sanitizeOptions, TEAMS, REACTIONS } from '../js/core/multimodes.js';
import grade from './games/grade.js';
import wordsearch from './games/wordsearch.js';
import sudoku from './games/sudoku.js';

export const GAMES = { grade, wordsearch, sudoku };
export const MAX_PLAYERS = 12;
export const ARENA_MAX = 8;
const COUNTDOWN_MS = 3500;
export const GRACE_MS = 400; // tolerância de rede no fim da rodada
const RATE_LIMIT = 10; // ações por segundo
// TRAMA_ARENA_RAPIDA=1 encurta as esperas da Arena (só para testes automáticos)
const FAST = typeof process !== 'undefined' && process.env.TRAMA_ARENA_RAPIDA === '1';
export const ARENA_WAIT_MS = FAST ? 3000 : 20000; // espera por mais gente na Arena
export const ARENA_NEXT_MS = FAST ? 8000 : 26000; // tempo para ver a revelação antes da próxima rodada
const TICK_MS = 250;
const BAD_NAMES = ['porra', 'caralho', 'puta', 'merda', 'buceta', 'viado', 'cuzao', 'foder', 'fdp', 'pqp', 'arrombado'];

// Partidas da Arena Pública: sorteia um destes formatos.
export const ARENA_FORMATS = FAST ? [{ mode: 'grupo-classico', rounds: 2, seconds: 60, size: 4 }] : [
  { mode: 'grupo-classico', rounds: 2, seconds: 90, size: 4 },
  { mode: 'grupo-classico', rounds: 2, seconds: 90, size: 5 },
  { mode: 'grupo-bonus', rounds: 2, seconds: 90, size: 5 },
];

export function cleanName(raw) {
  let name = String(raw || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
  const n = normalize(name);
  if (BAD_NAMES.some((b) => n.includes(b))) name = 'Jogador';
  return name || 'Jogador';
}

export class Room {
  constructor(code, { now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, onChange = () => {}, onFinal = () => {}, seed, verifier = null, isPublic = false } = {}) {
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
    this.public = isPublic;
    this.options = isPublic ? sanitizeOptions(this.rng.pick(ARENA_FORMATS)) : { ...DEFAULT_OPTIONS };
    this.phase = 'lobby'; // lobby | countdown | playing | reveal | final
    this.round = 0;
    this.rd = null; // dados da rodada (do jogo)
    this.endsAt = null;
    this.timer = null;
    this.ticker = null;
    this.closing = false;
    this.pending = new Set();
    this.rounds = []; // resultados de cada rodada
    this.teams = {}; // playerId -> 'A' | 'B' (modo Times)
    this.finalResult = null; // níveis (Elo) e conquistas depois da partida
    this.lastActivity = now();
  }

  get mode() { return MULTI_MODES[this.options.mode]; }
  get game() { return GAMES[this.mode.game]; }

  // ---------- jogadores ----------
  addPlayer({ name, avatar, profileId = null }) {
    const max = this.public ? ARENA_MAX : MAX_PLAYERS;
    if (this.players.size >= max) throw new Error('Sala cheia');
    if (this.public && this.phase !== 'lobby') throw new Error('Essa partida já começou');
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
      reacts: 0,
      joinOrder: this.order++,
      profileId,
    };
    this.players.set(p.id, p);
    if (this.mode.teams && this.phase !== 'lobby') this.teams[p.id] = this.smallerTeam();
    if (this.rd && this.phase === 'playing') this.game.initPlayer(p, this);
    if (!this.hostId && !this.public) this.hostId = p.id;
    this.arenaCheck();
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
    if (!this.public && !this.players.get(this.hostId)?.connected) this.hostId = p.id;
    this.touch();
    return p;
  }

  disconnect(id) {
    const p = this.players.get(id);
    if (!p) return;
    // na Arena, quem cai no saguão sai da fila
    if (this.public && this.phase === 'lobby') { this.leave(id); return; }
    p.connected = false;
    if (this.hostId === id) this.passHost();
    this.touch();
  }

  leave(id) {
    if (!this.players.has(id)) return;
    this.players.delete(id);
    delete this.teams[id];
    if (this.hostId === id) this.passHost();
    this.arenaCheck();
    this.touch();
  }

  passHost() {
    if (this.public) { this.hostId = null; return; }
    const next = [...this.players.values()].filter((p) => p.connected).sort((a, b) => a.joinOrder - b.joinOrder)[0];
    this.hostId = next ? next.id : [...this.players.keys()][0] || null;
  }

  get connectedCount() {
    return [...this.players.values()].filter((p) => p.connected).length + this.spectators.size;
  }

  // Reação rápida (emoji) — limitada a 1 a cada 0,7 s por pessoa.
  react(id, emoji) {
    const p = this.players.get(id);
    if (!p || !REACTIONS.includes(emoji)) return null;
    const t = this.now();
    if (t - p.reacts < 700) return null;
    p.reacts = t;
    return { id: p.id, emoji, name: p.name, avatar: p.avatar };
  }

  // ---------- Arena Pública: começa sozinha ----------
  arenaCheck() {
    if (!this.public || this.phase !== 'lobby') return;
    const n = this.players.size;
    if (n >= ARENA_MAX) {
      this.endsAt = this.now() + 3000;
      this.schedule(3000, () => this.beginMatch());
    } else if (n >= 2) {
      if (!this.endsAt) {
        this.endsAt = this.now() + ARENA_WAIT_MS;
        this.schedule(ARENA_WAIT_MS, () => this.beginMatch());
      }
    } else {
      this.endsAt = null;
      this.clearTimer(this.timer);
    }
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
    this.beginMatch();
  }

  beginMatch() {
    if (this.phase !== 'lobby') return;
    this.round = 0;
    this.rounds = [];
    this.rd = null;
    this.finalResult = null;
    for (const p of this.players.values()) p.total = 0;
    if (this.mode.teams) this.assignTeams();
    this.countdown();
  }

  // Times sorteados e equilibrados (diferença de no máximo 1 pessoa).
  assignTeams() {
    this.teams = {};
    this.rng.shuffle([...this.players.keys()]).forEach((id, i) => (this.teams[id] = i % 2 ? 'B' : 'A'));
  }

  smallerTeam() {
    const a = Object.values(this.teams).filter((t) => t === 'A').length;
    const b = Object.values(this.teams).length - a;
    return a <= b ? 'A' : 'B';
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
    this.finalResult = null;
    for (const p of this.players.values()) Object.assign(p, { total: 0, ready: false, rs: null });
    this.touch();
  }

  assertHost(id) {
    if (this.public) throw new Error('Na Arena a partida começa sozinha');
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
    if (this.game.tick) this.startTicker();
    this.touch();
  }

  // relógio contínuo para jogos com vidas (Arena Sobrevivência)
  startTicker() {
    const loop = () => {
      if (this.phase !== 'playing' || this.closing) return;
      this.game.tick(this);
      if (this.phase === 'playing' && !this.closing) this.ticker = this.setTimer(loop, TICK_MS);
    };
    this.clearTimer(this.ticker);
    this.ticker = this.setTimer(loop, TICK_MS);
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
    this.clearTimer(this.ticker);
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
      if (this.phase === 'final') this.finalResult = this.onFinal(this) || null;
      // Arena: avança sozinha depois da revelação
      if (this.public && this.phase === 'reveal') {
        this.endsAt = this.now() + ARENA_NEXT_MS;
        this.schedule(ARENA_NEXT_MS, () => this.phase === 'reveal' && this.countdown());
      }
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
    this.clearTimer(this.ticker);
  }

  touch() {
    this.lastActivity = this.now();
    this.onChange(this);
  }

  // Pontos de cada time (soma dos jogadores) na partida inteira.
  teamTotals() {
    const t = { A: 0, B: 0 };
    for (const p of this.players.values()) if (this.teams[p.id]) t[this.teams[p.id]] += p.total;
    return t;
  }

  // Resumo da partida para o ranking global (posições com empate dividem o lugar).
  matchSummary() {
    const mode = this.mode;
    const variant = mode.game === 'grade' ? String(this.options.size) : mode.game === 'sudoku' ? this.options.difficulty : '';
    const standings = this.standings();
    const teamTot = mode.teams ? this.teamTotals() : null;
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
      let place = standings.findIndex((x) => x.total === st.total) + 1;
      if (teamTot) {
        // nos Times, a colocação é a do time
        const mine = teamTot[this.teams[st.id]] ?? 0;
        const other = teamTot[this.teams[st.id] === 'A' ? 'B' : 'A'] ?? 0;
        place = mine > other ? 1 : mine === other ? 1 : 2;
      }
      return { profileId: p.profileId, name: p.name, avatar: p.avatar, score: st.total, place, words, unique, longest };
    });
    return { mode: this.options.mode, variant, kind: this.public ? 'arena' : 'multi', room: this.code, players };
  }

  // ---------- estado enviado a cada jogador / telão ----------
  standings() {
    return [...this.players.values()].map((p) => ({ id: p.id, total: p.total })).sort((a, b) => b.total - a.total);
  }

  stateFor(id) {
    const me = this.players.get(id) || null;
    const playing = this.phase === 'playing' && this.rd;
    const last = this.rounds[this.rounds.length - 1];
    const fr = this.phase === 'final' ? this.finalResult : null;
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      public: this.public,
      you: id,
      spectator: !me,
      tv: this.spectators.size > 0,
      options: this.options,
      round: this.round,
      serverNow: this.now(),
      endsAt: this.endsAt,
      play: playing ? this.game.publicFor(this, me) : undefined,
      teams: this.mode.teams ? { info: TEAMS, of: this.teams, totals: this.teamTotals() } : undefined,
      players: [...this.players.values()]
        .sort((a, b) => a.joinOrder - b.joinOrder)
        .map((p) => {
          // durante a rodada todos veem pontos e progresso, mas não as jogadas dos outros
          const prog = playing && p.rs ? this.game.progress(p, this) : { points: 0, label: '' };
          return {
            id: p.id, name: p.name, avatar: p.avatar, connected: p.connected, ready: p.ready, total: p.total, hue: p.joinOrder,
            roundPoints: prog.points, roundLabel: prog.label, team: this.teams[p.id] || null,
            // nível (Elo) e conquistas novas: só no fim da partida
            rating: fr && p.profileId ? fr.ratings?.[p.profileId] || null : undefined,
          };
        }),
      myAchievements: fr && me?.profileId ? fr.achievements?.[me.profileId] || [] : undefined,
      lastRound: ['reveal', 'final'].includes(this.phase) ? last : undefined,
      history: this.phase === 'final' ? this.rounds.map((r) => ({ round: r.round, scores: r.scores })) : undefined,
      standings: this.standings(),
    };
  }
}
