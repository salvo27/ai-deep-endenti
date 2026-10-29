import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, text, byText } from '../setup/dom.mjs';
import { ME, XSS, members } from '../setup/fixtures.mjs';

let api;
let store;
let router;
let app;
let original;
let outlet;
let calls;

const SITE = () => `${location.origin}${location.pathname}`;

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  original = { ...api };
  router.clearRoutes();
  app.registerRoutes();
});

const preview = (over = {}) => ({
  job: 'weekly-preview',
  configured: true,
  recipients: 2,
  empty: 1,
  optedOut: 1,
  preview: {
    subject: 'La tua settimana su ai-deep-endenti',
    hello: 'Ciao Anna,',
    intro: 'ecco il riepilogo della settimana.',
    sections: [
      { title: 'Da leggere', lines: [{ parts: [{ text: '5 messaggi non letti in chat', href: `${SITE()}#/chat` }] }] },
      { title: 'Nel team negli ultimi 7 giorni', lines: [{ parts: [{ text: 'Nuove idee: 1 (' }, { text: XSS, href: 'https://evil.example/#/idea/x' }, { text: ')' }] }] },
    ],
  },
  ...over,
});

beforeEach(async () => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  calls = [];
  api.membersOverview = async () => members();
  api.activitySince = async () => [];
  api.auditLog = async () => [];
  api.weeklyPreview = async () => {
    calls.push('preview');
    return preview();
  };
  api.sendWeeklyNow = async () => {
    calls.push('send');
    return { job: 'weekly-now', configured: true, sent: 2, empty: 1, optedOut: 1, already: 0, failed: 0 };
  };
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

const dialog = () => document.querySelector('dialog');

test('only the admin sees the weekly summary card on the members page', async () => {
  assert.match(await visit('#/membri'), /Riepilogo settimanale via email/);
  const demoted = members().map((m) => (m.user_id === ME ? { ...m, role: 'member' } : m));
  api.membersOverview = async () => demoted;
  store.setMembers(demoted);
  assert.doesNotMatch(await visit('#/membri'), /Riepilogo settimanale via email/);
  assert.deepEqual(calls, []);
});

test('the preview shows the admin version as text, with internal links only, and how many would receive it', async () => {
  await visit('#/membri');
  byText(outlet, 'button', 'Anteprima').click();
  await flush(5);
  const box = outlet.querySelector('.email-preview');
  assert.match(text(outlet), /Adesso lo riceverebbero 2 persone \(1 persona non ha nulla da leggere, 1 persona l'ha spento\)\./);
  assert.match(text(box), /Oggetto: La tua settimana su ai-deep-endenti/);
  assert.match(text(box), /Ciao Anna, ecco il riepilogo della settimana\./);
  assert.deepEqual([...box.querySelectorAll('h3')].map(text), ['Da leggere', 'Nel team negli ultimi 7 giorni']);
  assert.equal(byText(box, 'a', '5 messaggi non letti in chat').getAttribute('href'), '#/chat');
  assert.equal(box.querySelectorAll('a').length, 1, 'i link fuori dal sito restano testo');
  assert.equal(box.querySelector('img'), null);
  assert.ok(text(box).includes(XSS), 'il testo resta testo');

  api.weeklyPreview = async () => preview({ recipients: 0, empty: 3, optedOut: 0, preview: null });
  byText(outlet, 'button', 'Anteprima').click();
  await flush(5);
  assert.match(text(outlet), /Il tuo riepilogo sarebbe vuoto/);
});

test('sending now asks for confirmation with the number of people, then reports how it went', async () => {
  await visit('#/membri');
  byText(outlet, 'button', 'Manda a tutti ora').click();
  await flush(5);
  assert.match(text(dialog()), /Il riepilogo parte adesso per 2 persone/);
  byText(dialog(), 'button', 'Annulla').click();
  await flush(5);
  assert.deepEqual(calls, ['preview']);

  byText(outlet, 'button', 'Manda a tutti ora').click();
  await flush(5);
  byText(dialog(), 'button', 'Manda').click();
  await flush(5);
  assert.deepEqual(calls, ['preview', 'send'], 'l\'anteprima già caricata non si ricarica');
  assert.match(text(document.querySelector('.toasts')), /Riepilogo mandato a 2 persone\./);
});

test('with nobody to write to, or without email settings, nothing is sent and the admin is told why', async () => {
  api.weeklyPreview = async () => preview({ recipients: 0, preview: null });
  await visit('#/membri');
  byText(outlet, 'button', 'Manda a tutti ora').click();
  await flush(5);
  assert.equal(dialog(), null);
  assert.match(text(document.querySelector('.toasts')), /non partirebbe a nessuno/);

  api.weeklyPreview = async () => preview();
  api.sendWeeklyNow = async () => ({ job: 'weekly-now', configured: false, missing: ['BREVO_API_KEY'] });
  await visit('#/membri');
  byText(outlet, 'button', 'Manda a tutti ora').click();
  await flush(5);
  byText(dialog(), 'button', 'Manda').click();
  await flush(5);
  assert.match(text(document.querySelector('.toasts')), /Le email non sono configurate/);
});
