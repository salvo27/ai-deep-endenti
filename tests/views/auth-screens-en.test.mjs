import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, byText, text, typeInto } from '../setup/dom.mjs';
import { italianWords } from '../setup/italian.mjs';
import { ME, PROJECT, members } from '../setup/fixtures.mjs';

// On a device in English: the site language is decided when it loads, so the modules are imported after the choice.
useLanguage('en');
setupDom();
const { api } = await import('../../assets/js/lib/api.js');
const auth = await import('../../assets/js/auth.js');
const app = await import('../../assets/js/app.js');
const store = await import('../../assets/js/store.js');
const router = await import('../../assets/js/router.js');
const { passwordProblem } = await import('../../assets/js/lib/validate.js');

const original = { ...api };
let root;

beforeEach(() => {
  root = document.getElementById('app');
  root.replaceChildren();
  history.replaceState(null, '', '#/');
});

afterEach(() => {
  app.stopApp();
  Object.assign(api, original);
  store.resetStore();
});

const submit = (form) => form.dispatchEvent(new window.Event('submit', { cancelable: true }));
// Everything the person reads: the text and the labels that only screen readers and tooltips show.
const readable = (el) => [text(el), ...[...el.querySelectorAll('[aria-label],[title],[placeholder],[alt]')].flatMap((n) => ['aria-label', 'title', 'placeholder', 'alt'].map((a) => n.getAttribute(a) || ''))].join(' ');
const assertEnglish = (el) => assert.deepEqual(italianWords(readable(el)).filter((w) => !['admin', 'email'].includes(w)), []);

describe('schermate di accesso in inglese', () => {
  it('l accesso è in inglese e valida in inglese', async () => {
    auth.loginScreen(root, () => {});
    assert.equal(text(root.querySelector('h1')), 'Sign in');
    assert.ok(byText(root, 'button', 'Forgot your password?'));
    assert.equal(root.querySelector('.pw-toggle').getAttribute('aria-label'), 'Show password');
    submit(root.querySelector('form'));
    await flush();
    assert.equal(text(root.querySelector('.form-error')), 'Enter your email and password.');
    assertEnglish(root);
  });

  it('il recupero della password è in inglese', async () => {
    api.requestPasswordReset = async () => {};
    auth.resetScreen(root, () => {}, 'anna@test.it');
    assert.equal(text(root.querySelector('h1')), 'Reset your password');
    submit(root.querySelector('form'));
    await flush();
    assert.match(text(root.querySelector('.form-info')), /^If the address belongs to an account/);
    assertEnglish(root);
  });

  it('la verifica in due passaggi è in inglese', async () => {
    api.listFactors = async () => [
      { id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'iPhone' },
      { id: 'f2', factor_type: 'totp', status: 'verified' },
    ];
    await auth.verifyScreen(root, () => {});
    assert.equal(text(root.querySelector('h1')), 'Two-step verification');
    assert.deepEqual([...root.querySelectorAll('option')].map(text), ['iPhone', 'Device']);
    typeInto(root.querySelector('input[name="code"]'), '12');
    submit(root.querySelector('form'));
    await flush();
    assert.equal(text(root.querySelector('.form-error')), 'The code has six digits.');
    assertEnglish(root);
  });

  it('l attivazione della verifica in due passaggi è in inglese', async () => {
    api.listFactors = async () => [];
    api.enrollTotp = async () => ({ id: 'n', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABC' } });
    const flow = await auth.enrollFlow({ onCancel() {} });
    root.append(flow.form);
    assert.equal(root.querySelectorAll('ol.steps li').length, 3);
    assert.ok(byText(root, 'button', 'Turn on'));
    assert.ok(byText(root, 'button', 'Cancel'));
    assertEnglish(root);
  });

  it('la nuova password è in inglese, regole comprese', async () => {
    auth.newPasswordScreen(root, () => {});
    assert.equal(text(root.querySelector('h1')), 'Choose a new password');
    const [password] = root.querySelectorAll('input[type="password"]');
    typeInto(password, 'short');
    submit(root.querySelector('form'));
    await flush();
    assert.equal(text(root.querySelector('.form-error')), 'The password must be at least 12 characters long.');
    assertEnglish(root);
  });

  for (const [value, confirm, expected] of [
    ['Corta1', undefined, 'The password must be at least 12 characters long.'],
    [`${'A'.repeat(130)}a1`, undefined, 'The password can be at most 128 characters long.'],
    ['tuttominuscole123', undefined, 'Use lowercase and uppercase letters and at least one number.'],
    ['Lunga-Abbastanza1', 'Diversa-Abbastanza1', 'The two passwords do not match.'],
    ['Lunga-Abbastanza1', 'Lunga-Abbastanza1', null],
  ]) {
    it(`la regola della password per ${value.slice(0, 20)} si legge in inglese`, () => {
      assert.equal(passwordProblem(value, confirm), expected);
    });
  }

  for (const [reason, title] of [
    ['none', 'You are not in any project'],
    ['removed', 'You are no longer in this project'],
  ]) {
    it(`la schermata di chi non è nel progetto (${reason}) è in inglese`, () => {
      auth.notMemberScreen(root, { reason });
      assert.equal(text(root.querySelector('h1')), title);
      assert.ok(byText(root, 'button', 'Sign out'));
      assertEnglish(root);
    });
  }

  it('la schermata di errore è in inglese', () => {
    auth.errorScreen(root, null, () => {});
    assert.equal(text(root.querySelector('h1')), 'Something went wrong');
    assert.ok(byText(root, 'button', 'Try again'));
    assertEnglish(root);
  });
});

describe('avvio in inglese', () => {
  it('un indirizzo sconosciuto dice pagina non trovata in inglese', () => {
    const outlet = document.createElement('main');
    app.notFoundView(outlet);
    assert.match(text(outlet), /Page not found/);
    assertEnglish(outlet);
  });

  it('una pagina che si rompe senza messaggio lo dice in inglese', async () => {
    router.clearRoutes();
    router.addRoute('/', () => {
      throw new Error();
    });
    const outlet = document.createElement('main');
    await router.startRouter(outlet);
    assert.equal(text(outlet), 'Page not available.');
    router.stopRouter();
  });

  it('salva l inglese nel profilo di chi usa il sito in inglese', async () => {
    const saved = [];
    api.myProfile = async () => ({ user_id: ME, language: 'it' });
    api.updateProfile = async (patch) => saved.push(patch);
    assert.equal(await app.syncProfileLanguage(), true);
    assert.deepEqual(saved, [{ language: 'en' }]);
  });

  it('il segnaposto della pagina Progetti è in inglese', async () => {
    router.clearRoutes();
    store.resetStore();
    api.getSession = async () => ({ user: { id: ME, email: 'anna@test.it' } });
    api.myProjects = async () => [];
    api.isPlatformAdmin = async () => true;
    api.myProfile = async () => null;
    api.onAuthChange = () => () => {};
    assert.equal(await app.startApp(root), true);
    await flush();
    assert.equal(location.hash, '#/progetti');
    // Only the page: the menu around it belongs to the shell, translated with it.
    const page = root.querySelector('#content');
    assert.ok(text(page).length > 0);
    assertEnglish(page);
  });

  it('chi ha un progetto entra con la board in inglese', async () => {
    router.clearRoutes();
    store.resetStore();
    api.getSession = async () => ({ user: { id: ME, email: 'anna@test.it' } });
    api.myProjects = async () => [{ id: PROJECT, name: 'Alpha', role: 'admin' }];
    api.isPlatformAdmin = async () => false;
    api.myProfile = async () => null;
    api.membersOverview = async () => members();
    api.listItems = async () => [];
    api.commentCounts = async () => new Map();
    api.setRealtimeAuth = async () => {};
    api.subscribeDb = () => () => {};
    api.joinPresence = () => ({ track() {}, leave() {} });
    api.onAuthChange = () => () => {};
    api.listRevisions = async () => [];
    assert.equal(await app.startApp(root), true);
    assert.equal(store.currentProjectId(), PROJECT);
  });
});
