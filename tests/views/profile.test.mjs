import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text, tick, typeInto } from '../setup/dom.mjs';
import { ME, members, projects } from '../setup/fixtures.mjs';

let api;
let store;
let profile;
let original;
let calls;

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  profile = await import('../../assets/js/views/profile.js');
  original = { ...api };
});

const record = (name, result) => async (...args) => {
  calls.push([name, ...args]);
  return typeof result === 'function' ? result(...args) : result;
};

beforeEach(() => {
  localStorage.clear();
  store.resetStore();
  store.state.user = { id: ME, email: 'anna@test.it' };
  store.setProjects(projects());
  store.setProject(projects()[0]);
  store.setMembers(members());
  calls = [];
  api.listFactors = async () => [];
  api.aiUsageLastDay = async () => 0;
  api.emailPrefs = async () => ({ mentions: true, weekly: true });
  api.updateProfile = record('updateProfile', (patch) => ({ user_id: ME, ...patch }));
  api.membersOverview = record('membersOverview', () => members());
  api.myProfile = record('myProfile', () => ({ user_id: ME, display_name: 'Anna dal profilo', color: '#123456', language: 'it' }));
  api.updateMember = async () => {
    throw new Error('il profilo non passa più dai membri');
  };
  document.body.querySelectorAll('dialog, .toasts, main').forEach((el) => el.remove());
});

afterEach(() => Object.assign(api, original));

async function open() {
  const outlet = document.createElement('main');
  document.body.append(outlet);
  profile.profileView(outlet);
  await flush(5);
  return outlet;
}

const named = (name) => calls.filter(([n]) => n === name);
const card = (outlet) => outlet.querySelector('form.profile-card');
const toasts = () => text(document.querySelector('.toasts'));

async function save(form, name) {
  if (name !== undefined) typeInto(form.querySelector('input[type="text"]'), name);
  form.dispatchEvent(new window.Event('submit', { cancelable: true }));
  await flush(5);
}

describe('scheda Profilo', () => {
  it('salva nome e colore nel profilo, che vale in tutti i progetti, e rilegge i membri del progetto aperto', async () => {
    const outlet = await open();
    api.membersOverview = record('membersOverview', () => members().map((m) => (m.user_id === ME ? { ...m, display_name: 'Anna B.' } : m)));
    await save(card(outlet), 'Anna B.');
    assert.deepEqual(named('updateProfile'), [['updateProfile', { display_name: 'Anna B.', color: '#4f5bd5' }]]);
    assert.deepEqual(named('membersOverview'), [['membersOverview', projects()[0].id]]);
    assert.equal(store.state.me.display_name, 'Anna B.', 'nome e avatar cambiano in tutto il sito');
    assert.match(toasts(), /Profilo aggiornato\./);
    assert.match(text(card(outlet)), /Nome e colore valgono in tutti i tuoi progetti\./);
  });

  // [nome scritto, nome salvato (null: rifiutato)]
  for (const [value, expected] of [
    ['', null],
    ['   ', null],
    ['A', 'A'],
    ['  Anna  ', 'Anna'],
    ['x'.repeat(80), 'x'.repeat(80)],
    ['x'.repeat(81), 'x'.repeat(80)],
  ]) {
    it(`un nome di ${value.length} caratteri ${expected === null ? 'non si salva' : `si salva come ${expected.length} caratteri`}`, async () => {
      const outlet = await open();
      assert.equal(card(outlet).querySelector('input[type="text"]').maxLength, 80);
      await save(card(outlet), value);
      if (expected === null) {
        assert.deepEqual(named('updateProfile'), []);
        assert.match(toasts(), /Nome o colore non validi\./);
      } else {
        assert.equal(named('updateProfile')[0][1].display_name, expected);
      }
    });
  }

  it('se il salvataggio non riesce lo dice con il testo dell errore', async () => {
    api.updateProfile = async () => {
      throw new Error('Modifica non riuscita.');
    };
    const outlet = await open();
    await save(card(outlet), 'Anna B.');
    assert.match(toasts(), /Modifica non riuscita\./);
  });

  // [mio ruolo, progetto aperto, sono amministratore della piattaforma, riga sotto il titolo]
  for (const [role, index, platformAdmin, line] of [
    ['admin', 0, false, 'anna@test.it · Admin in «Alfa»'],
    ['member', 1, false, 'anna@test.it · Membro in «Beta»'],
    ['advisor', 0, true, 'anna@test.it · Advisor in «Alfa» · Amministratore della piattaforma'],
  ]) {
    it(`mostra il ruolo nel progetto aperto: ${line}`, async () => {
      store.setProject(projects()[index]);
      store.setMembers(members().map((m) => (m.user_id === ME ? { ...m, role } : m)));
      store.state.platformAdmin = platformAdmin;
      const outlet = await open();
      assert.equal(text(card(outlet).querySelector('.profile-role')), line.replace('anna@test.it', 'me@test.it'));
    });
  }
});

describe('Profilo senza un progetto aperto', () => {
  beforeEach(() => {
    store.resetStore();
    store.state.user = { id: ME, email: 'anna@test.it' };
    store.state.platformAdmin = true;
  });

  it('legge nome e colore dal profilo e dice che nessun progetto è aperto', async () => {
    const outlet = await open();
    assert.equal(named('myProfile').length, 1);
    assert.equal(card(outlet).querySelector('input[type="text"]').value, 'Anna dal profilo');
    assert.equal(card(outlet).querySelector('input[type="color"]').value, '#123456');
    assert.equal(text(card(outlet).querySelector('.profile-role')), 'anna@test.it · Nessun progetto aperto · Amministratore della piattaforma');
  });

  // The database keeps email preferences only for whoever is in a project: switches here could only fail.
  it('le email non offrono interruttori: dice che partono quando si entra in un progetto', async () => {
    api.emailPrefs = record('emailPrefs', { mentions: true, weekly: true });
    api.setEmailPrefs = record('setEmailPrefs', null);
    const outlet = await open();
    const emails = [...outlet.querySelectorAll('section.card')].find((s) => text(s.querySelector('h2')) === 'Email');
    assert.equal(emails.querySelectorAll('input[type="checkbox"]').length, 0);
    assert.match(text(emails), /Le email partono quando entri in un progetto\./);
    assert.deepEqual(named('emailPrefs'), []);
  });

  it('quando la pagina Progetti mi ha già aggiunto a un progetto le email si scelgono', async () => {
    store.setProjects([projects()[0]]);
    api.emailPrefs = record('emailPrefs', { mentions: true, weekly: false });
    const outlet = await open();
    const emails = [...outlet.querySelectorAll('section.card')].find((s) => text(s.querySelector('h2')) === 'Email');
    assert.equal(emails.querySelectorAll('input[type="checkbox"]').length, 2);
    assert.match(text(emails), /Arrivano a anna@test\.it\./, 'le email arrivano all indirizzo dell account');
  });

  it('salva nel profilo senza rileggere membri che non ci sono', async () => {
    const outlet = await open();
    await save(card(outlet), 'Anna C.');
    assert.deepEqual(named('updateProfile'), [['updateProfile', { display_name: 'Anna C.', color: '#123456' }]]);
    assert.deepEqual(named('membersOverview'), []);
    assert.match(toasts(), /Profilo aggiornato\./);
  });

  it('finché il profilo non arriva non si salva, e se non arriva lo dice', async () => {
    let fail;
    api.myProfile = () => new Promise((resolve, reject) => (fail = reject));
    const outlet = await open();
    const submit = card(outlet).querySelector('button[type="submit"]');
    assert.equal(submit.disabled, true);
    fail(new Error('rete'));
    await flush(5);
    assert.equal(submit.disabled, true);
    assert.match(text(card(outlet)), /Profilo non disponibile\./);
    await save(card(outlet), 'Anna C.');
    assert.deepEqual(named('updateProfile'), []);
  });

  it('le altre schede ci sono tutte: lingua, password, dispositivi, notifiche, email e sessioni', async () => {
    const outlet = await open();
    const titles = [...outlet.querySelectorAll('.card h2')].map((el) => text(el));
    assert.deepEqual(titles, ['Profilo', 'Lingua', 'Password', 'Verifica in due passaggi', 'Notifiche', 'Email', 'Sessioni e uso']);
  });
});

describe('lingua salvata anche nel profilo', () => {
  const select = (box) => box.querySelector('select[name="language"]');
  function choose(box, value) {
    select(box).value = value;
    select(box).dispatchEvent(new window.Event('change', { bubbles: true }));
  }

  // [scelta, lingua nel profilo]: «automatica» salva la lingua del dispositivo, qui l'italiano dei test.
  for (const [choice, saved] of [
    ['en', 'en'],
    ['it', 'it'],
    ['auto', 'it'],
  ]) {
    it(`scegliendo ${choice} il profilo prende ${saved}, poi la pagina si ricarica`, async () => {
      let reloads = 0;
      let savedBeforeReload = null;
      const box = profile.languageCard(() => {
        reloads += 1;
        savedBeforeReload = named('updateProfile').length;
      });
      choose(box, choice);
      await flush();
      assert.deepEqual(named('updateProfile'), [['updateProfile', { language: saved }]]);
      assert.equal(reloads, 1);
      assert.equal(savedBeforeReload, 1, 'si ricarica dopo aver provato a salvare');
      assert.equal(localStorage.getItem('lingua'), choice === 'auto' ? null : choice);
    });
  }

  it('se il profilo non si salva la pagina si ricarica lo stesso', async () => {
    api.updateProfile = async () => {
      throw new Error('offline');
    };
    let reloads = 0;
    const box = profile.languageCard(() => (reloads += 1));
    choose(box, 'en');
    await flush();
    assert.equal(reloads, 1);
  });

  it('se il profilo non risponde la pagina si ricarica dopo poco', async () => {
    api.updateProfile = () => new Promise(() => {});
    let reloads = 0;
    const box = profile.languageCard(() => (reloads += 1), { waitMs: 300 });
    choose(box, 'en');
    await flush();
    assert.equal(reloads, 0);
    await tick(400);
    assert.equal(reloads, 1);
  });

  it('se il dispositivo non lascia salvare la scelta, il profilo non cambia e la pagina non si ricarica', async () => {
    let reloads = 0;
    const box = profile.languageCard(() => (reloads += 1));
    const { Storage } = window;
    const realSet = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('bloccato');
    };
    try {
      choose(box, 'en');
    } finally {
      Storage.prototype.setItem = realSet;
    }
    await flush();
    assert.equal(reloads, 0);
    assert.deepEqual(named('updateProfile'), []);
  });
});
