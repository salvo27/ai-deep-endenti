import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom } from '../setup/dom.mjs';
import { XSS } from '../setup/fixtures.mjs';

let md;

before(async () => {
  setupDom();
  md = await import('../../assets/js/lib/markdown.js');
});

const render = (text) => {
  const host = document.createElement('div');
  host.append(...md.renderMarkdown(text));
  return host;
};

test('headings, paragraphs and inline styles become elements', () => {
  const host = render('# Titolo\n\n## Sezione\nTesto **in grassetto** e *corsivo* con `codice`.\nSeconda riga');
  assert.equal(host.querySelector('h3').textContent, 'Titolo');
  assert.equal(host.querySelector('h4').textContent, 'Sezione');
  assert.equal(host.querySelector('strong').textContent, 'in grassetto');
  assert.equal(host.querySelector('em').textContent, 'corsivo');
  assert.equal(host.querySelector('code').textContent, 'codice');
  assert.equal(host.querySelectorAll('p br').length, 1);
  assert.doesNotMatch(host.textContent, /\*\*|#/);
});

test('ordered and nested lists keep their structure', () => {
  const host = render('1. **Prima**\n   - sotto uno\n   - sotto due\n2. Seconda\n\n- altro');
  const ol = host.querySelector('ol');
  assert.equal(ol.children.length, 2);
  assert.equal(ol.querySelectorAll('li > ul > li').length, 2);
  assert.equal(ol.querySelector('strong').textContent, 'Prima');
  assert.equal(host.querySelectorAll(':scope > ul').length, 1);
});

test('an ordered list keeps its starting number', () => {
  const host = render('3. terzo\n4. quarto');
  assert.equal(host.querySelector('ol').getAttribute('start'), '3');
});

test('tables, quotes, rules and code blocks are rendered', () => {
  const host = render('| A | B |\n|---|:-:|\n| 1 | **2** |\n\n> citazione\n\n---\n\n```\nlet x = 1;\n```');
  assert.equal(host.querySelectorAll('th').length, 2);
  assert.equal(host.querySelector('td strong').textContent, '2');
  assert.equal(host.querySelector('blockquote').textContent, 'citazione');
  assert.ok(host.querySelector('hr'));
  assert.equal(host.querySelector('pre code').textContent, 'let x = 1;');
});

test('links show their address as text instead of becoming clickable', () => {
  const host = render('Vedi [la guida](https://esempio.it/guida).');
  assert.equal(host.querySelector('a'), null);
  assert.match(host.textContent, /la guida \(https:\/\/esempio\.it\/guida\)/);
});

test('HTML inside the answer stays text', () => {
  const host = render(`# ${XSS}\n\n- ${XSS}\n\n**${XSS}**`);
  assert.equal(host.querySelector('img, script'), null);
  assert.match(host.textContent, /<img src=x/);
});

test('empty or missing text renders nothing', () => {
  assert.deepEqual(md.renderMarkdown(''), []);
  assert.deepEqual(md.renderMarkdown(null), []);
});

test('images are drawn only for note images, every other address stays text', () => {
  const calls = [];
  const image = (path, alt) => {
    calls.push([path, alt]);
    return document.createElement('img');
  };
  const html = (nodes) => {
    const box = document.createElement('div');
    box.append(...nodes);
    return box;
  };
  let box = html(md.renderMarkdown('Lavagna ![foto](immagine:a/b.jpg) e ![esterna](https://example.com/x.png)', { image }));
  assert.deepEqual(calls, [['a/b.jpg', 'foto']]);
  assert.equal(box.querySelectorAll('img').length, 1);
  assert.match(box.textContent, /esterna \(https:\/\/example\.com\/x\.png\)/);
  box = html(md.renderMarkdown('![grafico](data:image/png;base64,AAAA)'));
  assert.equal(box.querySelectorAll('img').length, 0, 'senza opzione nessuna immagine');
  assert.match(box.textContent, /grafico \(immagine incorporata\)/);
});

test('links become clickable only when asked, and only for http(s) and mailto', () => {
  const box = document.createElement('div');
  box.append(...md.renderMarkdown('Sito https://example.com/a_b, mail mailto:info@x.it, [doc](https://x.it) e [male](javascript:alert(1))', { links: true }));
  const links = [...box.querySelectorAll('a')];
  assert.deepEqual(links.map((a) => a.getAttribute('href')), ['https://example.com/a_b', 'mailto:info@x.it', 'https://x.it']);
  assert.ok(links.every((a) => a.getAttribute('rel') === 'noopener noreferrer nofollow' && a.getAttribute('target') === '_blank'));
  assert.doesNotMatch(box.innerHTML, /<em>/, 'gli underscore negli indirizzi non diventano corsivo');
  const plain = document.createElement('div');
  plain.append(...md.renderMarkdown('Sito https://example.com e [doc](https://x.it)'));
  assert.equal(plain.querySelectorAll('a').length, 0, 'senza l\'opzione restano testo, come nelle risposte di Claude');
});
