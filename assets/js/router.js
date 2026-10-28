const routes = [];
let outlet = null;
let current = { path: null, cleanup: null };
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
  if (current.path !== null && path !== current.path && leaveGuard) {
    const ok = await leaveGuard();
    if (!ok) {
      history.replaceState(null, '', `#${current.path}`);
      return;
    }
    leaveGuard = null;
  }
  markHistory();
  current.cleanup?.();
  current = { path, cleanup: null };
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

export function startRouter(target, { fallback } = {}) {
  outlet = target;
  notFound = fallback || null;
  window.addEventListener('hashchange', () => render());
  return render();
}

export function navigate(path) {
  if (`#${path}` === location.hash) render();
  else location.hash = path;
}

export function stopRouter() {
  current.cleanup?.();
  current = { path: null, cleanup: null };
  leaveGuard = null;
}
