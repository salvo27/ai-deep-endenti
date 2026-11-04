import { cleanLine } from './lib/validate.js';
import { DAY_KEYS, addDays, dayName, isMonday } from './availability.js';

// Ore lavorate: un elemento per persona e per settimana. Gli orari sono minuti dalla mezzanotte, a passi di 15.

// Nome intero per la squadra, nome breve per il menu delle righe.
export const AREAS = [
  ['prodotto', 'Prodotto e tecnologia', 'Prodotto'],
  ['clienti', 'Clienti e vendite', 'Clienti'],
  ['numeri', 'Numeri e amministrazione', 'Numeri'],
  ['ricerca', 'Ricerca e interviste', 'Ricerca'],
  ['altro', 'Altro', 'Altro'],
];
export const AREA_KEYS = AREAS.map(([key]) => key);
export const STEP = 15;
export const DAY_MINUTES = 24 * 60;
export const MAX_ENTRIES = 100;
export const NOTE_MAX = 140;
export const MAX_PLEDGE = 80 * 60;
export const HISTORY_WEEKS = 12;
const ENTRY_ID_RE = /^[a-z0-9]{1,16}$/;

export const areaLabel = (key) => AREAS.find(([k]) => k === key)?.[1] || 'Altro';
export const areaShort = (key) => AREAS.find(([k]) => k === key)?.[2] || 'Altro';
const isStep = (value, min, max) => Number.isInteger(value) && value >= min && value <= max && value % STEP === 0;

export function sanitizeEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.id !== 'string' || !ENTRY_ID_RE.test(raw.id) || !DAY_KEYS.includes(raw.day)) return null;
  if (!isStep(raw.start, 0, DAY_MINUTES - STEP) || !isStep(raw.end, STEP, DAY_MINUTES) || raw.end <= raw.start) return null;
  const entry = { id: raw.id, day: raw.day, start: raw.start, end: raw.end, area: AREA_KEYS.includes(raw.area) ? raw.area : 'altro' };
  const note = cleanLine(raw.note, NOTE_MAX);
  if (note) entry.note = note;
  return entry;
}

const byTime = (a, b) => DAY_KEYS.indexOf(a.day) - DAY_KEYS.indexOf(b.day) || a.start - b.start || a.id.localeCompare(b.id);

export function sanitizeTimesheet(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const data = {};
  if (isMonday(source.week)) data.week = source.week;
  if (isStep(source.pledge, 0, MAX_PLEDGE)) data.pledge = source.pledge;
  const seen = new Set();
  data.entries = (Array.isArray(source.entries) ? source.entries : [])
    .map(sanitizeEntry)
    .filter((entry) => entry && !seen.has(entry.id) && seen.add(entry.id))
    .sort(byTime)
    .slice(0, MAX_ENTRIES);
  return data;
}

export const minutesOf = (entries) => entries.reduce((sum, entry) => sum + entry.end - entry.start, 0);

export function dayTotals(entries) {
  return Object.fromEntries(DAY_KEYS.map((day) => [day, minutesOf(entries.filter((entry) => entry.day === day))]));
}

export function areaTotals(entries) {
  return AREAS.map(([area, label]) => ({ area, label, minutes: minutesOf(entries.filter((entry) => entry.area === area)) }))
    .filter((row) => row.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
}

// La prima coppia di righe dello stesso giorno che si accavallano, se c'è.
export function overlap(entries) {
  const sorted = [...entries].sort(byTime);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].day === sorted[i - 1].day && sorted[i].start < sorted[i - 1].end) return [sorted[i - 1], sorted[i]];
  }
  return null;
}

const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);

export function timesheetProblem(data) {
  if (!data.week) return 'Manca la settimana.';
  if ((data.entries || []).length > MAX_ENTRIES) return `In una settimana ci stanno al massimo ${MAX_ENTRIES} righe.`;
  const pair = overlap(data.entries || []);
  if (pair) return `${capital(dayName(pair[0].day))} due righe si accavallano: ${clockText(pair[0].start)}-${clockText(pair[0].end)} e ${clockText(pair[1].start)}-${clockText(pair[1].end)}.`;
  return null;
}

// Unione a tre vie riga per riga: vale la riga cambiata da una parte sola; se l'hanno cambiata entrambe vince la mia,
// perché le ore le scrive solo la stessa persona da più dispositivi. Lo stesso per le ore dichiarate.
export function mergeTimesheet(base, mine, theirs) {
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const index = (data) => new Map((data?.entries || []).map((entry) => [entry.id, entry]));
  const [b, m, t] = [index(base), index(mine), index(theirs)];
  const entries = [];
  for (const id of new Set([...m.keys(), ...t.keys(), ...b.keys()])) {
    const pick = same(m.get(id), t.get(id)) || !same(m.get(id), b.get(id)) ? m.get(id) : t.get(id);
    if (pick) entries.push(pick);
  }
  const merged = { week: mine.week, entries: entries.sort(byTime) };
  const pledge = same(mine.pledge, base?.pledge) ? theirs?.pledge : mine.pledge;
  if (pledge !== undefined) merged.pledge = pledge;
  return merged;
}

export function clockText(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// "15:07" diventa 900 + 7 arrotondato al quarto d'ora; per la fine "00:00" vale mezzanotte.
export function parseClock(text, { end = false } = {}) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(text || '').trim());
  if (!match) return null;
  const [h, m] = [Number(match[1]), Number(match[2])];
  if (h > 23 || m > 59) return null;
  const minutes = Math.round((h * 60 + m) / STEP) * STEP;
  if (end && minutes === 0) return DAY_MINUTES;
  return Math.min(minutes, end ? DAY_MINUTES : DAY_MINUTES - STEP);
}

// 150 diventa "2 h 30", 45 diventa "45 min", 0 diventa "0 h".
export function durationText(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h && m) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

// La scheda della settimana vale per chi l'ha scritta: weeks è una mappa lunedì -> dati già puliti.
export function pledgeFor(weeks, monday) {
  const known = [...weeks.entries()].filter(([week, data]) => week <= monday && data.pledge !== undefined).sort(([a], [b]) => b.localeCompare(a));
  return known.length ? known[0][1].pledge : null;
}

export function weekSeries(weeks, monday, count = HISTORY_WEEKS) {
  return Array.from({ length: count }, (_, i) => {
    const week = addDays(monday, (i - count + 1) * 7);
    const data = weeks.get(week);
    return { week, minutes: data ? minutesOf(data.entries) : 0, pledge: pledgeFor(weeks, week), filled: Boolean(data?.entries.length) };
  });
}
