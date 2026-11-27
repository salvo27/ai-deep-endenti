// Idee di esempio, una per stato, ispirate alla storia di startup note.
// Stanno solo nel codice: sono in sola lettura e non entrano in statistiche, valutazione, ricerca o backup.
// Qui c'è la struttura, uguale in ogni lingua: id, stati, opzioni, date, numeri e collegamenti. I testi stanno in
// i18n/<lingua>/examples.js, così chi usa il sito in inglese vede gli stessi esempi in inglese.
import { tx } from './i18n/index.js';

const STAMP = '2026-10-18T08:00:00.000Z';

/** Gli esempi scritti con i testi di una lingua: stessi id e stessa struttura in ogni lingua. */
export function buildExamples(t) {
  let counter = 0;

  // I testi (titolo, nota e campi da leggere) arrivano dalla lingua; data aggiunge i valori salvati.
  function example(kind, status, { title, note, ...texts }, data = {}, idea = null) {
    counter += 1;
    return {
      id: `e0000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
      kind,
      title,
      status,
      data: { ...texts, ...data },
      idea_id: idea?.id ?? null,
      version: 1,
      created_by: null,
      updated_by: null,
      created_at: STAMP,
      updated_at: STAMP,
      deleted_at: null,
      example: true,
      ...(note ? { exampleNote: note } : {}),
    };
  }

  const FOUNDER = t.people.founder;
  const TECH = t.people.tech;
  const TEAM = [t.people.everyone];

  // Nuova: Uber all'inizio del 2009, quando si chiamava UberCab.
  const uber = example('idea', 'nuova', t.uber, { owner: FOUNDER }); // i18n-ignore
  // Il titolo dei canvas è il nome del modello con la versione: uguale in ogni lingua.
  const uberCanvas = example('canvas', null, { title: 'Lean Canvas v0', ...t.uberCanvas }, {}, uber);
  const uberContact1 = example('contact', 'fissata', t.uberContact1, { purpose: 'cliente', owner: FOUNDER, next_date: '2009-01-20' }, uber);
  const uberContact2 = example('contact', 'da_contattare', t.uberContact2, { purpose: 'utente', owner: FOUNDER, next_date: '2009-01-23' }, uber); // i18n-ignore
  const uberContact3 = example('contact', 'contattata', t.uberContact3, { purpose: 'realizzazione', owner: TECH, next_date: '2009-01-27' }, uber);
  const uberContact4 = example('contact', 'da_contattare', t.uberContact4, { purpose: 'norme', owner: TECH }, uber); // i18n-ignore

  // In esplorazione: Airbnb nella primavera del 2008.
  const airbnb = example('idea', 'esplorazione', t.airbnb, { owner: FOUNDER }); // i18n-ignore: stored value
  const airbnbCanvas = example('canvas', null, { title: 'Lean Canvas v1', ...t.airbnbCanvas }, {}, airbnb);
  const airbnbExp1 = example('experiment', 'concluso', t.airbnbExp1, {
    assumption_type: 'prezzo',
    method: 'concierge',
    owner: FOUNDER,
    start_date: '2007-10-10',
    end_date: '2007-10-25',
    decision: 'proseguire',
  }, airbnb);
  const airbnbExp2 = example('experiment', 'in_corso', t.airbnbExp2, {
    assumption_type: 'cliente',
    method: 'landing',
    owner: FOUNDER,
    start_date: '2008-02-25',
    end_date: '2008-03-20',
  }, airbnb);
  const airbnbExp3 = example('experiment', 'pianificato', t.airbnbExp3, { // i18n-ignore: stored value
    assumption_type: 'soluzione',
    method: 'concierge',
    owner: TECH,
    start_date: '2008-04-07',
    end_date: '2008-05-09',
  }, airbnb);
  const airbnbInt1 = example('interview', 'analizzata', t.airbnbInt1, {
    date: '2007-10-24',
    interviewer: FOUNDER,
    experiment_id: airbnbExp1.id,
    problem_intensity: 4,
    commitment: 'pagamento', // i18n-ignore: stored value
  }, airbnb);
  const airbnbInt2 = example('interview', 'fatta', t.airbnbInt2, { // i18n-ignore
    date: '2008-03-03',
    interviewer: FOUNDER,
    experiment_id: airbnbExp2.id,
    problem_intensity: 3,
    commitment: 'demo',
  }, airbnb);
  const airbnbInt3 = example('interview', 'da_fare', t.airbnbInt3, { date: '2008-03-18', interviewer: TECH, experiment_id: airbnbExp2.id }, airbnb); // i18n-ignore
  const airbnbPersona1 = example('persona', null, t.airbnbPersona1, { role_type: 'paga_usa', early_adopter: 'si', gender: 'qualsiasi' }, airbnb); // i18n-ignore
  const airbnbPersona2 = example('persona', null, t.airbnbPersona2, { role_type: 'usa', early_adopter: 'forse', gender: 'qualsiasi' }, airbnb); // i18n-ignore
  const airbnbVpc = example('vpc', null, t.airbnbVpc, {}, airbnb);
  const airbnbMarket = example('market', null, t.airbnbMarket, {
    approach: 'top_down',
    tam: 30000000000,
    sam: 8400000000,
    som: 159000000,
    som_year: 2011,
  }, airbnb);
  const { features, rivals, axes, ...competitorTexts } = t.airbnbCompetitors;
  const airbnbCompetitors = example('competitors', null, competitorTexts, {
    features: [
      { id: 'f-online', label: features.online, importance: 'alta' },
      { id: 'f-prezzo', label: features.price, importance: 'alta' },
      { id: 'f-casa', label: features.home, importance: 'media' },
      { id: 'f-profili', label: features.profiles, importance: 'alta' },
      { id: 'f-consigli', label: features.tips, importance: 'media' },
    ],
    // I nomi dei concorrenti sono nomi propri: uguali in ogni lingua.
    rivals: [
      { id: 'c-couch', name: 'Couchsurfing', type: 'indiretto', x: 2, y: 9, note: rivals.couchsurfing },
      { id: 'c-craigslist', name: 'Craigslist', type: 'diretto', x: 2, y: 8, note: rivals.craigslist },
      { id: 'c-bnb', name: 'BedandBreakfast.com', type: 'diretto', x: 3, y: 6, note: rivals.bedAndBreakfast },
      { id: 'c-hostels', name: 'Hostels.com', type: 'diretto', x: 8, y: 7, note: rivals.hostels },
      { id: 'c-hotels', name: 'Hotels.com', type: 'indiretto', x: 9, y: 2, note: rivals.hotels },
      { id: 'c-vrbo', name: 'VRBO', type: 'diretto', x: 2, y: 2, note: rivals.vrbo },
    ],
    cells: {
      'f-online:noi': true,
      'f-online:c-hostels': true,
      'f-online:c-hotels': true,
      'f-prezzo:noi': true,
      'f-prezzo:c-couch': true,
      'f-prezzo:c-craigslist': true,
      'f-prezzo:c-hostels': true,
      'f-casa:noi': true,
      'f-casa:c-couch': true,
      'f-casa:c-craigslist': true,
      'f-profili:noi': true,
      'f-profili:c-couch': true,
      'f-profili:c-hotels': true,
      'f-consigli:noi': true,
      'f-consigli:c-couch': true,
    },
    axes: { x: { ...axes.x }, y: { ...axes.y } },
    us: { x: 9, y: 9 },
  }, airbnb);

  // In validazione: Dropbox tra il 2007 e il 2008.
  const dropbox = example('idea', 'validazione', t.dropbox, { owner: FOUNDER }); // i18n-ignore: stored value
  const dropboxCanvas = example('canvas', null, { title: 'Lean Canvas v2', ...t.dropboxCanvas }, { validated: { problem: true, channels: true, segments: true } }, dropbox);
  const dropboxExp1 = example('experiment', 'concluso', t.dropboxExp1, {
    assumption_type: 'problema',
    method: 'interviste', // i18n-ignore
    owner: FOUNDER,
    start_date: '2007-03-05',
    end_date: '2007-04-06',
    decision: 'proseguire',
  }, dropbox);
  const dropboxExp2 = example('experiment', 'concluso', t.dropboxExp2, {
    assumption_type: 'canale',
    method: 'demo',
    owner: FOUNDER,
    start_date: '2008-03-10',
    end_date: '2008-03-17',
    decision: 'proseguire',
  }, dropbox);
  const dropboxExp3 = example('experiment', 'in_corso', t.dropboxExp3, {
    assumption_type: 'soluzione',
    method: 'demo',
    owner: TECH,
    start_date: '2008-04-01',
    end_date: '2008-05-15',
  }, dropbox);
  const dropboxInt1 = example('interview', 'analizzata', t.dropboxInt1, {
    date: '2007-03-12',
    interviewer: FOUNDER,
    experiment_id: dropboxExp1.id,
    problem_intensity: 5,
    commitment: 'demo',
  }, dropbox);
  const dropboxInt2 = example('interview', 'analizzata', t.dropboxInt2, {
    date: '2007-03-20',
    interviewer: TECH,
    experiment_id: dropboxExp1.id,
    problem_intensity: 4,
    commitment: 'interesse',
    follow_up: '',
  }, dropbox);
  const dropboxVpc = example('vpc', null, t.dropboxVpc, {}, dropbox);

  // Scelta: Spotify nel 2008, prima del lancio pubblico.
  const spotify = example('idea', 'scelta', t.spotify, { owner: FOUNDER });
  const spotifyCanvas = example('canvas', null, { title: 'Lean Canvas v3', ...t.spotifyCanvas }, {
    validated: { problem: true, solution: true, metrics: true, uvp: true, channels: true, segments: true, revenue: true },
  }, spotify);
  const spotifyExp1 = example('experiment', 'concluso', t.spotifyExp1, {
    assumption_type: 'tecnica',
    method: 'demo',
    owner: TECH,
    start_date: '2007-05-02',
    end_date: '2007-06-29',
    decision: 'proseguire',
  }, spotify);
  const spotifyExp2 = example('experiment', 'concluso', t.spotifyExp2, {
    assumption_type: 'soluzione',
    method: 'demo',
    owner: FOUNDER,
    start_date: '2007-10-01',
    end_date: '2008-03-31',
    decision: 'proseguire',
  }, spotify);
  const spotifyExp3 = example('experiment', 'concluso', t.spotifyExp3, {
    assumption_type: 'prezzo',
    method: 'prevendita',
    owner: FOUNDER,
    start_date: '2008-04-14',
    end_date: '2008-06-30',
    decision: 'proseguire',
  }, spotify);
  const spotifyInt1 = example('interview', 'analizzata', t.spotifyInt1, { date: '2007-02-08', interviewer: FOUNDER, problem_intensity: 4, commitment: 'pilota' }, spotify); // i18n-ignore: stored values
  const spotifyInt2 = example('interview', 'analizzata', t.spotifyInt2, { date: '2008-01-22', interviewer: FOUNDER, problem_intensity: 5, commitment: 'pagamento' }, spotify); // i18n-ignore: stored values
  const spotifyDecision = example('decision', 'presa', t.spotifyDecision, { date: '2008-07-15', decided_by: TEAM, ideas: [spotify.id], review_date: '2009-01-31' });

  // Parcheggiata: Netflix e lo streaming nel 2000.
  const netflix = example('idea', 'parcheggiata', t.netflix, { owner: TECH }); // i18n-ignore: stored value
  const netflixCanvas = example('canvas', null, { title: 'Lean Canvas', ...t.netflixCanvas }, { validated: { problem: true } }, netflix);
  const netflixExp1 = example('experiment', 'concluso', t.netflixExp1, {
    assumption_type: 'tecnica',
    method: 'dati',
    owner: TECH,
    start_date: '2000-03-01',
    end_date: '2000-04-28',
    decision: 'cambiare',
  }, netflix);
  const netflixInt1 = example('interview', 'analizzata', t.netflixInt1, {
    date: '2000-03-15',
    interviewer: FOUNDER,
    experiment_id: netflixExp1.id,
    problem_intensity: 3,
    commitment: 'interesse',
  }, netflix);
  const netflixDecision = example('decision', 'presa', t.netflixDecision, { date: '2000-05-10', decided_by: TEAM, ideas: [netflix.id], review_date: '2001-06-30' });

  // Scartata: Odeo, la piattaforma di podcast da cui è nato Twitter.
  const odeo = example('idea', 'scartata', t.odeo, { owner: FOUNDER }); // i18n-ignore: stored value
  const odeoCanvas = example('canvas', null, { title: 'Lean Canvas', ...t.odeoCanvas }, {}, odeo);
  const odeoExp1 = example('experiment', 'concluso', t.odeoExp1, {
    assumption_type: 'soluzione',
    method: 'demo',
    owner: TECH,
    start_date: '2005-09-01',
    end_date: '2005-10-31',
    decision: 'abbandonare',
  }, odeo);
  const odeoExp2 = example('experiment', 'concluso', t.odeoExp2, {
    assumption_type: 'canale',
    method: 'dati',
    owner: FOUNDER,
    start_date: '2005-05-01',
    end_date: '2005-08-31',
    decision: 'abbandonare',
  }, odeo);
  const odeoInt1 = example('interview', 'analizzata', t.odeoInt1, {
    date: '2005-10-12',
    interviewer: FOUNDER,
    experiment_id: odeoExp1.id,
    problem_intensity: 2,
    commitment: 'nessuno', // i18n-ignore
    follow_up: '',
  }, odeo);
  const odeoDecision = example('decision', 'presa', t.odeoDecision, { date: '2006-02-15', decided_by: TEAM, ideas: [odeo.id], review_date: '' });

  return Object.freeze([
    uber,
    uberCanvas,
    uberContact1,
    uberContact2,
    uberContact3,
    uberContact4,
    airbnb,
    airbnbCanvas,
    airbnbExp1,
    airbnbExp2,
    airbnbExp3,
    airbnbInt1,
    airbnbInt2,
    airbnbInt3,
    airbnbPersona1,
    airbnbPersona2,
    airbnbVpc,
    airbnbMarket,
    airbnbCompetitors,
    dropbox,
    dropboxCanvas,
    dropboxExp1,
    dropboxExp2,
    dropboxExp3,
    dropboxInt1,
    dropboxInt2,
    dropboxVpc,
    spotify,
    spotifyCanvas,
    spotifyExp1,
    spotifyExp2,
    spotifyExp3,
    spotifyInt1,
    spotifyInt2,
    spotifyDecision,
    netflix,
    netflixCanvas,
    netflixExp1,
    netflixInt1,
    netflixDecision,
    odeo,
    odeoCanvas,
    odeoExp1,
    odeoExp2,
    odeoInt1,
    odeoDecision,
  ]);
}

export const EXAMPLES = buildExamples(tx.examples);
