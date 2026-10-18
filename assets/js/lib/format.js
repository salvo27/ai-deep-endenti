const dateTimeFormat = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const dateFormat = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
const relativeFormat = new Intl.RelativeTimeFormat('it', { numeric: 'auto' });

const UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`);
  return new Date(value);
}

export function fmtDateTime(value) {
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? '' : dateTimeFormat.format(date);
}

export function fmtDate(value) {
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
}

export function fmtRelative(value, now = new Date()) {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  if (Math.abs(seconds) < 45) return 'adesso';
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size || unit === 'minute') {
      return relativeFormat.format(Math.round(seconds / size), unit);
    }
  }
  return '';
}

export function dayKey(value) {
  const date = toDate(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dayLabel(key, now = new Date()) {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - 24 * 3600 * 1000));
  if (key === today) return 'Oggi';
  if (key === yesterday) return 'Ieri';
  return fmtDate(key);
}

export function daysUntil(isoDate, now = new Date()) {
  const target = toDate(isoDate);
  if (Number.isNaN(target.getTime())) return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((end - start) / (24 * 3600 * 1000));
}

const wholeNumber = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });

export function fmtMoney(value) {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) >= 1e9) return `${oneDecimal.format(value / 1e9)} mld €`;
  if (Math.abs(value) >= 1e6) return `${oneDecimal.format(value / 1e6)} mln €`;
  return `${wholeNumber.format(value)} €`;
}

export function fmtPercent(value) {
  return Number.isFinite(value) ? `${oneDecimal.format(value)}%` : '-';
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || '?').slice(0, 2);
  return letters.toUpperCase();
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export function truncate(text, max) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

export function debounce(fn, ms) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function shortId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
}

export function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function slugFile(text) {
  return String(text || 'documento')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'documento';
}

export function downloadFile(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
