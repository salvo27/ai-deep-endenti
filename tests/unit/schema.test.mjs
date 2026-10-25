import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_KINDS,
  DEFAULT_CRITERIA,
  KINDS,
  autoInterviewTitle,
  defaultStatus,
  describePath,
  formatValue,
  routeFor,
  sanitizeSnapshot,
  snapshotProblem,
  statusLabel,
} from '../../assets/js/schema.js';

const IDEA = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';

test('every board kind declares labels, statuses and fields consistently', () => {
  for (const kind of BOARD_KINDS) {
    const def = KINDS[kind];
    assert.ok(def.label && def.plural && def.titleLabel && def.icon, kind);
    const keys = def.fields.map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length, `chiavi duplicate in ${kind}`);
    for (const f of def.fields) {
      assert.ok(f.label, `${kind}.${f.key} senza etichetta`);
      if (f.type === 'select') assert.ok(f.options.length > 1, `${kind}.${f.key} senza opzioni`);
    }
  }
});

test('the statuses match those allowed by the database', () => {
  assert.deepEqual(KINDS.idea.statuses.map(([v]) => v), ['nuova', 'esplorazione', 'validazione', 'scelta', 'parcheggiata', 'scartata']);
  assert.deepEqual(KINDS.experiment.statuses.map(([v]) => v), ['pianificato', 'in_corso', 'concluso']);
  assert.deepEqual(KINDS.interview.statuses.map(([v]) => v), ['da_fare', 'fatta', 'analizzata']);
  assert.deepEqual(KINDS.decision.statuses.map(([v]) => v), ['proposta', 'presa', 'rivista']);
  assert.equal(defaultStatus('canvas'), null);
  assert.equal(statusLabel('idea', 'validazione'), 'In validazione');
});

test('sanitizeSnapshot drops unknown fields and malformed values', () => {
  const clean = sanitizeSnapshot('idea', {
    title: '  Idea\nalfa  ',
    status: 'inventato',
    idea_id: IDEA,
    data: {
      pitch: '  uno ',
      owner: 'non-uuid',
      technologies: ['XAI', 'xai', ''],
      sector: 'Settore A\ndelle PMI',
      evil: '<script>',
      origin: 'r-xai:c-saanza',
      __proto__: { polluted: true },
    },
  });
  assert.deepEqual(clean, {
    title: 'Idea alfa',
    status: 'nuova',
    idea_id: null,
    data: { pitch: 'uno', technologies: ['XAI'], sector: 'Settore A delle PMI', origin: 'r-xai:c-saanza' },
  });
  assert.equal({}.polluted, undefined);
});

test('sanitizeSnapshot validates every field type', () => {
  const interview = sanitizeSnapshot('interview', {
    title: 'Int',
    status: 'fatta',
    idea_id: IDEA,
    data: { date: '2026-02-30', interviewer: MEMBER, problem_intensity: '4', commitment: 'pilota', experiment_id: 'x' },
  });
  assert.deepEqual(interview.data, { interviewer: MEMBER, problem_intensity: 4, commitment: 'pilota' });
  assert.equal(interview.idea_id, IDEA);

  const decision = sanitizeSnapshot('decision', { title: 'D', status: 'presa', idea_id: IDEA, data: { decided_by: [MEMBER, MEMBER, 'x'], ideas: [IDEA] } });
  assert.equal(decision.idea_id, null);
  assert.deepEqual(decision.data, { decided_by: [MEMBER], ideas: [IDEA] });

  const canvas = sanitizeSnapshot('canvas', { title: 'C', idea_id: IDEA, data: { problem: 'p', validated: { problem: true, solution: 'yes', nope: true } } });
  assert.deepEqual(canvas.data, { problem: 'p', validated: { problem: true } });
  assert.equal(canvas.status, null);
});

test('criteria, scores and generator are sanitized by shape', () => {
  const criteria = sanitizeSnapshot('criteria', { data: { criteria: [{ label: 'Mercato', weight: 9 }, { key: 'mercato', label: 'Altro', weight: 2 }, { label: '' }] } });
  assert.deepEqual(criteria.data.criteria.map((c) => [c.key, c.weight]), [['mercato', 1], ['mercato-x', 2]]);

  const score = sanitizeSnapshot('score', { data: { scores: { [IDEA]: { mercato: 4, team: 9, 'Bad Key': 3 }, nope: { a: 1 } }, notes: { [IDEA]: ' nota ', x: 'y' } } });
  assert.deepEqual(score.data, { scores: { [IDEA]: { mercato: 4 } }, notes: { [IDEA]: 'nota' } });

  const gen = sanitizeSnapshot('generator', {
    data: {
      rows: [{ id: 'r-a', label: 'A' }, { id: 'r-a', label: 'dup' }, { id: 'R B', label: 'bad id' }],
      cols: [{ id: 'c-x', label: 'X', people: [IDEA, IDEA, 'non uuid'], others: '  Prof. esterno  ' }],
      cells: { 'r-a:c-x': { text: 'ok', potential: 2 }, 'r-z:c-x': { text: 'orfana' }, 'r-a:c-x2': { text: 'no' } },
    },
  });
  assert.deepEqual(gen.data.rows, [{ id: 'r-a', label: 'A' }]);
  assert.deepEqual(gen.data.cols, [{ id: 'c-x', label: 'X', people: [IDEA], others: 'Prof. esterno' }], 'persone: solo id validi, senza doppioni');
  assert.deepEqual(gen.data.cells, { 'r-a:c-x': { text: 'ok', potential: 2 } });
});

test('a scoring photo keeps only well formed criteria, ideas and votes', () => {
  const OTHER_IDEA = '22222222-2222-4222-8222-222222222222';
  const MEMBER = '33333333-3333-4333-8333-333333333333';
  const photo = sanitizeSnapshot('scoresnap', {
    title: '  Prima della riunione  ',
    idea_id: IDEA,
    data: {
      criteria: [{ key: 'mercato', label: 'Mercato', weight: 3 }, { label: '' }],
      ideas: [{ id: IDEA, title: 'Alfa', status: 'boh' }, { id: IDEA, title: 'doppia' }, { id: 'non uuid', title: 'X' }, { id: OTHER_IDEA, title: '' }],
      votes: {
        [MEMBER]: { [IDEA]: { mercato: 4, team: 3, 'Bad Key': 2 }, [OTHER_IDEA]: { mercato: 5 } },
        'non uuid': { [IDEA]: { mercato: 1 } },
        [IDEA]: { [IDEA]: { mercato: 9 } },
      },
      names: { [MEMBER]: '  Anna  ', [IDEA]: 'nessuno' },
    },
  });
  assert.equal(photo.title, 'Prima della riunione');
  assert.equal(photo.idea_id, null, 'una fotografia non appartiene a un\'idea');
  assert.deepEqual(photo.data, {
    criteria: [{ key: 'mercato', label: 'Mercato', description: '', weight: 3 }],
    ideas: [{ id: IDEA, title: 'Alfa', status: 'nuova' }],
    votes: { [MEMBER]: { [IDEA]: { mercato: 4 } } },
    names: { [MEMBER]: 'Anna' },
  });
  assert.match(snapshotProblem('scoresnap', { title: '', idea_id: null }), /nome/);
  assert.equal(routeFor({ kind: 'scoresnap', id: IDEA }), `#/valutazione?foto=${IDEA}`);
  assert.equal(describePath('scoresnap', 'data.votes'), 'Voti');
});

test('snapshotProblem requires titles and parent ideas where the database does', () => {
  assert.match(snapshotProblem('idea', { title: '', idea_id: null }), /Nome/);
  assert.match(snapshotProblem('experiment', { title: 'E', idea_id: null }), /idea/);
  assert.equal(snapshotProblem('interview', { title: 'I', idea_id: null }), null);
  assert.equal(snapshotProblem('score', { title: '', idea_id: null }), null);
  assert.equal(sanitizeSnapshot('experiment', { title: 'x', idea_id: 'bad' }).idea_id, null);
  assert.throws(() => sanitizeSnapshot('boh', {}), /Tipo sconosciuto/);
});

test('autoInterviewTitle builds a title from role and organization', () => {
  assert.equal(autoInterviewTitle({ role: 'Responsabile acquisti', organization: 'Azienda Rossi' }), 'Responsabile acquisti, Azienda Rossi');
  assert.equal(autoInterviewTitle({}), 'Intervista');
});

test('describePath gives readable labels for history paths', () => {
  const ctx = {
    ideaTitle: (id) => (id === IDEA ? 'Idea alfa' : null),
    criterionLabel: (k) => (k === 'mercato' ? 'Mercato' : null),
    axisLabel: (id) => ({ 'r-a': 'XAI', 'c-x': 'Settore A' })[id] || null,
  };
  assert.equal(describePath('idea', 'title'), 'Nome dell\'idea');
  assert.equal(describePath('idea', 'status'), 'Stato');
  assert.equal(describePath('idea', 'data.problem'), 'Problema');
  assert.equal(describePath('idea', 'data.origin'), 'Origine nel generatore');
  assert.equal(describePath('canvas', 'data.validated.problem'), 'Problema › validato');
  assert.equal(describePath('score', `data.scores.${IDEA}.mercato`, ctx), 'Voti › Idea alfa › Mercato');
  assert.equal(describePath('score', `data.notes.${IDEA}`, ctx), 'Note › Idea alfa');
  assert.equal(describePath('criteria', 'data.criteria#mercato.weight', ctx), 'Criteri › Mercato › Peso');
  assert.equal(describePath('criteria', 'data.criteria.#order', ctx), 'Criteri › ordine');
  assert.equal(describePath('generator', 'data.cells.r-a:c-x.text', ctx), 'XAI × Settore A');
  assert.equal(describePath('generator', 'data.cells.r-a:c-x.potential', ctx), 'XAI × Settore A › potenziale');
  assert.equal(describePath('generator', 'data.rows#r-a.label', ctx), 'Righe › XAI');
  assert.equal(describePath('generator', 'data.rows#r-a.people', ctx), 'Righe › XAI › persone');
  assert.equal(describePath('generator', 'data.cols.#order', ctx), 'Colonne › ordine');
});

test('formatValue resolves ids, options and scales', () => {
  const ctx = { memberName: () => 'Bruno', ideaTitle: () => 'Idea X', itemTitle: () => 'Esp' };
  assert.equal(formatValue('idea', 'status', 'scelta'), 'Scelta');
  assert.equal(formatValue('canvas', 'idea_id', IDEA, ctx), 'Idea X');
  assert.equal(formatValue('idea', 'data.owner', MEMBER, ctx), 'Bruno');
  assert.deepEqual(formatValue('decision', 'data.decided_by', [MEMBER], ctx), ['Bruno']);
  assert.equal(formatValue('interview', 'data.commitment', 'pilota'), 'Disponibile a un pilota');
  assert.equal(formatValue('interview', 'data.problem_intensity', 4), '4/5');
  assert.equal(formatValue('interview', 'data.experiment_id', IDEA, ctx), 'Esp');
  assert.equal(formatValue('canvas', 'data.validated.problem', true), 'sì');
  assert.equal(formatValue('idea', 'data.pitch', undefined), '');
});

test('routeFor sends each kind to its page', () => {
  assert.equal(routeFor({ kind: 'idea', id: IDEA }), `#/idea/${IDEA}`);
  assert.equal(routeFor({ kind: 'experiment', id: IDEA }), `#/elemento/${IDEA}`);
  assert.equal(routeFor({ kind: 'score', id: IDEA }), '#/valutazione');
  assert.equal(routeFor({ kind: 'generator', id: IDEA }), '#/generatore');
  assert.equal(routeFor(null), '#/');
});

test('the default criteria are already valid', () => {
  const clean = sanitizeSnapshot('criteria', { data: { criteria: DEFAULT_CRITERIA } });
  assert.deepEqual(clean.data.criteria, DEFAULT_CRITERIA);
});
