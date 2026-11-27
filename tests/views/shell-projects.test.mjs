import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text } from '../setup/dom.mjs';
import { ME, PROJECT, PROJECT2, members, projects } from '../setup/fixtures.mjs';

let api;
let store;
let router;
let app;
let shell;
let original;

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  shell = await import('../../assets/js/views/shell.js');
  original = { ...api };
});

beforeEach(() => {
  store.resetStore();
  localStorage.clear();
  history.replaceState(null, '', '#/');
  store.state.user = { id: ME };
  api.allProjects = async () => [];
  api.platformAdmins = async () => [];
});

afterEach(() => {
  router.stopRouter();
  router.clearRoutes();
  Object.assign(api, original);
});

// Dentro un progetto, come lo apre app.js: il progetto, i miei progetti e i membri.
function inProject({ mine = projects(), open = mine[0], platformAdmin = false } = {}) {
  store.setProjects(mine);
  store.setProject(open);
  store.setMembers(members());
  store.state.platformAdmin = platformAdmin;
}

// Un amministratore della piattaforma che non è in nessun progetto: app.js apre solo la pagina Progetti.
function withoutProject() {
  store.state.platformAdmin = true;
  store.setProjects([]);
}

function build(options = {}) {
  const root = document.createElement('div');
  document.body.append(root);
  shell.buildShell(root, { onSignOut: () => {}, ...options });
  return root;
}

const switcher = (root) => root.querySelector('.project-switch');
const select = (root) => switcher(root)?.querySelector('select') || null;
const sidebarLinks = (root) => [...root.querySelectorAll('.sidebar .nav-link')].map((el) => text(el));

function choose(root, value) {
  select(root).value = value;
  select(root).dispatchEvent(new window.Event('change', { bubbles: true }));
}

// switchProject ricarica la pagina, cosa che jsdom non sa fare e scrive sulla console: qui non serve leggerlo.
async function quietly(fn) {
  const error = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = error;
  }
}

describe('selettore del progetto nel menu', () => {
  it('mostra il progetto aperto e tutti i miei progetti, ognuno con il mio ruolo', () => {
    inProject();
    const root = build();
    assert.equal(text(switcher(root).querySelector('label.project-switch-label')), 'Progetto');
    assert.deepEqual([...select(root).options].map((o) => [o.value, text(o)]), [
      [PROJECT, 'Alfa · Admin'],
      [PROJECT2, 'Beta · Membro'],
    ]);
    assert.equal(select(root).value, PROJECT);
    assert.equal(select(root).getAttribute('aria-label'), null, 'il nome lo dà l etichetta collegata');
    assert.equal(document.getElementById(switcher(root).querySelector('label').htmlFor), select(root));
  });

  it('scegliendo un altro progetto lo apre, scegliendo quello aperto non succede nulla', () => {
    inProject();
    const opened = [];
    const root = build({ onSwitchProject: (id) => opened.push(id) });
    choose(root, PROJECT);
    assert.deepEqual(opened, []);
    choose(root, PROJECT2);
    assert.deepEqual(opened, [PROJECT2]);
  });

  it('senza altro da fare usa switchProject del sito: ricorda il progetto e torna alla dashboard', async () => {
    inProject();
    history.replaceState(null, '', '#/idee');
    const root = build();
    await quietly(() => choose(root, PROJECT2));
    assert.equal(localStorage.getItem('progetto'), PROJECT2);
    assert.equal(location.hash, '#/');
  });

  it('un progetto che switchProject rifiuta lascia il selettore sul progetto aperto', () => {
    inProject();
    const root = build({ onSwitchProject: () => false });
    choose(root, PROJECT2);
    assert.equal(select(root).value, PROJECT);
  });

  it('con un solo progetto mostra nome e ruolo, senza un selettore che non sceglie nulla', () => {
    inProject({ mine: [projects()[0]] });
    const root = build();
    assert.equal(select(root), null);
    assert.equal(text(switcher(root).querySelector('.project-switch-label')), 'Progetto');
    assert.equal(text(switcher(root).querySelector('.project-name')), 'Alfa · Admin');
  });

  it('il nome di un progetto resta testo', () => {
    const xss = '<img src=x onerror="window.__xss=1">';
    inProject({ mine: [{ ...projects()[0], name: xss }, projects()[1]] });
    const root = build();
    assert.equal(root.querySelector('img'), null);
    assert.equal(text(select(root).options[0]), `${xss} · Admin`);
  });
});

describe('link Progetti nel menu', () => {
  // [chi, è amministratore della piattaforma, vede il link]
  for (const [who, platformAdmin, shown] of [
    ['un membro', false, false],
    ['un amministratore della piattaforma', true, true],
  ]) {
    it(`${who} ${shown ? 'lo vede' : 'non lo vede'}`, () => {
      inProject({ platformAdmin });
      const root = build();
      const link = root.querySelector('.sidebar a[href="#/progetti"]');
      assert.equal(Boolean(link), shown);
      if (shown) assert.equal(text(link), 'Progetti');
    });
  }

  it('è evidenziato sulla pagina Progetti', async () => {
    inProject({ platformAdmin: true });
    const root = build();
    app.registerRoutes();
    await router.startRouter(document.createElement('main'), { fallback: app.notFoundView });
    await router.render('#/progetti');
    await flush();
    assert.deepEqual([...root.querySelectorAll('.nav-link.is-active')].map((el) => text(el)), ['Progetti']);
  });
});

describe('menu senza un progetto aperto', () => {
  it('un amministratore della piattaforma senza progetti trova solo Progetti, Profilo ed Esci', () => {
    withoutProject();
    const root = build();
    assert.deepEqual(sidebarLinks(root), ['Progetti', 'Profilo', 'Esci']);
    assert.equal(root.querySelector('.nav-group'), null, 'nessuna pagina di un progetto');
    assert.equal(text(switcher(root).querySelector('.project-name')), 'Nessun progetto aperto');
    assert.equal(root.querySelector('.brand').getAttribute('href'), '#/progetti', 'il marchio non porta alla dashboard');
    const hrefs = [...root.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
    assert.deepEqual([...new Set(hrefs)].sort(), ['#/profilo', '#/progetti']);
  });

  it('la barra in alto non offre ricerca, menzioni, notifiche e persone online, che sono di un progetto', () => {
    withoutProject();
    const root = build();
    for (const selector of ['.search', '.search-toggle', '.mentions-btn', '.bell', '.presence', '.live-dot']) {
      assert.equal(root.querySelector(selector), null, selector);
    }
    assert.ok(root.querySelector('.menu-btn'));
    assert.ok(root.querySelector('.user-box'));
  });

  it('quando la pagina Progetti aggiorna i miei progetti, il selettore li offre e ne apre uno', () => {
    withoutProject();
    const opened = [];
    const root = build({ onSwitchProject: (id) => opened.push(id) });
    store.setProjects([projects()[0]]);
    store.emit('projects');
    assert.deepEqual([...select(root).options].map((o) => [o.value, text(o)]), [
      ['', 'Scegli un progetto'],
      [PROJECT, 'Alfa · Admin'],
    ]);
    assert.equal(select(root).value, '');
    choose(root, PROJECT);
    assert.deepEqual(opened, [PROJECT]);
  });

  it('anche dentro un progetto il selettore segue i progetti aggiornati e il nome nuovo di quello aperto', () => {
    inProject({ platformAdmin: true });
    const root = build();
    store.setProject({ ...projects()[0], name: 'Alfa 2' });
    store.setProjects([{ ...projects()[0], name: 'Alfa 2' }, ...projects().slice(1)]);
    store.emit('projects');
    assert.deepEqual([...select(root).options].map((o) => text(o)), ['Alfa 2 · Admin', 'Beta · Membro']);
  });

  it('chi perde il ruolo di amministratore della piattaforma perde anche il link Progetti', () => {
    inProject({ platformAdmin: true });
    const root = build();
    store.state.platformAdmin = false;
    store.emit('projects');
    assert.equal(root.querySelector('.sidebar a[href="#/progetti"]'), null);
  });
});
