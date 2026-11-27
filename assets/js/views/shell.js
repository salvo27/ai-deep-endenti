import { claimPopup, confirmDialog, h, mount, onOtherPopup } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { truncate } from '../lib/format.js';
import { CONFIG } from '../config.js';
import { tx } from '../i18n/index.js';
import { BOARD_KINDS, routeFor } from '../schema.js';
import { totalUnread } from '../chat.js';
import { isPlatformAdmin, on, readLocal, state, writeLocal } from '../store.js';
import { navigate, onRouteChange } from '../router.js';
// app.js builds this shell and owns the change of project: the import goes both ways, and only functions cross it.
import { switchProject } from '../app.js';
import { avatar, kindBadge } from './components.js';
import { mentionsButton, notificationBell } from './notifications.js';

const t = tx.shell;

// The key of a group is what this device remembers when the group is closed: the Italian names the menu had before
// it was translated, so a group closed back then stays closed, in every language.
export const NAV_GROUPS = [
  {
    key: 'Lavoro', // i18n-ignore: stored key
    title: t.groups.work,
    entries: [
      ['/', t.nav.dashboard, 'dashboard'],
      ['/idee', t.nav.ideas, 'idea'], // i18n-ignore: address
      ['/valutazione', t.nav.scoring, 'scoring'], // i18n-ignore: address
      ['/esperimenti', t.nav.experiments, 'experiment'], // i18n-ignore: address
      ['/interviste', t.nav.interviews, 'interview'], // i18n-ignore: address
      ['/questionari', t.nav.surveys, 'list'], // i18n-ignore: address
      ['/contatti', t.nav.contacts, 'at'], // i18n-ignore: address
      ['/decisioni', t.nav.decisions, 'decision'], // i18n-ignore: address
      ['/chat', t.nav.chat, 'comment'],
    ],
  },
  {
    key: 'Strumenti', // i18n-ignore: stored key
    title: t.groups.tools,
    entries: [
      ['/generatore', t.nav.generator, 'generator'], // i18n-ignore: address
      ['/guida', t.nav.guide, 'compass'], // i18n-ignore: address
    ],
  },
  {
    key: 'Team',
    title: t.groups.team,
    entries: [
      ['/squadra', t.nav.squad, 'heart'], // i18n-ignore: address
      ['/membri', t.nav.members, 'users'], // i18n-ignore: address
      ['/spese', t.nav.expenses, 'wallet'], // i18n-ignore: address
    ],
  },
  {
    key: 'Sistema', // i18n-ignore: stored key
    title: t.groups.system,
    entries: [
      ['/storico', t.nav.history, 'history'], // i18n-ignore: address
      ['/cestino', t.nav.trash, 'trash'], // i18n-ignore: address
    ],
  },
];

export const NAV = NAV_GROUPS.flatMap((group) => group.entries);

const PROJECTS_PATH = '/progetti';
const PROFILE_PATH = '/profilo'; // i18n-ignore: address

// A project is open when the store has one, or the members of one: they are read only for the open project.
// app.js starts a platform administrator who is in no project without either.
const projectOpen = () => Boolean(state.project || state.me);

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
  const input = h('input', { class: 'input search-input', type: 'search', placeholder: `${t.search.placeholder}  /`, 'aria-label': t.search.placeholder, maxlength: 100 });
  const results = h('div', { class: 'search-results', hidden: true, role: 'listbox' });
  const box = h('div', { class: 'search', id: 'search' });
  const toggle = h(
    'button',
    { type: 'button', class: 'icon-btn search-toggle', 'aria-label': t.search.open, 'aria-expanded': 'false', 'aria-controls': 'search', onClick: () => setOpen(true) },
    icon('search', 20),
  );
  const close = () => {
    results.hidden = true;
  };
  const setOpen = (open) => {
    if (open) claimPopup('search');
    box.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      input.focus();
      return;
    }
    input.value = '';
    close();
  };
  onOtherPopup('search', () => box.classList.contains('is-open') && setOpen(false));
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
        : [h('p', { class: 'muted small' }, t.search.empty)]),
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
    h('button', { type: 'button', class: 'icon-btn search-close', 'aria-label': t.search.close, onClick: dismiss }, icon('close', 18)),
    results,
  );
  return [toggle, box];
}

const roleName = (role) => (Object.hasOwn(tx.common.roles, role ?? '') ? tx.common.roles[role] : role || '');
const projectLabel = (project) => t.project.option(project.name, roleName(project.role));

// The open project and the others of mine (my_projects), each with my role. Choosing one hands it to app.js, which
// remembers it and reloads the page. Without an open project (a platform administrator in no project) it says so,
// and offers the projects as soon as the Projects page adds me to one.
function projectSwitch(onSwitchProject) {
  const box = h('div', { class: 'project-switch' });
  const render = () => {
    const current = state.project;
    const mine = state.projects.some((p) => p.id === current?.id) ? state.projects : [current, ...state.projects].filter(Boolean);
    const shown = mine.map((p) => (p.id === current?.id ? { ...p, name: current.name } : p));
    // A page opened without the list of projects (the tests of the pages) has nothing to switch.
    box.hidden = !shown.length && projectOpen();
    if (box.hidden) {
      mount(box);
      return;
    }
    if (shown.length === 1 && current) {
      mount(box, h('span', { class: 'project-switch-label' }, t.project.label), h('strong', { class: 'project-name' }, projectLabel(shown[0])));
      return;
    }
    if (!shown.length) {
      mount(box, h('span', { class: 'project-switch-label' }, t.project.label), h('span', { class: 'project-name muted' }, t.project.none));
      return;
    }
    const select = h(
      'select',
      { class: 'input input-small', id: 'project-select', name: 'project' },
      current ? null : h('option', { value: '', selected: true }, t.project.choose),
      shown.map((p) => h('option', { value: p.id, selected: p.id === current?.id }, projectLabel(p))),
    );
    select.addEventListener('change', () => {
      const id = select.value;
      if (!id || id === current?.id) return;
      if (onSwitchProject(id) === false) select.value = current?.id ?? '';
    });
    mount(box, h('label', { class: 'project-switch-label', for: 'project-select' }, t.project.label), select);
  };
  render();
  return { box, render };
}

export function buildShell(root, { onSignOut, onSwitchProject = (id) => switchProject(id) }) {
  const withProject = projectOpen();
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
  // Without a project there are no project pages to offer: only Projects, Profile and Sign out.
  const groups = (withProject ? NAV_GROUPS : []).map(({ key, title, entries }, index) => {
    const open = !closed.has(key);
    const group = h(
      'div',
      { class: 'nav-group', role: 'group', 'aria-labelledby': `nav-group-${index}`, dataset: { title: key } },
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
    if (await confirmDialog(t.signOut.message, { title: t.signOut.title, okLabel: t.signOut.ok })) onSignOut();
  };
  const renderChatBadge = () => {
    const n = totalUnread();
    chatBadge.hidden = n === 0;
    chatBadge.textContent = n > 99 ? '99+' : String(n);
    chatBadge.setAttribute('aria-label', t.chatUnread(n));
    menuButton.classList.toggle('has-unread', n > 0);
  };
  const switcher = projectSwitch(onSwitchProject);
  // Only for platform administrators; it follows the Projects page, which can add or remove one.
  const projectsLink = h('a', { class: 'nav-link', href: `#${PROJECTS_PATH}`, dataset: { path: PROJECTS_PATH } }, icon('columns', 18), h('span', null, t.nav.projects));
  const projectBox = h('div', { class: 'project-box' });
  const renderProjectBox = () => mount(projectBox, switcher.box, isPlatformAdmin() ? projectsLink : null);
  const profileLink = h('a', { class: 'nav-link', href: `#${PROFILE_PATH}`, dataset: { path: PROFILE_PATH } }, icon('user', 18), h('span', null, t.nav.profile));
  const sidebar = h(
    'aside',
    { class: 'sidebar', id: 'menu' },
    h('a', { class: 'brand', href: withProject ? '#/' : `#${PROJECTS_PATH}` }, icon('shield', 22), h('span', null, CONFIG.appName)),
    projectBox,
    withProject ? h('nav', { class: 'nav', 'aria-label': t.sections }, groups) : null,
    h(
      'div',
      { class: 'sidebar-foot' },
      profileLink,
      h('button', { type: 'button', class: 'nav-link sign-out', onClick: signOut }, icon('logout', 18), h('span', null, t.nav.signOut)),
    ),
  );
  const presence = h('div', { class: 'presence', 'aria-label': t.presence.label });
  const live = h('span', { class: 'live-dot', title: t.live.title });
  const offline = h('div', { class: 'banner banner-warn', hidden: navigator.onLine !== false }, t.offline);
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
    { type: 'button', class: 'icon-btn menu-btn', 'aria-label': t.menu, 'aria-expanded': 'false', 'aria-controls': 'menu', onClick: () => setMenu(!root.classList.contains('nav-open')) },
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
    { class: 'user-box', href: `#${PROFILE_PATH}`, title: t.nav.profile, 'aria-label': t.user.label(state.me?.display_name || t.user.anonymous) },
    avatar(state.user.id, 30),
    h('span', { class: 'user-name' }, state.me?.display_name || ''),
  );
  // Search, who is online, live updates, mentions and notifications all belong to a project.
  const topbar = withProject
    ? [menuButton, globalSearch(), live, presence, mentionsButton(), notificationBell(), userBox]
    : [menuButton, userBox];

  mount(
    root,
    h(
      'div',
      { class: 'app' },
      sidebar,
      backdrop,
      h('div', { class: 'main' }, h('header', { class: 'topbar' }, topbar), offline, outlet),
    ),
  );

  const renderPresence = () => {
    const others = state.online.filter((p) => p.userId !== state.user.id);
    mount(presence, ...others.slice(0, 6).map((p) => avatar(p.userId, 26)));
    presence.title = others.length ? t.presence.count(others.length) : '';
  };
  const renderLive = (status) => {
    live.classList.toggle('is-on', status === 'SUBSCRIBED');
    live.title = status === 'SUBSCRIBED' ? t.live.on : t.live.off;
  };
  const highlight = (path) => {
    for (const link of [...links, projectsLink, profileLink]) {
      const target = link.dataset.path;
      const active = target === '/' ? path === '/' : path === target || path.startsWith(`${target}/`) ||
        (target === '/idee' && path.startsWith('/idea/')) || (target === '/questionari' && path.startsWith('/questionario/')); // i18n-ignore: address
      link.classList.toggle('is-active', active);
      const group = link.closest('.nav-group');
      if (active && group?.querySelector('.nav-group-links').hidden) setGroupOpen(group, true, false);
    }
    setMenu(false);
  };

  // The Projects page announces when my projects, or my role on the platform, have changed.
  on('projects', () => {
    switcher.render();
    renderProjectBox();
  });
  renderProjectBox();
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
