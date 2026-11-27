import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { italianWords, looksItalian, stringLiterals } from '../setup/italian.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SITE = join(ROOT, 'assets/js');
// Every text the user reads lives in the text modules; a file not translated yet says so in a line of its own.
const TODO = '// i18n: da tradurre';
const TEXT_MODULES = ['i18n/', 'public/texts.js'];

const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.js') ? [path] : [];
  });
const name = (path) => relative(SITE, path).split(sep).join('/');
const sources = files(SITE)
  .map((path) => ({ file: name(path), source: readFileSync(path, 'utf8') }))
  .filter(({ file }) => !TEXT_MODULES.some((prefix) => file.startsWith(prefix)));

describe('rilevatore di italiano', () => {
  it('riconosce le frasi e le parole dell interfaccia, non l inglese', () => {
    assert.ok(looksItalian('Non è stato possibile avviare il sito.'));
    assert.ok(looksItalian('Salva'));
    assert.ok(looksItalian('Strumenti'));
    assert.equal(looksItalian('Save the idea'), false);
    assert.equal(looksItalian('Dashboard'), false);
    assert.equal(looksItalian('btn btn-primary'), false);
    assert.deepEqual(italianWords('Nessuna idea nel cestino'), ['nessuna', 'nel', 'cestino']);
  });

  it('non conta le parole che esistono anche in inglese, né i prefissi con il trattino', () => {
    for (const english of [
      'You cannot log hours on a day that has not come yet.',
      'The part a website like ours can serve, per person.',
      'New buyer persona',
      'Non-dilutive funding and non-compete clauses',
    ]) {
      assert.equal(looksItalian(english), false, english);
    }
    assert.ok(looksItalian('Come funziona questa pagina?'), 'una frase italiana con altre parole resta italiana');
    assert.ok(looksItalian('Non salvare'));
  });

  it('legge i testi tra apici, virgolette e accenti gravi, saltando i commenti', () => {
    const literals = stringLiterals("// 'commento'\nconst a = 'uno';\n/* \"due\" */ const b = `tre ${'quattro'} cinque`;");
    assert.deepEqual(literals.map((l) => [l.line, l.text]), [[2, 'uno'], [3, "tre ${'quattro'} cinque"]]);
  });
});

describe('testi scritti nel codice', () => {
  it('i file tradotti non hanno più testi in italiano: stanno nei moduli dei testi', () => {
    const leftovers = [];
    for (const { file, source } of sources.filter(({ source }) => !source.includes(TODO))) {
      const lines = source.split('\n');
      for (const literal of stringLiterals(source)) {
        if (/i18n-ignore/.test(lines[literal.line - 1] || '')) continue;
        if (looksItalian(literal.text)) leftovers.push(`${file}:${literal.line} ${JSON.stringify(literal.text.slice(0, 80))}`);
      }
    }
    assert.deepEqual(leftovers, []);
  });

  it('nessun file resta da tradurre', { todo: 'finché la traduzione non è completa' }, () => {
    assert.deepEqual(sources.filter(({ source }) => source.includes(TODO)).map(({ file }) => file), []);
  });
});
