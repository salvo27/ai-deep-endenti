// Shared by the English tests of the ideas and editing pages: finds the Italian texts of the given areas that are
// still shown in a page rendered in English. Only plain texts (not functions) of two words or more, different in the
// two languages, are looked for, as whole phrases: a single word could also come from a part of the page that another
// area translates (statuses, field labels), and those are checked one by one by the tests.
import { it as italian } from '../../assets/js/i18n/it/index.js';
import { en } from '../../assets/js/i18n/en/index.js';

function strings(texts, path) {
  if (typeof texts === 'string') return [[path, texts]];
  if (typeof texts !== 'object' || texts === null) return [];
  return Object.entries(texts).flatMap(([name, entry]) => strings(entry, `${path}.${name}`));
}

function lookup(texts, path) {
  return path.split('.').reduce((node, name) => node?.[name], texts);
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wholePhrase = (text, phrase) => new RegExp(`(^|[^\\p{L}])${escape(phrase)}($|[^\\p{L}])`, 'u').test(text);

/** The Italian texts of the areas found in a text, as "path: text". */
export function italianLeftovers(pageText, areas) {
  return areas
    .flatMap((area) => strings(italian[area], area))
    .filter(([path, value]) => /\s/.test(value.trim()) && lookup(en, path) !== value && wholePhrase(pageText, value))
    .map(([path, value]) => `${path}: ${value}`);
}

/** A date as YYYY-MM-DD in local time, a given number of days from today. */
export function daysFromToday(days, now = new Date()) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
