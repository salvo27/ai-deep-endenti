import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, byText, text, typeInto } from '../setup/dom.mjs';
import { IDS, ME, boardItems, members } from '../setup/fixtures.mjs';

let api;
let store;
let router;
let app;
let shell;
let conceptHelp;
let EXAMPLES;
let original;
let outlet;
let root;
let signedOut = 0;

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  shell = await import('../../assets/js/views/shell.js');
  conceptHelp = await import('../../assets/js/views/concept-help.js');
  ({ EXAMPLES } = await import('../../assets/js/examples.js'));
  original = { ...api };
  router.clearRoutes();
  app.registerRoutes();
  // Un solo guscio come nel sito: le scorciatoie da tastiera sono sul documento e non si tolgono.
  store.state.user = { id: ME };
  store.setMembers(members());
  root = document.createElement('div');
  document.body.append(root);
  shell.buildShell(root, { onSignOut: () => (signedOut += 1) });
});

beforeEach(async () => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  store.state.commentCounts = new Map([[IDS.idea, 2], [IDS.canvas, 1]]);
  api.listComments = async () => [];
  api.listRevisions = async () => [];
  api.membersOverview = async () => members();
  api.activitySince = async () => [];
  api.auditLog = async () => [];
  outlet = document.createElement('main');
  document.body.querySelectorAll('dialog').forEach((d) => d.remove());
  await router.startRouter(outlet, { fallback: app.notFoundView });
});

afterEach(() => {
  router.stopRouter();
  Object.assign(api, original);
});

async function visit(hash) {
  await router.render(hash);
  await flush(5);
  return text(outlet);
}

const activeTab = (selector) => text(outlet.querySelector(`${selector} .tab.is-active`));

test('the menu is split into Lavoro, Strumenti, Team and Sistema, with Membri instead of Team', () => {
  const groups = [...root.querySelectorAll('.nav-group')].map((group) => [
    text(group.querySelector('.nav-group-title')),
    [...group.querySelectorAll('.nav-link')].map((link) => text(link.querySelector('span'))),
  ]);
  assert.deepEqual(groups, [
    ['Lavoro', ['Dashboard', 'Idee', 'Valutazione', 'Esperimenti', 'Interviste', 'Contatti', 'Decisioni', 'Chat']],
    ['Strumenti', ['Generatore', 'Guida']],
    ['Team', ['Squadra', 'Membri']],
    ['Sistema', ['Storico', 'Cestino']],
  ]);
  const group = root.querySelector('.nav-group');
  assert.equal(group.getAttribute('role'), 'group');
  assert.equal(text(document.getElementById(group.getAttribute('aria-labelledby'))), 'Lavoro');
  assert.ok(root.querySelector('a[href="#/contatti"]'));
  assert.ok(root.querySelector('a[href="#/membri"]'));
  assert.equal(root.querySelector('.nav a[href="#/team"], .nav a[href="#/concetti"]'), null, 'Concetti sta nella Guida, Team è diventato Membri');
  assert.ok(root.querySelector('a[href="#/chat"] .nav-badge'), 'la Chat tiene il contatore');
  assert.deepEqual(shell.NAV.map(([path]) => path), [...root.querySelectorAll('.nav .nav-link')].map((link) => link.dataset.path));
});

test('every menu entry opens a page; Contatti counts only once its page exists', () => {
  for (const [path, label] of shell.NAV) {
    const found = router.match(path);
    if (path === '/contatti' && !found) continue;
    assert.ok(found?.route.view, `${label}: ${path}`);
  }
});

test('the menu highlights the page, also on the Guida tabs and the old addresses', async () => {
  const active = () => [...root.querySelectorAll('.nav-link.is-active')].map((link) => text(link));
  await visit('#/guida/concetti');
  assert.deepEqual(active(), ['Guida']);
  await visit('#/team');
  assert.deepEqual(active(), ['Membri']);
  await visit(`#/idea/${IDS.idea}/commenti`);
  assert.deepEqual(active(), ['Idee']);
});

test('Membri is the page of the team members, and /team still opens it', async () => {
  const length = history.length;
  let body = await visit('#/team');
  assert.equal(router.currentPath(), '/membri');
  assert.equal(location.hash, '#/membri');
  assert.equal(history.length, length, 'il vecchio indirizzo non lascia una voce in più nella cronologia');
  assert.equal(text(outlet.querySelector('h1')), 'Membri');
  assert.match(body, /Bruno/);
  body = await visit('#/membri');
  assert.equal(text(outlet.querySelector('h1')), 'Membri');
  assert.match(body, /Registro di sicurezza/);
});

test('Concetti is the second tab of the Guida and the old links still open it', async () => {
  await visit('#/guida');
  assert.equal(text(outlet.querySelector('h1')), 'Guida');
  assert.deepEqual([...outlet.querySelectorAll('.tab')].map((tab) => [text(tab), tab.getAttribute('href')]), [
    ['Roadmap', '#/guida'],
    ['Concetti', '#/guida/concetti'],
  ]);
  assert.equal(activeTab('.tabs'), 'Roadmap');
  assert.equal(outlet.querySelectorAll('.rm-phase').length, 8);

  await visit('#/concetti?c=trl');
  assert.equal(router.currentPath(), '/guida/concetti');
  assert.equal(location.hash, '#/guida/concetti?c=trl', 'il concetto scelto resta nell\'indirizzo');
  assert.equal(text(outlet.querySelector('h1')), 'Guida');
  assert.equal(activeTab('.tabs'), 'Concetti');
  assert.ok(outlet.querySelector('#concetto-trl.is-focus'));
  assert.equal(outlet.querySelector('.rm-phase'), null);

  assert.equal(conceptHelp.conceptLink('trl').getAttribute('href'), '#/guida/concetti?c=trl');
  const modal = conceptHelp.openConcept('trl');
  assert.ok(modal.dialog.querySelector('a[href="#/guida/concetti?c=trl"]'));
  modal.close();
});

test('the idea has six tabs in groups, and every old section address still opens its section', async () => {
  const cases = [
    ['panoramica', 'Panoramica', null],
    ['roadmap', 'Roadmap', null],
    ['canvas', 'Analisi', 'Lean Canvas'],
    ['clienti', 'Analisi', 'Clienti'],
    ['mercato', 'Analisi', 'Mercato'],
    ['deeptech', 'Analisi', 'Deep tech'],
    ['esperimenti', 'Validazione', 'Esperimenti'],
    ['interviste', 'Validazione', 'Persone e interviste'],
    ['appunti', 'Appunti', null],
    ['commenti', 'Discussione', 'Commenti'],
    ['voti', 'Discussione', 'Voti'],
    ['storico', 'Discussione', 'Storico'],
    ['analisi', 'Analisi', 'Lean Canvas'],
    ['validazione', 'Validazione', 'Esperimenti'],
    ['discussione', 'Discussione', 'Commenti'],
    ['inesistente', 'Panoramica', null],
  ];
  for (const [key, group, section] of cases) {
    await visit(`#/idea/${IDS.idea}/${key}`);
    const groups = [...outlet.querySelectorAll('.idea-groups .tab')];
    assert.deepEqual(groups.map((tab) => tab.firstChild.textContent), ['Panoramica', 'Roadmap', 'Analisi', 'Validazione', 'Appunti', 'Discussione'], key);
    assert.equal(outlet.querySelector('.idea-groups .tab.is-active').firstChild.textContent, group, key);
    const sub = outlet.querySelector('.subtabs .tab.is-active');
    assert.equal(sub ? sub.firstChild.textContent : null, section, key);
  }

  await visit(`#/idea/${IDS.idea}/commenti`);
  assert.equal(outlet.querySelector('.idea-groups .tab.is-active').getAttribute('href'), `#/idea/${IDS.idea}/discussione`);
  assert.deepEqual([...outlet.querySelectorAll('.subtabs .tab')].map((tab) => tab.getAttribute('href')), ['commenti', 'voti', 'storico'].map((key) => `#/idea/${IDS.idea}/${key}`));
  assert.ok(outlet.querySelector('.comments-panel'), 'si apre proprio la sezione Commenti');
});

test('group tabs show the sum of the counts of their sections', async () => {
  await visit(`#/idea/${IDS.idea}/esperimenti`);
  const counts = Object.fromEntries([...outlet.querySelectorAll('.idea-tabs .tab')].map((tab) => [tab.firstChild.textContent, tab.querySelector('.tab-count')?.textContent || '']));
  assert.equal(counts.Esperimenti, '1');
  assert.equal(counts['Persone e interviste'], '1');
  assert.equal(counts.Validazione, '2', 'esperimenti più interviste');
  assert.equal(counts.Analisi, '1', 'il Lean Canvas');
  assert.equal(counts.Discussione, '3', 'i commenti dell\'idea e delle sue schede');
  assert.equal(counts.Panoramica, '');
});

test('an example idea shows only its groups and falls back to the overview', async () => {
  const sample = EXAMPLES.find((i) => i.kind === 'idea');
  await visit(`#/idea/${sample.id}/discussione`);
  assert.deepEqual([...outlet.querySelectorAll('.idea-groups .tab')].map((tab) => tab.firstChild.textContent), ['Panoramica', 'Roadmap', 'Analisi', 'Validazione']);
  assert.equal(outlet.querySelector('.idea-groups .tab.is-active').firstChild.textContent, 'Panoramica');
  assert.equal(outlet.querySelector('.subtabs'), null);
});

test('Esci sits next to Profilo and asks before signing out', async () => {
  signedOut = 0;
  assert.equal(byText(root.querySelector('.topbar'), 'button', 'Esci'), null);
  assert.equal(root.querySelector('.topbar [aria-label="Esci"]'), null, 'nella barra in alto non si esce più con un tocco');
  const foot = root.querySelector('.sidebar-foot');
  assert.deepEqual([...foot.children].map((el) => text(el)), ['Profilo', 'Esci']);
  const button = byText(foot, 'button', 'Esci');

  button.click();
  await flush();
  let dialog = document.querySelector('dialog.modal');
  assert.match(text(dialog), /Per rientrare servono password e codice di verifica/);
  byText(dialog, 'button', 'Annulla').click();
  await flush();
  assert.equal(signedOut, 0, 'annullando si resta dentro');
  assert.equal(document.querySelector('dialog.modal'), null);

  button.click();
  await flush();
  dialog = document.querySelector('dialog.modal');
  byText(dialog.querySelector('.modal-actions'), 'button', 'Esci').click();
  await flush();
  assert.equal(signedOut, 1);
});

test('on a phone the search opens as a full-width row from its button, and closes again', async () => {
  const toggle = root.querySelector('.search-toggle');
  const box = root.querySelector('.search');
  const input = box.querySelector('.search-input');
  const results = box.querySelector('.search-results');
  assert.equal(toggle.getAttribute('aria-label'), 'Cerca');
  assert.equal(toggle.getAttribute('aria-controls'), box.id);
  const isOpen = () => box.classList.contains('is-open');

  toggle.click();
  assert.ok(isOpen());
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement, input, 'si può scrivere subito');
  typeInto(input, 'clienti');
  assert.equal(results.hidden, false);
  assert.match(text(results), /I clienti pagano/);

  box.querySelector('.search-close').click();
  assert.equal(isOpen(), false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(input.value, '');
  assert.equal(results.hidden, true);
  assert.equal(document.activeElement, toggle);

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: '/' }));
  assert.ok(isOpen(), 'anche il tasto / apre la ricerca');
  assert.equal(document.activeElement, input);
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(isOpen(), false, 'Esc la chiude');

  toggle.click();
  typeInto(input, 'clienti');
  results.querySelector('a.search-result').click();
  assert.equal(isOpen(), false, 'scegliendo un risultato la riga si chiude');
  await flush();
});

test('menu groups start open, close with a tap, are remembered, and the current page reopens its group', async () => {
  const sistema = [...root.querySelectorAll('.nav-group')].find((g) => g.dataset.title === 'Sistema');
  const title = sistema.querySelector('.nav-group-title');
  const links = sistema.querySelector('.nav-group-links');
  assert.equal(title.getAttribute('aria-expanded'), 'true', 'aperti di default');
  assert.equal(links.hidden, false);
  title.click();
  assert.equal(title.getAttribute('aria-expanded'), 'false');
  assert.equal(links.hidden, true);
  assert.deepEqual(store.readLocal('menuChiuso'), ['Sistema'], 'si ricorda il gruppo chiuso');
  await visit('#/storico');
  assert.equal(links.hidden, false, 'la pagina aperta riapre il suo gruppo');
  assert.deepEqual(store.readLocal('menuChiuso'), ['Sistema'], 'senza cambiare la preferenza');
  title.click();
  title.click();
  assert.deepEqual(store.readLocal('menuChiuso'), [], 'riaperto a mano torna aperto anche dopo');
});
