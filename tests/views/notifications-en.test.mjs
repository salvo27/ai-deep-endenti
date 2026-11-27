import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, text, byText } from '../setup/dom.mjs';
import { italianWords } from '../setup/italian.mjs';
import { IDS, ME, OTHER, PROJECT, boardItems, item, members } from '../setup/fixtures.mjs';

// Su un dispositivo in inglese: la lingua si decide quando il sito si carica, per questo i moduli arrivano dopo la scelta.
useLanguage('en');

let api;
let store;
let notes;
let bellView;
let availability;
let original;

const READ = `notificheLette:${PROJECT}`;
const GROUP = 'cccccccc-0000-4000-8000-0000000000e1';
const EXPENSE = 'cccccccc-0000-4000-8000-0000000000e2';
const INCOME = 'cccccccc-0000-4000-8000-0000000000e3';
const REFUND = 'cccccccc-0000-4000-8000-0000000000e4';
const LOOSE = 'cccccccc-0000-4000-8000-0000000000e5';

const rev = (over) => ({ id: 1, item_id: IDS.idea, kind: 'idea', op: 'update', title: 'Solar sensors', status: 'validazione', changed: [], author_id: OTHER, created_at: '2026-10-18T10:00:00Z', ...over });
const comment = (over) => ({ id: 'c0000000-0000-4000-8000-000000000001', item_id: IDS.idea, author_id: OTHER, ai_task: null, created_at: '2026-10-18T10:00:00Z', ...over });

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  notes = await import('../../assets/js/notifications.js');
  bellView = await import('../../assets/js/views/notifications.js');
  availability = await import('../../assets/js/availability.js');
  original = { ...api };
});

beforeEach(() => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setProject({ id: PROJECT, name: 'Alpha', role: 'admin' });
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  [
    item({ id: GROUP, kind: 'expensegroup', title: 'Trip to Milan', data: { people: [] } }),
    item({ id: EXPENSE, kind: 'expense', title: 'Train', data: { group: GROUP, type: 'spesa' } }),
    item({ id: INCOME, kind: 'expense', title: 'Grant', data: { group: GROUP, type: 'entrata' } }),
    item({ id: REFUND, kind: 'expense', title: 'Refund', data: { group: GROUP, type: 'rimborso' } }),
    item({ id: LOOSE, kind: 'expense', title: 'Taxi', data: { type: 'spesa' } }),
  ].forEach((i) => store.state.items.set(i.id, i));
  localStorage.clear();
  document.body.querySelectorAll('.toasts, .bell-box').forEach((el) => el.remove());
});

afterEach(() => {
  notes.stopNotifications();
  Object.assign(api, original);
});

describe('notifiche in inglese', () => {
  for (const [label, row, expected] of [
    ['un idea nuova', rev({ op: 'create', status: 'nuova' }), 'Bruno added the idea “Solar sensors”'],
    ['un idea archiviata', rev({ op: 'delete' }), 'Bruno archived the idea “Solar sensors”'],
    ['un idea ripristinata', rev({ op: 'restore' }), 'Bruno restored the idea “Solar sensors”'],
    ['un idea spostata di stato', rev({ changed: ['status'], status: 'scelta' }), 'Bruno moved “Solar sensors” to “Chosen”'],
    ['un idea senza titolo', rev({ op: 'create', title: '' }), 'Bruno added the idea “untitled”'],
    ['una decisione', rev({ kind: 'decision', op: 'create', title: 'Two finalists', status: 'presa' }), 'Bruno recorded the decision “Two finalists”'],
    ['una decisione cambiata di stato', rev({ kind: 'decision', changed: ['status'], title: 'Two finalists', status: 'rivista' }), 'Bruno marked the decision “Two finalists” as “Revised”'],
    ['un esperimento', rev({ kind: 'experiment', op: 'create', title: 'Will they pay?' }), 'Bruno planned the experiment “Will they pay?”'],
    ['un esperimento concluso', rev({ kind: 'experiment', changed: ['status'], title: 'Will they pay?', status: 'concluso' }), 'Bruno completed the experiment “Will they pay?”'],
    ['un intervista', rev({ kind: 'interview', op: 'create', title: 'Rossi Ltd' }), 'Bruno added the interview “Rossi Ltd”'],
    ['una persona con cui parlare', rev({ kind: 'contact', op: 'create', title: 'Head of purchasing' }), 'Bruno added “Head of purchasing” to the people to talk to'],
    ['un questionario', rev({ kind: 'survey', op: 'create', title: 'Farmers' }), 'Bruno created a survey: “Farmers”'],
    ['un questionario aperto', rev({ kind: 'survey', changed: ['status'], title: 'Farmers', status: 'aperto' }), 'Bruno opened the survey “Farmers”'],
    ['il Team Canvas', rev({ kind: 'teamcanvas', op: 'update' }), 'Bruno updated the Team Canvas'],
    ['le quote', rev({ kind: 'equity', op: 'update' }), 'Bruno updated the equity split'],
    ['i criteri', rev({ kind: 'criteria', op: 'update' }), 'Bruno changed the scoring criteria'],
    ['un gruppo di spese', rev({ kind: 'expensegroup', op: 'create', item_id: GROUP, title: 'Trip to Milan' }), 'Bruno created the expense group “Trip to Milan”'],
    ['una spesa', rev({ kind: 'expense', op: 'create', item_id: EXPENSE, title: 'Train' }), 'Bruno added the expense “Train” in “Trip to Milan”'],
    ['un entrata', rev({ kind: 'expense', op: 'create', item_id: INCOME, title: 'Grant' }), 'Bruno recorded the income “Grant” in “Trip to Milan”'],
    ['un rimborso', rev({ kind: 'expense', op: 'create', item_id: REFUND, title: 'Refund' }), 'Bruno recorded a refund in “Trip to Milan”'],
    ['una spesa senza gruppo', rev({ kind: 'expense', op: 'create', item_id: LOOSE, title: 'Taxi' }), 'Bruno added the expense “Taxi”'],
    ['un Lean Canvas', rev({ kind: 'canvas', op: 'create', title: 'Canvas' }), 'Bruno created a Lean Canvas: “Canvas”'],
    ['una buyer persona', rev({ kind: 'persona', op: 'create', title: 'Maria' }), 'Bruno created a buyer persona: “Maria”'],
    ['un Value Proposition Canvas', rev({ kind: 'vpc', op: 'create', title: 'VPC' }), 'Bruno created a Value Proposition Canvas: “VPC”'],
    ['una stima del mercato', rev({ kind: 'market', op: 'create', title: 'EU market' }), 'Bruno created a market estimate: “EU market”'],
    ['un analisi dei concorrenti', rev({ kind: 'competitors', op: 'create', title: 'Rivals' }), 'Bruno created a competitor analysis: “Rivals”'],
    ['una scheda deep tech', rev({ kind: 'deeptech', op: 'create', title: 'Sensors' }), 'Bruno created a deep tech sheet: “Sensors”'],
    ['una nota', rev({ kind: 'note', op: 'create', title: 'Meeting' }), 'Bruno created a note: “Meeting”'],
    ['qualcuno che non è più nel progetto', rev({ op: 'create', author_id: '00000000-0000-4000-8000-0000000000ee' }), 'Former member added the idea “Solar sensors”'],
  ]) {
    it(`dicono chi ha fatto cosa: ${label}`, () => {
      assert.equal(notes.describeRevision(row)?.text, expected);
    });
  }

  it('le modifiche minori restano silenziose anche in inglese', () => {
    for (const row of [rev({ changed: ['pitch'] }), rev({ kind: 'score', op: 'update' }), rev({ kind: 'canvas', op: 'update' }), rev({ kind: 'timesheet', op: 'create' })]) {
      assert.equal(notes.describeRevision(row), null, `${row.kind} ${row.op}`);
    }
  });

  for (const [label, row, expected] of [
    ['un commento', comment(), 'Bruno commented on “Idea alfa”'],
    ['una risposta di Claude salvata', comment({ ai_task: 'critique' }), 'Bruno saved an answer from Claude on “Idea alfa”'],
    ['un commento su una scheda che non c è più', comment({ item_id: 'cccccccc-0000-4000-8000-0000000000ff' }), 'Bruno commented on a card'],
  ]) {
    it(`annunciano i commenti: ${label}`, () => {
      assert.equal(notes.describeComment(row)?.text, expected);
    });
  }

  it('il promemoria del lunedì chiede le ore in inglese', () => {
    const current = availability.thisMonday();
    const last = availability.addDays(current, -7);
    const before = availability.addDays(last, -7);
    store.applyItem(item({ id: 'cccccccc-0000-4000-8000-0000000000f1', kind: 'timesheet', title: 'Hours', data: { week: before, pledge: 480, entries: [{ id: 'a1', day: 'lun', start: 540, end: 600, area: 'prodotto' }] } }));
    const [y, m, d] = current.split('-').map(Number);
    const note = notes.timesheetReminder(new Date(y, m - 1, d, 9));
    assert.equal(note.text, `You have not logged your hours for the week ${availability.weekLabel(last)} yet`);
  });
});

describe('campanella in inglese', () => {
  async function bell() {
    store.writeLocal(READ, '2026-10-18T09:00:00Z');
    api.activityFeed = async () => ({ revisions: [rev({ id: 11, op: 'create', title: 'First', created_at: '2026-10-18T10:00:00Z' })], comments: [] });
    const box = bellView.notificationBell();
    document.body.append(box);
    await notes.startNotifications();
    return box;
  }

  it('il pulsante dice quante notifiche ci sono da leggere', async () => {
    const box = await bell();
    const button = box.querySelector('button.bell');
    assert.equal(button.getAttribute('aria-label'), 'Notifications, 1 to read');
    assert.equal(box.querySelector('.bell-panel').getAttribute('aria-label'), 'Notifications');
    notes.markAllRead();
    assert.equal(button.getAttribute('aria-label'), 'Notifications');
  });

  it('il pannello, le letture e il rimando al Profilo sono in inglese', async () => {
    const box = await bell();
    box.querySelector('button.bell').click();
    const panel = box.querySelector('.bell-panel');
    assert.equal(text(panel.querySelector('.bell-head strong')), 'Notifications');
    assert.match(text(panel), /Bruno added the idea “First”/);
    assert.equal(text(panel.querySelector('.bell-foot')), 'Alerts even when the site is in another tab: turn them on in your Profile.');
    byText(panel, 'button', 'Mark all as read').click();
    assert.equal(text(panel.querySelector('.bell-empty')), 'Nothing new to read.');
    byText(panel, 'button', 'Show the ones already read too').click();
    assert.equal(panel.querySelectorAll('.bell-item').length, 1);
    assert.ok(byText(panel, 'button', 'Hide the ones already read'));
  });

  it('una notifica dal vivo arriva con un avviso in inglese', async () => {
    await bell();
    store.emit('revision', rev({ id: 12, project_id: PROJECT, op: 'create', title: 'Second', created_at: '2026-10-18T12:00:00Z' }));
    await flush();
    assert.match(text(document.querySelector('.toasts')), /Bruno added the idea “Second”/);
  });

  it('nel pannello non restano parole italiane', async () => {
    const box = await bell();
    box.querySelector('button.bell').click();
    const attributes = [...box.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label'));
    assert.deepEqual(italianWords([text(box), ...attributes].join(' ')), []);
  });
});
