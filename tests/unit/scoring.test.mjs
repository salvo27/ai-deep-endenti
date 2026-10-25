import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparePhotos, criterionStats, ideaScore, photoRanking, ranking } from '../../assets/js/scoring.js';

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
