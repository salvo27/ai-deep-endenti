import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, text, byText, typeInto } from '../setup/dom.mjs';
import { italianWords } from '../setup/italian.mjs';
import { ME, OTHER, PROJECT, PROJECT2, boardItems, members, projects } from '../setup/fixtures.mjs';

// Su un dispositivo in inglese: la lingua si decide quando il sito si carica, per questo i moduli arrivano dopo la scelta.
useLanguage('en');

let store;
let shell;
let tx;

before(async () => {
  setupDom();
  store = await import('../../assets/js/store.js');
  shell = await import('../../assets/js/views/shell.js');
  ({ tx } = await import('../../assets/js/i18n/index.js'));
});

beforeEach(() => {
  store.resetStore();
  localStorage.clear();
  document.body.querySelectorAll('dialog').forEach((d) => d.remove());
  store.state.user = { id: ME };
});

function inProject({ platformAdmin = false } = {}) {
  store.setProjects(projects());
  store.setProject(projects()[0]);
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  store.state.platformAdmin = platformAdmin;
}

function build() {
  const root = document.createElement('div');
  document.body.append(root);
  shell.buildShell(root, { onSignOut: () => {} });
  return root;
}

// Quello che si legge, testo e attributi, senza i nomi delle persone e dei progetti e senza il pannello delle
// menzioni e delle notifiche, che sono di un altro modulo.
function leftovers(root) {
  const copy = root.cloneNode(true);
  copy.querySelectorAll('.bell, .bell-panel, .mentions-btn, .avatar, .user-name').forEach((el) => el.remove());
  const attributes = [...copy.querySelectorAll('[aria-label],[title],[placeholder]')].flatMap((el) =>
    ['aria-label', 'title', 'placeholder'].map((name) => el.getAttribute(name)).filter(Boolean),
  );
  return italianWords([copy.textContent, ...attributes].join(' '));
}

describe('menu in inglese', () => {
  it('gruppi e voci hanno nomi inglesi, gli indirizzi restano quelli di sempre', () => {
    inProject();
    const root = build();
    const groups = [...root.querySelectorAll('.nav-group')].map((group) => [
      text(group.querySelector('.nav-group-title')),
      [...group.querySelectorAll('.nav-link')].map((link) => text(link.querySelector('span'))),
    ]);
    assert.deepEqual(groups, [
      ['Work', ['Dashboard', 'Ideas', 'Scoring', 'Experiments', 'Interviews', 'Surveys', 'Contacts', 'Decisions', 'Chat']],
      ['Tools', ['Generator', 'Guide']],
      ['Team', ['Our team', 'Members', 'Expenses']],
      ['System', ['History', 'Trash']],
    ]);
    assert.deepEqual(shell.NAV.map(([path]) => path), ['/', '/idee', '/valutazione', '/esperimenti', '/interviste', '/questionari', '/contatti', '/decisioni', '/chat', '/generatore', '/guida', '/squadra', '/membri', '/spese', '/storico', '/cestino']);
    assert.deepEqual([...root.querySelector('.sidebar-foot').children].map((el) => text(el)), ['Profile', 'Sign out']);
    assert.equal(root.querySelector('nav.nav').getAttribute('aria-label'), 'Sections');
  });

  it('un gruppo chiuso si ricorda con la stessa chiave in ogni lingua', () => {
    inProject();
    const root = build();
    const system = [...root.querySelectorAll('.nav-group')].find((g) => text(g.querySelector('.nav-group-title')) === 'System');
    system.querySelector('.nav-group-title').click();
    assert.deepEqual(store.readLocal('menuChiuso'), ['Sistema']);
    const again = build();
    const reopened = [...again.querySelectorAll('.nav-group')].find((g) => text(g.querySelector('.nav-group-title')) === 'System');
    assert.equal(reopened.querySelector('.nav-group-links').hidden, true, 'chiuso anche nel guscio nuovo');
  });

  it('il selettore del progetto e il link Progetti sono in inglese', () => {
    inProject({ platformAdmin: true });
    const root = build();
    const switcher = root.querySelector('.project-switch');
    assert.equal(text(switcher.querySelector('.project-switch-label')), 'Project');
    assert.deepEqual([...switcher.querySelectorAll('option')].map((o) => [o.value, text(o)]), [
      [PROJECT, 'Alfa · Admin'],
      [PROJECT2, 'Beta · Member'],
    ]);
    assert.equal(text(root.querySelector('.sidebar a[href="#/progetti"]')), 'Projects');
  });

  it('senza progetto il menu offre Projects, Profile e Sign out', () => {
    store.state.platformAdmin = true;
    const root = build();
    assert.deepEqual([...root.querySelectorAll('.sidebar .nav-link')].map((el) => text(el)), ['Projects', 'Profile', 'Sign out']);
    assert.equal(text(root.querySelector('.project-switch .project-name')), 'No project open');
    assert.deepEqual(leftovers(root), []);
  });

  it('nel guscio non resta italiano: ricerca, persone online, aggiornamenti dal vivo e messaggi da leggere', () => {
    inProject({ platformAdmin: true });
    const root = build();
    store.state.online = [{ userId: OTHER, route: '/' }];
    store.emit('presence', store.state.online);
    store.emit('realtime', 'CLOSED');
    assert.deepEqual(leftovers(root), []);
    assert.equal(root.querySelector('.search-input').getAttribute('placeholder'), 'Search the boards  /');
    assert.equal(root.querySelector('.search-input').getAttribute('aria-label'), 'Search the boards');
    assert.equal(root.querySelector('.search-toggle').getAttribute('aria-label'), 'Search');
    assert.equal(root.querySelector('.presence').getAttribute('aria-label'), 'Online now');
    assert.equal(root.querySelector('.presence').title, '1 online');
    assert.equal(root.querySelector('.live-dot').title, 'Live updates off: reload to see what is new');
    assert.equal(root.querySelector('a[href="#/chat"] .nav-badge').getAttribute('aria-label'), '0 unread messages');
    assert.equal(root.querySelector('.user-box').getAttribute('aria-label'), 'Profile of Anna');
    typeInto(root.querySelector('.search-input'), 'zzz');
    assert.equal(text(root.querySelector('.search-results')), 'No results.');
    typeInto(root.querySelector('.search-input'), 'clienti');
    assert.match(text(root.querySelector('.search-results')), /I clienti pagano/, 'i titoli scritti dal team restano come sono');
  });

  it('uscire chiede conferma in inglese', async () => {
    inProject();
    let signedOut = 0;
    const root = document.createElement('div');
    document.body.append(root);
    shell.buildShell(root, { onSignOut: () => (signedOut += 1) });
    byText(root.querySelector('.sidebar-foot'), 'button', 'Sign out').click();
    await flush();
    const dialog = document.querySelector('dialog.modal');
    assert.equal(text(dialog.querySelector('h2')), 'Sign out?');
    assert.match(text(dialog), /To sign back in you will need your password and a verification code\./);
    byText(dialog.querySelector('.modal-actions'), 'button', 'Sign out').click();
    await flush();
    assert.equal(signedOut, 1);
  });

  it('i messaggi da leggere si contano in inglese, al singolare e al plurale', () => {
    assert.equal(tx.shell.chatUnread(1), '1 unread message');
    assert.equal(tx.shell.chatUnread(2), '2 unread messages');
  });
});
