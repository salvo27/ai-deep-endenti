import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';

// On a device in English: the site language is decided when it loads, so the modules are imported after the choice.
useLanguage('en');
const { api } = await import('../../assets/js/lib/api.js');
const { AI_TASKS, MAX_CONTEXT, askClaude, buildContext, itemText } = await import('../../assets/js/ai.js');
const store = await import('../../assets/js/store.js');

const original = { ...api };
afterEach(() => Object.assign(api, original));

const MEMBER = '00000000-0000-4000-8000-00000000000a';
const idea = { id: 'i1', kind: 'idea', title: 'Solar sensors', status: 'nuova', data: { pitch: 'Cheap sensors for farms', owner: MEMBER } };
const interview = { id: 'n1', kind: 'interview', title: 'Green Farm', status: 'fatta', data: { contact: 'owner@farm.example', interviewer: MEMBER, pains: 'Too much water' } };

describe('richieste a Claude in inglese', () => {
  it('i compiti hanno nomi inglesi e le chiavi di sempre', () => {
    assert.deepEqual(AI_TASKS, {
      critique: 'Critique',
      next_experiment: 'Next experiment',
      interview_questions: 'Interview questions',
      interview_synthesis: 'Interview summary',
      cell_ideas: 'Ideas for this cell',
    });
  });

  it('lo stato di una scheda si legge in inglese', () => {
    assert.match(itemText(idea), /^# [^:]+: Solar sensors\nStatus: /);
  });

  it('i blocchi validati del canvas lo dicono in inglese', () => {
    const text = itemText({ kind: 'canvas', title: 'Canvas', status: null, data: { problem: 'p', solution: 's', validated: { problem: true } } });
    assert.match(text, /: p$/m);
    assert.match(text, /\(validated with data\): p/);
    assert.doesNotMatch(text, /\(validated with data\): s/);
  });

  it('concorrenti diretti e indiretti e funzionalità si leggono in inglese, noi compresi', () => {
    const text = itemText({
      kind: 'competitors',
      title: 'Competitors',
      status: null,
      data: {
        rivals: [{ id: 'c-1', name: 'AquaCorp', type: 'diretto', note: 'market leader' }, { id: 'c-2', name: 'Buckets', type: 'indiretto' }],
        features: [{ id: 'f-1', label: 'Price', importance: 'alta' }, { id: 'f-2', label: 'Support', importance: 'bassa' }],
        cells: { 'f-1:noi': true, 'f-1:c-1': true },
      },
    });
    assert.match(text, /^Direct competitor: AquaCorp \(market leader\)$/m);
    assert.match(text, /^Indirect competitor: Buckets$/m);
    assert.match(text, /^Feature “Price” \(importance \S+\): Us, AquaCorp$/m);
    assert.match(text, /^Feature “Support” \(importance \S+\): nobody$/m);
  });

  it('le persone e i contatti restano fuori anche in inglese', () => {
    const text = itemText(interview);
    assert.doesNotMatch(text, /owner@farm\.example/);
    assert.doesNotMatch(text, new RegExp(MEMBER));
  });

  it('la cella del generatore si presenta con le etichette inglesi', () => {
    const cell = buildContext('cell_ideas', { cell: { row: 'XAI', col: 'Farming', text: 'Water sensors' }, existingIdeas: ['Solar sensors', 'Drones'] });
    assert.equal(cell, 'Team capability: XAI\n\nSector: Farming\n\nNotes already in the cell:\nWater sensors\n\nIdeas already on the board:\n- Solar sensors\n- Drones');
  });

  it('una cella vuota manda solo capacità e settore', () => {
    assert.equal(buildContext('cell_ideas', { cell: { row: 'XAI', col: 'Farming' } }), 'Team capability: XAI\n\nSector: Farming');
  });

  it('troppo poco o troppo testo lo dice in inglese invece di tagliare', () => {
    assert.throws(() => buildContext('critique', {}), /There is not enough content to send to Claude yet\./);
    const long = { ...idea, data: { pitch: 'x'.repeat(MAX_CONTEXT + 10) } };
    assert.throws(() => buildContext('critique', { idea: long }), /There is too much text to send to Claude at once\. Reduce the number of interviews or shorten the fields\./);
  });

  it('un testo lungo esattamente quanto il massimo passa', () => {
    const exact = { kind: 'idea', title: 'x', status: null, data: {} };
    const head = itemText(exact);
    const fits = { ...exact, title: 'x'.repeat(MAX_CONTEXT - head.length + 1) };
    assert.equal(buildContext('critique', { idea: fits }).length, MAX_CONTEXT);
    const over = { ...exact, title: 'x'.repeat(MAX_CONTEXT - head.length + 2) };
    assert.throws(() => buildContext('critique', { idea: over }), /too much text/);
  });

  it('un compito sconosciuto o una risposta vuota lo dicono in inglese', async () => {
    await assert.rejects(askClaude('invented', 'x'), /Invalid request\./);
    api.invokeClaude = async () => ({ text: '   ' });
    await assert.rejects(askClaude('critique', 'x'), /Claude did not return a usable answer\./);
  });
});
