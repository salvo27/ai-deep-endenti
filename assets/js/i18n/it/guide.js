// Testi in italiano: è la lingua di riferimento, l'inglese ne segue la forma.
// La Guida: la roadmap con il metodo e gli strumenti della board. I concetti hanno il loro modulo.
export const guide = {
  title: 'Guida',
  subtitle: 'La roadmap da seguire per ogni idea, in ordine: dalla squadra alla società. Ogni idea ne ha una copia interattiva nel tab Roadmap, dove segnate i passi fatti.',
  tabs: {
    roadmap: 'Roadmap',
    concepts: 'Concetti',
  },
  progress: {
    title: 'A che punto sono le vostre idee',
    empty: 'Nessuna idea ancora: la roadmap di ogni idea comparirà qui.',
    columns: ['Idea', 'Stato', 'Avanzamento', 'Fase', 'Prossimo passo'],
    complete: 'Completata',
  },
  howTo: {
    title: 'Come usare la roadmap',
    order: (phases, steps) => `${phases} fasi e ${steps} passi, nell'ordine che riduce il rischio: prima le persone e il problema, poi la soluzione, solo alla fine l'azienda.`,
    points: [
      'Ogni passo dice cosa fare, come farlo, quando si può considerare fatto e l\'errore più comune da evitare.',
      'Un passo è fatto solo quando lo spuntate voi: resta scritto chi e quando, e la spunta si può togliere. Se i dati del sito fanno pensare che sia fatto, per esempio 20 interviste registrate, la roadmap ve lo suggerisce.',
      'Ogni fase finisce con un cancello: cosa deve essere vero prima di andare avanti. Se una fase non è completa, quella dopo ve lo ricorda.',
      'Ogni idea ha la sua roadmap, perché squadra, clienti e tempi possono essere diversi da un\'idea all\'altra.',
    ],
    example: (name) => `Esempio di roadmap avanzata: ${name}`,
  },
  toolsTitle: 'Gli strumenti della board',
  // Lean Canvas e Deep tech si scrivono uguali nelle due lingue: il nome sta nel codice, qui solo la spiegazione.
  tools: {
    idea: { name: 'Idea', text: 'La scheda di partenza: frase, problema, cliente, soluzione.' },
    roadmap: { name: 'Roadmap', text: 'Tutti i passi in ordine, con quello che manca a ogni idea.' },
    canvas: { text: 'Le ipotesi del modello di business, blocco per blocco.' },
    customers: { name: 'Clienti', text: 'Buyer persona e Value Proposition Canvas.' },
    market: { name: 'Mercato', text: 'TAM, SAM, SOM e analisi dei concorrenti.' },
    deepTech: { text: 'TRL, proprietà intellettuale, ateneo, norme e bandi.' },
    experiments: { name: 'Esperimenti', text: 'Javelin Board: un\'assunzione per esperimento, criterio deciso prima.' },
    interviews: { name: 'Interviste', text: 'Fatti, citazioni e impegni presi.' },
    decisions: { name: 'Decisioni', text: 'Cosa si è deciso, con alternative e motivi.' },
    team: { name: 'Squadra', text: 'Team Canvas, quote, orari liberi in comune e ore lavorate.' },
  },
};
