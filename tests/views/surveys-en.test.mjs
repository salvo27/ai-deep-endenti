import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, text, byText, typeInto } from '../setup/dom.mjs';
import { ADVISOR, IDS, ME, OTHER, boardItems, item, members } from '../setup/fixtures.mjs';
import { italianWords } from '../setup/italian.mjs';

// On a device in English: the language is decided when the site loads, so every module of the site is imported after
// the choice. The survey data is in English, so whatever Italian is left can only come from the code.
useLanguage('en');

let api;
let store;
let router;
let app;
let schema;
let i18n;
let checks;
let time;
let original;
let outlet;
let saves;
let created;
let deleted;
let copied;

const S = {
  open: 'eeeeeeee-0000-4000-8000-000000000001',
  draft: 'eeeeeeee-0000-4000-8000-000000000002',
  other: 'eeeeeeee-0000-4000-8000-000000000003',
  missing: 'eeeeeeee-0000-4000-8000-000000000099',
};
const IDEA3 = '11111111-1111-4111-8111-111111111113';
const TOKEN = 'TokenOfTheOpenSurvey01';
const LOOK = { theme: 'automatico', accent: '#3b4bc8' };
const freq = { points: 5, min_label: 'Never', max_label: 'Always', labels: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'] };

const QUESTIONS = [
  { id: 'role', type: 'scelta', label: 'What is your job?', required: false, role: 'persona', options: [{ id: 'a', label: 'Nurse' }, { id: 'b', label: 'Doctor' }], allow_other: true, prefer_not: true },
  { id: 'last', type: 'scelta', label: 'The last time it happened, when was it?', required: false, role: 'problema', options: [{ id: 'week', label: 'This week' }, { id: 'month', label: 'This month' }], allow_other: false, prefer_not: false },
  { id: 'f1', type: 'scala', label: 'How often do you swap shifts?', required: false, role: 'problema', scale: freq },
  { id: 'f2', type: 'scala', label: 'How often do you stay late?', required: false, role: 'problema', scale: freq },
  { id: 'f3', type: 'scala', label: 'How often do you skip your break?', required: false, role: 'problema', scale: freq },
  { id: 'times', type: 'numero', label: 'In the last 4 weeks, how many times?', required: true, role: 'problema', number: { min: 0 } },
  { id: 'story', type: 'lunga', label: 'Tell us about the last time', required: false, role: 'problema' },
  { id: 'mail', type: 'email', label: 'Your email', required: false, role: 'contatto' },
];

function surveyItems() {
  const data = (over) => ({ intro: 'We are a group of students. We are not selling anything.', privacy: 'Short privacy notice.', thanks: 'Thank you!', layout: 'una', progress: 'contatore', show_time: true, appearance: LOOK, ...over });
  return [
    item({ id: IDEA3, kind: 'idea', title: 'Idea gamma', status: 'nuova', data: { owner: ME } }),
    item({ id: S.open, kind: 'survey', title: 'Shifts on the ward', status: 'aperto', idea_id: IDS.idea, data: data({ token: TOKEN, questions: QUESTIONS }) }),
    item({ id: S.draft, kind: 'survey', title: 'Draft about shifts', status: 'bozza', idea_id: IDS.idea, data: data({ questions: QUESTIONS.slice(0, 2) }) }),
    item({ id: S.other, kind: 'survey', title: 'Beta poll', status: 'chiuso', idea_id: IDS.idea2, data: data({ token: 'TokenOfTheClosedSurvey', questions: [] }) }),
  ];
}

function responses() {
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
    r(1, { answers: { role: 'a', last: 'week', f1: 4, f2: 4, f3: 4, times: 3, story: 'I swapped shifts three times in one week.' }, email: 'person1@example.com', recontact: true }),
    r(2, { answers: { role: 'b', last: 'month', f1: 2, f2: 3, f3: 5, times: 0, story: 'The ward was short and I stayed until the evening.' }, email: 'PERSON1@example.com', recontact: true, device: 'computer', duration_seconds: 400 }),
    r(3, { answers: { 'role:altro': 'Technician', last: 'week', f1: 5, f2: 1, f3: 2, times: 8, story: 'Ok' }, email: 'known@example.com', recontact: true }),
    r(4, { answers: { role: 'a', last: 'month', f1: 1, f2: 2, f3: 3, times: 1, story: 'I asked a colleague to swap.' }, email: 'person4@example.com', recontact: false }),
    r(5, { answers: { role: 'a', last: 'week' }, completed: false, duration_seconds: null }),
    r(6, { answers: { role: 'b' }, completed: false, duration_seconds: null, device: null }),
  ];
}

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  schema = await import('../../assets/js/schema.js');
  i18n = await import('../../assets/js/i18n/index.js');
  checks = await import('../../assets/js/survey-checks.js');
  time = await import('../../assets/js/public/survey-time.js');
  original = { ...api };
  router.clearRoutes();
  app.registerRoutes();
});

function useMe(userId = ME) {
  store.resetStore();
  store.state.user = { id: userId };
  store.setMembers(members());
  [...boardItems(), ...surveyItems()].forEach((i) => store.applyItem(i));
}

beforeEach(async () => {
  useMe();
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
  document.body.querySelectorAll('dialog, .toasts').forEach((d) => d.remove());
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

const dialog = () => document.querySelector('dialog');
const toasts = () => text(document.querySelector('.toasts'));
const card = (id) => outlet.querySelector(`.sq-card[data-id="${id}"]`);

async function answerDialog(label) {
  await flush(2);
  byText(dialog(), 'button', label).click();
  await flush(5);
}

function choose(input) {
  input.checked = true;
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
}

// Italian words in the parts of a page that only the survey pages write: headings, field names, help, reasons, badges
// and the labels read by screen readers. Option names, statuses and warnings come from other modules.
const OWN = '.tabs, h2, .field-label, .field-help, .sv-reason, legend, .badge-ok, .save-bar, .sv-count, .sv-sample, .empty, .banner';
// The colour names, the concept buttons and the header of a dialog come from other modules.
const FOREIGN = '.sv-swatch, .concept-btn, .modal-header';
function ownItalian(root = outlet) {
  const parts = [...root.querySelectorAll(OWN)].map((el) => {
    const copy = el.cloneNode(true);
    copy.querySelectorAll(FOREIGN).forEach((x) => x.remove());
    return copy.textContent;
  });
  for (const el of root.querySelectorAll('[aria-label], [placeholder], [title]')) {
    if (el.closest(FOREIGN)) continue;
    for (const name of ['aria-label', 'placeholder', 'title']) parts.push(el.getAttribute(name) || '');
  }
  return italianWords(parts.join('\n'));
}

// Every sentence of the Italian texts of the survey pages: none may show on an English page.
function italianSentences() {
  const out = [];
  const walk = (it, en) => {
    if (typeof it === 'string') {
      if (/\s/.test(it) && it !== en) out.push(it);
    } else if (it && typeof it === 'object') for (const key of Object.keys(it)) walk(it[key], en?.[key]);
  };
  walk(i18n.textsFor('it').surveyEditor, i18n.textsFor('en').surveyEditor);
  return out;
}

function assertNoItalianSentence(where) {
  const page = text(document.body);
  const found = italianSentences().filter((sentence) => page.includes(sentence));
  assert.deepEqual(found, [], where);
}

describe('pagine dei questionari in inglese', () => {
  it('il sito è in inglese e i testi dei questionari hanno la loro area', () => {
    assert.equal(i18n.language, 'en');
    assert.ok(Object.keys(i18n.tx.surveyEditor).length > 0, 'area surveyEditor vuota');
  });
});

describe('elenco dei questionari in inglese', () => {
  it('la pagina Questionari ha titolo, filtro e schede in inglese', async () => {
    await visit('#/questionari');
    await flush(5);
    assert.equal(text(outlet.querySelector('.page-header h1')), 'Surveys');
    assert.match(text(outlet.querySelector('.page-header')), /The surveys of every idea, with status, complete responses and the link to share\./);
    assert.ok(byText(outlet, '.page-header button', 'New survey'));
    assert.equal(text(outlet.querySelector('.filters .field-label')), 'Idea');
    assert.equal(outlet.querySelector('.filters option[value=""]').textContent, 'All');
    const open = text(outlet.querySelector(`.sv-card[data-id="${S.open}"]`));
    assert.match(open, /Idea: Idea alfa/);
    assert.match(open, /8 questions ·/);
    assert.match(open, /Complete responses: 4/);
    assert.match(text(outlet.querySelector(`.sv-card[data-id="${S.draft}"]`)), /2 questions ·.*Never opened.*The link is created when you open it\./);
    assert.match(text(outlet.querySelector(`.sv-card[data-id="${S.other}"]`)), /0 questions ·.*Complete responses: 1.*The link says the survey is closed\./);
    assert.deepEqual(ownItalian(), []);
    assertNoItalianSentence('elenco');
  });

  it('il conteggio delle risposte dice quando arriva e quando non è disponibile', async () => {
    let release;
    api.surveyFunnel = (id) => (id === S.open ? new Promise((resolve) => { release = resolve; }) : Promise.reject(new Error('offline')));
    await visit('#/questionari');
    assert.match(text(outlet.querySelector(`.sv-card[data-id="${S.open}"] .sv-count`)), /^Complete responses: …$/);
    assert.equal(text(outlet.querySelector(`.sv-card[data-id="${S.other}"] .sv-count`)), 'Complete responses: …');
    release({ views: 1, starts: 1, partial: 0, completed: 0 });
    await flush(5);
    assert.equal(text(outlet.querySelector(`.sv-card[data-id="${S.open}"] .sv-count`)), 'Complete responses: 0');
    assert.equal(text(outlet.querySelector(`.sv-card[data-id="${S.other}"] .sv-count`)), 'Responses not available');
  });

  it('copiare il link lo conferma, e se non riesce lo lascia selezionato', async () => {
    await visit('#/questionari');
    const open = () => outlet.querySelector(`.sv-card[data-id="${S.open}"]`);
    byText(open(), 'button', 'Copy link').click();
    await flush(2);
    assert.deepEqual(copied, [`https://board.example/q-indaco.html#${TOKEN}`]);
    assert.match(toasts(), /Link copied\./);
    assert.equal(byText(open(), 'a', 'Open').getAttribute('target'), '_blank');

    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } }, configurable: true });
    byText(open(), 'button', 'Copy link').click();
    await flush(2);
    assert.match(toasts(), /Couldn't copy: the link is selected, copy it by hand\./);
    assert.equal(open().querySelector('.sv-link-input').getAttribute('aria-label'), 'Public link of the survey');
  });

  it('senza questionari, o senza questionari per l idea scelta, lo dice in inglese', async () => {
    await visit(`#/questionari?idea=${IDEA3}`);
    assert.equal(text(outlet.querySelector('.empty')), 'No surveys for this idea.');
    store.resetStore();
    store.state.user = { id: ME };
    store.setMembers(members());
    boardItems().forEach((i) => store.applyItem(i));
    await visit('#/questionari');
    assert.equal(text(outlet.querySelector('.empty')), 'No surveys yet. You create them from the page of each idea, in the Validation tab.');
  });

  it('nella pagina dell idea la scheda Questionari spiega a cosa servono', async () => {
    await visit(`#/idea/${IDS.idea}/questionari`);
    const tab = outlet.querySelector('.sv-card').closest('.stack');
    assert.equal(text(tab.querySelector('h2')).replace(/\s+$/, ''), 'Surveys');
    assert.match(text(tab), /They are mostly for finding people to interview: a few questions about who is answering, at most ten about the problem in the past tense, an optional email\. No solution, no "would you" questions, no prizes\./);
    assert.ok(byText(tab, 'button', 'New survey'));
    assert.deepEqual(ownItalian(tab), []);
    await visit(`#/idea/${IDEA3}/questionari`);
    assert.match(text(outlet), /No surveys yet\. The first one starts from a template already set up following the handbook\./);
  });
});

describe('nuovo questionario in inglese', () => {
  it('dalla pagina dell idea il titolo proposto è Survey: e la creazione lo conferma', async () => {
    await visit(`#/idea/${IDS.idea}/questionari`);
    byText(outlet, 'button', 'New survey').click();
    await flush(2);
    const modal = dialog();
    assert.equal(modal.getAttribute('aria-label'), 'New survey');
    assert.match(text(modal), /It starts from a template that follows the handbook: introduction, privacy, a few sample questions to adapt and an optional email\. The survey stays in draft until you open it\./);
    assert.equal(modal.querySelector('input').value, 'Survey: Idea alfa');
    assert.deepEqual([...modal.querySelectorAll('.field-label')].map(text), ['Title', 'Linked experiment (optional)']);
    const experiment = modal.querySelector('select[aria-label="Linked experiment"]');
    assert.equal(experiment.options[0].textContent, 'None');
    assert.deepEqual(ownItalian(modal), []);
    await answerDialog('Create');
    assert.equal(created.length, 1);
    assert.equal(created[0].status, 'bozza', 'lo stato salvato resta lo stesso');
    assert.equal(created[0].message, 'New survey from the template');
    assert.match(toasts(), /Survey created from the template: adapt the parts in square brackets\./);
  });

  it('dalla pagina Questionari si sceglie l idea e il titolo la segue', async () => {
    await visit('#/questionari');
    byText(outlet, 'button', 'New survey').click();
    await flush(2);
    const modal = dialog();
    assert.deepEqual([...modal.querySelectorAll('.field-label')].map(text), ['Title', 'Idea', 'Linked experiment (optional)']);
    const idea = modal.querySelector('select[aria-label="Idea"]');
    assert.equal(idea.options[0].textContent, 'Choose the idea');
    assert.equal(modal.querySelector('input').value, '');
    idea.value = IDS.idea;
    idea.dispatchEvent(new window.Event('change'));
    assert.equal(modal.querySelector('input').value, 'Survey: Idea alfa');
    await answerDialog('Cancel');
    assert.equal(created.length, 0);
  });
});

describe('pagina del questionario in inglese', () => {
  it('ha schede, intestazione e azioni in inglese', async () => {
    store.state.commentCounts.set(S.open, 3);
    await visit(`#/questionario/${S.open}`);
    assert.deepEqual([...outlet.querySelectorAll('.tabs .tab')].map(text), ['Questions', 'Appearance and settings', 'Share', 'Responses']);
    assert.equal(outlet.querySelector('.tabs').getAttribute('aria-label'), 'Survey tabs');
    assert.equal(text(outlet.querySelector('.kind-eyebrow')), 'Survey for Idea alfa');
    const pdf = byText(outlet, '.page-actions button', 'Export PDF');
    assert.equal(pdf.getAttribute('title'), 'Questions and possible answers, without results');
    assert.ok(byText(outlet, '.page-actions a', 'Versions'));
    const comments = byText(outlet, '.page-actions a', 'Comments (3)');
    assert.equal(comments.getAttribute('title'), 'Comments on this survey');
    assert.ok(outlet.querySelector('.page-actions button[title="Archive"]'));
    store.state.commentCounts.set(S.open, 0);
    await visit(`#/questionario/${S.open}/condividi`);
    assert.ok(byText(outlet, '.page-actions a', 'Comments'));
    assert.equal(byText(outlet, '.page-actions a', 'Comments (0)'), null);
  });

  it('un questionario che non c è, o nel cestino, lo dice in inglese', async () => {
    await visit(`#/questionario/${S.missing}`);
    assert.match(text(outlet), /Survey not found\./);
    store.applyItem(item({ ...store.getItem(S.draft), version: 2, deleted_at: '2026-10-20T10:00:00Z' }));
    await visit(`#/questionario/${S.draft}`);
    assert.match(text(outlet.querySelector('.banner-warn')), /^This survey is in the trash\. Go to the trash$/);
  });

  it('esportare il PDF con modifiche non salvate avvisa che mostra l ultima versione salvata', async () => {
    const savedPrint = window.print;
    window.print = () => {};
    try {
      await visit(`#/questionario/${S.draft}/domande`);
      card('role').querySelector('[data-action="toggle"]').click();
      await flush();
      typeInto(card('role').querySelector('[data-focus="label-role"]'), 'What is your job today?');
      byText(outlet, '.page-actions button', 'Export PDF').click();
      await flush(2);
      assert.match(toasts(), /There are unsaved changes: the PDF shows the last saved version\./);
    } finally {
      window.dispatchEvent(new window.Event('afterprint'));
      window.print = savedPrint;
    }
  });

  it('uscire con modifiche non salvate chiede conferma in inglese', async () => {
    await visit(`#/questionario/${S.draft}/domande`);
    card('role').querySelector('[data-action="toggle"]').click();
    await flush();
    typeInto(card('role').querySelector('[data-focus="label-role"]'), 'What is your job now?');
    const leaving = router.render(`#/questionario/${S.draft}/aspetto`);
    await flush(2);
    assert.equal(dialog().getAttribute('aria-label'), 'Leave without saving?');
    assert.match(text(dialog()), /You have unsaved changes in this tab\./);
    byText(dialog(), 'button', 'Leave').click();
    await leaving;
    await flush();
    assert.equal(card('role'), null, 'si passa ad Aspetto');
  });
});

describe('scheda Condividi in inglese', () => {
  it('stato, aiuto e link si leggono in inglese, e aprire salva un messaggio in inglese', async () => {
    await visit(`#/questionario/${S.draft}/condividi`);
    assert.deepEqual([...outlet.querySelectorAll('.survey-share h2')].map(text), ['Status', 'Public link']);
    assert.equal(outlet.querySelector('.survey-share [role="group"]').getAttribute('aria-label'), 'Survey status');
    assert.match(text(outlet), /Being prepared: the link does not accept responses\./);
    assert.match(text(outlet), /The link is created when you open the survey\./);
    assert.deepEqual(ownItalian(), []);

    outlet.querySelector('.sv-status[data-status="aperto"]').click();
    await flush(5);
    assert.equal(saves[0].snapshot.status, 'aperto');
    assert.equal(saves[0].message, `Status: ${schema.statusLabel('survey', 'bozza')} → ${schema.statusLabel('survey', 'aperto')}`);
    const body = text(outlet);
    assert.match(body, /Anyone with the link can respond\./);
    assert.match(body, /Whoever opens the link answers without an account\. Share it where the people you are looking for are\. The preview in messages \(WhatsApp, Telegram, email\) takes the colour chosen in Appearance and settings\./);
    assert.match(body, /Useful if the link ended up where it should not have: the old one stops working\./);
    assertNoItalianSentence('condividi aperto');

    outlet.querySelector('.sv-status[data-status="chiuso"]').click();
    await flush(5);
    assert.match(text(outlet), /No more responses are accepted\./);
    assert.equal(text(outlet.querySelector('.sv-closed')), `The survey is “${schema.statusLabel('survey', 'chiuso')}”: anyone who opens the link now sees that it is closed. Open it to collect responses.`);
  });

  it('cambiare il link chiede conferma e salva un messaggio in inglese', async () => {
    await visit(`#/questionario/${S.open}/condividi`);
    byText(outlet, 'button', 'Change link').click();
    await flush(2);
    assert.equal(dialog().getAttribute('aria-label'), 'Change the link?');
    assert.match(text(dialog()), /The current link will stop working: anyone who already has it will see that the survey was not found\. The responses already received stay\./);
    await answerDialog('Change link');
    assert.equal(saves.length, 1);
    assert.equal(saves[0].message, 'Link changed');
    assert.match(toasts(), /Link changed/);
  });

  it('aprire con parti ancora da sistemare chiede in inglese, senza bloccare', async () => {
    store.applyItem(item({ ...store.getItem(S.draft), version: 2, data: { ...store.getItem(S.draft).data, intro: 'We are [names].' } }));
    await visit(`#/questionario/${S.draft}/condividi`);
    outlet.querySelector('.sv-status[data-status="aperto"]').click();
    await flush(2);
    assert.equal(dialog().getAttribute('aria-label'), 'Open anyway?');
    assert.match(text(dialog().querySelector('.modal-body')), /^Some things still need fixing: .+\. Whoever opens the link will see them as they are\.$/);
    await answerDialog('Open anyway');
    assert.equal(saves[0].snapshot.status, 'aperto');
  });

  it('chi non può scrivere vede il link senza poterlo cambiare', async () => {
    useMe(ADVISOR);
    await visit(`#/questionario/${S.open}/condividi`);
    assert.equal(byText(outlet, 'button', 'Change link'), null);
    assert.equal(outlet.querySelector('.sv-status'), null);
    assert.ok(byText(outlet, '.sv-link button', 'Copy'));
  });
});

const field = (root, label) => [...root.querySelectorAll('.field')].find((el) => text(el.querySelector('.field-label')) === label) || null;
const labels = (root) => [...root.querySelectorAll('.field-label')].map(text);
const aria = (root) => [...root.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label'));

describe('scheda Domande in inglese', () => {
  it('il riepilogo conta le domande in inglese', async () => {
    for (const [id, counts] of [
      [S.open, '8 questions · 1 about the respondent · 6 about the problem · 1 open · '],
      [S.draft, '2 questions · 1 about the respondent · 1 about the problem · 0 open · '],
      [S.other, '0 questions · 0 about the respondent · 0 about the problem · 0 open · '],
    ]) {
      await visit(`#/questionario/${id}/domande`);
      const minutes = time.minutesLabel(time.estimateMinutes(store.getItem(id).data));
      assert.equal(text(outlet.querySelector('.sq-counts')), `${counts}Estimated time: ${minutes}`, id);
    }
    assert.match(text(outlet.querySelector('.sq-list')), /^No questions\.$/);
  });

  it('le parti del questionario, la barra di salvataggio e la nuova domanda sono in inglese', async () => {
    await visit(`#/questionario/${S.open}/domande`);
    assert.deepEqual([...outlet.querySelectorAll('.survey-editor h2')].map(text), ['Introduction', 'Privacy notice', 'Questions', 'Final message', 'Message for those who want to be contacted']);
    const body = text(outlet);
    for (const hint of [
      'Replace the parts in square brackets. Name the university only if it really sponsors or approves the project: making it look like official research is misleading.',
      'About 150 words: who you are, why you collect the data, which data, anonymity, how long you keep it, rights and a contact. It is a template, not legal advice.',
      'Seen by those who leave no email or do not ask to be contacted: a thank you and, if you like, a way to write to you.',
      'Seen by those who leave their email and tick the box to be contacted again: what happens next. Below, the page shows the address they wrote, so they notice if they got it wrong. Empty: the final message is used.',
    ]) assert.ok(body.includes(hint), hint);
    assert.equal(text(outlet.querySelector('.sq-add .field-label')), 'New question');
    assert.equal(outlet.querySelector('.sq-add select').getAttribute('aria-label'), 'Type of the new question');
    assert.ok(byText(outlet, '.sq-add button', 'Add'));
    const note = outlet.querySelector('.save-bar input');
    assert.equal(note.getAttribute('placeholder'), 'Describe the change (optional)');
    assert.equal(note.getAttribute('aria-label'), 'Change message');
    assert.ok(byText(outlet, '.save-bar button', 'Save'));
    assert.deepEqual(ownItalian(), []);
    assertNoItalianSentence('domande');
  });

  it('l informativa con parti tra parentesi quadre è da completare', async () => {
    store.applyItem(item({ ...store.getItem(S.draft), version: 2, data: { ...store.getItem(S.draft).data, privacy: 'We are [names].' } }));
    await visit(`#/questionario/${S.draft}/domande`);
    const badge = outlet.querySelector('.sq-text .badge-warn');
    assert.equal(text(badge), 'To complete');
    assert.equal(badge.hidden, false);
  });

  it('ogni domanda chiusa mostra numero, argomento, obbligatoria e strumenti in inglese', async () => {
    await visit(`#/questionario/${S.open}/domande`);
    assert.deepEqual([...outlet.querySelectorAll('.sq-num')].map(text), ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8']);
    for (const [id, role] of [['role', 'Respondent'], ['last', 'Problem'], ['mail', 'Contact']]) assert.match(text(card(id).querySelector('.sq-meta')), new RegExp(` · ${role}$`), id);
    assert.match(text(card('times').querySelector('.sq-meta')), / · Problemrequired$/);
    assert.deepEqual(aria(card('role').querySelector('.sq-tools')), ['Move question 1 up', 'Move question 1 down', 'Duplicate question 1', 'Delete question 1']);
    assert.equal(text(card('role').querySelector('[data-action="toggle"]')), 'Edit');
    card('role').querySelector('[data-action="toggle"]').click();
    await flush();
    assert.equal(text(card('role').querySelector('[data-action="toggle"]')), 'Close');
  });

  it('una domanda senza argomento conosciuto dice Other', async () => {
    const questions = [{ ...QUESTIONS[6], id: 'free', role: 'altro' }];
    store.applyItem(item({ ...store.getItem(S.draft), version: 2, data: { ...store.getItem(S.draft).data, questions } }));
    await visit(`#/questionario/${S.draft}/domande`);
    assert.match(text(card('free').querySelector('.sq-meta')), / · Other$/);
  });

  it('la domanda aperta mostra campi e aiuti in inglese', async () => {
    await visit(`#/questionario/${S.open}/domande`);
    card('role').querySelector('[data-action="toggle"]').click();
    await flush();
    const role = card('role');
    assert.deepEqual(labels(role), ['Question text', 'Explanation (optional)', 'Type', 'Topic', 'Options', 'Option name', 'Example in the field']);
    assert.match(text(field(role, 'Topic')), /Used by the checks: at most 3 questions about the respondent and 10 about the problem\./);
    assert.match(text(role), /Required.*Better not: forcing an answer makes more people give up\./);
    assert.deepEqual(aria(role.querySelector('.sq-options')), ['Option 1', 'Move option 1 up', 'Move option 1 down', 'Remove option 1', 'Option 2', 'Move option 2 up', 'Move option 2 down', 'Remove option 2']);
    assert.ok(byText(role, 'button', 'Add an option'));
    assert.ok(byText(role, 'label.check', 'Add “Other” with a space to write'));
    assert.ok(byText(role, 'label.check', 'Add “Prefer not to say”'));
    assert.match(text(role), /“Prefer not to say” only for sensitive questions, such as age or income\./);
    const [name, example] = role.querySelectorAll('.sq-other input');
    assert.equal(name.getAttribute('placeholder'), 'Other');
    assert.equal(example.getAttribute('placeholder'), 'For example: Which one? Write the name');
    assert.deepEqual(ownItalian(role), []);
  });

  it('scala, numero, email e sezione hanno i loro campi in inglese', async () => {
    await visit(`#/questionario/${S.open}/domande`);
    for (const id of ['f1', 'times', 'mail']) card(id).querySelector('[data-action="toggle"]').click();
    await flush();
    const scale = card('f1');
    assert.deepEqual(labels(scale), ['Question text', 'Explanation (optional)', 'Type', 'Topic', 'Points', 'Suggested labels', 'One label for each point']);
    assert.deepEqual([...scale.querySelectorAll(`[data-focus="points-f1"] option`)].map(text), ['5 points', '7 points']);
    assert.match(text(field(scale, 'Points')), /5 points are almost always enough\./);
    assert.equal(scale.querySelector('[data-focus="preset-f1"] option[value=""]').textContent, 'Choose a set');
    assert.deepEqual(aria(scale.querySelector('.sq-scale-labels')), ['Label for point 1', 'Label for point 2', 'Label for point 3', 'Label for point 4', 'Label for point 5']);
    assert.deepEqual(labels(card('times')).slice(-2), ['Minimum (optional)', 'Maximum (optional)']);
    assert.match(text(card('mail')), /The email goes in a separate column and respondents can ask to be contacted again\. From the Responses tab you add it to Contacts with one click\./);
    assert.deepEqual(ownItalian(), []);

    const newType = outlet.querySelector('.sq-add select');
    newType.value = 'sezione';
    byText(outlet, '.sq-add button', 'Add').click();
    await flush();
    const section = outlet.querySelector('.sq-card.is-section');
    assert.equal(text(section.querySelector('.sq-num')), 'Section');
    assert.deepEqual(labels(section), ['Section title', 'Explanation (optional)', 'Type']);
    typeInto(section.querySelector('input[type="text"]'), '');
    assert.equal(text(section.querySelector('.sq-label')), 'Untitled');
    assert.match(text(section), /A title that splits the questions\. With one section per screen, each section is a page\./);
    typeInto(section.querySelector('input[type="text"]'), 'About you');
    section.querySelector('[data-action="toggle"]').click();
    await flush();
    const tools = outlet.querySelector('.sq-card.is-section .sq-tools');
    assert.equal(tools.querySelector('[data-action="delete"]').getAttribute('aria-label'), 'Delete the section “About you”');
  });

  it('salvare usa il messaggio in inglese, e il testo vuoto si chiama Untitled', async () => {
    await visit(`#/questionario/${S.draft}/domande`);
    card('role').querySelector('[data-action="toggle"]').click();
    await flush();
    typeInto(card('role').querySelector('[data-focus="label-role"]'), '');
    assert.equal(text(card('role').querySelector('.sq-label')), 'Untitled');
    assert.equal(text(outlet.querySelector('.save-status')), 'Unsaved changes');
    byText(outlet, '.save-bar button', 'Save').click();
    await flush(5);
    assert.equal(saves[0].message, 'Survey questions');
    assert.match(toasts(), /Survey saved\./);
  });

  it('eliminare una domanda chiede conferma in inglese', async () => {
    await visit(`#/questionario/${S.draft}/domande`);
    card('role').querySelector('[data-action="delete"]').click();
    await flush(2);
    assert.equal(dialog().getAttribute('aria-label'), 'Delete the question?');
    assert.equal(text(dialog().querySelector('.modal-body')), '“What is your job?” will disappear from the survey when you save.');
    await answerDialog('Delete');
    assert.equal(card('role'), null);
  });

  it('oltre il massimo di domande duplicare lo dice in inglese', async () => {
    const questions = Array.from({ length: 40 }, (_, i) => ({ ...QUESTIONS[6], id: `q${i}`, label: `Question ${i + 1}` }));
    store.applyItem(item({ ...store.getItem(S.draft), version: 2, data: { ...store.getItem(S.draft).data, questions } }));
    await visit(`#/questionario/${S.draft}/domande`);
    card('q0').querySelector('[data-action="duplicate"]').click();
    await flush();
    assert.match(toasts(), /At most 40 questions\./);
  });

  it('una versione salvata da altri mentre modifico lo dice in inglese', async () => {
    await visit(`#/questionario/${S.draft}/domande`);
    card('role').querySelector('[data-action="toggle"]').click();
    await flush();
    typeInto(card('role').querySelector('[data-focus="label-role"]'), 'What is your job today?');
    store.applyItem(item({ ...store.getItem(S.draft), version: 2, updated_by: OTHER, title: 'Title changed by Bruno' }));
    await flush();
    assert.match(text(outlet), /Bruno saved a new version while you were editing\. When you save I will merge your changes and only ask you where they overlap\./);
  });

  it('chi non può scrivere legge in sola lettura', async () => {
    useMe(ADVISOR);
    for (const tab of ['domande', 'aspetto']) {
      await visit(`#/questionario/${S.open}/${tab}`);
      assert.equal(text(outlet.querySelector('fieldset.sv-readonly legend')), 'Read only', tab);
    }
  });
});

describe('scheda Aspetto e impostazioni in inglese', () => {
  it('impostazioni, aspetto e immagini sono in inglese, con le scelte consigliate e i loro motivi', async () => {
    await visit(`#/questionario/${S.open}/aspetto`);
    assert.deepEqual([...outlet.querySelectorAll('.survey-settings h2')].map(text), ['Settings', 'Appearance', 'Start screen image', 'Thank you image']);
    assert.deepEqual(labels(outlet), ['Title', 'Linked experiment (optional)', 'Layout', 'Progress', 'Theme', 'Colour', 'Preview']);
    assert.match(text(field(outlet, 'Title')), /Respondents see it too\./);
    assert.equal(field(outlet, 'Linked experiment (optional)').querySelector('option[value=""]').textContent, 'None');
    assert.equal(outlet.querySelectorAll('.badge-ok').length, 4);
    assert.ok([...outlet.querySelectorAll('.badge-ok')].every((b) => text(b) === 'recommended'));
    const body = text(outlet);
    for (const reason of [
      'On a phone people skip fewer questions, and those who give up still leave the answers they gave (Mavletova and Couper 2016).',
      'It says honestly how many questions are left; on average it does not change how many people give up, while a misleading bar makes more of them give up (Villar et al. 2013).',
      'Saying how long it takes, without underestimating it, gets more people to start and finish (Galesic and Bosnjak 2009).',
      'Light or dark like the respondent\'s phone; dark text on a light background is easier to read (Piepenbrock et al. 2013). Anyone who asked their phone for more contrast gets it with every theme.',
      'Optional, at the top above the title.',
      'Couper, Tourangeau and Kenyon 2004',
      'Optional, at the bottom of the final message',
      'Without an image, there is a light band in the chosen colour at the top, with an icon.',
      'Without an image the thank you has only text.',
    ]) assert.ok(body.includes(reason), reason);
    const minutes = time.minutesLabel(time.estimateMinutes(store.getItem(S.open).data));
    assert.equal(text(byText(outlet, 'label.check', 'Show the estimated time')), `Show the estimated time in the introduction (${minutes}) recommended`);
    assert.match(body, /Other colour/);
    assert.equal(outlet.querySelector('.sv-hex').getAttribute('aria-label'), 'Colour code');
    assert.equal(outlet.querySelector('input[type="color"]').getAttribute('aria-label'), 'Custom colour');
    assert.equal(outlet.querySelector('.sv-swatches').getAttribute('aria-label'), 'Recommended colours');
    assert.equal(byText(outlet, 'button', 'Choose an image') !== null, true);
    assert.deepEqual(ownItalian(), []);
    assertNoItalianSentence('aspetto');
  });

  it('il contrasto si legge in inglese con il colore dei pulsanti', async () => {
    await visit(`#/questionario/${S.open}/aspetto`);
    for (const [accent, buttons] of [['#3b4bc8', 'white'], ['#f5e663', 'black']]) {
      typeInto(outlet.querySelector('.sv-hex'), accent);
      const check = checks.accentCheck(accent, 'automatico');
      assert.equal(text(outlet.querySelector('.sv-contrast p')), `Text on the colour: white ${checks.fmtRatio(check.white)}, black ${checks.fmtRatio(check.black)}. Buttons will use ${buttons} text.`);
    }
  });

  it('l anteprima mostra il contatore e il pulsante in inglese, e un esempio se non c è una scelta', async () => {
    await visit(`#/questionario/${S.open}/aspetto`);
    const preview = outlet.querySelector('.sv-preview');
    assert.equal(text(preview.querySelector('.sv-preview-count')), 'Question 1 of 8');
    assert.equal(text(preview.querySelector('.sv-preview-btn')), 'Next');
    await visit(`#/questionario/${S.other}/aspetto`);
    const empty = outlet.querySelector('.sv-preview');
    assert.equal(text(empty.querySelector('.sv-preview-q')), 'Which of these best describes your situation?');
    assert.deepEqual([...empty.querySelectorAll('.sv-preview-opt')].map(text), ['First option', 'Second option']);
    assert.equal(text(empty.querySelector('.sv-preview-count')), 'Question 1 of 1');
  });

  it('caricare un immagine la descrive, la cambia e la toglie in inglese', async () => {
    const proto = window.HTMLCanvasElement.prototype;
    const saved = { bitmap: globalThis.createImageBitmap, ctx: proto.getContext, blob: proto.toBlob, url: URL.createObjectURL };
    globalThis.createImageBitmap = async () => ({ width: 400, height: 300, close() {} });
    proto.getContext = () => ({ drawImage() {} });
    proto.toBlob = function toBlob(callback) {
      callback(new Blob(['jpeg'], { type: 'image/jpeg' }));
    };
    URL.createObjectURL = () => 'blob:cover';
    api.uploadSurveyImage = async () => {};
    api.downloadSurveyImage = async () => {
      throw new Error('missing');
    };
    try {
      await visit(`#/questionario/${S.open}/aspetto`);
      const cover = outlet.querySelector('.sv-cover');
      const input = cover.querySelector('input[type="file"]');
      Object.defineProperty(input, 'files', { value: [new window.File(['x'], 'group.png', { type: 'image/png' })], configurable: true });
      input.dispatchEvent(new window.Event('change'));
      assert.equal(text(cover.querySelector('[role="status"]')), 'Uploading the image…');
      await flush(10);
      assert.equal(text(cover.querySelector('[role="status"]')), 'Image uploaded: save to use it.');
      assert.ok(byText(cover, 'button', 'Change image'));
      assert.ok(byText(cover, 'button', 'Remove'));
      const description = field(cover, 'Image description');
      assert.equal(description.querySelector('input').getAttribute('placeholder'), 'For example: our group in front of the university');
      assert.match(text(description), /Read by people who use a screen reader\. Leave it empty only if the image is decorative\./);
      assert.equal(cover.querySelector('.sv-cover-thumb img').getAttribute('src'), 'blob:cover', 'la copia appena caricata');
      const thanks = outlet.querySelectorAll('.sv-cover')[1];
      assert.match(text(thanks), /Without an image the thank you has only text\./);
      byText(outlet, '.save-bar button', 'Save').click();
      await flush(5);
      assert.equal(saves[0].message, 'Appearance and settings');
    } finally {
      Object.assign(globalThis, { createImageBitmap: saved.bitmap });
      Object.assign(proto, { getContext: saved.ctx, toBlob: saved.blob });
      URL.createObjectURL = saved.url;
    }
  });

  it('l immagine del grazie che non si scarica lo dice, e l esempio di descrizione è in inglese', async () => {
    store.applyItem(item({ ...store.getItem(S.open), version: 2, data: { ...store.getItem(S.open).data, thanks_image: { path: `${S.open}/aaaaaaaa-0000-4000-8000-000000000001.jpg`, alt: '' } } }));
    api.downloadSurveyImage = async () => {
      throw new Error('missing');
    };
    await visit(`#/questionario/${S.open}/aspetto`);
    const thanks = outlet.querySelectorAll('.sv-cover')[1];
    assert.equal(text(thanks.querySelector('.sv-cover-thumb')), 'Preview not available.');
    assert.equal(field(thanks, 'Image description').querySelector('input').getAttribute('placeholder'), 'For example: Enrico, Francesco and Salvatore');
  });
});

describe('testi dei questionari in inglese, uno per uno', () => {
  it('domande e avvisi si contano al singolare e al plurale', () => {
    const { list } = i18n.tx.surveyEditor;
    for (const [n, questions, warnings] of [
      [0, '0 questions', '0 warnings'],
      [1, '1 question', '1 warning'],
      [2, '2 questions', '2 warnings'],
      [25, '25 questions', '25 warnings'],
    ]) {
      assert.equal(list.questions(n), questions);
      assert.equal(list.warnings(n), warnings);
    }
  });
});
