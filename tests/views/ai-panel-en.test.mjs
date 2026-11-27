import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { setupDom, flush, byText, text } from '../setup/dom.mjs';
import { italianWords } from '../setup/italian.mjs';

// On a device in English: the site language is decided when it loads, so the modules are imported after the choice.
useLanguage('en');
setupDom();
const { api } = await import('../../assets/js/lib/api.js');
const { aiButton, openAiPanel } = await import('../../assets/js/views/ai-panel.js');

const original = { ...api };
const IDEA = { id: 'eeeeeeee-0000-4000-8000-000000000001', kind: 'idea', title: 'Solar sensors', status: 'nuova', data: { pitch: 'Cheap sensors for farms' } };
const input = async () => ({ idea: IDEA });
const toasts = () => [...document.querySelectorAll('.toast')].map((el) => text(el));
let clipboard;

async function open(options = {}, response = { text: '## Risks\n\n- Price', truncated: false, remaining: null }) {
  api.invokeClaude = async () => response;
  const modal = openAiPanel('critique', options.getInput || input, options);
  await flush(10);
  return modal;
}

beforeEach(() => {
  document.body.querySelectorAll('dialog, .toasts').forEach((d) => d.remove());
  clipboard = { written: [], fail: false };
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (value) => { if (clipboard.fail) throw new Error('denied'); clipboard.written.push(value); } },
  });
});

afterEach(() => Object.assign(api, original));

describe('bottone di Claude in inglese', () => {
  it('usa il nome inglese del compito, o l etichetta scelta', () => {
    assert.equal(text(aiButton('critique', input)), 'Critique');
    assert.equal(text(aiButton('interview_questions', input)), 'Interview questions');
    assert.equal(text(aiButton('critique', input, { label: 'Ask Claude' })), 'Ask Claude');
  });

  it('apre la finestra con il nome del compito', async () => {
    api.invokeClaude = async () => ({ text: 'ok' });
    aiButton('next_experiment', input).click();
    await flush(10);
    assert.equal(document.querySelector('dialog').getAttribute('aria-label'), 'Claude · Next experiment');
  });
});

describe('finestra di Claude in inglese', () => {
  it('mentre aspetta dice che Claude sta leggendo', () => {
    api.invokeClaude = () => new Promise(() => {});
    const modal = openAiPanel('critique', input);
    assert.match(text(modal.dialog), /Claude is reading the board…/);
    modal.close();
  });

  it('mostra la risposta con l avviso che Claude può sbagliare', async () => {
    const modal = await open();
    const body = text(modal.dialog.querySelector('.ai-panel'));
    assert.match(body, /Risks/);
    assert.match(body, /Claude can make mistakes: check the facts before you use them\.$/);
    assert.doesNotMatch(body, /cut off|still available/);
    assert.deepEqual([...modal.dialog.querySelectorAll('footer.modal-actions button')].map(text).filter(Boolean), ['Copy']);
  });

  it('una risposta tagliata e le richieste rimaste si leggono in inglese', async () => {
    const modal = await open({}, { text: 'Long answer', truncated: true, remaining: 3 });
    const body = text(modal.dialog);
    assert.match(body, /The answer was cut off because it was too long\./);
    assert.match(body, /Requests to Claude still available: 3/);
  });

  it('anche zero richieste rimaste si dicono', async () => {
    const modal = await open({}, { text: 'Last one', remaining: 0 });
    assert.match(text(modal.dialog), /Requests to Claude still available: 0/);
  });

  it('copia il testo e lo conferma, o dice che non ci è riuscita', async () => {
    const modal = await open();
    byText(modal.dialog, 'button', 'Copy').click();
    await flush();
    assert.deepEqual(clipboard.written, ['## Risks\n\n- Price']);
    assert.ok(toasts().includes('Text copied.'));
    clipboard.fail = true;
    byText(modal.dialog, 'button', 'Copy').click();
    await flush();
    assert.ok(toasts().includes('Copy failed.'));
  });

  it('salva la risposta tra i commenti della scheda e chiude', async () => {
    const saved = [];
    api.addComment = async (...args) => saved.push(args);
    const modal = await open({ item: IDEA });
    byText(modal.dialog, 'button', 'Save as a comment').click();
    await flush(5);
    assert.deepEqual(saved, [[IDEA.id, '## Risks\n\n- Price', 'critique']]);
    assert.ok(toasts().includes('Saved in the comments of “Solar sensors”.'));
    assert.equal(modal.dialog.isConnected, false);
  });

  it('se il commento non si salva lo dice e lascia riprovare', async () => {
    api.addComment = async () => {
      throw new Error('Network down');
    };
    const modal = await open({ item: IDEA });
    const save = byText(modal.dialog, 'button', 'Save as a comment');
    save.click();
    await flush(5);
    assert.ok(toasts().includes('Network down'));
    assert.equal(save.disabled, false);
    assert.equal(modal.dialog.isConnected, true);
    modal.close();
  });

  it('usare la risposta la passa a chi l ha chiesta e chiude', async () => {
    const used = [];
    const modal = await open({ onAccept: (value) => used.push(value) });
    byText(modal.dialog, 'button', 'Use').click();
    assert.deepEqual(used, ['## Risks\n\n- Price']);
    assert.equal(modal.dialog.isConnected, false);
    const custom = await open({ onAccept: () => {}, acceptLabel: 'Add to the cell' });
    assert.ok(byText(custom.dialog, 'button', 'Add to the cell'));
    custom.close();
  });

  it('senza contenuto da mandare spiega l errore in inglese e non chiama Claude', async () => {
    let calls = 0;
    api.invokeClaude = async () => {
      calls += 1;
      return { text: 'x' };
    };
    const modal = openAiPanel('critique', async () => ({}));
    await flush(10);
    assert.match(text(modal.dialog), /There is not enough content to send to Claude yet\./);
    assert.equal(calls, 0);
    modal.close();
  });

  it('i testi della finestra non lasciano parole italiane', async () => {
    const modal = await open({ item: IDEA, onAccept: () => {} }, { text: 'Fine', truncated: true, remaining: 2 });
    modal.dialog.querySelectorAll('.modal-close, [aria-label]').forEach((el) => el !== modal.dialog && el.removeAttribute('aria-label'));
    assert.deepEqual(italianWords(text(modal.dialog)), []);
  });
});
