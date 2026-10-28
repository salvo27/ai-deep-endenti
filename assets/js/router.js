const routes = [];
let outlet = null;
let current = { path: null, key: null, cleanup: null };
let leaveGuard = null;
let notFound = null;
const changeListeners = new Set();

export function compile(pattern) {
  const keys = [];
  const parts = pattern
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      const param = segment.match(/^:(\w+)(\?)?$/);
      if (!param) return `\\/${segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
      keys.push(param[1]);
      return param[2] ? '(?:\\/([^/]+))?' : '\\/([^/]+)';
    });
  return { re: new RegExp(`^${parts.join('') || '\\/'}\\/?$`), keys };
}

export function addRoute(pattern, view) {
  routes.push({ pattern, view, ...compile(pattern) });
}

// Indirizzo vecchio che porta a quello nuovo, con gli stessi parametri dopo «?» e senza una voce in più nella cronologia.
export function addRedirect(pattern, target) {
  routes.push({ pattern, redirect: target, ...compile(pattern) });
}

export function clearRoutes() {
  routes.length = 0;
}

export function parseHash(hash) {
  const raw = (hash || '').replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(query) };
}

export function match(path) {
  for (const route of routes) {
    const m = route.re.exec(path);
    if (!m) continue;
    const params = {};
    route.keys.forEach((key, i) => {
      if (m[i + 1] !== undefined) {
        try {
          params[key] = decodeURIComponent(m[i + 1]);
        } catch {
          params[key] = m[i + 1];
        }
      }
    });
    return { route, params };
  }
  return null;
}

export function setLeaveGuard(fn) {
  leaveGuard = fn;
}

export function onRouteChange(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

export function currentPath() {
  return current.path;
}

// Ogni voce della cronologia del sito ricorda la sua posizione: così «Indietro» sa se c'è una pagina del sito a cui tornare.
let navIndex = 0;

function markHistory() {
  const st = history.state;
  if (st && Number.isInteger(st.navIndex)) {
    navIndex = st.navIndex;
    return;
  }
  navIndex = current.path === null ? 0 : navIndex + 1;
  history.replaceState({ ...(st && typeof st === 'object' ? st : {}), navIndex }, '', location.href);
}

export function canGoBack() {
  return Number.isInteger(history.state?.navIndex) && history.state.navIndex > 0;
}

export function goBack(fallback) {
  if (canGoBack()) history.back();
  else if (fallback) location.hash = fallback.replace(/^#/, '');
}

export async function render(hash = location.hash) {
  let { path, query } = parseHash(hash);
  let found = match(path);
  if (found?.route.redirect) {
    const search = query.toString();
    const target = search ? `${found.route.redirect}?${search}` : found.route.redirect;
    history.replaceState(history.state, '', `#${target}`);
    ({ path, query } = parseHash(target));
    found = match(path);
  }
  // L'avviso per le modifiche non salvate vale anche quando cambia solo la vista (per esempio ?vista=...).
  const key = query.toString() ? `${path}?${query}` : path;
  if (current.key !== null && key !== current.key && leaveGuard) {
    const ok = await leaveGuard();
    if (!ok) {
      history.replaceState(history.state, '', `#${current.key}`);
      return;
    }
    leaveGuard = null;
  }
  markHistory();
  current.cleanup?.();
  current = { path, key, cleanup: null };
  outlet.replaceChildren();
  outlet.scrollTop = 0;
  const view = found ? found.route.view : notFound;
  try {
    const cleanup = await view?.(outlet, found?.params || {}, query);
    current.cleanup = typeof cleanup === 'function' ? cleanup : null;
  } catch (error) {
    console.error('Errore nella pagina', error?.name);
    outlet.replaceChildren();
    outlet.append(Object.assign(document.createElement('p'), { className: 'error-box', textContent: error?.message || 'Pagina non disponibile.' }));
  }
  for (const fn of changeListeners) fn(path);
}

// Schede e filtri cambiano la vista della stessa pagina: sostituiscono la voce della cronologia invece di aggiungerne una,
// così «Indietro» porta alla pagina precedente e non alla scheda o al filtro di prima. I link interessati hanno data-replace.
function onReplaceClick(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest?.('a[data-replace]');
  const href = link?.getAttribute('href');
  if (!href?.startsWith('#/')) return;
  event.preventDefault();
  navigate(href.slice(1), { replace: true });
}

let listening = false;

export function startRouter(target, { fallback } = {}) {
  outlet = target;
  notFound = fallback || null;
  if (!listening) {
    listening = true;
    window.addEventListener('hashchange', () => render());
    document.addEventListener('click', onReplaceClick);
  }
  return render();
}

export function navigate(path, { replace = false } = {}) {
  if (replace) {
    history.replaceState(history.state, '', `#${path}`);
    return render();
  }
  if (`#${path}` === location.hash) return render();
  location.hash = path;
  return undefined;
}

export function stopRouter() {
  current.cleanup?.();
  current = { path: null, key: null, cleanup: null };
  leaveGuard = null;
}
