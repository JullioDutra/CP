import { readFileSync } from 'node:fs';
import { loadServerDict } from '../server/dict-node.js';

// Mesmo dicionário do servidor (com bloqueadas e formas flexionadas).
export function loadTestDict() {
  loadServerDict();
}

// Relógio e timers falsos para testar as salas sem esperar de verdade.
export function fakeClock(start = 1000) {
  let t = start;
  const timers = [];
  return {
    now: () => t,
    setTimer: (fn, ms) => { const o = { fn, at: t + ms }; timers.push(o); return o; },
    clearTimer: (o) => { const i = timers.indexOf(o); if (i >= 0) timers.splice(i, 1); },
    advance(ms) {
      const target = t + ms;
      for (;;) {
        const o = timers.filter((x) => x.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!o) break;
        t = o.at;
        timers.splice(timers.indexOf(o), 1);
        o.fn();
      }
      t = target;
    },
  };
}

// "LLM" falso compatível com a API da OpenAI.
export function fakeLlmFetch(answers, calls = []) {
  return async (url, opts) => {
    const body = JSON.parse(opts.body);
    const word = body.messages[1].content.match(/"([a-z]+)"/)[1];
    calls.push({ url, word, auth: opts.headers.authorization });
    const a = answers[word];
    if (a === 'erro') return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: a ?? '{"existe": false, "forma": null, "confianca": 0.9, "motivo": "inventada"}' } }] }) };
  };
}
