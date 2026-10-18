import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blame,
  deepEqual,
  diffLines,
  diffSnapshots,
  diffWords,
  flatten,
  getPath,
  lineStats,
  merge3,
  normalize,
  resolveConflicts,
  setPath,
  snapshotOf,
  snapshotStats,
} from '../../assets/js/lib/diff.js';

test('normalize treats empty values as absent so clearing a field leaves no ghost diff', () => {
  assert.equal(normalize(''), undefined);
  assert.equal(normalize([]), undefined);
  assert.equal(normalize({ a: '', b: null }), undefined);
  assert.deepEqual(normalize({ b: 1, a: [2, ''] }), { a: [2], b: 1 });
  assert.equal(deepEqual({ a: 1, b: '' }, { a: 1 }), true);
  assert.equal(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
  assert.equal(deepEqual({ a: 1 }, { a: 2 }), false);
});

test('flatten maps nested data to paths and keyed rows by their id', () => {
  const flat = flatten({ data: { problem: 'p', validated: { problem: true }, criteria: [{ key: 'mercato', label: 'Mercato', weight: 2 }] } });
  assert.equal(flat.get('data.problem'), 'p');
  assert.equal(flat.get('data.validated.problem'), true);
  assert.equal(flat.get('data.criteria#mercato.label'), 'Mercato');
  assert.equal(flat.get('data.criteria#mercato.weight'), 2);
  assert.equal(flat.get('data.criteria.#order'), 'mercato');
  assert.deepEqual(flatten({ tags: ['a', 'b'] }).get('tags'), ['a', 'b']);
});

test('diffLines finds added and removed lines around unchanged ones', () => {
  const ops = diffLines('a\nb\nc', 'a\nB\nc\nd');
  assert.deepEqual(ops, [
    { t: 'eq', v: 'a' },
    { t: 'del', v: 'b' },
    { t: 'add', v: 'B' },
    { t: 'eq', v: 'c' },
    { t: 'add', v: 'd' },
  ]);
  assert.deepEqual(lineStats('', 'x\ny'), { add: 2, del: 0 });
  assert.deepEqual(diffLines('', ''), []);
});

test('diffLines falls back to replace-all on huge inputs instead of hanging', () => {
  const a = Array.from({ length: 2000 }, (_, i) => `a${i}`).join('\n');
  const b = Array.from({ length: 2000 }, (_, i) => `b${i}`).join('\n');
  const started = Date.now();
  const ops = diffLines(a, b);
  assert.ok(Date.now() - started < 2000);
  assert.equal(ops.filter((o) => o.t === 'del').length, 2000);
});

test('diffWords merges consecutive tokens of the same kind', () => {
  assert.deepEqual(diffWords('il cliente paga poco', 'il cliente paga molto'), [
    { t: 'eq', v: 'il cliente paga ' },
    { t: 'del', v: 'poco' },
    { t: 'add', v: 'molto' },
  ]);
});

test('diffSnapshots classifies changes by kind of value', () => {
  const before = snapshotOf({ title: 'Idea', status: 'nuova', data: { pitch: 'breve', tags: ['a', 'b'], problem: 'riga 1\nriga 2' } });
  const after = snapshotOf({ title: 'Idea', status: 'scelta', data: { pitch: 'più breve', tags: ['b', 'c'], solution: 'nuova' } });
  const changes = Object.fromEntries(diffSnapshots(before, after).map((c) => [c.path, c]));
  assert.equal(changes.status.type, 'changed');
  assert.equal(changes.status.kind, 'inline');
  assert.equal(changes['data.pitch'].kind, 'inline');
  assert.deepEqual(changes['data.tags'].addedItems, ['c']);
  assert.deepEqual(changes['data.tags'].removedItems, ['a']);
  assert.equal(changes['data.problem'].type, 'removed');
  assert.equal(changes['data.problem'].kind, 'text');
  assert.equal(changes['data.solution'].type, 'added');
  assert.equal(changes.title, undefined);
  const stats = snapshotStats(Object.values(changes));
  assert.ok(stats.add > 0 && stats.del > 0);
});

test('getPath and setPath read and write nested values, deleting on undefined', () => {
  const obj = {};
  setPath(obj, 'data.cells.r:c.text', 'x');
  assert.equal(getPath(obj, 'data.cells.r:c.text'), 'x');
  setPath(obj, 'data.cells.r:c.text', undefined);
  assert.deepEqual(obj, { data: { cells: { 'r:c': {} } } });
  assert.equal(getPath(obj, 'nope.deep'), undefined);
});

test('merge3 combines edits on different fields like git', () => {
  const base = { title: 'T', data: { problem: 'p', solution: 's' } };
  const mine = { title: 'T', data: { problem: 'p mio', solution: 's' } };
  const theirs = { title: 'T2', data: { problem: 'p', solution: 's loro' } };
  const { value, conflicts } = merge3(base, mine, theirs);
  assert.deepEqual(conflicts, []);
  assert.deepEqual(value, { title: 'T2', data: { problem: 'p mio', solution: 's loro' } });
});

test('merge3 merges different generator cells but flags the same field', () => {
  const base = { data: { cells: { 'r:a': { text: 'x' } } } };
  const mine = { data: { cells: { 'r:a': { text: 'mio' }, 'r:b': { text: 'nuova mia' } } } };
  const theirs = { data: { cells: { 'r:a': { text: 'loro' }, 'r:c': { text: 'nuova loro' } } } };
  const { value, conflicts } = merge3(base, mine, theirs);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].path, 'data.cells.r:a.text');
  assert.equal(value.data.cells['r:b'].text, 'nuova mia');
  assert.equal(value.data.cells['r:c'].text, 'nuova loro');
  const resolved = resolveConflicts(value, conflicts, ['theirs']);
  assert.equal(resolved.data.cells['r:a'].text, 'loro');
  assert.equal(resolveConflicts(value, conflicts, ['mine']).data.cells['r:a'].text, 'mio');
});

test('merge3 keeps deletions made on one side', () => {
  const base = { data: { a: 1, b: 2 } };
  const mine = { data: { a: 1 } };
  const theirs = { data: { a: 1, b: 2, c: 3 } };
  assert.deepEqual(merge3(base, mine, theirs).value, { data: { a: 1, c: 3 } });
});

test('merge3 treats identical edits as no conflict', () => {
  const { value, conflicts } = merge3({ status: 'a' }, { status: 'b' }, { status: 'b' });
  assert.deepEqual(conflicts, []);
  assert.equal(value.status, 'b');
});

test('blame points each field to the revision that changed it last', () => {
  const revisions = [
    { version: 1, author_id: 'u1', title: 'Idea', status: 'nuova', idea_id: null, data: { problem: 'p', solution: 's' } },
    { version: 2, author_id: 'u2', title: 'Idea', status: 'nuova', idea_id: null, data: { problem: 'p2', solution: 's' } },
    { version: 3, author_id: 'u3', title: 'Idea', status: 'scelta', idea_id: null, data: { problem: 'p2' } },
  ];
  const owners = blame(revisions);
  assert.equal(owners.get('title').version, 1);
  assert.equal(owners.get('data.problem').author_id, 'u2');
  assert.equal(owners.get('status').author_id, 'u3');
  assert.equal(owners.has('data.solution'), false);
});
