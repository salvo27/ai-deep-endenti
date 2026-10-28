import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isHeldConversation } from '../../assets/js/schema.js';
import {
  comparePhotos,
  countMissing,
  criteriaWeightsChanged,
  criterionStats,
  evidenceByIdea,
  ideaScore,
  missingVotes,
  photoRanking,
  ranking,
  scaleEnds,
} from '../../assets/js/scoring.js';

const criteria = [
  { key: 'cliente', label: 'Cliente', weight: 3 },
  { key: 'mercato', label: 'Mercato', weight: 1 },
  { key: 'extra', label: 'Extra', weight: 0 },
];
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const scores = [
  { created_by: 'u1', data: { scores: { [A]: { cliente: 5, mercato: 1, extra: 5 }, [B]: { cliente: 2 } } } },
  { created_by: 'u2', data: { scores: { [A]: { cliente: 3, mercato: 3 } } } },
];

test('criterionStats ignores missing votes', () => {
  assert.deepEqual(criterionStats([5, 3, undefined]), { count: 2, mean: 4, min: 3, max: 5, spread: 2 });
  assert.deepEqual(criterionStats([]), { count: 0, mean: null, min: null, max: null, spread: 0 });
});

test('ideaScore weights criterion means and flags disagreement', () => {
  const s = ideaScore(A, criteria, scores);
  assert.equal(s.average, (4 * 3 + 2 * 1) / 4);
  assert.equal(s.score, Math.round(((3.5 - 1) / 4) * 100));
  assert.equal(s.perCriterion.cliente.disagreement, true);
  assert.equal(s.perCriterion.mercato.disagreement, true);
  assert.equal(s.disagreements, 2);
  assert.deepEqual(s.voters.sort(), ['u1', 'u2']);
  assert.equal(s.coverage, 1);
});

test('a criterion with weight zero is voted but does not count', () => {
  const only = ideaScore(A, [{ key: 'extra', weight: 0 }], scores);
  assert.equal(only.score, null);
  assert.equal(only.perCriterion.extra.mean, 5);
});

test('ranking puts scored ideas first, then unscored ones alphabetically', () => {
  const ideas = [
    { id: C, title: 'Zeta' },
    { id: B, title: 'Beta' },
    { id: A, title: 'Alfa' },
    { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', title: 'Delta' },
  ];
  const order = ranking(ideas, criteria, scores).map((r) => r.idea.title);
  assert.deepEqual(order, ['Alfa', 'Beta', 'Delta', 'Zeta']);
  assert.equal(ranking(ideas, criteria, scores)[1].score, 25);
});

const photoBefore = {
  criteria: [
    { key: 'cliente', label: 'Cliente', weight: 3 },
    { key: 'mercato', label: 'Mercato', weight: 1 },
    { key: 'vecchio', label: 'Vecchio', weight: 1 },
  ],
  ideas: [
    { id: A, title: 'Alfa', status: 'nuova' },
    { id: B, title: 'Beta', status: 'nuova' },
    { id: C, title: 'Gamma', status: 'scartata' },
  ],
  votes: {
    u1: { [A]: { cliente: 5, mercato: 5 }, [B]: { cliente: 2, vecchio: 4 }, [C]: { cliente: 1 } },
    u2: { [A]: { cliente: 5 } },
  },
  names: { u1: 'Anna', u2: 'Bruno' },
};

const photoAfter = {
  criteria: [
    { key: 'cliente', label: 'Cliente', weight: 3 },
    { key: 'mercato', label: 'Mercato e prezzo', weight: 3 },
    { key: 'nuovo', label: 'Nuovo', weight: 2 },
  ],
  ideas: [
    { id: A, title: 'Alfa', status: 'nuova' },
    { id: B, title: 'Beta rinominata', status: 'nuova' },
    { id: C, title: 'Gamma', status: 'scartata' },
  ],
  votes: {
    u1: { [A]: { cliente: 1, mercato: 2 }, [B]: { cliente: 5, mercato: 5, nuovo: 5 } },
    u2: { [A]: { cliente: 5 } },
  },
  names: { u1: 'Anna', u2: 'Bruno' },
};

test('photoRanking recomputes a saved photo with its own criteria and weights', () => {
  const rows = photoRanking(photoBefore);
  assert.deepEqual(rows.map((r) => r.idea.title), ['Alfa', 'Beta', 'Gamma']);
  assert.equal(rows[0].score, 100);
  assert.equal(photoRanking(photoBefore, (i) => i.status !== 'scartata').length, 2);
});

test('comparePhotos reports places, points, criteria and votes that changed', () => {
  const cmp = comparePhotos(photoBefore, photoAfter, (i) => i.status !== 'scartata');
  assert.deepEqual(cmp.rows.map((r) => r.title), ['Beta rinominata', 'Alfa']);
  const [beta, alfa] = cmp.rows;
  assert.deepEqual(beta.before, { rank: 2, score: beta.before.score });
  assert.equal(beta.after.rank, 1);
  assert.equal(beta.move, 1);
  assert.ok(beta.delta > 0);
  assert.equal(alfa.move, -1);
  assert.ok(alfa.delta < 0);
  assert.deepEqual(
    alfa.means.map((m) => [m.key, m.from, m.to]),
    [['cliente', 5, 3], ['mercato', 5, 2]],
  );
  assert.deepEqual(
    cmp.criteria.map((c) => [c.key, c.change]),
    [['mercato', 'weight'], ['nuovo', 'added'], ['vecchio', 'removed']],
  );
  assert.deepEqual(cmp.voters, [{ memberId: 'u1', name: 'Anna', changed: 3, added: 2, removed: 2 }]);
});

test('comparePhotos keeps ideas that entered or left the ranking', () => {
  const after = { ...photoAfter, votes: { u1: { [B]: { cliente: 3 } } } };
  const cmp = comparePhotos(photoBefore, after, (i) => i.status !== 'scartata');
  const alfa = cmp.rows.find((r) => r.ideaId === A);
  assert.equal(alfa.after, null);
  assert.equal(alfa.move, null);
  assert.equal(cmp.rows.at(-1).ideaId, A, 'chi esce dalla classifica va in fondo');
  const fresh = comparePhotos({ ...photoBefore, votes: {} }, photoAfter);
  assert.ok(fresh.rows.every((r) => r.before === null && r.after));
});

test('evidenceByIdea counts real conversations, strong commitments and concluded experiments', () => {
  const interview = (ideaId, status, data = {}) => ({ kind: 'interview', idea_id: ideaId, status, data });
  const interviews = [
    interview(A, 'fatta'),
    interview(A, 'analizzata', { commitment: 'pagamento' }),
    interview(A, 'fatta', { commitment: 'demo' }),
    interview(A, 'fatta', { source: 'ricerca', commitment: 'pilota' }),
    interview(A, 'da_fare', { commitment: 'pilota' }),
    interview(B, 'fatta', { source: 'conversazione', commitment: 'pilota' }),
    interview(null, 'fatta'),
  ];
  const experiments = [
    { kind: 'experiment', idea_id: A, status: 'concluso' },
    { kind: 'experiment', idea_id: A, status: 'in_corso' },
    { kind: 'experiment', idea_id: C, status: 'concluso' },
  ];
  const evidence = evidenceByIdea(interviews, experiments);
  assert.deepEqual(evidence.get(A), { conversations: 3, commitments: 1, experiments: 1 });
  assert.deepEqual(evidence.get(B), { conversations: 1, commitments: 1, experiments: 0 });
  assert.deepEqual(evidence.get(C), { conversations: 0, commitments: 0, experiments: 1 });
  assert.equal(isHeldConversation(interview(A, 'fatta')), true, 'senza source è una conversazione');
  assert.equal(isHeldConversation(interview(A, 'fatta', { source: 'ricerca' })), false);
  assert.equal(isHeldConversation(interview(A, 'da_fare')), false, 'un colloquio in programma non è ancora una prova');
});

test('missingVotes says which criteria each voter has not voted on an idea', () => {
  const voters = ['u1', 'u2', 'u3'];
  assert.deepEqual(missingVotes(ideaScore(A, criteria, scores), criteria, voters), [
    { memberId: 'u2', keys: ['extra'] },
    { memberId: 'u3', keys: ['cliente', 'mercato', 'extra'] },
  ]);
  assert.deepEqual(missingVotes(ideaScore(A, criteria, scores), criteria, ['u1']), []);
});

test('countMissing counts my empty votes and the ideas they are on', () => {
  const mine = { [A]: { cliente: 5, mercato: 1, extra: 5 }, [B]: { cliente: 2 } };
  assert.deepEqual(countMissing([A, B, C], criteria, mine), { votes: 5, ideas: 2 });
  assert.deepEqual(countMissing([A], criteria, mine), { votes: 0, ideas: 0 });
  assert.deepEqual(countMissing([A], criteria, undefined), { votes: 3, ideas: 1 });
});

test('scaleEnds checks that a description explains both 5 and 1', () => {
  assert.deepEqual(scaleEnds('5 = pochi concorrenti; 1 = mercato affollato'), { high: true, low: true });
  assert.deepEqual(scaleEnds('Da 1 (mai) a 5 (ogni giorno)'), { high: true, low: true });
  assert.deepEqual(scaleEnds('1: nessun ostacolo. 5: vietato'), { high: true, low: true });
  assert.deepEqual(scaleEnds('5 = ricavi entro sei mesi'), { high: true, low: false });
  assert.deepEqual(scaleEnds('Dimensione e disponibilità a pagare'), { high: false, low: false });
  assert.deepEqual(scaleEnds('15 clienti e 1.5 milioni, 10 = tanti'), { high: false, low: false }, 'numeri qualsiasi non contano');
  assert.deepEqual(scaleEnds(undefined), { high: false, low: false });
});

test('criteriaWeightsChanged ignores labels, descriptions and order', () => {
  const before = [
    { key: 'cliente', label: 'Cliente', description: '', weight: 3 },
    { key: 'mercato', label: 'Mercato', description: '', weight: 1 },
  ];
  const relabeled = [
    { key: 'mercato', label: 'Mercato e prezzo', description: '5 = grande; 1 = piccolo', weight: 1 },
    { key: 'cliente', label: 'Cliente vero', description: 'Nuova', weight: 3 },
  ];
  assert.equal(criteriaWeightsChanged(before, relabeled), false);
  assert.equal(criteriaWeightsChanged(before, [before[0], { ...before[1], weight: 2 }]), true);
  assert.equal(criteriaWeightsChanged(before, [...before, { key: 'nuovo', label: 'Nuovo', weight: 0 }]), true, 'anche con peso zero');
  assert.equal(criteriaWeightsChanged(before, [before[0]]), true);
  assert.equal(criteriaWeightsChanged(before, [before[0], { ...before[1], key: 'altro' }]), true);
});
