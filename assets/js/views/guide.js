import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { PHASES } from '../guide.js';
import { exampleIdeas, ideas } from '../store.js';
import { button, itemLink, pageHeader, statusPill } from './components.js';
import { conceptLink } from './concept-help.js';

const TOOLS = [
  ['Idea', 'La scheda di partenza: frase, problema, cliente, soluzione.', 'idea'],
  ['Lean Canvas', 'Le ipotesi del modello di business, blocco per blocco.', 'canvas'],
  ['Clienti', 'Buyer persona e Value Proposition Canvas.', 'user'],
  ['Mercato', 'TAM, SAM, SOM e analisi dei concorrenti.', 'market'],
  ['Deep tech', 'TRL, proprietà intellettuale, ateneo, norme e bandi.', 'chip'],
  ['Esperimenti', 'Javelin Board: un\'assunzione per esperimento, criterio deciso prima.', 'experiment'],
  ['Interviste', 'Fatti, citazioni e impegni presi.', 'interview'],
  ['Decisioni', 'Cosa si è deciso, con alternative e motivi.', 'decision'],
  ['Squadra', 'Team Canvas e divisione delle quote.', 'heart'],
];

export function guideView(outlet, params, query) {
  const focus = query.get('fase');
  const samples = exampleIdeas();
  const mine = ideas();
  mount(
    outlet,
    pageHeader({
      title: 'Guida',
      subtitle: 'Cosa fare con un\'idea in ogni fase, seguendo il percorso del manuale: prima il cliente e il problema, poi la soluzione, poi l\'azienda. Nella panoramica di ogni idea il riquadro «Prossimo passo» mostra cosa manca.',
      actions: [button('Concetti', { iconName: 'book', href: '#/concetti' })],
    }),
    h(
      'section',
      { class: 'card stack' },
      h('h2', null, 'Gli strumenti della board'),
      h('div', { class: 'tool-grid' }, TOOLS.map(([name, text, iconName]) => h('div', { class: 'tool' }, icon(iconName, 18), h('div', null, h('strong', null, name), h('p', { class: 'muted small' }, text))))),
    ),
    PHASES.map((phase, index) => {
      const sample = samples.find((s) => s.status === phase.status);
      const inPhase = mine.filter((i) => i.status === phase.status);
      return h(
        'section',
        { class: ['card', 'phase', phase.status === focus && 'is-focus'], id: `fase-${phase.status}` },
        h('div', { class: 'phase-head' }, h('span', { class: 'phase-n' }, String(index + 1)), statusPill('idea', phase.status), h('h2', null, phase.goal)),
        h('h3', null, 'Cosa fare'),
        h(
          'ol',
          { class: 'phase-steps' },
          phase.steps.map(([text, concept]) => h('li', null, text, concept ? h('span', { class: 'muted small' }, ' · ', conceptLink(concept)) : null)),
        ),
        h('p', { class: 'phase-exit' }, icon('flag', 14), h('span', null, phase.exit)),
        h('h3', null, 'Concetti utili'),
        h('div', { class: 'chips' }, phase.concepts.map((key) => conceptLink(key))),
        h(
          'div',
          { class: 'row phase-links' },
          sample ? h('a', { class: 'btn btn-example btn-small', href: `#/idea/${sample.id}` }, icon('idea', 14), h('span', null, `Esempio: ${sample.title.split(':')[0]}`)) : null,
          inPhase.length ? h('span', { class: 'muted small' }, 'Vostre idee in questa fase: ', inPhase.map((i, n) => [n ? ', ' : '', itemLink(i)])) : null,
        ),
      );
    }),
  );
  if (focus) document.getElementById(`fase-${focus}`)?.scrollIntoView?.({ block: 'start' });
  return null;
}
