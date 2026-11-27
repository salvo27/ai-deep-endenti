// Database tests on PGlite, the real Postgres compiled to WebAssembly: no PostgreSQL or Docker to install,
// the same run on Windows, macOS and GitHub Actions.
//   node tests/db/run.mjs              every file
//   node tests/db/run.mjs 03_          only the pgTAP files whose name starts like this
// Every file gets a fresh database with the Supabase stub and the schema installed twice (the schema must run again
// without losing data), so a file never sees what another one left behind.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgtap } from '@electric-sql/pglite-pgtap';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const PGTAP_DIR = 'supabase/tests/database';
const TAP_LINE = /^(ok|not ok)\b|^1\.\.\d+$|^# /;

/** The pgTAP lines a run printed: every one-column text row that looks like TAP. */
export function tapLines(results) {
  const lines = [];
  for (const result of results) {
    if (result.fields?.length !== 1) continue;
    const [{ name }] = result.fields;
    for (const row of result.rows) {
      const value = row[name];
      if (typeof value === 'string') lines.push(...value.split('\n').filter((line) => TAP_LINE.test(line)));
    }
  }
  return lines;
}

/** Passed, failed and the lines worth showing, from the TAP lines of one file. */
export function summarize(lines) {
  const passed = lines.filter((line) => /^ok\b/.test(line)).length;
  const problems = lines.filter((line) => /^not ok\b|^# Looks like/.test(line));
  const plan = lines.find((line) => /^1\.\.\d+$/.test(line));
  const planned = plan ? Number(plan.slice(3)) : null;
  if (planned !== null && planned !== passed + lines.filter((line) => /^not ok\b/.test(line)).length && !problems.some((line) => /planned/.test(line))) {
    problems.push(`# planned ${planned} tests`);
  }
  const skipped = lines.filter((line) => line.startsWith('# skip ')).map((line) => line.slice('# skip '.length));
  return { passed, problems, skipped };
}

// The old single file runs through psql: its meta-commands are dropped and every \echo 'ok - ...' becomes a TAP line.
// Its \if blocks need dblink, two real connections that PGlite cannot open: only their \else branch runs here,
// and the two-connection tests run on GitHub Actions with a real PostgreSQL (tests/db/run.sh).
export function fromPsql(sql, include = (path) => read(join('tests/db', path))) {
  const out = [];
  let branch = 'none';
  for (const line of sql.split('\n')) {
    const file = line.match(/^\\ir?\s+(\S+)\s*$/);
    if (file && branch !== 'if') {
      out.push(include(file[1]));
      continue;
    }
    if (/^\\if\b/.test(line)) branch = 'if';
    else if (/^\\else\b/.test(line)) branch = 'else';
    else if (/^\\endif\b/.test(line)) branch = 'none';
    else if (branch === 'if' || /\\gset\s*$/.test(line)) continue;
    else {
      const echo = line.match(/^\\echo\s+'((?:[^']|'')*)'\s*$/);
      if (echo) {
        const text = echo[1].replace(/^saltato - /, '# skip ');
        out.push(`select '${text}' as tap;`);
      } else if (!line.startsWith('\\')) out.push(line);
      continue;
    }
    out.push('');
  }
  return out.join('\n');
}

// psql sends one statement at a time, each in its own transaction; PGlite's exec would run the whole text as one
// transaction, so the old file is split here. Strings, quoted names, comments and $tag$ bodies are kept whole.
export function splitStatements(sql) {
  const statements = [];
  let start = 0;
  let i = 0;
  const push = (end) => {
    const text = sql.slice(start, end).trim();
    const code = text.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (code && code !== ';') statements.push(text);
    start = end;
  };
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      i = end < 0 ? sql.length : end + 1;
    } else if (c === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 2;
    } else if (c === "'") {
      const escapes = /[eE]/.test(sql[i - 1] || '') && !/[\w$]/.test(sql[i - 2] || '');
      i++;
      while (i < sql.length) {
        if (escapes && sql[i] === '\\') i += 2;
        else if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") break;
        else i++;
      }
      i++;
    } else if (c === '"') {
      const end = sql.indexOf('"', i + 1);
      i = end < 0 ? sql.length : end + 1;
    } else if (c === '$' && !/[\w$]/.test(sql[i - 1] || '')) {
      const tag = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        i = end < 0 ? sql.length : end + tag[0].length;
      } else i++;
    } else if (c === ';') {
      i++;
      push(i);
    } else i++;
  }
  push(sql.length);
  return statements;
}

// A file can start from the single-team schema of before the projects (tests/db/legacy-schema.sql), to prove that
// the upgrade keeps every row: it says so in its first comment lines, and includes the new schema with \ir.
export function baseOf(sql) {
  for (const line of sql.split('\n')) {
    if (!line.startsWith('--')) break;
    if (/^--\s*base:\s*legacy\s*$/.test(line)) return 'legacy';
  }
  return 'current';
}

const SCHEMAS = { current: 'supabase/schema.sql', legacy: 'tests/db/legacy-schema.sql' };
const templates = {};

async function freshDatabase(base = 'current') {
  if (!templates[base]) {
    const db = await PGlite.create({ extensions: { pgtap } });
    await db.exec(read('tests/db/supabase-stub.sql'));
    await db.exec(read(SCHEMAS[base]));
    await db.exec(read(SCHEMAS[base]));
    // In its own schema, as on Supabase: in public its functions would count among the ones the API can call.
    await db.exec(`
      create schema if not exists extensions;
      create extension if not exists pgtap with schema extensions;
      grant usage on schema extensions to anon, authenticated, service_role;
      grant execute on all functions in schema extensions to anon, authenticated, service_role;
    `);
    await db.exec(read('tests/db/helpers.sql'));
    templates[base] = await db.dumpDataDir('none');
    await db.close();
  }
  return PGlite.create({ loadDataDir: templates[base], extensions: { pgtap } });
}

async function runFile(label, sql, { oneByOne = false } = {}) {
  const db = await freshDatabase(baseOf(sql));
  const results = [];
  let statement = sql;
  try {
    await db.exec('set search_path = public, extensions;');
    for (statement of oneByOne ? splitStatements(sql) : [sql]) results.push(...(await db.exec(statement)));
    return { label, ...summarize(tapLines(results)) };
  } catch (error) {
    const { passed } = summarize(tapLines(results));
    const where = oneByOne ? ` in: ${statement.replace(/\s+/g, ' ').slice(0, 160)}` : '';
    return { label, passed, problems: [`ERROR: ${error.message}${where}`] };
  } finally {
    await db.close();
  }
}

async function main(prefix = '') {
  const files = readdirSync(join(ROOT, PGTAP_DIR))
    .filter((name) => name.endsWith('.test.sql') && name.startsWith(prefix))
    .sort();
  const runs = [];
  if (!prefix) {
    try {
      await freshDatabase();
      console.log('ok - the schema installs and runs again without errors');
    } catch (error) {
      console.log(`not ok - the schema does not install: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    runs.push(['tests/db/schema.test.sql (legacy)', fromPsql(read('tests/db/schema.test.sql')), { oneByOne: true }]);
  }
  // \ir in a pgTAP file is read from its folder: \ir ../../schema.sql applies the schema of now, for the upgrade tests.
  for (const name of files) runs.push([name, fromPsql(read(join(PGTAP_DIR, name)), (path) => read(join(PGTAP_DIR, path)))]);
  let failed = false;
  for (const [label, sql, options] of runs) {
    const { passed, problems, skipped = [] } = await runFile(label, sql, options);
    console.log(`${label}: ${passed} ok${skipped.length ? `, ${skipped.length} skipped` : ''}`);
    for (const reason of skipped) console.log(`  skipped: ${reason}`);
    if (problems.length || passed === 0) {
      failed = true;
      for (const line of (problems.length ? problems : ['no test ran']).slice(0, 12)) console.log(`  ${line}`);
    }
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv[2]);
  // PGlite keeps handles open after close(): without an explicit exit the process would wait forever.
  process.exit();
}
