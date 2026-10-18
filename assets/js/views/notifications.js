import { h, mount, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { on } from '../store.js';
import { browserAlert, isUnread, markAllRead, notifications, unreadCount } from '../notifications.js';
import { avatar, timeAgo } from './components.js';

export function notificationBell() {
  const badge = h('span', { class: 'bell-badge', hidden: true });
  const button = h(
    'button',
    { type: 'button', class: 'icon-btn bell', 'aria-label': 'Notifiche', 'aria-expanded': 'false', 'aria-haspopup': 'true' },
    icon('bell', 20),
    badge,
  );
  const panel = h('div', { class: 'bell-panel', hidden: true, role: 'dialog', 'aria-label': 'Notifiche' });
  const box = h('div', { class: 'bell-box' }, button, panel);

  const renderBadge = () => {
    const n = unreadCount();
    badge.hidden = n === 0;
    badge.textContent = n > 9 ? '9+' : String(n);
    button.setAttribute('aria-label', n ? `Notifiche, ${n} da leggere` : 'Notifiche');
  };

  const renderPanel = () => {
    const list = notifications();
    mount(
      panel,
      h('div', { class: 'bell-head' }, h('strong', null, 'Notifiche'), list.length ? h('button', { type: 'button', class: 'link-btn small', onClick: () => markAllRead() }, 'Segna come lette') : null),
      list.length
        ? h(
            'ul',
            { class: 'bell-list' },
            list.slice(0, 30).map((note) =>
              h(
                'li',
                { class: ['bell-item', isUnread(note) && 'is-unread'] },
                h(
                  'a',
                  { href: note.href, onClick: () => close() },
                  avatar(note.authorId, 26),
                  h('span', { class: 'bell-text' }, note.text, h('span', { class: 'muted small' }, ' · ', timeAgo(note.at))),
                ),
              ),
            ),
          )
        : h('p', { class: 'muted small bell-empty' }, 'Nessuna novità dagli altri nelle ultime due settimane.'),
      h('p', { class: 'muted small bell-foot' }, 'Avvisi anche quando il sito è in un\'altra scheda: ', h('a', { href: '#/profilo', onClick: () => close() }, 'attivali dal Profilo'), '.'),
    );
  };

  const onOutside = (event) => {
    if (!box.contains(event.target)) close();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };
  function open() {
    renderPanel();
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('keydown', onKey);
  }
  function close() {
    if (panel.hidden) return;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside);
    document.removeEventListener('keydown', onKey);
    if (unreadCount()) markAllRead();
  }
  button.addEventListener('click', () => (panel.hidden ? open() : close()));

  on('notifications', ({ note, live }) => {
    renderBadge();
    if (!panel.hidden) renderPanel();
    if (note && live) {
      if (document.visibilityState === 'visible') toast(note.text);
      else browserAlert(note);
    }
  });
  renderBadge();
  return box;
}
