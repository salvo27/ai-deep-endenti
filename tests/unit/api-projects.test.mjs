import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AppError, api } from '../../assets/js/lib/api.js';
import { ME, OTHER, PROJECT, PROJECT2 } from '../setup/fixtures.mjs';

const fake = globalThis.__fakeSupabase;
const ID = '11111111-1111-4111-8111-111111111111';
const original = { ...api };

const fromCalls = (table) => fake.calls.filter((c) => c[0] === 'from' && c[1] === table);
const rpcCall = (name) => fake.calls.filter((c) => c[0] === 'rpc' && c[1] === name).at(-1);
const ops = (call, name) => call[2].filter((op) => op[0] === name);
const projectFilters = (call) => ops(call, 'eq').filter((op) => op[1] === 'project_id').map((op) => op[2]);

beforeEach(() => {
  fake.reset();
  api.useProject(PROJECT);
  fake.responses.auth.getSession = { data: { session: { access_token: 't', user: { id: ME } } }, error: null };
});

afterEach(() => {
  Object.assign(api, original);
  api.useProject(null);
});

// Ogni lettura delle tabelle di un progetto: la chiamata e la tabella che legge.
const READS = [
  ['listItems', () => api.listItems(), 'items'],
  ['listRevisions', () => api.listRevisions({ itemId: ID }), 'revisions'],
  ['itemHistory', () => api.itemHistory(ID), 'revisions'],
  ['getRevision', () => api.getRevision(ID, 1), 'revisions'],
  ['activitySince', () => api.activitySince('2026-10-01T00:00:00Z'), 'revisions'],
  ['activityFeed (revisioni)', () => api.activityFeed('2026-10-01T00:00:00Z'), 'revisions'],
  ['activityFeed (commenti)', () => api.activityFeed('2026-10-01T00:00:00Z'), 'comments'],
  ['listComments', () => api.listComments([ID, ID]), 'comments'],
  ['commentCounts', () => api.commentCounts(), 'comments'],
  ['listChats', () => api.listChats(), 'chats'],
  ['listMessages', () => api.listMessages(ID), 'chat_messages'],
  ['getMessages', () => api.getMessages([ID]), 'chat_messages'],
  ['listMentions', () => api.listMentions(), 'mentions'],
  ['auditLog', () => api.auditLog(), 'audit_log'],
];

describe('letture filtrate per progetto', () => {
  for (const [name, call, table] of READS) {
    it(`${name} legge ${table} solo del progetto aperto`, async () => {
      fake.responses.from[table] = { data: [], error: null };
      await call();
      const calls = fromCalls(table);
      assert.ok(calls.length > 0, `nessuna lettura di ${table}`);
      for (const c of calls) assert.deepEqual(projectFilters(c), [PROJECT]);
    });
  }

  for (const [name, call, table] of READS) {
    it(`${name} senza un progetto aperto non arriva al database`, async () => {
      api.useProject(null);
      await assert.rejects(call(), (e) => e instanceof AppError && e.code === 'no_project');
      assert.equal(fromCalls(table).length, 0);
    });
  }

  it('un progetto passato esplicitamente vale più di quello aperto', async () => {
    fake.responses.from.items = { data: [], error: null };
    await api.listItems(PROJECT2);
    assert.deepEqual(projectFilters(fromCalls('items')[0]), [PROJECT2]);
  });

  for (const bad of ['x', `${PROJECT},project_id.neq.x`, 42, '']) {
    it(`un progetto malformato (${JSON.stringify(bad)}) viene rifiutato prima del database`, async () => {
      await assert.rejects(api.listItems(bad), (e) => e instanceof AppError && e.code === 'invalid_id');
      assert.equal(fake.calls.length, 0);
    });
  }

  it('useProject accetta solo un identificativo valido o nessun progetto', () => {
    api.useProject(PROJECT2);
    assert.equal(api.currentProject(), PROJECT2);
    api.useProject('non-un-uuid');
    assert.equal(api.currentProject(), null);
    api.useProject(PROJECT);
    api.useProject(null);
    assert.equal(api.currentProject(), null);
  });

  it('il backup contiene solo le righe del progetto aperto, tabella per tabella', async () => {
    for (const table of ['items', 'revisions', 'comments', 'chats', 'chat_messages', 'survey_responses']) fake.responses.from[table] = { data: [], error: null };
    await api.exportAll();
    for (const table of ['items', 'revisions', 'comments', 'chats', 'chat_messages', 'survey_responses']) {
      assert.deepEqual(projectFilters(fromCalls(table)[0]), [PROJECT], table);
    }
  });

  it('il registro di sicurezza si legge per un progetto o, con projectId null, per tutta la piattaforma', async () => {
    fake.responses.from.audit_log = { data: [], error: null };
    await api.auditLog({ projectId: PROJECT2, limit: 20 });
    let call = fromCalls('audit_log').at(-1);
    assert.deepEqual(projectFilters(call), [PROJECT2]);
    assert.deepEqual(ops(call, 'limit'), [['limit', 20]]);
    await api.auditLog(50);
    call = fromCalls('audit_log').at(-1);
    assert.deepEqual(projectFilters(call), [PROJECT], 'un numero è il limite, per le pagine di prima');
    assert.deepEqual(ops(call, 'limit'), [['limit', 50]]);
    await api.auditLog({ projectId: null });
    call = fromCalls('audit_log').at(-1);
    assert.deepEqual(projectFilters(call), []);
    assert.deepEqual(ops(call, 'order'), [['order', 'id', { ascending: false }]]);
  });
});

describe('funzioni del database che vogliono il progetto', () => {
  const CASES = [
    ['createItem', () => api.createItem({ kind: 'idea', title: 'T', status: 'nuova', data: { a: 1 }, ideaId: ID, message: 'm' }), 'create_item', { p_project: PROJECT, p_kind: 'idea', p_title: 'T', p_status: 'nuova', p_data: { a: 1 }, p_idea: ID, p_message: 'm' }],
    ['createItem senza idea né messaggio', () => api.createItem({ kind: 'idea', title: 'T', data: {} }), 'create_item', { p_project: PROJECT, p_kind: 'idea', p_title: 'T', p_status: null, p_data: {}, p_idea: null, p_message: null }],
    ['membersOverview', () => api.membersOverview(), 'members_overview', { p_project: PROJECT }],
    ['membersOverview di un altro progetto', () => api.membersOverview(PROJECT2), 'members_overview', { p_project: PROJECT2 }],
    ['chatOverview', () => api.chatOverview(), 'chat_overview', { p_project: PROJECT }],
    ['markMentionsRead di alcune', () => api.markMentionsRead([1, 2]), 'mark_mentions_read', { p_project: PROJECT, p_ids: [1, 2] }],
    ['markMentionsRead di tutte', () => api.markMentionsRead(), 'mark_mentions_read', { p_project: PROJECT, p_ids: null }],
    ['noteImageOrphans', () => api.noteImageOrphans(['a/b.jpg']), 'note_image_orphans', { p_project: PROJECT, p_paths: ['a/b.jpg'] }],
    ['surveyImageOrphans', () => api.surveyImageOrphans(), 'survey_image_orphans', { p_project: PROJECT, p_paths: null }],
    ['myRole', () => api.myRole(), 'my_role', { p_project: PROJECT }],
  ];

  for (const [name, call, rpc, params] of CASES) {
    it(`${name} chiama ${rpc} con il progetto`, async () => {
      fake.responses.rpc[rpc] = { data: [], error: null };
      await call();
      assert.deepEqual(rpcCall(rpc)[2], params);
    });
  }

  for (const [name, call, rpc] of CASES.filter(([n]) => !n.includes('altro progetto'))) {
    it(`${name} senza un progetto aperto non chiama ${rpc}`, async () => {
      api.useProject(null);
      await assert.rejects(call(), (e) => e.code === 'no_project');
      assert.equal(rpcCall(rpc), undefined);
    });
  }

  it('una chat nuova nasce nel progetto aperto', async () => {
    fake.responses.from.chats = { data: { id: ID }, error: null };
    await api.createChat({ title: 'Nutrizione', ideaId: ID });
    assert.deepEqual(ops(fromCalls('chats')[0], 'insert')[0][1], { project_id: PROJECT, title: 'Nutrizione', idea_id: ID });
  });

  it('il riepilogo del lunedì chiede anteprima e invio per il progetto aperto', async () => {
    fake.responses.functions.notify = { data: { ok: true }, error: null };
    await api.weeklyPreview();
    assert.deepEqual(fake.calls.at(-1), ['functions.invoke', 'notify', { body: { job: 'weekly-preview', project: PROJECT, language: 'it' } }]);
    await api.sendWeeklyNow();
    assert.deepEqual(fake.calls.at(-1), ['functions.invoke', 'notify', { body: { job: 'weekly-now', project: PROJECT, language: 'it' } }]);
  });
});

describe('progetti e amministratori della piattaforma', () => {
  it('myProjects e allProjects chiamano le funzioni senza argomenti e danno sempre un elenco', async () => {
    fake.responses.rpc.my_projects = { data: [{ id: PROJECT, name: 'Alfa', role: 'admin' }], error: null };
    assert.deepEqual(await api.myProjects(), [{ id: PROJECT, name: 'Alfa', role: 'admin' }]);
    assert.deepEqual(rpcCall('my_projects'), ['rpc', 'my_projects', undefined]);
    fake.responses.rpc.all_projects = { data: null, error: null };
    assert.deepEqual(await api.allProjects(), []);
    assert.deepEqual(rpcCall('all_projects'), ['rpc', 'all_projects', undefined]);
  });

  for (const [data, expected] of [[true, true], [false, false], [null, false], ['true', false], [[true], false]]) {
    it(`isPlatformAdmin con la risposta ${JSON.stringify(data)} dà ${expected}`, async () => {
      fake.responses.rpc.is_platform_admin = { data, error: null };
      assert.equal(await api.isPlatformAdmin(), expected);
    });
  }

  const CALLS = [
    ['createProject', () => api.createProject('Gamma'), 'create_project', { p_name: 'Gamma' }],
    ['renameProject', () => api.renameProject(PROJECT, 'Alfa 2'), 'rename_project', { p_project: PROJECT, p_name: 'Alfa 2' }],
    ['archiveProject', () => api.archiveProject(PROJECT2), 'archive_project', { p_project: PROJECT2 }],
    ['unarchiveProject', () => api.unarchiveProject(PROJECT2), 'unarchive_project', { p_project: PROJECT2 }],
    ['addPlatformAdmin', () => api.addPlatformAdmin('bruno@test.it'), 'add_platform_admin', { p_email: 'bruno@test.it' }],
    ['removePlatformAdmin', () => api.removePlatformAdmin(OTHER), 'remove_platform_admin', { p_user: OTHER }],
  ];
  for (const [name, call, rpc, params] of CALLS) {
    it(`${name} chiama ${rpc} con i suoi parametri`, async () => {
      fake.responses.rpc[rpc] = { data: { id: PROJECT }, error: null };
      await call();
      assert.deepEqual(rpcCall(rpc)[2], params);
    });
  }

  for (const [name, call] of [
    ['renameProject', () => api.renameProject('x', 'Nome')],
    ['archiveProject', () => api.archiveProject(`${PROJECT}'`)],
    ['unarchiveProject', () => api.unarchiveProject(undefined)],
    ['removePlatformAdmin', () => api.removePlatformAdmin('x')],
  ]) {
    it(`${name} con un identificativo malformato non arriva al database`, async () => {
      await assert.rejects(call(), (e) => e.code === 'invalid_id');
      assert.equal(fake.calls.length, 0);
    });
  }

  it('un codice del database diventa il suo testo', async () => {
    fake.responses.rpc.create_project = { data: null, error: { code: '22023', message: 'invalid_project_name' } };
    await assert.rejects(api.createProject(''), (e) => e instanceof AppError && e.code === 'invalid_project_name' && /da 1 a 80 caratteri/.test(e.message));
  });

  it('platformAdmins aggiunge il nome dal profilo, anche quando un profilo manca', async () => {
    fake.responses.from.platform_admins = { data: [{ user_id: ME, created_at: '2026-10-01T10:00:00Z' }, { user_id: OTHER, created_at: '2026-10-02T10:00:00Z' }], error: null };
    fake.responses.from.profiles = { data: [{ user_id: ME, display_name: 'Anna', color: '#4f5bd5' }], error: null };
    assert.deepEqual(await api.platformAdmins(), [
      { user_id: ME, created_at: '2026-10-01T10:00:00Z', display_name: 'Anna', color: '#4f5bd5' },
      { user_id: OTHER, created_at: '2026-10-02T10:00:00Z', display_name: null, color: null },
    ]);
    assert.deepEqual(ops(fromCalls('profiles')[0], 'in'), [['in', 'user_id', [ME, OTHER]]]);
  });

  it('platformAdmins senza amministratori visibili non legge i profili', async () => {
    fake.responses.from.platform_admins = { data: [], error: null };
    assert.deepEqual(await api.platformAdmins(), []);
    assert.equal(fromCalls('profiles').length, 0);
  });
});

describe('persone di un progetto', () => {
  it('addMember aggiunge una persona al progetto indicato', async () => {
    fake.responses.rpc.add_member = { data: { user_id: OTHER }, error: null };
    await api.addMember(PROJECT2, 'bruno@test.it', 'Bruno', 'advisor');
    assert.deepEqual(rpcCall('add_member')[2], { p_project: PROJECT2, p_email: 'bruno@test.it', p_display_name: 'Bruno', p_role: 'advisor' });
  });

  it('addMember chiamato come prima, con l email per prima, usa il progetto aperto', async () => {
    fake.responses.rpc.add_member = { data: { user_id: OTHER }, error: null };
    await api.addMember('bruno@test.it', 'Bruno', 'member');
    assert.deepEqual(rpcCall('add_member')[2], { p_project: PROJECT, p_email: 'bruno@test.it', p_display_name: 'Bruno', p_role: 'member' });
  });

  it('updateMemberRole cambia il ruolo filtrando per progetto e per persona', async () => {
    fake.responses.from.members = { data: { user_id: OTHER, role: 'admin' }, error: null };
    await api.updateMemberRole(PROJECT2, OTHER, 'admin');
    const call = fromCalls('members')[0];
    assert.deepEqual(ops(call, 'update'), [['update', { role: 'admin' }]]);
    assert.deepEqual(ops(call, 'eq'), [['eq', 'project_id', PROJECT2], ['eq', 'user_id', OTHER]]);
  });

  it('removeMember toglie la persona solo dal progetto indicato', async () => {
    fake.responses.from.members = { data: null, error: null };
    await api.removeMember(PROJECT2, OTHER);
    const call = fromCalls('members')[0];
    assert.equal(ops(call, 'delete').length, 1);
    assert.deepEqual(ops(call, 'eq'), [['eq', 'project_id', PROJECT2], ['eq', 'user_id', OTHER]]);
  });

  it('removeMember chiamato come prima, con la sola persona, toglie solo dal progetto aperto', async () => {
    fake.responses.from.members = { data: null, error: null };
    await api.removeMember(OTHER);
    assert.deepEqual(ops(fromCalls('members')[0], 'eq'), [['eq', 'project_id', PROJECT], ['eq', 'user_id', OTHER]]);
  });

  // Un'istruzione su members deve sempre avere progetto e persona: senza uno dei due toccherebbe più righe.
  for (const [name, call, code] of [
    ['updateMemberRole senza progetto', () => api.updateMemberRole(undefined, OTHER, 'admin'), 'no_project'],
    ['updateMemberRole con una persona malformata', () => api.updateMemberRole(PROJECT, 'x', 'admin'), 'invalid_id'],
    ['updateMemberRole con un ruolo inventato', () => api.updateMemberRole(PROJECT, OTHER, 'owner'), 'invalid_role'],
    ['removeMember con un progetto malformato', () => api.removeMember('x', OTHER), 'invalid_id'],
    ['removeMember senza persona', () => api.removeMember(PROJECT, undefined), 'invalid_id'],
    ['removeMember con la persona come filtro', () => api.removeMember(PROJECT, `${OTHER},user_id.neq.x`), 'invalid_id'],
  ]) {
    it(`${name} viene rifiutato prima del database`, async () => {
      if (code === 'no_project') api.useProject(null);
      await assert.rejects(call(), (e) => e.code === code);
      assert.equal(fromCalls('members').length, 0);
    });
  }

  it('updateMember chiamato come prima per il ruolo cambia il ruolo nel progetto aperto', async () => {
    fake.responses.from.members = { data: { user_id: OTHER }, error: null };
    await api.updateMember(OTHER, { role: 'advisor' });
    const call = fromCalls('members')[0];
    assert.deepEqual(ops(call, 'update'), [['update', { role: 'advisor' }]]);
    assert.deepEqual(ops(call, 'eq'), [['eq', 'project_id', PROJECT], ['eq', 'user_id', OTHER]]);
    assert.equal(fromCalls('profiles').length, 0);
  });

  it('updateMember chiamato come prima per nome e colore cambia il proprio profilo', async () => {
    fake.responses.from.profiles = { data: { user_id: ME }, error: null };
    await api.updateMember(ME, { display_name: 'Anna B.', color: '#18794e' });
    const call = fromCalls('profiles')[0];
    assert.deepEqual(ops(call, 'update'), [['update', { display_name: 'Anna B.', color: '#18794e' }]]);
    assert.deepEqual(ops(call, 'eq'), [['eq', 'user_id', ME]]);
    assert.equal(fromCalls('members').length, 0);
  });

  it('updateMember non cambia il nome di un altro: il profilo è solo di chi lo possiede', async () => {
    await assert.rejects(api.updateMember(OTHER, { display_name: 'Bruno B.' }), (e) => e.code === 'not_allowed' && /permessi/.test(e.message));
    assert.equal(fromCalls('profiles').length, 0);
  });
});

describe('profilo personale', () => {
  it('myProfile legge solo la propria riga', async () => {
    fake.responses.from.profiles = { data: { user_id: ME, display_name: 'Anna', color: '#4f5bd5', language: 'it' }, error: null };
    assert.equal((await api.myProfile()).language, 'it');
    const call = fromCalls('profiles')[0];
    assert.deepEqual(ops(call, 'eq'), [['eq', 'user_id', ME]]);
    assert.equal(ops(call, 'maybeSingle').length, 1);
  });

  it('myProfile senza riga dà null', async () => {
    fake.responses.from.profiles = { data: null, error: null };
    assert.equal(await api.myProfile(), null);
  });

  it('updateProfile scrive solo nome, colore e lingua, sulla propria riga', async () => {
    fake.responses.from.profiles = { data: { user_id: ME, language: 'en' }, error: null };
    await api.updateProfile({ language: 'en', user_id: OTHER, created_at: 'ieri', role: 'admin' });
    const call = fromCalls('profiles')[0];
    assert.deepEqual(ops(call, 'update'), [['update', { language: 'en' }]]);
    assert.deepEqual(ops(call, 'eq'), [['eq', 'user_id', ME]]);
  });

  for (const [patch, sent] of [
    [{ language: 'it' }, { language: 'it' }],
    [{ language: null }, { language: null }],
    [{ language: 'fr' }, null],
    [{ language: 'IT' }, null],
    [{}, null],
  ]) {
    it(`updateProfile con ${JSON.stringify(patch)} ${sent ? 'scrive' : 'non scrive nulla'}`, async () => {
      fake.responses.from.profiles = { data: { user_id: ME }, error: null };
      await api.updateProfile(patch);
      const calls = fromCalls('profiles');
      if (sent) assert.deepEqual(ops(calls[0], 'update'), [['update', sent]]);
      else assert.equal(calls.length, 0);
    });
  }

  it('updateProfile senza sessione non arriva al database', async () => {
    fake.responses.auth.getSession = { data: { session: null }, error: null };
    await assert.rejects(api.updateProfile({ language: 'en' }), (e) => e.code === 'invalid_id');
    assert.equal(fromCalls('profiles').length, 0);
  });
});

describe('tempo reale del progetto', () => {
  it('ogni tabella seguita dal vivo è filtrata sul progetto aperto, e members non c è più', () => {
    const off = api.subscribeDb({});
    const channel = fake.channels[0];
    assert.deepEqual(channel.handlers.map((h) => h.filter.table), ['items', 'revisions', 'comments', 'chats', 'chat_messages', 'mentions']);
    for (const h of channel.handlers) assert.equal(h.filter.filter, `project_id=eq.${PROJECT}`, h.filter.table);
    off();
    assert.deepEqual(fake.removed, [channel]);
  });

  it('un progetto passato esplicitamente vale più di quello aperto', () => {
    api.subscribeDb({ projectId: PROJECT2 });
    assert.ok(fake.channels[0].handlers.every((h) => h.filter.filter === `project_id=eq.${PROJECT2}`));
  });

  it('senza progetto non si segue niente', () => {
    api.useProject(null);
    assert.throws(() => api.subscribeDb({}), (e) => e.code === 'no_project');
    assert.equal(fake.channels.length, 0);
  });

  it('gli eventi arrivano ai gestori della loro tabella', () => {
    const seen = [];
    api.subscribeDb({ onItem: (r) => seen.push(['item', r.id]), onMention: (r, type) => seen.push(['mention', r.id, type]), onStatus: (s) => seen.push(['status', s]) });
    const channel = fake.channels[0];
    channel.emit('postgres_changes', { table: 'items', new: { id: 'i' } });
    channel.emit('postgres_changes', { table: 'mentions', eventType: 'DELETE', old: { id: 7 }, new: {} });
    assert.deepEqual(seen, [['status', 'SUBSCRIBED'], ['item', 'i'], ['mention', 7, 'DELETE']]);
  });

  it('la presenza usa il canale privato board:<progetto>, con la persona come chiave', () => {
    const presence = api.joinPresence(ME, () => {});
    const channel = fake.channels[0];
    assert.equal(channel.name, `board:${PROJECT}`);
    assert.equal(channel.options.config.private, true);
    assert.equal(channel.options.config.presence.key, ME);
    presence.track({ route: '/' });
    assert.deepEqual(channel.tracked, [{ route: '/' }]);
    presence.leave();
    assert.deepEqual(fake.removed, [channel]);
  });

  it('la presenza di un altro progetto usa il suo canale, e senza progetto non si apre', () => {
    api.joinPresence(ME, () => {}, PROJECT2);
    assert.equal(fake.channels[0].name, `board:${PROJECT2}`);
    api.useProject(null);
    assert.throws(() => api.joinPresence(ME, () => {}), (e) => e.code === 'no_project');
    assert.equal(fake.channels.length, 1);
  });
});

describe('richieste a Claude', () => {
  it('il corpo porta progetto e lingua, oltre a compito e contesto', async () => {
    fake.responses.functions.claude = { data: { text: 'ok' }, error: null };
    await api.invokeClaude('critique', 'contesto', { project: PROJECT2, language: 'en' });
    assert.deepEqual(fake.calls.at(-1), ['functions.invoke', 'claude', { body: { task: 'critique', context: 'contesto', project: PROJECT2, language: 'en' } }]);
  });

  it('senza indicazioni usa il progetto aperto e la lingua in uso', async () => {
    fake.responses.functions.claude = { data: { text: 'ok' }, error: null };
    await api.invokeClaude('critique', 'contesto');
    assert.deepEqual(fake.calls.at(-1)[2].body, { task: 'critique', context: 'contesto', project: PROJECT, language: 'it' });
  });

  it('senza progetto non chiede niente a Claude', async () => {
    api.useProject(null);
    await assert.rejects(api.invokeClaude('critique', 'contesto'), (e) => e.code === 'no_project');
    assert.equal(fake.calls.filter((c) => c[0] === 'functions.invoke').length, 0);
  });
});
