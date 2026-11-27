// The claude function in a site with many projects: every request names its project, only who can read that project
// gets an answer, and the answer and the errors come in the language the site asks for.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError, MAX_BODY_BYTES, createHandler } from '../../supabase/functions/claude/handler.js';
import { TASKS, systemPrompt, userMessage } from '../../supabase/functions/claude/prompts.js';
import { DEFAULT_LANGUAGE, ERRORS, LANGUAGES } from '../../supabase/functions/claude/texts.js';

const ORIGIN = 'https://board.example';
const ANNA = '00000000-0000-4000-8000-00000000000a';
const ALFA = 'aaaaaaaa-0000-4000-8000-000000000001';
const BETA = 'bbbbbbbb-0000-4000-8000-000000000002';
const OK_ANSWER = { model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Risposta' }], usage: { input_tokens: 10, output_tokens: 5 } };

// Anna can read Alfa only; the usage counter is hers, whatever the project.
function setup(over = {}) {
  const calls = { canRead: [], count: [], recorded: [], claude: [] };
  const deps = {
    allowedOrigins: ORIGIN,
    dailyLimit: 3,
    verifyCaller: async (auth) => (auth === 'Bearer anna' ? { userId: ANNA } : null),
    canRead: async (auth, project) => {
      calls.canRead.push([auth, project]);
      return project === ALFA;
    },
    countUsageToday: async (...args) => {
      calls.count.push(args);
      return over.used ?? 0;
    },
    recordUsage: async (usage) => {
      calls.recorded.push(usage);
      return 1;
    },
    finishUsage: async () => {},
    callClaude: async (args) => {
      calls.claude.push(args);
      return over.answer ? over.answer() : OK_ANSWER;
    },
    log: () => {},
    ...over.deps,
  };
  return { handle: createHandler(deps), calls };
}

const body = (over = {}) => ({ task: 'critique', context: 'Idea: alfa', project: ALFA, ...over });

function post(payload = body(), { auth = 'Bearer anna', headers = {} } = {}) {
  const h = { 'content-type': 'application/json', origin: ORIGIN, ...headers };
  if (auth) h.authorization = auth;
  return new Request('https://x.supabase.co/functions/v1/claude', { method: 'POST', headers: h, body: typeof payload === 'string' ? payload : JSON.stringify(payload) });
}

async function answer(res) {
  return { status: res.status, ...(await res.json()) };
}

describe('il progetto della richiesta', () => {
  for (const [what, project] of [
    ['manca', undefined],
    ['è vuoto', ''],
    ['è un numero', 42],
    ['è null', null],
    ['non è un uuid', 'alfa'],
    ['è un uuid con un carattere in più', `${ALFA}0`],
    ['è un uuid con un carattere in meno', ALFA.slice(1)],
    ['è un uuid con spazi', ` ${ALFA}`],
    ['è un elenco', [ALFA]],
  ]) {
    it(`se ${what} la richiesta è rifiutata prima di chiedere i permessi`, async () => {
      const { handle, calls } = setup();
      const res = await answer(await handle(post(body({ project }))));
      assert.deepEqual(res, { status: 400, error: ERRORS.en.invalid_project, code: 'invalid_project' });
      assert.deepEqual(calls.canRead, []);
      assert.deepEqual(calls.claude, []);
    });
  }

  it('un uuid in maiuscolo vale come lo stesso progetto', async () => {
    const { handle, calls } = setup();
    assert.equal((await handle(post(body({ project: ALFA.toUpperCase() })))).status, 200);
    assert.deepEqual(calls.canRead, [['Bearer anna', ALFA]]);
  });

  it('i permessi si chiedono per il progetto della richiesta, con il token di chi chiama', async () => {
    const { handle, calls } = setup();
    assert.equal((await handle(post())).status, 200);
    assert.deepEqual(calls.canRead, [['Bearer anna', ALFA]]);
    assert.equal(calls.claude.length, 1);
  });

  it('chi non può leggere il progetto non ottiene nulla e non consuma richieste', async () => {
    const { handle, calls } = setup();
    const res = await answer(await handle(post(body({ project: BETA }))));
    assert.deepEqual(res, { status: 403, error: ERRORS.en.not_member, code: 'not_member' });
    assert.deepEqual(calls.canRead, [['Bearer anna', BETA]]);
    assert.deepEqual([calls.count, calls.recorded, calls.claude], [[], [], []]);
  });

  it('senza accesso si risponde 401 anche se la richiesta è sbagliata', async () => {
    const { handle, calls } = setup();
    for (const payload of [body({ project: 'alfa' }), '{non json', body()]) {
      assert.equal((await handle(post(payload, { auth: null }))).status, 401);
    }
    assert.deepEqual(calls.canRead, []);
  });

  it('un errore nel controllo dei permessi diventa il messaggio generico', async () => {
    const { handle, calls } = setup({ deps: { canRead: async () => { throw new Error('rete giù'); } } });
    const res = await answer(await handle(post()));
    assert.deepEqual(res, { status: 502, error: ERRORS.en.unavailable, code: 'unavailable' });
    assert.deepEqual(calls.claude, []);
  });
});

describe('il limite giornaliero', () => {
  it('è della persona: si conta e si registra senza progetto', async () => {
    const { handle, calls } = setup();
    await handle(post());
    assert.deepEqual(calls.count, [[ANNA]]);
    assert.deepEqual(calls.recorded, [{ userId: ANNA, task: 'critique' }]);
  });

  for (const [used, status] of [[2, 200], [3, 429], [4, 429]]) {
    it(`con ${used} richieste su 3 nelle ultime 24 ore la risposta è ${status}`, async () => {
      const { handle, calls } = setup({ used });
      const res = await handle(post());
      assert.equal(res.status, status);
      assert.equal(calls.claude.length, status === 200 ? 1 : 0);
      if (status === 200) assert.equal((await res.json()).remaining, 0);
    });
  }
});

describe('la lingua della risposta', () => {
  for (const [language, expected] of [['it', 'it'], ['en', 'en'], [undefined, 'en'], [null, 'en']]) {
    it(`con language ${JSON.stringify(language)} Claude riceve istruzioni e board in ${expected}`, async () => {
      const { handle, calls } = setup();
      const payload = body({ language, task: 'next_experiment' });
      if (language === undefined) delete payload.language;
      assert.equal((await handle(post(payload))).status, 200);
      assert.deepEqual(calls.claude, [{ system: systemPrompt('next_experiment', expected), user: userMessage('Idea: alfa', expected) }]);
    });
  }

  for (const language of ['fr', 'IT', 'En', 'italiano', '', 1, true, ['it'], { it: true }]) {
    it(`language ${JSON.stringify(language)} non è valida: la richiesta è rifiutata in inglese`, async () => {
      const { handle, calls } = setup();
      const res = await answer(await handle(post(body({ language }))));
      assert.deepEqual(res, { status: 400, error: ERRORS.en.invalid_request, code: 'invalid_request' });
      assert.deepEqual(calls.claude, []);
    });
  }

  it('l inglese è la lingua predefinita, e le lingue sono quelle del sito', () => {
    assert.equal(DEFAULT_LANGUAGE, 'en');
    assert.deepEqual(LANGUAGES, ['en', 'it']);
  });
});

// Each case: what goes wrong, how to make it go wrong, the status and the code the site receives.
const FAILURES = [
  ['senza accesso', { auth: null }, 401, 'sign_in_required'],
  ['fuori dal progetto', { body: { project: BETA } }, 403, 'not_member'],
  ['con un compito sconosciuto', { body: { task: 'inventato' } }, 400, 'unknown_task'],
  ['con un campo in più', { body: { extra: 1 } }, 400, 'invalid_request'],
  ['senza contenuto', { body: { context: '   ' } }, 400, 'empty_context'],
  ['con troppo testo', { body: { task: 'cell_ideas', context: 'x'.repeat(TASKS.cell_ideas.maxContext + 1) } }, 413, 'context_too_long'],
  ['oltre il limite giornaliero', { used: 3 }, 429, 'daily_limit'],
  ['se Claude rifiuta', { answer: () => ({ stop_reason: 'refusal', content: [] }) }, 422, 'refusal'],
  ['se Claude non scrive testo', { answer: () => ({ stop_reason: 'end_turn', content: [] }) }, 502, 'empty_response'],
  ['se la risposta non è un oggetto', { answer: () => 'testo' }, 502, 'invalid_response'],
  ['se Claude è molto richiesto', { answer: () => { throw new HttpError(503, 'busy'); } }, 503, 'busy'],
  ['se Claude ci mette troppo', { answer: () => { throw new HttpError(504, 'timeout'); } }, 504, 'timeout'],
  ['con un errore inatteso', { answer: () => { throw new Error('boom'); } }, 502, 'unavailable'],
];

describe('gli errori parlano la lingua della richiesta', () => {
  for (const [what, how, status, code] of FAILURES) {
    for (const language of LANGUAGES) {
      it(`${what}: ${status} con il testo ${language} di ${code}`, async () => {
        const { handle } = setup({ used: how.used, answer: how.answer });
        const res = await answer(await handle(post(body({ language, ...how.body }), { auth: 'auth' in how ? how.auth : 'Bearer anna' })));
        const text = code === 'daily_limit' ? ERRORS[language].daily_limit(3) : ERRORS[language][code];
        assert.deepEqual(res, { status, error: text, code });
      });
    }
  }

  it('i due testi di ogni errore sono diversi', () => {
    for (const code of Object.keys(ERRORS.en)) {
      const [en, it] = [ERRORS.en[code], ERRORS.it[code]].map((t) => (typeof t === 'function' ? t(3) : t));
      assert.notEqual(en, it, code);
    }
  });

  it('il limite giornaliero dice quante richieste, in ogni lingua', () => {
    assert.match(ERRORS.it.daily_limit(40), /\b40\b/);
    assert.match(ERRORS.en.daily_limit(40), /\b40\b/);
  });

  for (const [what, payload, headers] of [
    ['non è JSON', '{"language":"it",', {}],
    ['è troppo grande', JSON.stringify({ ...body(), language: 'it', context: 'x'.repeat(MAX_BODY_BYTES) }), {}],
    ['dichiara una dimensione troppo grande', JSON.stringify(body({ language: 'it' })), { 'content-length': String(MAX_BODY_BYTES + 1) }],
  ]) {
    it(`se la richiesta ${what} la lingua non si conosce e l errore è in inglese`, async () => {
      const { handle } = setup();
      const res = await answer(await handle(post(payload, { headers })));
      assert.equal(res.error, ERRORS.en[res.code]);
      assert.ok(res.status === 400 || res.status === 413, String(res.status));
    });
  }

  it('fuori dal sito il rifiuto è in inglese, senza leggere la richiesta', async () => {
    const { handle } = setup();
    const evil = new Request('https://x.supabase.co/functions/v1/claude', { method: 'POST', headers: { origin: 'https://evil.example' }, body: JSON.stringify(body({ language: 'it' })) });
    assert.deepEqual(await answer(await handle(evil)), { status: 403, error: ERRORS.en.origin_not_allowed, code: 'origin_not_allowed' });
    const get = new Request('https://x.supabase.co/functions/v1/claude', { method: 'GET', headers: { origin: ORIGIN } });
    assert.deepEqual(await answer(await handle(get)), { status: 405, error: ERRORS.en.method_not_allowed, code: 'method_not_allowed' });
  });
});
