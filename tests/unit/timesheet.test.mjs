import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_KEYS, addDays, thisMonday, weekLabel } from '../../assets/js/availability.js';
import {
  AREAS,
  AREA_KEYS,
  DAY_MINUTES,
  HISTORY_WEEKS,
  MAX_ENTRIES,
  MAX_PLEDGE,
  NOTE_MAX,
  STEP,
  areaLabel,
  areaShort,
  areaTotals,
  clockText,
  dayTotals,
  durationText,
  mergeTimesheet,
  minutesOf,
  overlap,
  parseClock,
  pledgeFor,
  sanitizeEntry,
  sanitizeTimesheet,
  timesheetProblem,
  weekSeries,
} from '../../assets/js/timesheet.js';
import {
  BOARD_KINDS,
  EXPENSE_KINDS,
  IDEA_CHILD_KINDS,
  KINDS,
  describePath,
  formatValue,
  routeFor,
  sanitizeSnapshot,
  snapshotProblem,
} from '../../assets/js/schema.js';
import { diffSnapshots, merge3 } from '../../assets/js/lib/diff.js';
import { api } from '../../assets/js/lib/api.js';
import * as store from '../../assets/js/store.js';
import { notifications, refreshNotifications, startNotifications, stopNotifications, timesheetReminder } from '../../assets/js/notifications.js';
import { ADVISOR, ME, OTHER, item, members, revision } from '../setup/fixtures.mjs';

const IDEA = '11111111-1111-4111-8111-111111111111';
const SHEET = (n) => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Date relative al giorno in cui girano i test, mai fisse rispetto a oggi.
const CURRENT = thisMonday();
const LAST = addDays(CURRENT, -7);
const BEFORE = addDays(LAST, -7);

const at = (key, hour, minute = 0) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute);
};

const row = (id, day, start, end, extra = {}) => ({ id, day, start, end, area: 'prodotto', ...extra });
const weeksOf = (...list) => new Map(list.map((raw) => [raw.week, sanitizeTimesheet(raw)]));

function signIn(userId) {
  store.resetStore();
  store.state.user = userId ? { id: userId } : null;
  store.setMembers(members());
}

beforeEach(() => signIn(ME));

test('timesheet constants match the agreed limits', () => {
  assert.deepEqual(AREA_KEYS, ['prodotto', 'clienti', 'numeri', 'ricerca', 'altro']);
  assert.deepEqual(
    AREAS.map(([, label]) => label),
    ['Prodotto e tecnologia', 'Clienti e vendite', 'Numeri e amministrazione', 'Ricerca e interviste', 'Altro'],
  );
  assert.deepEqual(
    AREAS.map(([, , short]) => short),
    ['Prodotto', 'Clienti', 'Numeri', 'Ricerca', 'Altro'],
  );
  assert.equal(STEP, 15);
  assert.equal(DAY_MINUTES, 1440);
  assert.equal(MAX_ENTRIES, 100);
  assert.equal(NOTE_MAX, 140);
  assert.equal(MAX_PLEDGE, 4800);
  assert.equal(HISTORY_WEEKS, 12);
});

test('areaLabel names every area and falls back to «Altro»', () => {
  assert.equal(areaLabel('prodotto'), 'Prodotto e tecnologia');
  assert.equal(areaLabel('clienti'), 'Clienti e vendite');
  assert.equal(areaLabel('numeri'), 'Numeri e amministrazione');
  assert.equal(areaLabel('ricerca'), 'Ricerca e interviste');
  assert.equal(areaLabel('altro'), 'Altro');
  for (const value of ['marketing', 'Prodotto', '', null, undefined, 42, ['clienti']]) assert.equal(areaLabel(value), 'Altro', String(value));
});

test('areaShort gives the short name of every area for the row menu and falls back to «Altro»', () => {
  assert.equal(areaShort('prodotto'), 'Prodotto');
  assert.equal(areaShort('clienti'), 'Clienti');
  assert.equal(areaShort('numeri'), 'Numeri');
  assert.equal(areaShort('ricerca'), 'Ricerca');
  assert.equal(areaShort('altro'), 'Altro');
  const bad = ['marketing', 'Prodotto', 'Prodotto e tecnologia', 'prodotto ', 'PRODOTTO', '', null, undefined, 42, true, ['clienti'], {}, '__proto__', 'toString'];
  for (const value of bad) assert.equal(areaShort(value), 'Altro', String(value));
});

test('every short area name is distinct and is the first word of its long name', () => {
  const shorts = AREA_KEYS.map(areaShort);
  assert.equal(new Set(shorts).size, AREA_KEYS.length);
  for (const key of AREA_KEYS) {
    assert.ok(areaLabel(key).startsWith(areaShort(key)), key);
    assert.ok(areaShort(key).length <= areaLabel(key).length, key);
  }
  assert.deepEqual(
    AREA_KEYS.filter((key) => areaShort(key) !== areaLabel(key)),
    ['prodotto', 'clienti', 'numeri', 'ricerca'],
    'solo «Altro» resta uguale',
  );
});

test('sanitizeEntry keeps a valid row with only the known fields', () => {
  const clean = sanitizeEntry({ ...row('a1', 'lun', 900, 1050, { area: 'clienti', note: '3 interviste' }), created_by: ME, minutes: 150, title: 'x' });
  assert.deepEqual(clean, { id: 'a1', day: 'lun', start: 900, end: 1050, area: 'clienti', note: '3 interviste' });
  assert.deepEqual(Object.keys(clean), ['id', 'day', 'start', 'end', 'area', 'note']);
  assert.deepEqual(sanitizeEntry(clean), clean, 'pulire due volte non cambia nulla');
  assert.deepEqual(Object.keys(sanitizeEntry(row('a1', 'lun', 900, 1050))), ['id', 'day', 'start', 'end', 'area']);
});

test('sanitizeEntry accepts a start from 0 to 23:45 in steps of 15 minutes only', () => {
  assert.equal(sanitizeEntry(row('a', 'lun', 0, 15)).start, 0);
  assert.equal(sanitizeEntry(row('a', 'lun', 15, 30)).start, 15);
  assert.equal(sanitizeEntry(row('a', 'lun', 1425, 1440)).start, 1425);
  assert.equal(sanitizeEntry(row('a', 'lun', 900.0, 960)).start, 900);
  const bad = [1440, 1441, 1455, -15, -1, 7, 14, 16, 899, '900', '0', 900.5, NaN, Infinity, -Infinity, null, undefined, true, [900], {}];
  for (const start of bad) assert.equal(sanitizeEntry(row('a', 'lun', start, 1440)), null, String(start));
});

test('sanitizeEntry accepts an end from 00:15 to midnight in steps of 15 minutes only', () => {
  assert.equal(sanitizeEntry(row('a', 'lun', 0, 15)).end, 15);
  assert.equal(sanitizeEntry(row('a', 'lun', 0, 1440)).end, 1440);
  assert.equal(sanitizeEntry(row('a', 'lun', 1380, 1440)).end, 1440);
  const bad = [0, 1441, 1455, 1500, -15, 7, 22, 1439, '1440', 1050.5, NaN, Infinity, null, undefined, false, [1440], {}];
  for (const end of bad) assert.equal(sanitizeEntry(row('a', 'lun', 0, end)), null, String(end));
});

test('sanitizeEntry rejects a row that ends at or before its start', () => {
  assert.equal(sanitizeEntry(row('a', 'lun', 900, 900)), null);
  assert.equal(sanitizeEntry(row('a', 'lun', 900, 885)), null);
  assert.equal(sanitizeEntry(row('a', 'lun', 1425, 15)), null, 'una riga non passa la mezzanotte');
  assert.equal(sanitizeEntry(row('a', 'lun', 0, 0)), null);
  assert.deepEqual([sanitizeEntry(row('a', 'lun', 900, 915)).start, sanitizeEntry(row('a', 'lun', 900, 915)).end], [900, 915]);
  assert.deepEqual([sanitizeEntry(row('a', 'dom', 0, 1440)).start, sanitizeEntry(row('a', 'dom', 0, 1440)).end], [0, 1440], 'un giorno intero');
});

test('sanitizeEntry accepts ids of 1 to 16 lowercase letters and digits', () => {
  for (const id of ['a', '0', 'a1b2c3', 'abcdefghijklmnop', '1234567890123456']) assert.equal(sanitizeEntry(row(id, 'lun', 0, 15))?.id, id, id);
  const bad = ['', 'abcdefghijklmnopq', 'A1', 'a-1', 'a_1', 'a 1', ' a1', 'a1 ', 'a1\n', 'à1', '__proto__', 42, null, undefined, ['a1'], {}];
  for (const id of bad) assert.equal(sanitizeEntry(row(id, 'lun', 0, 15)), null, JSON.stringify(id));
});

test('sanitizeEntry accepts only the seven Italian day keys', () => {
  for (const day of DAY_KEYS) assert.equal(sanitizeEntry(row('a', day, 0, 15))?.day, day, day);
  for (const day of ['Lun', 'LUN', 'monday', 'lunedì', 'lun ', '', 0, 1, null, undefined, ['lun']]) {
    assert.equal(sanitizeEntry(row('a', day, 0, 15)), null, String(day));
  }
});

test('sanitizeEntry keeps known areas and turns anything else into «altro»', () => {
  for (const area of AREA_KEYS) assert.equal(sanitizeEntry(row('a', 'lun', 0, 15, { area })).area, area, area);
  for (const area of ['marketing', 'Prodotto', 'prodotto ', '', null, undefined, 42, ['clienti'], {}]) {
    assert.equal(sanitizeEntry(row('a', 'lun', 0, 15, { area })).area, 'altro', String(area));
  }
  const noArea = row('a', 'lun', 0, 15);
  delete noArea.area;
  assert.equal(sanitizeEntry(noArea).area, 'altro');
});

test('sanitizeEntry trims the note to one line of at most 140 characters', () => {
  const note = (value) => sanitizeEntry(row('a', 'lun', 0, 15, { note: value }));
  assert.equal(note('  3 interviste  ').note, '3 interviste');
  assert.equal(note('riga 1\n  riga 2\r\nriga 3').note, 'riga 1 riga 2 riga 3');
  assert.equal(note('a\u0007b\u0000c').note, 'abc');
  assert.equal(note('x'.repeat(139)).note.length, 139);
  assert.equal(note('x'.repeat(140)).note, 'x'.repeat(140));
  assert.equal(note('x'.repeat(141)).note, 'x'.repeat(140));
  assert.equal(note('y'.repeat(100000)).note.length, NOTE_MAX);
  assert.equal(note(`${'x'.repeat(139)} tail`).note, 'x'.repeat(139), 'il taglio non lascia spazi in fondo');
  assert.equal(note(`   ${'z'.repeat(140)}`).note, 'z'.repeat(140), 'gli spazi iniziali non contano');
  for (const value of ['', '   ', '\n\n', 42, null, undefined, ['x'], { text: 'x' }, true]) {
    assert.equal('note' in note(value), false, JSON.stringify(value));
  }
});

test('sanitizeEntry turns garbage into null', () => {
  for (const value of [null, undefined, '', 'a1', 42, true, [], [row('a', 'lun', 0, 15)], () => row('a', 'lun', 0, 15)]) {
    assert.equal(sanitizeEntry(value), null, String(value));
  }
  assert.equal(sanitizeEntry({}), null);
  assert.equal(sanitizeEntry({ id: 'a', day: 'lun', start: 0 }), null);
  assert.equal(sanitizeEntry({ id: 'a', day: 'lun', end: 15 }), null);
});

test('sanitizeTimesheet returns only week, pledge and entries', () => {
  const clean = sanitizeTimesheet({
    week: LAST,
    pledge: 480,
    entries: [row('a1', 'lun', 900, 1050, { owner: ME })],
    owner: ME,
    title: 'Ore lavorate',
    total: 150,
  });
  assert.deepEqual(clean, { week: LAST, pledge: 480, entries: [row('a1', 'lun', 900, 1050)] });
  assert.deepEqual(Object.keys(clean), ['week', 'pledge', 'entries']);
  assert.deepEqual(sanitizeTimesheet(clean), clean, 'pulire due volte non cambia nulla');
  assert.deepEqual(JSON.parse(JSON.stringify(clean)), clean);
});

test('sanitizeTimesheet keeps the week only when it is a real Monday', () => {
  for (const week of [LAST, CURRENT, '2026-11-02', '2026-12-28', '2028-02-28']) assert.equal(sanitizeTimesheet({ week }).week, week, week);
  const bad = [addDays(LAST, 1), addDays(LAST, 6), '2026-02-30', '2026-13-02', '2026-11-2', '2026-11-02T00:00:00Z', ' 2026-11-02', '', null, 20261102, new Date(2026, 10, 2), ['2026-11-02']];
  for (const week of bad) {
    const clean = sanitizeTimesheet({ week, entries: [] });
    assert.equal('week' in clean, false, String(week));
    assert.deepEqual(clean.entries, []);
  }
});

test('sanitizeTimesheet keeps a pledge from 0 to 80 hours in steps of 15 minutes', () => {
  for (const pledge of [0, 15, 450, 480, 4785, 4800]) assert.equal(sanitizeTimesheet({ pledge }).pledge, pledge, String(pledge));
  assert.equal('pledge' in sanitizeTimesheet({ pledge: 0 }), true, 'zero ore è una risposta, non un campo vuoto');
  for (const pledge of [4815, 4801, 1e6, -15, -1, 7, 480.5, '480', '0', NaN, Infinity, null, undefined, true, [480], {}]) {
    assert.equal('pledge' in sanitizeTimesheet({ pledge }), false, String(pledge));
  }
});

test('sanitizeTimesheet drops invalid rows, keeps the first of each id and sorts by day and time', () => {
  const clean = sanitizeTimesheet({
    week: LAST,
    entries: [
      row('c', 'dom', 600, 660),
      row('b', 'lun', 900, 960),
      row('a', 'lun', 540, 600),
      row('b', 'mar', 540, 600),
      row('d', 'mar', 1425, 1440),
      row('E', 'lun', 0, 15),
      row('f', 'lun', 7, 15),
      row('g', 'mer', 600, 600),
      null,
      'x',
      42,
      [row('h', 'lun', 0, 15)],
    ],
  });
  assert.deepEqual(
    clean.entries.map((e) => [e.id, e.day, e.start]),
    [
      ['a', 'lun', 540],
      ['b', 'lun', 900],
      ['d', 'mar', 1425],
      ['c', 'dom', 600],
    ],
  );
  const tie = sanitizeTimesheet({ entries: [row('z', 'lun', 540, 600), row('m', 'lun', 540, 570)] });
  assert.deepEqual(tie.entries.map((e) => e.id), ['m', 'z'], 'a parità di inizio decide l\'id');
});

test('sanitizeTimesheet lets a valid row win over an invalid one with the same id', () => {
  const clean = sanitizeTimesheet({ entries: [row('a', 'lun', 7, 15), row('a', 'mar', 540, 600)] });
  assert.deepEqual(clean.entries, [row('a', 'mar', 540, 600)]);
  const first = sanitizeTimesheet({ entries: [row('a', 'mar', 540, 600), row('a', 'lun', 0, 15)] });
  assert.deepEqual(first.entries, [row('a', 'mar', 540, 600)], 'vince la prima nell\'ordine ricevuto');
});

test('sanitizeTimesheet keeps overlapping rows so that the problem can be shown', () => {
  const clean = sanitizeTimesheet({ week: LAST, entries: [row('a', 'lun', 540, 1020), row('b', 'lun', 600, 660)] });
  assert.equal(clean.entries.length, 2);
  assert.notEqual(timesheetProblem(clean), null);
});

const slots = (n) =>
  Array.from({ length: n }, (_, i) => row(`e${i}`, DAY_KEYS[Math.floor(i / 96) % 7], (i % 96) * STEP, (i % 96) * STEP + STEP));

test('sanitizeTimesheet keeps at most 100 rows, the earliest ones', () => {
  assert.equal(sanitizeTimesheet({ entries: slots(99) }).entries.length, 99);
  assert.equal(sanitizeTimesheet({ entries: slots(100) }).entries.length, MAX_ENTRIES);
  const clean = sanitizeTimesheet({ entries: slots(101).reverse() });
  assert.equal(clean.entries.length, MAX_ENTRIES);
  assert.deepEqual(
    clean.entries.map((e) => e.id),
    Array.from({ length: 100 }, (_, i) => `e${i}`),
  );
  assert.equal(clean.entries.some((e) => e.id === 'e100'), false, 'resta fuori la riga più tarda');
  const extreme = sanitizeTimesheet({ entries: slots(1000) });
  assert.equal(extreme.entries.length, MAX_ENTRIES);
  assert.ok(extreme.entries.every((e) => e.day === 'lun'));
  assert.equal(sanitizeTimesheet({ entries: Array(100000).fill(row('a1', 'lun', 0, 15)) }).entries.length, 1);
});

test('sanitizeTimesheet turns garbage into an empty week without a Monday', () => {
  for (const value of [null, undefined, [], [{ week: LAST }], 'week', 42, true]) {
    assert.deepEqual(sanitizeTimesheet(value), { entries: [] }, String(value));
  }
  assert.deepEqual(sanitizeTimesheet({}), { entries: [] });
  assert.deepEqual(sanitizeTimesheet({ week: null, pledge: null, entries: null }), { entries: [] });
  for (const entries of ['x', 42, { 0: row('a', 'lun', 0, 15), length: 1 }, new Set([row('a', 'lun', 0, 15)])]) {
    assert.deepEqual(sanitizeTimesheet({ entries }).entries, [], String(entries));
  }
  assert.deepEqual(sanitizeTimesheet(JSON.parse(`{"__proto__":{"week":"${LAST}","pledge":480},"entries":[]}`)), { entries: [] });
});

test('minutesOf sums the length of every row', () => {
  assert.equal(minutesOf([]), 0);
  assert.equal(minutesOf([row('a', 'lun', 900, 1050)]), 150);
  assert.equal(minutesOf([row('a', 'lun', 540, 600), row('b', 'mar', 600, 615), row('c', 'dom', 1380, 1440)]), 135);
  assert.equal(minutesOf(DAY_KEYS.map((day, i) => row(`d${i}`, day, 0, 1440))), 7 * 1440);
});

test('dayTotals has the seven days in order with zero for empty days', () => {
  assert.deepEqual(dayTotals([]), { lun: 0, mar: 0, mer: 0, gio: 0, ven: 0, sab: 0, dom: 0 });
  const totals = dayTotals([row('a', 'mer', 540, 600), row('b', 'mer', 900, 1050), row('c', 'dom', 0, 1440), row('d', 'lun', 600, 615)]);
  assert.deepEqual(totals, { lun: 15, mar: 0, mer: 210, gio: 0, ven: 0, sab: 0, dom: 1440 });
  assert.deepEqual(Object.keys(totals), DAY_KEYS);
});

test('areaTotals lists only areas with time, the largest first', () => {
  assert.deepEqual(areaTotals([]), []);
  assert.deepEqual(
    areaTotals([
      row('a', 'lun', 540, 600, { area: 'ricerca' }),
      row('b', 'lun', 600, 780, { area: 'clienti' }),
      row('c', 'mar', 540, 570, { area: 'ricerca' }),
      row('d', 'mar', 600, 615, { area: 'altro' }),
    ]),
    [
      { area: 'clienti', label: 'Clienti e vendite', minutes: 180 },
      { area: 'ricerca', label: 'Ricerca e interviste', minutes: 90 },
      { area: 'altro', label: 'Altro', minutes: 15 },
    ],
  );
  const ties = areaTotals([row('a', 'lun', 0, 60, { area: 'altro' }), row('b', 'lun', 60, 120, { area: 'numeri' }), row('c', 'lun', 120, 180, { area: 'prodotto' })]);
  assert.deepEqual(ties.map((t) => t.area), ['prodotto', 'numeri', 'altro'], 'a parità di minuti resta l\'ordine delle aree');
});

test('overlap finds two rows of the same day that share some minutes', () => {
  assert.equal(overlap([]), null);
  assert.equal(overlap([row('a', 'lun', 540, 600)]), null);
  assert.equal(overlap([row('a', 'lun', 540, 600), row('b', 'lun', 600, 660)]), null, 'righe che si toccano non si accavallano');
  assert.equal(overlap([row('a', 'lun', 540, 600), row('b', 'mar', 540, 600)]), null, 'giorni diversi');
  assert.equal(overlap([row('a', 'dom', 1425, 1440), row('b', 'lun', 0, 15)]), null);

  const late = row('b', 'lun', 585, 660);
  const early = row('a', 'lun', 540, 600);
  assert.deepEqual(overlap([late, early]), [early, late], 'in ordine di orario');
  const outer = row('a', 'mer', 540, 1020);
  const inner = row('b', 'mer', 600, 660);
  assert.deepEqual(overlap([inner, outer]), [outer, inner], 'una riga dentro l\'altra');
  assert.deepEqual(overlap([row('z', 'gio', 540, 600), row('m', 'gio', 540, 555)]).map((e) => e.id), ['m', 'z'], 'stesso inizio');
  assert.deepEqual(overlap([row('a', 'dom', 1380, 1440), row('b', 'dom', 1425, 1440)]).map((e) => e.id), ['a', 'b'], 'fino a mezzanotte');
  assert.deepEqual(
    overlap([row('a', 'ven', 540, 1020), row('b', 'ven', 600, 660), row('c', 'ven', 700, 760)]).map((e) => e.id),
    ['a', 'b'],
  );
  assert.deepEqual(overlap([row('a', 'lun', 540, 600), row('b', 'lun', 600, 660), row('c', 'mar', 0, 60), row('d', 'mar', 45, 90)]).map((e) => e.id), ['c', 'd']);

  const input = [late, early];
  overlap(input);
  assert.deepEqual(input, [late, early], 'l\'elenco ricevuto non cambia ordine');
});

test('timesheetProblem asks for the week first, then reports overlapping rows', () => {
  assert.equal(timesheetProblem({ entries: [] }), 'Manca la settimana.');
  assert.equal(timesheetProblem({ entries: [row('a', 'lun', 540, 1020), row('b', 'lun', 600, 660)] }), 'Manca la settimana.');
  assert.equal(timesheetProblem({ week: LAST, entries: [] }), null);
  assert.equal(timesheetProblem({ week: LAST }), null);
  assert.equal(timesheetProblem({ week: LAST, entries: [row('a', 'lun', 540, 600), row('b', 'lun', 600, 660)] }), null);
  assert.equal(
    timesheetProblem({ week: LAST, entries: [row('a', 'lun', 900, 1020), row('b', 'lun', 960, 1080)] }),
    'Lunedì due righe si accavallano: 15:00-17:00 e 16:00-18:00.',
  );
  assert.equal(
    timesheetProblem({ week: LAST, entries: [row('b', 'lun', 600, 660), row('a', 'lun', 540, 1020)] }),
    'Lunedì due righe si accavallano: 09:00-17:00 e 10:00-11:00.',
  );
  assert.equal(
    timesheetProblem({ week: LAST, entries: [row('a', 'dom', 1380, 1440), row('b', 'dom', 1395, 1410)] }),
    'Domenica due righe si accavallano: 23:00-00:00 e 23:15-23:30.',
  );
  assert.equal(
    timesheetProblem({ week: LAST, entries: [row('a', 'mar', 540, 600), row('b', 'gio', 540, 660), row('c', 'gio', 600, 720), row('d', 'ven', 0, 60), row('e', 'ven', 30, 90)] }),
    'Giovedì due righe si accavallano: 09:00-11:00 e 10:00-12:00.',
    'il primo giorno della settimana con un accavallamento',
  );
});

test('timesheetProblem starts every day name with a capital letter', () => {
  const names = { lun: 'Lunedì', mar: 'Martedì', mer: 'Mercoledì', gio: 'Giovedì', ven: 'Venerdì', sab: 'Sabato', dom: 'Domenica' };
  for (const day of DAY_KEYS) {
    const text = timesheetProblem({ week: LAST, entries: [row('a', day, 540, 600), row('b', day, 570, 630)] });
    assert.equal(text, `${names[day]} due righe si accavallano: 09:00-10:00 e 09:30-10:30.`, day);
    assert.doesNotMatch(text, /^Di /);
  }
});

test('timesheetProblem reports more than 100 rows after the week and before any overlap', () => {
  assert.equal(timesheetProblem({ week: LAST, entries: slots(100) }), null);
  assert.equal(timesheetProblem({ week: LAST, entries: slots(101) }), 'In una settimana ci stanno al massimo 100 righe.');
  assert.equal(timesheetProblem({ entries: slots(101) }), 'Manca la settimana.');
  assert.equal(timesheetProblem({ week: LAST, entries: [...slots(100), row('x', 'lun', 0, 60)] }), 'In una settimana ci stanno al massimo 100 righe.');
  assert.equal(
    timesheetProblem({ week: LAST, entries: [...slots(99), row('x', 'lun', 0, 60)] }),
    'Lunedì due righe si accavallano: 00:00-00:15 e 00:00-01:00.',
  );
});

// Unione a tre vie: base è la versione da cui sono partito, mine la mia copia, theirs quella salvata da un altro dispositivo.
const week = (entries, extra = {}) => sanitizeTimesheet({ week: LAST, entries, ...extra });
const ids = (data) => data.entries.map((e) => e.id);

test('mergeTimesheet keeps rows added on either side', () => {
  const a = row('a', 'lun', 540, 600);
  const mine = row('m', 'mar', 540, 600);
  const theirs = row('t', 'mer', 540, 600);
  assert.deepEqual(mergeTimesheet(week([a]), week([a, mine]), week([a])).entries, [a, mine], 'aggiunta solo da me');
  assert.deepEqual(mergeTimesheet(week([a]), week([a]), week([a, theirs])).entries, [a, theirs], 'aggiunta solo dall\'altro dispositivo');
  assert.deepEqual(mergeTimesheet(week([a]), week([a, mine]), week([a, theirs])).entries, [a, mine, theirs], 'aggiunte da entrambe le parti');
  assert.deepEqual(mergeTimesheet(week([]), week([mine]), week([theirs])).entries, [mine, theirs], 'partendo da una settimana vuota');
  assert.deepEqual(mergeTimesheet(week([]), week([]), week([theirs])).entries, [theirs]);
  assert.deepEqual(mergeTimesheet(week([]), week([mine]), week([])).entries, [mine]);
  assert.deepEqual(mergeTimesheet(week([]), week([]), week([])).entries, []);
});

test('mergeTimesheet keeps a single copy of a row added on both sides', () => {
  const both = row('x', 'lun', 540, 600, { note: 'stessa riga' });
  assert.deepEqual(mergeTimesheet(week([]), week([both]), week([{ ...both }])).entries, [both]);
  const mine = row('x', 'lun', 540, 660, { area: 'clienti' });
  const theirs = row('x', 'lun', 540, 600, { area: 'ricerca' });
  assert.deepEqual(mergeTimesheet(week([]), week([mine]), week([theirs])).entries, [mine], 'stesso id e righe diverse: vince la mia');
});

test('mergeTimesheet drops a row removed on one side and left alone on the other', () => {
  const a = row('a', 'lun', 540, 600);
  const b = row('b', 'lun', 600, 660, { area: 'clienti', note: 'chiamata' });
  assert.deepEqual(mergeTimesheet(week([a, b]), week([a]), week([a, b])).entries, [a], 'tolta da me');
  assert.deepEqual(mergeTimesheet(week([a, b]), week([a, b]), week([b])).entries, [b], 'tolta dall\'altro dispositivo');
  assert.deepEqual(mergeTimesheet(week([a, b]), week([a]), week([a])).entries, [a], 'tolta da entrambi');
  assert.deepEqual(mergeTimesheet(week([a, b]), week([]), week([b])).entries, [], 'una tolta da me, l\'altra dall\'altro dispositivo');
  const c = row('c', 'mar', 540, 600);
  assert.deepEqual(mergeTimesheet(week([a, b]), week([a, c]), week([b])).entries, [c], 'tolte e aggiunte insieme');
});

test('mergeTimesheet takes a row changed on one side only', () => {
  const a = row('a', 'lun', 540, 600, { note: 'prima' });
  const cases = [
    ['inizio', { start: 480 }],
    ['fine', { end: 720 }],
    ['giorno', { day: 'gio' }],
    ['area', { area: 'numeri' }],
    ['nota', { note: 'dopo' }],
    ['tutto', { day: 'sab', start: 0, end: 1440, area: 'altro', note: 'tutto il giorno' }],
  ];
  for (const [what, change] of cases) {
    const changed = { ...a, ...change };
    assert.deepEqual(mergeTimesheet(week([a]), week([changed]), week([a])).entries, [changed], `${what} cambiato da me`);
    assert.deepEqual(mergeTimesheet(week([a]), week([a]), week([changed])).entries, [changed], `${what} cambiato dall'altro dispositivo`);
  }
  const noNote = row('a', 'lun', 540, 600);
  assert.deepEqual(mergeTimesheet(week([a]), week([a]), week([noNote])).entries, [noNote], 'nota cancellata dall\'altro dispositivo');
  assert.deepEqual(mergeTimesheet(week([a]), week([noNote]), week([a])).entries, [noNote], 'nota cancellata da me');
  assert.deepEqual(mergeTimesheet(week([noNote]), week([noNote]), week([a])).entries, [a], 'nota aggiunta dall\'altro dispositivo');
});

test('mergeTimesheet lets my row win when both sides changed it', () => {
  const a = row('a', 'lun', 540, 600);
  const mine = { ...a, end: 660 };
  const theirs = { ...a, end: 720 };
  assert.deepEqual(mergeTimesheet(week([a]), week([mine]), week([theirs])).entries, [mine]);
  assert.deepEqual(mergeTimesheet(week([a]), week([mine]), week([{ ...mine }])).entries, [mine], 'stessa modifica da entrambe le parti');
  // La riga è un tutt'uno: due campi diversi cambiati sui due dispositivi non si sommano.
  const myEnd = { ...a, end: 660 };
  const theirArea = { ...a, area: 'clienti' };
  assert.deepEqual(mergeTimesheet(week([a]), week([myEnd]), week([theirArea])).entries, [myEnd]);
});

test('mergeTimesheet handles a row removed on one side and changed on the other', () => {
  const a = row('a', 'lun', 540, 600);
  const b = row('b', 'mar', 540, 600);
  const changed = { ...a, end: 720, note: 'cambiata' };
  assert.deepEqual(mergeTimesheet(week([a, b]), week([b]), week([changed, b])).entries, [b], 'tolta da me e cambiata altrove: vince la mia scelta');
  assert.deepEqual(mergeTimesheet(week([a, b]), week([changed, b]), week([b])).entries, [changed, b], 'cambiata da me e tolta altrove: resta la mia');
});

test('mergeTimesheet merges a mix of changes on many rows at once', () => {
  const base = week([row('a', 'lun', 540, 600), row('b', 'lun', 600, 660), row('c', 'mar', 540, 600), row('d', 'mer', 540, 600), row('g', 'ven', 540, 600)]);
  const mine = week([row('a', 'lun', 540, 630), row('c', 'mar', 540, 600), row('d', 'mer', 540, 600), row('e', 'gio', 540, 600), row('g', 'ven', 540, 660)]);
  const theirs = week([row('a', 'lun', 540, 600), row('b', 'lun', 600, 660), row('c', 'mar', 540, 660, { area: 'clienti' }), row('f', 'sab', 540, 600), row('g', 'ven', 540, 720)]);
  assert.deepEqual(mergeTimesheet(base, mine, theirs), {
    week: LAST,
    entries: [row('a', 'lun', 540, 630), row('c', 'mar', 540, 660, { area: 'clienti' }), row('e', 'gio', 540, 600), row('g', 'ven', 540, 660), row('f', 'sab', 540, 600)],
  });
});

test('mergeTimesheet works without a base as a union where my rows win', () => {
  const mine = row('a', 'lun', 540, 660);
  const theirs = row('a', 'lun', 540, 600);
  const other = row('b', 'mar', 540, 600);
  for (const base of [null, undefined, {}, { week: LAST }]) {
    const merged = mergeTimesheet(base, week([mine]), week([theirs, other], { pledge: 300 }));
    assert.deepEqual(merged, { week: LAST, entries: [mine, other], pledge: 300 }, JSON.stringify(base));
  }
});

test('mergeTimesheet takes the pledge changed on one side and mine when both changed', () => {
  const pledge = (b, m, t) => {
    const merged = mergeTimesheet(week([], b), week([], m), week([], t));
    return 'pledge' in merged ? merged.pledge : 'nessuna';
  };
  const none = {};
  const of = (minutes) => ({ pledge: minutes });
  assert.equal(pledge(none, none, none), 'nessuna', 'mai dichiarate');
  assert.equal(pledge(of(480), of(480), of(480)), 480, 'nessuno le cambia');
  assert.equal(pledge(of(480), of(300), of(480)), 300, 'cambiate da me');
  assert.equal(pledge(of(480), of(480), of(300)), 300, 'cambiate dall\'altro dispositivo');
  assert.equal(pledge(of(480), of(300), of(600)), 300, 'cambiate da entrambi: vince la mia');
  assert.equal(pledge(of(480), of(300), of(300)), 300, 'stessa modifica da entrambi');
  assert.equal(pledge(none, of(300), none), 300, 'scritte solo da me');
  assert.equal(pledge(none, none, of(300)), 300, 'scritte solo dall\'altro dispositivo');
  assert.equal(pledge(none, of(300), of(600)), 300, 'scritte da entrambi');
});

test('mergeTimesheet keeps the removal of the pledge on either side', () => {
  const pledge = (b, m, t) => {
    const merged = mergeTimesheet(week([], b), week([], m), week([], t));
    return 'pledge' in merged ? merged.pledge : 'nessuna';
  };
  const none = {};
  const of = (minutes) => ({ pledge: minutes });
  assert.equal(pledge(of(480), none, of(480)), 'nessuna', 'tolte da me: si torna a quelle ereditate');
  assert.equal(pledge(of(480), of(480), none), 'nessuna', 'tolte dall\'altro dispositivo');
  assert.equal(pledge(of(480), none, none), 'nessuna', 'tolte da entrambi');
  assert.equal(pledge(of(480), none, of(300)), 'nessuna', 'tolte da me e cambiate altrove: vince la mia scelta');
  assert.equal(pledge(of(480), of(300), none), 300, 'cambiate da me e tolte altrove');
});

test('mergeTimesheet treats zero hours as a real pledge', () => {
  const merge = (b, m, t) => mergeTimesheet(week([], b), week([], m), week([], t));
  assert.equal(merge({}, { pledge: 0 }, {}).pledge, 0);
  assert.equal('pledge' in merge({}, { pledge: 0 }, {}), true);
  assert.equal(merge({ pledge: 480 }, { pledge: 480 }, { pledge: 0 }).pledge, 0, 'zero dall\'altro dispositivo');
  assert.equal(merge({ pledge: 0 }, { pledge: 0 }, { pledge: 480 }).pledge, 480, 'da zero a 8 ore altrove');
  assert.equal(merge({ pledge: 0 }, { pledge: 300 }, { pledge: 0 }).pledge, 300);
  assert.equal('pledge' in merge({ pledge: 0 }, {}, { pledge: 0 }), false, 'lo zero tolto da me resta tolto');
});

test('mergeTimesheet keeps the week of my copy and returns only week, entries and pledge', () => {
  const merged = mergeTimesheet({ week: BEFORE, entries: [] }, { week: LAST, entries: [] }, { week: CURRENT, entries: [], pledge: 60 });
  assert.equal(merged.week, LAST);
  assert.deepEqual(Object.keys(merged).sort(), ['entries', 'pledge', 'week']);
  assert.deepEqual(Object.keys(mergeTimesheet(week([]), week([]), week([]))).sort(), ['entries', 'week']);
  assert.deepEqual(mergeTimesheet(week([]), week([]), { week: LAST }), { week: LAST, entries: [] }, 'l\'altra copia senza righe');
});

test('mergeTimesheet sorts the result by day, start and id', () => {
  const base = week([]);
  const mine = { week: LAST, entries: [row('z', 'dom', 600, 660), row('k', 'lun', 900, 960), row('b', 'mer', 540, 570)] };
  const theirs = { week: LAST, entries: [row('y', 'mer', 540, 600), row('a', 'lun', 540, 600), row('q', 'sab', 0, 15)] };
  assert.deepEqual(ids(mergeTimesheet(base, mine, theirs)), ['a', 'k', 'b', 'y', 'q', 'z']);
  const merged = mergeTimesheet(base, mine, theirs);
  assert.deepEqual(sanitizeTimesheet(merged), merged, 'il risultato è già pulito');
});

test('mergeTimesheet does not change its inputs', () => {
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const base = week([row('a', 'lun', 540, 600), row('b', 'mar', 540, 600)], { pledge: 480 });
  const mine = week([row('a', 'lun', 540, 660), row('c', 'mer', 540, 600)], { pledge: 300 });
  const theirs = week([row('b', 'mar', 540, 600), row('d', 'lun', 480, 540)], { pledge: 600 });
  const copies = structuredClone([base, mine, theirs]);
  [base, mine, theirs].forEach(freeze);
  const merged = mergeTimesheet(base, mine, theirs);
  assert.deepEqual([base, mine, theirs], copies);
  assert.notEqual(merged, mine);
  assert.notEqual(merged.entries, mine.entries);
  assert.notEqual(merged.entries, theirs.entries);
  assert.deepEqual(ids(merged), ['d', 'a', 'c']);
  assert.equal(merged.pledge, 300);
});

test('mergeTimesheet can join overlapping rows from two devices and timesheetProblem reports them', () => {
  const mine = row('m', 'lun', 900, 1020);
  const theirs = row('t', 'lun', 960, 1080);
  const merged = mergeTimesheet(week([]), week([mine]), week([theirs]));
  assert.deepEqual(merged.entries, [mine, theirs], 'l\'unione non sceglie al posto della persona');
  assert.equal(timesheetProblem(merged), 'Lunedì due righe si accavallano: 15:00-17:00 e 16:00-18:00.');
  assert.equal(timesheetProblem(mergeTimesheet(week([]), week([mine]), week([row('t', 'lun', 1020, 1080)]))), null, 'righe che si toccano vanno bene');
});

test('mergeTimesheet returns the side that changed when the other one did not', () => {
  const base = week([row('a', 'lun', 540, 600), row('b', 'mar', 540, 600, { note: 'x' })], { pledge: 480 });
  const changed = week([row('a', 'lun', 480, 600, { area: 'clienti' }), row('c', 'dom', 0, 1440)], { pledge: 0 });
  assert.deepEqual(mergeTimesheet(base, changed, base), changed);
  assert.deepEqual(mergeTimesheet(base, base, changed), changed);
  assert.deepEqual(mergeTimesheet(base, base, base), base);
  assert.deepEqual(mergeTimesheet(changed, changed, changed), changed);
});

test('mergeTimesheet merges again against a newer version, as the save does after a second conflict', () => {
  const a = row('a', 'lun', 540, 600);
  const b = row('b', 'mar', 540, 600);
  const t1 = row('t1', 'ven', 540, 600);
  const t2 = row('t2', 'gio', 540, 600);
  const base = week([a, b], { pledge: 480 });
  const mine = week([{ ...a, end: 660 }, row('m', 'mer', 540, 600)], { pledge: 300 });
  const theirs1 = week([a, b, t1], { pledge: 480 });
  const theirs2 = week([a, { ...b, note: 'cambiata' }, t2], { pledge: 600 });
  // Come nel ciclo di salvataggio: l'unione diventa la mia copia e la versione ricevuta la nuova base.
  let draft = mine;
  let from = base;
  for (const theirs of [theirs1, theirs2]) {
    draft = mergeTimesheet(from, draft, theirs);
    from = theirs;
  }
  assert.deepEqual(draft, { week: LAST, entries: [{ ...a, end: 660 }, row('m', 'mer', 540, 600), t2], pledge: 300 });
  const once = mergeTimesheet(base, mine, theirs1);
  assert.deepEqual(mergeTimesheet(theirs1, once, theirs1), once, 'contro la stessa versione non cambia nulla');
});

test('mergeTimesheet can go past 100 rows and timesheetProblem then stops the save', () => {
  const mine = week(slots(60));
  const theirs = week(Array.from({ length: 60 }, (_, i) => row(`t${i}`, 'mar', i * STEP, i * STEP + STEP)));
  const merged = mergeTimesheet(week([]), mine, theirs);
  assert.equal(merged.entries.length, 120);
  assert.equal(timesheetProblem(merged), 'In una settimana ci stanno al massimo 100 righe.');
});

test('clockText writes minutes from midnight as HH:MM with midnight as 00:00', () => {
  assert.equal(clockText(0), '00:00');
  assert.equal(clockText(15), '00:15');
  assert.equal(clockText(59), '00:59');
  assert.equal(clockText(540), '09:00');
  assert.equal(clockText(600), '10:00');
  assert.equal(clockText(905), '15:05');
  assert.equal(clockText(1050), '17:30');
  assert.equal(clockText(1425), '23:45');
  assert.equal(clockText(1440), '00:00');
});

test('parseClock rounds to the nearest quarter of an hour', () => {
  assert.equal(parseClock('15:07'), 900);
  assert.equal(parseClock('15:08'), 915);
  assert.equal(parseClock('15:22'), 915);
  assert.equal(parseClock('15:23'), 930);
  assert.equal(parseClock('09:00'), 540);
  assert.equal(parseClock('9:00'), 540);
  assert.equal(parseClock(' 09:00 '), 540);
  assert.equal(parseClock('00:00'), 0);
  assert.equal(parseClock('00:07'), 0);
  assert.equal(parseClock('00:08'), 15);
  assert.equal(parseClock('12:52'), 765);
  assert.equal(parseClock('12:53'), 780);
  assert.equal(parseClock('12:52', { end: true }), 765);
});

test('parseClock keeps a start within the day and reads 00:00 as midnight for an end', () => {
  assert.equal(parseClock('23:45'), 1425);
  assert.equal(parseClock('23:52'), 1425);
  assert.equal(parseClock('23:53'), 1425, 'un inizio non arriva a mezzanotte');
  assert.equal(parseClock('23:59'), 1425);
  assert.equal(parseClock('23:45', { end: true }), 1425);
  assert.equal(parseClock('23:52', { end: true }), 1425);
  assert.equal(parseClock('23:53', { end: true }), 1440);
  assert.equal(parseClock('23:59', { end: true }), 1440);
  assert.equal(parseClock('00:00', { end: true }), 1440);
  assert.equal(parseClock('0:00', { end: true }), 1440);
  assert.equal(parseClock('00:07', { end: true }), 1440);
  assert.equal(parseClock('00:08', { end: true }), 15);
  assert.equal(parseClock('00:15', { end: true }), 15);
  assert.equal(parseClock('00:00', { end: false }), 0);
});

test('parseClock returns null for anything that is not HH:MM', () => {
  const bad = ['24:00', '23:60', '99:99', '12:5', '123:00', '-1:00', '12.30', '12h30', '1230', '12:30:00', '12:30 pm', 'abc', '', '   ', '１２:３０', null, undefined, 900, true, {}];
  for (const value of bad) {
    assert.equal(parseClock(value), null, JSON.stringify(value));
    assert.equal(parseClock(value, { end: true }), null, JSON.stringify(value));
  }
});

test('parseClock gives a valid quarter for every minute of the day', () => {
  for (let h = 0; h < 24; h += 1) {
    for (let m = 0; m < 60; m += 1) {
      const text = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const start = parseClock(text);
      const end = parseClock(text, { end: true });
      assert.ok(Number.isInteger(start) && start % STEP === 0 && start >= 0 && start <= DAY_MINUTES - STEP, text);
      assert.ok(Number.isInteger(end) && end % STEP === 0 && end >= STEP && end <= DAY_MINUTES, text);
      if (h * 60 + m <= 1432) assert.ok(Math.abs(start - (h * 60 + m)) <= 7, text);
    }
  }
});

test('durationText writes hours and minutes the Italian way', () => {
  assert.equal(durationText(0), '0 h');
  assert.equal(durationText(15), '15 min');
  assert.equal(durationText(45), '45 min');
  assert.equal(durationText(60), '1 h');
  assert.equal(durationText(65), '1 h 05');
  assert.equal(durationText(135), '2 h 15');
  assert.equal(durationText(150), '2 h 30');
  assert.equal(durationText(1440), '24 h');
  assert.equal(durationText(4800), '80 h');
  assert.equal(durationText(10080), '168 h');
});

test('pledgeFor uses the pledge of the week or the latest earlier one', () => {
  assert.equal(pledgeFor(new Map(), LAST), null);
  assert.equal(pledgeFor(weeksOf({ week: LAST, entries: [] }), LAST), null, 'nessuna settimana con le ore dichiarate');
  assert.equal(pledgeFor(weeksOf({ week: LAST, pledge: 480 }), LAST), 480);
  const weeks = weeksOf({ week: CURRENT, pledge: 300 }, { week: addDays(BEFORE, -7), pledge: 600 }, { week: BEFORE, entries: [] });
  assert.equal(pledgeFor(weeks, BEFORE), 600, 'una settimana senza ore dichiarate non azzera');
  assert.equal(pledgeFor(weeks, LAST), 600, 'vale anche per le settimane senza scheda');
  assert.equal(pledgeFor(weeks, CURRENT), 300);
  assert.equal(pledgeFor(weeks, addDays(CURRENT, 7)), 300);
  assert.equal(pledgeFor(weeks, addDays(BEFORE, -14)), null, 'le settimane dopo non contano');
});

test('pledgeFor keeps zero as a real pledge that carries over', () => {
  const weeks = weeksOf({ week: BEFORE, pledge: 0 }, { week: addDays(BEFORE, -7), pledge: 480 });
  assert.equal(pledgeFor(weeks, BEFORE), 0);
  assert.equal(pledgeFor(weeks, LAST), 0);
  assert.equal(pledgeFor(weeksOf({ week: BEFORE, pledge: 0 }, { week: LAST, pledge: 240 }), LAST), 240);
  assert.equal(pledgeFor(weeksOf({ week: BEFORE, pledge: 240 }, { week: CURRENT, pledge: 0 }), LAST), 240);
});

test('weekSeries returns the last 12 weeks ending with the given Monday', () => {
  const first = addDays(CURRENT, -77);
  const weeks = weeksOf(
    { week: addDays(first, -7), pledge: 300, entries: [row('a', 'lun', 0, 60)] },
    { week: addDays(CURRENT, -14), entries: [] },
    { week: LAST, pledge: 480, entries: [row('b', 'lun', 900, 1050), row('c', 'mar', 540, 600)] },
    { week: addDays(CURRENT, 7), pledge: 0, entries: [row('d', 'lun', 0, 15)] },
  );
  const series = weekSeries(weeks, CURRENT);
  assert.equal(series.length, HISTORY_WEEKS);
  assert.deepEqual(
    series.map((s) => s.week),
    Array.from({ length: 12 }, (_, i) => addDays(first, 7 * i)),
  );
  assert.deepEqual(series[0], { week: first, minutes: 0, pledge: 300, filled: false });
  assert.deepEqual(series[9], { week: addDays(CURRENT, -14), minutes: 0, pledge: 300, filled: false }, 'una scheda vuota non conta come compilata');
  assert.deepEqual(series[10], { week: LAST, minutes: 210, pledge: 480, filled: true });
  assert.deepEqual(series[11], { week: CURRENT, minutes: 0, pledge: 480, filled: false }, 'la settimana dopo non entra');
  assert.equal(series.filter((s) => s.filled).length, 1);
});

test('weekSeries follows the count and crosses the year boundary', () => {
  assert.deepEqual(weekSeries(new Map(), CURRENT, 1), [{ week: CURRENT, minutes: 0, pledge: null, filled: false }]);
  assert.deepEqual(weekSeries(new Map(), CURRENT, 0), []);
  assert.deepEqual(
    weekSeries(new Map(), '2027-01-11', 4).map((s) => s.week),
    ['2026-12-21', '2026-12-28', '2027-01-04', '2027-01-11'],
  );
  assert.ok(weekSeries(new Map(), CURRENT).every((s) => s.minutes === 0 && s.pledge === null && !s.filled));
});

test('the timesheet kind is a personal item outside the boards and the ideas', () => {
  assert.ok(KINDS.timesheet);
  assert.equal(KINDS.timesheet.label, 'Ore lavorate');
  assert.equal(KINDS.timesheet.icon, 'clock');
  assert.equal(KINDS.timesheet.statuses, null);
  assert.deepEqual(KINDS.timesheet.fields, []);
  for (const list of [BOARD_KINDS, IDEA_CHILD_KINDS, EXPENSE_KINDS]) assert.equal(list.includes('timesheet'), false);
  assert.equal(routeFor({ kind: 'timesheet', id: SHEET(1), data: { week: LAST } }), '#/squadra/ore');
  assert.equal(routeFor({ kind: 'timesheet', id: SHEET(1), data: {} }), '#/squadra/ore');
});

test('sanitizeSnapshot cleans timesheet data with sanitizeTimesheet', () => {
  const clean = sanitizeSnapshot('timesheet', {
    title: '  Ore lavorate  ',
    status: 'aperto',
    idea_id: IDEA,
    data: {
      week: LAST,
      pledge: 485,
      entries: [row('b', 'mar', 600, 720, { area: 'boh' }), row('a', 'lun', 900, 1050, { note: '  3 interviste ' }), row('c', 'mer', 7, 60)],
      extra: true,
    },
  });
  assert.deepEqual(clean, {
    title: 'Ore lavorate',
    status: null,
    idea_id: null,
    data: { week: LAST, entries: [row('a', 'lun', 900, 1050, { note: '3 interviste' }), row('b', 'mar', 600, 720, { area: 'altro' })] },
  });
  assert.equal(snapshotProblem('timesheet', clean), null);

  const blank = { title: '', status: null, idea_id: null, data: { entries: [] } };
  for (const value of [{}, null, undefined, { data: 'garbage' }, { data: [{ week: LAST }] }, { data: null }]) {
    assert.deepEqual(sanitizeSnapshot('timesheet', value), blank, JSON.stringify(value));
  }
});

test('snapshotProblem for a timesheet needs the week and no overlapping rows, not a title', () => {
  assert.equal(snapshotProblem('timesheet', sanitizeSnapshot('timesheet', {})), 'Manca la settimana.');
  assert.equal(snapshotProblem('timesheet', sanitizeSnapshot('timesheet', { data: { week: addDays(LAST, 2) } })), 'Manca la settimana.');
  assert.equal(snapshotProblem('timesheet', sanitizeSnapshot('timesheet', { title: '', data: { week: LAST } })), null);
  assert.equal(snapshotProblem('timesheet', sanitizeSnapshot('timesheet', { data: { week: LAST, pledge: 0 } })), null);
  assert.equal(
    snapshotProblem('timesheet', sanitizeSnapshot('timesheet', { data: { week: LAST, entries: [row('a', 'gio', 540, 660), row('b', 'gio', 645, 720)] } })),
    'Giovedì due righe si accavallano: 09:00-11:00 e 10:45-12:00.',
  );
});

test('timesheet history paths have readable Italian labels', () => {
  assert.equal(describePath('timesheet', 'title'), 'Titolo');
  assert.equal(describePath('timesheet', 'data.week'), 'Settimana');
  assert.equal(describePath('timesheet', 'data.pledge'), 'Ore dichiarate per la settimana');
  assert.equal(describePath('timesheet', 'data.entries'), 'Righe');
  assert.equal(describePath('timesheet', 'data.entries.#order'), 'Righe › ordine');
  assert.equal(describePath('timesheet', 'data.entries.length'), 'Righe', 'solo #order è l\'ordine');
  assert.equal(describePath('timesheet', 'data.entries#a1.day'), 'Riga › giorno');
  assert.equal(describePath('timesheet', 'data.entries#a1.start'), 'Riga › inizio');
  assert.equal(describePath('timesheet', 'data.entries#a1.end'), 'Riga › fine');
  assert.equal(describePath('timesheet', 'data.entries#a1.area'), 'Riga › area');
  assert.equal(describePath('timesheet', 'data.entries#a1.note'), 'Riga › cosa');
  assert.doesNotThrow(() => describePath('timesheet', 'data.entries#a1.xyz'));
  assert.doesNotThrow(() => describePath('timesheet', 'data.entries#a1'));
  assert.doesNotThrow(() => describePath('timesheet', 'data.xyz'));
});

test('timesheet history values show weeks, durations, clock times, areas and days', () => {
  assert.equal(formatValue('timesheet', 'data.pledge', 480), '8 h');
  assert.equal(formatValue('timesheet', 'data.pledge', 450), '7 h 30');
  assert.equal(formatValue('timesheet', 'data.pledge', 45), '45 min');
  assert.equal(formatValue('timesheet', 'data.pledge', 0), '0 h');
  assert.equal(formatValue('timesheet', 'data.week', '2026-11-09'), 'settimana del 9 nov');
  assert.equal(formatValue('timesheet', 'data.week', '2026-12-28'), 'settimana del 28 dic');
  assert.equal(formatValue('timesheet', 'data.week', '2027-02-01'), "settimana dell'1 feb");
  assert.equal(formatValue('timesheet', 'data.week', '2027-01-11'), "settimana dell'11 gen");
  assert.equal(formatValue('timesheet', 'data.entries#a1.start', 900), '15:00');
  assert.equal(formatValue('timesheet', 'data.entries#a1.start', 0), '00:00');
  assert.equal(formatValue('timesheet', 'data.entries#a1.end', 1050), '17:30');
  assert.equal(formatValue('timesheet', 'data.entries#a1.end', 1440), '00:00');
  assert.equal(formatValue('timesheet', 'data.entries#a1.area', 'clienti'), 'Clienti e vendite');
  assert.equal(formatValue('timesheet', 'data.entries#a1.area', 'boh'), 'Altro');
  assert.equal(formatValue('timesheet', 'data.entries#a1.day', 'mar'), 'martedì');
  assert.equal(formatValue('timesheet', 'data.entries#a1.day', 'dom'), 'domenica');
  assert.equal(formatValue('timesheet', 'data.entries#a1.note', '3 interviste'), '3 interviste');
  for (const path of ['data.pledge', 'data.week', 'data.entries#a1.start', 'data.entries#a1.area', 'data.entries#a1.note']) {
    assert.equal(formatValue('timesheet', path, null), '', path);
    assert.equal(formatValue('timesheet', path, undefined), '', path);
  }
});

test('timesheet history lists the whole entries array one readable row at a time', () => {
  assert.deepEqual(formatValue('timesheet', 'data.entries', [row('a1', 'lun', 900, 1050, { area: 'clienti' })]), ['lunedì 15:00-17:30 (Clienti e vendite)']);
  assert.deepEqual(
    formatValue('timesheet', 'data.entries', [
      row('a1', 'lun', 900, 1050, { area: 'clienti', note: '3 interviste' }),
      row('b1', 'mar', 600, 720),
      row('c1', 'dom', 1380, 1440, { area: 'boh' }),
      row('d1', 'gio', 0, 15, { area: 'ricerca' }),
    ]),
    ['lunedì 15:00-17:30 (Clienti e vendite)', 'martedì 10:00-12:00 (Prodotto e tecnologia)', 'domenica 23:00-00:00 (Altro)', 'giovedì 00:00-00:15 (Ricerca e interviste)'],
  );
  assert.deepEqual(formatValue('timesheet', 'data.entries', []), ['nessuna riga']);
  assert.deepEqual(formatValue('timesheet', 'data.entries', [null, 'x', 42, row('A1', 'lun', 0, 15), row('a', 'lun', 7, 15), row('b', 'xyz', 0, 15)]), ['nessuna riga']);
  assert.deepEqual(
    formatValue('timesheet', 'data.entries', [row('A1', 'lun', 0, 15), row('b1', 'ven', 540, 600, { area: 'numeri' }), {}]),
    ['venerdì 09:00-10:00 (Numeri e amministrazione)'],
    'le righe non valide restano fuori',
  );
  const xss = formatValue('timesheet', 'data.entries', [row('a1', 'lun', 540, 600, { area: '<img src=x>', note: '<img src=x onerror=alert(1)>' })]);
  assert.deepEqual(xss, ['lunedì 09:00-10:00 (Altro)'], 'la nota non entra nel testo e un\'area sconosciuta diventa Altro');
});

test('timesheet history values do not throw on malformed stored values', () => {
  assert.equal(formatValue('timesheet', 'data.week', 'garbage'), 'settimana del garbage');
  assert.equal(formatValue('timesheet', 'data.week', '2026-02-31'), 'settimana del 2026-02-31');
  assert.equal(formatValue('timesheet', 'data.pledge', '480'), '480');
  assert.equal(formatValue('timesheet', 'data.entries#a1.start', '900'), '900');
  assert.equal(formatValue('timesheet', 'data.entries#a1.day', 'xyz'), 'xyz');
  for (const value of [42, 'x', [], {}, true, 1.5]) {
    for (const path of ['data.week', 'data.pledge', 'data.entries', 'data.entries#a1.start', 'data.entries#a1.end', 'data.entries#a1.area', 'data.entries#a1.day', 'data.entries.#order']) {
      assert.doesNotThrow(() => formatValue('timesheet', path, value), `${path} ${JSON.stringify(value)}`);
    }
  }
  for (const value of [[42], [[]], [{}], [null], [undefined], ['x'], [true]]) {
    assert.deepEqual(formatValue('timesheet', 'data.entries', value), ['nessuna riga'], JSON.stringify(value));
  }
});

test('every path of a timesheet diff gets a label and a readable value', () => {
  const before = sanitizeSnapshot('timesheet', { title: 'Ore lavorate', data: { week: LAST, entries: [row('a1', 'lun', 900, 1050, { area: 'clienti' })] } });
  const after = sanitizeSnapshot('timesheet', {
    title: 'Ore lavorate',
    data: {
      week: LAST,
      pledge: 480,
      entries: [row('a1', 'lun', 900, 1080, { area: 'clienti', note: '3 interviste' }), row('b1', 'mar', 600, 720, { area: 'ricerca' })],
    },
  });
  const changes = diffSnapshots(before, after);
  assert.deepEqual(changes.map((c) => c.path).sort(), [
    'data.entries#a1.end',
    'data.entries#a1.note',
    'data.entries#b1.area',
    'data.entries#b1.day',
    'data.entries#b1.end',
    'data.entries#b1.start',
    'data.entries.#order',
    'data.pledge',
  ]);
  const labels = Object.fromEntries(changes.map((c) => [c.path, describePath('timesheet', c.path)]));
  const values = Object.fromEntries(changes.map((c) => [c.path, formatValue('timesheet', c.path, c.after)]));
  assert.deepEqual(labels, {
    'data.pledge': 'Ore dichiarate per la settimana',
    'data.entries.#order': 'Righe › ordine',
    'data.entries#a1.end': 'Riga › fine',
    'data.entries#a1.note': 'Riga › cosa',
    'data.entries#b1.day': 'Riga › giorno',
    'data.entries#b1.start': 'Riga › inizio',
    'data.entries#b1.end': 'Riga › fine',
    'data.entries#b1.area': 'Riga › area',
  });
  assert.equal(values['data.pledge'], '8 h');
  assert.equal(values['data.entries#a1.end'], '18:00');
  assert.equal(values['data.entries#a1.note'], '3 interviste');
  assert.equal(values['data.entries#b1.day'], 'martedì');
  assert.equal(values['data.entries#b1.start'], '10:00');
  assert.equal(values['data.entries#b1.end'], '12:00');
  assert.equal(values['data.entries#b1.area'], 'Ricerca e interviste');
  assert.equal(formatValue('timesheet', 'data.entries#a1.end', changes.find((c) => c.path === 'data.entries#a1.end').before), '17:30');
});

test('a conflict on the whole entries array is shown with readable rows', () => {
  const snap = (entries) => sanitizeSnapshot('timesheet', { title: 'Ore lavorate', data: { week: LAST, entries } });
  const { conflicts } = merge3(snap([]), snap([row('a1', 'lun', 900, 1050, { area: 'clienti' })]), snap([row('b1', 'mar', 600, 720)]));
  assert.deepEqual(
    conflicts.map((c) => c.path),
    ['data.entries'],
  );
  assert.equal(describePath('timesheet', conflicts[0].path), 'Righe');
  assert.deepEqual(formatValue('timesheet', conflicts[0].path, conflicts[0].mine), ['lunedì 15:00-17:30 (Clienti e vendite)']);
  assert.deepEqual(formatValue('timesheet', conflicts[0].path, conflicts[0].theirs), ['martedì 10:00-12:00 (Prodotto e tecnologia)']);
  assert.deepEqual(formatValue('timesheet', conflicts[0].path, conflicts[0].base), ['nessuna riga']);
  for (const side of ['base', 'mine', 'theirs']) {
    const shown = formatValue('timesheet', conflicts[0].path, conflicts[0][side]);
    assert.ok(Array.isArray(shown) && shown.every((x) => typeof x === 'string'), `${side}: nel confronto niente [object Object]`);
  }
});

let sheets = 0;
const addSheet = (data, over = {}) => {
  sheets += 1;
  store.applyItem(item({ id: SHEET(sheets), kind: 'timesheet', title: 'Ore lavorate', data, ...over }));
  return SHEET(sheets);
};
const MONDAY_8 = at(CURRENT, 8);
const reminderFor = (week, now) => ({
  id: `t-${week}`,
  text: `Non hai ancora segnato le ore della settimana ${weekLabel(week)}`,
  href: `#/squadra/ore?vista=mie&settimana=${week}`,
  at: now.toISOString(),
  authorId: null,
  kind: 'reminder',
});

test('the Monday reminder asks for last week hours and links to «Le mie ore» of that week', () => {
  addSheet({ week: BEFORE, pledge: 480, entries: [row('a1', 'lun', 540, 600)] });
  assert.deepEqual(timesheetReminder(MONDAY_8), reminderFor(LAST, MONDAY_8));
});

test('the reminder text names the week in Italian', () => {
  addSheet({ week: '2026-10-19', entries: [row('a1', 'lun', 540, 600)] });
  const note = timesheetReminder(new Date(2026, 10, 2, 9));
  assert.equal(note.text, "Non hai ancora segnato le ore della settimana dal 26 ott all'1 nov");
  assert.equal(note.href, '#/squadra/ore?vista=mie&settimana=2026-10-26');
  assert.equal(note.id, 't-2026-10-26');
  assert.equal(note.at, new Date(2026, 10, 2, 8).toISOString());
});

test('the reminder starts at 8:00 local time on Monday and stays for the rest of the week', () => {
  addSheet({ week: BEFORE, entries: [row('a1', 'lun', 540, 600)] });
  assert.equal(timesheetReminder(at(CURRENT, 0)), null);
  assert.equal(timesheetReminder(at(CURRENT, 7, 59)), null);
  assert.equal(timesheetReminder(new Date(MONDAY_8.getTime() - 1)), null);
  assert.deepEqual(timesheetReminder(MONDAY_8), reminderFor(LAST, MONDAY_8));
  for (const now of [at(CURRENT, 8, 1), at(CURRENT, 23, 59), at(addDays(CURRENT, 2), 10), at(addDays(CURRENT, 6), 23, 59)]) {
    assert.deepEqual(timesheetReminder(now), reminderFor(LAST, MONDAY_8), now.toString());
  }
  // La domenica prima la settimana "scorsa" è quella ancora prima, già compilata.
  assert.equal(timesheetReminder(at(addDays(CURRENT, -1), 23, 59)), null);
});

test('the reminder looks at the week before the Monday of now', () => {
  addSheet({ week: addDays(BEFORE, -7), entries: [row('a1', 'lun', 540, 600)] });
  addSheet({ week: LAST, pledge: 480, entries: [] });
  const sunday = at(addDays(CURRENT, -1), 12);
  assert.deepEqual(timesheetReminder(sunday), reminderFor(BEFORE, at(LAST, 8)));
  assert.deepEqual(timesheetReminder(MONDAY_8), reminderFor(LAST, MONDAY_8));
});

test('no reminder for someone who started logging hours only this week', () => {
  addSheet({ week: CURRENT, pledge: 480, entries: [row('a1', 'lun', 540, 600)] });
  assert.equal(timesheetReminder(MONDAY_8), null, 'la settimana scorsa non la usava ancora');
  assert.equal(timesheetReminder(at(addDays(CURRENT, 6), 23, 59)), null, 'neanche a fine settimana');
  addSheet({ week: addDays(CURRENT, 7), entries: [row('b1', 'lun', 540, 600)] });
  assert.equal(timesheetReminder(MONDAY_8), null, 'una settimana che deve venire non conta');
  addSheet({ week: BEFORE, entries: [] });
  assert.deepEqual(timesheetReminder(MONDAY_8), reminderFor(LAST, MONDAY_8), 'con una scheda di prima sì');
});

test('the reminder needs a timesheet up to last week, last week itself included', () => {
  addSheet({ week: LAST, entries: [] });
  assert.deepEqual(timesheetReminder(MONDAY_8), reminderFor(LAST, MONDAY_8), 'aperta la settimana scorsa senza righe');
  const sunday = at(addDays(CURRENT, -1), 12);
  assert.equal(timesheetReminder(sunday), null, 'la domenica prima la settimana scorsa era ancora quella in corso');

  signIn(ME);
  addSheet({ week: addDays(CURRENT, -7 * 20), entries: [row('a1', 'mar', 540, 600)] });
  assert.deepEqual(timesheetReminder(MONDAY_8), reminderFor(LAST, MONDAY_8), 'basta una scheda di molto tempo fa');
});

test('a reminder does not move the cursor used to ask for the rest of the notifications', async () => {
  const RealDate = Date;
  const [y, m, d] = addDays(CURRENT, 2).split('-').map(Number);
  const now = new RealDate(y, m - 1, d, 10).getTime();
  globalThis.Date = class extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }

    static now() {
      return now;
    }
  };
  const original = api.activityFeed;
  const asked = [];
  let feed = { revisions: [], comments: [] };
  api.activityFeed = async (since) => {
    asked.push(since);
    return feed;
  };
  try {
    addSheet({ week: BEFORE, entries: [row('a1', 'lun', 540, 600)] });
    const floor = new RealDate(now - 14 * 24 * 3600 * 1000).toISOString();
    await startNotifications();
    const reminder = notifications({ includeRead: true }).find((n) => n.kind === 'reminder');
    assert.equal(reminder?.id, `t-${LAST}`);
    assert.ok(reminder.at > floor);

    await refreshNotifications();
    assert.deepEqual(asked, [floor, floor], 'il promemoria non conta come ultima notizia ricevuta');

    const sunday = at(addDays(CURRENT, -1), 10).toISOString();
    feed = { revisions: [revision({ id: 7, author_id: OTHER, created_at: sunday })], comments: [] };
    await refreshNotifications();
    feed = { revisions: [], comments: [] };
    await refreshNotifications();
    assert.ok(reminder.at > sunday);
    assert.deepEqual(asked, [floor, floor, floor, sunday], 'si riparte dall\'ultima notifica vera, anche se il promemoria è più recente');
    assert.deepEqual(
      notifications({ includeRead: true }).map((n) => n.id),
      [`t-${LAST}`, 'r-7'],
    );
  } finally {
    stopNotifications();
    api.activityFeed = original;
    globalThis.Date = RealDate;
  }
});

test('only admins and members get the reminder', () => {
  addSheet({ week: BEFORE, entries: [row('a1', 'lun', 540, 600)] });
  assert.equal(timesheetReminder(MONDAY_8)?.kind, 'reminder', 'Anna è admin');

  signIn(OTHER);
  addSheet({ week: BEFORE, entries: [row('b1', 'lun', 540, 600)] }, { created_by: OTHER, updated_by: OTHER });
  assert.equal(timesheetReminder(MONDAY_8)?.kind, 'reminder', 'Bruno è member');

  signIn(ADVISOR);
  addSheet({ week: BEFORE, entries: [row('c1', 'lun', 540, 600)] }, { created_by: ADVISOR, updated_by: ADVISOR });
  assert.equal(store.timesheetsOf(ADVISOR).length, 1);
  assert.equal(timesheetReminder(MONDAY_8), null, 'Chiara è advisor');

  signIn(ME);
  store.setMembers([{ user_id: ME, display_name: 'Anna', role: 'owner' }]);
  addSheet({ week: BEFORE, entries: [] });
  assert.equal(timesheetReminder(MONDAY_8), null, 'un ruolo sconosciuto non riceve nulla');
  store.setMembers([]);
  assert.equal(timesheetReminder(MONDAY_8), null, 'chi non è nel team non riceve nulla');
  signIn(null);
  assert.equal(timesheetReminder(MONDAY_8), null);
});

test('no reminder for someone who never used the hours log', () => {
  assert.equal(timesheetReminder(MONDAY_8), null);
  addSheet({ week: BEFORE, entries: [] }, { created_by: OTHER, updated_by: OTHER });
  assert.equal(timesheetReminder(MONDAY_8), null, 'le ore degli altri non contano');
  addSheet({ week: BEFORE, entries: [] }, { deleted_at: '2026-10-15T10:00:00Z' });
  assert.equal(timesheetReminder(MONDAY_8), null, 'una scheda archiviata non conta');
  addSheet({ week: addDays(BEFORE, 2), entries: [] });
  assert.equal(timesheetReminder(MONDAY_8), null, 'una settimana che non è un lunedì non conta');
  store.applyItem(item({ id: SHEET(99), kind: 'availability', title: 'Impegni', data: { busy: {} } }));
  assert.equal(timesheetReminder(MONDAY_8), null);
  addSheet({ week: BEFORE, entries: [] });
  assert.equal(timesheetReminder(MONDAY_8)?.id, `t-${LAST}`, 'basta una scheda, anche vuota');
});

test('no reminder when last week already has hours', () => {
  const id = addSheet({ week: LAST, pledge: 480, entries: [] });
  assert.equal(timesheetReminder(MONDAY_8)?.id, `t-${LAST}`, 'una scheda vuota non basta');
  store.applyItem(item({ id, kind: 'timesheet', title: 'Ore lavorate', version: 2, data: { week: LAST, pledge: 480, entries: [row('a1', 'dom', 1425, 1440)] } }));
  assert.equal(timesheetReminder(MONDAY_8), null, 'compilata, il promemoria sparisce');
  store.applyItem(item({ id, kind: 'timesheet', title: 'Ore lavorate', version: 3, data: { week: LAST, pledge: 480, entries: [row('A1', 'dom', 1425, 1440)] } }));
  assert.equal(timesheetReminder(MONDAY_8)?.id, `t-${LAST}`, 'le righe non valide non contano');
});

test('no reminder when the pledge for last week is zero, its own or carried over', () => {
  addSheet({ week: LAST, pledge: 0, entries: [] });
  assert.equal(timesheetReminder(MONDAY_8), null);

  signIn(ME);
  addSheet({ week: BEFORE, pledge: 0, entries: [row('a1', 'lun', 540, 600)] });
  assert.equal(timesheetReminder(MONDAY_8), null, 'lo zero vale anche per le settimane dopo');
  addSheet({ week: LAST, pledge: 480, entries: [] });
  assert.equal(timesheetReminder(MONDAY_8)?.id, `t-${LAST}`, 'la settimana scorsa ha dichiarato ore');

  signIn(ME);
  addSheet({ week: BEFORE, pledge: 480, entries: [] });
  addSheet({ week: CURRENT, pledge: 0, entries: [] });
  assert.equal(timesheetReminder(MONDAY_8)?.id, `t-${LAST}`, 'uno zero più recente non vale all\'indietro');

  signIn(ME);
  addSheet({ week: BEFORE, entries: [] });
  assert.equal(timesheetReminder(MONDAY_8)?.id, `t-${LAST}`, 'senza ore dichiarate si ricorda');
});
