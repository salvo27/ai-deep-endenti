import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text, byText } from '../setup/dom.mjs';
import { IDS, ME, XSS, boardItems, item, members } from '../setup/fixtures.mjs';

let api;
let store;
let router;
let app;
let notes;
let notifications;
let original;
let outlet;
let restoreCanvas;

const NOTE = 'cccccccc-0000-4000-8000-000000000001';
const OLD_NOTE = 'cccccccc-0000-4000-8000-000000000002';
const IMG = `${IDS.idea}/11111111-1111-4111-8111-111111111111.jpg`;
const IMG2 = `${IDS.idea}/22222222-2222-4222-8222-222222222222.jpg`;

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  notes = await import('../../assets/js/notes.js');
  notifications = await import('../../assets/js/notifications.js');
  original = { ...api };
  router.clearRoutes();
  app.registerRoutes();
});

beforeEach(async () => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  [
    ...boardItems(),
    item({ id: NOTE, kind: 'note', title: 'Riunione con il mentor', idea_id: IDS.idea, data: { date: '2026-10-20', body: `## Cosa è emerso\n\n- Parlare con **3 clienti**\n\nLavagna:\n\n![lavagna](immagine:${IMG})` } }),
    item({ id: OLD_NOTE, kind: 'note', title: 'Link utili', idea_id: IDS.idea, data: { date: '2026-10-01', body: 'Report ISTAT' } }),
  ].forEach((i) => store.applyItem(i));
  outlet = document.createElement('main');
  document.body.querySelectorAll('dialog, .toasts').forEach((d) => d.remove());
  api.downloadNoteImage = async () => new Blob(['jpeg'], { type: 'image/jpeg' });
  const proto = window.HTMLCanvasElement.prototype;
  const saved = { bitmap: globalThis.createImageBitmap, ctx: proto.getContext, blob: proto.toBlob };
  globalThis.createImageBitmap = async () => ({ width: 3200, height: 1600, close() {} });
  proto.getContext = () => ({ drawImage() {} });
  proto.toBlob = function toBlob(callback) {
    callback(new Blob([`jpeg ${this.width}x${this.height}`], { type: 'image/jpeg' }));
  };
  restoreCanvas = () => Object.assign(globalThis, { createImageBitmap: saved.bitmap }) && Object.assign(proto, { getContext: saved.ctx, toBlob: saved.blob });
  await router.startRouter(outlet, { fallback: app.notFoundView });
});

afterEach(() => {
  router.stopRouter();
  restoreCanvas();
  Object.assign(api, original);
});

async function visit(hash) {
  await router.render(hash);
  await flush(5);
  return text(outlet);
}

test('each idea has an Appunti tab with its notes, newest first', async () => {
  const body = await visit(`#/idea/${IDS.idea}/appunti`);
  const titles = [...outlet.querySelectorAll('.note-card .item-link')].map((a) => a.textContent);
  assert.deepEqual(titles, ['Riunione con il mentor', 'Link utili']);
  assert.match(body, /Parlare con 3 clienti/, 'l\'anteprima è testo semplice');
  assert.doesNotMatch(body, /immagine:/);
  assert.equal(byText(outlet, 'a', 'Nuova nota').getAttribute('href'), `#/nuovo/note?idea=${IDS.idea}`);
  assert.match(text(outlet.querySelector('.tabs')), /Appunti2/);
});

test('a note page renders Markdown with its private images and can be downloaded as a self-contained .md', async () => {
  let downloads = 0;
  api.downloadNoteImage = async (path) => {
    downloads += 1;
    assert.equal(path, IMG);
    return new Blob(['jpeg'], { type: 'image/jpeg' });
  };
  await visit(`#/elemento/${NOTE}`);
  assert.ok(outlet.querySelector('.note-body h4'));
  assert.equal(outlet.querySelector('.note-body strong').textContent, '3 clienti');
  await flush(5);
  const img = outlet.querySelector('img.note-image');
  assert.match(img.getAttribute('src'), /^blob:/);
  assert.equal(img.getAttribute('alt'), 'lavagna');
  const md = await notes.noteToMarkdown(store.getItem(NOTE));
  assert.match(md, /^# Riunione con il mentor\n\nData: 2026-10-20/);
  assert.match(md, /!\[lavagna\]\(data:image\/jpeg;base64,anBlZw==\)/);
  assert.ok(downloads >= 1);
});

test('a missing image is shown as missing, never as a broken link', async () => {
  api.downloadNoteImage = async () => {
    throw new Error('not found');
  };
  store.applyItem({ ...store.getItem(NOTE), version: 2, data: { body: `![schizzo](immagine:${IMG2})` } });
  await visit(`#/elemento/${NOTE}`);
  await flush(5);
  assert.equal(outlet.querySelector('img.note-image'), null);
  assert.match(text(outlet), /Immagine non più disponibile: schizzo/);
});

test('an image is reduced in the browser, uploaded privately and inserted where the cursor is', async () => {
  const uploads = [];
  api.uploadNoteImage = async (path, blob) => uploads.push({ path, blob });
  let created = null;
  api.createItem = async (args) => (created = item({ id: 'cccccccc-0000-4000-8000-000000000009', kind: args.kind, title: args.title, data: args.data, idea_id: args.ideaId }));
  await visit(`#/nuovo/note?idea=${IDS.idea}`);
  const title = outlet.querySelector('.input-title');
  title.value = 'Foto della lavagna';
  title.dispatchEvent(new Event('input'));
  const textarea = outlet.querySelector('textarea.md-input');
  textarea.value = 'Prima\n\nDopo';
  textarea.dispatchEvent(new Event('input'));
  textarea.selectionStart = textarea.selectionEnd = 'Prima\n'.length;
  const input = outlet.querySelector('.md-toolbar input[type="file"][multiple]');
  Object.defineProperty(input, 'files', { value: [new window.File(['x'], 'lavagna.png', { type: 'image/png' })], configurable: true });
  input.dispatchEvent(new Event('change'));
  await flush(10);
  assert.equal(uploads.length, 1);
  assert.match(uploads[0].path, new RegExp(`^${IDS.idea}/[0-9a-f-]{36}\\.jpg$`));
  assert.equal(await uploads[0].blob.text(), 'jpeg 1600x800', 'ridotta a 1600 pixel sul lato lungo');
  assert.match(textarea.value, new RegExp(`^Prima\\n\\n!\\[lavagna\\]\\(immagine:${uploads[0].path}\\)\\n\\nDopo$`));
  assert.match(text(outlet.querySelector('.md-toolbar')), /1 di 20 immagini/);
  byText(outlet, 'button', 'Anteprima').click();
  assert.ok(outlet.querySelector('.md-preview img.note-image'));
  byText(outlet, 'button', 'Crea').click();
  await flush(10);
  assert.equal(created.kind, 'note');
  assert.match(created.data.body, /immagine:/);
});

test('images removed from the text are deleted after saving, if no other note points to them', async () => {
  const asked = [];
  const removed = [];
  api.noteImageOrphans = async (paths) => {
    asked.push(paths);
    return paths;
  };
  api.removeNoteImages = async (paths) => removed.push(...paths);
  api.saveItem = async ({ id, snapshot }) => ({ status: 'ok', item: { ...store.getItem(id), ...snapshot, version: 2 } });
  await visit(`#/modifica/${NOTE}`);
  const textarea = outlet.querySelector('textarea.md-input');
  textarea.value = textarea.value.replace(/!\[lavagna\]\([^)]*\)/, '');
  textarea.dispatchEvent(new Event('input'));
  byText(outlet, 'button', 'Salva').click();
  await flush(10);
  assert.deepEqual(asked, [[IMG]]);
  assert.deepEqual(removed, [IMG]);
});

test('a .md file with embedded images becomes a note with private images', async () => {
  const uploads = [];
  api.uploadNoteImage = async (path) => uploads.push(path);
  const png = 'iVBORw0KGgo=';
  const { title, body } = await notes.markdownToNote(`# Report clienti\n\nTesto\n\n![grafico](data:image/png;base64,${png})\n`, IDS.idea);
  assert.equal(title, 'Report clienti');
  assert.equal(uploads.length, 1);
  assert.equal(body, `Testo\n\n![grafico](immagine:${uploads[0]})\n`);
});

test('the periodic clean-up runs at most every 12 hours and only for who can edit', async () => {
  const removed = [];
  let asked = 0;
  api.noteImageOrphans = async (paths) => {
    asked += 1;
    assert.equal(paths, null);
    return [IMG2];
  };
  api.removeNoteImages = async (paths) => removed.push(...paths);
  localStorage.clear();
  assert.equal(await notes.sweepNoteImages(), 1);
  assert.deepEqual(removed, [IMG2]);
  assert.equal(await notes.sweepNoteImages(), 0, 'la seconda volta aspetta');
  assert.equal(asked, 1);
  localStorage.clear();
  store.setMembers(members().map((m) => (m.user_id === ME ? { ...m, role: 'advisor' } : m)));
  assert.equal(await notes.sweepNoteImages(), 0);
  assert.equal(asked, 1);
});

test('note text and image descriptions never become HTML, and only valid image paths are loaded', async () => {
  let downloads = 0;
  api.downloadNoteImage = async () => {
    downloads += 1;
    return new Blob(['x']);
  };
  store.applyItem({ ...store.getItem(NOTE), version: 3, title: `Nota ${XSS}`, data: { body: `${XSS}\n\n![${XSS}](immagine:../../segreto.jpg)\n\n![esterna](https://example.com/x.png)` } });
  await visit(`#/elemento/${NOTE}`);
  await flush(5);
  assert.equal(document.querySelector('img[src="x"], script'), null);
  assert.equal(outlet.querySelectorAll('img[src^="https:"]').length, 0, 'le immagini esterne non si caricano');
  assert.equal(downloads, 0, 'un percorso non valido non viene scaricato');
});

test('a new note is announced to the others', () => {
  const note = notifications.describeRevision({ id: 1, item_id: NOTE, kind: 'note', op: 'create', title: 'Riunione', author_id: members()[1].user_id, created_at: '2026-10-20T10:00:00Z', changed: [] });
  assert.match(note.text, /ha creato una nota: «Riunione»/);
});
