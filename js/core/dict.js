// Dicionário de português (sem acentos, 3 a 9 letras). Ver data/README.md para a origem.
let words = null;
let wordSet = null;

export function normalize(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

export async function loadDict(url = 'data/palavras.txt') {
  if (wordSet) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Não foi possível carregar o dicionário');
  const text = await res.text();
  setDictWords(text.split('\n'));
}

// Usado também pelos testes em Node.
export function setDictWords(list) {
  words = list.map((w) => w.trim()).filter(Boolean);
  wordSet = new Set(words);
}

export const isWord = (w) => wordSet.has(w);
export const allWords = () => words;
