import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_KEYS,
  FIRST_HOUR,
  HOURS,
  LAST_HOUR,
  MAX_WEEKS,
  WEEKS_AHEAD,
  addDays,
  bestSlots,
  dayName,
  dropPastWeeks,
  hourSpan,
  hoursText,
  isMonday,
  joinNames,
  mondayOf,
  personState,
  personWeek,
  sanitizeAvailability,
  sanitizeBusy,
  sanitizeHours,
  shortDate,
  slotLabel,
  teamGrid,
  thisMonday,
  weekLabel,
  weekdayIndex,
  withDay,
} from '../../assets/js/availability.js';
import { fmtDate } from '../../assets/js/lib/format.js';
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
import { diffSnapshots } from '../../assets/js/lib/diff.js';
import { ADVISOR, ME, OTHER } from '../setup/fixtures.mjs';

const IDEA = '11111111-1111-4111-8111-111111111111';
const ITEM = 'aaaaaaaa-0000-4000-8000-000000000001';

// Date relative al giorno in cui girano i test, mai fisse rispetto a oggi.
const CURRENT = thisMonday();
const NEXT = addDays(CURRENT, 7);
const LATER = addDays(NEXT, 7);

const at = (key, hour, minute = 0) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute);
};
const BEFORE_NEXT = at(addDays(NEXT, -1), 12);

const busyExcept = (free = {}) => Object.fromEntries(DAY_KEYS.map((day) => [day, HOURS.filter((hour) => !(free[day] || []).includes(hour))]));
const sizes = (days) => days.map((day) => day.busy.size);

test('the grid covers 8 to 22 in one-hour slots over seven Italian day keys', () => {
  assert.deepEqual(DAY_KEYS, ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']);
  assert.equal(FIRST_HOUR, 8);
  assert.equal(LAST_HOUR, 22);
  assert.deepEqual(HOURS, [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
  assert.equal(MAX_WEEKS, 26);
  assert.ok(WEEKS_AHEAD <= MAX_WEEKS, 'le settimane navigabili devono stare nel limite salvabile');
  assert.equal(dayName('lun'), 'lunedì');
  assert.equal(dayName('dom'), 'domenica');
  assert.equal(dayName('xyz'), 'xyz');
});

test('addDays moves across month, year and leap-day boundaries', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2028-02-29', 1), '2028-03-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2027-01-01', -1), '2026-12-31');
  assert.equal(addDays('2026-12-28', 6), '2027-01-03');
  assert.equal(addDays('2026-11-04', 0), '2026-11-04');
  assert.equal(addDays('2026-11-02', 7 * 11), '2027-01-18');
  assert.equal(addDays('2026-11-02', -365), '2025-11-02');
  assert.equal(addDays('2026-11-02', 3653), '2036-11-02', 'dieci anni con tre giorni bisestili');
  assert.equal(addDays('2036-11-02', -3653), '2026-11-02');
});

test('addDays and mondayOf ignore daylight saving changes', () => {
  // In Italia l'ora legale del 2026 inizia il 29 marzo e finisce il 25 ottobre.
  assert.equal(addDays('2026-03-28', 1), '2026-03-29');
  assert.equal(addDays('2026-03-28', 2), '2026-03-30');
  assert.equal(addDays('2026-03-30', -1), '2026-03-29');
  assert.equal(addDays('2026-03-23', 7), '2026-03-30');
  assert.equal(addDays('2026-10-24', 1), '2026-10-25');
  assert.equal(addDays('2026-10-25', 1), '2026-10-26');
  assert.equal(addDays('2026-10-19', 7), '2026-10-26');
  assert.equal(mondayOf('2026-03-29'), '2026-03-23');
  assert.equal(mondayOf('2026-03-30'), '2026-03-30');
  assert.equal(mondayOf('2026-10-25'), '2026-10-19');
  assert.equal(mondayOf('2026-10-26'), '2026-10-26');

  let key = '2026-01-01';
  for (let i = 0; i < 800; i += 1) {
    const next = addDays(key, 1);
    assert.notEqual(next, key, key);
    assert.equal(addDays(next, -1), key, key);
    assert.equal(weekdayIndex(next), (weekdayIndex(key) + 1) % 7, key);
    assert.equal(isMonday(mondayOf(key)), true, key);
    key = next;
  }
});

test('weekdayIndex counts from Monday and mondayOf returns the Monday of the same week', () => {
  const week = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
  assert.deepEqual(week.map(weekdayIndex), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(week.map(mondayOf), Array(7).fill('2026-11-02'));
  assert.equal(mondayOf('2026-11-09'), '2026-11-09');
  assert.equal(mondayOf('2027-01-01'), '2026-12-28');
  assert.equal(mondayOf('2026-03-01'), '2026-02-23');
  assert.equal(mondayOf('2028-03-01'), '2028-02-28');
});

test('isMonday accepts only real calendar dates that fall on a Monday', () => {
  assert.equal(isMonday('2026-11-02'), true);
  assert.equal(isMonday('2026-12-28'), true);
  assert.equal(isMonday('2026-03-02'), true);
  assert.equal(isMonday('2026-11-03'), false);
  assert.equal(isMonday('2026-11-08'), false);
  // Senza il controllo della data il 30 febbraio diventerebbe lunedì 2 marzo.
  assert.equal(weekdayIndex('2026-02-30'), 0);
  const bad = [
    '2026-02-30',
    '2026-02-31',
    '2026-02-29',
    '2026-13-02',
    '2026-00-05',
    '2026-11-00',
    '2026-11-2',
    '26-11-02',
    ' 2026-11-02',
    '2026-11-02 ',
    '2026-11-02T00:00:00Z',
    '02/11/2026',
    '',
    null,
    undefined,
    20261102,
    new Date(2026, 10, 2),
    ['2026-11-02'],
    {},
  ];
  for (const value of bad) assert.equal(isMonday(value), false, String(value));
});

test('thisMonday uses the local day of an explicit now', () => {
  assert.equal(thisMonday(new Date(2026, 10, 4, 10)), '2026-11-02');
  assert.equal(thisMonday(new Date(2026, 10, 2, 0, 0)), '2026-11-02');
  assert.equal(thisMonday(new Date(2026, 10, 1, 23, 59)), '2026-10-26');
  assert.equal(thisMonday(new Date(2026, 10, 8, 23, 59)), '2026-11-02');
  assert.equal(thisMonday(new Date(2026, 2, 29, 12)), '2026-03-23');
  assert.equal(thisMonday(new Date(2026, 9, 25, 12)), '2026-10-19');
  assert.equal(thisMonday(new Date(2027, 0, 1, 9)), '2026-12-28');
  assert.equal(isMonday(CURRENT), true);
  assert.equal(isMonday(NEXT), true);
});

test('week and slot labels are written in Italian', () => {
  assert.equal(shortDate('2026-11-09'), '9 nov');
  assert.equal(weekLabel('2026-11-09'), 'dal 9 nov al 15 nov');
  assert.equal(weekLabel('2026-12-28'), 'dal 28 dic al 3 gen');
  assert.equal(slotLabel('2026-11-11', 9, 12), 'mercoledì 11 nov, 9-12');
  assert.equal(slotLabel('2026-11-15', 21, 22), 'domenica 15 nov, 21-22');
});

test('withDay elides every article before the 1st, 8th and 11th only', () => {
  const elided = { il: "l'", dal: "dall'", al: "all'", del: "dell'" };
  for (const [word, short] of Object.entries(elided)) {
    for (const day of ['01', '08', '11']) assert.equal(withDay(word, `2026-12-${day}`, 'X'), `${short}X`, `${word} ${day}`);
    for (const day of ['02', '10', '12', '18', '21', '28', '31']) assert.equal(withDay(word, `2026-12-${day}`, 'X'), `${word} X`, `${word} ${day}`);
    for (const key of ['garbage', '', null, undefined, '2026-12']) assert.equal(withDay(word, key, 'X'), `${word} X`, `${word} ${key}`);
  }
  assert.equal(withDay('il', '2026-11-01', fmtDate('2026-11-01')), "l'1 nov 2026");
  assert.equal(withDay('al', '2026-11-11', fmtDate('2026-11-11')), "all'11 nov 2026");
  assert.equal(withDay('al', '2026-11-18', fmtDate('2026-11-18')), 'al 18 nov 2026');
});

test('weekLabel elides the article before a Monday or a Sunday on the 1st, 8th or 11th', () => {
  assert.equal(weekLabel('2026-12-07'), 'dal 7 dic al 13 dic');
  assert.equal(weekLabel('2027-02-01'), "dall'1 feb al 7 feb");
  assert.equal(weekLabel('2027-02-08'), "dall'8 feb al 14 feb");
  assert.equal(weekLabel('2027-01-11'), "dall'11 gen al 17 gen");
  assert.equal(weekLabel('2026-10-26'), "dal 26 ott all'1 nov");
  assert.equal(weekLabel('2026-11-02'), "dal 2 nov all'8 nov");
  assert.equal(weekLabel('2027-04-05'), "dal 5 apr all'11 apr");
  assert.equal(weekLabel('2026-11-16'), 'dal 16 nov al 22 nov');
});

test('shortDate returns the raw value as a string when it is not a real date', () => {
  assert.equal(shortDate('2026-11-01'), '1 nov');
  assert.equal(shortDate('2028-02-29'), '29 feb');
  for (const value of ['garbage', '', '2026-02-31', '2026-13-01', '2026-11-9', '2026-11-09T00:00:00Z']) assert.equal(shortDate(value), value, value);
  assert.equal(shortDate(20261109), '20261109');
});

test('hourSpan reads an hour slot for screen readers', () => {
  assert.equal(hourSpan(8), 'dalle 8 alle 9');
  assert.equal(hourSpan(21), 'dalle 21 alle 22');
  assert.deepEqual(HOURS.map(hourSpan), HOURS.map((hour) => `dalle ${hour} alle ${hour + 1}`));
});

test('hoursText joins consecutive hours into ranges', () => {
  assert.equal(hoursText([9, 10, 11, 15]), '9-12, 15-16');
  assert.equal(hoursText([15, 9, 11, 10, 10]), '9-12, 15-16', 'ordinate e senza doppioni');
  assert.equal(hoursText([8, 10, 12]), '8-9, 10-11, 12-13');
  assert.equal(hoursText([0]), '0-1');
  assert.equal(hoursText([23]), '23-24');
  assert.equal(hoursText(Array.from({ length: 24 }, (_, i) => i)), '0-24');
  assert.equal(hoursText([9, '10', 24, -1, 9.5]), '9-10');
  assert.equal(hoursText([]), '');
  for (const value of [null, undefined, 'abc', 9, { 0: 9, length: 1 }]) assert.equal(hoursText(value), '', String(value));
});

test('joinNames lists names with a final "e"', () => {
  assert.equal(joinNames([]), '');
  assert.equal(joinNames(['Anna']), 'Anna');
  assert.equal(joinNames(['Anna', 'Bruno']), 'Anna e Bruno');
  assert.equal(joinNames(['Anna', 'Bruno', 'Chiara']), 'Anna, Bruno e Chiara');
});

test('sanitizeHours keeps only whole hours 0-23, once, in numeric order', () => {
  assert.deepEqual(sanitizeHours([0, 23]), [0, 23]);
  assert.deepEqual(sanitizeHours([21, 9, 9, 15, 9]), [9, 15, 21]);
  assert.deepEqual(sanitizeHours([10, 9, 2]), [2, 9, 10], 'ordine numerico, non alfabetico');
  assert.deepEqual(sanitizeHours([9.0]), [9]);
  assert.deepEqual(sanitizeHours([24, -1, 9.5, '10', NaN, Infinity, -Infinity, null, undefined, true, {}, [9], 1e3]), []);
  assert.deepEqual(sanitizeHours([]), []);
  for (const value of [null, undefined, 9, '9', '9,10', { 0: 9, length: 1 }, new Set([9])]) {
    assert.deepEqual(sanitizeHours(value), [], String(value));
  }
  assert.deepEqual(sanitizeHours(Array(100000).fill(12)), [12]);
  assert.deepEqual(sanitizeHours(Array.from({ length: 1000 }, (_, i) => 500 - i)), Array.from({ length: 24 }, (_, i) => i));
});

test('sanitizeBusy keeps only the seven day keys with at least one valid hour', () => {
  const clean = sanitizeBusy({
    dom: [23, 0],
    lun: [10, 9, 10],
    mar: [],
    mer: [25],
    gio: ['9'],
    ven: [14],
    sab: { 0: 9 },
    Lun: [9],
    monday: [9],
    xyz: [1],
  });
  assert.deepEqual(clean, { lun: [9, 10], ven: [14], dom: [0, 23] });
  assert.deepEqual(Object.keys(clean), ['lun', 'ven', 'dom'], 'sempre nell\'ordine dei giorni');
  assert.deepEqual(sanitizeBusy({ lun: '9,10' }), {});
  assert.deepEqual(sanitizeBusy(JSON.parse('{"__proto__":{"lun":[9]},"mar":[10]}')), { mar: [10] });
  for (const value of [null, undefined, [], [[9]], 'lun', 42, true]) assert.deepEqual(sanitizeBusy(value), {}, String(value));
});

test('sanitizeAvailability returns only busy, until and weeks', () => {
  const clean = sanitizeAvailability({
    busy: { lun: [9] },
    until: '2026-12-31',
    weeks: [{ key: NEXT, busy: { mar: [10] }, note: 'x', owner: ME }],
    extra: 1,
    owner: ME,
    title: 'Impegni',
  });
  assert.deepEqual(clean, { busy: { lun: [9] }, until: '2026-12-31', weeks: [{ key: NEXT, busy: { mar: [10] } }] });
  assert.deepEqual(Object.keys(clean), ['busy', 'until', 'weeks']);
  assert.deepEqual(sanitizeAvailability(clean), clean, 'pulire due volte non cambia nulla');
  assert.deepEqual(JSON.parse(JSON.stringify(clean)), clean);
});

test('sanitizeAvailability turns garbage into an empty weekly pattern', () => {
  for (const value of [null, undefined, [], [{ busy: { lun: [9] } }], 'busy', 42, true]) {
    assert.deepEqual(sanitizeAvailability(value), { busy: {} }, String(value));
  }
  assert.deepEqual(sanitizeAvailability({}), { busy: {} });
  assert.deepEqual(sanitizeAvailability({ busy: null, until: null, weeks: null }), { busy: {} });
  assert.deepEqual(sanitizeAvailability({ busy: [[9]], weeks: { 0: { key: NEXT, busy: {} } } }), { busy: {} });
  assert.deepEqual(sanitizeAvailability(JSON.parse('{"__proto__":{"until":"2026-12-31"},"busy":{}}')), { busy: {} });
});

test('sanitizeAvailability keeps until only when it is a real date', () => {
  assert.equal(sanitizeAvailability({ until: '2026-12-31' }).until, '2026-12-31');
  assert.equal(sanitizeAvailability({ until: '2028-02-29' }).until, '2028-02-29');
  const bad = ['2026-02-31', '2026-02-29', '2026-13-01', '2026-1-5', '31/12/2026', '2026-12-31T00:00:00Z', '', ' ', 20261231, new Date(2026, 11, 31), null, ['2026-12-31']];
  for (const until of bad) assert.equal('until' in sanitizeAvailability({ busy: {}, until }), false, String(until));
});

test('sanitizeAvailability keeps weeks that start on a real Monday, once, sorted by date', () => {
  const clean = sanitizeAvailability({
    busy: {},
    weeks: [
      { key: LATER, busy: { lun: [8] } },
      { key: NEXT, busy: { mar: [10, 9, 9], xyz: [1] } },
      { key: NEXT, busy: { mer: [11] } },
      { key: addDays(NEXT, 1), busy: { lun: [9] } },
      { key: '2026-02-30', busy: { lun: [9] } },
      { key: '2026-03-02T00:00:00Z', busy: { lun: [9] } },
      { busy: { lun: [9] } },
      null,
      'x',
      42,
      [NEXT],
      { key: addDays(LATER, 7) },
      { key: addDays(LATER, 14), busy: 'garbage' },
    ],
  });
  assert.deepEqual(clean.weeks, [
    { key: NEXT, busy: { mar: [9, 10] } },
    { key: LATER, busy: { lun: [8] } },
    { key: addDays(LATER, 7), busy: {} },
    { key: addDays(LATER, 14), busy: {} },
  ]);
  assert.equal('weeks' in sanitizeAvailability({ weeks: [] }), false);
  assert.equal('weeks' in sanitizeAvailability({ weeks: [{ key: addDays(NEXT, 2), busy: {} }] }), false);
  assert.equal(sanitizeAvailability({ weeks: Array(10000).fill({ key: NEXT, busy: { lun: [9] } }) }).weeks.length, 1);
});

test('sanitizeAvailability keeps at most 26 weeks, the earliest ones', () => {
  const weeks = (n) => Array.from({ length: n }, (_, i) => ({ key: addDays(NEXT, 7 * i), busy: { lun: [i % 24] } })).reverse();
  assert.equal(sanitizeAvailability({ weeks: weeks(25) }).weeks.length, 25);
  assert.equal(sanitizeAvailability({ weeks: weeks(26) }).weeks.length, MAX_WEEKS);
  const clean = sanitizeAvailability({ weeks: weeks(27) });
  assert.equal(clean.weeks.length, MAX_WEEKS);
  assert.equal(clean.weeks[0].key, NEXT);
  assert.equal(clean.weeks.at(-1).key, addDays(NEXT, 7 * 25));
  assert.equal(sanitizeAvailability({ weeks: weeks(500) }).weeks.length, MAX_WEEKS);
});

test('dropPastWeeks removes only the weeks before the given Monday and leaves the input alone', () => {
  const previous = addDays(CURRENT, -7);
  const data = {
    busy: { lun: [9] },
    until: '2026-12-31',
    weeks: [
      { key: previous, busy: {} },
      { key: CURRENT, busy: { mar: [9] } },
      { key: NEXT, busy: {} },
    ],
  };
  const copy = structuredClone(data);
  assert.deepEqual(dropPastWeeks(data, CURRENT), {
    busy: { lun: [9] },
    until: '2026-12-31',
    weeks: [
      { key: CURRENT, busy: { mar: [9] } },
      { key: NEXT, busy: {} },
    ],
  });
  assert.deepEqual(data, copy);
  const none = dropPastWeeks(data, LATER);
  assert.deepEqual(none, { busy: { lun: [9] }, until: '2026-12-31' });
  assert.equal('weeks' in none, false);
  assert.deepEqual(dropPastWeeks({ busy: {} }, CURRENT), { busy: {} });
  assert.deepEqual(dropPastWeeks({ busy: {}, weeks: [] }, CURRENT), { busy: {} });
});

test('personWeek marks every day unknown for someone who never filled in', () => {
  for (const data of [null, undefined]) {
    const days = personWeek(data, NEXT);
    assert.deepEqual(days.map((day) => day.date), DAY_KEYS.map((_, i) => addDays(NEXT, i)));
    assert.ok(days.every((day) => !day.known && day.busy.size === 0));
    assert.equal(personState(data, NEXT), 'missing');
  }
});

test('personWeek repeats the weekly pattern when it has no expiry', () => {
  const days = personWeek({ busy: { lun: [9, 10], dom: [21] } }, NEXT);
  assert.ok(days.every((day) => day.known));
  assert.deepEqual([...days[0].busy], [9, 10]);
  assert.deepEqual([...days[6].busy], [21]);
  assert.deepEqual(sizes(days), [2, 0, 0, 0, 0, 0, 1]);
  assert.equal(personState({ busy: { lun: [9] } }, NEXT), 'ok');
  assert.equal(personState({ busy: {} }, NEXT), 'ok', 'chi non ha impegni è libero, non sconosciuto');
  assert.equal(personState({}, NEXT), 'ok');
});

test('personWeek treats the days after until as unknown, until included', () => {
  const busy = { lun: [9], gio: [9], ven: [9] };
  const days = personWeek({ busy, until: addDays(NEXT, 3) }, NEXT);
  assert.deepEqual(days.map((day) => day.known), [true, true, true, true, false, false, false]);
  assert.deepEqual(sizes(days), [1, 0, 0, 1, 0, 0, 0], 'il venerdì scaduto non porta impegni');
  assert.equal(personState({ busy, until: addDays(NEXT, 3) }, NEXT), 'partial');
  assert.equal(personState({ busy, until: NEXT }, NEXT), 'partial');
  assert.equal(personState({ busy, until: addDays(NEXT, 6) }, NEXT), 'ok');
  assert.equal(personState({ busy, until: addDays(NEXT, 30) }, NEXT), 'ok');
  assert.equal(personState({ busy, until: addDays(NEXT, -1) }, NEXT), 'expired');
  assert.equal(personState({ busy, until: '2020-01-01' }, NEXT), 'expired');
  assert.ok(personWeek({ busy, until: addDays(NEXT, -1) }, NEXT).every((day) => !day.known && day.busy.size === 0));
});

test('a week entry replaces the weekly pattern for that week only, even when the pattern expired', () => {
  const data = { busy: { lun: [9] }, until: addDays(NEXT, -1), weeks: [{ key: LATER, busy: { mar: [14] } }] };
  const days = personWeek(data, LATER);
  assert.ok(days.every((day) => day.known));
  assert.deepEqual(sizes(days), [0, 1, 0, 0, 0, 0, 0], 'il lunedì dell\'orario tipo non vale in quella settimana');
  assert.equal(days[1].busy.has(14), true);
  assert.equal(personState(data, LATER), 'ok');
  assert.equal(personState(data, NEXT), 'expired');
  assert.equal(personState(data, addDays(LATER, 7)), 'expired');

  const free = { busy: { lun: [9, 10] }, weeks: [{ key: NEXT, busy: {} }] };
  assert.ok(personWeek(free, NEXT).every((day) => day.known && day.busy.size === 0));
  assert.deepEqual([...personWeek(free, LATER)[0].busy], [9, 10]);
});

const trio = () => [
  { id: ME, data: { busy: { lun: [9, 10] } } },
  { id: OTHER, data: { busy: { lun: [10, 11] } } },
  { id: ADVISOR, data: null },
];

test('teamGrid splits every hour into free, busy and unknown people', () => {
  const grid = teamGrid(trio(), NEXT, BEFORE_NEXT);
  assert.equal(grid.length, 7);
  assert.ok(grid.every((column) => column.length === HOURS.length));
  assert.deepEqual(grid[0][0], { day: 'lun', date: NEXT, hour: 8, past: false, free: [ME, OTHER], busy: [], unknown: [ADVISOR] });
  assert.deepEqual([grid[0][1].free, grid[0][1].busy], [[OTHER], [ME]]);
  assert.deepEqual([grid[0][2].free, grid[0][2].busy], [[], [ME, OTHER]]);
  assert.deepEqual([grid[0][3].free, grid[0][3].busy], [[ME], [OTHER]]);
  assert.deepEqual(grid[1][1].free, [ME, OTHER]);
  assert.deepEqual([grid[6][13].day, grid[6][13].date, grid[6][13].hour], ['dom', addDays(NEXT, 6), 21]);
  assert.ok(grid.flat().every((cell) => cell.free.length + cell.busy.length + cell.unknown.length === 3));
  assert.ok(grid.flat().every((cell) => !cell.past));
});

test('teamGrid flags as past the hours that already started', () => {
  const half = teamGrid(trio(), NEXT, at(NEXT, 10, 30));
  assert.deepEqual(half[0].map((cell) => cell.past).slice(0, 5), [true, true, true, false, false]);
  assert.ok(half.slice(1).flat().every((cell) => !cell.past));
  const sharp = teamGrid(trio(), NEXT, at(NEXT, 10));
  assert.deepEqual(sharp[0].map((cell) => cell.past).slice(0, 4), [true, true, false, false], 'l\'ora che inizia adesso non è passata');
  assert.ok(teamGrid(trio(), NEXT, at(LATER, 0)).flat().every((cell) => cell.past));
  assert.ok(teamGrid(trio(), NEXT, at(addDays(NEXT, 6), 21, 1)).flat().every((cell) => cell.past));
  assert.ok(teamGrid(trio(), NEXT).flat().every((cell) => !cell.past));
  assert.ok(teamGrid(trio(), addDays(CURRENT, -7)).flat().every((cell) => cell.past));
});

test('teamGrid ignores stored hours outside the grid and the days after until', () => {
  const grid = teamGrid([{ id: ME, data: { busy: { lun: [0, 7, 22, 23], gio: [9] }, until: addDays(NEXT, 2) } }], NEXT, BEFORE_NEXT);
  assert.ok(grid[0].every((cell) => cell.free.length === 1 && cell.free[0] === ME));
  assert.ok(grid[3].every((cell) => cell.unknown.length === 1 && cell.free.length === 0 && cell.busy.length === 0));
  const empty = teamGrid([], NEXT, BEFORE_NEXT);
  assert.equal(empty.flat().length, 7 * HOURS.length);
  assert.ok(empty.flat().every((cell) => !cell.free.length && !cell.busy.length && !cell.unknown.length));
});

test('bestSlots merges consecutive hours only while the same people are free', () => {
  const people = [
    { id: ME, data: { busy: busyExcept({ lun: [9, 10, 11] }) } },
    { id: OTHER, data: { busy: busyExcept({ lun: [10, 11, 12] }) } },
    { id: ADVISOR, data: { busy: busyExcept({ lun: [9, 10, 11, 12] }) } },
  ];
  const slots = bestSlots(teamGrid(people, NEXT, BEFORE_NEXT));
  assert.deepEqual(slots, [
    { day: 'lun', date: NEXT, start: 10, end: 12, free: [ME, OTHER, ADVISOR], busy: [], unknown: [] },
    { day: 'lun', date: NEXT, start: 9, end: 10, free: [ME, ADVISOR], busy: [OTHER], unknown: [] },
    { day: 'lun', date: NEXT, start: 12, end: 13, free: [OTHER, ADVISOR], busy: [ME], unknown: [] },
  ]);
  assert.ok(slots.every((slot) => !('sig' in slot)));

  const swap = [
    { id: ME, data: { busy: busyExcept({ lun: [9, 10] }) } },
    { id: OTHER, data: { busy: busyExcept({ lun: [9] }) } },
    { id: ADVISOR, data: { busy: busyExcept({ lun: [10] }) } },
  ];
  assert.deepEqual(
    bestSlots(teamGrid(swap, NEXT, BEFORE_NEXT)).map((s) => [s.start, s.end, s.free]),
    [
      [9, 10, [ME, OTHER]],
      [10, 11, [ME, ADVISOR]],
    ],
    'stesso numero di liberi ma persone diverse: due fasce',
  );

  const gaps = [
    { id: ME, data: { busy: busyExcept({ lun: [9, 11, 21], mar: [8] }) } },
    { id: OTHER, data: { busy: busyExcept({ lun: [9, 11, 21], mar: [8] }) } },
  ];
  assert.deepEqual(
    bestSlots(teamGrid(gaps, NEXT, BEFORE_NEXT), 10).map((s) => [s.day, s.start, s.end]),
    [
      ['lun', 9, 10],
      ['lun', 11, 12],
      ['lun', 21, 22],
      ['mar', 8, 9],
    ],
    'non si uniscono ore separate né giorni diversi',
  );
});

test('bestSlots ranks by most free, then fewest busy or unknown, then earliest', () => {
  const people = [
    { id: ME, data: { busy: busyExcept({ lun: [9], mar: [18], gio: [9] }) } },
    { id: OTHER, data: { busy: busyExcept({ lun: [9], mar: [18], gio: [9] }) } },
    { id: ADVISOR, data: { busy: busyExcept({ mar: [18] }), until: addDays(NEXT, 2) } },
  ];
  // Un impegnato e uno di cui non si sa pesano uguale: vince il giorno prima.
  assert.deepEqual(
    bestSlots(teamGrid(people, NEXT, BEFORE_NEXT)).map((s) => [s.day, s.start, s.free.length, s.busy.length, s.unknown.length]),
    [
      ['mar', 18, 3, 0, 0],
      ['lun', 9, 2, 1, 0],
      ['gio', 9, 2, 0, 1],
    ],
  );
  const gio = bestSlots(teamGrid(people, NEXT, BEFORE_NEXT))[2];
  assert.deepEqual(gio, { day: 'gio', date: addDays(NEXT, 3), start: 9, end: 10, free: [ME, OTHER], busy: [], unknown: [ADVISOR] });

  const ties = [
    { id: ME, data: { busy: busyExcept({ lun: [15, 9], mer: [8] }) } },
    { id: OTHER, data: { busy: busyExcept({ lun: [15, 9], mer: [8] }) } },
  ];
  const grid = teamGrid(ties, NEXT, BEFORE_NEXT);
  assert.deepEqual(
    bestSlots(grid).map((s) => [s.day, s.start]),
    [
      ['lun', 9],
      ['lun', 15],
      ['mer', 8],
    ],
  );
  assert.equal(bestSlots(grid, 1).length, 1);
  assert.equal(bestSlots(grid, 2).length, 2);
  assert.equal(bestSlots(grid, 10).length, 3);
  assert.deepEqual(bestSlots(grid, 0), []);
});

const handCell = (day, date, hour, free, busy = [], unknown = []) => ({ day, date, hour, past: false, free, busy, unknown });

test('bestSlots breaks ties on busy plus unknown and splits a block when the unknown people change', () => {
  const ties = [
    [handCell('lun', '2026-11-09', 9, [ME, OTHER], [], [ADVISOR])],
    [handCell('mar', '2026-11-10', 9, [ME, OTHER], [ADVISOR])],
    [handCell('mer', '2026-11-11', 9, [ME, OTHER])],
  ];
  assert.deepEqual(
    bestSlots(ties).map((s) => [s.day, s.busy.length + s.unknown.length]),
    [
      ['mer', 0],
      ['lun', 1],
      ['mar', 1],
    ],
  );

  const column = [
    handCell('lun', '2026-11-09', 9, [ME, OTHER], [], [ADVISOR]),
    handCell('lun', '2026-11-09', 10, [ME, OTHER]),
    handCell('lun', '2026-11-09', 11, [ME, OTHER]),
  ];
  assert.deepEqual(bestSlots([column]), [
    { day: 'lun', date: '2026-11-09', start: 10, end: 12, free: [ME, OTHER], busy: [], unknown: [] },
    { day: 'lun', date: '2026-11-09', start: 9, end: 10, free: [ME, OTHER], busy: [], unknown: [ADVISOR] },
  ]);
});

test('bestSlots wants at least two free people unless fewer are counted', () => {
  const lonely = [
    { id: ME, data: { busy: busyExcept({ lun: [9] }) } },
    { id: OTHER, data: { busy: busyExcept({}) } },
    { id: ADVISOR, data: { busy: busyExcept({}) } },
  ];
  assert.deepEqual(bestSlots(teamGrid(lonely, NEXT, BEFORE_NEXT)), []);
  assert.deepEqual(bestSlots(teamGrid(lonely.slice(0, 2), NEXT, BEFORE_NEXT)), []);

  const single = [{ id: ME, data: { busy: {} } }];
  assert.deepEqual(
    bestSlots(teamGrid(single, NEXT, BEFORE_NEXT)).map((s) => [s.day, s.start, s.end, s.free]),
    [
      ['lun', 8, 22, [ME]],
      ['mar', 8, 22, [ME]],
      ['mer', 8, 22, [ME]],
    ],
  );
  const withUnknown = [...single, { id: OTHER, data: null }, { id: ADVISOR, data: { busy: {}, until: addDays(NEXT, -1) } }];
  const shape = (slots) => slots.map((s) => [s.day, s.date, s.start, s.end, s.free, s.busy]);
  const alone = bestSlots(teamGrid(single, NEXT, BEFORE_NEXT));
  const unsure = bestSlots(teamGrid(withUnknown, NEXT, BEFORE_NEXT));
  assert.deepEqual(shape(unsure), shape(alone));
  assert.deepEqual(
    alone.map((s) => s.unknown),
    [[], [], []],
  );
  assert.deepEqual(
    unsure.map((s) => s.unknown),
    [
      [OTHER, ADVISOR],
      [OTHER, ADVISOR],
      [OTHER, ADVISOR],
    ],
  );
});

test('bestSlots is empty when nobody is counted or every hour is past', () => {
  assert.deepEqual(bestSlots(teamGrid([], NEXT, BEFORE_NEXT)), []);
  assert.deepEqual(bestSlots(teamGrid([{ id: ME, data: null }, { id: OTHER, data: null }], NEXT, BEFORE_NEXT)), []);
  assert.deepEqual(bestSlots(teamGrid([{ id: ME, data: { busy: {}, until: addDays(NEXT, -1) } }], NEXT, BEFORE_NEXT)), []);
  assert.deepEqual(bestSlots(teamGrid([{ id: ME, data: { busy: busyExcept({}) } }, { id: OTHER, data: { busy: busyExcept({}) } }], NEXT, BEFORE_NEXT)), []);
  assert.deepEqual(bestSlots([]), []);

  const free = [
    { id: ME, data: { busy: {} } },
    { id: OTHER, data: { busy: {} } },
  ];
  assert.deepEqual(bestSlots(teamGrid(free, NEXT, at(LATER, 0))), []);
  assert.deepEqual(bestSlots(teamGrid(free, addDays(CURRENT, -7))), []);
  const first = bestSlots(teamGrid(free, NEXT, at(NEXT, 10, 30)))[0];
  assert.deepEqual([first.day, first.start, first.end], ['lun', 11, 22], 'si parte dalla prima ora non ancora iniziata');
});

test('the availability kind is a personal item outside the boards and the ideas', () => {
  assert.ok(KINDS.availability);
  assert.equal(KINDS.availability.statuses, null);
  assert.equal(KINDS.availability.icon, 'calendar');
  assert.deepEqual(KINDS.availability.fields, []);
  for (const list of [BOARD_KINDS, IDEA_CHILD_KINDS, EXPENSE_KINDS]) assert.equal(list.includes('availability'), false);
  assert.equal(routeFor({ kind: 'availability', id: ITEM, data: {} }), '#/squadra/disponibilita');
});

test('sanitizeSnapshot cleans availability data with sanitizeAvailability', () => {
  const clean = sanitizeSnapshot('availability', {
    title: '  Impegni  ',
    status: 'aperto',
    idea_id: IDEA,
    data: {
      busy: { lun: [10, 9, 9, 24], xyz: [1] },
      until: '2026-02-31',
      weeks: [
        { key: NEXT, busy: { mar: ['9'] } },
        { key: addDays(NEXT, 2), busy: {} },
      ],
      extra: true,
    },
  });
  assert.deepEqual(clean, { title: 'Impegni', status: null, idea_id: null, data: { busy: { lun: [9, 10] }, weeks: [{ key: NEXT, busy: {} }] } });
  assert.equal(snapshotProblem('availability', clean), null);

  const blank = { title: '', status: null, idea_id: null, data: { busy: {} } };
  assert.deepEqual(sanitizeSnapshot('availability', {}), blank);
  assert.deepEqual(sanitizeSnapshot('availability', null), blank);
  assert.deepEqual(sanitizeSnapshot('availability', { data: 'garbage' }), blank);
  assert.deepEqual(sanitizeSnapshot('availability', { data: [{ busy: { lun: [9] } }] }), blank);
  assert.equal(snapshotProblem('availability', blank), null, 'il titolo non serve');
});

test('availability history paths have readable Italian labels', () => {
  assert.equal(describePath('availability', 'title'), 'Titolo');
  assert.equal(describePath('availability', 'data.busy'), 'Orario tipo');
  assert.equal(describePath('availability', 'data.busy.lun'), 'Orario tipo › lunedì');
  assert.equal(describePath('availability', 'data.busy.dom'), 'Orario tipo › domenica');
  assert.equal(describePath('availability', 'data.until'), "Scadenza dell'orario tipo");
  assert.equal(describePath('availability', 'data.weeks.#order'), 'Settimane con un orario diverso');
  assert.equal(describePath('availability', 'data.weeks#2026-11-09.busy.mar'), 'Settimana del 9 nov › martedì');
  assert.equal(describePath('availability', 'data.weeks#2026-12-28.busy'), 'Settimana del 28 dic');
  assert.equal(describePath('availability', 'data.weeks#2027-01-11.busy.gio'), "Settimana dell'11 gen › giovedì");
  assert.equal(describePath('availability', 'data.weeks#2027-02-01.busy'), "Settimana dell'1 feb");
  assert.equal(describePath('availability', 'data.weeks#2027-02-08.busy.lun'), "Settimana dell'8 feb › lunedì");
  assert.equal(describePath('availability', 'data.weeks#2027-01-18.busy'), 'Settimana del 18 gen');
});

test('availability history values show dates and hour ranges', () => {
  assert.equal(formatValue('availability', 'data.until', '2026-12-31'), '31 dic 2026');
  assert.deepEqual(formatValue('availability', 'data.weeks.#order', '2026-11-09,2026-11-16'), ['settimana del 9 nov', 'settimana del 16 nov']);
  assert.deepEqual(formatValue('availability', 'data.weeks.#order', ''), []);
  assert.deepEqual(formatValue('availability', 'data.weeks.#order', '2027-01-11,2027-02-08,2027-02-15'), [
    "settimana dell'11 gen",
    "settimana dell'8 feb",
    'settimana del 15 feb',
  ]);
  assert.equal(formatValue('availability', 'data.busy.lun', [9, 10, 11, 15]), '9-12, 15-16');
  assert.equal(formatValue('availability', 'data.weeks#2026-11-09.busy.mar', [21]), '21-22');
  assert.equal(formatValue('availability', 'data.busy.lun', null), '');
  assert.equal(formatValue('availability', 'data.busy.lun', undefined), '');
});

test('every path of an availability diff gets a label and a readable value', () => {
  const before = sanitizeSnapshot('availability', { title: 'Impegni', data: { busy: { lun: [9] } } });
  const after = sanitizeSnapshot('availability', {
    title: 'Impegni',
    data: { busy: { lun: [9, 10], mar: [15] }, until: '2026-12-31', weeks: [{ key: NEXT, busy: { mer: [8, 9] } }] },
  });
  const changes = diffSnapshots(before, after);
  assert.deepEqual(changes.map((c) => c.path).sort(), ['data.busy.lun', 'data.busy.mar', 'data.until', `data.weeks#${NEXT}.busy.mer`, 'data.weeks.#order']);
  const labels = Object.fromEntries(changes.map((c) => [c.path, describePath('availability', c.path)]));
  assert.equal(labels['data.busy.mar'], 'Orario tipo › martedì');
  assert.equal(labels[`data.weeks#${NEXT}.busy.mer`], `Settimana del ${shortDate(NEXT)} › mercoledì`);
  const values = Object.fromEntries(changes.map((c) => [c.path, formatValue('availability', c.path, c.after)]));
  assert.equal(values['data.busy.lun'], '9-11');
  assert.equal(values[`data.weeks#${NEXT}.busy.mer`], '8-10');
  assert.deepEqual(values['data.weeks.#order'], [`settimana del ${shortDate(NEXT)}`]);
});

test('availability history labels and values do not throw on a malformed week key', () => {
  assert.doesNotThrow(() => describePath('availability', 'data.weeks#garbage.busy.mar'));
  assert.doesNotThrow(() => formatValue('availability', 'data.weeks.#order', 'garbage'));
  assert.equal(describePath('availability', 'data.weeks#garbage.busy.mar'), 'Settimana del garbage › martedì');
  assert.equal(describePath('availability', 'data.weeks#2026-02-31.busy'), 'Settimana del 2026-02-31');
  assert.deepEqual(formatValue('availability', 'data.weeks.#order', 'garbage'), ['settimana del garbage']);
  assert.deepEqual(formatValue('availability', 'data.weeks.#order', '2026-11-09,2026-13-02'), ['settimana del 9 nov', 'settimana del 2026-13-02']);
  assert.equal(formatValue('availability', 'data.until', 'garbage'), '');
  assert.deepEqual(formatValue('availability', 'data.weeks', [{ key: 'garbage', busy: { lun: [9] } }]), ['settimana del garbage (lunedì 9-10)']);
  assert.doesNotThrow(() => formatValue('availability', 'data.weeks', [null, 'x', 42, [], { key: 42, busy: 'x' }, {}]));
});

test('a conflict on the whole weeks array lists every week with its busy hours', () => {
  assert.deepEqual(
    formatValue('availability', 'data.weeks', [
      { key: '2026-11-09', busy: { mer: [15], lun: [11, 9, 10] } },
      { key: '2027-02-08', busy: { dom: [21] } },
      { key: '2026-12-07', busy: {} },
    ]),
    ['settimana del 9 nov (lunedì 9-12; mercoledì 15-16)', "settimana dell'8 feb (domenica 21-22)", 'settimana del 7 dic (nessun impegno)'],
  );
  assert.deepEqual(formatValue('availability', 'data.weeks', []), []);
  // Ore e giorni non validi si ignorano come nel salvataggio.
  assert.deepEqual(
    formatValue('availability', 'data.weeks', [
      { key: '2026-11-16', busy: { lun: ['9', 24], xyz: [9], mar: [8] } },
      { key: '2026-11-23', busy: 'garbage' },
    ]),
    ['settimana del 16 nov (martedì 8-9)', 'settimana del 23 nov (nessun impegno)'],
  );
});

test('availability history turns into hour ranges only arrays of whole numbers', () => {
  assert.equal(formatValue('availability', 'data.busy.lun', [9, 10]), '9-11');
  assert.equal(formatValue('availability', 'data.busy.lun', []), '');
  assert.deepEqual(formatValue('availability', 'data.busy.lun', ['9', 10]), ['9', 10]);
  assert.deepEqual(formatValue('availability', 'data.busy.lun', [9.5]), [9.5]);
  assert.deepEqual(formatValue('availability', 'data.weeks#2026-11-09.busy.mar', [9, null]), [9, null]);
  assert.deepEqual(formatValue('availability', 'data.weeks#2026-11-09.busy.mar', [{ hour: 9 }]), [{ hour: 9 }]);
});
