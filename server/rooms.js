// Gerencia salas e traduz mensagens dos clientes em ações na sala.
import { randomInt } from 'node:crypto';
import { Room, ARENA_MAX } from './room.js';

const CODE_LETTERS = 'BCDFGHJKLMNPQRSTVWXZ'; // sem vogais: códigos não formam palavras
const IDLE_MS = 10 * 60 * 1000;

export class RoomManager {
  constructor({ roomOptions = {}, verifier = null, store = null } = {}) {
    this.verifier = verifier;
    this.store = store;
    this.rooms = new Map();
    this.sockets = new Map(); // code -> Map(playerId -> send)
    this.roomOptions = roomOptions;
    setInterval(() => this.sweep(), 60 * 1000).unref?.();
  }

  newCode() {
    for (;;) {
      const code = Array.from({ length: 4 }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]).join('');
      if (!this.rooms.has(code)) return code;
    }
  }

  createRoom({ isPublic = false } = {}) {
    const code = this.newCode();
    const room = new Room(code, { verifier: this.verifier, ...this.roomOptions, isPublic, onChange: (r) => this.broadcast(r), onFinal: (r) => this.record(r) });
    this.rooms.set(code, room);
    this.sockets.set(code, new Map());
    return room;
  }

  // grava a partida encerrada no ranking global
  record(room) {
    if (!this.store) return null;
    try {
      const summary = room.matchSummary();
      if (summary.players.length) return this.store.recordMatch(summary);
    } catch (e) {
      console.error('[ranking] não foi possível gravar a partida:', e.message);
    }
    return null;
  }

  // Arena Pública: entra numa sala aberta esperando gente, ou abre uma nova.
  arenaRoom() {
    for (const r of this.rooms.values()) {
      if (r.public && r.phase === 'lobby' && r.players.size < ARENA_MAX) return r;
    }
    return this.createRoom({ isPublic: true });
  }

  arenaStatus() {
    let waiting = 0, playing = 0;
    for (const r of this.rooms.values()) {
      if (!r.public) continue;
      if (r.phase === 'lobby') waiting += r.players.size;
      else playing += [...r.players.values()].filter((p) => p.connected).length;
    }
    return { waiting, playing };
  }

  broadcastRaw(room, msg) {
    const conns = this.sockets.get(room.code);
    if (conns) for (const send of conns.values()) send(msg);
  }

  // perfil (sem login) enviado pelo navegador: { name, avatar, profile: token }
  withProfile(m) {
    const prof = this.store?.profileByToken(m.profile);
    return { name: m.name, avatar: m.avatar, profileId: prof?.id || null };
  }

  broadcast(room) {
    const conns = this.sockets.get(room.code);
    if (!conns) return;
    for (const [id, send] of conns) send({ t: 'state', state: room.stateFor(id) });
  }

  sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.connectedCount === 0 && now - room.lastActivity > IDLE_MS) {
        room.destroy();
        this.rooms.delete(code);
        this.sockets.delete(code);
      }
    }
  }

  // Uma conexão de cliente. `send` envia um objeto ao navegador.
  connect(send) {
    let room = null;
    let playerId = null; // jogador ou telão (tv-…)
    let isTv = false;

    const attach = (r, p) => {
      room = r;
      playerId = p.id;
      this.sockets.get(r.code).set(p.id, send);
      send({ t: 'joined', code: r.code, id: p.id, token: p.token });
      this.broadcast(r);
    };

    const actions = {
      create: (m) => {
        const r = this.createRoom();
        attach(r, r.addPlayer(this.withProfile(m)));
      },
      quick: (m) => {
        // sai da sala anterior (ex.: "jogar outra" depois do fim da Arena)
        if (room && !isTv) { this.sockets.get(room.code)?.delete(playerId); room.leave(playerId); room = null; }
        const r = this.arenaRoom();
        attach(r, r.addPlayer(this.withProfile(m)));
      },
      react: (m) => {
        const r = room.react(playerId, m.emoji);
        if (r) this.broadcastRaw(room, { t: 'reaction', ...r });
      },
      join: (m) => {
        const r = this.rooms.get(String(m.code || '').toUpperCase().trim());
        if (!r) throw new Error('Sala não encontrada. Confira o código.');
        attach(r, r.addPlayer(this.withProfile(m)));
      },
      // telão: entra como espectador (não joga, só mostra)
      watch: (m) => {
        const r = m.create ? this.createRoom() : this.rooms.get(String(m.code || '').toUpperCase().trim());
        if (!r) throw new Error('Sala não encontrada. Confira o código.');
        room = r;
        isTv = true;
        playerId = r.addSpectator();
        this.sockets.get(r.code).set(playerId, send);
        send({ t: 'watching', code: r.code, id: playerId });
        this.broadcast(r);
      },
      resume: (m) => {
        const r = this.rooms.get(String(m.code || '').toUpperCase());
        const p = r?.resume(m.id, m.token);
        if (!p) { send({ t: 'expired' }); return; }
        attach(r, p);
      },
      ready: (m) => room.setReady(playerId, m.ready),
      options: (m) => room.setOptions(playerId, m.options || {}),
      start: () => room.start(playerId),
      next: () => room.next(playerId),
      rematch: () => room.rematch(playerId),
      act: (m) => {
        Promise.resolve(room.act(playerId, m))
          .catch((e) => ({ ok: false, reason: e.message }))
          .then((result) => send({ t: 'res', rid: m.rid, result }));
      },
      leave: () => {
        const r = room;
        this.sockets.get(r.code)?.delete(playerId);
        if (isTv) r.removeSpectator(playerId);
        else r.leave(playerId);
        isTv = false;
        room = null;
        playerId = null;
        send({ t: 'left' });
      },
      ping: () => send({ t: 'pong', now: Date.now() }),
    };

    return {
      handle: (msg) => {
        const fn = actions[msg?.t];
        if (!fn) return;
        if (isTv && !['ping', 'leave'].includes(msg.t)) return; // telão só assiste
        if (!['create', 'join', 'resume', 'watch', 'ping', 'quick'].includes(msg.t) && !room) {
          send({ t: 'error', message: 'Você não está em uma sala' });
          return;
        }
        try {
          fn(msg);
        } catch (e) {
          send({ t: 'error', message: e.message });
        }
      },
      close: () => {
        if (!room) return;
        const conns = this.sockets.get(room.code);
        if (conns?.get(playerId) === send) conns.delete(playerId);
        if (isTv) room.removeSpectator(playerId);
        else room.disconnect(playerId);
      },
    };
  }
}
