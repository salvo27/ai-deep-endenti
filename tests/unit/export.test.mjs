import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../../assets/js/lib/api.js';
import * as store from '../../assets/js/store.js';
import { ideaMarkdown } from '../../assets/js/export.js';
import { DEFAULT_GENERATOR } from '../../assets/js/views/generator.js';
import { DEFAULT_CRITERIA, sanitizeSnapshot } from '../../assets/js/schema.js';

const ME = '00000000-0000-4000-8000-00000000000a';
const original = { ...api };
let counter = 0;
const uuid = () => `${String(++counter).padStart(8, '0')}-0000-4000-8000-000000000000`;

beforeEach(() => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers([{ user_id: ME, role: 'admin', display_name: 'Anna' }]);
});

afterEach(() => Object.assign(api, original));

function fakeCreate(log) {
  api.createItem = async ({ kind, title, status, data, ideaId, message }) => {
    log.push({ kind, title, ideaId, message });
    return {
      id: uuid(),
      kind,
      title,
      status,
      data,
      idea_id: ideaId,
      version: 1,
      created_by: ME,
      updated_by: ME,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };
  };
}

test('the default criteria and grid are already valid', () => {
  assert.deepEqual(sanitizeSnapshot('criteria', { data: { criteria: DEFAULT_CRITERIA } }).data.criteria, DEFAULT_CRITERIA);
  assert.deepEqual(sanitizeSnapshot('generator', { data: DEFAULT_GENERATOR }).data, DEFAULT_GENERATOR);
  assert.deepEqual(DEFAULT_GENERATOR.cells, {});
});

test('ideaMarkdown exports the idea with canvas, experiments and interviews but no contacts', async () => {
  const log = [];
  fakeCreate(log);
  const idea = await store.createItem('idea', { title: 'Idea alfa', status: 'validazione', data: { pitch: 'Pitch', owner: ME, problem: 'Riga 1\nRiga 2' } });
  await store.createItem('canvas', { title: 'Canvas', idea_id: idea.id, data: { problem: 'p', validated: { problem: true } } });
  await store.createItem('experiment', { title: 'Test clienti', status: 'in_corso', idea_id: idea.id, data: { assumption: 'Pagano' } });
  await store.createItem('interview', { title: 'Azienda Rossi', status: 'fatta', idea_id: idea.id, data: { contact: 'rossi@azienda.example', pains: 'Tardi' } });
  const md = ideaMarkdown(store.getItem(idea.id));
  assert.match(md, /^# Idea alfa/);
  assert.match(md, /\*\*Responsabile:\*\* Anna/);
  assert.match(md, /\*\*Problema\*\*\n\nRiga 1\nRiga 2/);
  assert.match(md, /\*\*Problema\*\* \(validato\)/);
  assert.match(md, /### Test clienti \(In corso\)/);
  assert.match(md, /Tardi/);
  assert.doesNotMatch(md, /rossi@azienda\.example/);
  assert.doesNotMatch(md, /\n{3,}/);
});

test('un solo votante si dice al singolare, nessun voto e più votanti al plurale', () => {
  const IDEA = '10000000-0000-4000-8000-000000000001';
  const at = '2026-10-10T10:00:00Z';
  const base = { status: null, idea_id: null, version: 1, created_at: at, updated_at: at, deleted_at: null };
  store.applyItem({ ...base, id: IDEA, kind: 'idea', title: 'Idea alfa', status: 'nuova', data: {}, created_by: ME, updated_by: ME });
  store.applyItem({ ...base, id: '10000000-0000-4000-8000-000000000002', kind: 'criteria', title: 'Criteri', data: { criteria: [{ key: 'cliente', label: 'Cliente', description: '', weight: 1 }] }, created_by: ME, updated_by: ME });
  const vote = (id, by, value) => store.applyItem({ ...base, id, kind: 'score', title: 'Voti', data: { scores: { [IDEA]: { cliente: value } } }, created_by: by, updated_by: by });
  assert.match(ideaMarkdown(store.getItem(IDEA)), /Punteggio: nessun voto \(0 votanti\)/);
  vote('10000000-0000-4000-8000-000000000003', ME, 5);
  assert.match(ideaMarkdown(store.getItem(IDEA)), /Punteggio: 100\/100 \(1 votante\)/);
  vote('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-00000000000b', 1);
  assert.match(ideaMarkdown(store.getItem(IDEA)), /Punteggio: \d+\/100 \(2 votanti\)/);
});
