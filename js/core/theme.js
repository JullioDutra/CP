// Temas visuais desbloqueáveis por conquistas (escolha guardada no aparelho).
import { THEMES } from './achievements.js';

const KEY = 'trama.theme';

export function currentTheme() {
  try { return localStorage.getItem(KEY) || 'lavanda'; } catch { return 'lavanda'; }
}

export function applyTheme(key = currentTheme()) {
  if (!THEMES.some((t) => t.key === key)) key = 'lavanda';
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
