import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { italianWords } from '../setup/italian.mjs';
import { setupDom, flush, text, typeInto } from '../setup/dom.mjs';
import { ADVISOR, ME, OTHER, item, members } from '../setup/fixtures.mjs';

// Su un dispositivo in inglese: la lingua si decide quando il sito si carica, quindi i moduli si importano dopo.
useLanguage('en');

let api;
let store;
let router;
let app;
let format;
let original;
let outlet;

const G = 'eeeeeeee-0000-4000-8000-000000000001';
const ARCHIVED = 'eeeeeeee-0000-4000-8000-000000000002';
const EVEN = 'eeeeeeee-0000-4000-8000-000000000003';
const EMPTY = 'eeeeeeee-0000-4000-8000-000000000004';
const MISSING = 'eeeeeeee-0000-4000-8000-0000000000ff';
const M = {
  domain: 'eeeeeeee-1111-4000-8000-000000000001',
  dinner: 'eeeeeeee-1111-4000-8000-000000000002',
  refund: 'eeeeeeee-1111-4000-8000-000000000003',
};
const NEW_ID = 'eeeeeeee-2222-4000-8000-000000000001';
const RECEIPT = `${G}/22222222-2222-4222-8222-222222222222.jpg`;

const people = [
  { id: 'a', name: 'Anna', member: ME },
  { id: 'b', name: 'Bruno', member: OTHER, pay: 'IT60X0542811101000000123456' },
  { id: 'e', name: 'Elena' },
];

// Dati scritti in inglese: tutto quello che resta in italiano viene dal sito, non dai dati.
function expenseItems() {
  const movement = (id, group, title, data, over = {}) =>
    item({ id, kind: 'expense', title, data: { group, currency: 'EUR', rate: 1, ...data }, created_at: `${data.date}T10:00:00Z`, ...over });
  const alone = (n, category, amount) =>
    movement(`eeeeeeee-3333-4000-8000-00000000000${n}`, EVEN, `Lunch ${n}`, { type: 'spesa', amount, date: `2026-10-0${n}`, paid_by: 'a', split: { mode: 'parti', shares: { a: 1 } }, category });
  return [
    item({ id: G, kind: 'expensegroup', title: 'Startup costs', data: { currency: 'EUR', people } }),
    item({ id: ARCHIVED, kind: 'expensegroup', title: 'Old group', data: { currency: 'EUR', people }, deleted_at: '2026-10-15T10:00:00Z' }),
    item({ id: EVEN, kind: 'expensegroup', title: 'Team lunches', data: { currency: 'EUR', people } }),
    item({ id: EMPTY, kind: 'expensegroup', title: 'Conference', data: { currency: 'EUR', people } }),
    movement(M.domain, G, 'Domain', { type: 'spesa', amount: 3000, date: '2026-10-05', paid_by: 'a', split: { mode: 'parti', shares: { a: 1, b: 1, e: 1 } }, category: 'software', receipt: RECEIPT }),
    movement(M.dinner, G, 'Dinner with the mentor', { type: 'spesa', amount: 6000, currency: 'USD', rate: 0.9, date: '2026-10-10', paid_by: 'b', split: { mode: 'parti', shares: { a: 1, b: 1 } }, category: 'pasti' }, { created_by: OTHER, updated_by: OTHER }),
    movement(M.refund, G, 'Refund', { type: 'rimborso', amount: 500, date: '2026-10-12', paid_by: 'e', split: { mode: 'parti', shares: { a: 1 } } }),
    alone(1, 'software', 400),
    alone(2, 'viaggi', 300),
    alone(3, 'pasti', 200),
    alone(4, 'eventi', 100),
    movement('eeeeeeee-3333-4000-8000-000000000005', EVEN, 'Grant', { type: 'entrata', amount: 1000, date: '2026-10-05', paid_by: 'a', split: { mode: 'parti', shares: { a: 1 } } }),
  ];
}

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  format = await import('../../assets/js/lib/format.js');
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
  api.downloadNoteImage = async () => {
    throw new Error('no network in the tests');
  };
  api.noteImageOrphans = async () => [];
  globalThis.fetch = async () => {
    throw new Error('no network in the tests');
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

const dialogs = () => [...document.querySelectorAll('dialog')];
const dialog = () => dialogs()[0] || null;
const lastDialog = () => dialogs().at(-1) || null;
const toasts = () => text(document.querySelector('.toasts'));
const named = (root, selector, label) => [...root.querySelectorAll(selector)].find((el) => text(el) === label) || null;
const buttonNamed = (root, label) => named(root, 'button', label);
const footer = (d = dialog()) => [...d.querySelectorAll('.modal-actions button')].map((b) => text(b));
const fieldLabels = (root) => [...root.querySelectorAll('.field-label')].map((el) => text(el)).filter(Boolean);
const options = (select) => [...select.options].map((o) => text(o));
const fieldSelect = (root, label) => [...root.querySelectorAll('label.field')].find((l) => text(l.querySelector('.field-label')) === label)?.querySelector('select');
const row = (id) => text(outlet.querySelector(`.exp-row[data-id="${id}"]`));

function choose(select, value) {
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

// Le parole italiane rimaste in quello che si vede e in quello che leggono i lettori di schermo. Il link Indietro e
// la crocetta delle finestre vengono dai componenti comuni, tradotti a parte.
function leftovers(root) {
  const clone = root.cloneNode(true);
  clone.querySelectorAll('.back-link, .modal-header > button').forEach((el) => el.remove());
  const attributes = [clone, ...clone.querySelectorAll('*')].flatMap((el) =>
    ['placeholder', 'aria-label', 'title', 'alt'].map((name) => el.getAttribute?.(name)).filter(Boolean),
  );
  return italianWords([text(clone), ...attributes].join(' \n '));
}

function fakeCreate(calls) {
  api.createItem = async (args) => {
    calls.push(args);
    return item({ id: NEW_ID, kind: args.kind, title: args.title, data: args.data });
  };
}

function fakeSave(saves) {
  api.saveItem = async (args) => {
    saves.push(args);
    return { status: 'ok', item: { ...store.getItem(args.id), ...args.snapshot, version: store.getItem(args.id).version + 1 } };
  };
}

function fakeDelete(deletes) {
  api.deleteItem = async (id, baseVersion, message) => {
    deletes.push({ id, message });
    return { status: 'ok', item: { ...store.getItem(id), version: baseVersion + 1, deleted_at: '2026-10-20T10:00:00Z' } };
  };
}

describe('pagina delle spese in inglese', () => {
  it('elenca i gruppi attivi con il totale e il mio saldo', async () => {
    await visit('#/spese');
    assert.equal(text(outlet.querySelector('h1')), 'Expenses');
    assert.equal(text(outlet.querySelector('.page-subtitle')), 'Who paid for what and who owes whom.');
    assert.ok(buttonNamed(outlet, 'New group'));
    const card = (id) => text(outlet.querySelector(`.exp-group-card[data-id="${id}"]`));
    assert.equal(outlet.querySelector(`.exp-group-card[data-id="${ARCHIVED}"]`), null, 'il gruppo nel cestino non compare');
    assert.match(card(G), /Anna, Bruno, Elena/);
    assert.match(card(G), /€84\.00 spent · 3 transactions/);
    assert.match(card(G), /You owe €12\.00/);
    assert.match(card(G), /Last transaction: 12 Oct 2026/);
    assert.match(card(EVEN), /€10\.00 spent · 5 transactions/);
    assert.match(card(EVEN), /You're settled up/);
    assert.match(card(EMPTY), /€0\.00 spent · 0 transactions/);
    assert.doesNotMatch(card(EMPTY), /Last transaction/);
    assert.deepEqual(leftovers(outlet), []);
  });

  it('senza gruppi propone di creare il primo', async () => {
    store.resetStore();
    store.state.user = { id: ME };
    store.setMembers(members());
    await visit('#/spese');
    assert.match(text(outlet.querySelector('.empty')), /^No expense groups yet\. Create one for each occasion: the startup costs, a work trip, an event\./);
    assert.ok(named(outlet, '.empty .btn', 'Create the first group'));
    assert.deepEqual(leftovers(outlet), []);
  });

  it('un nuovo gruppo si crea con testi, errori e messaggio della cronologia in inglese', async () => {
    const calls = [];
    fakeCreate(calls);
    await visit('#/spese');
    buttonNamed(outlet, 'New group').click();
    const d = dialog();
    assert.equal(text(d.querySelector('.modal-header h2')), 'New expense group');
    assert.deepEqual(fieldLabels(d), ['Group name', 'Group currency', 'People', 'Notes']);
    assert.match(text(d), /Balances and statistics are in this currency\. Expenses can be in other currencies too\./);
    assert.match(text(d), /People without an account are added by name only\. “How to pay me” shows up in Balances/);
    const currency = d.querySelector('.form-grid select:not([aria-label])');
    assert.deepEqual(options(currency).slice(0, 3), ['EUR, Euro', 'USD, US dollar', 'GBP, British pound']);
    assert.deepEqual(footer(d), ['Cancel', 'Create the group']);
    assert.deepEqual([...d.querySelectorAll('.exp-person-name-input')].map((i) => [i.value, i.getAttribute('aria-label')]), [['Anna', 'Name of person 1'], ['Bruno', 'Name of person 2']]);
    assert.equal(d.querySelector('select[aria-label="Account for Anna"]').options[0].textContent, 'No account');
    assert.equal(d.querySelector('input[aria-label="How to pay Anna"]').placeholder, 'How to pay me: IBAN or PayPal link');
    assert.deepEqual(leftovers(d), []);

    buttonNamed(d, 'Create the group').click();
    await flush();
    assert.equal(text(d.querySelector('.form-error')), 'Give the group a name.');
    typeInto(d.querySelector('input[placeholder="For example: Startup costs"]'), 'Trip to Milan');
    assert.equal(d.querySelector('textarea').placeholder, 'Optional: what the group is for, how you pay each other back');

    for (const name of ['Anna', 'Bruno']) {
      const remove = d.querySelector(`button[aria-label="Remove ${name}"]`);
      assert.equal(remove.title, 'Remove from the group');
      remove.click();
    }
    assert.match(text(d.querySelector('.exp-people')), /^Nobody yet: add the people who share the expenses\./);
    buttonNamed(d, 'Create the group').click();
    await flush();
    assert.equal(text(d.querySelector('.form-error')), 'Add at least one person.');
    buttonNamed(d, 'Add the team members (2)').click();
    assert.deepEqual([...d.querySelectorAll('.exp-person-name-input')].map((i) => i.value), ['Anna', 'Bruno']);

    buttonNamed(d, 'Add a person').click();
    assert.ok(d.querySelector('select[aria-label="Account for person 3"]'));
    assert.ok(d.querySelector('button[aria-label="Remove this person"]'));
    buttonNamed(d, 'Create the group').click();
    await flush();
    assert.equal(text(d.querySelector('.form-error')), 'Every person needs a name.');
    typeInto([...d.querySelectorAll('.exp-person-name-input')].at(-1), 'Franco');
    const pay = [...d.querySelectorAll('.exp-person-pay-input')].at(-1);
    typeInto(pay, 'IT60 X054 2811 1010 0000 0123 457');
    buttonNamed(d, 'Create the group').click();
    await flush();
    assert.equal(text(d.querySelector('.form-error')), "The IBAN for Franco doesn't add up: check the digits.");
    typeInto(pay, 'paypal.me/franco');
    buttonNamed(d, 'Create the group').click();
    await flush();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].title, 'Trip to Milan');
    assert.equal(calls[0].message, 'New expense group');
    assert.equal(location.hash, `#/spese/${NEW_ID}`);
  });

  it('se il gruppo non si crea lo dice in inglese', async () => {
    api.createItem = async () => {
      throw new Error('');
    };
    await visit('#/spese');
    buttonNamed(outlet, 'New group').click();
    typeInto(dialog().querySelector('input[placeholder="For example: Startup costs"]'), 'Trip');
    buttonNamed(dialog(), 'Create the group').click();
    await flush();
    assert.equal(text(dialog().querySelector('.form-error')), "Couldn't create the group.");
  });
});

describe('movimenti di un gruppo in inglese', () => {
  it('si leggono per giorno, con importi convertiti e la mia parte', async () => {
    await visit(`#/spese/${G}`);
    assert.equal(text(outlet.querySelector('h1')), 'Startup costs');
    assert.equal(text(outlet.querySelector('.page-subtitle')), '3 people · EUR');
    assert.deepEqual([...outlet.querySelectorAll('.page-actions .btn')].map((b) => text(b)), ['Add', 'Export CSV', 'History']);
    assert.match(text(outlet.querySelector('.exp-summary')), /^You owe €12\.00 · total spent €84\.00 · your share €37\.00$/);
    const nav = outlet.querySelector('nav.tabs');
    assert.equal(nav.getAttribute('aria-label'), 'Group sections');
    assert.deepEqual([...nav.querySelectorAll('.tab')].map((a) => text(a)), ['Transactions', 'Balances', 'Statistics', 'Group']);
    assert.equal(text(outlet.querySelector('.exp-count')), '3 transactions · €84.00 spent');
    assert.deepEqual([...outlet.querySelectorAll('.exp-day-title')].map((h) => text(h)), ['12 Oct 2026', '10 Oct 2026', '5 Oct 2026']);
    assert.match(row(M.domain), /Paid by Anna · Software and online services · with receipt/);
    assert.match(row(M.domain), /You lent €20\.00/);
    assert.match(row(M.dinner), /€54\.00/);
    assert.match(row(M.dinner), /US\$60\.00/);
    assert.match(row(M.dinner), /Your share: €27\.00/);
    assert.match(row(M.refund), /Elena paid Anna/);
    assert.match(row(M.refund), /You received €5\.00/);
    assert.deepEqual(leftovers(outlet), []);
  });

  it('i filtri e la ricerca hanno voci inglesi e lo dicono quando non trovano nulla', async () => {
    await visit(`#/spese/${G}`);
    const select = (label) => outlet.querySelector(`select[aria-label="${label}"]`);
    assert.deepEqual(options(select('Type')), ['All transactions', 'Expenses', 'Refunds', 'Income']);
    assert.deepEqual(options(select('Person')), ['Anyone', 'Involves Anna', 'Involves Bruno', 'Involves Elena']);
    assert.deepEqual(options(select('Category')).slice(0, 3), ['All categories', 'Software and online services', 'Travel and transport']);
    const search = outlet.querySelector('input[type="search"]');
    assert.equal(search.placeholder, 'Search descriptions and notes');
    assert.equal(search.getAttribute('aria-label'), 'Search transactions');
    choose(select('Type'), 'rimborso');
    assert.deepEqual([...outlet.querySelectorAll('.exp-row')].map((li) => li.dataset.id), [M.refund]);
    choose(select('Type'), '');
    typeInto(search, 'nothing like this');
    assert.equal(text(outlet.querySelector('.empty')), 'No transactions match these filters.');
  });

  it('un gruppo senza movimenti invita alla prima spesa, e saldi e statistiche aspettano', async () => {
    await visit(`#/spese/${EMPTY}`);
    assert.match(text(outlet.querySelector('.empty')), /^No transactions yet\. Add the first expense: who paid and who to split it between\./);
    assert.ok(named(outlet, '.empty .btn', 'Add an expense'));
    assert.match(text(outlet.querySelector('.exp-summary')), /^You're settled up · total spent €0\.00 · your share €0\.00$/);
    assert.deepEqual(leftovers(outlet), []);
    await visit(`#/spese/${EMPTY}/saldi`);
    assert.equal(text(outlet.querySelector('.empty')), 'Balances appear with the first transaction.');
    await visit(`#/spese/${EMPTY}/statistiche`);
    assert.equal(text(outlet.querySelector('.empty')), 'Statistics appear with the first expense.');
  });

  it('il CSV esportato ha nome, intestazioni e numeri in inglese', async () => {
    const blobs = [];
    const names = [];
    const saved = { create: URL.createObjectURL, revoke: URL.revokeObjectURL, click: window.HTMLAnchorElement.prototype.click };
    URL.createObjectURL = (blob) => {
      blobs.push(blob);
      return 'blob:expenses';
    };
    URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function click() {
      names.push(this.download);
    };
    try {
      await visit(`#/spese/${G}`);
      buttonNamed(outlet.querySelector('.page-actions'), 'Export CSV').click();
      assert.equal(names.length, 1);
      assert.equal(names[0], `expenses-startup-costs-${format.dayKey(new Date())}.csv`);
      const lines = (await blobs[0].text()).replace(/^﻿/, '').split('\r\n');
      // The comma splits the columns, as an English spreadsheet expects.
      assert.equal(lines[0], 'Date,Type,Description,Category,Amount,Currency,Rate,Amount in EUR,Paid by,Split between,Note');
      assert.equal(lines[2], '2026-10-10,Expense,Dinner with the mentor,Meals and drinks,60.00,USD,0.9,54.00,Bruno,Anna 27.00; Bruno 27.00,');
    } finally {
      URL.createObjectURL = saved.create;
      URL.revokeObjectURL = saved.revoke;
      window.HTMLAnchorElement.prototype.click = saved.click;
    }
  });
});

describe('saldi in inglese', () => {
  it('dicono chi riceve e chi deve, con quanto ha pagato e la sua parte', async () => {
    await visit(`#/spese/${G}/saldi`);
    const balanceRow = (id) => outlet.querySelector(`.exp-balance-row[data-id="${id}"]`);
    const balance = (id) => text(balanceRow(id).querySelector('.exp-balance'));
    assert.equal(balance('a'), 'owes €12.00');
    assert.equal(balance('b'), 'is owed €17.00');
    assert.equal(balance('e'), 'owes €5.00');
    assert.equal(text(balanceRow('a').querySelector('.exp-person-name')), 'Anna (you)');
    assert.equal(text(balanceRow('a').querySelector('.exp-balance-detail')), 'paid €30.00 · their share €37.00');
    assert.deepEqual([...outlet.querySelectorAll('.exp-balances h2')].map((h) => text(h)), ['Balances', 'Who owes whom']);
    assert.match(text(outlet), /Whoever paid more than their share is owed money, the others owe\. In EUR: expenses in other currencies count at the rate saved in each one\./);
    assert.match(text(outlet), /The simplest way to settle up: everyone pays the people they owe directly\./);
    const transfers = [...outlet.querySelectorAll('.exp-transfer')].map((li) => text(li));
    assert.match(transfers[0], /^Anna pays Bruno €12\.00/);
    assert.match(transfers[1], /^Elena pays Bruno €5\.00/);
    assert.deepEqual([...outlet.querySelectorAll('.exp-transfer strong')].slice(0, 3).map((s) => text(s)), ['Anna', 'Bruno', '€12.00'], 'nomi e importo restano in evidenza, nell ordine inglese');
    const pay = outlet.querySelector('.exp-transfer .exp-pay');
    assert.equal(text(pay.querySelector('.muted')), 'How to pay Bruno:');
    assert.equal(text(pay.querySelector('.exp-bank')), 'ABI code 05428');
    assert.ok(buttonNamed(pay, 'Copy'));
    assert.deepEqual(leftovers(outlet), []);
  });

  it('copiare l IBAN lo conferma, o spiega cosa fare se non riesce', async () => {
    await visit(`#/spese/${G}/saldi`);
    const copy = () => buttonNamed(outlet.querySelector('.exp-pay'), 'Copy').click();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true });
    copy();
    await flush();
    assert.match(toasts(), /Copied\./);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } }, configurable: true });
    copy();
    await flush();
    assert.match(toasts(), /Couldn't copy: select it and copy it yourself\./);
  });

  it('un bonifico si segna come pagato con un rimborso che ha testi inglesi', async () => {
    const calls = [];
    fakeCreate(calls);
    await visit(`#/spese/${G}/saldi`);
    buttonNamed(outlet.querySelector('.exp-transfer'), 'Mark as paid').click();
    await flush();
    const confirm = lastDialog();
    assert.equal(text(confirm.querySelector('.modal-header h2')), 'Mark as paid?');
    assert.equal(text(confirm.querySelector('.modal-body')), "I'll record a refund of €12.00 from Anna to Bruno, dated today.");
    buttonNamed(confirm, 'Mark as paid').click();
    await flush();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].title, 'Refund');
    assert.equal(calls[0].message, 'Marked as paid');
    assert.deepEqual(calls[0].data.split, { mode: 'parti', shares: { b: 1 } });
    assert.match(toasts(), /Refund recorded\./);
  });

  it('se il rimborso non si registra lo dice in inglese', async () => {
    api.createItem = async () => {
      throw new Error('');
    };
    await visit(`#/spese/${G}/saldi`);
    buttonNamed(outlet.querySelector('.exp-transfer'), 'Mark as paid').click();
    await flush();
    buttonNamed(lastDialog(), 'Mark as paid').click();
    await flush(10);
    assert.match(toasts(), /Couldn't record it\./);
  });

  it('chi deve ricevere senza un modo di pagarlo rimanda alla scheda Gruppo', async () => {
    const plain = people.map(({ pay, ...p }) => p);
    store.applyItem(item({ id: G, kind: 'expensegroup', title: 'Startup costs', version: 2, data: { currency: 'EUR', people: plain } }));
    await visit(`#/spese/${G}/saldi`);
    const hint = [...outlet.querySelectorAll('.exp-settle p')].find((p) => p.querySelector('a'));
    assert.equal(text(hint), "For anyone who hasn't said how to pay them, add an IBAN or a link in the Group tab.");
    assert.equal(text(hint.querySelector('a')), 'Group');
    assert.equal(hint.querySelector('a').getAttribute('href'), `#/spese/${G}/gruppo`);
  });

  it('quando tutti sono in pari lo dice', async () => {
    await visit(`#/spese/${EVEN}/saldi`);
    assert.deepEqual([...outlet.querySelectorAll('.exp-balance-row .exp-balance')].map((el) => text(el)), ['settled up', 'settled up', 'settled up']);
    assert.equal(text(outlet.querySelector('.exp-even')), 'Everyone is settled up.');
    assert.deepEqual(leftovers(outlet), []);
  });
});

describe('statistiche in inglese', () => {
  it('mostrano totali, torta, chi ha pagato e mesi', async () => {
    await visit(`#/spese/${G}/statistiche`);
    const tiles = [...outlet.querySelectorAll('.stat')].map((t) => [...t.children].map((c) => text(c)).join(' | '));
    assert.deepEqual(tiles, [
      'Total spent | €84.00 | 2 expenses',
      'Your share | €37.00 | 44% of the total',
      'Average for each person | €28.00 | 3 people',
      'Income | €0.00 | none',
    ]);
    assert.deepEqual([...outlet.querySelectorAll('.exp-stats h2')].map((h) => text(h)), ['By category', 'Who paid', 'By month', 'All categories']);
    assert.equal(outlet.querySelector('.exp-donut-svg').getAttribute('aria-label'), 'Expenses by category: Meals and drinks 64%, Software and online services 36%');
    assert.match(text(outlet), /The last 12 months\. Hover over a bar to see its total\./);
    assert.match(outlet.querySelector('.exp-month-svg').getAttribute('aria-label'), /^Expenses by month: /);
    const cells = (rows) => [...rows].map((r) => [...r.children].map((c) => text(c)).join(' | '));
    assert.deepEqual(cells(outlet.querySelectorAll('.exp-category-table thead tr')), ['Category | Total | Share of total']);
    assert.deepEqual(cells(outlet.querySelectorAll('.exp-category-table tbody tr')), ['Meals and drinks | €54.00 | 64%', 'Software and online services | €30.00 | 36%']);
    assert.deepEqual(cells(outlet.querySelectorAll('.exp-paid-row')), ['Anna |  | €30.00', 'Bruno |  | €54.00', 'Elena |  | €0.00']);
    assert.deepEqual(leftovers(outlet), []);
  });

  it('le entrate già tolte e le categorie oltre la terza raccolte insieme', async () => {
    await visit(`#/spese/${EVEN}/statistiche`);
    const tiles = [...outlet.querySelectorAll('.stat')].map((t) => [...t.children].map((c) => text(c)).join(' | '));
    assert.deepEqual(tiles, [
      'Total spent | €10.00 | 4 expenses',
      'Your share | €0.00 | 0% of the total',
      'Average for each person | €3.33 | 3 people',
      'Income | €10.00 | already taken off the shares',
    ]);
    assert.equal(
      outlet.querySelector('.exp-donut-svg').getAttribute('aria-label'),
      'Expenses by category: Software and online services 40%, Travel and transport 30%, Meals and drinks 20%, Other categories 10%',
    );
    assert.deepEqual([...outlet.querySelectorAll('.exp-legend li')].map((li) => text(li)).at(-1), 'Other categories10%');
    assert.deepEqual(leftovers(outlet), []);
  });
});

describe('finestra di un movimento in inglese', () => {
  it('una nuova spesa si scrive con l importo all inglese e si divide in parti uguali', async () => {
    const calls = [];
    fakeCreate(calls);
    await visit(`#/spese/${G}`);
    buttonNamed(outlet.querySelector('.page-actions'), 'Add').click();
    const d = dialog();
    assert.equal(text(d.querySelector('.modal-header h2')), 'New transaction');
    assert.equal(d.querySelector('.exp-types').getAttribute('aria-label'), 'Type of transaction');
    assert.deepEqual([...d.querySelectorAll('.exp-types button')].map((b) => text(b)), ['Expense', 'Refund', 'Income']);
    assert.deepEqual(fieldLabels(d), ['Description', 'Amount', 'Date', 'Paid by', 'Split between', 'Category', 'Note', 'Receipt']);
    assert.equal(d.querySelector('input[placeholder="For example: Website domain"]').value, '');
    assert.equal(d.querySelector('.exp-amount-input').placeholder, '0.00');
    assert.equal(d.querySelector('select[aria-label="Currency"]').options[1].title, 'US dollar');
    assert.equal(d.querySelector('textarea').placeholder, 'Optional');
    assert.deepEqual(options(d.querySelector('select[aria-label="How to split"]')), ['Equally', 'By shares', 'By amounts']);
    assert.ok(buttonNamed(d, 'Everyone'));
    assert.ok(buttonNamed(d, 'None'));
    assert.ok(buttonNamed(d, 'Add a photo of the receipt'));
    assert.deepEqual(options(fieldSelect(d, 'Category')).slice(0, 2), ['Software and online services', 'Travel and transport']);
    assert.deepEqual(footer(d), ['Cancel', 'Add']);
    assert.deepEqual(leftovers(d), []);

    buttonNamed(d.querySelector('.modal-actions'), 'Add').click();
    await flush();
    assert.equal(text(d.querySelector('.form-error')), 'Enter a valid amount, for example 12.50.');
    typeInto(d.querySelector('.exp-amount-input'), '1,234.5');
    assert.deepEqual([...d.querySelectorAll('[data-preview]')].map((el) => text(el)), ['€411.50', '€411.50', '€411.50']);
    buttonNamed(d.querySelector('.modal-actions'), 'Add').click();
    await flush();
    assert.equal(text(d.querySelector('.form-error')), 'Write a description.');
    typeInto(d.querySelector('input[placeholder="For example: Website domain"]'), 'Hosting');
    buttonNamed(d, 'None').click();
    assert.ok([...d.querySelectorAll('.exp-split input[type="checkbox"]')].every((c) => !c.checked));
    buttonNamed(d, 'Everyone').click();
    buttonNamed(d.querySelector('.modal-actions'), 'Add').click();
    await flush();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].title, 'Hosting');
    assert.equal(calls[0].data.amount, 123450);
    assert.deepEqual(calls[0].data.split, { mode: 'parti', shares: { a: 1, b: 1, e: 1 } });
  });

  it('dividere per quote e per importi parla inglese e legge gli importi all inglese', async () => {
    const calls = [];
    fakeCreate(calls);
    await visit(`#/spese/${G}`);
    buttonNamed(outlet.querySelector('.page-actions'), 'Add').click();
    const d = dialog();
    typeInto(d.querySelector('input[placeholder="For example: Website domain"]'), 'Fair');
    typeInto(d.querySelector('.exp-amount-input'), '100');
    choose(d.querySelector('select[aria-label="How to split"]'), 'quote');
    assert.match(text(d.querySelector('.exp-split')), /For example 2 for someone who counts double, 1 for the others\./);
    assert.ok(d.querySelector('input[aria-label="Shares for Anna"]'));
    choose(d.querySelector('select[aria-label="How to split"]'), 'importi');
    const input = (name) => d.querySelector(`input[aria-label="Amount for ${name}"]`);
    assert.equal(input('Anna').value, '33.34');
    assert.equal(input('Anna').placeholder, '0.00');
    typeInto(input('Anna'), '50');
    assert.equal(text(d.querySelector('.exp-left')), 'The shares are €16.66 over the total.');
    typeInto(input('Elena'), '10');
    assert.equal(text(d.querySelector('.exp-left')), '€6.67 left to split.');
    buttonNamed(d.querySelector('.modal-actions'), 'Add').click();
    await flush();
    assert.equal(text(d.querySelector('.form-error')), 'Still €6.67 to split.');
    typeInto(input('Elena'), '16.67');
    assert.equal(text(d.querySelector('.exp-left')), 'The shares match the total.');
    assert.deepEqual(leftovers(d), []);
    buttonNamed(d.querySelector('.modal-actions'), 'Add').click();
    await flush();
    assert.deepEqual(calls[0].data.split, { mode: 'importi', shares: { a: 5000, b: 3333, e: 1667 } });
  });

  it('un rimborso va da una persona a un altra e un entrata dice chi l ha ricevuta', async () => {
    const calls = [];
    fakeCreate(calls);
    await visit(`#/spese/${G}`);
    buttonNamed(outlet.querySelector('.page-actions'), 'Add').click();
    const d = dialog();
    buttonNamed(d, 'Income').click();
    assert.deepEqual(fieldLabels(d).slice(3, 5), ['Received by', 'Split between']);
    buttonNamed(d, 'Refund').click();
    assert.deepEqual(fieldLabels(d).slice(3, 6), ['From', 'To', 'Note']);
    assert.equal(d.querySelector('select[aria-label="Who receives"]').value, 'b');
    assert.equal(d.querySelector('input[placeholder]').placeholder, 'Refund');
    assert.equal(text(d.querySelector('.exp-split')), '');
    assert.deepEqual(leftovers(d), []);
    typeInto(d.querySelector('.exp-amount-input'), '10');
    buttonNamed(d.querySelector('.modal-actions'), 'Add').click();
    await flush();
    assert.equal(calls[0].title, 'Refund');
    assert.deepEqual(calls[0].data.split, { mode: 'parti', shares: { b: 1 } });
  });

  it('un movimento in dollari mostra il cambio e lo chiede alla BCE in inglese', async () => {
    const saves = [];
    fakeSave(saves);
    await visit(`#/spese/${G}?movimento=${M.dinner}`);
    const d = dialog();
    assert.equal(text(d.querySelector('.modal-header h2')), 'Edit transaction');
    assert.equal(d.querySelector('.exp-amount-input').value, '60.00');
    assert.match(text(d.querySelector('.exp-rate')), /^Rate: 1 USD =\s*EUR\s*ECB rate for the day\s*= €54\.00$/);
    const rate = () => d.querySelector('.exp-rate input');
    assert.equal(rate().value, '0.9');
    assert.equal(rate().getAttribute('aria-label'), 'Rate: how many EUR 1 USD is worth');
    assert.deepEqual(footer(d), ['Cancel', 'Move to the trash', 'Save']);
    assert.ok(named(d, 'a', 'History of changes'));
    assert.deepEqual(leftovers(d), []);

    globalThis.fetch = () => new Promise(() => {});
    choose(d.querySelector('select[aria-label="Currency"]'), 'GBP');
    assert.equal(text(d.querySelector('.exp-rate [aria-live]')), 'Asking the ECB for the rate…');
    buttonNamed(d.querySelector('.modal-actions'), 'Save').click();
    await flush();
    assert.equal(text(d.querySelector('.form-error')), 'The rate is missing: wait for the ECB one or type it in yourself.');
    typeInto(rate(), '0.85');
    assert.equal(text(d.querySelector('.exp-rate [aria-live]')), '= €51.00');
    globalThis.fetch = async () => {
      throw new Error('offline');
    };
    buttonNamed(d, 'ECB rate for the day').click();
    await flush();
    assert.equal(text(d.querySelector('.exp-rate [aria-live]')), 'Rate not available: type it in yourself.');
    typeInto(rate(), '0.85');
    buttonNamed(d.querySelector('.modal-actions'), 'Save').click();
    await flush();
    assert.equal(saves.length, 1);
    assert.equal(saves[0].snapshot.data.currency, 'GBP');
    assert.equal(saves[0].snapshot.data.rate, 0.85);
  });

  it('se il salvataggio non riesce lo dice in inglese', async () => {
    api.saveItem = async () => {
      throw new Error('');
    };
    await visit(`#/spese/${G}?movimento=${M.dinner}`);
    buttonNamed(dialog().querySelector('.modal-actions'), 'Save').click();
    await flush();
    assert.equal(text(dialog().querySelector('.form-error')), "Couldn't save.");
  });

  it('un movimento si sposta nel cestino con conferma e messaggio inglesi', async () => {
    const deletes = [];
    fakeDelete(deletes);
    await visit(`#/spese/${G}?movimento=${M.dinner}`);
    buttonNamed(dialog().querySelector('.modal-actions'), 'Move to the trash').click();
    await flush();
    const confirm = lastDialog();
    assert.equal(text(confirm.querySelector('.modal-header h2')), 'Move to the trash?');
    assert.equal(text(confirm.querySelector('.modal-body')), '“Dinner with the mentor” goes to the trash and no longer counts in the balances. You can restore it from the trash.');
    buttonNamed(confirm, 'Move to the trash').click();
    await flush(10);
    assert.deepEqual(deletes, [{ id: M.dinner, message: 'Transaction moved to the trash' }]);
  });

  it('se lo spostamento nel cestino non riesce lo dice in inglese', async () => {
    api.deleteItem = async () => {
      throw new Error('');
    };
    await visit(`#/spese/${G}?movimento=${M.dinner}`);
    buttonNamed(dialog().querySelector('.modal-actions'), 'Move to the trash').click();
    await flush();
    buttonNamed(lastDialog(), 'Move to the trash').click();
    await flush(10);
    assert.equal(text(dialog().querySelector('.form-error')), 'Something went wrong.');
  });

  it('lo scontrino si cambia o si toglie, e se non si trova lo dice', async () => {
    await visit(`#/spese/${G}?movimento=${M.domain}`);
    const d = dialog();
    const receipt = d.querySelector('.exp-receipt');
    assert.equal(text(receipt.querySelector('.field-label')), 'Receipt');
    assert.ok(buttonNamed(receipt, 'Change photo'));
    await flush();
    assert.match(text(receipt), /Receipt no longer available/);
    buttonNamed(receipt, 'Remove').click();
    assert.ok(buttonNamed(d.querySelector('.exp-receipt'), 'Add a photo of the receipt'));
    assert.deepEqual(leftovers(d), []);
  });
});

describe('scheda Gruppo in inglese', () => {
  it('le persone nei movimenti non si tolgono e la valuta resta quella', async () => {
    await visit(`#/spese/${G}/gruppo`);
    const removes = [...outlet.querySelectorAll('.exp-person-row button')];
    assert.deepEqual(removes.map((b) => [b.disabled, b.title]), [
      [true, "Can't be removed: they're in 3 transactions"],
      [true, "Can't be removed: they're in 2 transactions"],
      [true, "Can't be removed: they're in 2 transactions"],
    ]);
    assert.deepEqual(fieldLabels(outlet), ['Group name', 'Group currency', 'People', 'Notes']);
    assert.match(text(outlet), /Can't be changed after the first transaction: the saved rates convert into this currency\./);
    assert.ok(buttonNamed(outlet, 'Move the group to the trash'));
    assert.deepEqual(leftovers(outlet), []);
  });

  it('salvare controlla l IBAN e lascia un messaggio inglese nella cronologia', async () => {
    const saves = [];
    fakeSave(saves);
    await visit(`#/spese/${G}/gruppo`);
    buttonNamed(outlet, 'Add a person').click();
    typeInto([...outlet.querySelectorAll('.exp-person-name-input')].at(-1), 'Franco');
    const pay = [...outlet.querySelectorAll('.exp-person-pay-input')].at(-1);
    typeInto(pay, 'IT60 X054 2811 1010 0000 0123 457');
    buttonNamed(outlet, 'Save').click();
    await flush();
    assert.equal(text(outlet.querySelector('.exp-settings .form-error')), "The IBAN for Franco doesn't add up: check the digits.");
    typeInto(pay, 'paypal.me/franco');
    buttonNamed(outlet, 'Save').click();
    await flush();
    assert.equal(saves.length, 1);
    assert.equal(saves[0].message, 'Group updated');
    assert.match(toasts(), /Group saved\./);
  });

  it('chi lo cambia da un altra parte viene segnalato a chi sta scrivendo', async () => {
    await visit(`#/spese/${G}/gruppo`);
    store.applyItem(item({ id: G, kind: 'expensegroup', title: 'Startup costs', version: 2, updated_by: OTHER, data: { currency: 'EUR', people } }));
    await flush();
    assert.match(toasts(), /Someone changed the group: reload the tab before saving\./);
  });

  it('il gruppo si sposta nel cestino con conferma e messaggio inglesi', async () => {
    const deletes = [];
    fakeDelete(deletes);
    await visit(`#/spese/${G}/gruppo`);
    buttonNamed(outlet, 'Move the group to the trash').click();
    await flush();
    const confirm = lastDialog();
    assert.equal(text(confirm.querySelector('.modal-header h2')), 'Move to the trash?');
    assert.equal(text(confirm.querySelector('.modal-body')), 'The group “Startup costs” and its transactions disappear from Expenses. You can restore it from the trash.');
    buttonNamed(confirm, 'Move to the trash').click();
    await flush(10);
    assert.deepEqual(deletes, [{ id: G, message: 'Expense group moved to the trash' }]);
    assert.equal(location.hash, '#/spese');
  });

  it('se il gruppo non si sposta nel cestino lo dice in inglese', async () => {
    api.deleteItem = async () => {
      throw new Error('');
    };
    await visit(`#/spese/${G}/gruppo`);
    buttonNamed(outlet, 'Move the group to the trash').click();
    await flush();
    buttonNamed(lastDialog(), 'Move to the trash').click();
    await flush(10);
    assert.match(toasts(), /Something went wrong\./);
  });
});

describe('sola lettura e gruppi mancanti in inglese', () => {
  it('chi è advisor vede conti e dettagli ma non li cambia', async () => {
    store.state.user = { id: ADVISOR };
    store.setMembers(members());
    await visit(`#/spese/${G}`);
    assert.equal(text(outlet.querySelector('.exp-summary')), "You're not one of the people in this group: you can see the accounts, but no transaction involves you.");
    buttonNamed(outlet, 'Dinner with the mentor').click();
    const details = () => Object.fromEntries([...dialog().querySelectorAll('dt')].map((dt) => [text(dt), text(dt.nextElementSibling)]));
    assert.deepEqual(details(), {
      Type: 'Expense',
      Amount: 'US$60.00 (€54.00 at a rate of 0.9)',
      Date: '10 Oct 2026',
      'Paid by': 'Bruno',
      'Split between': 'Anna €27.00, Bruno €27.00',
      Category: 'Meals and drinks',
    });
    assert.ok(named(dialog(), 'a', 'History of changes'));
    assert.deepEqual(footer(), ['Close']);
    assert.deepEqual(leftovers(dialog()), []);
    buttonNamed(dialog(), 'Close').click();

    buttonNamed(outlet, 'Refund').click();
    assert.equal(details().From, 'Elena');
    assert.equal(details().To, 'Anna');
    buttonNamed(dialog(), 'Close').click();

    buttonNamed(outlet, 'Domain').click();
    assert.equal(dialog().querySelector('.exp-receipt-img').alt, 'Receipt: Domain');
    await flush();
    assert.match(text(dialog()), /Receipt no longer available/);
    buttonNamed(dialog(), 'Close').click();

    await visit(`#/spese/${G}/gruppo`);
    assert.equal(text(outlet.querySelector('h2')), 'People');
    const items = [...outlet.querySelectorAll('.card li')];
    assert.deepEqual(items.map((li) => text(li.querySelector('span'))), ['· has an account', '· has an account', '']);
    assert.equal(text(items[1].querySelector('div')), 'How to pay me: IT60 X054 2811 1010 0000 0123 456');
    assert.deepEqual(leftovers(outlet), []);
  });

  it('un gruppo che non esiste o è nel cestino lo dice', async () => {
    await visit(`#/spese/${MISSING}`);
    assert.equal(text(outlet.querySelector('h1')), 'Group not available');
    assert.match(text(outlet.querySelector('.empty')), /^The group doesn't exist or is no longer available\./);
    assert.ok(named(outlet, '.empty .btn', 'Back to expenses'));
    assert.deepEqual(leftovers(outlet), []);
    await visit(`#/spese/${ARCHIVED}`);
    assert.match(text(outlet.querySelector('.empty')), /^This group is in the trash: restore it from there to see it\./);
  });
});
