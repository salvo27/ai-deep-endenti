import { api } from './lib/api.js';
import { toast } from './lib/dom.js';
import { browserAlert } from './notifications.js';
import { chatState } from './chat.js';
import { emit, getItem, memberName, on, state } from './store.js';

// Notifiche importanti: chi ti ha taggato, dove, e se l'hai già vista. Separate dalla campanella.
export const mentionState = { items: [], loaded: false };

export const unreadMentions = () => mentionState.items.filter((m) => !m.read_at).length;

export function mentionWhere(row) {
  if (row.source === 'chat') return `in «${chatState.chats.get(row.chat_id)?.title || 'chat'}»`;
  const item = getItem(row.item_id);
  if (row.source === 'note') return `nella nota «${item?.title || 'nota'}»`;
  return `in un commento su «${item?.title || 'una scheda'}»`;
}

export const mentionText = (row) => `${memberName(row.author_id)} ti ha taggato ${mentionWhere(row)}`;

export function mentionHref(row) {
  if (row.source === 'chat') return `#/chat/${row.chat_id}?messaggio=${row.source_id}`;
  if (row.source === 'note') return `#/elemento/${row.item_id}`;
  return getItem(row.item_id)?.kind === 'idea' ? `#/idea/${row.item_id}/commenti` : `#/elemento/${row.item_id}/commenti`;
}

export async function loadMentions() {
  mentionState.items = await api.listMentions();
  mentionState.loaded = true;
  emit('mentions');
}

function onRow({ row, removed }) {
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

export async function markMentionsRead(ids = null) {
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
  await api.markMentionsRead(ids).catch(() => {});
}

// Aprendo il punto in cui si è stati taggati, la menzione è letta.
export function markReadWhere(match) {
  const ids = mentionState.items.filter((m) => !m.read_at && match(m)).map((m) => m.id);
  if (ids.length) markMentionsRead(ids);
}
