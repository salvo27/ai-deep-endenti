import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, text, byText, typeInto } from '../setup/dom.mjs';
import { IDS, ME, OTHER, boardItems, item, members } from '../setup/fixtures.mjs';
import { italianLeftovers } from './ideas-editing.helpers.mjs';

// On a device in English: the language is decided when the site loads, so the modules are imported after the choice.
useLanguage('en');
setupDom();
const { api } = await import('../../assets/js/lib/api.js');
const store = await import('../../assets/js/store.js');
const router = await import('../../assets/js/router.js');
const editor = await import('../../assets/js/views/editor.js');
const merge = await import('../../assets/js/views/merge.js');
const { fmtDateTime } = await import('../../assets/js/lib/format.js');

const AREAS = ['editor', 'common'];
const original = { ...api };
const cleanups = [];

beforeEach(() => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  localStorage.clear();
  document.body.querySelectorAll('dialog, .toasts').forEach((d) => d.remove());
});

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  Object.assign(api, original);
  router.setLeaveGuard(null);
});

function open(params, query = '') {
  const outlet = document.createElement('main');
  cleanups.push(editor.editorView(outlet, params, new URLSearchParams(query)));
  return outlet;
}

const dialog = () => document.querySelector('dialog');
const toasts = () => text(document.querySelector('.toasts'));
const snap = (i) => ({ title: i.title, status: i.status, idea_id: i.idea_id, data: structuredClone(i.data) });

describe('editor in inglese', () => {
  it('una nuova scheda ha Create, Cancel e il messaggio della modifica', () => {
    const outlet = open({ kind: 'idea' });
    assert.match(text(outlet.querySelector('h1')), /^New: \S/);
    assert.ok(byText(outlet, 'button', 'Create'));
    assert.ok(byText(outlet, 'button', 'Cancel'));
    const message = outlet.querySelector('.save-bar input');
    assert.equal(message.getAttribute('placeholder'), 'Describe the change (optional), like a commit message');
    assert.equal(message.getAttribute('aria-label'), 'Change message');
    assert.deepEqual(italianLeftovers(text(outlet), AREAS), []);
  });

  it('modificare una scheda ha il suo titolo e Save', () => {
    const outlet = open({ id: IDS.idea2 });
    assert.equal(text(outlet.querySelector('h1')), 'Edit: Idea beta');
    assert.ok(byText(outlet, 'button', 'Save'));
  });

  it('un salvataggio riuscito lo annuncia, nuovo o modificato', async () => {
    api.createItem = async (args) => item({ id: '12121212-1212-4121-8121-121212121212', kind: 'idea', title: args.title, status: args.status, data: args.data });
    let outlet = open({ kind: 'idea' });
    typeInto(outlet.querySelector('.input-title'), 'Solar drones');
    byText(outlet, 'button', 'Create').click();
    await flush(10);
    assert.match(toasts(), /^Saved: \S+\.$/);

    document.querySelector('.toasts').remove();
    api.saveItem = async ({ snapshot }) => ({ status: 'ok', item: item({ ...store.getItem(IDS.idea2), version: 2, title: snapshot.title }) });
    outlet = open({ id: IDS.idea2 });
    typeInto(outlet.querySelector('.input-title'), 'Idea beta, again');
    byText(outlet, 'button', 'Save').click();
    await flush(10);
    assert.equal(toasts(), 'Changes saved.');
  });

  for (const [name, setup, params, expected] of [
    ['un advisor', () => store.setMembers(members().map((m) => (m.user_id === ME ? { ...m, role: 'advisor' } : m))), { kind: 'idea' }, 'Only team members can edit the boards. Advisors can comment and give scores.'],
    ['una scheda archiviata', () => {}, { id: IDS.trashed }, 'This item is archived: restore it from the trash to edit it.'],
    ['una scheda che non esiste', () => {}, { id: '00000000-0000-4000-8000-000000000999' }, 'Item not found.'],
    ['un esempio', () => {}, { id: 'example' }, 'Examples are read-only: create a new idea and use them as a guide.'],
  ]) {
    it(`${name} non si modifica e lo dice`, () => {
      setup();
      const id = params.id === 'example' ? store.exampleIdeas()[0].id : params.id;
      const outlet = open(id ? { id } : params);
      assert.equal(text(outlet.querySelector('.error-box')), expected);
    });
  }

  it('l idea è facoltativa per un intervista e obbligatoria per un esperimento', () => {
    let outlet = open({ kind: 'interview' });
    const label = (el) => [...el.querySelectorAll('.form-top .field-label')].map((l) => text(l));
    assert.ok(label(outlet).includes('Idea (optional)'));
    assert.equal(text(outlet.querySelector('.form-top select option')), 'None');
    assert.equal(outlet.querySelector('.input-title').getAttribute('placeholder'), 'If you leave it empty I will use role and organisation');
    assert.ok(label(outlet).includes('Status'));
    outlet = open({ kind: 'experiment' });
    assert.ok(label(outlet).includes('Idea'));
    assert.equal(text(outlet.querySelector('.form-top select option')), 'Choose the idea');
  });

  it('una bozza non salvata si può ripristinare o scartare', async () => {
    let outlet = open({ id: IDS.idea2 });
    typeInto(outlet.querySelector('.input-title'), 'Unsaved draft');
    await new Promise((r) => setTimeout(r, 700));
    cleanups.pop()();
    router.setLeaveGuard(null);
    outlet = open({ id: IDS.idea2 });
    const banner = outlet.querySelector('.banner');
    const savedAt = JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.includes('draft:')))).savedAt;
    assert.equal(text(banner.querySelector('span')), `You have an unsaved draft from ${fmtDateTime(savedAt)}.`);
    assert.ok(byText(banner, 'button', 'Restore the draft'));
    byText(banner, 'button', 'Discard').click();
    assert.equal(banner.hidden, true);
  });

  it('se un altro salva mentre modifico lo dico e unisco al salvataggio', () => {
    const outlet = open({ id: IDS.idea2 });
    const idea = store.getItem(IDS.idea2);
    typeInto(outlet.querySelector('.input-title'), 'My title');
    store.applyItem(item({ ...idea, version: 2, updated_by: OTHER }));
    assert.equal(
      text(outlet.querySelector('.banner')),
      'Bruno saved a new version while you were editing. When you save, I will merge your changes and only ask you where they overlap.',
    );
  });

  it('uscire con modifiche non salvate chiede conferma', async () => {
    const outlet = open({ id: IDS.idea2 });
    typeInto(outlet.querySelector('.input-title'), 'Changed');
    await router.startRouter(document.createElement('main'));
    const attempt = router.render('#/idee');
    await flush();
    assert.equal(text(dialog().querySelector('h2')), 'Leave without saving?');
    assert.match(text(dialog()), /You have unsaved changes\. They stay as a draft on this device\./);
    assert.ok(byText(dialog(), 'button', 'Leave'));
    byText(dialog(), 'button', 'Cancel').click();
    await attempt;
    router.stopRouter();
  });
});

describe('campi del modulo in inglese', () => {
  it('etichette, scala, scelte vuote e campi sconosciuti', () => {
    const working = { idea_id: null, data: { i: ['XAI'] } };
    const tags = editor.fieldControl({ key: 'i', type: 'tags' }, working, () => {});
    assert.equal(tags.querySelector('input').getAttribute('placeholder'), 'Type and press Enter');
    assert.equal(tags.querySelector('.chip-x').getAttribute('aria-label'), 'Remove XAI');
    const scale = editor.fieldControl({ key: 'j', type: 'scale', label: 'Scale' }, working, () => {});
    assert.equal(text(scale.querySelector('.link-btn')), 'clear');
    store.resetStore();
    assert.equal(text(editor.fieldControl({ key: 'g', type: 'ideas' }, working, () => {})), 'No items available.');
    assert.equal(text(editor.fieldControl({ key: 'k', type: 'other' }, working, () => {})), 'Unsupported field');
  });

  it('la foto si carica, si cambia e si toglie', () => {
    const working = { title: 'Rita', data: {} };
    const box = editor.fieldControl({ key: 'photo', type: 'image' }, working, () => {});
    assert.match(text(box), /Upload a photo/);
    working.data.photo = `data:image/jpeg;base64,${'A'.repeat(400)}`;
    const filled = editor.fieldControl({ key: 'photo', type: 'image' }, working, () => {});
    assert.match(text(filled), /Change photo/);
    assert.match(text(filled), /Remove photo/);
    assert.equal(filled.querySelector('img').getAttribute('alt'), 'Photo preview');
  });
});

describe('schede nuove create in inglese', () => {
  const query = new URLSearchParams({ idea: IDS.idea });

  for (const [kind, title] of [
    ['deeptech', 'Deep tech sheet: Idea alfa'],
    ['market', 'Market: Idea alfa'],
    ['competitors', 'Competitors: Idea alfa'],
    ['vpc', 'Value Proposition Canvas: Idea alfa'],
    ['canvas', 'Lean Canvas: Idea alfa'],
  ]) {
    it(`${kind} prende il titolo dall idea`, () => {
      assert.equal(editor.initialSnapshot(kind, query).title, title);
    });
  }

  it('il grafico dei concorrenti parte da prezzo e facilità d uso', () => {
    assert.deepEqual(editor.initialSnapshot('competitors', query).data.axes, {
      x: { label: 'Price', low: 'Expensive', high: 'Cheap' },
      y: { label: 'Ease of use', low: 'Complicated', high: 'Simple' },
    });
  });

  it('la divisione delle quote e il Team Canvas hanno il loro titolo', () => {
    assert.equal(editor.initialSnapshot('equity').title, 'Share split');
    assert.equal(editor.initialSnapshot('teamcanvas').title, 'Team Canvas');
  });
});

describe('editor delle note in inglese', () => {
  const note = () => open({ kind: 'note' }, `idea=${IDS.idea}`);
  const tool = (outlet, label) => outlet.querySelector(`.md-toolbar button[aria-label^="${label}"]`);

  it('barra degli strumenti, segnaposto e contatore in inglese', () => {
    const outlet = note();
    const textarea = outlet.querySelector('textarea.md-input');
    assert.match(textarea.getAttribute('placeholder'), /^Note title\n\nWrite your notes here\./);
    assert.equal(textarea.getAttribute('aria-label'), 'Note text: the first line is the title');
    assert.equal(outlet.querySelector('.md-toolbar').getAttribute('aria-label'), 'Formatting');
    const size = outlet.querySelector('.md-toolbar select');
    assert.equal(size.getAttribute('aria-label'), 'Text size');
    assert.deepEqual([...size.options].map((o) => o.textContent), ['Size', 'Normal text', 'Large heading', 'Medium heading', 'Small heading']);
    for (const label of ['Bold (Cmd or Ctrl + B)', 'Italic (Cmd or Ctrl + I)', 'Bulleted list', 'Numbered list', 'Insert a table']) assert.ok(tool(outlet, label), label);
    const toolbar = outlet.querySelector('.md-toolbar');
    for (const label of ['• List', '1. List', 'Table', 'Image', 'Import .md', 'Preview']) assert.ok(byText(toolbar, 'button, label', label), label);
    assert.match(text(toolbar.querySelector('[aria-live]')), /^0 of \d+ images$/);
    assert.equal(text(outlet.querySelector('.md-title')), 'The first line will be the title of the note.');
    typeInto(textarea, 'Meeting with the mentor\nbody');
    assert.equal(text(outlet.querySelector('.md-title')), 'Note title: Meeting with the mentor');
    assert.deepEqual(italianLeftovers(text(outlet), AREAS), []);
  });

  it('grassetto e corsivo senza selezione scrivono una parola inglese da sostituire', () => {
    const outlet = note();
    const textarea = outlet.querySelector('textarea.md-input');
    textarea.setSelectionRange(0, 0);
    tool(outlet, 'Bold').click();
    assert.equal(textarea.value, '**bold**');
    assert.equal(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd), 'bold');
    typeInto(textarea, '');
    textarea.setSelectionRange(0, 0);
    tool(outlet, 'Italic').click();
    assert.equal(textarea.value, '*italic*');
  });

  it('la tabella ha colonne in inglese e seleziona il primo titolo per intero', () => {
    const outlet = note();
    const textarea = outlet.querySelector('textarea.md-input');
    typeInto(textarea, 'Title');
    textarea.setSelectionRange(5, 5);
    tool(outlet, 'Insert a table').click();
    assert.match(textarea.value, /^Title\n\n\| Column 1 \| Column 2 \| Column 3 \|\n\| --- \| --- \| --- \|/);
    assert.equal(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd), 'Column 1');
  });

  it('anteprima e scrittura si alternano', () => {
    const outlet = note();
    const button = byText(outlet, 'button', 'Preview');
    button.click();
    assert.equal(button.textContent, 'Write');
    button.click();
    assert.equal(button.textContent, 'Preview');
  });

  it('senza idea un immagine non si carica e lo dice', async () => {
    const outlet = open({ kind: 'note' });
    const input = outlet.querySelector('.md-toolbar input[type="file"]');
    Object.defineProperty(input, 'files', { value: [new window.File(['x'], 'a.jpg', { type: 'image/jpeg' })], configurable: true });
    input.dispatchEvent(new Event('change'));
    await flush();
    assert.equal(toasts(), 'Choose the idea the note belongs to first.');
  });
});

describe('modifiche in conflitto in inglese', () => {
  it('chiede quale versione tenere e dice chi ha salvato', async () => {
    const idea = store.getItem(IDS.idea2);
    const theirs = item({ ...idea, version: 2, updated_by: OTHER, data: { ...idea.data, pitch: 'Theirs' } });
    let second = null;
    api.saveItem = async ({ baseVersion, snapshot }) => {
      if (baseVersion === 1) return { status: 'conflict', item: theirs };
      second = snapshot;
      return { status: 'ok', item: item({ ...theirs, version: 3, data: snapshot.data }) };
    };
    const pending = merge.saveWithMerge(idea, snap(idea), { ...snap(idea), data: { ...idea.data, pitch: 'Mine' } }, '');
    await flush();
    assert.equal(text(dialog().querySelector('h2')), 'Conflicting changes');
    assert.match(
      text(dialog()),
      /While you were editing, Bruno saved changes to the same fields\. Choose which version to keep for each one: the rest is already merged\./,
    );
    assert.deepEqual([...dialog().querySelectorAll('.conflict-option-label')].map((l) => text(l)), ['Your version', 'Bruno’s version']);
    assert.deepEqual([...dialog().querySelectorAll('footer button')].map((b) => text(b)), ['Cancel', 'Save with these choices']);
    dialog().querySelector('input[value="theirs"]').dispatchEvent(new window.Event('change'));
    byText(dialog(), 'button', 'Save with these choices').click();
    await pending;
    assert.equal(second.data.pitch, 'Theirs');
  });

  it('se ho salvato io da un altro dispositivo non faccio nomi, e un valore vuoto si dice empty', async () => {
    store.applyItem(item({ ...store.getItem(IDS.idea2), version: 2, data: { ...store.getItem(IDS.idea2).data, pitch: 'Old' } }));
    const idea = store.getItem(IDS.idea2);
    const theirs = item({ ...idea, version: 3, updated_by: ME, data: { owner: idea.data.owner } });
    api.saveItem = async () => ({ status: 'conflict', item: theirs });
    const pending = merge.saveWithMerge(idea, snap(idea), { ...snap(idea), data: { ...idea.data, pitch: 'Mine' } }, '');
    await flush();
    assert.match(text(dialog()), /While you were editing, you saved changes to the same fields from another device\./);
    assert.deepEqual([...dialog().querySelectorAll('.conflict-option-label')].map((l) => text(l)), ['Your version', 'The version saved elsewhere']);
    assert.match(text(dialog().querySelectorAll('.conflict-option')[1]), /empty$/);
    byText(dialog(), 'button', 'Cancel').click();
    assert.equal((await pending).cancelled, true);
  });

  it('uno stato in conflitto si legge a parole, non come è salvato', async () => {
    const idea = store.getItem(IDS.idea2);
    const theirs = item({ ...idea, version: 2, updated_by: OTHER, status: 'validazione' });
    api.saveItem = async () => ({ status: 'conflict', item: theirs });
    const pending = merge.saveWithMerge(idea, snap(idea), { ...snap(idea), status: 'esplorazione' }, '');
    await flush();
    const options = [...dialog().querySelectorAll('.conflict-option')].map((o) => [text(o.querySelector('.conflict-option-label')), text(o.lastChild)]);
    assert.deepEqual(options, [['Your version', 'Exploring'], ['Bruno’s version', 'Validating']]);
    byText(dialog(), 'button', 'Cancel').click();
    await pending;
  });

  for (const [author, expected] of [
    [OTHER, 'Your changes were merged with Bruno’s.'],
    [ME, 'Your changes were merged with the ones saved from another device.'],
  ]) {
    it(`unire senza conflitti lo annuncia (${author === ME ? 'io' : 'un altro'})`, async () => {
      const idea = store.getItem(IDS.idea2);
      const theirs = item({ ...idea, version: 2, updated_by: author, data: { ...idea.data, sector: 'B' } });
      api.saveItem = async ({ baseVersion, snapshot }) => (baseVersion === 1 ? { status: 'conflict', item: theirs } : { status: 'ok', item: item({ ...theirs, version: 3, data: snapshot.data }) });
      await merge.saveWithMerge(idea, snap(idea), { ...snap(idea), data: { ...idea.data, pitch: 'Mine' } }, '');
      assert.equal(toasts(), expected);
    });
  }
});
