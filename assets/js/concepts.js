// Concetti di «Il manuale dello startupper» (Boceda, D'Amato, De Martino) e del capitolo aggiunto sul deep tech.
// Spiegazioni scritte per questa board: non riprendono il testo del libro. Le norme sono verificate al 17 ottobre 2026.
// Qui la struttura: chiave (resta negli indirizzi e nei campi), capitolo, fasi dell'idea e segni. Le parole sono nei
// moduli dei testi (i18n/<lingua>/concepts.js); restano qui solo i nomi che inglese e italiano scrivono uguali.
import { locale, tx } from './i18n/index.js';

// Gli stati dell'idea, come sono salvati.
const [NEW, EXPLORING, VALIDATING, CHOSEN, PARKED, DISCARDED] = ['nuova', 'esplorazione', 'validazione', 'scelta', 'parcheggiata', 'scartata']; // i18n-ignore: stored values

const SHARED_CHAPTERS = { 4: 'Lean Startup', 11: 'Deep tech' };

export const CHAPTERS = Array.from({ length: 11 }, (_, i) => [i + 1, SHARED_CHAPTERS[i + 1] || tx.concepts.chapters[i + 1]]);

export const VERIFIED_ON = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(2026, 9, 17));

const c = (key, chapter, phases, extra = {}) => ({ key, chapter, phases, ...extra, ...tx.concepts.entries[key] });

export const CONCEPTS = [
  // 1. Le basi
  c('startup', 1, [NEW], { term: 'Startup' }),
  c('scalabilita', 1, [NEW]),
  c('dieci-volte', 1, [NEW, EXPLORING]),
  c('ciclo-di-vita', 1, [NEW, CHOSEN]), // i18n-ignore: the key, not a text
  c('lifestyle-business', 1, [NEW]),
  c('incubatore-acceleratore', 1, [EXPLORING, VALIDATING]),
  c('ecosistema', 1, [], { minor: true }),

  // 2. Prima di partire
  c('quattro-risorse', 2, [NEW]),
  c('perche-falliscono', 2, [NEW, EXPLORING], { verified: true }),
  c('scaling-prematuro', 2, [VALIDATING, CHOSEN]),
  c('innamorarsi-idea', 2, [EXPLORING, VALIDATING]),
  c('quando-costituire', 2, [CHOSEN]), // i18n-ignore: the key, not a text
  c('errori-tipici', 2, [], { minor: true }),
  c('sindrome-impostore', 2, [], { minor: true }),

  // 3. Validazione
  c('validazione', 3, [EXPLORING, VALIDATING]), // i18n-ignore: the key, not a text
  c('customer-development', 3, [EXPLORING, VALIDATING, CHOSEN], { term: 'Customer Development' }),
  c('fuori-dall-ufficio', 3, [EXPLORING]),
  c('cliente-utente', 3, [NEW, EXPLORING]), // i18n-ignore: the key, not a text
  c('early-adopter', 3, [EXPLORING, VALIDATING], { term: 'Early adopter' }),
  c('intervista-validazione', 3, [EXPLORING]), // i18n-ignore: the key, not a text
  c('mom-test', 3, [EXPLORING]),
  c('questionario', 3, [EXPLORING]), // i18n-ignore: the key, not a text
  c('javelin', 3, [EXPLORING, VALIDATING]),
  c('assunzione-rischiosa', 3, [EXPLORING, VALIDATING]),
  c('criterio-successo', 3, [EXPLORING, VALIDATING]),
  c('agile', 3, [], { minor: true }),

  // 4. Lean Startup
  c('lean-startup', 4, [EXPLORING, VALIDATING], { term: 'Lean Startup' }),
  c('problem-solution-fit', 4, [EXPLORING], { term: 'Problem-solution fit' }),
  c('product-user-fit', 4, [VALIDATING], { term: 'Product-user fit' }),
  c('product-market-fit', 4, [VALIDATING, CHOSEN], { term: 'Product-market fit' }),
  c('uvp', 4, [NEW, EXPLORING]),
  c('smoke-test', 4, [VALIDATING], { term: 'Smoke test' }),
  c('landing-page', 4, [VALIDATING], { term: 'Landing page' }),
  c('mvp', 4, [VALIDATING], { term: 'Minimum Viable Product' }),
  c('tipi-mvp', 4, [VALIDATING]),
  c('business-model', 4, [EXPLORING, CHOSEN]),
  c('bmc', 4, [CHOSEN], { term: 'Business Model Canvas' }),
  c('lean-canvas', 4, [NEW, EXPLORING, VALIDATING], { term: 'Lean Canvas' }),
  c('vantaggio-sleale', 4, [EXPLORING, VALIDATING]),
  c('vpc', 4, [EXPLORING, VALIDATING], { term: 'Value Proposition Canvas' }),
  c('modelli-ricavo', 4, [EXPLORING, CHOSEN]),

  // 5. Mercato e concorrenti
  c('tam-sam-som', 5, [EXPLORING, VALIDATING]),
  c('stima-dal-basso', 5, [EXPLORING, VALIDATING]), // i18n-ignore: the key, not a text
  c('buyer-persona', 5, [EXPLORING]), // i18n-ignore: the key, not a text
  c('concorrenti', 5, [EXPLORING, VALIDATING]),
  c('benchmarking', 5, [EXPLORING, VALIDATING]),

  // 6. Team
  c('cofounder', 6, [CHOSEN]),
  c('mentor', 6, [EXPLORING, VALIDATING], { term: 'Mentor' }),
  c('team-canvas', 6, [CHOSEN], { term: 'Team Canvas' }),

  // 7. Finanziamenti e pitch
  c('capitale-debito-rischio', 7, [CHOSEN]),
  c('bootstrapping', 7, [NEW, EXPLORING], { term: 'Bootstrapping' }),
  c('tre-f', 7, [EXPLORING], { term: 'Friends, family and fools' }),
  c('business-angel', 7, [VALIDATING, CHOSEN], { term: 'Business angel' }),
  c('tre-t', 7, [VALIDATING, CHOSEN]),
  c('venture-capital', 7, [CHOSEN], { term: 'Venture capital' }),
  c('crowdfunding', 7, [VALIDATING, CHOSEN], { term: 'Crowdfunding', verified: true }),
  c('bandi', 7, [VALIDATING, CHOSEN]),
  c('pitch', 7, [CHOSEN], { term: 'Pitch' }),
  c('traction', 7, [VALIDATING, CHOSEN], { term: 'Traction' }),
  c('go-to-market', 7, [VALIDATING, CHOSEN], { term: 'Go to market' }),

  // 8. Marketing e vendite
  c('mission-vision', 8, [CHOSEN]),
  c('brand-identity', 8, [], { minor: true }),
  c('personal-branding', 8, [], { minor: true }),
  c('customer-journey', 8, [VALIDATING, CHOSEN], { term: 'Customer journey' }),
  c('aarrr', 8, [VALIDATING, CHOSEN]),
  c('growth-hacking', 8, [VALIDATING, CHOSEN], { term: 'Growth hacking' }),
  c('canali-acquisizione', 8, [VALIDATING]),
  c('lancio', 8, [VALIDATING, CHOSEN]),
  c('pivot', 8, [VALIDATING, PARKED, DISCARDED], { term: 'Pivot' }),
  c('unit-economics', 8, [VALIDATING, CHOSEN], { term: 'Unit economics' }),

  // 9. Aspetti economici e finanziari
  c('business-plan', 9, [CHOSEN], { term: 'Business plan' }),
  c('financial-plan', 9, [CHOSEN]),
  c('cash-flow', 9, [VALIDATING, CHOSEN]),
  c('term-sheet', 9, [CHOSEN], { term: 'Term sheet' }),
  c('clausole-investimento', 9, [CHOSEN]),
  c('vesting', 9, [CHOSEN], { term: 'Vesting' }),
  c('pre-post-money', 9, [CHOSEN]),
  c('metodi-valutazione', 9, [CHOSEN]), // i18n-ignore: the key, not a text
  c('work-for-equity', 9, [CHOSEN]),
  c('stipendio-fondatore', 9, [], { minor: true }),

  // 10. Aspetti legali
  c('costituzione', 10, [CHOSEN], { verified: true }),
  c('startup-innovativa', 10, [CHOSEN], { verified: true }),
  c('incentivi-investitori', 10, [CHOSEN], { verified: true }),
  c('brevetto', 10, [VALIDATING, CHOSEN], { verified: true }),
  c('novita-assoluta', 10, [EXPLORING, VALIDATING]),
  c('alternative-brevetto', 10, [VALIDATING, CHOSEN]),
  c('demmler', 10, [CHOSEN]),

  // 11. Deep tech
  c('deep-tech', 11, [NEW, EXPLORING]),
  c('trl', 11, [EXPLORING, VALIDATING, CHOSEN]),
  c('due-rischi', 11, [EXPLORING, VALIDATING]),
  c('design-partner', 11, [VALIDATING], { term: 'Design partner' }),
  c('spin-off', 11, [CHOSEN], { verified: true }),
  c('invenzioni-universitarie', 11, [EXPLORING, CHOSEN], { verified: true }),
  c('finanza-non-diluitiva', 11, [VALIDATING, CHOSEN], { verified: true }), // i18n-ignore: the key, not a text
  c('ai-act', 11, [EXPLORING, VALIDATING], { verified: true }),
  c('primi-90-giorni', 11, [CHOSEN]), // i18n-ignore: the key, not a text
];

const BY_KEY = new Map(CONCEPTS.map((concept) => [concept.key, concept]));

export const conceptByKey = (key) => BY_KEY.get(key) || null;
