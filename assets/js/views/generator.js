import { h, mount, autoGrow, busy, confirmDialog, openModal, promptDialog, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { snapshotOf } from '../lib/diff.js';
import { shortId, truncate } from '../lib/format.js';
import { canWrite, createItem, ideas, on, singleton } from '../store.js';
import { navigate } from '../router.js';
import { saveWithMerge } from './merge.js';
import { openAiPanel } from './ai-panel.js';
import { button, emptyState, itemLink, pageHeader } from './components.js';

export const DEFAULT_GENERATOR = {
  rows: [
    { id: 'r-ml', label: 'Machine learning' },
    { id: 'r-agenti', label: 'Agenti LLM' },
    { id: 'r-ottim', label: 'Ottimizzazione' },
  ],
  cols: [
    { id: 'c-sanita', label: 'Sanità' },
    { id: 'c-finanza', label: 'Finanza' },
    { id: 'c-industria', label: 'Industria' },
  ],
  cells: {},
};

const POTENTIAL = ['nessuna valutazione', 'basso', 'medio', 'alto'];

export function ideasFromCell(cellKey) {
  return ideas().filter((i) => i.data.origin === cellKey);
}

async function saveGenerator(mutator, message) {
  const item = singleton('generator');
  if (!item) return false;
  const base = snapshotOf(item);
  const next = structuredClone(base);
  mutator(next.data);
  try {
    const result = await saveWithMerge(item, base, next, message);
    return !result.cancelled;
  } catch (error) {
    toast(error.message, { type: 'error' });
    return false;
  }
}

function cellDialog(gen, row, col, writable) {
  const key = `${row.id}:${col.id}`;
  const cell = gen.cells?.[key] || { text: '', potential: 0 };
  const text = autoGrow(h('textarea', { class: 'input', rows: 5, maxlength: 4000, value: cell.text || '', readOnly: !writable, placeholder: 'Spunti, clienti possibili, paper collegati' }));
  const potential = h('select', { class: 'input', disabled: !writable }, POTENTIAL.map((label, n) => h('option', { value: n, selected: n === (cell.potential || 0) }, `Potenziale: ${label}`)));
  const born = ideasFromCell(key);
  const actions = [{ label: 'Chiudi', value: false }];
  if (writable) {
    actions.push({
      label: 'Salva la cella',
      kind: 'primary',
      onClick: async () => {
        const ok = await saveGenerator((data) => {
          data.cells = data.cells || {};
          data.cells[key] = { text: text.value, potential: Number(potential.value) };
        }, `Generatore: ${row.label} × ${col.label}`);
        if (ok) toast('Cella salvata.', { type: 'success' });
        return !ok;
      },
    });
  }
  const modal = openModal({
    title: `${row.label} × ${col.label}`,
    wide: true,
    body: h(
      'div',
      { class: 'cell-dialog' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Spunti'), text),
      h('label', { class: 'field' }, potential),
      h(
        'div',
        { class: 'row' },
        h('button', {
          type: 'button',
          class: 'btn btn-ai',
          onClick: () =>
            openAiPanel(
              'cell_ideas',
              () => ({ cell: { row: row.label, col: col.label, text: text.value }, existingIdeas: ideas().map((i) => i.title) }),
              writable ? { onAccept: (t) => { text.value = `${text.value ? `${text.value}\n\n` : ''}${t}`; text.dispatchEvent(new Event('input')); }, acceptLabel: 'Aggiungi agli spunti' } : {},
            ),
        }, icon('claude', 16), h('span', null, 'Chiedi idee a Claude')),
        writable
          ? button('Crea un\'idea da questa cella', {
              kind: 'ghost',
              iconName: 'idea',
              onClick: () => {
                modal.close();
                const params = new URLSearchParams({ origin: key, tech: row.label, sector: col.label });
                navigate(`/nuovo/idea?${params}`);
              },
            })
          : null,
      ),
      born.length ? h('div', null, h('h3', null, 'Idee nate da questa cella'), h('ul', { class: 'list' }, born.map((i) => h('li', null, itemLink(i))))) : null,
    ),
    actions,
  });
}

async function editAxis(kind, axis) {
  const name = kind === 'rows' ? 'riga' : 'colonna';
  const label = await promptDialog({ title: axis ? `Rinomina la ${name}` : `Nuova ${name}`, label: 'Nome', value: axis?.label || '', maxLength: 80, okLabel: 'Salva' });
  if (label === null || !label.trim()) return;
  await saveGenerator((data) => {
    data[kind] = data[kind] || [];
    if (axis) data[kind] = data[kind].map((a) => (a.id === axis.id ? { ...a, label: label.trim() } : a));
    else data[kind].push({ id: `${kind === 'rows' ? 'r' : 'c'}-${shortId().slice(0, 8)}`, label: label.trim() });
  }, axis ? `Generatore: rinominata ${name} «${label.trim()}»` : `Generatore: nuova ${name} «${label.trim()}»`);
}

async function removeAxis(kind, axis) {
  const ok = await confirmDialog(`Togliere «${axis.label}» dalla griglia? Le celle collegate restano nello storico.`, { okLabel: 'Togli', danger: true });
  if (!ok) return;
  await saveGenerator((data) => {
    data[kind] = (data[kind] || []).filter((a) => a.id !== axis.id);
    for (const key of Object.keys(data.cells || {})) {
      if (key.split(':').includes(axis.id)) delete data.cells[key];
    }
  }, `Generatore: tolta «${axis.label}»`);
}

export function generatorView(outlet) {
  const writable = canWrite();
  const render = () => {
    const item = singleton('generator');
    if (!item) {
      const create = writable ? button('Crea la griglia predefinita', { kind: 'primary', iconName: 'generator' }) : null;
      create?.addEventListener('click', busy(create, async () => {
        try {
          await createItem('generator', { title: 'Generatore di idee', data: DEFAULT_GENERATOR }, 'Griglia iniziale');
        } catch (error) {
          toast(error.message, { type: 'error' });
        }
      }));
      mount(outlet, pageHeader({ title: 'Generatore' }), emptyState('Incrocia le capacità del team con i settori per trovare idee nuove.', create));
      return;
    }
    const gen = item.data;
    const axisHead = (kind, axis) =>
      h(
        'div',
        { class: 'axis' },
        h('span', null, axis.label),
        writable
          ? h('span', { class: 'axis-actions' },
              h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Rinomina ${axis.label}`, onClick: () => editAxis(kind, axis) }, icon('edit', 14)),
              h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Togli ${axis.label}`, onClick: () => removeAxis(kind, axis) }, icon('close', 14)))
          : null,
      );
    mount(
      outlet,
      pageHeader({
        title: 'Generatore',
        subtitle: 'Righe: cosa sa fare il team. Colonne: settori. Ogni cella è uno spunto; quelle promettenti diventano idee.',
        actions: writable ? [button('Riga', { iconName: 'plus', onClick: () => editAxis('rows') }), button('Colonna', { iconName: 'plus', onClick: () => editAxis('cols') })] : [],
      }),
      h(
        'div',
        { class: 'table-scroll' },
        h(
          'table',
          { class: 'table generator' },
          h('thead', null, h('tr', null, h('th', null, ''), (gen.cols || []).map((col) => h('th', { scope: 'col' }, axisHead('cols', col))))),
          h(
            'tbody',
            null,
            (gen.rows || []).map((row) =>
              h(
                'tr',
                null,
                h('th', { scope: 'row' }, axisHead('rows', row)),
                (gen.cols || []).map((col) => {
                  const key = `${row.id}:${col.id}`;
                  const cell = gen.cells?.[key];
                  const count = ideasFromCell(key).length;
                  return h(
                    'td',
                    { class: ['gen-cell', cell?.potential ? `p${cell.potential}` : null] },
                    h(
                      'button',
                      { type: 'button', class: 'gen-cell-btn', onClick: () => cellDialog(singleton('generator').data, row, col, writable), 'aria-label': `${row.label} per ${col.label}` },
                      cell?.text ? truncate(cell.text, 90) : h('span', { class: 'muted' }, '+'),
                      count ? h('span', { class: 'badge badge-soft' }, `${count} idee`) : null,
                    ),
                  );
                }),
              ),
            ),
          ),
        ),
      ),
    );
  };
  render();
  return on('item', ({ item }) => {
    if (item.kind === 'generator' || item.kind === 'idea') render();
  });
}
