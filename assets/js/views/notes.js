import { h, busy, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { downloadFile, fmtDate, slugFile } from '../lib/format.js';
import { imagePaths, noteBody, noteExcerpt, noteToMarkdown, renderNote } from '../notes.js';
import { itemsOf } from '../store.js';
import { markReadWhere } from '../mentions.js';
import { button, emptyState, itemLink, memberChip } from './components.js';

const byDate = (a, b) => (b.data.date || b.created_at || '').localeCompare(a.data.date || a.created_at || '');

export function notesTab(idea, writable) {
  const notes = itemsOf('note', { ideaId: idea.id }).sort(byDate);
  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'section-head' },
      h('p', { class: 'muted' }, 'Riunioni, link, domande aperte e idee sparse su questa idea. Ogni nota è un testo Markdown, con immagini.'),
      writable ? button('Nuova nota', { kind: 'primary', iconName: 'plus', href: `#/nuovo/note?idea=${idea.id}` }) : null,
    ),
    notes.length
      ? h(
          'div',
          { class: 'cards note-cards' },
          notes.map((note) => {
            const images = imagePaths(note.data.body).size;
            return h(
              'article',
              { class: 'card note-card' },
              h('div', { class: 'card-head' }, itemLink(note)),
              h(
                'p',
                { class: 'muted small row' },
                note.data.date ? h('span', null, fmtDate(note.data.date)) : null,
                note.created_by ? memberChip(note.created_by) : null,
                images ? h('span', { class: 'chip' }, icon('image', 12), ` ${images}`) : null,
              ),
              noteBody(note.data.body, note.title).trim() ? h('p', { class: 'small' }, noteExcerpt(noteBody(note.data.body, note.title))) : null,
            );
          }),
        )
      : emptyState('Nessuna nota. Scrivete qui gli appunti delle riunioni e tutto ciò che non sta in una scheda.'),
  );
}

export function noteView(note) {
  markReadWhere((m) => m.source === 'note' && m.item_id === note.id);
  const download = button('Scarica .md', { iconName: 'download' });
  download.addEventListener(
    'click',
    busy(download, async () => {
      try {
        downloadFile(`${slugFile(note.title) || 'nota'}.md`, await noteToMarkdown(note), 'text/markdown');
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    }),
  );
  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'row note-meta' }, note.data.date ? h('span', { class: 'muted' }, fmtDate(note.data.date)) : null, download),
    noteBody(note.data.body, note.title).trim() ? renderNote(noteBody(note.data.body, note.title)) : emptyState('La nota è vuota.'),
  );
}
