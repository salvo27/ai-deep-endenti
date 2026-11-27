import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
import { CONFIG } from '../config.js';

// Dati della pagina pubblica dei questionari: chiave anon, nessuna sessione, solo le tre funzioni aperte a tutti.
// Non importa nulla del sito, così chi risponde non carica login, stato o dati del team e non usa mai una sessione del team.
// It holds no texts either: errors carry a code that the page puts into words in the respondent's language.

const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
const isToken = (token) => typeof token === 'string' && TOKEN_RE.test(token);

// Id riservato della risposta «Preferisco non rispondere», per le domande a scelta con prefer_not.
export const PREFER_NOT = 'non-rispondo'; // i18n-ignore: stored option id

// Statuses of the database protocol, the same in every language.
const NOT_FOUND = 'non_trovato'; // i18n-ignore
const ERROR = 'errore'; // i18n-ignore

const client = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// code: 'rate_limit', 'network' or 'server'. The message is for developers only.
export class PublicSurveyError extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = 'PublicSurveyError';
    this.code = code;
  }
}

function failure(error) {
  if (error?.status === 429) return new PublicSurveyError('Too many requests', 'rate_limit');
  if (error?.name === 'TypeError' || error?.name === 'FetchError') return new PublicSurveyError('Network request failed', 'network');
  return new PublicSurveyError('Server error', 'server');
}

async function call(name, params) {
  let result;
  try {
    result = await client.rpc(name, params);
  } catch (error) {
    throw failure(error);
  }
  if (result?.error) throw failure(result.error);
  return result?.data ?? null;
}

// Una compilazione: un uuid v4 per pagina aperta, da passare a ogni submitSurvey.
export const newSurveySession = () => crypto.randomUUID();

// { status: 'aperto', title, intro, privacy, thanks, layout, progress, show_time, median_seconds, appearance, questions }
// oppure { status: 'chiuso' } o { status: 'non_trovato' }.
// Indirizzo pubblico dell'immagine della schermata iniziale: solo dallo spazio dei questionari del nostro progetto.
export const coverUrl = (path) => `${CONFIG.supabaseUrl}/storage/v1/object/public/questionari-immagini/${path}`; // i18n-ignore: bucket name

export async function loadPublicSurvey(token) {
  if (!isToken(token)) return { status: NOT_FOUND };
  const data = await call('public_survey', { p_token: token });
  return data && typeof data === 'object' ? data : { status: NOT_FOUND };
}

// Salva la compilazione: ogni chiamata porta tutte le risposte date finora (sostituiscono quelle salvate),
// final: true all'ultima schermata. Restituisce { status: 'ok' } oppure { status: 'errore', reason?, question? }.
// Di meta passano solo session, final, duration_seconds, device, recontact e website (il campo trappola).
export async function submitSurvey(token, answers, meta = {}) {
  // The database's own message for an unknown survey, so the page translates it like every other reason.
  if (!isToken(token)) return { status: ERROR, reason: 'Questionario non trovato.' }; // i18n-ignore: message of the database protocol
  const pMeta = {};
  if (typeof meta?.session === 'string') pMeta.session = meta.session;
  if (typeof meta?.final === 'boolean') pMeta.final = meta.final;
  if (Number.isFinite(meta?.duration_seconds)) pMeta.duration_seconds = Math.max(0, Math.round(meta.duration_seconds));
  if (meta?.device === 'telefono' || meta?.device === 'computer') pMeta.device = meta.device;
  if (typeof meta?.recontact === 'boolean') pMeta.recontact = meta.recontact;
  if (typeof meta?.website === 'string') pMeta.website = meta.website;
  // Secondi per domanda: solo numeri, il database tiene quelli delle domande vere.
  if (meta?.times && typeof meta.times === 'object' && !Array.isArray(meta.times)) {
    const times = Object.fromEntries(Object.entries(meta.times).filter(([, s]) => Number.isFinite(s) && s >= 0));
    if (Object.keys(times).length) pMeta.times = times;
  }
  const data = await call('submit_survey', { p_token: token, p_answers: answers ?? {}, p_meta: pMeta });
  // Without an answer there is no reason to show: the page uses its own message for a failed send.
  return data && typeof data === 'object' ? data : { status: ERROR };
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
