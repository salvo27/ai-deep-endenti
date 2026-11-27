// The database never writes a sentence for people: every error is a snake_case code with a SQLSTATE (docs/PROGETTI.md,
// «Errori»), and the site puts it into words. The codes of raise exception have their texts in assets/js/i18n/*/server-errors.js;
// the reasons of survey_error, shown on the public survey page, in assets/js/public/texts.js (the page loads nothing of the site).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { serverErrors as italiano } from '../../assets/js/i18n/it/server-errors.js';
import { serverErrors as english } from '../../assets/js/i18n/en/server-errors.js';
import { en as surveyEn, it as surveyIt } from '../../assets/js/public/texts.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
// Whole comment lines are left out: they talk about the code, they do not run.
const schema = read('supabase/schema.sql').split('\n').filter((line) => !/^\s*--/.test(line)).join('\n');
const docs = read('docs/PROGETTI.md');

const CODE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const isCode = (value) => typeof value === 'string' && CODE.test(value);
const STATES = ['42501', '22023', 'P0001', 'P0002'];
const unquote = (text) => text.replace(/''/g, '\'');
const unique = (values) => [...new Set(values)].sort();

// Every raise exception of the schema: its message and the SQLSTATE of «using errcode», null when it has none.
const raises = [...schema.matchAll(/raise exception\s+'((?:[^']|'')*)'([^;]*);/g)].map(([, message, rest]) => ({
  message: unquote(message),
  state: rest.match(/errcode\s*=\s*'([0-9A-Z]{5})'/)?.[1] ?? null,
}));
const reasons = [...schema.matchAll(/survey_error\('((?:[^']|'')*)'/g)].map(([, reason]) => unquote(reason));
const raiseCodes = unique(raises.map(({ message }) => message));
const surveyCodes = unique(reasons);

// The table of the Errors section: | case | `SQLSTATE` | `code` |.
const documented = [...docs.matchAll(/^\|[^|\n]+\|\s*`([0-9A-Z]{5})`\s*\|\s*`([a-z_]+)`\s*\|\s*$/gm)].map(([, state, code]) => ({ state, code }));

describe('forma dei codici di errore', () => {
  for (const [value, expected] of [
    ['not_allowed', true],
    ['x', true],
    ['last_project_admin', true],
    ['timesheet_future_day', true],
    ['rls_disabled', true],
    ['Not_allowed', false],
    ['not allowed', false],
    ['not-allowed', false],
    ['_not_allowed', false],
    ['not_allowed_', false],
    ['not__allowed', false],
    ['1_code', false],
    ['codice è', false],
    ['Invio sconosciuto: %', false],
    ['', false],
    [null, false],
  ]) {
    it(`${JSON.stringify(value)} ${expected ? 'è' : 'non è'} un codice`, () => {
      assert.equal(isCode(value), expected);
    });
  }
});

describe('errori del database', () => {
  it('lo schema ha i suoi raise exception e i motivi di survey_error', () => {
    assert.ok(raises.length > 50, `raise exception trovati: ${raises.length}`);
    assert.ok(reasons.length > 30, `survey_error trovati: ${reasons.length}`);
  });

  it('ogni raise exception scrive un codice, mai una frase o un valore interpolato', () => {
    assert.deepEqual(raises.map(({ message }) => message).filter((message) => !isCode(message)), []);
  });

  it('ogni raise exception dice il suo SQLSTATE: permesso, valore non valido, regola violata o non trovato', () => {
    assert.deepEqual(raises.filter(({ state }) => !STATES.includes(state)).map(({ message, state }) => `${message} ${state}`), []);
  });

  it('un codice ha sempre lo stesso SQLSTATE, ovunque lo scriva lo schema', () => {
    const mixed = raiseCodes.filter((code) => unique(raises.filter(({ message }) => message === code).map(({ state }) => String(state))).length > 1);
    assert.deepEqual(mixed, []);
  });

  it('i codici della tabella in docs/PROGETTI.md restano quelli, con lo stesso SQLSTATE', () => {
    assert.ok(documented.length >= 8, `righe della tabella trovate: ${documented.length}`);
    for (const { state, code } of documented) {
      assert.ok(raiseCodes.includes(code), `${code} non è più nello schema`);
      assert.deepEqual(unique(raises.filter(({ message }) => message === code).map(({ state: s }) => s)), [state], code);
    }
  });

  for (const [lang, texts] of [['italiano', italiano], ['inglese', english]]) {
    it(`ogni codice di raise exception ha il suo testo in ${lang}`, () => {
      assert.deepEqual(raiseCodes.filter((code) => typeof texts[code] !== 'string' || !texts[code].trim()), []);
    });

    it(`ogni testo di server-errors.js in ${lang} ha un codice che lo schema scrive ancora`, () => {
      assert.deepEqual(Object.keys(texts).filter((code) => !raiseCodes.includes(code)), []);
    });
  }
});

describe('motivi della pagina pubblica dei questionari', () => {
  it('ogni motivo di survey_error è un codice, mai una frase', () => {
    assert.ok(surveyCodes.length > 15, `motivi trovati: ${surveyCodes.length}`);
    assert.deepEqual(surveyCodes.filter((code) => !isCode(code)), []);
  });

  for (const [lang, texts] of [['italiano', surveyIt], ['inglese', surveyEn]]) {
    it(`ogni motivo ha il suo testo in ${lang} nei testi della pagina`, () => {
      assert.deepEqual(surveyCodes.filter((code) => !Object.hasOwn(texts.server, code) || !texts.server[code].trim()), []);
    });

    it(`ogni testo dei motivi in ${lang} ha un codice che lo schema manda ancora`, () => {
      assert.deepEqual(Object.keys(texts.server).filter((code) => !surveyCodes.includes(code)), []);
    });
  }
});
