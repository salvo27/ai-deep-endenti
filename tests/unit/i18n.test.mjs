import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { en } from '../../assets/js/i18n/en/index.js';
import { it as italiano } from '../../assets/js/i18n/it/index.js';
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LANGUAGE_CHOICES,
  LANGUAGE_NAMES,
  LOCALES,
  deviceLanguage,
  isLanguage,
  isLanguageChoice,
  resolveLanguage,
} from '../../assets/js/i18n/languages.js';
import { applyDocumentLanguage, language, locale, saveLanguageChoice, storedChoice, textsFor, tx } from '../../assets/js/i18n/index.js';

const ALL = { it: italiano, en };

// Before main.js sets the language, and without JavaScript, the page says what it says in English, the default, and in
// Italian: screen readers and translators read the right language, and an Italian visitor is not left without words.
describe('pagina del sito prima dell avvio', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

  it('dichiara l inglese, la lingua predefinita', () => {
    assert.match(html, /<html lang="en">/);
  });

  it('il caricamento e il messaggio senza JavaScript sono in inglese e in italiano', () => {
    assert.match(html, /<span>Loading… <span lang="it">Caricamento…<\/span><\/span>/);
    assert.match(html, /<noscript><p>This site needs JavaScript\.<\/p><p lang="it">Questo sito ha bisogno di JavaScript\.<\/p><\/noscript>/);
  });
});

/** Every entry of a set of texts, with its path. */
function entries(texts, path = '') {
  if (Array.isArray(texts)) return texts.flatMap((entry, i) => entries(entry, `${path}[${i}]`));
  if (typeof texts === 'object' && texts !== null) return Object.entries(texts).flatMap(([name, entry]) => entries(entry, path ? `${path}.${name}` : name));
  return [[path, texts]];
}

/** The shape of a set of texts: the paths and the type of every entry, without the contents. */
const shape = (texts) =>
  entries(texts)
    .map(([path, entry]) => `${path.replace(/\[\d+\]/g, '[]')}: ${typeof entry}`)
    .filter((line, i, all) => all.indexOf(line) === i)
    .sort();

// Fake storage: the real one can be missing or throw (private windows, blocked site data).
function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k), data };
}
const broken = { getItem: () => { throw new Error('bloccato'); }, setItem: () => { throw new Error('bloccato'); }, removeItem: () => { throw new Error('bloccato'); } };

describe('lingua del dispositivo', () => {
  for (const [nav, expected] of [
    [{ languages: ['it'] }, 'it'],
    [{ languages: ['it-IT', 'en-US'] }, 'it'],
    [{ languages: ['IT-ch'] }, 'it'],
    [{ language: 'it-IT' }, 'it'],
    [{ languages: ['en-US'] }, 'en'],
    [{ languages: ['en-GB', 'it-IT'] }, 'en'],
    [{ languages: ['fr-FR', 'it-IT'] }, 'en'],
    [{ languages: ['de'] }, 'en'],
    [{ languages: [], language: 'it-IT' }, 'it'],
  ]) {
    it(`${JSON.stringify(nav)} diventa ${expected}`, () => {
      assert.equal(deviceLanguage(nav), expected);
    });
  }

  it('decide la prima lingua del dispositivo, non una qualsiasi dell elenco', () => {
    assert.equal(deviceLanguage({ languages: ['es-ES', 'it-IT'], language: 'it-IT' }), 'en');
  });

  it('senza una lingua leggibile si usa l inglese', () => {
    for (const nav of [null, undefined, {}, { language: 7 }, { languages: [null] }, { languages: 'it' }]) assert.equal(deviceLanguage(nav), DEFAULT_LANGUAGE);
    assert.equal(DEFAULT_LANGUAGE, 'en');
  });
});

describe('scelta della lingua', () => {
  it('accetta solo le lingue del sito e la scelta automatica', () => {
    assert.deepEqual(LANGUAGES, ['en', 'it']);
    assert.deepEqual(LANGUAGE_CHOICES, ['auto', 'en', 'it']);
    assert.ok(LANGUAGES.every(isLanguage));
    assert.ok(LANGUAGE_CHOICES.every(isLanguageChoice));
    for (const value of ['de', 'IT', '', null, 'automatica', 3, 'auto ']) assert.equal(isLanguageChoice(value), false, String(value));
    assert.equal(isLanguage('auto'), false);
  });

  it('una scelta esplicita vale più della lingua del dispositivo', () => {
    assert.equal(resolveLanguage('it', { languages: ['en-US'] }), 'it');
    assert.equal(resolveLanguage('en', { languages: ['it-IT'] }), 'en');
    assert.equal(resolveLanguage('auto', { languages: ['it-IT'] }), 'it');
    assert.equal(resolveLanguage('klingon', { languages: ['it-IT'] }), 'it');
  });

  it('ogni lingua ha il suo nome scritto nella lingua stessa e il suo formato di date e numeri', () => {
    assert.deepEqual(LANGUAGE_NAMES, { en: 'English', it: 'Italiano' });
    assert.deepEqual(Object.keys(LOCALES).sort(), [...LANGUAGES].sort());
    for (const tag of Object.values(LOCALES)) assert.doesNotThrow(() => new Intl.DateTimeFormat(tag));
  });

  it('la scelta salvata si rilegge, e una illeggibile vale come automatica', () => {
    assert.equal(storedChoice(storage({ lingua: 'it' })), 'it');
    assert.equal(storedChoice(storage({ lingua: 'en' })), 'en');
    assert.equal(storedChoice(storage({ lingua: 'fr' })), 'auto');
    assert.equal(storedChoice(storage()), 'auto');
    assert.equal(storedChoice(broken), 'auto');
    assert.equal(storedChoice(undefined), 'auto');
  });

  it('salvare automatica toglie la scelta, così il dispositivo torna a decidere', () => {
    const store = storage({ lingua: 'it' });
    assert.equal(saveLanguageChoice('auto', store), true);
    assert.equal(store.data.has('lingua'), false);
    assert.equal(saveLanguageChoice('it', store), true);
    assert.equal(store.data.get('lingua'), 'it');
  });

  it('una scelta sbagliata non si salva, e un salvataggio bloccato lo dice', () => {
    const store = storage();
    assert.equal(saveLanguageChoice('de', store), false);
    assert.equal(store.data.size, 0);
    assert.equal(saveLanguageChoice('it', broken), false);
  });
});

describe('lingua in uso nei test', () => {
  it('è l italiano, fissato dalla preparazione dei test qualunque lingua abbia il computer', () => {
    assert.equal(language, 'it');
    assert.equal(locale, 'it-IT');
    assert.equal(tx, italiano);
  });

  it('i testi di una lingua si chiedono anche senza cambiarla, e una lingua sconosciuta dà l inglese', () => {
    assert.equal(textsFor('en'), en);
    assert.equal(textsFor('it'), italiano);
    assert.equal(textsFor('xx'), en);
  });

  it('la pagina dichiara la lingua in uso, per lettori di schermo e traduttori del browser', () => {
    const doc = { documentElement: { lang: 'xx' } };
    applyDocumentLanguage(doc);
    assert.equal(doc.documentElement.lang, 'it');
    assert.doesNotThrow(() => applyDocumentLanguage(undefined));
  });
});

describe('testi in inglese', () => {
  it('hanno le stesse voci dell italiano, che fa da riferimento', () => {
    assert.deepEqual(shape(en), shape(italiano));
  });
});

for (const lang of LANGUAGES) {
  describe(`testi in ${lang}, uno per uno`, () => {
    const all = entries(ALL[lang]);

    it('non hanno trattini lunghi', () => {
      assert.deepEqual(all.filter(([, entry]) => typeof entry === 'string' && /[—–]/.test(entry)).map(([path]) => path), []);
    });

    it('non hanno spazi ai bordi né doppi', () => {
      assert.deepEqual(all.filter(([, entry]) => typeof entry === 'string' && (entry !== entry.trim() || /\S {2,}\S/.test(entry))).map(([path]) => path), []);
    });

    it('ogni funzione dà un testo non vuoto per almeno una delle forme di chiamata usate nel sito', () => {
      const tries = [[0], [1], [2], [25], ['Idea alfa'], [1, 4], [3, 'Idea alfa'], ['Idea alfa', 'Membro'], [{}], [['uno', 'due']], [new Date(2026, 10, 27)]];
      const mute = all
        .filter(([, entry]) => typeof entry === 'function')
        .filter(([, entry]) => !tries.some((args) => {
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
  });
}

describe('traduzioni dimenticate', () => {
  // Uguali nelle due lingue di proposito: nomi propri, sigle e parole che l'inglese usa così.
  const SAME_ON_PURPOSE = new Set(['common.appName']);

  it('nessuna frase inglese è rimasta uguale all italiano', () => {
    const english = new Map(entries(en));
    const same = entries(italiano)
      .filter(([path, entry]) => typeof entry === 'string' && /\s/.test(entry) && english.get(path) === entry && !SAME_ON_PURPOSE.has(path.replace(/\[\d+\]/g, '[]')))
      .map(([path]) => path);
    assert.deepEqual(same, []);
  });
});
