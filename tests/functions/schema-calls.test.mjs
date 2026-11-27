// The two Edge Functions and supabase/schema.sql must agree: every rpc they call exists with the arguments they pass
// and can be executed by the key they use, and the rows the notify tests feed to the handler have the columns the
// database returns. Read from the sources, without a database.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { busyWeek, mention, people } from './notify.helpers.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const SCHEMA = read('supabase/schema.sql');
const FUNCTIONS = { claude: read('supabase/functions/claude/index.ts'), notify: read('supabase/functions/notify/index.ts') };

const normalType = (type) => type.trim().toLowerCase().replace(/\s+/g, ' ');

/** Splits a list on the commas outside parentheses. */
function splitTop(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const c of text) {
    if (c === '(') depth += 1;
    if (c === ')') depth -= 1;
    if (c === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += c;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** The text between the parenthesis at `open` and the one that closes it. */
function inParens(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    if (text[i] === ')' && --depth === 0) return text.slice(open + 1, i);
  }
  throw new Error(`parenthesis not closed at ${open}`);
}

/**
 * The functions of the public schema after the whole script has run, in order: each create adds a version, each drop
 * removes the version with the same argument types. Every version has its parameters, what it returns and its body.
 */
function schemaFunctions(sql) {
  const functions = new Map();
  const statement = /create or replace function public\.(\w+)\(|drop function if exists public\.(\w+)\(/g;
  for (const match of sql.matchAll(statement)) {
    const open = match.index + match[0].length - 1;
    const args = inParens(sql, open);
    if (match[1]) {
      const params = splitTop(args).map((p) => {
        const [, name, type, def] = p.match(/^(\w+)\s+(.+?)(\s+default\s+.+)?$/is);
        return { name, type: normalType(type), optional: Boolean(def) };
      });
      const after = sql.slice(open + args.length + 2);
      const returns = after.match(/^\s*returns\s+(table\s*\(|[^\n]+)/i);
      const columns = returns && /^table/i.test(returns[1]) ? splitTop(inParens(after, after.indexOf('(', returns.index))).map((c) => c.split(/\s+/)[0]) : null;
      const body = after.slice(0, after.indexOf('\n$$;') + 4);
      const versions = (functions.get(match[1]) || []).filter((v) => v.params.map((p) => p.type).join() !== params.map((p) => p.type).join());
      functions.set(match[1], [...versions, { params, columns, body }]);
    } else {
      const types = splitTop(args).map(normalType).join();
      functions.set(match[2], (functions.get(match[2]) || []).filter((v) => v.params.map((p) => p.type).join() !== types));
    }
  }
  return functions;
}

/** The roles granted execute on each version of a function, keyed by "name(types)". */
function grants(sql) {
  const out = new Map();
  for (const [, name, types, roles] of sql.matchAll(/^grant execute on function public\.(\w+)\(([^)]*)\) to ([^;]+);$/gm)) {
    const key = `${name}(${splitTop(types).map(normalType).join()})`;
    out.set(key, [...(out.get(key) || []), ...roles.split(',').map((r) => r.trim())]);
  }
  return out;
}

/** The rpc calls with a literal name in an Edge Function: name, named arguments and whether they use the user's token. */
function rpcCalls(source) {
  return [...source.matchAll(/(\w+\.)?rpc\(\s*'(\w+)'\s*(?:,\s*\{([^}]*)\})?\s*\)/g)].map(([, client, name, args]) => ({
    name,
    args: args ? [...args.matchAll(/(\w+)\s*:/g)].map((m) => m[1]) : [],
    asUser: client === 'asUser.',
  }));
}

/** What is wrong with a call against the schema: an empty list when a version of the function accepts it. */
function callProblems(call, functions) {
  const versions = functions.get(call.name) || [];
  if (!versions.length) return [`${call.name} does not exist`];
  const fits = versions.find((v) => call.args.every((a) => v.params.some((p) => p.name === a)) && v.params.every((p) => p.optional || call.args.includes(p.name)));
  if (fits) return [];
  return versions.map((v) => `${call.name}(${call.args.join(', ')}) does not match ${call.name}(${v.params.map((p) => `${p.name}${p.optional ? '?' : ''}`).join(', ')})`);
}

const FUNCS = schemaFunctions(SCHEMA);
const GRANTS = grants(SCHEMA);

describe('il lettore dello schema', () => {
  const sql = `
create or replace function public.alfa(p_a uuid, p_b text default null)
returns table (x uuid, y text)
as $$ select 1 $$;
create or replace function public.beta()
returns boolean
as $$ select true $$;
create or replace function public.beta(p_project uuid)
returns boolean
as $$ select true $$;
drop function if exists public.beta();
create or replace function public.gamma(
  p_ids bigint[],
  p_since timestamp with time zone default now()
)
returns void
as $$ select 1 $$;
`;
  const funcs = schemaFunctions(sql);

  for (const [call, problems] of [
    [{ name: 'alfa', args: ['p_a'] }, 0],
    [{ name: 'alfa', args: ['p_a', 'p_b'] }, 0],
    [{ name: 'alfa', args: ['p_b'] }, 1],
    [{ name: 'alfa', args: ['p_a', 'p_c'] }, 1],
    [{ name: 'beta', args: [] }, 1],
    [{ name: 'beta', args: ['p_project'] }, 0],
    [{ name: 'gamma', args: ['p_ids'] }, 0],
    [{ name: 'delta', args: [] }, 1],
  ]) {
    it(`${call.name}(${call.args.join(', ')}) ${problems ? 'è rifiutata' : 'va bene'}`, () => {
      assert.equal(callProblems(call, funcs).length, problems, callProblems(call, funcs).join('; '));
    });
  }

  it('legge le colonne restituite e i tipi su più righe', () => {
    assert.deepEqual(funcs.get('alfa')[0].columns, ['x', 'y']);
    assert.deepEqual(funcs.get('gamma')[0].params.map((p) => [p.type, p.optional]), [['bigint[]', false], ['timestamp with time zone', true]]);
  });

  it('trova le chiamate con il nome scritto, i loro argomenti e chi le fa', () => {
    const source = "await asUser.rpc('can_read', { p_project: project });\nrpc('notify_recipients')\nrpc('x', { p_user: userId, p_week: week })\nadmin.rpc(name, params)";
    assert.deepEqual(rpcCalls(source), [
      { name: 'can_read', args: ['p_project'], asUser: true },
      { name: 'notify_recipients', args: [], asUser: false },
      { name: 'x', args: ['p_user', 'p_week'], asUser: false },
    ]);
  });
});

describe('le chiamate delle Edge Function', () => {
  const EXPECTED = {
    claude: ['can_read'],
    notify: ['is_admin', 'notify_recipients', 'notify_pending_mentions', 'notify_claim_mentions', 'notify_release_mentions', 'notify_weekly_data', 'notify_claim_weekly', 'notify_release_weekly'],
  };

  for (const [fn, source] of Object.entries(FUNCTIONS)) {
    it(`${fn} chiama le funzioni che si aspetta`, () => {
      assert.deepEqual(rpcCalls(source).map((c) => c.name).sort(), [...EXPECTED[fn]].sort());
    });

    for (const call of rpcCalls(source)) {
      it(`${fn}: ${call.name}(${call.args.join(', ')}) esiste nello schema con questi argomenti`, () => {
        assert.deepEqual(callProblems(call, FUNCS), []);
      });

      const role = call.asUser ? 'authenticated' : 'service_role';
      it(`${fn}: ${call.name} si può eseguire con la chiave usata (${role})`, () => {
        const version = (FUNCS.get(call.name) || []).find((v) => callProblems(call, new Map([[call.name, [v]]])).length === 0);
        assert.ok(version, `no version of ${call.name} accepts (${call.args.join(', ')})`);
        const key = `${call.name}(${version.params.map((p) => p.type).join()})`;
        assert.ok((GRANTS.get(key) || []).includes(role), `${key}: ${GRANTS.get(key)}`);
      });
    }
  }

  it('i permessi si chiedono sempre con il token di chi chiama, le email con la chiave di servizio', () => {
    for (const call of [...rpcCalls(FUNCTIONS.claude), ...rpcCalls(FUNCTIONS.notify)]) {
      assert.equal(call.asUser, ['can_read', 'is_admin'].includes(call.name), call.name);
    }
  });
});

describe('le righe dei test sono come quelle del database', () => {
  const columns = (name) => FUNCS.get(name)[0].columns;

  it('un destinatario ha esattamente le colonne di notify_recipients', () => {
    for (const row of people()) assert.deepEqual(Object.keys(row).sort(), [...columns('notify_recipients')].sort());
  });

  it('una menzione ha esattamente le colonne di notify_pending_mentions', () => {
    assert.deepEqual(Object.keys(mention()).sort(), [...columns('notify_pending_mentions')].sort());
  });

  it('i dati della settimana usano solo chiavi che notify_weekly_data scrive', () => {
    const body = FUNCS.get('notify_weekly_data')[0].body;
    const keys = new Set([...body.matchAll(/'(\w+)',/g)].map((m) => m[1]));
    const week = busyWeek();
    const used = new Set(Object.keys(week));
    for (const value of Object.values(week)) if (Array.isArray(value)) value.forEach((row) => Object.keys(row).forEach((k) => used.add(k)));
    assert.deepEqual([...used].filter((k) => !keys.has(k)), []);
  });
});

describe('le colonne di ai_usage usate da claude', () => {
  it('esistono nella tabella', () => {
    const table = SCHEMA.match(/create table if not exists public\.ai_usage \(([^;]*)\);/)[1];
    const existing = new Set(splitTop(table).map((c) => c.split(/\s+/)[0]));
    const used = new Set();
    for (const [, column] of FUNCTIONS.claude.matchAll(/\.(?:eq|gte|lte|select)\('(\w+)'/g)) used.add(column);
    for (const [, fields] of FUNCTIONS.claude.matchAll(/\.(?:insert|update)\(\{([^}]*)\}/g)) for (const [, key] of fields.matchAll(/(\w+)\s*:/g)) used.add(key);
    assert.ok(used.size >= 5, [...used].join());
    assert.deepEqual([...used].filter((c) => !existing.has(c)), []);
    assert.deepEqual([...FUNCTIONS.claude.matchAll(/\.from\('(\w+)'\)/g)].map((m) => m[1]).filter((t) => t !== 'ai_usage'), []);
  });
});
