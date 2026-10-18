import { h, mount } from '../lib/dom.js';
import { KINDS, TEAM_BLOCKS } from '../schema.js';
import { canWrite, on, singleton } from '../store.js';
import { conceptButton } from './concept-help.js';
import { equityView } from './equity.js';
import { button, emptyState, metaLine, pageHeader, tabs, textBlock } from './components.js';

const TABS = [
  ['canvas', 'Team Canvas', 'teamcanvas'],
  ['quote', 'Divisione delle quote', 'equity'],
];

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

export function squadView(outlet, params) {
  const tab = TABS.some(([key]) => key === params.tab) ? params.tab : 'canvas';
  const [, , kind] = TABS.find(([key]) => key === tab);
  const writable = canWrite();

  const render = () => {
    const item = singleton(kind);
    const intro =
      kind === 'teamcanvas'
        ? h('p', { class: 'muted' }, 'Da compilare insieme, in una sessione di un\'ora: ruoli, obiettivi, valori e regole messi per iscritto prima che servano. ', conceptButton('team-canvas'))
        : h('p', { class: 'muted' }, 'Una proposta di divisione delle quote tra fondatori, da discutere apertamente prima di costituire la società. ', conceptButton('demmler'));
    const body = item
      ? h(
          'div',
          { class: 'stack' },
          kind === 'teamcanvas' ? teamCanvasView(item) : equityView(item),
          metaLine(item),
        )
      : emptyState(
          kind === 'teamcanvas' ? 'Il Team Canvas non è ancora stato compilato.' : 'Le quote non sono ancora state discusse.',
          writable ? button(kind === 'teamcanvas' ? 'Compila il Team Canvas' : 'Prepara la divisione delle quote', { kind: 'primary', iconName: KINDS[kind].icon, href: `#/nuovo/${kind}` }) : null,
        );
    mount(
      outlet,
      pageHeader({
        title: 'Squadra',
        subtitle: 'Il team che costruisce l\'azienda: chi siamo, come lavoriamo e come dividiamo le quote.',
        actions: item
          ? [
              writable ? button('Modifica', { iconName: 'edit', href: `#/modifica/${item.id}` }) : null,
              button('Versioni', { iconName: 'history', href: `#/storico/${item.id}` }),
            ]
          : [],
      }),
      tabs(TABS.map(([key, text]) => [key, text]), tab, (key) => `#/squadra/${key}`),
      h('div', { class: 'tab-body stack' }, intro, body),
    );
  };

  render();
  return on('item', ({ item }) => {
    if (item.kind === kind) render();
  });
}
