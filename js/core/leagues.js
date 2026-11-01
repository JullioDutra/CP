// Ligas (por nível) e temporadas mensais — compartilhado entre navegador e servidor.
// O nível é um Elo simplificado que só muda nas partidas da Arena Pública
// (contra desconhecidos), para ninguém "farmar" pontos com os amigos.

export const START_RATING = 1000;
export const K_FACTOR = 32;

export const LEAGUES = [
  { key: 'bronze', name: 'Bronze', icon: '🥉', min: 0 },
  { key: 'prata', name: 'Prata', icon: '🥈', min: 1100 },
  { key: 'ouro', name: 'Ouro', icon: '🥇', min: 1200 },
  { key: 'platina', name: 'Platina', icon: '💠', min: 1300 },
  { key: 'diamante', name: 'Diamante', icon: '💎', min: 1450 },
];

export function leagueOf(rating) {
  let l = LEAGUES[0];
  for (const x of LEAGUES) if (rating >= x.min) l = x;
  return l;
}

// Temporada = mês (fuso de Brasília), ex.: "2026-11".
export function seasonOf(now = Date.now()) {
  return new Date(now - 3 * 3600 * 1000).toISOString().slice(0, 7);
}

export function seasonLabel(season) {
  const [y, m] = season.split('-').map(Number);
  const months = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return `${months[m - 1]} de ${y}`;
}

/**
 * Elo para partidas com vários jogadores: cada par de jogadores é um "duelo".
 * @param {{id:string, rating:number, place:number}[]} players
 * @returns {Object<string, number>} variação de nível de cada jogador
 */
export function eloDeltas(players, k = K_FACTOR) {
  const n = players.length;
  const out = Object.fromEntries(players.map((p) => [p.id, 0]));
  if (n < 2) return out;
  for (const a of players) {
    let sum = 0;
    for (const b of players) {
      if (a === b) continue;
      const expected = 1 / (1 + 10 ** ((b.rating - a.rating) / 400));
      const actual = a.place < b.place ? 1 : a.place === b.place ? 0.5 : 0;
      sum += actual - expected;
    }
    out[a.id] = Math.round((k / (n - 1)) * sum);
  }
  return out;
}
