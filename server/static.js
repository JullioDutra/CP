// Arquivos que o servidor entrega ao navegador (todo o resto vira index.html).
import path from 'node:path';

export const PUBLIC = ['index.html', 'css/', 'js/', 'data/palavras.txt', 'data/comuns.txt', 'data/temas.js', 'data/mistura.js', 'manifest.webmanifest', 'sw.js', 'icon.svg'];

// O caminho é decodificado e normalizado ANTES da checagem, para que
// "js/..%2f.env" e parecidos nunca saiam da pasta liberada.
export function publicPath(pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return 'index.html'; }
  rel = path.posix.normalize(rel.replace(/\\/g, '/')).replace(/^\/+/, '');
  if (!rel || rel === '.' || rel.split('/').includes('..')) return 'index.html';
  return PUBLIC.some((p) => rel === p || (p.endsWith('/') && rel.startsWith(p))) ? rel : 'index.html';
}
