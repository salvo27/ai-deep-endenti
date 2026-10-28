import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, flush, byText, text, typeInto } from '../setup/dom.mjs';
import { ADVISOR, IDS, ME, OTHER, boardItems, item, members } from '../setup/fixtures.mjs';

const MY_SCORE = 'a7777777-7777-4777-8777-777777777777';
const ADVISOR_SCORE = 'a7777777-7777-4777-8777-77777777777c';
const PHOTO = 'a8888888-8888-4888-8888-888888888888';
const OLD_PHOTO = 'a8888888-8888-4888-8888-888888888880';
const GONE = 'a1111111-1111-4111-8111-111111111119';

let api;
let store;
let router;
let app;
let original;
let outlet;

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

beforeEach(async () => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  boardItems().forEach((i) => store.applyItem(i));
  api.listRevisions = async () => [];
  api.membersOverview = async () => members();
  outlet = document.createElement('main');
  document.body.append(outlet);
  document.body.querySelectorAll('dialog').forEach((d) => d.remove());
  await router.startRouter(outlet, { fallback: app.notFoundView });
});

afterEach(() => {
  router.stopRouter();
  outlet.remove();
  delete window.matchMedia;
  Object.assign(api, original);
});

async function visit(hash) {
  await router.render(hash);
  await flush(5);
  return text(outlet);
}

const rowOf = (title) => [...outlet.querySelectorAll('.matrix tbody tr')].find((tr) => text(tr.querySelector('th')).includes(title));
const lastDialog = () => [...document.querySelectorAll('dialog')].at(-1);
const chips = (el) => [...el.querySelectorAll('.ev-chip')].map(text);

function choose(select, value) {
  select.value = value;
  select.dispatchEvent(new window.Event('change'));
}

function myVotes(scores, version = 1) {
  store.applyItem(item({ id: MY_SCORE, kind: 'score', title: 'Voti di Anna', version, created_by: ME, updated_by: ME, data: { scores } }));
}

// Sulla idea alfa: l'intervista delle fixture (fatta, pilota) più una con pagamento; ricerca e intervista da fare non contano.
function addEvidence() {
  const interview = (n, over) => item({ id: `b1000000-0000-4000-8000-00000000000${n}`, kind: 'interview', title: `Intervista ${n}`, idea_id: IDS.idea, status: 'fatta', ...over });
  store.applyItem(interview(1, { data: { commitment: 'pagamento' } }));
  store.applyItem(interview(2, { data: { source: 'ricerca', commitment: 'pilota' } }));
  store.applyItem(interview(3, { status: 'da_fare', data: {} }));
  store.applyItem(item({ id: 'b2000000-0000-4000-8000-000000000001', kind: 'experiment', title: 'Prova conclusa', idea_id: IDS.idea, status: 'concluso', data: {} }));
}

function photoItem(votes) {
  return item({
    id: PHOTO,
    kind: 'scoresnap',
    title: 'Fotografia 1',
    data: {
      criteria: [{ key: 'cliente', label: 'Cliente', description: 'Lo conosciamo', weight: 3 }],
      ideas: [
        { id: IDS.idea, title: 'Idea alfa', status: 'validazione' },
        { id: GONE, title: 'Idea sparita', status: 'nuova' },
      ],
      votes,
      names: { [ME]: 'Anna', [OTHER]: 'Bruno' },
    },
  });
}

function fakeMedia(matches) {
  const listeners = new Set();
  return {
    matches,
    listeners,
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
    set(value) {
      this.matches = value;
      listeners.forEach((fn) => fn({ matches: value }));
    },
  };
}

test('every idea shows conversations, concrete commitments and concluded experiments in the team view, my votes and a photo', async () => {
  addEvidence();
  await visit('#/valutazione');
  const alfa = rowOf('Idea alfa');
  assert.deepEqual(chips(alfa), ['2 conversazioni', '2 impegni', '1 esperimento concluso'], 'senza source è una conversazione; ricerca e da fare no');
  assert.equal(alfa.querySelector('.ev-chip.is-warn'), null);
  const warning = rowOf('Idea beta').querySelector('.ev-chip.is-warn');
  assert.equal(text(warning), 'Nessuna conversazione');
  assert.match(text(outlet), /impegni concreti \(disponibili a un pilota o a pagare\)/, 'la legenda dice cosa conta');

  await visit('#/valutazione?vista=miei');
  assert.match(text(rowOf('Idea alfa').querySelector('.evidence')), /2 conversazioni/);
  assert.equal(text(rowOf('Idea beta').querySelector('.ev-chip.is-warn')), 'Nessuna conversazione');
  assert.match(text(outlet.querySelector('.evidence-hint')), /Per le idee senza conversazioni, i voti sul problema e sul mercato sono solo ipotesi/);

  store.applyItem(item({ id: 'b1000000-0000-4000-8000-000000000009', kind: 'interview', title: 'Studio Verdi', idea_id: IDS.idea2, status: 'analizzata', data: {} }));
  await visit('#/valutazione?vista=miei');
  assert.equal(outlet.querySelector('.evidence-hint'), null, 'con almeno una conversazione per idea l\'avviso sparisce');

  store.applyItem(photoItem({ [OTHER]: { [IDS.idea]: { cliente: 5 }, [GONE]: { cliente: 3 } } }));
  await visit(`#/valutazione?foto=${PHOTO}`);
  assert.match(text(rowOf('Idea alfa').querySelector('.evidence')), /2 conversazioni/);
  assert.equal(rowOf('Idea sparita').querySelector('.evidence'), null, 'niente prove per un\'idea che non esiste più');
  assert.match(text(outlet), /Sono quelli di adesso, non del giorno della fotografia/);
});

test('the team view marks ideas with missing votes and says who is missing what', async () => {
  myVotes({ [IDS.idea]: { cliente: 2 } });
  store.applyItem(item({ id: ADVISOR_SCORE, kind: 'score', title: 'Voti di Chiara', created_by: ADVISOR, updated_by: ADVISOR, data: { scores: { [IDS.idea]: { cliente: 4 } } } }));
  await visit('#/valutazione');

  const alfa = rowOf('Idea alfa').querySelector('.missing-btn');
  assert.equal(text(alfa), 'Manca 1 voto', 'Anna non ha votato Mercato; Chiara è advisor e non vota più');
  alfa.click();
  let dialog = lastDialog();
  assert.match(text(dialog), /Su «Idea alfa» mancano ancora questi voti/);
  assert.match(text(dialog), /Anna: Mercato/);
  assert.doesNotMatch(text(dialog), /Bruno|Chiara/);
  byText(dialog, 'button', 'Chiudi').click();

  const beta = rowOf('Idea beta').querySelector('.missing-btn');
  assert.equal(text(beta), 'Mancano 4 voti');
  beta.click();
  dialog = lastDialog();
  assert.match(text(dialog), /Anna: nessun voto su questa idea/);
  assert.match(text(dialog), /Bruno: nessun voto su questa idea/);

  myVotes({ [IDS.idea]: { cliente: 2, mercato: 3 } }, 2);
  await visit('#/valutazione');
  assert.equal(rowOf('Idea alfa').querySelector('.missing-btn'), null, 'con tutti i voti il segnale sparisce');
});

test('my votes highlight empty selects, count what is missing and jump to the first one', async () => {
  myVotes({ [IDS.idea]: { cliente: 2 } });
  await visit('#/valutazione?vista=miei');
  assert.equal(outlet.querySelectorAll('.vote-select').length, 4);
  assert.equal(outlet.querySelectorAll('.vote-select.is-empty').length, 3);
  const summary = outlet.querySelector('.save-bar .missing-summary');
  assert.match(text(summary), /Ti mancano 3 voti su 2 idee/);

  const mercato = outlet.querySelector('[aria-label="Mercato, Idea alfa"]');
  choose(mercato, '3');
  assert.equal(mercato.classList.contains('is-empty'), false);
  assert.ok(mercato.classList.contains('v3'));
  assert.match(text(summary), /Ti mancano 2 voti su 1 idea/);

  byText(summary, 'button', 'Vai al primo').click();
  assert.equal(document.activeElement, outlet.querySelector('[aria-label="Cliente, Idea beta"]'));

  choose(outlet.querySelector('[aria-label="Cliente, Idea beta"]'), '4');
  choose(outlet.querySelector('[aria-label="Mercato, Idea beta"]'), '1');
  assert.match(text(summary), /Hai votato tutti i criteri di tutte le idee/);
  choose(mercato, '');
  assert.ok(mercato.classList.contains('is-empty'), 'togliere un voto lo evidenzia di nuovo');
  assert.match(text(summary), /Ti manca 1 voto su 1 idea/);
});

test('on a phone my votes become one card per idea and switching width keeps unsaved votes', async () => {
  const media = fakeMedia(true);
  window.matchMedia = () => media;
  await visit('#/valutazione?vista=miei');
  assert.equal(outlet.querySelector('.matrix'), null);
  const cards = outlet.querySelectorAll('.vote-card');
  assert.equal(cards.length, 2);
  assert.match(text(cards[0].querySelector('h2')), /Idea alfa/);
  assert.deepEqual(chips(cards[0]), ['1 conversazione', '1 impegno', '0 esperimenti conclusi']);
  assert.deepEqual(chips(cards[1])[0], 'Nessuna conversazione');
  const row = cards[0].querySelector('.vote-row');
  assert.equal(text(row.querySelector('.vote-row-label')), 'Cliente×3');
  assert.equal(text(row.querySelector('.vote-row-desc')), 'Lo conosciamo', 'la descrizione è sempre visibile');
  assert.ok(row.querySelector('select[aria-label="Cliente, Idea alfa"]'));
  assert.ok(cards[1].querySelector('textarea[aria-label="Nota su Idea beta"]'), 'la nota sta in fondo alla scheda');

  choose(cards[1].querySelector('[aria-label="Cliente, Idea beta"]'), '4');
  typeInto(cards[1].querySelector('textarea'), 'Da approfondire');
  const save = byText(outlet, 'button', 'Salva i miei voti');
  assert.equal(save.disabled, false);
  assert.match(text(outlet.querySelector('.missing-summary')), /Ti mancano 3 voti su 2 idee/);

  media.set(false);
  assert.ok(outlet.querySelector('.matrix'), 'più largo torna la tabella');
  assert.equal(outlet.querySelector('[aria-label="Cliente, Idea beta"]').value, '4');
  assert.equal(outlet.querySelector('[aria-label="Nota su Idea beta"]').value, 'Da approfondire');
  assert.equal(byText(outlet, 'button', 'Salva i miei voti').disabled, false);

  media.set(true);
  assert.equal(outlet.querySelectorAll('.vote-card').length, 2);
  let created = null;
  api.createItem = async (args) => {
    created = args;
    return item({ id: MY_SCORE, kind: 'score', title: args.title, data: args.data });
  };
  byText(outlet, 'button', 'Salva i miei voti').click();
  await flush(10);
  assert.deepEqual(created.data.scores, { [IDS.idea2]: { cliente: 4 } });
  assert.equal(created.data.notes[IDS.idea2], 'Da approfondire');

  await visit('#/valutazione');
  assert.equal(media.listeners.size, 0, 'lasciando la pagina non si ascolta più la larghezza');
});

test('criterion headers and cells show descriptions and votes with a tap instead of hover', async () => {
  myVotes({ [IDS.idea]: { cliente: 2 } });
  await visit('#/valutazione');
  assert.doesNotMatch(text(outlet.querySelector('.page-subtitle')), /passando sopra/);
  assert.match(text(outlet.querySelector('.page-subtitle')), /Tocca una cella/);

  outlet.querySelector('.crit-btn').click();
  let dialog = lastDialog();
  assert.match(text(dialog), /Lo conosciamo/);
  assert.match(text(dialog), /Peso ×3/);
  assert.match(text(dialog), /Non dice cosa vuol dire 5 e cosa vuol dire 1/);
  byText(dialog, 'button', 'Chiudi').click();

  rowOf('Idea alfa').querySelector('.cell-btn').click();
  dialog = lastDialog();
  assert.match(text(dialog), /Idea alfa · Cliente/);
  assert.match(text(dialog), /Media: 3\.5 su 5/);
  assert.match(text(dialog), /Bruno: 5/);
  assert.match(text(dialog), /Anna: 2/);
  assert.match(text(dialog), /disaccordo: i voti vanno da 2 a 5, cioè distano 3 punti/);
  byText(dialog, 'button', 'Chiudi').click();

  rowOf('Idea beta').querySelector('.cell-btn').click();
  dialog = lastDialog();
  assert.match(text(dialog), /Nessun voto/);
  assert.match(text(dialog), /Non hanno ancora votato: (Bruno, Anna|Anna, Bruno)/);

  store.applyItem(photoItem({ [OTHER]: { [IDS.idea]: { cliente: 5 } }, [ME]: { [IDS.idea]: { cliente: 1 } } }));
  await visit(`#/valutazione?foto=${PHOTO}`);
  assert.match(text(outlet.querySelector('.page-subtitle')), /tocca una cella/);
  rowOf('Idea alfa').querySelector('.cell-btn').click();
  dialog = lastDialog();
  assert.match(text(dialog), /Bruno: 5/);
  assert.match(text(dialog), /Anna: 1/);
  assert.match(text(dialog), /Segnalata come disaccordo/);

  await visit('#/valutazione?vista=miei');
  assert.doesNotMatch(text(outlet.querySelector('.page-subtitle')), /passando sopra/);
  assert.ok(outlet.querySelector('.matrix .crit-btn'), 'anche nei miei voti il criterio si apre con un tocco');
});

test('the criteria editor asks what 5 and 1 mean and flags descriptions that do not say it', async () => {
  await visit('#/valutazione');
  byText(outlet, 'button', 'Criteri').click();
  const dialog = lastDialog();
  const descriptions = dialog.querySelectorAll('input[aria-label="Descrizione"]');
  assert.equal(descriptions[0].getAttribute('placeholder'), '5 = ...; 1 = ...');
  assert.match(text(dialog), /scrivi cosa vuol dire 5 e cosa vuol dire 1/);
  assert.equal(dialog.querySelectorAll('tr.is-unclear').length, 2);

  typeInto(descriptions[0], '5 = lo conosciamo di persona; 1 = non sappiamo chi sia');
  assert.equal(dialog.querySelectorAll('tr.is-unclear').length, 1);
  assert.equal(descriptions[0], dialog.querySelectorAll('input[aria-label="Descrizione"]')[0], 'scrivere non ridisegna la tabella');

  typeInto(descriptions[1], '5 = mercato grande');
  assert.match(text(descriptions[1].closest('td')), /Non dice cosa vuol dire 1/);
  typeInto(descriptions[1], 'Da 1 (nessuno paga) a 5 (pagano subito)');
  assert.equal(dialog.querySelectorAll('tr.is-unclear').length, 0);
});

test('changing weights saves a photo before the criteria, labels and order alone do not', async () => {
  const calls = [];
  api.createItem = async (args) => {
    calls.push(['photo', args]);
    return item({ id: PHOTO, kind: 'scoresnap', title: args.title, data: args.data });
  };
  api.saveItem = async (args) => {
    calls.push(['criteria', args]);
    const current = store.getItem(IDS.criteria);
    return { status: 'ok', item: item({ ...current, version: current.version + 1, data: args.snapshot.data }) };
  };
  store.applyItem(item({ id: OLD_PHOTO, kind: 'scoresnap', title: 'Fotografia 3', data: {} }));
  await visit('#/valutazione');

  byText(outlet, 'button', 'Criteri').click();
  let dialog = lastDialog();
  choose(dialog.querySelectorAll('select[aria-label="Peso"]')[1], '2');
  byText(dialog, 'button', 'Salva i criteri').click();
  await flush(10);
  assert.deepEqual(calls.map(([what]) => what), ['photo', 'criteria']);
  const [, photo] = calls[0];
  assert.equal(photo.kind, 'scoresnap');
  assert.equal(photo.title, 'Fotografia 4, prima di cambiare i criteri');
  assert.equal(photo.message, 'Fotografia: Fotografia 4, prima di cambiare i criteri');
  assert.deepEqual(photo.data.criteria.map((c) => [c.key, c.weight]), [['cliente', 3], ['mercato', 1]], 'la fotografia ha i pesi di prima');
  assert.deepEqual(photo.data.votes[OTHER][IDS.idea], { cliente: 5, mercato: 2 });
  assert.equal(calls[1][1].snapshot.data.criteria[1].weight, 2);
  assert.match(text(document.querySelector('.toasts')), /Prima di cambiare i criteri è stata salvata la fotografia «Fotografia 4, prima di cambiare i criteri»/);

  calls.length = 0;
  byText(outlet, 'button', 'Criteri').click();
  dialog = lastDialog();
  typeInto(dialog.querySelector('input[aria-label="Nome del criterio"]'), 'Cliente vero');
  typeInto(dialog.querySelector('input[aria-label="Descrizione"]'), '5 = lo conosciamo; 1 = mai visto');
  dialog.querySelector('[aria-label="Giù"]').click();
  byText(dialog, 'button', 'Salva i criteri').click();
  await flush(10);
  assert.deepEqual(calls.map(([what]) => what), ['criteria'], 'nomi, descrizioni e ordine non cambiano la classifica');

  byText(outlet, 'button', 'Salva fotografia').click();
  assert.equal(lastDialog().querySelector('input').value, 'Fotografia 5', 'la fotografia automatica conta nella numerazione');
  byText(lastDialog(), 'button', 'Annulla').click();

  calls.length = 0;
  store.applyItem(item({ id: IDS.score, kind: 'score', title: 'Voti di Bruno', version: 2, created_by: OTHER, updated_by: OTHER, data: { scores: {} } }));
  byText(outlet, 'button', 'Criteri').click();
  dialog = lastDialog();
  byText(dialog, 'button', 'Aggiungi criterio').click();
  byText(dialog, 'button', 'Salva i criteri').click();
  await flush(10);
  assert.deepEqual(calls.map(([what]) => what), ['criteria'], 'senza voti non serve la fotografia');
});

test('if the automatic photo fails, people choose whether to save the criteria anyway', async () => {
  api.createItem = async () => {
    throw new Error('Rete assente');
  };
  let saved = 0;
  api.saveItem = async (args) => {
    saved += 1;
    return { status: 'ok', item: item({ ...store.getItem(IDS.criteria), version: 2, data: args.snapshot.data }) };
  };
  await visit('#/valutazione');
  byText(outlet, 'button', 'Criteri').click();
  const editor = lastDialog();
  byText(editor, 'button', 'Aggiungi criterio').click();

  byText(editor, 'button', 'Salva i criteri').click();
  await flush(10);
  let question = lastDialog();
  assert.notEqual(question, editor);
  assert.match(text(question), /Non è stato possibile salvare una fotografia dei voti prima del cambio \(Rete assente\)/);
  byText(question, 'button', 'Annulla').click();
  await flush(10);
  assert.equal(saved, 0);
  assert.ok(editor.isConnected, 'l\'editor resta aperto con le modifiche');

  byText(editor, 'button', 'Salva i criteri').click();
  await flush(10);
  question = lastDialog();
  byText(question, 'button', 'Salva comunque i criteri').click();
  await flush(10);
  assert.equal(saved, 1);
  assert.equal(editor.isConnected, false);
});
