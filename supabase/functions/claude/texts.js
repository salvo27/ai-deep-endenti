// Le lingue sono quelle del sito (assets/js/i18n/languages.js): l'inglese se la richiesta non ne chiede un'altra.
export const LANGUAGES = ['en', 'it'];
export const DEFAULT_LANGUAGE = 'en';

export const isLanguage = (value) => LANGUAGES.includes(value);
export const languageOf = (value) => (isLanguage(value) ? value : DEFAULT_LANGUAGE);

// Il testo di ogni errore che il sito mostra così com'è; il codice viaggia accanto, per chi preferisce tradurlo da sé.
export const ERRORS = {
  it: {
    origin_not_allowed: 'Origine non autorizzata.',
    method_not_allowed: 'Metodo non consentito.',
    sign_in_required: 'Accesso richiesto.',
    not_member: 'Serve un account di questo progetto con la verifica in due passaggi.',
    too_large: 'Richiesta troppo grande.',
    invalid_request: 'Richiesta non valida.',
    invalid_project: 'Progetto non valido.',
    unknown_task: 'Compito non riconosciuto.',
    empty_context: 'Non c\'è contenuto da analizzare.',
    context_too_long: 'C\'è troppo testo da analizzare in una volta.',
    daily_limit: (limit) => `Hai raggiunto il limite di ${limit} richieste a Claude nelle ultime 24 ore.`,
    invalid_response: 'Risposta di Claude non valida.',
    refusal: 'Claude non può rispondere a questa richiesta.',
    empty_response: 'Claude non ha restituito testo.',
    busy: 'Claude è molto richiesto in questo momento. Riprova tra un minuto.',
    timeout: 'Claude ci sta mettendo troppo. Riprova con meno testo.',
    unavailable: 'Claude non è disponibile in questo momento. Riprova più tardi.',
  },
  en: {
    origin_not_allowed: 'Origin not allowed.',
    method_not_allowed: 'Method not allowed.',
    sign_in_required: 'Sign-in required.',
    not_member: 'You need an account in this project with two-step verification.',
    too_large: 'The request is too large.',
    invalid_request: 'Invalid request.',
    invalid_project: 'Invalid project.',
    unknown_task: 'Unknown task.',
    empty_context: 'There is no content to analyse.',
    context_too_long: 'There is too much text to analyse at once.',
    daily_limit: (limit) => `You have reached the limit of ${limit} requests to Claude in the last 24 hours.`,
    invalid_response: 'Claude sent an invalid answer.',
    refusal: 'Claude cannot answer this request.',
    empty_response: 'Claude did not return any text.',
    busy: 'Claude is in high demand right now. Try again in a minute.',
    timeout: 'Claude is taking too long. Try again with less text.',
    unavailable: 'Claude is not available right now. Try again later.',
  },
};

export function errorText(language, code, params = []) {
  const texts = ERRORS[languageOf(language)];
  const entry = Object.hasOwn(texts, code) ? texts[code] : texts.unavailable;
  return typeof entry === 'function' ? entry(...params) : entry;
}
