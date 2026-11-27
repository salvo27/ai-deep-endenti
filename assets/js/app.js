import { api } from './lib/api.js';
import { h, mount, toast } from './lib/dom.js';
import { isUuid } from './lib/validate.js';
import { CONFIG } from './config.js';
import { language, languageChoice, tx } from './i18n/index.js';
import { notMemberScreen, errorScreen } from './auth.js';
import {
  currentProjectId,
  isPlatformAdmin,
  loadAll,
  on,
  setPlatformAdmin,
  setProject,
  setProjects,
  startRealtime,
  startSync,
  state,
  stopRealtime,
  stopSync,
  syncItems,
  trackPresence,
} from './store.js';
import { addRedirect, addRoute, canLeave, currentKey, onRouteChange, parseHash, startRouter, stopRouter } from './router.js';
import { buildShell } from './views/shell.js';
import { startNotifications, stopNotifications } from './notifications.js';
import { sweepNoteImages } from './notes.js';
import { sweepSurveyImages } from './survey-images.js';
import { startChats, stopChats } from './chat.js';
import { startMentions, stopMentions } from './mentions.js';
import { dashboardView } from './views/dashboard.js';
import { ideasView } from './views/ideas.js';
import { ideaView } from './views/idea.js';
import { itemView } from './views/item.js';
import { listView } from './views/lists.js';
import { contactsView } from './views/contacts.js';
import { surveyView, surveysView } from './views/surveys.js';
import { editorView } from './views/editor.js';
import { scoringView } from './views/scoring.js';
import { generatorView } from './views/generator.js';
import { diffView, itemHistoryView, logView } from './views/history.js';
import { trashView } from './views/trash.js';
import { teamView } from './views/team.js';
import { chatView } from './views/chat.js';
import { profileView } from './views/profile.js';
import { squadView } from './views/squad.js';
import { guideView } from './views/guide.js';
import { expenseGroupView, expensesView } from './views/expenses.js';
import { projectsView } from './views/projects.js';
import { emptyState } from './views/components.js';

// The addresses are the same in every language: emails, bookmarks and shared links point to them.
export function registerRoutes() {
  addRoute('/', dashboardView);
  addRoute('/idee', ideasView); // i18n-ignore: address
  addRoute('/idea/:id/:tab?', ideaView);
  addRoute('/elemento/:id/:tab?', itemView);
  addRoute('/esperimenti', listView('experiment')); // i18n-ignore: address
  addRoute('/interviste', listView('interview')); // i18n-ignore: address
  addRoute('/questionari', surveysView); // i18n-ignore: address
  addRoute('/questionario/:id/:tab?', surveyView); // i18n-ignore: address
  addRoute('/decisioni', listView('decision')); // i18n-ignore: address
  addRoute('/contatti', contactsView); // i18n-ignore: address
  addRoute('/chat/:id?', chatView);
  addRoute('/nuovo/:kind', editorView); // i18n-ignore: address
  addRoute('/modifica/:id', editorView); // i18n-ignore: address
  addRoute('/valutazione', scoringView); // i18n-ignore: address
  addRoute('/generatore', generatorView); // i18n-ignore: address
  addRoute('/squadra/:tab?', squadView); // i18n-ignore: address
  addRoute('/guida/:tab?', guideView); // i18n-ignore: address
  addRedirect('/concetti', '/guida/concetti'); // i18n-ignore: address
  addRoute('/storico', logView); // i18n-ignore: address
  addRoute('/storico/:id', itemHistoryView); // i18n-ignore: address
  addRoute('/diff/:id/:to/:from?', diffView);
  addRoute('/cestino', trashView); // i18n-ignore: address
  addRoute('/membri', teamView); // i18n-ignore: address
  addRoute('/spese', expensesView); // i18n-ignore: address
  addRoute('/spese/:id/:tab?', expenseGroupView); // i18n-ignore: address
  addRedirect('/team', '/membri'); // i18n-ignore: address
  addRoute('/profilo', profileView); // i18n-ignore: address
  addRoute('/progetti', projectsView);
}

export function notFoundView(outlet) {
  mount(outlet, emptyState(tx.errors.notFound, h('a', { class: 'btn btn-primary', href: '#/' }, tx.errors.backToDashboard)));
}

// Disconnessione dopo un periodo di inattività: una sessione dimenticata aperta non resta valida per sempre.
export function startIdleLogout(minutes = CONFIG.idleLogoutMinutes, signOut = () => api.signOut()) {
  let timer = null;
  const reset = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await signOut();
      toast(tx.auth.idleSignedOut);
    }, minutes * 60 * 1000);
  };
  const events = ['pointerdown', 'keydown', 'scroll', 'visibilitychange'];
  events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
  reset();
  return () => {
    clearTimeout(timer);
    events.forEach((e) => window.removeEventListener(e, reset));
  };
}

// Ultima attività salvata a ogni gesto, al massimo ogni pochi minuti. Niente timer: una pagina aperta senza nessuno davanti non conta.
export function startActivityPing(minutes = CONFIG.activityPingMinutes, touch = () => api.touchActivity(), now = Date.now) {
  let last = -Infinity;
  const ping = () => {
    if (document.visibilityState === 'hidden' || now() - last < minutes * 60 * 1000) return;
    last = now();
    Promise.resolve()
      .then(touch)
      .catch(() => {
        last = -Infinity;
      });
  };
  const events = ['pointerdown', 'keydown', 'scroll', 'visibilitychange'];
  events.forEach((e) => window.addEventListener(e, ping, { passive: true, capture: true }));
  ping();
  return () => {
    events.forEach((e) => window.removeEventListener(e, ping, { capture: true }));
  };
}

// The project to open. The link of an email carries it after # (#/idea/<id>?progetto=<uuid>): it wins when it is one of
// mine. Then the one remembered on this device, if it is still mine; then the first. Anything else is ignored.
const PROJECT_PARAM = 'progetto';
const PROJECT_KEY = 'progetto';

export function chooseProject(projects, { linked = null, remembered = null } = {}) {
  const mine = (id) => (isUuid(id) ? projects.find((p) => p.id === id) || null : null);
  return mine(linked) || mine(remembered) || projects[0] || null;
}

/** The project in the address and the address without it, so it does not stay in the history nor in a later reload. */
export function projectLink(hash) {
  const { path, query } = parseHash(hash);
  if (!query.has(PROJECT_PARAM)) return { linked: null, hash: hash || '#/' };
  const linked = query.get(PROJECT_PARAM);
  query.delete(PROJECT_PARAM);
  const rest = query.toString();
  return { linked, hash: `#${path}${rest ? `?${rest}` : ''}` };
}

// The storage can be missing or throw (private windows, blocked site data): then the first project opens.
export function rememberedProject(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(PROJECT_KEY) ?? null;
  } catch {
    return null;
  }
}

export function rememberProject(id, storage = globalThis.localStorage) {
  try {
    storage?.setItem(PROJECT_KEY, id);
  } catch {
    // without storage the choice lasts until the page is closed
  }
}

const reloadPage = () => location.reload();
const setAddress = (hash) => history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);

/**
 * Opens another of my projects: the choice is saved and the page reloads, so data, presence and chats are all of it.
 * The open page is asked first, as every way out of it does: with unsaved changes the person can stay, and then nothing
 * changes. The new project opens on its dashboard, or on the page of the link that asked for it.
 */
export async function switchProject(id, reload = reloadPage, { route = '#/' } = {}) {
  const project = state.projects.find((p) => p.id === id);
  if (!project) return false;
  if (!(await canLeave())) return false;
  // The page is closed before the reload: it takes away the browser's own question about unsaved changes too.
  stopRouter();
  rememberProject(project.id);
  setAddress(route);
  reload();
  return true;
}

// Emails and the answers of Claude follow the language of the person, saved in the profile. A language chosen on this
// device is saved; a device left on automatic only fills a profile that has none, so it never overwrites the choice
// made on another device. Best effort: whatever happens, the site does not wait for it.
export async function syncProfileLanguage(current = language, choice = languageChoice) {
  const profile = await api.myProfile();
  if (!profile || profile.language === current) return false;
  if (choice === 'auto' && profile.language) return false;
  await api.updateProfile({ language: current });
  return true;
}

// Every address goes through here before it is shown. A link with the project (an email link pasted into a tab where
// the site is already open) opens that project when it is another of mine, keeping the page of the link; otherwise the
// parameter goes and the page opens in the project open. Without a project only some pages exist: the others lead to
// the Projects page.
function addressFilter(reload, { pages = null } = {}) {
  return (hash) => {
    const { linked, hash: clean } = projectLink(hash);
    const target = linked && state.projects.find((p) => p.id === linked && p.id !== currentProjectId());
    if (target) {
      // Until the switch happens the address is the one of the page still open.
      const open = currentKey();
      setAddress(open ? `#${open}` : '#/');
      switchProject(target.id, reload, { route: clean });
      return null;
    }
    let next = linked !== null ? clean : hash;
    if (pages && !pages.includes(parseHash(next).path)) next = '#/progetti';
    if (next !== hash) history.replaceState(history.state, '', next);
    return next;
  };
}

let stopIdle = null;
let stopActivity = null;
let stopAuthChange = null;
let stopRouteChange = null;

export function stopApp() {
  stopIdle?.();
  stopIdle = null;
  stopActivity?.();
  stopActivity = null;
  stopAuthChange?.();
  stopAuthChange = null;
  stopRouteChange?.();
  stopRouteChange = null;
  stopRealtime();
  stopSync();
  stopNotifications();
  stopChats();
  stopMentions();
  stopRouter();
}

function listenToAuth() {
  stopAuthChange = api.onAuthChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      stopApp();
      location.replace(location.pathname);
    }
    if (event === 'TOKEN_REFRESHED' && session) api.setRealtimeAuth().catch(() => {});
  });
}

// A platform admin in no project: only the Projects page, where they create one or add themselves to one, and their
// Profile. Any other address leads to the Projects page (docs/PROGETTI.md).
const PAGES_WITHOUT_PROJECT = ['/progetti', '/profilo']; // i18n-ignore: addresses

async function startWithoutProject(root, reload) {
  history.replaceState(history.state, '', '#/progetti');
  const { outlet } = buildShell(root, { onSignOut: () => api.signOut(), onSwitchProject: (id) => switchProject(id, reload) });
  stopIdle = startIdleLogout();
  listenToAuth();
  addRoute('/progetti', projectsView);
  addRoute('/profilo', profileView); // i18n-ignore: address
  await startRouter(outlet, { fallback: notFoundView, onAddress: addressFilter(reload, { pages: PAGES_WITHOUT_PROJECT }) });
  return true;
}

export async function startApp(root, { reload = reloadPage } = {}) {
  const session = await api.getSession();
  state.user = { id: session.user.id, email: session.user.email };
  try {
    const [projects, platformAdmin] = await Promise.all([api.myProjects(), api.isPlatformAdmin()]);
    setProjects(projects);
    setPlatformAdmin(platformAdmin === true);
  } catch (error) {
    errorScreen(root, error, () => location.reload());
    return false;
  }
  syncProfileLanguage().catch(() => {});

  const { linked, hash } = projectLink(location.hash);
  const project = chooseProject(state.projects, { linked, remembered: rememberedProject() });
  if (!project) {
    if (isPlatformAdmin()) return startWithoutProject(root, reload);
    notMemberScreen(root, { reason: 'none' });
    return false;
  }
  setProject(project);
  rememberProject(project.id);
  if (hash !== location.hash) history.replaceState(history.state, '', hash);

  try {
    await loadAll();
  } catch (error) {
    errorScreen(root, error, () => location.reload());
    return false;
  }
  // Removed between the list of projects and the members, or the project was archived in the meantime.
  if (!state.me) {
    notMemberScreen(root, { reason: 'removed' });
    return false;
  }

  const { outlet } = buildShell(root, { onSignOut: () => api.signOut(), onSwitchProject: (id) => switchProject(id, reload) });
  await api.setRealtimeAuth().catch(() => {});
  startRealtime();
  startSync();
  startNotifications();
  startChats();
  startMentions();
  sweepNoteImages();
  sweepSurveyImages();
  stopIdle = startIdleLogout();
  stopActivity = startActivityPing();
  // Members are not sent live any more: whoever is removed finds out at the next sync (entering a page, every minute).
  // A platform admin always has somewhere to go (they archived the project, removed themselves, or another platform
  // admin did): the site reloads on the Projects page, in another project of theirs or in none.
  on('removed', () => {
    stopApp();
    if (isPlatformAdmin()) {
      setAddress('#/progetti');
      reload();
      return;
    }
    notMemberScreen(root, { reason: 'removed' });
  });
  listenToAuth();
  stopRouteChange = onRouteChange((path) => {
    trackPresence({ route: path });
    syncItems();
  });
  registerRoutes();
  await startRouter(outlet, { fallback: notFoundView, onAddress: addressFilter(reload) });
  return true;
}
