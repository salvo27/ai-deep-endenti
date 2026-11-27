// Testi in italiano: è la lingua di riferimento, l'inglese ne segue la forma.
// La pagina Contatti: le persone da sentire per tutte le idee.
const giorni = (n) => `${n} ${n === 1 ? 'giorno' : 'giorni'}`;
const persone = (n) => `${n} ${n === 1 ? 'persona' : 'persone'}`;

export const contacts = {
  title: 'Contatti',
  subtitle: 'Le persone da sentire per tutte le idee. A ognuna serve qualcuno che se ne occupi e una data.',
  filters: {
    tutte: 'Tutte',
    mie: 'Mie',
    senza: 'Senza responsabile',
    settimana: 'Da sentire questa settimana',
  },
  which: 'Quali persone',
  status: 'Stato',
  idea: 'Idea',
  allStatuses: 'Tutti',
  allIdeas: 'Tutte',
  noDate: 'senza data',
  late: (days) => `in ritardo di ${giorni(days)}`,
  today: 'oggi',
  tomorrow: 'domani',
  inDays: (days) => `tra ${giorni(days)}`,
  summary: (s, forIdea) =>
    `${persone(s.total)}${forIdea ? ' per questa idea' : ''}: ${s.toContact} da contattare, ${s.withOwner} con un responsabile, ${s.thisWeek} da sentire questa settimana${s.overdue ? ` (${s.overdue} in ritardo)` : ''}.`,
  statusOf: (title) => `Stato: ${title}`,
  ownerOf: (title) => `Chi se ne occupa: ${title}`,
  nextOf: (title) => `Prossimo contatto: ${title}`,
  ownerMessage: (name) => `Chi se ne occupa: ${name}`,
  ownerNone: 'nessuno',
  nextMessage: (date) => `Prossimo contatto: ${date}`,
  nextNone: 'nessuna data',
  interview: 'Intervista',
  logConversation: 'Registra il colloquio',
  logConversationHint: 'Scrivi com\'è andata: la persona viene collegata all\'intervista e passa a «In contatto»',
  empty: 'Nessuna persona in lista. Si aggiungono dalla pagina di ogni idea, nella scheda «Persone e interviste».',
  noMatch: 'Nessuna persona con questi filtri.',
  headers: {
    person: 'Persona',
    idea: 'Idea',
    status: 'Stato',
    owner: 'Chi se ne occupa',
    next: 'Prossimo contatto',
  },
  add: 'Aggiungi una persona',
};
