import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, text, byText } from '../setup/dom.mjs';
import { italianWords } from '../setup/italian.mjs';
import { ME, item, members } from '../setup/fixtures.mjs';

// Su un dispositivo in inglese: la lingua si decide quando il sito si carica, per questo i moduli arrivano dopo la scelta.
useLanguage('en');

let api;
let store;
let router;
let app;
let equity;
let original;
let outlet;

const CANVAS = 'cccccccc-0000-4000-8000-000000000001';
const EQUITY = 'cccccccc-0000-4000-8000-000000000002';

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  equity = await import('../../assets/js/views/equity.js');
  original = { ...api };
  router.clearRoutes();
  app.registerRoutes();
});

beforeEach(async () => {
  globalThis.__fakeSupabase.reset();
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  api.listRevisions = async () => [];
  outlet = document.createElement('main');
  await router.startRouter(outlet, { fallback: app.notFoundView });
});

afterEach(() => {
  router.stopRouter();
  Object.assign(api, original);
  history.replaceState(null, '', '#/');
});

async function visit(hash) {
  await router.render(hash);
  await flush(5);
  return text(outlet);
}

// Quello che si legge, senza le parti scritte da altri moduli: concetti, campi dello schema, riga della versione
// e il nome predefinito della striscia di schede, che viene da components.js.
const OTHERS = ['.concept-btn', '.team-canvas', '.fields-grid', '.meta-line', '.avatar'];
function leftovers(root) {
  const copy = root.cloneNode(true);
  copy.querySelectorAll(OTHERS.join(',')).forEach((el) => el.remove());
  copy.querySelectorAll('nav.tabs:not(.subtabs)').forEach((nav) => nav.removeAttribute('aria-label'));
  const attributes = [...copy.querySelectorAll('[aria-label],[title],[placeholder]')].flatMap((el) =>
    ['aria-label', 'title', 'placeholder'].map((name) => el.getAttribute(name)).filter(Boolean),
  );
  return italianWords([copy.textContent, ...attributes].join(' '));
}

const factors = [
  { key: 'idea', label: 'Original idea', weight: 5 },
  { key: 'work', label: 'Full time work', weight: 8 },
];
const founders = [
  { id: 'f-anna', name: 'Anna' },
  { id: 'f-bruno', name: 'Bruno' },
];

describe('pagina Squadra in inglese', () => {
  it('intestazione e schede hanno nomi inglesi e indirizzi invariati', async () => {
    const body = await visit('#/squadra');
    assert.equal(text(outlet.querySelector('h1')), 'Team');
    assert.match(body, /The team building the company: who we are, how we work, when we're free, how many hours we give and how we split the equity\./);
    const tabs = [...outlet.querySelectorAll('.tabs .tab')];
    assert.deepEqual(tabs.map(text), ['Team Canvas', 'Equity split', 'Availability', 'Hours worked']);
    assert.deepEqual(tabs.map((a) => a.getAttribute('href')), ['#/squadra/canvas', '#/squadra/quote', '#/squadra/disponibilita', '#/squadra/ore']);
    assert.deepEqual(leftovers(outlet), []);
  });

  it('il Team Canvas vuoto invita a compilarlo, quello compilato si modifica e ha le versioni', async () => {
    let body = await visit('#/squadra/canvas');
    assert.match(body, /To fill in together, in a one-hour session: roles, goals, values and rules written down before you need them\./);
    assert.match(body, /The Team Canvas hasn't been filled in yet\./);
    assert.equal(byText(outlet, 'a', 'Fill in the Team Canvas').getAttribute('href'), '#/nuovo/teamcanvas');
    assert.deepEqual(leftovers(outlet), []);

    store.applyItem(item({ id: CANVAS, kind: 'teamcanvas', title: 'Team Canvas', data: {} }));
    body = await visit('#/squadra/canvas');
    assert.equal(byText(outlet, '.page-actions a', 'Edit').getAttribute('href'), `#/modifica/${CANVAS}`);
    assert.equal(byText(outlet, '.page-actions a', 'Versions').getAttribute('href'), `#/storico/${CANVAS}`);
  });

  it('la divisione delle quote vuota invita a prepararla, quella fatta mostra il risultato', async () => {
    let body = await visit('#/squadra/quote');
    assert.match(body, /A proposal for splitting equity among founders, to discuss openly before setting up the company\./);
    assert.match(body, /Equity hasn't been discussed yet\./);
    assert.equal(byText(outlet, 'a', 'Prepare the equity split').getAttribute('href'), '#/nuovo/equity');
    assert.deepEqual(leftovers(outlet), []);

    store.applyItem(item({ id: EQUITY, kind: 'equity', title: 'Equity', data: { factors, founders, scores: { 'idea:f-anna': 10, 'work:f-anna': 5, 'idea:f-bruno': 0, 'work:f-bruno': 5 } } }));
    body = await visit('#/squadra/quote');
    assert.match(body, /Equity proposed with the Demmler method/);
    assert.match(body, /The calculation is a starting point for discussion, not an agreement: the split must be put in writing with a notary or a lawyer, together with the vesting\./);
    const heads = [...outlet.querySelectorAll('.table thead th')].map(text);
    assert.deepEqual(heads, ['Factor', 'Weight', 'Anna', 'Bruno']);
    assert.match(text(outlet.querySelector('.equity-bars')), /Anna.*Bruno/);
    assert.deepEqual(leftovers(outlet), []);
  });
});

describe('divisione delle quote in inglese', () => {
  it('senza fondatori o senza punteggi dice cosa manca', () => {
    let view = equity.equityView({ kind: 'equity', data: { factors, founders: [], scores: {} }, version: 1 });
    assert.match(text(view), /Add the founders to calculate the equity\./);
    view = equity.equityView({ kind: 'equity', data: { factors, founders, scores: {} }, version: 1 });
    assert.match(text(view), /Give the scores to calculate the equity\./);
    assert.equal(view.querySelectorAll('.table tbody td')[1].textContent, '-', 'un punteggio mancante resta un trattino');
  });

  it('l editor dà un nome a fondatori, pesi e punteggi', () => {
    const working = { data: { factors: structuredClone(factors), founders: [...structuredClone(founders), { id: 'f-new', name: '' }], scores: {} } };
    let changes = 0;
    const editor = equity.equityEditor(working, () => changes++);
    const titles = [...editor.querySelectorAll('.form-group-title')].map(text);
    assert.deepEqual(titles, ['Founders', 'Weights and scores', 'Result']);
    assert.match(text(editor), /For each factor: how much it weighs for this startup \(0-10\) and how much each person contributes \(0-10\)\./);
    const name = editor.querySelector('.edit-row input');
    assert.equal(name.getAttribute('placeholder'), 'Founder name');
    assert.equal(name.getAttribute('aria-label'), 'Founder name');
    const removes = [...editor.querySelectorAll('.edit-row .icon-btn')].map((b) => b.getAttribute('aria-label'));
    assert.deepEqual(removes, ['Remove Anna', 'Remove Bruno', 'Remove founder']);
    assert.ok(byText(editor, 'button', 'Add a founder'));
    const heads = [...editor.querySelectorAll('.equity-table thead th')].map(text);
    assert.deepEqual(heads, ['Factor', 'Weight (0-10)', 'Anna', 'Bruno', 'No name']);
    const row = editor.querySelector('.equity-table tbody tr');
    assert.equal(row.querySelector('th input').getAttribute('aria-label'), 'Factor name');
    assert.equal(row.querySelectorAll('td input')[0].getAttribute('aria-label'), 'Weight of Original idea');
    assert.equal(row.querySelectorAll('td input')[1].getAttribute('aria-label'), 'Anna: Original idea');
    assert.match(text(editor), /Give the scores to calculate the equity\./);
    assert.deepEqual(leftovers(editor), []);

    const input = row.querySelectorAll('td input')[1];
    input.value = '7';
    input.dispatchEvent(new window.Event('input'));
    assert.equal(working.data.scores['idea:f-anna'], 7);
    assert.equal(changes, 1);
    assert.match(text(editor), /100%/);
  });
});
