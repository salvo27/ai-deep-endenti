import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush } from '../setup/dom.mjs';
import { IDS, ME, OTHER, PROJECT, PROJECT2, boardItems, members } from '../setup/fixtures.mjs';

// La campanella è del progetto aperto: novità, letture e avvisi non si mescolano tra progetti.
let api;
let store;
let notes;
let bellView;
let original;
let feeds;
let asked;
let shown;

const ALFA = { id: PROJECT, name: 'Alfa', role: 'admin' };
const BETA = { id: PROJECT2, name: 'Beta', role: 'member' };
const hoursAgo = (n) => new Date(Date.now() - n * 3600 * 1000).toISOString();
const rev = (over) => ({ id: 1, item_id: IDS.idea, kind: 'idea', op: 'create', title: 'Idea alfa', status: 'nuova', changed: [], author_id: OTHER, created_at: hoursAgo(1), ...over });

class FakeNotification {
  static permission = 'granted';

  constructor(title, options) {
    shown.push({ title, ...options });
  }

  close() {}
}

async function open(project) {
  notes.stopNotifications();
  store.setProject(project);
  await notes.startNotifications();
}

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  notes = await import('../../assets/js/notifications.js');
  bellView = await import('../../assets/js/views/notifications.js');
  original = { ...api };
});

beforeEach(() => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  localStorage.clear();
  feeds = { [PROJECT]: [], [PROJECT2]: [] };
  asked = [];
  shown = [];
  globalThis.Notification = FakeNotification;
  document.body.querySelectorAll('.toasts, .bell-box').forEach((el) => el.remove());
  // Like the real call: the revisions of the project open in the api, after the given moment.
  api.activityFeed = async (since) => {
    asked.push(api.currentProject());
    return { revisions: feeds[api.currentProject()].filter((r) => r.created_at > since), comments: [] };
  };
});

afterEach(() => {
  notes.stopNotifications();
  delete document.visibilityState;
  delete globalThis.Notification;
  Object.assign(api, original);
});

describe('letture della campanella per progetto', () => {
  it('leggere tutto in un progetto non fa sembrare lette le novità di un altro', async () => {
    feeds[PROJECT2] = [rev({ id: 1, created_at: hoursAgo(3) })];
    await open(BETA);
    assert.equal(notes.unreadCount(), 0, 'alla prima apertura il vecchio non risulta da leggere');

    feeds[PROJECT] = [rev({ id: 2, created_at: hoursAgo(2) })];
    await open(ALFA);
    store.emit('revision', rev({ id: 3, project_id: PROJECT, created_at: hoursAgo(1) }));
    assert.equal(notes.unreadCount(), 1);
    notes.markAllRead();
    assert.equal(notes.unreadCount(), 0);

    feeds[PROJECT2].push(rev({ id: 4, title: 'Idea di Beta', created_at: hoursAgo(2) }));
    await open(BETA);
    assert.deepEqual(notes.notifications().map((n) => n.id), ['r-4']);
    assert.equal(notes.unreadCount(), 1);
  });

  it('una notifica aperta resta letta anche dopo aver letto tutto in un altro progetto', async () => {
    feeds[PROJECT] = [rev({ id: 5, created_at: hoursAgo(3) })];
    await open(ALFA);
    feeds[PROJECT].push(rev({ id: 6, created_at: hoursAgo(1) }));
    store.emit('revision', { ...feeds[PROJECT][1], project_id: PROJECT });
    notes.markRead('r-6');
    assert.equal(notes.unreadCount(), 0);

    feeds[PROJECT2] = [rev({ id: 7, created_at: hoursAgo(2) })];
    await open(BETA);
    notes.markAllRead();
    await open(ALFA);
    assert.deepEqual(notes.notifications({ includeRead: true }).map((n) => n.id), ['r-6', 'r-5']);
    assert.equal(notes.unreadCount(), 0, 'in Alfa la notifica aperta resta letta');
  });

  // Before the projects the browser kept one mark for the whole site: it still counts until the project has its own.
  it('il segno di lettura di prima dei progetti vale ancora: le novità arrivate dopo restano da leggere', async () => {
    store.writeLocal('notificheLette', hoursAgo(4));
    store.writeLocal('notificheLetteSingole', ['r-9']);
    const latest = hoursAgo(2);
    feeds[PROJECT] = [rev({ id: 8, created_at: hoursAgo(5) }), rev({ id: 9, created_at: hoursAgo(3) }), rev({ id: 10, created_at: latest })];
    await open(ALFA);
    assert.deepEqual(notes.notifications().map((n) => n.id), ['r-10'], 'la vecchia è letta, quella aperta prima anche');
    notes.markAllRead();
    assert.equal(notes.unreadCount(), 0);
    assert.equal(store.readLocal(`notificheLette:${PROJECT}`), latest, 'da qui in poi il progetto ha il suo segno');
  });

  // The old mark belongs to the project the site was moved into: a project joined later starts with nothing to read.
  it('il segno di lettura di prima dei progetti vale solo per il primo progetto aperto', async () => {
    store.writeLocal('notificheLette', hoursAgo(300));
    store.writeLocal('notificheLetteSingole', ['r-21']);
    feeds[PROJECT] = [rev({ id: 20, created_at: hoursAgo(2) })];
    feeds[PROJECT2] = [rev({ id: 21, created_at: hoursAgo(5) }), rev({ id: 22, created_at: hoursAgo(3) })];
    await open(ALFA);
    assert.deepEqual(notes.notifications().map((n) => n.id), ['r-20'], 'Alfa tiene ciò che non era letto prima');
    assert.equal(store.readLocal('notificheLette'), null, 'il segno senza progetto non resta');
    assert.equal(store.readLocal('notificheLetteSingole'), null);

    await open(BETA);
    assert.equal(notes.unreadCount(), 0, 'un progetto aggiunto dopo parte senza nulla da leggere');
    assert.deepEqual(store.readLocal(`notificheLetteSingole:${PROJECT2}`), []);
  });

  it('un progetto con il suo segno di lettura non guarda quello di prima', async () => {
    store.writeLocal('notificheLette', hoursAgo(10));
    store.writeLocal(`notificheLette:${PROJECT}`, hoursAgo(1.5));
    feeds[PROJECT] = [rev({ id: 11, created_at: hoursAgo(2) }), rev({ id: 12, created_at: hoursAgo(1) })];
    await open(ALFA);
    assert.deepEqual(notes.notifications().map((n) => n.id), ['r-12']);
  });
});

describe('novità del progetto aperto', () => {
  const comment = (over) => ({ id: 'c0000000-0000-4000-8000-000000000001', item_id: IDS.idea, author_id: OTHER, ai_task: null, created_at: hoursAgo(-0.1), edited_at: null, deleted_at: null, ...over });

  function bell() {
    const box = bellView.notificationBell();
    document.body.append(box);
    return box;
  }

  it('si chiedono per il progetto aperto', async () => {
    await open(ALFA);
    assert.deepEqual(asked, [PROJECT]);
  });

  it('revisioni e commenti di un altro progetto arrivati dal vivo non contano e non avvisano', async () => {
    await open(ALFA);
    const box = bell();
    store.emit('revision', rev({ id: 20, project_id: PROJECT2, title: 'Idea di Beta', created_at: hoursAgo(-0.1) }));
    store.emit('comment', comment({ project_id: PROJECT2 }));
    await flush();
    assert.equal(notes.unreadCount(), 0);
    assert.equal(box.querySelector('.bell-badge').hidden, true);
    assert.equal(document.querySelector('.toasts'), null);
    store.writeLocal('avvisiBrowser', true);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    store.emit('revision', rev({ id: 21, project_id: PROJECT2, created_at: hoursAgo(-0.1) }));
    assert.deepEqual(shown, []);
  });

  it('quelli del progetto aperto contano e, con la scheda in secondo piano, avvisano con il nome del progetto', async () => {
    await open(ALFA);
    const box = bell();
    store.writeLocal('avvisiBrowser', true);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    store.emit('revision', rev({ id: 22, project_id: PROJECT, title: 'Idea nuova', created_at: hoursAgo(-0.1) }));
    store.emit('comment', comment({ id: 'c0000000-0000-4000-8000-000000000002', project_id: PROJECT }));
    assert.equal(notes.unreadCount(), 2);
    assert.equal(box.querySelector('.bell-badge').textContent, '2');
    assert.deepEqual(shown.map((n) => [n.title, n.body]), [
      ['ai-deep-endenti · Alfa', "Bruno ha aggiunto l'idea «Idea nuova»"],
      ['ai-deep-endenti · Alfa', 'Bruno ha commentato «Idea alfa»'],
    ]);
  });

  it('senza un progetto aperto la campanella non chiede niente e non ascolta', async () => {
    await open(null);
    assert.deepEqual(asked, []);
    store.emit('revision', rev({ id: 23, created_at: hoursAgo(-0.1) }));
    store.emit('synced');
    await flush();
    assert.equal(notes.unreadCount(), 0);
    assert.deepEqual(asked, []);
    assert.equal(localStorage.length, 0, 'non si segna niente come letto');
  });
});
