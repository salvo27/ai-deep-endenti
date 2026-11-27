import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text } from '../setup/dom.mjs';
import { IDS, ME, OTHER, PROJECT, PROJECT2, boardItems, members } from '../setup/fixtures.mjs';

// La chat vive dentro un progetto: elenco, non letti, chat nuove e aggiornamenti dal vivo sono solo del progetto aperto.
let api;
let store;
let router;
let app;
let chat;
let original;
let outlet;
let asked;
let shown;

const GENERAL = 'dddddddd-0000-4000-8000-000000000001';
const TOPIC = 'dddddddd-0000-4000-8000-000000000002';
const ELSEWHERE = 'dddddddd-0000-4000-8000-000000000009';
const CREATED = 'dddddddd-0000-4000-8000-000000000004';

const chats = () => [
  { id: GENERAL, project_id: PROJECT, title: 'Generale', is_general: true, idea_id: null, archived_at: null, created_at: '2026-10-01T10:00:00Z' },
  { id: TOPIC, project_id: PROJECT, title: 'Bandi', is_general: false, idea_id: null, archived_at: null, created_at: '2026-10-05T10:00:00Z' },
];
const elsewhere = (over) => ({ id: ELSEWHERE, project_id: PROJECT2, title: 'Chat di Beta', is_general: false, idea_id: null, archived_at: null, created_at: '2026-10-06T10:00:00Z', ...over });
const msg = (over) => ({ id: 'eeeeeeee-0000-4000-8000-000000000001', project_id: PROJECT, chat_id: TOPIC, author_id: OTHER, body: 'Ciao squadra', created_at: '2026-10-21T09:00:00Z', edited_at: null, deleted_at: null, ...over });

// Gli avvisi del browser partono solo con la scheda in secondo piano e il permesso dato.
class FakeNotification {
  static permission = 'granted';

  constructor(title, options) {
    shown.push({ title, ...options });
  }

  close() {}
}

const hideTab = () => Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
const showTab = () => delete document.visibilityState;

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
  store.setProject({ id: PROJECT, name: 'Alfa', role: 'admin' });
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  localStorage.clear();
  asked = { listChats: [], chatOverview: [], createChat: [] };
  shown = [];
  globalThis.Notification = FakeNotification;
  api.listChats = async (project) => {
    asked.listChats.push(project);
    return chats();
  };
  api.chatOverview = async (project) => {
    asked.chatOverview.push(project);
    return [{ chat_id: GENERAL, last_message_at: '2026-10-21T09:00:00Z', unread: 2 }];
  };
  api.createChat = async (args) => {
    asked.createChat.push(args);
    return { id: CREATED, project_id: PROJECT, title: args.title, idea_id: args.ideaId, is_general: false, archived_at: null, created_at: '2026-10-21T12:00:00Z' };
  };
  api.listMessages = async () => [];
  api.markChatRead = async () => {};
  chat.stopChats();
  await chat.startChats();
  outlet = document.createElement('main');
  document.body.querySelectorAll('dialog, .toasts').forEach((d) => d.remove());
  await router.startRouter(outlet, { fallback: app.notFoundView });
});

afterEach(() => {
  router.stopRouter();
  chat.stopChats();
  showTab();
  delete globalThis.Notification;
  Object.assign(api, original);
});

async function visit(hash) {
  await router.render(hash);
  await flush(8);
  return text(outlet);
}

describe('chat del progetto aperto', () => {
  it('elenco e messaggi non letti si chiedono per il progetto aperto', () => {
    assert.deepEqual(asked.listChats, [PROJECT]);
    assert.deepEqual(asked.chatOverview, [PROJECT]);
    assert.equal(chat.totalUnread(), 2);
  });

  it('una chat nuova nasce nel progetto aperto, anche quella di un idea', async () => {
    await chat.createChat({ title: 'Bandi europei' });
    await chat.openIdeaChat(store.getItem(IDS.idea2));
    assert.deepEqual(asked.createChat, [
      { title: 'Bandi europei', ideaId: null, projectId: PROJECT },
      { title: 'Idea beta', ideaId: IDS.idea2, projectId: PROJECT },
    ]);
  });

  it('senza un progetto aperto non si chiede niente e l elenco resta vuoto', async () => {
    chat.stopChats();
    store.setProject(null);
    asked.listChats = [];
    asked.chatOverview = [];
    await chat.startChats();
    assert.deepEqual(asked.listChats, []);
    assert.deepEqual(asked.chatOverview, []);
    assert.deepEqual(chat.chatList(), []);
    assert.equal(chat.totalUnread(), 0);
  });

  it('le righe di un altro progetto nella risposta non si mostrano né si contano', async () => {
    api.listChats = async () => [...chats(), elsewhere()];
    api.chatOverview = async () => [{ chat_id: ELSEWHERE, last_message_at: '2026-10-21T09:00:00Z', unread: 5 }];
    await chat.loadChats();
    assert.deepEqual(chat.chatList().map((c) => c.id), [GENERAL, TOPIC]);
    assert.equal(chat.totalUnread(), 0);
  });

  it('una chat di un altro progetto arrivata dal vivo non entra nell elenco, una del progetto sì', async () => {
    await visit('#/chat');
    store.emit('chat-row', elsewhere());
    store.emit('chat-row', elsewhere({ id: CREATED, project_id: PROJECT, title: 'Prezzi' }));
    await flush(2);
    assert.deepEqual(chat.chatList().map((c) => c.id), [GENERAL, CREATED, TOPIC]);
    assert.doesNotMatch(text(outlet.querySelector('.chat-list')), /Chat di Beta/);
  });

  it('un messaggio di un altro progetto arrivato dal vivo non conta e non avvisa', async () => {
    store.writeLocal('avvisiBrowser', true);
    hideTab();
    store.emit('chat-message', { row: msg({ id: 'eeeeeeee-0000-4000-8000-0000000000b1', project_id: PROJECT2, chat_id: ELSEWHERE }), inserted: true });
    store.emit('chat-message', { row: msg({ id: 'eeeeeeee-0000-4000-8000-0000000000b2', project_id: PROJECT2 }), inserted: true });
    assert.equal(chat.unreadOf(TOPIC), 0);
    assert.equal(chat.totalUnread(), 2);
    assert.deepEqual(shown, []);
  });

  it('un messaggio di un altro progetto non compare nella chat aperta', async () => {
    await visit(`#/chat/${TOPIC}`);
    store.emit('chat-message', { row: msg({ id: 'eeeeeeee-0000-4000-8000-0000000000b3', project_id: PROJECT2, body: 'Messaggio di Beta' }), inserted: true });
    store.emit('chat-message', { row: msg({ id: 'eeeeeeee-0000-4000-8000-0000000000b4', body: 'Messaggio di Alfa' }), inserted: true });
    await flush(3);
    const shownText = text(outlet.querySelector('.chat-messages'));
    assert.doesNotMatch(shownText, /Messaggio di Beta/);
    assert.match(shownText, /Messaggio di Alfa/);
  });

  // A link to a chat of another of my projects (pasted in a note, an old bookmark) must not read it nor mark it read.
  it('il link a una chat di un altro progetto non ne legge i messaggi e non la segna letta', async () => {
    const calls = [];
    api.listMessages = async (id) => (calls.push(['listMessages', id]), []);
    api.markChatRead = async (id) => calls.push(['markChatRead', id]);
    const body = await visit(`#/chat/${ELSEWHERE}`);
    await flush(3);
    assert.match(body, /Chat non trovata/);
    assert.deepEqual(calls, []);
    document.dispatchEvent(new window.Event('visibilitychange'));
    store.emit('chat-message', { row: msg({ id: 'eeeeeeee-0000-4000-8000-0000000000b6', project_id: PROJECT, chat_id: ELSEWHERE }), inserted: true });
    await flush(3);
    assert.deepEqual(calls, [], 'nemmeno tornando sulla scheda o con un messaggio nuovo');
  });

  it('una chat del progetto aperta prima che arrivi l elenco si legge appena l elenco arriva', async () => {
    chat.stopChats();
    const calls = [];
    api.listMessages = async (id) => (calls.push(['listMessages', id]), [msg({ body: 'Primo messaggio' })]);
    api.markChatRead = async (id) => calls.push(['markChatRead', id]);
    await visit(`#/chat/${TOPIC}`);
    assert.deepEqual(calls, [], 'senza elenco non si sa ancora se la chat è del progetto');
    await chat.startChats();
    await flush(5);
    assert.deepEqual(calls, [['listMessages', TOPIC], ['markChatRead', TOPIC]]);
    assert.match(text(outlet.querySelector('.chat-messages')), /Primo messaggio/);
  });

  it('un messaggio del progetto con la scheda in secondo piano avvisa, con il nome del progetto', () => {
    store.writeLocal('avvisiBrowser', true);
    hideTab();
    store.emit('chat-message', { row: msg({ id: 'eeeeeeee-0000-4000-8000-0000000000b5' }), inserted: true });
    assert.equal(chat.unreadOf(TOPIC), 1);
    assert.deepEqual(shown, [{ title: 'ai-deep-endenti · Alfa', body: 'Bruno in «Bandi»: Ciao squadra', tag: 'm-eeeeeeee-0000-4000-8000-0000000000b5' }]);
  });
});

describe('nome della chat generale', () => {
  for (const [label, row, expected] of [
    ['la generale si chiama Generale', { is_general: true, title: 'Generale' }, 'Generale'],
    ['la generale si chiama Generale qualunque titolo abbia salvato', { is_general: true, title: 'General' }, 'Generale'],
    ['una chat per argomento tiene il suo titolo', { is_general: false, title: 'Bandi' }, 'Bandi'],
    ['una chat chiamata Generale ma non generale tiene il suo titolo', { is_general: false, title: 'Generale' }, 'Generale'],
    ['una chat senza titolo si chiama chat', { is_general: false, title: '' }, 'chat'],
    ['una chat sconosciuta si chiama chat', null, 'chat'],
  ]) {
    it(label, () => {
      assert.equal(chat.chatTitle(row), expected);
    });
  }

  it('si legge Generale nell elenco e nell intestazione, e il titolo salvato non cambia', async () => {
    await visit(`#/chat/${GENERAL}`);
    assert.equal(outlet.querySelector('.chat-entry strong').textContent, 'Generale');
    assert.equal(outlet.querySelector('.chat-head h2').textContent, 'Generale');
    assert.equal(chat.chatState.chats.get(GENERAL).title, 'Generale');
  });
});
