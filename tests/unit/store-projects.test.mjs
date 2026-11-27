import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../../assets/js/lib/api.js';
import * as store from '../../assets/js/store.js';
import { ME, OTHER, PROJECT, PROJECT2, members, projects } from '../setup/fixtures.mjs';

const original = { ...api };
const IDEA = '11111111-1111-4111-8111-111111111111';
const idea = (over = {}) => ({ id: IDEA, kind: 'idea', title: 'Idea', status: 'nuova', idea_id: null, data: {}, version: 1, created_by: ME, updated_by: ME, deleted_at: null, ...over });

beforeEach(() => {
  store.resetStore();
  store.state.user = { id: ME };
});

afterEach(() => {
  Object.assign(api, original);
  store.resetStore();
});

describe('progetto aperto', () => {
  it('all inizio non c è nessun progetto, né elenco, né amministrazione della piattaforma', () => {
    assert.equal(store.state.project, null);
    assert.deepEqual(store.state.projects, []);
    assert.equal(store.state.platformAdmin, false);
    assert.equal(store.currentProjectId(), null);
    assert.equal(store.isPlatformAdmin(), false);
  });

  it('setProject tiene id, nome e ruolo e lo passa all accesso ai dati', () => {
    store.setProject({ id: PROJECT, name: 'Alfa', role: 'admin', created_at: 'x', extra: 1 });
    assert.deepEqual(store.state.project, { id: PROJECT, name: 'Alfa', role: 'admin' });
    assert.equal(store.currentProjectId(), PROJECT);
    assert.equal(api.currentProject(), PROJECT);
  });

  for (const bad of [null, undefined, { id: 'x', name: 'Rotto' }, { name: 'Senza id' }, 'stringa']) {
    it(`setProject con ${JSON.stringify(bad)} lascia senza progetto`, () => {
      store.setProject({ id: PROJECT, name: 'Alfa', role: 'admin' });
      store.setProject(bad);
      assert.equal(store.state.project, null);
      assert.equal(api.currentProject(), null);
    });
  }

  it('setProjects tiene solo i progetti ben formati', () => {
    store.setProjects([...projects(), { id: 'x', name: 'Rotto' }, null, { id: PROJECT2, name: 7 }]);
    assert.deepEqual(store.state.projects.map((p) => p.id), [PROJECT, PROJECT2]);
    store.setProjects('non un elenco');
    assert.deepEqual(store.state.projects, []);
  });

  it('resetStore dimentica progetto, elenco e amministrazione della piattaforma', () => {
    store.setProjects(projects());
    store.setProject(projects()[0]);
    store.state.platformAdmin = true;
    store.resetStore();
    assert.equal(store.state.project, null);
    assert.deepEqual(store.state.projects, []);
    assert.equal(store.state.platformAdmin, false);
    assert.equal(api.currentProject(), null);
  });
});

describe('dati del progetto aperto', () => {
  it('loadAll chiede membri, elementi e commenti del progetto aperto', async () => {
    store.setProject({ id: PROJECT2, name: 'Beta', role: 'member' });
    const asked = [];
    api.membersOverview = async (project) => (asked.push(['members', project]), members());
    api.listItems = async (project) => (asked.push(['items', project]), [idea()]);
    api.commentCounts = async (project) => (asked.push(['comments', project]), new Map());
    await store.loadAll();
    assert.deepEqual(asked.sort(), [['comments', PROJECT2], ['items', PROJECT2], ['members', PROJECT2]]);
    assert.equal(store.state.me.role, 'admin');
    assert.equal(store.state.items.size, 1);
  });

  it('la risincronizzazione rilegge anche i membri del progetto', async () => {
    store.setProject({ id: PROJECT, name: 'Alfa', role: 'admin' });
    store.setMembers(members());
    const asked = [];
    api.listItems = async () => [idea()];
    api.commentCounts = async () => new Map();
    api.membersOverview = async (project) => {
      asked.push(project);
      return [...members(), { user_id: '00000000-0000-4000-8000-00000000000d', display_name: 'Dario', role: 'member', color: '#000000' }];
    };
    const events = [];
    store.on('members', () => events.push('members'));
    assert.equal(await store.syncItems({ force: true }), true);
    assert.deepEqual(asked, [PROJECT]);
    assert.equal(store.state.members.length, 4);
    assert.deepEqual(events, ['members']);
  });

  it('se i membri non cambiano la risincronizzazione non ridisegna le pagine', async () => {
    store.setProject({ id: PROJECT, name: 'Alfa', role: 'admin' });
    store.setMembers(members());
    api.listItems = async () => [idea()];
    api.commentCounts = async () => new Map();
    // L'ultimo accesso cambia di continuo: da solo non conta come un cambiamento.
    api.membersOverview = async () => members().map((m) => ({ ...m, last_sign_in_at: '2026-11-27T10:00:00Z' }));
    const events = [];
    store.on('members', () => events.push('members'));
    store.on('removed', () => events.push('removed'));
    await store.syncItems({ force: true });
    assert.deepEqual(events, []);
  });

  for (const [name, rows, removed] of [
    ['senza di me', members().filter((m) => m.user_id !== ME), true],
    ['vuoto, perché il progetto è archiviato o non lo posso più leggere', [], true],
    ['con me ancora dentro', members(), false],
  ]) {
    it(`un elenco dei membri ${name} ${removed ? 'porta' : 'non porta'} alla schermata di chi non è nel progetto`, async () => {
      store.setProject({ id: PROJECT, name: 'Alfa', role: 'admin' });
      store.setMembers(members());
      api.listItems = async () => [idea()];
      api.commentCounts = async () => new Map();
      api.membersOverview = async () => rows;
      let gone = false;
      store.on('removed', () => (gone = true));
      await store.syncItems({ force: true });
      assert.equal(gone, removed);
    });
  }

  for (const [name, membersOverview] of [
    ['un errore di rete', async () => { throw new Error('offline'); }],
    ['una risposta senza elenco', async () => null],
  ]) {
    it(`${name} nel rileggere i membri non toglie nessuno`, async () => {
      store.setProject({ id: PROJECT, name: 'Alfa', role: 'admin' });
      store.setMembers(members());
      api.listItems = async () => [idea()];
      api.commentCounts = async () => new Map();
      api.membersOverview = membersOverview;
      let gone = false;
      store.on('removed', () => (gone = true));
      await store.syncItems({ force: true });
      assert.equal(gone, false);
      assert.equal(store.state.members.length, 3);
      assert.equal(store.state.me.user_id, ME);
    });
  }

  it('reloadMembers chiede i membri del progetto aperto e avvisa sempre le pagine', async () => {
    store.setProject({ id: PROJECT2, name: 'Beta', role: 'member' });
    store.setMembers(members());
    let asked = null;
    api.membersOverview = async (project) => ((asked = project), members());
    let events = 0;
    store.on('members', () => events++);
    await store.reloadMembers();
    assert.equal(asked, PROJECT2);
    assert.equal(events, 1, 'dopo una modifica fatta dalla pagina la pagina si ridisegna comunque');
  });
});

// members_overview answers a platform admin for every project, archived ones too: being in that list does not say that
// the open project can still be read. For them the answer comes from my_projects.
describe('progetto aperto che non si può più leggere', () => {
  const sync = async ({ platformAdmin, mine, rows = members() }) => {
    store.setProject({ id: PROJECT, name: 'Alfa', role: 'admin' });
    store.setProjects(projects());
    store.setMembers(members());
    store.setPlatformAdmin(platformAdmin);
    const asked = [];
    api.listItems = async () => (platformAdmin && !mine.some((p) => p.id === PROJECT) ? [] : [idea()]);
    api.commentCounts = async () => new Map();
    api.membersOverview = async () => rows;
    api.myProjects = async () => (asked.push('myProjects'), typeof mine === 'function' ? mine() : mine);
    const events = [];
    store.on('removed', () => events.push('removed'));
    store.on('projects', () => events.push('projects'));
    await store.syncItems({ force: true });
    return { asked, events };
  };

  it('un amministratore della piattaforma ancora tra i membri di un progetto archiviato ne esce', async () => {
    const { events } = await sync({ platformAdmin: true, mine: [projects()[1]] });
    assert.deepEqual(events, ['projects', 'removed']);
    assert.deepEqual(store.state.projects.map((p) => p.id), [PROJECT2], 'il menu non offre più il progetto archiviato');
  });

  it('un amministratore della piattaforma in un progetto attivo resta, e i suoi progetti non cambiano', async () => {
    const { asked, events } = await sync({ platformAdmin: true, mine: projects() });
    assert.deepEqual(asked, ['myProjects']);
    assert.deepEqual(events, []);
  });

  it('per un membro qualunque basta l elenco dei membri: i suoi progetti non si chiedono', async () => {
    const { asked, events } = await sync({ platformAdmin: false, mine: [] });
    assert.deepEqual(asked, []);
    assert.deepEqual(events, []);
  });

  it('se i progetti di un amministratore della piattaforma non arrivano non esce nessuno', async () => {
    const { events } = await sync({
      platformAdmin: true,
      mine: () => {
        throw new Error('offline');
      },
    });
    assert.deepEqual(events, []);
    assert.equal(store.state.me.user_id, ME);
  });

  it('setPlatformAdmin vale solo per un vero sì', () => {
    for (const [value, expected] of [[true, true], [false, false], ['true', false], [1, false], [null, false]]) {
      store.setPlatformAdmin(value);
      assert.equal(store.isPlatformAdmin(), expected, String(value));
    }
  });
});

describe('tempo reale del progetto aperto', () => {
  it('aggiornamenti dal vivo e presenza seguono il progetto aperto, senza membri dal vivo', () => {
    store.setProject({ id: PROJECT2, name: 'Beta', role: 'member' });
    let subscribed = null;
    let presence = null;
    api.subscribeDb = (handlers) => ((subscribed = handlers), () => {});
    api.joinPresence = (userId, onSync, project) => ((presence = { userId, project }), { track() {}, leave() {} });
    store.startRealtime();
    assert.equal(subscribed.projectId, PROJECT2);
    assert.equal(subscribed.onMembers, undefined, 'members non manda più aggiornamenti dal vivo');
    assert.deepEqual(presence, { userId: ME, project: PROJECT2 });
    store.stopRealtime();
  });
});

describe('testi dello stato', () => {
  for (const [status, text] of [
    ['conflict', 'Qualcuno ha modificato questo elemento nel frattempo.'],
    ['deleted', 'Questo elemento è stato archiviato nel frattempo. Ripristinalo dal cestino per modificarlo.'],
    ['forbidden', 'Non hai i permessi per questa operazione.'],
    ['not_found', 'Elemento non trovato.'],
    ['qualcosa', 'Operazione non riuscita. Riprova.'],
    [undefined, 'Operazione non riuscita. Riprova.'],
    ['toString', 'Operazione non riuscita. Riprova.'],
  ]) {
    it(`l esito ${status} si legge «${text}»`, () => {
      const error = store.statusError(status);
      assert.equal(error.message, text);
      assert.equal(error.code, status || 'error');
    });
  }

  it('chi non è più tra i membri è un ex membro, e senza autore è il sistema', () => {
    store.setMembers(members());
    assert.equal(store.memberName(OTHER), 'Bruno');
    assert.equal(store.memberName('00000000-0000-4000-8000-00000000000f'), 'Ex membro');
    assert.equal(store.memberName(null), 'Sistema');
  });
});
