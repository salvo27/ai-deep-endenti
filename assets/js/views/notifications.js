import { h, mount, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { on } from '../store.js';
import { browserAlert, isUnread, markAllRead, markRead, notifications, unreadCount } from '../notifications.js';
import { markMentionsRead, mentionHref, mentionState, mentionText, unreadMentions } from '../mentions.js';
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
  let showRead = false;

  const renderBadge = () => {
    const n = unreadCount();
    badge.hidden = n === 0;
    badge.textContent = n > 9 ? '9+' : String(n);
    button.setAttribute('aria-label', n ? `Notifiche, ${n} da leggere` : 'Notifiche');
  };

  const renderPanel = () => {
    const list = notifications({ includeRead: showRead });
    const unread = unreadCount();
    const hasRead = notifications({ includeRead: true }).length > unread;
    mount(
      panel,
      h('div', { class: 'bell-head' }, h('strong', null, 'Notifiche'), unread ? h('button', { type: 'button', class: 'link-btn small', onClick: () => markAllRead() }, 'Segna tutte come lette') : null),
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
                  {
                    href: note.href,
                    onClick: () => {
                      markRead(note.id);
                      close();
                    },
                  },
                  avatar(note.authorId, 26),
                  h('span', { class: 'bell-text' }, note.text, h('span', { class: 'muted small' }, ' · ', timeAgo(note.at))),
                ),
              ),
            ),
          )
        : h('p', { class: 'muted small bell-empty' }, 'Nessuna novità da leggere.'),
      hasRead
        ? h(
            'button',
            { type: 'button', class: 'link-btn small bell-toggle', onClick: () => { showRead = !showRead; renderPanel(); } },
            showRead ? 'Nascondi quelle già lette' : 'Mostra anche quelle già lette',
          )
        : null,
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
    showRead = false;
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

// Notifiche importanti: le menzioni, con un pulsante e un elenco tutti loro.
export function mentionsButton() {
  const badge = h('span', { class: 'bell-badge bell-badge-important', hidden: true });
  const button = h('button', { type: 'button', class: 'icon-btn bell mentions-btn', 'aria-label': 'Menzioni', 'aria-expanded': 'false', 'aria-haspopup': 'true' }, icon('at', 20), badge);
  const panel = h('div', { class: 'bell-panel', hidden: true, role: 'dialog', 'aria-label': 'Menzioni' });
  const box = h('div', { class: 'bell-box' }, button, panel);

  const renderBadge = () => {
    const n = unreadMentions();
    badge.hidden = n === 0;
    badge.textContent = n > 9 ? '9+' : String(n);
    button.setAttribute('aria-label', n ? `Menzioni, ${n} da leggere` : 'Menzioni');
  };
  const renderPanel = () => {
    const list = mentionState.items;
    mount(
      panel,
      h('div', { class: 'bell-head' }, h('strong', null, 'Menzioni'), unreadMentions() ? h('button', { type: 'button', class: 'link-btn small', onClick: () => markMentionsRead() }, 'Segna tutte come lette') : null),
      list.length
        ? h(
            'ul',
            { class: 'bell-list' },
            list.map((m) =>
              h(
                'li',
                { class: ['bell-item', 'mention-item', !m.read_at && 'is-unread'] },
                h(
                  'a',
                  {
                    href: mentionHref(m),
                    onClick: () => {
                      markMentionsRead([m.id]);
                      close();
                    },
                  },
                  avatar(m.author_id, 26),
                  h(
                    'span',
                    { class: 'bell-text' },
                    mentionText(m),
                    m.excerpt ? h('span', { class: 'mention-excerpt' }, m.excerpt) : null,
                    h('span', { class: 'muted small' }, timeAgo(m.created_at)),
                  ),
                ),
              ),
            ),
          )
        : h('p', { class: 'muted small bell-empty' }, 'Nessuna menzione. Quando qualcuno ti tagga con @ in chat, nei commenti o nelle note, lo vedi qui.'),
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
  }
  button.addEventListener('click', () => (panel.hidden ? open() : close()));
  on('mentions', () => {
    renderBadge();
    if (!panel.hidden) renderPanel();
  });
  renderBadge();
  return box;
}
