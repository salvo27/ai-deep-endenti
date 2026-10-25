import {
  LIMITS,
  cleanLine,
  cleanText,
  intInRange,
  isIsoDate,
  isKey,
  isPhotoDataUrl,
  isUuid,
  slugKey,
  uniqueStrings,
  uniqueUuids,
} from './lib/validate.js';
import { fmtMoney } from './lib/format.js';

export const TECH_SUGGESTIONS = [
  'Inverse design',
  'Vincoli dichiarativi',
  'Agenti generativi (LLM)',
  'Explainable AI',
  'Spiegazioni controfattuali',
  'Previsione di serie temporali',
  'Ottimizzazione con vincoli',
  'LLM come interfaccia',
  'Modelli ad agenti',
];

export const COMMITMENT = [
  ['nessuno', 'Nessuno'],
  ['interesse', 'Interesse generico'],
  ['demo', 'Vuole vedere una demo'],
  ['pilota', 'Disponibile a un pilota'],
  ['pagamento', 'Pilota a pagamento o lettera d\'intenti'],
];

export const STRONG_COMMITMENTS = new Set(['pilota', 'pagamento']);

export const CANVAS_BLOCKS = [
  { key: 'problem', label: 'Problema', area: 'prob', help: 'I tre problemi principali', main: true },
  { key: 'alternatives', label: 'Alternative esistenti', area: 'prob', help: 'Come lo risolvono oggi' },
  { key: 'solution', label: 'Soluzione', area: 'sol', help: 'Le tre funzionalità principali', main: true },
  { key: 'metrics', label: 'Metriche chiave', area: 'met', help: 'I numeri che dicono se funziona', main: true },
  { key: 'uvp', label: 'Proposta di valore unica', area: 'uvp', help: 'Perché scegliere noi, in una frase', main: true },
  { key: 'concept', label: 'Concetto in breve', area: 'uvp', help: 'Per esempio "X per Y"' },
  { key: 'advantage', label: 'Vantaggio sleale', area: 'adv', help: 'Ciò che non si copia né si compra', main: true },
  { key: 'channels', label: 'Canali', area: 'chan', help: 'Come raggiungiamo i clienti', main: true },
  { key: 'segments', label: 'Segmenti di clienti', area: 'seg', help: 'Chi sono i clienti', main: true },
  { key: 'early_adopters', label: 'Early adopter', area: 'seg', help: 'Chi lo vorrebbe subito' },
  { key: 'costs', label: 'Struttura dei costi', area: 'cost', main: true },
  { key: 'revenue', label: 'Flussi di ricavo', area: 'rev', main: true },
];

export const TRL = [
  ['1', 'TRL 1: principi di base osservati'],
  ['2', 'TRL 2: concetto tecnologico formulato'],
  ['3', 'TRL 3: prova di concetto sperimentale'],
  ['4', 'TRL 4: tecnologia validata in laboratorio'],
  ['5', 'TRL 5: tecnologia validata in un ambiente rilevante'],
  ['6', 'TRL 6: tecnologia dimostrata in un ambiente rilevante'],
  ['7', 'TRL 7: prototipo dimostrato in ambiente operativo'],
  ['8', 'TRL 8: sistema completo e qualificato'],
  ['9', 'TRL 9: sistema provato in ambiente operativo reale'],
];

export const IMPORTANCE = [
  ['alta', 'Alta'],
  ['media', 'Media'],
  ['bassa', 'Bassa'],
];

export const TEAM_BLOCKS = [
  { key: 'people', label: 'Persone e ruoli', help: 'Chi siamo e che ruolo ha ciascuno nel team' },
  { key: 'common_goals', label: 'Obiettivi comuni', help: 'Cosa vogliamo ottenere insieme: misurabile e con una scadenza' },
  { key: 'personal_goals', label: 'Obiettivi personali', help: 'Cosa vuole ottenere ciascuno, anche per sé' },
  { key: 'purpose', label: 'Scopo', help: 'Perché facciamo quello che facciamo' },
  { key: 'values', label: 'Valori', help: 'I principi che guidano le nostre scelte' },
  { key: 'needs', label: 'Bisogni e aspettative', help: 'Cosa serve a ciascuno per dare il meglio' },
  { key: 'rules', label: 'Regole e attività', help: 'Come comunichiamo, decidiamo e verifichiamo il lavoro' },
  { key: 'strengths', label: 'Punti di forza', help: 'Competenze e risorse del team, singole e di gruppo' },
  { key: 'weaknesses', label: 'Debolezze e rischi', help: 'Cosa ci manca e quali ostacoli vediamo' },
];

export const DEFAULT_EQUITY_FACTORS = [
  { key: 'idea', label: 'Idea', weight: 5 },
  { key: 'business-plan', label: 'Business plan', weight: 5 },
  { key: 'esperienza', label: 'Esperienza nel settore', weight: 5 },
  { key: 'rischio', label: 'Rischio e impegno', weight: 5 },
  { key: 'responsabilita', label: 'Responsabilità', weight: 5 },
];

const field = (key, label, type = 'textarea', extra = {}) => ({ key, label, type, ...extra });

export const KINDS = {
  idea: {
    label: 'Idea',
    plural: 'Idee',
    icon: 'idea',
    titleLabel: 'Nome dell\'idea',
    statuses: [
      ['nuova', 'Nuova'],
      ['esplorazione', 'In esplorazione'],
      ['validazione', 'In validazione'],
      ['scelta', 'Scelta'],
      ['parcheggiata', 'Parcheggiata'],
      ['scartata', 'Scartata'],
    ],
    fields: [
      field('pitch', 'In una frase', 'textarea', { rows: 2, wide: true, placeholder: 'Aiutiamo [chi] a [risolvere cosa] grazie a [come]' }),
      field('problem', 'Problema', 'textarea', { placeholder: 'Quale problema, per chi, quanto pesa oggi' }),
      field('customer', 'Cliente', 'textarea', { placeholder: 'Chi paga e chi usa: ruolo, tipo di organizzazione' }),
      field('solution', 'Soluzione'),
      field('why_us', 'Perché noi', 'textarea', { placeholder: 'Competenze, dati, contatti o ricerca che altri non hanno' }),
      field('technologies', 'Tecnologie', 'tags', { suggestions: TECH_SUGGESTIONS }),
      field('sector', 'Settore', 'text'),
      field('owner', 'Responsabile', 'member'),
      field('competitors', 'Concorrenti e alternative'),
      field('risks', 'Rischi principali'),
      field('next_step', 'Prossimo passo', 'text'),
      field('resources', 'Paper e link', 'textarea', { placeholder: 'Un riferimento per riga' }),
    ],
    extraKeys: ['origin'],
  },
  canvas: {
    label: 'Lean Canvas',
    plural: 'Lean Canvas',
    icon: 'canvas',
    titleLabel: 'Titolo',
    needsIdea: true,
    statuses: null,
    fields: CANVAS_BLOCKS.map((b) => field(b.key, b.label, 'textarea', { help: b.help })),
    extraKeys: ['validated'],
  },
  experiment: {
    label: 'Esperimento',
    plural: 'Esperimenti',
    icon: 'experiment',
    titleLabel: 'Che cosa vogliamo scoprire',
    needsIdea: true,
    statuses: [
      ['pianificato', 'Pianificato'],
      ['in_corso', 'In corso'],
      ['concluso', 'Concluso'],
    ],
    fields: [
      field('customer', 'Cliente', 'textarea', { rows: 2 }),
      field('problem', 'Problema', 'textarea', { rows: 2 }),
      field('solution', 'Soluzione ipotizzata', 'textarea', { rows: 2 }),
      field('assumption', 'Assunzione più rischiosa', 'textarea', { rows: 2, wide: true, placeholder: 'Se è falsa, l\'idea non sta in piedi' }),
      field('assumption_type', 'Tipo di assunzione', 'select', {
        options: [
          ['problema', 'Il problema esiste'],
          ['cliente', 'Il cliente è quello giusto'],
          ['soluzione', 'La soluzione funziona'],
          ['prezzo', 'Sono disposti a pagare'],
          ['canale', 'Riusciamo a raggiungerli'],
          ['tecnica', 'È fattibile tecnicamente'],
          ['normativa', 'È fattibile per le norme'],
        ],
      }),
      field('method', 'Metodo', 'select', {
        options: [
          ['interviste', 'Interviste'],
          ['demo', 'Demo o prototipo'],
          ['landing', 'Landing page'],
          ['prevendita', 'Prevendita o pilota'],
          ['dati', 'Analisi di dati'],
          ['concierge', 'Servizio manuale (concierge)'],
          ['altro', 'Altro'],
        ],
      }),
      field('method_details', 'Come lo facciamo'),
      field('success_criterion', 'Criterio di successo', 'textarea', {
        rows: 2,
        wide: true,
        placeholder: 'Deciso prima di iniziare. Per esempio: almeno 5 su 15 chiedono una demo',
      }),
      field('owner', 'Responsabile', 'member'),
      field('start_date', 'Inizio', 'date'),
      field('end_date', 'Scadenza', 'date'),
      field('result', 'Risultato', 'textarea', { placeholder: 'Numeri e fatti, non impressioni' }),
      field('learnings', 'Cosa abbiamo imparato'),
      field('decision', 'Decisione', 'select', {
        options: [
          ['proseguire', 'Proseguire'],
          ['cambiare', 'Cambiare direzione'],
          ['abbandonare', 'Abbandonare'],
        ],
      }),
    ],
  },
  interview: {
    label: 'Intervista',
    plural: 'Interviste',
    icon: 'interview',
    titleLabel: 'Titolo',
    statuses: [
      ['da_fare', 'Da fare'],
      ['fatta', 'Fatta'],
      ['analizzata', 'Analizzata'],
    ],
    fields: [
      field('date', 'Data', 'date'),
      field('interviewer', 'Intervistatore', 'member'),
      field('role', 'Ruolo dell\'intervistato', 'text', { placeholder: 'Per esempio: responsabile acquisti, medico di base' }),
      field('organization', 'Organizzazione', 'text'),
      field('segment', 'Segmento', 'text'),
      field('experiment_id', 'Esperimento', 'experiment'),
      field('current_solution', 'Come lo risolve oggi'),
      field('pains', 'Problemi e frustrazioni'),
      field('quotes', 'Citazioni testuali', 'textarea', { placeholder: 'Una per riga, parole esatte' }),
      field('willingness_to_pay', 'Disponibilità a pagare', 'textarea', { rows: 2 }),
      field('problem_intensity', 'Quanto sente il problema', 'scale', { help: '1 = per niente, 5 = è una priorità' }),
      field('commitment', 'Impegno preso', 'select', { options: COMMITMENT, help: 'Conta più di qualsiasi complimento' }),
      field('notes', 'Appunti'),
      field('follow_up', 'Follow-up', 'text'),
      field('contact', 'Contatto', 'text', { help: 'Solo se serve per ricontattarlo' }),
    ],
  },
  decision: {
    label: 'Decisione',
    plural: 'Decisioni',
    icon: 'decision',
    titleLabel: 'Decisione in breve',
    statuses: [
      ['proposta', 'Proposta'],
      ['presa', 'Presa'],
      ['rivista', 'Rivista'],
    ],
    fields: [
      field('date', 'Data', 'date'),
      field('context', 'Contesto'),
      field('options', 'Alternative considerate'),
      field('decision', 'Decisione', 'textarea', { wide: true }),
      field('rationale', 'Motivazione'),
      field('decided_by', 'Chi ha deciso', 'members'),
      field('ideas', 'Idee collegate', 'ideas'),
      field('review_date', 'Da rivedere entro', 'date'),
    ],
  },
  contact: {
    label: 'Persona con cui interfacciarsi',
    plural: 'Persone con cui interfacciarsi',
    icon: 'users',
    titleLabel: 'Chi è (nome o ruolo)',
    needsIdea: true,
    statuses: [
      ['da_contattare', 'Da contattare'],
      ['contattata', 'Contattata, in attesa'],
      ['fissata', 'Incontro fissato'],
      ['in_contatto', 'In contatto'],
      ['chiusa', 'Chiusa o non disponibile'],
    ],
    fields: [
      field('purpose', 'Perché ci serve', 'select', {
        options: [
          ['cliente', 'Potenziale cliente da intervistare'],
          ['utente', 'Utente, o chi offre il servizio, da intervistare'],
          ['esperto', 'Esperto del settore'],
          ['realizzazione', 'Per realizzarla: sviluppo, fornitori, laboratori'],
          ['design_partner', 'Possibile design partner'],
          ['mentor', 'Mentor o advisor'],
          ['investitore', 'Investitore o finanziatore'],
          ['ateneo', 'Ateneo e trasferimento tecnologico'],
          ['norme', 'Consulente legale o normativo'],
          ['altro', 'Altro'],
        ],
      }),
      field('role', 'Ruolo', 'text'),
      field('organization', 'Organizzazione', 'text'),
      field('segment', 'Segmento', 'text'),
      field('goal', 'Cosa vogliamo capire o ottenere', 'textarea', { rows: 2, wide: true, concept: 'fuori-dall-ufficio' }),
      field('via', 'Come ci arriviamo', 'text', { placeholder: 'Chi ci presenta, evento, associazione, contatto diretto' }),
      field('owner', 'Chi se ne occupa', 'member'),
      field('next_date', 'Prossimo contatto', 'date'),
      field('interview_id', 'Intervista', 'interview'),
      field('notes', 'Appunti'),
      field('contact', 'Contatto', 'text', { help: 'Email o telefono, solo se serve. Non viene mai mandato a Claude.' }),
    ],
  },
  deeptech: {
    label: 'Scheda deep tech',
    plural: 'Schede deep tech',
    icon: 'chip',
    titleLabel: 'Titolo',
    needsIdea: true,
    statuses: null,
    fields: [
      field('trl_now', 'TRL attuale', 'select', { options: TRL, group: 'Maturità della tecnologia', concept: 'trl' }),
      field('trl_target', 'TRL della prossima tappa', 'select', { options: TRL }),
      field('next_milestone', 'Prossima tappa tecnica', 'textarea', { placeholder: 'Cosa dimostrare, dove e con quali dati' }),
      field('milestone_cost', 'Costo e durata della tappa', 'text', { placeholder: 'Per esempio: 80.000 euro, 9 mesi' }),
      field('tech_risks', 'Ipotesi tecniche più rischiose', 'textarea', { group: 'Due rischi da validare', concept: 'due-rischi' }),
      field('market_risks', 'Ipotesi di mercato più rischiose'),
      field('design_partners', 'Design partner', 'textarea', { placeholder: 'Aziende che provano il prototipo sui loro dati: chi, a che punto, quale impegno', concept: 'design-partner' }),
      field('value_metrics', 'Valore misurato per il cliente', 'textarea', { placeholder: 'Tempo risparmiato, errori evitati, euro guadagnati: non metriche accademiche' }),
      field('offer', 'Cosa vendiamo', 'select', {
        options: [
          ['prodotto', 'Un prodotto'],
          ['servizio', 'Un servizio con la tecnologia dentro'],
          ['licenza', 'Una licenza della tecnologia'],
          ['da_decidere', 'Da decidere'],
        ],
      }),
      field('published', 'Già pubblicato', 'textarea', { group: 'Proprietà intellettuale', placeholder: 'Articoli, tesi, preprint, codice aperto: non è più brevettabile', concept: 'novita-assoluta' }),
      field('to_protect', 'Da proteggere', 'textarea', { placeholder: 'Sviluppi nuovi da brevettare, software da registrare, know-how da tenere riservato' }),
      field('ip_owner', 'Di chi è la proprietà intellettuale', 'select', {
        concept: 'invenzioni-universitarie',
        options: [
          ['ateneo', 'Dell\'ateneo: serve una licenza o una cessione'],
          ['team', 'Del team'],
          ['mista', 'In parte dell\'ateneo, in parte del team'],
          ['da_chiarire', 'Da chiarire'],
        ],
      }),
      field('company_form', 'Forma della società', 'select', {
        concept: 'spin-off',
        options: [
          ['spinoff', 'Spin-off universitario'],
          ['licenza', 'Startup indipendente con licenza dall\'ateneo'],
          ['indipendente', 'Startup indipendente'],
          ['da_decidere', 'Da decidere'],
        ],
      }),
      field('academic_constraints', 'Vincoli accademici', 'textarea', { placeholder: 'Cariche in ateneo, conflitti di interesse, regolamento spin-off' }),
      field('regulation', 'Norme da rispettare', 'textarea', { group: 'Norme e finanziamenti', placeholder: 'AI Act, GDPR, dispositivi medici, settori regolati', concept: 'ai-act' }),
      field('funding', 'Finanziamenti non diluitivi', 'textarea', { placeholder: 'Bandi adatti, requisiti e scadenze', concept: 'finanza-non-diluitiva' }),
    ],
  },
  persona: {
    label: 'Buyer persona',
    plural: 'Buyer persona',
    icon: 'user',
    titleLabel: 'Nome',
    titlePlaceholder: 'Un nome di fantasia, per esempio Giulia',
    needsIdea: true,
    statuses: null,
    fields: [
      field('photo', 'Foto', 'image', { group: 'Profilo', wide: true, help: 'Una foto di repertorio o generata, non quella di una persona reale: sarebbe un dato personale.' }),
      field('role', 'Ruolo', 'text', { wide: true, placeholder: 'Per esempio nutrizionista libera professionista con studio avviato' }),
      field('role_type', 'Ruolo nell\'acquisto', 'select', {
        concept: 'cliente-utente',
        options: [
          ['paga', 'Paga'],
          ['usa', 'Usa'],
          ['paga_usa', 'Paga e usa'],
          ['influenza', 'Influenza la scelta'],
        ],
      }),
      field('segment', 'Segmento', 'text'),
      field('early_adopter', 'È un early adopter?', 'select', {
        concept: 'early-adopter',
        options: [
          ['si', 'Sì: ha il problema, lo sa e cerca una soluzione'],
          ['forse', 'Forse'],
          ['no', 'No'],
        ],
      }),
      field('age_range', 'Fascia d\'età', 'text', { group: 'Dati demografici', placeholder: 'Ampia, per esempio 30-50 anni' }),
      field('gender', 'Genere', 'select', { options: [['donna', 'Donna'], ['uomo', 'Uomo'], ['qualsiasi', 'Qualsiasi']] }),
      field('location', 'Dove vive o lavora', 'text', { placeholder: 'Per esempio città medio-piccole del Sud Italia' }),
      field('income', 'Fascia di reddito', 'text', { placeholder: 'Ampia, per esempio 25.000-40.000 € all\'anno' }),
      field('education', 'Istruzione', 'text', { placeholder: 'Per esempio laurea triennale' }),
      field('profile', 'Chi è, in breve', 'textarea', { group: 'Storia e abitudini', placeholder: 'Una breve biografia: situazione, lavoro, famiglia, come passa le giornate', concept: 'buyer-persona' }),
      field('habits', 'Abitudini e comportamenti', 'textarea', { placeholder: 'Come vive oggi il problema e cosa fa per risolverlo' }),
      field('current_solution', 'Come lo risolve oggi e quanto spende'),
      field('needs', 'Bisogni', 'textarea', { group: 'Bisogni, sogni e paure' }),
      field('goals', 'Obiettivi e speranze'),
      field('fears', 'Paure e frustrazioni'),
      field('objections', 'Obiezioni all\'acquisto', 'textarea', { placeholder: 'Perché potrebbe dire di no: prezzo, fiducia, tempo, abitudini, chi altro deve approvare' }),
      field('channels', 'Dove trovarla', 'textarea', { group: 'Come raggiungerla', placeholder: 'Siti, eventi, associazioni, gruppi che frequenta' }),
      field('info_sources', 'Dove si informa', 'textarea', { placeholder: 'Siti, social, riviste, podcast, esperti o eventi da cui prende consigli' }),
      field('quote', 'Una frase tipica', 'textarea', { group: 'Su cosa si basa', rows: 2, placeholder: 'Parole vere, prese da un\'intervista' }),
      field('evidence', 'Su cosa si basa', 'textarea', { rows: 2, placeholder: 'Quante interviste, questionari o dati' }),
    ],
  },
  vpc: {
    label: 'Value Proposition Canvas',
    plural: 'Value Proposition Canvas',
    icon: 'target',
    titleLabel: 'Titolo',
    needsIdea: true,
    statuses: null,
    fields: [
      field('segment', 'Segmento di clienti', 'text', { wide: true }),
      field('jobs', 'Jobs: cosa vuole fare', 'textarea', { group: 'Profilo del cliente', help: 'Compiti funzionali, sociali ed emotivi', concept: 'vpc' }),
      field('pains', 'Pains: difficoltà e rischi', 'textarea', { help: 'Cosa rende il compito spiacevole, costoso o rischioso' }),
      field('gains', 'Gains: risultati desiderati', 'textarea', { help: 'Richiesti, attesi, desiderati, inaspettati' }),
      field('products', 'Prodotti e servizi', 'textarea', { group: 'Mappa del valore' }),
      field('pain_relievers', 'Come riduciamo i pains'),
      field('gain_creators', 'Come creiamo i gains'),
      field('fit', 'Fit verificato', 'textarea', { group: 'Verifica', placeholder: 'Quali pains e gains sono confermati da interviste o esperimenti' }),
    ],
  },
  market: {
    label: 'Mercato',
    plural: 'Analisi di mercato',
    icon: 'market',
    titleLabel: 'Titolo',
    needsIdea: true,
    statuses: null,
    fields: [
      field('approach', 'Metodo di stima', 'select', {
        concept: 'tam-sam-som',
        options: [
          ['top_down', 'Dall\'alto: dati di mercato'],
          ['bottom_up', 'Dal basso: clienti raggiungibili per prezzo'],
        ],
      }),
      field('tam', 'TAM: mercato totale (euro all\'anno)', 'money', { group: 'TAM: mercato totale' }),
      field('tam_basis', 'Calcolo e fonti del TAM'),
      field('sam', 'SAM: mercato servibile (euro all\'anno)', 'money', { group: 'SAM: mercato servibile' }),
      field('sam_basis', 'Calcolo e fonti del SAM'),
      field('som', 'SOM: quota ottenibile (euro all\'anno)', 'money', { group: 'SOM: quota ottenibile' }),
      field('som_year', 'Anno di riferimento del SOM', 'int', { min: 2000, max: 2100 }),
      field('som_basis', 'Ragionamento sul SOM', 'textarea', { placeholder: 'Concorrenza, canali, capacità del team: deve essere coerente con il piano' }),
      field('trend', 'Tendenze', 'textarea', { group: 'Contesto', placeholder: 'Come cambierà il mercato nei prossimi 3-5 anni' }),
      field('sources', 'Fonti', 'textarea', { placeholder: 'Una per riga, istituzionali quando possibile' }),
    ],
  },
  competitors: {
    label: 'Analisi dei concorrenti',
    plural: 'Analisi dei concorrenti',
    icon: 'competitors',
    titleLabel: 'Titolo',
    needsIdea: true,
    statuses: null,
    fields: [
      field('gap', 'Il vuoto che vogliamo colmare', 'textarea', { wide: true, concept: 'concorrenti' }),
      field('lessons', 'Cosa impariamo dai concorrenti'),
    ],
    extraKeys: ['features', 'rivals', 'cells', 'axes', 'us'],
  },
  note: {
    label: 'Nota',
    plural: 'Appunti',
    icon: 'file',
    titleLabel: 'Titolo',
    titleFromBody: true,
    needsIdea: true,
    statuses: null,
    fields: [
      field('date', 'Data', 'date'),
      field('body', 'Testo', 'markdown', { wide: true, help: 'La prima riga è il titolo. Si può scrivere anche in Markdown: # titoli, **grassetto**, - elenchi, | tabelle |.' }),
    ],
  },
  teamcanvas: {
    label: 'Team Canvas',
    plural: 'Team Canvas',
    icon: 'heart',
    titleLabel: 'Titolo',
    statuses: null,
    singleton: true,
    fields: TEAM_BLOCKS.map((b) => field(b.key, b.label, 'textarea', { help: b.help, rows: 3 })),
  },
  equity: {
    label: 'Divisione delle quote',
    plural: 'Divisione delle quote',
    icon: 'pie',
    titleLabel: 'Titolo',
    statuses: null,
    singleton: true,
    fields: [
      field('vesting', 'Vesting e accordi tra soci', 'textarea', { placeholder: 'Per esempio: 4 anni con un anno di cliff; cosa succede alle quote di chi lascia', concept: 'vesting' }),
      field('notes', 'Note'),
    ],
    extraKeys: ['factors', 'founders', 'scores'],
  },
  criteria: { label: 'Criteri di valutazione', plural: 'Criteri', icon: 'scoring', titleLabel: 'Titolo', statuses: null, fields: [] },
  score: { label: 'Voti', plural: 'Voti', icon: 'scoring', titleLabel: 'Titolo', statuses: null, fields: [] },
  scoresnap: { label: 'Fotografia della valutazione', plural: 'Fotografie della valutazione', icon: 'image', titleLabel: 'Nome', statuses: null, fields: [] },
  generator: { label: 'Generatore', plural: 'Generatore', icon: 'generator', titleLabel: 'Titolo', statuses: null, fields: [] },
};

export const BOARD_KINDS = ['idea', 'canvas', 'experiment', 'interview', 'decision', 'contact', 'deeptech', 'persona', 'vpc', 'market', 'competitors', 'note'];
export const IDEA_CHILD_KINDS = ['canvas', 'experiment', 'interview', 'contact', 'deeptech', 'persona', 'vpc', 'market', 'competitors', 'note'];
export const TEAM_KINDS = ['teamcanvas', 'equity'];
export const EDITABLE_KINDS = [...BOARD_KINDS, ...TEAM_KINDS];

export function kindOf(kind) {
  return KINDS[kind] || null;
}

export function defaultStatus(kind) {
  return KINDS[kind]?.statuses?.[0]?.[0] ?? null;
}

export function statusLabel(kind, status) {
  return KINDS[kind]?.statuses?.find(([value]) => value === status)?.[1] ?? status ?? '';
}

export function fieldOf(kind, key) {
  return KINDS[kind]?.fields.find((f) => f.key === key) || null;
}

export function optionLabel(fieldDef, value) {
  return fieldDef?.options?.find(([v]) => v === value)?.[1] ?? value;
}

// Passo della roadmap segnato a mano: «done|chi|quando» oppure «skip|chi|quando» (solo per i passi facoltativi).
const ROADMAP_MARK_RE = /^(done|skip)\|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)$/i;

export function parseRoadmapMark(value) {
  const m = typeof value === 'string' ? value.match(ROADMAP_MARK_RE) : null;
  return m ? { state: m[1], by: m[2].toLowerCase(), at: m[3] } : null;
}

export const roadmapMark = (state, by, at = new Date().toISOString()) => `${state}|${by}|${at}`;

function sanitizeRoadmap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= 100) break;
    if (/^[a-z0-9-]{1,40}$/.test(key) && parseRoadmapMark(value)) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

function sanitizeField(def, value) {
  switch (def.type) {
    case 'text':
      return cleanLine(value) || undefined;
    case 'textarea':
      return cleanText(value) || undefined;
    case 'markdown':
      return cleanText(value, LIMITS.note) || undefined;
    case 'select':
      return def.options.some(([v]) => v === value) ? value : undefined;
    case 'date':
      return isIsoDate(value) ? value : undefined;
    case 'member':
    case 'experiment':
    case 'interview':
      return isUuid(value) ? value : undefined;
    case 'members':
    case 'ideas': {
      const ids = uniqueUuids(value);
      return ids.length ? ids : undefined;
    }
    case 'tags': {
      const tags = uniqueStrings(value);
      return tags.length ? tags : undefined;
    }
    case 'scale':
      return intInRange(value, 1, 5) ?? undefined;
    case 'money':
      return intInRange(typeof value === 'number' ? Math.round(value) : value, 0, 1e13) ?? undefined;
    case 'int':
      return intInRange(value, def.min ?? 0, def.max ?? 1e9) ?? undefined;
    case 'image':
      return isPhotoDataUrl(value) ? value : undefined;
    default:
      return undefined;
  }
}

const ROW_ID_RE = /^[a-z0-9-]{1,40}$/;
const isRowId = (value) => typeof value === 'string' && ROW_ID_RE.test(value);

function sanitizeAxisLabels(axis) {
  const out = {};
  const label = cleanLine(axis?.label, 60);
  const low = cleanLine(axis?.low, 40);
  const high = cleanLine(axis?.high, 40);
  if (label) out.label = label;
  if (low) out.low = low;
  if (high) out.high = high;
  return out;
}

function sanitizePosition(row) {
  const out = {};
  const x = intInRange(row?.x, 0, 10);
  const y = intInRange(row?.y, 0, 10);
  if (x !== null) out.x = x;
  if (y !== null) out.y = y;
  return out;
}

function sanitizeCompetitors(raw) {
  const features = [];
  const featureIds = new Set();
  for (const row of Array.isArray(raw?.features) ? raw.features : []) {
    const label = cleanLine(row?.label, 120);
    if (!label || !isRowId(row?.id) || featureIds.has(row.id)) continue;
    featureIds.add(row.id);
    features.push({ id: row.id, label, importance: IMPORTANCE.some(([v]) => v === row.importance) ? row.importance : 'media' });
    if (features.length >= 20) break;
  }
  const rivals = [];
  const columns = new Set(['noi']);
  for (const row of Array.isArray(raw?.rivals) ? raw.rivals : []) {
    const name = cleanLine(row?.name, 80);
    if (!name || !isRowId(row?.id) || columns.has(row.id)) continue;
    columns.add(row.id);
    const rival = { id: row.id, name, type: row.type === 'indiretto' ? 'indiretto' : 'diretto', ...sanitizePosition(row) };
    const note = cleanLine(row?.note, 300);
    if (note) rival.note = note;
    rivals.push(rival);
    if (rivals.length >= 15) break;
  }
  const cells = {};
  for (const [key, value] of Object.entries(raw?.cells || {})) {
    const [featureId, columnId] = key.split(':');
    if (value === true && featureIds.has(featureId) && columns.has(columnId)) cells[key] = true;
  }
  const out = {};
  if (features.length) out.features = features;
  if (rivals.length) out.rivals = rivals;
  if (Object.keys(cells).length) out.cells = cells;
  const axes = { x: sanitizeAxisLabels(raw?.axes?.x), y: sanitizeAxisLabels(raw?.axes?.y) };
  if (Object.keys(axes.x).length || Object.keys(axes.y).length) out.axes = axes;
  const us = sanitizePosition(raw?.us);
  if (Object.keys(us).length) out.us = us;
  return out;
}

function sanitizeEquity(raw) {
  const factors = [];
  const factorKeys = new Set();
  for (const row of Array.isArray(raw?.factors) ? raw.factors : []) {
    const label = cleanLine(row?.label, 60);
    if (!label || !isKey(row?.key) || factorKeys.has(row.key)) continue;
    factorKeys.add(row.key);
    factors.push({ key: row.key, label, weight: intInRange(row?.weight, 0, 10) ?? 5 });
    if (factors.length >= 10) break;
  }
  const founders = [];
  const founderIds = new Set();
  for (const row of Array.isArray(raw?.founders) ? raw.founders : []) {
    const name = cleanLine(row?.name, 80);
    if (!name || !isRowId(row?.id) || founderIds.has(row.id)) continue;
    founderIds.add(row.id);
    founders.push({ id: row.id, name });
    if (founders.length >= 10) break;
  }
  const scores = {};
  for (const [key, value] of Object.entries(raw?.scores || {})) {
    const [factorKey, founderId] = key.split(':');
    const n = intInRange(value, 0, 10);
    if (n !== null && factorKeys.has(factorKey) && founderIds.has(founderId)) scores[key] = n;
  }
  const out = {};
  if (factors.length) out.factors = factors;
  if (founders.length) out.founders = founders;
  if (Object.keys(scores).length) out.scores = scores;
  return out;
}

// Metodo Demmler: ogni fondatore riceve la sua parte di somma(peso del fattore x punteggio).
export function equitySplit(data) {
  const factors = data?.factors || [];
  const founders = data?.founders || [];
  const totals = founders.map((f) => ({
    id: f.id,
    name: f.name,
    points: factors.reduce((sum, factor) => sum + factor.weight * (data?.scores?.[`${factor.key}:${f.id}`] || 0), 0),
  }));
  const all = totals.reduce((sum, t) => sum + t.points, 0);
  return totals.map((t) => ({ ...t, percent: all ? (t.points / all) * 100 : null }));
}

function sanitizeCriteria(data) {
  const seen = new Set();
  const criteria = [];
  for (const row of Array.isArray(data?.criteria) ? data.criteria : []) {
    const label = cleanLine(row?.label, 80);
    if (!label) continue;
    let key = isKey(row?.key) ? row.key : slugKey(label);
    while (seen.has(key)) key = `${key}-x`.slice(0, 60);
    seen.add(key);
    criteria.push({
      key,
      label,
      description: cleanLine(row?.description, 240),
      weight: intInRange(row?.weight, 0, 5) ?? 1,
    });
    if (criteria.length >= 30) break;
  }
  return { criteria };
}

function sanitizeScore(data) {
  const scores = {};
  const notes = {};
  for (const [ideaId, values] of Object.entries(data?.scores || {})) {
    if (!isUuid(ideaId) || !values || typeof values !== 'object') continue;
    const clean = {};
    for (const [key, value] of Object.entries(values)) {
      const n = intInRange(value, 1, 5);
      if (isKey(key) && n !== null) clean[key] = n;
    }
    if (Object.keys(clean).length) scores[ideaId] = clean;
  }
  for (const [ideaId, note] of Object.entries(data?.notes || {})) {
    const clean = cleanText(note, 2000);
    if (isUuid(ideaId) && clean) notes[ideaId] = clean;
  }
  return { scores, notes };
}

// Fotografia della valutazione: criteri, idee e voti di tutti così com'erano in quel momento.
function sanitizeScoreSnap(data) {
  const { criteria } = sanitizeCriteria(data);
  const keys = new Set(criteria.map((c) => c.key));
  const ideas = [];
  const ideaIds = new Set();
  for (const row of Array.isArray(data?.ideas) ? data.ideas : []) {
    const title = cleanLine(row?.title, LIMITS.title);
    if (!isUuid(row?.id) || ideaIds.has(row.id) || !title) continue;
    ideaIds.add(row.id);
    const status = KINDS.idea.statuses.some(([v]) => v === row.status) ? row.status : defaultStatus('idea');
    ideas.push({ id: row.id, title, status });
    if (ideas.length >= 200) break;
  }
  const votes = {};
  const names = {};
  for (const [memberId, byIdea] of Object.entries(data?.votes || {})) {
    if (!isUuid(memberId) || !byIdea || typeof byIdea !== 'object') continue;
    const clean = {};
    for (const [ideaId, values] of Object.entries(byIdea)) {
      if (!ideaIds.has(ideaId) || !values || typeof values !== 'object') continue;
      const row = {};
      for (const [key, value] of Object.entries(values)) {
        const n = intInRange(value, 1, 5);
        if (keys.has(key) && n !== null) row[key] = n;
      }
      if (Object.keys(row).length) clean[ideaId] = row;
    }
    if (!Object.keys(clean).length) continue;
    votes[memberId] = clean;
    const name = cleanLine(data?.names?.[memberId], LIMITS.displayName);
    if (name) names[memberId] = name;
    if (Object.keys(votes).length >= 50) break;
  }
  return { criteria, ideas, votes, names };
}

function sanitizeAxis(list) {
  const seen = new Set();
  const out = [];
  for (const row of Array.isArray(list) ? list : []) {
    const label = cleanLine(row?.label, 80);
    const id = typeof row?.id === 'string' && /^[a-z0-9-]{1,40}$/.test(row.id) ? row.id : null;
    if (!label || !id || seen.has(id)) continue;
    seen.add(id);
    const axis = { id, label };
    // Chi nel team ha questa competenza (righe) o conosce questo settore (colonne), più eventuali persone esterne.
    const people = uniqueUuids(row?.people, 20);
    const others = cleanLine(row?.others, 200);
    if (people.length) axis.people = people;
    if (others) axis.others = others;
    out.push(axis);
    if (out.length >= 20) break;
  }
  return out;
}

function sanitizeGenerator(data) {
  const rows = sanitizeAxis(data?.rows);
  const cols = sanitizeAxis(data?.cols);
  const rowIds = new Set(rows.map((r) => r.id));
  const colIds = new Set(cols.map((c) => c.id));
  const cells = {};
  for (const [key, cell] of Object.entries(data?.cells || {})) {
    const [rowId, colId] = key.split(':');
    if (!rowIds.has(rowId) || !colIds.has(colId)) continue;
    const text = cleanText(cell?.text, 4000);
    const potential = intInRange(cell?.potential, 0, 3) ?? 0;
    if (text || potential) cells[key] = { text, potential };
  }
  return { rows, cols, cells };
}

// Valido per costruzione: ogni salvataggio passa da qui e i campi sconosciuti o malformati vengono scartati.
export function sanitizeSnapshot(kind, snapshot) {
  const def = KINDS[kind];
  if (!def) throw new Error(`Tipo sconosciuto: ${kind}`);
  const raw = snapshot?.data && typeof snapshot.data === 'object' ? snapshot.data : {};
  let data = {};

  if (kind === 'criteria') data = sanitizeCriteria(raw);
  else if (kind === 'score') data = sanitizeScore(raw);
  else if (kind === 'scoresnap') data = sanitizeScoreSnap(raw);
  else if (kind === 'generator') data = sanitizeGenerator(raw);
  else {
    for (const f of def.fields) {
      const value = sanitizeField(f, raw[f.key]);
      if (value !== undefined) data[f.key] = value;
    }
    if (kind === 'canvas') {
      const validated = {};
      for (const block of CANVAS_BLOCKS) {
        if (raw.validated?.[block.key] === true) validated[block.key] = true;
      }
      if (Object.keys(validated).length) data.validated = validated;
    }
    if (kind === 'idea' && typeof raw.origin === 'string' && /^[a-z0-9-]{1,40}:[a-z0-9-]{1,40}$/.test(raw.origin)) {
      data.origin = raw.origin;
    }
    if (kind === 'idea') {
      const roadmap = sanitizeRoadmap(raw.roadmap);
      if (roadmap) data.roadmap = roadmap;
    }
    if (kind === 'competitors') Object.assign(data, sanitizeCompetitors(raw));
    if (kind === 'equity') Object.assign(data, sanitizeEquity(raw));
  }

  const status = def.statuses
    ? def.statuses.some(([v]) => v === snapshot?.status)
      ? snapshot.status
      : defaultStatus(kind)
    : null;
  let ideaId = isUuid(snapshot?.idea_id) ? snapshot.idea_id : null;
  if (!IDEA_CHILD_KINDS.includes(kind)) ideaId = null;

  return {
    title: cleanLine(snapshot?.title, LIMITS.title),
    status,
    idea_id: ideaId,
    data,
  };
}

export function snapshotProblem(kind, snapshot) {
  const def = KINDS[kind];
  if (BOARD_KINDS.includes(kind) && !snapshot.title) return `Manca il campo "${def.titleLabel}".`;
  if (def.needsIdea && !snapshot.idea_id) return 'Scegli l\'idea a cui appartiene.';
  if (kind === 'scoresnap' && !snapshot.title) return 'Dai un nome alla fotografia.';
  return null;
}

export function autoInterviewTitle(data) {
  const parts = [data.role, data.organization].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Intervista';
}

const TOP_LABELS = { title: null, status: 'Stato', idea_id: 'Idea collegata' };

// Etichetta leggibile per un percorso dello storico, come "data.problem" o "data.scores.<id>.mercato".
export function describePath(kind, path, ctx = {}) {
  if (path === 'title') return KINDS[kind]?.titleLabel || 'Titolo';
  if (path in TOP_LABELS) return TOP_LABELS[path];
  const rest = path.replace(/^data\./, '');
  const [head, ...tail] = rest.split('.');

  if (kind === 'score') {
    const [, ideaId, criterion] = rest.split('.');
    const ideaTitle = ctx.ideaTitle?.(ideaId) || 'Idea';
    if (head === 'notes') return `Note › ${ideaTitle}`;
    return `Voti › ${ideaTitle} › ${ctx.criterionLabel?.(criterion) || criterion || ''}`.trim();
  }
  if (kind === 'criteria') {
    if (rest === 'criteria.#order') return 'Criteri › ordine';
    const match = rest.match(/^criteria#([^.]+)\.(\w+)$/);
    if (match) {
      const prop = { label: 'Nome', description: 'Descrizione', weight: 'Peso' }[match[2]] || match[2];
      return `Criteri › ${ctx.criterionLabel?.(match[1]) || match[1]} › ${prop}`;
    }
  }
  if (kind === 'generator') {
    const axis = head.match(/^(rows|cols)(?:#(.+))?$/);
    if (axis) {
      const name = axis[1] === 'rows' ? 'Righe' : 'Colonne';
      if (rest.endsWith('#order')) return `${name} › ordine`;
      const what = tail[0] === 'people' || tail[0] === 'others' ? ' › persone' : '';
      return axis[2] ? `${name} › ${ctx.axisLabel?.(axis[2]) || axis[2]}${what}` : name;
    }
    if (head === 'cells') {
      const [rowId, colId] = (tail[0] || '').split(':');
      const what = tail[1] === 'potential' ? ' › potenziale' : '';
      return `${ctx.axisLabel?.(rowId) || rowId} × ${ctx.axisLabel?.(colId) || colId}${what}`;
    }
  }
  if (kind === 'competitors') {
    if (head.startsWith('features')) return 'Funzionalità confrontate';
    if (head.startsWith('rivals')) return 'Concorrenti';
    if (head === 'cells') return 'Tabella di confronto';
    if (head === 'axes') return 'Assi del grafico';
    if (head === 'us') return 'La nostra posizione nel grafico';
  }
  if (kind === 'equity') {
    if (head.startsWith('factors')) return 'Fattori e pesi';
    if (head.startsWith('founders')) return 'Fondatori';
    if (head === 'scores') return 'Punteggi';
  }
  if (kind === 'scoresnap') return { criteria: 'Criteri', ideas: 'Idee', votes: 'Voti', names: 'Nomi' }[head.split('#')[0]] || head;
  if (kind === 'canvas' && head === 'validated') {
    return `${CANVAS_BLOCKS.find((b) => b.key === tail[0])?.label || tail[0]} › validato`;
  }
  if (kind === 'idea' && head === 'origin') return 'Origine nel generatore';
  if (kind === 'idea' && head === 'roadmap') return `Roadmap › ${ctx.roadmapStep?.(tail[0]) || tail[0]}`;
  return fieldOf(kind, head)?.label || head;
}

export function formatValue(kind, path, value, ctx = {}) {
  if (value === undefined || value === null) return '';
  if (path === 'status') return statusLabel(kind, value);
  if (path === 'idea_id') return ctx.ideaTitle?.(value) || 'Idea';
  if (kind === 'idea' && path.startsWith('data.roadmap.')) {
    const mark = parseRoadmapMark(value);
    if (!mark) return '';
    const who = ctx.memberName?.(mark.by) || 'Membro';
    return mark.state === 'skip' ? `non serve (${who})` : `fatto (${who})`;
  }
  const key = path.replace(/^data\./, '').split('.')[0];
  const def = fieldOf(kind, key);
  if (def) {
    if (def.type === 'select') return optionLabel(def, value);
    if (def.type === 'member') return ctx.memberName?.(value) || 'Membro';
    if (def.type === 'experiment') return ctx.itemTitle?.(value) || 'Esperimento';
    if (def.type === 'interview') return ctx.itemTitle?.(value) || 'Intervista';
    if (def.type === 'members') return (Array.isArray(value) ? value : [value]).map((id) => ctx.memberName?.(id) || 'Membro');
    if (def.type === 'ideas') return (Array.isArray(value) ? value : [value]).map((id) => ctx.ideaTitle?.(id) || 'Idea');
    if (def.type === 'scale') return `${value}/5`;
    if (def.type === 'money') return fmtMoney(value);
    if (def.type === 'image') return 'foto';
  }
  if (typeof value === 'boolean') return value ? 'sì' : 'no';
  return value;
}

export function routeFor(item) {
  if (!item) return '#/';
  if (item.kind === 'idea') return `#/idea/${item.id}`;
  if (item.kind === 'criteria' || item.kind === 'score') return '#/valutazione';
  if (item.kind === 'scoresnap') return `#/valutazione?foto=${item.id}`;
  if (item.kind === 'generator') return '#/generatore';
  if (item.kind === 'teamcanvas') return '#/squadra';
  if (item.kind === 'equity') return '#/squadra/quote';
  return `#/elemento/${item.id}`;
}

export const DEFAULT_CRITERIA = [
  { key: 'cliente', label: 'Cliente che conosciamo', description: 'Conosciamo di persona almeno un possibile cliente', weight: 3 },
  { key: 'demo', label: 'Demo in due mesi', description: 'Possiamo mostrare qualcosa di concreto entro due mesi', weight: 2 },
  { key: 'dati', label: 'Accesso ai dati', description: 'Abbiamo o possiamo ottenere i dati necessari', weight: 3 },
  { key: 'competenze', label: 'Competenze di settore', description: 'Nel team o tra i partner c\'è chi conosce il settore', weight: 3 },
  { key: 'mercato', label: 'Mercato', description: 'Dimensione e disponibilità a pagare', weight: 2 },
  { key: 'concorrenza', label: 'Spazio rispetto ai concorrenti', description: '5 = pochi concorrenti forti o un elemento distintivo chiaro', weight: 2 },
  { key: 'difendibile', label: 'Vantaggio difendibile', description: 'Dati, tecnologia o relazioni difficili da copiare', weight: 2 },
  { key: 'team', label: 'Fit con il team', description: 'Usa le nostre competenze e ci motiva', weight: 2 },
  { key: 'ricavi', label: 'Tempo ai primi ricavi', description: '5 = ricavi entro sei mesi', weight: 2 },
  { key: 'norme', label: 'Semplicità normativa', description: '5 = nessun ostacolo normativo rilevante', weight: 1 },
];
