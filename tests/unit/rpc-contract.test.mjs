import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// The site and the database are written separately: these checks read both sources and make sure that every call
// of the site names a function or a table the schema has, with the parameter names PostgREST will look for.
// The Edge Functions are checked in tests/functions.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SITE = join(ROOT, 'assets/js');
const SCHEMA = withoutComments(readFileSync(join(ROOT, 'supabase/schema.sql'), 'utf8'), { sql: true });

const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.js') ? [path] : [];
  });
const sources = files(SITE).map((path) => ({ file: relative(SITE, path).split(sep).join('/'), source: withoutComments(readFileSync(path, 'utf8')) }));

/** The source with its comments blanked out, line breaks kept: what is left are code and strings. */
export function withoutComments(source, { sql = false } = {}) {
  let out = '';
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === "'" || c === '"' || (c === '`' && !sql)) {
      const from = i;
      i++;
      while (i < source.length && source[i] !== c) i += source[i] === '\\' && !sql ? 2 : 1;
      out += source.slice(from, i + 1);
    } else if ((sql && c === '-' && source[i + 1] === '-') || (!sql && c === '/' && source[i + 1] === '/')) {
      while (i < source.length && source[i] !== '\n') i++;
      out += '\n';
    } else if (!sql && c === '/' && source[i + 1] === '*') {
      const stop = source.indexOf('*/', i + 2);
      const comment = source.slice(i, stop < 0 ? source.length : stop + 2);
      out += comment.replace(/[^\n]/g, ' ');
      i += comment.length - 1;
    } else out += c;
  }
  return out;
}

/** The index just after the bracket that closes the one at `start`, skipping strings. Comments must be gone already. */
function closing(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (c === "'" || c === '"' || c === '`') {
      i++;
      while (i < source.length && source[i] !== c) i += source[i] === '\\' ? 2 : 1;
    } else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error(`Unbalanced bracket at ${start}`);
}

/** Splits a list on the commas that are not inside brackets or strings. */
function topLevel(list) {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === "'" || c === '"' || c === '`') {
      i++;
      while (i < list.length && list[i] !== c) i += list[i] === '\\' ? 2 : 1;
    } else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) {
      parts.push(list.slice(from, i));
      from = i + 1;
    }
  }
  parts.push(list.slice(from));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** The keys of an object literal written as `{ a: 1, b, 'c': 2, ...rest }`; null when it cannot be read statically. */
export function objectKeys(literal) {
  const inner = literal.trim().replace(/^\{/, '').replace(/\}$/, '');
  const keys = [];
  for (const part of topLevel(inner)) {
    if (part.startsWith('...')) return null;
    const m = part.match(/^(?:(['"])([^'"]+)\1|([A-Za-z_$][\w$]*))\s*(?::|$)/);
    if (!m) return null;
    keys.push(m[2] || m[3]);
  }
  return keys;
}

/** Every `.rpc('name', args)` of a source, with the keys of its arguments. */
export function rpcCalls(source) {
  const calls = [];
  for (const m of source.matchAll(/\.rpc\(\s*(['"])([a-z_]+)\1/g)) {
    const open = source.indexOf('(', m.index);
    const args = topLevel(source.slice(open + 1, closing(source, open) - 1));
    const params = args[1];
    let keys = [];
    if (params === undefined) keys = [];
    else if (params.startsWith('{')) keys = objectKeys(params);
    else if (/^[A-Za-z_$][\w$]*$/.test(params)) {
      // A variable: its object literal in the same file.
      const decl = source.match(new RegExp(`(?:const|let)\\s+${params}\\s*=\\s*\\{`));
      keys = decl ? objectKeys(source.slice(decl.index + decl[0].length - 1, closing(source, decl.index + decl[0].length - 1))) : null;
    } else keys = null;
    const line = source.slice(0, m.index).split('\n').length;
    calls.push({ name: m[2], keys, line });
  }
  return calls;
}

/** The functions of the schema: for every name, each of its signatures with the parameter names and which have a default. */
export function schemaFunctions(source) {
  const sql = withoutComments(source, { sql: true });
  const functions = new Map();
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gi)) {
    const open = m.index + m[0].length - 1;
    const list = sql.slice(open + 1, closing(sql, open) - 1);
    const params = topLevel(list).map((p) => {
      const [name] = p.split(/\s+/);
      return { name, optional: /\bdefault\b|=/i.test(p) };
    });
    if (!functions.has(m[1])) functions.set(m[1], []);
    functions.get(m[1]).push(params);
  }
  return functions;
}

export const schemaTables = (sql) => new Set([...sql.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]));

// PostgREST finds a function by the names of the arguments it gets: every one must exist, every one without a default must be there.
export function signatureFits(params, keys) {
  const names = params.map((p) => p.name);
  return keys.every((k) => names.includes(k)) && params.filter((p) => !p.optional).every((p) => keys.includes(p.name));
}

const FUNCTIONS = schemaFunctions(SCHEMA);
const TABLES = schemaTables(SCHEMA);

describe('lettura dei sorgenti', () => {
  it('legge le chiamate con argomenti scritti sul posto, abbreviati o in una variabile dello stesso file', () => {
    const source = "a.rpc('uno');\nb.rpc('due', { p_a: x(1, 2), p_b, 'p_c': { d: 1 } });\nconst params = { p_x: 1 };\nc.rpc('tre', params);\nd.rpc(name, params);";
    assert.deepEqual(rpcCalls(source).map(({ name, keys }) => [name, keys]), [['uno', []], ['due', ['p_a', 'p_b', 'p_c']], ['tre', ['p_x']]]);
  });

  it('non indovina gli argomenti che non si possono leggere', () => {
    assert.deepEqual(rpcCalls("a.rpc('uno', { ...extra });\nb.rpc('due', build());").map((c) => c.keys), [null, null]);
  });

  it('legge le funzioni dello schema con i parametri e i valori di default, anche su più righe e con commenti', () => {
    const sql = "create or replace function public.f(\n  p_a uuid, -- il progetto dell'idea\n  p_b text default 'x',\n  p_c jsonb default '{}'::jsonb\n)\nreturns void";
    assert.deepEqual(schemaFunctions(sql).get('f'), [[{ name: 'p_a', optional: false }, { name: 'p_b', optional: true }, { name: 'p_c', optional: true }]]);
    assert.deepEqual(schemaFunctions('create function public.g() returns void').get('g'), [[]]);
  });

  for (const [keys, fits] of [
    [['p_a'], true],
    [['p_a', 'p_b'], true],
    [[], false],
    [['p_a', 'p_z'], false],
    [['p_b'], false],
  ]) {
    it(`gli argomenti ${JSON.stringify(keys)} ${fits ? 'trovano' : 'non trovano'} f(p_a, p_b default)`, () => {
      assert.equal(signatureFits([{ name: 'p_a', optional: false }, { name: 'p_b', optional: true }], keys), fits);
    });
  }
});

describe('il sito e lo schema del database', () => {
  const calls = sources.flatMap(({ file, source }) => rpcCalls(source).map((call) => ({ ...call, file })));

  it('il sito chiama delle funzioni del database', () => {
    assert.ok(calls.length >= 15, `trovate solo ${calls.length} chiamate`);
  });

  it('gli argomenti di ogni chiamata si leggono dal sorgente', () => {
    assert.deepEqual(calls.filter((c) => c.keys === null).map((c) => `${c.file}:${c.line} ${c.name}`), []);
  });

  it('ogni funzione chiamata esiste nello schema', () => {
    assert.deepEqual(calls.filter((c) => !FUNCTIONS.has(c.name)).map((c) => `${c.file}:${c.line} ${c.name}`), []);
  });

  it('ogni chiamata usa i nomi dei parametri di una versione della funzione', () => {
    const wrong = calls
      .filter((c) => c.keys && FUNCTIONS.has(c.name) && !FUNCTIONS.get(c.name).some((params) => signatureFits(params, c.keys)))
      .map((c) => `${c.file}:${c.line} ${c.name}(${c.keys.join(', ')}) ma lo schema ha ${FUNCTIONS.get(c.name).map((p) => `(${p.map((x) => x.name).join(', ')})`).join(' o ')}`);
    assert.deepEqual(wrong, []);
  });

  it('nessuna chiamata usa le funzioni senza progetto tolte dallo schema', () => {
    const dropped = [...SCHEMA.matchAll(/drop function if exists public\.(\w+)\(\)/g)].map((m) => m[1]);
    const zeroArgs = calls.filter((c) => dropped.includes(c.name) && c.keys?.length === 0 && !FUNCTIONS.get(c.name)?.some((p) => p.every((x) => x.optional)));
    assert.deepEqual(zeroArgs.map((c) => `${c.file}:${c.line} ${c.name}()`), []);
  });

  it('ogni tabella letta o scritta dal sito esiste nello schema', () => {
    const tables = sources.flatMap(({ file, source }) =>
      [...source.matchAll(/\.from\(\s*(['"])([a-z_]+)\1\s*\)/g)].map((m) => ({ file, table: m[2], line: source.slice(0, m.index).split('\n').length })),
    );
    assert.ok(tables.length >= 10, `trovate solo ${tables.length} tabelle`);
    assert.deepEqual(tables.filter((t) => !TABLES.has(t.table)).map((t) => `${t.file}:${t.line} ${t.table}`), []);
  });
});
