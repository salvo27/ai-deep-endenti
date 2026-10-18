import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, byText, text, typeInto } from '../setup/dom.mjs';
import { IDS, ME, OTHER, boardItems, item, members } from '../setup/fixtures.mjs';

let api;
let store;
let original;
let mods;

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  mods = {
    aiPanel: await import('../../assets/js/views/ai-panel.js'),
    canvas: await import('../../assets/js/views/canvas.js'),
    actions: await import('../../assets/js/views/actions.js'),
    comments: await import('../../assets/js/views/comments.js'),
    profile: await import('../../assets/js/views/profile.js'),
    team: await import('../../assets/js/views/team.js'),
    generator: await import('../../assets/js/views/generator.js'),
    exporter: await import('../../assets/js/export.js'),
  };
  original = { ...api };
});

beforeEach(() => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  document.body.querySelectorAll('dialog, .toasts').forEach((d) => d.remove());
});

afterEach(() => Object.assign(api, original));

const dialog = () => document.querySelector('dialog');

test('the Claude panel shows the answer and saves it as a comment', async () => {
  let sent = null;
  api.invokeClaude = async (task, context) => {
    sent = { task, context };
    return { text: 'Rischio principale: il prezzo.', remaining: 5 };
  };
  let comment = null;
  api.addComment = async (id, body, task) => (comment = { id, body, task });
  const idea = store.getItem(IDS.idea);
  const button = mods.aiPanel.aiButton('critique', () => ({ idea }), { item: idea });
  button.click();
  await flush(5);
  assert.equal(sent.task, 'critique');
  assert.match(sent.context, /Idea alfa/);
  assert.match(text(dialog()), /Rischio principale/);
  assert.match(text(dialog()), /ancora disponibili: 5/);
  byText(dialog(), 'button', 'Salva come commento').click();
  await flush(5);
  assert.deepEqual(comment, { id: IDS.idea, body: 'Rischio principale: il prezzo.', task: 'critique' });
  assert.equal(dialog(), null);
});

test('the Claude panel can hand the answer back and shows errors', async () => {
  api.invokeClaude = async () => ({ text: 'Tre idee nuove', truncated: true });
  let accepted = null;
  mods.aiPanel.openAiPanel('cell_ideas', () => ({ cell: { row: 'XAI', col: 'Settore A' } }), { onAccept: (t) => (accepted = t), acceptLabel: 'Aggiungi' });
  await flush(5);
  assert.match(text(dialog()), /interrotta/);
  byText(dialog(), 'button', 'Aggiungi').click();
  assert.equal(accepted, 'Tre idee nuove');
  mods.aiPanel.openAiPanel('critique', () => ({}), {});
  await flush(5);
  assert.match(text(dialog().querySelector('.error-box')), /abbastanza contenuto/);
});

test('the canvas editor writes text and validated flags into the snapshot', () => {
  const working = { data: { problem: 'p' } };
  let changes = 0;
  const el = mods.canvas.canvasEditor(working, () => changes++);
  assert.equal(el.querySelectorAll('textarea').length, 12);
  typeInto(el.querySelector('textarea[aria-label="Soluzione"]'), 'nuova soluzione');
  const check = el.querySelector('.lc-sol input[type="checkbox"]');
  check.checked = true;
  check.dispatchEvent(new window.Event('change'));
  assert.equal(working.data.solution, 'nuova soluzione');
  assert.equal(working.data.validated.solution, true);
  check.checked = false;
  check.dispatchEvent(new window.Event('change'));
  assert.equal(working.data.validated.solution, undefined);
  assert.ok(changes >= 3);
});

test('status changes report errors and archiving asks first', async () => {
  api.saveItem = async () => ({ status: 'forbidden' });
  assert.equal(await mods.actions.changeStatus(store.getItem(IDS.idea2), 'scelta'), null);
  assert.match(text(document.querySelector('.toasts')), /permessi/);
  assert.equal(await mods.actions.changeStatus(store.getItem(IDS.idea2), 'nuova'), null, 'stesso stato: nessun salvataggio');

  let archived = 0;
  api.deleteItem = async () => {
    archived += 1;
    return { status: 'ok', item: item({ ...store.getItem(IDS.idea2), version: 2, deleted_at: '2026-10-18T00:00:00Z' }) };
  };
  const cancelled = mods.actions.archiveWithConfirm(store.getItem(IDS.idea2));
  await flush();
  assert.match(text(dialog()), /Lean Canvas, esperimenti e interviste/);
  byText(dialog(), 'button', 'Annulla').click();
  assert.equal(await cancelled, false);
  const confirmed = mods.actions.archiveWithConfirm(store.getItem(IDS.idea2), { backTo: '/idee' });
  await flush();
  byText(dialog(), 'button', 'Archivia').click();
  assert.equal(await confirmed, true);
  assert.equal(archived, 1);
  assert.equal(location.hash, '#/idee');

  api.restoreItem = async () => ({ status: 'forbidden' });
  assert.equal(await mods.actions.restoreWithToast(store.getItem(IDS.idea2)), false);
});

test('comments can be added, edited and deleted by their author only', async () => {
  let rows = [
    { id: 'c0000000-0000-4000-8000-000000000001', item_id: IDS.idea, author_id: ME, body: 'Mio', created_at: '2026-10-17T10:00:00Z' },
    { id: 'c0000000-0000-4000-8000-000000000002', item_id: IDS.idea, author_id: OTHER, body: 'Di Bruno', created_at: '2026-10-17T11:00:00Z' },
  ];
  const log = [];
  api.listComments = async () => rows;
  api.addComment = async (id, body) => {
    log.push(['add', body]);
    rows = [...rows, { id: 'c0000000-0000-4000-8000-000000000003', item_id: id, author_id: ME, body, created_at: '2026-10-18T10:00:00Z' }];
  };
  api.editComment = async (id, body) => log.push(['edit', id, body]);
  api.deleteComment = async (id) => log.push(['delete', id]);
  const panel = mods.comments.commentsPanel(store.getItem(IDS.idea));
  document.body.append(panel);
  await flush(5);
  assert.equal(panel.querySelectorAll('.comment').length, 2);
  assert.equal(panel.querySelectorAll('.comment-actions').length, 1, 'azioni solo sui propri commenti');
  typeInto(panel.querySelector('textarea[aria-label="Nuovo commento"]'), '  Nuovo commento  ');
  byText(panel, 'button', 'Commenta').click();
  await flush(5);
  assert.deepEqual(log[0], ['add', 'Nuovo commento']);
  byText(panel, 'button', 'Modifica').click();
  const area = panel.querySelector('.comment textarea');
  typeInto(area, 'Mio corretto');
  byText(panel, 'button', 'Salva').click();
  await flush(5);
  assert.deepEqual(log[1], ['edit', rows[0].id, 'Mio corretto']);
  byText(panel, 'button', 'Elimina').click();
  await flush();
  byText(dialog(), 'button', 'Elimina').click();
  await flush(5);
  assert.deepEqual(log[2], ['delete', rows[0].id]);
  store.emit('comment', { item_id: IDS.idea });
  panel.cleanup();
  panel.remove();
});

test('profile saves name and color, changes the password and manages devices', async () => {
  const log = [];
  api.updateMember = async (id, patch) => log.push(['member', id, patch]);
  api.membersOverview = async () => members();
  api.updatePassword = async (p) => log.push(['password', p]);
  let factors = [
    { id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'iPhone', created_at: '2026-10-01T10:00:00Z' },
    { id: 'f2', factor_type: 'totp', status: 'verified', friendly_name: 'iPad', created_at: '2026-10-02T10:00:00Z' },
  ];
  api.listFactors = async () => factors;
  api.unenrollFactor = async (id) => {
    log.push(['unenroll', id]);
    factors = factors.filter((f) => f.id !== id);
  };
  api.aiUsageLastDay = async () => 1;
  api.signOut = async (scope) => log.push(['signout', scope]);
  const outlet = document.createElement('main');
  document.body.append(outlet);
  mods.profile.profileView(outlet);
  await flush(5);

  const [profileForm, passwordForm] = outlet.querySelectorAll('form');
  typeInto(profileForm.querySelector('input[type="text"]'), 'Anna B.');
  profileForm.dispatchEvent(new window.Event('submit', { cancelable: true }));
  await flush(5);
  assert.deepEqual(log[0], ['member', ME, { display_name: 'Anna B.', color: '#4f5bd5' }]);

  const [pwd, confirm] = passwordForm.querySelectorAll('input');
  typeInto(pwd, 'Nuova-Password-1');
  typeInto(confirm, 'Diversa-Password-1');
  passwordForm.dispatchEvent(new window.Event('submit', { cancelable: true }));
  await flush();
  assert.match(text(passwordForm), /non coincidono/);
  typeInto(confirm, 'Nuova-Password-1');
  passwordForm.dispatchEvent(new window.Event('submit', { cancelable: true }));
  await flush(5);
  assert.deepEqual(log[1], ['password', 'Nuova-Password-1']);

  byText(outlet, 'button', 'Rimuovi').click();
  await flush();
  byText(dialog(), 'button', 'Rimuovi').click();
  await flush(5);
  assert.deepEqual(log[2], ['unenroll', 'f1']);
  assert.match(text(outlet), /unico dispositivo/);

  byText(outlet, 'button', 'Esci da tutti i dispositivi').click();
  await flush();
  byText(dialog(), 'button', 'Esci ovunque').click();
  await flush(5);
  assert.deepEqual(log.at(-1), ['signout', 'global']);
  outlet.remove();
});

test('profile adds a second device through the enrollment flow', async () => {
  api.listFactors = async () => [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'iPhone', created_at: '2026-10-01T10:00:00Z' }];
  api.aiUsageLastDay = async () => 0;
  api.enrollTotp = async () => ({ id: 'f9', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SEGRETO' } });
  let verified = null;
  api.verifyTotp = async (id, code) => (verified = [id, code]);
  const outlet = document.createElement('main');
  mods.profile.profileView(outlet);
  await flush(5);
  byText(outlet, 'button', 'Aggiungi un dispositivo').click();
  await flush(5);
  const form = dialog().querySelector('form');
  typeInto(form.querySelector('input[name="code"]'), '123123');
  form.dispatchEvent(new window.Event('submit', { cancelable: true }));
  await flush(10);
  assert.deepEqual(verified, ['f9', '123123']);
});

test('the admin changes roles, removes and adds members', async () => {
  const log = [];
  api.updateMember = async (id, patch) => log.push(['role', id, patch.role]);
  api.removeMember = async (id) => log.push(['remove', id]);
  api.addMember = async (email, name, role) => log.push(['add', email, name, role]);
  api.membersOverview = async () => members();
  api.activitySince = async () => [];
  api.auditLog = async () => [];
  api.exportAll = async () => ({ items: [], revisions: [], comments: [] });
  const outlet = document.createElement('main');
  mods.team.teamView(outlet);
  await flush(5);
  const roleSelect = outlet.querySelector(`select[aria-label="Ruolo di Bruno"]`);
  roleSelect.value = 'advisor';
  roleSelect.dispatchEvent(new window.Event('change'));
  await flush(5);
  assert.deepEqual(log[0], ['role', OTHER, 'advisor']);
  outlet.querySelector('button[title="Rimuovi Bruno"]').click();
  await flush();
  byText(dialog(), 'button', 'Rimuovi').click();
  await flush(5);
  assert.deepEqual(log[1], ['remove', OTHER]);
  const form = outlet.querySelector('form');
  form.dispatchEvent(new window.Event('submit', { cancelable: true }));
  await flush();
  assert.match(text(form), /Inserisci email e nome/);
  const [email, name] = form.querySelectorAll('input');
  typeInto(email, 'nuovo@test.it');
  typeInto(name, 'Nuovo Membro');
  form.dispatchEvent(new window.Event('submit', { cancelable: true }));
  await flush(5);
  assert.deepEqual(log[2], ['add', 'nuovo@test.it', 'Nuovo Membro', 'member']);
  assert.equal(mods.team.roleLabel('advisor'), 'Advisor');
  assert.deepEqual([...mods.team.activityCounts([{ author_id: ME }, { author_id: ME }])], [[ME, 2]]);
});

test('exports download a Markdown idea and a JSON backup', async () => {
  const downloads = [];
  URL.createObjectURL = (blob) => {
    downloads.push(blob);
    return 'blob:test';
  };
  URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function click() {
    downloads.push(this.download);
  };
  mods.exporter.exportIdeaMarkdown(store.getItem(IDS.idea));
  assert.match(await downloads[0].text(), /^# Idea alfa/);
  assert.equal(downloads[1], 'idea-alfa.md');
  api.exportAll = async () => ({ items: [{ id: 'x' }], revisions: [], comments: [] });
  const backup = await mods.exporter.exportBackup();
  assert.equal(backup.items.length, 1);
  assert.deepEqual(Object.keys(backup.members[0]), ['user_id', 'display_name', 'role']);
  assert.match(downloads[3], /^ai-deep-endenti-backup-\d{4}-\d{2}-\d{2}\.json$/);
});

test('the generator adds and removes rows and creates the default grid', async () => {
  const saved = [];
  api.saveItem = async (args) => {
    saved.push(args);
    return { status: 'ok', item: item({ ...store.getItem(IDS.generator), version: saved.length + 1, data: args.snapshot.data }) };
  };
  const outlet = document.createElement('main');
  const off = mods.generator.generatorView(outlet);
  byText(outlet, 'button', 'Riga').click();
  await flush();
  dialog().querySelector('input').value = 'Ottimizzazione';
  byText(dialog(), 'button', 'Salva').click();
  await flush(10);
  assert.equal(saved[0].snapshot.data.rows.at(-1).label, 'Ottimizzazione');
  assert.match(saved[0].message, /nuova riga «Ottimizzazione»/);
  outlet.querySelector('button[aria-label="Togli XAI"]').click();
  await flush();
  byText(dialog(), 'button', 'Togli').click();
  await flush(10);
  assert.equal(saved[1].snapshot.data.rows.some((r) => r.label === 'XAI'), false);
  assert.deepEqual(saved[1].snapshot.data.cells, {});
  off();

  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  let created = null;
  api.createItem = async (args) => {
    created = args;
    return item({ id: IDS.generator, kind: 'generator', title: args.title, data: args.data });
  };
  mods.generator.generatorView(outlet);
  byText(outlet, 'button', 'Crea la griglia predefinita').click();
  await flush(10);
  assert.equal(created.kind, 'generator');
  assert.equal(created.data.rows.length, 3);
});

test('generator rows and columns list the people who have that skill or know that sector', async () => {
  const saved = [];
  api.saveItem = async (args) => {
    saved.push(args);
    return { status: 'ok', item: item({ ...store.getItem(IDS.generator), version: saved.length + 1, data: args.snapshot.data }) };
  };
  const outlet = document.createElement('main');
  const off = mods.generator.generatorView(outlet);
  outlet.querySelector('button[aria-label="Modifica XAI"]').click();
  await flush();
  const box = [...dialog().querySelectorAll('label.check')].find((l) => /Bruno/.test(l.textContent)).querySelector('input');
  box.checked = true;
  box.dispatchEvent(new window.Event('change'));
  dialog().querySelectorAll('input[type="text"]')[1].value = 'Prof. esterno';
  byText(dialog(), 'button', 'Salva').click();
  await flush(10);
  const row = saved[0].snapshot.data.rows.find((r) => r.id === 'r-xai');
  assert.deepEqual(row.people, [OTHER]);
  assert.equal(row.others, 'Prof. esterno');
  assert.equal(row.label, 'XAI');
  assert.match(saved[0].message, /modificata riga «XAI»/);
  await flush();
  const head = outlet.querySelector('tbody th .axis-people');
  assert.ok(head.querySelector('.avatar[title="Bruno"]'));
  assert.match(text(head), /Prof\. esterno/);
  outlet.querySelector('.gen-cell-btn').click();
  await flush();
  assert.match(text(dialog()), /Competenza \(XAI\): Bruno, Prof\. esterno/);
  byText(dialog(), 'button', 'Chiudi').click();
  off();
});

test('a generator cell can ask Claude and turn into a new idea', async () => {
  api.invokeClaude = async () => ({ text: 'Idea A\nIdea B' });
  const outlet = document.createElement('main');
  mods.generator.generatorView(outlet);
  outlet.querySelector('.gen-cell-btn').click();
  byText(dialog(), 'button', 'Chiedi idee a Claude').click();
  await flush(5);
  const dialogs = document.querySelectorAll('dialog');
  byText(dialogs[1], 'button', 'Aggiungi agli spunti').click();
  assert.match(document.querySelector('dialog textarea').value, /Idea A/);
  byText(document.querySelector('dialog'), 'button', 'Crea un\'idea da questa cella').click();
  assert.match(location.hash, /#\/nuovo\/idea\?origin=r-xai%3Ac-sa&tech=XAI&sector=Settore\+A/);
});
