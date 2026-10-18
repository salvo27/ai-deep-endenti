import { h, mount, busy } from '../lib/dom.js';
import { canWrite, deletedItems, getItem, memberName, on } from '../store.js';
import { restoreWithToast } from './actions.js';
import { button, emptyState, kindBadge, pageHeader, timeAgo } from './components.js';

export function trashView(outlet) {
  const render = () => {
    const items = deletedItems().sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
    mount(
      outlet,
      pageHeader({ title: 'Cestino', subtitle: 'Niente si cancella davvero: gli elementi archiviati restano qui con tutto il loro storico.' }),
      items.length
        ? h(
            'table',
            { class: 'table' },
            h('thead', null, h('tr', null, ['Elemento', 'Tipo', 'Archiviato da', 'Quando', ''].map((t) => h('th', null, t)))),
            h(
              'tbody',
              null,
              items.map((item) => {
                const restore = canWrite() ? button('Ripristina', { iconName: 'restore' }) : null;
                restore?.addEventListener('click', busy(restore, () => restoreWithToast(getItem(item.id))));
                return h(
                  'tr',
                  null,
                  h('td', null, item.title, item.idea_id && getItem(item.idea_id)?.deleted_at ? h('span', { class: 'muted small' }, ' (anche l\'idea è nel cestino)') : null),
                  h('td', null, kindBadge(item.kind)),
                  h('td', null, memberName(item.updated_by)),
                  h('td', null, timeAgo(item.deleted_at)),
                  h('td', { class: 'row-actions' }, button('Versioni', { iconName: 'history', href: `#/storico/${item.id}` }), restore),
                );
              }),
            ),
          )
        : emptyState('Il cestino è vuoto.'),
    );
  };
  render();
  return on('item', render);
}
