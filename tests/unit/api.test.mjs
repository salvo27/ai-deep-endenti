import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AppError, api, toAppError } from '../../assets/js/lib/api.js';
import { authFlags } from '../../assets/js/lib/supabase.js';

const fake = globalThis.__fakeSupabase;
const ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => fake.reset());

test('the client uses PKCE and a persisted, auto refreshed session', () => {
  assert.equal(fake.options.auth.flowType, 'pkce');
  assert.equal(fake.options.auth.persistSession, true);
  assert.match(fake.url, /^https:\/\/[a-z]+\.supabase\.co$/);
});

test('a password recovery event switches the app to recovery mode', () => {
  fake.authListeners.forEach((cb) => cb('PASSWORD_RECOVERY', null));
  assert.equal(api.isRecovery(), true);
  api.clearRecovery();
  assert.equal(authFlags.recovery, false);
});

test('errors are translated to generic Italian messages without internal details', () => {
  assert.equal(toAppError({ code: 'invalid_credentials', message: 'Invalid login for mario@x.it' }).message, 'Email o password non corretti.');
  assert.equal(toAppError({ code: '42501', message: 'new row violates row-level security policy for table "items"' }).message, 'Non hai i permessi per questa operazione.');
  assert.equal(toAppError({ code: 'P0001', message: 'Il titolo è obbligatorio' }).message, 'Il titolo è obbligatorio');
  assert.equal(toAppError({ status: 429 }).code, null);
  assert.match(toAppError({ status: 429 }).message, /Troppi tentativi/);
  assert.match(toAppError({ name: 'TypeError', message: 'Failed to fetch' }).message, /Connessione/);
  assert.equal(toAppError({ code: 'XX000', message: 'segreto interno' }, 'Generico.').message, 'Generico.');
  const original = new AppError('già tradotto');
  assert.equal(toAppError(original), original);
});

test('identifiers are validated before reaching the database', async () => {
  await assert.rejects(api.saveItem({ id: 'x,y', baseVersion: 1, snapshot: { title: 't', data: {} } }), /Identificativo/);
  await assert.rejects(api.listRevisions({ ideaId: `${ID},item_id.neq.x` }), /Identificativo/);
  assert.equal(fake.calls.length, 0);
});

test('saveItem sends the base version and maps the snapshot to RPC parameters', async () => {
  fake.responses.rpc.save_item = (params) => ({ data: { status: 'ok', item: { id: params.p_id } }, error: null });
  const res = await api.saveItem({ id: ID, baseVersion: 4, snapshot: { title: 'T', status: 'nuova', data: { a: 1 }, idea_id: null }, message: '' });
  assert.equal(res.status, 'ok');
  assert.deepEqual(fake.calls[0], ['rpc', 'save_item', { p_id: ID, p_base_version: 4, p_title: 'T', p_status: 'nuova', p_data: { a: 1 }, p_idea_id: null, p_message: null }]);
});

test('listItems reads every page', async () => {
  let page = 0;
  fake.responses.from.items = () => {
    page += 1;
    const size = page === 1 ? 1000 : 3;
    return { data: Array.from({ length: size }, (_, i) => ({ id: `${page}-${i}` })), error: null };
  };
  const rows = await api.listItems();
  assert.equal(rows.length, 1003);
  assert.equal(page, 2);
});

test('listRevisions applies only the requested filters', async () => {
  fake.responses.from.revisions = { data: [], error: null };
  await api.listRevisions({ ideaId: ID, kind: 'idea', beforeId: 10, limit: 5 });
  const ops = fake.calls[0][2].map((op) => op[0]);
  assert.deepEqual(ops, ['select', 'order', 'limit', 'or', 'eq', 'lt']);
  assert.equal(fake.calls[0][2][3][1], `idea_id.eq.${ID},item_id.eq.${ID}`);
});

test('database errors become AppError', async () => {
  fake.responses.rpc.members_overview = { data: null, error: { code: '42501', message: 'denied' } };
  await assert.rejects(api.membersOverview(), (e) => e instanceof AppError && /permessi/.test(e.message));
  fake.responses.rpc.my_role = () => Promise.reject(new TypeError('Failed to fetch'));
  await assert.rejects(api.myRole(), /Connessione/);
});

test('invokeClaude surfaces the function message or a generic one', async () => {
  fake.responses.functions.claude = {
    data: null,
    error: { context: { status: 429, json: async () => ({ error: 'Hai raggiunto il limite di 40 richieste' }) } },
  };
  await assert.rejects(api.invokeClaude('critique', 'x'), /limite di 40/);
  fake.responses.functions.claude = { data: null, error: { context: { status: 500, json: async () => { throw new Error('html'); } } } };
  await assert.rejects(api.invokeClaude('critique', 'x'), /non è disponibile/);
  fake.responses.functions.claude = { data: { text: 'ok' }, error: null };
  assert.deepEqual(await api.invokeClaude('critique', 'contesto'), { text: 'ok' });
  assert.deepEqual(fake.calls.at(-1), ['functions.invoke', 'claude', { body: { task: 'critique', context: 'contesto' } }]);
});

test('commentCounts groups comments by item', async () => {
  fake.responses.from.comments = { data: [{ item_id: 'a' }, { item_id: 'a' }, { item_id: 'b' }], error: null };
  const counts = await api.commentCounts();
  assert.equal(counts.get('a'), 2);
  assert.equal(counts.get('b'), 1);
});

test('realtime subscribes to the four tables and presence uses a private channel', () => {
  const seen = [];
  const off = api.subscribeDb({ onItem: (r) => seen.push(['item', r]), onRevision: (r) => seen.push(['rev', r]), onStatus: (s) => seen.push(['status', s]) });
  const channel = fake.channels[0];
  assert.deepEqual(channel.handlers.map((h) => h.filter.table), ['items', 'revisions', 'comments', 'members']);
  channel.emit('postgres_changes', { table: 'items', new: { id: 'x' } });
  assert.deepEqual(seen, [['status', 'SUBSCRIBED'], ['item', { id: 'x' }]]);
  off();
  assert.equal(fake.removed.length, 1);

  const presence = api.joinPresence(ID, () => {});
  assert.equal(fake.channels[1].options.config.private, true);
  presence.track({ route: '/' });
  assert.deepEqual(fake.channels[1].tracked, [{ route: '/' }]);
  presence.leave();
});

test('auth helpers call Supabase with the expected arguments', async () => {
  fake.responses.auth.listFactors = { data: { all: [{ id: 'f1' }] }, error: null };
  assert.deepEqual(await api.listFactors(), [{ id: 'f1' }]);
  await api.verifyTotp('f1', '123456');
  assert.deepEqual(fake.calls.at(-1), ['auth.challengeAndVerify', { factorId: 'f1', code: '123456' }]);
  fake.responses.auth.signInWithPassword = { data: null, error: { code: 'invalid_credentials' } };
  await assert.rejects(api.signIn('a@b.it', 'x'), /Email o password/);
  await api.signOut('global');
  assert.deepEqual(fake.calls.at(-1), ['auth.signOut', { scope: 'global' }]);
});

test('every remaining wrapper calls the right Supabase endpoint', async () => {
  fake.responses.auth.getSession = { data: { session: { access_token: 't', user: { id: ID } } }, error: null };
  fake.responses.auth.getAuthenticatorAssuranceLevel = { data: { currentLevel: 'aal2' }, error: null };
  fake.responses.auth.enroll = { data: { id: 'f' }, error: null };
  fake.responses.from.revisions = { data: [{ id: 1 }], error: null };
  fake.responses.from.comments = (ops) => (ops.some((o) => o[0] === 'single') ? { data: { id: ID }, error: null } : { data: [{ id: ID }], error: null });
  fake.responses.from.members = { data: { user_id: ID }, error: null };
  fake.responses.from.audit_log = { data: [], error: null };
  fake.responses.from.ai_usage = { count: 4, error: null };
  fake.responses.from.items = { data: [], error: null };
  for (const name of ['create_item', 'delete_item', 'restore_item', 'revert_item', 'add_member']) {
    fake.responses.rpc[name] = { data: { status: 'ok' }, error: null };
  }

  assert.equal((await api.getSession()).access_token, 't');
  await api.requestPasswordReset('a@b.it', 'https://x/');
  await api.updatePassword('Password-Lunga-1');
  assert.equal((await api.getAssurance()).currentLevel, 'aal2');
  assert.equal((await api.enrollTotp('Telefono')).id, 'f');
  await api.unenrollFactor('f');
  await api.createItem({ kind: 'idea', title: 'T', data: {} });
  await api.deleteItem(ID, 2, 'm');
  await api.restoreItem(ID);
  await api.revertItem(ID, 1, 3);
  assert.deepEqual(await api.itemHistory(ID), [{ id: 1 }]);
  assert.deepEqual(await api.getRevision(ID, 1), [{ id: 1 }]);
  assert.deepEqual(await api.activitySince('2026-01-01'), [{ id: 1 }]);
  assert.deepEqual(await api.listComments(ID), [{ id: ID }]);
  await api.addComment(ID, 'ciao', 'critique');
  await api.editComment(ID, 'ciao 2');
  await api.deleteComment(ID);
  await api.updateMember(ID, { display_name: 'X' });
  await api.removeMember(ID);
  await api.addMember('a@b.it', 'A', 'member');
  assert.deepEqual(await api.auditLog(), []);
  assert.equal(await api.aiUsageLastDay(ID), 4);
  const backup = await api.exportAll();
  assert.deepEqual(Object.keys(backup), ['items', 'revisions', 'comments']);
  await api.setRealtimeAuth();
  const off = api.onAuthChange(() => {});
  off();

  const names = fake.calls.map((c) => (c[0] === 'rpc' ? `rpc:${c[1]}` : c[0] === 'from' ? `from:${c[1]}` : c[0]));
  for (const expected of ['auth.resetPasswordForEmail', 'auth.updateUser', 'auth.unenroll', 'rpc:create_item', 'rpc:delete_item', 'rpc:restore_item', 'rpc:revert_item', 'rpc:add_member', 'from:comments', 'from:members', 'from:audit_log', 'from:ai_usage', 'realtime.setAuth']) {
    assert.ok(names.includes(expected), expected);
  }
  const insert = fake.calls.find((c) => c[0] === 'from' && c[1] === 'comments' && c[2][0][0] === 'insert');
  assert.deepEqual(insert[2][0][1], { item_id: ID, body: 'ciao', ai_task: 'critique' });
  fake.responses.from.ai_usage = { count: null, error: { code: '42501' } };
  await assert.rejects(api.aiUsageLastDay(ID), /permessi/);
});
