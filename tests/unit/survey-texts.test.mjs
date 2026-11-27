// The texts of the public survey page (q.html), which loads nothing of the site and so has its own text module:
// the same entries in both languages, written as carefully as the site's, and the language of the respondent's device.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { italianWords } from '../setup/italian.mjs';
import { deviceLanguage, en, it as italiano, language, locale, pageLanguage, texts, textsFor } from '../../assets/js/public/texts.js';
import { minutesLabel } from '../../assets/js/public/survey-time.js';

const ALL = { it: italiano, en };

function entries(value, path = '') {
  if (Array.isArray(value)) return value.flatMap((entry, i) => entries(entry, `${path}[${i}]`));
  if (typeof value === 'object' && value !== null) return Object.entries(value).flatMap(([name, entry]) => entries(entry, path ? `${path}.${name}` : name));
  return [[path, value]];
}

const shape = (value) =>
  entries(value)
    .map(([path, entry]) => `${path.replace(/\[\d+\]/g, '[]')}: ${typeof entry}`)
    .filter((line, i, all) => all.indexOf(line) === i)
    .sort();

// The ways the page calls its text functions: counts (0 also stands for "no date"), a pair of bounds, three numbers,
// a label, a date.
const TRIES = [[0], [1], [2], [25], [1, 4], [1, 4, 7], ['Altro'], ['27/11/2026']];

// What each text says for every way it can be called, so the functions are checked like the plain texts.
function outputs(value) {
  return entries(value).flatMap(([path, entry]) => {
    if (typeof entry !== 'function') return [[path, entry]];
    return TRIES.map((args) => {
      try {
        return [`${path}(${args.join(', ')})`, entry(...args)];
      } catch {
        return [path, ''];
      }
    }).filter(([, out]) => typeof out === 'string' && out);
  });
}

describe('testi della pagina pubblica', () => {
  it('l inglese ha le stesse voci dell italiano, che fa da riferimento', () => {
    assert.deepEqual(shape(en), shape(italiano));
  });

  for (const lang of ['it', 'en']) {
    it(`in ${lang} non hanno trattini lunghi né spazi ai bordi o doppi`, () => {
      const bad = outputs(ALL[lang]).filter(([, text]) => /[—–]/.test(text) || text !== text.trim() || /\S {2,}\S/.test(text));
      assert.deepEqual(bad.map(([path]) => path), []);
    });

    it(`in ${lang} ogni funzione dà un testo per almeno uno dei modi in cui la pagina la chiama`, () => {
      const mute = entries(ALL[lang])
        .filter(([, entry]) => typeof entry === 'function')
        .filter(([, entry]) => !TRIES.some((args) => {
          try {
            const out = entry(...args);
            return typeof out === 'string' && out.length > 0;
          } catch {
            return false;
          }
        }))
        .map(([path]) => path);
      assert.deepEqual(mute, []);
    });
  }

  it('nessuna frase inglese è rimasta uguale all italiano', () => {
    const english = new Map(outputs(en));
    const same = outputs(italiano).filter(([path, text]) => /\s/.test(text) && english.get(path) === text);
    assert.deepEqual(same.map(([path]) => path), []);
  });

  it('nei testi inglesi non resta italiano, nemmeno in quelli costruiti con un numero', () => {
    const found = outputs(en).filter(([path]) => !path.includes('(Altro)')).flatMap(([path, text]) => italianWords(text).map((word) => `${path}: ${word}`));
    assert.deepEqual(found, []);
  });

  it('i testi inglesi sono tutti diversi dagli italiani, non copiati', () => {
    assert.notEqual(textsFor('en'), textsFor('it'));
    assert.equal(textsFor('it'), italiano);
    assert.equal(textsFor('xx'), en, 'una lingua sconosciuta dà l inglese');
  });
});

describe('lingua di chi risponde', () => {
  for (const [nav, expected] of [
    [{ languages: ['it'] }, 'it'],
    [{ languages: ['it-IT', 'en-US'] }, 'it'],
    [{ languages: ['IT-ch'] }, 'it'],
    [{ language: 'it-IT' }, 'it'],
    [{ languages: [], language: 'it-IT' }, 'it'],
    [{ languages: ['en-US'] }, 'en'],
    [{ languages: ['en-GB', 'it-IT'] }, 'en'],
    [{ languages: ['fr-FR', 'it-IT'] }, 'en'],
    [{ languages: ['de'] }, 'en'],
    [{}, 'en'],
    [null, 'en'],
    [{ languages: [null] }, 'en'],
  ]) {
    it(`${JSON.stringify(nav)} diventa ${expected}: conta solo la prima lingua del dispositivo`, () => {
      assert.equal(deviceLanguage(nav), expected);
    });
  }

  it('nei test è l italiano, fissato dalla preparazione dei test', () => {
    assert.equal(language, 'it');
    assert.equal(locale, 'it-IT');
    assert.equal(texts, italiano);
  });

  it('la lingua dichiarata dalla pagina vale più del dispositivo, così sito e pagina pubblica parlano la loro', () => {
    const doc = (lang) => ({ documentElement: { lang } });
    const english = { languages: ['en-GB'] };
    assert.equal(pageLanguage(doc('it'), english), 'it');
    assert.equal(pageLanguage(doc('it-IT'), english), 'it');
    assert.equal(pageLanguage(doc('en'), { languages: ['it-IT'] }), 'en');
    for (const lang of ['', 'fr', undefined]) assert.equal(pageLanguage(doc(lang), english), 'en', String(lang));
    assert.equal(pageLanguage(undefined, { languages: ['it'] }), 'it');
  });
});

describe('durata in minuti', () => {
  for (const [minutes, lang, expected] of [
    [1, 'it', 'circa 1 minuto'],
    [4, 'it', 'circa 4 minuti'],
    [1, 'en', 'about 1 minute'],
    [4, 'en', 'about 4 minutes'],
    [25, 'en', 'about 25 minutes'],
  ]) {
    it(`${minutes} in ${lang} si scrive «${expected}»`, () => {
      assert.equal(minutesLabel(minutes, lang), expected);
    });
  }

  it('senza lingua usa quella della pagina', () => {
    const saved = globalThis.document;
    try {
      globalThis.document = { documentElement: { lang: 'en' } };
      assert.equal(minutesLabel(2), 'about 2 minutes');
      globalThis.document = undefined;
      assert.equal(minutesLabel(2), 'circa 2 minuti', 'senza pagina conta il dispositivo');
    } finally {
      globalThis.document = saved;
    }
  });
});

describe('messaggi del database', () => {
  it('ogni messaggio di errore che il database manda alla pagina ha la sua traduzione', () => {
    const schema = readFileSync(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');
    const sent = [...new Set([...schema.matchAll(/survey_error\('((?:[^']|'')*)'/g)].map((m) => m[1].replace(/''/g, '\'')))];
    assert.ok(sent.length > 10, 'messaggi trovati nello schema');
    const known = new Set(Object.values(italiano.server));
    assert.deepEqual(sent.filter((message) => !known.has(message)), [], 'aggiungi il messaggio a server in assets/js/public/texts.js');
  });
});
