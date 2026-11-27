import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, text, byText } from '../setup/dom.mjs';
import { italianWords } from '../setup/italian.mjs';
import { ME, OTHER, PROJECT, boardItems, members } from '../setup/fixtures.mjs';

// Su un dispositivo in inglese: la lingua si decide quando il sito si carica, per questo i moduli arrivano dopo la scelta.
useLanguage('en');

let api;
let store;
let router;
let app;
let chat;
let original;
let outlet;
let calls;
let shown;

const GENERAL = 'dddddddd-0000-4000-8000-000000000001';
const TOPIC = 'dddddddd-0000-4000-8000-000000000002';
const OLD = 'dddddddd-0000-4000-8000-000000000003';
const CREATED = 'dddddddd-0000-4000-8000-000000000004';
const OLDER = 'eeeeeeee-0000-4000-8000-0000000000ee';

const chats = () => [
  { id: GENERAL, project_id: PROJECT, title: 'Generale', is_general: true, idea_id: null, archived_at: null, created_at: '2026-10-01T10:00:00Z' },
  { id: TOPIC, project_id: PROJECT, title: 'Grants', is_general: false, idea_id: null, archived_at: null, created_at: '2026-10-05T10:00:00Z' },
  { id: OLD, project_id: PROJECT, title: 'Old', is_general: false, idea_id: null, archived_at: '2026-10-10T10:00:00Z', created_at: '2026-10-02T10:00:00Z' },
];
const msg = (over) => ({ id: 'eeeeeeee-0000-4000-8000-000000000001', project_id: PROJECT, chat_id: GENERAL, author_id: OTHER, body: 'Hello team', created_at: '2026-10-21T09:00:00Z', edited_at: null, deleted_at: null, ...over });
const mine = (over) => msg({ id: 'eeeeeeee-0000-4000-8000-000000000002', author_id: ME, body: 'My message', created_at: '2026-10-21T09:05:00Z', ...over });

class FakeNotification {
  static permission = 'granted';

  constructor(title, options) {
    shown.push({ title, ...options });
  }

  close() {}
}

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  chat = await import('../../assets/js/chat.js');
  original = { ...api };
  router.clearRoutes();
  app.registerRoutes();
});

beforeEach(async () => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setProject({ id: PROJECT, name: 'Alpha', role: 'admin' });
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  localStorage.clear();
  calls = { created: [], updated: [], deleted: [] };
  shown = [];
  api.listChats = async () => chats();
  api.chatOverview = async () => [{ chat_id: GENERAL, last_message_at: '2026-10-21T09:05:00Z', unread: 1 }];
  api.listMessages = async (chatId) => (chatId === GENERAL ? [msg(), mine()] : []);
  api.markChatRead = async () => {};
  api.createChat = async (args) => {
    calls.created.push(args);
    return { id: CREATED, project_id: PROJECT, title: args.title, idea_id: args.ideaId, is_general: false, archived_at: null, created_at: '2026-10-21T12:00:00Z' };
  };
  api.updateChat = async (id, patch) => {
    calls.updated.push([id, patch]);
    return { ...chats().find((c) => c.id === id), ...patch };
  };
  api.getMessages = async () => [];
  chat.stopChats();
  await chat.startChats();
  outlet = document.createElement('main');
  document.body.querySelectorAll('dialog, .toasts').forEach((d) => d.remove());
  await router.startRouter(outlet, { fallback: app.notFoundView });
});

afterEach(() => {
  router.stopRouter();
  chat.stopChats();
  delete document.visibilityState;
  delete globalThis.Notification;
  Object.assign(api, original);
  history.replaceState(null, '', '#/');
});

async function visit(hash) {
  await router.render(hash);
  await flush(8);
  return text(outlet);
}

// Quello che si legge, con le etichette per i lettori di schermo e i segnaposto, senza i testi scritti dalle persone.
function leftovers(root) {
  const copy = root.cloneNode(true);
  copy.querySelectorAll('.chat-body, .chat-quote span').forEach((el) => el.remove());
  const attributes = [...copy.querySelectorAll('[aria-label],[title],[placeholder]')].flatMap((el) =>
    ['aria-label', 'title', 'placeholder'].map((name) => el.getAttribute(name)).filter(Boolean),
  );
  return italianWords([copy.textContent, ...attributes].join(' '));
}

describe('elenco delle chat in inglese', () => {
  it('la chat generale si chiama General, ma il titolo salvato resta Generale', async () => {
    await visit('#/chat');
    const titles = [...outlet.querySelectorAll('.chat-entry strong')].map((s) => s.textContent);
    assert.deepEqual(titles, ['General', 'Grants']);
    assert.equal(chat.chatState.chats.get(GENERAL).title, 'Generale');
    assert.equal(chat.chatTitle(chat.chatState.chats.get(GENERAL)), 'General');
  });

  it('intestazione, bottone e chat senza messaggi sono in inglese', async () => {
    await visit('#/chat');
    assert.equal(text(outlet.querySelector('.chat-list-head h1')), 'Chat');
    assert.ok(byText(outlet, '.chat-list-head button', 'New'));
    assert.equal(outlet.querySelector('nav.chat-list').getAttribute('aria-label'), 'List of chats');
    assert.match(text(outlet.querySelector(`a[href="#/chat/${TOPIC}"]`)), /No messages/);
  });

  it('le archiviate si mostrano e si nascondono in inglese', async () => {
    await visit('#/chat');
    byText(outlet, 'button', 'Show archived (1)').click();
    assert.match(text(outlet.querySelector('.chat-list')), /Old/);
    assert.ok(byText(outlet, 'button', 'Hide archived (1)'));
  });

  it('senza una chat scelta, o con una chat che non c è, lo spiega in inglese', async () => {
    let body = await visit('#/chat');
    assert.match(body, /Pick a chat from the list, or create a new one for a topic or an idea\./);
    body = await visit('#/chat/dddddddd-0000-4000-8000-0000000000ff');
    assert.match(body, /Chat not found\./);
  });

  it('una chat nuova si crea da una finestra in inglese', async () => {
    await visit('#/chat');
    byText(outlet, 'button', 'New').click();
    await flush();
    const dialog = document.querySelector('dialog');
    assert.match(text(dialog), /New chat/);
    assert.match(text(dialog), /Name/);
    assert.match(text(dialog), /Linked idea/);
    assert.match(text(dialog), /Chats can be archived, not deleted\./);
    assert.equal(dialog.querySelector('input').getAttribute('placeholder'), 'For example: Nutrition');
    assert.equal(dialog.querySelector('select option').textContent, 'None: free topic');
    assert.ok(byText(dialog, 'button', 'Cancel'));
    dialog.querySelector('input').value = 'Pricing';
    byText(dialog, 'button', 'Create').click();
    await flush(5);
    assert.deepEqual(calls.created, [{ title: 'Pricing', ideaId: null, projectId: PROJECT }]);
  });
});

describe('una chat aperta in inglese', () => {
  it('la generale dice di essere la chat di tutto il team', async () => {
    await visit(`#/chat/${GENERAL}`);
    assert.equal(text(outlet.querySelector('.chat-head h2')), 'General');
    assert.match(text(outlet.querySelector('.chat-head')), /All chats/);
    assert.match(text(outlet.querySelector('.chat-head')), /The chat of the whole team/);
    assert.equal(outlet.querySelector('.chat-messages').getAttribute('aria-label'), 'Messages');
  });

  it('i messaggi hanno azioni e orari in inglese', async () => {
    api.listMessages = async () => [msg(), mine({ edited_at: '2026-10-21T09:06:00Z' })];
    await visit(`#/chat/${GENERAL}`);
    const [theirs, own] = outlet.querySelectorAll('.chat-message');
    const reply = theirs.querySelector('button[aria-label="Reply to the message"]');
    assert.ok(reply);
    assert.equal(reply.getAttribute('title'), 'Reply');
    assert.ok(own.querySelector('button[aria-label="Edit the message"]'));
    assert.ok(own.querySelector('button[aria-label="Delete the message"]'));
    assert.match(text(own), /edited/);
    const time = new Date('2026-10-21T09:00:00Z').toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    assert.equal(text(theirs.querySelector('time')), time);
  });

  it('rispondere a un messaggio si annuncia e si annulla in inglese', async () => {
    await visit(`#/chat/${GENERAL}`);
    outlet.querySelector('button[aria-label="Reply to the message"]').click();
    const bar = outlet.querySelector('.chat-reply-bar');
    assert.match(text(bar), /Replying to\s*Bruno\s*Hello team/);
    assert.ok(bar.querySelector('button[aria-label="Cancel the reply"]'));
  });

  it('modificare ed eliminare un proprio messaggio parlano inglese', async () => {
    api.editMessage = async (id, body) => mine({ id, body, edited_at: '2026-10-21T12:00:00Z' });
    api.deleteMessage = async (id) => mine({ id, deleted_at: '2026-10-21T12:01:00Z' });
    await visit(`#/chat/${GENERAL}`);
    outlet.querySelector('button[aria-label="Edit the message"]').click();
    assert.ok(byText(outlet, '.chat-message button', 'Save'));
    assert.ok(byText(outlet, '.chat-message button', 'Cancel'));
    byText(outlet, '.chat-message button', 'Cancel').click();
    outlet.querySelector('button[aria-label="Delete the message"]').click();
    await flush();
    const dialog = document.querySelector('dialog');
    assert.match(text(dialog), /Delete the message\? Its text will be erased\./);
    byText(dialog, 'button', 'Delete').click();
    await flush(5);
    assert.match(text(outlet.querySelector('.chat-messages')), /Message deleted/);
  });

  it('un messaggio non partito si può riprovare o scartare, in inglese', async () => {
    api.sendMessage = async () => {
      throw new Error('offline');
    };
    await visit(`#/chat/${GENERAL}`);
    const input = outlet.querySelector('textarea.chat-input');
    input.value = 'Are you there?';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
    const pending = outlet.querySelector('.chat-message.is-pending');
    assert.match(text(pending), /Sending…/);
    await flush(5);
    const failed = outlet.querySelector('.chat-message.is-failed');
    assert.match(text(failed), /Not sent · Try again · Discard/);
  });

  it('il riquadro per scrivere spiega i tasti e aggiunge immagini, in inglese', async () => {
    await visit(`#/chat/${GENERAL}`);
    const input = outlet.querySelector('textarea.chat-input');
    assert.equal(input.getAttribute('placeholder'), 'Write a message; @ to tag someone. Enter to send, Shift+Enter for a new line.');
    assert.equal(input.getAttribute('aria-label'), 'Message');
    assert.equal(outlet.querySelector('.chat-composer label').getAttribute('aria-label'), 'Add an image');
    assert.ok(byText(outlet, '.chat-composer button', 'Send'));
  });

  it('una chat senza messaggi e quelli più vecchi da caricare lo dicono in inglese', async () => {
    let body = await visit(`#/chat/${TOPIC}`);
    assert.match(body, /No messages in this chat yet\./);
    api.listMessages = async () => [];
    body = await visit(`#/chat/${GENERAL}`);
    assert.match(body, /No messages yet: write to the team here\./);
    api.listMessages = async () => Array.from({ length: 50 }, (_, i) => msg({ id: `eeeeeeee-0000-4000-8000-${String(i + 100).padStart(12, '0')}`, created_at: new Date(Date.UTC(2026, 9, 21, 9, i)).toISOString() }));
    await visit(`#/chat/${GENERAL}`);
    assert.ok(byText(outlet, '.chat-more button', 'Earlier messages'));
  });

  it('le citazioni di un messaggio sparito, eliminato o di sola immagine lo dicono in inglese', async () => {
    const GONE = 'eeeeeeee-0000-4000-8000-0000000000aa';
    const DELETED = 'eeeeeeee-0000-4000-8000-0000000000ab';
    const PICTURE = 'eeeeeeee-0000-4000-8000-0000000000ac';
    api.listMessages = async () => [
      msg({ id: DELETED, deleted_at: '2026-10-21T08:30:00Z', created_at: '2026-10-21T08:00:00Z' }),
      msg({ id: PICTURE, body: `![](immagine:${GENERAL}/11111111-1111-4111-8111-111111111111.jpg)`, created_at: '2026-10-21T08:10:00Z' }),
      msg({ id: OLDER, reply_to: GONE, body: 'one' }),
      msg({ id: 'eeeeeeee-0000-4000-8000-0000000000ad', reply_to: DELETED, body: 'two', created_at: '2026-10-21T09:01:00Z' }),
      msg({ id: 'eeeeeeee-0000-4000-8000-0000000000ae', reply_to: PICTURE, body: 'three', created_at: '2026-10-21T09:02:00Z' }),
    ];
    api.downloadNoteImage = async () => new Blob(['x']);
    await visit(`#/chat/${GENERAL}`);
    const quotes = [...outlet.querySelectorAll('.chat-quote')].map((q) => [text(q.querySelector('strong')), text(q.querySelector('span'))]);
    assert.deepEqual(quotes, [['', 'Earlier message'], ['Bruno', 'Message deleted'], ['Bruno', 'Image']]);
  });

  it('archiviare una chat chiede conferma in inglese, e da archiviata si può riattivare', async () => {
    await visit(`#/chat/${TOPIC}`);
    byText(outlet, '.chat-head button', 'Archive').click();
    await flush();
    const dialog = document.querySelector('dialog');
    assert.match(text(dialog), /Archive the chat\? It stays readable among the archived chats, but nobody can write in it any more\./);
    byText(dialog, 'button', 'Archive').click();
    await flush(5);
    const panel = text(outlet.querySelector('.chat-panel'));
    assert.match(panel, /archived/);
    assert.match(panel, /Archived chat: you can read it, but not write in it\. Reactivate it/);
  });

  it('rinominare chiede il nuovo nome in inglese', async () => {
    await visit(`#/chat/${TOPIC}`);
    byText(outlet, '.chat-head button', 'Rename').click();
    await flush();
    const dialog = document.querySelector('dialog');
    assert.match(text(dialog), /Rename the chat/);
    assert.match(text(dialog), /Name/);
    assert.ok(byText(dialog, 'button', 'Save'));
  });

  it('nelle pagine della chat non restano parole italiane', async () => {
    api.listMessages = async () => [msg(), mine({ edited_at: '2026-10-21T09:06:00Z' })];
    await visit(`#/chat/${GENERAL}`);
    outlet.querySelector('button[aria-label="Reply to the message"]').click();
    assert.deepEqual(leftovers(outlet), []);
    await visit(`#/chat/${TOPIC}`);
    assert.deepEqual(leftovers(outlet), []);
    await visit('#/chat');
    byText(outlet, 'button', 'Show archived (1)').click();
    assert.deepEqual(leftovers(outlet), []);
  });
});

describe('avvisi della chat in inglese', () => {
  it('l avviso del browser chiama General la generale e porta il nome del progetto', () => {
    globalThis.Notification = FakeNotification;
    store.writeLocal('avvisiBrowser', true);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    store.emit('chat-message', { row: msg({ id: 'eeeeeeee-0000-4000-8000-0000000000c1' }), inserted: true });
    assert.deepEqual(shown, [{ title: 'ai-deep-endenti · Alpha', body: 'Bruno in “General”: Hello team', tag: 'm-eeeeeeee-0000-4000-8000-0000000000c1' }]);
  });
});
