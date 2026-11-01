// Partidas solo que valem no ranking global: o servidor entrega a grade (ticket)
// e, no fim, recalcula os pontos a partir das palavras e caminhos enviados.
import { ensureProfile, api } from './profile.js';

export async function startOnline(modo, extra = {}) {
  const p = await ensureProfile();
  if (!p) return null;
  try {
    return await api('solo/inicio', { method: 'POST', body: { modo, ...extra } });
  } catch {
    return null; // sem servidor/ranking: a partida continua só local
  }
}

export function finishOnline(ticket, palavras) {
  return api('solo/fim', { method: 'POST', body: { ticket, palavras } });
}
