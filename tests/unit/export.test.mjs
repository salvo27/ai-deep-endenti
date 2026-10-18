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
