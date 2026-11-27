import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, text } from '../setup/dom.mjs';
import { italianWords } from '../setup/italian.mjs';
import { ME, item, members } from '../setup/fixtures.mjs';

// On a device in English: the site language is decided when it loads, so the modules are imported after the choice.
useLanguage('en');
setupDom();
const store = await import('../../assets/js/store.js');
const { ROADMAP, ROADMAP_STEPS } = await import('../../assets/js/roadmap.js');
const { guideView } = await import('../../assets/js/views/guide.js');
const { CONCEPTS_INTRO } = await import('../../assets/js/views/concepts.js');

const IDEA = 'aaaaaaaa-0000-4000-8000-000000000001';
const DONE = 'aaaaaaaa-0000-4000-8000-000000000002';

function visit(tab, query = '') {
  const outlet = document.createElement('main');
  guideView(outlet, tab ? { tab } : {}, new URLSearchParams(query));
  return outlet;
}
const headings = (outlet) => [...outlet.querySelectorAll('section.card > h2')].map((h2) => h2.textContent);

beforeEach(() => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
});

describe('guida in inglese', () => {
  it('ha titolo, sottotitolo e schede in inglese', () => {
    const outlet = visit();
    assert.equal(text(outlet.querySelector('h1')), 'Guide');
    assert.match(text(outlet.querySelector('.page-subtitle')), /^The roadmap to follow for each idea, in order: from the team to the company\./);
    assert.deepEqual([...outlet.querySelectorAll('.tab')].map((tab) => [text(tab), tab.getAttribute('href')]), [
      ['Roadmap', '#/guida'],
      ['Concepts', '#/guida/concetti'],
    ]);
  });

  it('senza idee lo dice, e la roadmap di ogni idea comparirà lì', () => {
    const outlet = visit();
    assert.equal(text(outlet.querySelector('.empty')), 'No ideas yet: the roadmap of each idea will appear here.');
  });

  it('la tabella delle idee ha le colonne in inglese e dice quando un idea ha finito la roadmap', () => {
    const marks = Object.fromEntries(ROADMAP_STEPS.map((step) => [step.key, `done|${ME}|2026-10-10T10:00:00Z`]));
    store.applyItem(item({ id: IDEA, kind: 'idea', title: 'Solar sensors', status: 'nuova' }));
    store.applyItem(item({ id: DONE, kind: 'idea', title: 'Water meters', status: 'scelta', data: { roadmap: marks } }));
    const outlet = visit();
    const table = outlet.querySelector('.rm-table');
    assert.deepEqual([...table.querySelectorAll('thead th')].map((th) => th.textContent), ['Idea', 'Status', 'Progress', 'Phase', 'Next step']);
    const row = [...table.querySelectorAll('tbody tr')].find((tr) => text(tr).includes('Water meters'));
    const cells = [...row.querySelectorAll('td')].map(text);
    assert.equal(cells[2], '100%');
    assert.equal(cells[3], 'Complete');
    assert.equal(cells[4], '-');
  });

  it('spiega come usare la roadmap, con il numero di fasi e di passi', () => {
    const outlet = visit();
    assert.deepEqual(headings(outlet), ['Where your ideas stand', 'How to use the roadmap', 'The tools on the board']);
    const points = [...outlet.querySelectorAll('.rm-howto li')].map(text);
    assert.equal(points.length, 5);
    assert.equal(points[0], `${ROADMAP.length} phases and ${ROADMAP_STEPS.length} steps, in the order that lowers the risk: people and the problem first, then the solution, and the company only at the end.`);
    assert.match(points[2], /^A step is done only when you tick it/);
  });

  it('propone l esempio di una roadmap avanzata', () => {
    const outlet = visit();
    assert.match(text(outlet.querySelector('.btn-example')), /^Example of an advanced roadmap: \S+/);
  });

  it('elenca gli strumenti della board con i nomi inglesi', () => {
    const outlet = visit();
    const names = [...outlet.querySelectorAll('.tool strong')].map((s) => s.textContent);
    assert.deepEqual(names, ['Idea', 'Roadmap', 'Lean Canvas', 'Customers', 'Market', 'Deep tech', 'Experiments', 'Interviews', 'Decisions', 'Team']);
    const texts = [...outlet.querySelectorAll('.tool p')].map((p) => p.textContent);
    assert.equal(texts[6], 'Javelin board: one assumption per experiment, criterion decided beforehand.');
  });

  it('nella scheda dei concetti il sottotitolo presenta i concetti', () => {
    const outlet = visit('concetti', 'c=trl');
    assert.equal(text(outlet.querySelector('.page-subtitle')), CONCEPTS_INTRO);
    assert.equal(text(outlet.querySelector('.tab.is-active')), 'Concepts');
    assert.ok(outlet.querySelector('#concetto-trl.is-focus'));
  });

  it('i testi della guida non lasciano parole italiane, a parte le fasi della roadmap che vengono da un altra area', () => {
    store.applyItem(item({ id: IDEA, kind: 'idea', title: 'Solar sensors', status: 'nuova' }));
    const outlet = visit();
    outlet.querySelectorAll('.rm-phase, .rm-table tbody').forEach((el) => el.remove());
    assert.deepEqual(italianWords(text(outlet)).filter((w) => w !== 'per'), []);
  });
});
