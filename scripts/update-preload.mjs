// Aggiorna in index.html l'elenco dei moduli da precaricare: node scripts/update-preload.mjs
// Senza elenco il browser scopre gli import uno alla volta, a cascata; con l'elenco li chiede tutti insieme.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;
export const START = '<!-- moduli da precaricare: generato da scripts/update-preload.mjs -->';
export const END = '<!-- fine moduli -->';

export function moduleGraph(entry = join(ROOT, 'assets/js/main.js')) {
  const seen = new Set();
  const remote = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const m of readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
      const spec = m[1] || m[2];
      if (spec.startsWith('.')) visit(resolve(dirname(file), spec));
      else if (spec.startsWith('https://')) remote.add(spec);
    }
  };
  visit(entry);
  seen.delete(entry);
  return { local: [...seen].map((file) => relative(ROOT, file)).sort(), remote: [...remote] };
}

async function cdnGraph(urls) {
  const seen = new Set();
  const walk = async (url) => {
    if (seen.has(url)) return;
    seen.add(url);
    const text = await (await fetch(url)).text();
    for (const m of text.matchAll(/(?:from|import)\s*"(\/npm\/[^"]+)"/g)) await walk(`https://cdn.jsdelivr.net${m[1]}`);
  };
  for (const url of urls) await walk(url);
  return [...seen];
}

export function preloadBlock(local, cdn) {
  const link = (href) => `    <link rel="modulepreload" href="${href}" />`;
  return [START, ...local.map(link), ...cdn.map(link), `    ${END}`].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { local, remote } = moduleGraph();
  const cdn = await cdnGraph(remote);
  const file = join(ROOT, 'index.html');
  const html = readFileSync(file, 'utf8');
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  if (start < 0 || end < 0) throw new Error('Segnaposto dei moduli non trovato in index.html');
  writeFileSync(file, html.slice(0, start) + preloadBlock(local, cdn) + html.slice(end + END.length));
  console.log(`${local.length} moduli del sito e ${cdn.length} dalla CDN`);
}
