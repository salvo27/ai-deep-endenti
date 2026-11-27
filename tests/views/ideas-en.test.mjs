import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, text, byText } from '../setup/dom.mjs';
import { IDS, ME, OTHER, boardItems, item, members, revision } from '../setup/fixtures.mjs';
import { daysFromToday, italianLeftovers } from './ideas-editing.helpers.mjs';

// On a device in English: the language is decided when the site loads, so the modules are imported after the choice.
useLanguage('en');
setupDom();
const { api } = await import('../../assets/js/lib/api.js');
const store = await import('../../assets/js/store.js');
const router = await import('../../assets/js/router.js');
const app = await import('../../assets/js/app.js');

const original = { ...api };
let outlet;

before(() => {
  router.clearRoutes();
  app.registerRoutes();
});

beforeEach(async () => {
  localStorage.clear();
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  store.state.commentCounts = new Map([[IDS.idea, 2]]);
  api.listRevisions = async () => [revision({ id: 2, version: 2, author_id: OTHER, op: 'update', changed: ['pitch'] })];
  outlet = document.createElement('main');
  await router.startRouter(outlet, { fallback: app.notFoundView });
  // Starting the router may open the dashboard, which remembers the visit: every test starts from a first visit.
  localStorage.clear();
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

const headings = () => [...outlet.querySelectorAll('h2')].map((h) => text(h));

describe('dashboard in inglese', () => {
  it('saluta, riassume e divide le cose da fare in riquadri inglesi', async () => {
    store.applyItem(item({ ...store.getItem(IDS.interview), data: { ...store.getItem(IDS.interview).data, date: daysFromToday(-5) }, version: 2 }));
    const body = await visit('#/');
    assert.equal(text(outlet.querySelector('h1')), 'Hello, Anna');
    assert.match(body, /The team’s ideas, the experiments running and what has changed\./);
    assert.deepEqual([...outlet.querySelectorAll('.stat')].map((s) => text(s)), ['2active ideas', '1experiment running', '1interview in the last 30 days', '1firm commitment (pilot)']);
    assert.deepEqual(headings(), ['Ranking', 'Ideas pipeline', 'Running experiments', 'Your to-do list', 'Latest changes']);
    assert.ok(byText(outlet, '.page-actions .btn', 'New idea'));
    assert.ok(byText(outlet, 'a', 'Open the full history'));
    assert.deepEqual(italianLeftovers(body, ['dashboard', 'common']), []);
  });

  it('le statistiche contano al singolare e al plurale', async () => {
    store.applyItem(item({ id: 'eeeeeeee-0000-4000-8000-000000000001', kind: 'experiment', title: 'Second', status: 'in_corso', idea_id: IDS.idea, data: {} }));
    await visit('#/');
    assert.equal(text(outlet.querySelectorAll('.stat')[1]), '2experiments running');
  });

  for (const [days, expected] of [
    [-3, 'overdue by 3 days'],
    [-1, 'overdue by 1 day'],
    [0, 'due today'],
    [1, 'due in 1 day'],
    [9, 'due in 9 days'],
  ]) {
    it(`una scadenza a ${days} giorni si legge "${expected}"`, async () => {
      store.applyItem(item({ ...store.getItem(IDS.experiment), data: { ...store.getItem(IDS.experiment).data, end_date: daysFromToday(days) }, version: 2 }));
      await visit('#/');
      const running = [...outlet.querySelectorAll('section.card')].find((s) => text(s.querySelector('h2')) === 'Running experiments');
      assert.equal(text(running.querySelector('.deadline')), expected);
    });
  }

  it('la prima visita mostra le ultime modifiche, le seguenti le novità', async () => {
    api.listRevisions = async () => [];
    let body = await visit('#/');
    assert.match(body, /No changes yet\./);
    body = await visit('#/');
    assert.ok(headings().includes('New since your last visit'));
    assert.match(body, /Nothing new from the others since your last visit\./);
  });

  it('una board vuota invita a creare la prima idea o a partire dal generatore', async () => {
    store.resetStore();
    store.state.user = { id: ME };
    store.setMembers(members());
    const body = await visit('#/');
    assert.match(body, /The board is empty\. Create the first idea, or start from the generator\./);
    assert.ok(byText(outlet, 'a', 'Open the generator'));
    assert.match(body, /No scores yet\. Score the ideas/);
    assert.match(body, /No experiments running\./);
    assert.match(body, /Nothing pending\./);
  });

  it('i disaccordi della classifica e le persone senza responsabile', async () => {
    store.applyItem(item({ id: 'dddddddd-0000-4000-8000-000000000001', kind: 'score', title: 'Anna', created_by: ME, updated_by: ME, data: { scores: { [IDS.idea]: { cliente: 1, mercato: 5 } } } }));
    for (const [n, title] of [[1, 'Rita'], [2, 'Luca']]) {
      store.applyItem(item({ id: `cccccccc-0000-4000-8000-00000000000${n}`, kind: 'contact', title, status: 'da_contattare', idea_id: IDS.idea, data: {} }));
    }
    await visit('#/');
    const badge = outlet.querySelector('.ranking .badge-warn');
    assert.match(text(badge), /^\d+ disagreements?$/);
    assert.equal(badge.getAttribute('title'), 'Criteria the team does not agree on');
    assert.match(text(outlet), /2 people without an owner: choose who takes care of them\./);
  });
});

describe('pagina delle idee in inglese', () => {
  it('le colonne hanno i comandi, le idee e gli esempi in inglese', async () => {
    const body = await visit('#/idee');
    assert.equal(text(outlet.querySelector('h1')), 'Ideas');
    assert.match(body, /To change the status, drag a card to another column, or use the menu on the idea page\./);
    assert.match(body, /The dashed cards are examples from well-known startups: they show how to fill in an idea in every status\./);
    for (const label of ['Columns', 'Table', 'Examples', 'New idea']) assert.ok(byText(outlet, '.page-actions .btn', label), label);
    const card = outlet.querySelector(`.idea-card[data-id="${IDS.idea}"]`);
    assert.deepEqual([...card.querySelectorAll('.counter')].map((c) => c.getAttribute('title')), ['Experiments', 'Interviews', 'Comments']);
    assert.equal(card.querySelector('.score-badge').getAttribute('title'), 'Team score (0-100)');
    assert.equal(text(outlet.querySelector('.idea-card.is-example .badge-example')), 'Example');
    assert.deepEqual(italianLeftovers(body, ['ideas', 'common']), []);
  });

  it('il pulsante degli esempi li nasconde e li mostra', async () => {
    await visit('#/idee');
    const toggle = () => byText(outlet, '.page-actions button', 'Examples');
    assert.equal(toggle().getAttribute('title'), 'Hide the example ideas');
    toggle().click();
    assert.equal(toggle().getAttribute('title'), 'Show the example ideas');
    assert.equal(outlet.querySelector('.idea-card.is-example'), null);
  });

  it('la tabella ha intestazioni inglesi', async () => {
    await visit('#/idee?vista=tabella');
    assert.deepEqual([...outlet.querySelectorAll('th')].map((t) => text(t)), ['Idea', 'Status', 'Sector', 'Owner', 'Score', 'Experiments', 'Interviews', 'Updated']);
  });

  it('senza idee invita a creare la prima', async () => {
    store.resetStore();
    store.state.user = { id: ME };
    store.setMembers(members());
    const body = await visit('#/idee?vista=tabella');
    assert.match(body, /No ideas yet\./);
    assert.ok(byText(outlet, 'a', 'Create the first idea'));
  });

  it('spostare un idea in un altra colonna salva il cambio di stato in inglese', async () => {
    await visit('#/idee');
    let saved = null;
    api.saveItem = async (args) => {
      saved = args;
      return { status: 'ok', item: item({ ...store.getItem(IDS.idea2), version: 2, status: args.snapshot.status }) };
    };
    const drop = new window.Event('drop', { bubbles: true });
    drop.dataTransfer = { getData: () => IDS.idea2 };
    outlet.querySelector('.kanban-col[data-status="scelta"]').dispatchEvent(drop);
    await flush(5);
    assert.match(saved.message, /^Status: /);
  });
});
