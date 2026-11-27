import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';

// On a device in English: the site language is decided when it loads, so the module is imported after the choice.
useLanguage('en');
const { dayLabel, fmtDate, fmtDateTime, fmtMoney, fmtPercent, fmtRelative } = await import('../../assets/js/lib/format.js');
const { language } = await import('../../assets/js/i18n/index.js');

const NOW = new Date('2026-10-18T12:00:00');

describe('date e numeri in inglese', () => {
  it('il sito è in inglese su un dispositivo in inglese', () => {
    assert.equal(language, 'en');
  });

  it('i momenti recenti sono adesso, gli altri si dicono in inglese', () => {
    assert.equal(fmtRelative(new Date(NOW.getTime() - 10 * 1000), NOW), 'just now');
    assert.equal(fmtRelative(new Date(NOW.getTime() - 5 * 60 * 1000), NOW), '5 minutes ago');
    assert.equal(fmtRelative(new Date(NOW.getTime() - 2 * 3600 * 1000), NOW), '2 hours ago');
    assert.equal(fmtRelative(new Date(NOW.getTime() - 24 * 3600 * 1000), NOW), 'yesterday');
  });

  it('le date hanno il giorno prima del mese e l ora a 24 ore', () => {
    assert.equal(fmtDate('2026-10-16'), '16 Oct 2026');
    assert.equal(fmtDateTime('2026-10-16T21:05:00'), '16/10/2026, 21:05');
  });

  it('oggi e ieri hanno il loro nome', () => {
    assert.equal(dayLabel('2026-10-18', NOW), 'Today');
    assert.equal(dayLabel('2026-10-17', NOW), 'Yesterday');
    assert.equal(dayLabel('2026-10-01', NOW), '1 Oct 2026');
  });

  it('gli importi hanno l euro davanti, la virgola per le migliaia e le abbreviazioni inglesi', () => {
    assert.equal(fmtMoney(1234), '€1,234');
    assert.equal(fmtMoney(2_300_000), '€2.3m');
    assert.equal(fmtMoney(1_500_000_000), '€1.5bn');
    assert.equal(fmtMoney(Number.NaN), '');
    assert.equal(fmtPercent(12.25), '12.3%');
  });
});
