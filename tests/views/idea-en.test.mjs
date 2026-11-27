import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, text, byText } from '../setup/dom.mjs';
import { IDS, ME, OTHER, boardItems, item, members } from '../setup/fixtures.mjs';
import { italianLeftovers } from './ideas-editing.helpers.mjs';

// On a device in English: the language is decided when the site loads, so the modules are imported after the choice.
useLanguage('en');
setupDom();
const { api } = await import('../../assets/js/lib/api.js');
const store = await import('../../assets/js/store.js');
const router = await import('../../assets/js/router.js');
const app = await import('../../assets/js/app.js');

const AREAS = ['idea', 'editor', 'common'];
const original = { ...api };
let outlet;

before(() => {
  router.clearRoutes();
  app.registerRoutes();
});

beforeEach(async () => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  store.state.commentCounts = new Map([[IDS.idea, 2]]);
  api.listRevisions = async () => [];
  api.listComments = async () => [];
  outlet = document.createElement('main');
  document.body.querySelectorAll('dialog, .toasts').forEach((d) => d.remove());
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

const tabLabels = (selector) => [...outlet.querySelectorAll(`${selector} .tab`)].map((t) => t.childNodes[0].textContent);
const tabBody = () => outlet.querySelector('.tab-body');
const add = (over) => store.applyItem(item({ idea_id: IDS.idea, ...over }));

describe('schede di un idea in inglese', () => {
  it('le sei schede hanno nomi inglesi', async () => {
    await visit(`#/idea/${IDS.idea}`);
    assert.deepEqual(tabLabels('.idea-groups'), ['Overview', 'Roadmap', 'Analysis', 'Validation', 'Notes', 'Discussion']);
    assert.equal(outlet.querySelector('.idea-groups').getAttribute('aria-label'), 'Idea tabs');
  });

  for (const [group, label, sections] of [
    ['analisi', 'Analysis', ['Lean Canvas', 'Customers', 'Market', 'Deep tech']],
    ['validazione', 'Validation', ['Experiments', 'People and interviews', 'Surveys']],
    ['discussione', 'Discussion', ['Comments', 'Votes', 'History']],
  ]) {
    it(`la scheda ${label} ha le sezioni ${sections.join(', ')}`, async () => {
      await visit(`#/idea/${IDS.idea}/${group}`);
      assert.deepEqual(tabLabels('.subtabs'), sections);
      assert.equal(outlet.querySelector('.subtabs').getAttribute('aria-label'), label);
    });
  }

  it('la testata ha stato, critica, chat, modifica, esportazione e cestino in inglese', async () => {
    await visit(`#/idea/${IDS.idea}`);
    assert.ok(outlet.querySelector('.page-header select[aria-label="Status"]'));
    for (const label of ['Critique the idea', 'Idea chat', 'Edit']) assert.ok(byText(outlet, '.page-actions .btn', label), label);
    assert.ok(outlet.querySelector('.page-actions button[title="Export to Markdown"]'));
    assert.ok(outlet.querySelector('.page-actions button[title="Archive"]'));
    assert.deepEqual(italianLeftovers(text(outlet.querySelector('.page-header')), AREAS), []);
  });

  it('la chat dell idea dice quanti messaggi non ho letto', async () => {
    const { chatState } = await import('../../assets/js/chat.js');
    const CHAT = 'abababab-0000-4000-8000-000000000001';
    chatState.chats.set(CHAT, { id: CHAT, idea_id: IDS.idea, archived_at: null });
    chatState.info.set(CHAT, { last_message_at: null, unread: 3 });
    try {
      await visit(`#/idea/${IDS.idea}`);
      assert.ok(byText(outlet, '.page-actions .btn', 'Idea chat (3)'));
    } finally {
      chatState.chats.delete(CHAT);
      chatState.info.delete(CHAT);
    }
  });

  it('un idea nel cestino lo dice, una che non esiste pure', async () => {
    store.applyItem(item({ ...store.getItem(IDS.idea), deleted_at: '2026-10-18T10:00:00Z', version: 2 }));
    assert.match(await visit(`#/idea/${IDS.idea}`), /This idea is in the trash\. Go to the trash/);
    assert.match(await visit(`#/idea/${IDS.canvas}`), /Idea not found\./);
  });
});

describe('panoramica di un idea in inglese', () => {
  it('dice da dove nasce, a che punto è la validazione e le decisioni', async () => {
    await visit(`#/idea/${IDS.idea}/panoramica`);
    assert.match(text(tabBody()), /Born in the generator: XAI × Settore A/);
    const row = outlet.querySelector('.validation-row');
    assert.equal(row.getAttribute('aria-label'), 'Validation');
    assert.deepEqual([...row.querySelectorAll('.validation-label, .validation-chip')].map((c) => text(c)), ['Validation', '1 experiment, 1 running', '1 interview done', 'No open surveys']);
    assert.ok([...outlet.querySelectorAll('h2')].some((h) => text(h) === 'Decisions'));
    assert.deepEqual(italianLeftovers(text(row) + text(outlet.querySelector('.idea-decisions')), AREAS), []);
  });

  for (const [name, setup, expected] of [
    ['nessun esperimento e nessuna intervista', () => store.resetStore() || boardItems().filter((i) => !['experiment', 'interview'].includes(i.kind)).forEach((i) => store.applyItem(i)), ['No experiments', 'No interviews done']],
    ['due esperimenti non in corso e due interviste', () => {
      add({ id: 'eeeeeeee-0000-4000-8000-000000000001', kind: 'experiment', title: 'Second', status: 'concluso', data: {} });
      store.applyItem(item({ ...store.getItem(IDS.experiment), status: 'pianificato', version: 2 }));
      add({ id: 'eeeeeeee-0000-4000-8000-000000000002', kind: 'interview', title: 'Second', status: 'fatta', data: {} });
    }, ['2 experiments', '2 interviews done']],
  ]) {
    it(`i conteggi della validazione: ${name}`, async () => {
      setup();
      store.state.user = { id: ME };
      store.setMembers(members());
      await visit(`#/idea/${IDS.idea}/panoramica`);
      assert.deepEqual([...outlet.querySelectorAll('.validation-chip')].slice(0, 2).map((c) => text(c)), expected);
    });
  }

  it('un questionario aperto si vede col suo titolo', async () => {
    add({ id: 'ffffffff-0000-4000-8000-000000000001', kind: 'survey', title: 'Nutritionists', status: 'aperto', data: { questions: [] } });
    await visit(`#/idea/${IDS.idea}/panoramica`);
    assert.equal(text(outlet.querySelectorAll('.validation-chip')[2]), 'Open survey: Nutritionists');
  });
});

describe('analisi di un idea in inglese', () => {
  it('il Lean Canvas ha critica, modifica, versioni e apri', async () => {
    await visit(`#/idea/${IDS.idea}/canvas`);
    const section = outlet.querySelector('.canvas-section');
    for (const label of ['Critique', 'Edit', 'Versions', 'Open']) assert.ok(byText(section, '.btn', label), label);
    assert.ok(byText(outlet, '.kind-block .btn', 'New Lean Canvas'));
  });

  for (const [tab, texts] of [
    ['clienti', ['No buyer personas yet. One for each type of customer, based on the interviews.', 'No Value Proposition Canvas yet. Fill in the customer profile first, then the value map.', 'New buyer persona', 'New Value Proposition Canvas']],
    ['mercato', ['No market estimate yet. TAM, SAM and SOM in euros per year, with sources and reasoning.', 'No competitor analysis yet. “We have no competitors” is never true.', 'New market estimate', 'New competitor analysis']],
    ['deeptech', ['No deep tech sheet yet. You need one if the idea comes from research: technology maturity, intellectual property, relations with the university, funding calls.', 'New deep tech sheet']],
  ]) {
    it(`la sezione ${tab} vuota spiega cosa metterci`, async () => {
      const body = await visit(`#/idea/${IDS.idea}/${tab}`);
      for (const t of texts) assert.ok(body.includes(t), t);
      assert.deepEqual(italianLeftovers(text(tabBody()), AREAS), []);
    });
  }
});

describe('validazione di un idea in inglese', () => {
  it('gli esperimenti si leggono come schede', async () => {
    store.applyItem(item({ ...store.getItem(IDS.experiment), data: { ...store.getItem(IDS.experiment).data, success_criterion: '3 of 10', result: 'Yes' }, version: 2 }));
    await visit(`#/idea/${IDS.idea}/esperimenti`);
    for (const label of ['New experiment', 'Suggest the next experiment', 'Cards', 'Javelin']) assert.ok(byText(tabBody(), '.btn', label), label);
    const card = tabBody().querySelector('.card');
    assert.match(text(card), /Assumption: Pagano/);
    assert.match(text(card), /Criterion: 3 of 10/);
    assert.match(text(card), /Result: Yes/);
    assert.match(text(card), /Due 1 Oct 2026/);
    assert.deepEqual(italianLeftovers(text(tabBody()), AREAS), []);
  });

  it('gli esperimenti si leggono come Javelin Board', async () => {
    store.applyItem(item({ ...store.getItem(IDS.experiment), data: { ...store.getItem(IDS.experiment).data, decision: 'proseguire' }, version: 2 }));
    await visit(`#/idea/${IDS.idea}/esperimenti?vista=javelin`);
    const rows = [...tabBody().querySelectorAll('tbody th')].map((t) => text(t));
    assert.deepEqual(rows, ['Customer', 'Problem', 'Solution', 'Riskiest assumption', 'Method and success criterion', 'Get out of the building: go and talk to customers', 'Result and decision', 'What we learned']);
    assert.equal(text(tabBody().querySelector('thead th')), 'Experiments');
    assert.match(text(tabBody()), /Decision: \S/);
  });

  it('senza esperimenti invita a partire dall assunzione più rischiosa', async () => {
    store.resetStore();
    store.state.user = { id: ME };
    store.setMembers(members());
    boardItems().filter((i) => i.kind !== 'experiment').forEach((i) => store.applyItem(i));
    assert.match(await visit(`#/idea/${IDS.idea}/esperimenti`), /No experiments yet\. Start from the riskiest assumption\./);
  });

  it('persone e interviste hanno tabelle e comandi inglesi', async () => {
    add({ id: 'cccccccc-0000-4000-8000-000000000001', kind: 'contact', title: 'Rita Bianchi', status: 'da_contattare', data: { owner: ME, next_date: '2026-11-02' } });
    await visit(`#/idea/${IDS.idea}/interviste`);
    const [contacts, interviews] = tabBody().querySelectorAll('table');
    assert.deepEqual([...contacts.querySelectorAll('th')].map((t) => text(t)), ['Who', 'Why', 'How we reach them', 'Owner', 'Next contact', 'Status', '']);
    assert.deepEqual([...interviews.querySelectorAll('th')].map((t) => text(t)), ['Date', 'Interview', 'Status', 'Commitment', 'Problem felt']);
    assert.ok([...tabBody().querySelectorAll('h2')].some((h) => text(h).startsWith('People to talk to')));
    assert.ok([...tabBody().querySelectorAll('h2')].some((h) => text(h).startsWith('Interviews')));
    const open = byText(tabBody(), '.btn', 'Open in Contacts');
    assert.equal(open.getAttribute('title'), 'Owners, dates and statuses to change directly in the table');
    const interview = byText(contacts, '.btn', 'Interview');
    assert.equal(interview.getAttribute('title'), 'Create the interview with the details of this person');
    for (const label of ['Add a person', 'New interview', 'Interview questions', 'Interview summary']) assert.ok(byText(tabBody(), '.btn', label), label);
    assert.deepEqual(italianLeftovers(text(tabBody()), AREAS), []);
  });

  it('senza persone e senza interviste spiega cosa fare', async () => {
    store.resetStore();
    store.state.user = { id: ME };
    store.setMembers(members());
    boardItems().filter((i) => i.kind !== 'interview').forEach((i) => store.applyItem(i));
    const body = await visit(`#/idea/${IDS.idea}/interviste`);
    assert.match(body, /Nobody on the list yet\. Write here who to interview and who to work with to make the idea happen: customers, experts, suppliers, the university, investors\./);
    assert.match(body, /No interviews yet\. Ask about the past and about facts, not about future intentions\./);
  });
});

describe('discussione di un idea in inglese', () => {
  it('i voti hanno punteggio, votanti e medie con il punto decimale', async () => {
    await visit(`#/idea/${IDS.idea}/voti`);
    assert.match(text(tabBody().querySelector('p')), /^Team score: \d+\/100 · 1 voter$/);
    assert.deepEqual([...tabBody().querySelectorAll('th')].map((t) => text(t)), ['Criterion', 'Weight', 'Votes', 'Average']);
    assert.deepEqual([...tabBody().querySelectorAll('tbody tr')].map((r) => text(r.lastChild)), ['5.0', '2.0']);
    assert.ok(byText(tabBody(), '.btn', 'Vote in the matrix'));
  });

  it('due votanti in disaccordo si vedono, con la media a un decimale', async () => {
    store.applyItem(item({ id: 'dddddddd-0000-4000-8000-000000000001', kind: 'score', title: 'Anna', created_by: ME, updated_by: ME, data: { scores: { [IDS.idea]: { cliente: 1, mercato: 5 } } } }));
    await visit(`#/idea/${IDS.idea}/voti`);
    assert.match(text(tabBody().querySelector('p')), / · 2 voters$/);
    const cells = [...tabBody().querySelectorAll('tbody tr')].map((r) => text(r.lastChild));
    assert.deepEqual(cells, ['3.0disagreement', '3.5disagreement']);
  });

  it('senza voti e senza criteri lo dice', async () => {
    store.resetStore();
    store.state.user = { id: ME };
    store.setMembers(members());
    boardItems().filter((i) => i.kind !== 'score').forEach((i) => store.applyItem(i));
    assert.match(await visit(`#/idea/${IDS.idea}/voti`), /Team score: no votes · 0 voters/);
    store.resetStore();
    store.state.user = { id: ME };
    store.setMembers(members());
    boardItems().filter((i) => i.kind !== 'criteria').forEach((i) => store.applyItem(i));
    const body = await visit(`#/idea/${IDS.idea}/voti`);
    assert.match(body, /The scoring criteria are missing\./);
    assert.ok(byText(tabBody(), '.btn', 'Go to scoring'));
  });

  it('lo storico vuoto lo dice e porta alle versioni dell idea', async () => {
    const body = await visit(`#/idea/${IDS.idea}/storico`);
    assert.match(body, /No changes\./);
    assert.ok(byText(tabBody(), '.btn', 'Idea versions'));
  });

  it('i commenti dell idea si aprono nella loro sezione', async () => {
    assert.match(await visit(`#/idea/${IDS.idea}/commenti`), /No comments yet\./);
  });
});

describe('un idea di esempio in inglese', () => {
  it('mostra solo le schede che gli esempi hanno', async () => {
    const example = store.exampleIdeas()[0];
    await visit(`#/idea/${example.id}`);
    assert.deepEqual(tabLabels('.idea-groups'), ['Overview', 'Roadmap', 'Analysis', 'Validation']);
    assert.equal(outlet.querySelector('.page-header select'), null);
    assert.ok(OTHER);
  });
});
