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
  const pending = new Map();
  const queue = [];

  function open() {
    ws = new WebSocket(serverUrl());
    ws.onopen = () => {
      everOpened = true;
      retry = 0;
      onStatus?.('online');
      onOpen?.();
      while (queue.length) ws.send(queue.shift());
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.t === 'res' && pending.has(msg.rid)) {
        pending.get(msg.rid)(msg.result);
        pending.delete(msg.rid);
        return;
      }
      onMessage(msg);
    };
    ws.onclose = () => {
      for (const resolve of pending.values()) resolve({ ok: false, reason: 'Sem conexão' });
      pending.clear();
      if (closed) return;
      onStatus?.(everOpened ? 'reconnecting' : 'unavailable');
      setTimeout(open, Math.min(8000, 500 * 2 ** retry++));
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
      ws?.close();
    },
  };
}
