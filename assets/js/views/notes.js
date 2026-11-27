import { h, busy, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { downloadFile, fmtDate, slugFile } from '../lib/format.js';
import { imagePaths, noteBody, noteExcerpt, noteToMarkdown, printNote, renderNote } from '../notes.js';
import { itemsOf } from '../store.js';
import { markReadWhere } from '../mentions.js';
import { tx } from '../i18n/index.js';
import { button, emptyState, itemLink, memberChip } from './components.js';

const t = tx.notes;
const byDate = (a, b) => (b.data.date || b.created_at || '').localeCompare(a.data.date || a.created_at || '');

export function notesTab(idea, writable) {
  const notes = itemsOf('note', { ideaId: idea.id }).sort(byDate);
  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'section-head' },
      h('p', { class: 'muted' }, t.tab.intro),
      writable ? button(t.tab.newNote, { kind: 'primary', iconName: 'plus', href: `#/nuovo/note?idea=${idea.id}` }) : null, // i18n-ignore: the address of the page
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
      : emptyState(t.tab.empty),
  );
}

export function noteView(note) {
  markReadWhere((m) => m.source === 'note' && m.item_id === note.id);
  const download = button(t.page.downloadMarkdown, { iconName: 'download' });
  download.addEventListener(
    'click',
    busy(download, async () => {
      try {
        downloadFile(`${slugFile(note.title) || t.page.fileName}.md`, await noteToMarkdown(note), 'text/markdown');
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    }),
  );
  const pdf = button(t.page.downloadPdf, { iconName: 'file' });
  pdf.addEventListener(
    'click',
    busy(pdf, async () => {
      try {
        await printNote(note);
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    }),
  );
  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'row note-meta' }, note.data.date ? h('span', { class: 'muted' }, fmtDate(note.data.date)) : null, h('div', { class: 'row' }, download, pdf)),
    noteBody(note.data.body, note.title).trim() ? renderNote(noteBody(note.data.body, note.title)) : emptyState(t.page.empty),
  );
}
