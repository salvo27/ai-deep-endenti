import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { baseOf, fromPsql, splitStatements, summarize, tapLines } from '../../tests/db/run.mjs';

const result = (name, ...values) => ({ fields: [{ name }], rows: values.map((value) => ({ [name]: value })) });

describe('righe TAP di un file del database', () => {
  it('si prendono dalle righe di testo a una colonna che sembrano TAP', () => {
    const lines = tapLines([
      result('plan', '1..2'),
      result('ok', 'ok 1 - uno'),
      result('is', 'not ok 2 - due\n# Failed test 2\n#         have: 1\n#         want: 2'),
      result('count', 3),
      { fields: [{ name: 'a' }, { name: 'b' }], rows: [{ a: 'ok 9', b: 'x' }] },
      result('note', 'testo qualsiasi'),
    ]);
    assert.deepEqual(lines, ['1..2', 'ok 1 - uno', 'not ok 2 - due', '# Failed test 2', '#         have: 1', '#         want: 2']);
  });

  it('un risultato senza colonne non rompe la lettura', () => {
    assert.deepEqual(tapLines([{ fields: [], rows: [] }, {}]), []);
  });
});

describe('esito di un file', () => {
  it('conta i test riusciti e mostra quelli falliti', () => {
    const { passed, problems } = summarize(['1..3', 'ok 1 - a', 'not ok 2 - b', 'ok 3 - c', '# Looks like you failed 1 test of 3']);
    assert.equal(passed, 2);
    assert.deepEqual(problems, ['not ok 2 - b', '# Looks like you failed 1 test of 3']);
  });

  it('se ne girano meno del piano lo dice anche senza il messaggio di pgTAP', () => {
    assert.deepEqual(summarize(['1..3', 'ok 1 - a']).problems, ['# planned 3 tests']);
  });

  it('il messaggio di pgTAP sul piano non si ripete', () => {
    const { problems } = summarize(['1..3', 'ok 1 - a', '# Looks like you planned 3 tests but ran 1']);
    assert.deepEqual(problems, ['# Looks like you planned 3 tests but ran 1']);
  });

  it('senza piano conta solo i riusciti', () => {
    assert.deepEqual(summarize(['ok - uno', 'ok - due']), { passed: 2, problems: [], skipped: [] });
  });

  it('i test saltati si elencano a parte, con il motivo', () => {
    assert.deepEqual(summarize(['ok - uno', '# skip manca dblink: niente prova']).skipped, ['manca dblink: niente prova']);
  });
});

describe('vecchio file scritto per psql', () => {
  it('toglie i comandi di psql e trasforma gli echo in righe TAP', () => {
    const sql = "\\set ON_ERROR_STOP 1\n\\o /dev/null\nselect 1;\n\\echo 'ok - l''idea si salva'";
    assert.deepEqual(fromPsql(sql).split('\n').filter(Boolean), ['select 1;', "select 'ok - l''idea si salva' as tap;"]);
  });

  it('un \\ir mette al suo posto il file indicato, letto rispetto alla cartella dei test', () => {
    const read = (path) => (path === '../../supabase/schema.sql' ? 'create table x ();' : null);
    assert.deepEqual(fromPsql('select 1;\n\\ir ../../supabase/schema.sql\nselect 2;', read).split('\n').filter(Boolean), ['select 1;', 'create table x ();', 'select 2;']);
  });

  it('dei blocchi con dblink tiene solo il ramo else e segna il salto', () => {
    const sql = [
      "select exists (select 1 from pg_available_extensions where name = 'dblink') as has_dblink \\gset",
      '\\if :has_dblink',
      "\\echo 'ok - con due connessioni'",
      'create extension dblink;',
      '\\else',
      "\\echo 'saltato - manca dblink: niente prova'",
      '\\endif',
      'select 2;',
    ].join('\n');
    assert.deepEqual(fromPsql(sql).split('\n').filter(Boolean), ["select '# skip manca dblink: niente prova' as tap;", 'select 2;']);
  });
});

describe('database di partenza di un file pgTAP', () => {
  it('di solito è lo schema di adesso', () => {
    assert.equal(baseOf('begin;\nselect plan(1);'), 'current');
  });

  it('con -- base: legacy è lo schema a squadra unica, per provare l aggiornamento', () => {
    assert.equal(baseOf('-- base: legacy\nbegin;'), 'legacy');
    assert.equal(baseOf('-- Upgrade.\n-- base: legacy\nbegin;'), 'legacy');
  });

  it('la riga conta solo in cima, prima delle istruzioni', () => {
    assert.equal(baseOf('begin;\n-- base: legacy\n'), 'current');
    assert.equal(baseOf('-- base: altro\nbegin;'), 'current');
  });
});

describe('istruzioni una per una, come le manda psql', () => {
  it('divide sui punti e virgola e scarta i pezzi vuoti', () => {
    assert.deepEqual(splitStatements('select 1;  select 2 ;\n\n;select 3'), ['select 1;', 'select 2 ;', 'select 3']);
  });

  it('non divide dentro testi, identificatori e commenti', () => {
    const sql = "select 'a;b', \"c;d\" from t; -- commento; con punto e virgola\nselect /* x; y */ 2;";
    assert.deepEqual(splitStatements(sql), ["select 'a;b', \"c;d\" from t;", '-- commento; con punto e virgola\nselect /* x; y */ 2;']);
  });

  it('riconosce gli apici raddoppiati e quelli con la barra nei testi E', () => {
    assert.deepEqual(splitStatements("select 'l''idea; ok'; select E'it\\'s; ok'; select 3;"), ["select 'l''idea; ok';", "select E'it\\'s; ok';", 'select 3;']);
  });

  it('tiene interi i corpi tra dollari, anche con un nome, e non confonde i parametri $1', () => {
    const sql = 'create function f() returns int as $$ select 1; $$ language sql;\ndo $body$ begin perform 1; end $body$;\nprepare p as select $1::int;';
    assert.deepEqual(splitStatements(sql), [
      'create function f() returns int as $$ select 1; $$ language sql;',
      'do $body$ begin perform 1; end $body$;',
      'prepare p as select $1::int;',
    ]);
  });

  it('dentro un corpo tra dollari un altro nome non lo chiude', () => {
    const sql = 'do $$ begin execute $q$select 1; select 2$q$; end $$; select 3;';
    assert.deepEqual(splitStatements(sql), ['do $$ begin execute $q$select 1; select 2$q$; end $$;', 'select 3;']);
  });

  it('un pezzo fatto solo di commenti non è un istruzione', () => {
    assert.deepEqual(splitStatements('-- solo un commento\n/* e un altro */\n'), []);
  });
});
