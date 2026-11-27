import { cleanLine } from './lib/validate.js';
import { DAY_KEYS, addDays, dayName, isMonday } from './availability.js';
import { tx } from './i18n/index.js';

// Ore lavorate: un elemento per persona e per settimana. Gli orari sono minuti dalla mezzanotte, a passi di 15.

// Le chiavi delle aree sono quelle salvate. Nome intero per la squadra, nome breve per il menu delle righe.
export const AREA_KEYS = ['prodotto', 'clienti', 'numeri', 'ricerca', 'altro']; // i18n-ignore: chiavi salvate
export const AREAS = AREA_KEYS.map((key) => [key, tx.timesheet.areas[key].long, tx.timesheet.areas[key].short]);
export const STEP = 15;
export const DAY_MINUTES = 24 * 60;
export const MAX_ENTRIES = 100;
export const NOTE_MAX = 140;
export const MAX_PLEDGE = 80 * 60;
export const HISTORY_WEEKS = 12;
const ENTRY_ID_RE = /^[a-z0-9]{1,16}$/;

const areaOf = (key) => tx.timesheet.areas[AREA_KEYS.includes(key) ? key : 'altro'];
export const areaLabel = (key) => areaOf(key).long;
export const areaShort = (key) => areaOf(key).short;
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

export function timesheetProblem(data) {
  const t = tx.timesheet.problems;
  if (!data.week) return t.noWeek;
  if ((data.entries || []).length > MAX_ENTRIES) return t.tooManyRows(MAX_ENTRIES);
  const pair = overlap(data.entries || []);
  const span = (entry) => `${clockText(entry.start)}-${clockText(entry.end)}`;
  if (pair) return t.overlap(dayName(pair[0].day), span(pair[0]), span(pair[1]));
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

// 150 diventa "2 h 30", 45 diventa "45 min", 0 diventa "0 h": la forma la danno i testi della lingua.
export function durationText(minutes) {
  const t = tx.timesheet.duration;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h && m) return t.minutes(m);
  return m ? t.hoursMinutes(h, String(m).padStart(2, '0')) : t.hours(h);
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
