import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { italianWords } from '../setup/italian.mjs';

// Su un dispositivo in inglese: la lingua si decide quando il sito si carica, quindi i moduli si importano dopo la scelta.
useLanguage('en');
const { ROADMAP, ROADMAP_STEPS, roadmapState, stepByKey } = await import('../../assets/js/roadmap.js');
const { language, textsFor } = await import('../../assets/js/i18n/index.js');

// Parole che il rilevatore conta come italiane ma che l'inglese usa così: «per week», «non-dilutive», «buyer persona».
const ENGLISH_TOO = new Set(['per', 'non', 'persona']);
const leftovers = (text) => italianWords(text).filter((word) => !ENGLISH_TOO.has(word));

const IDEA = '11111111-1111-4111-8111-111111111111';
const idea = (over = {}) => ({ id: IDEA, status: 'esplorazione', data: {}, ...over });
const stepOf = (rm, key) => rm.phases.flatMap((p) => p.steps).find((s) => s.step.key === key);
const times = (n, make = () => ({})) => Array.from({ length: n }, (_, i) => make(i));

const PHASE_KEYS = ['squadra', 'scelta', 'ipotesi', 'clienti', 'mercato', 'soluzione', 'decisione', 'azienda'];
const STEP_KEYS = [
  'team-canvas', 'ruoli-tempo', 'regole', 'vincoli', 'mentor', 'quote',
  'dieci-idee', 'startup-davvero', 'criteri', 'voti', 'scelta',
  'frase', 'lean-canvas', 'assunzione', 'persone', 'ostacoli', 'deeptech',
  'traccia-interviste', 'esperimento-problema', 'interviste', 'sintesi', 'persona', 'problema-validato',
  'tam-sam-som', 'concorrenti', 'vantaggio', 'ricavi',
  'vpc', 'smoke-test', 'mvp', 'prezzo-canale', 'impegni', 'canvas-validato', 'tappa-tecnica',
  'decisione', 'stato', 'lezioni',
  'patto-soci', 'proprieta', 'piano-finanziario', 'go-to-market', 'finanza-non-diluitiva', 'costituzione', 'pitch', 'investitori',
];

describe('roadmap su un dispositivo in inglese', () => {
  it('il sito è in inglese', () => {
    assert.equal(language, 'en');
  });

  it('le fasi si chiamano con le parole del glossario', () => {
    assert.deepEqual(ROADMAP.map((p) => p.title), [
      'The team',
      'Why this idea',
      'Write down the hypotheses',
      'Problem and customers',
      'Market and competitors',
      'Solution, MVP and price',
      'The decision',
      'Building the company',
    ]);
  });

  for (const phase of ROADMAP) {
    it(`la fase ${phase.key} ha obiettivo, cancello e rischio in inglese`, () => {
      for (const field of ['title', 'goal', 'note', 'gate', 'skipRisk'].filter((f) => f !== 'note' || phase.note)) {
        assert.equal(typeof phase[field], 'string', `${phase.key}.${field}`);
        assert.ok(phase[field].length > 0, `${phase.key}.${field}`);
        assert.deepEqual(leftovers(phase[field]), [], `${phase.key}.${field}: ${phase[field]}`);
      }
    });
  }

  for (const step of ROADMAP_STEPS) {
    it(`il passo ${step.key} dice in inglese cosa fare, come, quando è fatto e l errore da evitare`, () => {
      assert.ok(Array.isArray(step.how) && step.how.length >= 2, step.key);
      for (const [field, value] of [['title', step.title], ['what', step.what], ['done', step.done], ['mistake', step.mistake], ...step.how.map((text, i) => [`how[${i}]`, text])]) {
        assert.equal(typeof value, 'string', `${step.key}.${field}`);
        assert.ok(value.length > 0, `${step.key}.${field}`);
        assert.deepEqual(leftovers(value), [], `${step.key}.${field}: ${value}`);
      }
    });
  }

  it('stepByKey dà il titolo inglese, quello che lo storico mostra', () => {
    assert.equal(stepByKey('team-canvas').title, 'Fill in the Team Canvas');
    assert.equal(stepByKey('mentor').title, 'Find a mentor');
    assert.equal(stepByKey('tappa-tecnica').title, 'Deep tech: next milestone and design partners');
    assert.equal(stepByKey('investitori').title, 'Look for investors only when you need them');
  });

  it('le chiavi salvate nelle idee non cambiano con la lingua', () => {
    assert.deepEqual(ROADMAP.map((p) => p.key), PHASE_KEYS);
    assert.deepEqual(ROADMAP_STEPS.map((s) => s.key), STEP_KEYS);
  });

  it('i collegamenti restano gli indirizzi del sito', () => {
    const rm = roadmapState(idea(), {});
    assert.equal(stepOf(rm, 'team-canvas').href, '#/squadra');
    assert.equal(stepOf(rm, 'quote').href, '#/squadra/quote');
    assert.equal(stepOf(rm, 'criteri').href, '#/valutazione');
    assert.equal(stepOf(rm, 'interviste').href, `#/idea/${IDEA}/interviste`);
  });
});

describe('avanzamento dei passi in inglese', () => {
  const talk = (status, data = {}) => ({ status, data });
  // [passo, contesto, testo atteso]: ai bordi, e fermo al traguardo quando i dati lo superano.
  const CASES = [
    ['dieci-idee', { ideasCount: 0 }, '0 of 10'],
    ['dieci-idee', { ideasCount: 9 }, '9 of 10'],
    ['dieci-idee', { ideasCount: 12 }, '10 of 10'],
    ['persone', { contacts: times(4) }, '4 of 5'],
    ['persone', { contacts: times(9) }, '5 of 5'],
    ['interviste', { interviews: times(19, () => talk('fatta')) }, '19 of 20'],
    ['sintesi', { interviews: times(11, () => talk('analizzata')) }, '10 of 10'],
    ['concorrenti', { competitors: [{ data: { rivals: times(2) } }] }, '2 of 3'],
    ['impegni', { interviews: times(4, () => talk('fatta', { commitment: 'pilota' })) }, '3 of 3'],
    ['canvas-validato', { canvases: [{ data: { validated: { problem: true } } }] }, '1 of 3'],
    ['voti', { fullVoters: 0 }, '0 people scored every criterion'],
    ['voti', { fullVoters: 1 }, '1 person scored every criterion'],
    ['voti', { fullVoters: 2 }, '2 people scored every criterion'],
  ];
  for (const [key, ctx, expected] of CASES) {
    it(`${key} con ${JSON.stringify(ctx).slice(0, 60)} dice «${expected}»`, () => {
      assert.equal(stepOf(roadmapState(idea(), ctx), key).progress, expected);
    });
  }
});

describe('testi della roadmap nelle due lingue', () => {
  const it_ = textsFor('it').roadmap;
  const en = textsFor('en').roadmap;

  it('ogni fase e ogni passo della roadmap ha i suoi testi, e non ce ne sono di avanzati', () => {
    for (const texts of [it_, en]) {
      assert.deepEqual(Object.keys(texts.phases), PHASE_KEYS);
      assert.deepEqual(Object.keys(texts.steps), STEP_KEYS);
    }
  });

  it('i consigli di ogni passo sono tanti quanti in italiano', () => {
    for (const key of STEP_KEYS) assert.equal(en.steps[key].how.length, it_.steps[key].how.length, key);
  });

  it('i testi dei passi non sono rimasti in italiano', () => {
    for (const key of STEP_KEYS) assert.notEqual(en.steps[key].title, it_.steps[key].title, key);
  });
});

// The roadmap points at sheets, lists and pages of the site: by the names they have in English, not by others.
describe('nomi di schede, elenchi e pagine nella roadmap in inglese', () => {
  const all = textsFor('en');
  const text = JSON.stringify(all.roadmap);

  for (const [wrong, why] of [
    [/deep tech card/i, 'the kind is the deep tech sheet'],
    [/People list/, 'the list is Contacts'],
    [/Equity page/, 'equity is a tab of the team page'],
    [/Team and Equity pages/, 'equity is a tab of the team page'],
  ]) {
    it(`non dice ${wrong}: ${why}`, () => {
      assert.doesNotMatch(text, wrong);
    });
  }

  it('i nomi che usa sono quelli del sito', () => {
    for (const name of [all.boards.kinds?.deeptech?.label ?? 'Deep tech sheet', all.shell.nav.contacts, all.squad.tabs.equity, all.shell.nav.squad]) {
      assert.ok(text.toLowerCase().includes(name.toLowerCase()), name);
    }
  });
});
