import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { setupDom, flush } from '../setup/dom.mjs';
import { IDS, ME, boardItems, members, revision, XSS } from '../setup/fixtures.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.js') || path.endsWith('.ts') ? [path] : [];
  });
}

let api;
let store;
let router;
let app;
let original;
let outlet;

before(async () => {
  setupDom();
  ({ api } = await import('../../assets/js/lib/api.js'));
  store = await import('../../assets/js/store.js');
  router = await import('../../assets/js/router.js');
  app = await import('../../assets/js/app.js');
  original = { ...api };
  router.clearRoutes();
  app.registerRoutes();
});

beforeEach(async () => {
  store.resetStore();
  store.state.user = { id: ME };
  store.setMembers(members().map((m) => ({ ...m, display_name: `${m.display_name} ${XSS}` })));
  boardItems({ xss: true }).forEach((i) => store.applyItem(i));
  api.listRevisions = async () => [revision({ title: XSS, message: XSS })];
  api.itemHistory = async () => [revision({ title: XSS, data: { pitch: XSS } })];
  api.listComments = async (id) => [{ id: 'c0000000-0000-4000-8000-000000000001', item_id: id, author_id: ME, body: XSS, created_at: '2026-10-17T10:00:00Z' }];
  api.activitySince = async () => [];
  api.auditLog = async () => [];
  api.listFactors = async () => [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: XSS, created_at: '2026-10-01T10:00:00Z' }];
  api.aiUsageLastDay = async () => 0;
  outlet = document.createElement('main');
  document.body.append(outlet);
  await router.startRouter(outlet, { fallback: app.notFoundView });
});

afterEach(() => {
  router.stopRouter();
  outlet.remove();
  Object.assign(api, original);
});

test('content written by users never becomes HTML on any page', async () => {
  const pages = [
    '#/',
    '#/idee',
    '#/idee?vista=tabella',
    ...['panoramica', 'canvas', 'esperimenti', 'interviste', 'voti', 'commenti', 'storico'].map((t) => `#/idea/${IDS.idea}/${t}`),
    `#/elemento/${IDS.canvas}`,
    `#/elemento/${IDS.experiment}`,
    `#/elemento/${IDS.interview}/commenti`,
    '#/esperimenti',
    '#/interviste',
    '#/decisioni',
    '#/valutazione',
    '#/generatore',
    '#/storico',
    `#/storico/${IDS.idea}`,
    `#/diff/${IDS.idea}/1`,
    '#/cestino',
    '#/team',
    '#/profilo',
    `#/modifica/${IDS.idea}`,
  ];
  let shownAsText = 0;
  for (const page of pages) {
    await router.render(page);
    await flush(5);
    assert.equal(document.querySelector('img[src="x"]'), null, page);
    assert.equal(window.__xss, undefined, page);
    if (document.body.textContent.includes('<img src=x')) shownAsText += 1;
  }
  assert.ok(shownAsText >= pages.length - 2, `il testo malevolo deve comparire come testo: ${shownAsText}`);
});

test('no source file builds HTML from strings or evaluates code', () => {
  const forbidden = [/\.innerHTML\s*=/, /outerHTML\s*=/, /insertAdjacentHTML/, /document\.write/, /\beval\(/, /new Function\(/, /setAttribute\(\s*['"]style['"]/];
  const files = [...sourceFiles(join(ROOT, 'assets/js')), ...sourceFiles(join(ROOT, 'supabase/functions'))];
  assert.ok(files.length > 20);
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of forbidden) assert.doesNotMatch(source, pattern, `${file}: ${pattern}`);
  }
});

test('the page declares a strict Content Security Policy', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const csp = html.match(/Content-Security-Policy"\s+content="([^"]+)"/)[1];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self' https:\/\/cdn\.jsdelivr\.net;/);
  assert.match(csp, /style-src 'self';/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/);
  assert.doesNotMatch(html, /<script(?![^>]*type="module"[^>]*src=)/);
  assert.match(html, /name="referrer" content="no-referrer"/);
});

test('the public configuration contains only the anon key', () => {
  const config = readFileSync(join(ROOT, 'assets/js/config.js'), 'utf8');
  const jwt = config.match(/'(eyJ[^']+)'/)[1];
  const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
  assert.equal(payload.role, 'anon');
  assert.doesNotMatch(config, /service_role|sk-ant|ANTHROPIC/i);
  for (const file of sourceFiles(join(ROOT, 'assets/js'))) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /sk-ant-[a-z0-9]/i, file);
  }
});

test('external scripts are pinned to exact versions', () => {
  const files = [...sourceFiles(join(ROOT, 'assets/js')), join(ROOT, 'supabase/functions/claude/index.ts')];
  for (const file of files) {
    for (const [, spec] of readFileSync(file, 'utf8').matchAll(/from '((?:https|npm):[^']+)'/g)) {
      assert.match(spec, /@\d+\.\d+\.\d+/, `${file}: ${spec}`);
    }
  }
});

test('every public table in the schema has row level security', () => {
  const schema = readFileSync(join(ROOT, 'supabase/schema.sql'), 'utf8');
  const tables = [...schema.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(tables.sort(), ['ai_usage', 'audit_log', 'comments', 'items', 'members', 'revisions']);
  for (const table of tables) {
    assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`), table);
  }
  assert.match(schema, /coalesce\(auth\.jwt\(\) ->> 'aal', ''\) = 'aal2'/);
});

test('GitHub Actions are pinned to full commit SHAs and the workflow starts read-only', () => {
  const dir = join(ROOT, '.github/workflows');
  const files = readdirSync(dir).filter((f) => f.endsWith('.yml'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = readFileSync(join(dir, file), 'utf8');
    const uses = [...source.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
    assert.ok(uses.length > 0, file);
    for (const ref of uses) assert.match(ref, /@[0-9a-f]{40}$/, `${file}: ${ref}`);
    assert.match(source, /^permissions:\n {2}contents: read$/m, `${file}: permessi predefiniti di sola lettura`);
    assert.doesNotMatch(source, /pull_request_target/, `${file}: pull_request_target espone i segreti`);
  }
});

test('auth config closes signups but keeps email and password login on', () => {
  const config = readFileSync(join(ROOT, 'supabase/config.toml'), 'utf8');
  const section = (name) => config.split(/^\[/m).find((s) => s.startsWith(`${name}]`)) || '';
  assert.match(section('auth'), /^enable_signup = false$/m, 'registrazioni pubbliche chiuse');
  assert.match(section('auth.email'), /^enable_signup = true$/m, 'su Supabase questa voce accende il login con email');
  assert.match(section('auth.mfa.totp'), /^enroll_enabled = true$/m);
  assert.match(section('auth'), /^minimum_password_length = 12$/m);
});
