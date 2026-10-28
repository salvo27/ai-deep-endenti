// Statistiche delle risposte a un questionario: funzioni pure, nessun accesso ai dati.
// Le segnalazioni di qualità non cancellano mai nulla: servono solo a escludere, a scelta, le risposte sospette.
import { SURVEY_PREFER_NOT } from './schema.js';
import { countWords } from './public/survey-time.js';

export const QUALITY = Object.freeze({
  speedIndex: 2, // Leiner 2019
  speedIndexMin: 20,
  secondsPerWord: 0.3, // Zhang e Conrad 2014
  straightLine: 3,
  openWords: 3,
  answeredShare: 0.5, // AAPOR 2023: sotto la metà delle domande è un'interruzione
});

export const FLAG_LABELS = {
  veloce: 'Molto più veloce degli altri',
  lettura: 'Troppo veloce per leggere le domande',
  uguali: 'Stessa risposta a tutte le scale',
  aperta: 'Risposta aperta vuota o di meno di 3 parole',
  saltate: 'Più di metà delle domande saltate',
};

export const DEVICE_LABELS = { telefono: 'Telefono', computer: 'Computer' };

export function median(values) {
  const list = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

export const share = (count, total) => (total > 0 ? count / total : null);

export const askedQuestions = (survey) => (Array.isArray(survey?.questions) ? survey.questions : []).filter((q) => q.type !== 'sezione');

const answersOf = (response) => (response?.answers && typeof response.answers === 'object' ? response.answers : {});
const otherText = (q, response) => {
  const value = answersOf(response)[`${q.id}:altro`];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

export function hasAnswer(q, response) {
  if (q.type === 'email') return Boolean(response?.email);
  const value = answersOf(response)[q.id];
  const given = value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && !value.length);
  return given || ((q.type === 'scelta' || q.type === 'scelte') && otherText(q, response) !== null);
}

// Numero progressivo per data di arrivo: è l'unico identificativo che si mostra o si esporta.
export function numberResponses(responses) {
  return [...(responses || [])]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)))
    .map((response, index) => ({ ...response, n: index + 1 }));
}

function lastAnsweredIndex(questions, response) {
  let last = -1;
  questions.forEach((q, index) => {
    if (hasAnswer(q, response)) last = index;
  });
  return last;
}

const optionLabel = (q, id) => (id === SURVEY_PREFER_NOT ? 'Preferisco non rispondere' : q.options?.find((o) => o.id === id)?.label ?? null);

export function scaleLabel(q, value) {
  return q.scale?.labels?.[value - 1] || (value === 1 ? q.scale?.min_label : value === q.scale?.points ? q.scale?.max_label : '') || '';
}

// Risposta leggibile: etichette delle opzioni, «Altro: testo», numeri, testo. Null se la domanda non ha risposta.
export function answerText(q, response, { scaleWithLabel = false } = {}) {
  if (!hasAnswer(q, response)) return null;
  const value = answersOf(response)[q.id];
  const other = otherText(q, response);
  switch (q.type) {
    case 'email':
      return response.email;
    case 'scelta':
    case 'scelte': {
      const ids = Array.isArray(value) ? value : value ? [value] : [];
      const parts = ids.map((id) => optionLabel(q, id)).filter(Boolean);
      if (other) parts.push(`Altro: ${other}`);
      return parts.join('; ');
    }
    case 'scala': {
      const label = scaleWithLabel ? scaleLabel(q, value) : '';
      return label ? `${value} (${label})` : value;
    }
    default:
      return value;
  }
}

// Base di ogni domanda: le compilazioni complete più quelle interrotte che sono arrivate almeno fin lì.
export function questionStats(survey, responses) {
  const questions = askedQuestions(survey);
  const last = new Map(responses.map((r) => [r, lastAnsweredIndex(questions, r)]));
  return questions.map((q, index) => {
    const reached = responses.filter((r) => r.completed || last.get(r) >= index);
    const answered = reached.filter((r) => hasAnswer(q, r));
    const stat = {
      question: q,
      reached: reached.length,
      answered: answered.length,
      skipped: reached.length - answered.length,
      breakoff: responses.filter((r) => !r.completed && last.get(r) === index).length,
    };
    if (q.type === 'scelta' || q.type === 'scelte') {
      const counts = new Map();
      for (const r of answered) {
        const value = answersOf(r)[q.id];
        for (const id of Array.isArray(value) ? value : value ? [value] : []) counts.set(id, (counts.get(id) || 0) + 1);
      }
      stat.options = (q.options || []).map((o) => ({ id: o.id, label: o.label, count: counts.get(o.id) || 0 }));
      stat.other = answered.filter((r) => otherText(q, r) !== null).map((r) => ({ n: r.n, text: otherText(q, r) }));
      stat.preferNot = counts.get(SURVEY_PREFER_NOT) || 0;
      stat.multiple = q.type === 'scelte';
    } else if (q.type === 'scala') {
      const points = q.scale?.points === 7 ? 7 : 5;
      const values = answered.map((r) => answersOf(r)[q.id]).filter(Number.isInteger);
      stat.distribution = Array.from({ length: points }, (_, i) => ({ value: i + 1, label: scaleLabel(q, i + 1), count: values.filter((v) => v === i + 1).length }));
      stat.median = median(values);
    } else if (q.type === 'numero') {
      const values = answered.map((r) => answersOf(r)[q.id]).filter(Number.isFinite);
      stat.median = median(values);
      stat.min = values.length ? Math.min(...values) : null;
      stat.max = values.length ? Math.max(...values) : null;
    } else if (q.type === 'email') {
      stat.recontact = answered.filter((r) => r.recontact).length;
    } else {
      stat.texts = answered.map((r) => ({ n: r.n, text: String(answersOf(r)[q.id]) }));
    }
    return stat;
  });
}

const DEVICES = ['telefono', 'computer'];

export function durationStats(responses) {
  const done = responses.filter((r) => r.completed && Number.isFinite(r.duration_seconds) && r.duration_seconds > 0);
  return {
    median: median(done.map((r) => r.duration_seconds)),
    n: done.length,
    byDevice: [...DEVICES, null]
      .map((device) => {
        const list = done.filter((r) => (DEVICES.includes(r.device) ? r.device : null) === device);
        return { device, median: median(list.map((r) => r.duration_seconds)), n: list.length };
      })
      .filter((d) => d.n > 0),
  };
}

// Parole che chi risponde vede: introduzione e domande (testo, spiegazione, opzioni, etichette della scala).
export function displayedWords(survey) {
  let words = countWords(survey?.intro);
  for (const q of survey?.questions || []) {
    words += countWords(q.label) + countWords(q.help);
    for (const o of q.options || []) words += countWords(o.label);
    for (const label of q.scale?.labels || [q.scale?.min_label, q.scale?.max_label]) words += countWords(label);
  }
  return words;
}

// Segnalazioni per le sole compilazioni complete; restituisce una mappa numero di risposta → codici.
export function qualityFlags(survey, responses) {
  const questions = askedQuestions(survey);
  const done = responses.filter((r) => r.completed);
  const timed = done.filter((r) => Number.isFinite(r.duration_seconds) && r.duration_seconds > 0);
  const typical = timed.length >= QUALITY.speedIndexMin ? median(timed.map((r) => r.duration_seconds)) : null;
  const floor = QUALITY.secondsPerWord * displayedWords(survey);
  const scales = new Map();
  for (const q of questions.filter((x) => x.type === 'scala')) {
    const points = q.scale?.points === 7 ? 7 : 5;
    scales.set(points, [...(scales.get(points) || []), q]);
  }
  const countable = questions.filter((q) => q.type !== 'email');
  const flags = new Map();
  for (const r of done) {
    const list = [];
    const seconds = Number.isFinite(r.duration_seconds) && r.duration_seconds > 0 ? r.duration_seconds : null;
    if (seconds && typical && typical / seconds > QUALITY.speedIndex) list.push('veloce');
    if (seconds && seconds < floor) list.push('lettura');
    for (const group of scales.values()) {
      const values = group.filter((q) => hasAnswer(q, r)).map((q) => answersOf(r)[q.id]);
      if (values.length >= QUALITY.straightLine && values.every((v) => v === values[0])) {
        list.push('uguali');
        break;
      }
    }
    if (questions.some((q) => q.type === 'lunga' && countWords(answersOf(r)[q.id]) < QUALITY.openWords)) list.push('aperta');
    if (countable.length && countable.filter((q) => hasAnswer(q, r)).length / countable.length < QUALITY.answeredShare) list.push('saltate');
    if (list.length) flags.set(r.n, list);
  }
  return flags;
}

export const withoutFlagged = (responses, flags) => responses.filter((r) => !flags.has(r.n));

export function flagCounts(flags) {
  const counts = Object.fromEntries(Object.keys(FLAG_LABELS).map((code) => [code, 0]));
  for (const list of flags.values()) for (const code of list) counts[code] += 1;
  return counts;
}

// Imbuto: visite del link, inizi, compilazioni interrotte e complete. Il completamento si calcola su chi ha iniziato.
export function funnelSteps(funnel) {
  const views = funnel?.views ?? 0;
  const partial = funnel?.partial ?? 0;
  const completed = funnel?.completed ?? 0;
  const starts = Math.max(funnel?.starts ?? 0, partial + completed);
  return {
    steps: [
      { key: 'views', label: 'Link aperto', count: views },
      { key: 'starts', label: 'Iniziati', count: starts },
      { key: 'partial', label: 'Interrotti a metà', count: partial },
      { key: 'completed', label: 'Completati', count: completed },
    ],
    completionRate: share(completed, starts),
    starts,
  };
}

// Persona dalle risposte: la prima domanda «chi risponde» con una risposta, senza «Preferisco non rispondere».
export function personaAnswer(survey, response) {
  for (const q of askedQuestions(survey).filter((x) => x.role === 'persona')) {
    const value = answersOf(response)[q.id];
    if (value === SURVEY_PREFER_NOT || (Array.isArray(value) && value.includes(SURVEY_PREFER_NOT))) continue;
    const text = answerText(q, response, { scaleWithLabel: true });
    if (text !== null && text !== '') return String(text).replace(/^Altro: /, '');
  }
  return null;
}

const normalEmail = (value) => String(value || '').trim().toLowerCase();

// Chi ha lasciato l'email e chiesto di essere ricontattato, una volta per indirizzo; «already» sono già tra i contatti dell'idea.
export function contactCandidates(survey, responses, contacts = []) {
  const known = contacts.map((c) => normalEmail(c.data?.contact)).filter(Boolean);
  const seen = new Set();
  const fresh = [];
  const already = [];
  for (const r of responses) {
    const email = normalEmail(r.email);
    if (!email || !r.recontact || seen.has(email)) continue;
    seen.add(email);
    const entry = { n: r.n, email, persona: personaAnswer(survey, r), created_at: r.created_at };
    if (known.some((value) => value === email || value.split(/[\s,;]+/).includes(email))) already.push(entry);
    else fresh.push(entry);
  }
  return { fresh, already };
}

function csvCell(value, separator) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  let text = String(value);
  // Un testo che inizia con = + - @ diventerebbe una formula nei fogli di calcolo.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return text.includes(separator) || /["\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function uniqueHeaders(labels) {
  const used = new Map();
  return labels.map((label) => {
    const count = (used.get(label) || 0) + 1;
    used.set(label, count);
    return count > 1 ? `${label} (${count})` : label;
  });
}

// Data e ora locali, ordinabili anche nel foglio di calcolo.
function localStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Una riga per risposta, con nomi di colonna leggibili e il solo numero della risposta come identificativo.
export function responsesCsv(survey, responses, { includeEmail = false, flags = new Map(), separator = ';' } = {}) {
  const questions = askedQuestions(survey).filter((q) => q.type !== 'email');
  const headers = uniqueHeaders([
    'Risposta',
    'Data',
    'Stato',
    'Durata (secondi)',
    'Dispositivo',
    ...questions.map((q) => q.label),
    ...(includeEmail ? ['Email', 'Da ricontattare'] : []),
    'Segnalazioni',
  ]);
  const rows = responses.map((r) => [
    r.n,
    localStamp(r.created_at),
    r.completed ? 'completata' : 'interrotta',
    Number.isFinite(r.duration_seconds) ? r.duration_seconds : null,
    DEVICE_LABELS[r.device] || '',
    ...questions.map((q) => answerText(q, r)),
    ...(includeEmail ? [r.email || '', r.email ? (r.recontact ? 'sì' : 'no') : ''] : []),
    (flags.get(r.n) || []).map((code) => FLAG_LABELS[code]).join('; '),
  ]);
  return [headers, ...rows].map((row) => row.map((cell) => csvCell(cell, separator)).join(separator)).join('\r\n');
}

export function fmtDuration(seconds) {
  if (!Number.isFinite(seconds)) return '-';
  const total = Math.round(seconds);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  if (!min) return `${sec} s`;
  return sec ? `${min} min ${sec} s` : `${min} min`;
}

export const fmtShare = (value) => (value === null ? '-' : `${Math.round(value * 100)}%`);
