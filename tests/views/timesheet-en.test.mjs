import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, text, byText } from '../setup/dom.mjs';
import { italianWords } from '../setup/italian.mjs';
import { ME, OTHER, item, members } from '../setup/fixtures.mjs';

// Su un dispositivo in inglese: la lingua si decide quando il sito si carica, per questo i moduli arrivano dopo la scelta.
useLanguage('en');

let api;
let store;
let router;
let app;
let av;
let original;
let outlet;
let monday;
let lastWeek;

const RealDate = Date;
const id = (n) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`;
const MINE = id(1);
const THEIRS = id(2);
const NEW_ID = id(3);
const TEAM = '#/squadra/ore';
const mineView = (week) => `#/squadra/ore?vista=mie&settimana=${week}`;

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  av = await import('../../assets/js/availability.js');
  original = { ...api };
  router.clearRoutes();
  app.registerRoutes();
});

beforeEach(async () => {
  globalThis.__fakeSupabase.reset();
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  localStorage.clear();
  api.listRevisions = async () => [];
  monday = av.thisMonday();
  lastWeek = av.addDays(monday, -7);
  outlet = document.createElement('main');
  document.body.querySelectorAll('dialog, .toasts').forEach((d) => d.remove());
  await router.startRouter(outlet, { fallback: app.notFoundView });
});

afterEach(() => {
  router.stopRouter();
  Object.assign(api, original);
  globalThis.Date = RealDate;
  outlet.remove();
  history.replaceState(null, '', '#/');
});

async function visit(hash) {
  await router.render(hash);
  await flush(5);
  return text(outlet);
}

// Orologio fermo a un giorno (0 = lunedì) e a un'ora locale di questa settimana.
function setClock(day, hour) {
  const [y, m, d] = av.addDays(monday, day).split('-').map(Number);
  const now = new RealDate(y, m - 1, d, hour).getTime();
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }

    static now() {
      return now;
    }
  };
}

// Quello che si legge, anche dai lettori di schermo, senza le parti di altri moduli (avatar).
function readable(root) {
  const copy = root.cloneNode(true);
  copy.querySelectorAll('.avatar').forEach((el) => el.remove());
  const attributes = [...copy.querySelectorAll('[aria-label],[title],[placeholder],[abbr]')].flatMap((el) =>
    ['aria-label', 'title', 'placeholder', 'abbr'].map((name) => el.getAttribute(name)).filter(Boolean),
  );
  const titles = [...copy.querySelectorAll('title')].map((el) => el.textContent);
  return [copy.textContent, ...attributes, ...titles].join(' ');
}
const leftovers = () => italianWords(readable(outlet.querySelector('.tab-body')));

function timesheet(itemId, userId, data, over = {}) {
  store.applyItem(item({ id: itemId, kind: 'timesheet', title: 'Ore lavorate', created_by: userId, updated_by: userId, data, updated_at: new Date().toISOString(), ...over }));
}
const mine = (data, over) => timesheet(MINE, ME, data, over);
const bruno = (data, over) => timesheet(THEIRS, OTHER, data, over);
const entry = (entryId, day, start, end, area = 'prodotto', note) => ({ id: entryId, day, start, end, area, ...(note ? { note } : {}) });

const weekButton = (label) => outlet.querySelector(`button[aria-label="${label}"]`);
const weekTitle = () => text(outlet.querySelector('.av-week-title strong'));
const person = (name) => [...outlet.querySelectorAll('.ts-people li')].find((li) => text(li.querySelector('strong')) === name);
const average = (name) => text(person(name).querySelector(':scope > .muted'));
const areaCards = () => [...outlet.querySelectorAll('.cards-2 .card')];
const days = () => [...outlet.querySelectorAll('.ts-day')];
const rowsOf = (i) => [...days()[i].querySelectorAll('.ts-row')];
const addButton = (i) => byText(days()[i], 'button', 'Add hours');
const total = () => text(outlet.querySelector('.ts-total'));
const pledgeInput = () => outlet.querySelector('.ts-pledge-input');
const saveButton = () => byText(outlet, 'button', 'Save my hours');
const saveStatus = () => text(outlet.querySelector('.save-bar [role="status"]'));
const problem = () => text(outlet.querySelector('.save-bar .ts-problem'));
const toasts = () => text(document.querySelector('.toasts'));

function setInput(el, value) {
  el.value = value;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
}

function fillRow(row, start, end) {
  const [startInput, endInput] = row.querySelectorAll('.ts-time');
  if (start !== undefined) setInput(startInput, start);
  if (end !== undefined) setInput(endInput, end);
  return row;
}

describe('pagina Ore lavorate in inglese, ore della squadra', () => {
  it('mostra settimana, totali, storico, aree e dettagli in inglese', async () => {
    mine({ week: av.addDays(lastWeek, -7), pledge: 600, entries: [entry('o1', 'lun', 540, 600)] });
    bruno({ week: monday, entries: [entry('b1', 'lun', 540, 660, 'ricerca', 'Two calls'), entry('b2', 'mar', 600, 615)] });
    const body = await visit(TEAM);
    const views = outlet.querySelector('nav.subtabs');
    assert.equal(views.getAttribute('aria-label'), 'View');
    assert.deepEqual([...views.querySelectorAll('.tab')].map(text), ['Team hours', 'My hours']);
    assert.match(body, /The hours each person gave to the project, day by day, next to the hours they said they could give\. Log your hours/);
    assert.equal(byText(outlet, 'a', 'Log your hours').getAttribute('href'), mineView(monday));
    assert.equal(weekTitle(), 'This week');
    assert.ok(weekButton('Previous week'));
    assert.ok(weekButton('Next week').disabled);

    const heads = [...outlet.querySelectorAll('.ts-table thead th')];
    assert.equal(text(heads[0]), 'Person');
    assert.equal(text(heads.at(-1)), 'Total');
    assert.deepEqual([...outlet.querySelectorAll('.ts-table thead .av-day')].map(text), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    assert.equal(heads[1].getAttribute('abbr'), 'Monday');
    const anna = [...outlet.querySelectorAll('.ts-table tbody tr')].find((tr) => /Anna/.test(text(tr)));
    assert.equal(text(anna.querySelector('td .sr-only')), 'no hours');
    assert.equal(text(anna.querySelector('.ts-sum')), '0h of 10h');
    assert.equal(outlet.querySelector('.av-scroll').getAttribute('aria-label'), `Team hours, ${av.weekLabel(monday)}`);
    assert.match(body, /No hours logged by: Anna\./);

    assert.match(text(outlet.querySelector('#ts-history-title')), /^Last 12 weeks$/);
    assert.match(body, /The columns are the hours logged, the horizontal mark the hours pledged\./);
    assert.equal(average('Anna'), 'on average 1h in the weeks logged');
    assert.equal(average('Bruno'), 'on average 2h 15m in the weeks logged');
    const chart = person('Bruno').querySelector('svg');
    assert.match(chart.getAttribute('aria-label'), new RegExp(`^Bruno, from the oldest week: .*${av.shortDate(monday)} 2h 15m$`));
    assert.match(person('Anna').querySelector('svg').getAttribute('aria-label'), new RegExp(`${av.shortDate(av.addDays(lastWeek, -7))} 1h of 10h`));
    assert.match(text(person('Anna').querySelector('svg title')), new RegExp(`^${av.weekLabel(av.addDays(lastWeek, -7))}: 1h of 10h$`));

    assert.equal(text(areaCards()[0].querySelector('h2')), 'By area, this week');
    assert.equal(text(areaCards()[1].querySelector('h2')), 'By area, last 12 weeks');
    assert.match(text(areaCards()[0]), /Research and interviews.*2h.*Product and technology.*15m/);

    assert.match(body, /Day by day/);
    const details = outlet.querySelector('.ts-detail');
    assert.equal(text(details.querySelector('summary')), 'Bruno, 2h 15m');
    assert.equal(text(details.querySelector('li')), `Monday ${av.shortDate(monday)}, 09:00-11:00 · Research and interviews · Two calls`);
    assert.deepEqual(leftovers(), []);
  });

  it('nelle settimane passate titoli e vuoti parlano inglese', async () => {
    await visit(TEAM);
    weekButton('Previous week').click();
    await flush(5);
    assert.equal(weekTitle(), 'Last week');
    assert.equal(text(areaCards()[0].querySelector('h2')), `By area, ${av.weekLabel(lastWeek)}`);
    assert.match(text(areaCards()[0]), /No hours logged\./);
    assert.match(text(outlet), /No hours logged this week\./);
    assert.equal(average('Anna'), 'no weeks logged');
    weekButton('Previous week').click();
    await flush(5);
    assert.equal(weekTitle(), '2 weeks ago');
    assert.deepEqual(leftovers(), []);
  });
});

describe('pagina Ore lavorate in inglese, le mie ore', () => {
  it('spiega come segnare le ore e dà un nome a giorni, righe e campi', async () => {
    setClock(6, 12);
    const body = await visit(mineView(monday));
    assert.match(body, /For each day, log from what time to what time you worked on the project and on what\./);
    assert.match(body, /The whole team sees the notes, advisors included, and they stay in the history\./);
    assert.equal(text(pledgeInput().closest('label')), 'Hours a week you can give');
    assert.equal(text(outlet.querySelector('.ts-pledge p')), 'They apply from this week on, until you change them.');
    const titles = days().map((d) => text(d.querySelector('h2')));
    assert.equal(titles[0], `Monday ${av.shortDate(monday)}`);
    assert.equal(titles[6], `Sunday ${av.shortDate(av.addDays(monday, 6))} · today`);
    assert.equal(byText(days()[0], 'button', 'Add hours').getAttribute('aria-label'), 'Add hours to Monday');
    assert.equal(saveStatus(), 'No hours logged this week');
    assert.equal(total(), 'This week: 0h');

    addButton(0).click();
    await flush(1);
    const row = rowsOf(0)[0];
    assert.equal(row.getAttribute('aria-label'), 'Monday, row 1');
    assert.deepEqual([...row.querySelectorAll('.ts-time')].map((el) => el.getAttribute('aria-label')), ['Start', 'End']);
    assert.equal(row.querySelector('.ts-area').getAttribute('aria-label'), 'Area');
    assert.deepEqual([...row.querySelectorAll('.ts-area option')].map((o) => [o.textContent, o.title]), [
      ['Product', 'Product and technology'],
      ['Customers', 'Customers and sales'],
      ['Finance', 'Finance and admin'],
      ['Research', 'Research and interviews'],
      ['Other', 'Other'],
    ]);
    assert.equal(row.querySelector('.ts-note').getAttribute('placeholder'), 'What you did (optional)');
    assert.equal(row.querySelector('.ts-note').getAttribute('aria-label'), 'Note');
    assert.equal(row.querySelector('.ts-remove').getAttribute('aria-label'), 'Remove row 1 of Monday');
    assert.equal(saveStatus(), 'Unsaved changes');
    assert.deepEqual(leftovers(), []);
  });

  it('le ore dichiarate si mostrano con il punto decimale e accettano anche la virgola', async () => {
    setClock(6, 12);
    await visit(mineView(monday));
    setInput(pledgeInput(), '7.3');
    assert.equal(pledgeInput().value, '7.25');
    assert.equal(total(), 'This week: 0h of 7h 15m pledged');
    setInput(pledgeInput(), '7,5');
    assert.equal(pledgeInput().value, '7.5');
    setInput(pledgeInput(), '100');
    assert.equal(pledgeInput().value, '80');
    assert.equal(total(), 'This week: 0h of 80h pledged');

    weekButton('Previous week').click();
    await flush(2);
    assert.match(text(document.querySelector('dialog')), /You have unsaved hours this week\. Change week anyway\?/);
    byText(document.querySelector('dialog'), 'button', 'Change').click();
    await flush(5);
    assert.equal(weekTitle(), 'Last week');
    assert.equal(total(), `${av.weekLabel(lastWeek)}: 0h`);
  });

  it('i problemi prima di salvare si spiegano in inglese', async () => {
    setClock(6, 12);
    await visit(mineView(monday));
    api.createItem = async () => assert.fail('con un problema non si salva');
    addButton(0).click();
    await flush(1);
    fillRow(rowsOf(0)[0], '');
    saveButton().click();
    await flush(2);
    assert.equal(problem(), 'Monday: a row is missing its start or end time.');
    fillRow(rowsOf(0)[0], '11:00', '10:00');
    assert.equal(problem(), "Monday: a row ends before it starts. If you work past midnight, split it into two rows.");
    fillRow(rowsOf(0)[0], '09:00', '11:00');
    addButton(0).click();
    await flush(1);
    fillRow(rowsOf(0)[1], '10:00', '12:00');
    saveButton().click();
    await flush(2);
    assert.equal(problem(), 'On Monday two rows overlap: 09:00-11:00 and 10:00-12:00.');
  });

  it('il primo salvataggio e quelli dopo usano messaggi inglesi, il titolo resta quello del database', async () => {
    setClock(6, 12);
    const calls = [];
    api.createItem = async (args) => {
      calls.push(args);
      return item({ id: NEW_ID, kind: args.kind, title: args.title, data: args.data, updated_at: new Date().toISOString() });
    };
    await visit(mineView(monday));
    addButton(0).click();
    await flush(1);
    fillRow(rowsOf(0)[0], '09:00', '10:00');
    assert.equal(total(), 'This week: 1h');
    saveButton().click();
    await flush(10);
    assert.equal(calls[0].title, 'Ore lavorate');
    assert.equal(calls[0].message, 'First hours of the week');
    assert.match(toasts(), /^Hours saved\.$/);
    assert.equal(saveStatus(), 'Saved just now');
  });

  it('un salvataggio unito a quello di un altro dispositivo lo dice', async () => {
    setClock(6, 12);
    mine({ week: monday, entries: [entry('a1', 'lun', 540, 600)] });
    const saves = [];
    api.saveItem = async (args) => {
      saves.push(args);
      const current = store.getItem(args.id);
      if (args.baseVersion !== current.version) return { status: 'conflict', item: current };
      return { status: 'ok', item: item({ ...current, data: args.snapshot.data, version: current.version + 1, updated_at: new Date().toISOString() }) };
    };
    await visit(mineView(monday));
    fillRow(rowsOf(0)[0], undefined, '11:00');
    mine({ week: monday, pledge: 600, entries: [entry('a1', 'lun', 540, 600)] }, { version: 2 });
    saveButton().click();
    await flush(10);
    assert.equal(saves[0].message, 'Hours updated');
    assert.equal(toasts(), 'Hours saved, merged with those saved from another device.');
  });

  it('uscire con ore non salvate chiede conferma in inglese', async () => {
    setClock(6, 12);
    await visit(mineView(monday));
    addButton(0).click();
    await flush(1);
    const attempt = router.render('#/idee');
    await flush();
    const dialog = document.querySelector('dialog');
    assert.match(text(dialog), /You have unsaved hours\. Leave anyway\?/);
    assert.match(text(dialog), /Unsaved hours/);
    byText(dialog, 'button', 'Leave').click();
    await attempt;
  });
});
