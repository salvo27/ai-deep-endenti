import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text, byText } from '../setup/dom.mjs';
import { ADVISOR, IDS, ME, OTHER, boardItems, item, members } from '../setup/fixtures.mjs';

let api;
let store;
let router;
let app;
let contacts;
let dashboard;
let ideasView;
let roadmap;
let format;
let original;
let outlet;

const C = {
  buyer: 'cccccccc-0000-4000-8000-000000000001',
  doctor: 'cccccccc-0000-4000-8000-000000000002',
  pharmacy: 'cccccccc-0000-4000-8000-000000000003',
  lab: 'cccccccc-0000-4000-8000-000000000004',
  hospital: 'cccccccc-0000-4000-8000-000000000005',
  archived: 'cccccccc-0000-4000-8000-000000000006',
  orphan: 'cccccccc-0000-4000-8000-000000000007',
  patients: 'cccccccc-0000-4000-8000-000000000008',
  clinic: 'cccccccc-0000-4000-8000-000000000009',
};
const RESEARCH = 'dddddddd-0000-4000-8000-000000000001';
const NEW_INTERVIEW = 'dddddddd-0000-4000-8000-000000000002';

// Date relative a oggi, nel fuso locale come quelle scelte nel calendario.
function day(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return format.dayKey(d);
}

function contactItems() {
  const contact = (id, over) => item({ id, kind: 'contact', idea_id: IDS.idea, status: 'da_contattare', ...over });
  return [
    contact(C.buyer, { title: 'Responsabile acquisti', data: { purpose: 'cliente', role: 'Acquisti', organization: 'Azienda Verdi' } }),
    contact(C.doctor, { title: 'Medico di base', status: 'contattata', data: { owner: ME, next_date: day(-3) } }),
    contact(C.pharmacy, { title: 'Farmacia centrale', idea_id: IDS.idea2, status: 'fissata', data: { owner: OTHER, next_date: day(0) } }),
    contact(C.lab, { title: 'Laboratorio analisi', idea_id: IDS.idea2, data: { owner: ME, next_date: day(20) } }),
    contact(C.hospital, { title: 'Ospedale civile', status: 'chiusa', data: { next_date: day(-10) } }),
    contact(C.archived, { title: 'Studio dentistico', deleted_at: '2026-10-15T10:00:00Z' }),
    contact(C.orphan, { title: 'Clinica privata', idea_id: IDS.trashed, data: { owner: ME, next_date: day(-1) } }),
  ];
}

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  contacts = await import('../../assets/js/views/contacts.js');
  dashboard = await import('../../assets/js/views/dashboard.js');
  ideasView = await import('../../assets/js/views/ideas.js');
  roadmap = await import('../../assets/js/roadmap.js');
  format = await import('../../assets/js/lib/format.js');
  original = { ...api };
  router.clearRoutes();
  app.registerRoutes();
});

beforeEach(async () => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  [...boardItems(), ...contactItems()].forEach((i) => store.applyItem(i));
  localStorage.clear();
  api.listRevisions = async () => [];
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

const rowIds = () => [...outlet.querySelectorAll('.contacts-table tbody tr')].map((tr) => tr.dataset.id);
const rowOf = (id) => outlet.querySelector(`.contacts-table tr[data-id="${id}"]`);

function fakeSave(calls) {
  api.saveItem = async (args) => {
    calls.push(args);
    const current = store.getItem(args.id);
    return { status: 'ok', item: item({ ...current, ...args.snapshot, version: current.version + 1 }) };
  };
}

function change(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('change'));
}

test('the contacts page lists the contacts of every idea, skips archived ones and sums them up', async () => {
  const body = await visit('#/contatti');
  assert.deepEqual(new Set(rowIds()), new Set([C.buyer, C.doctor, C.pharmacy, C.lab, C.hospital]));
  assert.doesNotMatch(body, /Studio dentistico|Clinica privata/);
  assert.equal(
    text(outlet.querySelector('.contacts-summary')),
    '5 persone: 2 da contattare, 3 con un responsabile, 2 da sentire questa settimana (1 in ritardo).',
  );
  const buyer = rowOf(C.buyer);
  assert.match(text(buyer), /Acquisti, Azienda Verdi/);
  assert.equal(buyer.querySelector('a.item-link').getAttribute('href'), `#/elemento/${C.buyer}`);
  assert.ok(byText(buyer, 'a', 'Idea alfa'));
  assert.ok(byText(rowOf(C.pharmacy), 'a', 'Idea beta'));
});

test('contacts are sorted overdue first, then by date, then without a date, closed ones last', async () => {
  await visit('#/contatti');
  assert.deepEqual(rowIds(), [C.doctor, C.pharmacy, C.lab, C.buyer, C.hospital]);
  assert.ok(rowOf(C.doctor).classList.contains('is-overdue'));
  assert.match(text(rowOf(C.doctor)), /in ritardo di 3 giorni/);
  assert.match(text(rowOf(C.pharmacy)), /oggi/);
  assert.ok(!rowOf(C.hospital).classList.contains('is-overdue'), 'una persona chiusa non è in ritardo');
});

test('filters for mine, without owner and this week combine with status and idea in the URL', async () => {
  await visit('#/contatti?filtro=mie');
  assert.deepEqual(rowIds(), [C.doctor, C.lab]);
  await visit('#/contatti?filtro=senza');
  assert.deepEqual(rowIds(), [C.buyer], 'le persone chiuse non hanno bisogno di un responsabile');
  await visit('#/contatti?filtro=settimana');
  assert.deepEqual(rowIds(), [C.doctor, C.pharmacy]);
  await visit('#/contatti?stato=fissata');
  assert.deepEqual(rowIds(), [C.pharmacy]);
  await visit(`#/contatti?filtro=mie&stato=da_contattare`);
  assert.deepEqual(rowIds(), [C.lab]);

  await visit(`#/contatti?idea=${IDS.idea2}`);
  assert.deepEqual(rowIds(), [C.pharmacy, C.lab]);
  assert.match(text(outlet.querySelector('.contacts-summary')), /^2 persone per questa idea: 1 da contattare, 2 con un responsabile/);
  assert.equal(byText(outlet, '.toolbar a', 'Mie').getAttribute('href'), `#/contatti?filtro=mie&idea=${IDS.idea2}`);
  assert.equal(byText(outlet, '.toolbar a', 'Mie').getAttribute('aria-current'), null);
  assert.equal(byText(outlet, '.toolbar a', 'Tutte').getAttribute('aria-current'), 'true');
  assert.equal(byText(outlet, 'a.btn', 'Aggiungi una persona').getAttribute('href'), `#/nuovo/contact?idea=${IDS.idea2}`);

  const status = byText(outlet, '.filters label', 'Stato').querySelector('select');
  change(status, 'fissata');
  await flush(10);
  assert.equal(location.hash, `#/contatti?stato=fissata&idea=${IDS.idea2}`);

  await visit('#/contatti?filtro=boh&stato=inventato&idea=non-un-id');
  assert.equal(rowIds().length, 5);
  assert.match(await visit('#/contatti?stato=chiusa&filtro=mie'), /Nessuna persona con questi filtri/);
});

test('writers change status, owner and date inline, each saved with a short message', async () => {
  const calls = [];
  fakeSave(calls);
  await visit('#/contatti');

  change(rowOf(C.buyer).querySelector('select[aria-label="Chi se ne occupa: Responsabile acquisti"]'), OTHER);
  await flush(10);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, C.buyer);
  assert.equal(calls[0].baseVersion, 1);
  assert.equal(calls[0].message, 'Chi se ne occupa: Bruno');
  assert.deepEqual(calls[0].snapshot, {
    title: 'Responsabile acquisti',
    status: 'da_contattare',
    idea_id: IDS.idea,
    data: { purpose: 'cliente', role: 'Acquisti', organization: 'Azienda Verdi', owner: OTHER },
  });
  assert.equal(store.getItem(C.buyer).data.owner, OTHER);

  change(rowOf(C.buyer).querySelector('input[type="date"]'), '2026-11-20');
  await flush(10);
  assert.equal(calls[1].baseVersion, 2);
  assert.equal(calls[1].message, `Prossimo contatto: ${format.fmtDate('2026-11-20')}`);
  assert.equal(calls[1].snapshot.data.next_date, '2026-11-20');
  assert.equal(calls[1].snapshot.data.owner, OTHER);

  change(rowOf(C.buyer).querySelector('select[aria-label="Stato: Responsabile acquisti"]'), 'contattata');
  await flush(10);
  assert.equal(calls[2].message, 'Stato: Da contattare → Contattata, in attesa');
  assert.equal(calls[2].snapshot.status, 'contattata');
  assert.equal(calls[2].snapshot.data.next_date, '2026-11-20');

  change(rowOf(C.doctor).querySelector('select[aria-label="Chi se ne occupa: Medico di base"]'), '');
  await flush(10);
  assert.equal(calls[3].message, 'Chi se ne occupa: nessuno');
  assert.equal('owner' in calls[3].snapshot.data, false);

  change(rowOf(C.doctor).querySelector('input[type="date"]'), '');
  await flush(10);
  assert.equal(calls[4].message, 'Prossimo contatto: nessuna data');
  assert.deepEqual(calls[4].snapshot.data, {});
});

test('an inline change merges with what someone else saved in the meantime', async () => {
  const buyer = store.getItem(C.buyer);
  const theirs = item({ ...buyer, version: 2, updated_by: OTHER, data: { ...buyer.data, next_date: '2026-12-01' } });
  const calls = [];
  api.saveItem = async (args) => {
    calls.push(args);
    if (args.baseVersion === 1) return { status: 'conflict', item: theirs };
    return { status: 'ok', item: item({ ...theirs, ...args.snapshot, version: 3 }) };
  };
  await visit('#/contatti');
  change(rowOf(C.buyer).querySelector('select[aria-label="Chi se ne occupa: Responsabile acquisti"]'), ME);
  await flush(10);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].baseVersion, 2);
  assert.equal(calls[1].snapshot.data.owner, ME);
  assert.equal(calls[1].snapshot.data.next_date, '2026-12-01');
  assert.equal(store.getItem(C.buyer).version, 3);
});

test('a failed inline save shows the error and puts back the saved value', async () => {
  api.saveItem = async () => ({ status: 'forbidden' });
  await visit('#/contatti');
  const select = rowOf(C.buyer).querySelector('select[aria-label="Chi se ne occupa: Responsabile acquisti"]');
  change(select, OTHER);
  await flush(10);
  assert.match(text(document.querySelector('.toasts')), /permessi/);
  assert.equal(rowOf(C.buyer).querySelector('select[aria-label="Chi se ne occupa: Responsabile acquisti"]').value, '');
});

test('advisors see the contacts read-only', async () => {
  store.state.user = { id: ADVISOR };
  store.setMembers(members());
  const body = await visit('#/contatti');
  assert.equal(outlet.querySelectorAll('.contacts-table select, .contacts-table input').length, 0);
  assert.doesNotMatch(body, /Registra il colloquio|Aggiungi una persona/);
  assert.match(text(rowOf(C.doctor)), /Contattata, in attesa/);
  assert.match(text(rowOf(C.doctor)), /Anna/);
  assert.match(text(rowOf(C.doctor)), new RegExp(format.fmtDate(day(-3))));
  assert.match(text(rowOf(C.buyer)), /Nessuno/);
  await visit('#/contatti?filtro=mie');
  assert.match(text(outlet), /Nessuna persona con questi filtri/);
});

test('"Registra il colloquio" prefills the interview and links it back to the contact', async () => {
  await visit('#/contatti');
  const link = byText(rowOf(C.buyer), 'a', 'Registra il colloquio');
  assert.equal(link.getAttribute('href'), `#/nuovo/interview?contatto=${C.buyer}&stato=fatta`);
  assert.equal(byText(rowOf(C.hospital), 'a', 'Registra il colloquio'), null, 'non per le persone chiuse');

  let created = null;
  const calls = [];
  api.createItem = async ({ kind, title, status, data, ideaId }) => (created = item({ id: NEW_INTERVIEW, kind, title, status, data, idea_id: ideaId }));
  fakeSave(calls);
  await visit(link.getAttribute('href'));
  assert.equal(outlet.querySelector('.input-title').value, 'Responsabile acquisti');
  assert.equal(byText(outlet, '.field', 'Ruolo dell\'intervistato').querySelector('input').value, 'Acquisti');
  assert.equal(byText(outlet, '.field', 'Organizzazione').querySelector('input').value, 'Azienda Verdi');
  assert.equal(outlet.querySelector('select option[value="analizzata"]').parentElement.value, 'fatta');
  const notes = byText(outlet, '.field', 'Appunti').querySelector('textarea');
  notes.value = 'Usa ancora i fogli di calcolo';
  notes.dispatchEvent(new Event('input'));
  byText(outlet, 'button', 'Crea').click();
  await flush(10);

  assert.equal(created.idea_id, IDS.idea);
  assert.equal(created.status, 'fatta');
  assert.equal(created.data.role, 'Acquisti');
  assert.equal(created.data.organization, 'Azienda Verdi');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, C.buyer);
  assert.equal(calls[0].message, 'Collegata all\'intervista');
  assert.equal(calls[0].snapshot.status, 'in_contatto');
  assert.equal(calls[0].snapshot.data.interview_id, NEW_INTERVIEW);
  assert.equal(calls[0].snapshot.data.organization, 'Azienda Verdi');

  await visit('#/contatti');
  assert.equal(byText(rowOf(C.buyer), 'a', 'Intervista').getAttribute('href'), `#/elemento/${NEW_INTERVIEW}`);
  assert.equal(byText(rowOf(C.buyer), 'a', 'Registra il colloquio'), null);
});

test('linking an interview never moves a contact back in the pipeline', async () => {
  const calls = [];
  api.createItem = async ({ kind, title, status, data, ideaId }) => item({ id: NEW_INTERVIEW, kind, title, status, data, idea_id: ideaId });
  fakeSave(calls);
  await visit(`#/nuovo/interview?contatto=${C.hospital}`);
  const notes = byText(outlet, '.field', 'Appunti').querySelector('textarea');
  notes.value = 'Ci hanno risposto dopo mesi';
  notes.dispatchEvent(new Event('input'));
  byText(outlet, 'button', 'Crea').click();
  await flush(10);
  assert.equal(calls[0].id, C.hospital);
  assert.equal(calls[0].snapshot.status, 'chiusa');
  assert.equal(calls[0].snapshot.data.interview_id, NEW_INTERVIEW);
});

test('the dashboard lists my contacts due within a week and points writers to those without an owner', async () => {
  store.applyItem(item({ id: C.patients, kind: 'contact', idea_id: IDS.idea, title: 'Associazione pazienti', status: 'da_contattare', data: { owner: ME } }));
  store.applyItem(item({ id: C.clinic, kind: 'contact', idea_id: IDS.idea, title: 'Poliambulatorio', status: 'in_contatto', data: { owner: ME, next_date: day(2) } }));
  const body = await visit('#/');
  const todo = byText(outlet, 'section.card', 'Le tue cose da fare');
  assert.match(text(todo), /Medico di base.*in ritardo di 3 giorni/);
  assert.match(text(todo), /Poliambulatorio.*tra 2 giorni/);
  assert.match(text(todo), /Associazione pazienti.*senza data/);
  assert.doesNotMatch(body, /Laboratorio analisi/, 'tra 20 giorni non è ancora da fare');
  assert.doesNotMatch(body, /Farmacia centrale/, 'se ne occupa Bruno');
  const items = [...todo.querySelectorAll('li')].map((li) => text(li));
  assert.ok(items.findIndex((t) => t.includes('Medico di base')) < items.findIndex((t) => t.includes('Associazione pazienti')));
  const unowned = byText(todo, 'a', 'senza responsabile');
  assert.equal(text(unowned), '1 persona senza responsabile');
  assert.equal(unowned.getAttribute('href'), '#/contatti?filtro=senza');

  store.state.user = { id: ADVISOR };
  store.setMembers(members());
  await visit('#/');
  assert.equal(byText(outlet, 'a', 'senza responsabile'), null);
});

test('the idea page links to the contacts page filtered by that idea', async () => {
  await visit(`#/idea/${IDS.idea}/interviste`);
  assert.equal(byText(outlet, 'a.btn', 'Apri in Contatti').getAttribute('href'), `#/contatti?idea=${IDS.idea}`);
  await visit(`#/idea/${IDS.idea2}/interviste`);
  assert.ok(byText(outlet, 'a.btn', 'Apri in Contatti'));
});

test('online research is marked as such in lists and pages, and has its own filter', async () => {
  store.applyItem(item({ id: RESEARCH, kind: 'interview', title: 'Forum di settore', status: 'fatta', idea_id: IDS.idea, data: { source: 'ricerca', date: day(-1) } }));
  await visit('#/interviste');
  const row = byText(outlet, 'tbody tr', 'Forum di settore');
  assert.equal(text(row.querySelector('.badge')), 'Ricerca online');
  assert.equal(byText(outlet, 'tbody tr', 'Azienda Rossi').querySelector('.badge-warn'), null);

  let body = await visit('#/interviste?tipo=colloquio');
  assert.match(body, /Azienda Rossi/);
  assert.doesNotMatch(body, /Forum di settore/);
  body = await visit('#/interviste?tipo=ricerca');
  assert.match(body, /Forum di settore/);
  assert.doesNotMatch(body, /Azienda Rossi/);
  change(byText(outlet, '.filters label', 'Tipo').querySelector('select'), 'colloquio');
  await flush(10);
  assert.equal(location.hash, '#/interviste?tipo=colloquio');

  body = await visit(`#/elemento/${RESEARCH}`);
  assert.equal(text(outlet.querySelector('.page-header .badge')), 'Ricerca online');
  assert.match(body, /Ricerca online, senza parlare con nessuno/);
  body = await visit(`#/elemento/${IDS.interview}`);
  assert.equal(outlet.querySelector('.page-header .badge-warn'), null);
  assert.match(body, /Colloquio con una persona/, 'senza tipo è un colloquio');

  await visit(`#/idea/${IDS.idea}/interviste`);
  assert.ok(byText(outlet, 'tbody tr', 'Forum di settore').querySelector('.badge'));
});

test('a new interview is a conversation unless online research is chosen', async () => {
  let created = null;
  api.createItem = async ({ kind, title, status, data, ideaId }) => (created = item({ id: NEW_INTERVIEW, kind, title, status, data, idea_id: ideaId }));
  await visit(`#/nuovo/interview?idea=${IDS.idea}`);
  const type = byText(outlet, '.field', 'Tipo').querySelector('select');
  assert.equal(type.value, 'colloquio');
  assert.deepEqual([...type.options].map((o) => o.value), ['colloquio', 'ricerca']);
  change(type, 'ricerca');
  outlet.querySelector('.input-title').value = 'Recensioni online';
  outlet.querySelector('.input-title').dispatchEvent(new Event('input'));
  byText(outlet, 'button', 'Crea').click();
  await flush(10);
  assert.equal(created.data.source, 'ricerca');
});

test('only conversations count as evidence on the dashboard, the idea cards and the roadmap', () => {
  const before = dashboard.dashboardData();
  const cardsBefore = ideasView.ideaCounts(IDS.idea).interviews;
  store.applyItem(item({ id: RESEARCH, kind: 'interview', title: 'Forum di settore', status: 'fatta', idea_id: IDS.idea, data: { source: 'ricerca', date: day(-1), commitment: 'pilota' } }));
  const after = dashboard.dashboardData();
  assert.equal(after.recentInterviews.length, before.recentInterviews.length);
  assert.equal(after.strong.length, before.strong.length);
  assert.equal(ideasView.ideaCounts(IDS.idea).interviews, cardsBefore);
  store.applyItem(item({ id: NEW_INTERVIEW, kind: 'interview', title: 'Studio Bianchi', status: 'fatta', idea_id: IDS.idea, data: { source: 'colloquio', date: day(-1), commitment: 'pilota' } }));
  assert.equal(dashboard.dashboardData().recentInterviews.length, before.recentInterviews.length + 1);
  assert.equal(dashboard.dashboardData().strong.length, before.strong.length + 1);
  assert.equal(ideasView.ideaCounts(IDS.idea).interviews, cardsBefore + 1);

  const idea = store.getItem(IDS.idea);
  const many = (source) => Array.from({ length: 20 }, (_, i) => ({ id: `i${i}`, status: 'analizzata', data: { source, commitment: 'pagamento' } }));
  const step = (state, key) => state.phases.flatMap((p) => p.steps).find((s) => s.step.key === key);
  const research = roadmap.roadmapState(idea, { interviews: many('ricerca') });
  assert.equal(step(research, 'interviste').suggested, false);
  assert.equal(step(research, 'interviste').progress, '0 su 20');
  assert.equal(step(research, 'sintesi').suggested, false);
  assert.equal(step(research, 'impegni').suggested, false);
  const talks = roadmap.roadmapState(idea, { interviews: many(undefined) });
  assert.equal(step(talks, 'interviste').suggested, true);
  assert.equal(step(talks, 'sintesi').suggested, true);
  assert.equal(step(talks, 'impegni').suggested, true);
});
