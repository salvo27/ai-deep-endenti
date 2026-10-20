// Roadmap di ogni idea: tutti i passi in ordine, dalla squadra alla società, per non saltare nulla e ridurre il rischio.
// Segue il percorso del manuale (Customer Development, Lean Startup, team, finanza, aspetti legali, deep tech).
// Un passo è fatto solo quando lo segna qualcuno (data.roadmap); i controlli sui dati della board sono solo suggerimenti.

import { STRONG_COMMITMENTS, parseRoadmapMark } from './schema.js';

const doneInterviews = (ctx) => ctx.interviews.filter((i) => i.status === 'fatta' || i.status === 'analizzata').length;
const analyzedInterviews = (ctx) => ctx.interviews.filter((i) => i.status === 'analizzata').length;
const strongCommitments = (ctx) => ctx.interviews.filter((i) => STRONG_COMMITMENTS.has(i.data.commitment)).length;
const maxValidated = (ctx) => Math.max(0, ...ctx.canvases.map((c) => Object.keys(c.data.validated || {}).length));
const maxRivals = (ctx) => Math.max(0, ...ctx.competitors.map((c) => c.data.rivals?.length || 0));
const deep = (ctx) => ctx.deeptechs[0] || null;

const editIdea = (ctx) => `#/modifica/${ctx.idea.id}`;
const tab = (name) => (ctx) => `#/idea/${ctx.idea.id}/${name}`;
const newItem = (kind) => (ctx) => `#/nuovo/${kind}?idea=${ctx.idea.id}`;
const tabOrNew = (name, kind, list) => (ctx) => (ctx[list].length ? tab(name)(ctx) : newItem(kind)(ctx));

export const ROADMAP = [
  {
    key: 'squadra',
    title: 'La squadra',
    goal: 'Mettersi d\'accordo sulle persone prima che sui numeri: chi c\'è, quanto tempo mette, cosa vuole ottenere.',
    note: 'Ogni idea può avere una squadra diversa: questi passi valgono per le persone che lavorano a questa idea. Se è la squadra del sito, usate le pagine Squadra e Quote.',
    gate: 'Andate avanti quando tutti hanno detto chiaramente ruolo, tempo e obiettivi e nessun vincolo personale blocca il progetto. I problemi tra soci sono tra le prime cause di fallimento.',
    skipRisk: 'Senza accordi chiari, i disaccordi arrivano proprio quando l\'idea inizia a funzionare.',
    steps: [
      {
        key: 'team-canvas',
        title: 'Compilate il Team Canvas',
        what: 'Una sessione di un\'ora e mezza in cui la squadra mette per iscritto obiettivi comuni e personali, valori, bisogni, regole, punti di forza e debolezze.',
        how: [
          'Fatelo di persona, tutti presenti, partendo dagli obiettivi personali: è lì che emergono le aspettative diverse.',
          'Scrivete obiettivi comuni misurabili e con una scadenza, per esempio «decidere se proseguire entro marzo».',
          'Se la squadra è quella del sito usate la pagina Squadra; altrimenti compilatelo in un documento condiviso e segnate qui il passo.',
        ],
        done: 'Tutti i blocchi sono compilati e ogni persona si riconosce in quello che c\'è scritto.',
        mistake: 'Saltarlo perché «ci conosciamo già»: amicizia e società sono cose diverse.',
        concept: 'team-canvas',
        href: () => '#/squadra',
      },
      {
        key: 'ruoli-tempo',
        title: 'Dichiarate ruoli e ore a settimana',
        what: 'Ognuno dice di cosa si occupa (prodotto e tecnologia, clienti e vendite, numeri e amministrazione) e quante ore a settimana può garantire nei prossimi 3 mesi.',
        how: [
          'Scrivete le ore reali, tolti lavoro, esami e impegni fissi.',
          'Assegnate un responsabile per area: nel suo ambito decide lui, dopo aver sentito gli altri.',
          'Riparlatene ogni 3 mesi: il tempo disponibile cambia.',
        ],
        done: 'Ruoli e ore sono scritti (nel Team Canvas, blocco Persone e ruoli) e tutti li hanno accettati.',
        mistake: 'Dare per scontato che tutti mettano lo stesso impegno: è la prima fonte di risentimento quando si parla di quote.',
        concept: 'cofounder',
        href: () => '#/squadra',
      },
      {
        key: 'regole',
        title: 'Decidete come lavorate e come decidete',
        what: 'Poche regole su riunioni, canali e decisioni, così i disaccordi non bloccano il lavoro.',
        how: [
          'Una riunione breve a settimana, con le decisioni importanti scritte nella sezione Decisioni del sito.',
          'Decisioni di area: le prende il responsabile. Decisioni importanti (cambio di direzione, soldi, nuovi soci): decidete ora se all\'unanimità o a maggioranza.',
          'Un solo canale per le cose urgenti, il sito per tutto ciò che va ricordato.',
        ],
        done: 'Le regole sono scritte (nel Team Canvas, blocco Regole e attività).',
        mistake: 'Decidere tutto a voce: dopo un mese nessuno ricorda chi aveva deciso cosa.',
        concept: 'team-canvas',
        href: () => '#/squadra',
      },
      {
        key: 'vincoli',
        title: 'Controllate i vincoli personali',
        what: 'Prima di investire tempo, ognuno verifica che nulla gli impedisca di partecipare, di avere quote o di portare le proprie idee nella società.',
        how: [
          'Contratti di lavoro: esclusiva, non concorrenza, proprietà delle invenzioni fatte per il datore di lavoro.',
          'Università: regolamento su spin-off e brevetti, borse di dottorato e assegni di ricerca, incarichi dei docenti.',
          'Idee nate in un laboratorio o con dati dell\'ateneo: potrebbero appartenere all\'ateneo.',
        ],
        done: 'Ognuno ha controllato e scritto eventuali vincoli; quelli dubbi sono stati chiesti a chi può rispondere (ufficio del personale, ufficio di trasferimento tecnologico).',
        mistake: 'Scoprire dopo mesi che un socio non può avere quote o che l\'idea non è vostra.',
        concept: 'invenzioni-universitarie',
      },
      {
        key: 'mentor',
        title: 'Trovate un mentor',
        what: 'Una persona con esperienza nel settore o nel fare impresa, che vi dedica un\'ora al mese e vi dice anche le cose scomode.',
        how: [
          'Cercate tra docenti, imprenditori del settore, incubatori ed ex founder; chiedete presentazioni a chi conoscete.',
          'Fate una richiesta precisa: un incontro al mese per 6 mesi, su domande preparate da voi.',
          'Aggiungetelo tra le persone con cui interfacciarsi, con lo scopo «Mentor o advisor».',
        ],
        done: 'Almeno un mentor ha accettato e il primo incontro è fissato o fatto.',
        mistake: 'Cercare chi vi dà ragione, o offrire subito quote senza sapere quanto vi aiuterà.',
        concept: 'mentor',
        href: newItem('contact'),
      },
      {
        key: 'quote',
        title: 'Parlate di quote e vesting',
        what: 'Una prima discussione aperta su come dividere le quote, prima che l\'idea valga qualcosa: dopo è molto più difficile.',
        how: [
          'Usate la pagina Quote (metodo Demmler) come base di discussione, non come verdetto.',
          'Concordate il vesting: le quote si maturano nel tempo, spesso in 4 anni con un primo anno di attesa.',
          'Scrivete l\'accordo anche se informale; quello definitivo arriva con il patto tra soci.',
        ],
        done: 'Esiste una proposta di divisione con vesting condivisa da tutti.',
        mistake: 'Dividere in parti uguali per evitare la discussione: spesso è la scelta che crea più problemi dopo.',
        concept: 'demmler',
        href: () => '#/squadra/quote',
      },
    ],
  },
  {
    key: 'scelta',
    title: 'Perché proprio questa idea',
    goal: 'Non innamorarsi della prima idea: confrontarla con le alternative e sceglierla con criteri decisi prima.',
    gate: 'Andate avanti solo se l\'idea è stata votata con criteri decisi prima e passa il test della scalabilità. Altrimenti parcheggiatela e lavorate su un\'altra.',
    skipRisk: 'Rischiate di passare mesi sull\'idea preferita invece che su quella migliore.',
    steps: [
      {
        key: 'dieci-idee',
        title: 'Raccogliete almeno 10 idee in tutto',
        what: 'Prima di scegliere servono alternative: anche le idee scartate aiutano a capire cosa vi interessa davvero.',
        how: [
          'Usate il Generatore: incrociate le competenze della squadra con i settori e scrivete uno spunto per cella.',
          'Ognuno porta almeno 3 problemi visti da vicino, non soluzioni.',
          'Trasformate gli spunti migliori in idee nel sito, anche solo con nome e frase.',
        ],
        done: 'Nel sito ci sono almeno 10 idee.',
        mistake: 'Partire dalla tecnologia che sapete usare invece che da un problema di qualcuno.',
        concept: 'innamorarsi-idea',
        href: () => '#/generatore',
        auto: (ctx) => ctx.ideasCount >= 10,
        progress: (ctx) => `${Math.min(ctx.ideasCount, 10)} su 10`,
      },
      {
        key: 'startup-davvero',
        title: 'Verificate che sia una startup',
        what: 'Una startup deve poter crescere molto più dei suoi costi. Se non è così può essere comunque un buon progetto, ma va gestito in un altro modo.',
        how: [
          'Scalabile: servire 10 volte più clienti costa molto meno di 10 volte tanto?',
          'Replicabile: lo stesso modello funziona in altre città o paesi?',
          'Dieci volte meglio: per il cliente è molto meglio di quello che usa oggi, non solo un po\'?',
        ],
        done: 'Avete risposto per iscritto alle tre domande, per esempio nei commenti dell\'idea.',
        mistake: 'Chiamare startup una consulenza o un negozio: cambiano finanziamenti, tempi e rischi.',
        concept: 'scalabilita',
        href: tab('commenti'),
      },
      {
        key: 'criteri',
        title: 'Decidete i criteri prima di votare',
        what: 'Criteri e pesi si scelgono prima di vedere i voti, altrimenti si finisce per giustificare l\'idea preferita.',
        how: [
          'Partite dai criteri della pagina Valutazione e adattate i pesi alla vostra situazione.',
          'Tenete sempre accesso ai clienti, accesso ai dati, competenze di settore e tempo ai primi ricavi.',
          'Non cambiate i criteri dopo aver visto la classifica.',
        ],
        done: 'I criteri sono salvati nella pagina Valutazione.',
        mistake: 'Aggiustare i criteri finché vince l\'idea che piaceva già.',
        concept: 'errori-tipici',
        href: () => '#/valutazione',
        auto: (ctx) => ctx.hasCriteria,
      },
      {
        key: 'voti',
        title: 'Votate l\'idea, ognuno per conto suo',
        what: 'Ognuno vota da solo, prima di discuterne, così nessuno influenza gli altri.',
        how: [
          'Votate tutte le idee nella stessa sessione, per confrontarle sulla stessa scala.',
          'Dove i voti sono molto diversi (il sito li segnala) discutete: lì c\'è un\'ipotesi da chiarire.',
          'Scrivete una nota per i voti più bassi: è il primo elenco di rischi.',
        ],
        done: 'Almeno due persone hanno votato l\'idea su tutti i criteri.',
        mistake: 'Votare insieme a voce: vince chi parla per primo o più forte.',
        href: tab('voti'),
        auto: (ctx) => ctx.fullVoters >= 2,
        progress: (ctx) => `${ctx.fullVoters} voti completi`,
      },
      {
        key: 'scelta',
        title: 'Scegliete di esplorarla',
        what: 'Dalla classifica scegliete 2 o 3 idee da esplorare in parallelo per qualche settimana, non di più.',
        how: [
          'Registrate la scelta come decisione, con le idee confrontate e il motivo.',
          'Spostate l\'idea in «In esplorazione».',
          'Fissate una data per decidere quale tenere.',
        ],
        done: 'L\'idea è almeno «In esplorazione».',
        mistake: 'Esplorare troppe idee insieme: nessuna riceve abbastanza interviste per una risposta chiara.',
        concept: 'quattro-risorse',
        href: newItem('decision'),
        auto: (ctx) => ctx.idea.status !== 'nuova',
      },
    ],
  },
  {
    key: 'ipotesi',
    title: 'Mettere per iscritto le ipotesi',
    goal: 'Trasformare l\'idea in ipotesi verificabili e scegliere quella da verificare per prima.',
    gate: 'Andate avanti quando il Lean Canvas è scritto, l\'assunzione più rischiosa è in un esperimento e sapete con chi parlare. Ricordate che è tutto ancora da verificare.',
    skipRisk: 'Senza ipotesi scritte non saprete cosa state verificando, e ogni risultato sembrerà una conferma.',
    steps: [
      {
        key: 'frase',
        title: 'Scrivete l\'idea in una frase',
        what: 'Chi aiutate, a fare cosa, grazie a cosa. Se non sta in una frase, l\'idea non è ancora chiara.',
        how: [
          'Formato: «Aiutiamo [chi] a [risolvere cosa] grazie a [come]».',
          'Descrivete il problema con fatti: chi lo ha, quanto spesso, quanto costa oggi.',
          'Distinguete chi paga da chi usa, se sono persone diverse.',
        ],
        done: 'Nella scheda dell\'idea ci sono frase, problema e cliente.',
        mistake: 'Descrivere la soluzione al posto del problema.',
        concept: 'uvp',
        href: editIdea,
        auto: (ctx) => Boolean(ctx.idea.data.pitch && ctx.idea.data.problem && ctx.idea.data.customer),
      },
      {
        key: 'lean-canvas',
        title: 'Compilate il primo Lean Canvas',
        what: 'Il modello di business su una pagina: ogni blocco è un\'ipotesi, non un fatto.',
        how: [
          'Partite da Problema e Segmenti di clienti, poi Proposta di valore unica, poi il resto.',
          'Al massimo tre punti per blocco.',
          'Non più di un\'ora: lo riscriverete più volte.',
        ],
        done: 'Problema, segmenti, proposta di valore e soluzione sono compilati.',
        mistake: 'Considerarlo un documento finito: va aggiornato dopo ogni gruppo di interviste.',
        concept: 'lean-canvas',
        href: tabOrNew('canvas', 'canvas', 'canvases'),
        auto: (ctx) => ctx.canvases.some((c) => ['problem', 'segments', 'uvp', 'solution'].every((k) => c.data[k])),
      },
      {
        key: 'assunzione',
        title: 'Scegliete l\'assunzione più rischiosa',
        what: 'Tra tutte le ipotesi, quella che se è falsa fa crollare l\'idea: si verifica per prima.',
        how: [
          'Elencate le assunzioni del canvas: il problema esiste, il cliente è quello, paga, lo raggiungete, è fattibile.',
          'Ordinatele per quanto sono incerte e per quanto pesano.',
          'Mettete la prima in un esperimento, con metodo e criterio di successo.',
        ],
        done: 'C\'è un esperimento con l\'assunzione più rischiosa scritta.',
        mistake: 'Verificare per prima la cosa più facile, spesso la tecnologia, invece di quella più rischiosa.',
        concept: 'assunzione-rischiosa',
        href: newItem('experiment'),
        auto: (ctx) => ctx.experiments.some((e) => e.data.assumption),
      },
      {
        key: 'persone',
        title: 'Elencate con chi parlare',
        what: 'Almeno 5 persone reali da contattare: potenziali clienti, utenti, esperti, chi serve per realizzarla.',
        how: [
          'Partite dalla vostra rete: chi conosce qualcuno del segmento?',
          'Per ognuna scrivete perché vi serve e come ci arrivate.',
          'Puntate a 20-30 contatti nelle settimane successive.',
        ],
        done: 'Ci sono almeno 5 persone con cui interfacciarsi.',
        mistake: 'Parlare solo con amici e parenti: sono gentili, non sono clienti.',
        concept: 'fuori-dall-ufficio',
        href: tabOrNew('interviste', 'contact', 'contacts'),
        auto: (ctx) => ctx.contacts.length >= 5,
        progress: (ctx) => `${Math.min(ctx.contacts.length, 5)} su 5`,
      },
      {
        key: 'ostacoli',
        title: 'Controllate subito gli ostacoli normativi',
        what: 'Prima di investire mesi, verificate che norme o diritti di altri non rendano l\'idea impraticabile o molto costosa.',
        how: [
          'Settori regolati: salute e dispositivi medici, finanza, alimenti, trasporti, energia.',
          'GDPR e AI Act se trattate dati personali o usate modelli di intelligenza artificiale.',
          'Brevetti e marchi di altri: una ricerca veloce su Google Patents ed Espacenet.',
        ],
        done: 'I rischi normativi principali sono scritti nell\'idea (campo Rischi principali), con chi può confermarli.',
        mistake: 'Scoprire dopo aver costruito il prodotto che serve una certificazione lunga un anno.',
        concept: 'ai-act',
        href: editIdea,
      },
      {
        key: 'deeptech',
        title: 'Se nasce dalla ricerca, aprite la scheda deep tech',
        what: 'Per le idee che nascono da una ricerca: maturità della tecnologia, cosa è già pubblicato, di chi è la proprietà intellettuale.',
        how: [
          'Indicate il TRL attuale e la prossima tappa.',
          'Prima di pubblicare altro (articoli, tesi, codice) parlate con l\'ufficio di trasferimento tecnologico.',
          'Chiarite subito se l\'ateneo ha diritti sui risultati.',
        ],
        done: 'La scheda deep tech è compilata.',
        mistake: 'Pubblicare un articolo che rende la tecnologia non più brevettabile.',
        concept: 'deep-tech',
        optional: true,
        href: tabOrNew('deeptech', 'deeptech', 'deeptechs'),
        auto: (ctx) => ctx.deeptechs.length > 0,
      },
    ],
  },
  {
    key: 'clienti',
    title: 'Problema e clienti',
    goal: 'Verificare con i fatti che esiste un cliente preciso con un problema che vuole davvero risolvere.',
    gate: 'Andate avanti solo se almeno 20 interviste confermano il problema con fatti, non opinioni, e sapete chi sono gli early adopter. Se no, cambiate segmento o problema, oppure parcheggiate l\'idea: è il momento più economico per farlo.',
    skipRisk: 'Costruire una soluzione per un problema che nessuno sente abbastanza è la causa più comune di fallimento.',
    steps: [
      {
        key: 'traccia-interviste',
        title: 'Preparate le interviste',
        what: 'Domande sui fatti passati, non su opinioni o sul futuro, e un\'informativa chiara su come userete i dati.',
        how: [
          'Chiedete dell\'ultima volta che hanno avuto il problema: cosa è successo, cosa hanno fatto, quanto è costato.',
          'Non presentate la soluzione nella prima parte dell\'intervista.',
          'Dite a cosa servono gli appunti, chiedete il permesso se registrate e conservate solo i dati necessari.',
          'Da una scheda dell\'idea potete chiedere a Claude le «Domande per le interviste».',
        ],
        done: 'C\'è una traccia di 8-10 domande condivisa da chi intervista.',
        mistake: 'Chiedere «lo compreresti?»: quasi tutti dicono sì per gentilezza.',
        concept: 'mom-test',
      },
      {
        key: 'esperimento-problema',
        title: 'Pianificate l\'esperimento sul problema',
        what: 'Un esperimento che verifica se il problema esiste davvero per quel cliente, con il criterio di successo deciso prima.',
        how: [
          'Assunzione: «[cliente] ha [problema] almeno [ogni quanto] e oggi spende [tempo o soldi] per risolverlo».',
          'Metodo: interviste.',
          'Criterio: per esempio «almeno 12 su 20 descrivono il problema senza che lo suggeriamo».',
        ],
        done: 'C\'è un esperimento sul problema o sul cliente con il criterio di successo scritto.',
        mistake: 'Decidere il criterio dopo aver visto i risultati.',
        concept: 'criterio-successo',
        href: newItem('experiment'),
        auto: (ctx) => ctx.experiments.some((e) => ['problema', 'cliente'].includes(e.data.assumption_type) && e.data.success_criterion),
      },
      {
        key: 'interviste',
        title: 'Fate almeno 20 interviste',
        what: 'Conversazioni di 20-30 minuti con persone del segmento, meglio di persona o in video.',
        how: [
          'Registrate ogni intervista nel sito subito dopo: fatti, citazioni testuali, quanto sente il problema, impegno preso.',
          'Chiudete chiedendo un piccolo impegno: un\'altra persona da sentire, una data per una demo.',
          'Ogni 5 interviste rivedete le domande.',
        ],
        done: 'Almeno 20 interviste sono fatte o analizzate.',
        mistake: 'Fermarsi a 5 interviste che confermano quello che volevate sentire.',
        concept: 'intervista-validazione',
        href: tab('interviste'),
        auto: (ctx) => doneInterviews(ctx) >= 20,
        progress: (ctx) => `${Math.min(doneInterviews(ctx), 20)} su 20`,
      },
      {
        key: 'sintesi',
        title: 'Sintetizzate le interviste',
        what: 'Cercate gli schemi: problemi ricorrenti, frasi che tornano, chi sente di più il problema.',
        how: [
          'Segnate come «Analizzata» ogni intervista dopo averla rivista.',
          'Usate la «Sintesi delle interviste» di Claude come prima bozza, poi controllatela voi.',
          'Scrivete chi sono gli early adopter: chi ha il problema, lo sa e sta già cercando una soluzione.',
        ],
        done: 'Almeno 10 interviste sono analizzate.',
        mistake: 'Contare le opinioni positive invece dei comportamenti.',
        concept: 'early-adopter',
        href: tab('interviste'),
        auto: (ctx) => analyzedInterviews(ctx) >= 10,
        progress: (ctx) => `${Math.min(analyzedInterviews(ctx), 10)} su 10`,
      },
      {
        key: 'persona',
        title: 'Descrivete le buyer persona',
        what: 'Una scheda per ogni tipo di cliente, basata su quello che avete sentito, non su quello che immaginate.',
        how: [
          'Una persona per chi paga e una per chi usa, se sono diversi.',
          'Fasce ampie per età e reddito, da affinare con altre interviste.',
          'Una frase vera presa da un\'intervista, e su quante interviste si basa.',
        ],
        done: 'C\'è almeno una buyer persona.',
        mistake: 'Inventare il cliente perfetto per la vostra soluzione.',
        concept: 'buyer-persona',
        href: tabOrNew('clienti', 'persona', 'personas'),
        auto: (ctx) => ctx.personas.length > 0,
      },
      {
        key: 'problema-validato',
        title: 'Validate il blocco Problema',
        what: 'Il momento di confrontare i risultati con il criterio deciso prima e di segnare cosa è confermato.',
        how: [
          'Chiudete l\'esperimento sul problema con risultato e decisione.',
          'Se il criterio è raggiunto, segnate come validato il blocco Problema del Lean Canvas.',
          'Aggiornate canvas e buyer persona con quello che avete imparato.',
        ],
        done: 'Il blocco Problema del Lean Canvas è segnato come validato.',
        mistake: 'Abbassare il criterio per farlo passare.',
        concept: 'problem-solution-fit',
        href: tab('canvas'),
        auto: (ctx) => ctx.canvases.some((c) => c.data.validated?.problem),
      },
    ],
  },
  {
    key: 'mercato',
    title: 'Mercato e concorrenti',
    goal: 'Capire se il mercato raggiungibile giustifica l\'impegno e perché un cliente dovrebbe scegliere voi.',
    gate: 'Andate avanti se il SOM è coerente con le vostre forze e c\'è un motivo chiaro per cui i clienti sceglierebbero voi invece delle alternative.',
    skipRisk: 'Rischiate un mercato troppo piccolo per ripagare il lavoro, o un concorrente che fa già la stessa cosa.',
    steps: [
      {
        key: 'tam-sam-som',
        title: 'Stimate TAM, SAM e SOM dal basso',
        what: 'Quanto vale il mercato e quanta parte potete davvero conquistare nei prossimi anni.',
        how: [
          'Partite dal numero di clienti che potete raggiungere e moltiplicate per il prezzo annuo.',
          'Citate le fonti: ISTAT, Eurostat, camere di commercio, associazioni di categoria.',
          'Controllate che il SOM sia coerente con il tempo e le persone che avete.',
        ],
        done: 'La scheda Mercato ha TAM, SAM e SOM con il ragionamento.',
        mistake: 'Partire da «il mercato vale miliardi, ne prendiamo l\'1%».',
        concept: 'stima-dal-basso',
        href: tabOrNew('mercato', 'market', 'markets'),
        auto: (ctx) => ctx.markets.some((m) => m.data.tam && m.data.sam && m.data.som),
      },
      {
        key: 'concorrenti',
        title: 'Analizzate almeno 3 concorrenti',
        what: 'Diretti e indiretti, compreso quello che i clienti fanno oggi senza di voi: Excel, carta, niente.',
        how: [
          'Provate i loro prodotti o chiedete a chi li usa.',
          'Confrontate le caratteristiche che contano per il cliente, con la loro importanza.',
          'Posizionateli su due assi importanti per il cliente e cercate lo spazio libero.',
        ],
        done: 'L\'analisi dei concorrenti ha almeno 3 concorrenti.',
        mistake: 'Dire «non abbiamo concorrenti»: a chi vi ascolta suona come «non abbiamo cercato».',
        concept: 'concorrenti',
        href: tabOrNew('mercato', 'competitors', 'competitors'),
        auto: (ctx) => maxRivals(ctx) >= 3,
        progress: (ctx) => `${Math.min(maxRivals(ctx), 3)} su 3`,
      },
      {
        key: 'vantaggio',
        title: 'Definite il vantaggio sleale',
        what: 'Quello che avete e che non si copia né si compra facilmente: dati, relazioni, competenze rare, brevetti, comunità.',
        how: [
          'Chiedetevi cosa succede se domani un concorrente grande copia l\'idea.',
          'Se non c\'è ancora, scrivete come pensate di costruirlo.',
          'Siate onesti: «per ora nessuno» è una risposta valida.',
        ],
        done: 'Il blocco Vantaggio sleale del Lean Canvas è compilato.',
        mistake: 'Indicare come vantaggio la passione o l\'essere i primi.',
        concept: 'vantaggio-sleale',
        href: tab('canvas'),
        auto: (ctx) => ctx.canvases.some((c) => c.data.advantage),
      },
      {
        key: 'ricavi',
        title: 'Scegliete modello di ricavo e prezzo',
        what: 'Come guadagnate e quanto chiedete, da verificare poi con un esperimento.',
        how: [
          'Valutate abbonamento, licenza, commissione, pagamento a consumo.',
          'Partite dal valore per il cliente e dalle alternative, non solo dai costi.',
          'Calcolate quanti clienti servono per coprire i costi.',
        ],
        done: 'Il blocco Flussi di ricavo del Lean Canvas indica modello e prezzo.',
        mistake: 'Scegliere il prezzo più basso per paura: è difficile alzarlo dopo.',
        concept: 'modelli-ricavo',
        href: tab('canvas'),
        auto: (ctx) => ctx.canvases.some((c) => c.data.revenue),
      },
    ],
  },
  {
    key: 'soluzione',
    title: 'Soluzione, MVP e prezzo',
    goal: 'Dimostrare con impegni concreti che qualcuno vuole la soluzione e la paga.',
    gate: 'Andate avanti solo con impegni concreti: pagamenti, piloti, lettere d\'intenti. I complimenti non contano.',
    skipRisk: 'Senza impegni concreti, rischiate di costruire un prodotto che piace ma che nessuno compra.',
    steps: [
      {
        key: 'vpc',
        title: 'Compilate il Value Proposition Canvas',
        what: 'Il collegamento tra quello che il cliente vuole ottenere e quello che offrite.',
        how: [
          'Lato cliente: jobs, pains e gains presi dalle interviste.',
          'Lato offerta: per ogni pain importante, come lo riducete.',
          'Segnate quali collegamenti sono già confermati dai dati.',
        ],
        done: 'C\'è un Value Proposition Canvas per il segmento principale.',
        mistake: 'Elencare le funzioni del prodotto invece dei problemi che risolvono.',
        concept: 'vpc',
        href: tabOrNew('clienti', 'vpc', 'vpcs'),
        auto: (ctx) => ctx.vpcs.length > 0,
      },
      {
        key: 'smoke-test',
        title: 'Misurate l\'interesse prima di costruire',
        what: 'Una landing page, un video o una prevendita che misura quante persone fanno un passo concreto.',
        how: [
          'Una pagina con proposta di valore, prezzo e un pulsante: lista d\'attesa, prenotazione, preordine.',
          'Portate traffico mirato: gruppi, newsletter, persone intervistate.',
          'Criterio deciso prima, per esempio «almeno il 10% lascia l\'email».',
        ],
        done: 'C\'è un esperimento con metodo «Landing page».',
        mistake: 'Misurare visite e like invece di azioni che costano qualcosa al cliente.',
        concept: 'smoke-test',
        href: newItem('experiment'),
        auto: (ctx) => ctx.experiments.some((e) => e.data.method === 'landing'),
      },
      {
        key: 'mvp',
        title: 'Costruite l\'MVP più semplice',
        what: 'La versione minima che porta il valore promesso, anche fatta a mano dietro le quinte.',
        how: [
          'Scegliete il tipo: concierge (lo fate a mano), mago di Oz (sembra automatico ma non lo è), prototipo, una sola funzione.',
          'Fissate un tempo massimo, per esempio 4-6 settimane.',
          'Decidete prima cosa misurerete con i primi utenti.',
        ],
        done: 'Un primo gruppo di utenti reali sta usando l\'MVP.',
        mistake: 'Passare mesi a costruire funzioni che nessuno ha chiesto.',
        concept: 'tipi-mvp',
      },
      {
        key: 'prezzo-canale',
        title: 'Verificate prezzo o canale',
        what: 'Un esperimento che misura se pagano quel prezzo e quanto costa trovare un cliente.',
        how: [
          'Chiedete un pagamento, anche simbolico, o un preordine.',
          'Provate un canale di acquisizione e misurate quanto costa un cliente.',
          'Confrontate il risultato con il criterio deciso prima.',
        ],
        done: 'Un esperimento su prezzo o canale è concluso.',
        mistake: 'Fidarsi di «lo pagherei» detto a voce.',
        concept: 'canali-acquisizione',
        href: newItem('experiment'),
        auto: (ctx) => ctx.experiments.some((e) => ['prezzo', 'canale'].includes(e.data.assumption_type) && e.status === 'concluso'),
      },
      {
        key: 'impegni',
        title: 'Ottenete almeno 3 impegni forti',
        what: 'Pilota, pagamento o lettera d\'intenti: impegni che costano qualcosa a chi li prende.',
        how: [
          'Chiedeteli agli early adopter alla fine delle interviste o delle demo.',
          'Registrateli nell\'intervista, nel campo «Impegno preso».',
          'Nel B2B una lettera d\'intenti firmata vale più di dieci «interessante».',
        ],
        done: 'Almeno 3 interviste registrano un pilota, un pagamento o una lettera d\'intenti.',
        mistake: 'Scambiare l\'entusiasmo per un impegno.',
        concept: 'design-partner',
        href: tab('interviste'),
        auto: (ctx) => strongCommitments(ctx) >= 3,
        progress: (ctx) => `${Math.min(strongCommitments(ctx), 3)} su 3`,
      },
      {
        key: 'canvas-validato',
        title: 'Validate almeno 3 blocchi del Lean Canvas',
        what: 'Problema, cliente e proposta di valore confermati dai dati, non solo scritti.',
        how: [
          'Per ogni blocco chiedetevi quale esperimento lo ha confermato.',
          'Segnatelo come validato nel Lean Canvas solo se c\'è un dato.',
          'Riscrivete i blocchi smentiti: è un pivot, non un fallimento.',
        ],
        done: 'Almeno 3 blocchi del Lean Canvas sono segnati come validati.',
        mistake: 'Segnare come validato quello che pensate, non quello che avete misurato.',
        concept: 'product-market-fit',
        href: tab('canvas'),
        auto: (ctx) => maxValidated(ctx) >= 3,
        progress: (ctx) => `${Math.min(maxValidated(ctx), 3)} su 3`,
      },
      {
        key: 'tappa-tecnica',
        title: 'Deep tech: prossima tappa e design partner',
        what: 'Per le idee che nascono dalla ricerca: cosa dimostrare, con chi e con quali risorse.',
        how: [
          'Fissate il TRL della prossima tappa, con costi e durata.',
          'Trovate design partner che provano il prototipo sui loro dati.',
          'Cercate bandi adatti a quella tappa.',
        ],
        done: 'La scheda deep tech indica prossima tappa TRL e design partner.',
        mistake: 'Inseguire il TRL più alto senza un cliente che aspetta il risultato.',
        concept: 'trl',
        optional: true,
        href: tabOrNew('deeptech', 'deeptech', 'deeptechs'),
        auto: (ctx) => Boolean(deep(ctx)?.data.trl_target && deep(ctx)?.data.design_partners),
      },
    ],
  },
  {
    key: 'decisione',
    title: 'La decisione',
    goal: 'Decidere con i dati: continuare, cambiare direzione o fermarsi.',
    gate: 'Se l\'idea è scelta, passate a costruire l\'azienda. Se è parcheggiata, c\'è una data per riparlarne. Se è scartata, quello che avete imparato resta nel sito.',
    skipRisk: 'Senza una decisione esplicita, un\'idea a metà continua a consumare tempo.',
    steps: [
      {
        key: 'decisione',
        title: 'Registrate la decisione',
        what: 'La squadra decide insieme guardando i risultati degli esperimenti.',
        how: [
          'Riunitevi con i risultati di esperimenti e interviste davanti.',
          'Scrivete alternative, decisione e motivazione con i numeri.',
          'Fissate quando rivederla.',
        ],
        done: 'C\'è una decisione presa con la motivazione scritta.',
        mistake: 'Continuare per inerzia o per il tempo già speso.',
        concept: 'pivot',
        href: newItem('decision'),
        auto: (ctx) => ctx.decisions.some((d) => d.status !== 'proposta' && d.data.rationale),
      },
      {
        key: 'stato',
        title: 'Aggiornate lo stato dell\'idea',
        what: 'Scelta, parcheggiata o scartata: lo stato dice a tutti dove siete.',
        how: [
          'Scelta: la squadra si concentra su questa idea.',
          'Parcheggiata: valida ma non adesso, con una data per riparlarne.',
          'Scartata: i dati dicono di no; quello che avete imparato resta.',
        ],
        done: 'L\'idea è «Scelta», «Parcheggiata» o «Scartata».',
        mistake: 'Lasciare tutte le idee «In esplorazione» per mesi.',
        concept: 'scaling-prematuro',
        auto: (ctx) => ['scelta', 'parcheggiata', 'scartata'].includes(ctx.idea.status),
      },
      {
        key: 'lezioni',
        title: 'Scrivete cosa avete imparato',
        what: 'Negli esperimenti, il campo «Cosa abbiamo imparato»: serve alla prossima idea quanto a questa.',
        how: [
          'Una riga per ogni esperimento: cosa pensavate, cosa è successo, cosa cambia.',
          'Se è emerso uno spunto diverso, createlo come nuova idea.',
        ],
        done: 'Almeno un esperimento ha «Cosa abbiamo imparato» compilato.',
        mistake: 'Ricordare solo il risultato e dimenticare il perché.',
        concept: 'validazione',
        href: tab('esperimenti'),
        auto: (ctx) => ctx.experiments.some((e) => e.data.learnings),
      },
    ],
  },
  {
    key: 'azienda',
    title: 'Costruire l\'azienda',
    goal: 'Solo per l\'idea scelta: trasformare la squadra in una società, con accordi, numeri e risorse.',
    onlyChosen: true,
    gate: 'Costituite la società quando c\'è un motivo concreto: un contratto, un bando, un investimento. Prima, i costi fissi corrono senza ricavi.',
    skipRisk: 'Saltare gli accordi e i numeri qui costa caro quando arrivano clienti o investitori.',
    steps: [
      {
        key: 'patto-soci',
        title: 'Firmate un patto tra soci',
        what: 'L\'accordo scritto su quote, vesting, ruoli, decisioni, uscita di un socio e cessione delle quote.',
        how: [
          'Partite dalla divisione discussa nella fase Squadra.',
          'Prevedete il vesting e cosa succede se qualcuno lascia (good leaver e bad leaver).',
          'Fatelo rivedere da un avvocato o da un commercialista prima di firmarlo.',
        ],
        done: 'Il patto è firmato da tutti i soci.',
        mistake: 'Rimandarlo finché va tutto bene: serve proprio quando le cose vanno male.',
        concept: 'vesting',
        href: () => '#/squadra/quote',
      },
      {
        key: 'proprieta',
        title: 'Mettete al sicuro la proprietà intellettuale',
        what: 'Chi possiede codice, dati, marchio e invenzioni, e come li proteggete.',
        how: [
          'Verificate che nome, dominio e marchio siano liberi; registrate il marchio quando il nome è definitivo.',
          'Fate cedere alla società il codice e il lavoro fatto dai soci prima della costituzione.',
          'Se c\'è ricerca universitaria: accordo di licenza o cessione con l\'ateneo; valutate il brevetto prima di pubblicare.',
        ],
        done: 'Nome, marchio e titolarità di codice e invenzioni sono chiariti per iscritto.',
        mistake: 'Scoprire durante una due diligence che il codice è ancora di un socio o dell\'ateneo.',
        concept: 'brevetto',
      },
      {
        key: 'piano-finanziario',
        title: 'Business plan e piano finanziario',
        what: 'I numeri dei prossimi 3 anni: costi, ricavi, unit economics, cassa, quanto serve e quando.',
        how: [
          'Partite dalle unit economics: quanto costa acquisire un cliente e quanto vale nel tempo.',
          'Costruite il cash flow mese per mese per il primo anno.',
          'Calcolate il fabbisogno: quanti soldi servono per arrivare al prossimo traguardo.',
        ],
        done: 'C\'è un piano finanziario con fabbisogno e punto di pareggio, condiviso nella squadra.',
        mistake: 'Proiezioni che crescono a dismisura senza ipotesi verificate dietro.',
        concept: 'financial-plan',
      },
      {
        key: 'go-to-market',
        title: 'Pianificate i primi clienti paganti',
        what: 'Come arrivate ai primi clienti e come misurate se funziona.',
        how: [
          'Scegliete 1 o 2 canali che hanno funzionato negli esperimenti.',
          'Definite le metriche AARRR da seguire ogni settimana.',
          'Scrivete un piano per i primi 90 giorni con obiettivi numerici.',
        ],
        done: 'C\'è un piano dei primi 90 giorni con canali e obiettivi.',
        mistake: 'Provare tutti i canali insieme senza misurarne nessuno.',
        concept: 'go-to-market',
      },
      {
        key: 'finanza-non-diluitiva',
        title: 'Bandi, competizioni e incubatori',
        what: 'Le risorse che non chiedono quote: bandi, premi, incubatori, programmi di accelerazione.',
        how: [
          'Cercate bandi regionali, nazionali (per esempio Smart&Start di Invitalia) ed europei adatti alla fase, verificando che siano aperti, requisiti e scadenze.',
          'Partecipate a competizioni come la Start Cup regionale e il Premio Nazionale per l\'Innovazione.',
          'Valutate un incubatore: spazio, mentor e contatti spesso in cambio di poco.',
        ],
        done: 'C\'è una lista di bandi e competizioni con le scadenze e almeno una candidatura inviata.',
        mistake: 'Costruire il progetto attorno a un bando invece che attorno ai clienti.',
        concept: 'finanza-non-diluitiva',
      },
      {
        key: 'costituzione',
        title: 'Costituite la società al momento giusto',
        what: 'La SRL, anche semplificata, si costituisce dal notaio, anche online in videoconferenza. Poi si valuta l\'iscrizione come startup innovativa.',
        how: [
          'Scegliete la forma con un commercialista; se nasce dall\'ateneo, spin-off o startup con licenza.',
          'Startup innovativa: dalla Legge 193/2024 deve essere una PMI, avere un oggetto ad alto valore tecnologico e non fare prevalentemente consulenza; lo status dura 3 anni, estendibili. Verificate i requisiti aggiornati con la Camera di commercio.',
          'Conto, PEC, posizione fiscale e contabilità vanno organizzati dal primo giorno.',
        ],
        done: 'La società è iscritta al Registro delle imprese.',
        mistake: 'Costituirla troppo presto, con costi fissi e adempimenti prima di clienti o fondi.',
        concept: 'startup-innovativa',
      },
      {
        key: 'pitch',
        title: 'Preparate il pitch',
        what: 'La storia dell\'idea in 10-12 slide, con i numeri veri degli esperimenti.',
        how: [
          'Problema, soluzione, mercato, trazione, modello di business, concorrenti, squadra, richiesta.',
          'I risultati di interviste ed esperimenti sono la vostra trazione: mostrateli.',
          'Provatelo con il mentor e con persone che non conoscono il progetto.',
        ],
        done: 'Il pitch è pronto ed è stato provato almeno 3 volte con persone esterne.',
        mistake: 'Slide piene di testo e nessun numero verificato.',
        concept: 'pitch',
      },
      {
        key: 'investitori',
        title: 'Cercate investitori solo quando servono',
        what: 'Business angel, venture capital o crowdfunding, quando c\'è trazione e un piano chiaro per usare i soldi.',
        how: [
          'Prima risorse proprie, persone vicine e fondi non diluitivi; poi business angel; poi venture capital.',
          'Calcolate quanto cedete con valutazione pre-money e post-money.',
          'Fate leggere il term sheet a un avvocato prima di firmare.',
        ],
        done: 'Avete deciso se e quando raccogliere, con importo, uso dei fondi e investitori adatti alla fase.',
        mistake: 'Cercare soldi prima di aver validato clienti e prezzo: si cede molto per poco.',
        concept: 'business-angel',
      },
    ],
  },
];

export const ROADMAP_STEPS = ROADMAP.flatMap((phase) => phase.steps.map((step) => ({ ...step, phase: phase.key })));
export const stepByKey = (key) => ROADMAP_STEPS.find((s) => s.key === key) || null;

// Negli esempi i passi manuali delle fasi già superate si considerano fatti, per mostrare come appare una roadmap avanzata.
const EXAMPLE_REACHED = { nuova: 'ipotesi', esplorazione: 'clienti', validazione: 'soluzione', scelta: 'azienda', parcheggiata: 'decisione', scartata: 'decisione' };

const phaseIndex = (key) => ROADMAP.findIndex((p) => p.key === key);

// Stato di ogni passo e di ogni fase per un'idea. ctx contiene le schede collegate e qualche conteggio della squadra.
export function roadmapState(idea, ctx) {
  const full = {
    canvases: [],
    experiments: [],
    interviews: [],
    personas: [],
    vpcs: [],
    markets: [],
    competitors: [],
    deeptechs: [],
    contacts: [],
    decisions: [],
    ideasCount: 0,
    hasCriteria: false,
    fullVoters: 0,
    example: false,
    ...ctx,
    idea,
  };
  const marks = idea.data?.roadmap || {};
  const reached = full.example ? phaseIndex(EXAMPLE_REACHED[idea.status] || 'squadra') : -1;
  const chosen = idea.status === 'scelta';
  let next = null;
  const phases = ROADMAP.map((phase, index) => {
    const steps = phase.steps.map((step) => {
      const mark = parseRoadmapMark(marks[step.key]);
      let status = 'todo';
      if (mark?.state === 'skip' && step.optional) status = 'skip';
      else if (mark?.state === 'done') status = 'done';
      else if (full.example && index < reached) status = 'done';
      const suggested = status === 'todo' && Boolean(step.auto?.(full));
      return { step, status, mark, suggested, href: step.href?.(full) || null, progress: step.progress?.(full) || null };
    });
    const required = steps.filter((s) => !s.step.optional);
    const complete = (s) => s.status !== 'todo';
    const counted = !phase.onlyChosen || chosen;
    const result = { phase, index, steps, done: steps.filter(complete).length, total: steps.length, complete: required.every(complete), counted };
    if (!next && counted) {
      const first = steps.find((s) => !complete(s) && !s.step.optional);
      if (first) next = { phase, step: first.step };
    }
    if (next) for (const s of steps) s.isNext = next.step === s.step;
    return result;
  });
  phases.forEach((p, i) => {
    p.previousIncomplete = i > 0 && !phases[i - 1].complete;
  });
  const counted = phases.filter((p) => p.counted);
  const done = counted.reduce((sum, p) => sum + p.done, 0);
  const total = counted.reduce((sum, p) => sum + p.total, 0);
  const current = counted.find((p) => !p.complete) || null;
  return { phases, next, done, total, percent: total ? Math.round((done / total) * 100) : 0, current };
}
