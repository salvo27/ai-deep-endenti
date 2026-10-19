import { h, mount, busy, confirmDialog, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { blame, diffLines, diffSnapshots, diffWords, flatten, snapshotOf, snapshotStats } from '../lib/diff.js';
import { dayKey, dayLabel, fmtDateTime, truncate } from '../lib/format.js';
import { isUuid } from '../lib/validate.js';
import { api } from '../lib/api.js';
import { KINDS, describePath, fieldOf, formatValue, routeFor } from '../schema.js';
import { canWrite, getItem, ideas, labelContext, memberName, on, revertItem, state } from '../store.js';
import { navigate } from '../router.js';
import { avatar, button, emptyState, errorBox, kindBadge, loading, pageHeader, photoView, timeAgo } from './components.js';

export const VERBS = {
  create: 'ha creato',
  update: 'ha modificato',
  delete: 'ha archiviato',
  restore: 'ha ripristinato',
  revert: 'ha riportato a una versione precedente',
};

const TOP_LABELS = {
  score: { scores: 'voti', notes: 'note' },
  criteria: { criteria: 'criteri' },
  generator: { rows: 'righe', cols: 'colonne', cells: 'celle' },
  canvas: { validated: 'blocchi validati' },
};

export function changedLabels(rev) {
  const labels = (rev.changed || []).map((key) => {
    if (TOP_LABELS[rev.kind]?.[key]) return TOP_LABELS[rev.kind][key];
    const path = ['title', 'status', 'idea_id'].includes(key) ? key : `data.${key}`;
    return describePath(rev.kind, path, labelContext).toLowerCase();
  });
  return [...new Set(labels)];
}

export function revisionSummary(rev) {
  if (rev.message) return rev.message;
  if (rev.op === 'create') return 'Prima versione';
  if (rev.op === 'delete') return 'Spostato nel cestino';
  if (rev.op === 'restore') return 'Ripristinato dal cestino';
  const labels = changedLabels(rev);
  return labels.length ? `Modificati: ${labels.join(', ')}` : 'Nessun campo cambiato';
}

export function revisionLine(rev) {
  return h(
    'li',
    { class: 'log-entry' },
    avatar(rev.author_id, 28),
    h(
      'div',
      { class: 'log-main' },
      h(
        'div',
        null,
        h('strong', null, memberName(rev.author_id)),
        ` ${VERBS[rev.op] || 'ha modificato'} `,
        kindBadge(rev.kind),
        ' ',
        h('a', { href: `#/diff/${rev.item_id}/${rev.version}` }, `«${truncate(rev.title, 70)}»`),
      ),
      h('div', { class: ['log-message', !rev.message && 'muted'] }, revisionSummary(rev)),
    ),
    h('div', { class: 'log-side' }, h('a', { class: 'version', href: `#/diff/${rev.item_id}/${rev.version}`, title: 'Vedi le modifiche' }, `v${rev.version}`), timeAgo(rev.created_at)),
  );
}

function groupByDay(revisions) {
  const groups = new Map();
  for (const rev of revisions) {
    const key = dayKey(rev.created_at);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rev);
  }
  return groups;
}

export function readLogFilters(query) {
  const authorId = isUuid(query.get('autore')) ? query.get('autore') : null;
  const kind = KINDS[query.get('tipo')] ? query.get('tipo') : null;
  const ideaId = isUuid(query.get('idea')) ? query.get('idea') : null;
  return { authorId, kind, ideaId };
}

function filterHref(filters) {
  const params = new URLSearchParams();
  if (filters.authorId) params.set('autore', filters.authorId);
  if (filters.kind) params.set('tipo', filters.kind);
  if (filters.ideaId) params.set('idea', filters.ideaId);
  const qs = params.toString();
  return `/storico${qs ? `?${qs}` : ''}`;
}

export function logView(outlet, params, query) {
  const filters = readLogFilters(query);
  const listHost = h('div', null, loading());
  const more = h('button', { type: 'button', class: 'btn btn-ghost', hidden: true }, 'Carica altri');
  let revisions = [];

  const select = (label, value, entries, key) =>
    h(
      'label',
      { class: 'field field-inline' },
      h('span', { class: 'field-label' }, label),
      h(
        'select',
        { class: 'input', onChange: (e) => navigate(filterHref({ ...filters, [key]: e.target.value || null })) },
        h('option', { value: '' }, 'Tutti'),
        entries.map(([v, l]) => h('option', { value: v, selected: v === value }, l)),
      ),
    );

  const render = () => {
    if (!revisions.length) {
      mount(listHost, emptyState('Nessuna modifica con questi filtri.'));
      return;
    }
    mount(listHost,
      ...[...groupByDay(revisions)].map(([day, revs]) =>
        h('section', { class: 'log-day' }, h('h2', null, dayLabel(day)), h('ul', { class: 'log' }, revs.map(revisionLine))),
      ),
    );
  };

  const load = async (beforeId) => {
    try {
      const page = await api.listRevisions({ ...filters, beforeId, limit: 50 });
      revisions = beforeId ? [...revisions, ...page] : page;
      more.hidden = page.length < 50;
      render();
    } catch (error) {
      mount(listHost, errorBox(error));
    }
  };
  more.addEventListener('click', busy(more, () => load(revisions[revisions.length - 1]?.id)));

  mount(
    outlet,
    pageHeader({ title: 'Storico', subtitle: 'Ogni salvataggio è una versione: chi, quando, cosa e perché. Lo storico non si può modificare.' }),
    h(
      'div',
      { class: 'filters' },
      select('Autore', filters.authorId, state.members.map((m) => [m.user_id, m.display_name]), 'authorId'),
      select('Tipo', filters.kind, Object.entries(KINDS).map(([k, d]) => [k, d.label]), 'kind'),
      select('Idea', filters.ideaId, ideas({ includeDeleted: true }).map((i) => [i.id, i.title]), 'ideaId'),
    ),
    listHost,
    more,
  );
  load();
  return on('revision', (rev) => {
    if (filters.authorId && rev.author_id !== filters.authorId) return;
    if (filters.kind && rev.kind !== filters.kind) return;
    if (filters.ideaId && rev.idea_id !== filters.ideaId && rev.item_id !== filters.ideaId) return;
    if (revisions.some((r) => r.id === rev.id)) return;
    revisions = [rev, ...revisions];
    render();
  });
}

function displayValue(kind, path, value) {
  const shown = formatValue(kind, path, value, labelContext);
  if (Array.isArray(shown)) return shown.join(', ');
  if (shown && typeof shown === 'object') return JSON.stringify(shown);
  return String(shown ?? '');
}

const CONTEXT_LINES = 2;

export function lineDiffView(before, after) {
  const ops = diffLines(before ?? '', after ?? '');
  const keep = ops.map((op, i) => op.t !== 'eq' || ops.slice(Math.max(0, i - CONTEXT_LINES), i + CONTEXT_LINES + 1).some((o) => o.t !== 'eq'));
  const rows = [];
  let skipped = 0;
  ops.forEach((op, i) => {
    if (!keep[i]) {
      skipped += 1;
      return;
    }
    if (skipped) {
      rows.push(h('div', { class: 'diff-line diff-skip' }, `… ${skipped} righe uguali`));
      skipped = 0;
    }
    const sign = op.t === 'add' ? '+' : op.t === 'del' ? '−' : ' ';
    rows.push(h('div', { class: ['diff-line', `diff-${op.t}`] }, h('span', { class: 'diff-sign' }, sign), h('span', null, op.v || ' ')));
  });
  if (skipped) rows.push(h('div', { class: 'diff-line diff-skip' }, `… ${skipped} righe uguali`));
  return h('div', { class: 'diff-lines' }, rows);
}

const isPhotoPath = (kind, path) => fieldOf(kind, path.replace(/^data\./, '').split('.')[0])?.type === 'image';

// Una foto si confronta guardandola, non come testo base64.
function photoChange(before, after) {
  const side = (src, cls) => (src ? h('span', { class: cls }, photoView(src, { alt: 'Foto', size: 48 })) : h('span', { class: 'muted small' }, 'nessuna foto'));
  return h('div', { class: 'photo-change' }, side(before, 'photo-old'), '→', side(after, 'photo-new'));
}

export function changeView(kind, change) {
  let body;
  if (isPhotoPath(kind, change.path)) {
    body = photoChange(change.before, change.after);
  } else if (change.kind === 'text') {
    body = lineDiffView(change.before, change.after);
  } else if (change.kind === 'inline') {
    body = h(
      'div',
      { class: 'diff-inline text-block' },
      diffWords(change.before ?? '', change.after ?? '').map((op) => (op.t === 'eq' ? op.v : h(op.t === 'add' ? 'ins' : 'del', null, op.v))),
    );
  } else if (change.kind === 'set') {
    body = h(
      'div',
      { class: 'chips' },
      change.addedItems.map((v) => h('span', { class: 'chip chip-add' }, `+ ${displayValue(kind, change.path, [v])}`)),
      change.removedItems.map((v) => h('span', { class: 'chip chip-del' }, `− ${displayValue(kind, change.path, [v])}`)),
    );
  } else {
    body = h(
      'div',
      { class: 'diff-inline' },
      change.before !== undefined ? h('del', null, displayValue(kind, change.path, change.before)) : null,
      change.before !== undefined && change.after !== undefined ? ' → ' : null,
      change.after !== undefined ? h('ins', null, displayValue(kind, change.path, change.after)) : null,
    );
  }
  const tag = { added: 'aggiunto', removed: 'rimosso', changed: 'modificato' }[change.type];
  return h('section', { class: 'change' }, h('h3', null, describePath(kind, change.path, labelContext), h('span', { class: ['change-tag', `tag-${change.type}`] }, tag)), body);
}

export async function diffView(outlet, params) {
  mount(outlet, loading());
  const to = Number(params.to);
  if (!isUuid(params.id) || !Number.isInteger(to)) {
    mount(outlet, errorBox({ message: 'Versione non valida.' }));
    return null;
  }
  let history;
  try {
    history = await api.itemHistory(params.id);
  } catch (error) {
    mount(outlet, errorBox(error));
    return null;
  }
  const target = history.find((r) => r.version === to);
  if (!target) {
    mount(outlet, errorBox({ message: 'Versione non trovata.' }));
    return null;
  }
  const fromVersion = params.from !== undefined ? Number(params.from) : to - 1;
  const from = history.find((r) => r.version === fromVersion) || null;
  const latest = history[history.length - 1];
  const item = getItem(params.id);
  const changes = diffSnapshots(from ? snapshotOf(from) : {}, snapshotOf(target));
  const stats = snapshotStats(changes);

  const revertButton = canWrite() && item && !item.deleted_at && target.version !== latest.version
    ? (() => {
        const b = button(`Ripristina la versione ${target.version}`, { kind: 'primary', iconName: 'restore' });
        b.addEventListener('click', busy(b, async () => {
          const ok = await confirmDialog(
            `Il contenuto tornerà com'era nella versione ${target.version}. Verrà creata una nuova versione: nulla di quanto fatto dopo andrà perso dallo storico.`,
            { title: 'Ripristinare questa versione?', okLabel: 'Ripristina' },
          );
          if (!ok) return;
          try {
            await revertItem(getItem(params.id), target.version);
            toast(`Ripristinata la versione ${target.version}.`, { type: 'success' });
            navigate(routeFor(getItem(params.id)).slice(1));
          } catch (error) {
            toast(error.message, { type: 'error' });
          }
        }));
        return b;
      })()
    : null;

  const nav = h(
    'div',
    { class: 'diff-nav' },
    target.version > 1 ? h('a', { class: 'btn btn-ghost btn-small', href: `#/diff/${params.id}/${target.version - 1}` }, icon('back', 14), 'Versione precedente') : null,
    target.version < latest.version ? h('a', { class: 'btn btn-ghost btn-small', href: `#/diff/${params.id}/${target.version + 1}` }, 'Versione successiva') : null,
    h('a', { class: 'btn btn-ghost btn-small', href: `#/storico/${params.id}` }, icon('history', 14), 'Tutte le versioni'),
  );

  mount(
    outlet,
    pageHeader({
      back: { href: `#/storico/${params.id}` },
      eyebrow: kindBadge(target.kind),
      title: target.title,
      subtitle: h(
        'span',
        null,
        `Versione ${target.version}${from ? ` confrontata con la ${from.version}` : ''} · `,
        memberName(target.author_id),
        ` ${VERBS[target.op] || ''} · ${fmtDateTime(target.created_at)}`,
      ),
      actions: [revertButton],
    }),
    h('div', { class: 'commit-box' }, avatar(target.author_id, 32), h('div', null, h('strong', null, revisionSummary(target)), h('div', { class: 'diff-stats' }, h('span', { class: 'add' }, `+${stats.add}`), ' ', h('span', { class: 'del' }, `−${stats.del}`)))),
    nav,
    changes.length ? h('div', { class: 'changes' }, changes.map((c) => changeView(target.kind, c))) : emptyState(target.op === 'delete' ? 'L\'elemento è stato spostato nel cestino.' : target.op === 'restore' ? 'L\'elemento è stato ripristinato dal cestino.' : 'Nessuna differenza nel contenuto.'),
  );
  return null;
}

export async function itemHistoryView(outlet, params) {
  mount(outlet, loading());
  if (!isUuid(params.id)) {
    mount(outlet, errorBox({ message: 'Elemento non valido.' }));
    return null;
  }
  let history;
  try {
    history = await api.itemHistory(params.id);
  } catch (error) {
    mount(outlet, errorBox(error));
    return null;
  }
  if (!history.length) {
    mount(outlet, errorBox({ message: 'Nessuna versione trovata.' }));
    return null;
  }
  const latest = history[history.length - 1];
  const item = getItem(params.id);
  let fromVersion = Math.max(1, latest.version - 1);
  let toVersion = latest.version;
  const blameHost = h('div', { hidden: true });

  const rows = [...history].reverse().map((rev) =>
    h(
      'tr',
      null,
      h('td', null, h('input', { type: 'radio', name: 'from', 'aria-label': `Da versione ${rev.version}`, checked: rev.version === fromVersion, onChange: () => (fromVersion = rev.version) })),
      h('td', null, h('input', { type: 'radio', name: 'to', 'aria-label': `A versione ${rev.version}`, checked: rev.version === toVersion, onChange: () => (toVersion = rev.version) })),
      h('td', null, h('a', { class: 'version', href: `#/diff/${rev.item_id}/${rev.version}` }, `v${rev.version}`)),
      h('td', null, avatar(rev.author_id, 22), ' ', memberName(rev.author_id)),
      h('td', { class: ['log-message', !rev.message && 'muted'] }, revisionSummary(rev)),
      h('td', null, timeAgo(rev.created_at)),
    ),
  );

  const toggleBlame = () => {
    if (!blameHost.hidden) {
      blameHost.hidden = true;
      return;
    }
    const owners = blame(history);
    const current = flatten(snapshotOf(latest));
    mount(blameHost,
      h('h2', null, 'Chi ha scritto cosa'),
      h(
        'table',
        { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, 'Campo'), h('th', null, 'Contenuto'), h('th', null, 'Ultima modifica'))),
        h(
          'tbody',
          null,
          [...current.keys()]
            .filter((path) => !path.endsWith('#order'))
            .map((path) => {
              const rev = owners.get(path);
              return h(
                'tr',
                null,
                h('td', null, describePath(latest.kind, path, labelContext)),
                h('td', null, truncate(displayValue(latest.kind, path, current.get(path)), 120)),
                h('td', null, rev ? [avatar(rev.author_id, 20), ' ', memberName(rev.author_id), ' · ', h('a', { href: `#/diff/${rev.item_id}/${rev.version}` }, `v${rev.version}`)] : '-'),
              );
            }),
        ),
      ),
    );
    blameHost.hidden = false;
  };

  mount(
    outlet,
    pageHeader({
      back: { href: item ? routeFor(item) : '#/storico' },
      eyebrow: kindBadge(latest.kind),
      title: `Versioni di «${latest.title}»`,
      subtitle: `${history.length} versioni`,
      actions: [
        button('Confronta le versioni scelte', {
          kind: 'primary',
          iconName: 'diff',
          onClick: () => navigate(`/diff/${params.id}/${Math.max(fromVersion, toVersion)}/${Math.min(fromVersion, toVersion)}`),
        }),
        button('Chi ha scritto cosa', { iconName: 'eye', onClick: toggleBlame }),
      ],
    }),
    h('table', { class: 'table' }, h('thead', null, h('tr', null, h('th', null, 'Da'), h('th', null, 'A'), h('th', null, 'Versione'), h('th', null, 'Autore'), h('th', null, 'Messaggio'), h('th', null, 'Quando'))), h('tbody', null, rows)),
    blameHost,
  );
  return null;
}
