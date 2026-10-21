import { h } from './dom.js';

// Sottoinsieme di Markdown reso con nodi DOM: il testo resta testo, nessun HTML viene interpretato.

const HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const FENCE = /^\s*```/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const BARE_URL = '(?:https?:\\/\\/|mailto:)[^\\s<>()\\[\\]]*[^\\s<>()\\[\\].,;:!?\'"]';
const INLINE = new RegExp(
  `(!\\[[^\\]\\n]*\\]\\([^)\\s]+\\)|\\*\\*[^*\\n]+?\\*\\*|__[^_\\n]+?__|\`[^\`\\n]+\`|\\[[^\\]\\n]+\\]\\([^)\\s]+\\)|${BARE_URL}|\\*[^*\\s][^*\\n]*?\\*)`,
);
const LINKABLE = /^(https?:\/\/|mailto:)/i;

// Con opts.links i link http(s) e mailto diventano cliccabili e si aprono in una nuova scheda; senza, restano testo.
const link = (href, label) => h('a', { href, class: 'md-link', target: '_blank', rel: 'noopener noreferrer nofollow' }, label);

// opts.image(path, alt) disegna le immagini «immagine:percorso» delle note; gli altri indirizzi restano testo.
export function renderInline(text, opts = {}) {
  const out = [];
  let rest = String(text ?? '');
  while (rest) {
    const match = INLINE.exec(rest);
    if (!match) {
      out.push(rest);
      break;
    }
    if (match.index) out.push(rest.slice(0, match.index));
    const token = match[0];
    if (token.startsWith('![')) {
      const [, alt, url] = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(token);
      if (url.startsWith('immagine:') && opts.image) out.push(opts.image(url.slice('immagine:'.length), alt));
      else out.push(alt || 'immagine', h('span', { class: 'muted' }, ` (${url.startsWith('data:') ? 'immagine incorporata' : url})`));
    } else if (token.startsWith('**') || token.startsWith('__')) out.push(h('strong', null, renderInline(token.slice(2, -2), opts)));
    else if (token.startsWith('`')) out.push(h('code', null, token.slice(1, -1)));
    else if (token.startsWith('[')) {
      const [, label, url] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (opts.links && LINKABLE.test(url)) out.push(link(url, label));
      else out.push(label, h('span', { class: 'muted' }, ` (${url})`));
    } else if (LINKABLE.test(token)) out.push(opts.links ? link(token, token.replace(/^mailto:/i, '')) : token);
    else out.push(h('em', null, renderInline(token.slice(1, -1), opts)));
    rest = rest.slice(match.index + token.length);
  }
  return out;
}

const cells = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

export function renderMarkdown(text, opts = {}) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  let lists = [];
  let quote = null;

  const closeParagraph = () => {
    if (!paragraph.length) return;
    const parts = [];
    paragraph.forEach((line, i) => parts.push(i ? h('br') : null, renderInline(line, opts)));
    blocks.push(h('p', null, parts));
    paragraph = [];
  };
  const closeLists = () => {
    lists = [];
  };
  const closeQuote = () => {
    quote = null;
  };
  const closeAll = () => {
    closeParagraph();
    closeLists();
    closeQuote();
  };

  const addListItem = (indent, marker, content) => {
    const ordered = /\d/.test(marker);
    const tag = ordered ? 'ol' : 'ul';
    while (lists.length && indent < lists[lists.length - 1].indent) lists.pop();
    let top = lists[lists.length - 1];
    if (top && indent === top.indent && top.el.tagName.toLowerCase() !== tag) {
      lists.pop();
      top = lists[lists.length - 1];
    }
    if (!top || indent > top.indent) {
      const el = h(tag, ordered && parseInt(marker, 10) !== 1 ? { start: parseInt(marker, 10) } : null);
      if (top?.lastItem) top.lastItem.append(el);
      else blocks.push(el);
      top = { indent, el, lastItem: null };
      lists.push(top);
    }
    const item = h('li', null, renderInline(content, opts));
    top.el.append(item);
    top.lastItem = item;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (FENCE.test(line)) {
      closeAll();
      const code = [];
      for (i += 1; i < lines.length && !FENCE.test(lines[i]); i += 1) code.push(lines[i]);
      blocks.push(h('pre', null, h('code', null, code.join('\n'))));
      continue;
    }
    if (!line.trim()) {
      closeParagraph();
      closeQuote();
      const next = lines.slice(i + 1).find((l) => l.trim());
      if (!next || !(LIST_ITEM.test(next) || (lists.length && /^\s+/.test(next)))) closeLists();
      continue;
    }
    if (TABLE_ROW.test(line) && TABLE_SEPARATOR.test(lines[i + 1] || '')) {
      closeAll();
      const head = cells(line);
      const rows = [];
      for (i += 2; i < lines.length && TABLE_ROW.test(lines[i]); i += 1) rows.push(cells(lines[i]));
      i -= 1;
      blocks.push(
        h(
          'div',
          { class: 'table-wrap' },
          h(
            'table',
            { class: 'table' },
            h('thead', null, h('tr', null, head.map((c) => h('th', null, renderInline(c, opts))))),
            h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', null, renderInline(c, opts)))))),
          ),
        ),
      );
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      closeAll();
      const level = Math.min(heading[1].length + 2, 6);
      blocks.push(h(`h${level}`, null, renderInline(heading[2].replace(/\s+#+\s*$/, ''), opts)));
      continue;
    }
    if (RULE.test(line)) {
      closeAll();
      blocks.push(h('hr'));
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      closeParagraph();
      closeQuote();
      addListItem(item[1].replace(/\t/g, '    ').length, item[2], item[3]);
      continue;
    }
    if (lists.length && /^\s+/.test(line)) {
      const last = lists[lists.length - 1].lastItem;
      last.append(h('br'), ...renderInline(line.trim(), opts));
      continue;
    }
    const quoted = QUOTE.exec(line);
    if (quoted) {
      closeParagraph();
      closeLists();
      if (!quote) {
        quote = h('blockquote');
        blocks.push(quote);
      } else quote.append(h('br'));
      quote.append(...renderInline(quoted[1], opts));
      continue;
    }
    closeLists();
    closeQuote();
    paragraph.push(line.trim());
  }
  closeAll();
  return blocks;
}
