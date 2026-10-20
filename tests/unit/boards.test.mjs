import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom } from '../setup/dom.mjs';

let schema;
let concepts;
let roadmap;

before(async () => {
  setupDom();
  schema = await import('../../assets/js/schema.js');
  concepts = await import('../../assets/js/concepts.js');
  roadmap = await import('../../assets/js/roadmap.js');
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
  const stepKeys = new Set();
  for (const phase of roadmap.ROADMAP) {
    assert.ok(phase.title && phase.goal && phase.gate && phase.skipRisk, phase.key);
    for (const step of phase.steps) {
      assert.match(step.key, /^[a-z0-9-]{1,40}$/);
      assert.ok(!stepKeys.has(step.key), `chiave doppia: ${step.key}`);
      stepKeys.add(step.key);
      assert.ok(step.title && step.what && step.done && step.mistake && step.how.length >= 2, step.key);
      if (step.concept) assert.ok(concepts.conceptByKey(step.concept), `${step.key} → ${step.concept}`);
      assert.doesNotMatch([step.title, step.what, step.done, step.mistake, ...step.how].join(' '), /—/, step.key);
    }
  }
});

const ME_ID = '22222222-2222-4222-8222-222222222222';

test('the roadmap starts from the team, follows the board data and remembers manual steps', () => {
  const idea = { id: IDEA, status: 'nuova', data: {} };
  let rm = roadmap.roadmapState(idea, {});
  assert.equal(rm.next.step.key, 'team-canvas');
  assert.equal(rm.done, 0);
  assert.equal(rm.phases.find((p) => p.phase.key === 'azienda').counted, false, 'la fase azienda conta solo per l\'idea scelta');
  assert.equal(rm.total, roadmap.ROADMAP_STEPS.length - roadmap.ROADMAP.at(-1).steps.length);
  assert.equal(roadmap.roadmapState({ ...idea, status: 'scelta' }, {}).total, roadmap.ROADMAP_STEPS.length);

  const at = '2026-10-20T10:00:00.000Z';
  const marks = { 'team-canvas': `done|${ME_ID}|${at}`, deeptech: `skip|${ME_ID}|${at}`, vincoli: `skip|${ME_ID}|${at}` };
  rm = roadmap.roadmapState({ ...idea, data: { roadmap: marks, pitch: 'P', problem: 'Q', customer: 'C' } }, {
    interviews: Array.from({ length: 20 }, (_, i) => ({ status: i < 19 ? 'fatta' : 'da_fare', data: { commitment: i < 3 ? 'pagamento' : 'nessuno' } })),
    ideasCount: 12,
  });
  const step = (key) => rm.phases.flatMap((p) => p.steps).find((s) => s.step.key === key);
  assert.equal(step('team-canvas').status, 'done');
  assert.equal(step('team-canvas').mark.by, ME_ID);
  assert.equal(step('ruoli-tempo').isNext, true);
  assert.equal(step('deeptech').status, 'skip', 'un passo facoltativo può non servire');
  assert.equal(step('vincoli').status, 'todo', 'un passo obbligatorio non si salta');
  assert.equal(step('frase').status, 'todo', 'i dati suggeriscono, ma il passo lo segna una persona');
  assert.equal(step('frase').suggested, true);
  assert.equal(step('dieci-idee').suggested, true);
  assert.equal(step('interviste').suggested, false);
  assert.equal(step('interviste').progress, '19 su 20');
  assert.equal(step('impegni').suggested, true);
  assert.equal(step('team-canvas').suggested, false, 'un passo segnato non è più un suggerimento');
  assert.equal(rm.phases[1].previousIncomplete, true);

  const example = roadmap.roadmapState({ id: IDEA, status: 'validazione', data: {} }, { example: true });
  assert.ok(example.phases.slice(0, 5).every((p) => p.complete), 'negli esempi le fasi superate risultano fatte');
  assert.equal(example.next.phase.key, 'soluzione');
});

test('roadmap marks are validated and readable in the history', () => {
  const at = '2026-10-20T10:00:00.000Z';
  const clean = schema.sanitizeSnapshot('idea', {
    title: 'I',
    data: { roadmap: { mentor: `done|${ME_ID}|${at}`, 'Bad Key': `done|${ME_ID}|${at}`, voti: 'done|x|y', quote: `maybe|${ME_ID}|${at}`, vincoli: { by: ME_ID } } },
  });
  assert.deepEqual(clean.data.roadmap, { mentor: `done|${ME_ID}|${at}` });
  assert.equal(schema.sanitizeSnapshot('idea', { title: 'I', data: { roadmap: 'x' } }).data.roadmap, undefined);
  const ctx = { roadmapStep: (key) => roadmap.stepByKey(key)?.title, memberName: () => 'Anna' };
  assert.equal(schema.describePath('idea', 'data.roadmap.mentor', ctx), 'Roadmap › Trovate un mentor');
  assert.equal(schema.formatValue('idea', 'data.roadmap.mentor', `done|${ME_ID}|${at}`, ctx), 'fatto (Anna)');
  assert.equal(schema.formatValue('idea', 'data.roadmap.deeptech', `skip|${ME_ID}|${at}`, ctx), 'non serve (Anna)');
  assert.deepEqual(schema.parseRoadmapMark(schema.roadmapMark('done', ME_ID, at)), { state: 'done', by: ME_ID, at });
});

test('a persona photo is accepted only as a small raster data URL', () => {
  const jpeg = `data:image/jpeg;base64,${'A'.repeat(200)}`;
  const keep = (photo) => schema.sanitizeSnapshot('persona', { title: 'P', idea_id: IDEA, data: { photo } }).data.photo;
  assert.equal(keep(jpeg), jpeg);
  assert.equal(keep(`data:image/png;base64,${'A'.repeat(200)}=`), `data:image/png;base64,${'A'.repeat(200)}=`);
  assert.equal(keep('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), undefined, 'niente SVG');
  assert.equal(keep('javascript:alert(1)'), undefined);
  assert.equal(keep(`data:image/jpeg;base64,${'A'.repeat(130000)}`), undefined, 'troppo grande');
  assert.equal(keep('data:image/jpeg;base64,AAA"><script>'), undefined);
  assert.equal(schema.formatValue('persona', 'data.photo', jpeg), 'foto');
  assert.equal(schema.describePath('persona', 'data.photo'), 'Foto');
  const clean = schema.sanitizeSnapshot('persona', { title: 'P', idea_id: IDEA, data: { gender: 'donna', age_range: ' 30-50 anni ', objections: 'Prezzo', info_sources: 'Blog', gender_bad: 'x' } });
  assert.deepEqual(clean.data, { age_range: '30-50 anni', gender: 'donna', objections: 'Prezzo', info_sources: 'Blog' });
});
