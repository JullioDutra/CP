// Regras dos modos multijogador — compartilhadas entre navegador e servidor.
import { wordPoints } from './letters.js';

export const AVATARS = ['🦊', '🐼', '🐸', '🐙', '🦉', '🐯', '🐨', '🦄', '🐢', '🐝', '🦁', '🐧', '🐳', '🦖', '🐶', '🐱', '🐵', '🦜', '🐞', '🐲'];

export const MULTI_MODES = {
  // CLÁSSICO: palavra encontrada por 2+ jogadores é anulada para todos.
  'grupo-classico': {
    id: 'grupo-classico',
    category: 'classico',
    name: 'Grade em Grupo',
    icon: '⚡',
    short: 'Palavras repetidas são anuladas',
    rules: [
      'Todos recebem a mesma grade e o mesmo tempo.',
      'Palavras de no mínimo 3 letras; quanto maior, muito mais pontos.',
      'Se duas ou mais pessoas acharem a mesma palavra, ela é ANULADA para todos.',
      'Ganha quem somar mais pontos no fim das rodadas.',
    ],
    sharedFactor: 0,
    uniqueFactor: 1,
  },
  // NOVO: todas as palavras pontuam; exclusivas valem +50%.
  'grupo-amigavel': {
    id: 'grupo-amigavel',
    category: 'novo',
    name: 'Grade Amigável',
    icon: '🤝',
    short: 'Repetidas valem, exclusivas +50%',
    rules: [
      'Todos recebem a mesma grade e o mesmo tempo.',
      'Palavras de no mínimo 3 letras; quanto maior, muito mais pontos.',
      'Palavras repetidas entre jogadores PONTUAM normalmente.',
      'Palavra que só você achou vale +50%.',
    ],
    sharedFactor: 1,
    uniqueFactor: 1.5,
  },
};

export const OPTION_CHOICES = {
  rounds: [1, 2, 3, 4, 5],
  seconds: [60, 90, 120, 180],
  size: [4, 5],
};

export const DEFAULT_OPTIONS = { mode: 'grupo-classico', rounds: 3, seconds: 120, size: 4 };

export function sanitizeOptions(opts = {}, base = DEFAULT_OPTIONS) {
  const out = { ...base };
  if (MULTI_MODES[opts.mode]) out.mode = opts.mode;
  for (const k of ['rounds', 'seconds', 'size']) {
    const v = Number(opts[k]);
    if (OPTION_CHOICES[k].includes(v)) out[k] = v;
  }
  return out;
}

/**
 * Calcula a pontuação de uma rodada.
 * @param {string} modeId
 * @param {Object<string, string[]>} byPlayer  palavras válidas de cada jogador
 * @returns {{ players: Object<string, {score:number, words:{w:string, pts:number, base:number, status:'unique'|'shared'|'cancelled'}[]}>, counts: Object<string, number> }}
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
