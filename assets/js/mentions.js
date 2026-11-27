import { api } from './lib/api.js';
import { toast } from './lib/dom.js';
import { ALL } from './lib/mentions.js';
import { tx } from './i18n/index.js';
import { browserAlert, ofOpenProject } from './notifications.js';
import { chatState, chatTitle } from './chat.js';
import { currentProjectId, emit, getItem, memberName, on, state } from './store.js';

const t = tx.mentions;

// Notifiche importanti del progetto aperto: chi ti ha taggato, dove, e se l'hai già vista. Separate dalla campanella.
export const mentionState = { items: [], loaded: false };

export const unreadMentions = () => mentionState.items.filter((m) => !m.read_at).length;

export function mentionWhere(row) {
  if (row.source === 'chat') return t.inChat(chatTitle(chatState.chats.get(row.chat_id)));
  const item = getItem(row.item_id);
  if (row.source === 'note') return t.inNote(item?.title || t.note);
  return t.inComment(item?.title || t.card);
}

export const mentionText = (row) => t.tagged(memberName(row.author_id), mentionWhere(row));

// The database writes the excerpt with @tutti for the tag of everyone and [immagine] for an image: shown in the
// reader's words. A member whose name starts with "tutti" keeps it.
const EVERYONE = new RegExp(`@${ALL}(?![\\p{L}\\p{N}])`, 'giu');
const IMAGE = '[immagine]'; // i18n-ignore: the placeholder the database writes

export function mentionExcerpt(text) {
  const named = state.members.map((m) => (typeof m.display_name === 'string' ? m.display_name.toLowerCase() : '')).filter((name) => name.startsWith(ALL) && name !== ALL);
  return String(text ?? '')
    .split(IMAGE)
    .join(`[${t.image}]`)
    .replace(EVERYONE, (match, offset, whole) => (named.some((name) => whole.slice(offset + 1).toLowerCase().startsWith(name)) ? match : `@${t.everyone}`));
}

export function mentionHref(row) {
  if (row.source === 'chat') return `#/chat/${row.chat_id}?messaggio=${row.source_id}`; // i18n-ignore: address
  if (row.source === 'note') return `#/elemento/${row.item_id}`;
  return getItem(row.item_id)?.kind === 'idea' ? `#/idea/${row.item_id}/commenti` : `#/elemento/${row.item_id}/commenti`; // i18n-ignore: address
}

// Without a project nothing is asked: the rules of the database would return the mentions of every project.
export async function loadMentions() {
  const project = currentProjectId();
  if (!project) {
    mentionState.items = [];
    mentionState.loaded = false;
    emit('mentions');
    return;
  }
  const rows = await api.listMentions(project);
  mentionState.items = (rows || []).filter(ofOpenProject);
  mentionState.loaded = true;
  emit('mentions');
}

function onRow({ row, removed }) {
  if (!ofOpenProject(row)) return;
  const index = mentionState.items.findIndex((m) => m.id === row.id);
  if (removed) {
    if (index >= 0) mentionState.items.splice(index, 1);
    emit('mentions');
    return;
  }
  if (row.user_id !== state.user?.id) return;
  if (index >= 0) {
    mentionState.items[index] = row;
  } else {
    mentionState.items = [row, ...mentionState.items].slice(0, 50);
    if (!row.read_at) {
      const text = mentionText(row);
      if (document.visibilityState === 'visible') toast(`@ ${text}`);
      else browserAlert({ id: `men-${row.id}`, text, href: mentionHref(row) });
    }
  }
  emit('mentions');
}

let offs = [];
let lastLoad = 0;

export function startMentions() {
  stopMentions();
  lastLoad = Date.now();
  offs = [
    on('mention-row', onRow),
    on('synced', () => {
      if (Date.now() - lastLoad < 30000) return;
      lastLoad = Date.now();
      loadMentions().catch(() => {});
    }),
  ];
  return loadMentions().catch(() => {});
}

export function stopMentions() {
  offs.forEach((off) => off());
  offs = [];
  mentionState.items = [];
  mentionState.loaded = false;
}

// Without ids, all of them: only those of the open project, the other projects keep theirs unread.
export async function markMentionsRead(ids = null) {
  const project = currentProjectId();
  if (!project) return;
  const now = new Date().toISOString();
  let changed = false;
  for (const m of mentionState.items) {
    if (!m.read_at && (!ids || ids.includes(m.id))) {
      m.read_at = now;
      changed = true;
    }
  }
  if (!changed) return;
  emit('mentions');
  await api.markMentionsRead(ids, project).catch(() => {});
}

// Aprendo il punto in cui si è stati taggati, la menzione è letta.
export function markReadWhere(match) {
  const ids = mentionState.items.filter((m) => !m.read_at && match(m)).map((m) => m.id);
  if (ids.length) markMentionsRead(ids);
}
