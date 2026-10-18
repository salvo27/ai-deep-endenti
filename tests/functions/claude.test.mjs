import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HttpError, MAX_BODY_BYTES, createHandler, extractText, parseOrigins, readRequest } from '../../supabase/functions/claude/handler.js';
import { TASKS, systemPrompt, userMessage } from '../../supabase/functions/claude/prompts.js';

const ORIGIN = 'https://salvo27.github.io';
const USER = '00000000-0000-4000-8000-00000000000a';

function setup(over = {}) {
  const logs = [];
  const usage = { count: 0, recorded: [], finished: [] };
  const claudeCalls = [];
  const deps = {
    allowedOrigins: `${ORIGIN}, http://localhost:8080/ ,not-an-origin`,
    dailyLimit: 3,
    verifyCaller: async (auth) => (auth === 'Bearer buono' ? { userId: USER, member: true } : auth === 'Bearer estraneo' ? { userId: 'x', member: false } : null),
    countUsageToday: async () => usage.count,
    recordUsage: async (u) => {
      usage.recorded.push(u);
      return 7;
    },
    finishUsage: async (id, u) => usage.finished.push([id, u]),
    callClaude: async (args) => {
      claudeCalls.push(args);
      return { model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Critica: manca il cliente.' }], usage: { input_tokens: 100, output_tokens: 20 } };
    },
    log: (event, fields) => logs.push({ event, ...fields }),
    ...over,
  };
  return { handle: createHandler(deps), logs, usage, claudeCalls };
}

function request({ method = 'POST', origin = ORIGIN, auth = 'Bearer buono', body = { task: 'critique', context: 'Idea: alfa' }, headers = {} } = {}) {
  const h = { 'content-type': 'application/json', ...headers };
  if (origin) h.origin = origin;
  if (auth) h.authorization = auth;
  return new Request('https://x.supabase.co/functions/v1/claude', {
    method,
    headers: h,
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
}

test('parseOrigins keeps only clean origins', () => {
  assert.deepEqual(parseOrigins(' https://a.it/, http://localhost:8080 ,javascript:x, https://a.it/path'), ['https://a.it', 'http://localhost:8080']);
  assert.deepEqual(parseOrigins(undefined), []);
});

test('CORS preflight is answered only for allowed origins', async () => {
  const { handle } = setup();
  const ok = await handle(request({ method: 'OPTIONS' }));
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  const denied = await handle(request({ method: 'OPTIONS', origin: 'https://evil.example' }));
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('requests from other origins or with other methods are refused', async () => {
  const { handle, claudeCalls } = setup();
  assert.equal((await handle(request({ origin: 'https://evil.example' }))).status, 403);
  assert.equal((await handle(request({ origin: null }))).status, 403);
  assert.equal((await handle(request({ method: 'GET' }))).status, 405);
  assert.equal(claudeCalls.length, 0);
});

test('only team members with two factors can use Claude', async () => {
  const { handle, claudeCalls } = setup();
  assert.equal((await handle(request({ auth: null }))).status, 401);
  assert.equal((await handle(request({ auth: 'Bearer falso' }))).status, 401);
  const outsider = await handle(request({ auth: 'Bearer estraneo' }));
  assert.equal(outsider.status, 403);
  assert.match((await outsider.json()).error, /verifica in due passaggi/);
  assert.equal(claudeCalls.length, 0);
});

test('the body is validated by size, then format, then task and content', async () => {
  const { handle, claudeCalls } = setup();
  const cases = [
    [{ headers: { 'content-length': String(MAX_BODY_BYTES + 1) } }, 413],
    [{ body: 'x'.repeat(MAX_BODY_BYTES + 10) }, 413],
    [{ body: '{non json' }, 400],
    [{ body: '[1,2]' }, 400],
    [{ body: { task: 'critique', context: 'x', extra: true } }, 400],
    [{ body: { task: 'critique', context: 42 } }, 400],
    [{ body: { task: 'inventato', context: 'x' } }, 400],
    [{ body: { task: '__proto__', context: 'x' } }, 400],
    [{ body: { task: 'toString', context: 'x' } }, 400],
    [{ body: { task: 'critique', context: '  \u0000  ' } }, 400],
    [{ body: { task: 'cell_ideas', context: 'x'.repeat(TASKS.cell_ideas.maxContext + 1) } }, 413],
  ];
  for (const [opts, status] of cases) {
    const res = await handle(request(opts));
    assert.equal(res.status, status, JSON.stringify(opts).slice(0, 80));
    assert.equal(typeof (await res.json()).error, 'string');
  }
  assert.equal(claudeCalls.length, 0);
});

test('a valid request calls Claude with the task prompt and records usage', async () => {
  const { handle, usage, claudeCalls, logs } = setup();
  const res = await handle(request({ body: { task: 'interview_questions', context: 'Idea: alfa per un cliente' } }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), { text: 'Critica: manca il cliente.', truncated: false, remaining: 2 });
  assert.equal(claudeCalls[0].system, systemPrompt('interview_questions'));
  assert.match(claudeCalls[0].system, /Mom Test/);
  assert.equal(claudeCalls[0].user, userMessage('Idea: alfa per un cliente'));
  assert.deepEqual(usage.recorded, [{ userId: USER, task: 'interview_questions' }]);
  assert.deepEqual(usage.finished, [[7, { model: 'claude-opus-5-5', inputTokens: 100, outputTokens: 20 }]]);
  assert.ok(logs.every((l) => !JSON.stringify(l).includes('alfa per un cliente')), 'i log non contengono il contenuto delle board');
});

test('the daily limit is enforced before calling Claude', async () => {
  const { handle, usage, claudeCalls } = setup();
  usage.count = 3;
  const res = await handle(request());
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /limite di 3 richieste/);
  assert.equal(claudeCalls.length, 0);
  assert.equal(usage.recorded.length, 0);
});

test('refusals, truncations and odd responses are handled without trusting the model', async () => {
  const refused = setup({ callClaude: async () => ({ stop_reason: 'refusal', content: [], stop_details: { category: 'cyber' } }) });
  const r1 = await refused.handle(request());
  assert.equal(r1.status, 422);

  const long = setup({ callClaude: async () => ({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'y'.repeat(30000) }], usage: {} }) });
  const body = await (await long.handle(request())).json();
  assert.equal(body.truncated, true);
  assert.equal(body.text.length, 20000);

  const empty = setup({ callClaude: async () => ({ stop_reason: 'end_turn', content: [{ type: 'tool_use', input: {} }] }) });
  assert.equal((await empty.handle(request())).status, 502);
});

test('unexpected errors become a generic message and the log carries no details', async () => {
  const secret = 'sk-ant-segreto-che-non-deve-uscire';
  const { handle, logs } = setup({
    callClaude: async () => {
      const error = new Error(`upstream failure with ${secret}`);
      error.status = 500;
      throw error;
    },
  });
  const res = await handle(request());
  assert.equal(res.status, 502);
  const text = await res.text();
  assert.doesNotMatch(text, /sk-ant|upstream/);
  assert.ok(logs.every((l) => !JSON.stringify(l).includes(secret)));
  assert.deepEqual(logs.at(-1), { event: 'claude_failed', kind: 'Error', status: 500 });
});

test('known upstream conditions keep their specific message', async () => {
  const { handle } = setup({
    callClaude: async () => {
      throw new HttpError(503, 'Claude è molto richiesto in questo momento. Riprova tra un minuto.');
    },
  });
  const res = await handle(request());
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /molto richiesto/);
});

test('a failure while saving usage does not lose the answer', async () => {
  const { handle, logs } = setup({ finishUsage: async () => { throw new Error('db giù'); } });
  const res = await handle(request());
  assert.equal(res.status, 200);
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(logs.some((l) => l.event === 'usage_update_failed'));
});

test('readRequest and extractText work on their own', async () => {
  const parsed = await readRequest(new Request('https://x', { method: 'POST', body: JSON.stringify({ task: 'critique', context: ' ciao\u0007 ' }) }));
  assert.deepEqual(parsed, { task: 'critique', context: 'ciao' });
  assert.throws(() => extractText(null), /non valida/);
  assert.deepEqual(extractText({ stop_reason: 'end_turn', content: [{ type: 'text', text: ' a ' }, { type: 'text', text: 'b' }] }), { text: 'a \nb', truncated: false });
});

test('every task has instructions and tells the model to treat the board as data', () => {
  for (const task of Object.keys(TASKS)) {
    const prompt = systemPrompt(task);
    assert.match(prompt, /materiale da analizzare/);
    assert.match(prompt, /Non inventare dati/);
    assert.ok(TASKS[task].maxContext > 0);
  }
  assert.match(userMessage('x'), /<board>\nx\n<\/board>/);
});
