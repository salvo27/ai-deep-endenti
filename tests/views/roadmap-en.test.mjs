import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { italianWords } from '../setup/italian.mjs';
import { setupDom, flush, text } from '../setup/dom.mjs';
import { ME, item, members } from '../setup/fixtures.mjs';

// Su un dispositivo in inglese: la lingua si decide quando il sito si carica, quindi i moduli si importano dopo la scelta.
useLanguage('en');
setupDom();
const { api } = await import('../../assets/js/lib/api.js');
const store = await import('../../assets/js/store.js');
const { ROADMAP, ROADMAP_STEPS } = await import('../../assets/js/roadmap.js');
const { phaseSection, roadmapBox, roadmapPanel } = await import('../../assets/js/views/roadmap.js');

const original = { ...api };
const IDEA_ID = '11111111-1111-4111-8111-1111111111aa';
const PERSONA_ID = '11111111-1111-4111-8111-1111111111ab';
const AT = '2026-10-20T10:00:00.000Z';

// Parole che il rilevatore conta come italiane ma che l'inglese usa così: «per week», «non-dilutive», «buyer persona».
const ENGLISH_TOO = new Set(['per', 'non', 'persona']);

/** L'italiano rimasto in una parte della pagina. I nomi dei concetti vengono dal manuale, che traduce un altro gruppo. */
function leftovers(el) {
  const copy = el.cloneNode(true);
  copy.querySelectorAll('.concept-link').forEach((link) => link.remove());
  return italianWords(text(copy)).filter((word) => !ENGLISH_TOO.has(word));
}

const englishIdea = (over = {}) => item({ id: IDEA_ID, kind: 'idea', title: 'Bakery planner', status: 'esplorazione', data: { owner: ME }, ...over });
const stepEl = (root, title) => [...root.querySelectorAll('.rm-step')].find((li) => li.querySelector('.rm-title')?.textContent === title);
const phaseEl = (root, key) => root.querySelector(`#fase-${key}`);
const allMarks = (keys) => Object.fromEntries(keys.map((key) => [key, `done|${ME}|${AT}`]));

function setup(idea = englishIdea()) {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members());
  store.applyItem(idea);
  store.applyItem(item({ id: PERSONA_ID, kind: 'persona', title: 'Head baker', idea_id: IDEA_ID, data: {} }));
  return store.getItem(IDEA_ID);
}

function panel(idea = setup(), writable = true) {
  const el = roadmapPanel(idea, { writable });
  document.body.replaceChildren(el);
  return el;
}

beforeEach(() => setup());
afterEach(() => Object.assign(api, original));

describe('roadmap dell idea in inglese', () => {
  it('il riepilogo dice dove siete e qual è il prossimo passo', () => {
    const summary = panel().querySelector('.rm-summary');
    assert.equal(text(summary.querySelector('h2')), 'Idea roadmap');
    assert.equal(text(summary.querySelector('.rm-summary-head strong')), '0%');
    const lines = [...summary.querySelectorAll('p')].map(text);
    assert.equal(lines[0], '0 of 37 steps · current phase: The team');
    assert.equal(lines[1], 'Next step: Fill in the Team Canvas (phase: The team)');
    assert.match(lines[2], /^A step is done only when you tick it/);
    assert.equal(summary.querySelector('.rm-bar').getAttribute('aria-label'), 'Roadmap progress');
  });

  it('non resta italiano in nessuna fase', () => {
    const el = panel();
    assert.equal(el.querySelectorAll('.rm-phase').length, 8);
    assert.deepEqual(leftovers(el), []);
  });

  it('il prossimo passo è aperto e spiega come si fa, quando è fatto e l errore da evitare', () => {
    const el = panel();
    const first = stepEl(el, 'Fill in the Team Canvas');
    assert.ok(first.classList.contains('is-next'));
    assert.equal(first.querySelector('details').open, true);
    assert.equal(first.querySelector('.badge').textContent, 'Next step');
    assert.equal(first.querySelector('h4').textContent, 'How to do it');
    assert.equal(text(first.querySelector('.rm-done')), 'Done when: Every block is filled in and everyone recognises themselves in what is written.');
    assert.match(text(first.querySelector('.rm-mistake')), /^Mistake to avoid: Skipping it because/);
    const go = [...first.querySelectorAll('a.btn')].find((a) => a.textContent === 'Go to the page');
    assert.equal(go.getAttribute('href'), '#/squadra');
    assert.match(first.querySelector('.concept-link').textContent, /^In the book: \S/);
    assert.equal(first.querySelector('input.rm-check').getAttribute('aria-label'), 'Done: Fill in the Team Canvas');
  });

  it('ogni fase mostra il suo avanzamento, il cancello e il rischio di saltare quella prima', () => {
    const el = panel();
    const team = phaseEl(el, 'squadra');
    assert.equal(text(team.querySelector('.rm-phase-progress .small')), '0 of 6');
    assert.equal(team.querySelector('.rm-bar').getAttribute('aria-label'), 'Phase progress: The team');
    assert.match(text(team.querySelector('.rm-gate')), /^Before you move on: Move on when everyone/);
    const choice = phaseEl(el, 'scelta');
    assert.match(text(choice.querySelector('.banner-warn')), /^The previous phase is not complete\. You risk spending months/);
    assert.match(text(phaseEl(el, 'azienda').querySelector('.banner')), /^This phase opens when the idea is “Chosen”\. You can already read it/);
  });

  it('un passo facoltativo si può dire non necessario', () => {
    const step = stepEl(panel(), 'Deep tech: next milestone and design partners');
    assert.ok([...step.querySelectorAll('.chip')].some((chip) => chip.textContent === 'if needed'));
    assert.ok([...step.querySelectorAll('button')].some((b) => b.textContent === 'Not needed for this idea'));
  });

  it('un passo che i dati fanno sembrare fatto viene suggerito, non spuntato', () => {
    const step = stepEl(panel(), 'Describe the buyer personas');
    assert.equal(step.querySelector('input.rm-check').checked, false);
    assert.equal(text(step.querySelector('.rm-status')), 'The site data suggests this is done: tick it if it really is complete.');
  });

  it('chi ha segnato un passo e quando si legge in inglese, e un passo saltato si riapre', () => {
    const idea = setup(englishIdea({ data: { roadmap: { 'team-canvas': `done|${ME}|${AT}`, deeptech: `skip|${ME}|${AT}` } } }));
    const el = panel(idea);
    assert.equal(text(stepEl(el, 'Fill in the Team Canvas').querySelector('.rm-status')), 'Done, marked by Anna on 20 Oct 2026.');
    const skipped = stepEl(el, 'If it comes from research, open the deep tech card');
    assert.equal(text(skipped.querySelector('.rm-status')), 'Not needed, marked by Anna on 20 Oct 2026.');
    assert.ok([...skipped.querySelectorAll('button')].some((b) => b.textContent === 'Reopen the step'));
  });

  it('spuntare, saltare e togliere la spunta salva un messaggio in inglese nello storico', async () => {
    const saved = [];
    api.saveItem = async ({ id, snapshot, message }) => {
      saved.push({ snapshot, message });
      return { status: 'ok', item: { ...store.getItem(id), ...snapshot, version: store.getItem(id).version + 1 } };
    };
    let el = panel();
    const box = stepEl(el, 'Fill in the Team Canvas').querySelector('input.rm-check');
    box.checked = true;
    box.dispatchEvent(new window.Event('change'));
    await flush(10);
    assert.equal(saved[0].message, 'Roadmap: “Fill in the Team Canvas” done');
    assert.ok(saved[0].snapshot.data.roadmap['team-canvas'].startsWith(`done|${ME}|`), 'la chiave salvata resta la stessa');

    el = panel(store.getItem(IDEA_ID));
    [...stepEl(el, 'Deep tech: next milestone and design partners').querySelectorAll('button')].find((b) => b.textContent === 'Not needed for this idea').click();
    await flush(10);
    assert.equal(saved[1].message, 'Roadmap: “Deep tech: next milestone and design partners” not needed');
    assert.ok(saved[1].snapshot.data.roadmap['tappa-tecnica'].startsWith('skip|'));

    el = panel(store.getItem(IDEA_ID));
    const again = stepEl(el, 'Fill in the Team Canvas').querySelector('input.rm-check');
    again.checked = false;
    again.dispatchEvent(new window.Event('change'));
    await flush(10);
    assert.equal(saved[2].message, 'Roadmap: “Fill in the Team Canvas” to do');
  });

  it('tutti i passi fatti: la roadmap lo dice', () => {
    const idea = setup(englishIdea({ status: 'scelta', data: { roadmap: allMarks(ROADMAP_STEPS.map((s) => s.key)) } }));
    const summary = panel(idea).querySelector('.rm-summary');
    assert.equal(text(summary.querySelector('.rm-summary-head strong')), '100%');
    const lines = [...summary.querySelectorAll('p')].map(text);
    assert.deepEqual(lines.slice(0, 2), ['45 of 45 steps', 'All steps are done.']);
  });
});

describe('passi fatti senza un segno', () => {
  const phase = ROADMAP[0];
  const row = (idea) => {
    const el = phaseSection({ phase, index: 0, steps: [{ step: phase.steps[0], status: 'done', mark: null }], done: 1, total: 1, complete: true }, { idea, writable: false });
    return text(el.querySelector('.rm-status'));
  };

  it('negli esempi sono fatti come esempio, altrove semplicemente fatti', () => {
    assert.equal(row(store.exampleIdeas()[0]), 'Done (example).');
    assert.equal(row(englishIdea()), 'Done.');
  });

  it('nella roadmap di un esempio le fasi superate risultano fatte', () => {
    const spotify = store.exampleIdeas().find((e) => e.status === 'scelta');
    const el = panel(spotify, false);
    assert.equal(text(stepEl(el, 'Fill in the Team Canvas').querySelector('.rm-status')), 'Done (example).');
    assert.ok([...el.querySelectorAll('input.rm-check')].every((b) => b.disabled));
  });
});

describe('riquadro del prossimo passo nella panoramica', () => {
  it('dice la fase, l avanzamento e quando il passo è fatto', () => {
    const sample = store.exampleIdeas().find((e) => e.status === 'scelta');
    const box = roadmapBox(setup(), { sample });
    assert.equal(text(box.querySelector('h2')), 'Next step · The team');
    assert.equal(text(box.querySelector('.next-step-head .muted')), '0 of 37 · 0%');
    assert.equal(text(box.querySelector('p strong')), 'Fill in the Team Canvas');
    assert.match(text(box.querySelector('p .muted')), /^Done when: Every block is filled in/);
    const links = [...box.querySelectorAll('a')].map((a) => [text(a), a.getAttribute('href')]);
    assert.deepEqual(links, [
      ['Open the roadmap', `#/idea/${IDEA_ID}/roadmap`],
      ['Example: Spotify', `#/idea/${sample.id}/roadmap`],
    ]);
    assert.deepEqual(leftovers(box), []);
  });

  it('a roadmap completata lo dice al posto del passo', () => {
    const idea = setup(englishIdea({ status: 'scelta', data: { roadmap: allMarks(ROADMAP_STEPS.map((s) => s.key)) } }));
    const box = roadmapBox(idea);
    assert.equal(text(box.querySelector('h2')), 'Next step · Roadmap complete');
    assert.equal(text(box.querySelector('h2 + span')), '45 of 45 · 100%');
    assert.equal(text(box.querySelector(':scope > p')), 'All the roadmap steps are done.');
    assert.equal(box.querySelectorAll('a').length, 1);
  });
});

describe('fasi della roadmap nella guida', () => {
  it('si leggono in inglese, senza spunte né avanzamento', () => {
    for (const [index, phase] of ROADMAP.entries()) {
      const el = phaseSection({ phase, index, steps: phase.steps.map((step) => ({ step, status: 'todo' })) }, { reference: true });
      assert.equal(el.querySelectorAll('input').length, 0, phase.key);
      assert.equal(el.querySelector('.rm-phase-progress'), null, phase.key);
      assert.equal(el.querySelector('.badge'), null, phase.key);
      assert.equal(el.id, `fase-${phase.key}`, 'l indirizzo #/guida?fase=… resta lo stesso');
      assert.match(text(el.querySelector('.rm-gate')), /^Before you move on: /, phase.key);
      assert.deepEqual(leftovers(el), [], phase.key);
    }
  });
});
