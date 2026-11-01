// Confere se palavras existem antes de adicioná-las ao jogo (ex.: novos temas).
// Primeiro olha o dicionário; se não estiver lá, pergunta à IA (configure o .env).
//
//   npm run verificar -- abacate zoeira xablau
//   npm run verificar -- --temas           (confere todas as palavras de data/temas.js)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setDictWords, normalize } from '../js/core/dict.js';
import { createVerifier, loadDotEnv } from '../server/ai.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotEnv(path.join(ROOT, '.env'));
const read = (f) => readFileSync(path.join(ROOT, 'data', f), 'utf8').split('\n');
setDictWords(read('palavras.txt'), read('comuns.txt'));

const args = process.argv.slice(2);
let words = args.filter((a) => !a.startsWith('--'));
if (args.includes('--temas')) {
  const { TEMAS } = await import('../data/temas.js');
  words = Object.values(TEMAS).flat();
}
if (!words.length) {
  console.log('Uso: npm run verificar -- palavra1 palavra2 …   |   npm run verificar -- --temas');
  process.exit(1);
}

const verifier = createVerifier({
  cacheFile: path.join(ROOT, 'data', 'runtime', 'ia-cache.json'),
  learnedFile: path.join(ROOT, 'data', 'runtime', 'aprendidas.txt'),
  log: { info() {}, warn: console.warn },
});
if (!verifier.enabled) console.log('⚠️  IA desligada (LLM_BASE_URL vazio): só o dicionário será usado.\n');

let bad = 0;
for (const w of words) {
  const r = await verifier.verify(w);
  const icon = r.ok ? '✅' : r.fonte === 'indisponivel' ? '❔' : '❌';
  if (!r.ok) bad++;
  console.log(`${icon} ${w.padEnd(16)} ${normalize(w).padEnd(14)} ${r.fonte}${r.motivo ? ` — ${r.motivo}` : ''}`);
}
console.log(`\n${words.length - bad}/${words.length} confirmadas.`);
await new Promise((r) => setTimeout(r, 700)); // deixa o cache ser salvo
process.exit(bad ? 2 : 0);
