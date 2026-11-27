import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush } from '../setup/dom.mjs';
import { italianWords } from '../setup/italian.mjs';
import { ADVISOR, IDS, ME, OTHER, PROJECT, PROJECT2, PROJECT3 } from '../setup/fixtures.mjs';

// Every page of the site on a device in English, with every route of app.js, menu and top bar included: nothing the
// reader sees or hears is left in Italian, in the text, in what the page writes in its fields and in the aria-label,
// title, placeholder and alt attributes alike. The data is written in English here (not the Italian samples of
// fixtures.mjs), so any Italian found can only come from the site; stored values (statuses, choices) stay Italian, as in
// the database, and the page must put them into words. The language is decided when the site loads: the modules are
// imported after the choice.
useLanguage('en');
setupDom();
const { api } = await import('../../assets/js/lib/api.js');
const store = await import('../../assets/js/store.js');
const router = await import('../../assets/js/router.js');
const app = await import('../../assets/js/app.js');
const chat = await import('../../assets/js/chat.js');
const shell = await import('../../assets/js/views/shell.js');
const { addDays, thisMonday } = await import('../../assets/js/availability.js');

const original = { ...api };
let root;
let outlet;

// --- English data ---------------------------------------------------------------------------------------------------

const ID = {
  ...IDS,
  contact: 'cccccccc-0000-4000-8000-000000000001',
  contact2: 'cccccccc-0000-4000-8000-000000000009',
  deeptech: 'cccccccc-0000-4000-8000-000000000002',
  persona: 'cccccccc-0000-4000-8000-000000000003',
  vpc: 'cccccccc-0000-4000-8000-000000000004',
  market: 'cccccccc-0000-4000-8000-000000000005',
  competitors: 'cccccccc-0000-4000-8000-000000000006',
  note: 'cccccccc-0000-4000-8000-000000000007',
  research: 'cccccccc-0000-4000-8000-000000000008',
  survey: 'eeeeeeee-0000-4000-8000-000000000001',
  draft: 'eeeeeeee-0000-4000-8000-000000000002',
  teamcanvas: 'dddddddd-1111-4000-8000-000000000001',
  equity: 'dddddddd-1111-4000-8000-000000000002',
  photo: 'dddddddd-1111-4000-8000-000000000003',
  myScore: 'dddddddd-1111-4000-8000-000000000004',
  group: 'ffffffff-0000-4000-8000-000000000001',
  general: 'abababab-0000-4000-8000-000000000001',
  topic: 'abababab-0000-4000-8000-000000000002',
};

const NOW = new Date();
const daysAgo = (days) => new Date(NOW.getTime() - days * 86400e3).toISOString();
const dayOf = (days) => daysAgo(days).slice(0, 10);

const projects = () => [
  { id: PROJECT, name: 'Northwind', role: 'admin', created_at: '2026-10-01T10:00:00Z' },
  { id: PROJECT2, name: 'Seaside', role: 'member', created_at: '2026-10-02T10:00:00Z' },
];

const members = () => [
  { user_id: ME, display_name: 'Alice', role: 'admin', color: '#4f5bd5', email: 'alice@example.com', mfa_enabled: true, last_sign_in_at: daysAgo(1) },
  { user_id: OTHER, display_name: 'Ben', role: 'member', color: '#18794e', email: 'ben@example.com', mfa_enabled: true, last_sign_in_at: null },
  { user_id: ADVISOR, display_name: 'Carla', role: 'advisor', color: '#a35a00', email: 'carla@example.com', mfa_enabled: false, last_sign_in_at: null },
];

function item(over) {
  return {
    title: 'Item',
    status: null,
    idea_id: null,
    data: {},
    version: 2,
    created_by: ME,
    updated_by: OTHER,
    created_at: '2026-10-10T10:00:00Z',
    updated_at: daysAgo(2),
    deleted_at: null,
    ...over,
  };
}

const freq = { points: 5, min_label: 'Never', max_label: 'Always', labels: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'] };
const QUESTIONS = [
  { id: 'about', type: 'sezione', label: 'About you', help: 'Two quick questions.', required: false },
  { id: 'job', type: 'scelta', label: 'What is your job?', help: '', required: true, role: 'persona', options: [{ id: 'nurse', label: 'Nurse' }, { id: 'doctor', label: 'Doctor' }], allow_other: true, prefer_not: true },
  { id: 'wards', type: 'scelte', label: 'Which wards have you worked on?', help: 'Pick all that apply.', required: false, role: 'persona', options: [{ id: 'er', label: 'Emergency' }, { id: 'icu', label: 'Intensive care' }], allow_other: false, prefer_not: false },
  { id: 'often', type: 'scala', label: 'How often do you swap shifts?', help: '', required: false, role: 'problema', scale: freq },
  { id: 'times', type: 'numero', label: 'In the last four weeks, how many times?', help: '', required: false, role: 'problema', number: { min: 0, max: 60 } },
  { id: 'shift', type: 'breve', label: 'Which shift do you like best?', help: '', required: false, role: 'problema' },
  { id: 'story', type: 'lunga', label: 'Tell us about the last swap', help: '', required: false, role: 'problema' },
  { id: 'mail', type: 'email', label: 'Your email', help: 'Only to get back to you.', required: false, role: 'contatto' },
];
const surveyData = (over) => ({
  intro: 'We are a group of students. We are not selling anything.',
  privacy: 'Short privacy notice.',
  thanks: 'Thank you for your time!',
  layout: 'una',
  progress: 'contatore',
  show_time: true,
  appearance: { theme: 'automatico', accent: '#3b4bc8' },
  questions: QUESTIONS,
  ...over,
});

const people = [
  { id: 'a', name: 'Alice', member: ME },
  { id: 'b', name: 'Ben', member: OTHER, pay: 'GB33BUKB20201555555555' },
  { id: 'e', name: 'Emma Stone', pay: 'paypal.me/emma-stone' },
];
const movement = (n, title, data, over) =>
  item({ id: `ffffffff-1111-4000-8000-00000000000${n}`, kind: 'expense', title, data: { group: ID.group, currency: 'EUR', rate: 1, ...data }, ...over });

const monday = thisMonday();
const availability = (n, author, data) =>
  item({ id: `dddddddd-0000-4000-8000-00000000000${n}`, kind: 'availability', title: 'Busy hours', created_by: author, updated_by: author, data });
const row = (id, day, start, end, area, note) => ({ id, day, start: start * 60, end: end * 60, area, ...(note ? { note } : {}) });
const timesheet = (n, author, week, data) =>
  item({ id: `cccccccc-1111-4000-8000-00000000000${n}`, kind: 'timesheet', title: 'Hours worked', created_by: author, updated_by: author, data: { week: addDays(monday, week * 7), ...data } });

const criteria = [
  { key: 'customer', label: 'Customer', description: 'We know who pays', weight: 3 },
  { key: 'market', label: 'Market', description: 'Big enough to grow', weight: 1 },
];

function englishItems() {
  return [
    item({
      id: ID.idea,
      kind: 'idea',
      title: 'Shift planner',
      status: 'validazione',
      data: {
        pitch: 'Nurses swap shifts in one tap.',
        problem: 'Swapping a shift takes an hour\nof phone calls',
        customer: 'Ward coordinators',
        solution: 'An app that finds who can cover',
        why_us: 'Two of us worked on a ward',
        technologies: ['Machine learning'],
        sector: 'Healthcare',
        owner: ME,
        competitors: 'Spreadsheets and group chats',
        risks: 'Hospitals buy slowly',
        next_step: 'Ten interviews',
        resources: 'A grant for a pilot',
        origin: 'r-ml:c-health',
        roadmap: { regole: `done|${ME}|2026-10-10T10:00:00Z`, vincoli: `skip|${OTHER}|2026-10-11T10:00:00Z` },
      },
    }),
    item({ id: ID.idea2, kind: 'idea', title: 'Food diary', status: 'nuova', data: { pitch: 'A food diary for dietitians.', owner: OTHER } }),
    item({ id: ID.canvas, kind: 'canvas', title: 'Lean Canvas: Shift planner', idea_id: ID.idea, data: { problem: 'Last minute swaps', solution: 'Swaps in one tap', uvp: 'Cover found in minutes', validated: { problem: true } } }),
    item({
      id: ID.experiment,
      kind: 'experiment',
      title: 'Will wards pay?',
      status: 'in_corso',
      idea_id: ID.idea,
      data: { customer: 'Ward coordinators', assumption: 'Coordinators pay for it', assumption_type: 'prezzo', method: 'interviste', success_criterion: 'Three of ten sign a pilot', owner: ME, start_date: '2026-09-20', end_date: '2026-10-01', result: 'Two pilots', learnings: 'Price is not the issue', decision: 'proseguire' },
    }),
    item({
      id: ID.interview,
      kind: 'interview',
      title: 'City hospital',
      status: 'fatta',
      idea_id: ID.idea,
      data: { source: 'colloquio', date: '2026-10-12', interviewer: ME, role: 'Ward coordinator', organization: 'City hospital', experiment_id: ID.experiment, pains: 'Too many phone calls', quotes: 'It happens every week', commitment: 'pilota', problem_intensity: 4, follow_up: 'Send the demo' },
    }),
    item({ id: ID.research, kind: 'interview', title: 'Report on nurse shortages', status: 'analizzata', idea_id: ID.idea, data: { source: 'ricerca', date: '2026-10-14', interviewer: OTHER, notes: 'One nurse in five works overtime' } }),
    item({
      id: ID.decision,
      kind: 'decision',
      title: 'Two finalists',
      status: 'presa',
      data: { date: '2026-10-16', context: 'We had four ideas', options: 'Keep two or keep one', decision: 'Test both ideas', rationale: 'They scored best', decided_by: [ME, OTHER], ideas: [ID.idea, ID.idea2], review_date: '2026-12-01' },
    }),
    item({ id: ID.contact, kind: 'contact', title: 'Head of nursing', status: 'da_contattare', idea_id: ID.idea, data: { purpose: 'cliente', role: 'Head of nursing', organization: 'General hospital', goal: 'Learn how swaps work', via: 'LinkedIn', owner: ME, next_date: dayOf(-3) } }),
    item({ id: ID.contact2, kind: 'contact', title: 'Hospital buyer', status: 'fissata', idea_id: ID.idea, data: { purpose: 'esperto', organization: 'Regional health office', goal: 'Understand how hospitals buy', interview_id: ID.interview } }),
    item({ id: ID.deeptech, kind: 'deeptech', title: 'Technology sheet', idea_id: ID.idea, data: { trl_now: '3', trl_target: '6', next_milestone: 'A working prototype', offer: 'prodotto', ip_owner: 'team', company_form: 'indipendente', funding: 'Regional grant' } }),
    item({ id: ID.persona, kind: 'persona', title: 'Rose, ward coordinator', idea_id: ID.idea, data: { role: 'Ward coordinator', role_type: 'paga_usa', segment: 'Public hospitals', early_adopter: 'si', gender: 'donna', age_range: '40-55', needs: 'Fewer phone calls', quote: 'I spend my evenings on the phone' } }),
    item({ id: ID.vpc, kind: 'vpc', title: 'Value map', idea_id: ID.idea, data: { segment: 'Ward coordinators', jobs: 'Cover every shift', pains: 'Last minute calls', gains: 'Free evenings', products: 'Mobile app', fit: 'Confirmed by five interviews' } }),
    item({ id: ID.market, kind: 'market', title: 'Market in Europe', idea_id: ID.idea, data: { approach: 'bottom_up', tam: 3e9, tam_basis: 'All the wards in Europe', sam: 3e8, sam_basis: 'Public hospitals', som: 9e6, som_year: 2029, som_basis: 'One region a year', sources: 'Eurostat' } }),
    item({
      id: ID.competitors,
      kind: 'competitors',
      title: 'Competitor map',
      idea_id: ID.idea,
      data: {
        gap: 'Nobody works offline',
        lessons: 'Keep it simple',
        rivals: [{ id: 'c-1', name: 'Acme Rota', type: 'diretto', x: 2, y: 8, note: 'Cheap' }, { id: 'c-2', name: 'Paper rota', type: 'indiretto' }],
        features: [{ id: 'f-1', label: 'Offline mode', importance: 'alta' }],
        cells: { 'f-1:noi': true },
        axes: { x: { label: 'Price', low: 'Expensive', high: 'Cheap' }, y: { label: 'Ease of use', low: 'Hard', high: 'Easy' } },
        us: { x: 7, y: 7 },
      },
    }),
    item({ id: ID.note, kind: 'note', title: 'Call with the hospital', idea_id: ID.idea, data: { date: '2026-10-15', body: '## Call with the hospital\n\nThey **want** a pilot in spring.\n\n- Ask about the budget\n- Send the demo' } }),
    item({ id: ID.survey, kind: 'survey', title: 'Shifts on the ward', status: 'aperto', idea_id: ID.idea, data: surveyData({ token: 'TokenOfTheOpenSurvey01' }) }),
    item({ id: ID.draft, kind: 'survey', title: 'Draft about breaks', status: 'bozza', idea_id: ID.idea, data: surveyData({ questions: QUESTIONS.slice(0, 3) }) }),
    item({ id: ID.criteria, kind: 'criteria', title: 'Criteria', data: { criteria } }),
    item({ id: ID.score, kind: 'score', title: 'Votes of Ben', created_by: OTHER, updated_by: OTHER, data: { scores: { [ID.idea]: { customer: 5, market: 2 }, [ID.idea2]: { customer: 2, market: 4 } } } }),
    item({ id: ID.myScore, kind: 'score', title: 'Votes of Alice', created_by: ME, updated_by: ME, data: { scores: { [ID.idea]: { customer: 2, market: 3 } }, notes: { [ID.idea]: 'Not sure about the market' } } }),
    item({
      id: ID.photo,
      kind: 'scoresnap',
      title: 'Before the meeting',
      created_at: daysAgo(5),
      data: {
        criteria: [{ ...criteria[0] }, { ...criteria[1], weight: 2 }],
        ideas: [{ id: ID.idea, title: 'Shift planner', status: 'esplorazione' }, { id: ID.idea2, title: 'Food diary', status: 'nuova' }],
        votes: { [OTHER]: { [ID.idea]: { customer: 3, market: 2 } } },
        names: { [OTHER]: 'Ben' },
      },
    }),
    item({
      id: ID.generator,
      kind: 'generator',
      title: 'Generator',
      data: {
        rows: [{ id: 'r-ml', label: 'Machine learning' }, { id: 'r-vision', label: 'Computer vision' }],
        cols: [{ id: 'c-health', label: 'Healthcare' }, { id: 'c-food', label: 'Food' }],
        cells: { 'r-ml:c-health': { text: 'Shift planner', potential: 3 }, 'r-vision:c-food': { text: 'Spot spoiled fruit', potential: 2 } },
      },
    }),
    item({ id: ID.trashed, kind: 'idea', title: 'Parking app', status: 'scartata', deleted_at: daysAgo(3), data: { pitch: 'Find a free parking space.' } }),
    item({ id: ID.teamcanvas, kind: 'teamcanvas', title: 'Team Canvas', data: { people: 'Alice, Ben and Carla', common_goals: 'A pilot by spring', values: 'Honesty', rules: 'We meet on Mondays' } }),
    item({
      id: ID.equity,
      kind: 'equity',
      title: 'Equity split',
      data: {
        vesting: 'Four years with a one year cliff',
        factors: [{ key: 'idea', label: 'Original idea', weight: 5 }, { key: 'work', label: 'Full time work', weight: 8 }],
        founders: [{ id: 'f-alice', name: 'Alice' }, { id: 'f-ben', name: 'Ben' }],
        scores: { 'idea:f-alice': 10, 'work:f-alice': 5, 'idea:f-ben': 2, 'work:f-ben': 8 },
      },
    }),
    item({ id: ID.group, kind: 'expensegroup', title: 'Startup costs', data: { currency: 'EUR', people, notes: 'Everything we pay for the startup' } }),
    movement(1, 'Domain and hosting', { type: 'spesa', amount: 14990, date: dayOf(40), paid_by: 'a', split: { mode: 'parti', shares: { a: 1, b: 1, e: 1 } }, category: 'software' }),
    movement(2, 'Dinner with the mentor', { type: 'spesa', amount: 9600, currency: 'USD', rate: 0.9, date: dayOf(12), paid_by: 'b', split: { mode: 'quote', shares: { a: 1, b: 2 } }, category: 'pasti', note: 'Paid with the card of Ben' }),
    movement(3, 'Tickets for the fair', { type: 'spesa', amount: 12000, date: dayOf(5), paid_by: 'e', split: { mode: 'importi', shares: { a: 4000, b: 4000, e: 4000 } }, category: 'eventi' }),
    movement(4, 'Refund', { type: 'rimborso', amount: 2500, date: dayOf(3), paid_by: 'b', split: { mode: 'parti', shares: { a: 1 } } }),
    movement(5, 'Grant prize', { type: 'entrata', amount: 30000, date: dayOf(1), paid_by: 'a', split: { mode: 'parti', shares: { a: 1, b: 1, e: 1 } } }),
    availability(1, ME, { busy: { lun: [9, 10, 11], mar: [14, 15], gio: [9, 10] }, weeks: [{ key: addDays(monday, 7), busy: { lun: [9, 10] } }] }),
    availability(2, OTHER, { busy: { lun: [8, 9], mer: [14, 15, 16], ven: [10, 11] }, until: addDays(monday, 4) }),
    availability(3, ADVISOR, { busy: { lun: [9, 10, 11, 12] }, until: addDays(monday, -3) }),
    timesheet(1, ME, -1, { pledge: 600, entries: [row('a1', 'lun', 9, 12, 'ricerca', 'Interviews with two coordinators'), row('a2', 'mer', 14, 17.5, 'prodotto')] }),
    timesheet(2, ME, 0, { entries: [row('a1', 'lun', 9, 11, 'clienti', 'Call with the clinic'), row('a2', 'mar', 14, 16, 'numeri')] }),
    timesheet(3, OTHER, -1, { pledge: 360, entries: [row('b1', 'mar', 10, 13, 'clienti', 'Calls to three companies'), row('b2', 'ven', 15, 19, 'altro')] }),
    timesheet(4, OTHER, 0, { pledge: 0, entries: [] }),
  ];
}

const revision = (over) => ({
  id: 1,
  item_id: ID.idea,
  version: 1,
  op: 'create',
  kind: 'idea',
  idea_id: null,
  title: 'Shift planner',
  status: 'nuova',
  data: {},
  changed: [],
  author_id: ME,
  message: null,
  created_at: '2026-10-17T10:00:00Z',
  ...over,
});
const ideaHistory = () => [
  revision({ id: 1, version: 1, data: { pitch: 'First pitch', problem: 'Line one' }, message: 'first version' }),
  revision({ id: 2, version: 2, op: 'update', author_id: OTHER, status: 'validazione', data: { pitch: 'Nurses swap shifts in one tap.', problem: 'Line one\nLine two', technologies: ['Machine learning'] }, changed: ['status', 'pitch', 'problem', 'technologies'], message: 'clearer problem', created_at: '2026-10-18T10:00:00Z' }),
];
// Statuses, choices, people and dates changed in an experiment.
const experimentHistory = () => [
  revision({ id: 5, item_id: ID.experiment, kind: 'experiment', idea_id: ID.idea, version: 1, title: 'Will wards pay?', status: 'pianificato', data: { assumption: 'Coordinators pay for it', method: 'landing', owner: OTHER, end_date: '2026-09-25' } }),
  revision({ id: 6, item_id: ID.experiment, kind: 'experiment', idea_id: ID.idea, version: 2, op: 'update', author_id: OTHER, title: 'Will wards pay?', status: 'in_corso', data: { assumption: 'Coordinators pay for it', method: 'interviste', owner: ME, end_date: '2026-10-01', assumption_type: 'prezzo', decision: 'proseguire' }, changed: ['status', 'method', 'owner', 'end_date', 'assumption_type', 'decision'], created_at: '2026-10-18T10:00:00Z' }),
];
const feed = () => [
  revision({ id: 12, item_id: ID.experiment, kind: 'experiment', op: 'update', idea_id: ID.idea, title: 'Will wards pay?', status: 'in_corso', changed: ['status', 'result'], author_id: OTHER, message: 'started', created_at: daysAgo(0.1) }),
  revision({ id: 11, item_id: ID.group, kind: 'expensegroup', op: 'create', title: 'Startup costs', status: null, author_id: OTHER, created_at: daysAgo(0.2) }),
  revision({ id: 10, item_id: ID.trashed, kind: 'idea', op: 'delete', title: 'Parking app', status: 'scartata', author_id: ME, created_at: daysAgo(1) }),
  ...ideaHistory().reverse(),
];

// The general chat keeps the name it was saved with: the site names it in the reader's language.
const chats = () => [
  { id: ID.general, project_id: PROJECT, title: 'Generale', is_general: true, idea_id: null, archived_at: null, created_at: '2026-10-01T10:00:00Z' },
  { id: ID.topic, project_id: PROJECT, title: 'Grants', is_general: false, idea_id: ID.idea, archived_at: null, created_at: '2026-10-05T10:00:00Z' },
];
const message = (n, author, body, over) => ({ id: `abababab-1111-4000-8000-00000000000${n}`, project_id: PROJECT, chat_id: ID.general, author_id: author, body, created_at: daysAgo(1 - n / 100), edited_at: null, deleted_at: null, reply_to: null, ...over });

const responses = () =>
  Array.from({ length: 6 }, (_, i) => ({
    id: `ffffffff-2222-4000-8000-00000000000${i + 1}`,
    survey_id: ID.survey,
    session: `aaaaaaaa-2222-4000-8000-00000000000${i + 1}`,
    answers: i > 3 ? { job: 'nurse' } : { job: i % 2 ? 'nurse' : 'doctor', ...(i === 3 ? { 'job:altro': 'Midwife' } : {}), wards: ['er'], often: (i % 5) + 1, times: i * 2, shift: 'Mornings', story: 'Last week I swapped twice and called five people.', mail: `person${i}@example.com` },
    email: i < 2 ? `person${i}@example.com` : null,
    recontact: i === 0,
    duration_seconds: i > 3 ? null : 150 + i * 20,
    device: i % 2 ? 'computer' : 'telefono',
    completed: i <= 3,
    saves: 3,
    created_at: daysAgo(6 - i),
    updated_at: daysAgo(6 - i),
  }));

function fakeApi() {
  api.listRevisions = async () => feed();
  api.itemHistory = async (id) => (id === ID.experiment ? experimentHistory() : ideaHistory());
  api.listComments = async (ids) =>
    [ids].flat().slice(0, 1).flatMap((id) => [
      { id: 'c0000000-0000-4000-8000-000000000001', item_id: id, author_id: OTHER, body: 'Good work, let us call two more wards.', created_at: '2026-10-17T10:00:00Z', ai_task: null, edited_at: null },
      { id: 'c0000000-0000-4000-8000-000000000002', item_id: id, author_id: ME, body: 'Critique: the success criterion is missing.', created_at: '2026-10-17T11:00:00Z', ai_task: 'critique', edited_at: '2026-10-17T12:00:00Z' },
    ]);
  api.commentCounts = async () => new Map([[ID.idea, 2]]);
  api.activitySince = async () => [{ author_id: ME }, { author_id: ME }, { author_id: OTHER }];
  api.activityFeed = async () => ({ revisions: feed(), comments: [] });
  api.auditLog = async () => [
    { id: 3, event: 'member_role_changed', actor_id: ME, target_id: OTHER, details: { from: 'member', to: 'advisor' }, created_at: '2026-10-17T10:00:00Z' },
    { id: 2, event: 'member_added', actor_id: ME, target_id: ADVISOR, details: { role: 'advisor' }, created_at: '2026-10-16T10:00:00Z' },
    { id: 1, event: 'project_created', actor_id: null, target_id: null, details: { name: 'Northwind' }, created_at: '2026-10-15T10:00:00Z' },
  ];
  api.listFactors = async () => [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'Phone', created_at: '2026-10-01T10:00:00Z' }];
  api.aiUsageLastDay = async () => 2;
  api.emailPrefs = async () => ({ mentions: true, weekly: false });
  api.myProfile = async () => ({ display_name: 'Alice', color: '#4f5bd5', language: 'en' });
  api.membersOverview = async () => members();
  api.myProjects = async () => projects();
  api.allProjects = async () => [
    { id: PROJECT, name: 'Northwind', created_by: ME, created_at: '2026-10-01T10:00:00Z', archived_at: null, member_count: 3, admin_count: 1 },
    { id: PROJECT2, name: 'Seaside', created_by: ME, created_at: '2026-10-02T10:00:00Z', archived_at: null, member_count: 1, admin_count: 0 },
    { id: PROJECT3, name: 'Old lab', created_by: OTHER, created_at: '2026-10-03T10:00:00Z', archived_at: '2026-11-01T10:00:00Z', member_count: 2, admin_count: 1 },
  ];
  api.platformAdmins = async () => [
    { user_id: ME, created_at: '2026-10-01T10:00:00Z', display_name: 'Alice', color: '#4f5bd5' },
    { user_id: OTHER, created_at: '2026-10-05T10:00:00Z', display_name: null, color: null },
  ];
  api.weeklyPreview = async () => null;
  api.listChats = async () => chats();
  api.chatOverview = async () => [{ chat_id: ID.general, last_message_at: daysAgo(0.5), unread: 1 }];
  api.listMessages = async (chatId) =>
    chatId === ID.general ? [message(1, OTHER, 'Hello team, the pilot starts on Monday.'), message(2, ME, 'Great, I will tell the ward.'), message(3, OTHER, 'Removed', { deleted_at: daysAgo(0.3) })] : [];
  api.getMessages = async () => [];
  api.markChatRead = async () => {};
  api.listSurveyResponses = async () => responses();
  api.surveyFunnel = async () => ({ views: 48, starts: 14, partial: 2, completed: 4 });
  api.listMentions = async () => [];
  api.downloadNoteImage = async () => null;
  api.downloadSurveyImage = async () => null;
}

function inProject(items = englishItems()) {
  store.resetStore();
  store.state.user = { id: ME, email: 'alice@example.com' };
  store.state.platformAdmin = true;
  store.setProjects(projects());
  store.setProject(projects()[0]);
  store.setMembers(members());
  items.forEach((i) => store.applyItem(i));
  store.state.commentCounts = new Map([[ID.idea, 2]]);
}

// The empty project: no items and no history.
function emptyProject() {
  inProject([]);
  store.state.commentCounts = new Map();
  api.listRevisions = async () => [];
  api.itemHistory = async () => [];
  api.listComments = async () => [];
  api.activitySince = async () => [];
  api.auditLog = async () => [];
  api.listFactors = async () => [];
  api.listChats = async () => [chats()[0]];
  api.chatOverview = async () => [];
  api.listMessages = async () => [];
  api.listSurveyResponses = async () => [];
  api.surveyFunnel = async () => ({ views: 0, starts: 0, partial: 0, completed: 0 });
}

// A platform admin with no project open: only Projects and Profile.
function noProject() {
  inProject([]);
  store.setProjects([]);
  store.setProject(null);
  store.setMembers([]);
}

// A member of the project who is not a platform admin.
function notPlatformAdmin() {
  store.state.platformAdmin = false;
}

// A project of mine where I am only an advisor: the pages without the commands to change things.
function asAdvisor() {
  store.setMembers(members().map((m) => (m.user_id === ME ? { ...m, role: 'advisor' } : m.user_id === ADVISOR ? { ...m, role: 'admin' } : m)));
}

// --- What is read on a page ------------------------------------------------------------------------------------------

const ATTRIBUTES = ['aria-label', 'title', 'placeholder', 'alt', 'abbr', 'label'];
const TYPED = new Set(['text', 'search', 'email', 'url', 'tel']);

// A part marked as written in another language (lang="it", for example the title of an Italian book) is meant to be
// read in that language, by people and by screen readers.
function foreign(top, node) {
  const marked = (node.nodeType === 1 ? node : node.parentElement)?.closest('[lang]');
  return Boolean(marked) && top.contains(marked) && !marked.getAttribute('lang').startsWith('en');
}

// Every text node on its own (adjacent elements would otherwise glue their words together), what the page wrote in
// its fields and suggests for them, and the attributes read by screen readers and shown on hover.
function readable(top) {
  const parts = [];
  const walker = document.createTreeWalker(top, window.NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (!foreign(top, node)) parts.push(node.nodeValue);
  for (const el of [top, ...top.querySelectorAll('*')]) {
    if (foreign(top, el)) continue;
    for (const name of ATTRIBUTES) if (el.getAttribute(name)) parts.push(el.getAttribute(name));
    if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && TYPED.has(el.type))) parts.push(el.value);
    if (el.tagName === 'OPTION' && el.parentElement?.tagName === 'DATALIST') parts.push(el.value);
  }
  return parts.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// Each Italian word with the text it was found in, so a failure says where to look.
function italianOn(top) {
  return readable(top).flatMap((part) => italianWords(part).map((word) => `${word}: ${part.slice(0, 120)}`));
}

// --- Every route ---------------------------------------------------------------------------------------------------

const idea = (tab = '') => `#/idea/${ID.idea}${tab ? `/${tab}` : ''}`;
const survey = (tab = '') => `#/questionario/${ID.survey}${tab ? `/${tab}` : ''}`;
const group = (tab = '') => `#/spese/${ID.group}${tab ? `/${tab}` : ''}`;

// [name, address, English text the page shows, preparation]
const PAGES = [
  ['dashboard', '#/', 'Hello, Alice'],
  ['ideas board', '#/idee', 'Shift planner'],
  ['ideas table', '#/idee?vista=tabella', 'Food diary'],
  ['idea', idea(), 'Nurses swap shifts in one tap.'],
  ['idea overview', idea('panoramica'), 'Born in the generator'],
  ['idea roadmap', idea('roadmap'), 'Done, marked by Alice'],
  ['idea analysis', idea('analisi'), 'Lean Canvas'],
  ['idea validation', idea('validazione'), 'Will wards pay?'],
  ['idea discussion', idea('discussione'), 'Good work'],
  ['idea Lean Canvas', idea('canvas'), 'Last minute swaps'],
  ['idea customers', idea('clienti'), 'Rose, ward coordinator'],
  ['idea market', idea('mercato'), 'Market in Europe'],
  ['idea deep tech', idea('deeptech'), 'Technology sheet'],
  ['idea experiments', idea('esperimenti'), 'Coordinators pay for it'],
  ['idea experiments as a Javelin Board', `${idea('esperimenti')}?vista=javelin`, 'Riskiest assumption'],
  ['idea interviews', idea('interviste'), 'Head of nursing'],
  ['idea surveys', idea('questionari'), 'Shifts on the ward'],
  ['idea notes', idea('appunti'), 'Call with the hospital'],
  ['idea votes', idea('voti'), 'Team score'],
  ['idea comments', idea('commenti'), 'Good work'],
  ['idea history', idea('storico'), 'clearer problem'],
  ['idea that does not exist', `#/idea/${ID.canvas}`, 'Idea not found'],
  ['idea in the trash', `#/idea/${ID.trashed}`, 'This idea is in the trash'],
  ['example idea', `#/idea/${store.exampleIdeas()[0].id}`, 'Overview'],
  ['Lean Canvas', `#/elemento/${ID.canvas}`, 'Last minute swaps'],
  ['experiment', `#/elemento/${ID.experiment}`, 'Riskiest assumption'],
  ['interview', `#/elemento/${ID.interview}`, 'It happens every week'],
  ['online research', `#/elemento/${ID.research}`, 'One nurse in five works overtime'],
  ['decision', `#/elemento/${ID.decision}`, 'Test both ideas'],
  ['contact', `#/elemento/${ID.contact}`, 'Learn how swaps work'],
  ['deep tech sheet', `#/elemento/${ID.deeptech}`, 'A working prototype'],
  ['buyer persona', `#/elemento/${ID.persona}`, 'I spend my evenings on the phone'],
  ['Value Proposition Canvas', `#/elemento/${ID.vpc}`, 'Free evenings'],
  ['market estimate', `#/elemento/${ID.market}`, 'All the wards in Europe'],
  ['competitor analysis', `#/elemento/${ID.competitors}`, 'Acme Rota'],
  ['note', `#/elemento/${ID.note}`, 'Ask about the budget'],
  ['item comments', `#/elemento/${ID.interview}/commenti`, 'Critique: the success criterion is missing.'],
  ['survey comments', `#/elemento/${ID.survey}/commenti`, 'Good work'],
  ['item that does not exist', '#/elemento/cccccccc-0000-4000-8000-0000000000ff', 'not found'],
  ['experiments', '#/esperimenti', 'Will wards pay?'],
  ['interviews', '#/interviste', 'City hospital'],
  ['online research list', '#/interviste?tipo=ricerca', 'Report on nurse shortages'],
  ['interviews with no match', '#/interviste?impegno=pagamento', 'No'],
  ['decisions', '#/decisioni', 'Two finalists'],
  ['contacts', '#/contatti', 'Head of nursing'],
  ['contacts without an owner', '#/contatti?filtro=senza', 'Hospital buyer'],
  ['surveys', '#/questionari', 'Shifts on the ward'],
  ['survey questions', survey(), 'What is your job?'],
  ['survey look', survey('aspetto'), 'Shifts on the ward'],
  ['survey sharing', survey('condividi'), 'TokenOfTheOpenSurvey01'],
  ['survey answers', survey('risposte'), 'Midwife'],
  ['draft survey', `#/questionario/${ID.draft}`, 'Draft about breaks'],
  ['chat list', '#/chat', 'Grants'],
  ['general chat', `#/chat/${ID.general}`, 'Hello team, the pilot starts on Monday.'],
  ['chat of an idea', `#/chat/${ID.topic}`, 'Grants'],
  ...['idea', 'canvas', 'experiment', 'interview', 'decision', 'contact', 'deeptech', 'persona', 'vpc', 'market', 'competitors', 'survey', 'note', 'teamcanvas', 'equity'].map((kind) => [
    `new ${kind}`,
    `#/nuovo/${kind}?idea=${ID.idea}`,
    null,
  ]),
  ...['idea', 'canvas', 'experiment', 'interview', 'decision', 'contact', 'deeptech', 'persona', 'vpc', 'market', 'competitors', 'survey', 'note', 'teamcanvas', 'equity'].map((kind) => [
    `edit ${kind}`,
    `#/modifica/${ID[kind]}`,
    null,
  ]),
  ['scoring', '#/valutazione', 'Shift planner'],
  ['my votes', '#/valutazione?vista=miei', 'Not sure about the market'],
  ['score snapshots', '#/valutazione?vista=fotografie', 'Before the meeting'],
  ['a score snapshot', `#/valutazione?foto=${ID.photo}`, 'Before the meeting'],
  ['scoring with discarded ideas', '#/valutazione?tutte=1', 'Shift planner'],
  ['generator', '#/generatore', 'Spot spoiled fruit'],
  ['team canvas', '#/squadra', 'A pilot by spring'],
  ['equity split', '#/squadra/quote', 'Original idea'],
  ['team availability', '#/squadra/disponibilita', 'Carla'],
  ['my availability', '#/squadra/disponibilita?vista=miei', 'Save my busy hours'],
  ['team hours', '#/squadra/ore', 'Ben'],
  ['my hours', '#/squadra/ore?vista=mie', 'Call with the clinic'],
  ['team hours of last week', `#/squadra/ore?settimana=${addDays(monday, -7)}`, 'Calls to three companies'],
  ['guide', '#/guida', 'Roadmap'],
  ['guide concepts', '#/guida/concetti', 'Lean Startup'],
  ['a concept of the guide', '#/guida/concetti?c=trl', 'TRL'],
  ['old concepts address', '#/concetti', 'Lean Startup'],
  ['history', '#/storico', 'clearer problem'],
  ['history filtered by person, kind and idea', `#/storico?autore=${OTHER}&tipo=experiment&idea=${ID.idea}`, 'Will wards pay?'],
  ['history of an idea', `#/storico/${ID.idea}`, 'first version'],
  ['difference between two versions', `#/diff/${ID.idea}/2`, 'Line two'],
  ['difference against an older version', `#/diff/${ID.idea}/2/1`, 'Line two'],
  ['difference in the statuses and choices of an experiment', `#/diff/${ID.experiment}/2`, 'Running'],
  ['history of an experiment', `#/storico/${ID.experiment}`, 'Will wards pay?'],
  ['trash', '#/cestino', 'Parking app'],
  ['members', '#/membri', 'carla@example.com'],
  ['old team address', '#/team', 'carla@example.com'],
  ['expenses', '#/spese', 'Startup costs'],
  ['expense movements', group(), 'Dinner with the mentor'],
  ['expense balances', group('saldi'), 'Emma Stone'],
  ['expense statistics', group('statistiche'), 'Emma Stone'],
  ['expense group settings', group('gruppo'), 'Everything we pay for the startup'],
  ['profile', '#/profilo', 'Alice'],
  ['projects', '#/progetti', 'Old lab'],
  ['projects for who is not a platform admin', '#/progetti', 'Projects', notPlatformAdmin],
  ['projects with no project open', '#/progetti', 'Old lab', noProject],
  ['profile with no project open', '#/profilo', 'Alice', noProject],
  ['members as a member', '#/membri', 'carla@example.com', notPlatformAdmin],
  ['page that does not exist', '#/nowhere', 'Page not found'],
  ['ideas as an advisor', '#/idee', 'Shift planner', asAdvisor],
  ['idea as an advisor', idea(), 'Shift planner', asAdvisor],
  ['expense group as an advisor', group(), 'Startup costs', asAdvisor],
  ['survey as an advisor', survey(), 'What is your job?', asAdvisor],
  ['empty dashboard', '#/', 'Hello, Alice', emptyProject],
  ['empty ideas board', '#/idee', null, emptyProject],
  ['empty ideas table', '#/idee?vista=tabella', null, emptyProject],
  ['empty experiments', '#/esperimenti', null, emptyProject],
  ['empty interviews', '#/interviste', null, emptyProject],
  ['empty decisions', '#/decisioni', null, emptyProject],
  ['empty contacts', '#/contatti', null, emptyProject],
  ['empty surveys', '#/questionari', null, emptyProject],
  ['empty chat', `#/chat/${ID.general}`, null, emptyProject],
  ['empty scoring', '#/valutazione', null, emptyProject],
  ['empty votes', '#/valutazione?vista=miei', null, emptyProject],
  ['empty snapshots', '#/valutazione?vista=fotografie', null, emptyProject],
  ['empty generator', '#/generatore', null, emptyProject],
  ['empty team canvas', '#/squadra', null, emptyProject],
  ['empty equity split', '#/squadra/quote', null, emptyProject],
  ['empty availability', '#/squadra/disponibilita', null, emptyProject],
  ['empty own availability', '#/squadra/disponibilita?vista=miei', null, emptyProject],
  ['empty hours', '#/squadra/ore', null, emptyProject],
  ['empty own hours', '#/squadra/ore?vista=mie', null, emptyProject],
  ['empty history', '#/storico', null, emptyProject],
  ['empty trash', '#/cestino', null, emptyProject],
  ['empty expenses', '#/spese', null, emptyProject],
  ['empty profile', '#/profilo', 'Alice', emptyProject],
];

// --- The test -------------------------------------------------------------------------------------------------------

beforeEach(() => {
  fakeApi();
  inProject();
  localStorage.clear();
});

// The whole site as it starts, menu and top bar included, on the data the case prepared.
async function start(prepare) {
  prepare?.();
  chat.stopChats();
  await chat.startChats();
  document.body.replaceChildren();
  root = document.createElement('div');
  document.body.append(root);
  ({ outlet } = shell.buildShell(root, { onSignOut: () => {} }));
  router.clearRoutes();
  app.registerRoutes();
  await router.startRouter(outlet, { fallback: app.notFoundView });
}

afterEach(() => {
  router.stopRouter();
  chat.stopChats();
  Object.assign(api, original);
  history.replaceState(null, '', '#/');
});

// The router shows the message of a page that fails instead of the page: a failure is counted, not read as English.
async function visit(hash) {
  const failures = [];
  const log = console.error;
  console.error = (...args) => failures.push(args.map(String).join(' '));
  try {
    await router.render(hash);
    await flush(10);
  } finally {
    console.error = log;
  }
  return failures;
}

describe('ogni pagina del sito in inglese', () => {
  for (const [name, address, expected, prepare] of PAGES) {
    it(`${name}: nessuna parola italiana nel testo, negli aria-label, nei title e nei placeholder`, async () => {
      await start(prepare);
      assert.deepEqual(await visit(address), [], `${address}: the page failed`);
      assert.ok(outlet.children.length, `${address}: page empty`);
      if (expected) assert.ok(readable(outlet).join(' ').includes(expected), `${address}: "${expected}" missing`);
      assert.deepEqual(italianOn(root), [], address);
    });
  }
});
