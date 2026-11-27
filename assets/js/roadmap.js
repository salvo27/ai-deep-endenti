// Roadmap di ogni idea: tutti i passi in ordine, dalla squadra alla società, per non saltare nulla e ridurre il rischio.
// Segue il percorso del manuale (Customer Development, Lean Startup, team, finanza, aspetti legali, deep tech).
// Un passo è fatto solo quando lo segna qualcuno (data.roadmap); i controlli sui dati della board sono solo suggerimenti.
// Qui stanno le chiavi, i collegamenti e i controlli; i testi (titolo, cosa fare, come, quando è fatto, errore da evitare)
// sono in tx.roadmap sotto le stesse chiavi. Le chiavi sono salvate nelle idee e negli indirizzi: non si traducono.

import { tx } from './i18n/index.js';
import { STRONG_COMMITMENTS, isHeldConversation, parseRoadmapMark } from './schema.js';

const T = tx.roadmap;

// Contano solo i colloqui avvenuti con persone: una ricerca online non è un'intervista.
const conversations = (ctx) => ctx.interviews.filter(isHeldConversation);
const DONE_INTERVIEWS = new Set(['fatta', 'analizzata']); // i18n-ignore: stati salvati
const doneInterviews = (ctx) => conversations(ctx).filter((i) => DONE_INTERVIEWS.has(i.status)).length;
const analyzedInterviews = (ctx) => conversations(ctx).filter((i) => i.status === 'analizzata').length;
const strongCommitments = (ctx) => conversations(ctx).filter((i) => STRONG_COMMITMENTS.has(i.data.commitment)).length;
const maxValidated = (ctx) => Math.max(0, ...ctx.canvases.map((c) => Object.keys(c.data.validated || {}).length));
const maxRivals = (ctx) => Math.max(0, ...ctx.competitors.map((c) => c.data.rivals?.length || 0));
const deep = (ctx) => ctx.deeptechs[0] || null;
const count = (value, target) => T.progress.count(Math.min(value, target), target);

// Indirizzi del router e schede dell'idea: uguali in ogni lingua.
const PAGES = { team: '#/squadra', equity: '#/squadra/quote', generator: '#/generatore', scoring: '#/valutazione' }; // i18n-ignore: indirizzi
const TABS = { comments: 'commenti', votes: 'voti', interviews: 'interviste', experiments: 'esperimenti', customers: 'clienti', market: 'mercato' }; // i18n-ignore: indirizzi
const page = (name) => () => PAGES[name];
const editIdea = (ctx) => `#/modifica/${ctx.idea.id}`; // i18n-ignore: indirizzo
const tab = (name) => (ctx) => `#/idea/${ctx.idea.id}/${name}`;
const newItem = (kind) => (ctx) => `#/nuovo/${kind}?idea=${ctx.idea.id}`; // i18n-ignore: indirizzo
const tabOrNew = (name, kind, list) => (ctx) => (ctx[list].length ? tab(name)(ctx) : newItem(kind)(ctx));

// Le fasi in ordine, ognuna con i suoi passi in ordine: chiave → concetto del manuale, collegamento, controlli sui dati.
const PHASES = {
  squadra: {
    steps: {
      'team-canvas': { concept: 'team-canvas', href: page('team') },
      'ruoli-tempo': { concept: 'cofounder', href: page('team') }, // i18n-ignore: chiave salvata
      regole: { concept: 'team-canvas', href: page('team') },
      vincoli: { concept: 'invenzioni-universitarie' },
      mentor: { concept: 'mentor', href: newItem('contact') },
      quote: { concept: 'demmler', href: page('equity') },
    },
  },
  scelta: {
    steps: {
      'dieci-idee': { concept: 'innamorarsi-idea', href: page('generator'), auto: (ctx) => ctx.ideasCount >= 10, progress: (ctx) => count(ctx.ideasCount, 10) }, // i18n-ignore: chiave salvata
      'startup-davvero': { concept: 'scalabilita', href: tab(TABS.comments) },
      criteri: { concept: 'errori-tipici', href: page('scoring'), auto: (ctx) => ctx.hasCriteria },
      voti: { href: tab(TABS.votes), auto: (ctx) => ctx.fullVoters >= 2, progress: (ctx) => T.progress.fullVoters(ctx.fullVoters) },
      scelta: { concept: 'quattro-risorse', href: newItem('decision'), auto: (ctx) => ctx.idea.status !== 'nuova' }, // i18n-ignore: stato salvato
    },
  },
  ipotesi: {
    steps: {
      frase: { concept: 'uvp', href: editIdea, auto: (ctx) => Boolean(ctx.idea.data.pitch && ctx.idea.data.problem && ctx.idea.data.customer) },
      'lean-canvas': {
        concept: 'lean-canvas',
        href: tabOrNew('canvas', 'canvas', 'canvases'),
        auto: (ctx) => ctx.canvases.some((c) => ['problem', 'segments', 'uvp', 'solution'].every((k) => c.data[k])),
      },
      assunzione: { concept: 'assunzione-rischiosa', href: newItem('experiment'), auto: (ctx) => ctx.experiments.some((e) => e.data.assumption) },
      persone: {
        concept: 'fuori-dall-ufficio',
        href: tabOrNew(TABS.interviews, 'contact', 'contacts'),
        auto: (ctx) => ctx.contacts.length >= 5,
        progress: (ctx) => count(ctx.contacts.length, 5),
      },
      ostacoli: { concept: 'ai-act', href: editIdea },
      deeptech: { concept: 'deep-tech', optional: true, href: tabOrNew('deeptech', 'deeptech', 'deeptechs'), auto: (ctx) => ctx.deeptechs.length > 0 },
    },
  },
  clienti: {
    steps: {
      'traccia-interviste': { concept: 'mom-test' }, // i18n-ignore: chiave salvata
      'esperimento-problema': { // i18n-ignore: chiave salvata
        concept: 'criterio-successo',
        href: newItem('experiment'),
        auto: (ctx) => ctx.experiments.some((e) => ['problema', 'cliente'].includes(e.data.assumption_type) && e.data.success_criterion),
      },
      interviste: {
        concept: 'intervista-validazione', // i18n-ignore: chiave del concetto
        href: tab(TABS.interviews),
        auto: (ctx) => doneInterviews(ctx) >= 20,
        progress: (ctx) => count(doneInterviews(ctx), 20),
      },
      sintesi: {
        concept: 'early-adopter',
        href: tab(TABS.interviews),
        auto: (ctx) => analyzedInterviews(ctx) >= 10,
        progress: (ctx) => count(analyzedInterviews(ctx), 10),
      },
      persona: { concept: 'buyer-persona', href: tabOrNew(TABS.customers, 'persona', 'personas'), auto: (ctx) => ctx.personas.length > 0 }, // i18n-ignore: tipo di scheda salvato
      'problema-validato': { concept: 'problem-solution-fit', href: tab('canvas'), auto: (ctx) => ctx.canvases.some((c) => c.data.validated?.problem) },
    },
  },
  mercato: {
    steps: {
      'tam-sam-som': {
        concept: 'stima-dal-basso', // i18n-ignore: chiave del concetto
        href: tabOrNew(TABS.market, 'market', 'markets'),
        auto: (ctx) => ctx.markets.some((m) => m.data.tam && m.data.sam && m.data.som),
      },
      concorrenti: {
        concept: 'concorrenti',
        href: tabOrNew(TABS.market, 'competitors', 'competitors'),
        auto: (ctx) => maxRivals(ctx) >= 3,
        progress: (ctx) => count(maxRivals(ctx), 3),
      },
      vantaggio: { concept: 'vantaggio-sleale', href: tab('canvas'), auto: (ctx) => ctx.canvases.some((c) => c.data.advantage) },
      ricavi: { concept: 'modelli-ricavo', href: tab('canvas'), auto: (ctx) => ctx.canvases.some((c) => c.data.revenue) },
    },
  },
  soluzione: {
    steps: {
      vpc: { concept: 'vpc', href: tabOrNew(TABS.customers, 'vpc', 'vpcs'), auto: (ctx) => ctx.vpcs.length > 0 },
      'smoke-test': { concept: 'smoke-test', href: newItem('experiment'), auto: (ctx) => ctx.experiments.some((e) => e.data.method === 'landing') },
      mvp: { concept: 'tipi-mvp' },
      'prezzo-canale': {
        concept: 'canali-acquisizione',
        href: newItem('experiment'),
        auto: (ctx) => ctx.experiments.some((e) => ['prezzo', 'canale'].includes(e.data.assumption_type) && e.status === 'concluso'),
      },
      impegni: {
        concept: 'design-partner',
        href: tab(TABS.interviews),
        auto: (ctx) => strongCommitments(ctx) >= 3,
        progress: (ctx) => count(strongCommitments(ctx), 3),
      },
      'canvas-validato': {
        concept: 'product-market-fit',
        href: tab('canvas'),
        auto: (ctx) => maxValidated(ctx) >= 3,
        progress: (ctx) => count(maxValidated(ctx), 3),
      },
      'tappa-tecnica': {
        concept: 'trl',
        optional: true,
        href: tabOrNew('deeptech', 'deeptech', 'deeptechs'),
        auto: (ctx) => Boolean(deep(ctx)?.data.trl_target && deep(ctx)?.data.design_partners),
      },
    },
  },
  decisione: {
    steps: {
      decisione: { concept: 'pivot', href: newItem('decision'), auto: (ctx) => ctx.decisions.some((d) => d.status !== 'proposta' && d.data.rationale) },
      stato: { concept: 'scaling-prematuro', auto: (ctx) => ['scelta', 'parcheggiata', 'scartata'].includes(ctx.idea.status) },
      lezioni: { concept: 'validazione', href: tab(TABS.experiments), auto: (ctx) => ctx.experiments.some((e) => e.data.learnings) },
    },
  },
  azienda: {
    onlyChosen: true,
    steps: {
      'patto-soci': { concept: 'vesting', href: page('equity') },
      proprieta: { concept: 'brevetto' },
      'piano-finanziario': { concept: 'financial-plan' },
      'go-to-market': { concept: 'go-to-market' },
      'finanza-non-diluitiva': { concept: 'finanza-non-diluitiva' }, // i18n-ignore: chiave salvata
      costituzione: { concept: 'startup-innovativa' },
      pitch: { concept: 'pitch' },
      investitori: { concept: 'business-angel' },
    },
  },
};

// Ogni fase e ogni passo con i testi della lingua in uso: title, goal, note, gate, skipRisk per le fasi;
// title, what, how, done, mistake per i passi.
export const ROADMAP = Object.entries(PHASES).map(([key, { steps, ...phase }]) => ({
  key,
  ...T.phases[key],
  ...phase,
  steps: Object.entries(steps).map(([stepKey, step]) => ({ key: stepKey, ...T.steps[stepKey], ...step })),
}));

export const ROADMAP_STEPS = ROADMAP.flatMap((phase) => phase.steps.map((step) => ({ ...step, phase: phase.key })));
export const stepByKey = (key) => ROADMAP_STEPS.find((s) => s.key === key) || null;

// Negli esempi i passi manuali delle fasi già superate si considerano fatti, per mostrare come appare una roadmap avanzata.
const EXAMPLE_REACHED = { nuova: 'ipotesi', esplorazione: 'clienti', validazione: 'soluzione', scelta: 'azienda', parcheggiata: 'decisione', scartata: 'decisione' }; // i18n-ignore: chiavi salvate

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
  const reached = full.example ? phaseIndex(EXAMPLE_REACHED[idea.status] || ROADMAP[0].key) : -1;
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
