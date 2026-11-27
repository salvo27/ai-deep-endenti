import { en } from './en/index.js';
import { it } from './it/index.js';
import { DEFAULT_LANGUAGE, LOCALES, isLanguage, isLanguageChoice, resolveLanguage } from './languages.js';

const TEXTS = Object.freeze({ en, it });
const KEY = 'lingua';

// The storage can be missing or throw (private windows, blocked site data): then the device decides.
export function storedChoice(storage = globalThis.localStorage) {
  try {
    const value = storage?.getItem(KEY);
    return isLanguageChoice(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveLanguageChoice(choice, storage = globalThis.localStorage) {
  if (!isLanguageChoice(choice)) return false;
  try {
    if (choice === 'auto') storage.removeItem(KEY);
    else storage.setItem(KEY, choice);
    return true;
  } catch {
    return false;
  }
}

// Decided once, when the page opens: changing language saves the choice and reloads the page, so every text
// built when a module loads is already in the right language.
export const languageChoice = storedChoice();
export const language = resolveLanguage(languageChoice, globalThis.navigator);
export const locale = LOCALES[language];

/** The texts of the language in use. */
export const tx = TEXTS[language];

/** The texts of a given language, for what is written for someone else (for example an email preview). */
export function textsFor(lang) {
  return TEXTS[isLanguage(lang) ? lang : DEFAULT_LANGUAGE];
}

export function applyDocumentLanguage(doc = globalThis.document) {
  if (doc?.documentElement) doc.documentElement.lang = language;
}
