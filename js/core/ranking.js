// Ranking de maiores pontuações por partida, separado por modo.
// Salvo no navegador (localStorage). Para um ranking online, troque estas funções
// por chamadas a uma API mantendo a mesma interface.
const KEY = 'trama.ranking.v1';
const NAME_KEY = 'trama.playerName';
const MAX = 10;

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function write(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* armazenamento bloqueado */ }
}

export function getRanking(modeId) {
  return (read()[modeId] || []).slice(0, MAX);
}

// Retorna a posição (1-based) da partida no ranking, ou null se não entrou no top.
export function addScore(modeId, entry) {
  const data = read();
  const list = data[modeId] || [];
  const row = { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, date: new Date().toISOString() };
  list.push(row);
  list.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
  data[modeId] = list.slice(0, MAX);
  write(data);
  const pos = data[modeId].findIndex((r) => r.id === row.id);
  return pos >= 0 ? { pos: pos + 1, id: row.id } : null;
}

export function qualifies(modeId, score) {
  const list = getRanking(modeId);
  return score > 0 && (list.length < MAX || score > list[list.length - 1].score);
}

export function clearRanking(modeId) {
  const data = read();
  delete data[modeId];
  write(data);
}

export function getPlayerName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}
export function setPlayerName(n) {
  try { localStorage.setItem(NAME_KEY, n); } catch { /* ignore */ }
}
