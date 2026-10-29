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

// Stile della pagina (fascia colorata, risposte a pillola) con tutto al centro: regge anche il ritaglio quadrato.
export function previewHtml(accent) {
  const { onAccent } = accentCheck(accent);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
body{background:${accent};color:${onAccent};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:44px;text-align:center}
h1{font-size:66px;line-height:1.08;margin:0;font-weight:800;letter-spacing:-0.5px}
.card{width:420px;background:#fff;border-radius:32px;padding:26px;display:flex;flex-direction:column;gap:14px;box-shadow:0 18px 44px rgba(0,0,0,.22)}
.row{height:58px;border-radius:999px;border:2px solid #d9d6ce;background:#faf9f6;display:flex;align-items:center;padding:0 22px;gap:16px}
.line{height:12px;border-radius:6px;background:#d9d6ce;flex:1}
.mark{margin-left:auto;width:26px;height:26px;border-radius:50%;border:3px solid #8a867e;box-sizing:border-box;flex:none}
.on{background:${accent};border-color:${accent}}.on .line{background:${onAccent};opacity:.55}.on .mark{background:${onAccent};border-color:${onAccent}}
</style></head><body>
<h1>Ci aiuti con un<br>questionario?</h1>
<div class="card">
<div class="row"><div class="line" style="flex:.8"></div><div class="mark"></div></div>
<div class="row on"><div class="line"></div><div class="mark"></div></div>
<div class="row"><div class="line" style="flex:.6"></div><div class="mark"></div></div>
</div>
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
