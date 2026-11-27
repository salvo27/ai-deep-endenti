import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, text, byText, typeInto } from '../setup/dom.mjs';
import { italianWords } from '../setup/italian.mjs';
import { ME, OTHER, members, projects } from '../setup/fixtures.mjs';

// Su un dispositivo in inglese: la lingua si decide quando il sito si carica, per questo i moduli arrivano dopo la scelta.
useLanguage('en');

let api;
let store;
let team;
let original;
let fake;
let outlet;

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  team = await import('../../assets/js/views/team.js');
  original = { ...api };
  fake = globalThis.__fakeSupabase;
});

beforeEach(() => {
  fake.reset();
  store.resetStore();
  store.state.user = { id: ME };
  store.setProjects(projects());
  store.setProject(projects()[0]);
  store.setMembers(members());
  api.membersOverview = async () => members();
  api.activitySince = async () => [{ author_id: ME }];
  api.auditLog = async () => [
    { id: 3, event: 'member_role_changed', actor_id: ME, target_id: OTHER, details: { from: 'member', to: 'advisor' }, created_at: '2026-10-17T10:00:00Z' },
    { id: 2, event: 'project_renamed', actor_id: ME, target_id: null, details: { from: 'Alfa', to: 'Alfa 2' }, created_at: '2026-10-16T10:00:00Z' },
    { id: 1, event: 'project_created', actor_id: null, target_id: null, details: { name: 'Alfa' }, created_at: '2026-10-15T10:00:00Z' },
  ];
  document.body.querySelectorAll('dialog, .toasts, main').forEach((el) => el.remove());
});

afterEach(() => Object.assign(api, original));

async function open() {
  outlet = document.createElement('main');
  document.body.append(outlet);
  team.teamView(outlet);
  await flush(5);
  return outlet;
}

// Quello che si legge, testo e attributi, senza le iniziali degli avatar e le date relative.
function leftovers(root) {
  const copy = root.cloneNode(true);
  copy.querySelectorAll('.avatar, time').forEach((el) => el.remove());
  const attributes = [...copy.querySelectorAll('[aria-label],[title],[placeholder]')].flatMap((el) =>
    ['aria-label', 'title', 'placeholder'].map((name) => el.getAttribute(name)).filter(Boolean),
  );
  return italianWords([copy.textContent, ...attributes].join(' '));
}

const dialog = () => document.querySelector('dialog.modal');
const toasts = () => text(document.querySelector('.toasts'));

describe('pagina Membri in inglese', () => {
  it('intestazione, tabella, modulo, riepilogo e registro sono in inglese', async () => {
    await open();
    assert.equal(text(outlet.querySelector('h1')), 'Members');
    assert.deepEqual([...outlet.querySelectorAll('thead th')].map((th) => text(th)), ['Person', 'Role', 'Email', 'Two-step verification', 'Last seen', 'Edits (30 days)', '']);
    assert.deepEqual([...outlet.querySelectorAll('tbody tr')].map((tr) => text(tr.querySelector('.person-name'))), ['Anna (you)', 'Bruno', 'Chiara']);
    assert.ok(outlet.querySelector('select[aria-label="Role of Bruno"]'));
    assert.ok(outlet.querySelector('button[title="Remove Bruno"]'));
    assert.deepEqual([...outlet.querySelectorAll('.log-main')].map((el) => text(el)), [
      'Anna changed the role of Bruno (Member → Advisor)',
      'Anna renamed the project (Alfa → Alfa 2)',
      'System created the project “Alfa”',
    ]);
    assert.deepEqual(leftovers(outlet), []);
  });

  it('l anteprima del riepilogo conta le persone in inglese', async () => {
    api.weeklyPreview = async () => ({ recipients: 2, empty: 1, optedOut: 1, preview: null });
    await open();
    byText(outlet, 'button', 'Preview').click();
    await flush(5);
    assert.match(text(outlet), /Right now 2 people would receive it \(1 person has nothing to read, 1 person turned it off\)\./);
    assert.match(text(outlet), /Your summary would be empty/);
    assert.deepEqual(leftovers(outlet), []);
  });

  it('mandare il riepilogo chiede conferma e racconta com è andata in inglese', async () => {
    api.weeklyPreview = async () => ({ recipients: 1, empty: 0, optedOut: 0, preview: null });
    api.sendWeeklyNow = async () => ({ configured: true, sent: 1, already: 2, failed: 0 });
    await open();
    byText(outlet, 'button', 'Send to everyone now').click();
    await flush(5);
    assert.equal(text(dialog().querySelector('h2')), 'Send the summary to everyone?');
    assert.match(text(dialog()), /The summary goes out now to 1 person\./);
    byText(dialog().querySelector('.modal-actions'), 'button', 'Send').click();
    await flush(5);
    assert.match(toasts(), /Summary sent to 1 person \(2 people had already received it today\)\./);
  });

  it('rimuovere chiede conferma in inglese', async () => {
    await open();
    outlet.querySelector('button[title="Remove Bruno"]').click();
    await flush();
    assert.match(text(dialog()), /Bruno will lose access to this project straight away\./);
    byText(dialog(), 'button', 'Cancel').click();
    await flush();
  });

  it('un modulo incompleto e un errore del database si leggono in inglese', async () => {
    fake.responses.rpc.add_member = { data: null, error: { code: 'P0002', message: 'user_not_found' } };
    await open();
    const form = outlet.querySelector('form');
    form.dispatchEvent(new window.Event('submit', { cancelable: true }));
    await flush();
    assert.match(text(form), /Enter an email and a name\./);
    const [email, name] = form.querySelectorAll('input');
    typeInto(email, 'nobody@test.it');
    typeInto(name, 'Nobody');
    form.dispatchEvent(new window.Event('submit', { cancelable: true }));
    await flush(5);
    assert.match(text(form), /No account with this email/);
    assert.doesNotMatch(text(form), /user_not_found/);
  });
});
