import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DEFAULT_IMAGE, colorPage, previewHtml } from '../../scripts/anteprime.mjs';
import { ACCENT_PALETTE, PREVIEW_PAGES, previewPage } from '../../assets/js/survey-checks.js';

const ROOT = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

test('every palette colour has its own page and an image in assets/img', () => {
  assert.equal(PREVIEW_PAGES.length, ACCENT_PALETTE.length);
  assert.equal(new Set(PREVIEW_PAGES.map((p) => p.page)).size, PREVIEW_PAGES.length);
  for (const { page, image } of [...PREVIEW_PAGES, { page: 'q.html', image: DEFAULT_IMAGE }]) {
    assert.match(page, /^q(-[a-z]+)*\.html$/);
    assert.ok(existsSync(new URL(`assets/img/${image}`, ROOT)), `manca assets/img/${image}: npm run anteprime`);
  }
});

test('the share link uses the page of the palette colour, q.html for any other colour', () => {
  assert.equal(previewPage('#15803d'), 'q-verde.html');
  assert.equal(previewPage('#0F766E'), 'q-verde-acqua.html');
  assert.equal(previewPage('#123456'), 'q.html');
  assert.equal(previewPage(undefined), 'q.html');
});

test('a colour page is q.html with only the preview image changed', () => {
  const html = read('q.html');
  const page = colorPage(html, 'anteprima-verde.png');
  assert.match(page, /<meta property="og:image" content="https:\/\/[^"]+\/assets\/img\/anteprima-verde\.png" \/>/);
  assert.equal(page.replace('anteprima-verde.png', DEFAULT_IMAGE), html);
  assert.throws(() => colorPage('<html></html>', 'anteprima-verde.png'), /anteprima/);
});

test('publishing writes the colour pages next to q.html', () => {
  assert.match(read('.github/workflows/deploy.yml'), /cp index\.html q\.html _site\/\n\s+cp -R assets _site\/\n\s+node scripts\/anteprime\.mjs pagine _site\n/);
});

// Messaging apps read the preview without running JavaScript: every survey of every project, in either language, gets
// these same words, so they name no particular survey and say it in English, the default, and in Italian.
test('the preview of a survey link names no particular survey and speaks English and Italian', () => {
  const html = read('q.html');
  const meta = (attribute, name) => html.match(new RegExp(`<meta ${attribute}="${name}" content="([^"]*)"`))?.[1] ?? null;
  for (const [attribute, name] of [['name', 'description'], ['property', 'og:site_name'], ['property', 'og:title'], ['property', 'og:description'], ['property', 'og:image:alt']]) {
    const value = meta(attribute, name);
    assert.ok(value, name);
    assert.doesNotMatch(value, /nutrizionist/i, name);
  }
  assert.equal(meta('property', 'og:title'), 'Survey · Questionario');
  assert.equal(meta('property', 'og:site_name'), 'Survey · Questionario');
  assert.match(meta('name', 'description'), /^Answers are anonymous.* · Le risposte sono anonime/);
  assert.equal(meta('property', 'og:description'), meta('name', 'description'));
  assert.equal(meta('property', 'og:locale'), 'en_GB');
  assert.equal(meta('property', 'og:locale:alternate'), 'it_IT');
  assert.match(html, /<title>Survey · Questionario<\/title>/);
  assert.doesNotMatch(previewHtml('#15803d'), /nutrizionist/i);
  assert.match(previewHtml('#15803d'), /<h1>Survey<br>Questionario<\/h1>/);
});

test('the image uses the colour and the text colour that reads best on it', () => {
  assert.match(previewHtml('#15803d'), /body\{background:#15803d;color:#ffffff;/);
  assert.match(previewHtml('#f5e663'), /color:#000000;/);
});
