import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush } from '../setup/dom.mjs';
import { IDS, ME, PROJECT, PROJECT2, members } from '../setup/fixtures.mjs';

// Le immagini di note, chat e questionari stanno nello spazio dei file, ma il database sa a quale progetto appartengono:
// le pulizie e le cancellazioni guardano solo il progetto aperto, e senza un progetto non toccano niente.
let api;
let store;
let notes;
let surveyImages;
let original;
let asked;
let removed;
let realNow;

const ALFA = { id: PROJECT, name: 'Alfa', role: 'admin' };
const BETA = { id: PROJECT2, name: 'Beta', role: 'member' };
const IMG = `${IDS.idea}/11111111-1111-4111-8111-111111111111.jpg`;
const IMG2 = `${IDS.idea}/22222222-2222-4222-8222-222222222222.jpg`;
const HOUR = 3600 * 1000;
const T0 = Date.UTC(2026, 10, 27, 9);
let now = T0;

const SWEEPS = [
  { name: 'delle immagini delle note', sweep: () => notes.sweepNoteImages(), orphans: 'noteImageOrphans', remove: 'removeNoteImages' },
  { name: 'delle immagini dei questionari', sweep: () => surveyImages.sweepSurveyImages(), orphans: 'surveyImageOrphans', remove: 'removeSurveyImages' },
];

function open(project, role = 'admin') {
  store.setProject(project);
  store.setMembers(members().map((m) => (m.user_id === ME ? { ...m, role } : m)));
}

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  notes = await import('../../assets/js/notes.js');
  surveyImages = await import('../../assets/js/survey-images.js');
  original = { ...api };
  realNow = Date.now;
});

beforeEach(() => {
  store.resetStore();
  store.state.user = { id: ME };
  open(ALFA);
  localStorage.clear();
  asked = [];
  removed = [];
  now = T0;
  Date.now = () => now;
  for (const { orphans, remove } of SWEEPS) {
    api[orphans] = async (paths, project) => {
      asked.push([orphans, paths, project]);
      return [IMG2];
    };
    api[remove] = async (paths) => removed.push([remove, ...paths]);
  }
});

afterEach(() => {
  Date.now = realNow;
  Object.assign(api, original);
});

for (const { name, sweep, orphans, remove } of SWEEPS) {
  describe(`pulizia periodica ${name}`, () => {
    it('chiede al database solo le immagini del progetto aperto', async () => {
      assert.equal(await sweep(), 1);
      assert.deepEqual(asked, [[orphans, null, PROJECT]]);
      assert.deepEqual(removed, [[remove, IMG2]]);
    });

    it('senza un progetto aperto non pulisce niente, e pulisce appena se ne apre uno', async () => {
      store.setProject(null);
      assert.equal(await sweep(), 0);
      assert.deepEqual(asked, []);
      open(ALFA);
      assert.equal(await sweep(), 1, 'il turno non si è consumato senza progetto');
      assert.deepEqual(asked, [[orphans, null, PROJECT]]);
    });

    it('ogni progetto ha il suo turno: pulire un progetto non rimanda gli altri', async () => {
      assert.equal(await sweep(), 1);
      assert.equal(await sweep(), 0, 'lo stesso progetto aspetta');
      open(BETA, 'member');
      assert.equal(await sweep(), 1);
      assert.deepEqual(asked.map(([, , project]) => project), [PROJECT, PROJECT2]);
    });

    it('torna dopo 12 ore, non un attimo prima', async () => {
      await sweep();
      now = T0 + 12 * HOUR - 1;
      assert.equal(await sweep(), 0);
      now = T0 + 12 * HOUR;
      assert.equal(await sweep(), 1);
      assert.equal(asked.length, 2);
    });

    it('chi nel progetto aperto è advisor non pulisce', async () => {
      open(ALFA, 'advisor');
      assert.equal(await sweep(), 0);
      assert.deepEqual(asked, []);
    });

    it('un errore del database non ferma il sito', async () => {
      api[orphans] = async () => {
        throw new Error('rete assente');
      };
      assert.equal(await sweep(), 0);
      assert.deepEqual(removed, []);
    });
  });
}

describe('immagini tolte da un testo', () => {
  it('si chiede al database se sono ancora usate nel progetto aperto, e si cancellano solo quelle orfane', async () => {
    api.noteImageOrphans = async (paths, project) => {
      asked.push([paths, project]);
      return [IMG];
    };
    const gone = await notes.removeUnusedImages(`![a](immagine:${IMG})\n![b](immagine:${IMG2})`, `![b](immagine:${IMG2})`);
    assert.deepEqual(gone, [IMG]);
    assert.deepEqual(asked, [[[IMG], PROJECT]]);
    assert.deepEqual(removed, [['removeNoteImages', IMG]]);
  });

  it('senza immagini tolte non si chiede niente', async () => {
    assert.deepEqual(await notes.removeUnusedImages(`![b](immagine:${IMG2})`, `testo ![b](immagine:${IMG2})`), []);
    assert.deepEqual(asked, []);
  });

  it('senza un progetto aperto non si cancella niente', async () => {
    store.setProject(null);
    assert.deepEqual(await notes.removeUnusedImages(`![a](immagine:${IMG})`, ''), []);
    assert.deepEqual(asked, []);
    assert.deepEqual(removed, []);
  });
});

describe('testi delle immagini delle note in italiano', () => {
  let restore;
  beforeEach(() => {
    const proto = window.HTMLCanvasElement.prototype;
    const saved = { bitmap: globalThis.createImageBitmap, ctx: proto.getContext, blob: proto.toBlob };
    restore = () => {
      globalThis.createImageBitmap = saved.bitmap;
      Object.assign(proto, { getContext: saved.ctx, toBlob: saved.blob });
    };
  });
  afterEach(() => restore());

  const image = (over = {}) => ({ type: 'image/png', size: 1000, ...over });
  for (const [label, setup, file, message] of [
    ['un file che non è un immagine', () => {}, image({ type: 'application/pdf' }), 'Scegli un\'immagine JPEG, PNG o WebP.'],
    ['un immagine oltre i 25 MB', () => {}, image({ size: 25 * 1024 * 1024 + 1 }), 'L\'immagine è troppo grande: massimo 25 MB.'],
    ['un formato che il browser non legge', () => { globalThis.createImageBitmap = async () => { throw new Error('x'); }; }, image(), 'Formato non supportato: usa un\'immagine JPEG, PNG o WebP.'],
    ['un browser senza disegno', () => {
      globalThis.createImageBitmap = async () => ({ width: 100, height: 100, close() {} });
      window.HTMLCanvasElement.prototype.getContext = () => null;
    }, image(), 'Il browser non riesce a elaborare l\'immagine.'],
    ['un immagine che resta troppo pesante', () => {
      globalThis.createImageBitmap = async () => ({ width: 100, height: 100, close() {} });
      window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
      window.HTMLCanvasElement.prototype.toBlob = (callback) => callback(new Blob([new Uint8Array(1024 * 1024)], { type: 'image/jpeg' }));
    }, image(), 'Non riesco a ridurre abbastanza l\'immagine.'],
  ]) {
    it(`spiega il problema di ${label}`, async () => {
      setup();
      await assert.rejects(notes.resizeNoteImage(file), { message });
    });
  }

  it('esattamente 25 MB si possono ancora caricare', async () => {
    globalThis.createImageBitmap = async () => ({ width: 100, height: 100, close() {} });
    window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
    window.HTMLCanvasElement.prototype.toBlob = (callback) => callback(new Blob(['jpeg'], { type: 'image/jpeg' }));
    const blob = await notes.resizeNoteImage(image({ size: 25 * 1024 * 1024 }));
    assert.equal(blob.type, 'image/jpeg');
  });

  it('un immagine senza descrizione si chiama immagine nel testo', () => {
    assert.equal(notes.imagePointer(IMG), `![immagine](immagine:${IMG})`);
    assert.equal(notes.imagePointer(IMG, '  '), `![immagine](immagine:${IMG})`);
    assert.equal(notes.imagePointer(IMG, 'lavagna'), `![lavagna](immagine:${IMG})`);
  });

  it('un immagine che non si scarica lo dice, con o senza descrizione', async () => {
    api.downloadNoteImage = async () => {
      throw new Error('sparita');
    };
    const host = document.createElement('div');
    const withAlt = notes.noteImageNode(IMG, 'schizzo');
    const without = notes.noteImageNode(IMG2, '');
    assert.equal(without.getAttribute('alt'), 'Immagine della nota');
    host.append(withAlt, without);
    await flush(5);
    assert.deepEqual([...host.querySelectorAll('.note-image-missing')].map((el) => el.textContent), ['Immagine non più disponibile: schizzo', 'Immagine non più disponibile']);
  });

  it('il file .md segna le immagini che non si scaricano e quelle oltre il limite', async () => {
    api.downloadNoteImage = async () => {
      throw new Error('sparita');
    };
    const md = await notes.noteToMarkdown({ title: 'Riunione', data: { date: '2026-10-20', body: `Riunione\n\n![lavagna](immagine:${IMG})` } });
    assert.equal(md, '# Riunione\n\nData: 2026-10-20\n\n*[immagine non disponibile: lavagna]*\n');
    api.uploadNoteImage = async () => {};
    globalThis.createImageBitmap = async () => ({ width: 100, height: 100, close() {} });
    window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
    window.HTMLCanvasElement.prototype.toBlob = (callback) => callback(new Blob(['jpeg'], { type: 'image/jpeg' }));
    const png = '![](data:image/png;base64,iVBORw0KGgo=)';
    const { body } = await notes.markdownToNote(`# Tante\n\n${Array.from({ length: notes.MAX_NOTE_IMAGES + 1 }, () => png).join('\n')}`, IDS.idea);
    assert.match(body, /\*\[immagine non importata: senza nome\]\*$/);
    assert.equal(notes.imagePaths(body).size, notes.MAX_NOTE_IMAGES);
  });
});
