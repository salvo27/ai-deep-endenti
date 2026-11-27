import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text, byText, typeInto } from '../setup/dom.mjs';
import { ME, OTHER, PROJECT, members, projects } from '../setup/fixtures.mjs';

let api;
let store;
let team;
let original;
let fake;
let outlet;
let calls;
let current;

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  team = await import('../../assets/js/views/team.js');
  original = { ...api };
  fake = globalThis.__fakeSupabase;
});

const record = (name, result) => async (...args) => {
  calls.push([name, ...args]);
  return typeof result === 'function' ? result(...args) : result;
};

beforeEach(() => {
  fake.reset();
  store.resetStore();
  store.state.user = { id: ME };
  store.setProjects(projects());
  store.setProject(projects()[0]);
  store.setMembers(members());
  calls = [];
  // I membri come li ha il database adesso: ogni modifica li cambia, la pagina li rilegge.
  current = members();
  api.membersOverview = record('membersOverview', () => current);
  api.activitySince = async () => [];
  api.auditLog = record('auditLog', () => []);
  api.addMember = record('addMember', (project, email, name, role) => {
    current = [...current, { user_id: '00000000-0000-4000-8000-00000000000d', display_name: name, role, color: null, email, mfa_enabled: false, last_sign_in_at: null }];
  });
  api.updateMemberRole = record('updateMemberRole', (project, userId, role) => {
    current = current.map((m) => (m.user_id === userId ? { ...m, role } : m));
  });
  api.removeMember = record('removeMember', (project, userId) => {
    current = current.filter((m) => m.user_id !== userId);
  });
  document.body.querySelectorAll('dialog, .toasts, main').forEach((el) => el.remove());
});

afterEach(() => Object.assign(api, original));

async function open() {
  outlet = document.createElement('main');
  document.body.append(outlet);
  team.teamView(outlet);
  await flush(5);
  return outlet;
}

const named = (name) => calls.filter(([n]) => n === name);
const dialog = () => document.querySelector('dialog.modal');
const toasts = () => text(document.querySelector('.toasts'));
const names = () => [...outlet.querySelectorAll('tbody tr')].map((tr) => text(tr.querySelector('.person-name')));
const dbError = (code, message) => ({ data: null, error: { code, message } });

describe('pagina Membri del progetto aperto', () => {
  it('legge le persone del progetto aperto entrando nella pagina', async () => {
    await open();
    assert.deepEqual(named('membersOverview'), [['membersOverview', PROJECT]]);
    assert.deepEqual(names(), ['Anna (tu)', 'Bruno', 'Chiara']);
  });

  it('aggiunge una persona al progetto aperto e rilegge i membri', async () => {
    await open();
    const form = outlet.querySelector('form');
    const [email, name] = form.querySelectorAll('input');
    typeInto(email, ' nuovo@test.it ');
    typeInto(name, 'Nuovo Membro');
    form.querySelector('select').value = 'advisor';
    form.dispatchEvent(new window.Event('submit', { cancelable: true }));
    await flush(5);
    assert.deepEqual(named('addMember'), [['addMember', PROJECT, 'nuovo@test.it', 'Nuovo Membro', 'advisor']]);
    assert.equal(named('membersOverview').length, 2, 'i membri non arrivano più dal vivo: si rileggono');
    assert.deepEqual(names(), ['Anna (tu)', 'Bruno', 'Chiara', 'Nuovo Membro']);
    assert.match(toasts(), /Membro aggiunto\./);
  });

  it('cambia il ruolo nel progetto aperto e la tabella mostra quello salvato', async () => {
    await open();
    const select = outlet.querySelector('select[aria-label="Ruolo di Bruno"]');
    select.value = 'advisor';
    select.dispatchEvent(new window.Event('change'));
    await flush(5);
    assert.deepEqual(named('updateMemberRole'), [['updateMemberRole', PROJECT, OTHER, 'advisor']]);
    assert.equal(named('membersOverview').length, 2);
    assert.equal(outlet.querySelector('select[aria-label="Ruolo di Bruno"]').value, 'advisor');
    assert.equal(store.memberById(OTHER).role, 'advisor');
  });

  it('rimuove dal progetto aperto dopo la conferma e rilegge i membri', async () => {
    await open();
    outlet.querySelector('button[title="Rimuovi Bruno"]').click();
    await flush();
    assert.match(text(dialog()), /Bruno perderà subito l'accesso a questo progetto\./);
    byText(dialog().querySelector('.modal-actions'), 'button', 'Rimuovi').click();
    await flush(5);
    assert.deepEqual(named('removeMember'), [['removeMember', PROJECT, OTHER]]);
    assert.equal(named('membersOverview').length, 2);
    assert.deepEqual(names(), ['Anna (tu)', 'Chiara']);
  });

  it('un rifiuto del database si legge nel testo del suo codice e il ruolo torna quello di prima', async () => {
    api.updateMemberRole = original.updateMemberRole;
    fake.responses.from.members = dbError('P0001', 'last_project_admin');
    await open();
    const select = outlet.querySelector('select[aria-label="Ruolo di Bruno"]');
    select.value = 'advisor';
    select.dispatchEvent(new window.Event('change'));
    await flush(5);
    assert.match(toasts(), /Nel progetto deve restare almeno un admin\./);
    assert.equal(outlet.querySelector('select[aria-label="Ruolo di Bruno"]').value, 'member');
    const update = fake.calls.find(([kind, table]) => kind === 'from' && table === 'members');
    assert.deepEqual(update[2].filter(([op]) => op === 'eq'), [['eq', 'project_id', PROJECT], ['eq', 'user_id', OTHER]], 'solo nel progetto aperto');
  });

  it('un account che non esiste si legge nel testo del suo codice', async () => {
    api.addMember = original.addMember;
    fake.responses.rpc.add_member = dbError('P0002', 'user_not_found');
    await open();
    const form = outlet.querySelector('form');
    const [email, name] = form.querySelectorAll('input');
    typeInto(email, 'nessuno@test.it');
    typeInto(name, 'Nessuno');
    form.dispatchEvent(new window.Event('submit', { cancelable: true }));
    await flush(5);
    assert.match(text(form), /Nessun account con questa email che tu possa aggiungere: va creato prima in Supabase\./);
    assert.equal(fake.calls.find(([kind, name]) => kind === 'rpc' && name === 'add_member')[2].p_project, PROJECT);
  });

  it('il registro di sicurezza è quello del progetto aperto, eventi del progetto compresi', async () => {
    api.auditLog = record('auditLog', () => [
      { id: 4, event: 'project_renamed', actor_id: ME, target_id: null, details: { from: 'Alfa', to: 'Alfa 2' }, created_at: '2026-10-17T10:00:00Z' },
      { id: 3, event: 'project_created', actor_id: null, target_id: null, details: { name: 'Alfa' }, created_at: '2026-10-16T10:00:00Z' },
      { id: 2, event: 'member_added', actor_id: ME, target_id: OTHER, details: { role: 'member' }, created_at: '2026-10-15T10:00:00Z' },
      { id: 1, event: 'project_archived', actor_id: ME, target_id: null, details: {}, created_at: '2026-10-14T10:00:00Z' },
    ]);
    await open();
    assert.deepEqual(named('auditLog'), [['auditLog', { projectId: PROJECT, limit: 50 }]]);
    const lines = [...outlet.querySelectorAll('.log-main')].map((el) => text(el));
    assert.deepEqual(lines, [
      'Anna ha rinominato il progetto (Alfa → Alfa 2)',
      'Sistema ha creato il progetto «Alfa»',
      'Anna ha aggiunto Bruno (Membro)',
      'Anna ha archiviato il progetto',
    ]);
  });

  // A platform admin creates a project and adds its first admin without being a member: the log names them as such,
  // not as someone who left the team. The events only a platform admin can do say it even in rows written before.
  it('nel registro chi agisce come amministratore della piattaforma si legge così, non come ex membro', async () => {
    const PLATFORM = '00000000-0000-4000-8000-0000000000ee';
    const GONE = '00000000-0000-4000-8000-0000000000ef';
    api.auditLog = record('auditLog', () => [
      { id: 6, event: 'member_removed', actor_id: GONE, target_id: OTHER, details: { role: 'member' }, created_at: '2026-10-19T10:00:00Z' },
      { id: 5, event: 'project_archived', actor_id: PLATFORM, target_id: null, details: {}, created_at: '2026-10-18T10:00:00Z' },
      { id: 4, event: 'project_renamed', actor_id: PLATFORM, target_id: null, details: { from: 'Alfa', to: 'Alfa 2', by: 'platform_admin' }, created_at: '2026-10-17T10:00:00Z' },
      { id: 3, event: 'member_role_changed', actor_id: ME, target_id: OTHER, details: { from: 'member', to: 'advisor' }, created_at: '2026-10-16T12:00:00Z' },
      { id: 2, event: 'member_added', actor_id: PLATFORM, target_id: ME, details: { role: 'admin', by: 'platform_admin' }, created_at: '2026-10-16T10:00:00Z' },
      { id: 1, event: 'project_created', actor_id: PLATFORM, target_id: null, details: { name: 'Alfa', by: 'platform_admin' }, created_at: '2026-10-15T10:00:00Z' },
    ]);
    await open();
    const lines = [...outlet.querySelectorAll('.log-main')].map((el) => text(el));
    assert.deepEqual(lines, [
      'Ex membro ha rimosso Bruno (Membro)',
      'Un amministratore della piattaforma ha archiviato il progetto',
      'Un amministratore della piattaforma ha rinominato il progetto (Alfa → Alfa 2)',
      'Anna ha cambiato il ruolo di Bruno (Membro → Advisor)',
      'Un amministratore della piattaforma ha aggiunto Anna (Admin)',
      'Un amministratore della piattaforma ha creato il progetto «Alfa»',
    ]);
  });

  it('il riepilogo settimanale si chiede per il progetto aperto', async () => {
    fake.responses.functions.notify = { data: { job: 'weekly-preview', configured: true, recipients: 1, empty: 0, optedOut: 0, preview: null }, error: null };
    await open();
    byText(outlet, 'button', 'Anteprima').click();
    await flush(5);
    const call = fake.calls.find(([kind]) => kind === 'functions.invoke');
    assert.equal(call[2].body.project, PROJECT);
    assert.equal(call[2].body.job, 'weekly-preview');
    assert.match(text(outlet), /Adesso lo riceverebbe 1 persona\./);
  });

  // [destinatari, chi non ha nulla, chi l ha spento, frase]
  for (const [recipients, empty, optedOut, sentence] of [
    [1, 0, 0, 'Adesso lo riceverebbe 1 persona.'],
    [2, 1, 0, 'Adesso lo riceverebbero 2 persone (1 persona non ha nulla da leggere).'],
    [0, 2, 3, 'Adesso lo riceverebbero 0 persone (2 persone non hanno nulla da leggere, 3 persone l\'hanno spento).'],
  ]) {
    it(`conta ${recipients} destinatari al singolare o al plurale`, () => {
      const [counts] = team.weeklyPreviewNode({ recipients, empty, optedOut, preview: null });
      assert.equal(text(counts), sentence);
    });
  }

  it('chi non è admin vede le persone ma non le gestisce, e il registro non si chiede', async () => {
    current = members().map((m) => (m.user_id === ME ? { ...m, role: 'member' } : m));
    store.setMembers(current);
    await open();
    assert.equal(outlet.querySelector('form'), null);
    assert.equal(outlet.querySelector('select'), null);
    assert.deepEqual(named('auditLog'), []);
    assert.deepEqual(names(), ['Anna (tu)', 'Bruno', 'Chiara']);
  });
});
