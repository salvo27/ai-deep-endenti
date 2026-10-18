import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text } from '../setup/dom.mjs';
import { ME, boardItems, members } from '../setup/fixtures.mjs';

let api;
let store;
let router;
let app;
let schema;
let actions;
let editor;
let EXAMPLES;
let original;
let outlet;

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  schema = await import('../../assets/js/schema.js');
  actions = await import('../../assets/js/views/actions.js');
  editor = await import('../../assets/js/views/editor.js');
  ({ EXAMPLES } = await import('../../assets/js/examples.js'));
  original = { ...api };
  router.clearRoutes();
  app.registerRoutes();
});

beforeEach(async () => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  store.writeLocal('esempi', null);
  outlet = document.createElement('main');
  document.body.querySelectorAll('dialog').forEach((d) => d.remove());
  await router.startRouter(outlet, { fallback: app.notFoundView });
});

afterEach(() => {
  router.stopRouter();
  Object.assign(api, original);
});

async function visit(hash) {
  await router.render(hash);
  await flush(5);
  return text(outlet);
}

const exampleIdeas = () => EXAMPLES.filter((i) => i.kind === 'idea');

test('there is exactly one example idea for every idea status', () => {
  const statuses = exampleIdeas().map((i) => i.status).sort();
  assert.deepEqual(statuses, schema.KINDS.idea.statuses.map(([value]) => value).sort());
});

test('every example is a well formed item that survives validation unchanged', () => {
  const ids = new Set(EXAMPLES.map((i) => i.id));
  assert.equal(ids.size, EXAMPLES.length);
  for (const example of EXAMPLES) {
    assert.ok(store.isValidItemRow(example), example.title);
    assert.ok(schema.BOARD_KINDS.includes(example.kind), example.title);
    const clean = schema.sanitizeSnapshot(example.kind, example);
    assert.equal(clean.title, example.title);
    assert.equal(clean.status, example.status);
    assert.equal(schema.snapshotProblem(example.kind, clean), null, example.title);
    const people = new Set(schema.KINDS[example.kind].fields.filter((f) => f.type === 'member' || f.type === 'members').map((f) => f.key));
    for (const [key, value] of Object.entries(example.data)) {
      if (people.has(key) || value === '') continue;
      assert.deepEqual(clean.data[key], value, `${example.title}: ${key}`);
    }
  }
});

test('examples only point to other examples', () => {
  const byId = new Map(EXAMPLES.map((i) => [i.id, i]));
  for (const example of EXAMPLES) {
    if (example.idea_id) assert.equal(byId.get(example.idea_id)?.kind, 'idea', example.title);
    if (example.data.experiment_id) assert.equal(byId.get(example.data.experiment_id)?.kind, 'experiment', example.title);
    for (const id of example.data.ideas || []) assert.equal(byId.get(id)?.kind, 'idea', example.title);
  }
  for (const idea of exampleIdeas()) {
    assert.ok(idea.exampleNote, idea.title);
    assert.ok(EXAMPLES.some((i) => i.kind === 'canvas' && i.idea_id === idea.id), `${idea.title} senza canvas`);
  }
});

test('examples stay out of the team data: lists, ranking, search and backups', () => {
  const ids = new Set(EXAMPLES.map((i) => i.id));
  for (const kind of schema.BOARD_KINDS) assert.ok(store.itemsOf(kind).every((i) => !ids.has(i.id)), kind);
  assert.ok(store.ideas().every((i) => !ids.has(i.id)));
  assert.equal(store.state.items.size, boardItems().length);
  const airbnb = exampleIdeas().find((i) => i.status === 'esplorazione');
  assert.equal(store.getItem(airbnb.id), airbnb);
  assert.equal(store.itemsOf('experiment', { ideaId: airbnb.id }).length, 3);
});

test('the board shows the examples in their columns and can hide them', async () => {
  let body = await visit('#/idee');
  const cards = outlet.querySelectorAll('.idea-card.is-example');
  assert.equal(cards.length, exampleIdeas().length);
  for (const col of outlet.querySelectorAll('.kanban-col')) assert.equal(col.querySelectorAll('.is-example').length, 1);
  assert.equal(cards[0].getAttribute('draggable'), null);
  assert.match(body, /Esempio/);
  outlet.querySelector('button[aria-pressed="true"]').click();
  await flush();
  assert.equal(outlet.querySelectorAll('.is-example').length, 0);
  body = await visit('#/idee');
  assert.equal(outlet.querySelectorAll('.is-example').length, 0, 'la scelta resta salvata');
});

test('an example idea opens read-only with its note, children and decisions', async () => {
  const spotify = exampleIdeas().find((i) => i.status === 'scelta');
  const body = await visit(`#/idea/${spotify.id}`);
  assert.ok(outlet.querySelector('.banner-example'));
  assert.match(body, /sola lettura/);
  assert.match(body, /Decisioni/);
  assert.match(body, /Co-fondatore che segue i clienti/);
  assert.equal(outlet.querySelector('select[aria-label="Stato"]'), null);
  assert.equal(outlet.querySelector('a[href^="#/modifica/"]'), null);
  assert.equal(outlet.querySelector('.btn-ai'), null);
  const tabs = [...outlet.querySelectorAll('.tab')].map((t) => t.textContent);
  assert.ok(!tabs.some((t) => /Commenti|Storico|Voti/.test(t)), tabs.join());
  await visit(`#/idea/${spotify.id}/esperimenti`);
  assert.equal(outlet.querySelectorAll('.card').length, 3);
  assert.equal(outlet.querySelector('a[href^="#/nuovo/"]'), null);
});

test('example items cannot be edited, extended or moved', async () => {
  const canvas = EXAMPLES.find((i) => i.kind === 'canvas');
  let body = await visit(`#/modifica/${canvas.id}`);
  assert.match(body, /sola lettura/);
  const idea = exampleIdeas()[0];
  assert.equal(editor.initialSnapshot('canvas', new URLSearchParams({ idea: idea.id })).idea_id, null);
  let saved = false;
  api.saveItem = async () => {
    saved = true;
    return { status: 'ok' };
  };
  assert.equal(await actions.changeStatus(idea, 'scartata'), null);
  assert.equal(saved, false);
  body = await visit(`#/elemento/${canvas.id}`);
  assert.ok(outlet.querySelector('.banner-example'));
  assert.equal(outlet.querySelector('.tabs'), null);
  assert.doesNotMatch(body, /Versioni/);
});
