// Service worker do Trama: guarda o jogo para abrir rápido e jogar os modos solo sem internet.
// Partidas em grupo, ranking e IA continuam precisando do servidor (não são guardados).
const VERSION = 'trama-v3';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'css/style.css',
  'js/main.js', 'js/core/ui.js', 'js/core/dict.js', 'js/core/letters.js', 'js/core/rng.js', 'js/core/wordgrid.js',
  'js/core/ranking.js', 'js/core/sound.js', 'js/core/sudoku.js', 'js/core/wordsearch.js', 'js/core/multimodes.js',
  'js/core/verify.js', 'js/core/profile.js', 'js/core/solo.js', 'js/core/online-solo.js', 'js/core/leagues.js',
  'js/core/achievements.js', 'js/core/theme.js', 'js/core/achv-toast.js', 'js/core/icons.js', 'js/core/timealert.js', 'js/core/install.js',
  'js/modes/shared-wordlist.js', 'js/modes/classicos/grade.js', 'js/modes/classicos/cacapalavras.js', 'js/modes/classicos/sudoku.js',
  'js/modes/novos/sobrevivencia.js', 'js/modes/novos/diario.js',
  'js/multi/multi.js', 'js/multi/net.js', 'js/multi/wsboard.js', 'js/multi/sudokuduel.js', 'js/multi/reveal.js',
  'js/screens/global.js', 'data/temas.js', 'data/mistura.js', 'data/palavras.txt', 'data/comuns.txt',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Rede primeiro (sempre a versão mais nova); sem internet, usa o que está guardado.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/') || url.pathname.endsWith('/ws')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
