import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text } from '../setup/dom.mjs';
import { ME, boardItems, members } from '../setup/fixtures.mjs';

let api;
let store;
let profile;
let original;
let fake;

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  profile = await import('../../assets/js/views/profile.js');
  original = { ...api };
  fake = globalThis.__fakeSupabase;
});

beforeEach(() => {
  fake.reset();
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  api.listFactors = async () => [];
  api.aiUsageLastDay = async () => 0;
  document.body.querySelectorAll('.toasts').forEach((t) => t.remove());
});

afterEach(() => Object.assign(api, original));

async function render() {
  const outlet = document.createElement('main');
  document.body.append(outlet);
  profile.profileView(outlet);
  const card = [...outlet.querySelectorAll('section.card')].find((s) => s.querySelector('h2')?.textContent === 'Email');
  return { outlet, card, box: (name) => card.querySelector(`input[type="checkbox"][name="${name}"]`) };
}

function toggle(box) {
  box.checked = !box.checked;
  box.dispatchEvent(new window.Event('change', { bubbles: true }));
}

test('both emails are on by default and saved preferences are read only for me', async () => {
  fake.responses.from.email_prefs = { data: null, error: null };
  assert.deepEqual(await original.emailPrefs(ME), { mentions: true, weekly: true });
  assert.deepEqual(fake.calls[0], ['from', 'email_prefs', [['select', 'mentions,weekly'], ['eq', 'user_id', ME], ['maybeSingle']]]);

  fake.responses.from.email_prefs = { data: { mentions: false, weekly: true }, error: null };
  assert.deepEqual(await original.emailPrefs(ME), { mentions: false, weekly: true });
  await assert.rejects(original.emailPrefs('non-un-id'), /Identificativo/);
});

test('changing a preference goes through the RPC with only that choice', async () => {
  fake.responses.rpc.set_email_prefs = { data: { user_id: ME, mentions: true, weekly: false }, error: null };
  assert.deepEqual(await original.setEmailPrefs({ weekly: false }), { mentions: true, weekly: false });
  assert.deepEqual(fake.calls.at(-1), ['rpc', 'set_email_prefs', { p_mentions: null, p_weekly: false }]);

  fake.responses.rpc.set_email_prefs = { data: null, error: { code: '42501', message: 'permission denied for function set_email_prefs' } };
  await assert.rejects(original.setEmailPrefs({ mentions: false }), /Non hai i permessi/);
});

test('the profile shows the two email switches with the saved state', async () => {
  let release;
  api.emailPrefs = (userId) => {
    assert.equal(userId, ME);
    return new Promise((resolve) => (release = () => resolve({ mentions: true, weekly: false })));
  };
  const { outlet, card, box } = await render();
  assert.ok(card, 'manca la scheda Email');
  assert.equal(box('mentions').disabled, true, 'spenti finché non si conoscono le preferenze');
  assert.match(text(card), /Menzioni/);
  assert.match(text(card), /Riepilogo settimanale/);
  release();
  await flush(5);
  assert.equal(box('mentions').checked, true);
  assert.equal(box('weekly').checked, false);
  assert.equal(box('weekly').disabled, false);
  assert.match(text(card), /Arrivano a me@test\.it/);
  outlet.remove();
});

test('turning an email off saves it and a failure puts the switch back', async () => {
  api.emailPrefs = async () => ({ mentions: true, weekly: true });
  const saved = [];
  api.setEmailPrefs = async (patch) => {
    saved.push(patch);
    return { mentions: patch.mentions ?? true, weekly: patch.weekly ?? true };
  };
  const { outlet, box } = await render();
  await flush(5);

  toggle(box('mentions'));
  await flush(5);
  assert.deepEqual(saved, [{ mentions: false }]);
  assert.equal(box('mentions').checked, false);
  assert.match(text(document.querySelector('.toasts')), /Menzioni: email spenta/);

  api.setEmailPrefs = async () => {
    throw new Error('Preferenza non salvata.');
  };
  toggle(box('weekly'));
  await flush(5);
  assert.equal(box('weekly').checked, true, 'il salvataggio non è riuscito: resta acceso');
  assert.equal(box('weekly').disabled, false);
  assert.match(text(document.querySelector('.toasts')), /Preferenza non salvata/);
  outlet.remove();
});

test('if the preferences cannot be read the switches stay locked', async () => {
  api.emailPrefs = async () => {
    throw new Error('rete');
  };
  const { outlet, card, box } = await render();
  await flush(5);
  assert.equal(box('mentions').disabled, true);
  assert.match(text(card), /Non riesco a leggere le preferenze/);
  outlet.remove();
});
