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
