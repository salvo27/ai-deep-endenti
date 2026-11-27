import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generator as italiano } from '../../assets/js/i18n/it/generator.js';
import { generator as english } from '../../assets/js/i18n/en/generator.js';

describe('idee nate da una cella del generatore', () => {
  for (const [texts, cases] of [
    [italiano, [[1, '1 idea'], [2, '2 idee'], [11, '11 idee']]],
    [english, [[1, '1 idea'], [2, '2 ideas'], [11, '11 ideas']]],
  ]) {
    for (const [n, expected] of cases) {
      it(`${n} diventa «${expected}», al singolare solo per una`, () => {
        assert.equal(texts.ideasCount(n), expected);
      });
    }
  }
});
