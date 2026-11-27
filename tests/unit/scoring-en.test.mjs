import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';

// On a device in English: the language is decided when the site loads, so the module is imported after the choice.
useLanguage('en');
const { ranking } = await import('../../assets/js/scoring.js');

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const criteria = [{ key: 'market', label: 'Market', weight: 1 }];
const scores = [{ created_by: 'u1', data: { scores: { [A]: { market: 4 }, [B]: { market: 4 } } } }];
const ideas = [
  { id: A, title: 'Zebra' },
  { id: B, title: 'apple' },
  { id: C, title: 'Mango' },
  { id: D, title: 'banana' },
];

describe('classifica in inglese', () => {
  const original = String.prototype.localeCompare;
  const locales = [];
  String.prototype.localeCompare = function compare(other, locale, options) {
    locales.push(locale);
    return original.call(this, other, locale, options);
  };
  after(() => {
    String.prototype.localeCompare = original;
  });

  it('a parità di punteggio, e senza voti, ordina i titoli con le regole dell inglese', () => {
    const order = ranking(ideas, criteria, scores).map((r) => r.idea.title);
    assert.deepEqual(order, ['apple', 'Zebra', 'banana', 'Mango']);
    assert.ok(locales.length > 0);
    assert.deepEqual([...new Set(locales)], ['en']);
  });
});
