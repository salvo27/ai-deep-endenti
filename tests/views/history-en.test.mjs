import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, byText, text } from '../setup/dom.mjs';
import { italianWords } from '../setup/italian.mjs';
import { IDS, ME, OTHER, item, members, revision } from '../setup/fixtures.mjs';

// On a device in English: the site language is decided when it loads, so the modules are imported after the choice.
useLanguage('en');
setupDom();
const { api } = await import('../../assets/js/lib/api.js');
const store = await import('../../assets/js/store.js');
const history = await import('../../assets/js/views/history.js');
const { textsFor } = await import('../../assets/js/i18n/index.js');

const original = { ...api };
const IDEA = item({ id: IDS.idea, kind: 'idea', title: 'Solar sensors', status: 'nuova', version: 2 });
const rev = (over) => revision({ title: 'Solar sensors', ...over });
const ideaHistory = () => [
  rev({ id: 1, version: 1, op: 'create', data: { pitch: 'Sensors', problem: 'Line 1' } }),
  rev({ id: 2, version: 2, op: 'update', author_id: OTHER, data: { pitch: 'Cheap sensors', problem: 'Line 1\nLine 2', technologies: ['XAI'] }, changed: ['pitch', 'problem', 'technologies'] }),
];
const skipped = (view) => [...view.querySelectorAll('.diff-skip')].map((el) => text(el));
const myItalian = (value) => italianWords(value).filter((w) => w !== 'per');

before(() => {
  document.body.querySelectorAll('dialog, .toasts').forEach((d) => d.remove());
});

beforeEach(() => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  store.applyItem(IDEA);
  document.body.querySelectorAll('dialog, .toasts').forEach((d) => d.remove());
});

afterEach(() => Object.assign(api, original));

describe('riassunto delle versioni in inglese', () => {
  for (const [name, input, expected] of [
    ['la prima versione', { op: 'create' }, 'First version'],
    ['lo spostamento nel cestino', { op: 'delete' }, 'Moved to the trash'],
    ['il ripristino dal cestino', { op: 'restore' }, 'Restored from the trash'],
    ['un salvataggio senza campi cambiati', { op: 'update', changed: [] }, 'No fields changed'],
    ['i voti', { op: 'update', kind: 'score', changed: ['scores', 'notes'] }, 'Changed: scores, notes'],
    ['la griglia del generatore', { op: 'update', kind: 'generator', changed: ['rows', 'cols', 'cells'] }, 'Changed: rows, columns, cells'],
    ['l orario tipo', { op: 'update', kind: 'availability', changed: ['busy', 'until', 'weeks'] }, 'Changed: usual busy hours, end date of the usual busy hours, weeks with different hours'],
    ['le ore lavorate', { op: 'update', kind: 'timesheet', changed: ['week', 'pledge', 'entries'] }, 'Changed: week, pledged hours, rows'],
    ['il questionario', { op: 'update', kind: 'survey', changed: ['questions', 'appearance', 'token', 'show_time'] }, 'Changed: questions, appearance, public link, visible duration'],
    ['i criteri e i blocchi validati', { op: 'update', kind: 'canvas', changed: ['validated'] }, 'Changed: validated blocks'],
  ]) {
    it(`${name} si riassume in inglese`, () => {
      assert.equal(history.revisionSummary(rev(input)), expected);
    });
  }

  it('il messaggio salvato resta com è, anche se è stato scritto in italiano', () => {
    assert.equal(history.revisionSummary(rev({ message: 'aggiornato il pitch' })), 'aggiornato il pitch');
  });

  it('un etichetta ripetuta compare una volta sola', () => {
    assert.deepEqual(history.changedLabels(rev({ kind: 'criteria', changed: ['criteria', 'criteria'] })), ['criteria']);
  });
});

describe('righe dello storico in inglese', () => {
  for (const [op, verb] of [
    ['create', 'created'],
    ['update', 'edited'],
    ['delete', 'archived'],
    ['restore', 'restored'],
    ['revert', 'rolled back'],
    ['sconosciuta', 'edited'],
  ]) {
    it(`l operazione ${op} si legge «${verb}»`, () => {
      const li = history.revisionLine(rev({ op, author_id: OTHER, version: 3 }));
      assert.match(text(li.querySelector('.log-main')), new RegExp(`^Bruno ${verb} .*“Solar sensors”`));
      assert.equal(li.querySelector('a.version').title, 'See the changes');
    });
  }
});

describe('confronto delle righe in inglese', () => {
  it('una riga uguale nascosta si dice al singolare, di più al plurale', () => {
    assert.deepEqual(skipped(history.lineDiffView('a\nb\nc\nd', 'zero\nb\nc\nd')), ['… 1 unchanged line']);
    assert.deepEqual(skipped(history.lineDiffView('a\nb\nc\nd\ne', 'zero\nb\nc\nd\ne')), ['… 2 unchanged lines']);
    const long = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    assert.deepEqual(skipped(history.lineDiffView(long, long.replace('line 10', 'line ten'))), ['… 8 unchanged lines', '… 7 unchanged lines']);
  });

  it('senza righe uguali da nascondere non dice niente', () => {
    assert.deepEqual(skipped(history.lineDiffView('a', 'b')), []);
  });
});

describe('modifiche di un campo in inglese', () => {
  for (const [type, tag] of [['added', 'added'], ['removed', 'removed'], ['changed', 'changed']]) {
    it(`un campo ${type} ha l etichetta «${tag}»`, () => {
      const view = history.changeView('score', { path: 'data.notes', type, before: type === 'added' ? undefined : 'a', after: type === 'removed' ? undefined : 'b', kind: 'inline' });
      assert.equal(text(view.querySelector('.change-tag')), tag);
    });
  }

  it('una foto si confronta guardandola, e senza foto lo dice', () => {
    const view = history.changeView('persona', { path: 'data.photo', type: 'added', before: undefined, after: 'data:image/png;base64,AAAA', kind: 'inline' });
    assert.equal(text(view.querySelector('.photo-old')), '');
    assert.equal(text(view.querySelector('.photo-change')), 'no photo→');
    assert.equal(view.querySelector('.photo-new img')?.getAttribute('alt'), 'Photo');
  });

  it('un passo della roadmap tolto o aggiunto torna «to do»', () => {
    const view = history.changeView('idea', { path: 'data.roadmap.team-canvas', type: 'added', before: undefined, after: `done|${ME}|2026-10-10T10:00:00Z`, kind: 'inline' });
    assert.match(text(view.querySelector('.diff-inline')), /^to do → /);
  });
});

describe('pagina di una versione in inglese', () => {
  it('confronta la versione con la precedente e dice chi l ha fatta', async () => {
    api.itemHistory = async () => ideaHistory();
    const outlet = document.createElement('main');
    await history.diffView(outlet, { id: IDS.idea, to: '2' });
    const subtitle = text(outlet.querySelector('.page-subtitle'));
    assert.match(subtitle, /^Version 2 compared with 1 · Bruno edited · /);
    assert.deepEqual([...outlet.querySelectorAll('.diff-nav a')].map(text), ['Previous version', 'All versions']);
    assert.ok([...outlet.querySelectorAll('.change-tag')].every((tag) => ['added', 'changed', 'removed'].includes(text(tag))));
  });

  it('la prima versione non ha una precedente con cui confrontarsi', async () => {
    api.itemHistory = async () => ideaHistory();
    const outlet = document.createElement('main');
    await history.diffView(outlet, { id: IDS.idea, to: '1' });
    assert.match(text(outlet.querySelector('.page-subtitle')), /^Version 1 · Anna created · /);
    assert.deepEqual([...outlet.querySelectorAll('.diff-nav a')].map(text), ['Next version', 'All versions']);
  });

  for (const [name, op, message] of [
    ['l archiviazione', 'delete', 'The item was moved to the trash.'],
    ['il ripristino', 'restore', 'The item was restored from the trash.'],
    ['un salvataggio identico', 'update', 'No differences in the content.'],
  ]) {
    it(`${name} senza differenze lo spiega in inglese`, async () => {
      const same = { pitch: 'Sensors' };
      api.itemHistory = async () => [rev({ id: 1, version: 1, op: 'create', data: same }), rev({ id: 2, version: 2, op, data: same })];
      const outlet = document.createElement('main');
      await history.diffView(outlet, { id: IDS.idea, to: '2' });
      assert.equal(text(outlet.querySelector('.empty')), message);
    });
  }

  it('una versione sbagliata o assente lo dice in inglese', async () => {
    api.itemHistory = async () => ideaHistory();
    const outlet = document.createElement('main');
    await history.diffView(outlet, { id: IDS.idea, to: 'two' });
    assert.match(text(outlet), /Invalid version\./);
    await history.diffView(outlet, { id: 'non-un-id', to: '1' });
    assert.match(text(outlet), /Invalid version\./);
    await history.diffView(outlet, { id: IDS.idea, to: '9' });
    assert.match(text(outlet), /Version not found\./);
  });

  it('ripristinare una versione chiede conferma in inglese e lo conferma', async () => {
    api.itemHistory = async () => ideaHistory();
    api.revertItem = async () => ({ status: 'ok', item: { ...IDEA, version: 3 } });
    const outlet = document.createElement('main');
    await history.diffView(outlet, { id: IDS.idea, to: '1' });
    byText(outlet, 'button', 'Restore version 1').click();
    await flush();
    const dialog = document.querySelector('dialog');
    assert.equal(dialog.getAttribute('aria-label'), 'Restore this version?');
    assert.match(text(dialog.querySelector('p')), /^The content will go back to how it was in version 1\. A new version will be created: nothing done since then is lost from the history\./);
    byText(dialog, 'button', 'Restore').click();
    await flush(10);
    assert.match(text(document.querySelector('.toasts')), /Version 1 restored\./);
  });
});

describe('versioni di un elemento in inglese', () => {
  it('elenca le versioni con colonne e comandi in inglese', async () => {
    api.itemHistory = async () => ideaHistory();
    const outlet = document.createElement('main');
    await history.itemHistoryView(outlet, { id: IDS.idea });
    assert.equal(text(outlet.querySelector('h1')), 'Versions of “Solar sensors”');
    assert.equal(text(outlet.querySelector('.page-subtitle')), '2 versions');
    assert.deepEqual([...outlet.querySelectorAll('thead th')].map(text), ['From', 'To', 'Version', 'Author', 'Message', 'When']);
    const radios = [...outlet.querySelectorAll('input[type="radio"]')].map((r) => r.getAttribute('aria-label'));
    assert.deepEqual(radios.slice(0, 2), ['From version 2', 'To version 2']);
    assert.ok(byText(outlet, 'button', 'Compare the chosen versions'));
    byText(outlet, 'button', 'Who wrote what').click();
    assert.equal(text(outlet.querySelector('h2')), 'Who wrote what');
    assert.deepEqual([...outlet.querySelectorAll('h2 + table thead th')].map(text), ['Field', 'Content', 'Last change']);
  });

  it('una sola versione si dice al singolare', async () => {
    api.itemHistory = async () => ideaHistory().slice(0, 1);
    const outlet = document.createElement('main');
    await history.itemHistoryView(outlet, { id: IDS.idea });
    assert.equal(text(outlet.querySelector('.page-subtitle')), '1 version');
  });

  it('un elemento sbagliato o senza versioni lo dice in inglese', async () => {
    const outlet = document.createElement('main');
    await history.itemHistoryView(outlet, { id: 'non-un-id' });
    assert.match(text(outlet), /Invalid item\./);
    api.itemHistory = async () => [];
    await history.itemHistoryView(outlet, { id: IDS.idea });
    assert.match(text(outlet), /No versions found\./);
  });
});

describe('storico del team in inglese', () => {
  it('titolo, filtri e comandi sono in inglese', async () => {
    api.listRevisions = async () => Array.from({ length: 50 }, (_, i) => rev({ id: 100 - i, author_id: OTHER }));
    const outlet = document.createElement('main');
    const off = history.logView(outlet, {}, new URLSearchParams());
    await flush(5);
    assert.equal(text(outlet.querySelector('h1')), 'History');
    assert.match(text(outlet.querySelector('.page-subtitle')), /^Every save is a version: who, when, what and why\./);
    assert.deepEqual([...outlet.querySelectorAll('.filters .field-label')].map(text), ['Author', 'Type', 'Idea']);
    assert.deepEqual([...outlet.querySelectorAll('.filters select')].map((s) => s.options[0].textContent), ['All', 'All', 'All']);
    assert.equal(byText(outlet, 'button', 'Load more').hidden, false);
    off();
  });

  it('senza modifiche lo dice in inglese', async () => {
    api.listRevisions = async () => [];
    const outlet = document.createElement('main');
    const off = history.logView(outlet, {}, new URLSearchParams());
    await flush(5);
    assert.equal(text(outlet.querySelector('.empty')), 'No changes match these filters.');
    off();
  });

  it('nessun testo italiano dello storico resta nella pagina', async () => {
    api.listRevisions = async () => [rev({ id: 2, version: 2, op: 'revert', author_id: OTHER })];
    const outlet = document.createElement('main');
    const off = history.logView(outlet, {}, new URLSearchParams());
    await flush(5);
    outlet.querySelectorAll('.kind-badge, .badge, .filters select:nth-of-type(n)').forEach((el) => el.remove());
    const page = text(outlet);
    const it = textsFor('it').history;
    for (const phrase of [it.log.title, it.log.subtitle, it.log.more, it.verbs.revert, it.seeChanges]) assert.ok(!page.includes(phrase), phrase);
    assert.deepEqual(myItalian(text(outlet.querySelector('.page-header'))), []);
    off();
  });
});
