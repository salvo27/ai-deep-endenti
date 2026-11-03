import { dayKey } from './lib/format.js';
import { isIsoDate } from './lib/validate.js';

// Disponibilità: ognuno segna solo quando è impegnato, gli orari liberi in comune si calcolano.
// Un'ora è un intero 0-23 e vale da quell'ora alla successiva; le settimane si indicano con il loro lunedì.

export const DAYS = [
  ['lun', 'lunedì'],
  ['mar', 'martedì'],
  ['mer', 'mercoledì'],
  ['gio', 'giovedì'],
  ['ven', 'venerdì'],
  ['sab', 'sabato'],
  ['dom', 'domenica'],
];
export const DAY_KEYS = DAYS.map(([key]) => key);
export const FIRST_HOUR = 8;
export const LAST_HOUR = 22;
export const HOURS = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);
export const WEEKS_AHEAD = 12;
export const MAX_WEEKS = 26;

const dayMonth = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export const dayName = (key) => DAYS.find(([k]) => k === key)?.[1] || key;

export function addDays(key, days) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const weekdayIndex = (key) => (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
export const mondayOf = (key) => addDays(key, -weekdayIndex(key));
export const isMonday = (key) => isIsoDate(key) && weekdayIndex(key) === 0;
export const thisMonday = (now = new Date()) => mondayOf(dayKey(now));
export const shortDate = (key) => (isIsoDate(key) ? dayMonth.format(new Date(`${key}T00:00:00Z`)) : String(key));

// Davanti a 1, 8 e 11 l'articolo si apostrofa: «dall'8», «fino all'11», «l'1».
const ELIDED = { il: "l'", dal: "dall'", al: "all'", del: "dell'" };

export function withDay(word, key, text) {
  return [1, 8, 11].includes(Number(String(key).slice(8, 10))) ? `${ELIDED[word]}${text}` : `${word} ${text}`;
}

export function weekLabel(monday) {
  const sunday = addDays(monday, 6);
  return `${withDay('dal', monday, shortDate(monday))} ${withDay('al', sunday, shortDate(sunday))}`;
}

export function slotLabel(date, start, end) {
  return `${dayName(DAY_KEYS[weekdayIndex(date)])} ${shortDate(date)}, ${start}-${end}`;
}

// Per i lettori di schermo: «9-10» si leggerebbe male.
export const hourSpan = (hour) => `dalle ${hour} alle ${hour + 1}`;

// [9, 10, 11, 15] diventa "9-12, 15-16".
export function hoursText(hours) {
  const list = sanitizeHours(hours);
  const ranges = [];
  for (const hour of list) {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === hour) last[1] = hour + 1;
    else ranges.push([hour, hour + 1]);
  }
  return ranges.map(([a, b]) => `${a}-${b}`).join(', ');
}

export function joinNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

export function sanitizeHours(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23))].sort((a, b) => a - b);
}

export function sanitizeBusy(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const day of DAY_KEYS) {
    const hours = sanitizeHours(raw[day]);
    if (hours.length) out[day] = hours;
  }
  return out;
}

export function sanitizeAvailability(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const data = { busy: sanitizeBusy(source.busy) };
  if (isIsoDate(source.until)) data.until = source.until;
  const seen = new Set();
  const weeks = (Array.isArray(source.weeks) ? source.weeks : [])
    .filter((week) => week && typeof week === 'object' && isMonday(week.key) && !seen.has(week.key) && seen.add(week.key))
    .map((week) => ({ key: week.key, busy: sanitizeBusy(week.busy) }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, MAX_WEEKS);
  if (weeks.length) data.weeks = weeks;
  return data;
}

// Le settimane già passate non servono più: si tolgono al salvataggio.
export function dropPastWeeks(data, monday) {
  const { weeks, ...rest } = data;
  const kept = (weeks || []).filter((week) => week.key >= monday);
  return kept.length ? { ...rest, weeks: kept } : rest;
}

// Per ogni giorno della settimana: le ore impegnate, o «non si sa» se manca l'orario o è scaduto.
export function personWeek(data, monday) {
  const week = data?.weeks?.find((w) => w.key === monday);
  return DAY_KEYS.map((day, i) => {
    const date = addDays(monday, i);
    if (!data) return { date, known: false, busy: new Set() };
    if (week) return { date, known: true, busy: new Set(week.busy[day] || []) };
    const known = !data.until || date <= data.until;
    return { date, known, busy: new Set(known ? data.busy?.[day] || [] : []) };
  });
}

export function personState(data, monday) {
  if (!data) return 'missing';
  const known = personWeek(data, monday).filter((day) => day.known).length;
  if (known === DAY_KEYS.length) return 'ok';
  return known ? 'partial' : 'expired';
}

function slotStart(date, hour) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, hour);
}

// people: [{ id, data }], con data null per chi non ha compilato.
export function teamGrid(people, monday, now = new Date()) {
  const weeks = people.map((person) => ({ id: person.id, days: personWeek(person.data, monday) }));
  return DAY_KEYS.map((day, i) => {
    const date = addDays(monday, i);
    return HOURS.map((hour) => {
      const cell = { day, date, hour, past: slotStart(date, hour) < now, free: [], busy: [], unknown: [] };
      for (const person of weeks) {
        const today = person.days[i];
        if (!today.known) cell.unknown.push(person.id);
        else if (today.busy.has(hour)) cell.busy.push(person.id);
        else cell.free.push(person.id);
      }
      return cell;
    });
  });
}

// Le fasce migliori: più persone libere tra chi ha compilato, ore consecutive con le stesse persone unite.
export function bestSlots(grid, limit = 3) {
  const blocks = [];
  for (const column of grid) {
    let open = null;
    for (const cell of column) {
      const counted = cell.free.length + cell.busy.length;
      const good = !cell.past && cell.free.length > 0 && cell.free.length >= Math.min(2, counted);
      const sig = good ? `${cell.free.join()}|${cell.busy.join()}|${cell.unknown.join()}` : null;
      if (open && sig === open.sig && cell.hour === open.end) {
        open.end += 1;
        continue;
      }
      if (open) blocks.push(open);
      open = good
        ? { day: cell.day, date: cell.date, start: cell.hour, end: cell.hour + 1, free: cell.free, busy: cell.busy, unknown: cell.unknown, sig }
        : null;
    }
    if (open) blocks.push(open);
  }
  return blocks
    .sort(
      (a, b) =>
        b.free.length - a.free.length ||
        a.busy.length + a.unknown.length - (b.busy.length + b.unknown.length) ||
        a.date.localeCompare(b.date) ||
        a.start - b.start,
    )
    .slice(0, limit)
    .map(({ sig, ...block }) => block);
}
