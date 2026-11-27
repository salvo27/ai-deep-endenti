import { api } from './lib/api.js';
import { routeFor, statusLabel } from './schema.js';
import { currentProjectId, emit, getItem, memberName, on, readLocal, state, timesheetsOf, writeLocal } from './store.js';
import { addDays, thisMonday, weekLabel } from './availability.js';
import { pledgeFor, sanitizeTimesheet } from './timesheet.js';
import { tx } from './i18n/index.js';

// Notifiche: cosa fanno gli altri nel progetto aperto che vale la pena sapere. Le modifiche minori ai testi restano nello
// storico.

const t = tx.notifications;

// What arrives live is already filtered on the open project by the database; a row that names another project is not
// for this page all the same (the realtime rows always carry project_id; the ones read with a query have no need to).
export const ofOpenProject = (row) => Boolean(row) && (row.project_id === undefined || row.project_id === null || row.project_id === currentProjectId());

const MAX = 60;
const LOOKBACK_DAYS = 14;
// The other sheets of an idea are announced when they are created; the phrase with its article is in the texts.
const boardPhrase = (kind) => (Object.hasOwn(t.boards, kind) ? t.boards[kind] : null);

let items = [];
let lastRead = null;
let newest = null;
const seen = new Set();
// Letture singole (clic su una notifica), oltre al «segna tutte come lette» che sposta lastRead.
let readIds = new Set();

// What was read is kept per project: reading everything in one project says nothing about the others.
const LAST_READ = 'notificheLette';
const READ_IDS = 'notificheLetteSingole';
const readKey = (name) => `${name}:${currentProjectId()}`;

const routeOf = (kind, id) => routeFor({ kind, id });
const quoted = (title) => t.quote(title || t.untitled);

function expenseText(rev, who, title) {
  const item = getItem(rev.item_id);
  const group = getItem(item?.data?.group);
  const where = group ? t.expense.inGroup(quoted(group.title)) : '';
  if (item?.data?.type === 'rimborso') return t.expense.refund(who, where);
  if (item?.data?.type === 'entrata') return t.expense.income(who, title, where);
  return t.expense.expense(who, title, where);
}

export function describeRevision(rev) {
  const who = memberName(rev.author_id);
  const title = quoted(rev.title);
  const changedStatus = rev.op === 'update' && Array.isArray(rev.changed) && rev.changed.includes('status');
  const href = rev.kind === 'expense' ? routeFor(getItem(rev.item_id) || { kind: rev.kind, id: rev.item_id }) : routeOf(rev.kind, rev.item_id);
  let text = null;
  switch (rev.kind) {
    case 'idea':
      if (rev.op === 'create') text = t.idea.created(who, title);
      else if (rev.op === 'delete') text = t.idea.archived(who, title);
      else if (rev.op === 'restore') text = t.idea.restored(who, title);
      else if (changedStatus) text = t.idea.moved(who, title, statusLabel('idea', rev.status));
      break;
    case 'decision':
      if (rev.op === 'create') text = t.decision.created(who, title);
      else if (changedStatus) text = t.decision.marked(who, title, statusLabel('decision', rev.status));
      break;
    case 'experiment':
      if (rev.op === 'create') text = t.experiment.planned(who, title);
      else if (changedStatus && rev.status === 'concluso') text = t.experiment.concluded(who, title);
      break;
    case 'interview':
      if (rev.op === 'create') text = t.interview(who, title);
      break;
    case 'contact':
      if (rev.op === 'create') text = t.contact(who, title);
      break;
    case 'survey':
      if (rev.op === 'create') text = t.survey.created(who, title);
      else if (changedStatus && rev.status === 'aperto') text = t.survey.opened(who, title); // i18n-ignore: stored status
      break;
    case 'teamcanvas':
      if (rev.op === 'create' || rev.op === 'update') text = t.teamcanvas(who);
      break;
    case 'equity':
      if (rev.op === 'create' || rev.op === 'update') text = t.equity(who);
      break;
    case 'criteria':
      if (rev.op === 'update') text = t.criteria(who);
      break;
    case 'expensegroup':
      if (rev.op === 'create') text = t.expensegroup(who, title);
      break;
    case 'expense':
      if (rev.op === 'create') text = expenseText(rev, who, title);
      break;
    default:
      if (boardPhrase(rev.kind) && rev.op === 'create') text = t.board(who, boardPhrase(rev.kind), title);
  }
  if (!text) return null;
  return { id: `r-${rev.id}`, text, href, at: rev.created_at, authorId: rev.author_id, kind: rev.kind };
}

export function describeComment(row) {
  if (row.deleted_at || row.edited_at) return null;
  const item = getItem(row.item_id);
  const who = memberName(row.author_id);
  const target = item ? quoted(item.title) : t.aCard;
  const text = row.ai_task ? t.claudeAnswer(who, target) : t.comment(who, target);
  const href = item?.kind === 'idea' ? `#/idea/${item.id}/commenti` : `#/elemento/${row.item_id}/commenti`; // i18n-ignore: address
  return { id: `c-${row.id}`, text, href, at: row.created_at, authorId: row.author_id, kind: 'comment' };
}

function add(note, { live = false } = {}) {
  if (!note || seen.has(note.id) || note.authorId === state.user?.id) return false;
  seen.add(note.id);
  items = [note, ...items].sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX);
  // Il promemoria nasce sul dispositivo: non deve spostare il punto da cui si chiede il resto delle notifiche.
  if (note.kind !== 'reminder' && (!newest || note.at > newest)) newest = note.at;
  emit('notifications', { note, live });
  return true;
}

// Promemoria del lunedì, solo per chi usa già le ore: la settimana scorsa è vuota e non aveva dichiarato zero ore.
export function timesheetReminder(now = new Date()) {
  if (!['admin', 'member'].includes(state.me?.role)) return null;
  const weeks = new Map(
    timesheetsOf(state.user?.id)
      .map((item) => sanitizeTimesheet(item.data))
      .filter((data) => data.week)
      .map((data) => [data.week, data]),
  );
  const monday = thisMonday(now);
  const lastWeek = addDays(monday, -7);
  // Chi ha cominciato solo questa settimana non ha niente da recuperare.
  if (![...weeks.keys()].some((week) => week <= lastWeek)) return null;
  if (weeks.get(lastWeek)?.entries.length || pledgeFor(weeks, lastWeek) === 0) return null;
  const [y, m, d] = monday.split('-').map(Number);
  const at = new Date(y, m - 1, d, 8);
  if (now < at) return null;
  return {
    id: `t-${lastWeek}`,
    text: t.reminder(weekLabel(lastWeek)),
    href: `#/squadra/ore?vista=mie&settimana=${lastWeek}`, // i18n-ignore: address
    at: at.toISOString(),
    authorId: null,
    kind: 'reminder',
  };
}

function syncReminder() {
  const note = timesheetReminder();
  const stale = items.filter((n) => n.kind === 'reminder' && n.id !== note?.id);
  if (stale.length) {
    items = items.filter((n) => !stale.includes(n));
    stale.forEach((n) => seen.delete(n.id));
    emit('notifications', { note: null, live: false });
  }
  if (note) add(note);
}

export const isUnread = (note) => (!lastRead || note.at > lastRead) && !readIds.has(note.id);
export const notifications = ({ includeRead = false } = {}) => (includeRead ? items : items.filter(isUnread));
export const unreadCount = () => items.filter(isUnread).length;

function saveReadIds() {
  writeLocal(readKey(READ_IDS), [...readIds].slice(-200));
}

export function markRead(id) {
  if (readIds.has(id)) return;
  readIds.add(id);
  saveReadIds();
  emit('notifications', { note: null, live: false });
}

export function markAllRead() {
  // Anche il promemoria, che non sposta newest, conta come letto.
  const latest = items.reduce((max, note) => (note.at > max ? note.at : max), newest || '');
  lastRead = latest || new Date().toISOString();
  readIds = new Set();
  writeLocal(readKey(LAST_READ), lastRead);
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

// Only for the open project: without one there is nothing to read nor to listen to.
export async function startNotifications() {
  stopNotifications();
  if (!currentProjectId()) return;
  lastRead = readLocal(readKey(LAST_READ), null);
  const stored = readLocal(readKey(READ_IDS), []);
  readIds = new Set(Array.isArray(stored) ? stored.filter((id) => typeof id === 'string') : []);
  await refreshNotifications();
  if (!lastRead) markAllRead();
  syncReminder();
  offs = [
    on('revision', (rev) => ofOpenProject(rev) && add(describeRevision(rev), { live: true })),
    on('comment', (row) => ofOpenProject(row) && add(describeComment(row), { live: true })),
    on('synced', () => refreshNotifications().then(syncReminder)),
    on('item', ({ item }) => {
      if (item.kind === 'timesheet') syncReminder();
    }),
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

// With more projects the alert says which one it comes from.
const alertTitle = () => (state.project?.name ? `${tx.common.appName} · ${state.project.name}` : tx.common.appName);

export function browserAlert(note) {
  if (!browserAlertsEnabled() || document.visibilityState === 'visible') return;
  try {
    const alert = new Notification(alertTitle(), { body: note.text, tag: note.id });
    alert.onclick = () => {
      window.focus();
      location.hash = note.href.replace(/^#/, '');
      alert.close();
    };
  } catch {
    // alcuni browser non permettono notifiche fuori da un service worker: si resta con la campanella
  }
}

