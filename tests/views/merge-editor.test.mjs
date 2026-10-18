import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, byText, text, typeInto } from '../setup/dom.mjs';
import { ADVISOR, IDS, ME, OTHER, boardItems, item, members } from '../setup/fixtures.mjs';

let api;
let store;
let merge;
let editor;
let router;
let original;

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  merge = await import('../../assets/js/views/merge.js');
  editor = await import('../../assets/js/views/editor.js');
  router = await import('../../assets/js/router.js');
  original = { ...api };
});

beforeEach(() => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  localStorage.clear();
  document.body.querySelectorAll('dialog').forEach((d) => d.remove());
});

afterEach(() => {
  Object.assign(api, original);
  router.setLeaveGuard(null);
});

const snap = (i) => ({ title: i.title, status: i.status, idea_id: i.idea_id, data: structuredClone(i.data) });

test('saveWithMerge saves directly when nobody else saved', async () => {
  api.saveItem = async ({ snapshot }) => ({ status: 'ok', item: item({ ...store.getItem(IDS.idea2), version: 2, title: snapshot.title }) });
  const idea = store.getItem(IDS.idea2);
  const res = await merge.saveWithMerge(idea, snap(idea), { ...snap(idea), title: 'Nuovo titolo' }, 'msg');
  assert.equal(res.merged, false);
  assert.equal(store.getItem(IDS.idea2).title, 'Nuovo titolo');
});

test('saveWithMerge rebases on the newer version when the edits touch different fields', async () => {
  const idea = store.getItem(IDS.idea2);
  const theirs = item({ ...idea, version: 2, updated_by: OTHER, data: { ...idea.data, sector: 'Settore B' } });
  const calls = [];
  api.saveItem = async ({ baseVersion, snapshot }) => {
    calls.push({ baseVersion, snapshot });
    if (baseVersion === 1) return { status: 'conflict', item: theirs };
    return { status: 'ok', item: item({ ...theirs, version: 3, data: snapshot.data }) };
  };
  const res = await merge.saveWithMerge(idea, snap(idea), { ...snap(idea), data: { ...idea.data, pitch: 'Il mio pitch' } }, 'mio');
  assert.equal(res.merged, true);
  assert.equal(calls[1].baseVersion, 2);
  assert.deepEqual(calls[1].snapshot.data, { owner: OTHER, sector: 'Settore B', pitch: 'Il mio pitch' });
});

test('saveWithMerge asks which version to keep when both changed the same field', async () => {
  const idea = store.getItem(IDS.idea2);
  const theirs = item({ ...idea, version: 2, updated_by: OTHER, data: { ...idea.data, pitch: 'Loro' } });
  let second = null;
  api.saveItem = async ({ baseVersion, snapshot }) => {
    if (baseVersion === 1) return { status: 'conflict', item: theirs };
    second = snapshot;
    return { status: 'ok', item: item({ ...theirs, version: 3, data: snapshot.data }) };
  };
  const pending = merge.saveWithMerge(idea, snap(idea), { ...snap(idea), data: { ...idea.data, pitch: 'Mio' } }, '');
  await flush();
  const dialog = document.querySelector('dialog');
  assert.match(text(dialog), /Bruno ha salvato/);
  assert.match(text(dialog), /In una frase/);
  dialog.querySelector('input[value="theirs"]').click();
  dialog.querySelector('input[value="theirs"]').dispatchEvent(new window.Event('change'));
  byText(dialog, 'button', 'Salva con queste scelte').click();
  await pending;
  assert.equal(second.data.pitch, 'Loro');
});

test('saveWithMerge can be cancelled and reports deletions and permissions', async () => {
  const idea = store.getItem(IDS.idea2);
  api.saveItem = async () => ({ status: 'conflict', item: item({ ...idea, version: 2, data: { pitch: 'Loro' } }) });
  const res = await merge.saveWithMerge(idea, snap(idea), { ...snap(idea), data: { pitch: 'Mio' } }, '', { resolveConflict: async () => null });
  assert.equal(res.cancelled, true);
  api.saveItem = async () => ({ status: 'deleted', item: item({ ...idea, version: 2, deleted_at: '2026-10-18T00:00:00Z' }) });
  await assert.rejects(merge.saveWithMerge(store.getItem(IDS.idea2), snap(idea), snap(idea), ''), /archiviato/);
  api.saveItem = async () => ({ status: 'forbidden' });
  await assert.rejects(merge.saveWithMerge(store.getItem(IDS.idea2), snap(idea), snap(idea), ''), /permessi/);
});

test('saveWithMerge gives up after repeated conflicts', async () => {
  let version = 1;
  api.saveItem = async () => ({ status: 'conflict', item: item({ ...store.getItem(IDS.idea2), version: ++version, title: `T${version}` }) });
  await assert.rejects(
    merge.saveWithMerge(store.getItem(IDS.idea2), snap(store.getItem(IDS.idea2)), { ...snap(store.getItem(IDS.idea2)), title: 'Mio' }, '', { resolveConflict: async ({ conflicts }) => conflicts.map(() => 'mine') }),
    /modificato/,
  );
});

test('initialSnapshot prefills canvas and experiments from the idea', () => {
  const canvas = editor.initialSnapshot('canvas', new URLSearchParams({ idea: IDS.idea }));
  assert.equal(canvas.idea_id, IDS.idea);
  assert.match(canvas.title, /^Lean Canvas: Idea alfa/);
  assert.equal(canvas.data.problem, 'Riga 1\nRiga 2');
  const exp = editor.initialSnapshot('experiment', new URLSearchParams({ idea: IDS.idea }));
  assert.equal(exp.data.owner, ME);
  assert.equal(exp.status, 'pianificato');
  const fromCell = editor.initialSnapshot('idea', new URLSearchParams({ origin: 'r-xai:c-sa', tech: 'XAI', sector: 'Settore A' }));
  assert.deepEqual(fromCell.data, { technologies: ['XAI'], sector: 'Settore A', owner: ME, origin: 'r-xai:c-sa' });
  assert.equal(editor.initialSnapshot('canvas', new URLSearchParams({ idea: IDS.canvas })).idea_id, null);
});

test('creating an idea: the save button activates only after a change and the commit message is sent', async () => {
  const outlet = document.createElement('main');
  let created = null;
  api.createItem = async (args) => {
    created = args;
    return item({ id: '12121212-1212-4121-8121-121212121212', kind: 'idea', title: args.title, status: args.status, data: args.data });
  };
  const cleanup = editor.editorView(outlet, { kind: 'idea' }, new URLSearchParams());
  const save = byText(outlet, 'button', 'Crea');
  assert.equal(save.disabled, true);
  typeInto(outlet.querySelector('.input-title'), 'Formulazioni alimentari');
  assert.equal(save.disabled, false);
  typeInto(outlet.querySelector('.save-bar input'), 'idea nata dal generatore');
  save.click();
  await flush(10);
  assert.equal(created.title, 'Formulazioni alimentari');
  assert.equal(created.message, 'idea nata dal generatore');
  assert.equal(location.hash, '#/idea/12121212-1212-4121-8121-121212121212');
  cleanup?.();
});

test('the editor validates required fields before saving', async () => {
  const outlet = document.createElement('main');
  api.createItem = async () => assert.fail('non deve salvare');
  editor.editorView(outlet, { kind: 'experiment' }, new URLSearchParams());
  typeInto(outlet.querySelector('.input-title'), 'Esperimento senza idea');
  byText(outlet, 'button', 'Crea').click();
  await flush();
  assert.match(text(outlet.querySelector('.error-box')), /idea/);
});

test('interviews without a title get one from role and organization', async () => {
  const outlet = document.createElement('main');
  let created = null;
  api.createItem = async (args) => {
    created = args;
    return item({ id: '13131313-1313-4131-8131-131313131313', kind: 'interview', ...args, idea_id: null });
  };
  editor.editorView(outlet, { kind: 'interview' }, new URLSearchParams());
  const fields = [...outlet.querySelectorAll('.form-grid .field')];
  const roleInput = fields.find((f) => /Ruolo/.test(f.textContent)).querySelector('input');
  const orgInput = fields.find((f) => /Organizzazione/.test(f.textContent)).querySelector('input');
  typeInto(roleInput, 'Responsabile acquisti');
  typeInto(orgInput, 'Azienda Bianchi');
  byText(outlet, 'button', 'Crea').click();
  await flush(10);
  assert.equal(created.title, 'Responsabile acquisti, Azienda Bianchi');
  assert.equal(created.data.interviewer, ME);
});

test('advisors and archived items cannot be edited', () => {
  store.setMembers(members().map((m) => (m.user_id === ME ? { ...m, role: 'advisor' } : m)));
  const outlet = document.createElement('main');
  editor.editorView(outlet, { kind: 'idea' }, new URLSearchParams());
  assert.match(text(outlet), /advisor/);
  store.setMembers(members());
  editor.editorView(outlet, { id: IDS.trashed }, new URLSearchParams());
  assert.match(text(outlet), /archiviato/);
  editor.editorView(outlet, { id: '00000000-0000-4000-8000-000000000999' }, new URLSearchParams());
  assert.match(text(outlet), /non trovato/);
});

test('editing keeps a local draft and offers to restore it', async () => {
  const outlet = document.createElement('main');
  let cleanup = editor.editorView(outlet, { id: IDS.idea2 }, new URLSearchParams());
  typeInto(outlet.querySelector('.input-title'), 'Bozza non salvata');
  await new Promise((r) => setTimeout(r, 700));
  cleanup();
  router.setLeaveGuard(null);
  cleanup = editor.editorView(outlet, { id: IDS.idea2 }, new URLSearchParams());
  const restore = byText(outlet, 'button', 'Ripristina la bozza');
  assert.ok(restore, 'la bozza viene proposta');
  restore.click();
  assert.equal(outlet.querySelector('.input-title').value, 'Bozza non salvata');
  cleanup();
});

test('a remote save during editing shows a banner and the save merges', async () => {
  const outlet = document.createElement('main');
  const idea = store.getItem(IDS.idea2);
  editor.editorView(outlet, { id: IDS.idea2 }, new URLSearchParams());
  typeInto(outlet.querySelector('.input-title'), 'Titolo mio');
  store.applyItem(item({ ...idea, version: 2, updated_by: OTHER, data: { ...idea.data, sector: 'Settore B' } }));
  assert.match(text(outlet.querySelector('.banner')), /Bruno ha salvato una nuova versione/);
  const sent = [];
  api.saveItem = async ({ baseVersion, snapshot }) => {
    sent.push(baseVersion);
    if (baseVersion === 1) return { status: 'conflict', item: store.getItem(IDS.idea2) };
    return { status: 'ok', item: item({ ...store.getItem(IDS.idea2), version: 3, title: snapshot.title, data: snapshot.data }) };
  };
  byText(outlet, 'button', 'Salva').click();
  await flush(10);
  assert.deepEqual(sent, [1, 2]);
  assert.equal(store.getItem(IDS.idea2).title, 'Titolo mio');
  assert.equal(store.getItem(IDS.idea2).data.sector, 'Settore B');
});

test('leaving with unsaved changes asks for confirmation', async () => {
  const outlet = document.createElement('main');
  editor.editorView(outlet, { id: IDS.idea2 }, new URLSearchParams());
  typeInto(outlet.querySelector('.input-title'), 'Modifica');
  await router.startRouter(document.createElement('main'));
  const attempt = router.render('#/idee');
  await flush();
  assert.match(text(document.querySelector('dialog')), /modifiche non salvate/);
  byText(document.querySelector('dialog'), 'button', 'Annulla').click();
  await attempt;
  router.stopRouter();
});

test('every field type renders a control and writes back to the snapshot', () => {
  const working = { idea_id: IDS.idea, data: {} };
  let changes = 0;
  const onChange = () => changes++;
  const types = [
    { key: 'a', type: 'text' },
    { key: 'b', type: 'textarea' },
    { key: 'c', type: 'select', options: [['x', 'X']] },
    { key: 'd', type: 'date' },
    { key: 'e', type: 'member' },
    { key: 'f', type: 'members' },
    { key: 'g', type: 'ideas' },
    { key: 'h', type: 'experiment' },
    { key: 'i', type: 'tags', suggestions: ['XAI'] },
    { key: 'j', type: 'scale', label: 'Scala' },
    { key: 'k', type: 'boh' },
  ];
  const controls = Object.fromEntries(types.map((def) => [def.key, editor.fieldControl(def, working, onChange)]));
  typeInto(controls.a, 'testo');
  controls.c.value = 'x';
  controls.c.dispatchEvent(new window.Event('change'));
  controls.e.value = OTHER;
  controls.e.dispatchEvent(new window.Event('change'));
  const memberBox = controls.f.querySelector('input');
  memberBox.checked = true;
  memberBox.dispatchEvent(new window.Event('change'));
  const tagInput = controls.i.querySelector('input');
  tagInput.value = 'LLM';
  tagInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
  controls.j.querySelectorAll('input')[3].dispatchEvent(new window.Event('change'));
  assert.equal(working.data.a, 'testo');
  assert.equal(working.data.c, 'x');
  assert.equal(working.data.e, OTHER);
  assert.deepEqual(working.data.f, [ME]);
  assert.deepEqual(working.data.i, ['LLM']);
  assert.equal(working.data.j, 4);
  assert.match(text(controls.h), /I clienti pagano/);
  assert.match(text(controls.k), /non supportato/);
  controls.i.querySelector('.chip-x').click();
  assert.deepEqual(working.data.i, []);
  assert.ok(changes >= 7);
  assert.ok(ADVISOR);
});
