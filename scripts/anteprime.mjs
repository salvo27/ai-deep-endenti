// Anteprime dei link dei questionari nei messaggi, una per colore della tavolozza.
//   node scripts/anteprime.mjs immagini      rifà le immagini in assets/img con il Chrome del computer
//   node scripts/anteprime.mjs pagine <dir>  scrive in <dir> le copie q-<colore>.html (alla pubblicazione)
// Il codice dopo # non arriva al server, quindi l'anteprima può cambiare solo con la pagina, non con il questionario.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SURVEY_ACCENT } from '../assets/js/schema.js';
import { PREVIEW_PAGES, accentCheck } from '../assets/js/survey-checks.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_IMAGE = 'anteprima-questionario.png';

export function colorPage(html, image) {
  const out = html.replace(`assets/img/${DEFAULT_IMAGE}`, `assets/img/${image}`);
  if (out === html) throw new Error(`q.html non usa assets/img/${DEFAULT_IMAGE} come immagine di anteprima`);
  return out;
}

export function previewHtml(accent) {
  const { onAccent } = accentCheck(accent);
  const tint = (percent) => `color-mix(in srgb, ${accent} ${percent}%, #fff)`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
body{background:${accent};color:${onAccent};display:flex;align-items:center;justify-content:space-between;padding:0 96px;box-sizing:border-box}
.text{max-width:640px}
h1{font-size:68px;line-height:1.08;margin:0 0 28px;font-weight:800;letter-spacing:-0.5px}
p{font-size:32px;line-height:1.35;margin:0;opacity:.92}
.card{width:300px;background:#fff;border-radius:28px;padding:34px 30px;box-shadow:0 20px 50px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:18px}
.bar{height:10px;border-radius:5px;background:${tint(14)};overflow:hidden}.bar span{display:block;width:38%;height:100%;background:${accent}}
.row{display:flex;align-items:center;gap:16px;border:2px solid #dfe3ec;border-radius:14px;padding:16px 18px}
.row.on{border-color:${accent};background:${tint(9)}}
.dot{width:26px;height:26px;border-radius:50%;border:3px solid #9aa1b5;box-sizing:border-box;flex:none}
.on .dot{border-color:${accent};background:radial-gradient(circle,${accent} 45%,transparent 50%)}
.line{height:12px;border-radius:6px;background:#cfd4e3;flex:1}.on .line{background:${tint(45)}}
.btn{margin-top:6px;height:52px;border-radius:14px;background:${accent}}
</style></head><body>
<div class="text"><h1>Ci aiuti con un questionario?</h1><p>Una domanda alla volta, risposte anonime.</p></div>
<div class="card"><div class="bar"><span></span></div>
<div class="row"><div class="dot"></div><div class="line"></div></div>
<div class="row on"><div class="dot"></div><div class="line"></div></div>
<div class="row"><div class="dot"></div><div class="line" style="flex:.7"></div></div>
<div class="btn"></div></div>
</body></html>`;
}

async function writeImages() {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const { color, image } of [{ color: SURVEY_ACCENT, image: DEFAULT_IMAGE }, ...PREVIEW_PAGES]) {
    await page.setContent(previewHtml(color));
    await page.screenshot({ path: join(ROOT, 'assets/img', image) });
  }
  await browser.close();
}

function writePages(dir) {
  const html = readFileSync(join(ROOT, 'q.html'), 'utf8');
  for (const { page, image } of PREVIEW_PAGES) writeFileSync(join(dir, page), colorPage(html, image));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, dir] = process.argv.slice(2);
  if (mode === 'immagini') await writeImages();
  else if (mode === 'pagine' && dir) writePages(resolve(dir));
  else {
    console.error('Uso: node scripts/anteprime.mjs immagini | pagine <cartella>');
    process.exitCode = 1;
  }
}
