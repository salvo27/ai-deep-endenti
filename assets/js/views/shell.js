import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { truncate } from '../lib/format.js';
import { CONFIG } from '../config.js';
import { BOARD_KINDS, routeFor } from '../schema.js';
import { totalUnread } from '../chat.js';
import { on, state } from '../store.js';
import { navigate, onRouteChange } from '../router.js';
import { avatar, kindBadge } from './components.js';
import { notificationBell } from './notifications.js';

export const NAV = [
  ['/', 'Dashboard', 'dashboard'],
  ['/idee', 'Idee', 'idea'],
  ['/valutazione', 'Valutazione', 'scoring'],
  ['/esperimenti', 'Esperimenti', 'experiment'],
  ['/interviste', 'Interviste', 'interview'],
  ['/decisioni', 'Decisioni', 'decision'],
  ['/chat', 'Chat', 'comment'],
  ['/generatore', 'Generatore', 'generator'],
  ['/squadra', 'Squadra', 'heart'],
  ['/guida', 'Guida', 'compass'],
  ['/concetti', 'Concetti', 'book'],
  ['/storico', 'Storico', 'history'],
  ['/cestino', 'Cestino', 'trash'],
  ['/team', 'Team', 'users'],
];

export function searchItems(query, limit = 8) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const results = [];
  for (const item of state.items.values()) {
    if (item.deleted_at || !BOARD_KINDS.includes(item.kind)) continue;
    const inTitle = item.title.toLowerCase().includes(q);
    const inData = !inTitle && JSON.stringify(item.data).toLowerCase().includes(q);
    if (inTitle || inData) results.push({ item, rank: inTitle ? 0 : 1 });
  }
  return results
    .sort((a, b) => a.rank - b.rank || b.item.updated_at.localeCompare(a.item.updated_at))
    .slice(0, limit)
    .map((r) => r.item);
}

function globalSearch() {
  const input = h('input', { class: 'input search-input', type: 'search', placeholder: 'Cerca nelle board  /', 'aria-label': 'Cerca nelle board', maxlength: 100 });
  const results = h('div', { class: 'search-results', hidden: true, role: 'listbox' });
  const close = () => {
    results.hidden = true;
  };
  const render = () => {
    const found = searchItems(input.value);
    if (!input.value.trim()) return close();
    results.hidden = false;
    mount(results,
      ...(found.length
        ? found.map((item) =>
            h('a', { class: 'search-result', href: routeFor(item), role: 'option', onClick: close }, kindBadge(item.kind), h('span', null, truncate(item.title, 80))),
          )
        : [h('p', { class: 'muted small' }, 'Nessun risultato.')]),
    );
  };
  input.addEventListener('input', render);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      input.value = '';
      close();
      input.blur();
    }
    if (event.key === 'Enter') {
      const first = searchItems(input.value)[0];
      if (first) {
        navigate(routeFor(first).slice(1));
        input.value = '';
        close();
      }
    }
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      event.preventDefault();
      input.focus();
    }
  });
  return h('div', { class: 'search' }, icon('search', 16), input, results);
}

export function buildShell(root, { onSignOut }) {
  const outlet = h('main', { class: 'content', id: 'content', tabindex: '-1' });
  const chatBadge = h('span', { class: 'nav-badge', hidden: true });
  const links = NAV.map(([path, label, iconName]) =>
    h('a', { class: 'nav-link', href: `#${path}`, dataset: { path } }, icon(iconName, 18), h('span', null, label), path === '/chat' ? chatBadge : null),
  );
  const renderChatBadge = () => {
    const n = totalUnread();
    chatBadge.hidden = n === 0;
    chatBadge.textContent = n > 99 ? '99+' : String(n);
    chatBadge.setAttribute('aria-label', `${n} messaggi da leggere`);
    menuButton.classList.toggle('has-unread', n > 0);
  };
  const sidebar = h(
    'aside',
    { class: 'sidebar', id: 'menu' },
    h('a', { class: 'brand', href: '#/' }, icon('shield', 22), h('span', null, CONFIG.appName)),
    h('nav', { class: 'nav', 'aria-label': 'Sezioni' }, links),
    h('div', { class: 'sidebar-foot' }, h('a', { class: 'nav-link', href: '#/profilo', dataset: { path: '/profilo' } }, icon('user', 18), h('span', null, 'Profilo'))),
  );
  const presence = h('div', { class: 'presence', 'aria-label': 'Online ora' });
  const live = h('span', { class: 'live-dot', title: 'Aggiornamenti dal vivo' });
  const offline = h('div', { class: 'banner banner-warn', hidden: navigator.onLine !== false }, 'Sei offline: le modifiche non verranno salvate finché non torna la connessione.');
  // Menu a scomparsa su tutti gli schermi: si chiude con le tre linee, toccando fuori, con Esc o scegliendo una pagina.
  const setMenu = (open) => {
    root.classList.toggle('nav-open', open);
    backdrop.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    sidebar.inert = !open;
  };
  const menuButton = h(
    'button',
    { type: 'button', class: 'icon-btn menu-btn', 'aria-label': 'Menu', 'aria-expanded': 'false', 'aria-controls': 'menu', onClick: () => setMenu(!root.classList.contains('nav-open')) },
    icon('menu', 20),
  );
  const backdrop = h('div', { class: 'nav-backdrop', hidden: true, onClick: () => setMenu(false) });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && root.classList.contains('nav-open')) {
      setMenu(false);
      menuButton.focus();
    }
  });
  setMenu(false);
  const userButton = h(
    'div',
    { class: 'user-box' },
    avatar(state.user.id, 30),
    h('span', { class: 'user-name' }, state.me?.display_name || ''),
    h('button', { type: 'button', class: 'icon-btn', title: 'Esci', 'aria-label': 'Esci', onClick: onSignOut }, icon('logout', 18)),
  );

  mount(
    root,
    h(
      'div',
      { class: 'app' },
      sidebar,
      backdrop,
      h('div', { class: 'main' }, h('header', { class: 'topbar' }, menuButton, globalSearch(), live, presence, notificationBell(), userButton), offline, outlet),
    ),
  );

  const renderPresence = () => {
    const others = state.online.filter((p) => p.userId !== state.user.id);
    mount(presence, ...others.slice(0, 6).map((p) => avatar(p.userId, 26)));
    presence.title = others.length ? `${others.length} online` : '';
  };
  const renderLive = (status) => {
    live.classList.toggle('is-on', status === 'SUBSCRIBED');
    live.title = status === 'SUBSCRIBED' ? 'Aggiornamenti dal vivo attivi' : 'Aggiornamenti dal vivo non attivi: ricarica per vedere le novità';
  };
  const highlight = (path) => {
    for (const link of [...links, sidebar.querySelector('.sidebar-foot a')]) {
      const target = link.dataset.path;
      const active = target === '/' ? path === '/' : path === target || path.startsWith(`${target}/`) ||
        (target === '/idee' && path.startsWith('/idea/'));
      link.classList.toggle('is-active', active);
    }
    setMenu(false);
  };

  on('presence', renderPresence);
  on('chats', renderChatBadge);
  renderChatBadge();
  on('realtime', renderLive);
  onRouteChange(highlight);
  window.addEventListener('online', () => (offline.hidden = true));
  window.addEventListener('offline', () => (offline.hidden = false));
  renderPresence();
  renderLive(state.realtime);
  return { outlet };
}
