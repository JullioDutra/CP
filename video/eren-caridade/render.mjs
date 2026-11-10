// Gera o MP4 (1080x1920, 30 fps) a partir de index.html, quadro a quadro.
// Uso: node video/eren-caridade/render.mjs [saida.mp4] [--shots=1,10,20]
// Precisa de: playwright (Chromium) e ffmpeg no PATH.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2);
const shots = args.find(a => a.startsWith('--shots='))?.slice(8).split(',').map(Number);
const out = args.find(a => !a.startsWith('--')) || join(here, 'eren-caridade.mp4');
const FPS = 30;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(here, 'index.html')).href + '?render=1');
await page.evaluate(() => document.fonts.ready);
const dur = await page.evaluate(() => window.__dur);

if (shots) {
  for (const t of shots) {
    await page.evaluate(t => window.__seek(t), t);
    await writeFile(join(dirname(out), `shot-${String(t).padStart(3, '0')}.jpg`), await page.screenshot({ type: 'jpeg', quality: 80 }));
  }
  console.log(`duração: ${dur.toFixed(1)} s`);
} else {
  const total = Math.ceil(dur * FPS);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', out],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = 0; f < total; f++) {
    await page.evaluate(t => window.__seek(t), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
    if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
    if (f % 300 === 0) console.log(`${f}/${total}`);
  }
  ff.stdin.end();
  await once(ff, 'close');
  console.log(`pronto: ${out} (${dur.toFixed(1)} s)`);
}
await browser.close();
