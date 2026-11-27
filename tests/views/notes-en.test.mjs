import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, byText, text } from '../setup/dom.mjs';
import { italianWords } from '../setup/italian.mjs';
import { ME, item, members } from '../setup/fixtures.mjs';

// On a device in English: the site language is decided when it loads, so the modules are imported after the choice.
useLanguage('en');
setupDom();
const store = await import('../../assets/js/store.js');
const { noteView, notesTab } = await import('../../assets/js/views/notes.js');
const notes = await import('../../assets/js/notes.js');
const { api } = await import('../../assets/js/lib/api.js');

const IDEA = item({ id: 'cccccccc-0000-4000-8000-0000000000a0', kind: 'idea', title: 'Solar sensors', status: 'nuova' });
const note = (id, title, data) => item({ id, kind: 'note', title, idea_id: IDEA.id, data });
const NEW = note('cccccccc-0000-4000-8000-0000000000a1', 'Meeting with the mentor', { date: '2026-10-20', body: '# Meeting with the mentor\n\nTalk to **3 customers**' });
const OLD = note('cccccccc-0000-4000-8000-0000000000a2', 'Useful links', { date: '2026-10-01', body: 'Market report' });
const EMPTY = note('cccccccc-0000-4000-8000-0000000000a3', 'Blank page', { body: '' });

let downloads = [];
const realClick = window.HTMLAnchorElement.prototype.click;
const realObjectUrl = URL.createObjectURL;

beforeEach(() => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  [IDEA, NEW, OLD, EMPTY].forEach((i) => store.applyItem(i));
  downloads = [];
  URL.createObjectURL = () => 'blob:test';
  window.HTMLAnchorElement.prototype.click = function click() {
    if (this.download) downloads.push(this.download);
    else realClick.call(this);
  };
});

afterEach(() => {
  window.HTMLAnchorElement.prototype.click = realClick;
  URL.createObjectURL = realObjectUrl;
});

describe('appunti di un idea in inglese', () => {
  it('spiegano a cosa servono e propongono una nuova nota a chi può scrivere', () => {
    const tab = notesTab(IDEA, true);
    assert.equal(text(tab.querySelector('.section-head p')), 'Meetings, links, open questions and loose thoughts about this idea. Each note is a Markdown text, with images.');
    assert.equal(byText(tab, 'a', 'New note').getAttribute('href'), `#/nuovo/note?idea=${IDEA.id}`);
  });

  it('chi non può scrivere non vede il bottone della nuova nota', () => {
    assert.equal(byText(notesTab(IDEA, false), 'a', 'New note'), null);
  });

  it('le note vanno dalla più recente, con un anteprima in testo semplice', () => {
    const tab = notesTab(IDEA, true);
    const titles = [...tab.querySelectorAll('.note-card .item-link')].map((a) => a.textContent);
    assert.deepEqual(titles, ['Meeting with the mentor', 'Blank page', 'Useful links'], 'senza data conta il giorno di creazione');
    assert.match(text(tab), /Talk to 3 customers/);
  });

  it('senza note lo dice in inglese', () => {
    store.resetStore();
    store.state.user = { id: ME };
    store.setMembers(members());
    store.applyItem(IDEA);
    const tab = notesTab(IDEA, true);
    assert.equal(text(tab.querySelector('.empty')), 'No notes yet. Write meeting notes here, and anything that does not fit in a sheet.');
  });

  it('i testi della scheda non lasciano parole italiane', () => {
    const tab = notesTab(IDEA, true);
    tab.querySelectorAll('.note-card').forEach((card) => card.remove());
    assert.deepEqual(italianWords(text(tab)), []);
  });
});

describe('pagina di una nota in inglese', () => {
  it('offre di scaricarla in Markdown o in PDF', () => {
    const page = noteView(NEW);
    assert.ok(byText(page, 'button', 'Download .md'));
    assert.ok(byText(page, 'button', 'Download PDF'));
  });

  it('il Markdown si scarica con il titolo come nome del file', async () => {
    const page = noteView(NEW);
    byText(page, 'button', 'Download .md').click();
    await flush(5);
    assert.deepEqual(downloads, ['meeting-with-the-mentor.md']);
  });

  it('una nota vuota lo dice in inglese', () => {
    assert.equal(text(noteView(EMPTY).querySelector('.empty')), 'The note is empty.');
  });

  it('i testi della pagina non lasciano parole italiane', () => {
    const page = noteView(EMPTY);
    assert.deepEqual(italianWords(text(page)), []);
  });
});

describe('immagini delle note in inglese', () => {
  const IMG = `${IDEA.id}/11111111-1111-4111-8111-111111111111.jpg`;
  const IMG2 = `${IDEA.id}/22222222-2222-4222-8222-222222222222.jpg`;
  const proto = window.HTMLCanvasElement.prototype;
  const saved = { bitmap: globalThis.createImageBitmap, ctx: proto.getContext, blob: proto.toBlob, download: api.downloadNoteImage, upload: api.uploadNoteImage };
  const bitmap = () => {
    globalThis.createImageBitmap = async () => ({ width: 100, height: 100, close() {} });
  };
  const drawable = (bytes = 4) => {
    bitmap();
    proto.getContext = () => ({ drawImage() {} });
    proto.toBlob = (callback) => callback(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }));
  };
  afterEach(() => {
    globalThis.createImageBitmap = saved.bitmap;
    Object.assign(proto, { getContext: saved.ctx, toBlob: saved.blob });
    Object.assign(api, { downloadNoteImage: saved.download, uploadNoteImage: saved.upload });
  });

  const image = (over = {}) => ({ type: 'image/png', size: 1000, ...over });
  for (const [label, setup, file, message] of [
    ['un file che non è un immagine', () => {}, image({ type: 'text/plain' }), 'Choose a JPEG, PNG or WebP image.'],
    ['un immagine oltre i 25 MB', () => {}, image({ size: 25 * 1024 * 1024 + 1 }), 'The image is too large: 25 MB at most.'],
    ['un formato che il browser non legge', () => {
      globalThis.createImageBitmap = async () => {
        throw new Error('x');
      };
    }, image(), 'Unsupported format: use a JPEG, PNG or WebP image.'],
    ['un browser senza disegno', () => {
      bitmap();
      proto.getContext = () => null;
    }, image(), 'The browser cannot process the image.'],
    ['un immagine che resta troppo pesante', () => drawable(1024 * 1024), image(), 'The image cannot be made small enough.'],
  ]) {
    it(`spiegano il problema di ${label}`, async () => {
      setup();
      await assert.rejects(notes.resizeNoteImage(file), { message });
    });
  }

  it('la copertina di un questionario spiega in inglese un file che non è un immagine, senza caricare niente', async () => {
    const { uploadSurveyCover } = await import('../../assets/js/survey-images.js');
    const uploads = [];
    const savedUpload = api.uploadSurveyImage;
    api.uploadSurveyImage = async (path) => uploads.push(path);
    try {
      await assert.rejects(uploadSurveyCover('dddddddd-0000-4000-8000-000000000001', image({ type: 'application/pdf' })), { message: 'Choose a JPEG, PNG or WebP image.' });
    } finally {
      api.uploadSurveyImage = savedUpload;
    }
    assert.deepEqual(uploads, []);
  });

  it('un immagine senza descrizione si chiama image nel testo, che tiene il suo segno immagine:', () => {
    assert.equal(notes.imagePointer(IMG), `![image](immagine:${IMG})`);
    assert.equal(notes.imagePointer(IMG, 'whiteboard'), `![whiteboard](immagine:${IMG})`);
  });

  it('un immagine che non si scarica lo dice in inglese, con o senza descrizione', async () => {
    api.downloadNoteImage = async () => {
      throw new Error('gone');
    };
    const host = document.createElement('div');
    const withAlt = notes.noteImageNode(IMG, 'sketch');
    const without = notes.noteImageNode(IMG2, '');
    assert.equal(without.getAttribute('alt'), 'Image of the note');
    host.append(withAlt, without);
    await flush(5);
    assert.deepEqual([...host.querySelectorAll('.note-image-missing')].map((el) => el.textContent), ['Image no longer available: sketch', 'Image no longer available']);
  });

  it('il file .md ha la data e i segnaposto delle immagini in inglese', async () => {
    api.downloadNoteImage = async () => {
      throw new Error('gone');
    };
    const md = await notes.noteToMarkdown({ title: 'Meeting', data: { date: '2026-10-20', body: `Meeting\n\n![board](immagine:${IMG})` } });
    assert.equal(md, '# Meeting\n\nDate: 2026-10-20\n\n*[image not available: board]*\n');
    api.uploadNoteImage = async () => {};
    drawable();
    const png = '![](data:image/png;base64,iVBORw0KGgo=)';
    const { body } = await notes.markdownToNote(`# Many\n\n${Array.from({ length: notes.MAX_NOTE_IMAGES + 1 }, () => png).join('\n')}`, IDEA.id);
    assert.match(body, /\*\[image not imported: unnamed\]\*$/);
    assert.equal(notes.imagePaths(body).size, notes.MAX_NOTE_IMAGES);
  });
});
