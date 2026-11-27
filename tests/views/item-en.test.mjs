import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, text, byText, typeInto } from '../setup/dom.mjs';
import { ADVISOR, IDS, ME, OTHER, boardItems, item, members } from '../setup/fixtures.mjs';
import { italianLeftovers } from './ideas-editing.helpers.mjs';

// On a device in English: the language is decided when the site loads, so the modules are imported after the choice.
useLanguage('en');
setupDom();
const { api } = await import('../../assets/js/lib/api.js');
const store = await import('../../assets/js/store.js');
const router = await import('../../assets/js/router.js');
const app = await import('../../assets/js/app.js');
const components = await import('../../assets/js/views/components.js');
const actions = await import('../../assets/js/views/actions.js');
const { commentsPanel } = await import('../../assets/js/views/comments.js');

const AREAS = ['editor', 'common'];
const PHOTO = `data:image/jpeg;base64,${'A'.repeat(400)}`;
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
  document.body.querySelectorAll('dialog, .toasts').forEach((d) => d.remove());
  api.listComments = async () => [];
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

const dialog = () => document.querySelector('dialog');
const toasts = () => text(document.querySelector('.toasts'));

describe('pezzi comuni delle pagine in inglese', () => {
  it('chi non è più nel team si chiama Former member', () => {
    assert.equal(components.avatar('00000000-0000-4000-8000-0000000000ff').getAttribute('title'), 'Former member');
    assert.equal(components.avatar(OTHER).getAttribute('title'), 'Bruno');
  });

  it('una foto senza descrizione si chiama Photo, quella di una scheda porta il suo titolo', () => {
    assert.equal(components.photoView(PHOTO).getAttribute('alt'), 'Photo');
    const persona = item({ id: 'aaaaaaaa-0000-4000-8000-000000000001', kind: 'persona', title: 'Rita', data: { photo: PHOTO } });
    assert.equal(components.fieldValue('persona', { key: 'photo', type: 'image' }, PHOTO, persona).getAttribute('alt'), 'Photo: Rita');
    assert.equal(components.fieldValue('persona', { key: 'photo', type: 'image' }, PHOTO, item({ title: '' })).getAttribute('alt'), 'Photo');
  });

  it('il ritorno alla pagina superiore dice Back', () => {
    const header = components.pageHeader({ title: 'Ideas', back: { href: '#/idee' } });
    assert.equal(text(header.querySelector('.back-link')), 'Back');
  });

  it('un elemento che non c è più è segnalato come non disponibile', () => {
    assert.equal(text(components.itemLink(null)), 'Item not available');
  });

  it('una ricerca online si distingue dai colloqui', () => {
    const research = item({ kind: 'interview', data: { source: 'ricerca' } });
    const badge = components.sourceBadge(research);
    assert.equal(text(badge), 'Online research');
    assert.equal(badge.getAttribute('title'), 'It does not count as an interview: nobody was heard');
    assert.equal(components.sourceBadge(store.getItem(IDS.interview)), null);
  });

  it('i valori su una scala da 1 a 5 si leggono come "n out of 5"', () => {
    for (const n of [1, 3, 5]) assert.equal(components.fieldValue('interview', { key: 'x', type: 'scale' }, n).getAttribute('aria-label'), `${n} out of 5`);
  });

  it('il riquadro degli esempi dice che sono in sola lettura', () => {
    const banner = components.exampleBanner(store.getItem(IDS.experiment));
    assert.match(text(banner), /^Read-only example\. Shows how to fill in this part of the board\.$/);
  });

  it('la riga sotto il titolo dice versione e chi ha modificato, o che è un esempio', () => {
    assert.match(text(components.metaLine(store.getItem(IDS.idea))), /^Version 1 · edited by Anna \S/);
    const example = store.exampleIdeas()[0];
    assert.equal(text(components.metaLine(example)), 'Example');
  });

  it('chi è sulla stessa pagina è qui ora, o sta modificando', () => {
    store.state.online = [{ userId: OTHER, route: '/idea/x', editing: false }];
    assert.equal(text(components.onlineHere('/idea/x').lastChild), 'here now');
    store.state.online = [{ userId: OTHER, route: '/idea/x', editing: true }];
    assert.equal(text(components.onlineHere('/idea/x').lastChild), 'editing');
    assert.equal(components.onlineHere('/idea/y'), null);
  });

  it('caricamento, errore generico e schede hanno le parole inglesi', () => {
    assert.equal(text(components.loading()), 'Loading…');
    assert.equal(text(components.errorBox(null)), 'Something went wrong.');
    assert.equal(text(components.errorBox(new Error('Precise message.'))), 'Precise message.');
    assert.equal(components.tabs([['a', 'A']], 'a', (k) => `#${k}`).getAttribute('aria-label'), 'Sections');
  });
});

describe('azioni sulle schede in inglese', () => {
  it('un cambio di stato si salva con un messaggio in inglese', async () => {
    let saved = null;
    api.saveItem = async (args) => {
      saved = args;
      return { status: 'ok', item: item({ ...store.getItem(IDS.idea2), version: 2, status: args.snapshot.status }) };
    };
    await actions.changeStatus(store.getItem(IDS.idea2), 'scelta');
    assert.match(saved.message, /^Status: \S.* → \S/);
    assert.match(toasts(), /^Status: /);
  });

  it('archiviare un idea chiede conferma e avvisa delle schede collegate', async () => {
    api.deleteItem = async () => ({ status: 'ok', item: item({ ...store.getItem(IDS.idea2), version: 2, deleted_at: '2026-10-18T00:00:00Z' }) });
    const answer = actions.archiveWithConfirm(store.getItem(IDS.idea2), { backTo: '/idee' });
    await flush();
    assert.match(text(dialog().querySelector('h2')), /^Archive this \S+\?$/);
    assert.equal(
      text(dialog().querySelector('.modal-body')),
      '“Idea beta” will go to the trash. The history stays and you can restore it whenever you like. Its Lean Canvas, experiments and interviews will disappear from the lists until you restore it.',
    );
    byText(dialog(), 'button', 'Archive').click();
    assert.equal(await answer, true);
    assert.equal(toasts(), 'Moved to the trash.');
  });

  it('archiviare un altra scheda non parla di schede collegate', async () => {
    const answer = actions.archiveWithConfirm(store.getItem(IDS.experiment));
    await flush();
    assert.equal(text(dialog().querySelector('.modal-body')), '“I clienti pagano?” will go to the trash. The history stays and you can restore it whenever you like.');
    byText(dialog(), 'button', 'Cancel').click();
    assert.equal(await answer, false);
  });

  it('ripristinare dal cestino lo scrive nello storico e lo annuncia', async () => {
    let message = null;
    api.restoreItem = async (id, msg) => {
      message = msg;
      return { status: 'ok', item: item({ ...store.getItem(IDS.trashed), version: 2, deleted_at: null }) };
    };
    assert.equal(await actions.restoreWithToast(store.getItem(IDS.trashed)), true);
    assert.equal(message, 'Restored from the trash');
    assert.equal(toasts(), '“Idea archiviata” restored.');
  });
});

describe('pagina di una scheda in inglese', () => {
  it('mostra il tipo e l idea, le schede Details e Comments e le azioni', async () => {
    const body = await visit(`#/elemento/${IDS.experiment}`);
    assert.match(text(outlet.querySelector('.kind-eyebrow')), / for Idea alfa$/);
    assert.deepEqual([...outlet.querySelectorAll('.tab')].map((t) => text(t)), ['Details', 'Comments']);
    assert.equal(outlet.querySelector('select[aria-label="Status"]') !== null, true);
    for (const label of ['Critique', 'Edit', 'Versions']) assert.ok(byText(outlet, '.page-actions .btn', label), label);
    assert.ok(outlet.querySelector('.page-actions button[title="Archive"]'));
    assert.deepEqual(italianLeftovers(body, AREAS), []);
  });

  it('una scheda nel cestino lo dice e porta al cestino', async () => {
    store.applyItem(item({ ...store.getItem(IDS.experiment), deleted_at: '2026-10-18T10:00:00Z', version: 2 }));
    const body = await visit(`#/elemento/${IDS.experiment}`);
    assert.match(body, /This item is in the trash\. Go to the trash/);
  });

  it('una scheda che non esiste lo dice', async () => {
    assert.match(await visit('#/elemento/aaaaaaaa-0000-4000-8000-0000000000ff'), /Item not found\./);
  });

  it('la scheda Comments apre la discussione', async () => {
    const body = await visit(`#/elemento/${IDS.experiment}/commenti`);
    assert.match(body, /No comments yet\./);
    assert.ok(byText(outlet, 'button', 'Comment'));
  });
});

describe('commenti in inglese', () => {
  const ROWS = () => [
    { id: 'c0000000-0000-4000-8000-000000000001', item_id: IDS.idea, author_id: ME, body: 'Mine', created_at: '2026-10-17T10:00:00Z', edited_at: '2026-10-17T11:00:00Z' },
    { id: 'c0000000-0000-4000-8000-000000000002', item_id: IDS.canvas, author_id: OTHER, body: 'On the canvas', created_at: '2026-10-17T11:00:00Z' },
    { id: 'c0000000-0000-4000-8000-000000000003', item_id: IDS.idea, author_id: ME, body: 'An answer', created_at: '2026-10-17T12:00:00Z', ai_task: 'unknown_task' },
  ];

  it('il pannello invita a scrivere e dice quando non ci sono commenti', async () => {
    const panel = commentsPanel(store.getItem(IDS.idea));
    await flush(5);
    const area = panel.querySelector('textarea');
    assert.equal(area.getAttribute('placeholder'), 'Write a comment; use @ to tag someone');
    assert.equal(area.getAttribute('aria-label'), 'New comment');
    assert.equal(text(panel.querySelector('.comments')), 'No comments yet.');
    panel.cleanup();
  });

  it('i commenti dicono se sono stati modificati, su quale scheda e chi li ha scritti', async () => {
    api.listComments = async () => ROWS();
    const panel = commentsPanel(store.getItem(IDS.idea), { related: [IDS.canvas] });
    await flush(5);
    const [mine, other, ai] = panel.querySelectorAll('.comment');
    assert.match(text(mine), /\(edited\)/);
    assert.deepEqual([...mine.querySelectorAll('.comment-actions button')].map((b) => text(b)), ['Edit', 'Delete']);
    assert.match(text(other.querySelector('.comment-on')), /^on Lean Canvas: Idea alfa$/);
    assert.equal(text(ai.querySelector('.badge')), 'Claude · answer');
    assert.deepEqual(italianLeftovers(text(panel), AREAS), []);
    panel.cleanup();
  });

  it('modificare ha Save e Cancel, eliminare chiede conferma', async () => {
    let rows = ROWS();
    const log = [];
    api.listComments = async () => rows;
    api.deleteComment = async (id) => {
      log.push(id);
      rows = rows.filter((r) => r.id !== id);
    };
    const panel = commentsPanel(store.getItem(IDS.idea));
    document.body.append(panel);
    await flush(5);
    byText(panel, 'button', 'Edit').click();
    assert.ok(byText(panel, 'button', 'Save'));
    byText(panel, 'button', 'Cancel').click();
    byText(panel, 'button', 'Delete').click();
    await flush();
    assert.equal(text(dialog().querySelector('.modal-body')), 'Delete this comment?');
    byText(dialog(), 'button', 'Delete').click();
    await flush(5);
    assert.deepEqual(log, [ROWS()[0].id]);
    panel.cleanup();
    panel.remove();
  });

  it('un advisor può commentare', async () => {
    store.state.user = { id: ADVISOR };
    store.setMembers(members());
    const panel = commentsPanel(store.getItem(IDS.idea));
    typeInto(panel.querySelector('textarea'), 'Looks good');
    let added = null;
    api.addComment = async (id, body) => {
      added = body;
    };
    byText(panel, 'button', 'Comment').click();
    await flush(5);
    assert.equal(added, 'Looks good');
    panel.cleanup();
  });
});
