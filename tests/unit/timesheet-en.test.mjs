import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';

// Su un dispositivo in inglese: la lingua si decide quando il sito si carica, per questo i moduli arrivano dopo la scelta.
useLanguage('en');
const ts = await import('../../assets/js/timesheet.js');
const { thisMonday } = await import('../../assets/js/availability.js');

const WEEK = thisMonday();
const row = (id, day, start, end) => ({ id, day, start, end, area: 'prodotto' });

describe('ore lavorate in inglese', () => {
  it('le aree restano le chiavi salvate, con il nome intero e quello breve in inglese', () => {
    assert.deepEqual(ts.AREA_KEYS, ['prodotto', 'clienti', 'numeri', 'ricerca', 'altro']);
    for (const [key, long, short] of [
      ['prodotto', 'Product and technology', 'Product'],
      ['clienti', 'Customers and sales', 'Customers'],
      ['numeri', 'Finance and admin', 'Finance'],
      ['ricerca', 'Research and interviews', 'Research'],
      ['altro', 'Other', 'Other'],
    ]) {
      assert.equal(ts.areaLabel(key), long, key);
      assert.equal(ts.areaShort(key), short, key);
      assert.ok(long.startsWith(short), `${key}: il nome breve è l inizio di quello intero`);
    }
    assert.deepEqual(ts.AREAS.map(([key]) => key), ts.AREA_KEYS);
  });

  it('un area sconosciuta diventa Other', () => {
    for (const value of ['marketing', 'Product', '', null, undefined, 42]) {
      assert.equal(ts.areaLabel(value), 'Other', String(value));
      assert.equal(ts.areaShort(value), 'Other', String(value));
    }
  });

  it('i totali per area hanno il nome inglese', () => {
    assert.deepEqual(ts.areaTotals([row('a', 'lun', 540, 600), { ...row('b', 'mar', 540, 660), area: 'ricerca' }]), [
      { area: 'ricerca', label: 'Research and interviews', minutes: 120 },
      { area: 'prodotto', label: 'Product and technology', minutes: 60 },
    ]);
  });

  it('le durate si scrivono in ore e minuti brevi', () => {
    for (const [minutes, expected] of [
      [0, '0h'],
      [15, '15m'],
      [45, '45m'],
      [60, '1h'],
      [65, '1h 05m'],
      [150, '2h 30m'],
      [4800, '80h'],
    ]) assert.equal(ts.durationText(minutes), expected, String(minutes));
  });

  it('i problemi di una settimana si spiegano in inglese', () => {
    assert.equal(ts.timesheetProblem({ entries: [] }), 'The week is missing.');
    assert.equal(ts.timesheetProblem({ week: WEEK, entries: [] }), null);
    assert.equal(
      ts.timesheetProblem({ week: WEEK, entries: [row('a', 'lun', 900, 1020), row('b', 'lun', 960, 1080)] }),
      'On Monday two rows overlap: 15:00-17:00 and 16:00-18:00.',
    );
    assert.equal(
      ts.timesheetProblem({ week: WEEK, entries: [row('a', 'dom', 1380, 1440), row('b', 'dom', 1395, 1410)] }),
      'On Sunday two rows overlap: 23:00-00:00 and 23:15-23:30.',
    );
    const tooMany = Array.from({ length: ts.MAX_ENTRIES + 1 }, (_, i) => row(`r${i}`, 'lun', 0, 15));
    assert.equal(ts.timesheetProblem({ week: WEEK, entries: tooMany }), `A week can hold at most ${ts.MAX_ENTRIES} rows.`);
  });
});
