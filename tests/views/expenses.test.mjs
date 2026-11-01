import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text, byText, typeInto } from '../setup/dom.mjs';
import { ADVISOR, ME, OTHER, XSS, item, members } from '../setup/fixtures.mjs';

let api;
let store;
let router;
let app;
let format;
let notifications;
let original;
let outlet;

const G = 'eeeeeeee-0000-4000-8000-000000000001';
const ARCHIVED = 'eeeeeeee-0000-4000-8000-000000000002';
const M = {
  domain: 'eeeeeeee-1111-4000-8000-000000000001',
  dinner: 'eeeeeeee-1111-4000-8000-000000000002',
  refund: 'eeeeeeee-1111-4000-8000-000000000003',
};
const NEW_ID = 'eeeeeeee-2222-4000-8000-000000000001';

const people = [
  { id: 'a', name: 'Anna', member: ME },
  { id: 'b', name: 'Bruno', member: OTHER },
  { id: 'e', name: 'Elena' },
];

function expenseItems() {
  const movement = (id, title, data, over = {}) =>
    item({ id, kind: 'expense', title, data: { group: G, currency: 'EUR', rate: 1, ...data }, created_at: `${data.date}T10:00:00Z`, ...over });
  return [
    item({ id: G, kind: 'expensegroup', title: 'Costi della startup', data: { currency: 'EUR', people } }),
    item({ id: ARCHIVED, kind: 'expensegroup', title: 'Vecchio gruppo', data: { currency: 'EUR', people }, deleted_at: '2026-10-15T10:00:00Z' }),
    movement(M.domain, 'Dominio', { type: 'spesa', amount: 3000, date: '2026-10-05', paid_by: 'a', split: { mode: 'parti', shares: { a: 1, b: 1, e: 1 } }, category: 'software' }),
    movement(M.dinner, 'Cena con il mentor', { type: 'spesa', amount: 6000, currency: 'USD', rate: 0.9, date: '2026-10-10', paid_by: 'b', split: { mode: 'parti', shares: { a: 1, b: 1 } }, category: 'pasti' }, { created_by: OTHER, updated_by: OTHER }),
    movement(M.refund, 'Rimborso', { type: 'rimborso', amount: 500, date: '2026-10-12', paid_by: 'e', split: { mode: 'parti', shares: { a: 1 } } }),
  ];
}

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  format = await import('../../assets/js/lib/format.js');
  notifications = await import('../../assets/js/notifications.js');
  original = { ...api };
  router.clearRoutes();
  app.registerRoutes();
});

beforeEach(async () => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  expenseItems().forEach((i) => store.applyItem(i));
  localStorage.clear();
  api.listRevisions = async () => [];
  globalThis.fetch = async () => {
    throw new Error('rete non disponibile nei test');
  };
  outlet = document.createElement('main');
  document.body.querySelectorAll('dialog, .toasts').forEach((d) => d.remove());
  await router.startRouter(outlet, { fallback: app.notFoundView });
});

afterEach(() => {
  router.stopRouter();
  Object.assign(api, original);
});

async function visit(hash) {
  await router.render(hash);
  await flush(5);
  return text(outlet);
}

const dialog = () => document.querySelector('dialog');
const footerButton = (label) => [...dialog().querySelectorAll('.modal-actions button')].find((b) => text(b) === label);
const rowIds = () => [...outlet.querySelectorAll('.exp-row')].map((li) => li.dataset.id);

function fakeCreate(calls) {
  api.createItem = async (args) => {
    calls.push(args);
    return item({ id: NEW_ID, kind: args.kind, title: args.title, data: args.data });
  };
}

function choose(select, value) {
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

test('the Spese page lists active groups with their total and my balance', async () => {
  const body = await visit('#/spese');
  const cards = [...outlet.querySelectorAll('.exp-group-card')];
  assert.deepEqual(cards.map((c) => c.dataset.id), [G], 'il gruppo nel cestino non compare');
  assert.equal(cards[0].getAttribute('href'), `#/spese/${G}`);
  assert.match(text(cards[0]), /Anna, Bruno, Elena/);
  assert.match(text(cards[0]), /84,00 € di spese · 3 movimenti/);
  assert.match(text(cards[0]), /Tu: devi 12,00 €/);
  assert.match(body, /Chi ha pagato cosa e chi deve a chi/);
  assert.ok(byText(outlet, 'button', 'Nuovo gruppo'));
});

test('a new group starts with the team members except advisors and opens after creation', async () => {
  const calls = [];
  fakeCreate(calls);
  await visit('#/spese');
  byText(outlet, 'button', 'Nuovo gruppo').click();
  const rows = [...dialog().querySelectorAll('.exp-person-row input')].map((i) => i.value);
  assert.deepEqual(rows, ['Anna', 'Bruno']);
  footerButton('Crea il gruppo').click();
  await flush();
  assert.match(text(dialog().querySelector('.form-error')), /Dai un nome al gruppo/);
  assert.equal(calls.length, 0);
  typeInto(dialog().querySelector('input[placeholder^="Per esempio"]'), 'Trasferta a Milano');
  byText(dialog(), 'button', 'Aggiungi una persona').click();
  footerButton('Crea il gruppo').click();
  await flush();
  assert.match(text(dialog().querySelector('.form-error')), /Ogni persona ha bisogno di un nome/);
  typeInto([...dialog().querySelectorAll('.exp-person-row input')].at(-1), 'Franco');
  footerButton('Crea il gruppo').click();
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, 'expensegroup');
  assert.equal(calls[0].title, 'Trasferta a Milano');
  assert.equal(calls[0].data.currency, 'EUR');
  assert.deepEqual(calls[0].data.people.map((p) => [p.name, p.member || null]), [['Anna', ME], ['Bruno', OTHER], ['Franco', null]]);
  assert.equal(location.hash, `#/spese/${NEW_ID}`);
});

test('movements are listed newest first by day, with converted amounts and what each one means for me', async () => {
  const body = await visit(`#/spese/${G}`);
  assert.deepEqual(rowIds(), [M.refund, M.dinner, M.domain]);
  assert.match(body, /Tu devi 12,00 € · totale spese 84,00 € · la tua parte 37,00 €/);
  const row = (id) => text(outlet.querySelector(`.exp-row[data-id="${id}"]`));
  assert.match(row(M.domain), /Pagato da Anna · Software e servizi online/);
  assert.match(row(M.domain), /Hai anticipato 20,00 €/);
  assert.match(row(M.dinner), /54,00 €/);
  assert.match(row(M.dinner), /60,00/);
  assert.match(row(M.dinner), /La tua parte: 27,00 €/);
  assert.match(row(M.refund), /Elena ha dato a Anna/);
  assert.match(row(M.refund), /Hai ricevuto 5,00 €/);
  assert.ok(outlet.querySelector('a.tab.is-active[href$="' + G + '"]'));
});

test('movements can be filtered by type, person, category and text', async () => {
  await visit(`#/spese/${G}`);
  const select = (label) => outlet.querySelector(`select[aria-label="${label}"]`);
  choose(select('Tipo'), 'rimborso');
  assert.deepEqual(rowIds(), [M.refund]);
  choose(select('Tipo'), '');
  choose(select('Persona'), 'e');
  assert.deepEqual(rowIds(), [M.refund, M.domain]);
  choose(select('Persona'), '');
  choose(select('Categoria'), 'pasti');
  assert.deepEqual(rowIds(), [M.dinner]);
  choose(select('Categoria'), '');
  typeInto(outlet.querySelector('input[type="search"]'), 'DOMINIO');
  assert.deepEqual(rowIds(), [M.domain]);
  typeInto(outlet.querySelector('input[type="search"]'), 'niente');
  assert.match(text(outlet), /Nessun movimento con questi filtri/);
});

test('balances say who receives and who owes, and a transfer can be marked as paid', async () => {
  const calls = [];
  fakeCreate(calls);
  await visit(`#/spese/${G}/saldi`);
  const balance = (id) => text(outlet.querySelector(`.exp-balance-row[data-id="${id}"] .exp-balance`));
  assert.equal(balance('a'), 'deve 12,00 €');
  assert.equal(balance('b'), 'riceve 17,00 €');
  assert.equal(balance('e'), 'deve 5,00 €');
  const transfers = [...outlet.querySelectorAll('.exp-transfer')].map((li) => text(li));
  assert.match(transfers[0], /^Anna dà 12,00 € a Bruno/);
  assert.match(transfers[1], /^Elena dà 5,00 € a Bruno/);
  byText(outlet.querySelector('.exp-transfer'), 'button', 'Segna come pagato').click();
  await flush();
  assert.match(text(dialog()), /Registro un rimborso di 12,00 € da Anna a Bruno/);
  footerButton('Segna come pagato').click();
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, 'expense');
  assert.equal(calls[0].title, 'Rimborso');
  assert.deepEqual(calls[0].data, { group: G, type: 'rimborso', amount: 1200, currency: 'EUR', rate: 1, date: format.dayKey(new Date()), paid_by: 'a', split: { mode: 'parti', shares: { b: 1 } } });
});

test('statistics show totals, the category donut with its table, who paid and the months', async () => {
  await visit(`#/spese/${G}/statistiche`);
  const tiles = [...outlet.querySelectorAll('.stat')].map((t) => [...t.children].map((c) => text(c)).join(' | '));
  assert.equal(tiles[0], 'Totale spese | 84,00 € | 2 spese');
  assert.equal(tiles[1], 'La tua parte | 37,00 € | 44% del totale');
  assert.equal(tiles[2], 'Media a persona | 28,00 € | 3 persone');
  const donut = outlet.querySelector('.exp-donut-svg');
  assert.equal(donut.getAttribute('aria-label'), 'Spese per categoria: Pasti e bar 64%, Software e servizi online 36%');
  assert.equal(donut.querySelectorAll('.exp-c1, .exp-c2').length, 2);
  const cells = (rows) => [...rows].map((row) => [...row.children].map((c) => text(c)).join(' | '));
  assert.deepEqual(cells(outlet.querySelectorAll('.exp-category-table tbody tr')), ['Pasti e bar | 54,00 € | 64%', 'Software e servizi online | 30,00 € | 36%']);
  assert.deepEqual(cells(outlet.querySelectorAll('.exp-paid-row')), ['Anna |  | 30,00 €', 'Bruno |  | 54,00 €', 'Elena |  | 0,00 €']);
  assert.ok(outlet.querySelector('.exp-month-svg[role="img"]'));
});

test('a new expense is split equally among everyone by default and saved with my person as payer', async () => {
  const calls = [];
  fakeCreate(calls);
  await visit(`#/spese/${G}`);
  byText(outlet.querySelector('.page-actions'), 'button', 'Aggiungi').click();
  footerButton('Aggiungi').click();
  await flush();
  assert.match(text(dialog().querySelector('.form-error')), /Scrivi un importo valido/);
  const amount = dialog().querySelector('.exp-amount-input');
  typeInto(amount, '45,5');
  assert.deepEqual([...dialog().querySelectorAll('[data-preview]')].map((el) => text(el)), ['15,17 €', '15,17 €', '15,16 €']);
  footerButton('Aggiungi').click();
  await flush();
  assert.match(text(dialog().querySelector('.form-error')), /Scrivi una descrizione/);
  typeInto(dialog().querySelector('input[placeholder^="Per esempio"]'), 'Hosting');
  choose(byText(dialog(), 'label', 'Categoria').querySelector('select'), 'software');
  footerButton('Aggiungi').click();
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].title, 'Hosting');
  assert.deepEqual(calls[0].data, {
    group: G,
    type: 'spesa',
    amount: 4550,
    currency: 'EUR',
    rate: 1,
    date: format.dayKey(new Date()),
    paid_by: 'a',
    split: { mode: 'parti', shares: { a: 1, b: 1, e: 1 } },
    category: 'software',
  });
  assert.equal(dialog(), null);
});

test('splitting by amounts must add up, and a refund goes from one person to another', async () => {
  const calls = [];
  fakeCreate(calls);
  await visit(`#/spese/${G}`);
  byText(outlet.querySelector('.page-actions'), 'button', 'Aggiungi').click();
  typeInto(dialog().querySelector('input[placeholder^="Per esempio"]'), 'Fiera');
  typeInto(dialog().querySelector('.exp-amount-input'), '100');
  choose(dialog().querySelector('select[aria-label="Come dividere"]'), 'importi');
  const input = (name) => dialog().querySelector(`input[aria-label="Importo di ${name}"]`);
  assert.equal(input('Anna').value, '33,34');
  typeInto(input('Anna'), '50');
  assert.match(text(dialog().querySelector('.exp-left')), /Le parti superano il totale di 16,66 €/);
  typeInto(input('Elena'), '10');
  assert.match(text(dialog().querySelector('.exp-left')), /Restano 6,67 € da dividere/);
  footerButton('Aggiungi').click();
  await flush();
  assert.match(text(dialog().querySelector('.form-error')), /Mancano 6,67 € da dividere/);
  typeInto(input('Elena'), '16,67');
  footerButton('Aggiungi').click();
  await flush();
  assert.deepEqual(calls[0].data.split, { mode: 'importi', shares: { a: 5000, b: 3333, e: 1667 } });

  byText(outlet.querySelector('.page-actions'), 'button', 'Aggiungi').click();
  byText(dialog(), 'button', 'Rimborso').click();
  assert.equal(text(dialog().querySelector('.exp-split')), '', 'un rimborso non si divide');
  assert.equal(dialog().querySelector('select[aria-label="Chi riceve"]').value, 'b');
  typeInto(dialog().querySelector('.exp-amount-input'), '10');
  footerButton('Aggiungi').click();
  await flush();
  assert.equal(calls[1].title, 'Rimborso');
  assert.deepEqual(calls[1].data.split, { mode: 'parti', shares: { b: 1 } });
  assert.equal(calls[1].data.category, undefined);
});

test('a link to a movement opens it for editing and saving keeps its currency and rate', async () => {
  const saves = [];
  api.saveItem = async (args) => {
    saves.push(args);
    return { status: 'ok', item: { ...store.getItem(args.id), ...args.snapshot, version: 2 } };
  };
  await visit(`#/spese/${G}?movimento=${M.dinner}`);
  assert.match(text(dialog().querySelector('.modal-header')), /Modifica movimento/);
  assert.equal(dialog().querySelector('.exp-amount-input').value, '60,00');
  assert.equal(dialog().querySelector('select[aria-label="Valuta"]').value, 'USD');
  assert.match(text(dialog().querySelector('.exp-rate')), /Cambio: 1 USD =.*EUR.*= 54,00 €/);
  footerButton('Salva').click();
  await flush();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].id, M.dinner);
  assert.equal(saves[0].snapshot.data.amount, 6000);
  assert.equal(saves[0].snapshot.data.rate, 0.9);
  assert.equal(saves[0].snapshot.data.currency, 'USD');
});

test('people in some movement cannot be removed and the currency is fixed after the first movement', async () => {
  const saves = [];
  api.saveItem = async (args) => {
    saves.push(args);
    return { status: 'ok', item: { ...store.getItem(args.id), ...args.snapshot, version: 2 } };
  };
  await visit(`#/spese/${G}/gruppo`);
  const removes = [...outlet.querySelectorAll('.exp-person-row button')];
  assert.equal(removes.length, 3);
  assert.ok(removes.every((b) => b.disabled));
  assert.match(removes[0].title, /è in 3 movimenti/);
  assert.ok(outlet.querySelector('.exp-settings select:not([aria-label])').disabled);
  byText(outlet, 'button', 'Aggiungi una persona').click();
  typeInto([...outlet.querySelectorAll('.exp-person-row input')].at(-1), 'Franco');
  byText(outlet, 'button', 'Salva').click();
  await flush();
  assert.equal(saves.length, 1);
  assert.deepEqual(saves[0].snapshot.data.people.map((p) => p.name), ['Anna', 'Bruno', 'Elena', 'Franco']);
  assert.equal(saves[0].snapshot.data.currency, 'EUR');
});

test('advisors see the accounts but cannot change them', async () => {
  store.state.user = { id: ADVISOR };
  store.setMembers(members());
  await visit('#/spese');
  assert.equal(byText(outlet, 'button', 'Nuovo gruppo'), null);
  await visit(`#/spese/${G}`);
  assert.equal(outlet.querySelector('.page-actions button.btn-primary'), null);
  assert.match(text(outlet), /Non sei tra le persone del gruppo/);
  byText(outlet, 'button', 'Cena con il mentor').click();
  const details = Object.fromEntries([...dialog().querySelectorAll('dt')].map((dt) => [text(dt), text(dt.nextElementSibling)]));
  assert.equal(details['Diviso tra'], 'Anna 27,00 €, Bruno 27,00 €');
  assert.equal(details.Importo, '60,00 USD (54,00 € al cambio 0,9)');
  assert.equal(dialog().querySelector('input'), null);
  await visit(`#/spese/${G}/saldi`);
  assert.equal(byText(outlet, 'button', 'Segna come pagato'), null);
});

test('titles and names from the database are shown only as text', async () => {
  store.applyItem(item({ id: G, kind: 'expensegroup', title: `Gruppo ${XSS}`, version: 2, data: { currency: 'EUR', people: [{ id: 'a', name: `Anna ${XSS}`, member: ME }, ...people.slice(1)] } }));
  await visit(`#/spese/${G}/saldi`);
  assert.match(text(outlet), /Gruppo <img/);
  assert.equal(outlet.querySelector('img'), null);
  assert.equal(window.__xss, undefined);
});

test('the bell announces new expenses and refunds with their group and links to them', () => {
  const rev = (id, title) => ({ id: 1, item_id: id, kind: 'expense', op: 'create', title, author_id: OTHER, created_at: '2026-10-20T10:00:00Z', changed: [] });
  const dinner = notifications.describeRevision(rev(M.dinner, 'Cena con il mentor'));
  assert.equal(dinner.text, 'Bruno ha aggiunto la spesa «Cena con il mentor» in «Costi della startup»');
  assert.equal(dinner.href, `#/spese/${G}?movimento=${M.dinner}`);
  assert.equal(notifications.describeRevision(rev(M.refund, 'Rimborso')).text, 'Bruno ha registrato un rimborso in «Costi della startup»');
  const created = notifications.describeRevision({ ...rev(G, 'Costi della startup'), kind: 'expensegroup' });
  assert.equal(created.text, 'Bruno ha creato il gruppo di spese «Costi della startup»');
  assert.equal(created.href, `#/spese/${G}`);
  assert.equal(notifications.describeRevision({ ...rev(M.domain, 'Dominio'), op: 'update' }), null);
});
