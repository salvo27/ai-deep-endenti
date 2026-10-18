import { h, mount } from '../lib/dom.js';
import { BOARD_KINDS, KINDS } from '../schema.js';
import { canWrite, getItem, on, state, trackPresence } from '../store.js';
import { canvasView } from './canvas.js';
import { commentsPanel } from './comments.js';
import { aiButton } from './ai-panel.js';
import { archiveWithConfirm, changeStatus } from './actions.js';
import { ideaContext } from './idea.js';
import { button, errorBox, fieldsGrid, itemLink, metaLine, onlineHere, pageHeader, statusPill, tabs } from './components.js';

const TABS = [
  ['dettagli', 'Dettagli'],
  ['commenti', 'Commenti'],
];

const LIST_ROUTES = { experiment: '/esperimenti', interview: '/interviste', decision: '/decisioni' };

export function itemView(outlet, params) {
  const tab = TABS.some(([key]) => key === params.tab) ? params.tab : 'dettagli';
  let commentsEl = null;
  const hereHost = h('span', { class: 'here-host' });
  const renderHere = () => hereHost.replaceChildren(onlineHere(`/elemento/${params.id}`) || '');

  const render = () => {
    const item = getItem(params.id);
    if (!item || !BOARD_KINDS.includes(item.kind) || item.kind === 'idea') {
      mount(outlet, errorBox({ message: 'Elemento non trovato.' }));
      return;
    }
    const def = KINDS[item.kind];
    const idea = item.idea_id ? getItem(item.idea_id) : null;
    const writable = canWrite() && !item.deleted_at;
    const back = idea ? { href: `#/idea/${idea.id}`, label: idea.title } : { href: `#${LIST_ROUTES[item.kind] || '/'}`, label: def.plural };
    const statusControl = def.statuses
      ? writable
        ? h(
            'select',
            { class: 'input input-small', 'aria-label': 'Stato', onChange: (e) => changeStatus(getItem(item.id), e.target.value) },
            def.statuses.map(([v, label]) => h('option', { value: v, selected: v === item.status }, label)),
          )
        : statusPill(item.kind, item.status)
      : null;
    const critique = ['canvas', 'experiment'].includes(item.kind) && idea
      ? aiButton('critique', () => ({ ...ideaContext(idea.id), item }), { item, label: 'Critica' })
      : null;

    commentsEl?.cleanup?.();
    commentsEl = null;
    const body = tab === 'commenti'
      ? (commentsEl = commentsPanel(item))
      : h('div', null, item.kind === 'canvas' ? canvasView(item) : fieldsGrid(item));

    mount(
      outlet,
      item.deleted_at ? h('div', { class: 'banner banner-warn' }, 'Questo elemento è nel cestino. ', h('a', { href: '#/cestino' }, 'Vai al cestino')) : null,
      pageHeader({
        back,
        eyebrow: h('span', { class: 'kind-eyebrow' }, def.label, idea ? [' di ', itemLink(idea)] : null),
        title: item.title,
        subtitle: h('span', { class: 'row' }, statusControl, metaLine(item), hereHost),
        actions: [
          critique,
          writable ? button('Modifica', { iconName: 'edit', href: `#/modifica/${item.id}` }) : null,
          button('Versioni', { iconName: 'history', href: `#/storico/${item.id}` }),
          writable ? button('', { iconName: 'trash', title: 'Archivia', onClick: () => archiveWithConfirm(item, { backTo: idea ? `/idea/${idea.id}` : LIST_ROUTES[item.kind] || '/' }) }) : null,
        ],
      }),
      tabs(TABS.map(([key, label]) => [key, label, key === 'commenti' ? state.commentCounts.get(item.id) : 0]), tab, (key) => `#/elemento/${item.id}/${key}`),
      h('div', { class: 'tab-body' }, body),
    );
  };

  render();
  renderHere();
  trackPresence({ route: `/elemento/${params.id}` });
  const offs = [
    on('item', ({ item }) => {
      if (item.id === params.id && tab !== 'commenti') render();
    }),
    on('presence', renderHere),
  ];
  return () => {
    commentsEl?.cleanup?.();
    offs.forEach((off) => off());
  };
}
