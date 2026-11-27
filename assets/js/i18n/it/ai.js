// Testi in italiano: è la lingua di riferimento, l'inglese ne segue la forma.
// Le richieste a Claude: i nomi dei compiti, le etichette del contenuto che gli si manda e la finestra con la risposta.
export const ai = {
  tasks: {
    critique: 'Critica',
    next_experiment: 'Prossimo esperimento',
    interview_questions: 'Domande per le interviste',
    interview_synthesis: 'Sintesi delle interviste',
    cell_ideas: 'Idee per la cella',
  },
  // Etichette del contenuto delle board mandato a Claude, nella lingua in uso.
  context: {
    status: (label) => `Stato: ${label}`,
    validated: '(validato con dati)',
    us: 'Noi',
    directCompetitor: (name) => `Concorrente diretto: ${name}`,
    indirectCompetitor: (name) => `Concorrente indiretto: ${name}`,
    feature: (label, importance, who) => `Funzionalità «${label}» (importanza ${importance}): ${who}`,
    nobody: 'nessuno',
    capability: (row) => `Capacità del team: ${row}`,
    sector: (col) => `Settore: ${col}`,
    cellNotes: (text) => `Spunti già scritti:\n${text}`,
    existingIdeas: (titles) => `Idee già presenti nella board:\n${titles.map((title) => `- ${title}`).join('\n')}`,
  },
  errors: {
    empty: 'Non c\'è ancora abbastanza contenuto da mandare a Claude.',
    tooLong: 'C\'è troppo testo da mandare a Claude in una volta. Riduci il numero di interviste o accorcia i campi.',
    invalidTask: 'Richiesta non valida.',
    emptyResponse: 'Claude non ha restituito una risposta utilizzabile.',
  },
  panel: {
    reading: 'Claude sta leggendo la board…',
    copied: 'Testo copiato.',
    copyFailed: 'Copia non riuscita.',
    saveAsComment: 'Salva come commento',
    savedAsComment: (title) => `Salvato tra i commenti di «${title}».`,
    use: 'Usa',
    truncated: 'La risposta è stata interrotta perché troppo lunga.',
    remaining: (n) => `Richieste a Claude ancora disponibili: ${n}`,
    mistakes: 'Claude può sbagliare: verifica i fatti prima di usarli.',
  },
};
