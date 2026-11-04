// Anteprima locale senza login, con dati finti: serve solo a controllare il layout.
import { api } from '../../assets/js/lib/api.js';
import * as store from '../../assets/js/store.js';
import { buildShell } from '../../assets/js/views/shell.js';
import { notFoundView, registerRoutes } from '../../assets/js/app.js';
import { startRouter } from '../../assets/js/router.js';
import { surveyTemplate } from '../../assets/js/survey-template.js';
import { addDays, thisMonday } from '../../assets/js/availability.js';
import { ADVISOR, IDS, ME, OTHER, boardItems, item, members, revision } from '../setup/fixtures.mjs';

const extraIdeas = [
  ['Idea gamma con un titolo piuttosto lungo per vedere come va a capo', 'esplorazione'],
  ['Idea delta', 'scelta'],
  ['Idea epsilon', 'parcheggiata'],
  ['Idea zeta', 'validazione'],
].map(([title, status], i) =>
  item({
    id: `aaaaaaa${i}-0000-4000-8000-000000000000`,
    kind: 'idea',
    title,
    status,
    data: { pitch: 'Una frase che descrive l\'idea in modo abbastanza lungo da occupare due righe nella scheda.', owner: i % 2 ? OTHER : ME, technologies: ['ML', 'Ottimizzazione', 'Agenti LLM'] },
  }),
);

// Questionari e risposte di fantasia.
const SURVEY = 'eeeeeeee-0000-4000-8000-000000000001';
const surveyData = surveyTemplate();
const surveys = [
  item({ id: SURVEY, kind: 'survey', title: 'Come gestite i cambi di turno in reparto', status: 'aperto', idea_id: IDS.idea, data: { ...surveyData, token: 'TokenDiProvaAperto0001', appearance: { theme: 'automatico', accent: '#0f766e' } } }),
  item({ id: 'eeeeeeee-0000-4000-8000-000000000002', kind: 'survey', title: 'Bozza con un titolo piuttosto lungo per vedere come va a capo nella scheda', status: 'bozza', idea_id: IDS.idea, data: { ...surveyData, questions: surveyData.questions.slice(0, 3) } }),
];
const surveyAnswers = (i) => ({
  ...(i % 5 === 0 ? { 'situazione:altro': 'Coordinatrice di un reparto di medicina interna con turni anche notturni' } : { situazione: i % 3 ? 'a' : 'b' }),
  eta: ['meno-25', '25-34', '35-44', 'non-rispondo'][i % 4],
  'ultima-volta': ['settimana', 'mese', 'sei-mesi'][i % 3],
  episodio: i % 4 ? 'La settimana scorsa ho dovuto cambiare turno all\'ultimo momento e ho passato un\'ora al telefono per trovare chi mi sostituisse.' : 'Ok',
  'quante-volte': i * 2,
  'quanto-pesa': (i % 5) + 1,
});
const surveyResponses = Array.from({ length: 12 }, (_, i) => ({
  id: `ffffffff-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  survey_id: SURVEY,
  answers: i > 9 ? { situazione: 'a' } : surveyAnswers(i),
  email: i % 3 === 0 && i <= 9 ? `persona${i}@esempio.it` : null,
  recontact: i % 6 === 0 && i <= 9,
  duration_seconds: i > 9 ? null : 150 + i * 20,
  device: i % 2 ? 'computer' : 'telefono',
  completed: i <= 9,
  created_at: new Date(Date.now() - (12 - i) * 3600e3).toISOString(),
}));

store.state.user = { id: ME };
store.setMembers(members());
// Spese di fantasia: un gruppo con una persona senza account e movimenti in due valute.
const EXPENSES = 'ffffffff-0000-4000-8000-000000000001';
const expensePeople = [{ id: 'a', name: 'Anna', member: ME }, { id: 'b', name: 'Bruno', member: OTHER, pay: 'IT60X0542811101000000123456' }, { id: 'e', name: 'Elena Rossi Bianchi', pay: 'paypal.me/elena-rossi-bianchi' }];
const day = (offset) => new Date(Date.now() - offset * 86400e3).toISOString().slice(0, 10);
const movement = (n, title, data) =>
  item({ id: `ffffffff-1111-4000-8000-00000000000${n}`, kind: 'expense', title, data: { group: EXPENSES, currency: 'EUR', rate: 1, ...data } });
const expenses = [
  item({ id: EXPENSES, kind: 'expensegroup', title: 'Costi della startup', data: { currency: 'EUR', people: expensePeople } }),
  movement(1, 'Dominio e hosting per un anno', { type: 'spesa', amount: 14990, date: day(40), paid_by: 'a', split: { mode: 'parti', shares: { a: 1, b: 1, e: 1 } }, category: 'software' }),
  movement(2, 'Cena con il mentor', { type: 'spesa', amount: 9600, currency: 'USD', rate: 0.9, date: day(12), paid_by: 'b', split: { mode: 'quote', shares: { a: 1, b: 2 } }, category: 'pasti', note: 'Pagata con la carta di Bruno' }),
  movement(3, 'Biglietti per la fiera', { type: 'spesa', amount: 12000, date: day(5), paid_by: 'e', split: { mode: 'importi', shares: { a: 4000, b: 4000, e: 4000 } }, category: 'eventi' }),
  movement(4, 'Rimborso', { type: 'rimborso', amount: 2500, date: day(3), paid_by: 'b', split: { mode: 'parti', shares: { a: 1 } } }),
  movement(5, 'Premio del bando', { type: 'entrata', amount: 30000, date: day(1), paid_by: 'a', split: { mode: 'parti', shares: { a: 1, b: 1, e: 1 } } }),
];

// Impegni di fantasia: Anna senza scadenza, Bruno con l'orario tipo che scade venerdì, Chiara con l'orario già scaduto.
const monday = thisMonday();
const availability = (n, author, data) =>
  item({ id: `dddddddd-0000-4000-8000-00000000000${n}`, kind: 'availability', title: 'Impegni', created_by: author, updated_by: author, updated_at: new Date(Date.now() - n * 86400e3).toISOString(), data });
const availabilities = [
  availability(1, ME, {
    busy: { lun: [7, 9, 10, 11, 14, 15], mar: [8, 9, 10, 11, 12], mer: [9, 10, 11], gio: [14, 15, 16, 17], ven: [9, 10, 22] },
    weeks: [{ key: addDays(monday, 7), busy: { lun: [9, 10], gio: [18, 19, 20, 21] } }],
  }),
  availability(2, OTHER, {
    busy: { lun: [8, 9, 10, 11, 12, 13], mar: [14, 15, 16, 17, 18], mer: [9, 10, 11, 12], gio: [8, 9, 10], ven: [15, 16, 17, 18, 19, 20, 21], sab: [10, 11, 12] },
    until: addDays(monday, 4),
    weeks: [{ key: addDays(monday, 7), busy: { lun: [9, 10, 11], mer: [18, 19] } }],
  }),
  availability(3, ADVISOR, { busy: { lun: [9, 10, 11, 12, 13, 14, 15, 16, 17] }, until: addDays(monday, -3) }),
];

// Ore lavorate di fantasia: settimane passate e questa, con note. Bruno ha dichiarato zero ore due settimane fa.
const LONG_NOTE = 'Preparato le domande per le interviste ai responsabili acquisti e riscritto la parte del problema nel canvas dopo le ultime chiamate.';
const row = (id, day, start, end, area, note) => ({ id, day, start: start * 60, end: end * 60, area, ...(note ? { note } : {}) });
const timesheet = (n, author, week, data) =>
  item({ id: `cccccccc-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`, kind: 'timesheet', title: 'Ore lavorate', created_by: author, updated_by: author, updated_at: new Date(Date.now() - n * 3600e3).toISOString(), data: { week: addDays(monday, week * 7), ...data } });
const timesheets = [
  timesheet(1, ME, -10, { pledge: 600, entries: [row('a1', 'lun', 9, 12, 'ricerca', 'Interviste con due coordinatrici'), row('a2', 'mer', 14, 17.5, 'prodotto')] }),
  timesheet(2, ME, -7, { entries: [row('a1', 'mar', 18, 20, 'clienti'), row('a2', 'sab', 10, 13, 'prodotto', 'Prototipo della pagina dei turni')] }),
  timesheet(3, ME, -4, { pledge: 480, entries: [row('a1', 'mer', 9, 13, 'numeri', 'Piano economico, prima bozza'), row('a2', 'ven', 15, 16.5, 'altro')] }),
  timesheet(4, ME, -2, { entries: [row('a1', 'lun', 9, 11, 'prodotto'), row('a2', 'gio', 21, 24, 'prodotto', LONG_NOTE)] }),
  timesheet(5, ME, -1, {
    entries: [
      row('a1', 'lun', 9, 10.5, 'clienti', 'Chiamata con la clinica'),
      row('a2', 'lun', 10.5, 12, 'prodotto'),
      row('a3', 'mar', 14.25, 18.75, 'ricerca', LONG_NOTE),
      row('a4', 'gio', 9, 13, 'numeri'),
      row('a5', 'dom', 22, 24, 'altro', 'Preparato la riunione'),
    ],
  }),
  timesheet(6, ME, 0, { entries: [row('a1', 'lun', 9, 11, 'prodotto', 'Riunione di inizio settimana')] }),
  timesheet(7, OTHER, -6, { pledge: 360, entries: [row('b1', 'lun', 18, 21, 'prodotto')] }),
  timesheet(8, OTHER, -3, { entries: [row('b1', 'gio', 9, 12, 'clienti', 'Due demo')] }),
  timesheet(9, OTHER, -2, { pledge: 0, entries: [] }),
  timesheet(10, OTHER, -1, { pledge: 360, entries: [row('b1', 'mar', 10, 13, 'clienti', 'Telefonate a tre aziende'), row('b2', 'ven', 15, 19.25, 'prodotto')] }),
  timesheet(11, OTHER, 0, { entries: [row('b1', 'lun', 14, 16.75, 'ricerca')] }),
  timesheet(12, ADVISOR, -1, { pledge: 120, entries: [row('c1', 'mer', 17, 18, 'altro', 'Revisione del pitch')] }),
];

[...boardItems(), ...extraIdeas, ...surveys, ...expenses, ...availabilities, ...timesheets].forEach((i) => store.applyItem(i));
store.state.commentCounts = new Map([[IDS.idea, 2]]);

const history = [
  revision({ id: 1, version: 1, op: 'create', data: { pitch: 'Prima versione del pitch', problem: 'Riga 1' }, message: 'prima versione' }),
  revision({ id: 2, version: 2, op: 'update', author_id: OTHER, status: 'validazione', data: { pitch: 'Pitch di prova riscritto meglio', problem: 'Riga 1\nRiga 2', technologies: ['XAI'] }, changed: ['status', 'pitch', 'problem', 'technologies'], message: 'chiarito il problema' }),
];
api.listRevisions = async () => [...history].reverse();
api.itemHistory = async () => history;
api.listComments = async (ids) => [ids].flat().slice(0, 1).flatMap((id) => [
  { id: 'c0000000-0000-4000-8000-000000000001', item_id: id, author_id: OTHER, body: 'Secondo me il cliente giusto è un altro: proviamo a sentire due responsabili acquisti.', created_at: '2026-10-17T10:00:00Z' },
  { id: 'c0000000-0000-4000-8000-000000000002', item_id: id, author_id: ME, body: 'Critica: manca il criterio di successo.', ai_task: 'critique', created_at: '2026-10-17T11:00:00Z' },
]);
api.activitySince = async () => [{ author_id: ME }, { author_id: OTHER }];
api.auditLog = async () => [{ id: 1, event: 'member_added', actor_id: ME, target_id: OTHER, details: { role: 'member' }, created_at: '2026-10-18T10:00:00Z' }];
api.listFactors = async () => [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'Telefono', created_at: '2026-10-18T10:00:00Z' }];
api.aiUsageLastDay = async () => 2;
api.saveItem = async ({ id, snapshot }) => ({ status: 'ok', item: { ...store.getItem(id), ...snapshot, version: store.getItem(id).version + 1 } });
api.createItem = async ({ kind, title, status, data, ideaId }) => item({ id: crypto.randomUUID(), kind, title, status, data, idea_id: ideaId });
api.invokeClaude = async () => ({
  text: '# Valutazione della board\n\n## Situazione generale\nLa board contiene una sola frase. **Non c\'è nessun elemento validato**: tutto è ipotesi.\n\n## Le tre assunzioni più rischiose\n\n1. **Che il metodo aggiunga qualcosa di sostanziale.**\n   - Il problema è noto da decenni.\n   - Va dimostrato perché un approccio generativo batte un ottimizzatore.\n2. **Che il cliente paghi.**\n\n| Ipotesi | Prova |\n|---|---|\n| Problema | 10 interviste |\n\n> Prima il problema, poi la soluzione.\n\nUsa `criterio di successo` *deciso prima*.',
  remaining: 38,
});
api.signOut = async () => {};
api.listItems = async () => [...store.state.items.values()];
api.activityFeed = async () => ({
  revisions: [
    { id: 901, item_id: IDS.idea2, kind: 'idea', op: 'create', title: 'Idea beta', status: 'nuova', changed: [], author_id: OTHER, created_at: new Date(Date.now() - 3600e3).toISOString() },
    { id: 902, item_id: IDS.idea, kind: 'idea', op: 'update', title: 'Idea alfa', status: 'validazione', changed: ['status'], author_id: OTHER, created_at: new Date(Date.now() - 600e3).toISOString() },
    { id: 903, item_id: IDS.experiment, kind: 'experiment', op: 'update', title: 'I clienti pagano?', status: 'concluso', changed: ['status'], author_id: OTHER, created_at: new Date(Date.now() - 120e3).toISOString() },
  ],
  comments: [{ id: 'c0000000-0000-4000-8000-000000000099', item_id: IDS.canvas, author_id: OTHER, ai_task: 'critique', created_at: new Date(Date.now() - 60e3).toISOString() }],
});
localStorage.setItem(`bdp:notificheLette:${ME}`, JSON.stringify(new Date(Date.now() - 2 * 3600e3).toISOString()));
api.commentCounts = async () => store.state.commentCounts;
api.surveyFunnel = async () => ({ views: 48, starts: 14, partial: 2, completed: 10 });
api.listSurveyResponses = async () => surveyResponses;
api.deleteSurveyResponses = async () => 0;

const { outlet } = buildShell(document.getElementById('app'), { onSignOut() {} });
registerRoutes();
startRouter(outlet, { fallback: notFoundView });
import('../../assets/js/notifications.js').then((m) => m.startNotifications());
