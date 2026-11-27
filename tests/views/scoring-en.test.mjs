import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, text, byText } from '../setup/dom.mjs';
import { italianWords } from '../setup/italian.mjs';
import { ME, OTHER, item, members } from '../setup/fixtures.mjs';

// Su un dispositivo in inglese: la lingua si decide quando il sito si carica, per questo i moduli arrivano dopo la scelta.
useLanguage('en');

let api;
let store;
let router;
let app;
let scoring;
let original;
let outlet;

// Dati inglesi, così il controllo dell'italiano rimasto non scatta sui nomi delle fixture.
const SENSORS = 'e1000000-0000-4000-8000-000000000001';
const PLATFORM = 'e1000000-0000-4000-8000-000000000002';
const DROPPED = 'e1000000-0000-4000-8000-000000000003';
const CRITERIA = 'e2000000-0000-4000-8000-000000000001';
const BRUNO_SCORES = 'e3000000-0000-4000-8000-000000000001';
const MY_SCORES = 'e3000000-0000-4000-8000-000000000002';
const PHOTO = 'e4000000-0000-4000-8000-000000000001';
const NEW_ID = 'e5000000-0000-4000-8000-000000000001';

const criteria = () => [
  { key: 'customer', label: 'Customer we know', description: '5 = we know one; 1 = nobody', weight: 3 },
  { key: 'market', label: 'Market', description: '', weight: 1 },
  { key: 'fun', label: 'Fun', description: '5 = great fun; 1 = boring', weight: 0 },
];

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  scoring = await import('../../assets/js/views/scoring.js');
  original = { ...api };
  router.clearRoutes();
  app.registerRoutes();
});

function board({ withCriteria = true, withMine = true } = {}) {
  store.applyItem(item({ id: SENSORS, kind: 'idea', title: 'Smart sensors', status: 'validazione', data: {} }));
  store.applyItem(item({ id: PLATFORM, kind: 'idea', title: 'Data platform', status: 'nuova', data: {} }));
  store.applyItem(item({ id: DROPPED, kind: 'idea', title: 'Old gadget', status: 'scartata', data: {} }));
  if (withCriteria) store.applyItem(item({ id: CRITERIA, kind: 'criteria', title: 'Scoring criteria', data: { criteria: criteria() } }));
  store.applyItem(item({ id: BRUNO_SCORES, kind: 'score', title: "Bruno's scores", created_by: OTHER, updated_by: OTHER, data: { scores: { [SENSORS]: { customer: 5, market: 2, fun: 3 } } } }));
  if (withMine) store.applyItem(item({ id: MY_SCORES, kind: 'score', title: "Anna's scores", created_by: ME, updated_by: ME, data: { scores: { [SENSORS]: { customer: 2, fun: 3 } } } }));
  store.applyItem(item({ id: 'e6000000-0000-4000-8000-000000000001', kind: 'interview', title: 'Call one', idea_id: SENSORS, status: 'fatta', data: { commitment: 'pilota' } }));
  store.applyItem(item({ id: 'e6000000-0000-4000-8000-000000000002', kind: 'experiment', title: 'Landing page', idea_id: SENSORS, status: 'concluso', data: {} }));
}

beforeEach(async () => {
  globalThis.__fakeSupabase.reset();
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  board();
  api.listRevisions = async () => [];
  outlet = document.createElement('main');
  document.body.append(outlet);
  document.body.querySelectorAll('dialog, .toasts').forEach((d) => d.remove());
  await router.startRouter(outlet, { fallback: app.notFoundView });
});

afterEach(() => {
  router.stopRouter();
  outlet.remove();
  delete window.matchMedia;
  Object.assign(api, original);
  history.replaceState(null, '', '#/');
});

async function visit(hash) {
  await router.render(hash);
  await flush(5);
  return text(outlet);
}

// Quello che si legge, anche dai lettori di schermo, senza gli avatar e i link agli elementi (altri moduli).
function readable(root) {
  const copy = root.cloneNode(true);
  copy.querySelectorAll('.avatar, .modal-header .icon-btn').forEach((el) => el.remove());
  const attributes = [...copy.querySelectorAll('[aria-label],[title],[placeholder]')].flatMap((el) =>
    ['aria-label', 'title', 'placeholder'].map((name) => el.getAttribute(name)).filter(Boolean),
  );
  return [copy.textContent, ...attributes].join(' ');
}
const leftovers = (root = outlet) => italianWords(readable(root));
const lastDialog = () => [...document.querySelectorAll('dialog')].at(-1);
// Di una finestra di conferma conta il titolo e il messaggio: i pulsanti Annulla vengono da lib/dom.js.
const confirmText = (dialog) => `${text(dialog.querySelector('h2'))} ${text(dialog.querySelector('.modal-body'))}`;
const rowOf = (title) => [...outlet.querySelectorAll('.matrix tbody tr')].find((tr) => text(tr.querySelector('th')).includes(title));
const chips = (el) => [...el.querySelectorAll('.ev-chip')].map(text);
const toasts = () => text(document.querySelector('.toasts'));

function choose(select, value) {
  select.value = value;
  select.dispatchEvent(new window.Event('change'));
}

describe('pagina Valutazione in inglese, media del team', () => {
  it('intestazione, schede, prove e celle parlano inglese', async () => {
    const body = await visit('#/valutazione');
    assert.equal(text(outlet.querySelector('h1')), 'Scoring');
    assert.match(body, /The team's average scores, weighted by the criteria\./);
    for (const label of ['Team average', 'My scores', 'Snapshots']) assert.ok(byText(outlet, '.page-actions a', label), label);
    assert.ok(byText(outlet, 'button', 'Save snapshot'));
    assert.ok(byText(outlet, 'button', 'Criteria'));
    assert.match(text(outlet.querySelector('label.check')), /^Also show discarded ideas$/);
    assert.match(body, /Under each idea: real conversations \(interviews done, not desk research\), concrete commitments \(ready for a pilot or to pay\) and experiments done\./);
    assert.deepEqual(chips(rowOf('Smart sensors')), ['1 conversation', '1 commitment', '1 experiment done']);
    assert.deepEqual(chips(rowOf('Data platform')), ['No conversations', '0 commitments', '0 experiments done']);
    assert.equal(text(outlet.querySelector('.matrix thead th')), 'Idea');
    assert.equal(text(outlet.querySelector('.matrix thead th:last-child')), 'Score');
    assert.equal(outlet.querySelector('.crit-btn').getAttribute('aria-label'), 'Customer we know, weight 3: show the description');
    const [customer] = rowOf('Smart sensors').querySelectorAll('.cell-btn');
    assert.equal(customer.getAttribute('aria-label'), "Customer we know: average 3.5, disagreement. Show each person's scores");
    const empty = rowOf('Data platform').querySelector('.score-cell');
    assert.equal(empty.getAttribute('title'), 'No scores');
    assert.equal(empty.querySelector('.cell-btn').getAttribute('aria-label'), "Customer we know: no scores. Show each person's scores");
    assert.equal(text(rowOf('Smart sensors').querySelector('.missing-btn')), '1 score missing');
    assert.equal(text(rowOf('Data platform').querySelector('.missing-btn')), '6 scores missing');
    assert.equal(rowOf('Old gadget'), undefined);
    assert.deepEqual(leftovers(), []);
  });

  it('i voti mancanti dicono chi manca e cosa', async () => {
    await visit('#/valutazione');
    rowOf('Data platform').querySelector('.missing-btn').click();
    let dialog = lastDialog();
    assert.equal(text(dialog.querySelector('h2')), 'Missing scores');
    assert.match(text(dialog), /These scores are still missing on "Data platform":/);
    assert.match(text(dialog), /Anna: no scores on this idea/);
    assert.match(text(dialog), /Everyone scores from the "My scores" tab\./);
    assert.ok(byText(dialog, '.modal-actions button', 'Close'));
    assert.deepEqual(leftovers(dialog), []);
    byText(dialog, '.modal-actions button', 'Close').click();
    rowOf('Smart sensors').querySelector('.missing-btn').click();
    dialog = lastDialog();
    assert.match(text(dialog), /Anna: Market/);
  });

  it('una cella mostra media, voti di ciascuno, chi non ha votato e il disaccordo', async () => {
    await visit('#/valutazione');
    const [customer, market] = rowOf('Smart sensors').querySelectorAll('.cell-btn');
    customer.click();
    let dialog = lastDialog();
    assert.equal(text(dialog.querySelector('h2')), 'Smart sensors · Customer we know');
    assert.match(text(dialog), /Average: 3\.5 out of 5/);
    assert.match(text(dialog), /Anna: 2/);
    assert.match(text(dialog), /Flagged as disagreement: the scores go from 2 to 5, 3 points apart\. The flag goes up from 2 points: worth talking about it\./);
    assert.deepEqual(leftovers(dialog), []);
    dialog.remove();
    market.click();
    dialog = lastDialog();
    assert.match(text(dialog), /Not scored yet: Anna\./);
    dialog.remove();
    rowOf('Data platform').querySelector('.cell-btn').click();
    assert.match(text(lastDialog()), /No scores\./);
  });

  it('un criterio mostra descrizione, peso e se la scala non è chiara', async () => {
    await visit('#/valutazione');
    const [, market, fun] = outlet.querySelectorAll('.crit-btn');
    market.click();
    let dialog = lastDialog();
    assert.match(text(dialog), /No description\./);
    assert.match(text(dialog), /Weight ×1\./);
    assert.match(text(dialog), /It doesn't say what 5 means and what 1 means\. Before scoring, ask whoever manages the criteria to write it\./);
    dialog.remove();
    fun.click();
    dialog = lastDialog();
    assert.match(text(dialog), /Weight ×0: it is scored but doesn't count towards the total\./);
    assert.deepEqual(leftovers(dialog), []);
  });

  it('le idee scartate si mostrano a richiesta e senza idee lo dice', async () => {
    await visit('#/valutazione?tutte=1');
    assert.ok(rowOf('Old gadget'));
    store.resetStore();
    store.state.user = { id: ME };
    store.setMembers(members());
    store.applyItem(item({ id: CRITERIA, kind: 'criteria', title: 'Scoring criteria', data: { criteria: criteria() } }));
    assert.match(await visit('#/valutazione'), /No ideas to score\./);
  });
});

describe('pagina Valutazione in inglese, i miei voti', () => {
  it('conta i voti mancanti, salva con titolo e messaggio inglesi', async () => {
    store.resetStore();
    store.state.user = { id: ME };
    store.state.me = members()[0];
    store.setMembers(members());
    board({ withMine: false });
    const body = await visit('#/valutazione?vista=miei');
    assert.match(body, /Your scores from 1 to 5\./);
    assert.match(body, /For ideas without conversations, the scores on the problem and the market are only guesses\./);
    assert.equal(text(outlet.querySelector('.matrix thead th:last-child')), 'Note');
    assert.equal(outlet.querySelector('.save-bar input').getAttribute('placeholder'), 'Note on your scores (optional)');
    assert.equal(rowOf('Smart sensors').querySelector('td:last-child input').getAttribute('aria-label'), 'Note on Smart sensors');
    assert.equal(text(outlet.querySelector('.missing-summary span')), '6 scores still to give on 2 ideas');
    assert.ok(byText(outlet, '.missing-summary button', 'Go to the first'));
    assert.deepEqual(leftovers(), []);

    const calls = [];
    api.createItem = async (args) => {
      calls.push(args);
      return item({ id: NEW_ID, kind: args.kind, title: args.title, data: args.data, created_by: ME });
    };
    const selects = [...outlet.querySelectorAll('.vote-select')];
    selects.forEach((select) => choose(select, '4'));
    assert.equal(text(outlet.querySelector('.missing-summary')), "You've scored every criterion of every idea.");
    byText(outlet, 'button', 'Save my scores').click();
    await flush(10);
    assert.equal(calls[0].title, "Anna's scores");
    assert.equal(calls[0].message, 'First scores');
    assert.match(toasts(), /Scores saved\./);
  });

  it('un solo voto mancante è al singolare, e aggiornare i voti usa il messaggio inglese', async () => {
    store.applyItem(item({ id: MY_SCORES, kind: 'score', title: "Anna's scores", version: 2, created_by: ME, updated_by: ME, data: { scores: { [SENSORS]: { customer: 2, market: 3, fun: 3 }, [PLATFORM]: { customer: 1, market: 1 } } } }));
    await visit('#/valutazione?vista=miei');
    assert.equal(text(outlet.querySelector('.missing-summary span')), '1 score still to give on 1 idea');
    const saves = [];
    api.saveItem = async (args) => {
      saves.push(args);
      return { status: 'ok', item: item({ ...store.getItem(MY_SCORES), version: 3, data: args.snapshot.data }) };
    };
    choose(rowOf('Data platform').querySelector('.vote-select.is-empty'), '2');
    byText(outlet, 'button', 'Save my scores').click();
    await flush(10);
    assert.equal(saves[0].message, 'Scores updated');
  });

  it('uscire con voti non salvati chiede conferma in inglese', async () => {
    await visit('#/valutazione?vista=miei');
    choose(outlet.querySelector('.vote-select'), '5');
    const attempt = router.render('#/idee');
    await flush();
    const dialog = lastDialog();
    assert.equal(confirmText(dialog), 'Unsaved scores You have unsaved scores. Leave anyway?');
    byText(dialog, 'button', 'Leave').click();
    await attempt;
  });
});

describe('pagina Valutazione in inglese, fotografie', () => {
  it('senza fotografie invita a salvarne una, il nome predefinito è numerato in inglese', async () => {
    const created = [];
    api.createItem = async (args) => {
      created.push(args);
      return item({ id: PHOTO, kind: 'scoresnap', title: args.title, data: args.data, created_by: ME, created_at: '2026-10-25T18:00:00Z' });
    };
    let body = await visit('#/valutazione?vista=fotografie');
    assert.match(body, /No snapshots\. Save one before changing scores or criteria: you can compare it with later ones\./);
    assert.match(body, /Each snapshot saves everyone's criteria, weights and scores at that moment\./);
    byText(outlet, 'button', 'Save snapshot').click();
    const dialog = lastDialog();
    assert.equal(text(dialog.querySelector('h2')), 'Save a snapshot');
    assert.match(text(dialog), /Saves everyone's criteria, weights and scores as they are now\./);
    assert.equal(text(dialog.querySelector('.field-label')), 'Name');
    assert.equal(dialog.querySelector('input').getAttribute('aria-label'), 'Snapshot name');
    assert.equal(dialog.querySelector('input').value, 'Snapshot 1');
    assert.deepEqual(leftovers(dialog), []);
    byText(dialog, '.modal-actions button', 'Save snapshot').click();
    await flush(10);
    assert.equal(created[0].title, 'Snapshot 1');
    assert.equal(created[0].message, 'Snapshot: Snapshot 1');
    assert.match(toasts(), /Snapshot saved\./);

    body = await visit('#/valutazione?vista=fotografie');
    assert.match(body, /Saved snapshots/);
    const heads = [...outlet.querySelectorAll('.table:not(.compare-table) thead th')].map(text).filter(Boolean);
    assert.deepEqual(heads, ['Name', 'Date', 'Saved by']);
    for (const label of ['Compare with now', 'Rename', 'Archive']) assert.ok(byText(outlet, '.row-actions .btn', label), label);
    assert.deepEqual([...outlet.querySelectorAll('.compare-pick .field-label')].map(text), ['Before', 'After']);
    assert.equal(text(outlet.querySelector('.compare-pick option')), 'Now');
  });

  it('la numerazione continua anche dopo fotografie salvate in italiano', async () => {
    store.applyItem(item({ id: 'e4000000-0000-4000-8000-000000000007', kind: 'scoresnap', title: 'Fotografia 7', data: {}, deleted_at: '2026-10-25T19:00:00Z' }));
    await visit('#/valutazione');
    byText(outlet, 'button', 'Save snapshot').click();
    assert.equal(lastDialog().querySelector('input').value, 'Snapshot 8');
    lastDialog().remove();
    store.applyItem(item({ id: 'e4000000-0000-4000-8000-000000000009', kind: 'scoresnap', title: 'Snapshot 11', data: {}, deleted_at: '2026-10-25T19:00:00Z' }));
    byText(outlet, 'button', 'Save snapshot').click();
    assert.equal(lastDialog().querySelector('input').value, 'Snapshot 12');
  });

  it('il confronto dice cosa è cambiato in criteri, voti, punteggi e posizioni', async () => {
    store.applyItem(
      item({
        id: PHOTO,
        kind: 'scoresnap',
        title: 'Before the meeting',
        created_by: ME,
        created_at: '2026-10-25T18:00:00Z',
        data: {
          criteria: [
            { key: 'customer', label: 'Customer', description: '', weight: 3 },
            { key: 'market', label: 'Market', description: '', weight: 2 },
            { key: 'speed', label: 'Speed', description: '', weight: 1 },
          ],
          ideas: [
            { id: SENSORS, title: 'Smart sensors', status: 'validazione' },
            { id: PLATFORM, title: 'Data platform', status: 'nuova' },
            { id: 'e1000000-0000-4000-8000-000000000009', title: 'Gone idea', status: 'nuova' },
          ],
          votes: { [OTHER]: { [SENSORS]: { customer: 5, market: 2 }, 'e1000000-0000-4000-8000-000000000009': { customer: 5, market: 5 } }, [ME]: { [SENSORS]: { customer: 2, market: 1 } } },
          names: { [ME]: 'Anna', [OTHER]: 'Bruno' },
        },
      }),
    );
    store.applyItem(item({ id: MY_SCORES, kind: 'score', title: "Anna's scores", version: 2, created_by: ME, updated_by: ME, data: { scores: { [SENSORS]: { customer: 4, fun: 3 }, [PLATFORM]: { customer: 5, market: 5 } } } }));
    const body = await visit('#/valutazione?vista=fotografie');
    const heads = [...outlet.querySelectorAll('.compare-table thead th')].map(text);
    assert.deepEqual(heads, ['Idea', 'Before', 'After', 'Points', 'Position']);
    assert.match(body, /Added "Fun" \(×0\)/);
    assert.match(body, /Removed "Speed" \(was ×1\)/);
    assert.match(body, /"Market": weight from ×2 to ×1/);
    assert.match(body, /"Customer" renamed to "Customer we know"/);
    assert.match(body, /Anna: 1 score changed, 3 new scores, 1 score removed/);
    assert.match(body, /Bruno: 1 new score, 2 scores removed/);
    const row = (title) => [...outlet.querySelectorAll('.compare-table tbody tr')].find((tr) => text(tr).includes(title));
    assert.match(text(row('Data platform')), /new$/);
    assert.match(text(row('Gone idea')), /^Gone idea1st · \d+-.*no longer scored$/);
    assert.match(text(row('Smart sensors')), /\d(st|nd|rd|th) · \d+/);
    assert.match(body, /Changed averages by idea/);
    assert.match(text(outlet.querySelector('.compare-means summary')), /^Smart sensors: \d criteri(on|a)$/);
    assert.deepEqual(leftovers(outlet.querySelector('.compare-table').parentElement.parentElement), []);
  });

  it('la stessa fotografia due volte, nessuna idea da confrontare, nessun cambiamento', async () => {
    store.applyItem(item({ id: PHOTO, kind: 'scoresnap', title: 'Empty', created_by: ME, data: { criteria: criteria(), ideas: [], votes: {}, names: {} } }));
    assert.match(await visit(`#/valutazione?vista=fotografie&da=${PHOTO}&a=${PHOTO}`), /You chose the same snapshot twice\./);
    store.resetStore();
    store.state.user = { id: ME };
    store.setMembers(members());
    store.applyItem(item({ id: CRITERIA, kind: 'criteria', title: 'Scoring criteria', data: { criteria: criteria() } }));
    store.applyItem(item({ id: PHOTO, kind: 'scoresnap', title: 'Empty', created_by: ME, data: { criteria: criteria(), ideas: [], votes: {}, names: {} } }));
    assert.match(await visit('#/valutazione?vista=fotografie'), /No ideas with scores to compare\./);
    store.applyItem(item({ id: SENSORS, kind: 'idea', title: 'Smart sensors', status: 'validazione', data: {} }));
    store.applyItem(item({ id: PHOTO, kind: 'scoresnap', title: 'Same', version: 2, created_by: ME, data: { criteria: criteria(), ideas: [{ id: SENSORS, title: 'Smart sensors', status: 'validazione' }], votes: { [ME]: { [SENSORS]: { customer: 3 } } }, names: { [ME]: 'Anna' } } }));
    store.applyItem(item({ id: MY_SCORES, kind: 'score', title: "Anna's scores", created_by: ME, updated_by: ME, data: { scores: { [SENSORS]: { customer: 3 } } } }));
    const body = await visit('#/valutazione?vista=fotografie');
    assert.match(body, /No changes to the criteria\./);
    assert.match(body, /No scores changed\./);
  });

  it('una fotografia si apre con il sottotitolo inglese, rinominarla usa testi inglesi', async () => {
    store.applyItem(item({ id: PHOTO, kind: 'scoresnap', title: 'Before the meeting', created_by: ME, created_at: '2026-10-25T18:00:00Z', data: { criteria: criteria(), ideas: [{ id: SENSORS, title: 'Smart sensors', status: 'validazione' }], votes: { [ME]: { [SENSORS]: { customer: 4 } } }, names: { [ME]: 'Anna' } } }));
    const body = await visit(`#/valutazione?foto=${PHOTO}`);
    assert.match(body, /Snapshot "Before the meeting" of .+, saved by Anna\. Criteria, weights and scores are those of that moment: tap a cell to see each person's scores\./);
    assert.match(body, /They're today's, not those of the day of the snapshot\./);
    assert.ok(byText(outlet, '.page-actions a', 'Compare with now'));
    let renamed = null;
    api.saveItem = async (args) => {
      renamed = args;
      return { status: 'ok', item: item({ ...store.getItem(PHOTO), version: 2, title: args.snapshot.title }) };
    };
    byText(outlet, '.page-actions button', 'Rename').click();
    const dialog = lastDialog();
    assert.equal(text(dialog.querySelector('h2')), 'Rename the snapshot');
    dialog.querySelector('input').value = 'After the meeting';
    byText(dialog, '.modal-actions button', 'Rename').click();
    await flush(10);
    assert.equal(renamed.message, 'Snapshot renamed to "After the meeting"');
    assert.match(toasts(), /Snapshot renamed\./);
  });

  it('una fotografia che non c è più lo dice', async () => {
    const body = await visit(`#/valutazione?foto=${SENSORS}`);
    assert.match(body, /Snapshot not found: it may have been archived\./);
    assert.ok(byText(outlet, 'a', 'All snapshots'));
    store.applyItem(item({ id: PHOTO, kind: 'scoresnap', title: 'Empty', created_by: ME, data: { criteria: criteria(), ideas: [], votes: {}, names: {} } }));
    assert.match(await visit(`#/valutazione?foto=${PHOTO}`), /No ideas in this snapshot\./);
  });
});

describe('criteri di valutazione in inglese', () => {
  it('senza criteri si creano quelli predefiniti con il messaggio inglese', async () => {
    store.resetStore();
    store.state.user = { id: ME };
    store.setMembers(members());
    board({ withCriteria: false });
    const created = [];
    api.createItem = async (args) => {
      created.push(args);
      return item({ id: CRITERIA, kind: 'criteria', title: args.title, data: args.data });
    };
    const body = await visit('#/valutazione');
    assert.match(body, /There are no scoring criteria yet\./);
    byText(outlet, 'button', 'Create the default criteria').click();
    await flush(10);
    assert.equal(created[0].title, 'Scoring criteria');
    assert.equal(created[0].message, 'Default criteria');
    assert.match(toasts(), /Criteria saved\./);
  });

  it('l editor dei criteri dà un nome a ogni campo e segnala le scale non chiare', async () => {
    await visit('#/valutazione');
    byText(outlet, 'button', 'Criteria').click();
    const dialog = lastDialog();
    assert.equal(text(dialog.querySelector('h2')), 'Scoring criteria');
    assert.match(text(dialog), /In the description write what 5 means and what 1 means, for example "5 = \.\.\.; 1 = \.\.\.": that way nobody reads the scale backwards\./);
    assert.deepEqual([...dialog.querySelectorAll('.criteria-table thead th')].map(text).filter(Boolean), ['Criterion', 'Description', 'Weight']);
    const first = dialog.querySelector('.criteria-table tbody tr');
    assert.deepEqual([...first.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label')), ['Criterion name', 'Description', 'Weight', 'Up', 'Down', 'Remove']);
    const second = dialog.querySelectorAll('.criteria-table tbody tr')[1];
    assert.equal(text(second.querySelector('.crit-warn')), "It doesn't say what 5 means and what 1 means.");
    const description = second.querySelector('input[aria-label="Description"]');
    description.value = '5 = huge';
    description.dispatchEvent(new window.Event('input'));
    assert.equal(text(second.querySelector('.crit-warn')), "It doesn't say what 1 means.");
    description.value = '1 = tiny';
    description.dispatchEvent(new window.Event('input'));
    assert.equal(text(second.querySelector('.crit-warn')), "It doesn't say what 5 means.");
    assert.match(text(dialog), /Weight ×0 = the criterion is scored but doesn't count towards the total\./);
    assert.equal(text(dialog.querySelector('.field-label')), 'Change message');
    assert.equal(dialog.querySelector('.field input').getAttribute('placeholder'), 'Why are the criteria changing? (optional)');
    byText(dialog, 'button', 'Add criterion').click();
    const added = [...dialog.querySelectorAll('.criteria-table tbody tr')].at(-1);
    assert.equal(added.querySelector('input').value, 'New criterion');
    assert.ok(byText(dialog, '.modal-actions button', 'Cancel'));
    assert.ok(byText(dialog, '.modal-actions button', 'Save the criteria'));
    assert.deepEqual(leftovers(dialog), []);
  });

  it('cambiare i pesi salva prima una fotografia con nome e avviso inglesi', async () => {
    await visit('#/valutazione');
    const created = [];
    api.createItem = async (args) => {
      created.push(args);
      return item({ id: PHOTO, kind: 'scoresnap', title: args.title, data: args.data });
    };
    let saved = null;
    api.saveItem = async (args) => {
      saved = args;
      return { status: 'ok', item: item({ ...store.getItem(CRITERIA), version: 2, data: args.snapshot.data }) };
    };
    byText(outlet, 'button', 'Criteria').click();
    const dialog = lastDialog();
    choose(dialog.querySelector('select[aria-label="Weight"]'), '5');
    byText(dialog, 'button', 'Save the criteria').click();
    await flush(10);
    assert.equal(created[0].title, 'Snapshot 1, before changing the criteria');
    assert.equal(created[0].message, 'Snapshot: Snapshot 1, before changing the criteria');
    assert.match(toasts(), /Before changing the criteria the snapshot "Snapshot 1, before changing the criteria" was saved\./);
    assert.equal(saved.message, 'Criteria updated');
  });

  it('se la fotografia automatica non riesce chiede in inglese se salvare comunque', async () => {
    await visit('#/valutazione');
    api.createItem = async () => {
      throw new Error('offline');
    };
    byText(outlet, 'button', 'Criteria').click();
    choose(lastDialog().querySelector('select[aria-label="Weight"]'), '5');
    byText(lastDialog(), 'button', 'Save the criteria').click();
    await flush(5);
    const confirm = lastDialog();
    assert.match(confirmText(confirm), /^Snapshot not saved The scores snapshot could not be saved before the change \(.+\)\. Without a snapshot you won't be able to compare the old ranking with the new one\. Save the criteria anyway\?$/);
    assert.ok(byText(confirm, 'button', 'Save the criteria anyway'));
  });

  it('l editor si apre anche da solo con le etichette inglesi', () => {
    let saved = null;
    scoring.criteriaEditor([{ key: 'customer', label: 'Customer', description: '5 = yes; 1 = no', weight: 2 }], async (rows, message) => {
      saved = { rows, message };
      return true;
    });
    const dialog = lastDialog();
    assert.equal(dialog.querySelector('.crit-warn').hidden, true);
    byText(dialog, 'button', 'Save the criteria').click();
    return flush(5).then(() => assert.equal(saved.rows[0].label, 'Customer'));
  });
});
