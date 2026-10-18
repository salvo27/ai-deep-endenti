import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, byText } from '../setup/dom.mjs';
import { XSS } from '../setup/fixtures.mjs';

let dom;
let icons;

before(async () => {
  setupDom();
  dom = await import('../../assets/js/lib/dom.js');
  icons = await import('../../assets/js/lib/icons.js');
});

test('h renders user text as text, never as HTML', () => {
  const el = dom.h('div', null, XSS, 42, null, false, [' fine']);
  assert.equal(el.querySelector('img'), null);
  assert.equal(el.textContent, `${XSS}42 fine`);
});

test('h refuses innerHTML and neutralizes dangerous links', () => {
  assert.throws(() => dom.h('div', { innerHTML: '<b>x</b>' }), /innerHTML/);
  assert.equal(dom.h('a', { href: 'javascript:alert(1)' }).getAttribute('href'), '#');
  assert.equal(dom.h('a', { href: ' JaVaScRiPt:alert(1)' }).getAttribute('href'), '#');
  assert.equal(dom.h('a', { href: 'data:text/html,<script>' }).getAttribute('href'), '#');
  assert.equal(dom.h('a', { href: '#/idea/1' }).getAttribute('href'), '#/idea/1');
  assert.equal(dom.h('a', { href: 'https://doi.org/10.3390/nu18132183' }).getAttribute('href'), 'https://doi.org/10.3390/nu18132183');
  assert.equal(dom.h('img', { src: 'data:image/svg+xml;utf-8,<svg/>' }).getAttribute('src'), 'data:image/svg+xml;utf-8,<svg/>');
});

test('h sets styles through CSSOM so the Content Security Policy can forbid inline styles', () => {
  const el = dom.h('span', { style: { width: '10px', '--value': '40%' }, class: ['a', false, 'b'], dataset: { id: 'x' }, disabled: true });
  assert.equal(el.getAttribute('style').includes('width: 10px'), true);
  assert.equal(el.style.getPropertyValue('--value'), '40%');
  assert.equal(el.className, 'a b');
  assert.equal(el.dataset.id, 'x');
  let clicks = 0;
  const button = dom.h('button', { onClick: () => clicks++ });
  button.click();
  assert.equal(clicks, 1);
});

test('confirmDialog resolves true only on the confirm button', async () => {
  const pending = dom.confirmDialog('Sicuro?', { okLabel: 'Sì, procedi', danger: true });
  await flush();
  byText(document, 'button', 'Sì, procedi').click();
  assert.equal(await pending, true);
  const cancelled = dom.confirmDialog('Sicuro?');
  await flush();
  byText(document, 'button', 'Annulla').click();
  assert.equal(await cancelled, false);
  const closed = dom.confirmDialog('Sicuro?');
  await flush();
  document.querySelector('dialog [aria-label="Chiudi"]').click();
  assert.equal(await closed, false);
  assert.equal(document.querySelectorAll('dialog').length, 0);
});

test('promptDialog returns the typed value or null', async () => {
  const pending = dom.promptDialog({ title: 'Nome', label: 'Nome', value: 'Riga' });
  await flush();
  document.querySelector('dialog input').value = 'Nuova riga';
  byText(document, 'button', 'Conferma').click();
  assert.equal(await pending, 'Nuova riga');
});

test('a modal action can keep the dialog open', async () => {
  let attempts = 0;
  dom.openModal({ title: 'T', body: 'b', actions: [{ label: 'Prova', onClick: async () => ++attempts < 2 }] });
  byText(document, 'button', 'Prova').click();
  await flush();
  assert.equal(document.querySelectorAll('dialog').length, 1);
  byText(document, 'button', 'Prova').click();
  await flush();
  assert.equal(document.querySelectorAll('dialog').length, 0);
});

test('busy prevents double submissions', async () => {
  const button = dom.h('button');
  let runs = 0;
  let release;
  const handler = dom.busy(button, () => new Promise((r) => { runs++; release = r; }));
  handler();
  handler();
  assert.equal(runs, 1);
  assert.equal(button.disabled, true);
  release();
  await flush();
  assert.equal(button.disabled, false);
});

test('toast shows a status message', () => {
  dom.toast('Salvato', { type: 'success', timeout: 10 });
  assert.equal(document.querySelector('.toasts').getAttribute('role'), 'status');
  assert.match(document.querySelector('.toast-success').textContent, /Salvato/);
});

test('every icon renders as an inline SVG', () => {
  for (const name of icons.ICON_NAMES) {
    const svg = icons.icon(name);
    assert.equal(svg.tagName.toLowerCase(), 'svg', name);
    assert.ok(svg.children.length > 0, name);
  }
  assert.ok(icons.icon('inesistente').children.length > 0);
});

test('a modal without actions adds no stray text such as "null"', () => {
  const modal = dom.openModal({ title: 'Prova', body: dom.h('p', null, 'Corpo') });
  const strayText = [...modal.dialog.childNodes].filter((n) => n.nodeType === 3);
  assert.equal(strayText.length, 0);
  assert.doesNotMatch(modal.dialog.textContent, /null|undefined/);
  modal.close();
});

test('mount skips empty children instead of printing them', () => {
  const host = dom.h('div');
  dom.mount(host, 'a', null, undefined, false, dom.h('span', null, 'b'));
  assert.equal(host.textContent, 'ab');
});
