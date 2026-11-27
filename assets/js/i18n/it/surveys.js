// Testi in italiano: è la lingua di riferimento, l'inglese ne segue la forma.
// Questionari: il modello di partenza, i controlli mentre si scrive, i colori, le statistiche delle risposte e il foglio da stampare.
export const surveys = {
  other: 'Altro',
  preferNot: 'Preferisco non rispondere',
  template: {
    intro: 'Siamo [nomi], [chi siete davvero, per esempio un gruppo di studenti del corso X]. Stiamo studiando come le persone [affrontano il problema]. Non vendiamo nulla. Le risposte sono anonime e alla fine, se vuoi, puoi lasciarci la tua email per una breve chiacchierata.',
    privacy: [
      'Chi raccoglie i dati: [nomi], [chi siete, per esempio studenti del corso X]. Per qualsiasi domanda scrivete a [email di contatto].',
      'Perché: capire come le persone [affrontano il problema] per il nostro progetto. Non vendiamo nulla e non usiamo le risposte per pubblicità.',
      'Quali dati: solo le risposte che scegli di dare. Non salviamo nome, indirizzo IP o posizione. L\'email è facoltativa e serve solo a ricontattarti, se lo chiedi.',
      'Anonimato: le risposte senza email sono anonime e i risultati si mostrano solo tutti insieme.',
      'Sul tuo dispositivo: per 30 giorni il browser ricorda quando hai aperto il link e le risposte in corso, per farti riprendere; dopo l\'invio, solo la data. Niente cookie né analisi.',
      'Per quanto tempo: teniamo le risposte fino a [data, per esempio la fine del progetto], poi le cancelliamo. L\'email la cancelliamo dopo il contatto o quando ce lo chiedi.',
      'I tuoi diritti: puoi chiedere di vedere, correggere o cancellare i tuoi dati scrivendo a [email di contatto], e puoi rivolgerti al Garante per la protezione dei dati personali.',
      'Rispondere è volontario e puoi fermarti quando vuoi.',
    ],
    thanksContact: 'Grazie! Ti scriviamo nei prossimi giorni per fissare una chiacchierata di 20 minuti, quando ti è comodo. Se cambi idea, basta risponderci «no grazie».',
    thanks: 'Grazie per il tuo tempo! Le tue risposte ci aiutano a capire meglio il problema. Se più avanti ti va di raccontarci la tua esperienza, scrivici a [email di contatto].',
    newQuestion: 'Nuova domanda',
    newSection: 'Nuova sezione',
    newEmail: 'Se vuoi parlarne in una breve chiacchierata, lasciaci la tua email',
    firstOption: 'Prima opzione',
    secondOption: 'Seconda opzione',
    situation: {
      label: 'Quale di queste descrive meglio la tua situazione?',
      options: ['[Situazione 1, per esempio studente]', '[Situazione 2, per esempio lavoratore dipendente]', '[Situazione 3, per esempio libero professionista]'],
    },
    age: { label: 'Quanti anni hai?', options: ['Meno di 25', 'Da 25 a 34', 'Da 35 a 44', 'Da 45 a 54', '55 o più'] },
    lastTime: {
      label: 'L\'ultima volta che [ti è capitato il problema], quanto tempo fa è stato?',
      options: ['Nell\'ultima settimana', 'Nell\'ultimo mese', 'Negli ultimi 6 mesi', 'Più di 6 mesi fa', 'Non mi è mai capitato'],
    },
    episode: { label: 'Raccontaci l\'ultima volta che [ti è capitato il problema]: cosa è successo e cosa hai fatto?', help: 'Bastano poche righe.' },
    howOften: { label: 'Nelle ultime 4 settimane, quante volte [ti è capitato il problema]?', help: 'Scrivi un numero, anche 0.' },
    timeLost: { label: 'L\'ultima volta, quanto tempo ti ha fatto perdere?' },
    email: { label: 'Se vuoi parlarne in una chiacchierata di 15 minuti, lasciaci la tua email', help: 'Facoltativa. La usiamo solo per questo.' },
  },
  // Etichette per ogni punto della scala, a 5 e a 7 punti: le chiavi sono quelle salvate, uguali in ogni lingua.
  scales: {
    frequenza: {
      name: 'Frequenza',
      five: ['Mai', 'Raramente', 'A volte', 'Spesso', 'Sempre'],
      seven: ['Mai', 'Quasi mai', 'Raramente', 'A volte', 'Spesso', 'Quasi sempre', 'Sempre'],
    },
    quantita: {
      name: 'Quantità',
      five: ['Per niente', 'Poco', 'Abbastanza', 'Molto', 'Moltissimo'],
      seven: ['Per niente', 'Pochissimo', 'Poco', 'Abbastanza', 'Molto', 'Moltissimo', 'Estremamente'],
    },
    facilita: {
      name: 'Facilità',
      five: ['Molto difficile', 'Difficile', 'Né facile né difficile', 'Facile', 'Molto facile'],
      seven: ['Molto difficile', 'Difficile', 'Abbastanza difficile', 'Né facile né difficile', 'Abbastanza facile', 'Facile', 'Molto facile'],
    },
    qualita: {
      name: 'Qualità',
      five: ['Pessima', 'Scarsa', 'Sufficiente', 'Buona', 'Ottima'],
      seven: ['Pessima', 'Molto scarsa', 'Scarsa', 'Sufficiente', 'Buona', 'Molto buona', 'Ottima'],
    },
    importanza: {
      name: 'Importanza',
      five: ['Per niente importante', 'Poco importante', 'Abbastanza importante', 'Molto importante', 'Fondamentale'],
      seven: ['Per niente importante', 'Quasi per niente importante', 'Poco importante', 'Abbastanza importante', 'Importante', 'Molto importante', 'Fondamentale'],
    },
  },
  // Avvisi mentre si scrive: cosa non va e una forma migliore.
  checks: {
    conditional: {
      text: (words) => `Verbo al condizionale («${words.join('», «')}»): chiede un'intenzione, e le intenzioni prevedono male quello che le persone fanno davvero.`,
      hint: 'Chiedi un fatto passato: «L\'ultima volta che...» o «Nelle ultime 4 settimane, quante volte...» invece di «Compreresti...».',
    },
    agree: {
      text: 'Domanda «d\'accordo / in disaccordo»: porta a dire di sì e misura peggio di una domanda diretta.',
      hint: 'Chiedi la cosa che vuoi sapere: invece di «Quanto sei d\'accordo: mi capita spesso» chiedi «Quanto spesso ti capita?» con le etichette Mai, Raramente, A volte, Spesso, Sempre.',
    },
    leading: { text: 'La domanda suggerisce la risposta.', hint: 'Falla neutra: invece di «Non pensi che sia scomodo...?» chiedi «Com\'è andata l\'ultima volta che...?».' },
    incentive: {
      text: 'Si parla di premi, buoni o sconti: attirano persone interessate al premio e non al problema.',
      hint: 'Togli l\'incentivo: il manuale lo sconsiglia. Spiega piuttosto perché le risposte vi servono.',
    },
    solution: {
      text: 'Si parla della soluzione: chi risponde tende a dare ragione a chi ha fatto la domanda.',
      hint: 'Chiedi del problema e di cosa fanno oggi: «Come lo hai risolto l\'ultima volta?».',
    },
    screening: {
      text: 'Si capisce chi state cercando: qualcuno potrebbe rispondere per rientrarci.',
      hint: 'Chiedi la situazione con una domanda a scelta che abbia anche opzioni che non vi interessano, senza dire quale cercate.',
    },
    empty: { text: 'La domanda non ha testo: non verrà salvata.', hint: 'Scrivi la domanda o eliminala.' },
    agreeScale: { text: 'Scala «d\'accordo / in disaccordo»: misura peggio di una scala specifica.', hint: 'Usa etichette legate alla domanda, per esempio Mai, Raramente, A volte, Spesso, Sempre.' },
    labels: { text: 'Non tutti i punti della scala hanno un\'etichetta.', hint: 'Dai un nome a ogni punto: le scale con tutte le etichette sono più affidabili.' },
    options: { text: 'La domanda non ha opzioni: chi risponde non la vedrà.', hint: 'Aggiungi almeno un\'opzione.' },
    brackets: { text: 'Ci sono ancora parti tra parentesi quadre.', hint: 'Sostituiscile con il vostro testo.' },
    noQuestions: { text: 'Non ci sono domande.', hint: 'Parti dal modello: poche domande su chi risponde, poi il problema al passato.' },
    noIntro: { text: 'Manca l\'introduzione.', hint: 'Scrivi chi siete, cosa state studiando e che non vendete nulla.' },
    inIntro: (text) => `Introduzione: ${text}`,
    noPrivacy: {
      text: 'Manca l\'informativa sulla privacy.',
      hint: 'Circa 150 parole: chi siete, perché raccogliete i dati, quali dati, anonimato, per quanto li tenete, diritti e un contatto.',
    },
    thanksIncentive: { text: 'Messaggio finale: si parla di premi, buoni o sconti.', hint: 'Togli l\'incentivo: il manuale lo sconsiglia.' },
    places: {
      intro: 'introduzione',
      privacy: 'privacy',
      thanks: 'messaggio finale',
      thanksContact: 'messaggio per chi vuole essere ricontattato',
      questions: (count) => (count === 1 ? '1 domanda' : `${count} domande`),
    },
    bracketsLeft: {
      text: (places) => `Parti tra parentesi quadre ancora da sostituire: ${places.join(', ')}.`,
      hint: 'Sostituisci le parti tra [ ] con il vostro testo prima di aprire il questionario.',
    },
    tooManyProblem: {
      text: (count, max) => `${count} domande sul problema: il manuale ne consiglia al massimo ${max}.`,
      hint: 'Tieni quelle che vi servono per decidere; il resto chiedetelo nelle interviste.',
    },
    tooManyPersona: {
      text: (count, max) => `${count} domande su chi risponde: ne bastano ${max} al massimo.`,
      hint: 'Tieni solo quelle che dicono se la persona è nel vostro target.',
    },
    tooManyOpen: {
      text: (count, max) => `${count} domande aperte: oltre ${max} le risposte si accorciano e più persone abbandonano.`,
      hint: 'Trasforma le altre in domande a scelta; tieni aperta quella che chiede un episodio concreto.',
    },
    tooManyRequired: {
      text: (count) => `${count} domande obbligatorie: obbligare a rispondere fa abbandonare di più.`,
      hint: 'Lasciale facoltative; al massimo una o due, per esempio quella che dice se la persona è nel target.',
    },
    tooLong: {
      text: (minutes, max) => `Durata stimata di circa ${minutes} minuti: oltre ${max} le risposte diventano più frettolose e più persone abbandonano.`,
      hint: 'Togli le domande che non userete per decidere.',
    },
    noEmail: {
      text: 'Manca la domanda per l\'email.',
      hint: 'Il questionario serve soprattutto a trovare persone da intervistare: aggiungi l\'email facoltativa alla fine.',
    },
  },
  // I colori consigliati per la pagina pubblica.
  colours: { indigo: 'Indaco', blue: 'Blu', teal: 'Verde acqua', green: 'Verde', amber: 'Ambra', red: 'Rosso', raspberry: 'Lampone', violet: 'Viola' },
  contrast: {
    text: { text: 'Né il testo bianco né quello nero arrivano a 4,5:1 sul colore: il testo dei pulsanti si leggerebbe male.', hint: 'Scegli un colore più chiaro o più scuro.' },
    light: {
      text: (ratio) => `Sullo sfondo chiaro il colore si vede poco (${ratio}): la pagina lo scurisce da sola quanto basta, quindi chi risponde vedrà un colore più scuro.`,
      hint: 'Per avere proprio questo colore scegline uno più scuro.',
    },
    dark: {
      text: (ratio) => `Sullo sfondo scuro il colore si vede poco (${ratio}): la pagina lo schiarisce da sola quanto basta, quindi chi risponde vedrà un colore più chiaro.`,
      hint: 'Per avere proprio questo colore scegline uno più chiaro.',
    },
  },
  stats: {
    // Le chiavi sono i codici delle segnalazioni e i dispositivi salvati nel database.
    flags: {
      veloce: 'Molto più veloce degli altri',
      lettura: 'Troppo veloce per leggere le domande',
      uguali: 'Stessa risposta a tutte le scale',
      aperta: 'Risposta aperta vuota o di meno di 3 parole',
      saltate: 'Più di metà delle domande saltate',
      domande: 'Diverse domande risposte troppo in fretta',
    },
    devices: { telefono: 'Telefono', computer: 'Computer' },
    funnel: { views: 'Link aperto', starts: 'Iniziati', partial: 'Interrotti a metà', completed: 'Completati' },
    csv: {
      // Il punto e virgola: è quello che si aspetta un foglio di calcolo in italiano, dove la virgola è il separatore dei decimali.
      separator: ';',
      response: 'Risposta',
      date: 'Data',
      status: 'Stato',
      duration: 'Durata (secondi)',
      device: 'Dispositivo',
      email: 'Email',
      recontact: 'Da ricontattare',
      flags: 'Segnalazioni',
      completed: 'completata',
      partial: 'interrotta',
      yes: 'sì',
      no: 'no',
    },
  },
  print: {
    number: {
      range: (min, max) => `Numero intero da ${min} a ${max}`,
      min: (min) => `Numero intero, almeno ${min}`,
      max: (max) => `Numero intero, al massimo ${max}`,
      any: 'Numero intero',
    },
    kinds: {
      scelta: 'Una risposta',
      scelte: 'Una o più risposte',
      scala: (points) => `Scala da 1 a ${points}`,
      breve: 'Risposta breve',
      lunga: 'Risposta lunga',
      email: 'Email, facoltativa per ricontattare',
      emailRequired: 'Email, per ricontattare',
    },
    consent: 'Potete ricontattarmi per una breve chiacchierata',
    required: '(obbligatoria)',
    summary: (count, minutes, status) => `Questionario · ${count === 1 ? '1 domanda' : `${count} domande`} · ${minutes} · ${status}`,
    intro: 'Introduzione',
    questions: 'Domande',
    thanks: 'Messaggio finale',
    thanksContact: 'Messaggio per chi chiede di essere ricontattato',
    privacy: 'Informativa sulla privacy',
    documentTitle: (title) => `Questionario - ${title}`,
  },
};
