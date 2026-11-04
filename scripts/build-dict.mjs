// Monta os arquivos do dicionário a partir do Hunspell pt_BR (LibreOffice) e da lista de
// prenomes do IBGE:
//   data/palavras.txt, data/comuns.txt  → listas base (sem nomes próprios e sem bloqueadas)
//   data/formas.txt.gz                   → conjugações, plurais, femininos… (só no servidor)
//   data/bloqueadas.txt                  → palavrões, ofensas, gírias e nomes (nunca valem)
//
// Rodar a partir dos arquivos originais (o script filtra palavras.txt/comuns.txt no lugar):
//   git checkout 6852104 -- data/palavras.txt data/comuns.txt   (listas antes da filtragem)
// Uso: node scripts/build-dict.mjs <pt_BR.dic> <pt_BR.aff> <nomes-censos-ibge.csv>
//   (Debian/Ubuntu: apt install hunspell-pt-br → /usr/share/hunspell/pt_BR.{dic,aff};
//    prenomes: https://github.com/datasets-br/prenomes — data/nomes-censos-ibge.csv)
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const [dicPath = '/usr/share/hunspell/pt_BR.dic', affPath = '/usr/share/hunspell/pt_BR.aff', namesPath] = process.argv.slice(2);
if (!namesPath) { console.error('Informe o CSV de prenomes do IBGE (veja o cabeçalho do script).'); process.exit(1); }
const DATA = new URL('../data/', import.meta.url);
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const playable = (w) => /^[a-z]{3,12}$/.test(w);
const readList = (f) => readFileSync(new URL(f, DATA), 'utf8').split('\n').map((x) => x.trim()).filter(Boolean);

// ---------- regras de afixos ----------
const rules = {};
for (const line of readFileSync(affPath, 'utf8').split('\n')) {
  const p = line.trim().split(/\s+/);
  if ((p[0] !== 'SFX' && p[0] !== 'PFX') || p.length < 4) continue;
  if (!rules[p[1]] && /^[YN]$/.test(p[2])) { rules[p[1]] = { type: p[0], cross: p[2] === 'Y', list: [] }; continue; }
  if (rules[p[1]] && p.length >= 5) {
    rules[p[1]].list.push({
      strip: p[2] === '0' ? '' : p[2],
      add: (p[3] === '0' ? '' : p[3]).split('/')[0],
      re: new RegExp(p[0] === 'SFX' ? `${p[4]}$` : `^${p[4]}`),
    });
  }
}

// ---------- expansão: forma → raízes ----------
const rootsOf = new Map(); // forma (sem acento) -> Set(raízes sem acento)
const formsOf = new Map(); // raiz -> Set(formas)
for (const l of readFileSync(dicPath, 'utf8').split('\n').slice(1)) {
  const [w, f = ''] = l.trim().split('/');
  if (!w || !/^[a-záàâãéêíóôõúüç]+$/.test(w) || f.includes('ý')) continue; // só minúsculas (sem nomes) e sem palavras proibidas
  const flags = [...f];
  const out = [w];
  const sfx = [];
  for (const fl of flags) {
    const r = rules[fl];
    if (r?.type !== 'SFX') continue;
    for (const x of r.list) if (x.re.test(w) && w.endsWith(x.strip)) { const nw = w.slice(0, w.length - x.strip.length) + x.add; out.push(nw); if (r.cross) sfx.push(nw); }
  }
  for (const fl of flags) {
    const r = rules[fl];
    if (r?.type !== 'PFX') continue;
    for (const base of [w, ...(r.cross ? sfx : [])]) for (const x of r.list) if (x.re.test(base) && base.startsWith(x.strip)) out.push(x.add + base.slice(x.strip.length));
  }
  const root = norm(w);
  for (const x of out) {
    const n = norm(x);
    if (!playable(n)) continue;
    if (!rootsOf.has(n)) rootsOf.set(n, new Set());
    rootsOf.get(n).add(root);
    if (!formsOf.has(root)) formsOf.set(root, new Set());
    formsOf.get(root).add(n);
  }
}

// ---------- listas atuais ----------
const palavras = readList('palavras.txt');
const comuns = readList('comuns.txt');
const rank = new Map(comuns.map((w, i) => [w, i]));
const universe = new Set([...palavras, ...comuns, ...rootsOf.keys()]);

// ---------- bloqueio manual (palavrões, ofensas, gírias) ----------
const blocked = new Set();
const manualAll = readList('bloqueio-manual.txt').filter((x) => !x.startsWith('#')).map(norm);
const neverBlock = new Set(manualAll.filter((x) => x.startsWith('+')).map((x) => x.slice(1)));
const manual = manualAll.filter((x) => !x.startsWith('+'));
for (const item of manual) {
  if (item.startsWith('^')) { const pre = item.slice(1); for (const w of universe) if (w.startsWith(pre)) blocked.add(w); continue; }
  blocked.add(item);
  for (const f of formsOf.get(item) || []) blocked.add(f); // todas as formas da raiz
}

for (const w of neverBlock) blocked.delete(w);

// ---------- nomes próprios (prenomes frequentes do IBGE) ----------
// Fica de fora quem é nome de pessoa, a não ser os prenomes que também são palavras comuns
// (lista revisada à mão em data/nomes-que-sao-palavras.txt: rosa, lua, pedra, linda…).
const allowedNames = new Set(readList('nomes-que-sao-palavras.txt').filter((x) => !x.startsWith('#')).flatMap((x) => x.split(/\s+/)).map(norm));
const isCommonWord = (w) => allowedNames.has(w);
const names = new Set();
const csv = readFileSync(namesPath, 'utf8').split('\n').slice(1);
for (const line of csv) {
  const [nome, ...counts] = line.split(',');
  const total = counts.reduce((s, c) => s + (Number(c) || 0), 0);
  const w = norm(nome || '');
  if (total < 1000 || !playable(w) || !universe.has(w)) continue;
  if (!isCommonWord(w)) names.add(w);
}

// ---------- saída ----------
const keep = (w) => !blocked.has(w) && !names.has(w);
const newPalavras = palavras.filter(keep);
const newComuns = comuns.filter(keep);
const base = new Set([...newPalavras, ...newComuns]);
const formas = [...rootsOf.keys()].filter((w) => keep(w) && !base.has(w)).sort();
const bloqueadas = [...new Set([...blocked, ...names])].filter((w) => universe.has(w) || manual.includes(w)).sort();

writeFileSync(new URL('palavras.txt', DATA), newPalavras.join('\n') + '\n');
writeFileSync(new URL('comuns.txt', DATA), newComuns.join('\n') + '\n');
writeFileSync(new URL('formas.txt.gz', DATA), gzipSync(formas.join('\n'), { level: 9 }));
writeFileSync(new URL('bloqueadas.txt', DATA), bloqueadas.join('\n') + '\n');
console.log(`palavras.txt: ${palavras.length} → ${newPalavras.length}`);
console.log(`comuns.txt: ${comuns.length} → ${newComuns.length}`);
console.log(`formas.txt.gz: ${formas.length} formas a mais`);
console.log(`bloqueadas.txt: ${bloqueadas.length} (${names.size} nomes, ${blocked.size} pela lista manual)`);
