import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, byText, flush, typeInto } from '../setup/dom.mjs';
import { ME, PROJECT, PROJECT2, boardItems, members } from '../setup/fixtures.mjs';

// Quello che il dispositivo ricorda (bozze, ultima visita alla dashboard) vale per il progetto aperto: lo stesso
// browser usato in due progetti non porta i dati né le date dell'uno nell'altro.
let api;
let store;
let editor;
let dashboard;
let router;
let original;
let asked;

const ALFA = { id: PROJECT, name: 'Alfa', role: 'admin' };
const BETA = { id: PROJECT2, name: 'Beta', role: 'member' };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  editor = await import('../../assets/js/views/editor.js');
  dashboard = await import('../../assets/js/views/dashboard.js');
  router = await import('../../assets/js/router.js');
  original = { ...api };
});

beforeEach(() => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setProject(ALFA);
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  localStorage.clear();
  asked = [];
  api.listRevisions = async (args) => {
    asked.push({ project: api.currentProject(), sinceIso: args?.sinceIso });
    return [];
  };
});

afterEach(() => {
  Object.assign(api, original);
  router.setLeaveGuard(null);
});

// Opens the editor of a new item, types a title and leaves: the draft stays on this device.
async function leaveDraft(kind, title) {
  const outlet = document.createElement('main');
  const cleanup = editor.editorView(outlet, { kind }, new URLSearchParams());
  typeInto(outlet.querySelector('.input-title'), title);
  await wait(700);
  cleanup?.();
  router.setLeaveGuard(null);
}

function openEditor(kind) {
  const outlet = document.createElement('main');
  const cleanup = editor.editorView(outlet, { kind }, new URLSearchParams());
  return { outlet, cleanup };
}

describe('bozze degli elementi nuovi per progetto', () => {
  for (const kind of ['contact', 'idea', 'decision']) {
    it(`la bozza di un ${kind} nuovo scritta in un progetto non si offre in un altro`, async () => {
      await leaveDraft(kind, 'Testo scritto in Alfa');
      store.setProject(BETA);
      const beta = openEditor(kind);
      assert.equal(byText(beta.outlet, 'button', 'Ripristina la bozza'), null, 'in Beta nessuna bozza di Alfa');
      beta.cleanup?.();
      router.setLeaveGuard(null);

      store.setProject(ALFA);
      const alfa = openEditor(kind);
      const restore = byText(alfa.outlet, 'button', 'Ripristina la bozza');
      assert.ok(restore, 'in Alfa la bozza resta');
      restore.click();
      assert.equal(alfa.outlet.querySelector('.input-title').value, 'Testo scritto in Alfa');
      alfa.cleanup?.();
    });
  }

  it('una bozza senza progetto, di prima dei progetti, non si offre in nessun progetto', async () => {
    store.writeLocal('draft:new-contact-', { snapshot: { title: 'Bozza di prima', status: null, idea_id: null, data: {} }, savedAt: '2026-10-01T10:00:00Z' });
    const { outlet, cleanup } = openEditor('contact');
    assert.equal(byText(outlet, 'button', 'Ripristina la bozza'), null);
    cleanup?.();
  });
});

describe('novità della dashboard per progetto', () => {
  const visitDashboard = async () => {
    const outlet = document.createElement('main');
    const cleanup = dashboard.dashboardView(outlet);
    await flush(3);
    cleanup?.();
    return outlet;
  };

  it('aprire la dashboard di un progetto non nasconde le novità di un altro', async () => {
    await visitDashboard();
    store.setProject(BETA);
    await visitDashboard();
    assert.deepEqual(asked.map((a) => [a.project, a.sinceIso]), [
      [PROJECT, undefined],
      [PROJECT2, undefined],
    ], 'la prima visita a Beta mostra le ultime modifiche di Beta, non le novità da pochi secondi fa');

    store.setProject(ALFA);
    await visitDashboard();
    assert.equal(asked[2].project, PROJECT);
    assert.match(asked[2].sinceIso ?? '', /^\d{4}-\d\d-\d\dT/, 'Alfa riparte dalla sua ultima visita');
  });

  it('l ultima visita di prima dei progetti vale per il primo progetto aperto, e poi non più', async () => {
    store.writeLocal('lastSeen', '2026-10-01T10:00:00.000Z');
    await visitDashboard();
    store.setProject(BETA);
    await visitDashboard();
    assert.deepEqual(asked.map((a) => [a.project, a.sinceIso]), [
      [PROJECT, '2026-10-01T10:00:00.000Z'],
      [PROJECT2, undefined],
    ]);
    assert.equal(store.readLocal('lastSeen'), null, 'il valore senza progetto non resta');
  });
});
