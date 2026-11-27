import { h, mount, autoGrow, busy, confirmDialog, openModal, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { snapshotOf } from '../lib/diff.js';
import { shortId, truncate } from '../lib/format.js';
import { canWrite, createItem, ideas, memberName, on, singleton, state } from '../store.js';
import { navigate } from '../router.js';
import { tx } from '../i18n/index.js';
import { saveWithMerge } from './merge.js';
import { openAiPanel } from './ai-panel.js';
import { avatar, button, emptyState, itemLink, pageHeader } from './components.js';

const t = tx.generator;

// La griglia di partenza si crea nella lingua di chi la crea; gli id restano gli stessi in ogni lingua.
export const DEFAULT_GENERATOR = {
  rows: [
    { id: 'r-ml', label: 'Machine learning' },
    { id: 'r-agenti', label: t.defaults.agents },
    { id: 'r-ottim', label: t.defaults.optimisation },
  ],
  cols: [
    { id: 'c-sanita', label: t.defaults.health },
    { id: 'c-finanza', label: t.defaults.finance },
    { id: 'c-industria', label: t.defaults.industry },
  ],
  cells: {},
};

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
  const text = autoGrow(h('textarea', { class: 'input', rows: 5, maxlength: 4000, value: cell.text || '', readOnly: !writable, placeholder: t.cell.placeholder }));
  const potential = h('select', { class: 'input', disabled: !writable }, t.cell.potentials.map((label, n) => h('option', { value: n, selected: n === (cell.potential || 0) }, label)));
  const born = ideasFromCell(key);
  const actions = [{ label: tx.common.actions.close, value: false }];
  if (writable) {
    actions.push({
      label: t.cell.save,
      kind: 'primary',
      onClick: async () => {
        const ok = await saveGenerator((data) => {
          data.cells = data.cells || {};
          data.cells[key] = { text: text.value, potential: Number(potential.value) };
        }, t.cell.message(row.label, col.label));
        if (ok) toast(t.cell.saved, { type: 'success' });
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
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, t.cell.notes), text),
      h('label', { class: 'field' }, potential),
      peopleLine(t.cell.skill(row.label), row),
      peopleLine(t.cell.sector(col.label), col),
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
              writable ? { onAccept: (answer) => { text.value = `${text.value ? `${text.value}\n\n` : ''}${answer}`; text.dispatchEvent(new Event('input')); }, acceptLabel: t.cell.addToNotes } : {},
            ),
        }, icon('claude', 16), h('span', null, t.cell.askClaude)),
        writable
          ? button(t.cell.createIdea, {
              kind: 'ghost',
              iconName: 'idea',
              onClick: () => {
                modal.close();
                const params = new URLSearchParams({ origin: key, tech: row.label, sector: col.label });
                navigate(`/nuovo/idea?${params}`); // i18n-ignore: indirizzo
              },
            })
          : null,
      ),
      born.length ? h('div', null, h('h3', null, t.cell.born), h('ul', { class: 'list' }, born.map((i) => h('li', null, itemLink(i))))) : null,
    ),
    actions,
  });
}

function editAxis(kind, axis) {
  const words = kind === 'rows' ? t.rows : t.cols;
  const people = new Set(axis?.people || []);
  const label = h('input', { type: 'text', class: 'input', maxlength: 80, value: axis?.label || '' });
  const others = h('input', { type: 'text', class: 'input', maxlength: 200, value: axis?.others || '', placeholder: t.axis.othersPlaceholder });
  const choices = state.members.length
    ? h(
        'div',
        { class: 'check-list' },
        state.members.map((m) =>
          h(
            'label',
            { class: 'check' },
            h('input', { type: 'checkbox', checked: people.has(m.user_id), onChange: (e) => (e.target.checked ? people.add(m.user_id) : people.delete(m.user_id)) }),
            m.display_name,
          ),
        ),
      )
    : h('p', { class: 'muted small' }, t.axis.noMembers);
  openModal({
    title: axis ? words.editTitle : words.newTitle,
    body: h(
      'div',
      { class: 'stack' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, t.axis.name), label),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, words.who), choices),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, words.others), others),
    ),
    actions: [
      { label: tx.common.actions.cancel, value: false },
      {
        label: tx.common.actions.save,
        kind: 'primary',
        onClick: async () => {
          const name = label.value.trim();
          if (!name) {
            label.focus();
            return true;
          }
          const values = { label: name, people: [...people], others: others.value.trim() };
          const ok = await saveGenerator((data) => {
            data[kind] = data[kind] || [];
            if (axis) data[kind] = data[kind].map((a) => (a.id === axis.id ? { ...a, ...values } : a));
            else data[kind].push({ id: `${kind === 'rows' ? 'r' : 'c'}-${shortId().slice(0, 8)}`, ...values });
          }, axis ? words.edited(name) : words.added(name));
          return !ok;
        },
      },
    ],
  });
  setTimeout(() => label.focus(), 0);
}

// Membri come avatar, persone esterne come testo.
function axisPeople(axis) {
  const ids = axis.people || [];
  if (!ids.length && !axis.others) return null;
  return h(
    'div',
    { class: 'axis-people' },
    ids.map((id) => avatar(id, 20)),
    axis.others ? h('span', { class: 'muted small' }, axis.others) : null,
  );
}

function peopleLine(label, axis) {
  const names = [...(axis.people || []).map(memberName), axis.others].filter(Boolean);
  return names.length ? h('p', { class: 'small' }, h('strong', null, `${label}: `), names.join(', ')) : null;
}

async function removeAxis(kind, axis) {
  const ok = await confirmDialog(t.axis.removeQuestion(axis.label), { okLabel: t.axis.remove, danger: true });
  if (!ok) return;
  await saveGenerator((data) => {
    data[kind] = (data[kind] || []).filter((a) => a.id !== axis.id);
    for (const key of Object.keys(data.cells || {})) {
      if (key.split(':').includes(axis.id)) delete data.cells[key];
    }
  }, t.axis.removed(axis.label));
}

export function generatorView(outlet) {
  const writable = canWrite();
  const render = () => {
    const item = singleton('generator');
    if (!item) {
      const create = writable ? button(t.createDefault, { kind: 'primary', iconName: 'generator' }) : null;
      create?.addEventListener('click', busy(create, async () => {
        try {
          await createItem('generator', { title: t.defaults.itemTitle, data: DEFAULT_GENERATOR }, t.defaults.message);
        } catch (error) {
          toast(error.message, { type: 'error' });
        }
      }));
      mount(outlet, pageHeader({ title: t.title }), emptyState(t.empty, create));
      return;
    }
    const gen = item.data;
    const axisHead = (kind, axis) =>
      h(
        'div',
        { class: 'axis' },
        h('div', { class: 'axis-main' }, h('span', null, axis.label), axisPeople(axis)),
        writable
          ? h('span', { class: 'axis-actions' },
              h('button', { type: 'button', class: 'icon-btn', 'aria-label': t.editAxis(axis.label), onClick: () => editAxis(kind, axis) }, icon('edit', 14)),
              h('button', { type: 'button', class: 'icon-btn', 'aria-label': t.removeAxis(axis.label), onClick: () => removeAxis(kind, axis) }, icon('close', 14)))
          : null,
      );
    mount(
      outlet,
      pageHeader({
        title: t.title,
        subtitle: t.subtitle,
        actions: writable ? [button(t.addRow, { iconName: 'plus', onClick: () => editAxis('rows') }), button(t.addColumn, { iconName: 'plus', onClick: () => editAxis('cols') })] : [],
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
                      { type: 'button', class: 'gen-cell-btn', onClick: () => cellDialog(singleton('generator').data, row, col, writable), 'aria-label': t.cellLabel(row.label, col.label) },
                      cell?.text ? truncate(cell.text, 90) : h('span', { class: 'muted' }, '+'),
                      count ? h('span', { class: 'badge badge-soft' }, t.ideasCount(count)) : null,
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
  const offs = [
    on('item', ({ item }) => {
      if (item.kind === 'generator' || item.kind === 'idea') render();
    }),
    on('members', render),
  ];
  return () => offs.forEach((off) => off());
}
