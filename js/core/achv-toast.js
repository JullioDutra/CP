// Guarda quais conquistas o jogador já viu (para mostrar só as novas).
const KEY = 'trama.ach.seen';
export function seenAchievements() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY)) || []); } catch { return new Set(); }
}
export function markSeenAchievements(keys) {
  const s = seenAchievements();
  keys.forEach((k) => s.add(k));
  try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch { /* ignore */ }
}
