import { defineConfig } from '@playwright/test';

// Test con un browser vero sull'anteprima con dati finti (tests/e2e/preview.html): niente login, niente Supabase.
// Usa il Chrome installato sul computer o sul runner di GitHub, senza scaricare browser.
const PORT = 8091;

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
  },
  webServer: {
    command: `node tests/e2e/server.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/tests/e2e/preview.html`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'computer', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'telefono', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
});
