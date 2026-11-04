// Dicionário de português (sem acentos, 3 a 12 letras). Ver data/README.md para a origem.
//  - palavras.txt: lista grande (dicionário pt_BR do LibreOffice)
//  - comuns.txt:   palavras de uso comum, em ordem de frequência (inclui verbos conjugados)
//  - aprendidas:   palavras confirmadas pela IA durante o jogo (só com servidor)
//  - bloqueadas:  palavrões, ofensas, gírias e nomes próprios — nunca valem (nem pela IA)
//  - formas:      conjugações, plurais, femininos… (só no servidor; ver addForms)
let words = [];
let wordSet = new Set();
let commonRank = new Map();
let blocked = new Set();
let forms = null; // { text, starts } — lista ordenada num texto só (busca binária), só no servidor

export function normalize(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

export const isPlayable = (w) => /^[a-z]{3,12}$/.test(w);

async function fetchList(url, optional = false) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    return (await res.text()).split('\n');
  } catch (e) {
    if (optional) return [];
    throw new Error('Não foi possível carregar o dicionário');
  }
}

export async function loadDict(base = 'data/') {
  if (words.length) return;
  const [all, common, learned, bad] = await Promise.all([
    fetchList(`${base}palavras.txt`),
    fetchList(`${base}comuns.txt`),
    fetchList('api/aprendidas', true),
    fetchList(`${base}bloqueadas.txt`, true),
  ]);
  setBlocked(bad);
  setDictWords(all, common);
  addWords(learned);
}

// Usado também pelo servidor e pelos testes em Node.
export function setDictWords(list, common = []) {
  commonRank = new Map();
  common.forEach((w, i) => {
    w = w.trim();
    if (w && !blocked.has(w) && !commonRank.has(w)) commonRank.set(w, i);
  });
  wordSet = new Set();
  for (const w of [...list, ...common]) {
    const t = w.trim();
    if (t && !blocked.has(t)) wordSet.add(t);
  }
  words = [...wordSet];
}

// Palavras que nunca valem (chamar antes de setDictWords).
export function setBlocked(list) {
  blocked = new Set(list.map((w) => w.trim()).filter((w) => w && !w.startsWith('#')));
}
export const isBlocked = (w) => blocked.has(w);

// Formas flexionadas (servidor): valem como palavra, mas não entram em allWords() —
// as grades continuam iguais no celular e no servidor.
// `text`: palavras em ordem alfabética separadas por \n (data/formas.txt.gz descompactado).
// Guardar como texto + posições gasta ~10× menos memória que um Set com 1,3 milhão de palavras.
export function addForms(text) {
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  forms = { text, starts: Uint32Array.from(starts) };
}

function hasForm(w) {
  if (!forms) return false;
  const { text, starts } = forms;
  let lo = 0, hi = starts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const a = starts[mid];
    const b = mid + 1 < starts.length ? starts[mid + 1] - 1 : text.length;
    const cur = text.slice(a, b);
    if (cur === w) return true;
    if (cur < w) lo = mid + 1; else hi = mid - 1;
  }
  return false;
}

// Acrescenta palavras confirmadas (ex.: pela IA). Retorna quantas eram novas.
// Elas passam a VALER (isWord), mas não entram em allWords(): assim o sorteio das
// grades depende só dos arquivos de dicionário e fica igual no navegador e no servidor.
export function addWords(list) {
  let n = 0;
  for (const raw of list) {
    const w = normalize(raw);
    if (isPlayable(w) && !wordSet.has(w) && !blocked.has(w)) {
      wordSet.add(w);
      n++;
    }
  }
  return n;
}

export const isWord = (w) => !blocked.has(w) && (wordSet.has(w) || hasForm(w));
export const isCommon = (w) => commonRank.has(w);
export const commonRankOf = (w) => commonRank.get(w) ?? Infinity;
export const allWords = () => words; // só o dicionário base (sem as aprendidas)
