import { runAuthGate } from './auth.js';
import { startApp } from './app.js';
import { applyDocumentLanguage, tx } from './i18n/index.js';

const root = document.getElementById('app');

async function boot() {
  applyDocumentLanguage();
  await runAuthGate(root);
  if (location.search) history.replaceState(null, '', `${location.pathname}${location.hash}`);
  await startApp(root);
}

boot().catch((error) => {
  console.error('Startup failed', error?.name);
  root.textContent = tx.errors.startup;
});
