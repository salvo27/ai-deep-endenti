import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { italianWords } from '../setup/italian.mjs';
import { setupDom, flush, text } from '../setup/dom.mjs';
import { ME, members } from '../setup/fixtures.mjs';

// On a device in English: the site language is decided when it loads, so the modules are imported after the choice.
useLanguage('en');
setupDom();
const { api } = await import('../../assets/js/lib/api.js');
const store = await import('../../assets/js/store.js');
const router = await import('../../assets/js/router.js');
const app = await import('../../assets/js/app.js');
const schema = await import('../../assets/js/schema.js');
const { EXAMPLES, buildExamples } = await import('../../assets/js/examples.js');
const { language, textsFor } = await import('../../assets/js/i18n/index.js');

const original = { ...api };
router.clearRoutes();
app.registerRoutes();

// English words that the Italian detector also knows: in these texts they are English ("per night", "serve a market").
const ENGLISH_TOO = new Set(['per', 'serve']);

// Field types that hold stored values (options, dates, links, numbers), never a text to translate.
const STORED_TYPES = new Set(['select', 'date', 'experiment', 'interview', 'ideas', 'int', 'money', 'scale', 'image']);

/** Every text of an example that someone reads: title, note, text fields, and the rows of the competitors grid. */
function shownTexts(item) {
  const d = item.data;
  const texts = [item.title, item.exampleNote];
  for (const def of schema.KINDS[item.kind].fields) if (!STORED_TYPES.has(def.type)) texts.push(...[d[def.key]].flat());
  for (const feature of d.features || []) texts.push(feature.label);
  for (const rival of d.rivals || []) texts.push(rival.name, rival.note);
  for (const axis of Object.values(d.axes || {})) texts.push(axis.label, axis.low, axis.high);
  return texts.filter((t) => typeof t === 'string' && t !== '');
}

/** The example with its texts blanked out: what must be the same in every language. */
function skeleton(item) {
  const texts = new Set(shownTexts(item));
  const blank = (value) => {
    if (Array.isArray(value)) return value.map(blank);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, blank(v)]));
    return typeof value === 'string' && texts.has(value) ? '<testo>' : value;
  };
  return blank(item);
}

const italian = buildExamples(textsFor('it').examples);
const english = buildExamples(textsFor('en').examples);
const ideas = EXAMPLES.filter((i) => i.kind === 'idea');
const byStatus = (status) => ideas.find((i) => i.status === status);

// The words of the glossary for the idea statuses: every note says which status it shows.
const STATUS_WORDS = { nuova: 'New', esplorazione: 'Exploring', validazione: 'Validating', scelta: 'Chosen', parcheggiata: 'Parked', scartata: 'Discarded' };

describe('esempi in inglese', () => {
  it('su un dispositivo in inglese il sito mostra gli esempi in inglese', () => {
    assert.equal(language, 'en');
    assert.deepEqual(EXAMPLES, english);
    assert.notDeepEqual(english, italian);
  });

  for (const item of EXAMPLES) {
    it(`${item.kind} «${item.title}» non ha parole italiane`, () => {
      const leftovers = shownTexts(item).flatMap((t) => italianWords(t).filter((w) => !ENGLISH_TOO.has(w)).map((w) => `${w} in ${JSON.stringify(t.slice(0, 60))}`));
      assert.deepEqual(leftovers, []);
    });
  }

  it('ogni testo è stato tradotto: in inglese nessuna frase è rimasta quella italiana', () => {
    // I titoli dei canvas sono un nome con la versione, uguale in ogni lingua.
    const same = english.flatMap((item, i) => {
      const before = new Set(shownTexts(italian[i]));
      return shownTexts(item).filter((t) => /\s/.test(t) && before.has(t) && !/^Lean Canvas( v\d)?$/.test(t)).map((t) => `${item.kind}: ${t}`);
    });
    assert.deepEqual(same, []);
  });
});

describe('stessi esempi nelle due lingue', () => {
  it('ci sono gli stessi esempi, nello stesso ordine', () => {
    assert.equal(english.length, italian.length);
    assert.deepEqual(english.map((i) => [i.id, i.kind, i.status]), italian.map((i) => [i.id, i.kind, i.status]));
  });

  for (const [i, item] of english.entries()) {
    it(`${item.kind} ${item.id}: stessi campi, stessi collegamenti e stessi valori salvati`, () => {
      assert.deepEqual(skeleton(item), skeleton(italian[i]));
    });
  }

  it('il titolo di ogni idea comincia con il nome della startup, uguale nelle due lingue', () => {
    // La Guida usa la parte prima dei due punti come nome dell'esempio.
    const names = (list) => list.filter((i) => i.kind === 'idea').map((i) => i.title.split(':')[0]);
    assert.deepEqual(names(english), ['UberCab', 'AirBed & Breakfast', 'Dropbox', 'Spotify', 'Netflix', 'Odeo']);
    assert.deepEqual(names(english), names(italian));
  });

  it('solo le idee hanno una nota, e la nota dice lo stato con la parola del glossario', () => {
    for (const item of english) {
      if (item.kind !== 'idea') {
        assert.equal(item.exampleNote, undefined, item.title);
        continue;
      }
      assert.ok(item.exampleNote.startsWith(`Example of the “${STATUS_WORDS[item.status]}” status: `), item.exampleNote);
    }
  });
});

describe('id degli esempi', () => {
  it('sono in fila dal primo all ultimo, con dodici cifre in fondo', () => {
    assert.equal(EXAMPLES[0].id, 'e0000000-0000-4000-8000-000000000001');
    assert.equal(EXAMPLES.at(-1).id, `e0000000-0000-4000-8000-${String(EXAMPLES.length).padStart(12, '0')}`);
    EXAMPLES.forEach((item, i) => assert.equal(item.id, `e0000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`));
  });

  it('non cambiano quando gli esempi si costruiscono di nuovo, in qualunque lingua', () => {
    const again = buildExamples(textsFor('en').examples);
    assert.deepEqual(again.map((i) => i.id), EXAMPLES.map((i) => i.id));
    assert.deepEqual(buildExamples(textsFor('it').examples).map((i) => i.id), EXAMPLES.map((i) => i.id));
  });

  it('gli esempi costruiti sono in sola lettura, come quelli del sito', () => {
    assert.ok(Object.isFrozen(EXAMPLES));
    assert.ok(Object.isFrozen(buildExamples(textsFor('it').examples)));
    assert.ok(EXAMPLES.every((i) => i.example === true && i.version === 1 && i.deleted_at === null));
  });
});

describe('esempi in inglese validi', () => {
  for (const example of EXAMPLES) {
    it(`${example.kind} «${example.title}» supera la validazione senza cambiare`, () => {
      assert.ok(store.isValidItemRow(example));
      const clean = schema.sanitizeSnapshot(example.kind, example);
      assert.equal(clean.title, example.title);
      assert.equal(schema.snapshotProblem(example.kind, clean), null);
      const people = new Set(schema.KINDS[example.kind].fields.filter((f) => f.type === 'member' || f.type === 'members').map((f) => f.key));
      for (const [key, value] of Object.entries(example.data)) {
        if (people.has(key) || value === '') continue;
        assert.deepEqual(clean.data[key], value, key);
      }
    });
  }
});

describe('pagine con gli esempi in inglese', () => {
  let outlet;

  beforeEach(async () => {
    store.resetStore();
    store.state.user = { id: ME };
    store.setMembers(members());
    store.writeLocal('esempi', null);
    outlet = document.createElement('main');
    await router.startRouter(outlet, { fallback: app.notFoundView });
  });

  afterEach(() => {
    router.stopRouter();
    Object.assign(api, original);
  });

  async function visit(hash) {
    await router.render(hash);
    await flush(5);
    return text(outlet);
  }

  it('la board mostra le idee di esempio con i titoli in inglese', async () => {
    await visit('#/idee');
    const titles = [...outlet.querySelectorAll('.idea-card.is-example a')].map((a) => text(a));
    assert.deepEqual([...titles].sort(), ideas.map((i) => i.title).sort());
    assert.ok(titles.includes('Spotify: legal music as fast as piracy'), titles.join(' | '));
  });

  it('un idea di esempio si apre con la nota e i campi in inglese', async () => {
    const spotify = byStatus('scelta');
    const body = await visit(`#/idea/${spotify.id}`);
    assert.ok(text(outlet.querySelector('.banner-example')).includes(spotify.exampleNote));
    assert.ok(body.includes(spotify.data.pitch), 'manca la frase dell idea');
    assert.ok(body.includes('Co-founder who looks after customers'), 'manca il responsabile');
    assert.ok(body.includes('Music and entertainment'), 'manca il settore');
  });

  for (const idea of ideas) {
    it(`le schede di «${idea.title}» elencano in inglese tutto ciò che le appartiene`, async () => {
      let pages = '';
      for (const tab of ['panoramica', 'canvas', 'clienti', 'mercato', 'esperimenti', 'interviste']) pages += ` ${await visit(`#/idea/${idea.id}/${tab}`)}`;
      // Il canvas compare con i suoi blocchi e non con il titolo, che è uguale in ogni lingua.
      const children = EXAMPLES.filter((i) => i.kind !== 'canvas' && (i.idea_id === idea.id || i.data.ideas?.includes(idea.id)));
      assert.ok(children.length > 0);
      assert.deepEqual(children.filter((child) => !pages.includes(child.title)).map((child) => `${child.kind}: ${child.title}`), []);
    });
  }

  for (const item of EXAMPLES.filter((i) => i.kind !== 'idea')) {
    it(`la pagina di ${item.kind} «${item.title}» lo mostra in inglese e in sola lettura`, async () => {
      const body = await visit(schema.routeFor(item));
      assert.ok(outlet.querySelector('.banner-example'), 'manca il banner dell esempio');
      assert.ok(body.includes(item.title), 'manca il titolo');
    });
  }
});
