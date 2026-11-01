// Gera data/mistura.js: palavras comuns variadas (substantivos, verbos, adjetivos…)
// para o Caça-Palavras "Mistura" (sem tema). Fonte: data/comuns.txt (ordem de frequência).
// Uso: node scripts/build-mistura.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const BLOCK = /(sex|porn|puta|merd|cacet|caralh|bost|foder|fod[aeio]|transa|estupr|viad|bicha|lesbic|gay|otari|idiot|imbecil|cretin|vagabund|droga|cocain|maconh|matar|mata[dmrs]|morte|morr|mort[ao]|assassin|suicid|arma|tiro|bala|sangu|cadaver|vadia|prostitu|bund|peit|pinto|penis|vagin|nazis|negr|crioul|macac|gord|feio|feia|burr|estupid|droga|bebad|vomit|nojent|diabo|inferno|demonio|satan|deus|jesus|cristo|igreja|bomba|guerra|terror|nervos|doent|cancer|odio|odeio|bater|briga|soco|chut|preso|prisao|cadeia|policia|crime|ladr|roub)/;

const lines = readFileSync(new URL('../data/comuns.txt', import.meta.url), 'utf8').split('\n').map((w) => w.trim());
const out = [];
const seen = new Set();
for (let i = 80; i < lines.length && out.length < 4000; i++) {
  const w = lines[i];
  if (!/^[a-z]{4,9}$/.test(w) || seen.has(w) || BLOCK.test(w)) continue;
  seen.add(w);
  out.push(w);
}
writeFileSync(new URL('../data/mistura.js', import.meta.url),
  `// Gerado por scripts/build-mistura.mjs a partir de data/comuns.txt (CC BY-SA 4.0). Não edite à mão.\n` +
  `export const MISTURA = ${JSON.stringify(out.join(' '))}.split(' ');\n`);
console.log(out.length, 'palavras');
