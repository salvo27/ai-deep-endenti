import { api, AppError } from './lib/api.js';
import { KINDS, sanitizeSnapshot, snapshotProblem } from './schema.js';
import { LIMITS, cleanLine, isUuid } from './lib/validate.js';
import { debounce } from './lib/format.js';
import { EXAMPLES } from './examples.js';

export const state = {
  user: null,
  me: null,
  members: [],
  items: new Map(),
  commentCounts: new Map(),
  online: [],
  realtime: 'off',
};

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event)?.delete(fn);
}

export function emit(event, payload) {
  for (const fn of listeners.get(event) || []) {
    try {
      fn(payload);
    } catch (error) {
      console.error('Errore in un ascoltatore', event, error?.name);
    }
  }
}

export function resetStore() {
  state.user = null;
  state.me = null;
  state.members = [];
  state.items = new Map();
  state.commentCounts = new Map();
  state.online = [];
  state.realtime = 'off';
  listeners.clear();
}

export function isValidItemRow(row) {
  return Boolean(
    row &&
      isUuid(row.id) &&
      KINDS[row.kind] &&
      Number.isInteger(row.version) &&
      typeof row.title === 'string' &&
      row.data &&
      typeof row.data === 'object' &&
      !Array.isArray(row.data) &&
      (row.idea_id === null || row.idea_id === undefined || isUuid(row.idea_id)),
  );
}

// I dati che arrivano dal vivo non sono fidati: si applicano solo se ben formati e più recenti.
export function applyItem(row) {
  if (!isValidItemRow(row)) return false;
  const prev = state.items.get(row.id);
  if (prev && prev.version > row.version) return false;
  if (prev && prev.version === row.version && prev.deleted_at === row.deleted_at) return false;
  state.items.set(row.id, row);
  emit('item', { item: row, prev: prev || null, byMe: row.updated_by === state.user?.id });
  return true;
}

export function setMembers(rows) {
  state.members = Array.isArray(rows) ? rows.filter((m) => isUuid(m?.user_id)) : [];
  state.me = state.members.find((m) => m.user_id === state.user?.id) || null;
}

export async function loadAll() {
  const [members, items, counts] = await Promise.all([
    api.membersOverview(),
    api.listItems(),
    api.commentCounts().catch(() => new Map()),
  ]);
  setMembers(members);
  state.items = new Map(items.filter(isValidItemRow).map((i) => [i.id, i]));
  state.commentCounts = counts;
}

export async function reloadMembers() {
  setMembers(await api.membersOverview());
  emit('members', state.members);
  if (!state.me) emit('removed');
}

const refreshCommentCounts = debounce(async () => {
  try {
    state.commentCounts = await api.commentCounts();
    emit('comment-counts', state.commentCounts);
  } catch {
    // i conteggi restano quelli di prima
  }
}, 800);

let unsubscribeDb = null;
let presence = null;

export function startRealtime() {
  stopRealtime();
  unsubscribeDb = api.subscribeDb({
    onItem: (row) => applyItem(row),
    onRevision: (rev) => {
      if (isUuid(rev?.item_id)) emit('revision', rev);
    },
    onComment: (row) => {
      if (!isUuid(row?.item_id)) return;
      emit('comment', row);
      refreshCommentCounts();
    },
    onMembers: () => reloadMembers().catch(() => {}),
    onStatus: (status) => {
      state.realtime = status;
      emit('realtime', status);
    },
  });
  presence = api.joinPresence(state.user.id, (presenceState) => {
    state.online = parsePresence(presenceState);
    emit('presence', state.online);
  });
}

export function stopRealtime() {
  unsubscribeDb?.();
  unsubscribeDb = null;
  presence?.leave();
  presence = null;
}

export function parsePresence(presenceState) {
  const out = [];
  for (const [userId, metas] of Object.entries(presenceState || {})) {
    if (!isUuid(userId) || !Array.isArray(metas) || !metas.length) continue;
    const meta = metas[metas.length - 1] || {};
    out.push({
      userId,
      route: typeof meta.route === 'string' ? meta.route.slice(0, 200) : '',
      editing: meta.editing === true,
    });
  }
  return out;
}

export function trackPresence({ route, editing = false }) {
  presence?.track({ route: cleanLine(route, 200), editing: editing === true });
}

const EXAMPLE_BY_ID = new Map(EXAMPLES.map((item) => [item.id, item]));

// Gli esempi si raggiungono solo dalle loro pagine: le liste generali vedono solo i dati del team.
export const isExample = (item) => item?.example === true;
export const exampleIdeas = () => EXAMPLES.filter((item) => item.kind === 'idea');
export const getItem = (id) => state.items.get(id) || EXAMPLE_BY_ID.get(id) || null;
export const memberById = (id) => state.members.find((m) => m.user_id === id) || null;
export const memberName = (id) => memberById(id)?.display_name || (id ? 'Ex membro' : 'Sistema');
export const canWrite = () => state.me?.role === 'admin' || state.me?.role === 'member';
export const isAdmin = () => state.me?.role === 'admin';

function parentDeleted(item) {
  if (!item.idea_id) return false;
  return Boolean(state.items.get(item.idea_id)?.deleted_at);
}

const sourceFor = (ideaId) => (ideaId !== undefined && EXAMPLE_BY_ID.has(ideaId) ? EXAMPLES : [...state.items.values()]);

export function itemsOf(kind, { ideaId, includeDeleted = false } = {}) {
  return sourceFor(ideaId).filter(
    (i) =>
      i.kind === kind &&
      (includeDeleted || (!i.deleted_at && !parentDeleted(i))) &&
      (ideaId === undefined || i.idea_id === ideaId),
  );
}

export const ideas = (opts) => itemsOf('idea', opts);
export const decisionsFor = (ideaId) =>
  sourceFor(ideaId).filter((i) => i.kind === 'decision' && !i.deleted_at && Array.isArray(i.data.ideas) && i.data.ideas.includes(ideaId));
export const singleton = (kind) => [...state.items.values()].find((i) => i.kind === kind) || null;
export const scoreItems = () => itemsOf('score');
export const myScoreItem = () => [...state.items.values()].find((i) => i.kind === 'score' && i.created_by === state.user?.id) || null;
export const criteriaList = () => singleton('criteria')?.data?.criteria || [];
export const deletedItems = () => [...state.items.values()].filter((i) => i.deleted_at);

export const labelContext = {
  ideaTitle: (id) => getItem(id)?.title || null,
  itemTitle: (id) => getItem(id)?.title || null,
  memberName: (id) => memberName(id),
  criterionLabel: (key) => criteriaList().find((c) => c.key === key)?.label || null,
  axisLabel: (id) => {
    const g = singleton('generator')?.data;
    return [...(g?.rows || []), ...(g?.cols || [])].find((a) => a.id === id)?.label || null;
  },
};

export const cleanMessage = (message) => cleanLine(message, LIMITS.message) || null;

const STATUS_MESSAGES = {
  conflict: 'Qualcuno ha modificato questo elemento nel frattempo.',
  deleted: 'Questo elemento è stato archiviato nel frattempo. Ripristinalo dal cestino per modificarlo.',
  forbidden: 'Non hai i permessi per questa operazione.',
  not_found: 'Elemento non trovato.',
};

export function statusError(status) {
  return new AppError(STATUS_MESSAGES[status] || 'Operazione non riuscita. Riprova.', { code: status || 'error' });
}

export async function createItem(kind, snapshot, message) {
  const clean = sanitizeSnapshot(kind, snapshot);
  const problem = snapshotProblem(kind, clean);
  if (problem) throw new AppError(problem, { code: 'invalid' });
  const row = await api.createItem({
    kind,
    title: clean.title,
    status: clean.status,
    data: clean.data,
    ideaId: clean.idea_id,
    message: cleanMessage(message),
  });
  applyItem(row);
  return row;
}

export async function saveSnapshot(item, snapshot, message) {
  const clean = sanitizeSnapshot(item.kind, snapshot);
  const problem = snapshotProblem(item.kind, clean);
  if (problem) throw new AppError(problem, { code: 'invalid' });
  const res = await api.saveItem({ id: item.id, baseVersion: item.version, snapshot: clean, message: cleanMessage(message) });
  if (res?.item) applyItem(res.item);
  return { status: res?.status || 'error', item: res?.item || null, snapshot: clean };
}

async function mutate(call) {
  const res = await call();
  if (res?.item) applyItem(res.item);
  if (res?.status !== 'ok') throw statusError(res?.status);
  return res.item;
}

export const archiveItem = (item, message) => mutate(() => api.deleteItem(item.id, item.version, cleanMessage(message)));
export const restoreItem = (item, message) => mutate(() => api.restoreItem(item.id, cleanMessage(message)));
export const revertItem = (item, toVersion, message) =>
  mutate(() => api.revertItem(item.id, toVersion, item.version, cleanMessage(message)));

function storageKey(name) {
  return `bdp:${name}:${state.user?.id || 'anon'}`;
}

export function readLocal(name, fallback = null) {
  try {
    const raw = localStorage.getItem(storageKey(name));
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeLocal(name, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(storageKey(name));
    else localStorage.setItem(storageKey(name), JSON.stringify(value));
  } catch {
    // archiviazione locale non disponibile: si continua senza
  }
}
