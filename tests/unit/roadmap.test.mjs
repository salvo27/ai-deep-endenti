import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ROADMAP, ROADMAP_STEPS, roadmapState, stepByKey } from '../../assets/js/roadmap.js';

const IDEA = '11111111-1111-4111-8111-111111111111';
const ME_ID = '22222222-2222-4222-8222-222222222222';
const AT = '2026-10-20T10:00:00.000Z';

const idea = (over = {}) => ({ id: IDEA, status: 'esplorazione', data: {}, ...over });
const stepOf = (rm, key) => rm.phases.flatMap((p) => p.steps).find((s) => s.step.key === key);
const stepState = (key, ctx = {}, over = {}) => stepOf(roadmapState(idea(over), ctx), key);
const times = (n, make = () => ({})) => Array.from({ length: n }, (_, i) => make(i));
const talk = (status, data = {}) => ({ status, data });
const allDone = (keys) => Object.fromEntries(keys.map((key) => [key, `done|${ME_ID}|${AT}`]));

describe('suggerimenti della roadmap dai dati della board', () => {
  // [passo, dati appena sotto la soglia, dati che la raggiungono]: [contesto, campi dell'idea].
  const CASES = [
    ['dieci-idee', [{ ideasCount: 9 }], [{ ideasCount: 10 }]],
    ['criteri', [{ hasCriteria: false }], [{ hasCriteria: true }]],
    ['voti', [{ fullVoters: 1 }], [{ fullVoters: 2 }]],
    ['scelta', [{}, { status: 'nuova' }], [{}, { status: 'esplorazione' }]],
    ['frase', [{}, { data: { pitch: 'P', problem: 'Q' } }], [{}, { data: { pitch: 'P', problem: 'Q', customer: 'C' } }]],
    ['lean-canvas', [{ canvases: [{ data: { problem: 1, segments: 1, uvp: 1 } }] }], [{ canvases: [{ data: {} }, { data: { problem: 1, segments: 1, uvp: 1, solution: 1 } }] }]],
    ['assunzione', [{ experiments: [{ data: {} }] }], [{ experiments: [{ data: { assumption: 'A' } }] }]],
    ['persone', [{ contacts: times(4) }], [{ contacts: times(5) }]],
    ['deeptech', [{ deeptechs: [] }], [{ deeptechs: [{ data: {} }] }]],
    [
      'esperimento-problema',
      [{ experiments: [{ data: { assumption_type: 'problema' } }, { data: { assumption_type: 'prezzo', success_criterion: 'S' } }] }],
      [{ experiments: [{ data: { assumption_type: 'cliente', success_criterion: 'S' } }] }],
    ],
    ['interviste', [{ interviews: [...times(19, () => talk('fatta')), talk('da_fare')] }], [{ interviews: times(20, (i) => talk(i % 2 ? 'fatta' : 'analizzata')) }]],
    ['sintesi', [{ interviews: [...times(9, () => talk('analizzata')), talk('fatta')] }], [{ interviews: times(10, () => talk('analizzata')) }]],
    ['persona', [{ personas: [] }], [{ personas: [{ data: {} }] }]],
    ['problema-validato', [{ canvases: [{ data: { validated: { uvp: true } } }] }], [{ canvases: [{ data: { validated: { problem: true } } }] }]],
    ['tam-sam-som', [{ markets: [{ data: { tam: 1, sam: 1 } }] }], [{ markets: [{ data: { tam: 1, sam: 1, som: 1 } }] }]],
    ['concorrenti', [{ competitors: [{ data: { rivals: times(2) } }] }], [{ competitors: [{ data: {} }, { data: { rivals: times(3) } }] }]],
    ['vantaggio', [{ canvases: [{ data: {} }] }], [{ canvases: [{ data: { advantage: 'A' } }] }]],
    ['ricavi', [{ canvases: [{ data: {} }] }], [{ canvases: [{ data: { revenue: 'R' } }] }]],
    ['vpc', [{ vpcs: [] }], [{ vpcs: [{ data: {} }] }]],
    ['smoke-test', [{ experiments: [{ data: { method: 'interviste' } }] }], [{ experiments: [{ data: { method: 'landing' } }] }]],
    [
      'prezzo-canale',
      [{ experiments: [{ status: 'in_corso', data: { assumption_type: 'prezzo' } }, { status: 'concluso', data: { assumption_type: 'problema' } }] }],
      [{ experiments: [{ status: 'concluso', data: { assumption_type: 'canale' } }] }],
    ],
    ['impegni', [{ interviews: [talk('fatta', { commitment: 'pilota' }), talk('fatta', { commitment: 'pagamento' }), talk('fatta', { commitment: 'demo' })] }], [{ interviews: times(3, () => talk('fatta', { commitment: 'pilota' })) }]],
    ['canvas-validato', [{ canvases: [{ data: { validated: { problem: true, segments: true } } }] }], [{ canvases: [{ data: { validated: { problem: true, segments: true, uvp: true } } }] }]],
    ['tappa-tecnica', [{ deeptechs: [{ data: { trl_target: '6' } }] }], [{ deeptechs: [{ data: { trl_target: '6', design_partners: 'D' } }] }]],
    ['decisione', [{ decisions: [{ status: 'proposta', data: { rationale: 'R' } }, { status: 'presa', data: {} }] }], [{ decisions: [{ status: 'presa', data: { rationale: 'R' } }] }]],
    ['stato', [{}, { status: 'validazione' }], [{}, { status: 'parcheggiata' }]],
    ['lezioni', [{ experiments: [{ data: {} }] }], [{ experiments: [{ data: { learnings: 'L' } }] }]],
  ];

  for (const [key, [belowCtx, belowIdea], [atCtx, atIdea]] of CASES) {
    it(`${key}: non suggerito sotto la soglia, suggerito appena la raggiunge`, () => {
      assert.equal(stepState(key, belowCtx, belowIdea).suggested, false);
      assert.equal(stepState(key, atCtx, atIdea).suggested, true);
    });
  }

  it('ogni passo con un controllo sui dati è nella tabella qui sopra', () => {
    assert.deepEqual(ROADMAP_STEPS.filter((s) => s.auto).map((s) => s.key).sort(), CASES.map(([key]) => key).sort());
  });

  it('un passo senza controllo sui dati non viene mai suggerito, anche con la board piena', () => {
    const full = {
      ideasCount: 50,
      hasCriteria: true,
      fullVoters: 5,
      contacts: times(30),
      interviews: times(30, () => talk('analizzata', { commitment: 'pagamento' })),
      canvases: [{ data: { problem: 1, segments: 1, uvp: 1, solution: 1, advantage: 1, revenue: 1, validated: { problem: true, segments: true, uvp: true } } }],
    };
    const rm = roadmapState(idea(), full);
    for (const step of ROADMAP_STEPS.filter((s) => !s.auto)) assert.equal(stepOf(rm, step.key).suggested, false, step.key);
  });

  it('le ricerche online non contano come interviste, nemmeno per gli impegni', () => {
    const research = times(20, () => ({ status: 'analizzata', data: { source: 'ricerca', commitment: 'pilota' } }));
    for (const key of ['interviste', 'sintesi', 'impegni']) assert.equal(stepState(key, { interviews: research }).suggested, false, key);
  });

  it('un passo già segnato non è più un suggerimento', () => {
    const step = stepState('dieci-idee', { ideasCount: 10 }, { data: { roadmap: allDone(['dieci-idee']) } });
    assert.equal(step.status, 'done');
    assert.equal(step.suggested, false);
  });
});

describe('collegamenti dei passi', () => {
  // [passo, indirizzo senza schede collegate, indirizzo con le schede collegate (se cambia)].
  const tab = (name) => `#/idea/${IDEA}/${name}`;
  const fresh = (kind) => `#/nuovo/${kind}?idea=${IDEA}`;
  const CASES = [
    ['team-canvas', '#/squadra'],
    ['ruoli-tempo', '#/squadra'],
    ['regole', '#/squadra'],
    ['vincoli', null],
    ['mentor', fresh('contact')],
    ['quote', '#/squadra/quote'],
    ['dieci-idee', '#/generatore'],
    ['startup-davvero', tab('commenti')],
    ['criteri', '#/valutazione'],
    ['voti', tab('voti')],
    ['scelta', fresh('decision')],
    ['frase', `#/modifica/${IDEA}`],
    ['lean-canvas', fresh('canvas'), { canvases: [{ data: {} }] }, tab('canvas')],
    ['assunzione', fresh('experiment')],
    ['persone', fresh('contact'), { contacts: [{ data: {} }] }, tab('interviste')],
    ['ostacoli', `#/modifica/${IDEA}`],
    ['deeptech', fresh('deeptech'), { deeptechs: [{ data: {} }] }, tab('deeptech')],
    ['traccia-interviste', null],
    ['esperimento-problema', fresh('experiment')],
    ['interviste', tab('interviste')],
    ['sintesi', tab('interviste')],
    ['persona', fresh('persona'), { personas: [{ data: {} }] }, tab('clienti')],
    ['problema-validato', tab('canvas')],
    ['tam-sam-som', fresh('market'), { markets: [{ data: {} }] }, tab('mercato')],
    ['concorrenti', fresh('competitors'), { competitors: [{ data: {} }] }, tab('mercato')],
    ['vantaggio', tab('canvas')],
    ['ricavi', tab('canvas')],
    ['vpc', fresh('vpc'), { vpcs: [{ data: {} }] }, tab('clienti')],
    ['smoke-test', fresh('experiment')],
    ['mvp', null],
    ['prezzo-canale', fresh('experiment')],
    ['impegni', tab('interviste')],
    ['canvas-validato', tab('canvas')],
    ['tappa-tecnica', fresh('deeptech'), { deeptechs: [{ data: {} }] }, tab('deeptech')],
    ['decisione', fresh('decision')],
    ['stato', null],
    ['lezioni', tab('esperimenti')],
    ['patto-soci', '#/squadra/quote'],
    ['proprieta', null],
    ['piano-finanziario', null],
    ['go-to-market', null],
    ['finanza-non-diluitiva', null],
    ['costituzione', null],
    ['pitch', null],
    ['investitori', null],
  ];

  it('la tabella copre tutti i passi', () => {
    assert.deepEqual(CASES.map(([key]) => key), ROADMAP_STEPS.map((s) => s.key));
  });

  for (const [key, empty, linked, withLinked] of CASES) {
    it(`${key} porta a ${empty ?? 'nessuna pagina'}${linked ? `, o a ${withLinked} se la scheda esiste già` : ''}`, () => {
      assert.equal(stepState(key).href, empty);
      if (linked) assert.equal(stepState(key, linked).href, withLinked);
    });
  }
});

describe('avanzamento della roadmap', () => {
  it('le fasi sono otto, i passi 45 con chiavi uniche, e stepByKey li ritrova', () => {
    assert.equal(ROADMAP.length, 8);
    assert.equal(ROADMAP_STEPS.length, 45);
    assert.equal(new Set(ROADMAP_STEPS.map((s) => s.key)).size, 45);
    for (const step of ROADMAP_STEPS) assert.equal(stepByKey(step.key).phase, ROADMAP.find((p) => p.steps.some((s) => s.key === step.key)).key);
    assert.equal(stepByKey('inesistente'), null);
    assert.equal(stepByKey(undefined), null);
  });

  it('finita la prima fase, la fase attuale è la seconda e il prossimo passo è il suo primo', () => {
    const rm = roadmapState(idea({ status: 'nuova', data: { roadmap: allDone(ROADMAP[0].steps.map((s) => s.key)) } }), {});
    assert.equal(rm.current.phase.key, 'scelta');
    assert.equal(rm.next.step.key, 'dieci-idee');
    assert.equal(rm.phases[1].previousIncomplete, false);
    assert.equal(rm.phases[2].previousIncomplete, true);
    assert.equal(rm.done, 6);
    assert.equal(rm.total, 37);
    assert.equal(rm.percent, 16);
  });

  it('una fase con tutti i passi obbligatori fatti è completa anche se resta un passo facoltativo', () => {
    const phase = ROADMAP.find((p) => p.key === 'ipotesi');
    const required = phase.steps.filter((s) => !s.optional).map((s) => s.key);
    const rm = roadmapState(idea({ data: { roadmap: allDone(required) } }), {});
    const p = rm.phases.find((x) => x.phase.key === 'ipotesi');
    assert.equal(p.complete, true);
    assert.equal(p.done, p.total - 1);
  });

  it('un segno illeggibile non conta come fatto', () => {
    const rm = roadmapState(idea({ data: { roadmap: { 'team-canvas': 'fatto', regole: `done|x|${AT}` } } }), {});
    assert.equal(stepOf(rm, 'team-canvas').status, 'todo');
    assert.equal(stepOf(rm, 'regole').status, 'todo');
    assert.equal(rm.done, 0);
  });

  it('senza la fase azienda, un idea non scelta con tutto fatto è al 100% e non ha un prossimo passo', () => {
    const keys = ROADMAP.filter((p) => !p.onlyChosen).flatMap((p) => p.steps.map((s) => s.key));
    const rm = roadmapState(idea({ status: 'validazione', data: { roadmap: allDone(keys) } }), {});
    assert.equal(rm.percent, 100);
    assert.equal(rm.next, null);
    assert.equal(rm.current, null);
  });

  it('per l idea scelta conta anche la fase azienda, fino al 100%', () => {
    const keys = ROADMAP_STEPS.map((s) => s.key);
    const almost = roadmapState(idea({ status: 'scelta', data: { roadmap: allDone(keys.slice(0, -1)) } }), {});
    assert.equal(almost.next.step.key, 'investitori');
    assert.equal(almost.current.phase.key, 'azienda');
    assert.equal(almost.percent, 98);
    const full = roadmapState(idea({ status: 'scelta', data: { roadmap: allDone(keys) } }), {});
    assert.equal(full.percent, 100);
    assert.equal(full.next, null);
    assert.equal(full.current, null);
    assert.ok(full.phases.every((p) => p.complete));
  });

  it('negli esempi le fasi già superate dipendono dallo stato dell idea', () => {
    for (const [status, firstOpen] of [['nuova', 'ipotesi'], ['esplorazione', 'clienti'], ['validazione', 'soluzione'], ['parcheggiata', 'decisione'], ['scelta', 'azienda']]) {
      const rm = roadmapState(idea({ status }), { example: true });
      const open = rm.phases.findIndex((p) => p.phase.key === firstOpen);
      assert.ok(rm.phases.slice(0, open).every((p) => p.complete), status);
      assert.equal(rm.phases[open].complete, false, status);
    }
    const plain = roadmapState(idea({ status: 'scelta' }), {});
    assert.equal(plain.done, 0, 'fuori dagli esempi nessun passo è fatto senza un segno');
  });
});
