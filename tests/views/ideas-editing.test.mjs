import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text } from '../setup/dom.mjs';
import { IDS, ME, boardItems, item, members } from '../setup/fixtures.mjs';

// In italiano, la lingua dei test: numeri e ordinamenti seguono la lingua in uso, non regole scritte a mano.
setupDom();
const { api } = await import('../../assets/js/lib/api.js');
const store = await import('../../assets/js/store.js');
const router = await import('../../assets/js/router.js');
const app = await import('../../assets/js/app.js');
const contacts = await import('../../assets/js/views/contacts.js');

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
  api.listRevisions = async () => [];
  outlet = document.createElement('main');
  await router.startRouter(outlet, { fallback: app.notFoundView });
});

afterEach(() => {
  router.stopRouter();
  Object.assign(api, original);
});

describe('numeri e ordinamenti nella lingua in uso', () => {
  it('la media dei voti di un idea ha la virgola decimale italiana', async () => {
    store.applyItem(item({ id: 'dddddddd-0000-4000-8000-000000000001', kind: 'score', title: 'Anna', created_by: ME, updated_by: ME, data: { scores: { [IDS.idea]: { cliente: 5, mercato: 5 } } } }));
    await router.render(`#/idea/${IDS.idea}/voti`);
    await flush(5);
    const means = [...outlet.querySelectorAll('.tab-body tbody tr')].map((r) => r.lastChild.firstChild.textContent);
    assert.deepEqual(means, ['5,0', '3,5']);
    assert.match(text(outlet.querySelector('.tab-body p')), /^Punteggio del team: \d+\/100 · 2 votanti$/);
  });

  it('a parità di data e di stato le persone vanno in ordine alfabetico, accenti compresi', () => {
    const list = ['Zeno', 'Èlia', 'andrea', 'Elena'].map((title) => ({ title, status: 'contattata', data: {} }));
    assert.deepEqual(contacts.sortContacts(list, new Date(2026, 10, 18)).map((c) => c.title), ['andrea', 'Elena', 'Èlia', 'Zeno']);
  });
});
