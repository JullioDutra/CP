// Gerencia salas e traduz mensagens dos clientes em ações na sala.
import { randomInt } from 'node:crypto';
import { Room } from './room.js';

const CODE_LETTERS = 'BCDFGHJKLMNPQRSTVWXZ'; // sem vogais: códigos não formam palavras
const IDLE_MS = 10 * 60 * 1000;

export class RoomManager {
  constructor({ roomOptions = {}, verifier = null } = {}) {
    this.verifier = verifier;
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

  createRoom() {
    const code = this.newCode();
    const room = new Room(code, { verifier: this.verifier, ...this.roomOptions, onChange: (r) => this.broadcast(r) });
    this.rooms.set(code, room);
    this.sockets.set(code, new Map());
    return room;
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
        attach(r, r.addPlayer(m));
      },
      join: (m) => {
        const r = this.rooms.get(String(m.code || '').toUpperCase().trim());
        if (!r) throw new Error('Sala não encontrada. Confira o código.');
        attach(r, r.addPlayer(m));
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
        if (!['create', 'join', 'resume', 'watch', 'ping'].includes(msg.t) && !room) {
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
