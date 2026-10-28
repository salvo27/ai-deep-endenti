import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { CONFIG } from '../config.js';

// Dati della pagina pubblica dei questionari: chiave anon, nessuna sessione, solo le tre funzioni aperte a tutti.
// Non importa nulla del sito, così chi risponde non carica login, stato o dati del team e non usa mai una sessione del team.

const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
const isToken = (token) => typeof token === 'string' && TOKEN_RE.test(token);

// Id riservato della risposta «Preferisco non rispondere», per le domande a scelta con prefer_not.
export const PREFER_NOT = 'non-rispondo';

const client = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export class PublicSurveyError extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = 'PublicSurveyError';
    this.code = code;
  }
}

function failure(error, fallback) {
  if (error?.status === 429) return new PublicSurveyError('Troppi tentativi. Aspetta qualche minuto e riprova.', 'rate_limit');
  if (error?.name === 'TypeError' || error?.name === 'FetchError') {
    return new PublicSurveyError('Connessione non riuscita. Controlla la rete e riprova.', 'network');
  }
  return new PublicSurveyError(fallback, 'server');
}

async function call(name, params, fallback) {
  let result;
  try {
    result = await client.rpc(name, params);
  } catch (error) {
    throw failure(error, fallback);
  }
  if (result?.error) throw failure(result.error, fallback);
  return result?.data ?? null;
}

// Una compilazione: un uuid v4 per pagina aperta, da passare a ogni submitSurvey.
export const newSurveySession = () => crypto.randomUUID();

// { status: 'aperto', title, intro, privacy, thanks, layout, progress, show_time, median_seconds, appearance, questions }
// oppure { status: 'chiuso' } o { status: 'non_trovato' }.
export async function loadPublicSurvey(token) {
  if (!isToken(token)) return { status: 'non_trovato' };
  const data = await call('public_survey', { p_token: token }, 'Questionario non disponibile. Riprova più tardi.');
  return data && typeof data === 'object' ? data : { status: 'non_trovato' };
}

// Salva la compilazione: ogni chiamata porta tutte le risposte date finora (sostituiscono quelle salvate),
// final: true all'ultima schermata. Restituisce { status: 'ok' } oppure { status: 'errore', reason, question? }.
// Di meta passano solo session, final, duration_seconds, device, recontact e website (il campo trappola).
export async function submitSurvey(token, answers, meta = {}) {
  if (!isToken(token)) return { status: 'errore', reason: 'Questionario non trovato.' };
  const pMeta = {};
  if (typeof meta?.session === 'string') pMeta.session = meta.session;
  if (typeof meta?.final === 'boolean') pMeta.final = meta.final;
  if (Number.isFinite(meta?.duration_seconds)) pMeta.duration_seconds = Math.max(0, Math.round(meta.duration_seconds));
  if (meta?.device === 'telefono' || meta?.device === 'computer') pMeta.device = meta.device;
  if (typeof meta?.recontact === 'boolean') pMeta.recontact = meta.recontact;
  if (typeof meta?.website === 'string') pMeta.website = meta.website;
  const fallback = 'Invio non riuscito. Riprova tra poco.';
  const data = await call('submit_survey', { p_token: token, p_answers: answers ?? {}, p_meta: pMeta }, fallback);
  return data && typeof data === 'object' ? data : { status: 'errore', reason: fallback };
}

// Visite e inizi servono solo alle statistiche: un errore non deve mai fermare chi risponde.
export async function recordSurveyEvent(token, kind) {
  if (!isToken(token) || (kind !== 'view' && kind !== 'start')) return;
  try {
    await client.rpc('survey_event', { p_token: token, p_kind: kind });
  } catch {
    // ignorato
  }
}
