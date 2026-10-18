import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text, byText } from '../setup/dom.mjs';
import { IDS, ME, XSS, boardItems, item, members } from '../setup/fixtures.mjs';

let api;
let store;
let router;
let app;
let ai;
let exporter;
let EXAMPLES;
let original;
let outlet;

const CONTACT = 'aaaaaaaa-0000-4000-8000-000000000001';
const PERSONA = 'aaaaaaaa-0000-4000-8000-000000000002';
const COMPETITORS = 'aaaaaaaa-0000-4000-8000-000000000003';
const MARKET = 'aaaaaaaa-0000-4000-8000-000000000004';
const DEEPTECH = 'aaaaaaaa-0000-4000-8000-000000000005';

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  ai = await import('../../assets/js/ai.js');
  exporter = await import('../../assets/js/export.js');
  ({ EXAMPLES } = await import('../../assets/js/examples.js'));
  original = { ...api };
  router.clearRoutes();
  app.registerRoutes();
});

function newBoards({ xss = false } = {}) {
  const t = (s) => (xss ? `${s} ${XSS}` : s);
  return [
    item({ id: CONTACT, kind: 'contact', title: t('Responsabile acquisti'), status: 'da_contattare', idea_id: IDS.idea, data: { purpose: 'cliente', role: t('Acquisti'), organization: 'Azienda Verdi', via: t('Presentato da Bruno'), owner: ME, contact: 'acquisti@verdi.example' } }),
    item({ id: PERSONA, kind: 'persona', title: t('Responsabile qualità'), idea_id: IDS.idea, data: { role_type: 'paga', early_adopter: 'si', quote: t('Ci serve subito'), profile: t('Profilo') } }),
    item({
      id: COMPETITORS,
      kind: 'competitors',
      title: t('Concorrenti'),
      idea_id: IDS.idea,
      data: {
        gap: t('Il vuoto'),
        features: [{ id: 'f-a', label: t('Prezzo'), importance: 'alta' }],
        rivals: [{ id: 'c-a', name: t('Rivale'), type: 'diretto', x: 2, y: 3 }],
        cells: { 'f-a:noi': true },
        axes: { x: { label: t('Asse X'), low: 'basso', high: 'alto' }, y: { label: 'Y' } },
        us: { x: 8, y: 8 },
      },
    }),
    item({ id: MARKET, kind: 'market', title: t('Mercato'), idea_id: IDS.idea, data: { tam: 1000000000, sam: 2000000000, som: 1000000, tam_basis: t('Fonte') } }),
    item({ id: DEEPTECH, kind: 'deeptech', title: t('Scheda deep tech'), idea_id: IDS.idea, data: { trl_now: '4', trl_target: '6', published: t('Articolo 2025') } }),
  ];
}

beforeEach(async () => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  [...boardItems(), ...newBoards()].forEach((i) => store.applyItem(i));
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

test('the idea shows customers, market, deep tech and the next step', async () => {
  let body = await visit(`#/idea/${IDS.idea}`);
  assert.ok(outlet.querySelector('.next-step'));
  assert.match(body, /Prossimo passo · In validazione/);
  body = await visit(`#/idea/${IDS.idea}/clienti`);
  assert.match(body, /Responsabile qualità/);
  assert.match(body, /Early adopter/);
  assert.match(body, /Nessun Value Proposition Canvas/);
  body = await visit(`#/idea/${IDS.idea}/mercato`);
  assert.ok(outlet.querySelector('svg.market-chart'));
  assert.match(body, /Il SAM è più grande del TAM/);
  assert.ok(outlet.querySelector('table.benchmark'));
  assert.ok(outlet.querySelector('.position-chart svg circle.pc-us'));
  body = await visit(`#/idea/${IDS.idea}/deeptech`);
  assert.equal(outlet.querySelector('.trl-step.is-now').textContent, '4');
  assert.equal(outlet.querySelector('.trl-step.is-target').textContent, '6');
  const tabs = [...outlet.querySelectorAll('.tab')].map((t) => text(t));
  assert.ok(tabs.includes('Clienti1'), tabs.join());
  assert.ok(tabs.includes('Mercato2'), tabs.join());
});

test('experiments can be read as a Javelin Board', async () => {
  const body = await visit(`#/idea/${IDS.idea}/esperimenti?vista=javelin`);
  const table = outlet.querySelector('table.javelin');
  assert.ok(table);
  assert.match(body, /Assunzione più rischiosa/);
  assert.match(body, /Esci dall'ufficio/);
  assert.equal(table.querySelectorAll('thead th').length, 2);
});

test('people to interface with become interviews with one click and the contact follows', async () => {
  const body = await visit(`#/idea/${IDS.idea}/interviste`);
  assert.match(body, /Persone con cui interfacciarsi/);
  assert.match(body, /Presentato da Bruno/);
  const link = byText(outlet, 'a', 'Intervista');
  assert.equal(link.getAttribute('href'), `#/nuovo/interview?contatto=${CONTACT}`);

  let created = null;
  let contactSave = null;
  api.createItem = async ({ kind, title, status, data, ideaId }) => (created = item({ id: 'bbbbbbbb-0000-4000-8000-000000000001', kind, title, status, data, idea_id: ideaId }));
  api.saveItem = async ({ id, snapshot }) => {
    contactSave = { id, snapshot };
    return { status: 'ok', item: { ...store.getItem(id), ...snapshot, version: 2 } };
  };
  await visit(`#/nuovo/interview?contatto=${CONTACT}`);
  const title = outlet.querySelector('.input-title');
  assert.equal(title.value, 'Responsabile acquisti');
  title.value = 'Responsabile acquisti, Azienda Verdi';
  title.dispatchEvent(new Event('input'));
  byText(outlet, 'button', 'Crea').click();
  await flush(10);
  assert.equal(created.idea_id, IDS.idea);
  assert.equal(created.data.organization, 'Azienda Verdi');
  assert.equal(contactSave.id, CONTACT);
  assert.equal(contactSave.snapshot.status, 'fissata');
  assert.equal(contactSave.snapshot.data.interview_id, created.id);
});

test('the dashboard lists the people I have to contact', async () => {
  const body = await visit('#/');
  assert.match(body, /Responsabile acquisti/);
});

test('the competitors editor builds a valid table', async () => {
  let created = null;
  api.createItem = async (args) => (created = item({ id: 'bbbbbbbb-0000-4000-8000-000000000002', kind: args.kind, title: args.title, data: args.data, idea_id: args.ideaId }));
  await visit(`#/nuovo/competitors?idea=${IDS.idea}`);
  byText(outlet, 'button', 'Aggiungi un concorrente').click();
  byText(outlet, 'button', 'Aggiungi una funzionalità').click();
  const name = outlet.querySelector('input[aria-label="Nome del concorrente"]');
  name.value = 'Rivale nuovo';
  name.dispatchEvent(new Event('input'));
  const feature = outlet.querySelector('input[aria-label="Funzionalità"]');
  feature.value = 'Assistenza';
  feature.dispatchEvent(new Event('input'));
  const boxes = outlet.querySelectorAll('.bm-cell input[type="checkbox"]');
  assert.equal(boxes.length, 2);
  boxes[0].checked = true;
  boxes[0].dispatchEvent(new Event('change'));
  byText(outlet, 'button', 'Crea').click();
  await flush(10);
  assert.equal(created.data.rivals[0].name, 'Rivale nuovo');
  assert.equal(created.data.features[0].label, 'Assistenza');
  assert.deepEqual(Object.keys(created.data.cells), [`${created.data.features[0].id}:noi`]);
  assert.equal(created.data.axes.x.label, 'Prezzo');
});

test('the team page creates the Team Canvas and the equity split', async () => {
  let body = await visit('#/squadra');
  assert.match(body, /Il Team Canvas non è ancora stato compilato/);
  body = await visit('#/squadra/quote');
  assert.match(body, /Le quote non sono ancora state discusse/);

  let created = null;
  api.createItem = async (args) => (created = item({ id: 'bbbbbbbb-0000-4000-8000-000000000003', kind: args.kind, title: args.title, data: args.data }));
  await visit('#/nuovo/equity');
  const inputs = [...outlet.querySelectorAll('.equity-table tbody input[type="number"]')];
  assert.equal(inputs.length, 5 * 3, 'peso più un punteggio per i due membri non advisor');
  inputs.forEach((input, i) => {
    input.value = String(i % 3 === 0 ? 5 : i % 3 === 1 ? 8 : 2);
    input.dispatchEvent(new Event('input'));
  });
  assert.match(text(outlet), /Anna/);
  assert.match(text(outlet), /80%/);
  byText(outlet, 'button', 'Crea').click();
  await flush(10);
  assert.equal(created.kind, 'equity');
  assert.deepEqual(created.data.founders.map((f) => f.name), ['Anna', 'Bruno']);

  store.applyItem(created);
  body = await visit('#/squadra/quote');
  assert.match(body, /Quote proposte con il metodo Demmler/);
  await visit('#/nuovo/equity');
  assert.equal(router.currentPath(), `/modifica/${created.id}`, 'una sola divisione delle quote: si apre quella esistente');
});

test('guide and concepts are reachable and searchable', async () => {
  let body = await visit('#/guida?fase=esplorazione');
  assert.equal(outlet.querySelectorAll('.phase').length, 6);
  assert.ok(outlet.querySelector('#fase-esplorazione.is-focus'));
  assert.match(body, /Esempio: AirBed & Breakfast/);
  body = await visit('#/concetti?c=trl');
  assert.ok(outlet.querySelector('#concetto-trl.is-focus'));
  const search = outlet.querySelector('input[type="search"]');
  search.value = 'vesting';
  search.dispatchEvent(new Event('input'));
  const terms = [...outlet.querySelectorAll('.concept-card h3')].map((h3) => h3.textContent);
  assert.ok(terms.includes('Vesting'), terms.join());
  assert.ok(terms.length < 10);
});

test('the question mark next to a field opens the concept', async () => {
  await visit(`#/nuovo/market?idea=${IDS.idea}`);
  outlet.querySelector('.concept-btn').click();
  await flush();
  const dialog = document.querySelector('dialog.modal');
  assert.match(text(dialog), /TAM, SAM e SOM/);
  assert.ok(dialog.querySelector('a[href="#/concetti?c=tam-sam-som"]'));
});

test('Claude receives the new boards but never the people and their contacts', () => {
  const idea = store.getItem(IDS.idea);
  const boards = ['persona', 'vpc', 'market', 'competitors', 'deeptech'].flatMap((kind) => store.itemsOf(kind, { ideaId: IDS.idea }));
  const context = ai.buildContext('critique', { idea, boards });
  assert.match(context, /Buyer persona: Responsabile qualità/);
  assert.match(context, /TAM: mercato totale \(euro all'anno\): 1 mld €/);
  assert.match(context, /Funzionalità «Prezzo» \(importanza alta\): Noi/);
  assert.doesNotMatch(context, /Responsabile acquisti|acquisti@verdi/);
});

test('the Markdown export includes the new boards and the comparison table', () => {
  const md = exporter.ideaMarkdown(store.getItem(IDS.idea));
  assert.match(md, /## Buyer persona/);
  assert.match(md, /## Analisi di mercato/);
  assert.match(md, /\| Funzionalità \| Importanza \| Noi \| Rivale \|/);
  assert.doesNotMatch(md, /acquisti@verdi/);
});

test('text written in the new boards never becomes HTML', async () => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  [...boardItems(), ...newBoards({ xss: true })].forEach((i) => store.applyItem(i));
  window.__xss = 0;
  for (const tab of ['', '/clienti', '/mercato', '/deeptech', '/interviste', '/esperimenti?vista=javelin']) {
    await visit(`#/idea/${IDS.idea}${tab}`);
    assert.equal(outlet.querySelector('img'), null, tab);
  }
  for (const id of [CONTACT, PERSONA, COMPETITORS, MARKET, DEEPTECH]) {
    await visit(`#/elemento/${id}`);
    assert.equal(outlet.querySelector('img'), null, id);
    assert.match(text(outlet), /<img src=x/);
  }
  assert.equal(window.__xss, 0);
});

test('examples of the new boards are valid and stay read-only', async () => {
  const airbnb = EXAMPLES.find((i) => i.kind === 'idea' && i.status === 'esplorazione');
  for (const kind of ['persona', 'vpc', 'market', 'competitors']) {
    assert.ok(EXAMPLES.some((i) => i.kind === kind && i.idea_id === airbnb.id), kind);
  }
  const body = await visit(`#/idea/${airbnb.id}/mercato`);
  assert.match(body, /30 mld €/);
  assert.equal(outlet.querySelector('a[href^="#/nuovo/"]'), null);
  assert.equal(outlet.querySelector('a[href^="#/modifica/"]'), null);
});
