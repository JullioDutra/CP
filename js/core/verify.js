// Confere uma palavra: primeiro no dicionário local; se não estiver, pergunta ao
// servidor, que consulta a IA (quando configurada). Sem servidor, só o dicionário vale.
import { isWord, addWords } from './dict.js';

export async function checkWord(w) {
  if (isWord(w)) return { ok: true, fonte: 'dicionario' };
  try {
    const res = await fetch(`api/palavra/${encodeURIComponent(w)}`);
    if (!res.ok) return { ok: false, fonte: 'indisponivel' };
    const r = await res.json();
    if (r.ok) addWords([w]);
    return r;
  } catch {
    return { ok: false, fonte: 'indisponivel' };
  }
}
