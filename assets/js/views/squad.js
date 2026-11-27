import { h, mount } from '../lib/dom.js';
import { KINDS, TEAM_BLOCKS } from '../schema.js';
import { canWrite, on, singleton } from '../store.js';
import { tx } from '../i18n/index.js';
import { conceptButton } from './concept-help.js';
import { availabilityView } from './availability.js';
import { timesheetView } from './timesheet.js';
import { equityView } from './equity.js';
import { button, emptyState, metaLine, pageHeader, tabs, textBlock } from './components.js';

const t = tx.squad;

// La chiave della scheda è l'indirizzo e non cambia con la lingua. «Team Canvas» è il nome dello strumento.
const TABS = [
  ['canvas', 'Team Canvas', 'teamcanvas'],
  ['quote', t.tabs.equity, 'equity'],
  ['disponibilita', t.tabs.availability, 'availability'],
  ['ore', t.tabs.timesheet, 'timesheet'],
];

// Gli indirizzi restano uguali in ogni lingua.
const tabHref = (key) => `#/squadra/${key}`; // i18n-ignore
const newHref = (kind) => `#/nuovo/${kind}`; // i18n-ignore
const editHref = (id) => `#/modifica/${id}`; // i18n-ignore
const historyHref = (id) => `#/storico/${id}`; // i18n-ignore

function squadChrome(tab, actions) {
  return [
    pageHeader({ title: t.title, subtitle: t.subtitle, actions }),
    tabs(TABS.map(([key, text]) => [key, text]), tab, tabHref),
  ];
}

export function teamCanvasView(item) {
  return h(
    'div',
    { class: 'team-canvas' },
    TEAM_BLOCKS.map((block) =>
      h(
        'section',
        { class: ['tc-block', `tc-${block.key}`] },
        h('h3', null, block.label),
        item.data[block.key] ? textBlock(item.data[block.key]) : h('p', { class: 'muted small' }, block.help),
      ),
    ),
  );
}

export function squadView(outlet, params, query) {
  const tab = TABS.some(([key]) => key === params.tab) ? params.tab : 'canvas';
  if (tab === 'disponibilita') return availabilityView(outlet, query, (actions) => squadChrome(tab, actions));
  if (tab === 'ore') return timesheetView(outlet, query, (actions) => squadChrome(tab, actions));
  const [, , kind] = TABS.find(([key]) => key === tab);
  const texts = kind === 'teamcanvas' ? t.canvas : t.equity;
  const writable = canWrite();

  const render = () => {
    const item = singleton(kind);
    const intro = h('p', { class: 'muted' }, texts.intro, ' ', conceptButton(kind === 'teamcanvas' ? 'team-canvas' : 'demmler'));
    const body = item
      ? h(
          'div',
          { class: 'stack' },
          kind === 'teamcanvas' ? teamCanvasView(item) : equityView(item),
          metaLine(item),
        )
      : emptyState(texts.empty, writable ? button(texts.create, { kind: 'primary', iconName: KINDS[kind].icon, href: newHref(kind) }) : null);
    const actions = item
      ? [
          writable ? button(tx.common.actions.edit, { iconName: 'edit', href: editHref(item.id) }) : null,
          button(t.versions, { iconName: 'history', href: historyHref(item.id) }),
        ]
      : [];
    mount(outlet, ...squadChrome(tab, actions), h('div', { class: 'tab-body stack' }, intro, body));
  };

  render();
  return on('item', ({ item }) => {
    if (item.kind === kind) render();
  });
}
