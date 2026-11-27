// Testi in italiano: è la lingua di riferimento, l'inglese ne segue la forma.
// Gli elenchi di esperimenti, interviste e decisioni.
const giorni = (n) => `${n} ${n === 1 ? 'giorno' : 'giorni'}`;

export const lists = {
  sources: {
    colloquio: 'Colloqui con persone',
    ricerca: 'Ricerche online',
  },
  all: 'Tutti',
  filters: {
    idea: 'Idea',
    member: 'Persona',
    type: 'Tipo',
    commitment: 'Impegno',
    text: 'Testo',
  },
  late: (days) => `in ritardo di ${giorni(days)}`,
  untilDue: (days) => `${giorni(days)} alla scadenza`,
  headers: {
    date: 'Data',
    interview: 'Intervista',
    idea: 'Idea',
    interviewer: 'Intervistatore',
    status: 'Stato',
    commitment: 'Impegno',
    problem: 'Problema',
  },
  empty: (kinds) => `Nessun elemento: ${kinds} con questi filtri.`,
  subtitles: {
    experiment: 'Ogni esperimento mette alla prova un\'assunzione, con un criterio di successo deciso prima.',
    interview: 'Fatti e impegni contano più delle opinioni e dei complimenti.',
    decision: 'Cosa abbiamo deciso, quando e perché.',
  },
  newItem: (kind) => `Nuovo: ${kind}`,
};
