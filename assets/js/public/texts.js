// Texts of the public survey page (q.html), in Italian and in English. The page loads nothing of the site, so its
// texts live here and not in assets/js/i18n: the Italian is the reference and the English has exactly the same entries
// (tests/unit/survey-texts.test.mjs checks it). Only what the page itself writes: the survey's own texts are the team's.

export const it = {
  defaultTitle: 'Questionario',
  other: 'Altro',
  preferNot: 'Preferisco non rispondere',
  loading: 'Caricamento…',
  progressLabel: 'Avanzamento',
  honeypot: 'Sito web',
  retry: 'Riprova',
  time: {
    about: (minutes) => (minutes === 1 ? 'circa 1 minuto' : `circa ${minutes} minuti`),
    duration: (minutes) => (minutes === 1 ? 'Ci vorrà circa 1 minuto.' : `Ci vorranno circa ${minutes} minuti.`),
  },
  progress: {
    one: (number, total) => `Domanda ${number} di ${total}`,
    range: (first, last, total) => `Domande ${first}-${last} di ${total}`,
  },
  number: {
    range: (min, max) => `Un numero intero da ${min} a ${max}.`,
    min: (min) => `Un numero intero, almeno ${min}.`,
    max: (max) => `Un numero intero, al massimo ${max}.`,
    any: 'Un numero intero.',
  },
  messages: {
    required: 'Per continuare rispondi a questa domanda, per favore.',
    other: 'Scrivi la tua risposta accanto ad «Altro», per favore.',
    integer: 'Scrivi solo cifre, senza punti né virgole.',
    email: 'L\'indirizzo email non sembra completo: controllalo, per favore.',
    recontact: 'Per farti ricontattare scrivi la tua email, oppure togli la spunta.',
    huge: 'Il numero è troppo grande.',
    empty: 'Rispondi ad almeno una domanda prima di inviare.',
  },
  checks: {
    otherNamed: (label) => `Scrivi la tua risposta accanto a «${label}», per favore.`,
    tooLong: (max) => `Al massimo ${max} caratteri: accorcia un po' la risposta.`,
    between: (min, max) => `Scrivi un numero da ${min} a ${max}.`,
    atLeast: (min) => `Scrivi un numero uguale o maggiore di ${min}.`,
    atMost: (max) => `Scrivi un numero uguale o minore di ${max}.`,
  },
  errors: {
    rateLimit: 'Troppi tentativi. Aspetta qualche minuto e riprova.',
    network: 'Connessione non riuscita. Controlla la rete e riprova.',
    load: 'Questionario non disponibile. Riprova più tardi.',
    send: 'Invio non riuscito. Riprova tra poco.',
  },
  // I messaggi che manda il database (survey_error in supabase/schema.sql), parola per parola: così la pagina li riconosce
  // e li mostra nella lingua di chi risponde.
  server: {
    invalid: 'Risposte non valide.',
    tooLong: 'Le risposte sono troppo lunghe.',
    notFound: 'Questionario non trovato.',
    closed: 'Il questionario è chiuso.',
    session: 'Sessione non valida. Ricarica la pagina.',
    alreadySent: 'Le risposte sono già state inviate.',
    tooManySaves: 'Troppi salvataggi: invia le risposte per concludere.',
    answerTooLong: 'Una risposta è troppo lunga.',
    oneAnswer: 'Scegli una sola risposta.',
    integer: 'Scrivi un numero intero.',
    range: 'Un numero è fuori dall\'intervallo ammesso.',
    email: 'Indirizzo email non valido.',
    required: 'Rispondi a tutte le domande obbligatorie.',
    empty: 'Rispondi ad almeno una domanda.',
    recontact: 'Per farti ricontattare serve un indirizzo email.',
    repeated: 'Hai già compilato questo questionario più volte. Riprova più tardi.',
    busy: 'Troppe risposte in questo momento. Riprova tra qualche minuto.',
    full: 'Il questionario non accetta altre risposte.',
  },
  notFound: {
    title: 'Questionario non trovato',
    text: 'Il link potrebbe essere incompleto o non più valido. Controlla di averlo copiato per intero, oppure chiedilo di nuovo a chi te l\'ha mandato.',
  },
  closed: { title: 'Questionario chiuso', text: 'Questo questionario non accetta più risposte. Grazie comunque per il tuo interesse.' },
  loadFailed: 'Non riesco ad aprire il questionario',
  intro: {
    start: 'Inizia',
    emailRequired: 'Alla fine ti chiederemo un indirizzo email.',
    emailOptional: 'Alla fine, se vuoi, potrai lasciarci la tua email.',
    saved: 'Le risposte si salvano a ogni passaggio: se ti fermi, riprendi da dove eri.',
    privacyToggle: 'Leggi l\'informativa sulla privacy',
    privacyLabel: 'Informativa sulla privacy',
  },
  welcomeBack: {
    text: (missing, asked) => `${missing === 1 ? 'Ti manca una domanda' : `Ti mancano ${missing} domande`} su ${asked}: le risposte che avevi dato sono ancora qui, riprendi da dove eri.`,
    resume: 'Riprendi',
  },
  alreadySent: {
    pageTitle: 'Hai già risposto',
    title: 'Hai già risposto, grazie!',
    text: (date) => `Le tue risposte sono arrivate${date ? ` il ${date}` : ''}: non serve compilarlo di nuovo. Ora puoi chiudere questa pagina.`,
  },
  question: {
    required: '(obbligatoria)',
    otherField: (label) => `${label}: scrivi la tua risposta`,
    consent: 'Potete ricontattarmi per una breve chiacchierata',
    back: 'Indietro',
    next: 'Avanti',
    send: 'Invia',
    keyHint: 'oppure premi Invio ↵',
    checkMarked: 'Controlla le risposte segnate, per favore.',
    suggestBefore: 'Intendevi',
    suggestAfter: '?',
    suggestFix: 'Sì, correggi',
  },
  sending: { busy: 'Invio in corso…', anyway: 'Invia comunque' },
  reminder: {
    title: (count) => (count === 1 ? 'Hai lasciato senza risposta una domanda:' : `Hai lasciato senza risposta ${count} domande:`),
    review: (count) => (count === 1 ? 'Rispondi' : 'Rispondi a quelle saltate'),
    label: 'Domande senza risposta',
    more: (count) => `e altre ${count}.`,
    text: 'Non sono obbligatorie: se preferisci, invia pure così.',
  },
  thanks: {
    pageTitle: 'Grazie',
    title: 'Grazie!',
    received: 'Le tue risposte sono arrivate.',
    writeTo: 'Ti scriveremo a',
    close: 'Ora puoi chiudere questa pagina.',
  },
};

export const en = {
  defaultTitle: 'Survey',
  other: 'Other',
  preferNot: 'Prefer not to say',
  loading: 'Loading…',
  progressLabel: 'Progress',
  honeypot: 'Website',
  retry: 'Try again',
  time: {
    about: (minutes) => (minutes === 1 ? 'about 1 minute' : `about ${minutes} minutes`),
    duration: (minutes) => (minutes === 1 ? 'It will take about 1 minute.' : `It will take about ${minutes} minutes.`),
  },
  progress: {
    one: (number, total) => `Question ${number} of ${total}`,
    range: (first, last, total) => `Questions ${first}-${last} of ${total}`,
  },
  number: {
    range: (min, max) => `A whole number from ${min} to ${max}.`,
    min: (min) => `A whole number, at least ${min}.`,
    max: (max) => `A whole number, at most ${max}.`,
    any: 'A whole number.',
  },
  messages: {
    required: 'Please answer this question to continue.',
    other: 'Please write your answer next to ‘Other’.',
    integer: 'Write digits only, without dots or commas.',
    email: 'The email address does not look complete: please check it.',
    recontact: 'To be contacted, write your email or untick the box.',
    huge: 'The number is too large.',
    empty: 'Answer at least one question before sending.',
  },
  checks: {
    otherNamed: (label) => `Please write your answer next to ‘${label}’.`,
    tooLong: (max) => `At most ${max} characters: please shorten your answer a little.`,
    between: (min, max) => `Write a number from ${min} to ${max}.`,
    atLeast: (min) => `Write a number of ${min} or more.`,
    atMost: (max) => `Write a number of ${max} or less.`,
  },
  errors: {
    rateLimit: 'Too many attempts. Wait a few minutes and try again.',
    network: 'Connection failed. Check your network and try again.',
    load: 'Survey not available. Please try again later.',
    send: 'Sending failed. Please try again shortly.',
  },
  server: {
    invalid: 'Some answers are not valid.',
    tooLong: 'The answers are too long.',
    notFound: 'Survey not found.',
    closed: 'The survey is closed.',
    session: 'Invalid session. Reload the page.',
    alreadySent: 'Your answers have already been sent.',
    tooManySaves: 'Too many saves: send your answers to finish.',
    answerTooLong: 'An answer is too long.',
    oneAnswer: 'Choose only one answer.',
    integer: 'Write a whole number.',
    range: 'A number is outside the allowed range.',
    email: 'The email address is not valid.',
    required: 'Answer all the required questions.',
    empty: 'Answer at least one question.',
    recontact: 'To be contacted again we need an email address.',
    repeated: 'You have already filled in this survey several times. Please try again later.',
    busy: 'Too many answers right now. Please try again in a few minutes.',
    full: 'The survey is not accepting any more answers.',
  },
  notFound: {
    title: 'Survey not found',
    text: 'The link may be incomplete or no longer valid. Check that you copied all of it, or ask the person who sent it to send it again.',
  },
  closed: { title: 'Survey closed', text: 'This survey is no longer accepting answers. Thank you for your interest all the same.' },
  loadFailed: 'We could not open the survey',
  intro: {
    start: 'Start',
    emailRequired: 'At the end we will ask you for an email address.',
    emailOptional: 'At the end, if you like, you can leave us your email.',
    saved: 'Your answers are saved at every step: if you stop, you can pick up where you left off.',
    privacyToggle: 'Read the privacy notice',
    privacyLabel: 'Privacy notice',
  },
  welcomeBack: {
    text: (missing, asked) => `You have ${missing === 1 ? 'one question' : `${missing} questions`} left out of ${asked}: the answers you gave are still here, so you can pick up where you left off.`,
    resume: 'Continue',
  },
  alreadySent: {
    pageTitle: 'You have already answered',
    title: 'You have already answered, thank you!',
    text: (date) => `${date ? `Your answers arrived on ${date}` : 'Your answers have arrived'}: there is no need to fill it in again. You can now close this page.`,
  },
  question: {
    required: '(required)',
    otherField: (label) => `${label}: write your answer`,
    consent: 'You can contact me for a short chat',
    back: 'Back',
    next: 'Next',
    send: 'Send',
    keyHint: 'or press Enter ↵',
    checkMarked: 'Please check the marked answers.',
    suggestBefore: 'Did you mean',
    suggestAfter: '?',
    suggestFix: 'Yes, fix it',
  },
  sending: { busy: 'Sending…', anyway: 'Send anyway' },
  reminder: {
    title: (count) => (count === 1 ? 'You left one question unanswered:' : `You left ${count} questions unanswered:`),
    review: (count) => (count === 1 ? 'Answer it' : 'Answer the skipped ones'),
    label: 'Unanswered questions',
    more: (count) => `and ${count} more.`,
    text: 'They are not required: if you prefer, send them as they are.',
  },
  thanks: {
    pageTitle: 'Thank you',
    title: 'Thank you!',
    received: 'We have received your answers.',
    writeTo: 'We will write to',
    close: 'You can now close this page.',
  },
};

const TEXTS = Object.freeze({ en, it });
const LOCALES = Object.freeze({ en: 'en-GB', it: 'it-IT' });

/** The texts of a language; an unknown one gets English, the default. */
export function textsFor(lang) {
  return TEXTS[lang === 'it' ? 'it' : 'en'];
}

// The respondent's language: Italian when the first language of the device is Italian, English otherwise. The same
// rule as the site (assets/js/i18n/languages.js), repeated here so that the page keeps loading nothing of the site.
export function deviceLanguage(nav) {
  const list = Array.isArray(nav?.languages) && nav.languages.length ? nav.languages : [nav?.language];
  const first = list[0];
  return typeof first === 'string' && first.trim().toLowerCase().startsWith('it') ? 'it' : 'en';
}

// The language a page has declared on <html lang>, or the device's: the site declares the language its people chose,
// q.html the respondent's, so what both of them share (the minutes of a survey) follows the page it is shown on.
export function pageLanguage(doc = globalThis.document, nav = globalThis.navigator) {
  const declared = String(doc?.documentElement?.lang || '').trim().toLowerCase().slice(0, 2);
  return declared === 'it' || declared === 'en' ? declared : deviceLanguage(nav);
}

// Decided once, when the page opens.
export const language = deviceLanguage(globalThis.navigator);
export const locale = LOCALES[language];
export const texts = textsFor(language);
