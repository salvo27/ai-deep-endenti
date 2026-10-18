import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, byText, text, typeInto } from '../setup/dom.mjs';
import { ME, members } from '../setup/fixtures.mjs';

let api;
let auth;
let app;
let store;
let original;
let root;

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  auth = await import('../../assets/js/auth.js');
  app = await import('../../assets/js/app.js');
  store = await import('../../assets/js/store.js');
  original = { ...api };
});

beforeEach(() => {
  root = document.getElementById('app');
  root.replaceChildren();
});

afterEach(() => Object.assign(api, original));

const submit = (form) => form.dispatchEvent(new window.Event('submit', { cancelable: true }));

test('login validates input locally and shows the server error without details', async () => {
  let attempts = 0;
  api.signIn = async () => {
    attempts += 1;
    const { AppError } = await import('../../assets/js/lib/api.js');
    throw new AppError('Email o password non corretti.');
  };
  let done = false;
  auth.loginScreen(root, () => (done = true));
  submit(root.querySelector('form'));
  await flush();
  assert.match(text(root.querySelector('.form-error')), /Inserisci email e password/);
  assert.equal(attempts, 0);
  typeInto(root.querySelector('input[type="email"]'), 'anna@test.it');
  typeInto(root.querySelector('input[type="password"]'), 'sbagliata');
  submit(root.querySelector('form'));
  await flush();
  assert.equal(attempts, 1);
  assert.match(text(root.querySelector('.form-error')), /Email o password non corretti/);
  assert.equal(done, false);
});

test('a successful login clears the password field and continues', async () => {
  api.signIn = async () => ({ session: {} });
  let done = false;
  auth.loginScreen(root, () => (done = true));
  typeInto(root.querySelector('input[type="email"]'), 'anna@test.it');
  typeInto(root.querySelector('input[type="password"]'), 'Corretta-Password1');
  submit(root.querySelector('form'));
  await flush();
  assert.equal(done, true);
  assert.equal(root.querySelector('input[type="password"]').value, '');
});

test('password reset always answers the same way, so it does not reveal which emails exist', async () => {
  const calls = [];
  api.requestPasswordReset = async (email, redirect) => {
    calls.push({ email, redirect });
    if (email === 'nessuno@test.it') throw new Error('User not found');
  };
  auth.resetScreen(root, () => {}, 'nessuno@test.it');
  submit(root.querySelector('form'));
  await flush();
  const forUnknown = text(root.querySelector('.form-info'));
  auth.resetScreen(root, () => {}, 'anna@test.it');
  submit(root.querySelector('form'));
  await flush();
  assert.equal(text(root.querySelector('.form-info')), forUnknown);
  assert.equal(calls[1].redirect, `${location.origin}${location.pathname}`);
  byText(root, 'button', 'Torna all\'accesso').click();
  assert.match(text(root), /Accedi/);
});

test('the second factor accepts only six digit codes and clears a wrong one', async () => {
  api.listFactors = async () => [
    { id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'iPhone' },
    { id: 'f2', factor_type: 'totp', status: 'verified', friendly_name: 'iPad' },
  ];
  const verified = [];
  api.verifyTotp = async (id, code) => {
    verified.push([id, code]);
    if (code !== '654321') throw new Error('Codice non valido.');
  };
  let done = false;
  await auth.verifyScreen(root, () => (done = true));
  assert.equal(root.querySelectorAll('select option').length, 2);
  const code = root.querySelector('input[name="code"]');
  typeInto(code, '12ab');
  submit(root.querySelector('form'));
  await flush();
  assert.match(text(root.querySelector('.form-error')), /sei cifre/);
  typeInto(code, '123 456');
  submit(root.querySelector('form'));
  await flush();
  assert.equal(code.value, '');
  root.querySelector('select').value = 'f2';
  typeInto(code, '654321');
  submit(root.querySelector('form'));
  await flush();
  assert.deepEqual(verified, [['f1', '123456'], ['f2', '654321']]);
  assert.equal(done, true);
});

test('enrollment removes abandoned factors and refuses an unsafe QR image', async () => {
  const removed = [];
  api.listFactors = async () => [{ id: 'old', factor_type: 'totp', status: 'unverified' }, { id: 'ok', factor_type: 'totp', status: 'verified' }];
  api.unenrollFactor = async (id) => removed.push(id);
  api.enrollTotp = async () => ({ id: 'new', totp: { qr_code: 'https://evil.example/qr.svg', secret: 'ABCDEF' } });
  let verified = null;
  api.verifyTotp = async (id, code) => (verified = [id, code]);
  const flow = await auth.enrollFlow();
  assert.deepEqual(removed, ['old']);
  assert.equal(flow.form.querySelector('img'), null, 'QR esterno rifiutato');
  assert.match(text(flow.form), /ABCDEF/);
  typeInto(flow.form.querySelector('input[name="code"]'), '111222');
  submit(flow.form);
  assert.equal(await flow.verified, true);
  assert.deepEqual(verified, ['new', '111222']);

  api.listFactors = async () => [];
  api.enrollTotp = async () => ({ id: 'n2', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'XYZ' } });
  const second = await auth.enrollFlow();
  assert.ok(second.form.querySelector('img.qr'));
});

test('the new password must be strong and confirmed', async () => {
  let updated = null;
  api.updatePassword = async (p) => (updated = p);
  api.clearRecovery = () => {};
  let done = false;
  auth.newPasswordScreen(root, () => (done = true));
  const [pwd, confirm] = root.querySelectorAll('input[type="password"]');
  typeInto(pwd, 'debole');
  submit(root.querySelector('form'));
  await flush();
  assert.match(text(root.querySelector('.form-error')), /12 caratteri/);
  typeInto(pwd, 'Molto-Sicura-2026');
  typeInto(confirm, 'Molto-Sicura-2026');
  submit(root.querySelector('form'));
  await flush();
  assert.equal(updated, 'Molto-Sicura-2026');
  assert.equal(done, true);
});

test('runAuthGate walks the user through login, enrollment and into the app', async () => {
  const steps = ['login', 'enroll', 'ready'];
  let session = null;
  let assurance = { currentLevel: 'aal1' };
  api.getSession = async () => session;
  api.getAssurance = async () => assurance;
  api.listFactors = async () => [];
  api.isRecovery = () => false;
  api.signIn = async () => {
    session = { user: { id: ME } };
  };
  api.enrollTotp = async () => ({ id: 'f', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'S' } });
  api.verifyTotp = async () => {
    assurance = { currentLevel: 'aal2' };
  };
  const gate = auth.runAuthGate(root);
  await flush();
  assert.match(text(root), /Accedi/);
  typeInto(root.querySelector('input[type="email"]'), 'anna@test.it');
  typeInto(root.querySelector('input[type="password"]'), 'Corretta-Password1');
  submit(root.querySelector('form'));
  await flush(10);
  assert.match(text(root), /Attiva la verifica in due passaggi/);
  typeInto(root.querySelector('input[name="code"]'), '123456');
  submit(root.querySelector('form'));
  await gate;
  assert.deepEqual(steps.at(-1), 'ready');
});

test('runAuthGate shows an error screen when Supabase is unreachable and retries', async () => {
  let failures = 1;
  api.getSession = async () => {
    if (failures-- > 0) throw new Error('Connessione non riuscita.');
    return { user: { id: ME } };
  };
  api.getAssurance = async () => ({ currentLevel: 'aal2' });
  api.listFactors = async () => [{ factor_type: 'totp', status: 'verified' }];
  api.isRecovery = () => false;
  const gate = auth.runAuthGate(root);
  await flush();
  assert.match(text(root), /Connessione non riuscita/);
  byText(root, 'button', 'Riprova').click();
  await gate;
});

test('startApp refuses accounts that are not in the team', async () => {
  api.getSession = async () => ({ user: { id: ME, email: 'anna@test.it' } });
  api.myRole = async () => null;
  assert.equal(await app.startApp(root), false);
  assert.match(text(root), /Account non abilitato/);
});

test('startApp builds the shell, starts realtime and the router for a member', async () => {
  store.resetStore();
  api.getSession = async () => ({ user: { id: ME, email: 'anna@test.it' } });
  api.myRole = async () => 'admin';
  api.membersOverview = async () => members();
  api.listItems = async () => [];
  api.commentCounts = async () => new Map();
  api.setRealtimeAuth = async () => {};
  api.subscribeDb = () => () => {};
  api.joinPresence = () => ({ track() {}, leave() {} });
  api.onAuthChange = () => () => {};
  api.listRevisions = async () => [];
  assert.equal(await app.startApp(root), true);
  await flush(5);
  assert.ok(root.querySelector('.sidebar'));
  assert.match(text(root), /La board è vuota/);
  app.stopApp();
});

test('idle logout signs out after inactivity and resets on activity', async () => {
  let signedOut = 0;
  const stop = app.startIdleLogout(0.0005, async () => signedOut++);
  window.dispatchEvent(new window.Event('keydown'));
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(signedOut, 1);
  stop();
});
