// Temas visuais desbloqueáveis por conquistas (escolha guardada no aparelho).
import { THEMES } from './achievements.js';

const KEY = 'trama.theme.v2';
const OLD_KEY = 'trama.theme'; // antes de 11/2026 o padrão era lavanda: quem não escolheu outro tema vai para o Claro

export function currentTheme() {
  try {
    const v = localStorage.getItem(KEY);
    if (v) return v;
    const old = localStorage.getItem(OLD_KEY);
    return old && old !== 'lavanda' ? old : 'claro';
  } catch { return 'claro'; }
}

export function applyTheme(key = currentTheme()) {
  if (!THEMES.some((t) => t.key === key)) key = 'claro';
  document.documentElement.dataset.theme = key;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEMES.find((t) => t.key === key).swatch[1];
  try { localStorage.setItem(KEY, key); } catch { /* ignore */ }
}

// Temas liberados a partir das conquistas do perfil.
export function unlockedThemes(achievementKeys = []) {
  const have = new Set(achievementKeys);
  return THEMES.filter((t) => !t.unlock || have.has(t.unlock)).map((t) => t.key);
}
