// Testi in italiano: è la lingua di riferimento, l'inglese ne segue la forma.
// La campanella: cosa fanno gli altri nel progetto aperto. Ogni frase riceve chi l'ha fatto e il titolo già tra virgolette.
export const notifications = {
  quote: (title) => `«${title}»`,
  untitled: 'senza titolo',
  aCard: 'una scheda',
  idea: {
    created: (who, title) => `${who} ha aggiunto l'idea ${title}`,
    archived: (who, title) => `${who} ha archiviato l'idea ${title}`,
    restored: (who, title) => `${who} ha ripristinato l'idea ${title}`,
    moved: (who, title, status) => `${who} ha spostato ${title} in «${status}»`,
  },
  decision: {
    created: (who, title) => `${who} ha registrato la decisione ${title}`,
    marked: (who, title, status) => `${who} ha segnato la decisione ${title} come «${status}»`,
  },
  experiment: {
    planned: (who, title) => `${who} ha pianificato l'esperimento ${title}`,
    concluded: (who, title) => `${who} ha concluso l'esperimento ${title}`,
  },
  interview: (who, title) => `${who} ha aggiunto l'intervista ${title}`,
  contact: (who, title) => `${who} ha aggiunto ${title} tra le persone con cui interfacciarsi`,
  survey: {
    created: (who, title) => `${who} ha creato un questionario: ${title}`,
    opened: (who, title) => `${who} ha aperto il questionario ${title}`,
  },
  teamcanvas: (who) => `${who} ha aggiornato il Team Canvas`,
  equity: (who) => `${who} ha aggiornato la divisione delle quote`,
  criteria: (who) => `${who} ha cambiato i criteri di valutazione`,
  expensegroup: (who, title) => `${who} ha creato il gruppo di spese ${title}`,
  expense: {
    refund: (who, where) => `${who} ha registrato un rimborso${where}`,
    income: (who, title, where) => `${who} ha registrato l'entrata ${title}${where}`,
    expense: (who, title, where) => `${who} ha aggiunto la spesa ${title}${where}`,
    inGroup: (title) => ` in ${title}`,
  },
  // Le altre schede di un'idea, annunciate quando nascono. Con l'articolo: in italiano dipende dal nome della scheda.
  board: (who, what, title) => `${who} ha creato ${what}: ${title}`,
  boards: {
    canvas: 'un Lean Canvas',
    persona: 'una buyer persona',
    vpc: 'un Value Proposition Canvas',
    market: 'una stima del mercato',
    competitors: 'un\'analisi dei concorrenti',
    deeptech: 'una scheda deep tech',
    note: 'una nota',
  },
  comment: (who, target) => `${who} ha commentato ${target}`,
  claudeAnswer: (who, target) => `${who} ha salvato una risposta di Claude su ${target}`,
  reminder: (week) => `Non hai ancora segnato le ore della settimana ${week}`,
  bell: {
    title: 'Notifiche',
    unread: (count) => `Notifiche, ${count} da leggere`,
    markAllRead: 'Segna tutte come lette',
    empty: 'Nessuna novità da leggere.',
    showRead: 'Mostra anche quelle già lette',
    hideRead: 'Nascondi quelle già lette',
    alertsHint: 'Avvisi anche quando il sito è in un\'altra scheda:',
    alertsLink: 'attivali dal Profilo',
  },
};
