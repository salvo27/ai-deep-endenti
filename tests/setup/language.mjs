// The site picks its language from the device. The tests pin it, so they give the same result on every computer:
// Italian by default, the language most of them are written in; a file in English calls useLanguage('en')
// before importing the site (every test file runs in its own process, so the choice stays in that file).
const DEVICE = { it: ['it-IT', 'it'], en: ['en-US', 'en'] };

export function testLanguage() {
  return process.env.TEST_LANGUAGE === 'en' ? 'en' : 'it';
}

export function pinNavigator(nav = globalThis.navigator, lang = testLanguage()) {
  if (!nav) return;
  const languages = DEVICE[lang];
  Object.defineProperty(nav, 'language', { value: languages[0], configurable: true });
  Object.defineProperty(nav, 'languages', { value: Object.freeze([...languages]), configurable: true });
}

export function useLanguage(lang) {
  process.env.TEST_LANGUAGE = lang;
  pinNavigator(globalThis.navigator, lang);
}
