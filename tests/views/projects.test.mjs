import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text, byText, typeInto } from '../setup/dom.mjs';
import { ME, OTHER, PROJECT, PROJECT2, PROJECT3, XSS, members, projects } from '../setup/fixtures.mjs';

let api;
let store;
let view;
let original;
let fake;
let outlet;
let calls;
let events;

const NEW = 'a0000000-0000-4000-8000-000000000009';

// Come li restituisce all_projects(): archiviati compresi, con quante persone e quanti admin hanno.
const ALL = () => [
  { id: PROJECT, name: 'Alfa', created_by: ME, created_at: '2026-10-01T10:00:00Z', archived_at: null, member_count: 3, admin_count: 1 },
  { id: PROJECT2, name: 'Beta', created_by: ME, created_at: '2026-10-02T10:00:00Z', archived_at: null, member_count: 1, admin_count: 0 },
  { id: PROJECT3, name: 'Gamma', created_by: OTHER, created_at: '2026-10-03T10:00:00Z', archived_at: '2026-11-01T10:00:00Z', member_count: 2, admin_count: 1 },
];

// Come li restituisce api.platformAdmins(): il nome del profilo, null per chi non ne ha ancora uno.
const ADMINS = () => [
  { user_id: ME, created_at: '2026-10-01T10:00:00Z', display_name: 'Anna', color: '#4f5bd5' },
  { user_id: OTHER, created_at: '2026-10-05T10:00:00Z', display_name: null, color: null },
];

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  view = await import('../../assets/js/views/projects.js');
  original = { ...api };
  fake = globalThis.__fakeSupabase;
});

const record = (name, result) => async (...args) => {
  calls.push([name, ...args]);
  return typeof result === 'function' ? result(...args) : result;
};

beforeEach(() => {
  fake.reset();
  store.resetStore();
  store.state.user = { id: ME, email: 'me@test.it' };
  store.state.platformAdmin = true;
  store.setProjects([projects()[0]]);
  store.setProject(projects()[0]);
  store.setMembers(members());
  calls = [];
  events = 0;
  store.on('projects', () => (events += 1));
  api.allProjects = record('allProjects', () => ALL());
  api.platformAdmins = record('platformAdmins', () => ADMINS());
  api.createProject = record('createProject', (name) => ({ id: NEW, name, archived_at: null }));
  api.renameProject = record('renameProject', (id, name) => ({ id, name }));
  api.archiveProject = record('archiveProject', (id) => ({ id }));
  api.unarchiveProject = record('unarchiveProject', (id) => ({ id }));
  api.membersOverview = record('membersOverview', () => members());
  api.addMember = record('addMember', null);
  api.updateMemberRole = record('updateMemberRole', null);
  api.removeMember = record('removeMember', null);
  api.myProjects = record('myProjects', () => [projects()[0]]);
  api.addPlatformAdmin = record('addPlatformAdmin', null);
  api.removePlatformAdmin = record('removePlatformAdmin', null);
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

const named = (name) => calls.filter(([n]) => n === name);
const dialog = () => document.querySelector('dialog.modal');
const toasts = () => text(document.querySelector('.toasts'));
const button = (title) => outlet.querySelector(`button[title="${title}"]`);
const rows = () => [...outlet.querySelectorAll('.projects-table tbody tr')].map((tr) => [...tr.children].slice(0, 4).map((td) => text(td)));
const people = () => outlet.querySelector('.project-people');
const peopleRows = () => [...people().querySelectorAll('tbody tr')].map((tr) => [text(tr.querySelector('.person-name')), text(tr.children[1]), tr.querySelector('select').value]);
const admins = () => outlet.querySelector('.platform-admins');

async function confirm(label) {
  byText(dialog().querySelector('.modal-actions'), 'button', label).click();
  await flush(5);
}

async function submit(form) {
  form.dispatchEvent(new window.Event('submit', { cancelable: true }));
  await flush(5);
}

// Un errore del database com'è davvero: un codice, che il sito traduce (docs/PROGETTI.md, «Errori»).
const dbError = (code, message) => ({ data: null, error: { code, message } });

describe('chi vede la pagina Progetti', () => {
  // [chi, il mio ruolo nel progetto aperto]
  for (const [who, role] of [
    ['un admin di progetto', 'admin'],
    ['un membro', 'member'],
    ['un advisor', 'advisor'],
  ]) {
    it(`${who} legge solo che la pagina non è per lui, e non si chiede nulla al database`, async () => {
      store.state.platformAdmin = false;
      store.setMembers(members().map((m) => (m.user_id === ME ? { ...m, role } : m)));
      await open();
      assert.equal(text(outlet.querySelector('h1')), 'Progetti');
      assert.match(text(outlet), /Questa pagina è riservata agli amministratori della piattaforma\./);
      assert.equal(outlet.querySelector('form'), null);
      assert.deepEqual(calls, []);
    });
  }

  it('l amministratore della piattaforma la apre anche senza un progetto aperto', async () => {
    store.setProject(null);
    store.setMembers([]);
    await open();
    assert.equal(rows().length, 3);
  });
});

describe('elenco dei progetti', () => {
  it('mostra tutti i progetti, archiviati compresi, con persone, admin, stato e il mio ruolo', async () => {
    await open();
    assert.deepEqual(rows(), [
      ['Alfa Tu: Admin', '3', '1', 'Attivo'],
      ['Beta', '1', '0 Nessun admin', 'Attivo'],
      ['Gamma', '2', '1', 'Archiviato'],
    ]);
  });

  it('dice che l amministratore della piattaforma non vede i contenuti se non si aggiunge, e che l aggiunta resta nel registro', async () => {
    await open();
    const notice = text(outlet.querySelector('.projects-privacy'));
    assert.match(notice, /non vedi i contenuti di un progetto/);
    assert.match(notice, /devi aggiungerti come membro/);
    assert.match(notice, /resta nel registro di sicurezza/);
  });

  it('un progetto attivo si rinomina e si archivia, uno archiviato si riattiva soltanto', async () => {
    await open();
    assert.ok(button('Rinomina Alfa'));
    assert.ok(button('Archivia Alfa'));
    assert.equal(button('Riattiva Alfa'), null);
    assert.ok(button('Riattiva Gamma'));
    assert.equal(button('Rinomina Gamma'), null);
    assert.equal(button('Archivia Gamma'), null);
  });

  it('senza progetti invita a crearne uno', async () => {
    api.allProjects = async () => [];
    await open();
    assert.match(text(outlet), /Non c'è ancora nessun progetto: creane uno qui sopra\./);
  });

  it('se l elenco non arriva lo dice con il testo del suo errore', async () => {
    api.allProjects = original.allProjects;
    fake.responses.rpc.all_projects = dbError('42501', 'not_allowed');
    await open();
    assert.match(text(outlet.querySelector('.projects-list')), /Non hai i permessi per questa operazione\./);
  });

  it('i nomi restano testo', async () => {
    api.allProjects = async () => [{ ...ALL()[0], name: XSS }];
    await open();
    assert.equal(outlet.querySelector('img'), null);
    assert.ok(text(outlet).includes(XSS));
  });
});

describe('nome di un progetto', () => {
  const max = 'x'.repeat(80);
  // [valore scritto, nome che si manda al database (null: rifiutato)]
  for (const [value, expected] of [
    ['Alfa', 'Alfa'],
    ['  Alfa  ', 'Alfa'],
    ['a', 'a'],
    [max, max],
    [`  ${max}  `, max],
    ['Due  spazi dentro', 'Due  spazi dentro'],
    ['🚀'.repeat(80), '🚀'.repeat(80)],
    [`${max}x`, null],
    ['🚀'.repeat(81), null],
    ['', null],
    ['   ', null],
    [null, null],
    [undefined, null],
    [42, null],
  ]) {
    it(`${JSON.stringify(value)?.slice(0, 30) ?? 'undefined'} ${expected === null ? 'è rifiutato' : 'va bene'}`, () => {
      assert.equal(view.cleanProjectName(value), expected);
    });
  }
});

describe('nuovo progetto', () => {
  it('si crea con il nome senza spazi ai bordi, l elenco si aggiorna e si aprono le sue persone', async () => {
    await open();
    const form = outlet.querySelector('.project-create');
    typeInto(form.querySelector('input[name="name"]'), '  Delta  ');
    await submit(form);
    assert.deepEqual(named('createProject'), [['createProject', 'Delta']]);
    assert.equal(named('allProjects').length, 2, 'l elenco si rilegge');
    assert.equal(form.querySelector('input[name="name"]').value, '');
    assert.match(toasts(), /Progetto «Delta» creato\./);
    assert.deepEqual(named('membersOverview').at(-1), ['membersOverview', NEW]);
    assert.equal(text(people().querySelector('h2')), 'Persone di «Delta»');
  });

  // [nome, creato]
  for (const [value, created] of [
    ['', false],
    ['   ', false],
    ['x'.repeat(81), false],
    ['x'.repeat(80), true],
    ['y', true],
  ]) {
    it(`con ${value.length} caratteri ${created ? 'si crea' : 'non si crea e dice perché'}`, async () => {
      await open();
      const form = outlet.querySelector('.project-create');
      typeInto(form.querySelector('input[name="name"]'), value);
      await submit(form);
      assert.equal(named('createProject').length, created ? 1 : 0);
      const said = /Il nome del progetto deve avere da 1 a 80 caratteri\./.test(text(form));
      assert.equal(said, !created);
    });
  }

  it('il campo del nome non accetta più di 80 caratteri', async () => {
    await open();
    assert.equal(outlet.querySelector('.project-create input[name="name"]').maxLength, 80);
  });

  it('un nome rifiutato dal database si legge nel testo del suo codice', async () => {
    api.createProject = original.createProject;
    fake.responses.rpc.create_project = dbError('22023', 'invalid_project_name');
    await open();
    const form = outlet.querySelector('.project-create');
    typeInto(form.querySelector('input[name="name"]'), 'Delta');
    await submit(form);
    assert.match(text(form), /Il nome del progetto deve avere da 1 a 80 caratteri\./);
    assert.doesNotMatch(text(form), /invalid_project_name/);
  });
});

describe('rinominare, archiviare e riattivare', () => {
  it('rinomina con il nome senza spazi ai bordi e rilegge l elenco', async () => {
    await open();
    button('Rinomina Beta').click();
    await flush();
    assert.equal(text(dialog().querySelector('h2')), 'Rinomina «Beta»');
    const input = dialog().querySelector('input');
    assert.equal(input.value, 'Beta');
    assert.equal(input.maxLength, 80);
    input.value = '  Beta 2 ';
    await confirm('Rinomina');
    assert.deepEqual(named('renameProject'), [['renameProject', PROJECT2, 'Beta 2']]);
    assert.equal(named('allProjects').length, 2);
    assert.match(toasts(), /Progetto rinominato in «Beta 2»\./);
  });

  it('il progetto aperto rinominato cambia nome anche nel menu', async () => {
    await open();
    button('Rinomina Alfa').click();
    await flush();
    dialog().querySelector('input').value = 'Alfa 2';
    await confirm('Rinomina');
    assert.equal(store.state.project.name, 'Alfa 2');
    assert.equal(store.state.project.id, PROJECT);
    assert.equal(named('myProjects').length, 1, 'i miei progetti si rileggono');
    assert.ok(events >= 1, 'il menu viene avvisato');
  });

  // [nome nuovo, perché non si manda]
  for (const [value, why] of [['   ', 'vuoto'], ['x'.repeat(81), 'troppo lungo']]) {
    it(`un nome ${why} non si manda e si dice perché`, async () => {
      await open();
      button('Rinomina Beta').click();
      await flush();
      dialog().querySelector('input').value = value;
      await confirm('Rinomina');
      assert.deepEqual(named('renameProject'), []);
      assert.match(text(outlet.querySelector('.projects-list')), /Il nome del progetto deve avere da 1 a 80 caratteri\./);
    });
  }

  it('annullando la rinomina non succede nulla', async () => {
    await open();
    button('Rinomina Beta').click();
    await flush();
    await confirm('Annulla');
    assert.deepEqual(named('renameProject'), []);
  });

  it('archiviare chiede conferma dicendo cosa succede: i membri non leggono e non scrivono più, i dati restano', async () => {
    await open();
    button('Archivia Alfa').click();
    await flush();
    assert.equal(text(dialog().querySelector('h2')), 'Archiviare «Alfa»?');
    assert.match(text(dialog()), /I membri non potranno più leggerlo né scriverci finché un amministratore della piattaforma non lo riattiva\./);
    assert.match(text(dialog()), /I dati restano tutti, nessuno viene cancellato\./);
    await confirm('Annulla');
    assert.deepEqual(named('archiveProject'), []);

    button('Archivia Alfa').click();
    await flush();
    await confirm('Archivia');
    assert.deepEqual(named('archiveProject'), [['archiveProject', PROJECT]]);
    assert.equal(named('allProjects').length, 2);
    assert.ok(named('myProjects').length >= 1, 'un progetto archiviato sparisce dai miei');
    assert.match(toasts(), /Progetto «Alfa» archiviato\./);
  });

  // The members list still answers a platform admin for an archived project: the site leaves it all the same
  // (app.js then opens another project of mine, or the Projects page).
  it('archiviare il progetto aperto porta fuori da quel progetto', async () => {
    const left = [];
    store.on('removed', () => left.push('removed'));
    api.myProjects = record('myProjects', () => []);
    await open();
    button('Archivia Alfa').click();
    await flush();
    await confirm('Archivia');
    assert.deepEqual(left, ['removed']);
  });

  it('archiviare un altro progetto lascia aperto quello aperto', async () => {
    const left = [];
    store.on('removed', () => left.push('removed'));
    await open();
    button('Archivia Beta').click();
    await flush();
    await confirm('Archivia');
    assert.deepEqual(left, []);
  });

  it('riattivare chiede conferma dicendo che i membri tornano a leggerlo e scriverci', async () => {
    await open();
    button('Riattiva Gamma').click();
    await flush();
    assert.equal(text(dialog().querySelector('h2')), 'Riattivare «Gamma»?');
    assert.match(text(dialog()), /I membri torneranno a leggerlo e a scriverci come prima/);
    await confirm('Annulla');
    assert.deepEqual(named('unarchiveProject'), []);

    button('Riattiva Gamma').click();
    await flush();
    await confirm('Riattiva');
    assert.deepEqual(named('unarchiveProject'), [['unarchiveProject', PROJECT3]]);
    assert.match(toasts(), /Progetto «Gamma» riattivato\./);
  });

  it('un rifiuto del database si legge nel testo del suo codice', async () => {
    api.archiveProject = original.archiveProject;
    fake.responses.rpc.archive_project = dbError('P0002', 'project_not_found');
    await open();
    button('Archivia Beta').click();
    await flush();
    await confirm('Archivia');
    assert.match(text(outlet.querySelector('.projects-list')), /Il progetto non esiste o è archiviato\./);
  });
});

describe('persone di un progetto', () => {
  async function openPeople(title = 'Persone di Alfa') {
    await open();
    button(title).click();
    await flush(5);
    return people();
  }

  it('si aprono dal progetto e mostrano nome, email e ruolo di ognuno', async () => {
    const panel = await openPeople();
    assert.deepEqual(named('membersOverview'), [['membersOverview', PROJECT]]);
    assert.equal(text(panel.querySelector('h2')), 'Persone di «Alfa»');
    assert.deepEqual(peopleRows(), [
      ['Anna (tu)', 'me@test.it', 'admin'],
      ['Bruno', 'bruno@test.it', 'member'],
      ['Chiara', 'chiara@test.it', 'advisor'],
    ]);
    assert.equal(panel.querySelector('select[aria-label="Ruolo di Bruno"]').value, 'member');
    assert.match(text(panel), /Admin: gestisce le persone del progetto/);
  });

  it('cambiare un ruolo lo salva per quel progetto e rilegge persone ed elenco', async () => {
    const panel = await openPeople();
    const select = panel.querySelector('select[aria-label="Ruolo di Bruno"]');
    select.value = 'advisor';
    select.dispatchEvent(new window.Event('change'));
    await flush(5);
    assert.deepEqual(named('updateMemberRole'), [['updateMemberRole', PROJECT, OTHER, 'advisor']]);
    assert.ok(named('membersOverview').length >= 2, 'le persone si rileggono');
    assert.equal(named('allProjects').length, 2, 'i conteggi dell elenco si rileggono');
    assert.match(toasts(), /Ruolo aggiornato\./);
  });

  it('nel progetto aperto il cambio arriva anche ai membri del sito, che non arrivano più dal vivo', async () => {
    const panel = await openPeople();
    api.membersOverview = record('membersOverview', () => members().map((m) => (m.user_id === OTHER ? { ...m, role: 'advisor' } : m)));
    const select = panel.querySelector('select[aria-label="Ruolo di Bruno"]');
    select.value = 'advisor';
    select.dispatchEvent(new window.Event('change'));
    await flush(5);
    assert.equal(store.memberById(OTHER).role, 'advisor');
  });

  it('togliere l ultimo admin è rifiutato e si legge il testo del codice, con il ruolo di prima', async () => {
    api.updateMemberRole = original.updateMemberRole;
    fake.responses.from.members = dbError('P0001', 'last_project_admin');
    const panel = await openPeople();
    const select = people().querySelector('select[aria-label="Ruolo di Anna"]');
    select.value = 'member';
    select.dispatchEvent(new window.Event('change'));
    await flush(5);
    assert.match(text(people()), /Nel progetto deve restare almeno un admin\./);
    assert.equal(people().querySelector('select[aria-label="Ruolo di Anna"]').value, 'admin');
    assert.ok(panel);
  });

  it('rimuovere chiede conferma, toglie la persona da quel progetto e rilegge', async () => {
    await openPeople();
    button('Rimuovi Bruno').click();
    await flush();
    assert.equal(text(dialog().querySelector('h2')), 'Rimuovere Bruno?');
    assert.match(text(dialog()), /Non potrà più aprire «Alfa»\. Quello che ha scritto resta\./);
    await confirm('Annulla');
    assert.deepEqual(named('removeMember'), []);
    button('Rimuovi Bruno').click();
    await flush();
    await confirm('Rimuovi');
    assert.deepEqual(named('removeMember'), [['removeMember', PROJECT, OTHER]]);
    assert.ok(named('membersOverview').length >= 2);
  });

  it('chi rimuove se stesso lo legge nella conferma, e i suoi progetti si rileggono', async () => {
    await openPeople();
    button('Rimuovi Anna').click();
    await flush();
    assert.match(text(dialog()), /Non potrai più aprire «Alfa»/);
    await confirm('Rimuovi');
    assert.deepEqual(named('removeMember'), [['removeMember', PROJECT, ME]]);
    assert.ok(named('myProjects').length >= 1);
  });

  it('chi toglie se stesso dal progetto aperto ne esce', async () => {
    const left = [];
    store.on('removed', () => left.push('removed'));
    await openPeople();
    api.membersOverview = record('membersOverview', () => members().filter((m) => m.user_id !== ME));
    api.myProjects = record('myProjects', () => []);
    button('Rimuovi Anna').click();
    await flush();
    await confirm('Rimuovi');
    assert.deepEqual(left, ['removed']);
  });

  it('si aggiunge una persona per email, con nome e ruolo, a quel progetto', async () => {
    await openPeople('Persone di Beta');
    const form = people().querySelector('form');
    typeInto(form.querySelector('input[name="email"]'), '  nuovo@test.it ');
    typeInto(form.querySelector('input[name="name"]'), ' Nuovo Membro ');
    form.querySelector('select[name="role"]').value = 'admin';
    await submit(form);
    assert.deepEqual(named('addMember'), [['addMember', PROJECT2, 'nuovo@test.it', 'Nuovo Membro', 'admin']]);
    assert.equal(form.querySelector('input[name="email"]').value, '');
    assert.match(toasts(), /Persona aggiunta al progetto\./);
    assert.ok(named('membersOverview').length >= 2);
  });

  it('il nome si può lasciare vuoto: il database usa il profilo o l email', async () => {
    await openPeople('Persone di Beta');
    const form = people().querySelector('form');
    typeInto(form.querySelector('input[name="email"]'), 'nuovo@test.it');
    await submit(form);
    assert.deepEqual(named('addMember'), [['addMember', PROJECT2, 'nuovo@test.it', null, 'member']]);
  });

  // [email scritta]
  for (const value of ['', 'senza-chiocciola', 'a@b', 'due parole@test.it']) {
    it(`un email non valida (${JSON.stringify(value)}) non si manda`, async () => {
      await openPeople('Persone di Beta');
      const form = people().querySelector('form');
      typeInto(form.querySelector('input[name="email"]'), value);
      await submit(form);
      assert.deepEqual(named('addMember'), []);
      assert.match(text(form), /Inserisci un'email valida\./);
    });
  }

  it('un account che non esiste si legge nel testo del codice', async () => {
    api.addMember = original.addMember;
    fake.responses.rpc.add_member = dbError('P0002', 'user_not_found');
    await openPeople('Persone di Beta');
    const form = people().querySelector('form');
    typeInto(form.querySelector('input[name="email"]'), 'nessuno@test.it');
    await submit(form);
    assert.match(text(form), /Nessun account con questa email: va creato prima in Supabase\./);
    assert.deepEqual(fake.calls.find(([kind, name]) => kind === 'rpc' && name === 'add_member')[2], {
      p_project: PROJECT2,
      p_email: 'nessuno@test.it',
      p_display_name: null,
      p_role: 'member',
    });
  });

  it('chi si aggiunge da solo ritrova il progetto nel menu', async () => {
    api.myProjects = record('myProjects', () => [projects()[0], { id: PROJECT2, name: 'Beta', role: 'admin' }]);
    await openPeople('Persone di Beta');
    const form = people().querySelector('form');
    typeInto(form.querySelector('input[name="email"]'), 'me@test.it');
    await submit(form);
    assert.deepEqual(store.state.projects.map((p) => p.id), [PROJECT, PROJECT2]);
    assert.ok(events >= 1);
  });

  it('un progetto archiviato mostra le sue persone ma non si aggiunge nessuno', async () => {
    await openPeople('Persone di Gamma');
    assert.match(text(people()), /Il progetto è archiviato: per aggiungere persone va prima riattivato\./);
    assert.equal(people().querySelector('form'), null);
  });

  it('un progetto senza persone lo dice', async () => {
    api.membersOverview = async () => [];
    await openPeople('Persone di Beta');
    assert.match(text(people()), /Nessuno fa parte di questo progetto: aggiungi almeno un admin\./);
  });

  it('il pannello si chiude', async () => {
    await openPeople();
    byText(people(), 'button', 'Chiudi').click();
    await flush();
    assert.equal(people(), null);
  });
});

describe('amministratori della piattaforma', () => {
  it('sono elencati con il nome del profilo, chi non ne ha uno e da quando', async () => {
    await open();
    const entries = [...admins().querySelectorAll('li')].map((li) => text(li.querySelector('.admin-name')));
    assert.deepEqual(entries, ['Anna (tu)', 'Account senza profilo']);
    assert.match(text(admins()), /dal 1 ott 2026/);
    assert.match(text(admins()), /Deve restarne sempre almeno uno\./);
  });

  it('se ne aggiunge uno per email', async () => {
    await open();
    const form = admins().querySelector('form');
    typeInto(form.querySelector('input[name="email"]'), ' nuova@test.it ');
    await submit(form);
    assert.deepEqual(named('addPlatformAdmin'), [['addPlatformAdmin', 'nuova@test.it']]);
    assert.equal(named('platformAdmins').length, 2);
    assert.match(toasts(), /Amministratore aggiunto\./);
  });

  it('un email non valida non si manda', async () => {
    await open();
    const form = admins().querySelector('form');
    typeInto(form.querySelector('input[name="email"]'), 'nuova');
    await submit(form);
    assert.deepEqual(named('addPlatformAdmin'), []);
    assert.match(text(form), /Inserisci un'email valida\./);
  });

  it('un account che non esiste si legge nel testo del codice', async () => {
    api.addPlatformAdmin = original.addPlatformAdmin;
    fake.responses.rpc.add_platform_admin = dbError('P0002', 'user_not_found');
    await open();
    const form = admins().querySelector('form');
    typeInto(form.querySelector('input[name="email"]'), 'nessuno@test.it');
    await submit(form);
    assert.match(text(form), /Nessun account con questa email/);
  });

  it('se ne rimuove uno dopo una conferma che dice cosa perde', async () => {
    await open();
    button('Rimuovi Account senza profilo').click();
    await flush();
    assert.match(text(dialog()), /Account senza profilo non potrà più gestire progetti e persone\./);
    await confirm('Rimuovi');
    assert.deepEqual(named('removePlatformAdmin'), [['removePlatformAdmin', OTHER]]);
    assert.equal(named('platformAdmins').length, 2);
    assert.match(toasts(), /Amministratore rimosso\./);
  });

  it('l ultimo non si rimuove: si legge il testo del codice', async () => {
    api.removePlatformAdmin = original.removePlatformAdmin;
    fake.responses.rpc.remove_platform_admin = dbError('P0001', 'last_platform_admin');
    await open();
    button('Rimuovi Anna').click();
    await flush();
    await confirm('Rimuovi');
    assert.match(text(admins()), /Deve restare almeno un amministratore della piattaforma\./);
    assert.equal(store.state.platformAdmin, true);
  });

  it('chi rimuove se stesso lo legge nella conferma, poi la pagina e il menu non sono più per lui', async () => {
    await open();
    button('Rimuovi Anna').click();
    await flush();
    assert.match(text(dialog()), /Non potrai più gestire progetti e persone\./);
    await confirm('Rimuovi');
    assert.deepEqual(named('removePlatformAdmin'), [['removePlatformAdmin', ME]]);
    assert.equal(store.state.platformAdmin, false);
    assert.ok(events >= 1);
    assert.match(text(outlet), /Questa pagina è riservata agli amministratori della piattaforma\./);
  });
});
