const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export const LIMITS = Object.freeze({
  title: 200,
  line: 300,
  text: 20000,
  tag: 60,
  tags: 20,
  message: 500,
  comment: 20000,
  displayName: 80,
});

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function cleanText(value, max = LIMITS.text) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n?/g, '\n').replace(CONTROL_CHARS_RE, '').trim().slice(0, max);
}

export function cleanLine(value, max = LIMITS.line) {
  return cleanText(value, max * 2).replace(/\s*\n\s*/g, ' ').slice(0, max).trim();
}

export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export function intInRange(value, min, max) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export function uniqueStrings(values, maxItems = LIMITS.tags, maxLength = LIMITS.tag) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const clean = cleanLine(value, maxLength);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function uniqueUuids(values, maxItems = 200) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter(isUuid))].slice(0, maxItems);
}

export function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function isEmail(value) {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function slugKey(label, fallback = 'voce') {
  const slug = cleanLine(label, 60)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || fallback;
}

export function isKey(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,59}$/.test(value);
}

export function passwordProblem(password, confirm) {
  if (typeof password !== 'string' || password.length < 12) return 'La password deve avere almeno 12 caratteri.';
  if (password.length > 128) return 'La password può avere al massimo 128 caratteri.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return 'Usa lettere minuscole, maiuscole e almeno un numero.';
  }
  if (confirm !== undefined && password !== confirm) return 'Le due password non coincidono.';
  return null;
}

export function isTotpCode(value) {
  return typeof value === 'string' && /^\d{6}$/.test(value);
}
