import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, text, byText, typeInto } from '../setup/dom.mjs';
import { italianWords } from '../setup/italian.mjs';
import { ME, OTHER, item, members } from '../setup/fixtures.mjs';

// Su un dispositivo in inglese: la lingua si decide quando il sito si carica, per questo i moduli arrivano dopo la scelta.
useLanguage('en');

let api;
let store;
let generator;
let original;
let outlet;
let off;

const GRID = 'f1000000-0000-4000-8000-000000000001';
const BORN = 'f1000000-0000-4000-8000-000000000002';
const BORN2 = 'f1000000-0000-4000-8000-000000000003';

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  generator = await import('../../assets/js/views/generator.js');
  original = { ...api };
});

// Dati inglesi, così il controllo dell'italiano rimasto non scatta sui nomi delle fixture.
function grid(over = {}) {
  return item({
    id: GRID,
    kind: 'generator',
    title: 'Idea generator',
    data: {
      rows: [{ id: 'r-ai', label: 'AI', people: [OTHER], others: 'Outside lecturer' }],
      cols: [{ id: 'c-health', label: 'Health' }, { id: 'c-retail', label: 'Retail' }],
      cells: { 'r-ai:c-health': { text: 'Triage helper', potential: 3 } },
    },
    ...over,
  });
}

beforeEach(() => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  store.applyItem(grid());
  store.applyItem(item({ id: BORN, kind: 'idea', title: 'Triage bot', status: 'nuova', data: { origin: 'r-ai:c-health' } }));
  outlet = document.createElement('main');
  document.body.querySelectorAll('dialog, .toasts').forEach((d) => d.remove());
  off = null;
});

afterEach(() => {
  off?.();
  Object.assign(api, original);
  history.replaceState(null, '', '#/');
});

// Quello che si legge, anche dai lettori di schermo, senza gli avatar e la crocetta della finestra (altri moduli).
function leftovers(root) {
  const copy = root.cloneNode(true);
  copy.querySelectorAll('.avatar, .modal-header .icon-btn').forEach((el) => el.remove());
  const attributes = [...copy.querySelectorAll('[aria-label],[title],[placeholder]')].flatMap((el) =>
    ['aria-label', 'title', 'placeholder'].map((name) => el.getAttribute(name)).filter(Boolean),
  );
  return italianWords([copy.textContent, ...attributes].join(' '));
}
const dialog = () => [...document.querySelectorAll('dialog')].at(-1);
const toasts = () => text(document.querySelector('.toasts'));

describe('Generatore in inglese', () => {
  it('la griglia ha intestazione, pulsanti e celle in inglese', () => {
    off = generator.generatorView(outlet);
    assert.equal(text(outlet.querySelector('h1')), 'Generator');
    assert.match(text(outlet), /Rows: what the team can do, with who has that skill\. Columns: sectors, with who knows them\. Each cell is a starting point; the promising ones become ideas\./);
    assert.ok(byText(outlet, '.page-actions button', 'Row'));
    assert.ok(byText(outlet, '.page-actions button', 'Column'));
    assert.ok(outlet.querySelector('button[aria-label="Edit AI"]'));
    assert.ok(outlet.querySelector('button[aria-label="Remove Health"]'));
    const cells = [...outlet.querySelectorAll('.gen-cell-btn')];
    assert.equal(cells[0].getAttribute('aria-label'), 'AI for Health');
    assert.equal(text(cells[0].querySelector('.badge')), '1 idea');
    assert.equal(cells[1].querySelector('.badge'), null);
    assert.deepEqual(leftovers(outlet), []);
  });

  it('le idee nate da una cella si contano al plurale', () => {
    store.applyItem(item({ id: BORN2, kind: 'idea', title: 'Triage app', status: 'nuova', data: { origin: 'r-ai:c-health' } }));
    off = generator.generatorView(outlet);
    assert.equal(text(outlet.querySelector('.gen-cell-btn .badge')), '2 ideas');
  });

  it('una cella si apre con campi, persone e azioni in inglese e si salva', async () => {
    const saved = [];
    api.saveItem = async (args) => {
      saved.push(args);
      return { status: 'ok', item: item({ ...store.getItem(GRID), version: saved.length + 1, data: args.snapshot.data }) };
    };
    off = generator.generatorView(outlet);
    outlet.querySelector('.gen-cell-btn').click();
    const box = dialog();
    assert.equal(text(box.querySelector('h2')), 'AI × Health');
    assert.equal(text(box.querySelector('.field-label')), 'Starting points');
    assert.equal(box.querySelector('textarea').getAttribute('placeholder'), 'Starting points, possible customers, related papers');
    assert.deepEqual([...box.querySelectorAll('select option')].map((o) => o.textContent), ['Potential: not rated', 'Potential: low', 'Potential: medium', 'Potential: high']);
    assert.match(text(box), /Skill \(AI\): Bruno, Outside lecturer/);
    assert.ok(byText(box, 'button', 'Ask Claude for ideas'));
    assert.ok(byText(box, 'button', 'Create an idea from this cell'));
    assert.match(text(box), /Ideas born from this cell/);
    assert.ok(byText(box, '.modal-actions button', 'Close'));
    assert.deepEqual(leftovers(box), []);
    typeInto(box.querySelector('textarea'), 'Night shifts');
    byText(box, '.modal-actions button', 'Save the cell').click();
    await flush(10);
    assert.equal(saved[0].message, 'Generator: AI × Health');
    assert.match(toasts(), /Cell saved\./);
  });

  it('le persone che conoscono il settore hanno la loro riga', () => {
    store.applyItem(grid({ version: 2, data: { ...grid().data, cols: [{ id: 'c-health', label: 'Health', people: [ME] }] } }));
    off = generator.generatorView(outlet);
    outlet.querySelector('.gen-cell-btn').click();
    assert.match(text(dialog()), /Sector \(Health\): Anna/);
  });

  it('il pannello di Claude propone di aggiungere le idee agli spunti', async () => {
    api.invokeClaude = async () => ({ text: 'Triage at home' });
    off = generator.generatorView(outlet);
    outlet.querySelector('.gen-cell-btn').click();
    byText(dialog(), 'button', 'Ask Claude for ideas').click();
    await flush(5);
    assert.ok(byText(dialog(), 'button', 'Add to the starting points'));
  });

  it('aggiungere e modificare righe e colonne usa titoli, campi e messaggi inglesi', async () => {
    const saved = [];
    api.saveItem = async (args) => {
      saved.push(args);
      return { status: 'ok', item: item({ ...store.getItem(GRID), version: saved.length + 1, data: args.snapshot.data }) };
    };
    off = generator.generatorView(outlet);
    byText(outlet, 'button', 'Row').click();
    await flush();
    let box = dialog();
    assert.equal(text(box.querySelector('h2')), 'New row');
    assert.deepEqual([...box.querySelectorAll('.field-label')].map(text), ['Name', 'Who in the team has this skill', 'Other people with this skill']);
    assert.equal(box.querySelectorAll('input[type="text"]')[1].getAttribute('placeholder'), 'For example a lecturer or an outside partner');
    assert.ok(byText(box, '.modal-actions button', 'Cancel'));
    assert.deepEqual(leftovers(box), []);
    box.querySelector('input').value = 'Robotics';
    byText(box, '.modal-actions button', 'Save').click();
    await flush(10);
    assert.equal(saved[0].message, 'Generator: new row "Robotics"');

    byText(outlet, 'button', 'Column').click();
    await flush();
    box = dialog();
    assert.equal(text(box.querySelector('h2')), 'New column');
    assert.deepEqual([...box.querySelectorAll('.field-label')].map(text), ['Name', 'Who in the team knows this sector', 'Other people who know the sector']);
    box.querySelector('input').value = 'Energy';
    byText(box, '.modal-actions button', 'Save').click();
    await flush(10);
    assert.equal(saved[1].message, 'Generator: new column "Energy"');

    outlet.querySelector('button[aria-label="Edit AI"]').click();
    await flush();
    box = dialog();
    assert.equal(text(box.querySelector('h2')), 'Edit the row');
    byText(box, '.modal-actions button', 'Save').click();
    await flush(10);
    assert.equal(saved[2].message, 'Generator: row "AI" edited');

    outlet.querySelector('button[aria-label="Edit Health"]').click();
    await flush();
    assert.equal(text(dialog().querySelector('h2')), 'Edit the column');
    byText(dialog(), '.modal-actions button', 'Save').click();
    await flush(10);
    assert.equal(saved[3].message, 'Generator: column "Health" edited');
  });

  it('senza membri lo dice, e togliere una riga chiede conferma in inglese', async () => {
    const saved = [];
    api.saveItem = async (args) => {
      saved.push(args);
      return { status: 'ok', item: item({ ...store.getItem(GRID), version: saved.length + 1, data: args.snapshot.data }) };
    };
    off = generator.generatorView(outlet);
    store.setMembers([]);
    byText(outlet, 'button', 'Row').click();
    await flush();
    assert.match(text(dialog()), /No members in the team\./);
    dialog().remove();
    outlet.querySelector('button[aria-label="Remove AI"]').click();
    await flush();
    const box = dialog();
    assert.match(text(box.querySelector('.modal-body')), /^Remove "AI" from the grid\? The linked cells stay in the history\.$/);
    byText(box, 'button', 'Remove').click();
    await flush(10);
    assert.equal(saved[0].message, 'Generator: "AI" removed');
  });

  it('senza griglia invita a crearla e la crea in inglese', async () => {
    store.resetStore();
    store.state.user = { id: ME };
    store.setMembers(members());
    let created = null;
    api.createItem = async (args) => {
      created = args;
      return item({ id: GRID, kind: 'generator', title: args.title, data: args.data });
    };
    off = generator.generatorView(outlet);
    assert.equal(text(outlet.querySelector('h1')), 'Generator');
    assert.match(text(outlet), /Cross the team's skills with sectors to find new ideas\./);
    assert.deepEqual(leftovers(outlet), []);
    byText(outlet, 'button', 'Create the default grid').click();
    await flush(10);
    assert.equal(created.title, 'Idea generator');
    assert.equal(created.message, 'Initial grid');
    assert.deepEqual(created.data.rows.map((r) => [r.id, r.label]), [['r-ml', 'Machine learning'], ['r-agenti', 'LLM agents'], ['r-ottim', 'Optimisation']]);
    assert.deepEqual(created.data.cols.map((c) => [c.id, c.label]), [['c-sanita', 'Healthcare'], ['c-finanza', 'Finance'], ['c-industria', 'Industry']]);
    assert.deepEqual(leftovers(outlet), []);
  });
});
