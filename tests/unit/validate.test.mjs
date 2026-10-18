import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanLine,
  cleanText,
  intInRange,
  isEmail,
  isHexColor,
  isIsoDate,
  isKey,
  isTotpCode,
  isUuid,
  passwordProblem,
  slugKey,
  uniqueStrings,
  uniqueUuids,
} from '../../assets/js/lib/validate.js';

const UUID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

test('isUuid accepts only well formed uuids', () => {
  assert.equal(isUuid(UUID), true);
  assert.equal(isUuid(UUID.toUpperCase()), true);
  for (const bad of ['', 'abc', `${UUID}x`, `idea_id.eq.${UUID}`, null, 42, `${UUID},item_id.eq.x`]) {
    assert.equal(isUuid(bad), false, String(bad));
  }
});

test('cleanText strips control characters, normalizes newlines and trims', () => {
  assert.equal(cleanText('  ciao\r\nmondo\u0000\u0007 '), 'ciao\nmondo');
  assert.equal(cleanText('\tindentato'), 'indentato');
  assert.equal(cleanText(42), '');
  assert.equal(cleanText('x'.repeat(50), 10).length, 10);
});

test('cleanLine collapses newlines into a single line within the limit', () => {
  assert.equal(cleanLine('riga uno\n\n  riga due'), 'riga uno riga due');
  assert.equal(cleanLine('a'.repeat(400), 300).length, 300);
});

test('isIsoDate rejects impossible dates and other formats', () => {
  assert.equal(isIsoDate('2026-10-18'), true);
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('18/10/2026'), false);
  assert.equal(isIsoDate('2026-10-18T10:00:00Z'), false);
});

test('intInRange accepts integers and numeric strings in range only', () => {
  assert.equal(intInRange(3, 1, 5), 3);
  assert.equal(intInRange('4', 1, 5), 4);
  assert.equal(intInRange(0, 1, 5), null);
  assert.equal(intInRange(2.5, 1, 5), null);
  assert.equal(intInRange('', 1, 5), null);
  assert.equal(intInRange('3; drop', 1, 5), null);
});

test('uniqueStrings removes duplicates ignoring case and caps size', () => {
  assert.deepEqual(uniqueStrings(['LLM', 'llm', ' XAI ', '', 7]), ['LLM', 'XAI']);
  assert.equal(uniqueStrings(Array.from({ length: 50 }, (_, i) => `t${i}`)).length, 20);
  assert.deepEqual(uniqueStrings('non array'), []);
});

test('uniqueUuids keeps only distinct valid uuids', () => {
  assert.deepEqual(uniqueUuids([UUID, UUID, 'x', null]), [UUID]);
});

test('colors, emails, keys and totp codes are validated by format', () => {
  assert.equal(isHexColor('#4f5bd5'), true);
  assert.equal(isHexColor('red'), false);
  assert.equal(isEmail('nome@esempio.it'), true);
  assert.equal(isEmail('nome@esempio'), false);
  assert.equal(isKey('mercato'), true);
  assert.equal(isKey('Mercato'), false);
  assert.equal(isKey('__proto__'), false);
  assert.equal(isTotpCode('123456'), true);
  assert.equal(isTotpCode('12345'), false);
  assert.equal(isTotpCode('12a456'), false);
});

test('slugKey turns labels into safe keys', () => {
  assert.equal(slugKey('Semplicità normativa!'), 'semplicita-normativa');
  assert.equal(slugKey('***'), 'voce');
  assert.equal(isKey(slugKey('Tempo ai primi ricavi')), true);
});

test('passwordProblem enforces length, character mix and confirmation', () => {
  assert.match(passwordProblem('Corta1'), /12 caratteri/);
  assert.match(passwordProblem('tuttominuscole123'), /maiuscole/);
  assert.match(passwordProblem('Lunga-Abbastanza1', 'Diversa-Abbastanza1'), /non coincidono/);
  assert.match(passwordProblem(`${'A'.repeat(130)}a1`), /128/);
  assert.equal(passwordProblem('Lunga-Abbastanza1', 'Lunga-Abbastanza1'), null);
});
