import { claimPopup, confirmDialog, h, mount, onOtherPopup } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { truncate } from '../lib/format.js';
import { CONFIG } from '../config.js';
import { BOARD_KINDS, routeFor } from '../schema.js';
import { totalUnread } from '../chat.js';
import { on, readLocal, state, writeLocal } from '../store.js';
import { navigate, onRouteChange } from '../router.js';
import { avatar, kindBadge } from './components.js';
import { mentionsButton, notificationBell } from './notifications.js';

export const NAV_GROUPS = [
  [
    'Lavoro',
    [
      ['/', 'Dashboard', 'dashboard'],
      ['/idee', 'Idee', 'idea'],
      ['/valutazione', 'Valutazione', 'scoring'],
      ['/esperimenti', 'Esperimenti', 'experiment'],
      ['/interviste', 'Interviste', 'interview'],
      ['/contatti', 'Contatti', 'at'],
      ['/decisioni', 'Decisioni', 'decision'],
      ['/chat', 'Chat', 'comment'],
    ],
  ],
  [
    'Strumenti',
    [
      ['/generatore', 'Generatore', 'generator'],
      ['/guida', 'Guida', 'compass'],
    ],
  ],
  [
    'Team',
    [
      ['/squadra', 'Squadra', 'heart'],
      ['/membri', 'Membri', 'users'],
    ],
  ],
  [
    'Sistema',
    [
      ['/storico', 'Storico', 'history'],
      ['/cestino', 'Cestino', 'trash'],
    ],
  ],
];

export const NAV = NAV_GROUPS.flatMap(([, entries]) => entries);

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

// Sul telefono la ricerca è un pulsante: toccandolo si apre una riga larga quanto lo schermo sopra la barra in alto.
function globalSearch() {
  const input = h('input', { class: 'input search-input', type: 'search', placeholder: 'Cerca nelle board  /', 'aria-label': 'Cerca nelle board', maxlength: 100 });
  const results = h('div', { class: 'search-results', hidden: true, role: 'listbox' });
  const box = h('div', { class: 'search', id: 'search' });
  const toggle = h(
    'button',
    { type: 'button', class: 'icon-btn search-toggle', 'aria-label': 'Cerca', 'aria-expanded': 'false', 'aria-controls': 'search', onClick: () => setOpen(true) },
    icon('search', 20),
  );
  const close = () => {
    results.hidden = true;
  };
  const setOpen = (open) => {
    if (open) claimPopup('ricerca');
    box.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      input.focus();
      return;
    }
    input.value = '';
    close();
  };
  onOtherPopup('ricerca', () => box.classList.contains('is-open') && setOpen(false));
  const dismiss = () => {
    setOpen(false);
    input.blur();
    toggle.focus();
  };
  const render = () => {
    const found = searchItems(input.value);
    if (!input.value.trim()) return close();
    results.hidden = false;
    mount(results,
      ...(found.length
        ? found.map((item) =>
            h('a', { class: 'search-result', href: routeFor(item), role: 'option', onClick: () => setOpen(false) }, kindBadge(item.kind), h('span', null, truncate(item.title, 80))),
          )
        : [h('p', { class: 'muted small' }, 'Nessun risultato.')]),
    );
  };
  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') dismiss();
    if (event.key === 'Enter') {
      const first = searchItems(input.value)[0];
      if (first) {
        navigate(routeFor(first).slice(1));
        setOpen(false);
      }
    }
  });
  // Toccando fuori i risultati si chiudono; la riga resta aperta solo se c'è qualcosa scritto.
  input.addEventListener('blur', () =>
    setTimeout(() => {
      close();
      if (!input.value.trim()) setOpen(false);
    }, 150),
  );
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
      event.preventDefault();
      setOpen(true);
    }
  });
  mount(
    box,
    icon('search', 16),
    input,
    h('button', { type: 'button', class: 'icon-btn search-close', 'aria-label': 'Chiudi la ricerca', onClick: dismiss }, icon('close', 18)),
    results,
  );
  return [toggle, box];
}

export function buildShell(root, { onSignOut }) {
  const outlet = h('main', { class: 'content', id: 'content', tabindex: '-1' });
  const chatBadge = h('span', { class: 'nav-badge', hidden: true });
  // Gruppi aperti di default; chi ne chiude uno lo ritrova chiuso su questo dispositivo, tranne quello della pagina aperta.
  const closed = new Set(readLocal('menuChiuso', []));
  const setGroupOpen = (group, open, remember = true) => {
    group.querySelector('.nav-group-title').setAttribute('aria-expanded', String(open));
    group.querySelector('.nav-group-links').hidden = !open;
    if (!remember) return;
    if (open) closed.delete(group.dataset.title);
    else closed.add(group.dataset.title);
    writeLocal('menuChiuso', [...closed]);
  };
  const groups = NAV_GROUPS.map(([title, entries], index) => {
    const open = !closed.has(title);
    const group = h(
      'div',
      { class: 'nav-group', role: 'group', 'aria-labelledby': `nav-group-${index}`, dataset: { title } },
      h(
        'button',
        {
          type: 'button',
          class: 'nav-group-title',
          id: `nav-group-${index}`,
          'aria-expanded': String(open),
          'aria-controls': `nav-group-links-${index}`,
          onClick: () => setGroupOpen(group, group.querySelector('.nav-group-links').hidden),
        },
        h('span', null, title),
        icon('chevron', 14),
      ),
      h(
        'div',
        { class: 'nav-group-links', id: `nav-group-links-${index}`, hidden: !open },
        entries.map(([path, label, iconName]) =>
          h('a', { class: 'nav-link', href: `#${path}`, dataset: { path } }, icon(iconName, 18), h('span', null, label), path === '/chat' ? chatBadge : null),
        ),
      ),
    );
    return group;
  });
  const links = groups.flatMap((group) => [...group.querySelectorAll('.nav-link')]);
  const signOut = async () => {
    if (await confirmDialog('Per rientrare servono password e codice di verifica.', { title: 'Vuoi uscire?', okLabel: 'Esci' })) onSignOut();
  };
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
    h('nav', { class: 'nav', 'aria-label': 'Sezioni' }, groups),
    h(
      'div',
      { class: 'sidebar-foot' },
      h('a', { class: 'nav-link', href: '#/profilo', dataset: { path: '/profilo' } }, icon('user', 18), h('span', null, 'Profilo')),
      h('button', { type: 'button', class: 'nav-link sign-out', onClick: signOut }, icon('logout', 18), h('span', null, 'Esci')),
    ),
  );
  const presence = h('div', { class: 'presence', 'aria-label': 'Online ora' });
  const live = h('span', { class: 'live-dot', title: 'Aggiornamenti dal vivo' });
  const offline = h('div', { class: 'banner banner-warn', hidden: navigator.onLine !== false }, 'Sei offline: le modifiche non verranno salvate finché non torna la connessione.');
  // Menu a scomparsa su tutti gli schermi: si chiude con le tre linee, toccando fuori, con Esc o scegliendo una pagina.
  const setMenu = (open) => {
    if (open) claimPopup('menu');
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
  onOtherPopup('menu', () => root.classList.contains('nav-open') && setMenu(false));
  // Su telefono il menu è lungo: avatar e nome portano anche al Profilo.
  const userBox = h(
    'a',
    { class: 'user-box', href: '#/profilo', title: 'Profilo', 'aria-label': `Profilo di ${state.me?.display_name || 'chi è entrato'}` },
    avatar(state.user.id, 30),
    h('span', { class: 'user-name' }, state.me?.display_name || ''),
  );

  mount(
    root,
    h(
      'div',
      { class: 'app' },
      sidebar,
      backdrop,
      h('div', { class: 'main' }, h('header', { class: 'topbar' }, menuButton, globalSearch(), live, presence, mentionsButton(), notificationBell(), userBox), offline, outlet),
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
      const group = link.closest('.nav-group');
      if (active && group?.querySelector('.nav-group-links').hidden) setGroupOpen(group, true, false);
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
