import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, text, byText, typeInto } from '../setup/dom.mjs';
import { ME, boardItems, item, members } from '../setup/fixtures.mjs';
import { italianLeftovers } from './ideas-editing.helpers.mjs';

// On a device in English: the language is decided when the site loads, so the modules are imported after the choice.
useLanguage('en');
setupDom();
const store = await import('../../assets/js/store.js');
const schema = await import('../../assets/js/schema.js');
const boards = await import('../../assets/js/views/boards.js');
const canvas = await import('../../assets/js/views/canvas.js');
const competitors = await import('../../assets/js/views/competitors.js');

const AREAS = ['analysis', 'common'];
const PHOTO = `data:image/jpeg;base64,${'A'.repeat(400)}`;

beforeEach(() => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
});

const groupTitles = (el) => [...el.querySelectorAll('.fields-group h3')].map((h) => text(h));

describe('deep tech in inglese', () => {
  it('la scala TRL dice dove siamo e la prossima tappa', () => {
    const scale = boards.trlScale('4', '6');
    assert.equal(scale.querySelector('ol').getAttribute('aria-label'), 'TRL scale');
    assert.match(text(scale.querySelector('p')), / · next milestone: \S/);
    assert.equal(text(boards.trlScale(null, null).querySelector('p')), 'Current TRL not set');
  });

  it('la maturità della tecnologia ha la sua testata e non si ripete tra i campi', () => {
    const view = boards.deeptechView(item({ kind: 'deeptech', title: 'D', data: { trl_now: '3' } }));
    assert.match(text(view.querySelector('.section-label')), /^Technology maturity/);
    assert.ok(!groupTitles(view).includes(schema.fieldOf('deeptech', 'trl_now').group));
  });
});

describe('Value Proposition Canvas in inglese', () => {
  it('mappa del valore e profilo del cliente, con i riquadri da compilare', () => {
    const view = boards.vpcView(item({ kind: 'vpc', title: 'V', data: { segment: 'Dietitians', gains: 'More time', fit: 'Confirmed by 5 interviews' } }));
    assert.deepEqual([...view.querySelectorAll('h3')].map((h) => text(h)), ['Value map', 'Customer profile · Dietitians']);
    assert.deepEqual([...view.querySelectorAll('h4')].map((h) => text(h)), [
      'Products and services',
      'Gain creators',
      'Pain relievers',
      'Gains: the results they want',
      'Pains: difficulties and risks',
      'Jobs: what they want to get done',
      'Verified fit',
    ]);
    assert.equal(view.querySelectorAll('.vpc-block .muted').length, 5);
    assert.equal(text(view.querySelector('.vpc-block .muted')), 'To fill in');
    assert.equal(view.querySelector('.vpc-map').getAttribute('aria-label'), 'Value map');
    assert.equal(view.querySelector('.vpc-profile').getAttribute('aria-label'), 'Customer profile');
  });
});

describe('mercato in inglese', () => {
  const B = { tam_basis: 'x', sam_basis: 'x', som_basis: 'x', som_year: 2029 };

  for (const [name, data, expected] of [
    ['tutto in ordine', { tam: 100, sam: 50, som: 5, ...B }, []],
    ['SAM uguale al TAM', { tam: 100, sam: 100, som: 5, ...B }, []],
    ['SAM più grande del TAM', { tam: 100, sam: 101, som: 5, ...B }, ['The SAM is larger than the TAM: the serviceable market is a part of the total one.']],
    ['SOM uguale al SAM', { tam: 100, sam: 50, som: 50, ...B }, []],
    ['SOM più grande del SAM', { tam: 100, sam: 50, som: 51, ...B }, ['The SOM is larger than the SAM: the obtainable share is a part of the serviceable market.']],
    ['SOM senza anno', { tam: 100, sam: 50, som: 5, ...B, som_year: undefined }, ['The SOM has no reference year: 9 million in three years is not worth the same as 9 million in five.']],
    ['nessun calcolo', { tam: 100, sam: 50, som: 5, som_year: 2029 }, ['TAM', 'SAM', 'SOM'].map((l) => `The ${l} has no calculation or sources: without them the number is not credible.`)],
    ['niente di inserito', {}, []],
  ]) {
    it(`i controlli sulle cifre: ${name}`, () => {
      assert.deepEqual(boards.marketProblems(data), expected);
    });
  }

  it('la tabella dei livelli e i cerchi parlano inglese, gli importi hanno l euro davanti', () => {
    const view = boards.marketView(item({ kind: 'market', title: 'M', data: { tam: 30e9, sam: 3e9, som: 9e6, ...B } }));
    assert.deepEqual([...view.querySelectorAll('thead th')].map((t) => text(t)), ['Level', 'Value per year', 'Share of the level above', 'Calculation and sources']);
    assert.deepEqual([...view.querySelectorAll('tbody td:first-child .muted')].map((t) => text(t)), ['Total market', 'Serviceable market', 'Obtainable share in 2029']);
    assert.equal(view.querySelector('svg').getAttribute('aria-label'), 'TAM €30bn, SAM €3bn, SOM €9m');
    assert.equal(text(view.querySelectorAll('tbody tr')[1].children[2]), '10%');
  });

  it('senza cifre invita a inserirle, e il SOM senza anno non ne nomina uno', () => {
    const view = boards.marketView(item({ kind: 'market', title: 'M', data: {} }));
    assert.match(text(view), /Enter TAM, SAM and SOM to see the three circles\./);
    assert.match(text(view), /Obtainable share/);
    assert.doesNotMatch(text(view), /Obtainable share in/);
  });

  it('i gruppi già mostrati nella tabella non si ripetono tra i campi', () => {
    const view = boards.marketView(item({ kind: 'market', title: 'M', data: { tam: 1 } }));
    for (const key of ['tam', 'sam', 'som']) assert.ok(!groupTitles(view).includes(schema.fieldOf('market', key).group), key);
  });
});

describe('buyer persona in inglese', () => {
  const persona = (data) => item({ id: 'aaaaaaaa-0000-4000-8000-000000000001', kind: 'persona', title: 'Rita Quaglia', data });

  it('la scheda ha foto, ruolo e dati demografici in inglese', () => {
    const view = boards.personaView(persona({ photo: PHOTO, role: 'Dietitian', early_adopter: 'forse' }));
    assert.equal(view.querySelector('img').getAttribute('alt'), 'Photo: Rita Quaglia');
    assert.deepEqual([...view.querySelectorAll('.persona-facts dt')].map((d) => text(d)), ['In the purchase', 'Segment', 'Early adopter', 'Age', 'Gender', 'Area', 'Income', 'Education']);
    assert.equal(text(view.querySelectorAll('.persona-facts dd')[2]), 'Maybe');
    assert.deepEqual(italianLeftovers(text(view.querySelector('.persona-hero')), AREAS), []);
  });

  for (const [value, expected] of [
    ['si', 'Yes'],
    ['forse', 'Maybe'],
    ['no', 'No'],
  ]) {
    it(`early adopter "${value}" si legge ${expected}`, () => {
      assert.equal(text(boards.personaView(persona({ early_adopter: value })).querySelectorAll('.persona-facts dd')[2]), expected);
    });
  }

  it('senza ruolo lo dice, e i gruppi già in testata non si ripetono', () => {
    const view = boards.personaView(persona({}));
    assert.equal(text(view.querySelector('.persona-role')), 'Role not set');
    for (const key of ['photo', 'age_range']) assert.ok(!groupTitles(view).includes(schema.fieldOf('persona', key).group), key);
  });

  it('la scheda breve segnala gli early adopter', () => {
    const card = boards.personaCard(persona({ photo: PHOTO, early_adopter: 'si' }));
    assert.equal(text(card.querySelector('.badge-strong')), 'Early adopter');
    assert.equal(card.querySelector('img').getAttribute('alt'), 'Photo: Rita Quaglia');
  });
});

describe('Lean Canvas in inglese', () => {
  it('i riquadri validati lo dicono, anche nell editor', () => {
    const view = canvas.canvasView(item({ kind: 'canvas', data: { problem: 'P', validated: { problem: true } } }));
    const badge = view.querySelector('.validated');
    assert.equal(text(badge), 'validated');
    assert.equal(badge.getAttribute('title'), 'Validated with data');
    const editor = canvas.canvasEditor({ data: {} }, () => {});
    assert.equal(text(editor.querySelector('.lc-head .check')), 'validated');
  });
});

describe('concorrenti in inglese', () => {
  const RIVALS = [
    { id: 'c-1', name: 'Acme', type: 'diretto', x: 2, y: 8, note: 'Cheap' },
    { id: 'c-2', name: 'Paper', type: 'indiretto' },
  ];
  const data = () => ({
    rivals: structuredClone(RIVALS),
    features: [{ id: 'f-1', label: 'Offline mode', importance: 'alta' }],
    cells: { 'f-1:noi': true },
    axes: { x: { label: 'Price', low: 'Expensive', high: 'Cheap' }, y: { label: 'Ease of use', low: 'Hard', high: 'Easy' } },
    us: { x: 7, y: 7 },
  });

  it('la tabella di confronto ha noi, i concorrenti e le spunte leggibili', () => {
    const table = competitors.benchmarkTable(data());
    assert.deepEqual([...table.querySelectorAll('thead th')].map((t) => text(t)), ['Feature', 'Importance', 'Us', 'Acme', 'Paper (ind.)']);
    assert.equal(table.querySelectorAll('thead th')[4].getAttribute('title'), 'Indirect competitor');
    assert.deepEqual([...table.querySelectorAll('.bm-cell')].map((c) => c.getAttribute('aria-label')), ['Yes', 'No', 'No']);
    assert.equal(text(competitors.benchmarkTable({})), 'No features to compare.');
  });

  it('il grafico dice gli assi e chi non ha una posizione', () => {
    const chart = competitors.positionChart(data());
    assert.equal(chart.querySelector('svg').getAttribute('aria-label'), 'Chart: Price and Ease of use');
    assert.equal(text(chart.querySelector('figcaption')), 'Horizontal: Price · Vertical: Ease of use · No position: Paper');
    const unnamed = competitors.positionChart({ us: { x: 1, y: 1 } });
    assert.equal(unnamed.querySelector('svg').getAttribute('aria-label'), 'Chart: horizontal axis and vertical axis');
    assert.equal(text(unnamed.querySelector('figcaption')), 'Horizontal: - · Vertical: -');
    assert.equal(text(competitors.positionChart({ rivals: [] , us: {} })), 'Enter the position of the competitors to see the chart.');
  });

  it('la scheda dei concorrenti ha la tabella e il tipo di ciascuno', () => {
    const view = competitors.competitorsView(item({ kind: 'competitors', title: 'C', data: data() }));
    assert.match(text(view.querySelector('.section-label')), /^Comparison table/);
    assert.deepEqual([...view.querySelectorAll('.rival-list .badge')].map((b) => text(b)), ['Direct', 'Indirect']);
    assert.match(text(view.querySelector('.position-chart svg')), /^Expensive/);
  });

  it('l editor ha sezioni, segnaposto e comandi in inglese', () => {
    const working = { data: data() };
    const editor = competitors.competitorsEditor(working, () => {});
    assert.deepEqual([...editor.querySelectorAll('h2')].map((h) => text(h)), ['Competitors', 'Features to compare', 'Comparison table', 'Two-axis chart']);
    assert.match(text(editor), /Direct and indirect\. The two numbers \(from 0 to 10\) are the position on the chart\./);
    assert.match(text(editor), /Only the ones that matter to the customer; skip the ones everybody has\./);
    const name = editor.querySelector('input[aria-label="Competitor name"]');
    assert.equal(name.getAttribute('placeholder'), 'Competitor name');
    assert.deepEqual([...editor.querySelector('select[aria-label="Type of competitor"]').options].map((o) => o.textContent), ['Direct', 'Indirect']);
    assert.ok(editor.querySelector('input[aria-label="Horizontal position of Acme"][placeholder="Horiz."]'));
    assert.ok(editor.querySelector('input[aria-label="Vertical position of Acme"][placeholder="Vert."]'));
    assert.equal(editor.querySelector('input[aria-label="Note on the competitor"]').getAttribute('placeholder'), 'Note: price, strengths');
    assert.ok(editor.querySelector('button[aria-label="Remove Acme"]'));
    assert.ok(editor.querySelector('button[aria-label="Remove Offline mode"]'));
    assert.equal(editor.querySelector('input[aria-label="Feature"]').getAttribute('placeholder'), 'A feature that matters to the customer');
    for (const option of editor.querySelector('select[aria-label="Importance to the customer"]').options) assert.match(option.textContent, /importance$/i);
    assert.equal(text(editor.querySelector('table th')), 'Who offers what');
    assert.ok(editor.querySelector('input[aria-label="Offline mode offered by Acme"]'));
    assert.deepEqual([...editor.querySelectorAll('.edit-row input[placeholder="What it measures"]')].length, 2);
    assert.ok(editor.querySelector('input[placeholder="Low value (0)"][aria-label="Horizontal axis: Low value (0)"]'));
    assert.ok(editor.querySelector('input[aria-label="Our horizontal position"]'));
    assert.ok(byText(editor, '.field-label', 'Our position'));
    for (const label of ['Add a competitor', 'Add a feature']) assert.ok(byText(editor, 'button', label), label);
    assert.deepEqual(italianLeftovers(text(editor), AREAS), []);
  });

  it('nomi vuoti e tabella senza funzionalità', () => {
    const working = { data: { rivals: [{ id: 'c-9', name: '', type: 'diretto' }] } };
    const editor = competitors.competitorsEditor(working, () => {});
    assert.ok(editor.querySelector('button[aria-label="Remove competitor"]'));
    assert.match(text(editor), /Add the features to fill in the table\./);
    byText(editor, 'button', 'Add a feature').click();
    assert.ok(byText(editor, 'th', 'Unnamed'));
    assert.ok(editor.querySelector('button[aria-label="Remove feature"]'));
  });

  it('a 15 concorrenti il pulsante lascia il posto al limite', () => {
    const many = (n) => Array.from({ length: n }, (_, i) => ({ id: `c-${i}`, name: `R${i}`, type: 'diretto' }));
    let editor = competitors.competitorsEditor({ data: { rivals: many(14) } }, () => {});
    assert.ok(byText(editor, 'button', 'Add a competitor'));
    editor = competitors.competitorsEditor({ data: { rivals: many(15) } }, () => {});
    assert.equal(byText(editor, 'button', 'Add a competitor'), null);
    assert.match(text(editor), /15 competitors at most: keep the ones that matter to the customer\./);
  });

  it('scrivere il nome di un concorrente aggiorna la tabella', () => {
    const working = { data: data() };
    const editor = competitors.competitorsEditor(working, () => {});
    typeInto(editor.querySelector('input[aria-label="Competitor name"]'), 'Acme Plus');
    assert.equal(working.data.rivals[0].name, 'Acme Plus');
    assert.ok(byText(editor, 'th', 'Acme Plus'));
  });
});
