import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../../assets/js/lib/api.js';
import * as store from '../../assets/js/store.js';

const ME = '00000000-0000-4000-8000-00000000000a';
const OTHER = '00000000-0000-4000-8000-00000000000b';
const IDEA = '11111111-1111-4111-8111-111111111111';
const CHILD = '22222222-2222-4222-8222-222222222222';
const original = { ...api };

const row = (over = {}) => ({
  id: IDEA,
  kind: 'idea',
  title: 'Idea',
  status: 'nuova',
  idea_id: null,
  data: {},
  version: 1,
  created_by: ME,
  updated_by: ME,
  created_at: '2026-10-18T10:00:00Z',
  updated_at: '2026-10-18T10:00:00Z',
  deleted_at: null,
  ...over,
});

beforeEach(() => {
  store.resetStore();
  store.state.user = { id: ME };
});

afterEach(() => Object.assign(api, original));

test('isValidItemRow rejects malformed rows coming from outside', () => {
  assert.equal(store.isValidItemRow(row()), true);
  assert.equal(store.isValidItemRow(row({ id: 'x' })), false);
  assert.equal(store.isValidItemRow(row({ kind: 'boh' })), false);
  assert.equal(store.isValidItemRow(row({ version: '2' })), false);
  assert.equal(store.isValidItemRow(row({ data: [] })), false);
  assert.equal(store.isValidItemRow(row({ idea_id: 'bad' })), false);
  assert.equal(store.isValidItemRow(null), false);
});

test('applyItem keeps the newest version and notifies who changed it', () => {
  const events = [];
  store.on('item', (e) => events.push(e));
  assert.equal(store.applyItem(row({ version: 2, updated_by: OTHER })), true);
  assert.equal(store.applyItem(row({ version: 1 })), false, 'versione vecchia ignorata');
  assert.equal(store.applyItem(row({ version: 2, updated_by: OTHER })), false, 'duplicato ignorato');
  assert.equal(store.applyItem({ id: 'x' }), false);
  assert.equal(events.length, 1);
  assert.equal(events[0].byMe, false);
  assert.equal(store.getItem(IDEA).version, 2);
});

test('a failing listener does not break the others', () => {
  let called = false;
  store.on('item', () => {
    throw new Error('rotto');
  });
  store.on('item', () => (called = true));
  store.applyItem(row());
  assert.equal(called, true);
});

test('children of an archived idea disappear from lists but stay in the trash view', () => {
  store.applyItem(row({ deleted_at: '2026-10-18T11:00:00Z' }));
  store.applyItem(row({ id: CHILD, kind: 'experiment', title: 'E', status: 'pianificato', idea_id: IDEA }));
  assert.equal(store.itemsOf('experiment').length, 0);
  assert.equal(store.itemsOf('experiment', { includeDeleted: true }).length, 1);
  assert.equal(store.deletedItems().length, 1);
});

test('roles decide what the interface allows', () => {
  store.setMembers([{ user_id: ME, role: 'advisor', display_name: 'Io' }, { user_id: 'non-uuid' }]);
  assert.equal(store.state.members.length, 1);
  assert.equal(store.canWrite(), false);
  store.setMembers([{ user_id: ME, role: 'member', display_name: 'Io' }]);
  assert.equal(store.canWrite(), true);
  assert.equal(store.isAdmin(), false);
  assert.equal(store.memberName(OTHER), 'Ex membro');
  assert.equal(store.memberName(null), 'Sistema');
});

test('createItem sanitizes the snapshot and refuses invalid ones before calling the server', async () => {
  let sent = null;
  api.createItem = async (args) => {
    sent = args;
    return row({ title: args.title, data: args.data });
  };
  await assert.rejects(store.createItem('experiment', { title: 'Senza idea' }), /idea/);
  assert.equal(sent, null);
  const created = await store.createItem('idea', { title: ' Nuova ', data: { pitch: 'p', hacker: 1 } }, '  primo commit ');
  assert.deepEqual(sent.data, { pitch: 'p' });
  assert.equal(sent.title, 'Nuova');
  assert.equal(sent.status, 'nuova');
  assert.equal(sent.message, 'primo commit');
  assert.equal(store.getItem(created.id).title, 'Nuova');
});

test('saveSnapshot reports conflicts and applies the server version', async () => {
  store.applyItem(row());
  api.saveItem = async () => ({ status: 'conflict', item: row({ version: 3, title: 'Loro', updated_by: OTHER }) });
  const res = await store.saveSnapshot(store.getItem(IDEA), { title: 'Mio', status: 'nuova', data: {} }, '');
  assert.equal(res.status, 'conflict');
  assert.equal(store.getItem(IDEA).title, 'Loro');
  assert.equal(res.snapshot.title, 'Mio');
});

test('archive, restore and revert raise readable errors when the server refuses', async () => {
  store.applyItem(row());
  api.deleteItem = async () => ({ status: 'forbidden' });
  await assert.rejects(store.archiveItem(store.getItem(IDEA)), /permessi/);
  api.deleteItem = async () => ({ status: 'conflict', item: row({ version: 2 }) });
  await assert.rejects(store.archiveItem(store.getItem(IDEA)), /modificato/);
  api.restoreItem = async () => ({ status: 'ok', item: row({ version: 3 }) });
  assert.equal((await store.restoreItem(store.getItem(IDEA))).version, 3);
  api.revertItem = async (id, to, base) => ({ status: 'ok', item: row({ version: base + 1 }) });
  assert.equal((await store.revertItem(store.getItem(IDEA), 1)).version, 4);
});

test('loadAll keeps only valid rows and identifies the current member', async () => {
  api.membersOverview = async () => [{ user_id: ME, role: 'admin', display_name: 'Io' }];
  api.listItems = async () => [row(), { id: 'rotta' }];
  api.commentCounts = async () => {
    throw new Error('offline');
  };
  await store.loadAll();
  assert.equal(store.state.items.size, 1);
  assert.equal(store.state.me.role, 'admin');
  assert.equal(store.state.commentCounts.size, 0);
});

test('reloadMembers emits removed when the current user is no longer in the team', async () => {
  let removed = false;
  store.on('removed', () => (removed = true));
  api.membersOverview = async () => [{ user_id: OTHER, role: 'admin', display_name: 'Altro' }];
  await store.reloadMembers();
  assert.equal(removed, true);
});

test('parsePresence ignores malformed presence payloads', () => {
  const online = store.parsePresence({
    [OTHER]: [{ route: '/idea/x', editing: true }],
    'non-uuid': [{ route: '/' }],
    [ME]: [],
    [IDEA]: [{ route: 42, editing: 'yes' }],
  });
  assert.deepEqual(online, [
    { userId: OTHER, route: '/idea/x', editing: true },
    { userId: IDEA, route: '', editing: false },
  ]);
});

test('realtime events update the store and presence', () => {
  let handlers = null;
  let onSync = null;
  const tracked = [];
  api.subscribeDb = (h) => {
    handlers = h;
    return () => {};
  };
  api.joinPresence = (id, sync) => {
    onSync = sync;
    return { track: (m) => tracked.push(m), leave() {} };
  };
  const revisions = [];
  store.on('revision', (r) => revisions.push(r));
  store.startRealtime();
  handlers.onItem(row({ version: 5 }));
  handlers.onRevision({ item_id: IDEA });
  handlers.onRevision({ item_id: 'x' });
  handlers.onStatus('SUBSCRIBED');
  onSync({ [OTHER]: [{ route: '/' }] });
  store.trackPresence({ route: '/idee\nX', editing: true });
  assert.equal(store.getItem(IDEA).version, 5);
  assert.equal(revisions.length, 1);
  assert.equal(store.state.realtime, 'SUBSCRIBED');
  assert.equal(store.state.online.length, 1);
  assert.deepEqual(tracked, [{ route: '/idee X', editing: true }]);
  store.stopRealtime();
});

test('local storage helpers survive a browser that blocks storage', () => {
  const saved = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() {
      throw new Error('bloccato');
    },
    setItem() {
      throw new Error('bloccato');
    },
    removeItem() {},
  };
  assert.equal(store.readLocal('x', 'fallback'), 'fallback');
  assert.doesNotThrow(() => store.writeLocal('x', { a: 1 }));
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, v),
    removeItem: (k) => memory.delete(k),
  };
  store.writeLocal('draft', { a: 1 });
  assert.deepEqual(store.readLocal('draft'), { a: 1 });
  assert.ok([...memory.keys()][0].includes(ME), 'le bozze sono separate per utente');
  store.writeLocal('draft', null);
  assert.equal(store.readLocal('draft'), null);
  globalThis.localStorage = saved;
});

test('labelContext resolves titles, criteria and generator axes', () => {
  store.applyItem(row());
  store.applyItem(row({ id: CHILD, kind: 'criteria', title: 'C', status: null, data: { criteria: [{ key: 'mercato', label: 'Mercato', weight: 1 }] } }));
  store.applyItem(row({ id: '33333333-3333-4333-8333-333333333333', kind: 'generator', title: 'G', status: null, data: { rows: [{ id: 'r-a', label: 'XAI' }], cols: [] } }));
  assert.equal(store.labelContext.ideaTitle(IDEA), 'Idea');
  assert.equal(store.labelContext.criterionLabel('mercato'), 'Mercato');
  assert.equal(store.labelContext.axisLabel('r-a'), 'XAI');
  assert.equal(store.labelContext.axisLabel('nope'), null);
  assert.equal(store.criteriaList().length, 1);
});
