import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom } from '../setup/dom.mjs';
import { IDS, ME, OTHER, PROJECT, PROJECT2, boardItems, members } from '../setup/fixtures.mjs';

// La campanella è del progetto aperto: novità, letture e avvisi non si mescolano tra progetti.
let api;
let store;
let notes;
let original;
let feeds;

const ALFA = { id: PROJECT, name: 'Alfa', role: 'admin' };
const BETA = { id: PROJECT2, name: 'Beta', role: 'member' };
const hoursAgo = (n) => new Date(Date.now() - n * 3600 * 1000).toISOString();
const rev = (over) => ({ id: 1, item_id: IDS.idea, kind: 'idea', op: 'create', title: 'Idea alfa', status: 'nuova', changed: [], author_id: OTHER, created_at: hoursAgo(1), ...over });

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
  original = { ...api };
});

beforeEach(() => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  localStorage.clear();
  feeds = { [PROJECT]: [], [PROJECT2]: [] };
  // Like the real call: the revisions of the project open in the api, after the given moment.
  api.activityFeed = async (since) => ({ revisions: feeds[api.currentProject()].filter((r) => r.created_at > since), comments: [] });
});

afterEach(() => {
  notes.stopNotifications();
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
});
