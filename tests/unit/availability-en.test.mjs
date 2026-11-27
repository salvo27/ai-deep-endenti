import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';

// Su un dispositivo in inglese: la lingua si decide quando il sito si carica, per questo i moduli arrivano dopo la scelta.
useLanguage('en');
const av = await import('../../assets/js/availability.js');
const { language } = await import('../../assets/js/i18n/index.js');

describe('giorni e settimane in inglese', () => {
  it('il sito è in inglese', () => {
    assert.equal(language, 'en');
  });

  it('le chiavi dei giorni restano quelle salvate, i nomi sono inglesi', () => {
    assert.deepEqual(av.DAY_KEYS, ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']);
    const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    av.DAY_KEYS.forEach((key, i) => {
      assert.equal(av.dayName(key), names[i], key);
      assert.deepEqual(av.DAYS[i], [key, names[i]]);
    });
    assert.equal(av.dayName('xyz'), 'xyz', 'una chiave sconosciuta resta com è');
  });

  it('ogni giorno ha anche il nome breve inglese per le intestazioni', () => {
    assert.deepEqual(av.DAY_KEYS.map(av.dayShort), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    assert.equal(av.dayShort('xyz'), 'xyz');
  });

  it('la data breve ha il giorno prima del mese abbreviato', () => {
    for (const [key, expected] of [
      ['2026-11-09', '9 Nov'],
      ['2026-11-01', '1 Nov'],
      ['2028-02-29', '29 Feb'],
      ['2026-12-31', '31 Dec'],
    ]) assert.equal(av.shortDate(key), expected, key);
    assert.equal(av.shortDate('garbage'), 'garbage');
  });

  it('la settimana va dal lunedì alla domenica, senza articoli da apostrofare', () => {
    for (const [monday, expected] of [
      ['2026-11-09', '9 Nov to 15 Nov'],
      ['2027-02-01', '1 Feb to 7 Feb'],
      ['2027-02-08', '8 Feb to 14 Feb'],
      ['2027-01-11', '11 Jan to 17 Jan'],
      ['2026-10-26', '26 Oct to 1 Nov'],
      ['2026-12-28', '28 Dec to 3 Jan'],
    ]) assert.equal(av.weekLabel(monday), expected, monday);
  });

  it('una fascia oraria dice giorno, data e ore con i minuti', () => {
    assert.equal(av.slotLabel('2026-11-11', 9, 12), 'Wednesday 11 Nov, 9:00-12:00');
    assert.equal(av.slotLabel('2026-11-15', 21, 22), 'Sunday 15 Nov, 21:00-22:00');
    assert.equal(av.slotLabel('2026-11-09', 8, 22), 'Monday 9 Nov, 8:00-22:00');
  });

  it('un ora si legge da quando a quando, per i lettori di schermo', () => {
    assert.equal(av.hourSpan(8), 'from 8:00 to 9:00');
    assert.equal(av.hourSpan(21), 'from 21:00 to 22:00');
    assert.deepEqual(av.HOURS.map(av.hourSpan), av.HOURS.map((hour) => `from ${hour}:00 to ${hour + 1}:00`));
  });

  it('i nomi si elencano con and prima dell ultimo', () => {
    for (const [names, expected] of [
      [[], ''],
      [['Anna'], 'Anna'],
      [['Anna', 'Bruno'], 'Anna and Bruno'],
      [['Anna', 'Bruno', 'Chiara'], 'Anna, Bruno and Chiara'],
      [['Anna', 'Bruno', 'Chiara', 'Dario'], 'Anna, Bruno, Chiara and Dario'],
    ]) assert.equal(av.joinNames(names), expected, names.join('|'));
  });
});
