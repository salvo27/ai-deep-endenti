import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text } from '../setup/dom.mjs';
import { IDS, ME, OTHER, boardItems, members } from '../setup/fixtures.mjs';

let api;
let store;
let notes;
let bellView;
let original;

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
  document.body.querySelectorAll('.toasts').forEach((t) => t.remove());
});

afterEach(() => {
  notes.stopNotifications();
  Object.assign(api, original);
});

const rev = (over) => ({ id: 1, item_id: IDS.idea, kind: 'idea', op: 'update', title: 'Idea alfa', status: 'validazione', changed: [], author_id: OTHER, created_at: '2026-10-18T10:00:00Z', ...over });

test('only interesting changes become notifications', () => {
  assert.equal(notes.describeRevision(rev({ op: 'create', status: 'nuova' })).text, 'Bruno ha aggiunto l\'idea «Idea alfa»');
  assert.equal(notes.describeRevision(rev({ changed: ['status'], status: 'scelta' })).text, 'Bruno ha spostato «Idea alfa» in «Scelta»');
  assert.equal(notes.describeRevision(rev({ changed: ['pitch'] })), null, 'una modifica al testo non disturba');
  assert.equal(notes.describeRevision(rev({ op: 'delete' })).text, 'Bruno ha archiviato l\'idea «Idea alfa»');
  assert.equal(notes.describeRevision(rev({ kind: 'experiment', item_id: IDS.experiment, title: 'Pagano?', changed: ['status'], status: 'concluso' })).text, 'Bruno ha concluso l\'esperimento «Pagano?»');
  assert.equal(notes.describeRevision(rev({ kind: 'experiment', changed: ['status'], status: 'in_corso' })), null);
  assert.equal(notes.describeRevision(rev({ kind: 'decision', op: 'create', title: 'Due finalisti', status: 'presa' })).href, `#/elemento/${IDS.idea}`);
  assert.match(notes.describeRevision(rev({ kind: 'market', op: 'create', title: 'Mercato' })).text, /ha creato una stima del mercato: «Mercato»/);
  assert.match(notes.describeRevision(rev({ kind: 'contact', op: 'create', title: 'Responsabile acquisti', status: 'da_contattare' })).text, /tra le persone con cui interfacciarsi/);
  assert.equal(notes.describeRevision(rev({ kind: 'equity', op: 'update', title: 'Quote' })).href, '#/squadra/quote');
  assert.equal(notes.describeRevision(rev({ kind: 'score', op: 'update' })), null);
  assert.equal(notes.describeRevision(rev({ kind: 'idea', op: 'create' })).href, `#/idea/${IDS.idea}`);
});

test('comments and saved Claude answers are announced, edits are not', () => {
  const comment = { id: 'c0000000-0000-4000-8000-000000000001', item_id: IDS.canvas, author_id: OTHER, ai_task: null, created_at: '2026-10-18T10:00:00Z' };
  assert.equal(notes.describeComment(comment).text, 'Bruno ha commentato «Lean Canvas: Idea alfa»');
  assert.equal(notes.describeComment(comment).href, `#/elemento/${IDS.canvas}/commenti`);
  assert.match(notes.describeComment({ ...comment, item_id: IDS.idea, ai_task: 'critique' }).text, /ha salvato una risposta di Claude su «Idea alfa»/);
  assert.equal(notes.describeComment({ ...comment, item_id: IDS.idea }).href, `#/idea/${IDS.idea}/commenti`);
  assert.equal(notes.describeComment({ ...comment, edited_at: '2026-10-18T11:00:00Z' }), null);
});

test('the feed keeps only what others did, counts unread and remembers what was read', async () => {
  localStorage.clear();
  store.writeLocal('notificheLette', '2026-10-18T09:00:00Z');
  api.activityFeed = async () => ({
    revisions: [rev({ id: 2, op: 'create', created_at: '2026-10-18T10:00:00Z' }), rev({ id: 3, op: 'create', author_id: ME, created_at: '2026-10-18T10:05:00Z' }), rev({ id: 4, op: 'create', created_at: '2026-10-18T08:00:00Z' })],
    comments: [],
  });
  await notes.startNotifications();
  assert.equal(notes.notifications({ includeRead: true }).length, 2);
  assert.equal(notes.notifications().length, 1, 'l\'elenco mostra solo quelle da leggere');
  assert.equal(notes.unreadCount(), 1);
  notes.markAllRead();
  assert.equal(notes.unreadCount(), 0);
  assert.equal(store.readLocal('notificheLette'), '2026-10-18T10:00:00Z');
});

test('on first use the old activity is not dumped as unread', async () => {
  api.activityFeed = async () => ({ revisions: [rev({ id: 5, op: 'create' })], comments: [] });
  await notes.startNotifications();
  assert.equal(notes.notifications({ includeRead: true }).length, 1);
  assert.equal(notes.unreadCount(), 0);
});

test('the bell shows live notifications, opens the list and marks them read', async () => {
  store.writeLocal('notificheLette', '2026-10-18T09:00:00Z');
  api.activityFeed = async () => ({ revisions: [], comments: [] });
  const bell = bellView.notificationBell();
  document.body.append(bell);
  await notes.startNotifications();
  store.emit('revision', rev({ id: 7, op: 'create', title: 'Idea nuova', created_at: '2026-10-18T12:00:00Z' }));
  store.emit('revision', rev({ id: 7, op: 'create', title: 'Idea nuova', created_at: '2026-10-18T12:00:00Z' }));
  await flush();
  assert.equal(bell.querySelector('.bell-badge').textContent, '1', 'la stessa revisione non conta due volte');
  assert.match(text(document.querySelector('.toasts')), /Bruno ha aggiunto l'idea «Idea nuova»/);
  bell.querySelector('button.bell').click();
  const panel = bell.querySelector('.bell-panel');
  assert.equal(panel.hidden, false);
  assert.ok(panel.querySelector('.bell-item.is-unread a[href="#/idea/' + IDS.idea + '"]'));
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(panel.hidden, true);
  assert.equal(bell.querySelector('.bell-badge').textContent, '1', 'chiudere il pannello non segna niente come letto');
  bell.remove();
});

test('read notifications leave the list, one by one or all together', async () => {
  store.writeLocal('notificheLette', '2026-10-18T09:00:00Z');
  api.activityFeed = async () => ({
    revisions: [rev({ id: 11, op: 'create', title: 'Prima', created_at: '2026-10-18T10:00:00Z' }), rev({ id: 12, op: 'create', title: 'Seconda', created_at: '2026-10-18T11:00:00Z' }), rev({ id: 13, op: 'create', title: 'Terza', created_at: '2026-10-18T12:00:00Z' })],
    comments: [],
  });
  const bell = bellView.notificationBell();
  document.body.append(bell);
  await notes.startNotifications();
  const panel = bell.querySelector('.bell-panel');
  bell.querySelector('button.bell').click();
  assert.equal(panel.querySelectorAll('.bell-item').length, 3);

  panel.querySelector('.bell-item a').click();
  assert.equal(notes.unreadCount(), 2, 'aprire una notifica segna come letta solo quella');
  bell.querySelector('button.bell').click();
  assert.equal(panel.querySelectorAll('.bell-item').length, 2);
  assert.doesNotMatch(text(panel), /Terza/);

  [...panel.querySelectorAll('button')].find((b) => /Segna tutte come lette/.test(b.textContent)).click();
  assert.equal(panel.querySelectorAll('.bell-item').length, 0);
  assert.match(text(panel), /Nessuna novità da leggere/);
  assert.equal(bell.querySelector('.bell-badge').hidden, true);

  [...panel.querySelectorAll('button')].find((b) => /Mostra anche quelle già lette/.test(b.textContent)).click();
  assert.equal(panel.querySelectorAll('.bell-item').length, 3);
  assert.equal(panel.querySelectorAll('.bell-item.is-unread').length, 0);

  notes.stopNotifications();
  await notes.startNotifications();
  assert.equal(notes.unreadCount(), 0, 'le letture restano dopo aver ricaricato');
  bell.remove();
});

test('notifications missed while offline arrive with the next sync', async () => {
  store.writeLocal('notificheLette', '2026-10-18T09:00:00Z');
  let calls = 0;
  api.activityFeed = async () => {
    calls += 1;
    return calls === 1 ? { revisions: [], comments: [] } : { revisions: [rev({ id: 9, op: 'create', created_at: '2026-10-18T13:00:00Z' })], comments: [] };
  };
  await notes.startNotifications();
  assert.equal(notes.notifications().length, 0);
  store.emit('synced');
  await flush();
  assert.equal(notes.notifications().length, 1);
  assert.equal(notes.unreadCount(), 1);
});
