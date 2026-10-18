import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criterionStats, ideaScore, ranking } from '../../assets/js/scoring.js';

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
