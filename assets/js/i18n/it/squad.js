// Testi in italiano: è la lingua di riferimento, l'inglese ne segue la forma.
// Pagina Squadra: Team Canvas, divisione delle quote, disponibilità e ore lavorate.
export const squad = {
  title: 'Squadra',
  subtitle: 'Il team che costruisce l\'azienda: chi siamo, come lavoriamo, quando siamo liberi, quante ore dedichiamo e come dividiamo le quote.',
  // «Team Canvas» è il nome dello strumento, uguale in ogni lingua: sta nel codice della pagina.
  tabs: {
    equity: 'Divisione delle quote',
    availability: 'Disponibilità',
    timesheet: 'Ore lavorate',
  },
  versions: 'Versioni',
  canvas: {
    intro: 'Da compilare insieme, in una sessione di un\'ora: ruoli, obiettivi, valori e regole messi per iscritto prima che servano.',
    empty: 'Il Team Canvas non è ancora stato compilato.',
    create: 'Compila il Team Canvas',
  },
  equity: {
    intro: 'Una proposta di divisione delle quote tra fondatori, da discutere apertamente prima di costituire la società.',
    empty: 'Le quote non sono ancora state discusse.',
    create: 'Prepara la divisione delle quote',
    method: 'Quote proposte con il metodo Demmler',
    noFounders: 'Aggiungi i fondatori per calcolare le quote.',
    noScores: 'Dai i punteggi per calcolare le quote.',
    disclaimer: 'Il calcolo è un punto di partenza per la discussione, non un accordo: le quote vanno messe per iscritto con un notaio o un legale, insieme al vesting.',
    factor: 'Elemento',
    weight: 'Peso',
    weightScale: 'Peso (0-10)',
    noName: 'Senza nome',
    factorName: 'Nome dell\'elemento',
    weightOf: (factor) => `Peso di ${factor}`,
    scoreOf: (founder, factor) => `${founder}: ${factor}`,
    founderName: 'Nome del fondatore',
    removeFounder: (name) => `Togli ${name}`,
    founder: 'fondatore',
    addFounder: 'Aggiungi un fondatore',
    founders: 'Fondatori',
    weights: 'Pesi e punteggi',
    weightsHelp: 'Per ogni elemento: quanto pesa per questa startup (0-10) e quanto contribuisce ciascuno (0-10).',
    result: 'Risultato',
  },
};
