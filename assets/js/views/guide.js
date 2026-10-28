import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { ROADMAP, ROADMAP_STEPS } from '../roadmap.js';
import { exampleIdeas, ideas } from '../store.js';
import { emptyState, itemLink, pageHeader, statusPill, tabs } from './components.js';
import { CONCEPTS_INTRO, conceptsPanel } from './concepts.js';
import { ideaRoadmap, phaseSection } from './roadmap.js';

// Due schede: la roadmap con il metodo su /guida, i concetti su /guida/concetti (anche /concetti porta lì).
const TABS = [
  ['roadmap', 'Roadmap'],
  ['concetti', 'Concetti'],
];

const TOOLS = [
  ['Idea', 'La scheda di partenza: frase, problema, cliente, soluzione.', 'idea'],
  ['Roadmap', 'Tutti i passi in ordine, con quello che manca a ogni idea.', 'compass'],
  ['Lean Canvas', 'Le ipotesi del modello di business, blocco per blocco.', 'canvas'],
  ['Clienti', 'Buyer persona e Value Proposition Canvas.', 'user'],
  ['Mercato', 'TAM, SAM, SOM e analisi dei concorrenti.', 'market'],
  ['Deep tech', 'TRL, proprietà intellettuale, ateneo, norme e bandi.', 'chip'],
  ['Esperimenti', 'Javelin Board: un\'assunzione per esperimento, criterio deciso prima.', 'experiment'],
  ['Interviste', 'Fatti, citazioni e impegni presi.', 'interview'],
  ['Decisioni', 'Cosa si è deciso, con alternative e motivi.', 'decision'],
  ['Squadra', 'Team Canvas e divisione delle quote.', 'heart'],
];

function progressTable() {
  const mine = ideas();
  if (!mine.length) return emptyState('Nessuna idea ancora: la roadmap di ogni idea comparirà qui.');
  return h(
    'div',
    { class: 'table-scroll' },
    h(
      'table',
      { class: 'table rm-table' },
      h('thead', null, h('tr', null, ['Idea', 'Stato', 'Avanzamento', 'Fase', 'Prossimo passo'].map((t) => h('th', { scope: 'col' }, t)))),
      h(
        'tbody',
        null,
        mine.map((idea) => {
          const rm = ideaRoadmap(idea);
          return h(
            'tr',
            null,
            h('td', null, itemLink(idea)),
            h('td', null, statusPill('idea', idea.status)),
            h('td', null, h('div', { class: 'rm-cell-progress' }, h('div', { class: 'rm-bar' }, h('span', { style: { width: `${rm.percent}%` } })), h('span', { class: 'small' }, `${rm.percent}%`))),
            h('td', null, rm.current ? rm.current.phase.title : 'Completata'),
            h('td', null, rm.next ? h('a', { href: `#/idea/${idea.id}/roadmap` }, rm.next.step.title) : '-'),
          );
        }),
      ),
    ),
  );
}

function roadmapGuide() {
  const sample = exampleIdeas().find((e) => e.status === 'scelta');
  return [
    h('section', { class: 'card stack' }, h('h2', null, 'A che punto sono le vostre idee'), progressTable()),
    h(
      'section',
      { class: 'card stack' },
      h('h2', null, 'Come usare la roadmap'),
      h(
        'ul',
        { class: 'rm-howto' },
        h('li', null, `${ROADMAP.length} fasi e ${ROADMAP_STEPS.length} passi, nell'ordine che riduce il rischio: prima le persone e il problema, poi la soluzione, solo alla fine l'azienda.`),
        h('li', null, 'Ogni passo dice cosa fare, come farlo, quando si può considerare fatto e l\'errore più comune da evitare.'),
        h('li', null, 'Un passo è fatto solo quando lo spuntate voi: resta scritto chi e quando, e la spunta si può togliere. Se i dati del sito fanno pensare che sia fatto, per esempio 20 interviste registrate, la roadmap ve lo suggerisce.'),
        h('li', null, 'Ogni fase finisce con un cancello: cosa deve essere vero prima di andare avanti. Se una fase non è completa, quella dopo ve lo ricorda.'),
        h('li', null, 'Ogni idea ha la sua roadmap, perché squadra, clienti e tempi possono essere diversi da un\'idea all\'altra.'),
      ),
      sample ? h('p', null, h('a', { class: 'btn btn-example btn-small', href: `#/idea/${sample.id}/roadmap` }, icon('idea', 14), h('span', null, `Esempio di roadmap avanzata: ${sample.title.split(':')[0]}`))) : null,
    ),
    ROADMAP.map((phase, index) => phaseSection({ phase, index, steps: phase.steps.map((step) => ({ step, status: 'todo' })) }, { reference: true })),
    h(
      'section',
      { class: 'card stack' },
      h('h2', null, 'Gli strumenti della board'),
      h('div', { class: 'tool-grid' }, TOOLS.map(([name, text, iconName]) => h('div', { class: 'tool' }, icon(iconName, 18), h('div', null, h('strong', null, name), h('p', { class: 'muted small' }, text))))),
    ),
  ];
}

export function guideView(outlet, params, query) {
  const tab = TABS.some(([key]) => key === params.tab) ? params.tab : 'roadmap';
  const concepts = tab === 'concetti';
  mount(
    outlet,
    pageHeader({
      title: 'Guida',
      subtitle: concepts
        ? CONCEPTS_INTRO
        : 'La roadmap da seguire per ogni idea, in ordine: dalla squadra alla società. Ogni idea ne ha una copia interattiva nel tab Roadmap, dove segnate i passi fatti.',
    }),
    tabs(TABS, tab, (key) => (key === 'roadmap' ? '#/guida' : `#/guida/${key}`)),
    h('div', { class: 'tab-body stack' }, concepts ? conceptsPanel(query.get('c')) : roadmapGuide()),
  );
  const focus = concepts ? query.get('c') : query.get('fase');
  if (focus) document.getElementById(`${concepts ? 'concetto' : 'fase'}-${focus}`)?.scrollIntoView?.({ block: concepts ? 'center' : 'start' });
  return null;
}
