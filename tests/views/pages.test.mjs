import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, byText, text, typeInto } from '../setup/dom.mjs';
import { ADVISOR, IDS, ME, OTHER, boardItems, item, members, revision } from '../setup/fixtures.mjs';

let api;
let store;
let router;
let app;
let shell;
let original;
let outlet;

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  shell = await import('../../assets/js/views/shell.js');
  original = { ...api };
  router.clearRoutes();
  app.registerRoutes();
});

function fakeApi() {
  api.listRevisions = async () => [revision({ id: 2, version: 2, author_id: OTHER, op: 'update', changed: ['pitch'] }), revision({ id: 1 })];
  api.itemHistory = async () => [revision({ id: 1 })];
  api.listComments = async (id) => [
    { id: 'c0000000-0000-4000-8000-000000000001', item_id: id, author_id: OTHER, body: 'Bel lavoro', created_at: '2026-10-17T10:00:00Z', ai_task: null },
    { id: 'c0000000-0000-4000-8000-000000000002', item_id: id, author_id: ME, body: 'Critica di Claude', created_at: '2026-10-17T11:00:00Z', ai_task: 'critique', edited_at: '2026-10-17T12:00:00Z' },
  ];
  api.activitySince = async () => [{ author_id: ME }, { author_id: ME }, { author_id: OTHER }];
  api.auditLog = async () => [{ id: 1, event: 'member_role_changed', actor_id: ME, target_id: OTHER, details: { from: 'member', to: 'advisor' }, created_at: '2026-10-17T10:00:00Z' }];
  api.listFactors = async () => [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'iPhone', created_at: '2026-10-01T10:00:00Z' }];
  api.aiUsageLastDay = async () => 3;
  api.membersOverview = async () => members();
}

beforeEach(async () => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  store.state.commentCounts = new Map([[IDS.idea, 2]]);
  fakeApi();
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

test('dashboard shows ranking, running experiments, my tasks and recent changes', async () => {
  const body = await visit('#/');
  assert.match(body, /Ciao, Anna/);
  assert.match(body, /Idea alfa/);
  assert.match(body, /Esperimenti in corso/);
  assert.match(body, /in ritardo|scaduto/);
  assert.match(body, /Bruno ha modificato/);
  assert.equal(outlet.querySelector('.stat strong').textContent, '2');
});

test('ideas page shows a column per status and a sortable table', async () => {
  let body = await visit('#/idee');
  assert.equal(outlet.querySelectorAll('.kanban-col').length, 6);
  assert.match(body, /Idea alfa/);
  assert.doesNotMatch(body, /Idea archiviata/);
  body = await visit('#/idee?vista=tabella');
  assert.ok(outlet.querySelector('table'));
  assert.match(body, /Idea beta/);
});

test('dropping an idea on another column changes its status with a commit message', async () => {
  await visit('#/idee');
  let saved = null;
  api.saveItem = async (args) => {
    saved = args;
    return { status: 'ok', item: item({ ...store.getItem(IDS.idea2), version: 2, status: args.snapshot.status }) };
  };
  const column = outlet.querySelector('.kanban-col[data-status="scelta"]');
  const drop = new window.Event('drop', { bubbles: true });
  drop.dataTransfer = { getData: () => IDS.idea2 };
  column.dispatchEvent(drop);
  await flush(5);
  assert.equal(saved.snapshot.status, 'scelta');
  assert.equal(saved.message, 'Stato: Nuova → Scelta');
});

test('every idea tab renders', async () => {
  const expectations = {
    panoramica: /Nata nel generatore/,
    canvas: /Problema di prova/,
    esperimenti: /I clienti pagano/,
    interviste: /Disponibile a un pilota/,
    voti: /Punteggio del team/,
    commenti: /Bel lavoro/,
    storico: /Bruno ha modificato/,
  };
  for (const [tab, pattern] of Object.entries(expectations)) {
    const body = await visit(`#/idea/${IDS.idea}/${tab}`);
    assert.match(body, pattern, tab);
    assert.ok(outlet.querySelector('.tab.is-active'), tab);
  }
  assert.match(await visit(`#/idea/${IDS.canvas}`), /Idea non trovata/);
});

test('item pages render canvas, experiment, interview and decision', async () => {
  assert.match(await visit(`#/elemento/${IDS.canvas}`), /validato/);
  assert.match(await visit(`#/elemento/${IDS.experiment}`), /Assunzione più rischiosa/);
  assert.match(await visit(`#/elemento/${IDS.interview}`), /Disponibile a un pilota/);
  assert.match(await visit(`#/elemento/${IDS.decision}`), /Testare alfa e beta/);
  assert.match(await visit(`#/elemento/${IDS.interview}/commenti`), /Critica di Claude/);
  assert.match(await visit(`#/elemento/${IDS.idea}`), /non trovato/);
});

test('lists filter by idea, person and commitment', async () => {
  assert.match(await visit('#/esperimenti'), /I clienti pagano/);
  assert.match(await visit(`#/interviste?impegno=pilota&persona=${ME}`), /Azienda Rossi/);
  assert.match(await visit('#/interviste?impegno=pagamento'), /Nessun elemento/);
  assert.match(await visit(`#/decisioni?idea=${IDS.idea2}`), /Due finalisti/);
  assert.match(await visit('#/decisioni?q=inesistente'), /Nessun elemento/);
});

test('scoring shows team averages with disagreement and lets me save my votes', async () => {
  store.applyItem(item({ id: 'a7777777-7777-4777-8777-777777777777', kind: 'score', created_by: ME, data: { scores: { [IDS.idea]: { cliente: 2 } } } }));
  let body = await visit('#/valutazione');
  assert.match(body, /Media del team/);
  assert.ok(outlet.querySelector('.is-disagreement'), 'cliente 5 contro 2');
  body = await visit('#/valutazione?vista=miei');
  let saved = null;
  api.saveItem = async (args) => {
    saved = args;
    return { status: 'ok', item: item({ ...store.myScoreItem(), version: 2, data: args.snapshot.data }) };
  };
  const select = outlet.querySelector('.vote-select');
  select.value = '4';
  select.dispatchEvent(new window.Event('change'));
  byText(outlet, 'button', 'Salva i miei voti').click();
  await flush(10);
  assert.equal(saved.snapshot.data.scores[IDS.idea].cliente, 4);
});

test('a photo of the scores is saved with a name and compared with now', async () => {
  const PHOTO = 'a8888888-8888-4888-8888-888888888888';
  let created = null;
  api.createItem = async (args) => {
    created = args;
    return item({ id: PHOTO, kind: 'scoresnap', title: args.title, data: args.data, created_by: ME, updated_by: ME, created_at: '2026-10-25T18:00:00Z' });
  };
  assert.match(await visit('#/valutazione?vista=fotografie'), /Nessuna fotografia/);
  await visit('#/valutazione');
  byText(outlet, 'button', 'Salva fotografia').click();
  const dialog = document.querySelector('dialog');
  const name = dialog.querySelector('input');
  assert.equal(name.value, 'Fotografia 1', 'nome predefinito con numero crescente');
  name.value = 'Prima della riunione';
  byText(dialog, 'button', 'Salva fotografia').click();
  await flush(10);
  assert.equal(created.kind, 'scoresnap');
  assert.equal(created.title, 'Prima della riunione');
  assert.deepEqual(created.data.votes[OTHER][IDS.idea], { cliente: 5, mercato: 2 });
  assert.equal(created.data.names[OTHER], 'Bruno');
  assert.deepEqual(created.data.criteria.map((c) => [c.key, c.weight]), [['cliente', 3], ['mercato', 1]]);

  store.applyItem(item({ id: IDS.score, kind: 'score', title: 'Voti di Bruno', version: 2, created_by: OTHER, updated_by: OTHER, data: { scores: { [IDS.idea]: { cliente: 2, mercato: 2 } } } }));
  store.applyItem(item({ ...store.getItem(IDS.criteria), version: 2, data: { criteria: [{ key: 'cliente', label: 'Cliente', weight: 3 }, { key: 'mercato', label: 'Mercato', weight: 2 }] } }));
  const body = await visit('#/valutazione?vista=fotografie');
  assert.match(body, /Prima della riunione/);
  assert.match(body, /«Mercato»: peso da ×1 a ×2/);
  assert.match(body, /Bruno: 1 voto cambiato/);
  const row = [...outlet.querySelectorAll('.compare-table tbody tr')].find((tr) => /Idea alfa/.test(text(tr)));
  assert.ok(row.querySelector('.delta.is-down'), 'il punteggio di Idea alfa scende');
  assert.match(text(outlet.querySelector('.compare-means')), /Cliente: 5\.0 → 2\.0/);

  const photo = await visit(`#/valutazione?foto=${PHOTO}`);
  assert.match(photo, /Fotografia «Prima della riunione»/);
  assert.equal(outlet.querySelector('.matrix .score-cell').textContent, '5.0', 'la fotografia mostra i voti di allora');
  assert.match(await visit(`#/valutazione?foto=${IDS.idea}`), /Fotografia non trovata/);

  let renamed = null;
  api.saveItem = async (args) => {
    renamed = args;
    return { status: 'ok', item: item({ ...store.getItem(PHOTO), version: 2, title: args.snapshot.title }) };
  };
  await visit('#/valutazione?vista=fotografie');
  byText(outlet, 'button', 'Rinomina').click();
  const renameDialog = document.querySelector('dialog');
  renameDialog.querySelector('input').value = 'Dopo la riunione';
  byText(renameDialog, 'button', 'Rinomina').click();
  await flush(10);
  assert.equal(renamed.snapshot.title, 'Dopo la riunione');
  assert.deepEqual(renamed.snapshot.data, store.getItem(PHOTO).data, 'rinominare non tocca i voti salvati');
  assert.match(text(outlet), /Dopo la riunione/);

  store.applyItem(item({ id: 'a9999999-9999-4999-8999-999999999999', kind: 'scoresnap', title: 'Fotografia 7', data: {}, deleted_at: '2026-10-25T19:00:00Z' }));
  byText(outlet, 'button', 'Salva fotografia').click();
  assert.equal(document.querySelector('dialog:last-of-type input').value, 'Fotografia 8', 'il numero non si ripete dopo un\'archiviazione');
});

test('the criteria editor saves reordered and new criteria', async () => {
  await visit('#/valutazione');
  let saved = null;
  let photo = null;
  api.createItem = async (args) => {
    photo = args;
    return item({ id: 'a8888888-8888-4888-8888-888888888888', kind: 'scoresnap', title: args.title, data: args.data });
  };
  api.saveItem = async (args) => {
    saved = args;
    return { status: 'ok', item: item({ ...store.getItem(IDS.criteria), version: 2, data: args.snapshot.data }) };
  };
  byText(outlet, 'button', 'Criteri').click();
  const dialog = document.querySelector('dialog');
  dialog.querySelector('[aria-label="Giù"]').click();
  byText(dialog, 'button', 'Aggiungi criterio').click();
  byText(dialog, 'button', 'Salva i criteri').click();
  await flush(10);
  assert.deepEqual(saved.snapshot.data.criteria.map((c) => c.key).slice(0, 2), ['mercato', 'cliente']);
  assert.equal(saved.snapshot.data.criteria.length, 3);
  assert.equal(photo.title, 'Fotografia 1, prima di cambiare i criteri', 'un criterio in più cambia la classifica: prima si salva una fotografia');
});

test('generator shows the grid and saves a cell', async () => {
  const body = await visit('#/generatore');
  assert.match(body, /XAI/);
  assert.match(body, /1 idee/);
  outlet.querySelector('.gen-cell-btn').click();
  const dialog = document.querySelector('dialog');
  assert.match(text(dialog), /Idee nate da questa cella/);
  let saved = null;
  api.saveItem = async (args) => {
    saved = args;
    return { status: 'ok', item: item({ ...store.getItem(IDS.generator), version: 2, data: args.snapshot.data }) };
  };
  typeInto(dialog.querySelector('textarea'), 'Nuovo spunto');
  byText(dialog, 'button', 'Salva la cella').click();
  await flush(10);
  assert.equal(saved.snapshot.data.cells['r-xai:c-sa'].text, 'Nuovo spunto');
  assert.equal(saved.message, 'Generatore: XAI × Settore A');
});

test('trash lists archived items and restores them', async () => {
  assert.match(await visit('#/cestino'), /Idea archiviata/);
  let restored = null;
  api.restoreItem = async (id) => {
    restored = id;
    return { status: 'ok', item: item({ ...store.getItem(IDS.trashed), version: 2, deleted_at: null }) };
  };
  byText(outlet, 'button', 'Ripristina').click();
  await flush(5);
  assert.equal(restored, IDS.trashed);
});

test('team page shows 2FA status, activity and the security log to the admin', async () => {
  let reloads = 0;
  api.membersOverview = async () => {
    reloads += 1;
    return members().map((m) => (m.user_id === OTHER ? { ...m, last_sign_in_at: new Date().toISOString() } : m));
  };
  const body = await visit('#/team');
  assert.equal(reloads, 1, 'aprendo la pagina gli ultimi accessi si ricaricano');
  assert.match(body, /Bruno.*adesso/s, 'l\'ultimo accesso aggiornato compare senza ricaricare il sito');
  assert.match(body, /non ancora attiva/);
  assert.match(body, /Registro di sicurezza/);
  assert.match(body, /ha cambiato il ruolo di Bruno \(Membro → Advisor\)/);
  assert.equal(outlet.querySelectorAll('tbody tr td:nth-child(6)')[0].textContent, '2');
  api.membersOverview = async () => members().map((m) => (m.user_id === ME ? { ...m, role: 'member' } : m));
  assert.doesNotMatch(await visit('#/team'), /Registro di sicurezza/);
});

test('profile shows devices and Claude usage', async () => {
  const body = await visit('#/profilo');
  assert.match(body, /iPhone/);
  assert.match(body, /unico dispositivo/);
  assert.match(text(outlet), /ultime 24 ore: 3/);
  assert.match(body, /Notifiche/);
  assert.match(body, /Avvisami anche quando il sito è aperto in un'altra scheda/);
});

test('unknown pages show a way back', async () => {
  assert.match(await visit('#/inesistente'), /Pagina non trovata/);
});

test('advisors see the boards without edit controls', async () => {
  store.setMembers(members().map((m) => (m.user_id === ME ? { ...m, role: 'advisor' } : m)));
  await visit(`#/idea/${IDS.idea}`);
  assert.equal(byText(outlet, 'a', 'Modifica'), null);
  assert.equal(outlet.querySelector('select[aria-label="Stato"]'), null);
  await visit('#/idee');
  assert.equal(byText(outlet, 'a', 'Nuova idea'), null);
  assert.ok(ADVISOR);
});

test('the shell searches the boards and shows who is online', () => {
  const root = document.createElement('div');
  shell.buildShell(root, { onSignOut: () => {} });
  const input = root.querySelector('.search-input');
  typeInto(input, 'clienti');
  assert.match(text(root.querySelector('.search-results')), /I clienti pagano/);
  typeInto(input, 'zzz');
  assert.match(text(root.querySelector('.search-results')), /Nessun risultato/);
  assert.deepEqual(shell.searchItems('a'), []);
  store.state.online = [{ userId: OTHER, route: '/' }, { userId: ME, route: '/' }];
  store.emit('presence', store.state.online);
  assert.equal(root.querySelectorAll('.presence .avatar').length, 1);
  store.emit('realtime', 'SUBSCRIBED');
  assert.ok(root.querySelector('.live-dot.is-on'));
});

test('the side menu opens and closes with the three lines, a tap outside, Escape or a page change', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  shell.buildShell(root, { onSignOut: () => {} });
  const button = root.querySelector('.menu-btn');
  const backdrop = root.querySelector('.nav-backdrop');
  const isOpen = () => root.classList.contains('nav-open');
  assert.equal(isOpen(), false);
  assert.equal(backdrop.hidden, true);

  button.click();
  assert.equal(isOpen(), true);
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(backdrop.hidden, false);
  button.click();
  assert.equal(isOpen(), false, 'le tre linee chiudono il menu');

  button.click();
  backdrop.click();
  assert.equal(isOpen(), false, 'un tocco fuori chiude il menu');

  button.click();
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(isOpen(), false, 'Esc chiude il menu');

  button.click();
  await visit('#/idee');
  assert.equal(isOpen(), false, 'scegliere una pagina chiude il menu');
  root.remove();
});
