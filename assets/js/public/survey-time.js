// Tempo stimato di un questionario, per la pagina pubblica e per l'editor. Nessuna dipendenza: lo usa anche la pagina senza login.
// Lettura a 4 parole al secondo (238 al minuto, Brysbaert 2019) di introduzione e domande, più un tempo fisso per tipo
// di domanda, il tutto per 1,1: sul telefono si va un po' più piano (Antoun e Cernat 2020), ma con una domanda per
// schermata si scorre e si scrive poco. L'informativa è chiusa e si apre a richiesta, quindi non conta.
// Né gonfiata né sottostimata: una durata lunga fa iniziare meno persone, una troppo corta fa abbandonare di più
// (Galesic e Bosnjak 2009). Tarata sulla prima compilazione completa vera (223 secondi per una stima di 259).

export const WORDS_PER_SECOND = 4;
export const PHONE_FACTOR = 1.1;
export const MIN_OBSERVED = 20;

export const ANSWER_SECONDS = Object.freeze({
  sezione: 0,
  scelta: 4,
  scala: 4,
  scelte: 6,
  numero: 8,
  email: 8,
  breve: 15,
  lunga: 30,
});

export const countWords = (text) => String(text || '').split(/\s+/).filter(Boolean).length;

// Parole di una domanda come la vede chi risponde: testo, aiuto, risposte ed etichette della scala.
export function questionWords(q) {
  let words = countWords(q.label) + countWords(q.help);
  for (const option of q.options || []) words += countWords(option.label);
  if (q.scale) {
    words += countWords(q.scale.min_label) + countWords(q.scale.max_label);
    for (const label of q.scale.labels || []) words += countWords(label);
  }
  return words;
}

export function estimateSeconds(survey) {
  const questions = Array.isArray(survey?.questions) ? survey.questions : [];
  let words = countWords(survey?.intro);
  let answering = 0;
  for (const q of questions) {
    words += questionWords(q);
    answering += ANSWER_SECONDS[q.type] ?? 8;
  }
  return Math.round(PHONE_FACTOR * (words / WORDS_PER_SECOND + answering));
}

// Minuti da mostrare, «circa»: al minuto più vicino. Con almeno 20 compilazioni complete vale la mediana osservata.
export function estimateMinutes(survey, medianSeconds = null) {
  const seconds = Number.isFinite(medianSeconds) && medianSeconds > 0 ? medianSeconds : estimateSeconds(survey);
  return Math.max(1, Math.round(seconds / 60));
}

export const minutesLabel = (minutes) => (minutes === 1 ? 'circa 1 minuto' : `circa ${minutes} minuti`);
