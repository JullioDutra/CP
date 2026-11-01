// Regras dos modos multijogador — compartilhadas entre navegador e servidor.
import { wordPoints } from './letters.js';

export const AVATARS = ['🦊', '🐼', '🐸', '🐙', '🦉', '🐯', '🐨', '🦄', '🐢', '🐝', '🦁', '🐧', '🐳', '🦖', '🐶', '🐱', '🐵', '🦜', '🐞', '🐲'];

// Cor de cada jogador (por ordem de entrada) — usada no caça-palavras e no telão.
export const PLAYER_HUES = [8, 210, 140, 45, 280, 180, 330, 95, 25, 250, 160, 300];

const ROUNDS = { label: 'Rodadas', choices: [1, 2, 3, 4, 5], format: 'plain' };

// Times (modo Times) e reações rápidas.
export const TEAMS = {
  A: { name: 'Time Vermelho', avatar: '🔴', hue: 4 },
  B: { name: 'Time Azul', avatar: '🔵', hue: 215 },
};
export const REACTIONS = ['😂', '😮', '👏', '🔥', '😭', '🤯', '❤️', '👀'];

// Arena Sobrevivência
export const SURVIVAL = { startMs: 60000, maxMs: 90000, stealMs: 1000, gainPerLetterMs: 1000, bonus: [40, 20, 10] };
const DIFFICULTY_LABELS = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' };

export const MULTI_MODES = {
  // ---------- CLÁSSICOS ----------
  'grupo-classico': {
    id: 'grupo-classico',
    game: 'grade',
    category: 'classico',
    name: 'Grade em Grupo',
    icon: '⚡',
    short: 'Mesma grade para todos · 4×4 a 6×6',
    rules: [
      'Todos recebem a mesma grade e o mesmo tempo.',
      'Palavras de no mínimo 3 letras; quanto maior, muito mais pontos.',
      'Várias pessoas podem achar a mesma palavra: todas ganham os pontos.',
      'No fim, o tanque mostra quantas palavras foram únicas e quantas repetidas.',
    ],
    options: {
      rounds: { ...ROUNDS, default: 3 },
      seconds: { label: 'Tempo', choices: [60, 90, 120, 180, 240], default: 120, format: 'time' },
      size: { label: 'Grade', choices: [4, 5, 6], default: 4, format: 'grid' },
    },
  },
  'corrida-cacapalavras': {
    id: 'corrida-cacapalavras',
    game: 'wordsearch',
    category: 'classico',
    name: 'Caça-Palavras Corrida',
    icon: '🔍',
    short: 'Quem marca primeiro leva a palavra',
    rules: [
      'Todos jogam na MESMA grade 12×12: 10 palavras de um tema ou a 🎲 Mistura (sem tema).',
      'Quem marcar a palavra primeiro leva os pontos (10 por letra) e ela fica com a sua cor.',
      'Na Mistura as palavras se cruzam e algumas dobram (horizontal + vertical): arraste letra por letra. Outras palavras comuns de 5+ letras que você formar valem 4 por letra.',
      'A rodada acaba quando todas da lista forem achadas ou o tempo acabar.',
    ],
    options: {
      rounds: { ...ROUNDS, default: 3 },
      seconds: { label: 'Tempo', choices: [120, 180, 240, 300], default: 180, format: 'time' },
      tema: { label: 'Tema', choices: ['surpresa', 'mistura'], default: 'surpresa', format: 'tema' },
    },
  },
  'sudoku-duelo': {
    id: 'sudoku-duelo',
    game: 'sudoku',
    category: 'classico',
    name: 'Sudoku Duelo',
    icon: '🔢',
    short: 'Mesmo sudoku, vence quem resolver primeiro',
    rules: [
      'Todos recebem o MESMO sudoku; cada um resolve o seu.',
      'O placar mostra o progresso (%) de cada jogador ao vivo.',
      'Quem terminar ganha pontos pela velocidade, com bônus para 1º, 2º e 3º.',
      'Cada erro custa 150 pontos. Quem não terminar ganha pelos números certos.',
    ],
    options: {
      rounds: { ...ROUNDS, choices: [1, 2, 3], default: 1 },
      difficulty: { label: 'Nível', choices: ['facil', 'medio', 'dificil'], default: 'medio', format: 'difficulty' },
      seconds: { label: 'Tempo', choices: [300, 600, 900], default: 600, format: 'time' },
    },
  },
  // ---------- NOVOS ----------
  'grupo-bonus': {
    id: 'grupo-bonus',
    game: 'grade',
    category: 'novo',
    name: 'Grade Bônus',
    icon: '💎',
    short: 'Casas ×2 e ×3 multiplicam a palavra',
    bonus: true,
    rules: [
      'Todos recebem a mesma grade, com casas especiais ×2 e ×3.',
      'Palavra que passa por uma casa especial tem os pontos multiplicados (×2 e ×3 juntas = ×6!).',
      'Várias pessoas podem achar a mesma palavra: todas ganham os pontos.',
      'No fim, o tanque mostra quantas palavras foram únicas e quantas repetidas.',
    ],
    options: {
      rounds: { ...ROUNDS, default: 3 },
      seconds: { label: 'Tempo', choices: [60, 90, 120, 180, 240], default: 120, format: 'time' },
      size: { label: 'Grade', choices: [4, 5, 6], default: 5, format: 'grid' },
    },
  },
  'arena-sobrevivencia': {
    id: 'arena-sobrevivencia',
    game: 'grade',
    category: 'novo',
    name: 'Arena Sobrevivência',
    icon: '⏳',
    short: 'Suas palavras roubam tempo dos outros',
    survival: true,
    rules: [
      'Todos começam com 60 segundos de vida na mesma grade.',
      'Cada palavra sua devolve 1 s por letra para você e tira 1 s de cada adversário.',
      'Quem zerar o tempo está fora. O último que sobrar vence a rodada.',
      'Bônus por colocação: 1º +40 · 2º +20 · 3º +10, além dos pontos das palavras.',
    ],
    options: {
      rounds: { ...ROUNDS, choices: [1, 2, 3], default: 1 },
      seconds: { label: 'Limite', choices: [180, 300], default: 300, format: 'time' },
      size: { label: 'Grade', choices: [4, 5, 6], default: 5, format: 'grid' },
    },
  },
  'times': {
    id: 'times',
    game: 'grade',
    category: 'novo',
    name: 'Times',
    icon: '🤜',
    short: '🔴 contra 🔵, pontos somados',
    teams: true,
    rules: [
      'Os jogadores são sorteados em dois times: 🔴 Vermelho e 🔵 Azul.',
      'Os pontos de cada pessoa somam para o time. Vence o time com mais pontos.',
      'Palavra que alguém do seu time já achou não vale de novo para o time.',
      'Entre times diferentes, todo mundo pode achar a mesma palavra.',
    ],
    options: {
      rounds: { ...ROUNDS, default: 3 },
      seconds: { label: 'Tempo', choices: [60, 90, 120, 180, 240], default: 120, format: 'time' },
      size: { label: 'Grade', choices: [4, 5, 6], default: 5, format: 'grid' },
    },
  },
};

export const DEFAULT_MODE = 'grupo-classico';

export function defaultOptions(modeId = DEFAULT_MODE) {
  const out = { mode: modeId };
  for (const [k, spec] of Object.entries(MULTI_MODES[modeId].options)) out[k] = spec.default;
  return out;
}

export const DEFAULT_OPTIONS = defaultOptions();

// Aceita só valores válidos para o modo. Trocar de modo volta às opções padrão dele.
export function sanitizeOptions(opts = {}, base = DEFAULT_OPTIONS) {
  const modeId = MULTI_MODES[opts.mode] ? opts.mode : MULTI_MODES[base.mode] ? base.mode : DEFAULT_MODE;
  const out = modeId === base.mode ? { ...defaultOptions(modeId), ...base } : defaultOptions(modeId);
  for (const [k, spec] of Object.entries(MULTI_MODES[modeId].options)) {
    if (opts[k] === undefined) continue;
    const v = typeof spec.default === 'number' ? Number(opts[k]) : String(opts[k]);
    if (spec.choices.includes(v)) out[k] = v;
  }
  return out;
}

export function formatOption(spec, v) {
  if (spec.format === 'time') return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
  if (spec.format === 'grid') return `${v}×${v}`;
  if (spec.format === 'difficulty') return DIFFICULTY_LABELS[v] || v;
  if (spec.format === 'tema') return v === 'mistura' ? '🎲 Mistura' : 'Surpresa';
  return String(v);
}

// Casas especiais da Grade Bônus: quantidade cresce com o tamanho da grade.
export function bonusCells(rng, size) {
  const n = { 4: 2, 5: 3, 6: 4 }[size] || 2;
  const cells = rng.shuffle([...Array(size * size).keys()]).slice(0, n);
  return Object.fromEntries(cells.map((c, i) => [c, i % 2 ? '×3' : '×2']));
}

export function bonusMultiplier(path, bonus = {}) {
  let mult = 1;
  for (const i of path || []) {
    if (bonus[i] === '×2') mult *= 2;
    if (bonus[i] === '×3') mult *= 3;
  }
  return mult;
}

/**
 * Pontuação de uma rodada dos modos de grade.
 * Palavras repetidas entre jogadores valem pontos normalmente: ser única ou
 * repetida NÃO muda a pontuação, só aparece nas estatísticas (o "tanque").
 * @param {Object<string, string[]>} byPlayer  palavras válidas de cada jogador
 * @param {(id:string, w:string) => number} pointsOf  pontos de cada palavra (padrão: tabela por tamanho)
 */
export function scoreRound(byPlayer, pointsOf = (_id, w) => wordPoints(w)) {
  const counts = {};
  for (const words of Object.values(byPlayer)) for (const w of new Set(words)) counts[w] = (counts[w] || 0) + 1;
  const players = {};
  for (const [id, words] of Object.entries(byPlayer)) {
    let score = 0, unique = 0, shared = 0;
    const list = [...new Set(words)].map((w) => {
      const pts = pointsOf(id, w);
      const isUnique = counts[w] === 1;
      isUnique ? unique++ : shared++;
      score += pts;
      return { w, pts, status: isUnique ? 'unique' : 'shared', by: counts[w] };
    });
    list.sort((a, b) => b.pts - a.pts || b.w.length - a.w.length || a.w.localeCompare(b.w));
    players[id] = { score, words: list, unique, shared };
  }
  const all = Object.values(counts);
  const totals = { distinct: all.length, unique: all.filter((c) => c === 1).length, shared: all.filter((c) => c > 1).length };
  return { players, counts, totals };
}

// Pontuação do Sudoku Duelo.
export const SUDOKU_DUEL = {
  base: { facil: 1500, medio: 3000, dificil: 5000 },
  podiumBonus: [500, 250, 100],
  errorPenalty: 150,
  cellPoints: 10,
};

export function sudokuDuelScore({ difficulty, done, seconds, errors, filled, place }) {
  if (done) {
    const s = SUDOKU_DUEL.base[difficulty] - Math.round(seconds) * 2 - errors * SUDOKU_DUEL.errorPenalty;
    return Math.max(100, s) + (SUDOKU_DUEL.podiumBonus[place] || 0);
  }
  return Math.max(0, filled * SUDOKU_DUEL.cellPoints - errors * SUDOKU_DUEL.errorPenalty);
}
