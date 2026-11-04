import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text, byText, typeInto } from '../setup/dom.mjs';
import { ADVISOR, ME, OTHER, XSS, item, members, revision } from '../setup/fixtures.mjs';

let api;
let AppError;
let store;
let router;
let app;
let av;
let notes;
let bellView;
let fake;
let original;
let outlet;
let monday;
let lastWeek;

const RealDate = Date;
const RealSetTimeout = globalThis.setTimeout;
const RealClearTimeout = globalThis.clearTimeout;
const id = (n) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`;
const MINE = id(1);
const THEIRS = id(2);
const NEW_ID = id(3);
const OLDER = id(4);
const ADVISOR_ITEM = id(5);
const BRUNO_OLDER = id(6);
const THIS_WEEK = id(7);
const TEAM = '#/squadra/ore';
const mineView = (week) => `#/squadra/ore?vista=mie&settimana=${week}`;
const teamView = (week) => `#/squadra/ore?settimana=${week}`;

before(async () => {
  setupDom();
  ({ api, AppError } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  av = await import('../../assets/js/availability.js');
  notes = await import('../../assets/js/notifications.js');
  bellView = await import('../../assets/js/views/notifications.js');
  fake = globalThis.__fakeSupabase;
  original = { ...api };
  router.clearRoutes();
  app.registerRoutes();
});

beforeEach(async () => {
  fake.reset();
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  localStorage.clear();
  api.listRevisions = async () => [];
  monday = av.thisMonday();
  lastWeek = av.addDays(monday, -7);
  outlet = document.createElement('main');
  document.body.querySelectorAll('dialog, .toasts, .bell-box').forEach((d) => d.remove());
  await router.startRouter(outlet, { fallback: app.notFoundView });
});

afterEach(() => {
  router.stopRouter();
  notes.stopNotifications();
  Object.assign(api, original);
  globalThis.Date = RealDate;
  globalThis.setTimeout = RealSetTimeout;
  globalThis.clearTimeout = RealClearTimeout;
  outlet.remove();
  history.replaceState(null, '', '#/');
});

async function visit(hash) {
  await router.render(hash);
  await flush(5);
  return text(outlet);
}

// Orologio fermo a un giorno (0 = lunedì) e a un'ora locale di questa settimana.
function setClock(day, hour, minute = 0) {
  const [y, m, d] = av.addDays(monday, day).split('-').map(Number);
  const now = new RealDate(y, m - 1, d, hour, minute).getTime();
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }

    static now() {
      return now;
    }
  };
}

function localTime(day, hour, minute = 0) {
  const [y, m, d] = av.addDays(monday, day).split('-').map(Number);
  return new RealDate(y, m - 1, d, hour, minute);
}

function timesheet(itemId, userId, data, over = {}) {
  store.applyItem(item({ id: itemId, kind: 'timesheet', title: 'Ore lavorate', created_by: userId, updated_by: userId, data, ...over }));
}
const mine = (data, over) => timesheet(MINE, ME, data, over);
const bruno = (data, over) => timesheet(THEIRS, OTHER, data, over);
const entry = (entryId, day, start, end, area = 'prodotto', note) => ({ id: entryId, day, start, end, area, ...(note ? { note } : {}) });
const brief = (entries) => entries.map((e) => [e.day, e.start, e.end, e.area, e.note ?? null]);
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Il testo che si vede: senza quello riservato ai lettori di schermo.
function visible(el) {
  const copy = el.cloneNode(true);
  copy.querySelectorAll('.sr-only').forEach((s) => s.remove());
  return text(copy);
}

const weekButton = (label) => outlet.querySelector(`button[aria-label="${label}"]`);
const arrows = () => [weekButton('Settimana precedente'), weekButton('Settimana successiva')];
const weekTitle = () => text(outlet.querySelector('.av-week-title strong'));
const weekRange = () => text(outlet.querySelector('.av-week-title .muted'));
const teamRows = () => [...outlet.querySelectorAll('.ts-table tbody tr')].map((tr) => [...tr.children].map(visible));
const person = (name) => [...outlet.querySelectorAll('.ts-people li')].find((li) => text(li.querySelector('strong')) === name);
const average = (name) => text(person(name).querySelector(':scope > .muted'));
const weeksUpTo = (end) => Array.from({ length: 12 }, (_, i) => av.addDays(end, (i - 11) * 7));
const chartLabel = (name, end, values = {}) => `${name}, dalla settimana più vecchia: ${weeksUpTo(end).map((w) => `${av.shortDate(w)} ${values[w] || '0 h'}`).join(', ')}`;
const areaCards = () => [...outlet.querySelectorAll('.cards-2 .card')];
const areas = (card) => [...card.querySelectorAll('.ts-areas li')].map((li) => `${text(li.firstElementChild)}: ${text(li.lastElementChild)}`);
const missingLine = () => text([...outlet.querySelectorAll('.tab-body > p.small')].find((p) => text(p).startsWith('Non hanno segnato ore:')));
const days = () => [...outlet.querySelectorAll('.ts-day')];
const dayTitles = () => days().map((d) => text(d.querySelector('h2')));
const rowsOf = (i) => [...days()[i].querySelectorAll('.ts-row')];
const addButton = (i) => byText(days()[i], 'button', 'Aggiungi ore');
const timesOf = (row) => [...row.querySelectorAll('.ts-time')].map((el) => el.value);
const dayTotals = () => av.DAY_KEYS.map((key) => text(outlet.querySelector(`[data-day-total="${key}"]`)));
const total = () => text(outlet.querySelector('.ts-total'));
const pledgeInput = () => outlet.querySelector('.ts-pledge-input');
const saveButton = () => byText(outlet, 'button', 'Salva le mie ore');
const saveStatus = () => text(outlet.querySelector('.save-bar [role="status"]'));
const problemBox = () => outlet.querySelector('.save-bar .ts-problem');
const problem = () => text(problemBox());
const invalid = () => [...outlet.querySelectorAll('[aria-invalid]')].map((el) => `${el.dataset.focus}=${el.getAttribute('aria-invalid')}`);
const toasts = () => text(document.querySelector('.toasts'));
const controls = () => [...outlet.querySelectorAll('.ts-day input, .ts-day select, .ts-day button, .ts-pledge-input, .av-week button')];

function setInput(el, value) {
  el.value = value;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
}

function blur(el) {
  el.dispatchEvent(new window.Event('blur'));
}

// Si scrive l'orario e si esce dal campo, come fa una persona.
function fillRow(row, start, end, area) {
  const [startInput, endInput] = row.querySelectorAll('.ts-time');
  if (start !== undefined) {
    setInput(startInput, start);
    blur(startInput);
  }
  if (end !== undefined) {
    setInput(endInput, end);
    blur(endInput);
  }
  if (area) setInput(row.querySelector('.ts-area'), area);
  return row;
}

function addFilled(day, start, end, area) {
  addButton(day).click();
  return fillRow(rowsOf(day).at(-1), start, end, area);
}

function focusOn(el) {
  el.focus();
  assert.equal(document.activeElement, el);
  return el;
}

function unload() {
  const event = new window.Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

async function leaveTo(hash) {
  const attempt = router.render(hash);
  await flush();
  byText(document.querySelector('dialog'), 'button', 'Esci').click();
  await attempt;
  await flush();
}

async function save() {
  saveButton().click();
  await flush(10);
}

function fakeCreate(calls) {
  api.createItem = async (args) => {
    calls.push(args);
    return item({ id: NEW_ID, kind: args.kind, title: args.title, data: args.data, updated_at: new Date().toISOString() });
  };
}

function saved(args) {
  const current = store.getItem(args.id);
  return { status: 'ok', item: item({ ...current, title: args.snapshot.title, data: args.snapshot.data, version: current.version + 1, updated_at: new Date().toISOString() }) };
}

function fakeSave(calls) {
  api.saveItem = async (args) => {
    calls.push(args);
    return saved(args);
  };
}

// Come il server: se la versione di partenza non è l'ultima risponde «conflitto».
function serverSave(calls) {
  api.saveItem = async (args) => {
    calls.push(args);
    const current = store.getItem(args.id);
    if (args.baseVersion !== current.version) return { status: 'conflict', item: current };
    return saved(args);
  };
}

function slowSave(calls) {
  const pending = [];
  api.saveItem = (args) => {
    calls.push(args);
    return new Promise((resolve) => pending.push(() => resolve(saved(args))));
  };
  return () => pending.shift()();
}

// Solo i timer lunghi (quello di mezzanotte) sono finti: quelli brevi, come quelli di flush, restano veri.
function holdLongTimers() {
  const ticks = [];
  const cleared = [];
  globalThis.setTimeout = (fn, ms, ...rest) => {
    if (!(ms > 60 * 1000)) return RealSetTimeout(fn, ms, ...rest);
    const handle = { tick: ticks.length };
    ticks.push({ fn, ms, handle });
    return handle;
  };
  globalThis.clearTimeout = (handle) => {
    cleared.push(handle);
    return RealClearTimeout(handle);
  };
  return { ticks, cleared };
}

test('the team view of last week shows hours per day, total against the pledge and areas', async () => {
  store.applyItem(item({ id: MINE, kind: 'timesheet', title: 'Ore lavorate', data: { week: lastWeek, pledge: 480, entries: [{ id: 'a1', day: 'lun', start: 900, end: 1050, area: 'clienti', note: '3 interviste' }] } }));
  store.applyItem(item({ id: THEIRS, kind: 'timesheet', title: 'Ore lavorate', created_by: OTHER, updated_by: OTHER, data: { week: lastWeek, entries: [{ id: 'b1', day: 'mar', start: 600, end: 720, area: 'prodotto' }] } }));
  const body = await visit(`#/squadra/ore?settimana=${lastWeek}`);
  const rows = teamRows();
  assert.equal(rows.length, 2, 'gli advisor non hanno una riga');
  assert.deepEqual(rows[0], ['ANAnna', '2 h 30', '-', '-', '-', '-', '-', '-', '2 h 30 su 8 h']);
  assert.deepEqual(rows[1], ['BRBruno', '-', '2 h', '-', '-', '-', '-', '-', '2 h']);
  assert.match(body, /Clienti e vendite/);
  outlet.querySelector('.ts-detail summary').click();
  assert.match(text(outlet.querySelector('.ts-detail')), /Lunedì .*, 15:00-17:30 · Clienti e vendite · 3 interviste/);
});

test('in «Le mie ore» a new row needs times, then the first save creates the week', async () => {
  const calls = [];
  api.createItem = async (args) => {
    calls.push(args);
    return item({ id: NEW_ID, kind: args.kind, title: args.title, data: args.data });
  };
  await visit(`#/squadra/ore?vista=mie&settimana=${lastWeek}`);
  byText(outlet.querySelector('.ts-day'), 'button', 'Aggiungi ore').click();
  await flush();
  saveButton().click();
  await flush();
  assert.equal(problem(), 'Lunedì: in una riga manca l\'ora di inizio o di fine.');
  assert.equal(calls.length, 0);
  const [start, end] = outlet.querySelectorAll('.ts-row .ts-time');
  start.value = '15:07';
  start.dispatchEvent(new Event('change'));
  end.value = '17:30';
  end.dispatchEvent(new Event('change'));
  assert.equal(start.value, '15:07', 'mentre si scrive il campo resta com\'è');
  start.dispatchEvent(new Event('blur'));
  assert.equal(start.value, '15:00');
  saveButton().click();
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, 'timesheet');
  assert.equal(calls[0].title, 'Ore lavorate');
  assert.equal(calls[0].data.week, lastWeek);
  assert.deepEqual(calls[0].data.entries.map(({ day, start: s, end: e, area }) => [day, s, e, area]), [['lun', 900, 1050, 'prodotto']]);
});

// Pagina Squadra

test('the Squadra tabs include «Ore lavorate» with the team view and «Le mie ore»', async () => {
  await visit(TEAM);
  const tabs = [...outlet.querySelectorAll('.tabs:not(.subtabs) .tab')];
  assert.deepEqual(tabs.map(text), ['Team Canvas', 'Divisione delle quote', 'Disponibilità', 'Ore lavorate']);
  assert.equal(tabs[3].getAttribute('href'), '#/squadra/ore');
  const active = outlet.querySelector('.tab.is-active');
  assert.equal(text(active), 'Ore lavorate');
  assert.equal(active.getAttribute('aria-current'), 'page');
  assert.equal(text(outlet.querySelector('h1')), 'Squadra');
  assert.equal(
    text(outlet.querySelector('.page-subtitle')),
    'Il team che costruisce l\'azienda: chi siamo, come lavoriamo, quando siamo liberi, quante ore dedichiamo e come dividiamo le quote.',
  );
  assert.equal(outlet.querySelector('.page-actions'), null);

  const views = () => outlet.querySelector('.tab-body').firstElementChild;
  assert.ok(views().matches('nav.tabs.subtabs'));
  assert.equal(views().getAttribute('aria-label'), 'Vista');
  let modes = [...views().querySelectorAll('.tab')];
  assert.deepEqual(modes.map(text), ['Ore della squadra', 'Le mie ore']);
  assert.deepEqual(modes.map((a) => a.getAttribute('href')), [teamView(monday), mineView(monday)]);
  assert.deepEqual(modes.map((a) => a.getAttribute('aria-current')), ['page', null]);
  assert.ok(outlet.querySelector('.ts-table'));
  assert.equal(outlet.querySelector('.ts-day'), null);
  assert.equal(byText(outlet, 'a', 'Segna le tue ore').getAttribute('href'), mineView(monday));

  weekButton('Settimana precedente').click();
  modes = [...views().querySelectorAll('.tab')];
  assert.deepEqual(modes.map((a) => a.getAttribute('href')), [teamView(lastWeek), mineView(lastWeek)]);
  assert.equal(byText(outlet, 'a', 'Segna le tue ore').getAttribute('href'), mineView(lastWeek));

  document.body.append(outlet);
  byText(views(), '.tab', 'Le mie ore').click();
  await flush(5);
  assert.equal(location.hash, mineView(lastWeek));
  assert.equal(outlet.querySelectorAll('.ts-day').length, 7);
  assert.equal(outlet.querySelector('.ts-table'), null);
  assert.equal(weekTitle(), 'La settimana scorsa');
  assert.equal(views().querySelector('[aria-current="page"]'), byText(views(), '.tab', 'Le mie ore'));
  assert.equal(text(outlet.querySelector('.tab.is-active')), 'Ore lavorate');

  await visit('#/squadra/ore?vista=altro');
  assert.ok(outlet.querySelector('.ts-table'), 'una vista sconosciuta mostra la squadra');
});

test('advisors see only the team view, also when they ask for «Le mie ore»', async () => {
  store.state.user = { id: ADVISOR };
  store.setMembers(members());
  mine({ week: lastWeek, entries: [entry('a1', 'lun', 540, 600)] });
  timesheet(ADVISOR_ITEM, ADVISOR, { week: lastWeek, entries: [entry('c1', 'ven', 600, 660, 'numeri')] });
  for (const hash of [teamView(lastWeek), mineView(lastWeek)]) {
    const body = await visit(hash);
    assert.ok(outlet.querySelector('.ts-table'), hash);
    assert.equal(outlet.querySelector('.ts-day, .ts-pledge-input, .save-bar'), null, hash);
    assert.equal(outlet.querySelector('nav.subtabs'), null, hash);
    assert.doesNotMatch(body, /Le mie ore|Segna le tue ore/, hash);
    assert.equal(weekTitle(), 'La settimana scorsa', hash);
    assert.deepEqual(teamRows().map((row) => row[0]), ['ANAnna', 'BRBruno'], 'le ore degli advisor non sono nella tabella');
    assert.doesNotMatch(body, /Numeri e amministrazione/);
  }
  assert.equal(unload(), false);
});

test('?settimana opens a past week and falls back to this week when it is not a Monday, in the future or too old', async () => {
  // Di mercoledì nessun lunedì è «oggi».
  setClock(2, 12);
  const oldest = av.addDays(monday, -7 * 51);
  const cases = [
    [lastWeek, 'La settimana scorsa', lastWeek],
    [oldest, '51 settimane fa', oldest],
    [av.addDays(oldest, -7), 'Questa settimana', monday],
    [av.addDays(lastWeek, 1), 'Questa settimana', monday],
    [av.addDays(lastWeek, 6), 'Questa settimana', monday],
    [av.addDays(monday, 7), 'Questa settimana', monday],
    ['2026-02-30', 'Questa settimana', monday],
    ['<script>', 'Questa settimana', monday],
    ['', 'Questa settimana', monday],
  ];
  for (const [asked, title, shown] of cases) {
    await visit(teamView(asked));
    assert.equal(weekTitle(), title, asked);
    assert.equal(weekRange(), av.weekLabel(shown), asked);
    assert.equal(text(outlet.querySelector('.ts-table thead th:nth-child(2) .av-date')), av.shortDate(shown), asked);
    await visit(mineView(asked));
    assert.equal(weekTitle(), title, asked);
    assert.equal(dayTitles()[0], `Lunedì ${av.shortDate(shown)}`, asked);
  }
});

test('week navigation goes back at most 51 weeks, never past this week, and keeps the focus on the arrows', async () => {
  document.body.append(outlet);
  await visit(TEAM);
  const title = outlet.querySelector('.av-week-title');
  assert.equal(title.getAttribute('aria-live'), 'polite');
  assert.equal(weekTitle(), 'Questa settimana');
  assert.equal(weekRange(), av.weekLabel(monday));
  assert.deepEqual(arrows().map((b) => [b.disabled, b.dataset.edge]), [[false, 'false'], [true, 'true']]);
  weekButton('Settimana successiva').click();
  assert.equal(weekTitle(), 'Questa settimana');

  let old = focusOn(weekButton('Settimana precedente'));
  old.click();
  assert.equal(weekTitle(), 'La settimana scorsa');
  assert.notEqual(document.activeElement, old, 'la pagina è stata ridisegnata');
  assert.equal(document.activeElement.dataset.focus, 'week-prev');
  weekButton('Settimana precedente').click();
  assert.equal(weekTitle(), '2 settimane fa');
  assert.equal(weekRange(), av.weekLabel(av.addDays(monday, -14)));

  old = focusOn(weekButton('Settimana successiva'));
  old.click();
  old = focusOn(weekButton('Settimana successiva'));
  old.click();
  assert.equal(weekTitle(), 'Questa settimana');
  assert.equal(document.activeElement.dataset.focus, 'week-prev', 'la freccia disattivata passa il focus all\'altra');

  const oldest = av.addDays(monday, -7 * 51);
  await visit(teamView(av.addDays(oldest, 7)));
  assert.equal(weekTitle(), '50 settimane fa');
  weekButton('Settimana precedente').click();
  assert.equal(weekTitle(), '51 settimane fa');
  assert.deepEqual(arrows().map((b) => [b.disabled, b.dataset.edge]), [[true, 'true'], [false, 'false']]);
  weekButton('Settimana precedente').click();
  assert.equal(weekRange(), av.weekLabel(oldest));
  assert.equal(text(outlet.querySelector('.ts-table thead th:nth-child(2) .av-date')), av.shortDate(oldest));
});

test('the address follows the week shown, in both views, without new history entries', async () => {
  document.body.append(outlet);
  history.replaceState(null, '', TEAM);
  await visit(TEAM);
  const state = history.state;
  const length = history.length;
  weekButton('Settimana precedente').click();
  assert.equal(location.hash, teamView(lastWeek));
  weekButton('Settimana precedente').click();
  assert.equal(location.hash, teamView(av.addDays(lastWeek, -7)));
  weekButton('Settimana successiva').click();
  assert.equal(location.hash, teamView(lastWeek));
  assert.deepEqual(history.state, state, 'la voce della cronologia resta la stessa');
  assert.equal(history.length, length);

  byText(outlet.querySelector('nav.subtabs'), '.tab', 'Le mie ore').click();
  await flush(5);
  assert.equal(location.hash, mineView(lastWeek));
  weekButton('Settimana successiva').click();
  await flush();
  assert.equal(location.hash, mineView(monday));
  assert.equal(weekTitle(), 'Questa settimana');
  weekButton('Settimana precedente').click();
  weekButton('Settimana precedente').click();
  await flush();
  assert.equal(location.hash, mineView(av.addDays(lastWeek, -7)));
  assert.equal(weekTitle(), '2 settimane fa');
  assert.equal(history.length, length);
  assert.equal(byText(outlet.querySelector('nav.subtabs'), '.tab', 'Ore della squadra').getAttribute('href'), teamView(av.addDays(lastWeek, -7)));

  // Ricaricando si resta sulla settimana scelta.
  await visit(location.hash);
  assert.equal(weekTitle(), '2 settimane fa');
});

test('going back to the address the page was opened with asks before dropping unsaved hours', async () => {
  await visit(mineView(lastWeek));
  weekButton('Settimana successiva').click();
  assert.equal(location.hash, mineView(monday));
  addFilled(0, '09:00', '10:00');
  const attempt = router.render(mineView(lastWeek));
  await flush();
  const dialog = document.querySelector('dialog');
  if (dialog) byText(dialog, 'button', 'Annulla').click();
  await attempt;
  assert.ok(dialog, 'prima di perdere le ore non salvate chiede');
  assert.equal(rowsOf(0).length, 1);
});

// Vista della squadra

test('with no hours logged the team view says so for everyone', async () => {
  await visit(TEAM);
  const empty = ['-', '-', '-', '-', '-', '-', '-'];
  assert.deepEqual(teamRows(), [['ANAnna', ...empty, '0 h'], ['BRBruno', ...empty, '0 h']]);
  const cells = [...outlet.querySelectorAll('.ts-table tbody td:not(.ts-sum)')];
  assert.equal(cells.length, 14);
  for (const td of cells) {
    assert.equal(td.querySelector('[aria-hidden="true"]').textContent, '-');
    assert.equal(td.querySelector('.sr-only').textContent, 'nessuna ora');
  }
  assert.deepEqual(
    [...outlet.querySelectorAll('.ts-table thead th')].map(text),
    ['Persona', ...av.DAY_KEYS.map((key, i) => `${key}${av.shortDate(av.addDays(monday, i))}`), 'Totale'],
  );
  const scroller = outlet.querySelector('.av-scroll');
  assert.equal(scroller.querySelector('.ts-table'), outlet.querySelector('.ts-table'));
  assert.deepEqual(
    ['tabindex', 'role', 'aria-label'].map((name) => scroller.getAttribute(name)),
    ['0', 'region', `Ore della squadra ${av.weekLabel(monday)}`],
  );
  assert.equal(missingLine(), 'Non hanno segnato ore: Anna, Bruno.');
  assert.equal(text(byText(outlet, '.card', 'Ultime 12 settimane').querySelector('p')), 'Le colonne sono le ore segnate, il segno orizzontale le ore dichiarate.');
  for (const name of ['Anna', 'Bruno']) {
    assert.equal(average(name), 'nessuna settimana segnata');
    assert.equal(person(name).querySelector('svg').getAttribute('aria-label'), chartLabel(name, monday));
    assert.equal(person(name).querySelectorAll('rect, .ts-pledge-mark').length, 0);
    const axis = person(name).querySelector('.ts-history-axis');
    assert.equal(axis.getAttribute('aria-hidden'), 'true');
    assert.deepEqual([...axis.children].map(text), [av.shortDate(av.addDays(monday, -77)), av.shortDate(monday)]);
  }
  assert.deepEqual(areaCards().map((card) => text(card.querySelector('h2'))), ['Per area, questa settimana', 'Per area, ultime 12 settimane']);
  assert.ok(areaCards().every((card) => text(card.querySelector('p')) === 'Nessuna ora segnata.'));
  assert.equal(outlet.querySelector('.ts-detail'), null);
  const heading = byText(outlet, 'h2', 'Giorno per giorno');
  assert.equal(text(heading.nextElementSibling), 'Nessuna ora segnata in questa settimana.');
});

test('the team view shows per person the week, the carried pledge, a 12 week chart, the areas and the details', async () => {
  const twoWeeks = av.addDays(lastWeek, -7);
  mine({
    week: lastWeek,
    pledge: 600,
    entries: [entry('a1', 'lun', 540, 660), entry('a2', 'lun', 900, 990, 'clienti'), entry('a3', 'mer', 600, 720, 'ricerca', 'Due interviste')],
  });
  timesheet(BRUNO_OLDER, OTHER, { week: twoWeeks, pledge: 300, entries: [entry('b1', 'gio', 600, 645, 'altro')] });
  timesheet(ADVISOR_ITEM, ADVISOR, { week: lastWeek, entries: [entry('c1', 'ven', 600, 660, 'numeri')] });
  await visit(teamView(lastWeek));

  assert.deepEqual(teamRows(), [
    ['ANAnna', '3 h 30', '-', '2 h', '-', '-', '-', '-', '5 h 30 su 10 h'],
    ['BRBruno', '-', '-', '-', '-', '-', '-', '-', '0 h su 5 h'],
  ]);
  assert.equal(outlet.querySelector('.av-scroll').getAttribute('aria-label'), `Ore della squadra ${av.weekLabel(lastWeek)}`);
  const bars = [...outlet.querySelectorAll('.ts-bar')];
  assert.equal(outlet.querySelectorAll('.ts-table .ts-sum .ts-bar').length, 2);
  assert.ok(bars.length > 2);
  for (const b of bars) {
    assert.equal(b.tagName, 'SPAN');
    assert.equal(b.getAttribute('aria-hidden'), 'true', 'accanto c\'è già il testo con gli stessi numeri');
    assert.equal(b.getAttribute('role'), null);
    assert.equal(b.getAttribute('aria-label'), null);
  }
  assert.equal(missingLine(), 'Non hanno segnato ore: Bruno.');

  const anna = person('Anna');
  assert.equal(anna.querySelector('svg').getAttribute('aria-label'), chartLabel('Anna', lastWeek, { [lastWeek]: '5 h 30 su 10 h' }));
  assert.equal(anna.querySelector('svg').getAttribute('role'), 'img');
  assert.deepEqual([...anna.querySelectorAll('.ts-history-axis span')].map(text), [av.shortDate(weeksUpTo(lastWeek)[0]), av.shortDate(lastWeek)]);
  const annaBars = [...anna.querySelectorAll('rect')];
  assert.equal(annaBars.length, 1);
  assert.ok(annaBars[0].classList.contains('ts-col-now'));
  assert.equal(text(annaBars[0].querySelector('title')), `${av.weekLabel(lastWeek)}: 5 h 30 su 10 h`);
  assert.equal(anna.querySelectorAll('.ts-pledge-mark').length, 1, 'prima della prima dichiarazione non c\'è il segno');
  assert.equal(average('Anna'), 'in media 5 h 30 nelle settimane segnate');

  const brunoChart = person('Bruno');
  assert.equal(brunoChart.querySelector('svg').getAttribute('aria-label'), chartLabel('Bruno', lastWeek, { [twoWeeks]: '45 min su 5 h', [lastWeek]: '0 h su 5 h' }));
  assert.equal(brunoChart.querySelectorAll('rect').length, 1);
  assert.ok(!brunoChart.querySelector('rect').classList.contains('ts-col-now'));
  assert.equal(brunoChart.querySelectorAll('.ts-pledge-mark').length, 2, 'le ore dichiarate valgono anche la settimana dopo');
  assert.equal(average('Bruno'), 'in media 45 min nelle settimane segnate');
  assert.equal(person('Chiara'), undefined);

  const [weekCard, historyCard] = areaCards();
  assert.equal(text(weekCard.querySelector('h2')), `Per area, ${av.weekLabel(lastWeek)}`);
  assert.deepEqual(areas(weekCard), ['Prodotto e tecnologia: 2 h', 'Ricerca e interviste: 2 h', 'Clienti e vendite: 1 h 30']);
  assert.deepEqual(areas(historyCard), ['Prodotto e tecnologia: 2 h', 'Ricerca e interviste: 2 h', 'Clienti e vendite: 1 h 30', 'Altro: 45 min']);
  assert.doesNotMatch(text(outlet), /Numeri e amministrazione/, 'le ore degli advisor non contano');

  const details = [...outlet.querySelectorAll('.ts-detail')];
  assert.equal(details.length, 1, 'solo chi ha ore nella settimana');
  assert.equal(text(details[0].querySelector('summary')), 'Anna, 5 h 30');
  assert.equal(details[0].querySelector('summary').dataset.focus, `detail-${ME}`);
  const wednesday = av.addDays(lastWeek, 2);
  assert.deepEqual([...details[0].querySelectorAll('li')].map(text), [
    `Lunedì ${av.shortDate(lastWeek)}, 09:00-11:00 · Prodotto e tecnologia`,
    `Lunedì ${av.shortDate(lastWeek)}, 15:00-16:30 · Clienti e vendite`,
    `Mercoledì ${av.shortDate(wednesday)}, 10:00-12:00 · Ricerca e interviste · Due interviste`,
  ]);

  // Due settimane fa: Bruno ha le sue ore, Anna non aveva ancora dichiarato nulla.
  weekButton('Settimana precedente').click();
  assert.deepEqual(teamRows(), [
    ['ANAnna', '-', '-', '-', '-', '-', '-', '-', '0 h'],
    ['BRBruno', '-', '-', '-', '45 min', '-', '-', '-', '45 min su 5 h'],
  ]);
  assert.equal(person('Anna').querySelector('svg').getAttribute('aria-label'), chartLabel('Anna', twoWeeks));
  assert.equal(person('Bruno').querySelector('svg').getAttribute('aria-label'), chartLabel('Bruno', twoWeeks, { [twoWeeks]: '45 min su 5 h' }));
  assert.deepEqual(areas(areaCards()[1]), ['Altro: 45 min'], 'le 12 settimane finiscono con quella scelta');
});

test('malformed hours from the server are cleaned before they are shown', async () => {
  bruno({
    week: lastWeek,
    pledge: 7,
    entries: [
      entry('ok1', 'lun', 600, 660, 'hack', 'x'.repeat(300)),
      entry('BAD!', 'lun', 0, 60),
      entry('ok2', 'xyz', 0, 60),
      entry('ok3', 'mar', 605, 660),
      entry('ok4', 'mar', 700, 690),
      entry('ok1', 'mer', 0, 60),
      entry('ok5', 'gio', -15, 60),
      entry('ok6', 'gio', 0, 1455),
      'testo',
      null,
      [600, 660],
    ],
  });
  timesheet(OLDER, ME, { week: av.addDays(lastWeek, 1), entries: [entry('n1', 'lun', 540, 600)] });
  await visit(teamView(lastWeek));
  assert.deepEqual(teamRows(), [
    ['ANAnna', '-', '-', '-', '-', '-', '-', '-', '0 h'],
    ['BRBruno', '1 h', '-', '-', '-', '-', '-', '-', '1 h'],
  ]);
  assert.deepEqual(areas(areaCards()[0]), ['Altro: 1 h']);
  assert.deepEqual([...outlet.querySelectorAll('.ts-detail li')].map(text), [`Lunedì ${av.shortDate(lastWeek)}, 10:00-11:00 · Altro · ${'x'.repeat(140)}`]);
});

test('the team view follows live saves and member changes, keeps the week and ignores other kinds', async () => {
  await visit(teamView(lastWeek));
  assert.equal(teamRows()[1].at(-1), '0 h');
  bruno({ week: lastWeek, entries: [entry('b1', 'ven', 600, 690)] });
  assert.deepEqual(teamRows()[1], ['BRBruno', '-', '-', '-', '-', '1 h 30', '-', '-', '1 h 30']);
  assert.equal(weekTitle(), 'La settimana scorsa');
  assert.equal(missingLine(), 'Non hanno segnato ore: Anna.');

  const table = outlet.querySelector('.ts-table');
  store.applyItem(item({ id: NEW_ID, kind: 'idea', title: 'Idea nuova', data: {} }));
  assert.equal(outlet.querySelector('.ts-table'), table);

  bruno({ week: lastWeek, entries: [entry('b1', 'ven', 600, 690)] }, { version: 2, deleted_at: '2026-10-20T10:00:00Z' });
  assert.equal(teamRows()[1].at(-1), '0 h', 'un elemento archiviato non conta');

  api.membersOverview = async () => members().filter((m) => m.user_id !== OTHER);
  await store.reloadMembers();
  assert.deepEqual(teamRows().map((row) => row[0]), ['ANAnna']);
  assert.equal(weekTitle(), 'La settimana scorsa');
});

test('open details stay open and keep the focus when the team view is redrawn', async () => {
  document.body.append(outlet);
  mine({ week: lastWeek, entries: [entry('a1', 'lun', 540, 600)] });
  bruno({ week: lastWeek, entries: [entry('b1', 'mar', 600, 660)] });
  await visit(teamView(lastWeek));
  const summaries = () => [...outlet.querySelectorAll('.ts-detail summary')];
  const opened = () => [...outlet.querySelectorAll('.ts-detail')].map((d) => d.open);
  assert.deepEqual(summaries().map((s) => s.dataset.focus), [`detail-${ME}`, `detail-${OTHER}`]);
  assert.deepEqual(opened(), [false, false]);

  focusOn(summaries()[1]).click();
  await flush();
  const old = summaries()[1];
  bruno({ week: lastWeek, entries: [entry('b1', 'mar', 600, 720)] }, { version: 2 });
  assert.notEqual(summaries()[1], old, 'la pagina è stata ridisegnata');
  assert.deepEqual(opened(), [false, true]);
  assert.equal(text(summaries()[1]), 'Bruno, 2 h');
  assert.equal(document.activeElement, summaries()[1], 'il focus resta sul riepilogo');

  summaries()[1].click();
  summaries()[0].click();
  await flush();
  bruno({ week: lastWeek, entries: [entry('b1', 'mar', 600, 780)] }, { version: 3 });
  assert.deepEqual(opened(), [true, false], 'quelli chiusi restano chiusi');
});

test('the team table keeps its horizontal scroll when the page is redrawn', async () => {
  await visit(teamView(lastWeek));
  const scroller = outlet.querySelector('.av-scroll');
  scroller.scrollLeft = 120;
  scroller.dispatchEvent(new window.Event('scroll'));
  bruno({ week: lastWeek, entries: [entry('b1', 'mar', 600, 660)] });
  assert.notEqual(outlet.querySelector('.av-scroll'), scroller);
  assert.equal(outlet.querySelector('.av-scroll').scrollLeft, 120);
  await store.reloadMembers();
  assert.equal(outlet.querySelector('.av-scroll').scrollLeft, 120);
});

test('names and notes are rendered as text, never as HTML', async () => {
  store.setMembers(members().map((m) => (m.user_id === OTHER ? { ...m, display_name: `Bruno ${XSS}` } : m)));
  bruno({ week: lastWeek, entries: [entry('b1', 'lun', 600, 660, 'altro', XSS)] });
  mine({ week: lastWeek, entries: [entry('a1', 'mar', 600, 660, 'prodotto', `Nota ${XSS}`)] });
  await visit(teamView(lastWeek));
  assert.ok(teamRows()[1][0].endsWith(`Bruno ${XSS}`));
  assert.ok(person(`Bruno ${XSS}`).querySelector('svg').getAttribute('aria-label').startsWith(`Bruno ${XSS}, dalla settimana più vecchia`));
  assert.ok(missingLine() === '');
  const details = [...outlet.querySelectorAll('.ts-detail')].map(text);
  assert.ok(details.some((t) => t.includes(`Bruno ${XSS}, 1 h`) && t.includes(`· Altro · ${XSS}`)));
  assert.equal(outlet.querySelector('img, script'), null);

  await visit(mineView(lastWeek));
  assert.equal(rowsOf(1)[0].querySelector('.ts-note').value, `Nota ${XSS}`);
  assert.equal(outlet.querySelector('img, script'), null);
  assert.equal(window.__xss, undefined);
});

// Le mie ore

test('«Le mie ore» explains how to log hours and labels days, rows and fields', async () => {
  document.body.append(outlet);
  await visit(mineView(lastWeek));
  assert.deepEqual([...outlet.querySelectorAll('.tab-body > p')].map(text), [
    'Per ogni giorno segna da che ora a che ora hai lavorato al progetto e su cosa. Gli orari vanno al quarto d\'ora. Puoi farlo a fine giornata o a fine settimana.',
    'Le note le vede tutto il team, advisor compresi, e restano nello storico.',
  ]);
  assert.equal(days().length, 7);
  assert.deepEqual(dayTitles(), av.DAYS.map(([, name], i) => `${capital(name)} ${av.shortDate(av.addDays(lastWeek, i))}`));
  for (const day of days()) {
    const heading = day.querySelector('h2');
    assert.equal(day.tagName, 'SECTION');
    assert.equal(day.getAttribute('aria-labelledby'), heading.id);
    assert.equal(outlet.querySelectorAll(`[id="${heading.id}"]`).length, 1);
  }
  const add = addButton(0);
  assert.equal(add.getAttribute('aria-label'), 'Aggiungi ore a lunedì');
  assert.equal(text(add), 'Aggiungi ore');

  add.click();
  const row = rowsOf(0)[0];
  assert.equal(row.getAttribute('role'), 'group');
  assert.equal(row.getAttribute('aria-label'), 'Lunedì, riga 1');
  assert.deepEqual([...row.querySelectorAll('input, select')].map((el) => el.getAttribute('aria-label')), ['Inizio', 'Fine', 'Area', 'Nota']);
  assert.deepEqual([...row.querySelectorAll('.ts-time')].map((el) => [el.type, el.step]), [['time', '900'], ['time', '900']]);
  assert.equal(row.querySelector('.ts-remove').getAttribute('aria-label'), 'Togli la riga 1 di lunedì');
  assert.deepEqual(
    [...row.querySelector('.ts-area').options].map((o) => [o.value, o.textContent, o.title]),
    [
      ['prodotto', 'Prodotto', 'Prodotto e tecnologia'],
      ['clienti', 'Clienti', 'Clienti e vendite'],
      ['numeri', 'Numeri', 'Numeri e amministrazione'],
      ['ricerca', 'Ricerca', 'Ricerca e interviste'],
      ['altro', 'Altro', 'Altro'],
    ],
  );
  fillRow(row, '09:00', '10:00');
  addButton(0).click();
  assert.deepEqual(rowsOf(0).map((r) => r.getAttribute('aria-label')), ['Lunedì, riga 1', 'Lunedì, riga 2']);
  assert.equal(rowsOf(0)[1].querySelector('.ts-remove').getAttribute('aria-label'), 'Togli la riga 2 di lunedì');
});

test('a new row starts at the latest end of its day with the area of that row, and rows are drawn by start', async () => {
  document.body.append(outlet);
  await visit(mineView(lastWeek));
  assert.equal(saveButton().disabled, true);
  assert.equal(saveStatus(), 'Nessuna ora segnata in questa settimana');

  addButton(2).click();
  assert.deepEqual(timesOf(rowsOf(2)[0]), ['', ''], 'senza giorni prima con ore la riga parte vuota');
  assert.equal(rowsOf(2)[0].querySelector('.ts-area').value, 'prodotto');
  rowsOf(2)[0].querySelector('.ts-remove').click();
  assert.equal(document.activeElement, addButton(2));

  addButton(0).click();
  let row = rowsOf(0)[0];
  assert.deepEqual(timesOf(row), ['', '']);
  assert.equal(row.querySelector('.ts-area').value, 'prodotto');
  assert.equal(document.activeElement, row.querySelector('.ts-time'), 'il focus va sull\'inizio della riga nuova');
  assert.equal(saveStatus(), 'Modifiche non salvate');
  fillRow(row, '09:00', '10:30', 'clienti');

  addButton(0).click();
  row = rowsOf(0)[1];
  assert.deepEqual(timesOf(row), ['10:30', '11:30']);
  assert.equal(row.querySelector('.ts-area').value, 'clienti');
  assert.equal(document.activeElement, row.querySelector('.ts-time'));
  assert.equal(document.activeElement.dataset.focus, `row-${row.dataset.id}-start`);
  assert.match(row.dataset.id, /^[a-z0-9]{1,16}$/);
  assert.notEqual(row.dataset.id, rowsOf(0)[0].dataset.id);
  fillRow(row, undefined, undefined, 'ricerca');

  addButton(0).click();
  fillRow(rowsOf(0)[2], '07:00', '08:00', 'altro');
  addButton(0).click();
  assert.deepEqual(rowsOf(0).map(timesOf), [['07:00', '08:00'], ['09:00', '10:30'], ['10:30', '11:30'], ['11:30', '12:30']], 'le righe sono in ordine di inizio');
  assert.deepEqual(rowsOf(0).map((r) => r.querySelector('.ts-area').value), ['altro', 'clienti', 'ricerca', 'ricerca'], 'l\'area è quella della riga che finisce per ultima');
  assert.equal(document.activeElement, rowsOf(0)[3].querySelector('.ts-time'));
  assert.deepEqual(rowsOf(0).map((r) => r.getAttribute('aria-label')), ['Lunedì, riga 1', 'Lunedì, riga 2', 'Lunedì, riga 3', 'Lunedì, riga 4']);

  addButton(1).click();
  fillRow(rowsOf(1)[0], '22:30', '23:30', 'ricerca');
  addButton(1).click();
  assert.deepEqual(timesOf(rowsOf(1)[1]), ['23:30', '00:00'], 'la riga nuova si ferma a mezzanotte');
  assert.equal(rowsOf(1)[1].querySelector('.ts-area').value, 'ricerca');
  addButton(1).click();
  assert.deepEqual(timesOf(rowsOf(1)[2]), ['', ''], 'dopo una riga fino a mezzanotte l\'inizio resta da scegliere');
  assert.equal(rowsOf(1)[2].querySelector('.ts-area').value, 'ricerca');
  assert.equal(rowsOf(0).length, 4, 'gli altri giorni non cambiano');
});

test('the first row of an empty day copies the earliest row of the closest earlier day with complete rows', async () => {
  mine({ week: lastWeek, entries: [entry('a1', 'lun', 540, 600, 'clienti'), entry('a2', 'lun', 660, 720, 'ricerca'), entry('c1', 'ven', 840, 900, 'numeri')] });
  await visit(mineView(lastWeek));
  addButton(0).click();
  assert.deepEqual(timesOf(rowsOf(0).at(-1)), ['12:00', '13:00']);
  fillRow(rowsOf(0).at(-1), '07:00', '08:00', 'altro');

  const first = (i) => [...timesOf(rowsOf(i)[0]), rowsOf(i)[0].querySelector('.ts-area').value];
  addButton(1).click();
  assert.deepEqual(first(1), ['07:00', '08:00', 'altro'], 'la prima riga del giorno prima, non l\'ultima scritta');
  fillRow(rowsOf(1)[0], '13:00', '14:00', 'clienti');

  addButton(2).click();
  assert.deepEqual(first(2), ['13:00', '14:00', 'clienti'], 'vale il giorno più vicino');
  fillRow(rowsOf(2)[0], undefined, '');

  addButton(3).click();
  assert.deepEqual(first(3), ['13:00', '14:00', 'clienti'], 'un giorno con solo righe a metà non conta');

  addButton(6).click();
  assert.deepEqual(first(6), ['14:00', '15:00', 'numeri'], 'un giorno vuoto si salta');
});

test('the add button is offered only for today and the days before it', async () => {
  setClock(2, 12);
  await visit(TEAM);
  await visit('#/squadra/ore?vista=mie');
  assert.equal(weekTitle(), 'Questa settimana');
  assert.deepEqual(days().map((d) => Boolean(addButton(days().indexOf(d)))), [true, true, true, false, false, false, false]);
  assert.deepEqual(days().map((d) => d.classList.contains('is-future')), [false, false, false, true, true, true, true]);
  assert.deepEqual(dayTitles().map((t) => t.endsWith(' · oggi')), [false, false, true, false, false, false, false]);
  assert.equal(dayTitles()[2], `Mercoledì ${av.shortDate(av.addDays(monday, 2))} · oggi`);
  assert.match(total(), /^Questa settimana: 0 h$/);

  setClock(0, 0, 1);
  await visit(mineView(monday));
  assert.deepEqual(days().map((_, i) => Boolean(addButton(i))), [true, false, false, false, false, false, false]);

  setClock(6, 23, 59);
  await visit(mineView(monday));
  assert.ok(days().every((_, i) => addButton(i)));

  setClock(0, 9);
  await visit(mineView(lastWeek));
  assert.ok(days().every((_, i) => addButton(i)), 'le settimane passate hanno tutti i giorni');
  assert.ok(dayTitles().every((t) => !t.includes('oggi')));
});

test('at midnight the page is redrawn keeping unsaved rows, but not while saving', async () => {
  const { ticks, cleared } = holdLongTimers();
  setClock(1, 23, 59);
  mine({ week: monday, entries: [entry('a1', 'lun', 540, 600)] });
  const finish = slowSave([]);
  await visit(mineView(monday));
  assert.equal(ticks.length, 1);
  assert.equal(ticks[0].ms, 65 * 1000, 'scatta poco dopo mezzanotte');
  assert.deepEqual(days().map((_, i) => Boolean(addButton(i))), [true, true, false, false, false, false, false]);
  addFilled(1, '22:00', '23:00');

  setClock(2, 0, 1);
  ticks[0].fn();
  assert.deepEqual(days().map((_, i) => Boolean(addButton(i))), [true, true, true, false, false, false, false]);
  assert.deepEqual(dayTitles().map((t) => t.endsWith(' · oggi')), [false, false, true, false, false, false, false]);
  assert.deepEqual(rowsOf(1).map(timesOf), [['22:00', '23:00']], 'le ore non salvate restano');
  assert.equal(saveStatus(), 'Modifiche non salvate');
  assert.equal(ticks.length, 2, 'e si aspetta la mezzanotte dopo');

  saveButton().click();
  await flush(2);
  const list = outlet.querySelector('.ts-days');
  setClock(3, 0, 1);
  ticks[1].fn();
  assert.equal(outlet.querySelector('.ts-days'), list, 'durante il salvataggio non si ridisegna');
  assert.equal(ticks.length, 3);
  finish();
  await flush(10);
  assert.ok(addButton(3), 'finito il salvataggio la pagina è di nuovo aggiornata');
  const last = ticks.at(-1).handle;
  await visit('#/idee');
  assert.ok(cleared.includes(last), 'uscendo il timer si ferma');
});

test('times are rounded to 15 minutes, rewritten when leaving the field, and an end at 00:00 means midnight', async () => {
  const creates = [];
  fakeCreate(creates);
  await visit(mineView(lastWeek));
  addButton(0).click();
  const row = rowsOf(0)[0];
  const [start, end] = row.querySelectorAll('.ts-time');
  setInput(start, '09:08');
  setInput(end, '10:52');
  assert.deepEqual(timesOf(row), ['09:08', '10:52'], 'mentre si scrive il campo resta com\'è');
  assert.equal(dayTotals()[0], '1 h 30', 'ma conta già l\'orario arrotondato');
  blur(start);
  assert.deepEqual(timesOf(row), ['09:15', '10:52']);
  blur(end);
  assert.deepEqual(timesOf(row), ['09:15', '10:45']);
  assert.equal(rowsOf(0)[0], row, 'la riga non viene ridisegnata');
  fillRow(row, '09:07');
  assert.deepEqual(timesOf(row), ['09:00', '10:45']);
  setInput(start, '');
  blur(start);
  assert.equal(start.value, '', 'un campo vuoto resta vuoto');
  fillRow(row, '09:00');

  const late = addFilled(0, '23:53', '00:00');
  assert.deepEqual(timesOf(late), ['23:45', '00:00'], 'l\'inizio non può essere mezzanotte');
  const night = addFilled(1, '00:00', '23:59');
  assert.deepEqual(timesOf(night), ['00:00', '00:00']);
  assert.deepEqual(dayTotals().slice(0, 2), ['2 h', '24 h']);
  await save();
  assert.deepEqual(brief(creates[0].data.entries), [
    ['lun', 540, 645, 'prodotto', null],
    ['lun', 1425, 1440, 'prodotto', null],
    ['mar', 0, 1440, 'prodotto', null],
  ]);
});

test('removing a row moves the focus to the add button of that day', async () => {
  document.body.append(outlet);
  mine({ week: lastWeek, entries: [entry('a1', 'lun', 540, 600), entry('a2', 'lun', 600, 660, 'clienti'), entry('b1', 'mar', 600, 660)] });
  const saves = [];
  fakeSave(saves);
  await visit(mineView(lastWeek));
  assert.deepEqual(rowsOf(0).map((r) => r.querySelector('.ts-remove').getAttribute('aria-label')), ['Togli la riga 1 di lunedì', 'Togli la riga 2 di lunedì']);
  rowsOf(0)[0].querySelector('.ts-remove').click();
  assert.deepEqual(rowsOf(0).map((r) => r.dataset.id), ['a2']);
  assert.equal(rowsOf(0)[0].querySelector('.ts-remove').getAttribute('aria-label'), 'Togli la riga 1 di lunedì');
  assert.equal(document.activeElement, addButton(0));
  assert.equal(document.activeElement.dataset.focus, 'add-lun');
  assert.equal(dayTotals()[0], '1 h');
  assert.equal(saveStatus(), 'Modifiche non salvate');

  addButton(2).click();
  const empty = rowsOf(2)[0].querySelector('.ts-remove');
  assert.equal(empty.getAttribute('aria-label'), 'Togli la riga 1 di mercoledì');
  empty.click();
  assert.equal(rowsOf(2).length, 0);
  assert.equal(document.activeElement, addButton(2));

  await save();
  assert.deepEqual(saves[0].snapshot.data.entries.map((e) => e.id), ['a2', 'b1']);
});

test('typing a note keeps the field and saves it trimmed, a blank note is dropped', async () => {
  const creates = [];
  fakeCreate(creates);
  await visit(mineView(lastWeek));
  const row = addFilled(0, '09:00', '10:00');
  const note = row.querySelector('.ts-note');
  assert.equal(note.maxLength, 140);
  assert.equal(note.getAttribute('aria-label'), 'Nota');
  assert.equal(note.placeholder, 'Cosa hai fatto (facoltativo)');
  typeInto(note, '  Tre interviste con clienti  ');
  assert.equal(rowsOf(0)[0].querySelector('.ts-note'), note, 'il campo in cui si scrive non viene ridisegnato');
  assert.equal(saveStatus(), 'Modifiche non salvate');
  typeInto(addFilled(1, '09:00', '10:00').querySelector('.ts-note'), '   ');
  typeInto(addFilled(2, '09:00', '10:00').querySelector('.ts-note'), 'y'.repeat(300));
  await save();
  const [first, second, third] = creates[0].data.entries;
  assert.equal(first.note, 'Tre interviste con clienti');
  assert.equal('note' in second, false);
  assert.equal(third.note, 'y'.repeat(140));
});

test('the pledge field shows the pledge in force with a comma, rounded to 15 minutes and between 0 and 80 hours', async () => {
  timesheet(OLDER, ME, { week: av.addDays(lastWeek, -14), pledge: 480, entries: [entry('o1', 'lun', 540, 600)] });
  const creates = [];
  fakeCreate(creates);
  await visit(mineView(lastWeek));
  const input = pledgeInput();
  assert.deepEqual([input.type, input.getAttribute('inputmode')], ['text', 'decimal']);
  assert.equal(text(input.closest('label')), 'Ore a settimana che puoi dare');
  assert.equal(text(outlet.querySelector('.ts-pledge p')), 'Valgono da questa settimana in poi, finché non le cambi.');
  assert.equal(input.value, '8', 'vale l\'ultima dichiarazione prima di questa settimana');
  const which = capital(av.weekLabel(lastWeek));
  assert.equal(total(), `${which}: 0 h su 8 h dichiarate`);
  assert.equal(saveButton().disabled, true, 'il valore ereditato non è una modifica');

  setInput(input, '7.3');
  assert.equal(input.value, '7,25');
  assert.equal(total(), `${which}: 0 h su 7 h 15 dichiarate`);
  assert.equal(saveStatus(), 'Modifiche non salvate');
  setInput(input, '7,5');
  assert.equal(input.value, '7,5');
  assert.equal(total(), `${which}: 0 h su 7 h 30 dichiarate`);
  setInput(input, '100');
  assert.equal(input.value, '80');
  assert.equal(total(), `${which}: 0 h su 80 h dichiarate`);
  setInput(input, '-3');
  assert.equal(input.value, '0');
  assert.equal(total(), `${which}: 0 h`);

  setInput(input, '8');
  assert.equal(input.value, '8');
  assert.equal(saveButton().disabled, true, 'uguale a quelle ereditate non si scrive nella settimana');
  assert.equal(saveStatus(), 'Nessuna ora segnata in questa settimana');
  setInput(input, 'abc');
  assert.equal(input.value, '8');
  setInput(input, '');
  assert.equal(input.value, '8', 'vuoto torna a quelle ereditate');
  assert.equal(saveButton().disabled, true);

  setInput(input, '9');
  await save();
  assert.deepEqual(creates[0].data, { week: lastWeek, pledge: 540, entries: [] });
  assert.equal(pledgeInput().value, '9');
});

test('the pledge field shows the value that will be saved', async () => {
  await visit(mineView(lastWeek));
  assert.equal(pledgeInput().value, '', 'senza dichiarazioni il campo è vuoto');
  setInput(pledgeInput(), '7.3');
  assert.equal(pledgeInput().value, '7,25');
  setInput(pledgeInput(), '100');
  assert.equal(pledgeInput().value, '80');
  setInput(pledgeInput(), '-3');
  assert.equal(pledgeInput().value, '0');
  setInput(pledgeInput(), '');
  assert.equal(pledgeInput().value, '');
  assert.equal(saveButton().disabled, true);
});

test('a week stores its own pledge only when it changes, and an empty field goes back to the carried one', async () => {
  timesheet(OLDER, ME, { week: av.addDays(lastWeek, -7), pledge: 480, entries: [entry('o1', 'lun', 540, 600)] });
  mine({ week: lastWeek, pledge: 600, entries: [entry('a1', 'lun', 540, 600)] });
  const saves = [];
  fakeSave(saves);
  await visit(mineView(lastWeek));
  assert.equal(pledgeInput().value, '10');
  setInput(pledgeInput(), '8');
  assert.equal(saveStatus(), 'Modifiche non salvate', 'la settimana aveva le sue: restano sue anche se uguali alle altre');
  await save();
  assert.equal(saves[0].snapshot.data.pledge, 480);

  setInput(pledgeInput(), '');
  assert.equal(pledgeInput().value, '8', 'si torna a vedere quelle ereditate');
  assert.equal(saveStatus(), 'Modifiche non salvate');
  await save();
  assert.equal('pledge' in saves[1].snapshot.data, false);
  assert.equal(pledgeInput().value, '8');
  assert.equal(total(), `${capital(av.weekLabel(lastWeek))}: 1 h su 8 h dichiarate`);
});

test('a new week shows the carried pledge, does not copy it and follows it when it changes', async () => {
  timesheet(OLDER, ME, { week: av.addDays(lastWeek, -14), pledge: 480, entries: [entry('o1', 'lun', 540, 600)] });
  const creates = [];
  fakeCreate(creates);
  await visit(mineView(lastWeek));
  assert.equal(pledgeInput().value, '8');
  addFilled(0, '09:00', '10:00');
  await save();
  assert.equal('pledge' in creates[0].data, false, 'le ore dichiarate restano nella settimana in cui sono cambiate');
  const which = capital(av.weekLabel(lastWeek));
  assert.equal(pledgeInput().value, '8');
  assert.equal(total(), `${which}: 1 h su 8 h dichiarate`);

  timesheet(OLDER, ME, { week: av.addDays(lastWeek, -14), pledge: 600, entries: [entry('o1', 'lun', 540, 600)] }, { version: 2 });
  assert.equal(pledgeInput().value, '10');
  assert.equal(total(), `${which}: 1 h su 10 h dichiarate`);
});

test('a saved week without its own pledge shows the carried pledge in «Le mie ore» as in Squadra', async () => {
  timesheet(OLDER, ME, { week: av.addDays(lastWeek, -7), pledge: 480, entries: [] });
  mine({ week: lastWeek, entries: [entry('a1', 'lun', 540, 600)] });
  await visit(teamView(lastWeek));
  assert.equal(teamRows()[0].at(-1), '1 h su 8 h');
  await visit(mineView(lastWeek));
  assert.equal(total(), `${capital(av.weekLabel(lastWeek))}: 1 h su 8 h dichiarate`);
  assert.equal(pledgeInput().value, '8');
  assert.equal(saveButton().disabled, true);
});

test('day and week totals change in place, counting only complete rows', async () => {
  timesheet(OLDER, ME, { week: av.addDays(lastWeek, -7), pledge: 480, entries: [] });
  await visit(mineView(lastWeek));
  const which = capital(av.weekLabel(lastWeek));
  assert.deepEqual(dayTotals(), Array(7).fill('0 h'));
  const row = addFilled(0, '09:00', '11:00');
  const [, end] = row.querySelectorAll('.ts-time');
  assert.equal(dayTotals()[0], '2 h');
  setInput(end, '11:30');
  assert.equal(rowsOf(0)[0].querySelectorAll('.ts-time')[1], end, 'la riga non viene ridisegnata');
  assert.equal(dayTotals()[0], '2 h 30');
  assert.equal(total(), `${which}: 2 h 30 su 8 h dichiarate`);
  assert.equal(outlet.querySelector('.ts-total .ts-bar').getAttribute('aria-hidden'), 'true');
  addFilled(1, '14:00', '14:45');
  assert.equal(dayTotals()[1], '45 min');
  assert.equal(total(), `${which}: 3 h 15 su 8 h dichiarate`);
  addFilled(2, '10:00');
  fillRow(rowsOf(2)[0], undefined, '');
  addFilled(3, '12:00', '11:00');
  assert.deepEqual(dayTotals(), ['2 h 30', '45 min', '0 h', '0 h', '0 h', '0 h', '0 h'], 'le righe incomplete o al contrario non contano');
  assert.equal(total(), `${which}: 3 h 15 su 8 h dichiarate`);
});

test('a problem is shown in the save bar, marks the field to fix and takes the focus there', async () => {
  document.body.append(outlet);
  const creates = [];
  fakeCreate(creates);
  await visit(mineView(lastWeek));
  assert.equal(problemBox().getAttribute('role'), 'alert');
  assert.equal(problem(), '');
  addButton(0).click();
  assert.equal(problem(), '', 'i problemi si mostrano al salvataggio');
  const first = rowsOf(0)[0].dataset.id;
  await save();
  assert.equal(problem(), 'Lunedì: in una riga manca l\'ora di inizio o di fine.');
  assert.deepEqual(invalid(), [`row-${first}-start=true`]);
  assert.equal(document.activeElement.dataset.focus, `row-${first}-start`);
  assert.equal(creates.length, 0);

  const [start, end] = rowsOf(0)[0].querySelectorAll('.ts-time');
  setInput(start, '10:00');
  assert.equal(problem(), 'Lunedì: in una riga manca l\'ora di inizio o di fine.');
  assert.deepEqual(invalid(), [`row-${first}-end=true`], 'il messaggio e il campo seguono le correzioni');
  setInput(end, '09:00');
  assert.equal(problem(), 'Lunedì: una riga finisce prima di cominciare. Se passi la mezzanotte, dividila in due righe.');
  assert.deepEqual(invalid(), [`row-${first}-end=true`]);
  setInput(end, '10:00');
  assert.equal(problem(), 'Lunedì: una riga finisce prima di cominciare. Se passi la mezzanotte, dividila in due righe.');
  setInput(end, '12:00');
  assert.equal(problem(), '');
  assert.deepEqual(invalid(), []);

  addFilled(2, '09:00', '11:00');
  const second = addFilled(2, '10:30', '12:00');
  assert.equal(problem(), '', 'i problemi nuovi si mostrano al prossimo salvataggio');
  await save();
  assert.equal(problem(), 'Mercoledì due righe si accavallano: 09:00-11:00 e 10:30-12:00.');
  assert.deepEqual(invalid(), [`row-${second.dataset.id}-start=true`]);
  assert.equal(document.activeElement, second.querySelector('.ts-time'));
  assert.equal(creates.length, 0);
  assert.equal(saveStatus(), 'Modifiche non salvate');

  // Il testo si sostituisce solo quando cambia, così i lettori di schermo non lo ripetono a ogni tasto.
  const shown = problemBox().firstChild;
  typeInto(second.querySelector('.ts-note'), 'Revisione');
  assert.equal(problemBox().firstChild, shown);

  fillRow(second, '11:00');
  assert.equal(problem(), '', 'due righe che si toccano vanno bene');
  await save();
  assert.equal(creates.length, 1);
  assert.deepEqual(brief(creates[0].data.entries), [
    ['lun', 600, 720, 'prodotto', null],
    ['mer', 540, 660, 'prodotto', null],
    ['mer', 660, 720, 'prodotto', 'Revisione'],
  ]);
});

test('at 100 rows a new row is not added', async () => {
  const full = [
    ...Array.from({ length: 96 }, (_, i) => entry(`l${i}`, 'lun', i * 15, i * 15 + 15)),
    ...Array.from({ length: 4 }, (_, i) => entry(`m${i}`, 'mar', i * 60, i * 60 + 30)),
  ];
  mine({ week: lastWeek, entries: full });
  await visit(mineView(lastWeek));
  assert.equal(outlet.querySelectorAll('.ts-row').length, 100);
  assert.equal(dayTotals()[0], '24 h');
  addButton(2).click();
  assert.equal(outlet.querySelectorAll('.ts-row').length, 100);
  assert.equal(saveButton().disabled, true);
});

test('changing week with unsaved hours asks first, «Annulla» keeps them', async () => {
  await visit(mineView(lastWeek));
  const address = location.hash;
  weekButton('Settimana precedente').click();
  await flush();
  assert.equal(document.querySelector('dialog'), null, 'senza modifiche non chiede');
  assert.equal(weekTitle(), '2 settimane fa');
  weekButton('Settimana successiva').click();
  await flush();
  assert.equal(weekTitle(), 'La settimana scorsa');
  assert.equal(location.hash, mineView(lastWeek));

  addFilled(0, '09:00', '10:00');
  addButton(1).click();
  fillRow(rowsOf(1)[0], '');
  await save();
  assert.equal(problem(), 'Martedì: in una riga manca l\'ora di inizio o di fine.');
  weekButton('Settimana precedente').click();
  await flush();
  let dialog = document.querySelector('dialog');
  assert.match(text(dialog), /Hai ore non salvate in questa settimana\. Cambiare settimana comunque\?/);
  byText(dialog, 'button', 'Annulla').click();
  await flush();
  assert.equal(weekTitle(), 'La settimana scorsa');
  assert.equal(location.hash, mineView(lastWeek), 'annullando l\'indirizzo non cambia');
  assert.deepEqual(timesOf(rowsOf(0)[0]), ['09:00', '10:00']);
  assert.equal(saveStatus(), 'Modifiche non salvate');

  weekButton('Settimana successiva').click();
  await flush();
  dialog = document.querySelector('dialog');
  byText(dialog, 'button', 'Cambia').click();
  await flush();
  assert.equal(weekTitle(), 'Questa settimana');
  assert.equal(location.hash, mineView(monday));
  assert.notEqual(location.hash, address);
  assert.equal(outlet.querySelectorAll('.ts-row').length, 0);
  assert.equal(problem(), '');
  assert.equal(saveButton().disabled, true);
  assert.equal(saveStatus(), 'Nessuna ora segnata in questa settimana');
  await visit('#/idee');
  assert.equal(document.querySelector('dialog'), null, 'cambiata settimana non resta l\'avviso');
});

test('a week change confirmed after leaving the page does nothing', async () => {
  await visit(mineView(lastWeek));
  addFilled(0, '09:00', '10:00');
  const address = location.hash;
  weekButton('Settimana precedente').click();
  await flush();
  const dialog = document.querySelector('dialog');
  assert.ok(dialog);
  router.stopRouter();
  const list = outlet.querySelector('.ts-days');
  byText(dialog, 'button', 'Cambia').click();
  await flush();
  assert.equal(location.hash, address);
  assert.equal(outlet.querySelector('.ts-days'), list, 'la pagina lasciata non si ridisegna');
  assert.equal(weekTitle(), 'La settimana scorsa');
});

test('saving an existing week goes through saveItem with the cleaned data and a fixed title', async () => {
  mine({ week: lastWeek, pledge: 480, entries: [entry('a1', 'lun', 540, 600, 'clienti')] }, { version: 3, title: 'Vecchio titolo' });
  const saves = [];
  fakeSave(saves);
  api.createItem = async () => {
    throw new Error('non deve creare un secondo elemento');
  };
  await visit(mineView(lastWeek));
  assert.equal(saveButton().disabled, true);
  assert.match(saveStatus(), /^Salvato /);
  assert.deepEqual(timesOf(rowsOf(0)[0]), ['09:00', '10:00']);

  addButton(4).click();
  fillRow(rowsOf(4)[0], '18:00', '19:00', 'numeri');
  addButton(0).click();
  assert.deepEqual(timesOf(rowsOf(0)[1]), ['10:00', '11:00']);
  assert.equal(rowsOf(0)[1].querySelector('.ts-area').value, 'clienti', 'l\'area è quella della riga che finisce per ultima nel giorno');
  fillRow(rowsOf(0)[1], '');
  await save();
  assert.equal(saves.length, 0, 'la riga senza orario blocca il salvataggio');
  fillRow(rowsOf(0)[1], '08:00', '09:00', 'clienti');
  await save();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].id, MINE);
  assert.equal(saves[0].baseVersion, 3);
  assert.equal(saves[0].message, 'Ore aggiornate');
  assert.equal(saves[0].snapshot.title, 'Ore lavorate', 'il titolo è sempre lo stesso');
  const { entries, ...rest } = saves[0].snapshot.data;
  assert.deepEqual(rest, { week: lastWeek, pledge: 480 });
  assert.deepEqual(brief(entries), [
    ['lun', 480, 540, 'clienti', null],
    ['lun', 540, 600, 'clienti', null],
    ['ven', 1080, 1140, 'numeri', null],
  ], 'le righe si salvano in ordine di giorno e ora');
  assert.equal(store.getItem(MINE).version, 4);
  assert.equal(toasts(), 'Ore salvate.');
  assert.equal(saveStatus(), 'Salvato adesso');
  assert.equal(saveButton().disabled, true);
  assert.deepEqual(rowsOf(0).map(timesOf), [['08:00', '09:00'], ['09:00', '10:00']]);
});

test('a save after a realtime update of my week merges the changes made on the other device', async () => {
  mine({ week: lastWeek, pledge: 480, entries: [entry('a1', 'lun', 540, 600)] });
  const saves = [];
  serverSave(saves);
  await visit(mineView(lastWeek));
  fillRow(rowsOf(0)[0], undefined, '11:00');
  mine({ week: lastWeek, pledge: 600, entries: [entry('a1', 'lun', 540, 600)] }, { version: 2 });
  assert.equal(pledgeInput().value, '8', 'la copia di lavoro resta quella con le mie modifiche');
  await save();
  assert.deepEqual(saves.map((s) => s.baseVersion), [1, 2]);
  assert.equal(store.getItem(MINE).data.pledge, 600);
  assert.deepEqual(brief(store.getItem(MINE).data.entries), [['lun', 540, 660, 'prodotto', null]]);
  assert.equal(toasts(), 'Ore salvate, unite a quelle salvate da un altro dispositivo.');
  assert.equal(pledgeInput().value, '10');
  assert.equal(saveButton().disabled, true);
  assert.equal(saveStatus(), 'Salvato adesso');
});

test('rows added on two devices are both kept', async () => {
  mine({ week: lastWeek, entries: [entry('a1', 'lun', 540, 600)] });
  const saves = [];
  serverSave(saves);
  await visit(mineView(lastWeek));
  addFilled(1, '09:00', '10:00');
  mine({ week: lastWeek, entries: [entry('a1', 'lun', 540, 600), entry('c1', 'gio', 600, 720, 'clienti')] }, { version: 2 });
  await save();
  assert.equal(document.querySelector('dialog'), null);
  assert.deepEqual(saves.map((s) => s.baseVersion), [1, 2]);
  assert.deepEqual(brief(store.getItem(MINE).data.entries), [
    ['lun', 540, 600, 'prodotto', null],
    ['mar', 540, 600, 'prodotto', null],
    ['gio', 600, 720, 'clienti', null],
  ]);
  assert.equal(toasts(), 'Ore salvate, unite a quelle salvate da un altro dispositivo.');
  assert.deepEqual([rowsOf(1).length, rowsOf(3).length], [1, 1]);
  assert.equal(saveStatus(), 'Salvato adesso');
});

test('rows changed on both devices are merged row by row and my version wins on the same row', async () => {
  mine({
    week: lastWeek,
    pledge: 480,
    entries: [entry('a1', 'lun', 540, 600), entry('a2', 'mar', 600, 660), entry('a3', 'mer', 600, 660), entry('a4', 'gio', 600, 660), entry('a5', 'ven', 600, 660)],
  });
  const saves = [];
  serverSave(saves);
  await visit(mineView(lastWeek));
  rowsOf(3)[0].querySelector('.ts-remove').click();
  fillRow(rowsOf(0)[0], undefined, '11:00');
  fillRow(rowsOf(2)[0], undefined, '12:00');
  setInput(pledgeInput(), '9');
  mine(
    { week: lastWeek, pledge: 600, entries: [entry('a1', 'lun', 540, 630, 'clienti'), entry('a2', 'mar', 600, 690), entry('a4', 'gio', 600, 660)] },
    { version: 2 },
  );
  await save();
  assert.equal(document.querySelector('dialog'), null, 'nessuna finestra di conflitto');
  assert.deepEqual(saves.map((s) => s.baseVersion), [1, 2]);
  assert.deepEqual(brief(store.getItem(MINE).data.entries), [
    ['lun', 540, 660, 'prodotto', null],
    ['mar', 600, 690, 'prodotto', null],
    ['mer', 600, 720, 'prodotto', null],
  ], 'cambiata da entrambi vince la mia, cambiata da una parte sola vale quella');
  assert.equal(store.getItem(MINE).data.pledge, 540);
  assert.equal(toasts(), 'Ore salvate, unite a quelle salvate da un altro dispositivo.');
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => rowsOf(i).map(timesOf)), [[['09:00', '11:00']], [['10:00', '11:30']], [['10:00', '12:00']], [], []]);
  assert.equal(pledgeInput().value, '9');
});

test('when the merged rows overlap nothing is saved: the merged rows are shown with the problem to fix', async () => {
  document.body.append(outlet);
  mine({ week: lastWeek, entries: [entry('a1', 'lun', 540, 600)] });
  const saves = [];
  serverSave(saves);
  await visit(mineView(lastWeek));
  addFilled(1, '09:00', '10:00');
  mine({ week: lastWeek, entries: [entry('a1', 'lun', 540, 600), entry('c1', 'mar', 570, 630, 'clienti')] }, { version: 2 });
  focusOn(saveButton()).click();
  await flush(10);
  assert.equal(saves.length, 1, 'l\'unione non si salva');
  assert.equal(store.getItem(MINE).version, 2);
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(toasts(), '');
  assert.deepEqual(rowsOf(1).map(timesOf), [['09:00', '10:00'], ['09:30', '10:30']]);
  assert.equal(rowsOf(1)[1].querySelector('.ts-area').value, 'clienti');
  assert.equal(problem(), 'Martedì due righe si accavallano: 09:00-10:00 e 09:30-10:30.');
  assert.deepEqual(invalid(), ['row-c1-start=true']);
  assert.equal(saveStatus(), 'Modifiche non salvate');
  assert.equal(saveButton().disabled, false);
  assert.equal(document.activeElement, saveButton(), 'il focus resta sul pulsante per salvare');

  fillRow(rowsOf(1)[0], '08:00', '09:00');
  assert.equal(problem(), '');
  await save();
  assert.deepEqual(saves.map((s) => s.baseVersion), [1, 2], 'si riparte dalla versione dell\'altro dispositivo');
  assert.deepEqual(brief(store.getItem(MINE).data.entries), [
    ['lun', 540, 600, 'prodotto', null],
    ['mar', 480, 540, 'prodotto', null],
    ['mar', 570, 630, 'clienti', null],
  ]);
  assert.equal(toasts(), 'Ore salvate.');
  assert.equal(saveStatus(), 'Salvato adesso');
});

test('a first save after my week appeared from another device merges with it through version 0', async () => {
  const saves = [];
  serverSave(saves);
  api.createItem = async () => {
    throw new Error('non deve creare un secondo elemento');
  };
  await visit(mineView(lastWeek));
  addFilled(0, '09:00', '10:00');
  mine({ week: lastWeek, pledge: 600, entries: [entry('c1', 'gio', 600, 720, 'clienti')] });
  assert.equal(rowsOf(3).length, 0, 'le modifiche non salvate restano');
  await save();
  // Versione 0: il server risponde sempre «conflitto», così si unisce con quello che c'è.
  assert.deepEqual(saves.map((s) => [s.id, s.baseVersion]), [[MINE, 0], [MINE, 1]]);
  assert.equal(store.getItem(MINE).data.pledge, 600);
  assert.deepEqual(brief(store.getItem(MINE).data.entries), [['lun', 540, 600, 'prodotto', null], ['gio', 600, 720, 'clienti', null]]);
  assert.equal(toasts(), 'Ore salvate, unite a quelle salvate da un altro dispositivo.');
  assert.equal(pledgeInput().value, '10');
  assert.equal(rowsOf(3).length, 1);
  assert.equal(saveStatus(), 'Salvato adesso');
});

test('a week created elsewhere keeps its pledge when I did not touch the carried one', async () => {
  timesheet(OLDER, ME, { week: av.addDays(lastWeek, -7), pledge: 480, entries: [] });
  const saves = [];
  serverSave(saves);
  await visit(mineView(lastWeek));
  assert.equal(pledgeInput().value, '8');
  addFilled(0, '09:00', '10:00');
  mine({ week: lastWeek, pledge: 600, entries: [] });
  await save();
  assert.equal(document.querySelector('dialog'), null);
  assert.deepEqual(saves.map((s) => s.baseVersion), [0, 1]);
  assert.equal('pledge' in saves[0].snapshot.data, false, 'quelle ereditate non si copiano');
  assert.equal(store.getItem(MINE).data.pledge, 600);
  assert.equal(pledgeInput().value, '10');
});

test('a first save refused because the week already exists reloads the items and merges with it', async () => {
  const theirs = item({ id: MINE, kind: 'timesheet', title: 'Ore lavorate', data: { week: lastWeek, pledge: 600, entries: [entry('c1', 'gio', 600, 720, 'clienti')] } });
  fake.responses.rpc.create_item = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "items_one_timesheet_per_week_idx"' } };
  api.listItems = async () => [theirs];
  const saves = [];
  serverSave(saves);
  await visit(mineView(lastWeek));
  addFilled(0, '09:00', '10:00');
  await save();
  assert.equal(fake.calls.filter(([type, name]) => type === 'rpc' && name === 'create_item').length, 1);
  assert.deepEqual(saves.map((s) => [s.id, s.baseVersion]), [[MINE, 0], [MINE, 1]]);
  assert.equal(store.getItem(MINE).data.pledge, 600);
  assert.deepEqual(brief(store.getItem(MINE).data.entries), [['lun', 540, 600, 'prodotto', null], ['gio', 600, 720, 'clienti', null]]);
  assert.equal(problem(), '');
  assert.equal(toasts(), 'Ore salvate, unite a quelle salvate da un altro dispositivo.');
  assert.equal(saveStatus(), 'Salvato adesso');
  assert.doesNotMatch(text(outlet), /items_one_timesheet_per_week_idx|duplicate key/);
});

test('a refused first save shows the generic message without database details', async () => {
  fake.responses.rpc.create_item = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "items_one_timesheet_per_week_idx"' } };
  api.listItems = async () => [];
  await visit(mineView(lastWeek));
  addFilled(0, '09:00', '10:00');
  await save();
  assert.equal(problem(), 'Esiste già un elemento di questo tipo.');
  assert.ok(problemBox().querySelector('.error-box'));
  assert.doesNotMatch(text(outlet), /items_one_timesheet_per_week_idx|duplicate key/);
  assert.equal(store.timesheetsOf(ME).length, 0);
  assert.equal(saveStatus(), 'Modifiche non salvate');
  const [, , params] = fake.calls.find(([type, name]) => type === 'rpc' && name === 'create_item');
  assert.equal(params.p_kind, 'timesheet');
  assert.equal(params.p_title, 'Ore lavorate');
  assert.deepEqual(params.p_data.week, lastWeek);
});

test('while a first save is running the week cannot change, so the retry saves the same week', async () => {
  const theirs = item({ id: MINE, kind: 'timesheet', title: 'Ore lavorate', data: { week: lastWeek, entries: [entry('c1', 'gio', 600, 720)] } });
  const creates = [];
  const pending = [];
  api.createItem = (args) => {
    creates.push(args);
    return new Promise((_, reject) => pending.push(() => reject(new AppError('Esiste già un elemento di questo tipo.', { code: '23505' }))));
  };
  api.listItems = async () => [theirs];
  const saves = [];
  serverSave(saves);
  await visit(mineView(lastWeek));
  addFilled(0, '09:00', '10:00');
  const address = location.hash;
  saveButton().click();
  await flush(2);
  assert.deepEqual(arrows().map((b) => b.disabled), [true, true]);
  for (const b of arrows()) b.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush();
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(weekTitle(), 'La settimana scorsa');
  assert.equal(location.hash, address);

  pending.shift()();
  await flush(10);
  assert.deepEqual(creates.map((c) => c.data.week), [lastWeek]);
  assert.deepEqual(saves.map((s) => [s.baseVersion, s.snapshot.data.week]), [[0, lastWeek], [1, lastWeek]]);
  assert.deepEqual(brief(store.getItem(MINE).data.entries), [['lun', 540, 600, 'prodotto', null], ['gio', 600, 720, 'prodotto', null]]);
  assert.deepEqual(arrows().map((b) => b.disabled), [false, false], 'finito il salvataggio si può cambiare settimana');
});

test('while saving the controls are disabled and a second click does not save twice', async () => {
  mine({ week: lastWeek, pledge: 480, entries: [entry('a1', 'lun', 540, 600)] });
  const saves = [];
  const finish = slowSave(saves);
  await visit(mineView(lastWeek));
  addFilled(1, '09:00', '10:00');
  saveButton().click();
  await flush(2);
  assert.equal(saves.length, 1);
  assert.equal(saveButton().disabled, true);
  assert.ok(saveButton().classList.contains('is-busy'));
  assert.equal(saveStatus(), 'Salvataggio in corso');
  assert.ok(controls().length > 9 && controls().every((el) => el.disabled), 'campi, aree, note, pulsanti dei giorni e frecce');
  assert.deepEqual(arrows().map((b) => b.dataset.edge), ['false', 'false']);
  saveButton().dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush(2);
  assert.equal(saves.length, 1, 'un secondo clic non salva di nuovo');
  addButton(2).click();
  rowsOf(0)[0].querySelector('.ts-remove').click();
  assert.equal(rowsOf(2).length, 0);
  assert.equal(rowsOf(0).length, 1);

  finish();
  await flush(10);
  assert.equal(toasts(), 'Ore salvate.');
  assert.equal(saveStatus(), 'Salvato adesso');
  assert.equal(saveButton().disabled, true);
  assert.ok(!saveButton().classList.contains('is-busy'));
  assert.ok(controls().every((el) => !el.disabled));
  assert.equal(rowsOf(1).length, 1);
  addButton(2).click();
  assert.equal(rowsOf(2).length, 1, 'finito il salvataggio si può scrivere di nuovo');
});

test('after saving the focus moves to the pledge field, since there is nothing left to save', async () => {
  document.body.append(outlet);
  const creates = [];
  fakeCreate(creates);
  await visit(mineView(lastWeek));
  addFilled(0, '09:00', '10:00');
  focusOn(saveButton()).click();
  await flush(10);
  assert.equal(creates.length, 1);
  assert.equal(saveButton().disabled, true);
  assert.equal(pledgeInput().disabled, false);
  assert.equal(document.activeElement, pledgeInput());
});

test('a save that returns after leaving the page does not redraw it nor touch the leave guard', async () => {
  mine({ week: lastWeek, entries: [entry('a1', 'lun', 540, 600)] });
  const saves = [];
  const finish = slowSave(saves);
  await visit(mineView(lastWeek));
  addFilled(1, '09:00', '10:00');
  saveButton().click();
  await flush(2);
  await leaveTo(teamView(lastWeek));
  assert.ok(outlet.querySelector('.ts-table'));

  let asked = 0;
  router.setLeaveGuard(() => {
    asked += 1;
    return true;
  });
  finish();
  await flush(10);
  assert.equal(store.getItem(MINE).version, 2);
  assert.ok(outlet.querySelector('.ts-table'));
  assert.equal(outlet.querySelector('.ts-day'), null);
  assert.doesNotMatch(toasts(), /Ore salvate/);
  await visit('#/idee');
  assert.equal(asked, 1);
  assert.equal(document.querySelector('dialog'), null);
});

test('unsaved hours set the leave guard, also when switching to the team view', async () => {
  mine({ week: lastWeek, entries: [entry('a1', 'lun', 540, 600)] });
  await visit(mineView(lastWeek));
  addFilled(1, '09:00', '10:00');
  let attempt = router.render('#/idee');
  await flush();
  const dialog = document.querySelector('dialog');
  assert.match(text(dialog), /Hai ore non salvate\. Uscire comunque\?/);
  byText(dialog, 'button', 'Annulla').click();
  await attempt;
  assert.equal(router.currentPath(), '/squadra/ore');
  assert.equal(rowsOf(1).length, 1);

  attempt = router.render(teamView(lastWeek));
  await flush();
  byText(document.querySelector('dialog'), 'button', 'Esci').click();
  await attempt;
  await flush();
  assert.ok(outlet.querySelector('.ts-table'));

  await visit(mineView(lastWeek));
  addButton(1).click();
  rowsOf(1)[0].querySelector('.ts-remove').click();
  await visit('#/idee');
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(router.currentPath(), '/idee');
});

test('closing or reloading the site with unsaved hours asks the browser to confirm', async () => {
  mine({ week: lastWeek, pledge: 480, entries: [entry('a1', 'lun', 540, 600)] });
  await visit(mineView(lastWeek));
  assert.equal(unload(), false);
  setInput(pledgeInput(), '9');
  assert.equal(unload(), true);
  setInput(pledgeInput(), '8');
  assert.equal(unload(), false);
  addButton(3).click();
  assert.equal(unload(), true, 'anche una riga nuova');
  await leaveTo(teamView(lastWeek));
  assert.equal(unload(), false, 'lasciata la pagina il controllo non resta attivo');
});

test('a realtime update of my hours refreshes «Le mie ore» only when nothing is unsaved', async () => {
  mine({ week: lastWeek, entries: [entry('a1', 'lun', 540, 600)] });
  await visit(mineView(lastWeek));
  mine({ week: lastWeek, entries: [entry('a1', 'lun', 540, 600), entry('a2', 'mar', 600, 660)] }, { version: 2 });
  assert.equal(rowsOf(1).length, 1);
  assert.equal(dayTotals()[1], '1 h');
  assert.equal(saveButton().disabled, true);

  const list = outlet.querySelector('.ts-days');
  bruno({ week: lastWeek, entries: [entry('b1', 'lun', 540, 600)] });
  assert.equal(outlet.querySelector('.ts-days'), list, 'le ore degli altri non toccano le mie');

  addFilled(2, '09:00', '10:00');
  const edited = outlet.querySelector('.ts-days');
  mine({ week: lastWeek, entries: [] }, { version: 3 });
  assert.equal(outlet.querySelector('.ts-days'), edited);
  assert.equal(outlet.querySelectorAll('.ts-row').length, 3);
  assert.equal(saveStatus(), 'Modifiche non salvate');
});

test('save errors are shown in the save bar with the generic message and the hours stay', async () => {
  mine({ week: lastWeek, entries: [entry('a1', 'lun', 540, 600)] });
  await visit(mineView(lastWeek));
  addFilled(1, '09:00', '10:00');
  fake.responses.rpc.save_item = { data: null, error: { code: 'XX000', message: 'timesheet_entries_ok: internal detail' } };
  await save();
  const box = outlet.querySelector('.error-box');
  assert.equal(box.parentElement, problemBox());
  assert.equal(text(box), 'Salvataggio non riuscito.');
  assert.equal(problem(), 'Salvataggio non riuscito.');
  assert.equal(box.getAttribute('role'), 'alert');
  assert.doesNotMatch(text(outlet), /timesheet_entries_ok|internal detail/);
  assert.equal(rowsOf(1).length, 1);
  assert.equal(saveStatus(), 'Modifiche non salvate');
  assert.equal(saveButton().disabled, false);
  assert.ok(controls().every((el) => !el.disabled || el.dataset.edge === 'true'));
  const [, , params] = fake.calls.find(([type, name]) => type === 'rpc' && name === 'save_item');
  assert.equal(params.p_id, MINE);
  assert.equal(params.p_base_version, 1);
  assert.equal(params.p_title, 'Ore lavorate');
  assert.equal(params.p_data.week, lastWeek);

  fake.responses.rpc.save_item = { data: { status: 'forbidden', item: null }, error: null };
  await save();
  assert.equal(outlet.querySelectorAll('.error-box').length, 1);
  assert.equal(problem(), 'Non hai i permessi per questa operazione.');
  assert.doesNotMatch(toasts(), /Ore salvate/);
});

// Campanella

test('the Monday reminder starts at 8:00 and only for team members who already logged an earlier week', () => {
  const twoWeeks = av.addDays(lastWeek, -7);
  assert.equal(notes.timesheetReminder(localTime(0, 9)), null, 'chi non ha mai segnato ore non riceve promemoria');
  timesheet(THIS_WEEK, ME, { week: monday, entries: [entry('n1', 'lun', 540, 600)] });
  assert.equal(notes.timesheetReminder(localTime(1, 9)), null, 'chi ha cominciato questa settimana non ha niente da recuperare');
  timesheet(OLDER, ME, { week: twoWeeks, pledge: 480, entries: [entry('o1', 'lun', 540, 600)] });
  assert.equal(notes.timesheetReminder(localTime(0, 7, 59)), null);
  assert.deepEqual(notes.timesheetReminder(localTime(0, 8)), {
    id: `t-${lastWeek}`,
    text: `Non hai ancora segnato le ore della settimana ${av.weekLabel(lastWeek)}`,
    href: mineView(lastWeek),
    at: localTime(0, 8).toISOString(),
    authorId: null,
    kind: 'reminder',
  });
  assert.equal(notes.timesheetReminder(localTime(6, 23, 59))?.id, `t-${lastWeek}`, 'resta per tutta la settimana');

  timesheet(MINE, ME, { week: lastWeek, pledge: 300, entries: [] });
  assert.equal(notes.timesheetReminder(localTime(1, 9))?.id, `t-${lastWeek}`, 'una settimana senza righe va ancora segnata');
  timesheet(MINE, ME, { week: lastWeek, pledge: 0, entries: [] }, { version: 2 });
  assert.equal(notes.timesheetReminder(localTime(1, 9)), null, 'zero ore dichiarate');
  timesheet(MINE, ME, { week: lastWeek, entries: [] }, { version: 3 });
  timesheet(OLDER, ME, { week: twoWeeks, pledge: 0, entries: [entry('o1', 'lun', 540, 600)] }, { version: 2 });
  assert.equal(notes.timesheetReminder(localTime(1, 9)), null, 'lo zero dichiarato prima vale ancora');
  timesheet(OLDER, ME, { week: twoWeeks, pledge: 480, entries: [entry('o1', 'lun', 540, 600)] }, { version: 3 });
  assert.equal(notes.timesheetReminder(localTime(1, 9))?.id, `t-${lastWeek}`);
  timesheet(MINE, ME, { week: lastWeek, entries: [entry('a1', 'ven', 600, 660)] }, { version: 4 });
  assert.equal(notes.timesheetReminder(localTime(1, 9)), null, 'settimana scorsa segnata');

  bruno({ week: twoWeeks, entries: [entry('b1', 'lun', 540, 600)] });
  timesheet(ADVISOR_ITEM, ADVISOR, { week: twoWeeks, entries: [entry('c1', 'lun', 540, 600)] });
  store.state.user = { id: OTHER };
  store.setMembers(members());
  assert.equal(notes.timesheetReminder(localTime(1, 9))?.id, `t-${lastWeek}`, 'ognuno guarda solo le sue ore');
  store.state.user = { id: ADVISOR };
  store.setMembers(members());
  assert.equal(notes.timesheetReminder(localTime(1, 9)), null, 'gli advisor non segnano ore');
});

test('the bell shows the reminder with a clock icon, drops it once last week is saved and brings it back when needed', async () => {
  setClock(0, 9);
  timesheet(OLDER, ME, { week: av.addDays(lastWeek, -7), pledge: 480, entries: [entry('o1', 'lun', 540, 600)] });
  store.writeLocal('notificheLette', `${av.addDays(lastWeek, -7)}T00:00:00.000Z`);
  api.activityFeed = async () => ({ revisions: [], comments: [] });
  const bell = bellView.notificationBell();
  document.body.append(bell);
  await notes.startNotifications();
  assert.equal(bell.querySelector('.bell-badge').textContent, '1');
  bell.querySelector('button.bell').click();
  const link = bell.querySelector('.bell-item.is-unread a');
  assert.equal(link.getAttribute('href'), mineView(lastWeek));
  assert.match(text(link), new RegExp(`^Non hai ancora segnato le ore della settimana ${av.weekLabel(lastWeek)} · `));
  const mark = link.querySelector('.bell-reminder');
  assert.equal(mark.getAttribute('aria-hidden'), 'true');
  assert.ok(mark.querySelector('svg'));
  assert.equal(text(mark), '', 'niente iniziali: il promemoria non ha autore');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));

  const creates = [];
  fakeCreate(creates);
  await visit(mineView(lastWeek));
  assert.ok(days().every((_, i) => addButton(i)));
  addFilled(4, '17:00', '18:00');
  await save();
  assert.equal(creates.length, 1);
  assert.equal(bell.querySelector('.bell-badge').hidden, true);
  assert.equal(notes.notifications({ includeRead: true }).some((n) => n.kind === 'reminder'), false);
  bell.querySelector('button.bell').click();
  assert.match(text(bell.querySelector('.bell-panel')), /Nessuna novità da leggere/);
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));

  // Svuotata da un altro dispositivo, la settimana va di nuovo segnata.
  timesheet(NEW_ID, ME, { week: lastWeek, entries: [] }, { version: 2 });
  assert.equal(bell.querySelector('.bell-badge').textContent, '1');
  assert.deepEqual(notes.notifications().map((n) => n.id), [`t-${lastWeek}`]);

  // Il lunedì dopo il promemoria passa alla settimana appena finita.
  setClock(7, 9);
  store.emit('synced');
  await flush();
  const reminders = notes.notifications({ includeRead: true }).filter((n) => n.kind === 'reminder');
  assert.deepEqual(reminders.map((n) => [n.id, n.href]), [[`t-${monday}`, mineView(monday)]]);
  assert.equal(bell.querySelector('.bell-badge').textContent, '1');
  bell.remove();
});

test('the reminder does not move the point from which new notifications are asked', async () => {
  setClock(1, 9);
  timesheet(OLDER, ME, { week: av.addDays(lastWeek, -7), entries: [entry('o1', 'lun', 540, 600)] });
  store.writeLocal('notificheLette', `${av.addDays(lastWeek, -7)}T00:00:00.000Z`);
  const fromServer = localTime(-5, 10).toISOString();
  const since = [];
  api.activityFeed = async (from) => {
    since.push(from);
    const revisions = since.length === 1 ? [revision({ id: 9, op: 'create', title: 'Idea nuova', author_id: OTHER, created_at: fromServer })] : [];
    return { revisions, comments: [] };
  };
  await notes.startNotifications();
  assert.deepEqual(notes.notifications().map((n) => n.kind), ['reminder', 'idea']);
  assert.ok(notes.notifications()[0].at > fromServer, 'il promemoria è la notifica più recente');
  store.emit('synced');
  await flush();
  assert.equal(since.length, 2);
  assert.equal(since[1], fromServer, 'si riparte dall\'ultima notifica arrivata dal server');
  assert.deepEqual(notes.notifications().map((n) => n.kind), ['reminder', 'idea']);
});
