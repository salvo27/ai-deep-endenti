// Il questionario da stampare o salvare in PDF: testi, domande numerate e risposte possibili, senza risultati.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom, text } from '../setup/dom.mjs';

let surveySheet;

before(async () => {
  setupDom();
  ({ surveySheet } = await import('../../assets/js/survey-print.js'));
});

const sheet = (questions) => surveySheet({ title: 'Turni', status: 'bozza', data: { questions } });
const kinds = (root) => [...root.querySelectorAll('.ps-kind')].map(text);

describe('foglio del questionario', () => {
  it('l email facoltativa si stampa come facoltativa', () => {
    const root = sheet([{ id: 'mail', type: 'email', label: 'La tua email', required: false }]);
    assert.deepEqual(kinds(root), ['Email, facoltativa per ricontattare']);
    assert.equal(text(root.querySelector('.ps-q')), '1. La tua email');
  });

  it('l email obbligatoria non si stampa come facoltativa', () => {
    const root = sheet([{ id: 'mail', type: 'email', label: 'La tua email', required: true }]);
    assert.equal(text(root.querySelector('.ps-q')), '1. La tua email (obbligatoria)');
    assert.deepEqual(kinds(root), ['Email, per ricontattare']);
  });

  it('ogni tipo di domanda dice come si risponde', () => {
    const root = sheet([
      { id: 'a', type: 'scelta', label: 'A', options: [{ id: 'x', label: 'X' }] },
      { id: 'b', type: 'scelte', label: 'B', options: [{ id: 'x', label: 'X' }] },
      { id: 'c', type: 'scala', label: 'C', scale: { points: 7 } },
      { id: 'd', type: 'numero', label: 'D', number: { min: 0, max: 10 } },
      { id: 'e', type: 'numero', label: 'E', number: { min: 1 } },
      { id: 'f', type: 'numero', label: 'F', number: { max: 9 } },
      { id: 'g', type: 'numero', label: 'G' },
      { id: 'h', type: 'breve', label: 'H' },
      { id: 'i', type: 'lunga', label: 'I' },
    ]);
    assert.deepEqual(kinds(root), ['Una risposta', 'Una o più risposte', 'Scala da 1 a 7', 'Numero intero da 0 a 10', 'Numero intero, almeno 1', 'Numero intero, al massimo 9', 'Numero intero', 'Risposta breve', 'Risposta lunga']);
  });
});
