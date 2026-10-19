import { h, openModal, toast } from '../lib/dom.js';
import { merge3, resolveConflicts, snapshotOf, diffWords } from '../lib/diff.js';
import { describePath, fieldOf, formatValue } from '../schema.js';
import { photoView } from './components.js';
import { labelContext, memberName, saveSnapshot, statusError } from '../store.js';

const MAX_ATTEMPTS = 4;

function renderValue(kind, path, value, base) {
  if (value === undefined || value === null || value === '') return h('span', { class: 'muted' }, 'vuoto');
  if (fieldOf(kind, path.replace(/^data\./, '').split('.')[0])?.type === 'image') return photoView(value, { alt: 'Foto', size: 64 });
  const shown = formatValue(kind, path, value, labelContext);
  if (typeof value === 'string' && typeof base === 'string') {
    return h(
      'div',
      { class: 'text-block diff-inline' },
      diffWords(base, value).map((op) => (op.t === 'eq' ? op.v : h(op.t === 'add' ? 'ins' : 'del', null, op.v))),
    );
  }
  if (Array.isArray(shown)) return h('span', null, shown.join(', '));
  if (typeof shown === 'object') return h('code', null, JSON.stringify(shown));
  return h('div', { class: 'text-block' }, String(shown));
}

export function conflictDialog({ kind, conflicts, theirsAuthor }) {
  return new Promise((resolve) => {
    const choices = conflicts.map(() => 'mine');
    const rows = conflicts.map((conflict, index) => {
      const name = `conflict-${index}`;
      const option = (value, label, content) =>
        h(
          'label',
          { class: 'conflict-option' },
          h('input', { type: 'radio', name, value, checked: value === 'mine', onChange: () => (choices[index] = value) }),
          h('span', { class: 'conflict-option-label' }, label),
          content,
        );
      return h(
        'fieldset',
        { class: 'conflict' },
        h('legend', null, describePath(kind, conflict.path, labelContext)),
        option('mine', 'La tua versione', renderValue(kind, conflict.path, conflict.mine, conflict.base)),
        option('theirs', `La versione di ${theirsAuthor}`, renderValue(kind, conflict.path, conflict.theirs, conflict.base)),
      );
    });
    openModal({
      title: 'Modifiche in conflitto',
      wide: true,
      body: h(
        'div',
        null,
        h('p', null, `Mentre modificavi, ${theirsAuthor} ha salvato cambiando gli stessi campi. Scegli quale versione tenere per ciascuno: il resto è già stato unito.`),
        rows,
      ),
      onClose: (value) => resolve(value === true ? choices : null),
      actions: [
        { label: 'Annulla', value: false },
        { label: 'Salva con queste scelte', value: true, kind: 'primary' },
      ],
    });
  });
}

// Salva come un push: se nel frattempo qualcuno ha salvato, unisce le modifiche come un rebase e riprova.
export async function saveWithMerge(item, base, mine, message, { resolveConflict = conflictDialog } = {}) {
  let target = item;
  let baseSnapshot = base;
  let current = mine;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const result = await saveSnapshot(target, current, message);
    if (result.status === 'ok') return { item: result.item, merged: attempt > 0 };
    if (result.status !== 'conflict' || !result.item) throw statusError(result.status);

    const theirs = result.item;
    const merged = merge3(baseSnapshot, result.snapshot, snapshotOf(theirs));
    let next = merged.value;
    if (merged.conflicts.length) {
      const choices = await resolveConflict({ kind: item.kind, conflicts: merged.conflicts, theirsAuthor: memberName(theirs.updated_by) });
      if (!choices) return { cancelled: true, item: theirs };
      next = resolveConflicts(merged.value, merged.conflicts, choices);
    } else {
      toast(`Le tue modifiche sono state unite a quelle di ${memberName(theirs.updated_by)}.`);
    }
    target = theirs;
    baseSnapshot = snapshotOf(theirs);
    current = next;
  }
  throw statusError('conflict');
}
