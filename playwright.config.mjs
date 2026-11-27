import { defineConfig } from '@playwright/test';

// Test con un browser vero sull'anteprima con dati finti (tests/e2e/preview.html): niente login, niente Supabase.
// Usa il Chrome installato sul computer o sul runner di GitHub, senza scaricare browser.
const PORT = Number(process.env.E2E_PORT) || 8091;

// La lingua del browser, che il sito usa come lingua del dispositivo. locale dà navigator.language e le date; su Linux
// Chrome sceglie la lingua da LANGUAGE e LANG, non da --lang, che vale solo su Windows.
const deviceLanguage = (locale, posix) => ({
  locale,
  launchOptions: { args: [`--lang=${locale}`], env: { ...process.env, LANGUAGE: `${posix}:${locale.slice(0, 2)}`, LANG: `${posix}.UTF-8` } },
});

const COMPUTER = { viewport: { width: 1280, height: 800 } };
const PHONE = { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true };

// In inglese girano solo i test marcati @ogni-lingua: le pagine senza errori e senza niente fuori schermo e le basi
// della pagina pubblica dei questionari, così i testi inglesi, più lunghi o più corti, non escono dallo schermo.
const ENGLISH = deviceLanguage('en-GB', 'en_GB');
const EVERY_LANGUAGE = /@ogni-lingua/;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: 'chrome',
    headless: true,
    // I test sono scritti sull'italiano, quindi anche il browser: in inglese americano gli orari sono a 12 ore con
    // AM/PM e i test da tastiera scriverebbero in un campo diverso.
    ...deviceLanguage('it-IT', 'it_IT'),
  },
  webServer: {
    command: `node tests/e2e/server.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/tests/e2e/preview.html`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'computer', use: COMPUTER },
    { name: 'telefono', use: PHONE },
    { name: 'computer-en', grep: EVERY_LANGUAGE, use: { ...COMPUTER, ...ENGLISH } },
    { name: 'telefono-en', grep: EVERY_LANGUAGE, use: { ...PHONE, ...ENGLISH } },
  ],
});
