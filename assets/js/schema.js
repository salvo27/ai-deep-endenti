import { locale, tx } from './i18n/index.js';
import {
  LIMITS,
  cleanLine,
  cleanText,
  intInRange,
  isIsoDate,
  isKey,
  isPhotoDataUrl,
  isUuid,
  slugKey,
  uniqueStrings,
  uniqueUuids,
} from './lib/validate.js';
import { fmtDate, fmtMoney } from './lib/format.js';
import { CURRENCIES, EXPENSE_CATEGORIES, MOVEMENT_TYPES, SPLIT_MODES, sanitizeExpense, sanitizeExpenseGroup } from './expenses.js';
import { dayName, hoursText, sanitizeAvailability, sanitizeBusy, shortDate } from './availability.js';
import { areaLabel, clockText, durationText, sanitizeEntry, sanitizeTimesheet, timesheetProblem } from './timesheet.js';

const T = tx.boards;
const K = T.kinds;
const H = T.history;

// I valori salvati (stati, opzioni, chiavi) non cambiano mai con la lingua: dai testi arrivano solo le etichette.
// Molti sono parole italiane, per questo le loro righe portano «i18n-ignore».
const choices = (labels, values) => values.map((value) => [value, labels[value]]);

export const TECH_SUGGESTIONS = [
  'Inverse design',
  T.techSuggestions.declarativeConstraints,
  T.techSuggestions.generativeAgents,
  'Explainable AI',
  T.techSuggestions.counterfactuals,
  T.techSuggestions.timeSeries,
  T.techSuggestions.constrainedOptimisation,
  T.techSuggestions.llmInterfaces,
  T.techSuggestions.agentModels,
];

export const COMMITMENT = choices(T.commitment, ['nessuno', 'interesse', 'demo', 'pilota', 'pagamento']); // i18n-ignore

export const STRONG_COMMITMENTS = new Set(['pilota', 'pagamento']); // i18n-ignore: stored values

export const INTERVIEW_SOURCES = choices(T.interviewSources, ['colloquio', 'ricerca']); // i18n-ignore

// Senza tipo è un colloquio: le interviste salvate prima del campo restano valide.
export const isConversation = (interview) => interview?.data?.source !== 'ricerca'; // i18n-ignore

// Come prova conta solo un colloquio già avvenuto, non uno ancora da fare.
export const isHeldConversation = (interview) => isConversation(interview) && interview?.status !== 'da_fare'; // i18n-ignore

function canvasBlock(key, area, main = false) {
  const { label, help } = T.canvasBlocks[key];
  const block = { key, label, area };
  if (help) block.help = help;
  if (main) block.main = true;
  return block;
}

export const CANVAS_BLOCKS = [
  canvasBlock('problem', 'prob', true),
  canvasBlock('alternatives', 'prob'),
  canvasBlock('solution', 'sol', true),
  canvasBlock('metrics', 'met', true),
  canvasBlock('uvp', 'uvp', true),
  canvasBlock('concept', 'uvp'),
  canvasBlock('advantage', 'adv', true),
  canvasBlock('channels', 'chan', true),
  canvasBlock('segments', 'seg', true),
  canvasBlock('early_adopters', 'seg'),
  canvasBlock('costs', 'cost', true),
  canvasBlock('revenue', 'rev', true),
];

export const TRL = choices(T.trl, ['1', '2', '3', '4', '5', '6', '7', '8', '9']);

export const IMPORTANCE = choices(T.importance, ['alta', 'media', 'bassa']);

export const TEAM_BLOCKS = ['people', 'common_goals', 'personal_goals', 'purpose', 'values', 'needs', 'rules', 'strengths', 'weaknesses'].map((key) => ({
  key,
  label: T.teamBlocks[key].label,
  help: T.teamBlocks[key].help,
}));

// Contenuto creato dal sito: le etichette sono nella lingua in uso, le chiavi restano (i punteggi le usano).
export const DEFAULT_EQUITY_FACTORS = [
  { key: 'idea', label: T.equityFactors.idea, weight: 5 },
  { key: 'business-plan', label: 'Business plan', weight: 5 },
  { key: 'esperienza', label: T.equityFactors.esperienza, weight: 5 },
  { key: 'rischio', label: T.equityFactors.rischio, weight: 5 },
  { key: 'responsabilita', label: T.equityFactors.responsabilita, weight: 5 },
];

// Questionari: la pagina pubblica mostra solo ciò che passa da qui e dal database (public_survey).
export const QUESTION_TYPES = choices(T.questionTypes, ['sezione', 'scelta', 'scelte', 'scala', 'numero', 'breve', 'lunga', 'email']); // i18n-ignore

export const QUESTION_ROLES = choices(T.questionRoles, ['persona', 'problema', 'contatto', 'altro']); // i18n-ignore

export const SURVEY_LAYOUTS = choices(T.surveyLayouts, ['una', 'sezioni']); // i18n-ignore

export const SURVEY_PROGRESS = choices(T.surveyProgress, ['contatore', 'barra', 'nessuno']); // i18n-ignore

export const SURVEY_THEMES = choices(T.surveyThemes, ['automatico', 'chiaro', 'scuro', 'seppia', 'contrasto']);

export const SURVEY_ACCENT = '#3b4bc8';

// Immagini della schermata iniziale (cover) e del grazie (thanks_image): JPEG nello spazio pubblico «questionari-immagini»,
// percorso <questionario>/<uuid>.jpg.
export const SURVEY_IMAGE_BUCKET = 'questionari-immagini'; // i18n-ignore
export const SURVEY_COVER_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

// Id riservato della risposta «Preferisco non rispondere» (domande a scelta con prefer_not).
export const SURVEY_PREFER_NOT = 'non-rispondo'; // i18n-ignore

export const SURVEY_LIMITS = Object.freeze({
  questions: 40,
  options: 20,
  problemQuestions: 10,
  intro: 2000,
  privacy: 3000,
  thanks: 1000,
  coverAlt: 200,
  label: 300,
  help: 500,
  option: 120,
  scaleLabel: 60,
  number: 1e9,
  short: 300,
  long: 3000,
  other: 300,
});

export const SURVEY_TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
const TOKEN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// 22 caratteri casuali (132 bit): impossibile da indovinare. Cambiarlo revoca il link vecchio.
export function newSurveyToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(22)), (b) => TOKEN_CHARS[b & 63]).join('');
}

// Etichetta, aiuto, segnaposto e gruppo arrivano dai testi del campo; «values» sono i valori salvati di una scelta,
// con le etichette prese dalle opzioni dei testi.
function field(key, texts, type = 'textarea', { values, ...extra } = {}) {
  const def = { key, label: texts.label, type };
  for (const prop of ['help', 'placeholder', 'group']) if (texts[prop]) def[prop] = texts[prop];
  if (values) def.options = choices(texts.options, values);
  return Object.assign(def, extra);
}

const fieldsOf = (kind) => (key, type, extra) => field(key, K[kind].fields[key], type, extra);
const ideaField = fieldsOf('idea');
const experimentField = fieldsOf('experiment');
const interviewField = fieldsOf('interview');
const decisionField = fieldsOf('decision');
const contactField = fieldsOf('contact');
const deeptechField = fieldsOf('deeptech');
const personaField = fieldsOf('persona'); // i18n-ignore
const vpcField = fieldsOf('vpc');
const marketField = fieldsOf('market');
const competitorsField = fieldsOf('competitors');
const surveyField = fieldsOf('survey');
const noteField = fieldsOf('note');
const equityField = fieldsOf('equity');
const expenseGroupField = fieldsOf('expensegroup');
const expenseField = fieldsOf('expense');

// La landing page si chiama così in tutte e due le lingue.
const METHODS = { ...K.experiment.fields.method.options, landing: 'Landing page' };
const currencyOptions = () => CURRENCIES.map(([code, label]) => [code, `${code}, ${label}`]);

export const KINDS = {
  idea: {
    label: K.idea.label,
    plural: K.idea.plural,
    icon: 'idea',
    titleLabel: K.idea.titleLabel,
    statuses: choices(K.idea.statuses, ['nuova', 'esplorazione', 'validazione', 'scelta', 'parcheggiata', 'scartata']), // i18n-ignore
    fields: [
      ideaField('pitch', 'textarea', { rows: 2, wide: true }),
      ideaField('problem'),
      ideaField('customer'),
      ideaField('solution'),
      ideaField('why_us'),
      ideaField('technologies', 'tags', { suggestions: TECH_SUGGESTIONS }),
      ideaField('sector', 'text'),
      ideaField('owner', 'member'),
      ideaField('competitors'),
      ideaField('risks'),
      ideaField('next_step', 'text'),
      ideaField('resources'),
    ],
    extraKeys: ['origin'],
  },
  canvas: {
    label: 'Lean Canvas',
    plural: K.canvas.plural,
    icon: 'canvas',
    titleLabel: T.title,
    needsIdea: true,
    statuses: null,
    fields: CANVAS_BLOCKS.map((b) => field(b.key, b)),
    extraKeys: ['validated'],
  },
  experiment: {
    label: K.experiment.label,
    plural: K.experiment.plural,
    icon: 'experiment',
    titleLabel: K.experiment.titleLabel,
    needsIdea: true,
    statuses: choices(K.experiment.statuses, ['pianificato', 'in_corso', 'concluso']), // i18n-ignore: stored values
    fields: [
      experimentField('customer', 'textarea', { rows: 2 }),
      experimentField('problem', 'textarea', { rows: 2 }),
      experimentField('solution', 'textarea', { rows: 2 }),
      experimentField('assumption', 'textarea', { rows: 2, wide: true }),
      experimentField('assumption_type', 'select', { values: ['problema', 'cliente', 'soluzione', 'prezzo', 'canale', 'tecnica', 'normativa'] }), // i18n-ignore: stored values
      experimentField('method', 'select', { options: choices(METHODS, ['interviste', 'demo', 'landing', 'prevendita', 'dati', 'concierge', 'altro']) }), // i18n-ignore
      experimentField('method_details'),
      experimentField('success_criterion', 'textarea', { rows: 2, wide: true }),
      experimentField('owner', 'member'),
      experimentField('start_date', 'date'),
      experimentField('end_date', 'date'),
      experimentField('result'),
      experimentField('learnings'),
      experimentField('decision', 'select', { values: ['proseguire', 'cambiare', 'abbandonare'] }),
    ],
  },
  interview: {
    label: K.interview.label,
    plural: K.interview.plural,
    icon: 'interview',
    titleLabel: T.title,
    statuses: choices(K.interview.statuses, ['da_fare', 'fatta', 'analizzata']), // i18n-ignore
    fields: [
      interviewField('source', 'select', { options: INTERVIEW_SOURCES, default: 'colloquio' }), // i18n-ignore: stored value
      interviewField('date', 'date'),
      interviewField('interviewer', 'member'),
      interviewField('role', 'text'),
      interviewField('organization', 'text'),
      interviewField('segment', 'text'),
      interviewField('experiment_id', 'experiment'),
      interviewField('current_solution'),
      interviewField('pains'),
      interviewField('quotes'),
      interviewField('willingness_to_pay', 'textarea', { rows: 2 }),
      interviewField('problem_intensity', 'scale'),
      interviewField('commitment', 'select', { options: COMMITMENT }),
      interviewField('notes'),
      interviewField('follow_up', 'text'),
      interviewField('contact', 'text'),
    ],
  },
  decision: {
    label: K.decision.label,
    plural: K.decision.plural,
    icon: 'decision',
    titleLabel: K.decision.titleLabel,
    statuses: choices(K.decision.statuses, ['proposta', 'presa', 'rivista']),
    fields: [
      decisionField('date', 'date'),
      decisionField('context'),
      decisionField('options'),
      decisionField('decision', 'textarea', { wide: true }),
      decisionField('rationale'),
      decisionField('decided_by', 'members'),
      decisionField('ideas', 'ideas'),
      decisionField('review_date', 'date'),
    ],
  },
  contact: {
    label: K.contact.label,
    plural: K.contact.plural,
    icon: 'users',
    titleLabel: K.contact.titleLabel,
    needsIdea: true,
    statuses: choices(K.contact.statuses, ['da_contattare', 'contattata', 'fissata', 'in_contatto', 'chiusa']), // i18n-ignore
    fields: [
      contactField('purpose', 'select', { values: ['cliente', 'utente', 'esperto', 'realizzazione', 'design_partner', 'mentor', 'investitore', 'ateneo', 'norme', 'altro'] }), // i18n-ignore
      contactField('role', 'text'),
      contactField('organization', 'text'),
      contactField('segment', 'text'),
      contactField('goal', 'textarea', { rows: 2, wide: true, concept: 'fuori-dall-ufficio' }),
      contactField('via', 'text'),
      contactField('owner', 'member'),
      contactField('next_date', 'date'),
      contactField('interview_id', 'interview'),
      contactField('notes'),
      contactField('contact', 'text'),
    ],
  },
  deeptech: {
    label: K.deeptech.label,
    plural: K.deeptech.plural,
    icon: 'chip',
    titleLabel: T.title,
    needsIdea: true,
    statuses: null,
    fields: [
      deeptechField('trl_now', 'select', { options: TRL, concept: 'trl' }),
      deeptechField('trl_target', 'select', { options: TRL }),
      deeptechField('next_milestone'),
      deeptechField('milestone_cost', 'text'),
      deeptechField('tech_risks', 'textarea', { concept: 'due-rischi' }),
      deeptechField('market_risks'),
      deeptechField('design_partners', 'textarea', { concept: 'design-partner' }),
      deeptechField('value_metrics'),
      deeptechField('offer', 'select', { values: ['prodotto', 'servizio', 'licenza', 'da_decidere'] }), // i18n-ignore
      deeptechField('published', 'textarea', { concept: 'novita-assoluta' }),
      deeptechField('to_protect'),
      deeptechField('ip_owner', 'select', { concept: 'invenzioni-universitarie', values: ['ateneo', 'team', 'mista', 'da_chiarire'] }), // i18n-ignore
      deeptechField('company_form', 'select', { concept: 'spin-off', values: ['spinoff', 'licenza', 'indipendente', 'da_decidere'] }), // i18n-ignore
      deeptechField('academic_constraints'),
      deeptechField('regulation', 'textarea', { concept: 'ai-act' }),
      deeptechField('funding', 'textarea', { concept: 'finanza-non-diluitiva' }), // i18n-ignore
    ],
  },
  persona: {
    label: 'Buyer persona', // i18n-ignore: il nome è lo stesso nelle due lingue
    plural: K.persona.plural,
    icon: 'user',
    titleLabel: K.persona.titleLabel,
    titlePlaceholder: K.persona.titlePlaceholder,
    needsIdea: true,
    statuses: null,
    fields: [
      personaField('photo', 'image', { wide: true }),
      personaField('role', 'text', { wide: true }),
      personaField('role_type', 'select', { concept: 'cliente-utente', values: ['paga', 'usa', 'paga_usa', 'influenza'] }), // i18n-ignore
      personaField('segment', 'text'),
      personaField('early_adopter', 'select', { concept: 'early-adopter', values: ['si', 'forse', 'no'] }), // i18n-ignore: stored values
      personaField('age_range', 'text'),
      personaField('gender', 'select', { values: ['donna', 'uomo', 'qualsiasi'] }), // i18n-ignore: stored values
      personaField('location', 'text'),
      personaField('income', 'text'),
      personaField('education', 'text'),
      personaField('profile', 'textarea', { concept: 'buyer-persona' }), // i18n-ignore
      personaField('habits'),
      personaField('current_solution'),
      personaField('needs'),
      personaField('goals'),
      personaField('fears'),
      personaField('objections'),
      personaField('channels'),
      personaField('info_sources'),
      personaField('quote', 'textarea', { rows: 2 }),
      personaField('evidence', 'textarea', { rows: 2 }),
    ],
  },
  vpc: {
    label: 'Value Proposition Canvas',
    plural: K.vpc.plural,
    icon: 'target',
    titleLabel: T.title,
    needsIdea: true,
    statuses: null,
    fields: [
      vpcField('segment', 'text', { wide: true }),
      vpcField('jobs', 'textarea', { concept: 'vpc' }),
      vpcField('pains'),
      vpcField('gains'),
      vpcField('products'),
      vpcField('pain_relievers'),
      vpcField('gain_creators'),
      vpcField('fit'),
    ],
  },
  market: {
    label: K.market.label,
    plural: K.market.plural,
    icon: 'market',
    titleLabel: T.title,
    needsIdea: true,
    statuses: null,
    fields: [
      marketField('approach', 'select', { concept: 'tam-sam-som', values: ['top_down', 'bottom_up'] }),
      marketField('tam', 'money'),
      marketField('tam_basis'),
      marketField('sam', 'money'),
      marketField('sam_basis'),
      marketField('som', 'money'),
      marketField('som_year', 'int', { min: 2000, max: 2100 }),
      marketField('som_basis'),
      marketField('trend'),
      marketField('sources'),
    ],
  },
  competitors: {
    label: K.competitors.label,
    plural: K.competitors.plural,
    icon: 'competitors',
    titleLabel: T.title,
    needsIdea: true,
    statuses: null,
    fields: [
      competitorsField('gap', 'textarea', { wide: true, concept: 'concorrenti' }),
      competitorsField('lessons'),
    ],
    extraKeys: ['features', 'rivals', 'cells', 'axes', 'us'],
  },
  survey: {
    label: K.survey.label,
    plural: K.survey.plural,
    icon: 'list',
    titleLabel: T.title,
    needsIdea: true,
    statuses: choices(K.survey.statuses, ['bozza', 'aperto', 'chiuso']), // i18n-ignore
    // Solo per etichette e storico: i dati li valida sanitizeSurvey.
    fields: [
      surveyField('intro', 'textarea', { wide: true }),
      surveyField('privacy', 'textarea', { wide: true }),
      surveyField('thanks', 'textarea', { rows: 2 }),
      surveyField('thanks_contact', 'textarea', { rows: 2 }),
      surveyField('layout', 'select', { options: SURVEY_LAYOUTS }),
      surveyField('progress', 'select', { options: SURVEY_PROGRESS }),
      surveyField('experiment_id', 'experiment'),
    ],
    extraKeys: ['show_time', 'appearance', 'cover', 'thanks_image', 'token', 'questions'],
  },
  note: {
    label: K.note.label,
    plural: K.note.plural,
    icon: 'file',
    titleLabel: T.title,
    titleFromBody: true,
    needsIdea: true,
    statuses: null,
    fields: [
      noteField('date', 'date'),
      noteField('body', 'markdown', { wide: true }),
    ],
  },
  teamcanvas: {
    label: 'Team Canvas',
    plural: 'Team Canvas',
    icon: 'heart',
    titleLabel: T.title,
    statuses: null,
    singleton: true,
    fields: TEAM_BLOCKS.map((b) => field(b.key, b, 'textarea', { rows: 3 })),
  },
  equity: {
    label: K.equity.label,
    plural: K.equity.plural,
    icon: 'pie',
    titleLabel: T.title,
    statuses: null,
    singleton: true,
    fields: [
      equityField('vesting', 'textarea', { concept: 'vesting' }),
      equityField('notes'),
    ],
    extraKeys: ['factors', 'founders', 'scores'],
  },
  // Uno per persona, lo modifica solo chi l'ha creato: i dati li valida sanitizeAvailability.
  availability: { label: K.availability.label, plural: K.availability.plural, icon: 'calendar', titleLabel: T.title, statuses: null, fields: [] },
  // Uno per persona e per settimana, lo modifica solo chi l'ha creato: i dati li valida sanitizeTimesheet.
  timesheet: { label: K.timesheet.label, plural: K.timesheet.plural, icon: 'clock', titleLabel: T.title, statuses: null, fields: [] },
  criteria: { label: K.criteria.label, plural: K.criteria.plural, icon: 'scoring', titleLabel: T.title, statuses: null, fields: [] },
  score: { label: K.score.label, plural: K.score.plural, icon: 'scoring', titleLabel: T.title, statuses: null, fields: [] },
  scoresnap: { label: K.scoresnap.label, plural: K.scoresnap.plural, icon: 'image', titleLabel: K.scoresnap.titleLabel, statuses: null, fields: [] },
  generator: { label: K.generator.label, plural: K.generator.plural, icon: 'generator', titleLabel: T.title, statuses: null, fields: [] },
  // Spese condivise: solo per etichette e storico, i dati li validano sanitizeExpenseGroup e sanitizeExpense.
  expensegroup: {
    label: K.expensegroup.label,
    plural: K.expensegroup.plural,
    icon: 'wallet',
    titleLabel: K.expensegroup.titleLabel,
    statuses: null,
    fields: [
      expenseGroupField('currency', 'select', { options: currencyOptions() }),
      expenseGroupField('notes'),
    ],
    extraKeys: ['people'],
  },
  expense: {
    label: K.expense.label,
    plural: K.expense.plural,
    icon: 'wallet',
    titleLabel: K.expense.titleLabel,
    statuses: null,
    fields: [
      expenseField('type', 'select', { options: MOVEMENT_TYPES }),
      expenseField('amount', 'text'),
      expenseField('currency', 'select', { options: currencyOptions() }),
      expenseField('rate', 'text'),
      expenseField('date', 'date'),
      expenseField('paid_by', 'text'),
      expenseField('category', 'select', { options: EXPENSE_CATEGORIES }),
      expenseField('note'),
      expenseField('receipt', 'image'),
    ],
    extraKeys: ['group', 'split'],
  },
};

export const BOARD_KINDS = ['idea', 'canvas', 'experiment', 'interview', 'decision', 'contact', 'deeptech', 'persona', 'vpc', 'market', 'competitors', 'survey', 'note']; // i18n-ignore
export const IDEA_CHILD_KINDS = ['canvas', 'experiment', 'interview', 'contact', 'deeptech', 'persona', 'vpc', 'market', 'competitors', 'survey', 'note']; // i18n-ignore
export const TEAM_KINDS = ['teamcanvas', 'equity'];
export const EXPENSE_KINDS = ['expensegroup', 'expense'];
export const EDITABLE_KINDS = [...BOARD_KINDS, ...TEAM_KINDS];

export function kindOf(kind) {
  return KINDS[kind] || null;
}

export function defaultStatus(kind) {
  return KINDS[kind]?.statuses?.[0]?.[0] ?? null;
}

export function statusLabel(kind, status) {
  return KINDS[kind]?.statuses?.find(([value]) => value === status)?.[1] ?? status ?? '';
}

export function fieldOf(kind, key) {
  return KINDS[kind]?.fields.find((f) => f.key === key) || null;
}

export function optionLabel(fieldDef, value) {
  return fieldDef?.options?.find(([v]) => v === value)?.[1] ?? value;
}

// Passo della roadmap segnato a mano: «done|chi|quando» oppure «skip|chi|quando» (solo per i passi facoltativi).
const ROADMAP_MARK_RE = /^(done|skip)\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)$/i;

export function parseRoadmapMark(value) {
  const m = typeof value === 'string' ? value.match(ROADMAP_MARK_RE) : null;
  return m ? { state: m[1], by: m[2].toLowerCase(), at: m[3] } : null;
}

export const roadmapMark = (state, by, at = new Date().toISOString()) => `${state}|${by}|${at}`;

function sanitizeRoadmap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= 100) break;
    if (/^[a-z0-9-]{1,40}$/.test(key) && parseRoadmapMark(value)) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

function sanitizeField(def, value) {
  switch (def.type) {
    case 'text':
      return cleanLine(value) || undefined;
    case 'textarea':
      return cleanText(value) || undefined;
    case 'markdown':
      return cleanText(value, LIMITS.note) || undefined;
    case 'select':
      return def.options.some(([v]) => v === value) ? value : undefined;
    case 'date':
      return isIsoDate(value) ? value : undefined;
    case 'member':
    case 'experiment':
    case 'interview':
      return isUuid(value) ? value : undefined;
    case 'members':
    case 'ideas': {
      const ids = uniqueUuids(value);
      return ids.length ? ids : undefined;
    }
    case 'tags': {
      const tags = uniqueStrings(value);
      return tags.length ? tags : undefined;
    }
    case 'scale':
      return intInRange(value, 1, 5) ?? undefined;
    case 'money':
      return intInRange(typeof value === 'number' ? Math.round(value) : value, 0, 1e13) ?? undefined;
    case 'int':
      return intInRange(value, def.min ?? 0, def.max ?? 1e9) ?? undefined;
    case 'image':
      return isPhotoDataUrl(value) ? value : undefined;
    default:
      return undefined;
  }
}

const ROW_ID_RE = /^[a-z0-9-]{1,40}$/;
const isRowId = (value) => typeof value === 'string' && ROW_ID_RE.test(value);

function sanitizeAxisLabels(axis) {
  const out = {};
  const label = cleanLine(axis?.label, 60);
  const low = cleanLine(axis?.low, 40);
  const high = cleanLine(axis?.high, 40);
  if (label) out.label = label;
  if (low) out.low = low;
  if (high) out.high = high;
  return out;
}

function sanitizePosition(row) {
  const out = {};
  const x = intInRange(row?.x, 0, 10);
  const y = intInRange(row?.y, 0, 10);
  if (x !== null) out.x = x;
  if (y !== null) out.y = y;
  return out;
}

function sanitizeCompetitors(raw) {
  const features = [];
  const featureIds = new Set();
  for (const row of Array.isArray(raw?.features) ? raw.features : []) {
    const label = cleanLine(row?.label, 120);
    if (!label || !isRowId(row?.id) || featureIds.has(row.id)) continue;
    featureIds.add(row.id);
    features.push({ id: row.id, label, importance: IMPORTANCE.some(([v]) => v === row.importance) ? row.importance : 'media' });
    if (features.length >= 20) break;
  }
  const rivals = [];
  const columns = new Set(['noi']);
  for (const row of Array.isArray(raw?.rivals) ? raw.rivals : []) {
    const name = cleanLine(row?.name, 80);
    if (!name || !isRowId(row?.id) || columns.has(row.id)) continue;
    columns.add(row.id);
    const rival = { id: row.id, name, type: row.type === 'indiretto' ? 'indiretto' : 'diretto', ...sanitizePosition(row) };
    const note = cleanLine(row?.note, 300);
    if (note) rival.note = note;
    rivals.push(rival);
    if (rivals.length >= 15) break;
  }
  const cells = {};
  for (const [key, value] of Object.entries(raw?.cells || {})) {
    const [featureId, columnId] = key.split(':');
    if (value === true && featureIds.has(featureId) && columns.has(columnId)) cells[key] = true;
  }
  const out = {};
  if (features.length) out.features = features;
  if (rivals.length) out.rivals = rivals;
  if (Object.keys(cells).length) out.cells = cells;
  const axes = { x: sanitizeAxisLabels(raw?.axes?.x), y: sanitizeAxisLabels(raw?.axes?.y) };
  if (Object.keys(axes.x).length || Object.keys(axes.y).length) out.axes = axes;
  const us = sanitizePosition(raw?.us);
  if (Object.keys(us).length) out.us = us;
  return out;
}

function sanitizeEquity(raw) {
  const factors = [];
  const factorKeys = new Set();
  for (const row of Array.isArray(raw?.factors) ? raw.factors : []) {
    const label = cleanLine(row?.label, 60);
    if (!label || !isKey(row?.key) || factorKeys.has(row.key)) continue;
    factorKeys.add(row.key);
    factors.push({ key: row.key, label, weight: intInRange(row?.weight, 0, 10) ?? 5 });
    if (factors.length >= 10) break;
  }
  const founders = [];
  const founderIds = new Set();
  for (const row of Array.isArray(raw?.founders) ? raw.founders : []) {
    const name = cleanLine(row?.name, 80);
    if (!name || !isRowId(row?.id) || founderIds.has(row.id)) continue;
    founderIds.add(row.id);
    founders.push({ id: row.id, name });
    if (founders.length >= 10) break;
  }
  const scores = {};
  for (const [key, value] of Object.entries(raw?.scores || {})) {
    const [factorKey, founderId] = key.split(':');
    const n = intInRange(value, 0, 10);
    if (n !== null && factorKeys.has(factorKey) && founderIds.has(founderId)) scores[key] = n;
  }
  const out = {};
  if (factors.length) out.factors = factors;
  if (founders.length) out.founders = founders;
  if (Object.keys(scores).length) out.scores = scores;
  return out;
}

// Metodo Demmler: ogni fondatore riceve la sua parte di somma(peso del fattore x punteggio).
export function equitySplit(data) {
  const factors = data?.factors || [];
  const founders = data?.founders || [];
  const totals = founders.map((f) => ({
    id: f.id,
    name: f.name,
    points: factors.reduce((sum, factor) => sum + factor.weight * (data?.scores?.[`${factor.key}:${f.id}`] || 0), 0),
  }));
  const all = totals.reduce((sum, t) => sum + t.points, 0);
  return totals.map((t) => ({ ...t, percent: all ? (t.points / all) * 100 : null }));
}

function sanitizeCriteria(data) {
  const seen = new Set();
  const criteria = [];
  for (const row of Array.isArray(data?.criteria) ? data.criteria : []) {
    const label = cleanLine(row?.label, 80);
    if (!label) continue;
    let key = isKey(row?.key) ? row.key : slugKey(label);
    while (seen.has(key)) key = `${key}-x`.slice(0, 60);
    seen.add(key);
    criteria.push({
      key,
      label,
      description: cleanLine(row?.description, 240),
      weight: intInRange(row?.weight, 0, 5) ?? 1,
    });
    if (criteria.length >= 30) break;
  }
  return { criteria };
}

function sanitizeScore(data) {
  const scores = {};
  const notes = {};
  for (const [ideaId, values] of Object.entries(data?.scores || {})) {
    if (!isUuid(ideaId) || !values || typeof values !== 'object') continue;
    const clean = {};
    for (const [key, value] of Object.entries(values)) {
      const n = intInRange(value, 1, 5);
      if (isKey(key) && n !== null) clean[key] = n;
    }
    if (Object.keys(clean).length) scores[ideaId] = clean;
  }
  for (const [ideaId, note] of Object.entries(data?.notes || {})) {
    const clean = cleanText(note, 2000);
    if (isUuid(ideaId) && clean) notes[ideaId] = clean;
  }
  return { scores, notes };
}

// Fotografia della valutazione: criteri, idee e voti di tutti così com'erano in quel momento.
function sanitizeScoreSnap(data) {
  const { criteria } = sanitizeCriteria(data);
  const keys = new Set(criteria.map((c) => c.key));
  const ideas = [];
  const ideaIds = new Set();
  for (const row of Array.isArray(data?.ideas) ? data.ideas : []) {
    const title = cleanLine(row?.title, LIMITS.title);
    if (!isUuid(row?.id) || ideaIds.has(row.id) || !title) continue;
    ideaIds.add(row.id);
    const status = KINDS.idea.statuses.some(([v]) => v === row.status) ? row.status : defaultStatus('idea');
    ideas.push({ id: row.id, title, status });
    if (ideas.length >= 200) break;
  }
  const votes = {};
  const names = {};
  for (const [memberId, byIdea] of Object.entries(data?.votes || {})) {
    if (!isUuid(memberId) || !byIdea || typeof byIdea !== 'object') continue;
    const clean = {};
    for (const [ideaId, values] of Object.entries(byIdea)) {
      if (!ideaIds.has(ideaId) || !values || typeof values !== 'object') continue;
      const row = {};
      for (const [key, value] of Object.entries(values)) {
        const n = intInRange(value, 1, 5);
        if (keys.has(key) && n !== null) row[key] = n;
      }
      if (Object.keys(row).length) clean[ideaId] = row;
    }
    if (!Object.keys(clean).length) continue;
    votes[memberId] = clean;
    const name = cleanLine(data?.names?.[memberId], LIMITS.displayName);
    if (name) names[memberId] = name;
    if (Object.keys(votes).length >= 50) break;
  }
  return { criteria, ideas, votes, names };
}

function sanitizeAxis(list) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(list) ? list : []) {
    const label = cleanLine(row?.label, 80);
    const id = typeof row?.id === 'string' && /^[a-z0-9-]{1,40}$/.test(row.id) ? row.id : null;
    if (!label || !id || seen.has(id)) continue;
    seen.add(id);
    const axis = { id, label };
    // Chi nel team ha questa competenza (righe) o conosce questo settore (colonne), più eventuali persone esterne.
    const people = uniqueUuids(row?.people, 20);
    const others = cleanLine(row?.others, 200);
    if (people.length) axis.people = people;
    if (others) axis.others = others;
    out.push(axis);
    if (out.length >= 20) break;
  }
  return out;
}

function sanitizeGenerator(data) {
  const rows = sanitizeAxis(data?.rows);
  const cols = sanitizeAxis(data?.cols);
  const rowIds = new Set(rows.map((r) => r.id));
  const colIds = new Set(cols.map((c) => c.id));
  const cells = {};
  for (const [key, cell] of Object.entries(data?.cells || {})) {
    const [rowId, colId] = key.split(':');
    if (!rowIds.has(rowId) || !colIds.has(colId)) continue;
    const text = cleanText(cell?.text, 4000);
    const potential = intInRange(cell?.potential, 0, 3) ?? 0;
    if (text || potential) cells[key] = { text, potential };
  }
  return { rows, cols, cells };
}

const pick = (list, value, fallback) => (list.some(([v]) => v === value) ? value : fallback);

function sanitizeOptions(list) {
  const out = [];
  const ids = new Set();
  for (const row of Array.isArray(list) ? list : []) {
    const label = cleanLine(row?.label, SURVEY_LIMITS.option);
    if (!label || !isRowId(row?.id) || ids.has(row.id) || row.id === SURVEY_PREFER_NOT) continue;
    ids.add(row.id);
    out.push({ id: row.id, label });
    if (out.length >= SURVEY_LIMITS.options) break;
  }
  return out;
}

function sanitizeScale(raw) {
  const points = intInRange(raw?.points, 5, 7) === 7 ? 7 : 5;
  const scale = { points };
  const minLabel = cleanLine(raw?.min_label, SURVEY_LIMITS.scaleLabel);
  const maxLabel = cleanLine(raw?.max_label, SURVEY_LIMITS.scaleLabel);
  if (minLabel) scale.min_label = minLabel;
  if (maxLabel) scale.max_label = maxLabel;
  // Un'etichetta per ogni punto, oppure nessuna.
  if (Array.isArray(raw?.labels) && raw.labels.length === points) {
    const labels = raw.labels.map((label) => cleanLine(label, SURVEY_LIMITS.scaleLabel));
    if (labels.some(Boolean)) scale.labels = labels;
  }
  return scale;
}

function sanitizeNumberRange(raw) {
  let min = intInRange(raw?.min, -SURVEY_LIMITS.number, SURVEY_LIMITS.number);
  let max = intInRange(raw?.max, -SURVEY_LIMITS.number, SURVEY_LIMITS.number);
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  const out = {};
  if (min !== null) out.min = min;
  if (max !== null) out.max = max;
  return out;
}

// Al massimo una domanda email: è l'unica che finisce nella colonna email delle risposte.
function sanitizeQuestions(list) {
  const out = [];
  const ids = new Set();
  let hasEmail = false;
  for (const row of Array.isArray(list) ? list : []) {
    const type = pick(QUESTION_TYPES, row?.type, null);
    const label = cleanLine(row?.label, SURVEY_LIMITS.label);
    if (!type || !label || !isRowId(row?.id) || ids.has(row.id) || (type === 'email' && hasEmail)) continue;
    ids.add(row.id);
    if (type === 'email') hasEmail = true;
    const question = { id: row.id, type, label };
    const help = cleanText(row?.help, SURVEY_LIMITS.help);
    if (help) question.help = help;
    if (type !== 'sezione') { // i18n-ignore
      question.required = row?.required === true;
      question.role = pick(QUESTION_ROLES, row?.role, 'altro');
    }
    if (type === 'scelta' || type === 'scelte') {
      question.options = sanitizeOptions(row?.options);
      question.allow_other = row?.allow_other === true;
      // La voce con il campo di testo si può rinominare (per esempio «Un software o un'app») e avere un esempio nel campo.
      const otherLabel = question.allow_other ? cleanLine(row?.other_label, SURVEY_LIMITS.option) : '';
      const otherPlaceholder = question.allow_other ? cleanLine(row?.other_placeholder, SURVEY_LIMITS.option) : '';
      if (otherLabel) question.other_label = otherLabel;
      if (otherPlaceholder) question.other_placeholder = otherPlaceholder;
      question.prefer_not = row?.prefer_not === true;
    }
    if (type === 'scala') question.scale = sanitizeScale(row?.scale);
    if (type === 'numero') question.number = sanitizeNumberRange(row?.number);
    out.push(question);
    if (out.length >= SURVEY_LIMITS.questions) break;
  }
  return out;
}

// Solo tema e colore: caratteri, immagini o CSS liberi aprirebbero la pagina pubblica a contenuti estranei.
function sanitizeAppearance(raw) {
  const accent = typeof raw?.accent === 'string' ? raw.accent.toLowerCase() : '';
  return {
    theme: pick(SURVEY_THEMES, raw?.theme, 'automatico'),
    accent: /^#[0-9a-f]{6}$/.test(accent) ? accent : SURVEY_ACCENT,
  };
}

function sanitizeCover(raw) {
  if (typeof raw?.path !== 'string' || !SURVEY_COVER_PATH_RE.test(raw.path)) return null;
  return { path: raw.path, alt: cleanLine(raw.alt, SURVEY_LIMITS.coverAlt) };
}

function sanitizeSurvey(raw) {
  const data = {};
  const intro = cleanText(raw.intro, SURVEY_LIMITS.intro);
  const privacy = cleanText(raw.privacy, SURVEY_LIMITS.privacy);
  const thanks = cleanText(raw.thanks, SURVEY_LIMITS.thanks);
  const thanksContact = cleanText(raw.thanks_contact, SURVEY_LIMITS.thanks);
  if (intro) data.intro = intro;
  if (privacy) data.privacy = privacy;
  if (thanks) data.thanks = thanks;
  if (thanksContact) data.thanks_contact = thanksContact;
  data.layout = pick(SURVEY_LAYOUTS, raw.layout, 'una'); // i18n-ignore
  data.progress = pick(SURVEY_PROGRESS, raw.progress, 'contatore');
  data.show_time = typeof raw.show_time === 'boolean' ? raw.show_time : true;
  data.appearance = sanitizeAppearance(raw.appearance);
  const cover = sanitizeCover(raw.cover);
  if (cover) data.cover = cover;
  const thanksImage = sanitizeCover(raw.thanks_image);
  if (thanksImage) data.thanks_image = thanksImage;
  if (isUuid(raw.experiment_id)) data.experiment_id = raw.experiment_id;
  if (typeof raw.token === 'string' && SURVEY_TOKEN_RE.test(raw.token)) data.token = raw.token;
  data.questions = sanitizeQuestions(raw.questions);
  return data;
}

// Valido per costruzione: ogni salvataggio passa da qui e i campi sconosciuti o malformati vengono scartati.
export function sanitizeSnapshot(kind, snapshot) {
  const def = KINDS[kind];
  // Solo un errore di programmazione arriva qui: il messaggio è per chi sviluppa.
  if (!def) throw new Error(`Unknown kind: ${kind}`);
  const raw = snapshot?.data && typeof snapshot.data === 'object' ? snapshot.data : {};
  let data = {};

  if (kind === 'criteria') data = sanitizeCriteria(raw);
  else if (kind === 'score') data = sanitizeScore(raw);
  else if (kind === 'scoresnap') data = sanitizeScoreSnap(raw);
  else if (kind === 'generator') data = sanitizeGenerator(raw);
  else if (kind === 'survey') data = sanitizeSurvey(raw);
  else if (kind === 'expensegroup') data = sanitizeExpenseGroup(raw);
  else if (kind === 'expense') data = sanitizeExpense(raw);
  else if (kind === 'availability') data = sanitizeAvailability(raw);
  else if (kind === 'timesheet') data = sanitizeTimesheet(raw);
  else {
    for (const f of def.fields) {
      const value = sanitizeField(f, raw[f.key]);
      if (value !== undefined) data[f.key] = value;
    }
    if (kind === 'canvas') {
      const validated = {};
      for (const block of CANVAS_BLOCKS) {
        if (raw.validated?.[block.key] === true) validated[block.key] = true;
      }
      if (Object.keys(validated).length) data.validated = validated;
    }
    if (kind === 'idea' && typeof raw.origin === 'string' && /^[a-z0-9-]{1,40}:[a-z0-9-]{1,40}$/.test(raw.origin)) {
      data.origin = raw.origin;
    }
    if (kind === 'idea') {
      const roadmap = sanitizeRoadmap(raw.roadmap);
      if (roadmap) data.roadmap = roadmap;
    }
    if (kind === 'competitors') Object.assign(data, sanitizeCompetitors(raw));
    if (kind === 'equity') Object.assign(data, sanitizeEquity(raw));
  }

  const status = def.statuses
    ? def.statuses.some(([v]) => v === snapshot?.status)
      ? snapshot.status
      : defaultStatus(kind)
    : null;
  let ideaId = isUuid(snapshot?.idea_id) ? snapshot.idea_id : null;
  if (!IDEA_CHILD_KINDS.includes(kind)) ideaId = null;

  return {
    title: cleanLine(snapshot?.title, LIMITS.title),
    status,
    idea_id: ideaId,
    data,
  };
}

export function snapshotProblem(kind, snapshot) {
  const def = KINDS[kind];
  const problems = T.problems;
  if ((BOARD_KINDS.includes(kind) || EXPENSE_KINDS.includes(kind)) && !snapshot.title) return problems.missingField(def.titleLabel);
  if (kind === 'expense' && !snapshot.data.group) return problems.missingGroup;
  if (kind === 'expense' && !snapshot.data.amount) return problems.missingAmount;
  if (def.needsIdea && !snapshot.idea_id) return problems.missingIdea;
  if (kind === 'scoresnap' && !snapshot.title) return problems.missingSnapshotName;
  if (kind === 'timesheet') return timesheetProblem(snapshot.data);
  return null;
}

export function autoInterviewTitle(data) {
  const parts = [data.role, data.organization].filter(Boolean);
  return parts.length ? parts.join(', ') : KINDS.interview.label;
}

const TOP_LABELS = { title: null, status: H.status, idea_id: H.linkedIdea };

// Le parti di un percorso dello storico si leggono come un sentiero: «Voti › Idea alfa › Mercato».
const trail = (...parts) => parts.join(' › ');
const own = (map, key) => (Object.hasOwn(map, key) ? map[key] : undefined);

// Etichetta leggibile per un percorso dello storico, come "data.problem" o "data.scores.<id>.mercato".
export function describePath(kind, path, ctx = {}) {
  if (path === 'title') return KINDS[kind]?.titleLabel || T.title;
  if (path in TOP_LABELS) return TOP_LABELS[path];
  const rest = path.replace(/^data\./, '');
  const [head, ...tail] = rest.split('.');

  if (kind === 'score') {
    const [, ideaId, criterion] = rest.split('.');
    const ideaTitle = ctx.ideaTitle?.(ideaId) || KINDS.idea.label;
    if (head === 'notes') return trail(H.notes, ideaTitle);
    // Un conflitto può riguardare tutti i voti di un'idea, senza criterio.
    if (!criterion) return trail(H.votes, ideaTitle);
    return trail(H.votes, ideaTitle, ctx.criterionLabel?.(criterion) || criterion);
  }
  if (kind === 'criteria') {
    if (rest === 'criteria') return H.criteria;
    if (rest === 'criteria.#order') return trail(H.criteria, H.order);
    const match = rest.match(/^criteria#([^.]+)\.(\w+)$/);
    if (match) return trail(H.criteria, ctx.criterionLabel?.(match[1]) || match[1], own(H.criterionParts, match[2]) || match[2]);
  }
  if (kind === 'generator') {
    const axis = head.match(/^(rows|cols)(?:#(.+))?$/);
    if (axis) {
      const name = axis[1] === 'rows' ? H.rows : H.cols;
      if (rest.endsWith('#order')) return trail(name, H.order);
      if (!axis[2]) return name;
      const label = ctx.axisLabel?.(axis[2]) || axis[2];
      return tail[0] === 'people' || tail[0] === 'others' ? trail(name, label, H.people) : trail(name, label);
    }
    if (head === 'cells') {
      const [rowId, colId] = (tail[0] || '').split(':');
      const cell = `${ctx.axisLabel?.(rowId) || rowId} × ${ctx.axisLabel?.(colId) || colId}`;
      return tail[1] === 'potential' ? trail(cell, H.potential) : cell;
    }
  }
  if (kind === 'competitors') {
    if (head.startsWith('features')) return H.competitors.features;
    if (head.startsWith('rivals')) return H.competitors.rivals;
    if (head === 'cells') return H.competitors.cells;
    if (head === 'axes') return H.competitors.axes;
    if (head === 'us') return H.competitors.us;
  }
  if (kind === 'equity') {
    if (head.startsWith('factors')) return H.equity.factors;
    if (head.startsWith('founders')) return H.equity.founders;
    if (head === 'scores') return H.equity.scores;
  }
  if (kind === 'scoresnap') return own(H.snapshot, head.split('#')[0]) || head;
  if (kind === 'survey') {
    if (head === 'questions') return tail[0] === '#order' ? trail(H.questions, H.order) : H.questions;
    const question = head.match(/^questions#(.+)$/);
    if (question) {
      const name = ctx.questionLabel?.(question[1]) || question[1];
      const part = own(H.questionParts, (tail[0] || '').split('#')[0]);
      return part ? trail(H.questions, name, part) : trail(H.questions, name);
    }
    if (head === 'appearance') {
      if (tail[0] === 'theme') return trail(H.appearance, H.theme);
      if (tail[0] === 'accent') return trail(H.appearance, H.accent);
      return H.appearance;
    }
    if (head === 'show_time') return H.showTime;
    if (head === 'token') return H.token;
    if (head === 'cover' || head === 'thanks_image') {
      const image = head === 'cover' ? H.coverImage : H.thanksImage;
      return tail[0] === 'alt' ? trail(image, H.imageAlt) : image;
    }
  }
  if (kind === 'expensegroup' && head.startsWith('people')) return H.expensePeople;
  if (kind === 'expense') {
    if (head === 'group') return H.group;
    if (head === 'split') {
      if (tail[0] === 'mode') return trail(H.split, H.splitMode);
      const person = tail[0] === 'shares' && tail[1] ? ctx.personName?.(tail[1]) : null;
      return person ? trail(H.split, person) : H.split;
    }
  }
  if (kind === 'availability') {
    if (head === 'busy') return tail[0] ? trail(H.busy, dayName(tail[0])) : H.busy;
    if (head === 'until') return H.busyUntil;
    if (head === 'weeks') return H.weeks;
    const week = head.match(/^weeks#(.+)$/);
    if (week) {
      const name = H.weekOf(week[1], shortDate(week[1]));
      return tail[1] ? trail(name, dayName(tail[1])) : name;
    }
  }
  if (kind === 'timesheet') {
    if (head === 'week') return H.timesheetWeek;
    if (head === 'pledge') return H.pledge;
    if (head === 'entries') return tail[0] === '#order' ? trail(H.rows, H.order) : H.rows;
    if (head.startsWith('entries#')) return trail(H.row, own(H.rowParts, tail[0]) || H.rowPart);
  }
  if (kind === 'canvas' && head === 'validated') {
    if (!tail[0]) return H.validatedBlocks;
    return trail(CANVAS_BLOCKS.find((b) => b.key === tail[0])?.label || tail[0], H.validated);
  }
  if (kind === 'idea' && head === 'origin') return H.origin;
  if (kind === 'idea' && head === 'roadmap') return tail[0] ? trail(H.roadmap, ctx.roadmapStep?.(tail[0]) || tail[0]) : H.roadmap;
  return fieldOf(kind, head)?.label || head;
}

export function formatValue(kind, path, value, ctx = {}) {
  if (value === undefined || value === null) return '';
  const member = (id) => ctx.memberName?.(id) || tx.common.roles.member;
  if (path === 'status') return statusLabel(kind, value);
  if (path === 'idea_id') return ctx.ideaTitle?.(value) || KINDS.idea.label;
  if (kind === 'idea' && path.startsWith('data.roadmap.')) {
    const mark = parseRoadmapMark(value);
    if (!mark) return '';
    return mark.state === 'skip' ? H.roadmapSkipped(member(mark.by)) : H.roadmapDone(member(mark.by));
  }
  if (kind === 'survey' && path === 'data.appearance.theme') return SURVEY_THEMES.find(([v]) => v === value)?.[1] ?? value;
  // Type and topic of a question are stored as keys: their labels show, as for the theme.
  if (kind === 'survey' && /^data\.questions#[^.]+\.type$/.test(path)) return QUESTION_TYPES.find(([v]) => v === value)?.[1] ?? value;
  if (kind === 'survey' && /^data\.questions#[^.]+\.role$/.test(path)) return QUESTION_ROLES.find(([v]) => v === value)?.[1] ?? value;
  if (kind === 'survey' && (path === 'data.cover.path' || path === 'data.thanks_image.path')) return H.imageUploaded;
  // Un conflitto su un elenco intero: i nomi delle righe, non gli oggetti.
  if (kind === 'survey' && path === 'data.questions' && Array.isArray(value)) return value.map((q) => q?.label || q?.id || '');
  if (kind === 'criteria' && path === 'data.criteria' && Array.isArray(value)) return value.map((c) => c?.label || c?.key || '');
  if (kind === 'canvas' && path === 'data.validated' && typeof value === 'object') {
    return Object.keys(value).filter((key) => value[key] === true).map((key) => CANVAS_BLOCKS.find((b) => b.key === key)?.label || key);
  }
  if (kind === 'expense' && path === 'data.amount' && Number.isFinite(value)) return (value / 100).toLocaleString(locale, { minimumFractionDigits: 2 });
  if (kind === 'expense' && path === 'data.paid_by') return ctx.personName?.(value) || H.person;
  if (kind === 'expense' && path === 'data.split.mode') return SPLIT_MODES.find(([v]) => v === value)?.[1] ?? value;
  if (kind === 'expense' && path === 'data.group') return ctx.itemTitle?.(value) || H.group;
  if (kind === 'availability') {
    if (path === 'data.until') return fmtDate(value);
    const weekName = (key) => H.weekValue(key, shortDate(key));
    if (path === 'data.weeks.#order') return String(value).split(',').filter(Boolean).map(weekName);
    // Un conflitto su tutte le settimane arriva come array intero.
    if (path === 'data.weeks' && Array.isArray(value)) {
      return value.map((week) => {
        const days = Object.entries(sanitizeBusy(week?.busy)).map(([day, hours]) => `${dayName(day)} ${hoursText(hours)}`);
        return `${typeof week?.key === 'string' ? weekName(week.key) : H.week} (${days.join('; ') || H.noBusyHours})`;
      });
    }
    if (Array.isArray(value) && value.every(Number.isInteger)) return hoursText(value);
  }
  if (kind === 'timesheet') {
    if (path === 'data.pledge' && Number.isInteger(value)) return durationText(value);
    if (path === 'data.week') return H.weekValue(value, shortDate(value));
    if (/\.(start|end)$/.test(path) && Number.isInteger(value)) return clockText(value);
    if (path.endsWith('.area')) return areaLabel(value);
    if (path.endsWith('.day')) return dayName(value);
    // Un conflitto su tutte le righe arriva come array intero.
    if (path === 'data.entries' && Array.isArray(value)) {
      const rows = value.map(sanitizeEntry).filter(Boolean);
      return rows.length ? rows.map((e) => `${dayName(e.day)} ${clockText(e.start)}-${clockText(e.end)} (${areaLabel(e.area)})`) : [H.noRows];
    }
  }
  const key = path.replace(/^data\./, '').split('.')[0];
  const def = fieldOf(kind, key);
  if (def) {
    if (def.type === 'select') return optionLabel(def, value);
    if (def.type === 'member') return member(value);
    if (def.type === 'experiment') return ctx.itemTitle?.(value) || KINDS.experiment.label;
    if (def.type === 'interview') return ctx.itemTitle?.(value) || KINDS.interview.label;
    if (def.type === 'members') return (Array.isArray(value) ? value : [value]).map(member);
    if (def.type === 'ideas') return (Array.isArray(value) ? value : [value]).map((id) => ctx.ideaTitle?.(id) || KINDS.idea.label);
    if (def.type === 'scale') return `${value}/5`;
    if (def.type === 'money') return fmtMoney(value);
    if (def.type === 'image') return H.photo;
  }
  if (typeof value === 'boolean') return value ? H.yes : H.no;
  return value;
}

// Busy hours and hours worked have one title for everyone, fixed by the database ('Impegni', 'Ore lavorate'): the
// reader sees the name of the kind in their own language instead.
const FIXED_TITLES = { availability: () => tx.availability.itemTitle, timesheet: () => tx.timesheet.itemTitle };
export const shownTitle = (kind, title) => (Object.hasOwn(FIXED_TITLES, kind ?? '') ? FIXED_TITLES[kind]() : title);

// Gli indirizzi delle pagine non cambiano con la lingua.
export function routeFor(item) {
  if (!item) return '#/';
  if (item.kind === 'idea') return `#/idea/${item.id}`;
  if (item.kind === 'criteria' || item.kind === 'score') return '#/valutazione'; // i18n-ignore
  if (item.kind === 'scoresnap') return `#/valutazione?foto=${item.id}`; // i18n-ignore
  if (item.kind === 'generator') return '#/generatore'; // i18n-ignore
  if (item.kind === 'teamcanvas') return '#/squadra'; // i18n-ignore
  if (item.kind === 'equity') return '#/squadra/quote'; // i18n-ignore
  if (item.kind === 'availability') return '#/squadra/disponibilita'; // i18n-ignore
  if (item.kind === 'timesheet') return '#/squadra/ore'; // i18n-ignore
  if (item.kind === 'survey') return `#/questionario/${item.id}`; // i18n-ignore
  if (item.kind === 'expensegroup') return `#/spese/${item.id}`; // i18n-ignore
  if (item.kind === 'expense') return isUuid(item.data?.group) ? `#/spese/${item.data.group}?movimento=${item.id}` : '#/spese'; // i18n-ignore
  return `#/elemento/${item.id}`;
}

// I criteri proposti alla prima valutazione, nella lingua in uso: chiavi e pesi restano.
export const DEFAULT_CRITERIA = [
  ['cliente', 3],
  ['demo', 2],
  ['dati', 3],
  ['competenze', 3],
  ['mercato', 2],
  ['concorrenza', 2],
  ['difendibile', 2],
  ['team', 2],
  ['ricavi', 2],
  ['norme', 1],
].map(([key, weight]) => ({ key, label: T.defaultCriteria[key].label, description: T.defaultCriteria[key].description, weight }));
