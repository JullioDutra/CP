// Dicionário de português (sem acentos, 3 a 12 letras). Ver data/README.md para a origem.
//  - palavras.txt: lista grande (dicionário pt_BR do LibreOffice)
//  - comuns.txt:   palavras de uso comum, em ordem de frequência (inclui verbos conjugados)
//  - aprendidas:   palavras confirmadas pela IA durante o jogo (só com servidor)
let words = [];
let wordSet = new Set();
let commonRank = new Map();

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
  const [all, common, learned] = await Promise.all([
    fetchList(`${base}palavras.txt`),
    fetchList(`${base}comuns.txt`),
    fetchList('api/aprendidas', true),
  ]);
  setDictWords(all, common);
  addWords(learned);
}

// Usado também pelo servidor e pelos testes em Node.
export function setDictWords(list, common = []) {
  commonRank = new Map();
  common.forEach((w, i) => {
    w = w.trim();
    if (w && !commonRank.has(w)) commonRank.set(w, i);
  });
  wordSet = new Set();
  for (const w of [...list, ...common]) {
    const t = w.trim();
    if (t) wordSet.add(t);
  }
  words = [...wordSet];
}

// Acrescenta palavras confirmadas (ex.: pela IA). Retorna quantas eram novas.
export function addWords(list) {
  let n = 0;
  for (const raw of list) {
    const w = normalize(raw);
    if (isPlayable(w) && !wordSet.has(w)) {
      wordSet.add(w);
      words.push(w);
      n++;
    }
  }
  return n;
}

export const isWord = (w) => wordSet.has(w);
export const isCommon = (w) => commonRank.has(w);
export const commonRankOf = (w) => commonRank.get(w) ?? Infinity;
export const allWords = () => words;
