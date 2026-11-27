import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, text, byText } from '../setup/dom.mjs';
import { ADVISOR, IDS, ME, OTHER, boardItems, item, members } from '../setup/fixtures.mjs';
import { daysFromToday, italianLeftovers } from './ideas-editing.helpers.mjs';

// On a device in English: the language is decided when the site loads, so the modules are imported after the choice.
useLanguage('en');
setupDom();
const { api } = await import('../../assets/js/lib/api.js');
const store = await import('../../assets/js/store.js');
const router = await import('../../assets/js/router.js');
const app = await import('../../assets/js/app.js');
const contacts = await import('../../assets/js/views/contacts.js');
const { fmtDate } = await import('../../assets/js/lib/format.js');

const original = { ...api };
let outlet;

const C = {
  buyer: 'cccccccc-0000-4000-8000-000000000001',
  doctor: 'cccccccc-0000-4000-8000-000000000002',
  pharmacy: 'cccccccc-0000-4000-8000-000000000003',
  closed: 'cccccccc-0000-4000-8000-000000000004',
};

function contactItems() {
  const contact = (id, over) => item({ id, kind: 'contact', idea_id: IDS.idea, status: 'da_contattare', ...over });
  return [
    contact(C.buyer, { title: 'Purchasing manager', data: { role: 'Purchasing', organization: 'Green Ltd' } }),
    contact(C.doctor, { title: 'Family doctor', status: 'contattata', data: { owner: ME, next_date: daysFromToday(-3) } }),
    contact(C.pharmacy, { title: 'Central pharmacy', idea_id: IDS.idea2, status: 'fissata', data: { owner: OTHER, next_date: daysFromToday(0) } }),
    contact(C.closed, { title: 'City hospital', status: 'chiusa', data: {} }),
  ];
}

before(() => {
  router.clearRoutes();
  app.registerRoutes();
});

beforeEach(async () => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  [...boardItems(), ...contactItems()].forEach((i) => store.applyItem(i));
  localStorage.clear();
  document.body.querySelectorAll('dialog, .toasts').forEach((d) => d.remove());
  outlet = document.createElement('main');
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

const labels = () => [...outlet.querySelectorAll('.filters .field-label')].map((l) => text(l));
const headers = () => [...outlet.querySelectorAll('th')].map((t) => text(t));

describe('elenchi in inglese', () => {
  it('gli esperimenti hanno filtri, sottotitolo e scadenze in inglese', async () => {
    const body = await visit('#/esperimenti');
    assert.match(body, /Every experiment tests an assumption, with a success criterion decided beforehand\./);
    assert.deepEqual(labels(), ['Idea', 'Member', 'Text']);
    assert.equal(text(outlet.querySelector('.filters select option')), 'All');
    assert.equal(outlet.querySelector('.filters input[type="search"]').getAttribute('placeholder'), 'Search');
    assert.match(text(outlet.querySelector('.page-actions .btn')), /^New: \S/);
    assert.deepEqual(italianLeftovers(body, ['lists', 'common']), []);
  });

  for (const [days, expected] of [
    [-2, 'overdue by 2 days'],
    [-1, 'overdue by 1 day'],
    [0, '0 days to the deadline'],
    [1, '1 day to the deadline'],
    [12, '12 days to the deadline'],
  ]) {
    it(`una scadenza a ${days} giorni si legge "${expected}"`, async () => {
      store.applyItem(item({ ...store.getItem(IDS.experiment), data: { ...store.getItem(IDS.experiment).data, end_date: daysFromToday(days) }, version: 2 }));
      await visit('#/esperimenti');
      assert.equal(text(outlet.querySelector('.deadline')), expected);
    });
  }

  it('le interviste filtrano per tipo e impegno, con intestazioni inglesi', async () => {
    const body = await visit('#/interviste');
    assert.match(body, /Facts and commitments count more than opinions and compliments\./);
    assert.deepEqual(labels(), ['Idea', 'Member', 'Type', 'Commitment', 'Text']);
    const type = [...outlet.querySelectorAll('.filters label')].find((l) => text(l.querySelector('.field-label')) === 'Type').querySelector('select');
    assert.deepEqual([...type.options].map((o) => o.textContent), ['All', 'Conversations with people', 'Online research']);
    assert.deepEqual(headers(), ['Date', 'Interview', 'Idea', 'Interviewer', 'Status', 'Commitment', 'Problem']);
  });

  it('le decisioni dicono cosa, quando e perché', async () => {
    assert.match(await visit('#/decisioni'), /What we decided, when and why\./);
  });

  it('senza risultati lo dice con il nome della lista', async () => {
    const body = await visit('#/decisioni?q=nothing-like-this');
    assert.match(body, /^.*No \S.* match these filters\./);
  });
});

describe('contatti in inglese', () => {
  it('la pagina ha titolo, filtri, riassunto e tabella in inglese', async () => {
    const body = await visit('#/contatti');
    assert.equal(text(outlet.querySelector('h1')), 'Contacts');
    assert.match(body, /The people to talk to for every idea\. Each one needs an owner and a date\./);
    const group = outlet.querySelector('.filters [role="group"]');
    assert.equal(group.getAttribute('aria-label'), 'Which people');
    assert.deepEqual([...group.querySelectorAll('a')].map((a) => text(a)), ['All', 'Mine', 'Without an owner', 'To talk to this week']);
    assert.deepEqual(labels(), ['Status', 'Idea']);
    assert.deepEqual([...outlet.querySelectorAll('.filters select')].map((s) => s.options[0].textContent), ['All', 'All']);
    assert.equal(text(outlet.querySelector('.contacts-summary')), '4 people: 1 to contact, 2 with an owner, 2 to talk to this week (1 overdue).');
    assert.deepEqual(headers(), ['Person', 'Idea', 'Status', 'Owner', 'Next contact', '']);
    assert.ok(byText(outlet, '.page-actions .btn', 'Add a person'));
    assert.deepEqual(italianLeftovers(body, ['contacts', 'common']), []);
  });

  it('il riassunto di un idea lo dice, e conta al singolare', async () => {
    await visit(`#/contatti?idea=${IDS.idea2}`);
    assert.equal(text(outlet.querySelector('.contacts-summary')), '1 person for this idea: 0 to contact, 1 with an owner, 1 to talk to this week.');
  });

  it('i comandi in tabella dicono a chi si riferiscono', async () => {
    await visit('#/contatti');
    const row = outlet.querySelector(`tr[data-id="${C.doctor}"]`);
    assert.equal(row.querySelector('select').getAttribute('aria-label'), 'Status: Family doctor');
    const owner = row.querySelectorAll('select')[1];
    assert.equal(owner.getAttribute('aria-label'), 'Owner: Family doctor');
    assert.equal(owner.options[0].textContent, 'Nobody');
    assert.equal(row.querySelector('input[type="date"]').getAttribute('aria-label'), 'Next contact: Family doctor');
    const log = byText(row, '.btn', 'Log the conversation');
    assert.equal(log.getAttribute('title'), 'Write how it went: the person is linked to the interview and moves to “In touch”');
  });

  it('cambiare responsabile e data si salva con un messaggio inglese', async () => {
    const calls = [];
    api.saveItem = async (args) => {
      calls.push(args);
      const current = store.getItem(args.id);
      return { status: 'ok', item: item({ ...current, ...args.snapshot, version: current.version + 1 }) };
    };
    await visit('#/contatti');
    const change = (el, value) => {
      el.value = value;
      el.dispatchEvent(new Event('change'));
    };
    const row = () => outlet.querySelector(`tr[data-id="${C.doctor}"]`);
    change(row().querySelectorAll('select')[1], OTHER);
    await flush(5);
    change(row().querySelectorAll('select')[1], '');
    await flush(5);
    change(row().querySelector('input[type="date"]'), '2026-12-03');
    await flush(5);
    change(row().querySelector('input[type="date"]'), '');
    await flush(5);
    assert.deepEqual(calls.map((c) => c.message), ['Owner: Bruno', 'Owner: nobody', `Next contact: ${fmtDate('2026-12-03')}`, 'Next contact: no date']);
  });

  it('un colloquio già registrato si apre dalla riga', async () => {
    store.applyItem(item({ ...store.getItem(C.buyer), data: { ...store.getItem(C.buyer).data, interview_id: IDS.interview }, version: 2 }));
    await visit('#/contatti');
    assert.equal(text(outlet.querySelector(`tr[data-id="${C.buyer}"] .row-actions`)), 'Interview');
  });

  it('un advisor vede i responsabili in sola lettura', async () => {
    store.state.user = { id: ADVISOR };
    store.setMembers(members());
    await visit('#/contatti');
    assert.equal(text(outlet.querySelector(`tr[data-id="${C.buyer}"] td:nth-child(4)`)), 'Nobody');
  });

  it('senza persone, o senza persone per i filtri, lo dice', async () => {
    assert.match(await visit(`#/contatti?filtro=senza&idea=${IDS.idea2}`), /Nobody matches these filters\./);
    store.resetStore();
    store.state.user = { id: ME };
    store.setMembers(members());
    boardItems().forEach((i) => store.applyItem(i));
    assert.match(await visit('#/contatti'), /Nobody on the list yet\. You add people from the page of each idea, in the “People and interviews” tab\./);
  });
});

describe('scadenze dei contatti in inglese', () => {
  const NOW = new Date(2026, 10, 18, 12);
  const on = (days, over = {}) => ({ status: 'contattata', data: { next_date: days === null ? undefined : daysFromToday(days, NOW) }, ...over });

  for (const [days, expected] of [
    [null, 'no date'],
    [-10, 'overdue by 10 days'],
    [-1, 'overdue by 1 day'],
    [0, 'today'],
    [1, 'tomorrow'],
    [2, 'in 2 days'],
    [30, 'in 30 days'],
  ]) {
    it(`a ${days === null ? 'nessuna data' : `${days} giorni`} si legge "${expected}"`, () => {
      assert.equal(text(contacts.dueLabel(on(days), NOW)), expected);
    });
  }

  it('una persona chiusa non ha scadenze', () => {
    assert.equal(contacts.dueLabel(on(-3, { status: 'chiusa' }), NOW), null);
  });

  it('a parità di data e di stato i nomi vanno in ordine alfabetico, accenti compresi', () => {
    const list = ['Zoe', 'Émile', 'adam', 'Éva'].map((title) => ({ title, status: 'contattata', data: {} }));
    assert.deepEqual(contacts.sortContacts(list, NOW).map((c) => c.title), ['adam', 'Émile', 'Éva', 'Zoe']);
  });
});
