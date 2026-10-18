import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clone,
  dayKey,
  dayLabel,
  daysUntil,
  debounce,
  fmtDate,
  fmtDateTime,
  fmtRelative,
  initials,
  plural,
  shortId,
  slugFile,
  truncate,
} from '../../assets/js/lib/format.js';

const NOW = new Date('2026-10-18T12:00:00');

test('fmtRelative speaks Italian and treats recent moments as now', () => {
  assert.equal(fmtRelative(new Date(NOW.getTime() - 10 * 1000), NOW), 'adesso');
  assert.equal(fmtRelative(new Date(NOW.getTime() - 5 * 60 * 1000), NOW), '5 minuti fa');
  assert.equal(fmtRelative(new Date(NOW.getTime() - 2 * 3600 * 1000), NOW), '2 ore fa');
  assert.equal(fmtRelative(new Date(NOW.getTime() - 24 * 3600 * 1000), NOW), 'ieri');
  assert.equal(fmtRelative('non una data', NOW), '');
});

test('dates are formatted in Italian and plain dates are not shifted by time zones', () => {
  assert.match(fmtDate('2026-10-16'), /16 ott 2026/);
  assert.match(fmtDateTime('2026-10-16T09:05:00'), /16\/10\/2026/);
  assert.equal(fmtDate('boh'), '');
  assert.equal(dayKey('2026-10-16'), '2026-10-16');
});

test('dayLabel names today and yesterday', () => {
  assert.equal(dayLabel('2026-10-18', NOW), 'Oggi');
  assert.equal(dayLabel('2026-10-17', NOW), 'Ieri');
  assert.match(dayLabel('2026-10-01', NOW), /1 ott 2026/);
});

test('daysUntil counts calendar days', () => {
  assert.equal(daysUntil('2026-10-20', NOW), 2);
  assert.equal(daysUntil('2026-10-18', NOW), 0);
  assert.equal(daysUntil('2026-10-15', NOW), -3);
  assert.equal(daysUntil('mai', NOW), null);
});

test('small helpers', () => {
  assert.equal(initials('Mario Rossi'), 'MR');
  assert.equal(initials('Anna'), 'AN');
  assert.equal(initials(''), '?');
  assert.equal(plural(1, 'idea', 'idee'), '1 idea');
  assert.equal(plural(3, 'idea', 'idee'), '3 idee');
  assert.equal(truncate('abcdef', 4), 'abc…');
  assert.equal(truncate('abc', 4), 'abc');
  assert.equal(slugFile('Prima idea di prova!'), 'prima-idea-di-prova');
  assert.equal(slugFile(''), 'documento');
  assert.match(shortId(), /^[a-z0-9]{10}$/);
  assert.notEqual(shortId(), shortId());
  const original = { a: { b: 1 } };
  const copy = clone(original);
  copy.a.b = 2;
  assert.equal(original.a.b, 1);
  assert.equal(clone(undefined), undefined);
});

test('debounce runs once after the last call and can be cancelled', async () => {
  let calls = 0;
  const fn = debounce(() => calls++, 10);
  fn();
  fn();
  fn();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls, 1);
  fn();
  fn.cancel();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls, 1);
});
