import { runAuthGate } from './auth.js';
import { startApp } from './app.js';

const root = document.getElementById('app');

async function boot() {
  await runAuthGate(root);
  if (location.search) history.replaceState(null, '', `${location.pathname}${location.hash}`);
  await startApp(root);
}

boot().catch((error) => {
  console.error('Avvio non riuscito', error?.name);
  root.textContent = 'Non è stato possibile avviare il sito. Ricarica la pagina.';
});
