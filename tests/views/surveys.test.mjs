import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text, byText, typeInto } from '../setup/dom.mjs';
import { ADVISOR, IDS, ME, OTHER, XSS, boardItems, item, members } from '../setup/fixtures.mjs';

let api;
let store;
let router;
let app;
let schema;
let template;
let notifications;
let history;
let original;
let outlet;
let saves;
let created;
let deleted;
let copied;

// Questionari, risposte e persone di fantasia.
const S = {
  open: 'eeeeeeee-0000-4000-8000-000000000001',
  draft: 'eeeeeeee-0000-4000-8000-000000000002',
  other: 'eeeeeeee-0000-4000-8000-000000000003',
};
const CONTACT = 'eeeeeeee-0000-4000-8000-000000000010';
const TOKEN = 'TokenDiProvaAperto0001';
const LOOK = { theme: 'automatico', accent: '#3b4bc8' };
const freq = { points: 5, min_label: 'Mai', max_label: 'Sempre', labels: ['Mai', 'Raramente', 'A volte', 'Spesso', 'Sempre'] };

const QUESTIONS = [
  { id: 'ruolo', type: 'scelta', label: 'Che lavoro fai?', required: false, role: 'persona', options: [{ id: 'a', label: 'Infermiere' }, { id: 'b', label: 'Medico' }], allow_other: true, prefer_not: false },
  { id: 'ultima', type: 'scelta', label: 'L\'ultima volta che è successo, quando è stato?', required: false, role: 'problema', options: [{ id: 'sett', label: 'Questa settimana' }, { id: 'mese', label: 'Questo mese' }], allow_other: false, prefer_not: false },
  { id: 'f1', type: 'scala', label: 'Quanto spesso cambi turno?', required: false, role: 'problema', scale: freq },
  { id: 'f2', type: 'scala', label: 'Quanto spesso resti oltre l\'orario?', required: false, role: 'problema', scale: freq },
  { id: 'f3', type: 'scala', label: 'Quanto spesso salti la pausa?', required: false, role: 'problema', scale: freq },
  { id: 'volte', type: 'numero', label: 'Nelle ultime 4 settimane, quante volte?', required: false, role: 'problema', number: { min: 0 } },
  { id: 'storia', type: 'lunga', label: 'Raccontaci l\'ultima volta', required: false, role: 'problema' },
  { id: 'mail', type: 'email', label: 'La tua email', required: false, role: 'contatto' },
];

function surveyItems({ xss = false } = {}) {
  const label = (t) => (xss ? `${t} ${XSS}` : t);
  const data = (over) => ({ intro: 'Siamo un gruppo di studenti. Non vendiamo nulla.', privacy: 'Informativa breve.', thanks: 'Grazie!', layout: 'una', progress: 'contatore', show_time: true, appearance: LOOK, ...over });
  return [
    item({ id: S.open, kind: 'survey', title: label('Turni in corsia'), status: 'aperto', idea_id: IDS.idea, data: data({ token: TOKEN, questions: QUESTIONS.map((q) => ({ ...q, label: label(q.label) })) }) }),
    item({ id: S.draft, kind: 'survey', title: 'Bozza sui turni', status: 'bozza', idea_id: IDS.idea, data: data({ questions: QUESTIONS.slice(0, 2) }) }),
    item({ id: S.other, kind: 'survey', title: 'Sondaggio beta', status: 'chiuso', idea_id: IDS.idea2, data: data({ token: 'TokenDiProvaChiuso0001', questions: [] }) }),
    item({ id: CONTACT, kind: 'contact', title: 'Già sentita', status: 'contattata', idea_id: IDS.idea, data: { contact: 'gia@esempio.it' } }),
  ];
}

function responses({ xss = false } = {}) {
  const r = (n, over) => ({
    id: `ffffffff-0000-4000-8000-00000000000${n}`,
    survey_id: S.open,
    session: `aaaaaaaa-0000-4000-8000-00000000000${n}`,
    answers: {},
    email: null,
    recontact: false,
    duration_seconds: 240,
    device: 'telefono',
    completed: true,
    saves: 3,
    created_at: `2026-10-2${n}T09:00:00Z`,
    updated_at: `2026-10-2${n}T09:05:00Z`,
    ...over,
  });
  return [
    r(1, { answers: { ruolo: 'a', ultima: 'sett', f1: 4, f2: 4, f3: 4, volte: 3, storia: 'Ho cambiato turno tre volte in una settimana.' }, email: 'persona1@esempio.it', recontact: true }),
    r(2, { answers: { ruolo: 'b', ultima: 'mese', f1: 2, f2: 3, f3: 5, volte: 0, storia: 'Il reparto era scoperto e sono rimasta fino a sera.' }, email: 'PERSONA1@esempio.it', recontact: true, device: 'computer', duration_seconds: 400 }),
    r(3, { answers: { 'ruolo:altro': 'Tecnico', ultima: 'sett', f1: 5, f2: 1, f3: 2, volte: 8, storia: 'Ok' }, email: 'gia@esempio.it', recontact: true }),
    r(4, { answers: { ruolo: 'a', ultima: 'mese', f1: 1, f2: 2, f3: 3, volte: 1, storia: xss ? XSS : 'Ho chiesto un cambio alla collega.' }, email: 'persona4@esempio.it', recontact: false }),
    r(5, { answers: { ruolo: 'a', ultima: 'sett' }, completed: false, duration_seconds: null }),
    r(6, { answers: { ruolo: 'b' }, completed: false, duration_seconds: null, device: null }),
  ];
}

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  schema = await import('../../assets/js/schema.js');
  template = await import('../../assets/js/survey-template.js');
  notifications = await import('../../assets/js/notifications.js');
  history = await import('../../assets/js/views/history.js');
  original = { ...api };
  router.clearRoutes();
  app.registerRoutes();
});

function useMe(userId = ME) {
  store.resetStore();
  store.state.user = { id: userId };
  store.setMembers(members());
}

beforeEach(async () => {
  useMe();
  [...boardItems(), ...surveyItems()].forEach((i) => store.applyItem(i));
  localStorage.clear();
  saves = [];
  created = [];
  deleted = [];
  copied = [];
  api.listRevisions = async () => [];
  api.surveyFunnel = async (id) => (id === S.open ? { views: 20, starts: 9, partial: 2, completed: 4 } : { views: 3, starts: 1, partial: 0, completed: 1 });
  api.listSurveyResponses = async () => responses();
  api.deleteSurveyResponses = async (id, ids = null) => {
    deleted.push([id, ids]);
    return ids ? ids.length : 6;
  };
  api.saveItem = async (args) => {
    saves.push(args);
    const current = store.getItem(args.id);
    return { status: 'ok', item: item({ ...current, ...args.snapshot, version: current.version + 1 }) };
  };
  api.createItem = async ({ kind, title, status, data, ideaId, message }) => {
    created.push({ kind, title, status, data, ideaId, message });
    return item({ id: `dddddddd-0000-4000-8000-${String(created.length).padStart(12, '0')}`, kind, title, status, data, idea_id: ideaId });
  };
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (value) => copied.push(value) }, configurable: true });
  outlet = document.createElement('main');
  document.body.append(outlet);
  document.body.querySelectorAll('dialog').forEach((d) => d.remove());
  await router.startRouter(outlet, { fallback: app.notFoundView });
});

afterEach(() => {
  router.stopRouter();
  outlet.remove();
  Object.assign(api, original);
});

async function visit(hash) {
  await router.render(hash);
  await flush(5);
  return text(outlet);
}

const card = (id) => outlet.querySelector(`.sq-card[data-id="${id}"]`);
const cardIds = () => [...outlet.querySelectorAll('.sq-card')].map((el) => el.dataset.id);
const dialog = () => document.querySelector('dialog');

async function answerDialog(label) {
  await flush(2);
  byText(dialog(), 'button', label).click();
  await flush(5);
}

function choose(input) {
  input.checked = true;
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
}

test('the idea page has Questionari in Validazione and a new questionnaire starts from the template', async () => {
  const body = await visit(`#/idea/${IDS.idea}/questionari`);
  const sub = [...outlet.querySelectorAll('.subtabs .tab')].map((tab) => tab.firstChild.textContent);
  assert.deepEqual(sub, ['Esperimenti', 'Persone e interviste', 'Questionari']);
  assert.equal(text(outlet.querySelector('.subtabs .tab.is-active .tab-count')), '2');
  assert.equal(outlet.querySelectorAll('.sv-card').length, 2);
  assert.match(body, /Servono soprattutto a trovare persone da intervistare/);

  byText(outlet, 'button', 'Nuovo questionario').click();
  await flush(2);
  const modal = dialog();
  assert.equal(modal.querySelector('input').value, 'Questionario: Idea alfa');
  const experiment = modal.querySelector('select[aria-label="Esperimento collegato"]');
  assert.ok([...experiment.options].some((o) => o.value === IDS.experiment));
  experiment.value = IDS.experiment;
  await answerDialog('Crea');

  assert.equal(created.length, 1);
  const [made] = created;
  assert.equal(made.kind, 'survey');
  assert.equal(made.status, 'bozza');
  assert.equal(made.ideaId, IDS.idea);
  assert.equal(made.data.experiment_id, IDS.experiment);
  assert.equal(made.data.intro, template.INTRO_TEMPLATE);
  assert.equal(made.data.privacy, template.PRIVACY_TEMPLATE);
  assert.deepEqual(made.data.questions.map((q) => q.role), ['persona', 'persona', 'problema', 'problema', 'problema', 'problema', 'contatto']);
  await flush(5);
  assert.equal(location.hash, '#/questionario/dddddddd-0000-4000-8000-000000000001');
  const page = text(outlet);
  assert.match(page, /Sostituisci le parti tra parentesi quadre\. Nomina l'università solo se sponsorizza o autorizza davvero il progetto/);
  assert.equal(outlet.querySelector('.sq-text .badge-warn').hidden, false, 'privacy da completare');
  assert.match(text(outlet.querySelector('.sq-summary')), /Parti tra parentesi quadre ancora da sostituire/);
});

test('the Questionari page lists every questionnaire with status, idea, completed responses and link', async () => {
  const asked = [];
  const funnel = api.surveyFunnel;
  api.surveyFunnel = async (id) => {
    asked.push(id);
    return funnel(id);
  };
  await visit('#/questionari');
  await flush(5);
  const cards = [...outlet.querySelectorAll('.sv-card')];
  assert.equal(cards.length, 3);
  assert.deepEqual(asked.sort(), [S.open, S.other].sort(), 'solo i questionari già aperti hanno risposte');
  const open = outlet.querySelector(`.sv-card[data-id="${S.open}"]`);
  assert.match(text(open), /Aperto.*Idea: Idea alfa.*Risposte complete: 4/);
  byText(open, 'button', 'Copia il link').click();
  await flush(2);
  assert.deepEqual(copied, [`https://board.example/q-indaco.html#${TOKEN}`]);
  assert.match(text(outlet.querySelector(`.sv-card[data-id="${S.draft}"]`)), /Mai aperto.*Il link si crea quando lo aprite/);
  assert.match(text(outlet.querySelector(`.sv-card[data-id="${S.other}"]`)), /Chiuso.*Risposte complete: 1.*Il link mostra «questionario chiuso»/);

  await visit(`#/questionari?idea=${IDS.idea2}`);
  assert.deepEqual([...outlet.querySelectorAll('.sv-card')].map((c) => c.dataset.id), [S.other]);
  assert.ok(router.match('/questionario/x/risposte'));
});

test('questions are edited, reordered, duplicated, deleted and added, then saved with a merge', async () => {
  await visit(`#/questionario/${S.open}`);
  assert.deepEqual([...outlet.querySelectorAll('.tabs .tab')].map((t) => text(t)), ['Domande', 'Aspetto e impostazioni', 'Condividi', 'Risposte']);
  assert.ok([...outlet.querySelectorAll('.tabs .tab')].every((t) => t.dataset.replace === ''), 'le schede non riempiono la cronologia');
  assert.deepEqual(cardIds(), QUESTIONS.map((q) => q.id));
  const save = byText(outlet, '.save-bar button', 'Salva');
  assert.equal(save.disabled, true);

  card('ruolo').querySelector('[data-action="toggle"]').click();
  await flush();
  const label = card('ruolo').querySelector('[data-focus="label-ruolo"]');
  typeInto(label, 'Che lavoro fai adesso?');
  assert.equal(text(card('ruolo').querySelector('.sq-label')), 'Che lavoro fai adesso?');
  assert.equal(save.disabled, false);

  card('ultima').querySelector('[data-action="up"]').click();
  await flush();
  assert.deepEqual(cardIds().slice(0, 2), ['ultima', 'ruolo']);
  assert.ok(card('ultima').contains(document.activeElement), 'il fuoco resta sulla domanda spostata');
  assert.equal(card('ultima').querySelector('[data-action="up"]').disabled, true);

  card('storia').querySelector('[data-action="duplicate"]').click();
  await flush();
  const ids = cardIds();
  const copyId = ids[ids.indexOf('storia') + 1];
  assert.match(copyId, /^q-/);
  assert.equal(card('mail').querySelector('[data-action="duplicate"]').disabled, true, 'una sola email');

  card('volte').querySelector('[data-action="delete"]').click();
  await answerDialog('Elimina');
  assert.equal(card('volte'), null);

  const newType = outlet.querySelector('select[aria-label="Tipo della nuova domanda"]');
  assert.equal(newType.querySelector('option[value="email"]').disabled, true);
  newType.value = 'scala';
  byText(outlet, '.sq-add button', 'Aggiungi').click();
  await flush();
  const added = cardIds().at(-1);
  const preset = card(added).querySelector(`[data-focus="preset-${added}"]`);
  preset.value = 'quantita';
  preset.dispatchEvent(new window.Event('change'));
  await flush();
  const points = card(added).querySelector(`[data-focus="points-${added}"]`);
  points.value = '7';
  points.dispatchEvent(new window.Event('change'));
  await flush();
  assert.equal(card(added).querySelectorAll('.sq-scale-labels input').length, 7);
  assert.equal(card(added).querySelector('.sq-scale-labels input').value, 'Per niente');

  save.click();
  await flush(5);
  assert.equal(saves.length, 1);
  const { snapshot, baseVersion, message } = saves[0];
  assert.equal(baseVersion, 1);
  assert.equal(message, 'Domande del questionario');
  assert.deepEqual(snapshot.data.questions.map((q) => q.id), ['ultima', 'ruolo', 'f1', 'f2', 'f3', 'storia', copyId, 'mail', added]);
  assert.equal(snapshot.data.questions[1].label, 'Che lavoro fai adesso?');
  assert.deepEqual(snapshot.data.questions.at(-1).scale.labels, template.presetLabels('quantita', 7));
  assert.equal(snapshot.data.token, TOKEN, 'il resto non cambia');
  assert.equal(byText(outlet, '.save-bar button', 'Salva').disabled, true, 'dopo il salvataggio non ci sono modifiche in sospeso');
});

test('choice options, required and type changes are edited from the question card', async () => {
  await visit(`#/questionario/${S.draft}/domande`);
  card('ruolo').querySelector('[data-action="toggle"]').click();
  await flush();
  byText(card('ruolo'), 'button', 'Aggiungi un\'opzione').click();
  await flush();
  const inputs = card('ruolo').querySelectorAll('.sq-option input');
  assert.equal(inputs.length, 3);
  assert.equal(document.activeElement, inputs[2]);
  typeInto(inputs[2], 'Operatore socio sanitario');
  card('ruolo').querySelector('[aria-label="Sposta su l\'opzione 3"]').click();
  await flush();
  card('ruolo').querySelector('[aria-label="Togli l\'opzione 1"]').click();
  await flush();
  const preferNot = byText(card('ruolo'), 'label.check', 'Preferisco non rispondere').querySelector('input');
  choose(preferNot);
  const required = card('ruolo').querySelector('[data-focus="req-ruolo"]');
  choose(required);
  await flush();
  card('ultima').querySelector('[data-action="toggle"]').click();
  await flush();
  const type = card('ultima').querySelector('[data-focus="type-ultima"]');
  type.value = 'numero';
  type.dispatchEvent(new window.Event('change'));
  await flush();
  typeInto(card('ultima').querySelectorAll('input[type="number"]')[1], '30');
  byText(outlet, '.save-bar button', 'Salva').click();
  await flush(5);
  const [ruolo, ultima] = saves[0].snapshot.data.questions;
  assert.deepEqual(ruolo.options.map((o) => o.label), ['Operatore socio sanitario', 'Medico']);
  assert.equal(ruolo.prefer_not, true);
  assert.equal(ruolo.required, true);
  assert.deepEqual([ultima.type, ultima.number, ultima.options], ['numero', { min: 0, max: 30 }, undefined]);
});

test('warnings from the book and the research appear while writing, with a better form', async () => {
  await visit(`#/questionario/${S.draft}`);
  const summary = () => text(outlet.querySelector('.sq-summary'));
  assert.match(summary(), /2 domande · 1 su chi risponde · 1 sul problema · 0 aperte · Durata stimata: circa 1 minuto/);
  assert.match(summary(), /Manca la domanda per l'email/);

  card('ultima').querySelector('[data-action="toggle"]').click();
  await flush();
  typeInto(card('ultima').querySelector('[data-focus="label-ultima"]'), 'Compreresti un\'app che ti organizza i turni?');
  const warnings = text(card('ultima').querySelector('.sq-warn'));
  assert.match(warnings, /Verbo al condizionale \(«compreresti»\)/);
  assert.match(warnings, /L'ultima volta che\.\.\./);
  assert.match(warnings, /Si parla della soluzione/);

  const [intro, privacy] = outlet.querySelectorAll('.sq-text textarea');
  typeInto(intro, 'Siamo [nomi]. Chi risponde partecipa all\'estrazione di un premio.');
  typeInto(privacy, '');
  assert.match(summary(), /Introduzione: Si parla di premi, buoni o sconti/);
  assert.match(summary(), /Manca l'informativa sulla privacy/);
  assert.match(summary(), /Parti tra parentesi quadre ancora da sostituire: introduzione/);

  const newType = outlet.querySelector('select[aria-label="Tipo della nuova domanda"]');
  for (let i = 0; i < 3; i += 1) {
    newType.value = 'lunga';
    byText(outlet, '.sq-add button', 'Aggiungi').click();
  }
  await flush();
  assert.match(summary(), /3 domande aperte: oltre 2/);
  for (const id of cardIds()) {
    const required = card(id).querySelector(`[data-focus="req-${id}"]`);
    if (required) choose(required);
  }
  await flush();
  assert.match(summary(), /domande obbligatorie: obbligare a rispondere fa abbandonare di più/);
  assert.ok(byText(outlet, '.save-bar button', 'Salva').disabled === false, 'gli avvisi non bloccano il salvataggio');
});

test('unsaved edits ask before leaving and survive a newer version from someone else', async () => {
  await visit(`#/questionario/${S.draft}/domande`);
  card('ruolo').querySelector('[data-action="toggle"]').click();
  await flush();
  typeInto(card('ruolo').querySelector('[data-focus="label-ruolo"]'), 'Che lavoro fai oggi?');
  store.applyItem(item({ ...store.getItem(S.draft), version: 2, updated_by: OTHER, title: 'Titolo cambiato da Bruno' }));
  await flush();
  assert.match(text(outlet), /Bruno ha salvato una nuova versione mentre modificavi/);
  assert.equal(card('ruolo').querySelector('[data-focus="label-ruolo"]').value, 'Che lavoro fai oggi?');

  const leaving = router.render(`#/questionario/${S.draft}/aspetto`);
  await flush(2);
  assert.match(text(dialog()), /modifiche non salvate/);
  byText(dialog(), 'button', 'Annulla').click();
  await leaving;
  await flush();
  assert.ok(card('ruolo'), 'si resta sulle domande');
});

test('appearance and settings: recommended choices with reasons, palette, contrast warning and live preview', async () => {
  await visit(`#/questionario/${S.open}/aspetto`);
  const body = text(outlet);
  assert.equal(outlet.querySelectorAll('.badge-ok').length, 4, 'una scelta consigliata per impaginazione, avanzamento, durata e tema');
  assert.match(body, /Una domanda per schermata consigliato Sul telefono si saltano meno domande/);
  assert.match(body, /Galesic e Bosnjak 2009/);
  assert.equal(outlet.querySelector('input[name="sv-layout"][value="una"]').checked, true);
  assert.equal(outlet.querySelectorAll('.sv-swatch').length, 8);
  assert.equal(outlet.querySelectorAll('.sv-preview').length, 2, 'automatico: chiaro e scuro');
  assert.match(body, /Testo sul colore: bianco 6,9:1, nero 3,0:1\. I pulsanti useranno il testo bianco\./);

  choose(outlet.querySelector('input[name="sv-theme"][value="chiaro"]'));
  assert.equal(outlet.querySelectorAll('.sv-preview').length, 1);
  typeInto(outlet.querySelector('.sv-hex'), '#F5E663');
  const warning = outlet.querySelector('[data-code="contrasto-sfondo-chiaro"]');
  assert.ok(warning);
  assert.match(text(warning), /Sullo sfondo chiaro il colore si vede poco \(1,2:1\): la pagina lo scurisce da sola.*scegline uno più scuro/);
  const preview = outlet.querySelector('.sv-preview');
  assert.equal(preview.style.getPropertyValue('--sv-accent'), '#938a3b', 'scurito come nella pagina pubblica');
  assert.equal(preview.style.getPropertyValue('--sv-on-accent'), '#000000');

  choose(outlet.querySelector('input[name="sv-accent"][aria-label="Verde"]'));
  assert.equal(outlet.querySelector('[data-code^="contrasto-"]'), null);
  assert.equal(outlet.querySelector('.sv-hex').value, '#15803d');
  choose(outlet.querySelector('input[name="sv-progress"][value="barra"]'));
  assert.ok(outlet.querySelector('.sv-preview-bar'));
  choose(outlet.querySelector('input[name="sv-layout"][value="sezioni"]'));
  const showTime = byText(outlet, 'label.check', 'Mostra la durata stimata').querySelector('input');
  showTime.checked = false;
  showTime.dispatchEvent(new window.Event('change'));
  const experiment = byText(outlet, 'label.field', 'Esperimento collegato').querySelector('select');
  experiment.value = IDS.experiment;
  experiment.dispatchEvent(new window.Event('change'));
  typeInto(byText(outlet, 'label.field', 'Titolo').querySelector('input'), 'Turni e pause');

  byText(outlet, '.save-bar button', 'Salva').click();
  await flush(5);
  const { snapshot, message } = saves[0];
  assert.equal(message, 'Aspetto e impostazioni');
  assert.equal(snapshot.title, 'Turni e pause');
  assert.deepEqual(snapshot.data.appearance, { theme: 'chiaro', accent: '#15803d' });
  assert.deepEqual([snapshot.data.layout, snapshot.data.progress, snapshot.data.show_time, snapshot.data.experiment_id], ['sezioni', 'barra', false, IDS.experiment]);
  assert.equal(snapshot.data.questions.length, QUESTIONS.length);
});

test('the start screen image is reduced in the browser, uploaded to the survey space, described and saved', async () => {
  const proto = window.HTMLCanvasElement.prototype;
  const saved = { bitmap: globalThis.createImageBitmap, ctx: proto.getContext, blob: proto.toBlob, url: URL.createObjectURL };
  globalThis.createImageBitmap = async () => ({ width: 4000, height: 3000, close() {} });
  proto.getContext = () => ({ drawImage() {} });
  proto.toBlob = function toBlob(callback) {
    callback(new Blob([`jpeg ${this.width}x${this.height}`], { type: 'image/jpeg' }));
  };
  URL.createObjectURL = () => 'blob:copertina';
  const uploads = [];
  api.uploadSurveyImage = async (path, blob) => uploads.push([path, blob]);
  try {
    await visit(`#/questionario/${S.open}/aspetto`);
    assert.match(text(outlet), /Senza immagine in alto c'è una fascia leggera/);
    assert.match(text(outlet), /Couper, Tourangeau e Kenyon 2004/);
    const input = outlet.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [new window.File(['x'], 'gruppo.png', { type: 'image/png' })], configurable: true });
    input.dispatchEvent(new window.Event('change'));
    await flush(10);
    assert.equal(uploads.length, 1);
    const [path, blob] = uploads[0];
    assert.match(path, new RegExp(`^${S.open}/[0-9a-f-]{36}\\.jpg$`));
    assert.equal(blob.type, 'image/jpeg');
    assert.equal(await blob.text(), 'jpeg 1600x1200', 'ridotta a 1600 pixel sul lato lungo');
    assert.equal(outlet.querySelector('.sv-cover-thumb img').getAttribute('src'), 'blob:copertina');
    typeInto(byText(outlet, 'label.field', 'Descrizione dell\'immagine').querySelector('input'), 'Il gruppo davanti all\'università');
    byText(outlet, '.save-bar button', 'Salva').click();
    await flush(5);
    assert.deepEqual(saves[0].snapshot.data.cover, { path, alt: 'Il gruppo davanti all\'università' });
    byText(outlet, 'button', 'Togli').click();
    assert.ok(outlet.querySelector('.sv-cover-thumb.is-empty'));
    assert.equal([...outlet.querySelectorAll('button')].filter((b) => text(b) === 'Scegli un\'immagine').length, 2, 'copertina e grazie');

    assert.match(text(outlet), /Immagine del grazie/);
    const thanksInput = outlet.querySelectorAll('input[type="file"]')[1];
    Object.defineProperty(thanksInput, 'files', { value: [new window.File(['x'], 'gruppo.jpg', { type: 'image/jpeg' })], configurable: true });
    thanksInput.dispatchEvent(new window.Event('change'));
    await flush(10);
    assert.equal(uploads.length, 2);
    typeInto(outlet.querySelectorAll('.sv-cover')[1].querySelector('input[type="text"]'), 'Il gruppo');
    byText(outlet, '.save-bar button', 'Salva').click();
    await flush(5);
    assert.deepEqual(saves.at(-1).snapshot.data.thanks_image, { path: uploads[1][0], alt: 'Il gruppo' });
    assert.equal(saves.at(-1).snapshot.data.cover, undefined);
  } finally {
    Object.assign(globalThis, { createImageBitmap: saved.bitmap });
    Object.assign(proto, { getContext: saved.ctx, toBlob: saved.blob });
    URL.createObjectURL = saved.url;
  }
});

test('the questionnaire exports to PDF as it is made: numbered questions and possible answers, no results', async () => {
  await visit(`#/questionario/${S.open}/domande`);
  const pageTitle = document.title;
  let printed = null;
  const savedPrint = window.print;
  window.print = () => {
    const root = document.getElementById('print-root');
    printed = { active: document.body.classList.contains('print-note'), title: document.title, text: text(root), questions: [...root.querySelectorAll('.ps-q')].map(text), options: [...root.querySelectorAll('.ps-question')].map((q) => [...q.querySelectorAll('li')].map(text)) };
  };
  try {
    byText(outlet, 'button', 'Esporta PDF').click();
    await flush(5);
  } finally {
    window.print = savedPrint;
  }
  assert.ok(printed, 'il dialogo di stampa si apre');
  assert.equal(printed.active, true);
  assert.equal(printed.title, 'Questionario - Turni in corsia', 'il nome del file proposto');
  assert.equal(printed.questions[0], '1. Che lavoro fai?');
  assert.equal(printed.questions.length, QUESTIONS.length);
  assert.deepEqual(printed.options[0], ['○ Infermiere', '○ Medico', '○ Altro:']);
  assert.equal(printed.options[2].length, 5, 'una riga per ogni punto della scala');
  assert.match(printed.text, /Questionario · 8 domande · circa \d+ minut/);
  assert.match(printed.text, /Introduzione.*Siamo un gruppo di studenti/);
  assert.match(printed.text, /Una risposta/);
  assert.match(printed.text, /Numero intero, almeno 0/);
  assert.match(printed.text, /☐ Potete ricontattarmi per una breve chiacchierata/);
  assert.match(printed.text, /Messaggio finale.*Grazie!/);
  assert.match(printed.text, /Informativa sulla privacy.*Informativa breve\./);
  assert.doesNotMatch(printed.text, /Risposte complete|%/, 'niente risultati');
  window.dispatchEvent(new window.Event('afterprint'));
  assert.equal(document.getElementById('print-root'), null);
  assert.equal(document.body.classList.contains('print-note'), false);
  assert.equal(document.title, pageTitle);
});

test('sharing: opening creates the link, the link is copied, closed and changed with a confirmation', async () => {
  await visit(`#/questionario/${S.draft}/condividi`);
  assert.match(text(outlet), /Il link si crea quando aprite il questionario/);
  const pressed = () => [...outlet.querySelectorAll('.sv-status')].map((b) => [b.dataset.status, b.getAttribute('aria-pressed')]);
  assert.deepEqual(pressed(), [['bozza', 'true'], ['aperto', 'false'], ['chiuso', 'false']]);

  outlet.querySelector('.sv-status[data-status="aperto"]').click();
  await flush(5);
  assert.equal(saves.length, 1);
  assert.equal(saves[0].snapshot.status, 'aperto');
  assert.equal(saves[0].message, 'Stato: Bozza → Aperto');
  const token = saves[0].snapshot.data.token;
  assert.match(token, schema.SURVEY_TOKEN_RE);
  const url = `https://board.example/q-indaco.html#${token}`;
  assert.equal(outlet.querySelector('.sv-link-input').value, url);
  assert.equal(byText(outlet, 'a', 'Apri').getAttribute('href'), url);
  assert.equal(byText(outlet, 'a', 'Apri').getAttribute('target'), '_blank');
  assert.deepEqual(pressed().find(([s]) => s === 'aperto'), ['aperto', 'true']);

  byText(outlet, '.sv-link button', 'Copia').click();
  await flush(2);
  assert.deepEqual(copied, [url]);

  outlet.querySelector('.sv-status[data-status="chiuso"]').click();
  await flush(5);
  assert.equal(saves[1].snapshot.data.token, token, 'chiudere non cambia il link');
  assert.match(text(outlet.querySelector('.sv-closed')), /chi apre il link ora vede «questionario chiuso»/);

  byText(outlet, 'button', 'Cambia link').click();
  await flush(2);
  assert.match(text(dialog()), /Il link attuale smetterà di funzionare/);
  await answerDialog('Cambia link');
  assert.equal(saves.length, 3);
  assert.notEqual(saves[2].snapshot.data.token, token);
  assert.match(saves[2].snapshot.data.token, schema.SURVEY_TOKEN_RE);
});

test('opening a questionnaire with brackets left asks first, without blocking', async () => {
  store.applyItem(item({ ...store.getItem(S.draft), version: 2, data: { ...store.getItem(S.draft).data, intro: 'Siamo [nomi].' } }));
  await visit(`#/questionario/${S.draft}/condividi`);
  outlet.querySelector('.sv-status[data-status="aperto"]').click();
  await flush(2);
  assert.match(text(dialog()), /Aprire comunque\?.*parti tra parentesi quadre/i);
  await answerDialog('Annulla');
  assert.equal(saves.length, 0);
  outlet.querySelector('.sv-status[data-status="aperto"]').click();
  await answerDialog('Apri comunque');
  assert.equal(saves[0].snapshot.status, 'aperto');
});

test('statistics: funnel, answers with n beside every percentage, breakoff, times and the sample note', async () => {
  await visit(`#/questionario/${S.open}/risposte`);
  const body = text(outlet);
  assert.match(body, /Chi risponde a un link condiviso non è un campione rappresentativo/);
  assert.deepEqual([...outlet.querySelectorAll('.sv-funnel .sv-bar-row')].map(text), ['Link aperto 100% (20 su 20)', 'Iniziati 45% (9 su 20)', 'Interrotti a metà 10% (2 su 20)', 'Completati 20% (4 su 20)']);
  assert.match(text(outlet.querySelector('.sv-funnel')), /Completamento: 44% \(4 completati su 9 iniziati\)/);
  const rows = (id) => [...outlet.querySelectorAll(`.sv-question[data-id="${id}"] .sv-bar-row`)].map(text);

  const q = (id) => text(outlet.querySelector(`.sv-question[data-id="${id}"]`));
  assert.match(q('ruolo'), /Hanno risposto 6 su 6 arrivati fin qui · senza risposta 0% \(0 su 6\) · si sono fermati qui 1/);
  assert.deepEqual(rows('ruolo'), ['Infermiere 50% (3 su 6)', 'Medico 33% (2 su 6)', 'Altro 17% (1 su 6)']);
  assert.match(q('ruolo'), /Testi di «Altro» \(1\)/);
  assert.match(q('ultima'), /Hanno risposto 5 su 5 arrivati fin qui.*si sono fermati qui 1/);
  assert.deepEqual(rows('f1'), ['1 Mai 25% (1 su 4)', '2 Raramente 25% (1 su 4)', '3 A volte 0% (0 su 4)', '4 Spesso 25% (1 su 4)', '5 Sempre 25% (1 su 4)']);
  assert.match(q('f1'), /Mediana: 3 \(A volte\) · n = 4/);
  assert.match(q('volte'), /Mediana 2 · da 0 a 8 · n = 4/);
  assert.match(q('mail'), /Email lasciate: 4, di cui 3 chiedono di essere ricontattate/);
  assert.doesNotMatch(q('mail'), /esempio\.it/, 'le email non finiscono nelle statistiche');
  assert.match(body, /Mediana: 4 min \(n = 4 compilazioni complete\)/);
  assert.deepEqual([...outlet.querySelectorAll('.sv-devices li')].map(text), ['Telefono: 4 min (n = 3)', 'Computer: 6 min 40 s (n = 1)']);

  const texts = outlet.querySelector('.sv-question[data-id="storia"]');
  const search = texts.querySelector('input[type="search"]');
  typeInto(search, 'collega');
  assert.deepEqual([...texts.querySelectorAll('.sv-texts li')].filter((li) => !li.hidden).map((li) => text(li)), ['Risposta 4: Ho chiesto un cambio alla collega.']);
  assert.equal(outlet.querySelectorAll('.sv-response').length, 6);
});

test('the exclude flagged toggle recomputes everything, and flags never delete anything', async () => {
  await visit(`#/questionario/${S.open}/risposte`);
  const quality = text(outlet.querySelector('.sv-quality'));
  assert.match(quality, /Escludi le risposte segnalate \(2\)/);
  assert.deepEqual([...outlet.querySelectorAll('.sv-flag-list li')].map(text), ['Stessa risposta a tutte le scale: 1', 'Risposta aperta vuota o di meno di 3 parole: 1']);
  assert.match(text(outlet.querySelector('.sv-response[data-n="1"] summary')), /Stessa risposta a tutte le scale/);
  choose(outlet.querySelector('.sv-quality input[type="checkbox"]'));
  await flush();
  assert.match(text(outlet), /Domande \(4 risposte, senza le segnalate\)/);
  const ruolo = outlet.querySelector('.sv-question[data-id="ruolo"]');
  assert.match(text(ruolo), /Hanno risposto 4 su 4/);
  assert.deepEqual([...ruolo.querySelectorAll('.sv-bar-row')].map(text).slice(0, 2), ['Infermiere 50% (2 su 4)', 'Medico 50% (2 su 4)']);
  assert.equal(outlet.querySelectorAll('.sv-response').length, 4);
  assert.equal(deleted.length, 0);
  assert.equal(outlet.querySelector('.sv-quality input').checked, true);
});

test('the CSV export has one row per response, readable columns and emails only on request', async () => {
  const downloads = [];
  URL.createObjectURL = (blob) => {
    downloads.push(blob);
    return 'blob:test';
  };
  URL.revokeObjectURL = () => {};
  const click = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function save() {
    downloads.push(this.download);
  };
  try {
    await visit(`#/questionario/${S.open}/risposte`);
    byText(outlet, 'button', 'Scarica CSV').click();
    await answerDialog('Scarica');
    const csv = await downloads[0].text();
    assert.match(downloads[1], /^questionario-turni-in-corsia-\d{4}-\d{2}-\d{2}\.csv$/);
    const bytes = new Uint8Array(await downloads[0].arrayBuffer());
    assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'BOM per Excel');
    const lines = csv.split('\r\n');
    assert.equal(lines.length, 7);
    assert.equal(lines[0], 'Risposta;Data;Stato;Durata (secondi);Dispositivo;Che lavoro fai?;L\'ultima volta che è successo, quando è stato?;Quanto spesso cambi turno?;Quanto spesso resti oltre l\'orario?;Quanto spesso salti la pausa?;Nelle ultime 4 settimane, quante volte?;Raccontaci l\'ultima volta;Segnalazioni');
    assert.match(lines[3], /^3;.*;completata;240;Telefono;Altro: Tecnico;Questa settimana;5;1;2;8;Ok;Risposta aperta vuota/);
    assert.doesNotMatch(csv, /@|ffffffff|aaaaaaaa/, 'niente email, id o sessioni');

    byText(outlet, 'button', 'Scarica CSV').click();
    await flush(2);
    choose(dialog().querySelector('input[type="checkbox"]'));
    await answerDialog('Scarica');
    const withEmail = await downloads[2].text();
    assert.match(withEmail.split('\r\n')[0], /;Email;Da ricontattare;Segnalazioni$/);
    assert.match(withEmail, /;persona1@esempio\.it;sì;/);
  } finally {
    window.HTMLAnchorElement.prototype.click = click;
  }
});

test('people who asked to be contacted become contacts of the idea, once per email', async () => {
  await visit(`#/questionario/${S.open}/risposte`);
  const box = () => text(outlet.querySelector('.sv-contacts'));
  assert.match(box(), /2 persone hanno lasciato l'email per essere ricontattate; 1 già nei Contatti/);
  byText(outlet, '.sv-contacts button', 'Aggiungi ai Contatti (1)').click();
  await flush(5);
  assert.equal(created.length, 1);
  assert.deepEqual(created[0], {
    kind: 'contact',
    title: 'Infermiere (risposta 1)',
    status: 'da_contattare',
    ideaId: IDS.idea,
    data: {
      purpose: 'cliente',
      role: 'Infermiere',
      via: 'Questionario «Turni in corsia»',
      notes: created[0].data.notes,
      contact: 'persona1@esempio.it',
    },
    message: 'Dal questionario «Turni in corsia»',
  });
  assert.match(created[0].data.notes, /risposta 1 del/);
  assert.match(box(), /2 già nei Contatti/);
  assert.equal(byText(outlet, '.sv-contacts button', 'Aggiungi'), null, 'nessun doppione');
});

test('writers delete one response or all of them, always after a confirmation', async () => {
  await visit(`#/questionario/${S.open}/risposte`);
  byText(outlet.querySelector('.sv-response[data-n="2"]'), 'button', 'Cancella questa risposta').click();
  await flush(2);
  assert.match(text(dialog()), /La risposta 2 verrà cancellata per sempre/);
  await answerDialog('Cancella');
  assert.deepEqual(deleted, [[S.open, ['ffffffff-0000-4000-8000-000000000002']]]);

  byText(outlet, 'button', 'Cancella tutte le risposte').click();
  await flush(2);
  assert.match(text(dialog()), /Tutte le 6 risposte verranno cancellate per sempre, insieme al conteggio di visite e inizi/);
  await answerDialog('Annulla');
  assert.equal(deleted.length, 1);
  byText(outlet, 'button', 'Cancella tutte le risposte').click();
  await answerDialog('Cancella tutte');
  assert.deepEqual(deleted[1], [S.open, null]);
});

test('advisors see every tab read-only', async () => {
  useMe(ADVISOR);
  [...boardItems(), ...surveyItems()].forEach((i) => store.applyItem(i));
  await visit(`#/questionario/${S.open}`);
  assert.equal(outlet.querySelector('.save-bar'), null);
  assert.ok(outlet.querySelector('fieldset.sv-readonly[disabled]'));
  assert.equal(outlet.querySelector('.sq-tools, .sq-add'), null);
  assert.ok(outlet.querySelector('[data-focus="label-ruolo"]'), 'le domande sono tutte aperte in lettura');
  assert.equal(outlet.querySelector('button[title="Archivia"]'), null);

  await visit(`#/questionario/${S.open}/aspetto`);
  assert.ok(outlet.querySelector('fieldset.sv-readonly[disabled]'));
  assert.equal(outlet.querySelector('.save-bar'), null);

  await visit(`#/questionario/${S.open}/condividi`);
  assert.equal(outlet.querySelector('.sv-status'), null);
  assert.equal(byText(outlet, 'button', 'Cambia link'), null);
  assert.equal(outlet.querySelector('.sv-link-input').value, `https://board.example/q-indaco.html#${TOKEN}`);

  await visit(`#/questionario/${S.open}/risposte`);
  assert.equal(byText(outlet, 'button', 'Cancella'), null);
  assert.equal(byText(outlet, 'button', 'Aggiungi ai Contatti'), null);
  assert.ok(byText(outlet, 'button', 'Scarica CSV'));

  await visit(`#/idea/${IDS.idea}/questionari`);
  assert.equal(byText(outlet, 'button', 'Nuovo questionario'), null);
  await visit('#/questionari');
  assert.equal(byText(outlet, 'button', 'Nuovo questionario'), null);
});

test('labels and answers written by others never become HTML', async () => {
  useMe();
  [...boardItems(), ...surveyItems({ xss: true })].forEach((i) => store.applyItem(i));
  api.listSurveyResponses = async () => responses({ xss: true });
  for (const tab of ['domande', 'aspetto', 'condividi', 'risposte']) {
    await visit(`#/questionario/${S.open}/${tab}`);
    assert.equal(document.querySelector('img[src="x"]'), null, tab);
    assert.equal(window.__xss, undefined, tab);
  }
  await visit('#/questionari');
  await visit(`#/idea/${IDS.idea}/questionari`);
  assert.equal(document.querySelector('img[src="x"]'), null);
  assert.match(text(outlet), /<img src=x/);
});

test('the generic editor and item pages send questionnaires to their own page, comments stay', async () => {
  await visit(`#/modifica/${S.open}`);
  await flush(5);
  assert.equal(location.hash, `#/questionario/${S.open}`);
  await visit(`#/elemento/${S.open}`);
  await flush(5);
  assert.equal(location.hash, `#/questionario/${S.open}`);
  await visit(`#/nuovo/survey?idea=${IDS.idea}`);
  await flush(5);
  assert.equal(location.hash, `#/idea/${IDS.idea}/questionari`);
  api.listComments = async () => [];
  const body = await visit(`#/elemento/${S.open}/commenti`);
  assert.match(body, /Turni in corsia/);
  assert.equal(location.hash, `#/idea/${IDS.idea}/questionari`, 'i commenti restano dove sono');
});

test('notifications, history and search name questionnaires', () => {
  const rev = (over) => ({ id: 7, item_id: S.open, kind: 'survey', op: 'create', title: 'Turni in corsia', status: 'bozza', changed: [], author_id: OTHER, created_at: '2026-10-20T10:00:00Z', ...over });
  assert.deepEqual(
    [notifications.describeRevision(rev()).text, notifications.describeRevision(rev()).href],
    ['Bruno ha creato un questionario: «Turni in corsia»', `#/questionario/${S.open}`],
  );
  assert.equal(notifications.describeRevision(rev({ op: 'update', status: 'aperto', changed: ['status'] })).text, 'Bruno ha aperto il questionario «Turni in corsia»');
  assert.equal(notifications.describeRevision(rev({ op: 'update', status: 'chiuso', changed: ['status'] })), null);
  assert.deepEqual(history.changedLabels(rev({ op: 'update', changed: ['questions', 'appearance', 'token', 'intro'] })), ['domande', 'aspetto', 'link pubblico', 'introduzione']);
  assert.equal(store.labelContext.questionLabel('ultima'), QUESTIONS[1].label);
  assert.equal(schema.describePath('survey', 'data.questions#ruolo.label', store.labelContext), 'Domande › Che lavoro fai? › testo');
});
