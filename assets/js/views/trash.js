import { h, mount, busy } from '../lib/dom.js';
import { canWrite, deletedItems, getItem, memberName, on } from '../store.js';
import { tx } from '../i18n/index.js';
import { restoreWithToast } from './actions.js';
import { button, emptyState, kindBadge, pageHeader, timeAgo } from './components.js';

const t = tx.trash;

export function trashView(outlet) {
  const render = () => {
    const items = deletedItems().sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
    mount(
      outlet,
      pageHeader({ title: t.title, subtitle: t.subtitle }),
      items.length
        ? h(
            'table',
            { class: 'table' },
            h('thead', null, h('tr', null, t.columns.map((label) => h('th', null, label)))),
            h(
              'tbody',
              null,
              items.map((item) => {
                const restore = canWrite() ? button(tx.common.actions.restore, { iconName: 'restore' }) : null;
                restore?.addEventListener('click', busy(restore, () => restoreWithToast(getItem(item.id))));
                return h(
                  'tr',
                  null,
                  h('td', null, item.title, item.idea_id && getItem(item.idea_id)?.deleted_at ? [' ', h('span', { class: 'muted small' }, t.ideaToo)] : null),
                  h('td', null, kindBadge(item.kind)),
                  h('td', null, memberName(item.updated_by)),
                  h('td', null, timeAgo(item.deleted_at)),
                  h('td', { class: 'row-actions' }, button(t.versions, { iconName: 'history', href: `#/storico/${item.id}` }), restore), // i18n-ignore: the address of the page
                );
              }),
            ),
          )
        : emptyState(t.empty),
    );
  };
  render();
  return on('item', render);
}
