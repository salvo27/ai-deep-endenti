import { api } from './lib/api.js';
import { routeFor, statusLabel } from './schema.js';
import { emit, getItem, memberName, on, readLocal, state, writeLocal } from './store.js';

// Notifiche: cosa fanno gli altri che vale la pena sapere. Le modifiche minori ai testi restano nello storico.

const MAX = 60;
const LOOKBACK_DAYS = 14;
const BOARD_LABELS = {
  canvas: 'un Lean Canvas',
  persona: 'una buyer persona',
  vpc: 'un Value Proposition Canvas',
  market: 'una stima del mercato',
  competitors: 'un\'analisi dei concorrenti',
  deeptech: 'una scheda deep tech',
  note: 'una nota',
};

let items = [];
let lastRead = null;
let newest = null;
const seen = new Set();
// Letture singole (clic su una notifica), oltre al «segna tutte come lette» che sposta lastRead.
let readIds = new Set();

const routeOf = (kind, id) => routeFor({ kind, id });
const quoted = (title) => `«${title || 'senza titolo'}»`;

export function describeRevision(rev) {
  const who = memberName(rev.author_id);
  const title = quoted(rev.title);
  const changedStatus = rev.op === 'update' && Array.isArray(rev.changed) && rev.changed.includes('status');
  const href = routeOf(rev.kind, rev.item_id);
  let text = null;
  switch (rev.kind) {
    case 'idea':
      if (rev.op === 'create') text = `${who} ha aggiunto l'idea ${title}`;
      else if (rev.op === 'delete') text = `${who} ha archiviato l'idea ${title}`;
      else if (rev.op === 'restore') text = `${who} ha ripristinato l'idea ${title}`;
      else if (changedStatus) text = `${who} ha spostato ${title} in «${statusLabel('idea', rev.status)}»`;
      break;
    case 'decision':
      if (rev.op === 'create') text = `${who} ha registrato la decisione ${title}`;
      else if (changedStatus) text = `${who} ha segnato la decisione ${title} come «${statusLabel('decision', rev.status)}»`;
      break;
    case 'experiment':
      if (rev.op === 'create') text = `${who} ha pianificato l'esperimento ${title}`;
      else if (changedStatus && rev.status === 'concluso') text = `${who} ha concluso l'esperimento ${title}`;
      break;
    case 'interview':
      if (rev.op === 'create') text = `${who} ha aggiunto l'intervista ${title}`;
      break;
    case 'contact':
      if (rev.op === 'create') text = `${who} ha aggiunto ${title} tra le persone con cui interfacciarsi`;
      break;
    case 'teamcanvas':
      if (rev.op === 'create' || rev.op === 'update') text = `${who} ha aggiornato il Team Canvas`;
      break;
    case 'equity':
      if (rev.op === 'create' || rev.op === 'update') text = `${who} ha aggiornato la divisione delle quote`;
      break;
    case 'criteria':
      if (rev.op === 'update') text = `${who} ha cambiato i criteri di valutazione`;
      break;
    default:
      if (BOARD_LABELS[rev.kind] && rev.op === 'create') text = `${who} ha creato ${BOARD_LABELS[rev.kind]}: ${title}`;
  }
  if (!text) return null;
  return { id: `r-${rev.id}`, text, href, at: rev.created_at, authorId: rev.author_id, kind: rev.kind };
}

export function describeComment(row) {
  if (row.deleted_at || row.edited_at) return null;
  const item = getItem(row.item_id);
  const who = memberName(row.author_id);
  const target = item ? quoted(item.title) : 'una scheda';
  const text = row.ai_task ? `${who} ha salvato una risposta di Claude su ${target}` : `${who} ha commentato ${target}`;
  const href = item?.kind === 'idea' ? `#/idea/${item.id}/commenti` : `#/elemento/${row.item_id}/commenti`;
  return { id: `c-${row.id}`, text, href, at: row.created_at, authorId: row.author_id, kind: 'comment' };
}

function add(note, { live = false } = {}) {
  if (!note || seen.has(note.id) || note.authorId === state.user?.id) return false;
  seen.add(note.id);
  items = [note, ...items].sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX);
  if (!newest || note.at > newest) newest = note.at;
  emit('notifications', { note, live });
  return true;
}

export const isUnread = (note) => (!lastRead || note.at > lastRead) && !readIds.has(note.id);
export const notifications = ({ includeRead = false } = {}) => (includeRead ? items : items.filter(isUnread));
export const unreadCount = () => items.filter(isUnread).length;

function saveReadIds() {
  writeLocal('notificheLetteSingole', [...readIds].slice(-200));
}

export function markRead(id) {
  if (readIds.has(id)) return;
  readIds.add(id);
  saveReadIds();
  emit('notifications', { note: null, live: false });
}

export function markAllRead() {
  lastRead = newest || new Date().toISOString();
  readIds = new Set();
  writeLocal('notificheLette', lastRead);
  saveReadIds();
  emit('notifications', { note: null, live: false });
}

export async function refreshNotifications() {
  const floor = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();
  const since = [newest, floor].filter(Boolean).sort().pop();
  try {
    const feed = await api.activityFeed(since, MAX);
    for (const rev of feed.revisions) add(describeRevision(rev));
    for (const row of feed.comments) add(describeComment(row));
    return true;
  } catch {
    return false;
  }
}

let offs = [];

export async function startNotifications() {
  stopNotifications();
  lastRead = readLocal('notificheLette', null);
  const stored = readLocal('notificheLetteSingole', []);
  readIds = new Set(Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : []);
  await refreshNotifications();
  if (!lastRead) markAllRead();
  offs = [
    on('revision', (rev) => add(describeRevision(rev), { live: true })),
    on('comment', (row) => add(describeComment(row), { live: true })),
    on('synced', () => refreshNotifications()),
  ];
}

export function stopNotifications() {
  offs.forEach((off) => off());
  offs = [];
  items = [];
  newest = null;
  seen.clear();
}

// Avvisi del browser, solo se la persona li ha attivati e il sito è in un'altra scheda.
export const browserAlertsEnabled = () => readLocal('avvisiBrowser', false) === true && typeof Notification !== 'undefined' && Notification.permission === 'granted';

export async function enableBrowserAlerts(enabled) {
  if (!enabled) {
    writeLocal('avvisiBrowser', false);
    return false;
  }
  if (typeof Notification === 'undefined') return false;
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  writeLocal('avvisiBrowser', permission === 'granted');
  return permission === 'granted';
}

export function browserAlert(note) {
  if (!browserAlertsEnabled() || document.visibilityState === 'visible') return;
  try {
    const alert = new Notification('ai-deep-endenti', { body: note.text, tag: note.id });
    alert.onclick = () => {
      window.focus();
      location.hash = note.href.replace(/^#/, '');
      alert.close();
    };
  } catch {
    // alcuni browser non permettono notifiche fuori da un service worker: si resta con la campanella
  }
}

