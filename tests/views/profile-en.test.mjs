import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, text, byText, typeInto } from '../setup/dom.mjs';
import { italianWords } from '../setup/italian.mjs';
import { ME, members, projects } from '../setup/fixtures.mjs';

// Su un dispositivo in inglese: la lingua si decide quando il sito si carica, per questo i moduli arrivano dopo la scelta.
useLanguage('en');

let api;
let store;
let profile;
let original;
let saved;

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
  store.state.user = { id: ME, email: 'anna@test.it' };
  store.setProjects(projects());
  store.setProject(projects()[0]);
  store.setMembers(members());
  store.state.platformAdmin = true;
  saved = [];
  api.listFactors = async () => [
    { id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: null, created_at: '2026-10-01T10:00:00Z' },
  ];
  api.aiUsageLastDay = async () => 2;
  api.emailPrefs = async () => ({ mentions: true, weekly: false });
  api.updateProfile = async (patch) => saved.push(patch);
  api.membersOverview = async () => members();
  document.body.querySelectorAll('dialog, .toasts, main').forEach((el) => el.remove());
});

afterEach(() => Object.assign(api, original));

async function open() {
  const outlet = document.createElement('main');
  document.body.append(outlet);
  profile.profileView(outlet);
  await flush(5);
  return outlet;
}

// Quello che si legge, testo e attributi: i nomi delle lingue sono scritti ognuno nella sua lingua, di proposito.
function leftovers(root) {
  const copy = root.cloneNode(true);
  copy.querySelectorAll('option[value="it"]').forEach((el) => el.remove());
  const attributes = [...copy.querySelectorAll('[aria-label],[title],[placeholder]')].flatMap((el) =>
    ['aria-label', 'title', 'placeholder'].map((name) => el.getAttribute(name)).filter(Boolean),
  );
  return italianWords([copy.textContent, ...attributes].join(' '));
}

describe('Profilo in inglese', () => {
  it('tutte le schede sono in inglese, con il ruolo nel progetto aperto', async () => {
    const outlet = await open();
    assert.equal(text(outlet.querySelector('h1')), 'Profile and security');
    assert.deepEqual([...outlet.querySelectorAll('.card h2')].map((el) => text(el)), [
      'Profile',
      'Language',
      'Password',
      'Two-step verification',
      'Notifications',
      'Email',
      'Sessions and usage',
    ]);
    assert.equal(text(outlet.querySelector('.profile-role')), 'me@test.it · Admin in “Alfa” · Platform admin');
    assert.match(text(outlet), /Name and colour hold in all your projects\./);
    assert.match(text(outlet), /It is your only device: it cannot be removed/);
    assert.match(text(outlet), /Requests to Claude in the last 24 hours: 2/);
    assert.match(text(outlet), /They go to me@test\.it\./);
    assert.match(text(outlet), /On Monday morning, one per project/);
    assert.deepEqual(leftovers(outlet), []);
  });

  it('salvare il profilo e un nome vuoto si raccontano in inglese', async () => {
    const outlet = await open();
    const form = outlet.querySelector('form.profile-card');
    typeInto(form.querySelector('input[type="text"]'), '  ');
    form.dispatchEvent(new window.Event('submit', { cancelable: true }));
    await flush(5);
    assert.match(text(document.querySelector('.toasts')), /Invalid name or colour\./);
    typeInto(form.querySelector('input[type="text"]'), 'Anna B.');
    form.dispatchEvent(new window.Event('submit', { cancelable: true }));
    await flush(5);
    assert.deepEqual(saved, [{ display_name: 'Anna B.', color: '#4f5bd5' }]);
    assert.match(text(document.querySelector('.toasts')), /Profile updated\./);
  });

  it('senza progetto aperto lo dice in inglese', async () => {
    store.resetStore();
    store.state.user = { id: ME, email: 'anna@test.it' };
    store.state.platformAdmin = true;
    api.myProfile = async () => ({ user_id: ME, display_name: 'Anna', color: '#123456', language: 'en' });
    const outlet = await open();
    assert.equal(text(outlet.querySelector('.profile-role')), 'anna@test.it · No project open · Platform admin');
    assert.deepEqual(leftovers(outlet), []);
  });

  it('automatica salva nel profilo la lingua del dispositivo, qui l inglese', async () => {
    localStorage.setItem('lingua', 'it');
    let reloads = 0;
    const card = profile.languageCard(() => (reloads += 1));
    const select = card.querySelector('select[name="language"]');
    assert.equal(text(select.options[0]), 'Automatic (English)');
    select.value = 'auto';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    await flush();
    assert.deepEqual(saved, [{ language: 'en' }]);
    assert.equal(reloads, 1);
  });

  it('togliere un dispositivo e uscire ovunque chiedono conferma in inglese', async () => {
    api.listFactors = async () => [
      { id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'iPhone', created_at: '2026-10-01T10:00:00Z' },
      { id: 'f2', factor_type: 'totp', status: 'verified', friendly_name: 'iPad', created_at: '2026-10-02T10:00:00Z' },
    ];
    const outlet = await open();
    byText(outlet, 'button', 'Remove').click();
    await flush();
    let dialog = document.querySelector('dialog.modal');
    assert.equal(text(dialog.querySelector('h2')), 'Remove the device?');
    byText(dialog, 'button', 'Cancel').click();
    await flush();
    byText(outlet, 'button', 'Sign out of all devices').click();
    await flush();
    dialog = document.querySelector('dialog.modal');
    assert.match(text(dialog), /You will be signed out everywhere, this browser included\./);
    assert.ok(byText(dialog, 'button', 'Sign out everywhere'));
    byText(dialog, 'button', 'Cancel').click();
    await flush();
  });
});
