import { api } from './lib/api.js';
import { h, mount, toast } from './lib/dom.js';
import { CONFIG } from './config.js';
import { notMemberScreen, errorScreen } from './auth.js';
import { loadAll, on, startRealtime, startSync, state, stopRealtime, stopSync, syncItems, trackPresence } from './store.js';
import { addRoute, onRouteChange, startRouter, stopRouter } from './router.js';
import { buildShell } from './views/shell.js';
import { startNotifications, stopNotifications } from './notifications.js';
import { sweepNoteImages } from './notes.js';
import { dashboardView } from './views/dashboard.js';
import { ideasView } from './views/ideas.js';
import { ideaView } from './views/idea.js';
import { itemView } from './views/item.js';
import { listView } from './views/lists.js';
import { editorView } from './views/editor.js';
import { scoringView } from './views/scoring.js';
import { generatorView } from './views/generator.js';
import { diffView, itemHistoryView, logView } from './views/history.js';
import { trashView } from './views/trash.js';
import { teamView } from './views/team.js';
import { profileView } from './views/profile.js';
import { squadView } from './views/squad.js';
import { guideView } from './views/guide.js';
import { conceptsView } from './views/concepts.js';
import { emptyState } from './views/components.js';

export function registerRoutes() {
  addRoute('/', dashboardView);
  addRoute('/idee', ideasView);
  addRoute('/idea/:id/:tab?', ideaView);
  addRoute('/elemento/:id/:tab?', itemView);
  addRoute('/esperimenti', listView('experiment'));
  addRoute('/interviste', listView('interview'));
  addRoute('/decisioni', listView('decision'));
  addRoute('/nuovo/:kind', editorView);
  addRoute('/modifica/:id', editorView);
  addRoute('/valutazione', scoringView);
  addRoute('/generatore', generatorView);
  addRoute('/squadra/:tab?', squadView);
  addRoute('/guida', guideView);
  addRoute('/concetti', conceptsView);
  addRoute('/storico', logView);
  addRoute('/storico/:id', itemHistoryView);
  addRoute('/diff/:id/:to/:from?', diffView);
  addRoute('/cestino', trashView);
  addRoute('/team', teamView);
  addRoute('/profilo', profileView);
}

export function notFoundView(outlet) {
  mount(outlet, emptyState('Pagina non trovata.', h('a', { class: 'btn btn-primary', href: '#/' }, 'Torna alla dashboard')));
}

// Disconnessione dopo un periodo di inattività: una sessione dimenticata aperta non resta valida per sempre.
export function startIdleLogout(minutes = CONFIG.idleLogoutMinutes, signOut = () => api.signOut()) {
  let timer = null;
  const reset = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await signOut();
      toast('Sei stato disconnesso per inattività.');
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

let stopIdle = null;

export function stopApp() {
  stopIdle?.();
  stopIdle = null;
  stopRealtime();
  stopSync();
  stopNotifications();
  stopRouter();
}

export async function startApp(root) {
  const session = await api.getSession();
  state.user = { id: session.user.id, email: session.user.email };
  // Ruolo e dati insieme: per chi non è nel team le regole del database restituiscono comunque liste vuote.
  const [role, loadError] = await Promise.all([api.myRole(), loadAll().then(() => null, (error) => error)]);
  if (!role) {
    notMemberScreen(root);
    return false;
  }
  if (loadError) {
    errorScreen(root, loadError, () => location.reload());
    return false;
  }
  if (!state.me) {
    notMemberScreen(root);
    return false;
  }

  const { outlet } = buildShell(root, { onSignOut: () => api.signOut() });
  await api.setRealtimeAuth().catch(() => {});
  startRealtime();
  startSync();
  startNotifications();
  sweepNoteImages();
  stopIdle = startIdleLogout();
  on('removed', () => {
    stopApp();
    notMemberScreen(root);
  });
  api.onAuthChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      stopApp();
      location.replace(location.pathname);
    }
    if (event === 'TOKEN_REFRESHED' && session) api.setRealtimeAuth().catch(() => {});
  });
  onRouteChange((path) => {
    trackPresence({ route: path });
    syncItems();
  });
  registerRoutes();
  await startRouter(outlet, { fallback: notFoundView });
  return true;
}
