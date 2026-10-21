import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text, byText } from '../setup/dom.mjs';
import { IDS, ME, OTHER, XSS, boardItems, members } from '../setup/fixtures.mjs';

let api;
let store;
let router;
let app;
let chat;
let shell;
let original;
let outlet;
let calls;

const GENERAL = 'dddddddd-0000-4000-8000-000000000001';
const TOPIC = 'dddddddd-0000-4000-8000-000000000002';
const OLD = 'dddddddd-0000-4000-8000-000000000003';
const IDEA_CHAT = 'dddddddd-0000-4000-8000-000000000004';

const chats = () => [
  { id: GENERAL, title: 'Generale', is_general: true, idea_id: null, archived_at: null, created_at: '2026-10-01T10:00:00Z' },
  { id: TOPIC, title: 'Bandi', is_general: false, idea_id: null, archived_at: null, created_at: '2026-10-05T10:00:00Z' },
  { id: OLD, title: 'Vecchia', is_general: false, idea_id: null, archived_at: '2026-10-10T10:00:00Z', created_at: '2026-10-02T10:00:00Z' },
];
const msg = (over) => ({ id: 'eeeeeeee-0000-4000-8000-000000000001', chat_id: GENERAL, author_id: OTHER, body: 'Ciao squadra', created_at: '2026-10-21T09:00:00Z', edited_at: null, deleted_at: null, ...over });

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  chat = await import('../../assets/js/chat.js');
  shell = await import('../../assets/js/views/shell.js');
  original = { ...api };
  router.clearRoutes();
  app.registerRoutes();
});

beforeEach(async () => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  calls = { read: [], sent: [], created: [], updated: [] };
  api.listChats = async () => chats();
  api.chatOverview = async () => [
    { chat_id: GENERAL, last_message_at: '2026-10-21T09:00:00Z', unread: 2 },
    { chat_id: TOPIC, last_message_at: '2026-10-21T11:00:00Z', unread: 1 },
  ];
  api.listMessages = async (chatId) => (chatId === GENERAL ? [msg(), msg({ id: 'eeeeeeee-0000-4000-8000-000000000002', author_id: ME, body: 'Mio messaggio', created_at: '2026-10-21T09:05:00Z' })] : []);
  api.markChatRead = async (id) => calls.read.push(id);
  api.sendMessage = async (chatId, body, replyTo = null) => {
    calls.sent.push(replyTo ? [chatId, body, replyTo] : [chatId, body]);
    return msg({ id: 'eeeeeeee-0000-4000-8000-0000000000aa', chat_id: chatId, author_id: ME, body, reply_to: replyTo, created_at: '2026-10-21T12:00:00Z' });
  };
  api.createChat = async ({ title, ideaId }) => {
    calls.created.push({ title, ideaId });
    return { id: IDEA_CHAT, title, idea_id: ideaId, is_general: false, archived_at: null, created_at: '2026-10-21T12:00:00Z' };
  };
  api.updateChat = async (id, patch) => {
    calls.updated.push([id, patch]);
    return { ...chats().find((c) => c.id === id), ...patch };
  };
  chat.stopChats();
  await chat.startChats();
  outlet = document.createElement('main');
  document.body.querySelectorAll('dialog, .toasts').forEach((d) => d.remove());
  await router.startRouter(outlet, { fallback: app.notFoundView });
});

afterEach(() => {
  router.stopRouter();
  chat.stopChats();
  Object.assign(api, original);
});

async function visit(hash) {
  await router.render(hash);
  await flush(8);
  return text(outlet);
}

test('the list starts with Generale, then the most active chats, with unread counts; archived ones are hidden', async () => {
  await visit('#/chat');
  const titles = [...outlet.querySelectorAll('.chat-entry strong')].map((s) => s.textContent);
  assert.deepEqual(titles, ['Generale', 'Bandi']);
  assert.equal(outlet.querySelector(`a[href="#/chat/${GENERAL}"] .nav-badge`).textContent, '2');
  assert.equal(chat.totalUnread(), 3);
  byText(outlet, 'button', 'Mostra le archiviate (1)').click();
  assert.match(text(outlet.querySelector('.chat-list')), /Vecchia/);
});

test('the menu shows how many messages are waiting', async () => {
  const root = document.createElement('div');
  shell.buildShell(root, { onSignOut: () => {} });
  const badge = root.querySelector('a[href="#/chat"] .nav-badge');
  assert.equal(badge.textContent, '3');
  store.emit('chat-message', { row: msg({ id: 'eeeeeeee-0000-4000-8000-0000000000bb', chat_id: TOPIC }), inserted: true });
  assert.equal(badge.textContent, '4');
  assert.ok(root.querySelector('.menu-btn.has-unread'));
});

test('opening a chat shows the messages by day and marks them read', async () => {
  const body = await visit(`#/chat/${GENERAL}`);
  assert.match(body, /Ciao squadra/);
  assert.ok(outlet.querySelector('.chat-day'));
  assert.deepEqual(calls.read, [GENERAL]);
  assert.equal(chat.unreadOf(GENERAL), 0);
  const [theirs, mine] = outlet.querySelectorAll('.chat-message');
  assert.ok(theirs.querySelector('button[aria-label="Rispondi al messaggio"]'));
  assert.equal(theirs.querySelector('button[aria-label="Modifica il messaggio"], button[aria-label="Elimina il messaggio"]'), null, 'i messaggi degli altri non si modificano');
  assert.ok(mine.querySelector('button[aria-label="Modifica il messaggio"]'));
  assert.equal(outlet.querySelector('.chat-head .btn'), null, 'la Generale non si rinomina né si archivia');
});

test('Enter sends, Shift+Enter goes to a new line', async () => {
  await visit(`#/chat/${GENERAL}`);
  const input = outlet.querySelector('textarea.chat-input');
  input.value = 'Prima riga';
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
  assert.equal(calls.sent.length, 0);
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
  await flush(5);
  assert.deepEqual(calls.sent, [[GENERAL, 'Prima riga']]);
  assert.equal(input.value, '');
  assert.match(text(outlet.querySelector('.chat-messages')), /Prima riga/);
});

test('messages arriving live appear in the open chat and count as unread elsewhere', async () => {
  await visit(`#/chat/${GENERAL}`);
  store.emit('chat-message', { row: msg({ id: 'eeeeeeee-0000-4000-8000-0000000000cc', body: 'Arrivato ora', created_at: '2026-10-21T13:00:00Z' }), inserted: true });
  await flush(3);
  assert.match(text(outlet.querySelector('.chat-messages')), /Arrivato ora/);
  assert.equal(chat.unreadOf(GENERAL), 0);
  store.emit('chat-message', { row: msg({ id: 'eeeeeeee-0000-4000-8000-0000000000dd', chat_id: TOPIC, body: 'Altra chat' }), inserted: true });
  await flush(3);
  assert.equal(chat.unreadOf(TOPIC), 2);
  assert.doesNotMatch(text(outlet.querySelector('.chat-messages')), /Altra chat/);
});

test('my messages can be edited and deleted; a deleted message loses its text and its images', async () => {
  const removed = [];
  api.editMessage = async (id, body) => msg({ id, author_id: ME, body, edited_at: '2026-10-21T12:00:00Z' });
  api.deleteMessage = async (id) => msg({ id, author_id: ME, body: 'eliminato', deleted_at: '2026-10-21T12:01:00Z' });
  api.noteImageOrphans = async (paths) => paths;
  api.removeNoteImages = async (paths) => removed.push(...paths);
  const image = `${GENERAL}/11111111-1111-4111-8111-111111111111.jpg`;
  api.listMessages = async () => [msg({ author_id: ME, body: `Foto ![lavagna](immagine:${image})` })];
  api.downloadNoteImage = async () => new Blob(['x']);
  await visit(`#/chat/${GENERAL}`);
  outlet.querySelector('button[aria-label="Modifica il messaggio"]').click();
  const editor = outlet.querySelector('.chat-message textarea');
  editor.value = 'Testo corretto';
  byText(outlet, 'button', 'Salva').click();
  await flush(5);
  assert.match(text(outlet.querySelector('.chat-message')), /Testo corretto.*|modificato/);
  assert.deepEqual(removed, [image], 'l\'immagine tolta dal messaggio si cancella');
  outlet.querySelector('button[aria-label="Elimina il messaggio"]').click();
  await flush();
  byText(document.querySelector('dialog'), 'button', 'Elimina').click();
  await flush(5);
  assert.match(text(outlet.querySelector('.chat-message')), /Messaggio eliminato/);
});

test('a new chat can be linked to an idea and takes its name', async () => {
  await visit('#/chat');
  byText(outlet, 'button', 'Nuova').click();
  await flush();
  const dialog = document.querySelector('dialog');
  const select = dialog.querySelector('select');
  select.value = IDS.idea;
  select.dispatchEvent(new Event('change'));
  assert.equal(dialog.querySelector('input').value, 'Idea alfa');
  byText(dialog, 'button', 'Crea').click();
  await flush(5);
  assert.deepEqual(calls.created, [{ title: 'Idea alfa', ideaId: IDS.idea }]);
  assert.equal(location.hash, `#/chat/${IDEA_CHAT}`);
});

test('the idea page opens its chat, creating it the first time', async () => {
  await visit(`#/idea/${IDS.idea}`);
  byText(outlet, 'button', 'Chat dell\'idea').click();
  await flush(5);
  assert.equal(calls.created.length, 1);
  assert.equal(location.hash, `#/chat/${IDEA_CHAT}`);
  await visit(`#/idea/${IDS.idea}`);
  byText(outlet, 'button', 'Chat dell\'idea').click();
  await flush(5);
  assert.equal(calls.created.length, 1, 'la seconda volta riapre la stessa chat');
});

test('a topic chat can be archived: it stays readable but nobody can write', async () => {
  await visit(`#/chat/${TOPIC}`);
  byText(outlet, 'button', 'Archivia').click();
  await flush();
  byText(document.querySelector('dialog'), 'button', 'Archivia').click();
  await flush(5);
  assert.equal(calls.updated[0][0], TOPIC);
  assert.ok(calls.updated[0][1].archived_at);
  assert.equal(outlet.querySelector('textarea.chat-input'), null);
  assert.match(text(outlet.querySelector('.chat-panel')), /Chat archiviata/);
});

test('message text never becomes HTML', async () => {
  api.listMessages = async () => [msg({ body: `${XSS} **ok**` })];
  await visit(`#/chat/${GENERAL}`);
  assert.equal(document.querySelector('img[src="x"], script'), null);
  assert.equal(outlet.querySelector('.chat-body strong').textContent, 'ok');
});

test('a message can answer a specific message, which is quoted and reachable with a click', async () => {
  await visit(`#/chat/${GENERAL}`);
  const theirs = outlet.querySelector('.chat-message');
  theirs.querySelector('button[aria-label="Rispondi al messaggio"]').click();
  const bar = outlet.querySelector('.chat-reply-bar');
  assert.equal(bar.hidden, false);
  assert.match(text(bar), /Rispondi a\s*Bruno\s*Ciao squadra/);
  const input = outlet.querySelector('textarea.chat-input');
  input.value = 'Ciao a te';
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
  await flush(5);
  assert.deepEqual(calls.sent, [[GENERAL, 'Ciao a te', msg().id]]);
  assert.equal(bar.hidden, true, 'dopo l\'invio la risposta si chiude');
  const reply = [...outlet.querySelectorAll('.chat-message')].at(-1);
  const quote = reply.querySelector('button.chat-quote');
  assert.match(text(quote), /Bruno\s*Ciao squadra/);
  quote.click();
  await flush(3);
  assert.ok(outlet.querySelector(`#msg-${msg().id}.is-highlight`));

  theirs.querySelector('button[aria-label="Rispondi al messaggio"]').click();
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(bar.hidden, true, 'Esc annulla la risposta');
});

test('a quoted message that is not loaded yet is fetched, and links in messages are clickable and safe', async () => {
  const OLDER = 'eeeeeeee-0000-4000-8000-0000000000ee';
  const asked = [];
  api.getMessages = async (ids) => {
    asked.push(...ids);
    return [msg({ id: OLDER, body: 'Messaggio di ieri', created_at: '2026-10-20T09:00:00Z' })];
  };
  api.listMessages = async () => [msg({ reply_to: OLDER, body: 'Guarda https://example.com/bando_2026. e [il PDF](https://x.it/a.pdf) e javascript:alert(1)' })];
  await visit(`#/chat/${GENERAL}`);
  await flush(5);
  assert.deepEqual(asked, [OLDER]);
  assert.match(text(outlet.querySelector('.chat-quote')), /Messaggio di ieri/);
  const links = [...outlet.querySelectorAll('.chat-body a')];
  assert.deepEqual(links.map((a) => a.getAttribute('href')), ['https://example.com/bando_2026', 'https://x.it/a.pdf']);
  assert.ok(links.every((a) => a.target === '_blank' && /noopener/.test(a.rel) && /noreferrer/.test(a.rel)));
  assert.match(text(outlet.querySelector('.chat-body')), /javascript:alert\(1\)/, 'gli altri indirizzi restano testo');
});
