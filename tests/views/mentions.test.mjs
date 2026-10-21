import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text, byText } from '../setup/dom.mjs';
import { IDS, ME, OTHER, boardItems, members } from '../setup/fixtures.mjs';

let api;
let store;
let router;
let app;
let chat;
let mentions;
let shell;
let comments;
let original;
let outlet;

const GENERAL = 'dddddddd-0000-4000-8000-000000000001';
const MSG = 'eeeeeeee-0000-4000-8000-000000000001';
const mention = (over) => ({ id: 1, user_id: ME, author_id: OTHER, source: 'chat', source_id: MSG, chat_id: GENERAL, item_id: null, excerpt: 'Ciao @Anna, guarda', created_at: '2026-10-22T09:00:00Z', read_at: null, ...over });

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  chat = await import('../../assets/js/chat.js');
  mentions = await import('../../assets/js/mentions.js');
  shell = await import('../../assets/js/views/shell.js');
  comments = await import('../../assets/js/views/comments.js');
  original = { ...api };
  router.clearRoutes();
  app.registerRoutes();
});

let read;

beforeEach(async () => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  read = [];
  api.listChats = async () => [{ id: GENERAL, title: 'Generale', is_general: true, idea_id: null, archived_at: null, created_at: '2026-10-01T10:00:00Z' }];
  api.chatOverview = async () => [];
  api.markChatRead = async () => {};
  api.listMentions = async () => [mention(), mention({ id: 2, source: 'comment', source_id: 'cccccccc-0000-4000-8000-000000000001', chat_id: null, item_id: IDS.idea, read_at: '2026-10-22T08:00:00Z' })];
  api.markMentionsRead = async (ids) => read.push(ids);
  chat.stopChats();
  await chat.startChats();
  mentions.stopMentions();
  await mentions.startMentions();
  outlet = document.createElement('main');
  document.body.querySelectorAll('dialog, .toasts').forEach((d) => d.remove());
  await router.startRouter(outlet, { fallback: app.notFoundView });
});

afterEach(() => {
  router.stopRouter();
  chat.stopChats();
  mentions.stopMentions();
  Object.assign(api, original);
});

const type = (area, value) => {
  area.value = value;
  area.setSelectionRange(value.length, value.length);
  area.dispatchEvent(new Event('input'));
};

test('typing @ in a comment suggests the team and inserts the tag, shown highlighted', async () => {
  let added = null;
  api.listComments = async () => [{ id: 'cccccccc-0000-4000-8000-000000000001', item_id: IDS.idea, body: 'Per @[Anna]: fatto', author_id: OTHER, created_at: '2026-10-22T09:00:00Z' }];
  api.addComment = async (itemId, body) => (added = { id: 'cccccccc-0000-4000-8000-000000000009', item_id: itemId, body, author_id: ME, created_at: '2026-10-22T10:00:00Z' });
  mentions.mentionState.items.find((m) => m.id === 2).read_at = null;
  const panel = comments.commentsPanel(store.getItem(IDS.idea));
  document.body.append(panel);
  await flush(5);
  const chip = panel.querySelector('.comments .mention');
  assert.equal(chip.textContent, '@Anna');
  assert.ok(chip.classList.contains('is-me'));
  assert.deepEqual(read, [[2]], 'aprendo i commenti la menzione è letta');
  const area = panel.querySelector('textarea');
  type(area, 'Guarda @br');
  const menu = panel.querySelector('.mention-menu');
  assert.equal(menu.hidden, false);
  assert.deepEqual([...menu.querySelectorAll('.mention-option > span:last-child')].map((o) => o.textContent), ['Bruno']);
  area.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
  assert.equal(area.value, 'Guarda @[Bruno] ');
  assert.equal(menu.hidden, true);
  type(area, '@tu');
  assert.match(text(panel.querySelector('.mention-menu')), /@tutti/);
  panel.remove();
});

test('in chat, Enter picks the person while the list is open and sends only after', async () => {
  const sent = [];
  api.listMessages = async () => [];
  api.sendMessage = async (chatId, body) => {
    sent.push(body);
    return { id: crypto.randomUUID(), chat_id: chatId, author_id: ME, body, created_at: '2026-10-22T10:00:00Z' };
  };
  await router.render(`#/chat/${GENERAL}`);
  await flush(8);
  const input = outlet.querySelector('textarea.chat-input');
  type(input, 'Ciao @Ch');
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
  assert.equal(input.value, 'Ciao @[Chiara] ');
  assert.deepEqual(sent, [], 'Invio ha scelto la persona, non ha mandato il messaggio');
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
  await flush(5);
  assert.deepEqual(sent, ['Ciao @[Chiara]']);
  assert.equal(outlet.querySelector('.chat-body .mention').textContent, '@Chiara');
});

test('a message that tags me stands out, and my tag has its own colour', async () => {
  api.listMessages = async () => [{ id: MSG, chat_id: GENERAL, author_id: OTHER, body: 'Ciao @[Anna] e @[Chiara]', created_at: '2026-10-22T09:00:00Z' }];
  await router.render(`#/chat/${GENERAL}?messaggio=${MSG}`);
  await flush(8);
  const message = outlet.querySelector(`#msg-${MSG}`);
  assert.ok(message.classList.contains('mentions-me'));
  assert.ok(message.classList.contains('is-highlight'), 'arrivando da una menzione si va al messaggio');
  assert.deepEqual([...message.querySelectorAll('.mention')].map((m) => [m.textContent, m.classList.contains('is-me')]), [['@Anna', true], ['@Chiara', false]]);
  assert.deepEqual(read, [[1]], 'aprendo la chat la menzione è letta');
});

test('the @ button is separate from the bell: own count, own list, read on click', async () => {
  const root = document.createElement('div');
  shell.buildShell(root, { onSignOut: () => {} });
  const button = root.querySelector('.mentions-btn');
  assert.equal(button.querySelector('.bell-badge').textContent, '1');
  button.click();
  const panel = button.parentElement.querySelector('.bell-panel');
  const items = [...panel.querySelectorAll('.mention-item')];
  assert.equal(items.length, 2);
  assert.match(text(items[0]), /Bruno ti ha taggato in «Generale».*Ciao @Anna, guarda/);
  assert.match(text(items[1]), /in un commento su «Idea alfa»/);
  assert.equal(items[0].querySelector('a').getAttribute('href'), `#/chat/${GENERAL}?messaggio=${MSG}`);
  assert.equal(items[1].querySelector('a').getAttribute('href'), `#/idea/${IDS.idea}/commenti`);
  items[0].querySelector('a').click();
  assert.deepEqual(read, [[1]]);
  assert.equal(button.querySelector('.bell-badge').hidden, true);
});

test('a new tag arrives live with a notice, and disappears if the message is deleted', async () => {
  const root = document.createElement('div');
  shell.buildShell(root, { onSignOut: () => {} });
  const badge = root.querySelector('.mentions-btn .bell-badge');
  store.emit('mention-row', { row: mention({ id: 3, source: 'note', source_id: IDS.idea, item_id: IDS.idea, chat_id: null }), removed: false });
  assert.equal(badge.textContent, '2');
  assert.match(text(document.querySelector('.toasts')), /@ Bruno ti ha taggato nella nota «Idea alfa»/);
  store.emit('mention-row', { row: mention({ id: 9, user_id: OTHER }), removed: false });
  assert.equal(badge.textContent, '2', 'le menzioni degli altri non contano');
  store.emit('mention-row', { row: { id: 3 }, removed: true });
  assert.equal(badge.textContent, '1');
});
