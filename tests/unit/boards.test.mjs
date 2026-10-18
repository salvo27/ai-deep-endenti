import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom } from '../setup/dom.mjs';

let schema;
let concepts;
let guide;

before(async () => {
  setupDom();
  schema = await import('../../assets/js/schema.js');
  concepts = await import('../../assets/js/concepts.js');
  guide = await import('../../assets/js/guide.js');
});

const IDEA = '11111111-1111-4111-8111-111111111111';

test('the new idea boards need an idea and a title, the team boards never belong to an idea', () => {
  for (const kind of ['contact', 'deeptech', 'persona', 'vpc', 'market', 'competitors']) {
    const clean = schema.sanitizeSnapshot(kind, { title: 'X', idea_id: IDEA, data: {} });
    assert.equal(clean.idea_id, IDEA, kind);
    assert.equal(schema.snapshotProblem(kind, { ...clean, idea_id: null }), 'Scegli l\'idea a cui appartiene.', kind);
    assert.match(schema.snapshotProblem(kind, { ...clean, title: '' }) || '', /Manca il campo/, kind);
  }
  for (const kind of ['teamcanvas', 'equity']) {
    assert.equal(schema.sanitizeSnapshot(kind, { title: 'X', idea_id: IDEA, data: {} }).idea_id, null, kind);
    assert.equal(schema.routeFor({ kind }).startsWith('#/squadra'), true);
  }
});

test('people to interface with start as "to contact" and keep only known statuses', () => {
  assert.equal(schema.defaultStatus('contact'), 'da_contattare');
  assert.equal(schema.sanitizeSnapshot('contact', { title: 'X', status: 'inventato' }).status, 'da_contattare');
  assert.equal(schema.sanitizeSnapshot('contact', { title: 'X', status: 'in_contatto' }).status, 'in_contatto');
  const clean = schema.sanitizeSnapshot('contact', { title: 'X', data: { purpose: 'realizzazione', interview_id: 'non-un-id', next_date: '2026-02-30' } });
  assert.deepEqual(clean.data, { purpose: 'realizzazione' });
});

test('money and integer fields are validated and formatted', () => {
  const clean = schema.sanitizeSnapshot('market', { title: 'M', data: { tam: '30000000000', sam: 8.4e9 + 0.4, som: -5, som_year: 1999, approach: 'boh' } });
  assert.equal(clean.data.tam, 30000000000);
  assert.equal(clean.data.sam, 8400000000);
  assert.equal(clean.data.som, undefined);
  assert.equal(clean.data.som_year, undefined);
  assert.equal(clean.data.approach, undefined);
  assert.equal(schema.formatValue('market', 'data.tam', 30000000000), '30 mld €');
  assert.equal(schema.formatValue('market', 'data.som', 159000000), '159 mln €');
});

test('competitors keep only well formed rivals, features, cells and positions', () => {
  const clean = schema.sanitizeSnapshot('competitors', {
    title: 'C',
    data: {
      gap: 'Il vuoto',
      features: [{ id: 'f-a', label: 'Prezzo', importance: 'alta' }, { id: 'f-a', label: 'Doppione' }, { id: 'F A', label: 'Id non valido' }, { id: 'f-b', label: 'Senza importanza' }],
      rivals: [{ id: 'c-a', name: 'Alfa', type: 'indiretto', x: 3, y: 11, note: 'nota' }, { id: 'noi', name: 'Ruba il posto a noi' }, { id: 'c-b', name: '' }],
      cells: { 'f-a:noi': true, 'f-a:c-a': true, 'f-b:c-x': true, 'f-z:noi': true, 'f-b:noi': 'si' },
      axes: { x: { label: 'Prezzo', low: 'Caro', high: 'Economico', extra: 'via' }, y: {} },
      us: { x: 9, y: 9 },
      hacked: true,
    },
  });
  assert.deepEqual(clean.data.features.map((f) => [f.id, f.importance]), [['f-a', 'alta'], ['f-b', 'media']]);
  assert.deepEqual(clean.data.rivals, [{ id: 'c-a', name: 'Alfa', type: 'indiretto', x: 3, note: 'nota' }]);
  assert.deepEqual(Object.keys(clean.data.cells).sort(), ['f-a:c-a', 'f-a:noi']);
  assert.deepEqual(clean.data.axes, { x: { label: 'Prezzo', low: 'Caro', high: 'Economico' }, y: {} });
  assert.deepEqual(clean.data.us, { x: 9, y: 9 });
  assert.equal(clean.data.hacked, undefined);
  assert.equal(schema.describePath('competitors', 'data.cells.f-a:c-a'), 'Tabella di confronto');
  assert.equal(schema.describePath('competitors', 'data.rivals#c-a.name'), 'Concorrenti');
});

test('the Demmler method splits shares by weighted points', () => {
  const data = schema.sanitizeSnapshot('equity', {
    title: 'Q',
    data: {
      factors: [{ key: 'idea', label: 'Idea', weight: 10 }, { key: 'rischio', label: 'Rischio', weight: 0 }, { key: 'x', label: 'Peso assurdo', weight: 99 }],
      founders: [{ id: 'f-a', name: 'Anna' }, { id: 'f-b', name: 'Bruno' }],
      scores: { 'idea:f-a': 6, 'idea:f-b': 2, 'rischio:f-a': 10, 'idea:f-z': 5, 'x:f-a': 11 },
      vesting: '4 anni, cliff di un anno',
    },
  }).data;
  assert.equal(data.factors.find((f) => f.key === 'x').weight, 5);
  assert.equal(data.scores['idea:f-z'], undefined);
  assert.equal(data.scores['x:f-a'], undefined);
  const split = schema.equitySplit(data);
  assert.deepEqual(split.map((s) => [s.name, s.points, Math.round(s.percent)]), [['Anna', 60, 75], ['Bruno', 20, 25]]);
  assert.deepEqual(schema.equitySplit({ founders: [{ id: 'f-a', name: 'A' }] }).map((s) => s.percent), [null]);
});

test('every concept is unique and every field, phase and step points to an existing concept', () => {
  const keys = concepts.CONCEPTS.map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.length >= 80, `concetti: ${keys.length}`);
  const statuses = new Set(schema.KINDS.idea.statuses.map(([v]) => v));
  for (const concept of concepts.CONCEPTS) {
    assert.ok(concepts.CHAPTERS.some(([n]) => n === concept.chapter), concept.key);
    assert.ok(concept.phases.every((p) => statuses.has(p)), concept.key);
    assert.ok(concept.text.length > 60, concept.key);
    assert.doesNotMatch(`${concept.term} ${concept.text}`, /—/, concept.key);
  }
  for (const [kind, def] of Object.entries(schema.KINDS)) {
    for (const f of def.fields) if (f.concept) assert.ok(concepts.conceptByKey(f.concept), `${kind}.${f.key} → ${f.concept}`);
  }
  for (const phase of guide.PHASES) {
    assert.ok(statuses.has(phase.status));
    for (const key of phase.concepts) assert.ok(concepts.conceptByKey(key), `${phase.status} → ${key}`);
    for (const [, key] of phase.steps) if (key) assert.ok(concepts.conceptByKey(key), `${phase.status} → ${key}`);
  }
  assert.deepEqual(guide.PHASES.map((p) => p.status), [...statuses]);
});

test('the next step checklist follows the idea status and the board data', () => {
  const idea = { id: IDEA, status: 'nuova', data: { pitch: 'Frase', problem: 'P' } };
  let list = guide.phaseChecklist(idea, { contacts: [1, 2, 3, 4, 5].map(() => ({})) });
  assert.deepEqual(list.map((c) => c.done), [true, false, false, false, true, false]);
  assert.match(list[4].label, /5 su 5/);

  const interviews = Array.from({ length: 20 }, (_, i) => ({ status: i < 19 ? 'fatta' : 'da_fare', data: {} }));
  list = guide.phaseChecklist({ ...idea, status: 'esplorazione' }, { interviews });
  assert.equal(list.find((c) => /Interviste fatte/.test(c.label)).done, false);
  assert.match(list.find((c) => /Interviste fatte/.test(c.label)).label, /19 su 20/);

  list = guide.phaseChecklist({ ...idea, status: 'validazione' }, {
    interviews: ['pilota', 'pagamento', 'pagamento', 'demo'].map((commitment) => ({ status: 'fatta', data: { commitment } })),
    canvases: [{ data: { validated: { problem: true, segments: true, channels: true } } }],
  });
  assert.equal(list.find((c) => /Impegni forti/.test(c.label)).done, true);
  assert.equal(list.find((c) => /Blocchi del Lean Canvas/.test(c.label)).done, true);

  list = guide.phaseChecklist({ ...idea, status: 'scelta' }, { teamcanvas: { data: {} }, equity: { data: { founders: [{}], vesting: 'sì' } } });
  assert.equal(list.find((c) => /Team Canvas/.test(c.label)).done, true);
  assert.equal(list.find((c) => /Quote/.test(c.label)).done, true);
  assert.equal(list.find((c) => /Quote/.test(c.label)).href, '#/squadra/quote');
});
