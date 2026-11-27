import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, text, byText } from '../setup/dom.mjs';

// On a device in English: the language is decided when the site loads, so the modules are imported after the choice.
useLanguage('en');
setupDom();
const { h, openModal, confirmDialog, promptDialog } = await import('../../assets/js/lib/dom.js');
const { resizePhoto } = await import('../../assets/js/lib/photo.js');
const { language } = await import('../../assets/js/i18n/index.js');

const dialog = () => document.querySelector('dialog');
const buttons = (el) => [...el.querySelectorAll('footer button')].map((b) => text(b));

describe('finestre in inglese', () => {
  beforeEach(() => document.body.querySelectorAll('dialog').forEach((d) => d.remove()));

  it('il sito è in inglese', () => {
    assert.equal(language, 'en');
  });

  it('la conferma si intitola Confirm e ha Cancel e Confirm', async () => {
    const answer = confirmDialog('Delete it?');
    await flush();
    assert.equal(text(dialog().querySelector('h2')), 'Confirm');
    assert.deepEqual(buttons(dialog()), ['Cancel', 'Confirm']);
    byText(dialog(), 'button', 'Cancel').click();
    assert.equal(await answer, false);
  });

  it('la conferma tiene il titolo e il pulsante che le si danno', async () => {
    const answer = confirmDialog('Archive it?', { title: 'Archive', okLabel: 'Archive', danger: true });
    await flush();
    assert.equal(text(dialog().querySelector('h2')), 'Archive');
    assert.deepEqual(buttons(dialog()), ['Cancel', 'Archive']);
    dialog().querySelector('.btn-danger').click();
    assert.equal(await answer, true);
  });

  it('la richiesta di un testo ha Cancel e Confirm', async () => {
    const answer = promptDialog({ title: 'Name', label: 'Name' });
    await flush();
    assert.deepEqual(buttons(dialog()), ['Cancel', 'Confirm']);
    dialog().querySelector('input').value = 'Solar drones';
    byText(dialog(), 'button', 'Confirm').click();
    assert.equal(await answer, 'Solar drones');
  });

  it('una finestra senza titolo si chiama Window e la croce dice Close', () => {
    const { dialog: el, close } = openModal({ body: 'Hello' });
    assert.equal(el.getAttribute('aria-label'), 'Window');
    assert.equal(el.querySelector('.modal-header .icon-btn').getAttribute('aria-label'), 'Close');
    close();
    assert.equal(openModal({ title: 'Report', body: 'x' }).dialog.getAttribute('aria-label'), 'Report');
  });

  it('innerHTML è rifiutato con un messaggio per chi sviluppa, in inglese', () => {
    assert.throws(() => h('div', { innerHTML: '<b>x</b>' }), /innerHTML is not allowed/);
    assert.throws(() => h('div', { outerHTML: '<b>x</b>' }), /outerHTML is not allowed/);
  });
});

describe('foto ridotte nel browser, errori in inglese', () => {
  const proto = window.HTMLCanvasElement.prototype;
  const saved = { bitmap: globalThis.createImageBitmap, ctx: proto.getContext, url: proto.toDataURL };
  const MB = 1024 * 1024;
  const image = (size = 10) => ({ type: 'image/jpeg', size });
  const SMALL = `data:image/jpeg;base64,${'A'.repeat(400)}`;

  beforeEach(() => {
    globalThis.createImageBitmap = async () => ({ width: 400, height: 300, close() {} });
    proto.getContext = () => ({ drawImage() {} });
    proto.toDataURL = () => SMALL;
  });

  afterEach(() => {
    globalThis.createImageBitmap = saved.bitmap;
    proto.getContext = saved.ctx;
    proto.toDataURL = saved.url;
  });

  for (const [name, file] of [
    ['nessun file', null],
    ['un PDF', { type: 'application/pdf', size: 10 }],
    ['un file senza tipo', { type: '', size: 10 }],
  ]) {
    it(`${name} chiede un'immagine JPEG, PNG o WebP`, async () => {
      await assert.rejects(resizePhoto(file), { message: 'Choose a JPEG, PNG or WebP image.' });
    });
  }

  it('fino a 15 MB l immagine passa, un byte in più è troppo grande', async () => {
    assert.equal(await resizePhoto(image(15 * MB)), SMALL);
    await assert.rejects(resizePhoto(image(15 * MB + 1)), { message: 'The image is too large: 15 MB at most.' });
  });

  it('un formato che il browser non legge lo dice', async () => {
    globalThis.createImageBitmap = async () => {
      throw new Error('bad');
    };
    await assert.rejects(resizePhoto(image()), { message: 'Unsupported format: use a JPEG, PNG or WebP image.' });
  });

  it('un browser senza disegno lo dice', async () => {
    proto.getContext = () => null;
    await assert.rejects(resizePhoto(image()), { message: 'The browser cannot process the image.' });
  });

  it('se nemmeno la qualità più bassa basta lo dice', async () => {
    proto.toDataURL = () => `data:image/jpeg;base64,${'A'.repeat(200000)}`;
    await assert.rejects(resizePhoto(image()), { message: 'I cannot make the image small enough.' });
  });
});
