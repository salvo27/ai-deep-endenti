import { api } from './lib/api.js';
import { tx } from './i18n/index.js';
import { browserAlert, ofOpenProject } from './notifications.js';
import { currentProjectId, emit, memberName, on, state } from './store.js';
import { noteExcerpt } from './notes.js';

const t = tx.chat;

// Stato delle chat del progetto aperto: elenco, ultimo messaggio e non letti per chat. I messaggi si caricano solo
// aprendo una chat.
export const chatState = { chats: new Map(), info: new Map(), active: null, loaded: false };

/** The name to show. The general chat is stored as 'Generale' in every project and is shown in the reader's language. */
export const chatTitle = (chat) => (chat?.is_general ? t.general : chat?.title || t.fallbackTitle);

const infoOf = (id) => chatState.info.get(id) || { last_message_at: null, unread: 0 };

function applyChat(row) {
  if (!ofOpenProject(row)) return;
  chatState.chats.set(row.id, row);
  emit('chats');
}

// Without a project nothing is asked: the database would answer with the chats of every project of the person.
export async function loadChats() {
  const project = currentProjectId();
  if (!project) {
    chatState.chats = new Map();
    chatState.info = new Map();
    chatState.loaded = false;
    emit('chats');
    return;
  }
  const [rows, overview] = await Promise.all([api.listChats(project), api.chatOverview(project)]);
  chatState.chats = new Map((rows || []).filter(ofOpenProject).map((c) => [c.id, c]));
  chatState.info = new Map((overview || []).map((o) => [o.chat_id, { last_message_at: o.last_message_at, unread: o.unread || 0 }]));
  chatState.loaded = true;
  emit('chats');
}

const isWatching = (chatId) => chatState.active === chatId && document.visibilityState === 'visible';

function onMessage({ row, inserted }) {
  if (!inserted || !ofOpenProject(row)) return;
  const info = { ...infoOf(row.chat_id) };
  info.last_message_at = row.created_at;
  if (row.author_id !== state.user?.id && !row.deleted_at) {
    if (!isWatching(row.chat_id)) info.unread += 1;
    browserAlert({
      id: `m-${row.id}`,
      text: t.alert(memberName(row.author_id), chatTitle(chatState.chats.get(row.chat_id)), noteExcerpt(row.body, 120)),
      href: `#/chat/${row.chat_id}`,
    });
  }
  chatState.info.set(row.chat_id, info);
  emit('chats');
}

let offs = [];
let lastLoad = 0;

// Al riallineamento dei dati si ricaricano anche i non letti, ma al massimo ogni 30 secondi.
function reloadSoon() {
  if (Date.now() - lastLoad < 30000) return;
  lastLoad = Date.now();
  loadChats().catch(() => {});
}

export function startChats() {
  stopChats();
  lastLoad = Date.now();
  offs = [on('chat-row', applyChat), on('chat-message', onMessage), on('synced', reloadSoon)];
  return loadChats().catch(() => {});
}

export function stopChats() {
  offs.forEach((off) => off());
  offs = [];
  markTimers.forEach((timer) => clearTimeout(timer));
  markTimers.clear();
  lastMark.clear();
  chatState.chats = new Map();
  chatState.info = new Map();
  chatState.active = null;
  chatState.loaded = false;
}

export const lastMessageAt = (id) => infoOf(id).last_message_at;
export const unreadOf = (id) => infoOf(id).unread;
export const totalUnread = () => [...chatState.chats.values()].filter((c) => !c.archived_at).reduce((sum, c) => sum + unreadOf(c.id), 0);

// La Generale per prima, poi le altre dalla più attiva.
export function chatList({ archived = false } = {}) {
  const recent = (c) => lastMessageAt(c.id) || c.created_at || '';
  return [...chatState.chats.values()]
    .filter((c) => Boolean(c.archived_at) === archived)
    .sort((a, b) => (b.is_general ? 1 : 0) - (a.is_general ? 1 : 0) || recent(b).localeCompare(recent(a)));
}

export const generalChat = () => [...chatState.chats.values()].find((c) => c.is_general) || null;
export const ideaChat = (ideaId) => [...chatState.chats.values()].find((c) => c.idea_id === ideaId && !c.archived_at) || null;

export function setActiveChat(id) {
  chatState.active = id;
}

const lastMark = new Map();
const markTimers = new Map();

// Azzera subito il contatore; nel database la lettura si registra al massimo ogni 2 secondi per chat.
export function markChatRead(chatId) {
  if (unreadOf(chatId)) {
    chatState.info.set(chatId, { ...infoOf(chatId), unread: 0 });
    emit('chats');
  }
  clearTimeout(markTimers.get(chatId));
  const run = () => {
    markTimers.delete(chatId);
    lastMark.set(chatId, Date.now());
    api.markChatRead(chatId).catch(() => {});
  };
  const wait = 2000 - (Date.now() - (lastMark.get(chatId) || 0));
  if (wait <= 0) run();
  else markTimers.set(chatId, setTimeout(run, wait));
}

// A chat is born in the open project and stays there.
export async function createChat({ title, ideaId = null }) {
  const row = await api.createChat({ title, ideaId, projectId: currentProjectId() });
  applyChat(row);
  return row;
}

export async function openIdeaChat(idea) {
  return ideaChat(idea.id) || createChat({ title: idea.title.slice(0, 80), ideaId: idea.id });
}
