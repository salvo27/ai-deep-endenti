import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, text } from '../setup/dom.mjs';
import { italianWords } from '../setup/italian.mjs';

// On a device in English: the site language is decided when it loads, so the modules are imported after the choice.
useLanguage('en');
setupDom();
const concepts = await import('../../assets/js/concepts.js');
const { CONCEPTS_INTRO, conceptsPanel } = await import('../../assets/js/views/concepts.js');
const help = await import('../../assets/js/views/concept-help.js');
const { en } = await import('../../assets/js/i18n/en/index.js');
const { it: italiano } = await import('../../assets/js/i18n/it/index.js');

// English words that the Italian detector also knows: "per year", "non-dilutive", "come back", "can serve", "buyer persona".
const ENGLISH_TOO = new Set(['per', 'non', 'come', 'serve', 'persona']);
const italianIn = (value) => italianWords(value).filter((word) => !ENGLISH_TOO.has(word));

function panel(focus) {
  const host = document.createElement('div');
  host.append(...conceptsPanel(focus));
  return host;
}
const terms = (host) => [...host.querySelectorAll('.concept-card h3')].map((h3) => h3.textContent);
function choose(select, value) {
  select.value = String(value);
  select.dispatchEvent(new window.Event('change'));
}
function search(host, value) {
  const input = host.querySelector('input[type="search"]');
  input.value = value;
  input.dispatchEvent(new window.Event('input'));
}

beforeEach(() => document.body.querySelectorAll('dialog').forEach((d) => d.remove()));

describe('concetti in inglese', () => {
  it('i capitoli hanno il nome inglese, e Lean Startup e Deep tech restano come sono', () => {
    assert.deepEqual(concepts.CHAPTERS, [
      [1, 'The basics'],
      [2, 'Before you start'],
      [3, 'Validation'],
      [4, 'Lean Startup'],
      [5, 'Market and competitors'],
      [6, 'Team'],
      [7, 'Funding and pitching'],
      [8, 'Marketing and sales'],
      [9, 'Economics and finance'],
      [10, 'Legal matters'],
      [11, 'Deep tech'],
    ]);
  });

  it('la data della verifica delle norme si legge in inglese', () => {
    assert.equal(concepts.VERIFIED_ON, '17 October 2026');
    assert.match(CONCEPTS_INTRO, /^The concepts from the Italian book “Il manuale dello startupper”/);
    assert.match(CONCEPTS_INTRO, /checked on 17 October 2026: check them again before you decide\.$/);
  });

  it('ogni concetto ha termine e spiegazione in inglese, senza parole italiane', () => {
    assert.equal(concepts.CONCEPTS.length, 96);
    for (const concept of concepts.CONCEPTS) {
      assert.ok(concept.term, concept.key);
      assert.ok(concept.text.length > 60, concept.key);
      assert.deepEqual(italianIn(`${concept.term} ${concept.text} ${concept.where || ''}`), [], concept.key);
    }
  });

  for (const [key, term] of [
    ['tam-sam-som', 'TAM, SAM and SOM'],
    ['trl', 'TRL scale'],
    ['javelin', 'Javelin board'],
    ['buyer-persona', 'Buyer personas'],
    ['mom-test', 'The Mom Test'],
    ['lean-canvas', 'Lean Canvas'],
    ['vesting', 'Vesting'],
    ['primi-90-giorni', 'First 90 days checklist'],
  ]) {
    it(`il concetto ${key} si chiama «${term}» e tiene la sua chiave`, () => {
      const concept = concepts.conceptByKey(key);
      assert.equal(concept.key, key);
      assert.equal(concept.term, term);
    });
  }

  it('ogni concetto ha i suoi testi in tutte e due le lingue, e nessun testo resta senza concetto', () => {
    const keys = concepts.CONCEPTS.map((c) => c.key).sort();
    assert.deepEqual(Object.keys(en.concepts.entries).sort(), keys);
    assert.deepEqual(Object.keys(italiano.concepts.entries).sort(), keys);
  });

  it('capitolo, fasi e segni restano quelli di prima: cambiano solo le parole', () => {
    const trl = concepts.conceptByKey('trl');
    assert.equal(trl.chapter, 11);
    assert.deepEqual(trl.phases, ['esplorazione', 'validazione', 'scelta']);
    assert.equal(concepts.conceptByKey('ecosistema').minor, true);
    assert.equal(concepts.conceptByKey('crowdfunding').verified, true);
    assert.equal(concepts.conceptByKey('inesistente'), null);
  });
});

describe('pagina dei concetti in inglese', () => {
  it('filtri ed etichette sono in inglese', () => {
    const host = panel();
    const input = host.querySelector('input[type="search"]');
    assert.equal(input.placeholder, 'Search for a concept');
    assert.equal(input.getAttribute('aria-label'), 'Search for a concept');
    const [chapter, phase] = host.querySelectorAll('select');
    assert.equal(chapter.getAttribute('aria-label'), 'Chapter');
    assert.deepEqual([...chapter.options].slice(0, 2).map((o) => o.textContent), ['All chapters', '1. The basics']);
    assert.equal(chapter.options[chapter.options.length - 1].textContent, 'Deep tech');
    assert.equal(phase.getAttribute('aria-label'), 'Idea stage');
    assert.equal(phase.options[0].textContent, 'All stages');
    assert.equal(text(host.querySelector('label.check')), 'Also show minor topics');
  });

  it('ogni capitolo ha il suo titolo, e quello aggiunto lo dice', () => {
    const headings = [...panel().querySelectorAll('.concept-chapter h2')].map((h2) => h2.textContent);
    assert.equal(headings.length, 11);
    assert.equal(headings[0], '1. The basics');
    assert.equal(headings[3], '4. Lean Startup');
    assert.equal(headings[10], 'Deep tech (added chapter)');
  });

  it('la ricerca trova le parole inglesi, senza badare a maiuscole e accenti', () => {
    const host = panel();
    search(host, 'cliff');
    assert.deepEqual(terms(host), ['Vesting']);
    search(host, 'IMPOSTOR');
    assert.deepEqual(terms(host), ['Impostor syndrome']);
  });

  it('senza risultati lo dice in inglese', () => {
    const host = panel();
    search(host, 'zzzz nessuno');
    assert.equal(text(host.querySelector('.empty')), 'No concepts match these filters.');
  });

  it('il filtro del capitolo mostra solo quel capitolo', () => {
    const host = panel();
    choose(host.querySelectorAll('select')[0], 11);
    const shown = terms(host);
    assert.equal(shown.length, concepts.CONCEPTS.filter((c) => c.chapter === 11).length);
    assert.deepEqual([...host.querySelectorAll('.concept-chapter h2')].map((h2) => h2.textContent), ['Deep tech (added chapter)']);
  });

  it('il filtro della fase mostra solo i concetti di quella fase', () => {
    const host = panel();
    choose(host.querySelectorAll('select')[1], 'parcheggiata');
    assert.deepEqual(terms(host), ['Pivot']);
    choose(host.querySelectorAll('select')[1], '');
    assert.equal(terms(host).length, concepts.CONCEPTS.length);
  });

  it('si possono nascondere i temi secondari', () => {
    const host = panel();
    const toggle = host.querySelector('label.check input');
    toggle.checked = false;
    toggle.dispatchEvent(new window.Event('change'));
    assert.equal(host.querySelectorAll('.concept-card.is-minor').length, 0);
    assert.equal(terms(host).length, concepts.CONCEPTS.filter((c) => !c.minor).length);
  });

  it('il concetto aperto da un link è in evidenza', () => {
    const host = panel('trl');
    assert.ok(host.querySelector('#concetto-trl.is-focus'));
    assert.equal(host.querySelectorAll('.is-focus').length, 1);
  });

  it('i testi del pannello non lasciano parole italiane, a parte i nomi delle fasi che vengono dallo schema', () => {
    const host = panel();
    const [, phase] = host.querySelectorAll('select');
    phase.remove();
    host.querySelectorAll('.concept-card .muted').forEach((line) => line.remove());
    assert.deepEqual(italianIn(text(host)), []);
  });
});

describe('aiuto sui concetti in inglese', () => {
  it('il punto di domanda dice cosa spiega', () => {
    const button = help.conceptButton('trl');
    assert.equal(button.title, 'What it means: TRL scale');
    assert.equal(button.getAttribute('aria-label'), 'What it means: TRL scale');
  });

  it('la finestra del concetto spiega dove si usa, il capitolo e la data della verifica', () => {
    const modal = help.openConcept('spin-off');
    const body = text(modal.dialog);
    assert.equal(modal.dialog.getAttribute('aria-label'), 'University spin-off');
    assert.match(body, /On the board: Deep tech sheet, the Company form field/);
    assert.match(body, /Added chapter on deep tech/);
    assert.match(body, / · rules and figures checked on 17 October 2026/);
    const link = modal.dialog.querySelector('a[href="#/guida/concetti?c=spin-off"]');
    assert.equal(text(link), 'All concepts');
    link.click();
    assert.equal(document.querySelector('dialog'), null, 'il link chiude la finestra');
  });

  it('un capitolo numerato si legge con il suo nome, e senza verifica non c è la data', () => {
    const body = text(help.conceptBody(concepts.conceptByKey('lean-canvas')).reduce((p, el) => (el && p.append(el), p), document.createElement('div')));
    assert.match(body, /Chapter 4: Lean Startup/);
    assert.doesNotMatch(body, /checked on/);
  });

  it('un concetto senza fasi non mostra il separatore delle fasi', () => {
    const body = text(help.conceptBody(concepts.conceptByKey('ecosistema')).reduce((p, el) => (el && p.append(el), p), document.createElement('div')));
    assert.match(body, /Chapter 1: The basics$/);
  });

  it('il link al concetto usa il termine inglese, o il testo scelto', () => {
    assert.equal(help.conceptLink('trl').textContent, 'TRL scale');
    assert.equal(help.conceptLink('trl', 'Read more').textContent, 'Read more');
  });

  it('un concetto che non esiste non dà né bottone né link né finestra', () => {
    assert.equal(help.conceptButton('inesistente'), null);
    assert.equal(help.conceptLink('inesistente'), null);
    assert.equal(help.openConcept('inesistente'), null);
  });
});
