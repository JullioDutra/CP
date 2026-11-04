// Conexão com o servidor multijogador (WebSocket) com reconexão automática.
export function serverUrl() {
  if (window.TRAMA_WS_URL) return window.TRAMA_WS_URL; // permite servidor em outro domínio
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

export function createNet({ onMessage, onOpen, onStatus }) {
  let ws = null;
  let retry = 0;
  let closed = false;
  let everOpened = false;
  let rid = 0;
  let statusTimer = null;
  const pending = new Map();
  const queue = [];

  function open() {
    const sock = new WebSocket(serverUrl());
    sock.onopen = () => {
      const prev = ws;
      ws = sock;
      everOpened = true;
      retry = 0;
      clearTimeout(statusTimer);
      onStatus?.('online');
      onOpen?.();
      while (queue.length) sock.send(queue.shift());
      // troca de conexão programada: a antiga ainda entrega respostas pendentes e depois fecha
      if (prev && prev !== sock) { prev.retired = true; setTimeout(() => prev.close(), 4000); }
    };
    sock.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.t === 'res' && pending.has(msg.rid)) {
        pending.get(msg.rid)(msg.result);
        pending.delete(msg.rid);
        return;
      }
      // o servidor avisa antes de encerrar a conexão (limite de tempo da hospedagem):
      // abre outra em paralelo e volta para a sala sem o jogador perceber
      if (msg.t === 'rotate') { if (sock === ws) open(); return; }
      onMessage(msg);
    };
    sock.onclose = () => {
      if (sock.retired || closed) return;
      if (sock !== ws && ws?.readyState === 1) return; // já existe outra conexão funcionando
      for (const resolve of pending.values()) resolve({ ok: false, reason: 'Sem conexão' });
      pending.clear();
      // só mostra "sem conexão" se a volta demorar (evita piscar o aviso)
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => onStatus?.(everOpened ? 'reconnecting' : 'unavailable'), everOpened ? 2500 : 0);
      setTimeout(open, Math.min(8000, 300 * 2 ** retry++));
    };
  }
  open();

  const send = (msg) => {
    const data = JSON.stringify(msg);
    if (ws?.readyState === 1) ws.send(data);
    else queue.push(data);
  };

  return {
    send,
    // envia uma jogada (palavra, marcação, número…) e espera a resposta do servidor
    act(a, payload = {}) {
      const id = ++rid;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        send({ t: 'act', rid: id, a, ...payload });
        setTimeout(() => {
          if (pending.has(id)) { pending.delete(id); resolve({ ok: false, reason: 'Sem resposta do servidor' }); }
        }, 12000); // a IA pode levar alguns segundos
      });
    },
    close() {
      closed = true;
      clearTimeout(statusTimer);
      ws?.close();
    },
  };
}
