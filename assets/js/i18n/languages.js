// The languages of the site. English is the default: a device set to Italian gets Italian, every other device English.
export const LANGUAGES = ['en', 'it'];
export const DEFAULT_LANGUAGE = 'en';

// Every language introduces itself in its own words, so whoever does not read the current one still finds theirs.
export const LANGUAGE_NAMES = Object.freeze({ en: 'English', it: 'Italiano' });

// en-GB and not en-US: day before month and a 24-hour clock, as the team and its users in Europe read dates.
export const LOCALES = Object.freeze({ en: 'en-GB', it: 'it-IT' });

// "auto" follows the device.
export const LANGUAGE_CHOICES = ['auto', ...LANGUAGES];

export const isLanguage = (value) => LANGUAGES.includes(value);
export const isLanguageChoice = (value) => value === 'auto' || isLanguage(value);

// Only the first language of the device counts: it is the one the person set, the others are fallbacks for sites
// that do not have it.
export function deviceLanguage(nav) {
  const list = Array.isArray(nav?.languages) && nav.languages.length ? nav.languages : [nav?.language];
  const first = list[0];
  if (typeof first !== 'string') return DEFAULT_LANGUAGE;
  const short = first.trim().toLowerCase().slice(0, 2);
  return isLanguage(short) ? short : DEFAULT_LANGUAGE;
}

export function resolveLanguage(choice, nav) {
  return isLanguage(choice) ? choice : deviceLanguage(nav);
}
