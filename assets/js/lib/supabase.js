import { createClient, processLock } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { CONFIG } from '../config.js';

const SLOW_MS = 3000;

// Segnala in console le richieste lente, senza dati: solo metodo, percorso e durata.
async function timedFetch(input, init) {
  const started = performance.now();
  try {
    return await fetch(input, init);
  } finally {
    const ms = Math.round(performance.now() - started);
    if (ms > SLOW_MS) {
      const url = new URL(typeof input === 'string' ? input : input.url);
      console.warn(`Richiesta lenta: ${init?.method || 'GET'} ${url.pathname} in ${ms} ms`);
    }
  }
}

export const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Blocco della sessione per singola scheda: con quello condiviso tra schede, una scheda in background
    // poteva far aspettare fino a 5 secondi ogni richiesta delle altre.
    lock: processLock,
  },
  global: { fetch: timedFetch },
});

export const authFlags = { recovery: false };

supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') authFlags.recovery = true;
});
