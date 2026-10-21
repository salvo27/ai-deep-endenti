import { h } from './dom.js';

// Un tag nel testo è @[Nome Cognome] o @[tutti]; nella pagina si vede come «@Nome Cognome».
export const MENTION_SOURCE = '@\\[([^\\]\\n]{1,80})\\]';
export const ALL = 'tutti';

export const mentionToken = (name) => `@[${String(name).replace(/[[\]\n]/g, ' ').trim()}]`;

// Cosa si sta scrivendo dopo una @, se il cursore è lì: { start, query }.
export function mentionQuery(text, caret) {
  const before = String(text).slice(0, caret);
  const match = /(^|\s)@([^\s@[\]]{0,30})$/.exec(before);
  return match ? { start: caret - match[2].length - 1, query: match[2] } : null;
}

// Testo semplice con i tag evidenziati, per i commenti.
export function renderMentions(text, chip) {
  const out = [];
  const re = new RegExp(MENTION_SOURCE, 'g');
  let last = 0;
  for (const m of String(text ?? '').matchAll(re)) {
    if (m.index > last) out.push(String(text).slice(last, m.index));
    out.push(chip(m[1].trim()));
    last = m.index + m[0].length;
  }
  if (last < String(text ?? '').length) out.push(String(text).slice(last));
  return out;
}

export const plainMention = (name) => h('span', { class: 'mention' }, `@${name}`);
