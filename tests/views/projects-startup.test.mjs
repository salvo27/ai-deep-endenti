import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text } from '../setup/dom.mjs';
import { IDS, ME, OTHER, PROJECT, PROJECT2, PROJECT3, members, projects } from '../setup/fixtures.mjs';

let api;
let store;
let app;
let router;
let tx;
let original;
let root;
let subscribed;
let profileUpdates;

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  app = await import('../../assets/js/app.js');
  router = await import('../../assets/js/router.js');
  ({ tx } = await import('../../assets/js/i18n/index.js'));
  original = { ...api };
});

beforeEach(() => {
  store.resetStore();
  router.clearRoutes();
  localStorage.clear();
  history.replaceState(null, '', '#/');
  root = document.getElementById('app');
  root.replaceChildren();
  subscribed = [];
  profileUpdates = [];
  api.getSession = async () => ({ user: { id: ME, email: 'anna@test.it' } });
  api.myProjects = async () => projects();
  api.isPlatformAdmin = async () => false;
  api.myProfile = async () => ({ user_id: ME, display_name: 'Anna', color: '#4f5bd5', language: 'it' });
  api.updateProfile = async (patch) => profileUpdates.push(patch);
  api.membersOverview = async () => members();
  api.listItems = async () => [];
  api.commentCounts = async () => new Map();
  api.setRealtimeAuth = async () => {};
  api.subscribeDb = (handlers) => (subscribed.push(handlers.projectId ?? api.currentProject()), () => {});
  api.joinPresence = () => ({ track() {}, leave() {} });
  api.onAuthChange = () => () => {};
  api.listRevisions = async () => [];
  api.activityFeed = async () => ({ revisions: [], comments: [] });
  api.listChats = async () => [];
  api.chatOverview = async () => [];
  api.listMentions = async () => [];
  api.noteImageOrphans = async () => [];
  api.surveyImageOrphans = async () => [];
  api.touchActivity = async () => {};
});

afterEach(() => {
  app.stopApp();
  Object.assign(api, original);
  store.resetStore();
});

describe('scelta del progetto', () => {
  const NOT_MINE = PROJECT3;
  // [caso, progetto nel link, progetto ricordato sul dispositivo, progetti miei, progetto scelto]
  const CASES = [
    ['il link porta uno dei miei progetti', PROJECT2, PROJECT, projects(), PROJECT2],
    ['il link porta un progetto non mio: vale quello ricordato', NOT_MINE, PROJECT2, projects(), PROJECT2],
    ['il link è malformato: vale quello ricordato', 'non-un-uuid', PROJECT2, projects(), PROJECT2],
    ['il link ha un uuid con un filtro attaccato: vale quello ricordato', `${PROJECT}&x=1`, PROJECT2, projects(), PROJECT2],
    ['senza link vale quello ricordato, se è ancora mio', null, PROJECT2, projects(), PROJECT2],
    ['quello ricordato non è più mio: il primo', null, NOT_MINE, projects(), PROJECT],
    ['quello ricordato è illeggibile: il primo', null, '{"rotto"', projects(), PROJECT],
    ['né link né ricordo: il primo', null, null, projects(), PROJECT],
    ['nessun progetto', PROJECT, PROJECT, [], null],
  ];
  for (const [name, linked, remembered, mine, expected] of CASES) {
    it(name, () => {
      assert.equal(app.chooseProject(mine, { linked, remembered })?.id ?? null, expected);
    });
  }

  it('il progetto del link si legge dall indirizzo dopo #, e si toglie', () => {
    assert.deepEqual(app.projectLink(`#/idea/${IDS.idea}?progetto=${PROJECT2}`), { linked: PROJECT2, hash: `#/idea/${IDS.idea}` });
    assert.deepEqual(app.projectLink(`#/storico?tipo=idea&progetto=${PROJECT2}`), { linked: PROJECT2, hash: '#/storico?tipo=idea' });
    assert.deepEqual(app.projectLink('#/idee?vista=tabella'), { linked: null, hash: '#/idee?vista=tabella' });
    assert.deepEqual(app.projectLink(''), { linked: null, hash: '#/' });
  });

  it('il progetto ricordato si legge e si scrive anche con lo spazio locale bloccato', () => {
    const blocked = { getItem() { throw new Error('bloccato'); }, setItem() { throw new Error('bloccato'); } };
    assert.equal(app.rememberedProject(blocked), null);
    assert.doesNotThrow(() => app.rememberProject(PROJECT, blocked));
    app.rememberProject(PROJECT2);
    assert.equal(localStorage.getItem('progetto'), PROJECT2);
    assert.equal(app.rememberedProject(), PROJECT2);
  });
});

describe('avvio del sito con i progetti', () => {
  it('apre il progetto del link di un email, lo ricorda e toglie il parametro dall indirizzo', async () => {
    localStorage.setItem('progetto', PROJECT);
    history.replaceState(null, '', `#/idea/${IDS.idea}?progetto=${PROJECT2}`);
    assert.equal(await app.startApp(root), true);
    assert.deepEqual(store.state.project, { id: PROJECT2, name: 'Beta', role: 'member' });
    assert.equal(api.currentProject(), PROJECT2);
    assert.equal(localStorage.getItem('progetto'), PROJECT2);
    assert.equal(location.hash, `#/idea/${IDS.idea}`);
    assert.deepEqual(subscribed, [PROJECT2]);
    assert.deepEqual(store.state.projects.map((p) => p.id), [PROJECT, PROJECT2]);
  });

  it('con un link a un progetto non mio apre quello ricordato', async () => {
    localStorage.setItem('progetto', PROJECT2);
    history.replaceState(null, '', `#/?progetto=${PROJECT3}`);
    assert.equal(await app.startApp(root), true);
    assert.equal(store.currentProjectId(), PROJECT2);
    assert.equal(location.hash, '#/');
  });

  it('con un progetto ricordato che non è più mio apre il primo e ricorda quello', async () => {
    localStorage.setItem('progetto', PROJECT3);
    assert.equal(await app.startApp(root), true);
    assert.equal(store.currentProjectId(), PROJECT);
    assert.equal(localStorage.getItem('progetto'), PROJECT);
  });

  it('chi non è in nessun progetto vede la schermata che lo dice', async () => {
    api.myProjects = async () => [];
    assert.equal(await app.startApp(root), false);
    assert.equal(text(root.querySelector('h1')), tx.auth.notMember.noneTitle);
    assert.match(text(root), /nessun progetto/);
    assert.equal(store.state.project, null);
    assert.deepEqual(subscribed, []);
  });

  it('un amministratore della piattaforma senza progetti arriva alla pagina Progetti', async () => {
    api.myProjects = async () => [];
    api.isPlatformAdmin = async () => true;
    history.replaceState(null, '', `#/idea/${IDS.idea}?progetto=${PROJECT2}`);
    assert.equal(await app.startApp(root), true);
    await flush();
    assert.equal(location.hash, '#/progetti');
    assert.equal(router.currentPath(), '/progetti');
    assert.equal(text(root.querySelector('.content h1')), tx.projects.title);
    assert.ok(root.querySelector('.project-create'), 'può creare il suo primo progetto');
    assert.deepEqual([...root.querySelectorAll('.sidebar .nav-link')].map((el) => text(el)), [tx.shell.nav.projects, tx.shell.nav.profile, tx.shell.nav.signOut]);
    assert.equal(store.state.platformAdmin, true);
    assert.deepEqual(subscribed, [], 'senza progetto niente dati dal vivo');
  });

  it('un amministratore della piattaforma con progetti apre il suo progetto come tutti', async () => {
    api.isPlatformAdmin = async () => true;
    assert.equal(await app.startApp(root), true);
    assert.equal(store.currentProjectId(), PROJECT);
    assert.equal(store.isPlatformAdmin(), true);
  });

  it('la pagina Progetti è registrata anche per chi ha un progetto', async () => {
    assert.equal(await app.startApp(root), true);
    assert.ok(router.match('/progetti')?.route.view);
  });

  it('se progetti e ruolo non arrivano mostra l errore e permette di riprovare', async () => {
    api.myProjects = async () => {
      throw new Error('Connessione non riuscita.');
    };
    assert.equal(await app.startApp(root), false);
    assert.match(text(root), /Connessione non riuscita/);
    assert.ok(root.querySelector('button'));
  });

  it('chi viene tolto dal progetto mentre lo usa vede la schermata di chi non ne fa più parte', async () => {
    assert.equal(await app.startApp(root), true);
    api.membersOverview = async () => members().filter((m) => m.user_id !== ME);
    await store.syncItems({ force: true });
    await flush();
    assert.equal(text(root.querySelector('h1')), tx.auth.notMember.removedTitle);
    assert.ok([...root.querySelectorAll('button')].some((b) => text(b) === tx.auth.notMember.reload));
  });
});

describe('cambio di progetto', () => {
  it('ricorda il nuovo progetto, torna alla dashboard e ricarica la pagina', async () => {
    store.setProjects(projects());
    store.setProject(projects()[0]);
    history.replaceState(null, '', `#/idea/${IDS.idea}?progetto=${PROJECT}`);
    let reloaded = 0;
    assert.equal(await app.switchProject(PROJECT2, () => reloaded++), true);
    assert.equal(localStorage.getItem('progetto'), PROJECT2);
    assert.equal(location.hash, '#/');
    assert.equal(reloaded, 1);
  });

  for (const target of [PROJECT3, 'x', null]) {
    it(`non passa a un progetto che non è tra i miei (${target})`, async () => {
      store.setProjects(projects());
      store.setProject(projects()[0]);
      localStorage.setItem('progetto', PROJECT);
      let reloaded = 0;
      assert.equal(await app.switchProject(target, () => reloaded++), false);
      assert.equal(localStorage.getItem('progetto'), PROJECT);
      assert.equal(reloaded, 0);
    });
  }

  // The page open can have unsaved changes: switching project asks like every other way out of it.
  describe('con modifiche non salvate nella pagina aperta', () => {
    let cleaned;
    const openPage = async () => {
      store.setProjects(projects());
      store.setProject(projects()[0]);
      localStorage.setItem('progetto', PROJECT);
      cleaned = 0;
      router.addRoute('/modifica/:id', () => () => (cleaned += 1));
      history.replaceState(null, '', `#/modifica/${IDS.idea}`);
      await router.startRouter(document.createElement('main'));
    };

    it('chi decide di restare resta nel progetto aperto, sulla stessa pagina, e nulla si ricorda', async () => {
      await openPage();
      const asked = [];
      router.setLeaveGuard(async () => (asked.push('lasciare?'), false));
      let reloaded = 0;
      assert.equal(await app.switchProject(PROJECT2, () => reloaded++), false);
      assert.deepEqual(asked, ['lasciare?']);
      assert.equal(reloaded, 0);
      assert.equal(localStorage.getItem('progetto'), PROJECT);
      assert.equal(location.hash, `#/modifica/${IDS.idea}`);
      assert.equal(cleaned, 0);
    });

    it('chi decide di lasciare la pagina cambia progetto, e la pagina si chiude prima del ricaricamento', async () => {
      await openPage();
      router.setLeaveGuard(async () => true);
      const order = [];
      assert.equal(await app.switchProject(PROJECT2, () => order.push(`ricarica dopo ${cleaned} chiusure`)), true);
      assert.deepEqual(order, ['ricarica dopo 1 chiusure'], 'la pagina toglie la domanda del browser prima di ricaricare');
      assert.equal(localStorage.getItem('progetto'), PROJECT2);
      assert.equal(location.hash, '#/');
    });
  });

  it('il selettore del menu cambia progetto con switchProject del sito', async () => {
    let reloaded = 0;
    assert.equal(await app.startApp(root, { reload: () => reloaded++ }), true);
    const select = root.querySelector('.project-switch select');
    select.value = PROJECT2;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    await flush();
    assert.equal(localStorage.getItem('progetto'), PROJECT2);
    assert.equal(reloaded, 1);
  });
});

// A link of an email pasted into a tab where the site is already open changes the address after #, nothing else.
describe('link con il progetto aperto in una scheda già aperta', () => {
  const start = async () => {
    let reloads = 0;
    assert.equal(await app.startApp(root, { reload: () => (reloads += 1) }), true);
    return () => reloads;
  };
  const go = async (hash) => {
    location.hash = hash;
    await flush(8);
  };

  it('un link a un altro dei miei progetti lo apre sulla pagina del link', async () => {
    const reloads = await start();
    await go(`#/idea/${IDS.idea}?progetto=${PROJECT2}`);
    assert.equal(reloads(), 1);
    assert.equal(localStorage.getItem('progetto'), PROJECT2);
    assert.equal(location.hash, `#/idea/${IDS.idea}`);
  });

  for (const [name, target] of [
    ['al progetto aperto', PROJECT],
    ['a un progetto non mio', PROJECT3],
    ['malformato', 'non-un-uuid'],
  ]) {
    it(`un link ${name} apre la pagina nel progetto aperto e il parametro sparisce`, async () => {
      const reloads = await start();
      await go(`#/storico?tipo=idea&progetto=${target}`);
      assert.equal(reloads(), 0);
      assert.equal(store.currentProjectId(), PROJECT);
      assert.equal(location.hash, '#/storico?tipo=idea');
      assert.equal(router.currentPath(), '/storico');
    });
  }

  it('con modifiche non salvate chi resta rimane sulla sua pagina', async () => {
    const reloads = await start();
    await go('#/storico');
    router.setLeaveGuard(async () => false);
    await go(`#/idea/${IDS.idea}?progetto=${PROJECT2}`);
    assert.equal(reloads(), 0);
    assert.equal(localStorage.getItem('progetto'), PROJECT);
    assert.equal(location.hash, '#/storico');
  });
});

describe('amministratore della piattaforma', () => {
  it('senza progetti, scrivendo l indirizzo di una pagina di progetto arriva alla pagina Progetti', async () => {
    api.myProjects = async () => [];
    api.isPlatformAdmin = async () => true;
    assert.equal(await app.startApp(root), true);
    for (const hash of ['#/', '#/idee', '#/chat', '#/nuovo/idea', '#/membri', `#/idea/${IDS.idea}`, '#/concetti', '#/inesistente']) {
      location.hash = hash;
      await flush(5);
      assert.equal(location.hash, '#/progetti', hash);
      assert.equal(text(root.querySelector('.content h1')), tx.projects.title, hash);
    }
    location.hash = '#/profilo';
    await flush(5);
    assert.equal(router.currentPath(), '/profilo');
  });

  // Archived by them or by another platform admin, or they removed themselves: they always have somewhere to land.
  it('che non può più leggere il progetto aperto ricarica il sito sulla pagina Progetti, senza la schermata di chi è stato tolto', async () => {
    api.isPlatformAdmin = async () => true;
    let reloads = 0;
    assert.equal(await app.startApp(root, { reload: () => (reloads += 1) }), true);
    api.myProjects = async () => [projects()[1]];
    await store.syncItems({ force: true });
    await flush();
    assert.equal(reloads, 1);
    assert.equal(location.hash, '#/progetti');
    assert.notEqual(text(root.querySelector('h1')), tx.auth.notMember.removedTitle);
  });
});

describe('lingua del profilo', () => {
  // [scelta su questo dispositivo, lingua salvata nel profilo, cosa si salva con il sito in italiano]
  // A device left on automatic does not overwrite a language chosen on another device: emails and Claude keep it.
  for (const [choice, saved, expected] of [
    ['auto', null, { language: 'it' }],
    ['auto', 'it', null],
    ['auto', 'en', null],
    ['it', 'en', { language: 'it' }],
    ['it', null, { language: 'it' }],
    ['it', 'it', null],
  ]) {
    it(`scelta ${choice} con il profilo in ${saved}: ${expected ? 'salva l italiano' : 'non salva niente'}`, async () => {
      api.myProfile = async () => ({ user_id: ME, language: saved });
      assert.equal(await app.syncProfileLanguage('it', choice), Boolean(expected));
      assert.deepEqual(profileUpdates, expected ? [expected] : []);
    });
  }

  it('senza profilo non salva niente', async () => {
    api.myProfile = async () => null;
    assert.equal(await app.syncProfileLanguage(), false);
    assert.deepEqual(profileUpdates, []);
  });

  it('all avvio salva la lingua in uso nel profilo che non ne ha una, così email e Claude la seguono', async () => {
    api.myProfile = async () => ({ user_id: ME, language: null });
    assert.equal(await app.startApp(root), true);
    await flush();
    assert.deepEqual(profileUpdates, [{ language: 'it' }]);
  });

  for (const [name, myProfile] of [
    ['un profilo che non risponde mai', () => new Promise(() => {})],
    ['un errore nel leggere il profilo', async () => { throw new Error('offline'); }],
  ]) {
    it(`${name} non ferma l avvio`, async () => {
      api.myProfile = myProfile;
      assert.equal(await app.startApp(root), true);
      await flush();
      assert.ok(root.querySelector('.sidebar'));
    });
  }

  it('un errore nel salvare la lingua non ferma l avvio', async () => {
    api.myProfile = async () => ({ user_id: ME, language: null });
    api.updateProfile = async () => {
      throw new Error('offline');
    };
    assert.equal(await app.startApp(root), true);
    await flush();
    assert.ok(root.querySelector('.sidebar'));
  });
});

describe('membri senza tempo reale', () => {
  it('il ruolo di un altro cambiato da un admin arriva con la risincronizzazione', async () => {
    assert.equal(await app.startApp(root), true);
    api.membersOverview = async () => members().map((m) => (m.user_id === OTHER ? { ...m, role: 'advisor' } : m));
    await store.syncItems({ force: true });
    assert.equal(store.memberById(OTHER).role, 'advisor');
  });
});
