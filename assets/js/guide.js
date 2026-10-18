// Guida per fase: cosa fare con un'idea in ogni stato, ispirata al percorso del manuale
// (Customer Development, Lean Startup, capitolo deep tech). Usata dalla pagina Guida e dal riquadro «Prossimo passo».

import { STRONG_COMMITMENTS } from './schema.js';

export const PHASES = [
  {
    status: 'nuova',
    goal: 'Capire se l\'idea è davvero una startup e mettere per iscritto le ipotesi.',
    steps: [
      ['Scrivi l\'idea in una frase: chi aiuti, a fare cosa, grazie a cosa.', 'uvp'],
      ['Chiediti se è scalabile, replicabile e almeno dieci volte meglio di ciò che c\'è.', 'scalabilita'],
      ['Compila il primo Lean Canvas partendo dal problema: ogni blocco è un\'ipotesi.', 'lean-canvas'],
      ['Scrivi le assunzioni più rischiose e trasforma la prima in un esperimento.', 'assunzione-rischiosa'],
      ['Fai la lista delle persone con cui interfacciarsi: clienti da intervistare, esperti, chi serve per realizzarla.', 'fuori-dall-ufficio'],
      ['Se nasce da una ricerca, apri la scheda deep tech: TRL, cosa è già pubblicato, di chi è la proprietà intellettuale.', 'deep-tech'],
    ],
    exit: 'Si passa a «In esplorazione» quando canvas e assunzioni sono scritti e c\'è il primo esperimento pianificato.',
    concepts: ['startup', 'scalabilita', 'dieci-volte', 'lean-canvas', 'uvp', 'cliente-utente', 'deep-tech', 'perche-falliscono'],
  },
  {
    status: 'esplorazione',
    goal: 'Customer discovery: verificare che esista un cliente preciso con un problema vero.',
    steps: [
      ['Descrivi una buyer persona per ogni tipo di cliente, anche chi paga e chi usa se sono diversi.', 'buyer-persona'],
      ['Pianifica un esperimento sul problema con un criterio di successo deciso prima.', 'criterio-successo'],
      ['Fai interviste su fatti recenti, senza presentare la soluzione: almeno 20, di persona.', 'intervista-validazione'],
      ['Stima il mercato con TAM, SAM e SOM, citando fonti e ragionamento.', 'tam-sam-som'],
      ['Studia i concorrenti diretti e indiretti con la tabella e il grafico.', 'concorrenti'],
      ['Se è deep tech, prima di pubblicare altro parla con l\'ufficio di trasferimento tecnologico.', 'novita-assoluta'],
    ],
    exit: 'Si passa a «In validazione» quando il problema è confermato dai dati (blocco Problema validato) e si sa chi sono gli early adopter. Se il problema non c\'è, si cambia direzione o si scarta.',
    concepts: ['customer-development', 'validazione', 'early-adopter', 'intervista-validazione', 'mom-test', 'questionario', 'javelin', 'problem-solution-fit', 'buyer-persona', 'tam-sam-som', 'concorrenti'],
  },
  {
    status: 'validazione',
    goal: 'Customer validation: dimostrare che qualcuno si impegna o paga per la soluzione.',
    steps: [
      ['Compila il Value Proposition Canvas per il segmento principale.', 'vpc'],
      ['Misura l\'interesse con uno smoke test o una landing page prima di costruire.', 'smoke-test'],
      ['Costruisci l\'MVP più semplice che porta tutto il valore promesso.', 'mvp'],
      ['Chiedi impegni concreti: piloti, lettere d\'intenti, prevendite. Nel deep tech cerca 3 design partner.', 'design-partner'],
      ['Verifica prezzo e canale con esperimenti dedicati.', 'canali-acquisizione'],
      ['Nel deep tech fissa la prossima tappa TRL, con costi e bandi adatti.', 'trl'],
    ],
    exit: 'Si passa a «Scelta» quando ci sono impegni forti (pilota pagato o lettere d\'intenti) e un modello di ricavo che regge. Se non arrivano, si fa un pivot o si parcheggia.',
    concepts: ['lean-startup', 'smoke-test', 'landing-page', 'mvp', 'tipi-mvp', 'product-user-fit', 'product-market-fit', 'vpc', 'design-partner', 'pivot', 'modelli-ricavo'],
  },
  {
    status: 'scelta',
    goal: 'Concentrarsi su questa idea e costruire l\'azienda.',
    steps: [
      ['Registra la decisione con alternative e motivazioni.', 'business-model'],
      ['Compila il Team Canvas e dividete le quote con vesting.', 'team-canvas'],
      ['Decidi la forma: spin-off o startup con licenza dall\'ateneo; costituisci la società al momento giusto.', 'spin-off'],
      ['Prepara il pitch e scegli i finanziatori adatti alla fase, partendo da quelli non diluitivi.', 'pitch'],
      ['Pianifica i primi 90 giorni.', 'primi-90-giorni'],
    ],
    exit: 'Da qui si lavora sull\'azienda: business plan, piano finanziario, lancio e crescita.',
    concepts: ['quando-costituire', 'costituzione', 'startup-innovativa', 'demmler', 'vesting', 'pitch', 'business-angel', 'finanza-non-diluitiva', 'term-sheet', 'pre-post-money', 'business-plan'],
  },
  {
    status: 'parcheggiata',
    goal: 'Mettere in pausa un\'idea valida ma non adatta a questo momento, senza perderla.',
    steps: [
      ['Registra una decisione che spieghi perché: tempi, risorse, mercato non pronto.', 'perche-falliscono'],
      ['Indica una data o un evento per riparlarne.', null],
      ['Lascia scritto cosa avete imparato negli esperimenti.', 'validazione'],
    ],
    exit: 'Si riapre quando cambia la condizione indicata nella decisione.',
    concepts: ['scaling-prematuro', 'pivot', 'quattro-risorse'],
  },
  {
    status: 'scartata',
    goal: 'Chiudere con ordine e conservare ciò che si è imparato.',
    steps: [
      ['Registra la decisione con i dati che l\'hanno motivata.', 'innamorarsi-idea'],
      ['Scrivi negli esperimenti cosa avete imparato.', 'validazione'],
      ['Se è emerso uno spunto diverso, crealo come nuova idea: è un pivot, non un fallimento.', 'pivot'],
    ],
    exit: 'Un\'idea scartata con dati chiari fa risparmiare tempo e soldi: è un buon risultato.',
    concepts: ['pivot', 'innamorarsi-idea', 'perche-falliscono'],
  },
];

export const phaseOf = (status) => PHASES.find((p) => p.status === status) || null;

const doneInterviews = (interviews) => interviews.filter((i) => i.status === 'fatta' || i.status === 'analizzata').length;
const strongCommitments = (interviews) => interviews.filter((i) => STRONG_COMMITMENTS.has(i.data.commitment)).length;
const maxValidated = (canvases) => Math.max(0, ...canvases.map((c) => Object.keys(c.data.validated || {}).length));

// Cosa manca all'idea nello stato in cui si trova, calcolato dai dati della board.
export function phaseChecklist(idea, ctx) {
  const {
    canvases = [],
    experiments = [],
    interviews = [],
    personas = [],
    vpcs = [],
    markets = [],
    competitors = [],
    deeptechs = [],
    contacts = [],
    decisions = [],
    teamcanvas = null,
    equity = null,
  } = ctx;
  const newItem = (kind) => `#/nuovo/${kind}?idea=${idea.id}`;
  const tab = (name) => `#/idea/${idea.id}/${name}`;
  const done = doneInterviews(interviews);
  const strong = strongCommitments(interviews);
  const deep = deeptechs[0] || null;
  switch (idea.status) {
    case 'nuova':
      return [
        { label: 'Idea in una frase', done: Boolean(idea.data.pitch), href: `#/modifica/${idea.id}` },
        { label: 'Problema e cliente descritti', done: Boolean(idea.data.problem && idea.data.customer), href: `#/modifica/${idea.id}` },
        { label: 'Primo Lean Canvas', done: canvases.length > 0, href: canvases.length ? tab('canvas') : newItem('canvas') },
        { label: 'Assunzione più rischiosa in un esperimento', done: experiments.some((e) => e.data.assumption), href: newItem('experiment') },
        { label: `Prime persone con cui interfacciarsi: ${contacts.length} su 5`, done: contacts.length >= 5, href: contacts.length ? tab('interviste') : newItem('contact') },
        { label: 'Scheda deep tech, se nasce dalla ricerca', done: deeptechs.length > 0, href: deeptechs.length ? tab('deeptech') : newItem('deeptech'), optional: true },
      ];
    case 'esplorazione':
      return [
        { label: 'Almeno una buyer persona', done: personas.length > 0, href: personas.length ? tab('clienti') : newItem('persona') },
        { label: 'Esperimento sul problema con criterio deciso prima', done: experiments.some((e) => ['problema', 'cliente'].includes(e.data.assumption_type) && e.data.success_criterion), href: newItem('experiment') },
        { label: `Interviste fatte: ${done} su 20`, done: done >= 20, href: tab('interviste') },
        { label: 'Mercato stimato con TAM, SAM e SOM', done: markets.some((m) => m.data.tam && m.data.sam && m.data.som), href: markets.length ? tab('mercato') : newItem('market') },
        { label: 'Analisi dei concorrenti', done: competitors.some((c) => c.data.rivals?.length), href: competitors.length ? tab('mercato') : newItem('competitors') },
        { label: 'Blocco Problema del Lean Canvas validato', done: canvases.some((c) => c.data.validated?.problem), href: tab('canvas') },
      ];
    case 'validazione':
      return [
        { label: 'Value Proposition Canvas', done: vpcs.length > 0, href: vpcs.length ? tab('clienti') : newItem('vpc') },
        { label: 'Esperimento su prezzo o canale concluso', done: experiments.some((e) => ['prezzo', 'canale'].includes(e.data.assumption_type) && e.status === 'concluso'), href: newItem('experiment') },
        { label: `Impegni forti (pilota o lettera d'intenti): ${strong} su 3`, done: strong >= 3, href: tab('interviste') },
        { label: `Blocchi del Lean Canvas validati: ${maxValidated(canvases)} su 3`, done: maxValidated(canvases) >= 3, href: tab('canvas') },
        { label: 'Deep tech: prossima tappa TRL e design partner', done: Boolean(deep?.data.trl_target && deep?.data.design_partners), href: deep ? `#/modifica/${deep.id}` : newItem('deeptech'), optional: true },
      ];
    case 'scelta':
      return [
        { label: 'Decisione registrata con motivazione', done: decisions.some((d) => d.status !== 'proposta' && d.data.rationale), href: `#/nuovo/decision?idea=${idea.id}` },
        { label: 'Team Canvas compilato', done: Boolean(teamcanvas), href: '#/squadra' },
        { label: 'Quote e vesting discussi', done: Boolean(equity?.data.founders?.length && equity?.data.vesting), href: '#/squadra/quote' },
        { label: 'Forma della società decisa', done: Boolean(deep && deep.data.company_form && deep.data.company_form !== 'da_decidere'), href: deep ? `#/modifica/${deep.id}` : newItem('deeptech'), optional: !deep },
        { label: 'Prossimo passo scritto nell\'idea', done: Boolean(idea.data.next_step), href: `#/modifica/${idea.id}` },
      ];
    case 'parcheggiata':
      return [
        { label: 'Decisione con il motivo', done: decisions.some((d) => d.data.rationale), href: `#/nuovo/decision?idea=${idea.id}` },
        { label: 'Data in cui riparlarne', done: decisions.some((d) => d.data.review_date), href: `#/nuovo/decision?idea=${idea.id}` },
        { label: 'Cosa abbiamo imparato, negli esperimenti', done: experiments.some((e) => e.data.learnings), href: tab('esperimenti') },
      ];
    case 'scartata':
      return [
        { label: 'Decisione con i dati che l\'hanno motivata', done: decisions.some((d) => d.data.rationale), href: `#/nuovo/decision?idea=${idea.id}` },
        { label: 'Cosa abbiamo imparato, negli esperimenti', done: experiments.some((e) => e.data.learnings), href: tab('esperimenti') },
      ];
    default:
      return [];
  }
}
