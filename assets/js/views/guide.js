import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { ROADMAP, ROADMAP_STEPS } from '../roadmap.js';
import { exampleIdeas, ideas } from '../store.js';
import { tx } from '../i18n/index.js';
import { emptyState, itemLink, pageHeader, statusPill, tabs } from './components.js';
import { CONCEPTS_INTRO, conceptsPanel } from './concepts.js';
import { ideaRoadmap, phaseSection } from './roadmap.js';

const t = tx.guide;

// Due schede: la roadmap con il metodo su /guida, i concetti su /guida/concetti (anche /concetti porta lì).
const TABS = [
  ['roadmap', t.tabs.roadmap],
  ['concetti', t.tabs.concepts],
];

// [testo, icona, nome che inglese e italiano scrivono uguali]
const TOOLS = [
  ['idea', 'idea'],
  ['roadmap', 'compass'],
  ['canvas', 'canvas', 'Lean Canvas'],
  ['customers', 'user'],
  ['market', 'market'],
  ['deepTech', 'chip', 'Deep tech'],
  ['experiments', 'experiment'],
  ['interviews', 'interview'],
  ['decisions', 'decision'],
  ['team', 'heart'],
];

function progressTable() {
  const mine = ideas();
  if (!mine.length) return emptyState(t.progress.empty);
  return h(
    'div',
    { class: 'table-scroll' },
    h(
      'table',
      { class: 'table rm-table' },
      h('thead', null, h('tr', null, t.progress.columns.map((label) => h('th', { scope: 'col' }, label)))),
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
            h('td', null, rm.current ? rm.current.phase.title : t.progress.complete),
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
    h('section', { class: 'card stack' }, h('h2', null, t.progress.title), progressTable()),
    h(
      'section',
      { class: 'card stack' },
      h('h2', null, t.howTo.title),
      h(
        'ul',
        { class: 'rm-howto' },
        h('li', null, t.howTo.order(ROADMAP.length, ROADMAP_STEPS.length)),
        t.howTo.points.map((point) => h('li', null, point)),
      ),
      sample ? h('p', null, h('a', { class: 'btn btn-example btn-small', href: `#/idea/${sample.id}/roadmap` }, icon('idea', 14), h('span', null, t.howTo.example(sample.title.split(':')[0])))) : null,
    ),
    ROADMAP.map((phase, index) => phaseSection({ phase, index, steps: phase.steps.map((step) => ({ step, status: 'todo' })) }, { reference: true })),
    h(
      'section',
      { class: 'card stack' },
      h('h2', null, t.toolsTitle),
      h(
        'div',
        { class: 'tool-grid' },
        TOOLS.map(([key, iconName, sharedName]) =>
          h('div', { class: 'tool' }, icon(iconName, 18), h('div', null, h('strong', null, sharedName || t.tools[key].name), h('p', { class: 'muted small' }, t.tools[key].text))),
        ),
      ),
    ),
  ];
}

export function guideView(outlet, params, query) {
  const tab = TABS.some(([key]) => key === params.tab) ? params.tab : 'roadmap';
  const concepts = tab === 'concetti';
  mount(
    outlet,
    pageHeader({ title: t.title, subtitle: concepts ? CONCEPTS_INTRO : t.subtitle }),
    tabs(TABS, tab, (key) => (key === 'roadmap' ? '#/guida' : `#/guida/${key}`)), // i18n-ignore: addresses
    h('div', { class: 'tab-body stack' }, concepts ? conceptsPanel(query.get('c')) : roadmapGuide()),
  );
  const focus = concepts ? query.get('c') : query.get('fase'); // i18n-ignore: the address parameter
  if (focus) document.getElementById(`${concepts ? 'concetto' : 'fase'}-${focus}`)?.scrollIntoView?.({ block: concepts ? 'center' : 'start' }); // i18n-ignore: element ids
  return null;
}
