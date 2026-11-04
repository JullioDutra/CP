import { cp, mkdir, rm } from 'node:fs/promises';
await rm('public', { recursive: true, force: true });
await mkdir('public/data', { recursive: true });
for (const file of ['index.html','css','js','data/palavras.txt','data/comuns.txt','data/bloqueadas.txt','data/temas.js','data/mistura.js','manifest.webmanifest','sw.js','icon.svg','icon-192.png','icon-512.png']) {
  await cp(file, `public/${file}`, { recursive: true });
}
console.log('Public game files prepared');
