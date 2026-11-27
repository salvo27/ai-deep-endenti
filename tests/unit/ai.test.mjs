import { test, describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../../assets/js/lib/api.js';
import { AI_TASKS, MAX_CONTEXT, askClaude, buildContext, itemText } from '../../assets/js/ai.js';
import * as store from '../../assets/js/store.js';
import { PROJECT, PROJECT2 } from '../setup/fixtures.mjs';

const original = { ...api };
afterEach(() => Object.assign(api, original));

const MEMBER = '00000000-0000-4000-8000-00000000000a';
const idea = {
  id: 'i1',
  kind: 'idea',
  title: 'Idea alfa',
  status: 'validazione',
  data: { pitch: 'Pitch di prova', owner: MEMBER, technologies: ['XAI', 'Previsioni'] },
};
const interview = {
  id: 'n1',
  kind: 'interview',
  title: 'Responsabile acquisti, Azienda Rossi',
  status: 'fatta',
  data: { contact: 'mario.rossi@azienda.example, 333 1234567', interviewer: MEMBER, pains: 'Perdo molto tempo', commitment: 'pilota', problem_intensity: 5, date: '2026-10-10' },
};

test('itemText sends labels and content but never people or contacts', () => {
  const text = itemText(interview);
  assert.match(text, /Intervista: Responsabile acquisti, Azienda Rossi/);
  assert.match(text, /Problemi e frustrazioni: Perdo molto tempo/);
  assert.match(text, /Impegno preso: Disponibile a un pilota/);
  assert.match(text, /5\/5/);
  assert.doesNotMatch(text, /mario\.rossi|333 1234567/);
  assert.doesNotMatch(text, new RegExp(MEMBER));
  assert.doesNotMatch(itemText(idea), /Responsabile/);
});

test('canvas text marks the validated blocks', () => {
  const text = itemText({ kind: 'canvas', title: 'Canvas', status: null, data: { problem: 'p', solution: 's', validated: { problem: true } } });
  assert.match(text, /Problema \(validato con dati\): p/);
  assert.match(text, /Soluzione: s/);
});

test('buildContext combines idea, canvases, experiments and interviews', () => {
  const ctx = buildContext('interview_synthesis', { idea, canvases: [], experiments: [], interviews: [interview] });
  assert.match(ctx, /# Idea: Idea alfa/);
  assert.match(ctx, /## Intervista/);
  const cell = buildContext('cell_ideas', { cell: { row: 'XAI', col: 'Settore A', text: 'spunto' }, existingIdeas: ['Idea alfa'] });
  assert.match(cell, /Capacità del team: XAI/);
  assert.match(cell, /- Idea alfa/);
});

test('buildContext refuses empty or too long contexts instead of truncating silently', () => {
  assert.throws(() => buildContext('critique', {}), /abbastanza contenuto/);
  const long = { ...idea, data: { pitch: 'x'.repeat(MAX_CONTEXT + 10) } };
  assert.throws(() => buildContext('critique', { idea: long }), /troppo testo/);
});

test('askClaude validates the task and the response', async () => {
  await assert.rejects(askClaude('inventato', 'x'), /non valida/);
  api.invokeClaude = async () => ({ text: '  risposta  ', truncated: true, remaining: 3 });
  assert.deepEqual(await askClaude('critique', 'x'), { text: 'risposta', truncated: true, remaining: 3 });
  api.invokeClaude = async () => ({ text: 42 });
  await assert.rejects(askClaude('critique', 'x'), /risposta utilizzabile/);
  api.invokeClaude = async () => ({ text: 'y'.repeat(30000), remaining: 'tanti' });
  const res = await askClaude('critique', 'x');
  assert.equal(res.text.length, 20000);
  assert.equal(res.remaining, null);
  assert.ok(Object.keys(AI_TASKS).includes('cell_ideas'));
});

test('un nome ereditato da ogni oggetto non è un compito valido e non arriva a Claude', async () => {
  let calls = 0;
  api.invokeClaude = async () => {
    calls += 1;
    return { text: 'risposta' };
  };
  for (const task of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
    await assert.rejects(askClaude(task, 'x'), /non valida/, task);
  }
  assert.equal(calls, 0);
});

describe('corpo della richiesta a Claude', () => {
  afterEach(() => store.resetStore());

  // La funzione di Claude controlla che chi chiede sia nel progetto e risponde nella lingua di chi legge.
  for (const [project, lang] of [[PROJECT, 'it'], [PROJECT2, 'it']]) {
    it(`porta il progetto aperto (${project.slice(-1)}) e la lingua in uso (${lang})`, async () => {
      store.setProject({ id: project, name: 'P', role: 'member' });
      let sent = null;
      api.invokeClaude = async (task, context, meta) => {
        sent = { task, context, meta };
        return { text: 'ok' };
      };
      await askClaude('critique', 'contesto');
      assert.deepEqual(sent, { task: 'critique', context: 'contesto', meta: { project, language: lang } });
    });
  }

  it('senza progetto aperto non inventa un progetto', async () => {
    let sent = null;
    api.invokeClaude = async (task, context, meta) => {
      sent = meta;
      return { text: 'ok' };
    };
    await askClaude('critique', 'contesto');
    assert.deepEqual(sent, { project: null, language: 'it' });
  });
});
