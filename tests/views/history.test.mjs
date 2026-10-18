import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, byText, text } from '../setup/dom.mjs';
import { IDS, ME, OTHER, boardItems, item, members, revision } from '../setup/fixtures.mjs';

let api;
let store;
let history;
let original;

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  history = await import('../../assets/js/views/history.js');
  original = { ...api };
});

beforeEach(() => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  document.body.querySelectorAll('dialog').forEach((d) => d.remove());
});

afterEach(() => Object.assign(api, original));

const ideaHistory = () => [
  revision({ id: 1, version: 1, op: 'create', status: 'nuova', data: { pitch: 'Pitch', problem: 'Riga 1' }, message: 'prima versione' }),
  revision({ id: 2, version: 2, op: 'update', author_id: OTHER, status: 'validazione', data: { pitch: 'Pitch di prova', problem: 'Riga 1\nRiga 2', technologies: ['XAI'] }, changed: ['status', 'pitch', 'problem', 'technologies'] }),
  revision({ id: 3, version: 3, op: 'delete', author_id: OTHER, status: 'validazione', data: { pitch: 'Pitch di prova', problem: 'Riga 1\nRiga 2', technologies: ['XAI'] } }),
];

test('revision summaries prefer the commit message and otherwise list the changed fields', () => {
  assert.equal(history.revisionSummary(revision({ message: 'aggiornato pitch' })), 'aggiornato pitch');
  assert.equal(history.revisionSummary(revision({ op: 'create' })), 'Prima versione');
  assert.equal(history.revisionSummary(revision({ op: 'delete' })), 'Spostato nel cestino');
  assert.equal(history.revisionSummary(revision({ op: 'restore' })), 'Ripristinato dal cestino');
  assert.equal(history.revisionSummary(revision({ op: 'update', changed: ['status', 'pitch'] })), 'Modificati: stato, in una frase');
  assert.equal(history.revisionSummary(revision({ op: 'update', kind: 'score', changed: ['scores', 'notes'] })), 'Modificati: voti, note');
  assert.equal(history.revisionSummary(revision({ op: 'update', changed: [] })), 'Nessun campo cambiato');
});

test('revisionLine links to the diff of that version', () => {
  const li = history.revisionLine(revision({ version: 4, author_id: OTHER, op: 'revert' }));
  assert.match(text(li), /Bruno ha riportato a una versione precedente/);
  assert.equal(li.querySelector('a.version').getAttribute('href'), `#/diff/${IDS.idea}/4`);
});

test('lineDiffView shows changed lines with context and collapses long unchanged runs', () => {
  const before = Array.from({ length: 20 }, (_, i) => `riga ${i}`).join('\n');
  const after = before.replace('riga 10', 'riga dieci');
  const view = history.lineDiffView(before, after);
  assert.equal(view.querySelectorAll('.diff-add').length, 1);
  assert.equal(view.querySelectorAll('.diff-del').length, 1);
  assert.equal(view.querySelectorAll('.diff-skip').length, 2);
  assert.match(text(view), /righe uguali/);
});

test('diffView renders the changes of a version against the previous one', async () => {
  api.itemHistory = async () => ideaHistory();
  const outlet = document.createElement('main');
  await history.diffView(outlet, { id: IDS.idea, to: '2' });
  const body = text(outlet);
  assert.match(body, /Versione 2 confrontata con la 1/);
  assert.match(body, /Bruno ha modificato/);
  assert.match(body, /In una frase/);
  assert.equal(outlet.querySelectorAll('.change').length, 4);
  assert.equal(outlet.querySelector('.chip-add').textContent, '+ XAI');
  assert.ok(outlet.querySelector('.diff-inline ins'));
  assert.match(text(outlet.querySelector('.diff-stats')), /\+\d+ −\d+/);
});

test('diffView explains archive operations and refuses invalid versions', async () => {
  api.itemHistory = async () => ideaHistory();
  const outlet = document.createElement('main');
  await history.diffView(outlet, { id: IDS.idea, to: '3' });
  assert.match(text(outlet), /spostato nel cestino/);
  await history.diffView(outlet, { id: IDS.idea, to: 'tre' });
  assert.match(text(outlet), /non valida/);
  await history.diffView(outlet, { id: IDS.idea, to: '9' });
  assert.match(text(outlet), /non trovata/);
  api.itemHistory = async () => {
    throw new Error('rete giù');
  };
  await history.diffView(outlet, { id: IDS.idea, to: '1' });
  assert.match(text(outlet), /rete giù/);
});

test('restoring an older version asks for confirmation and calls revert with the current version', async () => {
  const current = store.getItem(IDS.idea);
  store.applyItem(item({ ...current, version: 3 }));
  api.itemHistory = async () => ideaHistory().slice(0, 2).concat(revision({ id: 3, version: 3, op: 'update' }));
  let reverted = null;
  api.revertItem = async (id, to, base) => {
    reverted = { id, to, base };
    return { status: 'ok', item: item({ ...current, version: 4 }) };
  };
  const outlet = document.createElement('main');
  await history.diffView(outlet, { id: IDS.idea, to: '1', from: '0' });
  byText(outlet, 'button', 'Ripristina la versione 1').click();
  await flush();
  byText(document.querySelector('dialog'), 'button', 'Ripristina').click();
  await flush(10);
  assert.deepEqual(reverted, { id: IDS.idea, to: 1, base: 3 });
});

test('advisors do not see the restore button', async () => {
  store.setMembers(members().map((m) => (m.user_id === ME ? { ...m, role: 'advisor' } : m)));
  api.itemHistory = async () => ideaHistory();
  const outlet = document.createElement('main');
  await history.diffView(outlet, { id: IDS.idea, to: '1' });
  assert.equal(byText(outlet, 'button', 'Ripristina'), null);
});

test('itemHistoryView lists versions and shows who wrote what', async () => {
  api.itemHistory = async () => ideaHistory().slice(0, 2);
  const outlet = document.createElement('main');
  await history.itemHistoryView(outlet, { id: IDS.idea });
  assert.equal(outlet.querySelectorAll('tbody tr').length, 2);
  byText(outlet, 'button', 'Chi ha scritto cosa').click();
  const blame = text(outlet);
  assert.match(blame, /Chi ha scritto cosa/);
  assert.match(blame, /Tecnologie/);
  byText(outlet, 'button', 'Confronta le versioni scelte').click();
  assert.equal(location.hash, `#/diff/${IDS.idea}/2/1`);
});

test('logView applies filters from the address and loads more pages', async () => {
  const calls = [];
  api.listRevisions = async (filters) => {
    calls.push(filters);
    if (filters.beforeId) return [revision({ id: 1 })];
    return Array.from({ length: 50 }, (_, i) => revision({ id: 100 - i, author_id: OTHER }));
  };
  const outlet = document.createElement('main');
  const off = history.logView(outlet, {}, new URLSearchParams({ autore: OTHER, tipo: 'idea', idea: 'non-uuid' }));
  await flush(5);
  assert.deepEqual(calls[0], { authorId: OTHER, kind: 'idea', ideaId: null, beforeId: undefined, limit: 50 });
  assert.equal(outlet.querySelectorAll('.log-entry').length, 50);
  byText(outlet, 'button', 'Carica altri').click();
  await flush(5);
  assert.equal(calls[1].beforeId, 51);
  assert.equal(outlet.querySelectorAll('.log-entry').length, 51);
  store.emit('revision', revision({ id: 500, author_id: OTHER }));
  assert.equal(outlet.querySelectorAll('.log-entry').length, 52);
  store.emit('revision', revision({ id: 501, author_id: ME }));
  assert.equal(outlet.querySelectorAll('.log-entry').length, 52, 'filtro autore rispettato');
  off();
});
