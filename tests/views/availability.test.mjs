import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text, byText, typeInto } from '../setup/dom.mjs';
import { ADVISOR, ME, OTHER, XSS, item, members } from '../setup/fixtures.mjs';

let api;
let store;
let router;
let app;
let av;
let format;
let fake;
let original;
let outlet;
let monday;
let next;

const MINE = 'aaaaaaaa-0000-4000-8000-000000000001';
const THEIRS = 'aaaaaaaa-0000-4000-8000-000000000002';
const NEW_ID = 'aaaaaaaa-0000-4000-8000-000000000003';
const ADVISOR_ITEM = 'aaaaaaaa-0000-4000-8000-000000000004';
const GONE_ITEM = 'aaaaaaaa-0000-4000-8000-000000000005';
const IDEA = 'aaaaaaaa-0000-4000-8000-000000000006';
const GONE = '00000000-0000-4000-8000-0000000000ff';
const CHOICE_KEY = `bdp:disponibilita-chi:${ME}`;
const TEAM = '#/squadra/disponibilita';
const MINE_VIEW = '#/squadra/disponibilita?vista=miei';

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  av = await import('../../assets/js/availability.js');
  format = await import('../../assets/js/lib/format.js');
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
  next = av.addDays(monday, 7);
  outlet = document.createElement('main');
  document.body.querySelectorAll('dialog, .toasts').forEach((d) => d.remove());
  await router.startRouter(outlet, { fallback: app.notFoundView });
});

afterEach(() => {
  router.stopRouter();
  Object.assign(api, original);
  outlet.remove();
  delete document.elementFromPoint;
  history.replaceState(null, '', '#/');
});

async function visit(hash) {
  await router.render(hash);
  await flush(5);
  return text(outlet);
}

const cell = (day, hour) => outlet.querySelector(`.av-cell[data-day="${day}"][data-hour="${hour}"]`);

function availability(id, userId, data, over = {}) {
  store.applyItem(item({ id, kind: 'availability', title: 'Impegni', created_by: userId, updated_by: userId, data, ...over }));
}
const mine = (data, over) => availability(MINE, ME, data, over);
const bruno = (data, over) => availability(THEIRS, OTHER, data, over);
const chiara = (data, over) => availability(ADVISOR_ITEM, ADVISOR, data, over);

const everyDay = (hours) => Object.fromEntries(av.DAY_KEYS.map((day) => [day, hours]));
const weekButton = (label) => outlet.querySelector(`button[aria-label="${label}"]`);
const weekTitle = () => text(outlet.querySelector('.av-week-title strong'));
const weekRange = () => text(outlet.querySelector('.av-week-title .muted'));
// Il nome della persona senza « · advisor».
const person = (name) => [...outlet.querySelectorAll('.av-person')].find((b) => text(b.querySelector('.av-person-name')).replace(/ · advisor$/, '') === name);
const peopleNames = () => [...outlet.querySelectorAll('.av-person-name')].map(text);
const personState = (name) => text(person(name).querySelector('.av-person-state'));
const best = () => [...outlet.querySelectorAll('.av-best li')].map((li) => [...li.children].map(text));
const bestCard = () => text(outlet.querySelector('.av-best-card'));
const notCounted = () => text([...outlet.querySelectorAll('.av-best-card p')].find((p) => text(p).startsWith('Non contano')));
const detail = () => text(outlet.querySelector('.av-detail'));
const saveButton = () => byText(outlet, 'button', 'Salva i miei impegni');
const saveStatus = () => text(outlet.querySelector('.save-bar [role="status"]'));
const pressed = (day, hour) => cell(day, hour).getAttribute('aria-pressed') === 'true';
const scopeButton = (label) => [...outlet.querySelectorAll('.av-scope button')].find((b) => text(b) === label);
const untilInput = () => outlet.querySelector('.av-until input[type="date"]');
const untilWarning = () => text(outlet.querySelector('.av-until .av-warn'));
const note = () => text(outlet.querySelector('.av-note p'));
const toasts = () => text(document.querySelector('.toasts'));
const tabStops = (grid) => [...outlet.querySelectorAll(`${grid} .av-cell[tabindex="0"]`)].map((el) => el.dataset.focus);

// Da tastiera il clic arriva senza pointerdown, come quello di jsdom.
const tap = (day, hour) => cell(day, hour).click();
const click = (el, detail) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, detail }));

async function nextWeek(times = 1) {
  for (let i = 0; i < times; i += 1) weekButton('Settimana successiva').click();
  await flush(1);
}

async function save() {
  saveButton().click();
  await flush(10);
}

function pointer(type, target, { x = 0, y = 0, button = 0, buttons = 1 } = {}) {
  const Ctor = window.PointerEvent || window.MouseEvent;
  target.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, button, buttons, clientX: x, clientY: y }));
}

const release = (type = 'pointerup') => window.dispatchEvent(new window.Event(type));

function keydown(target, key) {
  const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
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

// Il salvataggio resta in corso finché il test non chiama la funzione restituita.
function slowSave(calls) {
  const pending = [];
  api.saveItem = (args) => {
    calls.push(args);
    return new Promise((resolve) => pending.push(() => resolve(saved(args))));
  };
  return () => pending.shift()();
}

test('the team grid of next week counts who is free and lists the best hours', async () => {
  // Settimana prossima: nessuna ora è già passata.
  mine({ busy: { lun: [8, 9, 10, 11, 12, 13] } });
  bruno({ busy: { lun: [14, 15, 16, 17, 18, 19, 20, 21] } });
  await visit(TEAM);
  await nextWeek();
  assert.equal(text(cell(0, 8)), '1/2');
  assert.equal(cell(0, 8).getAttribute('aria-label'), `lunedì ${av.shortDate(next)} dalle 8 alle 9: 1 liberi su 2`);
  assert.equal(text(cell(1, 8)), '2/2');
  assert.ok(cell(1, 8).classList.contains('av-l4'));
  assert.equal(cell(1, 8).getAttribute('aria-pressed'), null);
  assert.deepEqual(best(), [
    [av.slotLabel(av.addDays(next, 1), 8, 22), 'tutti liberi'],
    [av.slotLabel(av.addDays(next, 2), 8, 22), 'tutti liberi'],
    [av.slotLabel(av.addDays(next, 3), 8, 22), 'tutti liberi'],
  ]);
  assert.equal(outlet.querySelector('.av-best li span').className, 'av-all');
  assert.match(text(outlet), /Chiara/);
});

test('in «I miei impegni» a tap marks an hour and the first save creates my item', async () => {
  const calls = [];
  fakeCreate(calls);
  await visit(MINE_VIEW);
  tap(2, 9);
  assert.equal(pressed(2, 9), true);
  await save();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, 'availability');
  assert.deepEqual(calls[0].data, { busy: { mer: [9] } });
  assert.equal(calls[0].title, 'Impegni');
});

// Pagina Squadra

test('the Squadra tabs include Disponibilità and the other tabs still work', async () => {
  let body = await visit('#/squadra');
  const tabs = [...outlet.querySelectorAll('.tabs .tab')];
  assert.deepEqual(tabs.map(text), ['Team Canvas', 'Divisione delle quote', 'Disponibilità']);
  assert.deepEqual(tabs.map((a) => a.getAttribute('href')), ['#/squadra/canvas', '#/squadra/quote', '#/squadra/disponibilita']);
  assert.equal(text(outlet.querySelector('.tab.is-active')), 'Team Canvas');
  assert.match(body, /Il Team Canvas non è ancora stato compilato/);
  assert.match(body, /quando siamo liberi/);

  body = await visit('#/squadra/quote');
  assert.equal(text(outlet.querySelector('.tab.is-active')), 'Divisione delle quote');
  assert.match(body, /Le quote non sono ancora state discusse/);

  const canvas = item({ id: IDEA, kind: 'teamcanvas', title: 'Team Canvas', data: {} });
  store.applyItem(canvas);
  await visit('#/squadra/canvas');
  assert.equal(byText(outlet, '.page-actions a', 'Modifica')?.getAttribute('href'), `#/modifica/${IDEA}`);
  assert.equal(byText(outlet, '.page-actions a', 'Versioni')?.getAttribute('href'), `#/storico/${IDEA}`);
  assert.equal(outlet.querySelector('.av-grid'), null);

  await visit(TEAM);
  const active = outlet.querySelector('.tab.is-active');
  assert.equal(text(active), 'Disponibilità');
  assert.equal(active.getAttribute('aria-current'), 'page');
  assert.equal(text(outlet.querySelector('h1')), 'Squadra');
  assert.equal(outlet.querySelector('.page-actions'), null, 'l\'intestazione non ha azioni');
  const views = () => outlet.querySelector('.tab-body').firstElementChild;
  assert.ok(views().matches('nav.tabs.subtabs'));
  assert.equal(views().getAttribute('aria-label'), 'Vista');
  const modes = [...views().querySelectorAll('.tab')];
  assert.deepEqual(modes.map(text), ['Orari della squadra', 'I miei impegni']);
  assert.deepEqual(modes.map((a) => a.getAttribute('href')), [TEAM, MINE_VIEW]);
  assert.deepEqual(modes.map((a) => a.getAttribute('aria-current')), ['page', null]);
  assert.ok(outlet.querySelector('.av-team'));
  assert.equal(outlet.querySelector('.av-edit'), null);

  await visit(MINE_VIEW);
  assert.equal(text(outlet.querySelector('.tab.is-active')), 'Disponibilità');
  assert.equal(outlet.querySelector('.page-actions'), null);
  assert.equal(views().querySelector('[aria-current="page"]'), byText(views(), '.tab', 'I miei impegni'));
  assert.ok(outlet.querySelector('.av-edit'));
  assert.equal(outlet.querySelector('.av-team'), null);

  document.body.append(outlet);
  byText(views(), '.tab', 'Orari della squadra').click();
  await flush(5);
  assert.ok(outlet.querySelector('.av-team'));
  assert.equal(location.hash, TEAM);
  outlet.remove();

  await visit('#/squadra/disponibilita?vista=altro');
  assert.ok(outlet.querySelector('.av-team'), 'una vista sconosciuta mostra gli orari della squadra');

  await visit('#/squadra/sconosciuta');
  assert.equal(text(outlet.querySelector('.tab.is-active')), 'Team Canvas');
});

// Orari della squadra

test('with nobody filled in, the team view says so and nobody counts', async () => {
  await visit(TEAM);
  const cells = [...outlet.querySelectorAll('.av-team .av-cell')];
  assert.equal(cells.length, 7 * av.HOURS.length);
  assert.ok(cells.every((el) => text(el) === '' && el.classList.contains('av-l0')));
  assert.match(cell(0, 8).getAttribute('aria-label'), /: nessuno ha segnato i suoi impegni/);
  assert.equal(outlet.querySelectorAll('.av-best li').length, 0);
  assert.match(bestCard(), /Nessuna delle persone scelte ha segnato i suoi impegni per questa settimana\./);
  assert.equal(notCounted(), 'Non contano: Anna (non ha segnato i suoi impegni), Bruno (non ha segnato i suoi impegni).');
  assert.deepEqual(peopleNames(), ['Anna', 'Bruno', 'Chiara · advisor']);
  for (const name of ['Anna', 'Bruno', 'Chiara']) assert.equal(personState(name), 'non ha ancora segnato i suoi impegni');
  assert.equal(detail(), 'Tocca un\'ora per vedere chi è libero.');
  cell(2, 12).click();
  assert.match(detail(), /Non si sa: Anna e Bruno/);
  assert.doesNotMatch(detail(), /Liberi|Impegnati|Chiara/);
  assert.equal(byText(outlet, 'a', 'Segna i tuoi impegni').getAttribute('href'), MINE_VIEW);

  const legend = outlet.querySelector('.av-legend');
  assert.equal(text(legend.firstElementChild), 'Nelle caselle: quanti sono liberi su quanti hanno segnato i loro impegni.');
  const scale = legend.querySelector('.av-legend-scale');
  assert.equal(scale.getAttribute('aria-hidden'), 'true');
  assert.equal(text(scale), 'Nessuno liberoTutti liberi');
  assert.deepEqual([...scale.querySelectorAll('.av-swatch')].map((el) => el.classList[1]), ['av-l1', 'av-l2', 'av-l3', 'av-l4']);
});

test('an expired weekly pattern does not count unless a week entry covers that week', async () => {
  const sunday = av.addDays(next, -1);
  const lastWeek = av.addDays(monday, -1);
  // Anna vale fino a domenica, Bruno è scaduto ma ha segnato la prossima settimana a parte.
  mine({ busy: {}, until: sunday });
  bruno({ busy: { mar: [9] }, until: lastWeek, weeks: [{ key: next, busy: {} }] });
  await visit(TEAM);
  assert.equal(text(cell(1, 9)), '1/1');
  assert.match(personState('Anna'), /^aggiornato /);
  assert.equal(personState('Bruno'), `orario tipo scaduto ${av.withDay('il', lastWeek, format.fmtDate(lastWeek))}`);
  assert.ok(person('Bruno').querySelector('.av-warn'));
  assert.equal(person('Anna').querySelector('.av-warn'), null);
  assert.equal(notCounted(), 'Non contano: Bruno (orario tipo scaduto).');

  await nextWeek();
  assert.equal(text(cell(1, 9)), '1/1', 'conta la settimana di Bruno, non il suo orario tipo');
  assert.equal(personState('Anna'), `orario tipo scaduto ${av.withDay('il', sunday, format.fmtDate(sunday))}`);
  assert.match(personState('Bruno'), /^aggiornato /);
  assert.equal(notCounted(), 'Non contano: Anna (orario tipo scaduto).');
  cell(1, 9).click();
  assert.match(detail(), /Liberi: Bruno/);
  assert.match(detail(), /Non si sa: Anna/);

  await nextWeek();
  assert.equal(text(cell(1, 9)), '');
  assert.match(bestCard(), /Nessuna delle persone scelte ha segnato i suoi impegni per la settimana scelta\./);
  assert.equal(notCounted(), 'Non contano: Anna (orario tipo scaduto), Bruno (orario tipo scaduto).');
});

test('a pattern ending mid-week counts only for its days and the detail lists free, busy and unknown people', async () => {
  const until = av.addDays(next, 2);
  mine({ busy: { lun: [10], gio: [10] }, until });
  bruno({ busy: {} });
  await visit(TEAM);
  await nextWeek();
  assert.equal(text(cell(0, 10)), '1/2');
  assert.ok(cell(0, 10).classList.contains('av-l3'));
  assert.equal(text(cell(0, 11)), '2/2');
  assert.equal(text(cell(2, 21)), '2/2', 'il giorno della scadenza conta ancora');
  assert.equal(text(cell(3, 10)), '1/1', 'dopo la scadenza Anna non conta');
  assert.ok(cell(3, 10).classList.contains('av-l4'));
  assert.equal(personState('Anna'), `conta fino ${av.withDay('al', until, format.fmtDate(until))}`);
  assert.ok(person('Anna').querySelector('.av-person-state.av-warn'));
  assert.equal(notCounted(), `Non contano: Anna (conta fino ${av.withDay('al', until, av.shortDate(until))}).`);
  assert.deepEqual(best(), [
    [av.slotLabel(next, 8, 10), 'tutti liberi'],
    [av.slotLabel(next, 11, 22), 'tutti liberi'],
    [av.slotLabel(av.addDays(next, 1), 8, 22), 'tutti liberi'],
  ]);

  cell(3, 10).click();
  assert.equal(cell(3, 10).getAttribute('aria-current'), 'true');
  assert.equal(cell(3, 10).getAttribute('aria-pressed'), null);
  assert.ok(cell(3, 10).classList.contains('is-picked'));
  assert.match(detail(), new RegExp(`^${av.slotLabel(av.addDays(next, 3), 10, 11)}`));
  assert.match(detail(), /Liberi: Bruno/);
  assert.match(detail(), /Non si sa: Anna/);
  assert.doesNotMatch(detail(), /Impegnati/);

  cell(0, 10).click();
  assert.equal(cell(3, 10).getAttribute('aria-current'), null);
  assert.equal(cell(0, 10).getAttribute('aria-current'), 'true');
  assert.equal(outlet.querySelectorAll('.av-team .is-picked').length, 1);
  assert.equal(outlet.querySelectorAll('.av-team [aria-current]').length, 1);
  assert.match(detail(), /Liberi: Bruno/);
  assert.match(detail(), /Impegnati: Anna/);
  assert.doesNotMatch(detail(), /Non si sa/);
});

test('advisors are left out by default and count after tapping them, the choice is saved on this device', async () => {
  mine({ busy: {} });
  bruno({ busy: {} });
  chiara({ busy: {} });
  await visit(TEAM);
  await nextWeek();
  assert.equal(person('Chiara').getAttribute('aria-pressed'), 'false');
  assert.equal(person('Anna').getAttribute('aria-pressed'), 'true');
  assert.equal(text(cell(0, 8)), '2/2');

  const chiaraButton = person('Chiara');
  assert.equal(chiaraButton.querySelector('.av-person-avatar').getAttribute('aria-hidden'), 'true');
  assert.ok(chiaraButton.querySelector('.av-person-avatar .avatar'));
  assert.equal(text(chiaraButton.querySelector('.av-person-name')), 'Chiara · advisor');
  assert.equal(text(chiaraButton.querySelector('.av-person-mark')), 'non conta');
  assert.match(text(chiaraButton.querySelector('.av-person-state')), /^aggiornato /);
  assert.equal(text(person('Anna').querySelector('.av-person-name')), 'Anna');
  assert.equal(text(person('Anna').querySelector('.av-person-mark')), 'conta');

  person('Chiara').click();
  assert.equal(person('Chiara').getAttribute('aria-pressed'), 'true');
  assert.ok(person('Chiara').classList.contains('is-on'));
  assert.equal(text(person('Chiara').querySelector('.av-person-mark')), 'conta');
  assert.equal(text(cell(0, 8)), '3/3');
  assert.equal(weekTitle(), 'La prossima settimana', 'la settimana scelta resta');
  assert.deepEqual(JSON.parse(localStorage.getItem(CHOICE_KEY)), { on: [ADVISOR], off: [] });

  person('Anna').click();
  assert.equal(text(cell(0, 8)), '2/2');
  assert.equal(text(person('Anna').querySelector('.av-person-mark')), 'non conta');
  assert.deepEqual(JSON.parse(localStorage.getItem(CHOICE_KEY)), { on: [ADVISOR], off: [ME] });

  await visit(TEAM);
  await nextWeek();
  assert.equal(person('Anna').getAttribute('aria-pressed'), 'false');
  assert.equal(person('Chiara').getAttribute('aria-pressed'), 'true');
  cell(0, 8).click();
  assert.match(detail(), /Liberi: Bruno e Chiara/);

  person('Bruno').click();
  person('Chiara').click();
  assert.match(bestCard(), /Scegli almeno una persona qui sotto\./);
  assert.equal(text(cell(0, 8)), '');
  assert.doesNotMatch(bestCard(), /Non contano/);

  person('Anna').click();
  assert.deepEqual(JSON.parse(localStorage.getItem(CHOICE_KEY)), { on: [ME], off: [OTHER, ADVISOR] });
  assert.equal(text(cell(0, 8)), '1/1');
});

test('invalid stored choices are ignored and valid ones next to them still apply', async () => {
  mine({ busy: {} });
  bruno({ busy: {} });
  chiara({ busy: {} });
  const stored = [
    JSON.stringify({ on: ['<script>', 42, null, { id: ADVISOR }, ADVISOR.toUpperCase().replace(/-/g, '')], off: ME }),
    '{non è json',
    JSON.stringify([ADVISOR]),
    JSON.stringify(null),
  ];
  for (const raw of stored) {
    localStorage.setItem(CHOICE_KEY, raw);
    await visit(TEAM);
    await nextWeek();
    assert.equal(text(cell(0, 8)), '2/2', raw);
    assert.equal(person('Chiara').getAttribute('aria-pressed'), 'false', raw);
    assert.equal(person('Anna').getAttribute('aria-pressed'), 'true', raw);
  }

  // I valori non validi non tornano nella scelta salvata.
  localStorage.setItem(CHOICE_KEY, stored[0]);
  await visit(TEAM);
  person('Chiara').click();
  assert.deepEqual(JSON.parse(localStorage.getItem(CHOICE_KEY)), { on: [ADVISOR], off: [] });

  localStorage.setItem(CHOICE_KEY, JSON.stringify({ on: [ADVISOR, 'x'], off: [OTHER, 7] }));
  await visit(TEAM);
  await nextWeek();
  assert.equal(person('Chiara').getAttribute('aria-pressed'), 'true');
  assert.equal(person('Bruno').getAttribute('aria-pressed'), 'false');
  cell(0, 8).click();
  assert.match(detail(), /Liberi: Anna e Chiara/);
});

test('people who left the team are not shown and do not count, even if chosen', async () => {
  availability(GONE_ITEM, GONE, { busy: {} });
  mine({ busy: {} });
  bruno({ busy: { lun: [8] } });
  localStorage.setItem(CHOICE_KEY, JSON.stringify({ on: [GONE], off: [] }));
  await visit(TEAM);
  await nextWeek();
  assert.deepEqual(peopleNames(), ['Anna', 'Bruno', 'Chiara · advisor']);
  assert.equal(text(cell(0, 8)), '1/2');
  assert.equal(text(cell(0, 9)), '2/2');
  assert.doesNotMatch(text(outlet), /Ex membro/);

  // Bruno esce dalla squadra mentre la pagina è aperta.
  api.membersOverview = async () => members().filter((m) => m.user_id !== OTHER);
  await store.reloadMembers();
  assert.deepEqual(peopleNames(), ['Anna', 'Chiara · advisor']);
  assert.equal(text(cell(0, 8)), '1/1');
  assert.equal(weekTitle(), 'La prossima settimana');
});

test('empty and partial results: no common hour, then the best hours with who is missing', async () => {
  const morning = av.HOURS.filter((hour) => hour <= 14);
  const afternoon = av.HOURS.filter((hour) => hour >= 14);
  mine({ busy: everyDay(morning) });
  bruno({ busy: everyDay(afternoon) });
  chiara({ busy: {} });
  await visit(TEAM);
  assert.match(bestCard(), /Nessun orario libero in comune in questa settimana\./);

  await nextWeek();
  assert.equal(text(cell(0, 8)), '1/2');
  assert.ok(cell(0, 8).classList.contains('av-l3'));
  assert.equal(text(cell(0, 14)), '0/2');
  assert.ok(cell(0, 14).classList.contains('av-l1'));
  assert.equal(outlet.querySelectorAll('.av-best li').length, 0, 'una sola persona libera non basta quando ne contano due');
  assert.match(bestCard(), new RegExp(`Nessun orario libero in comune ${av.weekLabel(next)}\\.`));
  assert.doesNotMatch(bestCard(), /Non contano/);

  person('Chiara').click();
  assert.equal(text(cell(0, 14)), '1/3');
  assert.ok(cell(0, 14).classList.contains('av-l2'));
  assert.equal(text(cell(0, 8)), '2/3');
  assert.deepEqual(best(), [
    [av.slotLabel(next, 8, 14), 'manca Anna'],
    [av.slotLabel(next, 15, 22), 'manca Bruno'],
    [av.slotLabel(av.addDays(next, 1), 8, 14), 'manca Anna'],
  ]);
  assert.ok([...outlet.querySelectorAll('.av-best li span')].every((el) => el.className === 'muted'));
});

test('the best hours say for whom it is not known whether they are free', async () => {
  const until = av.addDays(next, 1);
  localStorage.setItem(CHOICE_KEY, JSON.stringify({ on: [ADVISOR], off: [] }));
  mine({ busy: {}, until });
  bruno({ busy: { lun: av.HOURS, mar: av.HOURS } });
  chiara({ busy: {}, until });
  await visit(TEAM);
  await nextWeek();
  const wednesday = av.addDays(next, 2);
  assert.deepEqual(best(), [
    [av.slotLabel(next, 8, 22), 'manca Bruno'],
    [av.slotLabel(av.addDays(next, 1), 8, 22), 'manca Bruno'],
    [av.slotLabel(wednesday, 8, 22), 'non si sa per Anna e Chiara'],
  ]);
  assert.ok([...outlet.querySelectorAll('.av-best li span')].every((el) => el.className === 'muted'));
  const end = av.withDay('al', until, av.shortDate(until));
  assert.equal(notCounted(), `Non contano: Anna (conta fino ${end}), Chiara (conta fino ${end}).`);

  person('Chiara').click();
  assert.deepEqual(best(), [
    [av.slotLabel(wednesday, 8, 22), 'non si sa per Anna'],
    [av.slotLabel(av.addDays(next, 3), 8, 22), 'non si sa per Anna'],
    [av.slotLabel(av.addDays(next, 4), 8, 22), 'non si sa per Anna'],
  ]);
  assert.equal(notCounted(), `Non contano: Anna (conta fino ${end}).`);
});

test('week navigation goes from this week to at most 11 weeks ahead', async () => {
  await visit(TEAM);
  const title = outlet.querySelector('.av-week-title');
  assert.equal(title.getAttribute('aria-live'), 'polite');
  assert.equal(title.querySelector('strong').nextElementSibling, title.querySelector('.muted'));
  assert.equal(weekTitle(), 'Questa settimana');
  assert.equal(weekRange(), av.weekLabel(monday));
  assert.equal(weekButton('Settimana precedente').dataset.focus, 'week-prev');
  assert.equal(weekButton('Settimana successiva').dataset.focus, 'week-next');
  assert.equal(weekButton('Settimana precedente').disabled, true);
  weekButton('Settimana precedente').click();
  assert.equal(weekTitle(), 'Questa settimana');

  await nextWeek();
  assert.equal(weekTitle(), 'La prossima settimana');
  assert.equal(weekRange(), av.weekLabel(next));
  assert.equal(weekButton('Settimana precedente').disabled, false);

  await nextWeek();
  assert.equal(weekTitle(), 'Tra 2 settimane');
  assert.equal(weekRange(), av.weekLabel(av.addDays(next, 7)));

  await nextWeek(9);
  const last = av.addDays(monday, 7 * (av.WEEKS_AHEAD - 1));
  assert.equal(weekTitle(), `Tra ${av.WEEKS_AHEAD - 1} settimane`);
  assert.equal(weekRange(), av.weekLabel(last));
  assert.equal(weekButton('Settimana successiva').disabled, true);
  await nextWeek();
  assert.equal(weekRange(), av.weekLabel(last));
  assert.equal(text(outlet.querySelector('.av-team thead th:nth-child(2) .av-date')), av.shortDate(last));
  assert.equal(outlet.querySelector('.av-team').getAttribute('aria-label'), `Persone libere ${av.weekLabel(last)}`);

  weekButton('Settimana precedente').click();
  assert.equal(weekTitle(), `Tra ${av.WEEKS_AHEAD - 2} settimane`);
  assert.equal(weekRange(), av.weekLabel(av.addDays(last, -7)));
  assert.equal(weekButton('Settimana successiva').disabled, false);
});

test('past hours of this week are dimmed and next week has none', async () => {
  await visit(TEAM);
  const now = Date.now();
  for (const el of outlet.querySelectorAll('.av-team .av-cell')) {
    const day = Number(el.dataset.day);
    const hour = Number(el.dataset.hour);
    const date = av.addDays(monday, day);
    const [y, m, d] = date.split('-').map(Number);
    const start = new Date(y, m - 1, d, hour).getTime();
    // Le ore a cavallo dell'esecuzione non si controllano.
    if (Math.abs(start - now) < 60_000) continue;
    const past = start < now;
    assert.equal(el.classList.contains('is-past'), past, el.getAttribute('aria-label'));
    assert.equal(
      el.getAttribute('aria-label'),
      `${av.DAYS[day][1]} ${av.shortDate(date)} ${av.hourSpan(hour)}: nessuno ha segnato i suoi impegni${past ? ', già passato' : ''}`,
    );
  }
  await nextWeek();
  assert.equal(outlet.querySelectorAll('.av-team .is-past').length, 0);
  assert.doesNotMatch(cell(0, 8).getAttribute('aria-label'), /già passato/);
});

test('the team view follows live saves and member changes but ignores other kinds', async () => {
  mine({ busy: {} });
  await visit(TEAM);
  await nextWeek();
  assert.equal(text(cell(0, 8)), '1/1');
  assert.equal(personState('Bruno'), 'non ha ancora segnato i suoi impegni');
  bruno({ busy: { lun: [8] } });
  assert.equal(text(cell(0, 8)), '1/2');
  assert.match(personState('Bruno'), /^aggiornato /);
  assert.equal(weekTitle(), 'La prossima settimana');

  const table = outlet.querySelector('.av-team');
  store.applyItem(item({ id: IDEA, kind: 'idea', title: 'Idea nuova', data: {} }));
  assert.equal(outlet.querySelector('.av-team'), table);

  bruno({ busy: { lun: [8] } }, { version: 2, deleted_at: '2026-10-20T10:00:00Z' });
  assert.equal(text(cell(0, 8)), '1/1', 'un elemento archiviato non conta');
});

test('display names are rendered as text, never as HTML', async () => {
  store.setMembers(members().map((m) => (m.user_id === OTHER ? { ...m, display_name: `Bruno ${XSS}` } : m)));
  localStorage.setItem(CHOICE_KEY, JSON.stringify({ on: [ADVISOR], off: [] }));
  mine({ busy: {} });
  bruno({ busy: everyDay(av.HOURS) });
  chiara({ busy: {} });
  await visit(TEAM);
  await nextWeek();
  assert.equal(best()[0][1], `manca Bruno ${XSS}`);
  cell(0, 8).click();
  assert.match(detail(), /Impegnati: Bruno <img/);
  assert.ok(peopleNames().includes(`Bruno ${XSS}`));
  assert.equal(outlet.querySelector('img, script'), null);
  assert.equal(window.__xss, undefined);
});

// I miei impegni

test('a keyboard tap marks and unmarks an hour', async () => {
  mine({ busy: { lun: [9] } });
  await visit(MINE_VIEW);
  assert.equal(pressed(0, 9), true);
  assert.ok(cell(0, 9).classList.contains('av-taken'));
  assert.equal(saveButton().disabled, true);
  assert.match(saveStatus(), /^Salvato /);
  assert.equal(cell(2, 10).getAttribute('aria-label'), 'mercoledì dalle 10 alle 11, impegnato');

  tap(2, 10);
  assert.equal(pressed(2, 10), true);
  assert.ok(cell(2, 10).classList.contains('av-taken'));
  assert.ok(!cell(2, 10).classList.contains('is-busy'), 'is-busy è la rotellina di caricamento');
  assert.equal(saveStatus(), 'Modifiche non salvate');
  assert.equal(saveButton().disabled, false);

  tap(2, 10);
  assert.equal(pressed(2, 10), false);
  assert.ok(!cell(2, 10).classList.contains('av-taken'));
  assert.match(saveStatus(), /^Salvato /);
  assert.equal(saveButton().disabled, true);

  tap(0, 9);
  assert.equal(pressed(0, 9), false);
  assert.equal(saveStatus(), 'Modifiche non salvate');
});

test('the click that follows a pointerdown is ignored, a click without pointerdown toggles', async () => {
  await visit(MINE_VIEW);
  for (const detail of [0, 1, 2]) {
    pointer('pointerdown', cell(detail, 10));
    release();
    click(cell(detail, 10), detail);
    assert.equal(pressed(detail, 10), true, `detail ${detail}`);
  }

  // Tastiera e lettori di schermo mandano solo il clic, a volte con detail 1.
  click(cell(4, 12), 1);
  assert.equal(pressed(4, 12), true);
  click(cell(4, 12), 0);
  assert.equal(pressed(4, 12), false);

  // Col dito il clic arriva anche dopo il rilascio e dopo altri compiti: è ancora lo stesso tocco.
  pointer('pointerdown', cell(5, 9));
  release();
  await flush(1);
  tap(5, 9);
  assert.equal(pressed(5, 9), true);

  // Dopo un tasto il clic è della tastiera e conta di nuovo.
  keydown(cell(5, 9), 'Enter');
  tap(5, 9);
  assert.equal(pressed(5, 9), false);
});

test('dragging paints or erases the hours the pointer passes over', async () => {
  const calls = [];
  fakeCreate(calls);
  // Nei test le coordinate sono giorno e ora.
  document.elementFromPoint = (x, y) => cell(x, y);
  await visit(MINE_VIEW);
  const table = outlet.querySelector('.av-edit');

  pointer('pointerdown', cell(1, 10));
  pointer('pointermove', table, { x: 1, y: 11 });
  pointer('pointermove', table, { x: 1, y: 12 });
  pointer('pointermove', table, { x: 2, y: 12 });
  pointer('pointermove', table, { x: 1, y: 10 });
  release();
  pointer('pointermove', table, { x: 3, y: 12 });
  assert.deepEqual([pressed(1, 10), pressed(1, 11), pressed(1, 12), pressed(2, 12), pressed(3, 12)], [true, true, true, true, false]);
  assert.equal(saveStatus(), 'Modifiche non salvate');

  // Partire da un'ora impegnata cancella.
  pointer('pointerdown', cell(1, 11));
  pointer('pointermove', table, { x: 1, y: 12 });
  pointer('pointermove', table, { x: 1, y: 13 });
  release('pointercancel');
  pointer('pointermove', table, { x: 2, y: 12 });
  assert.deepEqual([pressed(1, 10), pressed(1, 11), pressed(1, 12), pressed(1, 13), pressed(2, 12)], [true, false, false, false, true]);

  pointer('pointerdown', cell(5, 15), { button: 2, buttons: 2 });
  pointer('pointermove', table, { x: 5, y: 16 });
  assert.equal(pressed(5, 15), false);
  assert.equal(pressed(5, 16), false);

  // Fuori dalla griglia non si segna nulla.
  const stray = document.createElement('button');
  stray.className = 'av-cell';
  document.body.append(stray);
  pointer('pointerdown', cell(6, 8));
  for (const target of [document.body, stray, null]) {
    document.elementFromPoint = () => target;
    pointer('pointermove', table, { x: 6, y: 9 });
  }
  release();
  stray.remove();
  assert.equal(pressed(6, 8), true);
  assert.equal(stray.getAttribute('aria-pressed'), null);

  await save();
  assert.deepEqual(calls[0].data, { busy: { mar: [10], mer: [12], dom: [8] } });
});

test('a drag ends when the button turns out released or the window loses focus', async () => {
  document.elementFromPoint = (x, y) => cell(x, y);
  await visit(MINE_VIEW);
  const table = outlet.querySelector('.av-edit');

  // Rilasciato fuori dalla finestra: nessun pointerup, ma il movimento dopo arriva senza pulsanti.
  pointer('pointerdown', cell(1, 10));
  pointer('pointermove', table, { x: 1, y: 11 });
  pointer('pointermove', table, { x: 1, y: 12, buttons: 0 });
  pointer('pointermove', table, { x: 1, y: 13 });
  assert.deepEqual([pressed(1, 10), pressed(1, 11), pressed(1, 12), pressed(1, 13)], [true, true, false, false]);

  pointer('pointerdown', cell(3, 10));
  window.dispatchEvent(new window.Event('blur'));
  pointer('pointermove', table, { x: 3, y: 11 });
  assert.deepEqual([pressed(3, 10), pressed(3, 11)], [true, false]);
});

test('arrow keys move the focus between hours in both grids and stop at the edges', async () => {
  document.body.append(outlet);
  await visit(MINE_VIEW);
  cell(0, 8).focus();
  assert.equal(keydown(cell(0, 8), 'ArrowDown').defaultPrevented, true);
  assert.equal(document.activeElement, cell(0, 9));
  keydown(document.activeElement, 'ArrowRight');
  assert.equal(document.activeElement, cell(1, 9));
  keydown(document.activeElement, 'ArrowLeft');
  keydown(document.activeElement, 'ArrowUp');
  assert.equal(document.activeElement, cell(0, 8));

  for (const key of ['ArrowUp', 'ArrowLeft', 'Enter', 'a']) {
    assert.equal(keydown(cell(0, 8), key).defaultPrevented, false, key);
    assert.equal(document.activeElement, cell(0, 8), key);
  }
  const lastHour = av.HOURS.at(-1);
  cell(6, lastHour).focus();
  keydown(cell(6, lastHour), 'ArrowDown');
  keydown(cell(6, lastHour), 'ArrowRight');
  assert.equal(document.activeElement, cell(6, lastHour));
  assert.equal(pressed(0, 8), false, 'le frecce non segnano le ore');

  await visit(TEAM);
  cell(3, 12).focus();
  keydown(cell(3, 12), 'ArrowUp');
  assert.equal(document.activeElement, cell(3, 11));
});

test('each grid is a single tab stop that follows the focused hour', async () => {
  document.body.append(outlet);
  await visit(MINE_VIEW);
  assert.deepEqual(tabStops('.av-edit'), ['cell-0-8']);
  assert.equal(outlet.querySelectorAll('.av-edit .av-cell[tabindex="-1"]').length, 7 * av.HOURS.length - 1);
  cell(2, 12).focus();
  assert.deepEqual(tabStops('.av-edit'), ['cell-2-12']);
  keydown(cell(2, 12), 'ArrowRight');
  assert.equal(document.activeElement, cell(3, 12));
  assert.deepEqual(tabStops('.av-edit'), ['cell-3-12']);

  await visit(TEAM);
  assert.deepEqual(tabStops('.av-team'), ['cell-0-8']);
  cell(4, 15).focus();
  assert.deepEqual(tabStops('.av-team'), ['cell-4-15']);
  cell(4, 15).click();
  cell(0, 8).focus();
  assert.deepEqual(tabStops('.av-team'), ['cell-0-8']);
  // Ridisegno con il focus fuori dalla griglia: la fermata torna sull'ora scelta.
  document.activeElement.blur();
  person('Chiara').click();
  assert.deepEqual(tabStops('.av-team'), ['cell-4-15']);
  assert.equal(cell(4, 15).getAttribute('aria-current'), 'true');
});

test('after a redraw the focus goes back to the control that had it', async () => {
  document.body.append(outlet);
  mine({ busy: {}, weeks: [{ key: next, busy: { lun: [9] } }] });
  bruno({ busy: {} });
  const stays = (old, key) => {
    const now = document.activeElement;
    assert.notEqual(now, old, `${key}: la pagina è stata ridisegnata`);
    assert.ok(outlet.contains(now), key);
    assert.equal(now.dataset.focus, key);
  };
  await visit(TEAM);
  let old = focusOn(weekButton('Settimana successiva'));
  old.click();
  stays(old, 'week-next');
  assert.equal(weekTitle(), 'La prossima settimana');
  weekButton('Settimana successiva').click();
  old = focusOn(weekButton('Settimana precedente'));
  old.click();
  stays(old, 'week-prev');
  old = focusOn(person('Chiara'));
  old.click();
  stays(old, `person-${ADVISOR}`);
  old = focusOn(cell(3, 12));
  bruno({ busy: { gio: [12] } }, { version: 2 });
  stays(old, 'cell-3-12');

  await visit(MINE_VIEW);
  old = focusOn(scopeButton('Una settimana precisa'));
  old.click();
  stays(old, 'scope-week');
  await nextWeek();
  old = focusOn(byText(outlet, 'button', 'Torna all\'orario tipo'));
  mine({ busy: { mar: [9] }, weeks: [{ key: next, busy: { lun: [9] } }] }, { version: 2 });
  stays(old, 'back-base');
  old = focusOn(cell(2, 10));
  mine({ busy: { mar: [10] }, weeks: [{ key: next, busy: { lun: [9] } }] }, { version: 3 });
  stays(old, 'cell-2-10');
  old = focusOn(scopeButton('Orario tipo'));
  old.click();
  stays(old, 'scope-base');
});

test('«Valido fino al» sets and clears the end of the weekly pattern', async () => {
  const creates = [];
  const saves = [];
  fakeCreate(creates);
  fakeSave(saves);
  await visit(MINE_VIEW);
  assert.equal(untilInput().value, '');
  assert.equal(untilInput().min, format.dayKey(new Date()));
  const end = av.addDays(next, 30);

  typeInto(untilInput(), end);
  assert.equal(untilInput().value, end);
  assert.equal(saveStatus(), 'Modifiche non salvate');
  typeInto(untilInput(), '');
  assert.equal(untilInput().value, '');
  assert.equal(saveStatus(), 'Finché non salvi, non conti negli orari migliori');

  typeInto(untilInput(), end);
  await save();
  assert.deepEqual(creates[0].data, { busy: {}, until: end });
  assert.equal(untilInput().value, end);

  typeInto(untilInput(), '');
  await save();
  assert.equal(saves.length, 1);
  assert.deepEqual(saves[0].snapshot.data, { busy: {} });
  assert.equal(store.getItem(NEW_ID).data.until, undefined);
});

test('typing in «Valido fino al» updates the page in place and dates before 2000 remove the end', async () => {
  const saves = [];
  fakeSave(saves);
  const lastSunday = av.addDays(monday, -1);
  mine({ busy: {}, until: lastSunday });
  await visit(MINE_VIEW);
  const input = untilInput();
  const table = outlet.querySelector('.av-edit');
  assert.match(untilWarning(), /scaduto/);

  // Mentre si scrive l'anno a mano il campo passa per date come 0002-12-20.
  typeInto(input, '0002-12-20');
  assert.equal(untilInput(), input, 'il campo in cui si scrive non viene ridisegnato');
  assert.equal(outlet.querySelector('.av-edit'), table);
  assert.equal(input.value, '0002-12-20');
  assert.equal(untilWarning(), '');
  assert.equal(saveStatus(), 'Modifiche non salvate');

  typeInto(input, '2001-01-01');
  assert.equal(untilWarning(), 'Il tuo orario tipo è scaduto l\'1 gen 2001: controllalo e cambia la data.');
  typeInto(input, '1999-12-31');
  assert.equal(untilWarning(), '');
  typeInto(input, lastSunday);
  assert.match(untilWarning(), /scaduto/);
  assert.match(saveStatus(), /^Salvato /, 'tornare alla data salvata non è una modifica');
  assert.equal(untilInput(), input);

  typeInto(input, '1999-12-31');
  await save();
  assert.deepEqual(saves[0].snapshot.data, { busy: {} });
});

test('an expired weekly pattern shows a warning, ending today does not', async () => {
  const lastSunday = av.addDays(monday, -1);
  mine({ busy: {}, until: lastSunday });
  await visit(MINE_VIEW);
  assert.equal(untilWarning(), `Il tuo orario tipo è scaduto ${av.withDay('il', lastSunday, format.fmtDate(lastSunday))}: controllalo e cambia la data.`);
  assert.equal(untilInput().value, lastSunday);

  mine({ busy: {}, until: format.dayKey(new Date()) }, { version: 2 });
  assert.equal(outlet.querySelector('.av-until .av-warn'), null);
});

test('«Una settimana precisa» creates a week entry on the first change only and «Torna all\'orario tipo» removes it', async () => {
  mine({ busy: { lun: [9] } });
  const saves = [];
  fakeSave(saves);
  await visit(MINE_VIEW);
  assert.equal(scopeButton('Orario tipo').getAttribute('aria-pressed'), 'true');
  assert.equal(outlet.querySelector('.av-week'), null);
  assert.equal(note(), '');
  assert.equal(outlet.querySelector('.av-edit').getAttribute('aria-label'), 'Il mio orario tipo');

  scopeButton('Una settimana precisa').click();
  assert.equal(scopeButton('Una settimana precisa').getAttribute('aria-pressed'), 'true');
  assert.equal(outlet.querySelector('.av-until'), null);
  assert.equal(weekButton('Settimana precedente').disabled, true);
  assert.equal(note(), 'Per ora vale l\'orario tipo: quello che cambi qui vale solo per questa settimana.');
  await nextWeek();
  assert.equal(outlet.querySelector('.av-edit').getAttribute('aria-label'), `I miei impegni ${av.weekLabel(next)}`);
  assert.equal(text(outlet.querySelector('.av-edit thead th:nth-child(2) .av-date')), av.shortDate(next));
  assert.equal(note(), `Per ora vale l'orario tipo: quello che cambi qui vale solo ${av.weekLabel(next)}.`);
  assert.equal(pressed(0, 9), true, 'si parte dall\'orario tipo');
  assert.equal(saveButton().disabled, true);

  tap(2, 15);
  tap(3, 16);
  assert.equal(note(), `${av.weekLabel(next).replace(/^d/, 'D')} hai un orario diverso dall'orario tipo.`);
  assert.equal(byText(outlet, '.av-note button', 'Torna all\'orario tipo').dataset.focus, 'back-base');
  assert.equal(saveStatus(), 'Modifiche non salvate');

  scopeButton('Orario tipo').click();
  assert.equal(pressed(2, 15), false, 'l\'orario tipo non cambia');
  assert.equal(pressed(0, 9), true);
  tap(4, 8);

  scopeButton('Una settimana precisa').click();
  assert.equal(weekTitle(), 'La prossima settimana');
  assert.equal(pressed(4, 8), false, 'la settimana con un orario suo non segue l\'orario tipo');
  assert.equal(pressed(2, 15), true);

  byText(outlet, 'button', 'Torna all\'orario tipo').click();
  assert.equal(pressed(2, 15), false);
  assert.equal(pressed(4, 8), true);
  assert.match(note(), /^Per ora vale l'orario tipo/);
  assert.equal(byText(outlet, 'button', 'Torna all\'orario tipo'), null);

  await save();
  assert.deepEqual(saves[0].snapshot.data, { busy: { lun: [9], ven: [8] } });

  // Due modifiche nella stessa settimana fanno una sola voce.
  tap(2, 15);
  tap(2, 16);
  await save();
  assert.deepEqual(saves[1].snapshot.data, {
    busy: { lun: [9], ven: [8] },
    weeks: [{ key: next, busy: { lun: [9], mer: [15, 16], ven: [8] } }],
  });

  weekButton('Settimana precedente').click();
  assert.equal(note(), 'Per ora vale l\'orario tipo: quello che cambi qui vale solo per questa settimana.');
  assert.equal(pressed(2, 15), false);
  tap(1, 20);
  assert.equal(note(), 'Questa settimana hai un orario diverso dall\'orario tipo.');
});

test('in «Una settimana precisa» the days after the pattern expiry are striped until the first change', async () => {
  const until = av.addDays(next, 2);
  mine({ busy: { lun: [9], gio: [9] }, until });
  const saves = [];
  fakeSave(saves);
  await visit(MINE_VIEW);
  scopeButton('Una settimana precisa').click();
  assert.equal(outlet.querySelectorAll('.av-unknown').length, 0, 'questa settimana l\'orario tipo vale ancora');
  await nextWeek();

  const unknownDays = () => [...new Set([...outlet.querySelectorAll('.av-edit .av-unknown')].map((el) => Number(el.dataset.day)))];
  assert.deepEqual(unknownDays(), [3, 4, 5, 6]);
  assert.equal(outlet.querySelectorAll('.av-unknown').length, 4 * av.HOURS.length);
  assert.equal(cell(3, 9).getAttribute('aria-label'), 'giovedì dalle 9 alle 10, impegnato, orario tipo scaduto');
  assert.equal(cell(2, 9).getAttribute('aria-label'), 'mercoledì dalle 9 alle 10, impegnato');
  assert.equal(pressed(0, 9), true);
  assert.equal(pressed(3, 9), false, 'dopo la scadenza l\'orario tipo non vale');
  const warning = outlet.querySelector('.av-note .av-warn');
  assert.equal(
    text(warning),
    `Il tuo orario tipo vale fino ${av.withDay('al', until, format.fmtDate(until))}: nei giorni a righe non conti. Se cambi qualcosa qui, vale tutta la settimana come la vedi.`,
  );

  tap(5, 10);
  assert.deepEqual(unknownDays(), []);
  assert.equal(cell(3, 9).getAttribute('aria-label'), 'giovedì dalle 9 alle 10, impegnato');
  assert.equal(pressed(5, 10), true);
  assert.equal(note(), `${av.weekLabel(next).replace(/^d/, 'D')} hai un orario diverso dall'orario tipo.`);

  await save();
  assert.deepEqual(saves[0].snapshot.data, { busy: { lun: [9], gio: [9] }, until, weeks: [{ key: next, busy: { lun: [9], sab: [10] } }] });
  assert.deepEqual(unknownDays(), []);

  byText(outlet, 'button', 'Torna all\'orario tipo').click();
  assert.deepEqual(unknownDays(), [3, 4, 5, 6]);
  assert.ok(outlet.querySelector('.av-note .av-warn'));
});

test('saving my existing item goes through saveItem with the cleaned data and drops past weeks', async () => {
  const pastWeek = av.addDays(monday, -7);
  const later = av.addDays(monday, 14);
  const until = av.addDays(monday, 60);
  mine({ busy: { lun: [9] }, until, weeks: [{ key: pastWeek, busy: { mar: [10] } }, { key: later, busy: { mer: [11] } }] }, { version: 3, title: 'Vecchio titolo' });
  const saves = [];
  fakeSave(saves);
  api.createItem = async () => {
    throw new Error('non deve creare un secondo elemento');
  };
  await visit(MINE_VIEW);
  assert.equal(saveButton().disabled, true, 'togliere le settimane passate da solo non è una modifica');

  tap(0, 10);
  await save();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].id, MINE);
  assert.equal(saves[0].baseVersion, 3);
  assert.equal(saves[0].message, 'Impegni aggiornati');
  assert.equal(saves[0].snapshot.title, 'Impegni', 'il titolo è sempre lo stesso');
  assert.deepEqual(saves[0].snapshot.data, { busy: { lun: [9, 10] }, until, weeks: [{ key: later, busy: { mer: [11] } }] });
  assert.equal(store.getItem(MINE).version, 4);
  assert.match(toasts(), /Impegni salvati\./);
  assert.equal(saveStatus(), 'Salvato adesso');
  assert.equal(pressed(0, 10), true);
  assert.equal(outlet.querySelector('.error-box'), null);
});

test('the save button is disabled when nothing changed but the very first save is allowed with no busy hours', async () => {
  const creates = [];
  fakeCreate(creates);
  await visit(MINE_VIEW);
  assert.equal(saveButton().disabled, false);
  assert.equal(saveStatus(), 'Finché non salvi, non conti negli orari migliori');
  tap(1, 8);
  tap(1, 8);
  assert.equal(saveButton().disabled, false);
  assert.equal(saveStatus(), 'Finché non salvi, non conti negli orari migliori');

  await save();
  assert.equal(creates.length, 1);
  assert.deepEqual(creates[0].data, { busy: {} });
  assert.equal(creates[0].message, 'Primi impegni');
  assert.equal(store.availabilityOf(ME)?.id, NEW_ID);
  assert.equal(saveStatus(), 'Salvato adesso');

  await visit(MINE_VIEW);
  assert.equal(saveButton().disabled, true);
});

test('after a successful save the save button is disabled again', async () => {
  const creates = [];
  fakeCreate(creates);
  await visit(MINE_VIEW);
  tap(1, 8);
  await save();
  assert.equal(saveStatus(), 'Salvato adesso');
  assert.equal(saveButton().disabled, true);
  assert.ok(!saveButton().classList.contains('is-busy'));
  saveButton().click();
  saveButton().dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush(10);
  assert.equal(creates.length, 1);
});

test('while saving the button stays disabled and the grid ignores input', async () => {
  mine({ busy: {} });
  const saves = [];
  const finish = slowSave(saves);
  document.elementFromPoint = (x, y) => cell(x, y);
  await visit(MINE_VIEW);
  tap(0, 8);
  saveButton().click();
  await flush(2);
  assert.equal(saves.length, 1);
  assert.equal(saveButton().disabled, true);
  assert.ok(saveButton().classList.contains('is-busy'));
  assert.equal(saveStatus(), 'Salvataggio in corso');
  saveButton().dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flush(2);
  assert.equal(saves.length, 1, 'un secondo clic non salva di nuovo');

  tap(1, 9);
  pointer('pointerdown', cell(2, 10));
  pointer('pointermove', outlet.querySelector('.av-edit'), { x: 2, y: 11 });
  release();
  assert.deepEqual([pressed(1, 9), pressed(2, 10), pressed(2, 11)], [false, false, false]);
  assert.equal(outlet.querySelectorAll('.av-cell.is-busy').length, 0);

  finish();
  await flush(10);
  assert.match(toasts(), /Impegni salvati\./);
  assert.equal(saveStatus(), 'Salvato adesso');
  assert.equal(saveButton().disabled, true);
  assert.ok(!saveButton().classList.contains('is-busy'));
  assert.equal(pressed(0, 8), true);
  await flush(1);
  tap(1, 9);
  assert.equal(pressed(1, 9), true, 'finito il salvataggio la griglia risponde di nuovo');
});

test('a change made while saving stays unsaved and the next save starts from the saved version', async () => {
  mine({ busy: {} });
  const saves = [];
  const finish = slowSave(saves);
  await visit(MINE_VIEW);
  tap(0, 8);
  saveButton().click();
  await flush(2);
  const end = av.addDays(next, 30);
  typeInto(untilInput(), end);
  assert.equal(saveStatus(), 'Salvataggio in corso');
  finish();
  await flush(10);
  assert.deepEqual(store.getItem(MINE).data, { busy: { lun: [8] } });
  assert.equal(saveStatus(), 'Modifiche non salvate');
  assert.equal(saveButton().disabled, false);
  assert.equal(untilInput().value, end);
  assert.equal(pressed(0, 8), true);

  saveButton().click();
  await flush(2);
  finish();
  await flush(10);
  assert.deepEqual(saves.map((s) => s.baseVersion), [1, 2]);
  assert.deepEqual(saves[1].snapshot.data, { busy: { lun: [8] }, until: end });
  assert.equal(saveStatus(), 'Salvato adesso');
  assert.equal(saveButton().disabled, true);
});

test('a save that returns after leaving the page does not redraw it nor touch the leave guard', async () => {
  mine({ busy: {} });
  const saves = [];
  const finish = slowSave(saves);
  await visit(MINE_VIEW);
  tap(0, 8);
  saveButton().click();
  await flush(2);
  await leaveTo(TEAM);
  assert.ok(outlet.querySelector('.av-team'));

  // La pagina nuova ha il suo avviso: il salvataggio vecchio non deve toglierlo né sostituirlo.
  let asked = 0;
  router.setLeaveGuard(() => {
    asked += 1;
    return true;
  });
  finish();
  await flush(10);
  assert.equal(store.getItem(MINE).version, 2);
  assert.ok(outlet.querySelector('.av-team'));
  assert.equal(outlet.querySelector('.av-edit'), null);
  assert.doesNotMatch(toasts(), /Impegni salvati/);
  await visit('#/idee');
  assert.equal(asked, 1);
  assert.equal(document.querySelector('dialog'), null);
});

test('an advisor marks and saves their own busy hours', async () => {
  store.state.user = { id: ADVISOR };
  store.setMembers(members());
  const creates = [];
  fakeCreate(creates);
  await visit(MINE_VIEW);
  tap(4, 18);
  await save();
  assert.equal(creates[0].title, 'Impegni');
  assert.deepEqual(creates[0].data, { busy: { ven: [18] } });
});

test('unsaved changes set the leave guard, also when switching to the team view', async () => {
  mine({ busy: {} });
  await visit(MINE_VIEW);
  tap(1, 9);
  let attempt = router.render('#/idee');
  await flush();
  assert.match(text(document.querySelector('dialog')), /Hai impegni non salvati\. Uscire comunque\?/);
  byText(document.querySelector('dialog'), 'button', 'Annulla').click();
  await attempt;
  assert.equal(router.currentPath(), '/squadra/disponibilita');
  assert.equal(pressed(1, 9), true);

  attempt = router.render(TEAM);
  await flush();
  byText(document.querySelector('dialog'), 'button', 'Esci').click();
  await attempt;
  await flush();
  assert.ok(outlet.querySelector('.av-team'));

  await visit(MINE_VIEW);
  tap(1, 9);
  tap(1, 9);
  await visit('#/idee');
  assert.equal(document.querySelector('dialog'), null);
  assert.equal(router.currentPath(), '/idee');
});

test('closing or reloading the site with unsaved changes asks the browser to confirm', async () => {
  mine({ busy: {} });
  await visit(MINE_VIEW);
  assert.equal(unload(), false);
  tap(0, 8);
  assert.equal(unload(), true);
  tap(0, 8);
  assert.equal(unload(), false);
  tap(0, 8);
  await leaveTo(TEAM);
  assert.equal(unload(), false, 'lasciata la pagina il controllo non resta attivo');
});

test('an hourly timer redraws the page and is cleared when leaving it', async () => {
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const ticks = [];
  const cleared = [];
  // Solo il timer dell'ora è finto: quelli brevi, come quelli di flush, restano veri.
  globalThis.setTimeout = (fn, ms, ...rest) => {
    if (!(ms > 5000)) return realSet(fn, ms, ...rest);
    const handle = { tick: ticks.length };
    ticks.push({ fn, handle });
    return handle;
  };
  globalThis.clearTimeout = (handle) => {
    cleared.push(handle);
    return realClear(handle);
  };
  try {
    await visit(TEAM);
    assert.equal(ticks.length, 1);
    const table = outlet.querySelector('.av-team');
    ticks[0].fn();
    assert.notEqual(outlet.querySelector('.av-team'), table, 'la griglia si ridisegna');
    assert.equal(ticks.length, 2, 'e si aspetta l\'ora successiva');

    await visit(MINE_VIEW);
    assert.ok(cleared.includes(ticks[1].handle), 'uscendo il timer si ferma');
    tap(0, 8);
    let grid = outlet.querySelector('.av-edit');
    ticks.at(-1).fn();
    assert.equal(outlet.querySelector('.av-edit'), grid, 'con modifiche non salvate non si ridisegna');
    assert.equal(pressed(0, 8), true);
    tap(0, 8);
    grid = outlet.querySelector('.av-edit');
    ticks.at(-1).fn();
    assert.notEqual(outlet.querySelector('.av-edit'), grid);
    const last = ticks.at(-1).handle;
    await visit('#/idee');
    assert.ok(cleared.includes(last));
  } finally {
    globalThis.setTimeout = realSet;
    globalThis.clearTimeout = realClear;
  }
});

test('a realtime update of my item refreshes the view only when nothing is unsaved', async () => {
  mine({ busy: { lun: [9] } });
  await visit(MINE_VIEW);
  mine({ busy: { lun: [9, 10] } }, { version: 2 });
  assert.equal(pressed(0, 10), true);
  assert.equal(saveButton().disabled, true);

  const table = outlet.querySelector('.av-edit');
  bruno({ busy: { lun: [8] } });
  assert.equal(outlet.querySelector('.av-edit'), table, 'gli impegni degli altri non toccano i miei');

  tap(3, 12);
  mine({ busy: {} }, { version: 3 });
  assert.equal(outlet.querySelector('.av-edit'), table);
  assert.equal(pressed(3, 12), true);
  assert.equal(pressed(0, 9), true);
  assert.equal(saveStatus(), 'Modifiche non salvate');
});

test('a save that conflicts with another device merges the changes', async () => {
  mine({ busy: { lun: [9] } });
  const end = av.addDays(next, 30);
  const theirs = item({ ...store.getItem(MINE), version: 2, data: { busy: { lun: [9] }, until: end } });
  const saves = [];
  api.saveItem = async (args) => {
    saves.push(args);
    if (args.baseVersion === 1) return { status: 'conflict', item: theirs };
    return { status: 'ok', item: item({ ...theirs, version: 3, data: args.snapshot.data }) };
  };
  await visit(MINE_VIEW);
  tap(1, 10);
  await save();
  assert.equal(saves.length, 2);
  assert.equal(saves[1].baseVersion, 2);
  assert.deepEqual(saves[1].snapshot.data, { busy: { lun: [9], mar: [10] }, until: end });
  assert.match(toasts(), /unite a quelle salvate da un altro dispositivo/);
  assert.equal(store.getItem(MINE).version, 3);
});

test('a conflict on the same day can be cancelled and keeps my changes unsaved', async () => {
  mine({ busy: { lun: [9] } });
  const theirs = item({ ...store.getItem(MINE), version: 2, data: { busy: { lun: [8] } } });
  const saves = [];
  api.saveItem = async (args) => {
    saves.push(args);
    return { status: 'conflict', item: theirs };
  };
  await visit(MINE_VIEW);
  tap(0, 10);
  saveButton().click();
  await flush(10);
  const dialog = document.querySelector('dialog');
  assert.match(text(dialog), /Modifiche in conflitto/);
  byText(dialog, 'button', 'Annulla').click();
  await flush(10);
  assert.equal(saves.length, 1);
  assert.doesNotMatch(toasts(), /Impegni salvati/);
  assert.equal(saveStatus(), 'Modifiche non salvate');
  assert.equal(saveButton().disabled, false);
  assert.equal(pressed(0, 10), true);
});

test('saving after a realtime update of my item keeps what was changed on the other device', async () => {
  mine({ busy: { lun: [9] } });
  const saves = [];
  serverSave(saves);
  await visit(MINE_VIEW);
  tap(3, 12);
  const end = av.addDays(next, 30);
  mine({ busy: { lun: [9] }, until: end }, { version: 2 });
  assert.equal(untilInput().value, '', 'la copia di lavoro resta quella con le mie modifiche');
  await save();
  assert.deepEqual(saves.map((s) => s.baseVersion), [1, 2]);
  assert.deepEqual(store.getItem(MINE).data, { busy: { lun: [9], gio: [12] }, until: end });
  assert.match(toasts(), /unite a quelle salvate da un altro dispositivo/);
  assert.equal(untilInput().value, end);
  assert.equal(pressed(3, 12), true);
  assert.equal(saveButton().disabled, true);
});

test('a first save made after my item appeared from another device merges with it', async () => {
  const saves = [];
  serverSave(saves);
  api.createItem = async () => {
    throw new Error('non deve creare un secondo elemento');
  };
  await visit(MINE_VIEW);
  tap(1, 10);
  const end = av.addDays(next, 30);
  mine({ busy: { lun: [9] }, until: end });
  assert.equal(pressed(0, 9), false, 'le modifiche non salvate restano');
  await save();
  // Versione 0: il server risponde sempre «conflitto», così si unisce con quello che c'è.
  assert.deepEqual(saves.map((s) => [s.id, s.baseVersion]), [[MINE, 0], [MINE, 1]]);
  assert.deepEqual(store.getItem(MINE).data, { busy: { lun: [9], mar: [10] }, until: end });
  assert.match(toasts(), /unite a quelle salvate da un altro dispositivo/);
  assert.equal(pressed(0, 9), true);
  assert.equal(pressed(1, 10), true);
  assert.equal(saveStatus(), 'Salvato adesso');
});

test('save errors are shown with the generic message and the changes stay', async () => {
  mine({ busy: {} });
  await visit(MINE_VIEW);
  tap(0, 8);
  fake.responses.rpc.save_item = { data: null, error: { code: 'XX000', message: 'availability_busy_ok: internal detail' } };
  await save();
  const box = outlet.querySelector('.error-box');
  assert.equal(text(box), 'Salvataggio non riuscito.');
  assert.equal(box.getAttribute('role'), 'alert');
  assert.doesNotMatch(text(outlet), /availability_busy_ok|internal detail/);
  assert.equal(pressed(0, 8), true);
  assert.equal(saveStatus(), 'Modifiche non salvate');
  assert.equal(saveButton().disabled, false);
  const [, , params] = fake.calls.find(([type, name]) => type === 'rpc' && name === 'save_item');
  assert.equal(params.p_id, MINE);
  assert.equal(params.p_base_version, 1);
  assert.deepEqual(params.p_data, { busy: { lun: [8] } });

  fake.responses.rpc.save_item = { data: { status: 'error', item: null }, error: null };
  await save();
  assert.equal(outlet.querySelectorAll('.error-box').length, 1);
  assert.equal(text(outlet.querySelector('.error-box')), 'Operazione non riuscita. Riprova.');

  fake.responses.rpc.save_item = { data: { status: 'forbidden', item: null }, error: null };
  await save();
  assert.equal(text(outlet.querySelector('.error-box')), 'Non hai i permessi per questa operazione.');
  assert.doesNotMatch(toasts(), /Impegni salvati/);
});

test('a refused first save shows the generic message without database details', async () => {
  await visit(MINE_VIEW);
  tap(0, 8);
  fake.responses.rpc.create_item = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "items_one_availability_per_member_idx"' } };
  await save();
  assert.equal(text(outlet.querySelector('.error-box')), 'Esiste già un elemento di questo tipo.');
  assert.doesNotMatch(text(outlet), /items_one_availability_per_member_idx|duplicate key/);
  assert.equal(store.availabilityOf(ME), null);
  assert.equal(saveStatus(), 'Modifiche non salvate');
  const [, , params] = fake.calls.find(([type, name]) => type === 'rpc' && name === 'create_item');
  assert.equal(params.p_kind, 'availability');
  assert.equal(params.p_title, 'Impegni');
  assert.deepEqual(params.p_data, { busy: { lun: [8] } });
});

test('past weeks dropped from my copy do not count as a change to merge with another device', async () => {
  const lastWeek = av.addDays(monday, -7);
  mine({ busy: { lun: [9] }, weeks: [{ key: lastWeek, busy: { mar: [10] } }] });
  const saves = [];
  serverSave(saves);
  await visit(MINE_VIEW);
  // Intanto un altro dispositivo aggiunge la settimana prossima.
  mine({ busy: { lun: [9] }, weeks: [{ key: lastWeek, busy: { mar: [10] } }, { key: next, busy: { gio: [15] } }] }, { version: 2 });
  tap(4, 12);
  await save();
  assert.equal(document.querySelector('dialog'), null, 'nessun conflitto da scegliere');
  assert.deepEqual(store.getItem(MINE).data, { busy: { lun: [9], ven: [12] }, weeks: [{ key: next, busy: { gio: [15] } }] });
});
