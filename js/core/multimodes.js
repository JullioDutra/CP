// Regras dos modos multijogador — compartilhadas entre navegador e servidor.
import { wordPoints } from './letters.js';

export const AVATARS = ['🦊', '🐼', '🐸', '🐙', '🦉', '🐯', '🐨', '🦄', '🐢', '🐝', '🦁', '🐧', '🐳', '🦖', '🐶', '🐱', '🐵', '🦜', '🐞', '🐲'];

// Cor de cada jogador (por ordem de entrada) — usada no caça-palavras e no telão.
export const PLAYER_HUES = [8, 210, 140, 45, 280, 180, 330, 95, 25, 250, 160, 300];

const ROUNDS = { label: 'Rodadas', choices: [1, 2, 3, 4, 5], format: 'plain' };
const DIFFICULTY_LABELS = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' };

export const MULTI_MODES = {
  // ---------- CLÁSSICOS ----------
  'grupo-classico': {
    id: 'grupo-classico',
    game: 'grade',
    category: 'classico',
    name: 'Grade em Grupo',
    icon: '⚡',
    short: 'Palavras repetidas são anuladas',
    rules: [
      'Todos recebem a mesma grade e o mesmo tempo.',
      'Palavras de no mínimo 3 letras; quanto maior, muito mais pontos.',
      'Se duas ou mais pessoas acharem a mesma palavra, ela é ANULADA para todos.',
      'Palavra fora do dicionário? A IA confere se ela existe (✨).',
    ],
    sharedFactor: 0,
    uniqueFactor: 1,
    options: {
      rounds: { ...ROUNDS, default: 3 },
      seconds: { label: 'Tempo', choices: [60, 90, 120, 180], default: 120, format: 'time' },
      size: { label: 'Grade', choices: [4, 5], default: 4, format: 'grid' },
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
      'Todos jogam na MESMA grade 12×12 com 10 palavras de um tema.',
      'Quem marcar a palavra primeiro leva os pontos (10 por letra) e ela fica com a sua cor.',
      'A rodada acaba quando todas forem achadas ou o tempo acabar.',
    ],
    options: {
      rounds: { ...ROUNDS, default: 3 },
      seconds: { label: 'Tempo', choices: [120, 180, 240, 300], default: 180, format: 'time' },
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
  'grupo-amigavel': {
    id: 'grupo-amigavel',
    game: 'grade',
    category: 'novo',
    name: 'Grade Amigável',
    icon: '🤝',
    short: 'Repetidas valem, exclusivas +50%',
    rules: [
      'Todos recebem a mesma grade e o mesmo tempo.',
      'Palavras de no mínimo 3 letras; quanto maior, muito mais pontos.',
      'Palavras repetidas entre jogadores PONTUAM normalmente.',
      'Palavra que só você achou vale +50%. Fora do dicionário, a IA confere (✨).',
    ],
    sharedFactor: 1,
    uniqueFactor: 1.5,
    options: {
      rounds: { ...ROUNDS, default: 3 },
      seconds: { label: 'Tempo', choices: [60, 90, 120, 180], default: 120, format: 'time' },
      size: { label: 'Grade', choices: [4, 5], default: 4, format: 'grid' },
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
  return String(v);
}

/**
 * Pontuação de uma rodada dos modos de grade.
 * @param {string} modeId
 * @param {Object<string, string[]>} byPlayer  palavras válidas de cada jogador
 */
export function scoreRound(modeId, byPlayer) {
  const mode = MULTI_MODES[modeId];
  const counts = {};
  for (const words of Object.values(byPlayer)) for (const w of new Set(words)) counts[w] = (counts[w] || 0) + 1;
  const players = {};
  for (const [id, words] of Object.entries(byPlayer)) {
    let score = 0;
    const list = [...new Set(words)].map((w) => {
      const base = wordPoints(w);
      const unique = counts[w] === 1;
      const factor = unique ? mode.uniqueFactor : mode.sharedFactor;
      const pts = Math.ceil(base * factor);
      score += pts;
      return { w, base, pts, status: unique ? 'unique' : factor === 0 ? 'cancelled' : 'shared' };
    });
    list.sort((a, b) => b.pts - a.pts || b.w.length - a.w.length || a.w.localeCompare(b.w));
    players[id] = { score, words: list };
  }
  return { players, counts };
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
