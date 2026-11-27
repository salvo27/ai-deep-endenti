import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, text, byText, typeInto } from '../setup/dom.mjs';
import { italianWords } from '../setup/italian.mjs';
import { ME, OTHER, PROJECT, PROJECT2, PROJECT3, members, projects } from '../setup/fixtures.mjs';

// Su un dispositivo in inglese: la lingua si decide quando il sito si carica, per questo i moduli arrivano dopo la scelta.
useLanguage('en');

let api;
let store;
let view;
let original;
let fake;
let outlet;

const ALL = () => [
  { id: PROJECT, name: 'Alfa', created_by: ME, created_at: '2026-10-01T10:00:00Z', archived_at: null, member_count: 3, admin_count: 1 },
  { id: PROJECT2, name: 'Beta', created_by: ME, created_at: '2026-10-02T10:00:00Z', archived_at: null, member_count: 1, admin_count: 0 },
  { id: PROJECT3, name: 'Gamma', created_by: OTHER, created_at: '2026-10-03T10:00:00Z', archived_at: '2026-11-01T10:00:00Z', member_count: 2, admin_count: 1 },
];

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  view = await import('../../assets/js/views/projects.js');
  original = { ...api };
  fake = globalThis.__fakeSupabase;
});

beforeEach(() => {
  fake.reset();
  store.resetStore();
  store.state.user = { id: ME, email: 'me@test.it' };
  store.state.platformAdmin = true;
  store.setProjects([projects()[0]]);
  store.setProject(projects()[0]);
  store.setMembers(members());
  api.allProjects = async () => ALL();
  api.platformAdmins = async () => [
    { user_id: ME, created_at: '2026-10-01T10:00:00Z', display_name: 'Anna', color: '#4f5bd5' },
    { user_id: OTHER, created_at: '2026-10-05T10:00:00Z', display_name: null, color: null },
  ];
  api.membersOverview = async () => members();
  api.myProjects = async () => [projects()[0]];
  document.body.querySelectorAll('dialog, .toasts, main').forEach((el) => el.remove());
});

afterEach(() => Object.assign(api, original));

async function open() {
  outlet = document.createElement('main');
  document.body.append(outlet);
  view.projectsView(outlet);
  await flush(5);
  return outlet;
}

const dialog = () => document.querySelector('dialog.modal');
const button = (title) => outlet.querySelector(`button[title="${title}"]`);
const dbError = (code, message) => ({ data: null, error: { code, message } });

// Quello che si legge, testo e attributi, senza le iniziali degli avatar.
function leftovers(root) {
  const copy = root.cloneNode(true);
  copy.querySelectorAll('.avatar').forEach((el) => el.remove());
  const attributes = [...copy.querySelectorAll('[aria-label],[title],[placeholder]')].flatMap((el) =>
    ['aria-label', 'title', 'placeholder'].map((name) => el.getAttribute(name)).filter(Boolean),
  );
  return italianWords([copy.textContent, ...attributes].join(' '));
}

describe('pagina Progetti in inglese', () => {
  it('chi non è amministratore della piattaforma legge che la pagina non è per lui', async () => {
    store.state.platformAdmin = false;
    await open();
    assert.equal(text(outlet.querySelector('h1')), 'Projects');
    assert.match(text(outlet), /This page is for platform admins only\./);
  });

  it('elenco, avviso sui contenuti, persone e amministratori sono tutti in inglese', async () => {
    await open();
    button('People of Alfa').click();
    await flush(5);
    assert.deepEqual(leftovers(outlet), []);
    const rows = [...outlet.querySelectorAll('.projects-table tbody tr')].map((tr) => [...tr.children].slice(0, 4).map((td) => text(td)));
    assert.deepEqual(rows, [
      ['Alfa You: Admin', '3', '1', 'Active'],
      ['Beta', '1', '0 No admin', 'Active'],
      ['Gamma', '2', '1', 'Archived'],
    ]);
    assert.match(text(outlet.querySelector('.projects-privacy')), /you do not see what is inside a project: to read it you have to add yourself as a member, and adding yourself is recorded in the security log/);
    assert.equal(text(outlet.querySelector('.project-people h2')), 'People of “Alfa”');
    assert.deepEqual([...outlet.querySelectorAll('.admin-name')].map((el) => text(el)), ['Anna (you)', 'Account without a profile']);
    assert.match(text(outlet.querySelector('.platform-admins')), /since 1 Oct 2026/);
  });

  it('archiviare e riattivare chiedono conferma in inglese, dicendo cosa succede', async () => {
    await open();
    button('Archive Alfa').click();
    await flush();
    assert.equal(text(dialog().querySelector('h2')), 'Archive “Alfa”?');
    assert.match(text(dialog()), /Its members will no longer be able to read it or write in it until a platform admin reactivates it\. All the data stays: nothing is deleted\./);
    byText(dialog(), 'button', 'Cancel').click();
    await flush();
    button('Reactivate Gamma').click();
    await flush();
    assert.equal(text(dialog().querySelector('h2')), 'Reactivate “Gamma”?');
    assert.match(text(dialog()), /Its members will be able to read it and write in it again/);
    byText(dialog(), 'button', 'Cancel').click();
    await flush();
  });

  it('un nome oltre gli 80 caratteri si rifiuta in inglese', async () => {
    let created = 0;
    api.createProject = async () => (created += 1);
    await open();
    const form = outlet.querySelector('.project-create');
    typeInto(form.querySelector('input[name="name"]'), 'x'.repeat(81));
    form.dispatchEvent(new window.Event('submit', { cancelable: true }));
    await flush(5);
    assert.equal(created, 0);
    assert.match(text(form), /The project name must be 1 to 80 characters long\./);
  });

  // [codice, cosa lo provoca, testo inglese]
  for (const [code, sqlstate, setup, expected] of [
    ['user_not_found', 'P0002', 'add_member', /No account/i],
    ['last_platform_admin', 'P0001', 'remove_platform_admin', /at least one platform admin/i],
  ]) {
    it(`l errore ${code} si legge in inglese, mai come codice`, async () => {
      fake.responses.rpc[setup] = dbError(sqlstate, code);
      await open();
      if (setup === 'add_member') {
        button('People of Beta').click();
        await flush(5);
        const form = outlet.querySelector('.project-people form');
        typeInto(form.querySelector('input[name="email"]'), 'nobody@test.it');
        form.dispatchEvent(new window.Event('submit', { cancelable: true }));
      } else {
        button('Remove Anna').click();
        await flush();
        byText(dialog().querySelector('.modal-actions'), 'button', 'Remove').click();
      }
      await flush(5);
      assert.match(text(outlet), expected);
      assert.doesNotMatch(text(outlet), new RegExp(code));
      assert.deepEqual(leftovers(outlet), []);
    });
  }

  it('togliere l ultimo admin del progetto si rifiuta con il testo inglese', async () => {
    fake.responses.from.members = dbError('P0001', 'last_project_admin');
    await open();
    button('People of Alfa').click();
    await flush(5);
    const select = outlet.querySelector('select[aria-label="Role of Anna"]');
    select.value = 'member';
    select.dispatchEvent(new window.Event('change'));
    await flush(5);
    assert.match(text(outlet.querySelector('.project-people')), /at least one admin/i);
    assert.doesNotMatch(text(outlet), /last_project_admin/);
  });
});
