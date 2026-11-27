import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text } from '../setup/dom.mjs';
import { ME, boardItems, members } from '../setup/fixtures.mjs';

let api;
let store;
let profile;
let original;

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  profile = await import('../../assets/js/views/profile.js');
  original = { ...api };
});

beforeEach(() => {
  localStorage.clear();
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  api.listFactors = async () => [];
  api.aiUsageLastDay = async () => 0;
  api.emailPrefs = async () => ({ mentions: true, weekly: true });
  // La lingua scelta va anche nel profilo, prima di ricaricare: qui il salvataggio riesce subito.
  api.updateProfile = async (patch) => patch;
});

afterEach(() => Object.assign(api, original));

const select = (card) => card.querySelector('select[name="language"]');

function change(card, value) {
  select(card).value = value;
  select(card).dispatchEvent(new window.Event('change', { bubbles: true }));
}

describe('lingua scelta dal Profilo', () => {
  it('il Profilo ha la scheda della lingua', () => {
    const outlet = document.createElement('main');
    profile.profileView(outlet);
    const card = [...outlet.querySelectorAll('section.card')].find((s) => s.querySelector('h2')?.textContent === 'Lingua');
    assert.ok(card, 'manca la scheda Lingua');
    assert.ok(select(card));
  });

  it('propone la lingua del dispositivo e le lingue del sito, ognuna con il suo nome', () => {
    const card = profile.languageCard(() => {});
    const options = [...select(card).options].map((o) => [o.value, o.textContent]);
    assert.deepEqual(options, [
      ['auto', 'Automatica (Italiano)'],
      ['en', 'English'],
      ['it', 'Italiano'],
    ]);
    assert.equal(select(card).value, 'auto');
    assert.match(text(card), /italiano se è in italiano, inglese negli altri casi/);
  });

  it('una scelta si salva sul dispositivo e ricarica la pagina, così ogni testo cambia lingua', async () => {
    let reloads = 0;
    const card = profile.languageCard(() => reloads++);
    change(card, 'en');
    assert.equal(localStorage.getItem('lingua'), 'en');
    await flush();
    assert.equal(reloads, 1);
  });

  it('tornare ad automatica toglie la scelta', async () => {
    localStorage.setItem('lingua', 'en');
    let reloads = 0;
    const card = profile.languageCard(() => reloads++);
    change(card, 'auto');
    assert.equal(localStorage.getItem('lingua'), null);
    await flush();
    assert.equal(reloads, 1);
  });

  it('se il dispositivo non lascia salvare lo dice e non ricarica', async () => {
    let reloads = 0;
    const card = profile.languageCard(() => reloads++);
    const { Storage } = window;
    const realSet = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('bloccato');
    };
    try {
      change(card, 'en');
    } finally {
      Storage.prototype.setItem = realSet;
    }
    await flush();
    assert.equal(reloads, 0);
    assert.match(text(document.body), /Non riesco a salvare la scelta su questo dispositivo/);
  });
});

describe('lingua della pagina', () => {
  it('all avvio la pagina dichiara la lingua in uso', async () => {
    document.documentElement.lang = 'xx';
    globalThis.__fakeSupabase.reset();
    await import('../../assets/js/main.js');
    await flush();
    assert.equal(document.documentElement.lang, 'it');
  });
});
