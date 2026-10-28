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
  assert.match(body, /Prossimo passo · La squadra/);
  assert.match(body, /Compilate il Team Canvas/);
  assert.equal(outlet.querySelector('.next-step a.btn-primary').getAttribute('href'), `#/idea/${IDS.idea}/roadmap`);
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
  let body = await visit('#/guida?fase=clienti');
  assert.equal(outlet.querySelectorAll('.rm-phase').length, 8);
  assert.ok(outlet.querySelector('#fase-clienti'));
  assert.match(body, /A che punto sono le vostre idee/);
  assert.match(text(outlet.querySelector('.rm-table')), /Idea alfa.*La squadra.*Compilate il Team Canvas/);
  assert.match(body, /Esempio di roadmap avanzata: Spotify/);
  assert.match(body, /Errore da evitare/);
  assert.equal(outlet.querySelectorAll('.rm-phase input[type="checkbox"]').length, 0, 'nella guida i passi si leggono, si segnano nell\'idea');
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
  assert.ok(dialog.querySelector('a[href="#/guida/concetti?c=tam-sam-som"]'));
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

test('the idea comments include the comments on its boards, with the board named', async () => {
  const requested = [];
  api.listComments = async (ids) => {
    requested.push(ids);
    return [
      { id: 'c0000000-0000-4000-8000-000000000011', item_id: IDS.idea, author_id: ME, body: 'Sull\'idea', created_at: '2026-10-17T10:00:00Z', ai_task: null },
      { id: 'c0000000-0000-4000-8000-000000000012', item_id: IDS.canvas, author_id: ME, body: '## Critica\n- manca il cliente', created_at: '2026-10-17T11:00:00Z', ai_task: 'critique' },
    ];
  };
  store.state.commentCounts = new Map([[IDS.idea, 1], [IDS.canvas, 1]]);
  let body = await visit(`#/idea/${IDS.idea}/canvas`);
  assert.ok(outlet.querySelector(`a[href="#/elemento/${IDS.canvas}/commenti"]`), 'la scheda mostra i suoi commenti');
  body = await visit(`#/idea/${IDS.idea}/commenti`);
  assert.ok(requested[0].includes(IDS.idea) && requested[0].includes(IDS.canvas) && requested[0].includes(MARKET));
  assert.match(body, /su Lean Canvas: Idea alfa/);
  assert.ok(outlet.querySelector('.comment-ai .markdown h4'), 'la risposta di Claude è formattata');
  const tab = [...outlet.querySelectorAll('.tab')].find((t) => /Commenti/.test(t.textContent));
  assert.equal(text(tab), 'Commenti2');
});

test('entering a page shows the latest version even if a live update was lost', async () => {
  await visit(`#/idea/${IDS.idea}/canvas`);
  assert.match(text(outlet), /Problema di prova/);
  const newer = { ...store.getItem(IDS.canvas), version: 2, data: { problem: 'Problema aggiornato da Bruno' } };
  const rows = [...store.state.items.values()].filter((i) => !i.example).map((i) => (i.id === IDS.canvas ? newer : i)).filter((i) => i.id !== MARKET);
  api.listItems = async () => rows;
  api.commentCounts = async () => new Map();
  assert.equal(await store.syncItems({ force: true }), true);
  await flush();
  assert.match(text(outlet), /Problema aggiornato da Bruno/);
  assert.equal(store.getItem(MARKET), null, 'un elemento sparito dal database sparisce anche dal sito');
  assert.equal(await store.syncItems(), null, 'due sincronizzazioni ravvicinate non rifanno la richiesta');
  api.listItems = async () => [];
  assert.equal(await store.syncItems({ force: true }), false);
  assert.ok(store.getItem(IDS.canvas), 'una risposta vuota non svuota il sito');
});

test('back returns to the previous page of the site, or to the parent page on a direct link', async () => {
  history.replaceState({ navIndex: 0 }, '', '#/idee');
  await visit('#/idee');
  assert.equal(outlet.querySelector('.back-link'), null, 'link diretto a una pagina del menu: niente «Indietro»');
  history.replaceState({ navIndex: 0 }, '', `#/idea/${IDS.idea}`);
  await visit(`#/idea/${IDS.idea}`);
  const back = outlet.querySelector('.back-link');
  assert.equal(back.getAttribute('href'), '#/idee');
  history.pushState(null, '', `#/elemento/${IDS.canvas}`);
  await visit(`#/elemento/${IDS.canvas}`);
  assert.equal(router.canGoBack(), true);
  assert.equal(outlet.querySelector('.back-link').getAttribute('href'), `#/idea/${IDS.idea}`);
  await visit(`#/modifica/${IDS.canvas}`);
  assert.ok(outlet.querySelector('.back-link'));
  await visit('#/');
  assert.equal(outlet.querySelector('.back-link'), null, 'la dashboard non ha «Indietro»');
});

const PHOTO = `data:image/jpeg;base64,${'Q'.repeat(400)}`;

test('the persona page is a sheet with photo, demographics, objections and sources', async () => {
  store.applyItem(item({
    ...store.getItem(PERSONA),
    version: 2,
    data: { ...store.getItem(PERSONA).data, photo: PHOTO, role: 'Responsabile qualità in uno stabilimento', segment: 'Industria alimentare', age_range: '30-50 anni', gender: 'donna', location: 'Sud Italia', objections: 'Costa troppo', info_sources: 'Gruppi online' },
  }));
  const body = await visit(`#/elemento/${PERSONA}`);
  const hero = outlet.querySelector('.persona-hero');
  assert.equal(hero.querySelector('img.photo').getAttribute('src'), PHOTO);
  assert.equal(hero.querySelector('.persona-role').textContent, 'Responsabile qualità in uno stabilimento');
  assert.match(text(hero), /Età30-50 anni/);
  assert.match(text(hero), /GenereDonna/);
  assert.match(text(hero), /Nell'acquistoPaga/);
  assert.match(text(hero), /Early adopterSì/);
  assert.match(text(hero), /Reddito-/, 'i dati mancanti restano visibili come vuoti');
  assert.match(body, /Una frase tipica\s*Ci serve subito/);
  assert.match(body, /Obiezioni all'acquisto/);
  assert.match(body, /Costa troppo/);
  assert.match(body, /Dove si informa/);
  assert.doesNotMatch(body, /QQQQ/, 'la foto non compare mai come testo');
  await visit(`#/idea/${IDS.idea}/clienti`);
  const card = outlet.querySelector('.persona-card');
  assert.equal(card.querySelector('.persona-card-head img.photo').getAttribute('src'), PHOTO);
  assert.equal(card.querySelector('.persona-card-name a').getAttribute('href'), `#/elemento/${PERSONA}`);
  assert.match(text(card.querySelector('.persona-card-name')), /Responsabile qualità in uno stabilimento/);
  assert.match(text(card.querySelector('.persona-facts')), /SegmentoIndustria alimentare.*Nell'acquistoPaga.*Età30-50 anni.*ZonaSud Italia/);
});

test('without a photo the persona shows its initials', async () => {
  await visit(`#/elemento/${PERSONA}`);
  assert.equal(outlet.querySelector('.persona-hero img'), null);
  assert.equal(outlet.querySelector('.persona-hero .photo-empty').textContent, 'RQ');
});

test('a photo is resized in the browser, saved with the persona and can be removed', async () => {
  const restore = { bitmap: globalThis.createImageBitmap, ctx: window.HTMLCanvasElement.prototype.getContext, url: window.HTMLCanvasElement.prototype.toDataURL };
  const drawn = [];
  globalThis.createImageBitmap = async () => ({ width: 400, height: 300, close() {} });
  window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage: (...args) => drawn.push(args) });
  window.HTMLCanvasElement.prototype.toDataURL = () => PHOTO;
  let saved = null;
  api.saveItem = async ({ id, snapshot }) => {
    saved = snapshot;
    return { status: 'ok', item: { ...store.getItem(id), ...snapshot, version: 2 } };
  };
  try {
    await visit(`#/modifica/${PERSONA}`);
    const upload = (file) => {
      const input = outlet.querySelector('.photo-input input[type="file"]');
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
    };
    upload(new window.File(['x'], 'pdf.pdf', { type: 'application/pdf' }));
    await flush(5);
    assert.match(text(document.querySelector('.toasts')), /Scegli un'immagine/);
    assert.equal(outlet.querySelector('.photo-input img'), null);

    upload(new window.File(['x'], 'foto.jpg', { type: 'image/jpeg' }));
    await flush(5);
    assert.deepEqual(drawn[0].slice(1), [50, 0, 300, 300, 0, 0, 256, 256], 'ritaglio quadrato al centro');
    assert.equal(outlet.querySelector('.photo-input img.photo').getAttribute('src'), PHOTO);
    byText(outlet, 'button', 'Salva').click();
    await flush(10);
    assert.equal(saved.data.photo, PHOTO);

    await visit(`#/modifica/${PERSONA}`);
    byText(outlet, 'button', 'Togli la foto').click();
    byText(outlet, 'button', 'Salva').click();
    await flush(10);
    assert.equal(saved.data.photo, undefined);
  } finally {
    globalThis.createImageBitmap = restore.bitmap;
    window.HTMLCanvasElement.prototype.getContext = restore.ctx;
    window.HTMLCanvasElement.prototype.toDataURL = restore.url;
  }
});

test('the photo never reaches Claude or the Markdown export, and history shows it as an image', async () => {
  const persona = { ...store.getItem(PERSONA), data: { ...store.getItem(PERSONA).data, photo: PHOTO, objections: 'Costa troppo' } };
  const context = ai.buildContext('critique', { idea: store.getItem(IDS.idea), item: persona });
  assert.match(context, /Obiezioni all'acquisto: Costa troppo/);
  assert.doesNotMatch(context, /data:image|QQQQ|Foto/);
  store.applyItem({ ...persona, version: 3 });
  assert.doesNotMatch(exporter.ideaMarkdown(store.getItem(IDS.idea)), /data:image/);
  const { changeView } = await import('../../assets/js/views/history.js');
  const view = changeView('persona', { path: 'data.photo', type: 'added', kind: 'inline', before: undefined, after: PHOTO });
  assert.equal(view.querySelector('img.photo').getAttribute('src'), PHOTO);
  assert.match(text(view), /nessuna foto/);
  assert.doesNotMatch(text(view), /QQQQ/);
});

const stepEl = (title) => [...outlet.querySelectorAll('.rm-step')].find((li) => li.querySelector('.rm-title')?.textContent === title);

test('each idea has an interactive roadmap where manual steps are marked, skipped and reopened', async () => {
  const saved = [];
  api.saveItem = async ({ id, snapshot, message }) => {
    saved.push({ snapshot, message });
    return { status: 'ok', item: { ...store.getItem(id), ...snapshot, version: store.getItem(id).version + 1 } };
  };
  const body = await visit(`#/idea/${IDS.idea}/roadmap`);
  assert.match(body, /Roadmap dell'idea/);
  assert.equal(outlet.querySelectorAll('.rm-phase').length, 8);
  const first = stepEl('Compilate il Team Canvas');
  assert.ok(first.classList.contains('is-next'));
  assert.equal(first.querySelector('details').open, true);
  assert.match(text(first), /Fatto quando/);
  const persona = stepEl('Descrivete le buyer persona');
  assert.equal(persona.querySelector('input.rm-check').checked, false, 'nessun passo si spunta da solo');
  assert.match(text(persona), /Sembra fatto dai dati del sito/);
  assert.equal(outlet.querySelectorAll('span.rm-check').length, 0);
  assert.match(text(outlet.querySelectorAll('.rm-phase')[1]), /La fase precedente non è completa/);
  assert.match(text(outlet.querySelector('.rm-phase:last-child')), /si apre quando l'idea è «Scelta»/);

  const box = first.querySelector('input.rm-check');
  box.checked = true;
  box.dispatchEvent(new Event('change'));
  await flush(10);
  assert.match(saved[0].snapshot.data.roadmap['team-canvas'], new RegExp(`^done\\|${ME}\\|`));
  assert.equal(saved[0].message, 'Roadmap: «Compilate il Team Canvas» fatto');
  assert.match(text(stepEl('Compilate il Team Canvas')), /Fatto, segnato da Anna/);
  assert.ok(stepEl('Dichiarate ruoli e ore a settimana').classList.contains('is-next'));

  const tappa = stepEl('Deep tech: prossima tappa e design partner');
  [...tappa.querySelectorAll('button')].find((b) => /Non serve/.test(b.textContent)).click();
  await flush(10);
  assert.match(saved[1].snapshot.data.roadmap['tappa-tecnica'], /^skip\|/);
  const skipped = stepEl('Deep tech: prossima tappa e design partner');
  assert.ok(skipped.classList.contains('is-skip'));
  const skipBox = skipped.querySelector('input.rm-check');
  assert.equal(skipBox.disabled, false, 'anche «non serve» si può togliere');
  skipBox.checked = false;
  skipBox.dispatchEvent(new Event('change'));
  await flush(10);
  assert.equal(saved[2].snapshot.data.roadmap['tappa-tecnica'], undefined);

  const again = stepEl('Compilate il Team Canvas').querySelector('input.rm-check');
  again.checked = false;
  again.dispatchEvent(new Event('change'));
  await flush(10);
  assert.equal(saved[3].snapshot.data.roadmap, undefined, 'tolte tutte le spunte, la roadmap dell\'idea torna vuota');
  assert.equal(saved[3].message, 'Roadmap: «Compilate il Team Canvas» da fare');

  const { changeView } = await import('../../assets/js/views/history.js');
  const change = changeView('idea', { path: 'data.roadmap.team-canvas', type: 'added', kind: 'inline', before: undefined, after: saved[0].snapshot.data.roadmap['team-canvas'] });
  assert.match(text(change), /da fare → fatto \(Anna\)/);
});

test('the example roadmap is read-only and shows the phases already passed', async () => {
  const spotify = EXAMPLES.find((e) => e.kind === 'idea' && e.status === 'scelta');
  await visit(`#/idea/${spotify.id}/roadmap`);
  const boxes = [...outlet.querySelectorAll('input.rm-check')];
  assert.ok(boxes.length > 0);
  assert.ok(boxes.every((b) => b.disabled));
  assert.ok([...outlet.querySelectorAll('.rm-phase')].slice(0, 7).every((p) => p.classList.contains('is-complete')));
  assert.match(text(stepEl('Compilate il Team Canvas')), /Fatto \(esempio\)/);
});
