// Conquistas e temas desbloqueáveis — compartilhado entre navegador e servidor.
// O servidor confere as conquistas depois de cada partida gravada.

export const ACHIEVEMENTS = [
  { key: 'primeira', icon: '🎉', name: 'Primeira partida', desc: 'Jogue a sua primeira partida valendo ranking.', check: (c) => c.stats.matches >= 1 },
  { key: 'vitoria', icon: '🏆', name: 'Primeira vitória', desc: 'Vença uma partida em grupo (2+ pessoas).', check: (c) => c.stats.wins >= 1 },
  { key: 'vitorias10', icon: '👑', name: 'Colecionador de vitórias', desc: 'Vença 10 partidas em grupo.', check: (c) => c.stats.wins >= 10 },
  { key: 'palavra8', icon: '📏', name: 'Palavrão', desc: 'Ache uma palavra de 8 letras ou mais.', check: (c) => (c.match?.longest?.length || 0) >= 8 },
  { key: 'palavra10', icon: '🦒', name: 'Palavra gigante', desc: 'Ache uma palavra de 10 letras ou mais.', check: (c) => (c.match?.longest?.length || 0) >= 10 },
  { key: 'unicas10', icon: '★', name: 'Olho de águia', desc: '10 palavras únicas (que ninguém mais achou) numa partida.', check: (c) => (c.match?.unique || 0) >= 10 },
  { key: 'pontos100', icon: '💯', name: 'Centena', desc: 'Faça 100 pontos numa partida.', check: (c) => (c.match?.score || 0) >= 100 },
  { key: 'maratona', icon: '🏃', name: 'Maratona', desc: 'Jogue 25 partidas.', check: (c) => c.stats.matches >= 25 },
  { key: 'sequencia3', icon: '🔥', name: 'Pegando fogo', desc: 'Jogue o Desafio do Dia 3 dias seguidos.', check: (c) => c.stats.streak >= 3 },
  { key: 'sequencia7', icon: '🌋', name: 'Semana perfeita', desc: 'Jogue o Desafio do Dia 7 dias seguidos.', check: (c) => c.stats.streak >= 7 },
  { key: 'arena', icon: '🌐', name: 'Arena', desc: 'Jogue uma partida na Arena Pública.', check: (c) => c.stats.arena >= 1 },
  { key: 'ouro', icon: '🥇', name: 'Liga Ouro', desc: 'Chegue à liga Ouro numa temporada.', check: (c) => (c.rating?.peak || 0) >= 1200 },
];

// Temas visuais: liberados por conquistas.
export const THEMES = [
  { key: 'lavanda', name: 'Lavanda', swatch: ['#6a5ae0', '#f6f4fb'], unlock: null },
  { key: 'menta', name: 'Menta', swatch: ['#1b7a70', '#eef8f5'], unlock: 'vitoria' },
  { key: 'pessego', name: 'Pêssego', swatch: ['#c2552d', '#fdf3ec'], unlock: 'sequencia3' },
  { key: 'oceano', name: 'Oceano', swatch: ['#2563b8', '#eef4fb'], unlock: 'palavra8' },
  { key: 'noite', name: 'Noite estrelada', swatch: ['#b3a9fa', '#16141f'], unlock: 'ouro' },
];

export const achievementByKey = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.key, a]));
