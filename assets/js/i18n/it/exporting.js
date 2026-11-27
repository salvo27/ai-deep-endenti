// Testi in italiano: è la lingua di riferimento, l'inglese ne segue la forma.
// Esportazione di un'idea in Markdown: titoli e righe del file. La copia di sicurezza in JSON non ha testi.
export const exporting = {
  status: (label) => `Stato: ${label}`,
  exportedOn: (date) => `Esportato il ${date}`,
  scoring: 'Valutazione del team',
  score: (score, voters) => `Punteggio: ${score === null ? 'nessun voto' : `${score}/100`} (${voters === 1 ? '1 votante' : `${voters} votanti`})`,
  validated: '(validato)',
  experiments: 'Esperimenti',
  interviews: 'Interviste',
  competitors: {
    us: 'Noi',
    feature: 'Funzionalità',
    importance: 'Importanza',
    yes: 'sì',
  },
};
