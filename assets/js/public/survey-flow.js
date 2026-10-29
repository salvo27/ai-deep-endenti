import { PREFER_NOT } from './survey-api.js';
import { minutesLabel } from './survey-time.js';
import { accentTokens, contrastRatio, contrastText } from './survey-colors.js';

export { accentTokens, contrastRatio, contrastText };

// Logica della pagina pubblica dei questionari senza DOM né rete: schermate, avanzamento, controlli e risposte da inviare.
// I limiti rispecchiano quelli di submit_survey nel database, che resta l'unico controllo che conta.

export const LIMITS = Object.freeze({ short: 300, other: 300, long: 3000, email: 254, number: 1_000_000_000 });
export const DEFAULT_ACCENT = '#3b4bc8';
const PHONE_MAX_WIDTH = 720;

// Nella bozza, l'opzione «Altro» scelta: non può coincidere con un id di opzione, che non contiene i due punti.
// Gli id di domande e opzioni seguono le regole del database, così sono sicuri anche come id degli elementi.
export const OTHER = ':altro';
export const otherKey = (id) => `${id}:altro`;

const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
const ID_RE = /^[a-z0-9-]{1,40}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COVER_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;
const INT_RE = /^[+-]?\d+$/;
const CONTROL_RE = /[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const TYPES = new Set(['sezione', 'scelta', 'scelte', 'scala', 'numero', 'breve', 'lunga', 'email']);
const THEMES = new Set(['automatico', 'chiaro', 'scuro', 'seppia', 'contrasto']);
const PROGRESS = new Set(['contatore', 'barra', 'nessuno']);

export const MESSAGES = Object.freeze({
  required: 'Per continuare rispondi a questa domanda, per favore.',
  other: 'Scrivi la tua risposta accanto ad «Altro», per favore.',
  integer: 'Scrivi solo cifre, senza punti né virgole.',
  email: 'L\'indirizzo email non sembra completo: controllalo, per favore.',
  recontact: 'Per farti ricontattare scrivi la tua email, oppure togli la spunta.',
  huge: 'Il numero è troppo grande.',
  empty: 'Rispondi ad almeno una domanda prima di inviare.',
});

export const tooLong = (max) => `Al massimo ${max} caratteri: accorcia un po' la risposta.`;

const str = (value) => (typeof value === 'string' ? value : '');
const length = (text) => [...text].length;
// Come survey_text nel database: via i caratteri di controllo e gli spazi ai bordi.
const cleanText = (value) => str(value).replace(CONTROL_RE, '').trim();

export function tokenFromHash(hash) {
  let token = str(hash).replace(/^#/, '');
  try {
    token = decodeURIComponent(token);
  } catch {
    return null;
  }
  token = token.trim();
  return TOKEN_RE.test(token) ? token : null;
}

const isHexColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

function normalizeQuestion(q) {
  if (!q || typeof q !== 'object' || !ID_RE.test(str(q.id)) || !TYPES.has(q.type) || !str(q.label).trim()) return null;
  const out = { id: q.id, type: q.type, label: str(q.label).trim(), help: str(q.help).trim(), required: q.type !== 'sezione' && q.required === true };
  if (q.type === 'scelta' || q.type === 'scelte') {
    const seen = new Set();
    out.options = (Array.isArray(q.options) ? q.options : []).filter((o) => {
      const ok = o && ID_RE.test(str(o.id)) && o.id !== PREFER_NOT && !seen.has(o.id) && str(o.label).trim();
      if (ok) seen.add(o.id);
      return ok;
    }).map((o) => ({ id: o.id, label: o.label.trim() }));
    out.allow_other = q.allow_other === true;
    out.prefer_not = q.prefer_not === true;
    if (!out.options.length && !out.allow_other) return null;
  } else if (q.type === 'scala') {
    const points = q.scale?.points === 7 ? 7 : 5;
    const labels = Array.isArray(q.scale?.labels) && q.scale.labels.length === points ? q.scale.labels.map((l) => str(l).trim()) : null;
    out.scale = { points, min_label: str(q.scale?.min_label).trim(), max_label: str(q.scale?.max_label).trim(), labels };
  } else if (q.type === 'numero') {
    const bound = (v) => (Number.isInteger(v) && Math.abs(v) <= LIMITS.number ? v : null);
    let min = bound(q.number?.min);
    let max = bound(q.number?.max);
    if (min !== null && max !== null && min > max) [min, max] = [max, min];
    out.number = { min, max };
  }
  return out;
}

// Il questionario come arriva da public_survey, ripulito: valori sconosciuti diventano quelli predefiniti.
export function normalizeSurvey(data) {
  const ids = new Set();
  const questions = (Array.isArray(data?.questions) ? data.questions : []).map(normalizeQuestion).filter((q) => {
    if (!q || ids.has(q.id)) return false;
    ids.add(q.id);
    return true;
  });
  const theme = data?.appearance?.theme;
  const accent = isHexColor(data?.appearance?.accent) ? data.appearance.accent.toLowerCase() : DEFAULT_ACCENT;
  return {
    title: str(data?.title).trim() || 'Questionario',
    intro: str(data?.intro).trim(),
    privacy: str(data?.privacy).trim(),
    thanks: str(data?.thanks).trim(),
    layout: data?.layout === 'sezioni' ? 'sezioni' : 'una',
    progress: PROGRESS.has(data?.progress) ? data.progress : 'contatore',
    show_time: data?.show_time !== false,
    median_seconds: Number.isFinite(data?.median_seconds) && data.median_seconds > 0 ? data.median_seconds : null,
    cover: COVER_RE.test(str(data?.cover?.path)) ? { path: data.cover.path, alt: str(data.cover.alt).trim().slice(0, 200) } : null,
    appearance: { theme: THEMES.has(theme) ? theme : 'automatico', accent, onAccent: contrastText(accent) },
    questions,
  };
}

// Una schermata per domanda («una») o per sezione («sezioni»). Una sezione non è mai una schermata da sola:
// è il titolo delle domande che la seguono, e senza domande dopo non compare.
export function buildScreens(survey) {
  const screens = [];
  let section = null;
  let current = null;
  for (const q of survey.questions) {
    if (q.type === 'sezione') {
      section = q;
      current = null;
    } else if (survey.layout === 'sezioni') {
      if (!current) {
        current = { section, questions: [] };
        screens.push(current);
      }
      current.questions.push(q);
    } else {
      screens.push({ section, questions: [q] });
    }
  }
  return screens;
}

// Avanzamento lineare e onesto: conta solo le domande a cui si risponde, mai le sezioni.
export function progressFor(screens, index) {
  const total = screens.reduce((n, s) => n + s.questions.length, 0);
  const first = screens.slice(0, index).reduce((n, s) => n + s.questions.length, 0) + 1;
  const last = first + (screens[index]?.questions.length ?? 1) - 1;
  const text = first === last ? `Domanda ${first} di ${total}` : `Domande ${first}-${last} di ${total}`;
  return { first, last, total, ratio: total ? last / total : 0, text };
}

export const durationText = (minutes) => `${minutes === 1 ? 'Ci vorrà' : 'Ci vorranno'} ${minutesLabel(minutes)}.`;

export const deviceFor = (width) => (width <= PHONE_MAX_WIDTH ? 'telefono' : 'computer');

export const emailQuestion = (survey) => survey.questions.find((q) => q.type === 'email') || null;

export function numberHint(number) {
  const { min = null, max = null } = number || {};
  if (min !== null && max !== null) return `Un numero intero da ${min} a ${max}.`;
  if (min !== null) return `Un numero intero, almeno ${min}.`;
  if (max !== null) return `Un numero intero, al massimo ${max}.`;
  return 'Un numero intero.';
}

function rangeMessage({ min, max }) {
  if (min !== null && max !== null) return `Scrivi un numero da ${min} a ${max}.`;
  return min !== null ? `Scrivi un numero uguale o maggiore di ${min}.` : `Scrivi un numero uguale o minore di ${max}.`;
}

// Numero intero da quello che si è scritto: { value } oppure { error }, null se il campo è vuoto.
export function parseInteger(raw, number = {}) {
  const text = str(raw).trim();
  if (!text) return null;
  if (!INT_RE.test(text)) return { error: MESSAGES.integer };
  const value = Number(text);
  const bounds = { min: number.min ?? null, max: number.max ?? null };
  if (Math.abs(value) > LIMITS.number) return { error: MESSAGES.huge };
  if ((bounds.min !== null && value < bounds.min) || (bounds.max !== null && value > bounds.max)) return { error: rangeMessage(bounds) };
  return { value: value === 0 ? 0 : value };
}

const isOption = (q, value) => typeof value === 'string' && (q.options.some((o) => o.id === value) || (q.prefer_not && value === PREFER_NOT));

// Le scelte multiple valide della bozza, nell'ordine delle opzioni; «Preferisco non rispondere» esclude tutto il resto.
export function selectedChoices(q, value) {
  const set = new Set(Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []);
  if (q.prefer_not && set.has(PREFER_NOT)) return [PREFER_NOT];
  const list = q.options.filter((o) => set.has(o.id)).map((o) => o.id);
  if (q.allow_other && set.has(OTHER)) list.push(OTHER);
  return list;
}

export function toggleChoice(list, value, checked) {
  const current = Array.isArray(list) ? list.filter((v) => typeof v === 'string' && v !== value) : [];
  if (!checked) return current;
  if (value === PREFER_NOT) return [PREFER_NOT];
  return [...current.filter((v) => v !== PREFER_NOT), value];
}

function otherError(q, draft, chosen) {
  if (!chosen) return null;
  const text = cleanText(draft[otherKey(q.id)]);
  if (length(text) > LIMITS.other) return tooLong(LIMITS.other);
  return null;
}

// Il messaggio da mostrare sotto la domanda, o null se va bene. Le domande sono facoltative salvo required.
export function validateQuestion(q, draft = {}, { recontact = false } = {}) {
  const value = draft[q.id];
  switch (q.type) {
    case 'scelta': {
      const chosenOther = q.allow_other && value === OTHER;
      const error = otherError(q, draft, chosenOther);
      if (error) return error;
      if (chosenOther) return q.required && !cleanText(draft[otherKey(q.id)]) ? MESSAGES.other : null;
      return q.required && !isOption(q, value) ? MESSAGES.required : null;
    }
    case 'scelte': {
      const list = selectedChoices(q, value);
      const chosenOther = list.includes(OTHER);
      const error = otherError(q, draft, chosenOther);
      if (error) return error;
      const answered = list.some((v) => v !== OTHER) || (chosenOther && cleanText(draft[otherKey(q.id)]));
      if (!q.required || answered) return null;
      return chosenOther ? MESSAGES.other : MESSAGES.required;
    }
    case 'scala':
      return q.required && !(Number.isInteger(value) && value >= 1 && value <= q.scale.points) ? MESSAGES.required : null;
    case 'numero': {
      const parsed = parseInteger(value, q.number);
      if (!parsed) return q.required ? MESSAGES.required : null;
      return parsed.error || null;
    }
    case 'breve':
    case 'lunga': {
      const text = cleanText(value);
      const max = q.type === 'breve' ? LIMITS.short : LIMITS.long;
      if (length(text) > max) return tooLong(max);
      return q.required && !text ? MESSAGES.required : null;
    }
    case 'email': {
      const text = cleanText(value);
      if (!text) return recontact ? MESSAGES.recontact : q.required ? MESSAGES.required : null;
      return length(text) > LIMITS.email || !EMAIL_RE.test(text) ? MESSAGES.email : null;
    }
    default:
      return null;
  }
}

export function validateScreen(screen, draft, options) {
  return screen.questions.map((q) => ({ id: q.id, message: validateQuestion(q, draft, options) })).filter((e) => e.message);
}

// Prima dell'ultimo invio si ricontrolla tutto: dopo una ripresa una domanda obbligatoria può essere rimasta vuota.
export function firstInvalidScreen(screens, draft, options) {
  for (const [index, screen] of screens.entries()) {
    const errors = validateScreen(screen, draft, options);
    if (errors.length) return { index, errors };
  }
  return null;
}

export const screenOf = (screens, questionId) => screens.findIndex((s) => s.questions.some((q) => q.id === questionId));

// Le risposte nel formato di submit_survey, solo quelle valide: un valore sbagliato non fa fallire il salvataggio di tutto.
export function collectAnswers(questions, draft = {}) {
  const answers = {};
  for (const q of questions) {
    const value = draft[q.id];
    const other = cleanText(draft[otherKey(q.id)]);
    const otherOk = other && length(other) <= LIMITS.other;
    if (q.type === 'scelta') {
      if (q.allow_other && value === OTHER) {
        if (otherOk) answers[otherKey(q.id)] = other;
      } else if (isOption(q, value)) {
        answers[q.id] = value;
      }
    } else if (q.type === 'scelte') {
      const list = selectedChoices(q, value);
      const ids = list.filter((v) => v !== OTHER);
      if (ids.length) answers[q.id] = ids;
      if (list.includes(OTHER) && otherOk) answers[otherKey(q.id)] = other;
    } else if (q.type === 'scala') {
      if (Number.isInteger(value) && value >= 1 && value <= q.scale.points) answers[q.id] = value;
    } else if (q.type === 'numero') {
      const parsed = parseInteger(value, q.number);
      if (parsed && !parsed.error) answers[q.id] = parsed.value;
    } else if (q.type === 'breve' || q.type === 'lunga') {
      const text = cleanText(value);
      if (text && length(text) <= (q.type === 'breve' ? LIMITS.short : LIMITS.long)) answers[q.id] = text;
    } else if (q.type === 'email') {
      const text = cleanText(value);
      if (text && length(text) <= LIMITS.email && EMAIL_RE.test(text)) answers[q.id] = text;
    }
  }
  return answers;
}

// meta di submit_survey. Il consenso al ricontatto parte solo insieme a un indirizzo; durata e dispositivo all'ultimo invio.
export function buildMeta(survey, answers, { session, final = false, startedAt, now = Date.now(), width, recontact = false, website = '' }) {
  const meta = { session, final, website: str(website) };
  const email = emailQuestion(survey);
  if (email && typeof answers[email.id] === 'string') meta.recontact = recontact === true;
  if (final) {
    meta.duration_seconds = Number.isFinite(startedAt) ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;
    meta.device = deviceFor(width);
  }
  return meta;
}

export const storageKey = (token) => `questionario:${token}`;
// Segno lasciato sul dispositivo dopo l'invio, con la sola data: chi ha già risposto non ricomincia da capo.
export const sentKey = (token) => `questionario:${token}:inviato`;
// Segno della scheda aperta: dopo un ricaricamento si riprende subito, a una nuova visita si saluta prima.
export const tabKey = (token) => `questionario:${token}:scheda`;
export const KEEP_DAYS = 30;

// Domande senza una risposta valida, nell'ordine del questionario.
export function unanswered(questions, draft = {}) {
  const answers = collectAnswers(questions, draft);
  return questions.filter((q) => q.type !== 'sezione' && !(q.id in answers) && !(otherKey(q.id) in answers));
}

// Compilazione salvata sul dispositivo: valida solo se ben formata, non più vecchia di 30 giorni,
// con la schermata entro quelle del questionario.
export function readStored(raw, screenCount, now = Date.now()) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || !UUID_RE.test(str(data.session)) || screenCount < 1) return null;
  if (Number.isFinite(data.savedAt) && now - data.savedAt > KEEP_DAYS * 86_400_000) return null;
  const draft = data.draft && typeof data.draft === 'object' && !Array.isArray(data.draft) ? data.draft : {};
  const index = Number.isInteger(data.index) ? Math.min(Math.max(data.index, 0), screenCount - 1) : 0;
  return {
    session: data.session,
    index,
    draft,
    recontact: data.recontact === true,
    startedAt: Number.isFinite(data.startedAt) ? data.startedAt : null,
  };
}
