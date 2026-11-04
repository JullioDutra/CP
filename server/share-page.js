// Página da prévia do link da sala (/s/ABCD), usada pela Vercel e pelo servidor local.
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Página curta com as informações da sala para a prévia do link; o navegador vai direto para o jogo.
export function sharePage(code, info, origin) {
  const modes = { 'grupo-classico': 'Grade em Grupo', 'corrida-cacapalavras': 'Caça-Palavras Corrida', 'sudoku-duelo': 'Sudoku Duelo', 'grupo-bonus': 'Grade Bônus', 'grupo-combo': 'Grade Combo', 'grupo-letra': 'Letra da Vez', 'grupo-chuva': 'Chuva de Letras', 'arena-sobrevivencia': 'Arena Sobrevivência', times: 'Times' };
  const title = `Sala ${code} no Trama`;
  const desc = info
    ? `${modes[info.mode] || 'Jogo de palavras'} · ${info.players} ${info.players === 1 ? 'jogador' : 'jogadores'}${info.phase === 'lobby' ? ' esperando' : ' jogando'} — toque para entrar`
    : 'Jogo de palavras com os amigos, todo mundo ao mesmo tempo. Toque para entrar.';
  const target = `/?sala=${code}`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(origin)}/icon-512.png"><meta property="og:url" content="${esc(origin)}/s/${code}"><meta name="twitter:card" content="summary">
<meta http-equiv="refresh" content="0;url=${target}"></head><body><script>location.replace(${JSON.stringify(target)})</script>
<p><a href="${target}">Entrar na sala ${code}</a></p></body></html>`;
}
