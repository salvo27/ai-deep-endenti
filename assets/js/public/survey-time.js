// Tempo stimato di un questionario, per la pagina pubblica e per l'editor. Nessuna dipendenza: lo usa anche la pagina senza login.
// Lettura a 3,3 parole al secondo (circa 300 ms a parola, prudente rispetto ai 238 al minuto di Brysbaert 2019),
// più un tempo fisso per tipo di domanda, il tutto per 1,4: sul telefono si va più piano (Antoun e Cernat 2020).
// Meglio sovrastimare: promettere meno di quanto serve fa abbandonare di più (Galesic e Bosnjak 2009).

export const WORDS_PER_SECOND = 3.3;
export const PHONE_FACTOR = 1.4;
export const PRIVACY_WORDS_READ = 150;
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

function questionWords(q) {
  let words = countWords(q.label) + countWords(q.help);
  for (const option of q.options || []) words += countWords(option.label);
  if (q.scale) {
    words += countWords(q.scale.min_label) + countWords(q.scale.max_label);
    for (const label of q.scale.labels || []) words += countWords(label);
  }
  return words;
}

// Della privacy si conta solo il riassunto che si legge davvero; il testo completo si apre a richiesta.
export function estimateSeconds(survey) {
  const questions = Array.isArray(survey?.questions) ? survey.questions : [];
  let words = countWords(survey?.intro) + Math.min(countWords(survey?.privacy), PRIVACY_WORDS_READ);
  let answering = 0;
  for (const q of questions) {
    words += questionWords(q);
    answering += ANSWER_SECONDS[q.type] ?? 8;
  }
  return Math.round(PHONE_FACTOR * (words / WORDS_PER_SECOND + answering));
}

// Minuti da mostrare: arrotondati per eccesso. Con almeno 20 compilazioni complete vale la mediana osservata.
export function estimateMinutes(survey, medianSeconds = null) {
  const seconds = Number.isFinite(medianSeconds) && medianSeconds > 0 ? medianSeconds : estimateSeconds(survey);
  return Math.max(1, Math.ceil(seconds / 60));
}

export const minutesLabel = (minutes) => (minutes === 1 ? 'circa 1 minuto' : `circa ${minutes} minuti`);
