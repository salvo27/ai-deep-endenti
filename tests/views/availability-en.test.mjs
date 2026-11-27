import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, text, byText } from '../setup/dom.mjs';
import { italianWords } from '../setup/italian.mjs';
import { ME, OTHER, ADVISOR, item, members } from '../setup/fixtures.mjs';

// Su un dispositivo in inglese: la lingua si decide quando il sito si carica, per questo i moduli arrivano dopo la scelta.
useLanguage('en');

let api;
let store;
let router;
let app;
let av;
let format;
let original;
let outlet;
let monday;
let next;

const MINE = 'aaaaaaaa-0000-4000-8000-000000000001';
const THEIRS = 'aaaaaaaa-0000-4000-8000-000000000002';
const NEW_ID = 'aaaaaaaa-0000-4000-8000-000000000003';
const ADVISOR_ITEM = 'aaaaaaaa-0000-4000-8000-000000000004';
const TEAM = '#/squadra/disponibilita';
const MINE_VIEW = '#/squadra/disponibilita?vista=miei';

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  av = await import('../../assets/js/availability.js');
  format = await import('../../assets/js/lib/format.js');
  original = { ...api };
  router.clearRoutes();
  app.registerRoutes();
});

beforeEach(async () => {
  globalThis.__fakeSupabase.reset();
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  localStorage.clear();
  api.listRevisions = async () => [];
  monday = av.thisMonday();
  next = av.addDays(monday, 7);
  outlet = document.createElement('main');
  document.body.querySelectorAll('dialog, .toasts').forEach((d) => d.remove());
  await router.startRouter(outlet, { fallback: app.notFoundView });
});

afterEach(() => {
  router.stopRouter();
  Object.assign(api, original);
  outlet.remove();
  history.replaceState(null, '', '#/');
});

async function visit(hash) {
  await router.render(hash);
  await flush(5);
  return text(outlet);
}

// Quello che si legge, anche dai lettori di schermo, senza le parti di altri moduli (avatar, finestre).
function readable(root, skip = ['.avatar']) {
  const copy = root.cloneNode(true);
  copy.querySelectorAll(skip.join(',')).forEach((el) => el.remove());
  const attributes = [...copy.querySelectorAll('[aria-label],[title],[placeholder],[abbr]')].flatMap((el) =>
    ['aria-label', 'title', 'placeholder', 'abbr'].map((name) => el.getAttribute(name)).filter(Boolean),
  );
  return [copy.textContent, copy.getAttribute?.('aria-label'), ...attributes].filter(Boolean).join(' ');
}
const leftovers = (root) => italianWords(readable(root));

const cell = (day, hour) => outlet.querySelector(`.av-cell[data-day="${day}"][data-hour="${hour}"]`);
function availability(id, userId, data, over = {}) {
  store.applyItem(item({ id, kind: 'availability', title: 'Impegni', created_by: userId, updated_by: userId, data, updated_at: new Date().toISOString(), ...over }));
}
const mine = (data, over) => availability(MINE, ME, data, over);
const bruno = (data, over) => availability(THEIRS, OTHER, data, over);
const chiara = (data, over) => availability(ADVISOR_ITEM, ADVISOR, data, over);

const weekButton = (label) => outlet.querySelector(`button[aria-label="${label}"]`);
const weekTitle = () => text(outlet.querySelector('.av-week-title strong'));
const person = (name) => [...outlet.querySelectorAll('.av-person')].find((b) => text(b.querySelector('.av-person-name')).replace(/ · advisor$/, '') === name);
const personState = (name) => text(person(name).querySelector('.av-person-state'));
const personMark = (name) => text(person(name).querySelector('.av-person-mark'));
const best = () => [...outlet.querySelectorAll('.av-best li')].map((li) => [...li.children].map(text));
const bestCard = () => text(outlet.querySelector('.av-best-card'));
const notCounted = () => text([...outlet.querySelectorAll('.av-best-card p')].find((p) => text(p).startsWith('Not counting')));
const detail = () => text(outlet.querySelector('.av-detail'));
const saveButton = () => byText(outlet, 'button', 'Save my busy hours');
const saveStatus = () => text(outlet.querySelector('.save-bar [role="status"]'));
const scopeButton = (label) => [...outlet.querySelectorAll('.av-scope button')].find((b) => text(b) === label);
const note = () => text(outlet.querySelector('.av-note p'));
const toasts = () => text(document.querySelector('.toasts'));
const tap = (day, hour) => cell(day, hour).click();

async function nextWeek(times = 1) {
  for (let i = 0; i < times; i += 1) weekButton('Next week').click();
  await flush(1);
}

describe('pagina Disponibilità in inglese, orari della squadra', () => {
  it('le due viste hanno nomi inglesi e indirizzi invariati', async () => {
    await visit(TEAM);
    const views = outlet.querySelector('nav.subtabs');
    assert.equal(views.getAttribute('aria-label'), 'View');
    assert.deepEqual([...views.querySelectorAll('.tab')].map(text), ['Team times', 'My busy hours']);
    assert.deepEqual([...views.querySelectorAll('.tab')].map((a) => a.getAttribute('href')), [TEAM, MINE_VIEW]);
  });

  it('senza impegni segnati lo dice in inglese e nessuno conta', async () => {
    await visit(TEAM);
    assert.equal(cell(0, 8).getAttribute('aria-label').replace(/, already past$/, ''), `Monday ${av.shortDate(monday)} from 8:00 to 9:00: nobody has marked their busy hours`);
    assert.equal(text(outlet.querySelector('.av-corner')), 'Hour');
    assert.deepEqual([...outlet.querySelectorAll('.av-team thead .av-day')].map(text), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    assert.equal(outlet.querySelector('.av-team thead th:nth-child(2)').getAttribute('abbr'), 'Monday');
    assert.match(bestCard(), /^Best times/);
    assert.match(bestCard(), /None of the chosen people has marked their busy hours for this week\./);
    assert.equal(notCounted(), "Not counting: Anna (hasn't marked their busy hours), Bruno (hasn't marked their busy hours).");
    for (const name of ['Anna', 'Bruno', 'Chiara']) assert.equal(personState(name), "hasn't marked their busy hours yet");
    assert.equal(personMark('Anna'), 'counts');
    assert.equal(personMark('Chiara'), "doesn't count");
    assert.equal(text(person('Chiara').querySelector('.av-person-name')), 'Chiara · advisor');
    assert.equal(detail(), 'Tap an hour to see who is free.');
    cell(2, 12).click();
    assert.match(detail(), /Unknown: Anna and Bruno/);
    assert.equal(byText(outlet, 'a', 'Mark your busy hours').getAttribute('href'), MINE_VIEW);
    assert.match(text(outlet), /Everyone marks when they're busy/);
    const legend = outlet.querySelector('.av-legend');
    assert.equal(text(legend.firstElementChild), 'In the cells: how many are free out of how many have marked their busy hours.');
    assert.equal(text(legend.querySelector('.av-legend-scale')), 'Nobody freeEveryone free');
    assert.match(text(outlet), /Who needs to be there/);
    assert.equal(outlet.querySelector('.av-people').getAttribute('aria-label'), 'Who needs to be there');
    assert.match(text(outlet), /Tap a person to remove or add them to the calculation\. The choice stays on this device\./);
    assert.equal(outlet.querySelector('.av-team').getAttribute('aria-label'), `People free, ${av.weekLabel(monday)}`);
    assert.deepEqual(leftovers(outlet.querySelector('.tab-body')), []);
  });

  it('la navigazione tra le settimane parla inglese', async () => {
    await visit(TEAM);
    assert.equal(weekTitle(), 'This week');
    assert.equal(text(outlet.querySelector('.av-week-title .muted')), av.weekLabel(monday));
    assert.ok(weekButton('Previous week').disabled);
    await nextWeek();
    assert.equal(weekTitle(), 'Next week');
    await nextWeek();
    assert.equal(weekTitle(), 'In 2 weeks');
    await nextWeek(8);
    assert.equal(weekTitle(), 'In 10 weeks');
  });

  it('stati delle persone, orari migliori e dettaglio di un ora', async () => {
    const lastSunday = av.addDays(monday, -1);
    const until = av.addDays(next, 2);
    mine({ busy: { lun: [10], gio: [10] }, until });
    bruno({ busy: { mar: [9] }, until: lastSunday });
    chiara({ busy: {} });
    await visit(TEAM);
    assert.equal(personState('Bruno'), `usual schedule expired on ${format.fmtDate(lastSunday)}`);
    assert.match(personState('Anna'), /^updated just now$/);
    person('Chiara').click();
    await flush(1);
    assert.equal(personMark('Chiara'), 'counts');
    assert.equal(notCounted(), 'Not counting: Bruno (usual schedule expired).');

    await nextWeek();
    assert.equal(personState('Anna'), `counts until ${format.fmtDate(until)}`);
    assert.equal(notCounted(), `Not counting: Anna (counts until ${av.shortDate(until)}), Bruno (usual schedule expired).`);
    assert.equal(cell(0, 10).getAttribute('aria-label'), `Monday ${av.shortDate(next)} from 10:00 to 11:00: 1 of 2 free`);
    assert.deepEqual(best()[0], [av.slotLabel(next, 8, 10), 'not known for Bruno']);
    cell(0, 10).click();
    assert.match(detail(), new RegExp(`^${av.slotLabel(next, 10, 11)}`));
    assert.match(detail(), /Free: Chiara/);
    assert.match(detail(), /Busy: Anna/);
    assert.match(detail(), /Unknown: Bruno/);
    cell(3, 10).click();
    assert.match(detail(), /Unknown: Anna and Bruno/);
    assert.deepEqual(leftovers(outlet.querySelector('.tab-body')), []);
  });

  it('negli orari migliori chi manca è impegnato, al singolare e al plurale', async () => {
    const busyAll = Object.fromEntries(av.DAY_KEYS.map((day) => [day, av.HOURS]));
    mine({ busy: { ...busyAll, mar: av.HOURS.filter((h) => h !== 9) } });
    bruno({ busy: { ...busyAll, mar: av.HOURS.filter((h) => h !== 9) } });
    chiara({ busy: busyAll });
    await visit(TEAM);
    byText(outlet, '.av-person', 'Chiara').click();
    await flush(1);
    await nextWeek();
    assert.deepEqual(best(), [[av.slotLabel(av.addDays(next, 1), 9, 10), 'Chiara is busy']]);

    store.setMembers([...members(), { user_id: '00000000-0000-4000-8000-00000000000d', display_name: 'Dario', role: 'member', color: '#000000' }]);
    availability('aaaaaaaa-0000-4000-8000-000000000009', '00000000-0000-4000-8000-00000000000d', { busy: busyAll });
    await flush(1);
    assert.deepEqual(best(), [[av.slotLabel(av.addDays(next, 1), 9, 10), 'Chiara and Dario are busy']]);
  });

  it('senza orari in comune lo dice per questa settimana o per la settimana scelta', async () => {
    const busyAll = Object.fromEntries(av.DAY_KEYS.map((day) => [day, av.HOURS]));
    mine({ busy: busyAll });
    await visit(TEAM);
    assert.match(bestCard(), /No free time in common this week\./);
    await nextWeek();
    assert.match(bestCard(), new RegExp(`No free time in common from ${av.weekLabel(next)}\\.`));
    mine({ busy: {}, until: av.addDays(monday, -1) }, { version: 2 });
    await flush(1);
    assert.match(bestCard(), /None of the chosen people has marked their busy hours for the chosen week\./);
    for (const name of ['Anna', 'Bruno']) person(name).click();
    await flush(1);
    assert.match(bestCard(), /Choose at least one person below\./);
  });

  it('le ore già passate lo dicono', async () => {
    mine({ busy: {} });
    await visit(TEAM);
    const past = new Date() > new Date(`${monday}T08:59:00`);
    const label = cell(0, 8).getAttribute('aria-label');
    assert.equal(label.endsWith(', already past'), past);
    if (past) {
      cell(0, 8).click();
      assert.match(detail(), /, already past/);
    }
  });
});

describe('pagina Disponibilità in inglese, i miei impegni', () => {
  it('spiega cosa fare e salva il primo orario con titolo e messaggio', async () => {
    const calls = [];
    let finish;
    api.createItem = (args) => {
      calls.push(args);
      return new Promise((resolve) => {
        finish = () => resolve(item({ id: NEW_ID, kind: args.kind, title: args.title, data: args.data, updated_at: new Date().toISOString() }));
      });
    };
    const body = await visit(MINE_VIEW);
    assert.match(body, /Tap or drag over the hours when you're busy: classes, work, training\. You don't need to say what you're doing\./);
    assert.equal(text(outlet.querySelector('.av-touch-hint')), 'To scroll the page, drag on the hours column.');
    assert.equal(outlet.querySelector('.av-scope').getAttribute('aria-label'), 'What you are changing');
    assert.ok(scopeButton('Usual schedule'));
    assert.ok(scopeButton('A specific week'));
    assert.equal(text(outlet.querySelector('.av-until .field-label')), 'Valid until');
    assert.match(text(outlet.querySelector('.av-until')), /For example the end of the semester\./);
    assert.equal(outlet.querySelector('.av-edit').getAttribute('aria-label'), 'My usual schedule');
    assert.equal(cell(0, 8).getAttribute('aria-label'), 'Monday from 8:00 to 9:00, busy');
    assert.equal(saveStatus(), "Until you save, you don't count towards the best times");
    assert.deepEqual(leftovers(outlet.querySelector('.tab-body')), []);

    tap(2, 9);
    assert.equal(saveStatus(), 'Unsaved changes');
    saveButton().click();
    await flush(2);
    assert.equal(saveStatus(), 'Saving…');
    finish();
    await flush(10);
    assert.equal(calls[0].title, 'Impegni', 'il titolo lo fissa il database e non si traduce');
    assert.equal(calls[0].message, 'First busy hours');
    assert.match(toasts(), /Busy hours saved\./);
  });

  it('aggiornare i miei impegni salva con il messaggio inglese e mostra quando', async () => {
    mine({ busy: {} });
    const saves = [];
    api.saveItem = async (args) => {
      saves.push(args);
      const current = store.getItem(args.id);
      return { status: 'ok', item: item({ ...current, data: args.snapshot.data, version: current.version + 1, updated_at: new Date().toISOString() }) };
    };
    await visit(MINE_VIEW);
    assert.equal(saveStatus(), 'Saved just now');
    tap(1, 9);
    saveButton().click();
    await flush(10);
    assert.equal(saves[0].message, 'Busy hours updated');
    assert.equal(saves[0].snapshot.title, 'Impegni');
  });

  it('un orario tipo scaduto lo dice con la data', async () => {
    const lastSunday = av.addDays(monday, -1);
    mine({ busy: {}, until: lastSunday });
    await visit(MINE_VIEW);
    assert.equal(text(outlet.querySelector('.av-until .av-warn')), `Your usual schedule expired on ${format.fmtDate(lastSunday)}: check it and change the date.`);
  });

  it('una settimana precisa: le note dicono cosa vale e quando', async () => {
    mine({ busy: { lun: [9] } });
    await visit(MINE_VIEW);
    scopeButton('A specific week').click();
    assert.equal(note(), 'For now your usual schedule applies: what you change here only applies to this week.');
    tap(1, 20);
    assert.equal(note(), 'This week you have a schedule different from your usual one.');
    assert.ok(byText(outlet, '.av-note button', 'Back to the usual schedule'));
    await nextWeek();
    assert.equal(outlet.querySelector('.av-edit').getAttribute('aria-label'), `My busy hours, ${av.weekLabel(next)}`);
    assert.equal(note(), `For now your usual schedule applies: what you change here only applies from ${av.weekLabel(next)}.`);
    tap(2, 15);
    assert.equal(note(), `From ${av.weekLabel(next)} you have a schedule different from your usual one.`);
    assert.deepEqual(leftovers(outlet.querySelector('.tab-body')), []);
  });

  it('nei giorni dopo la scadenza dell orario tipo la nota e le ore lo dicono', async () => {
    const until = av.addDays(next, 2);
    mine({ busy: { lun: [9] }, until });
    await visit(MINE_VIEW);
    scopeButton('A specific week').click();
    await nextWeek();
    assert.equal(note(), `Your usual schedule is valid until ${format.fmtDate(until)}: you don't count on the striped days. If you change anything here, the whole week counts as you see it.`);
    assert.equal(cell(3, 9).getAttribute('aria-label'), 'Thursday from 9:00 to 10:00, busy, usual schedule expired');

    mine({ busy: { lun: [9] }, until: av.addDays(monday, -1) }, { version: 2 });
    await flush(1);
    await visit(MINE_VIEW);
    scopeButton('A specific week').click();
    assert.equal(note(), `Your usual schedule expired on ${format.fmtDate(av.addDays(monday, -1))}: you don't count on the striped days. If you change anything here, the whole week counts as you see it.`);
  });

  it('uscire con impegni non salvati chiede conferma in inglese', async () => {
    mine({ busy: {} });
    await visit(MINE_VIEW);
    tap(1, 9);
    const attempt = router.render('#/idee');
    await flush();
    const dialog = document.querySelector('dialog');
    assert.match(text(dialog), /You have unsaved busy hours\. Leave anyway\?/);
    assert.match(text(dialog), /Unsaved busy hours/);
    byText(dialog, 'button', 'Leave').click();
    await attempt;
  });
});
