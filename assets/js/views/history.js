import { h, mount, busy, confirmDialog, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { blame, diffLines, diffSnapshots, diffWords, flatten, snapshotOf, snapshotStats } from '../lib/diff.js';
import { dayKey, dayLabel, fmtDateTime, truncate } from '../lib/format.js';
import { isUuid } from '../lib/validate.js';
import { api } from '../lib/api.js';
import { KINDS, describePath, fieldOf, formatValue, routeFor } from '../schema.js';
import { canWrite, getItem, ideas, labelContext, memberName, on, revertItem, state } from '../store.js';
import { navigate } from '../router.js';
import { tx } from '../i18n/index.js';
import { avatar, button, emptyState, errorBox, kindBadge, loading, pageHeader, photoView, timeAgo } from './components.js';

const t = tx.history;
// Nomi per il browser, non testi: l'indirizzo dello storico, il tag e le classi delle parti tolte.
const LOG_PATH = '/storico'; // i18n-ignore: the address of the page
const DEL = { tag: 'del', chip: 'chip chip-del', stat: 'del' }; // i18n-ignore: tag and class names

export const VERBS = t.verbs;
const verb = (op) => (Object.hasOwn(VERBS, op) ? VERBS[op] : '');

export function changedLabels(rev) {
  const labels = (rev.changed || []).map((key) => {
    const own = t.fields[rev.kind];
    if (own && Object.hasOwn(own, key)) return own[key];
    const path = ['title', 'status', 'idea_id'].includes(key) ? key : `data.${key}`;
    return describePath(rev.kind, path, labelContext).toLowerCase();
  });
  return [...new Set(labels)];
}

export function revisionSummary(rev) {
  if (rev.message) return rev.message;
  if (rev.op === 'create') return t.summary.create;
  if (rev.op === 'delete') return t.summary.delete;
  if (rev.op === 'restore') return t.summary.restore;
  const labels = changedLabels(rev);
  return labels.length ? t.summary.changed(labels) : t.summary.nothing;
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
        ` ${verb(rev.op) || VERBS.update} `,
        kindBadge(rev.kind),
        ' ',
        h('a', { href: `#/diff/${rev.item_id}/${rev.version}` }, t.quoted(truncate(rev.title, 70))),
      ),
      h('div', { class: ['log-message', !rev.message && 'muted'] }, revisionSummary(rev)),
    ),
    h('div', { class: 'log-side' }, h('a', { class: 'version', href: `#/diff/${rev.item_id}/${rev.version}`, title: t.seeChanges }, `v${rev.version}`), timeAgo(rev.created_at)),
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

// Parametri dell'indirizzo: restano in italiano come gli indirizzi.
const PARAM = { author: 'autore', kind: 'tipo', idea: 'idea' }; // i18n-ignore: address parameters

export function readLogFilters(query) {
  const authorId = isUuid(query.get(PARAM.author)) ? query.get(PARAM.author) : null;
  const kind = KINDS[query.get(PARAM.kind)] ? query.get(PARAM.kind) : null;
  const ideaId = isUuid(query.get(PARAM.idea)) ? query.get(PARAM.idea) : null;
  return { authorId, kind, ideaId };
}

function filterHref(filters) {
  const params = new URLSearchParams();
  if (filters.authorId) params.set(PARAM.author, filters.authorId);
  if (filters.kind) params.set(PARAM.kind, filters.kind);
  if (filters.ideaId) params.set(PARAM.idea, filters.ideaId);
  const qs = params.toString();
  return `${LOG_PATH}${qs ? `?${qs}` : ''}`;
}

export function logView(outlet, params, query) {
  const filters = readLogFilters(query);
  const listHost = h('div', null, loading());
  const more = h('button', { type: 'button', class: 'btn btn-ghost', hidden: true }, t.log.more);
  let revisions = [];

  const select = (label, value, entries, key) =>
    h(
      'label',
      { class: 'field field-inline' },
      h('span', { class: 'field-label' }, label),
      h(
        'select',
        { class: 'input', onChange: (e) => navigate(filterHref({ ...filters, [key]: e.target.value || null }), { replace: true }) },
        h('option', { value: '' }, t.log.all),
        entries.map(([v, l]) => h('option', { value: v, selected: v === value }, l)),
      ),
    );

  const render = () => {
    if (!revisions.length) {
      mount(listHost, emptyState(t.log.empty));
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
    pageHeader({ title: t.log.title, subtitle: t.log.subtitle }),
    h(
      'div',
      { class: 'filters' },
      select(t.log.author, filters.authorId, state.members.map((m) => [m.user_id, m.display_name]), 'authorId'),
      select(t.log.type, filters.kind, Object.entries(KINDS).map(([k, d]) => [k, d.label]), 'kind'),
      select(t.log.idea, filters.ideaId, ideas({ includeDeleted: true }).map((i) => [i.id, i.title]), 'ideaId'),
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
// Il segno davanti a ogni riga del confronto, per tipo di operazione.
const SIGNS = { add: '+', del: '−', eq: ' ' };

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
      rows.push(h('div', { class: 'diff-line diff-skip' }, t.diff.sameLines(skipped)));
      skipped = 0;
    }
    rows.push(h('div', { class: ['diff-line', `diff-${op.t}`] }, h('span', { class: 'diff-sign' }, SIGNS[op.t]), h('span', null, op.v || ' ')));
  });
  if (skipped) rows.push(h('div', { class: 'diff-line diff-skip' }, t.diff.sameLines(skipped)));
  return h('div', { class: 'diff-lines' }, rows);
}

const isPhotoPath = (kind, path) => fieldOf(kind, path.replace(/^data\./, '').split('.')[0])?.type === 'image';

// A value stored as a code (a status, a choice, a person) is compared in words, before and after: word by word the
// codes would be shown as they are saved, in Italian.
const isCoded = (kind, change) => [change.before, change.after].some((value) => value !== undefined && displayValue(kind, change.path, value) !== value);

// Una foto si confronta guardandola, non come testo base64.
function photoChange(before, after) {
  const side = (src, cls) => (src ? h('span', { class: cls }, photoView(src, { alt: t.diff.photo, size: 48 })) : h('span', { class: 'muted small' }, t.diff.noPhoto));
  return h('div', { class: 'photo-change' }, side(before, 'photo-old'), '→', side(after, 'photo-new'));
}

export function changeView(kind, change) {
  let body;
  if (isPhotoPath(kind, change.path)) {
    body = photoChange(change.before, change.after);
  } else if (kind === 'idea' && change.path.startsWith('data.roadmap.')) {
    body = h('div', { class: 'diff-inline' }, change.before ? h(DEL.tag, null, displayValue(kind, change.path, change.before)) : t.diff.todo, ' → ', change.after ? h('ins', null, displayValue(kind, change.path, change.after)) : t.diff.todo);
  } else if (change.kind === 'text') {
    body = lineDiffView(change.before, change.after);
  } else if (change.kind === 'inline' && !isCoded(kind, change)) {
    body = h(
      'div',
      { class: 'diff-inline text-block' },
      diffWords(change.before ?? '', change.after ?? '').map((op) => (op.t === 'eq' ? op.v : h(op.t === 'add' ? 'ins' : DEL.tag, null, op.v))),
    );
  } else if (change.kind === 'set') {
    body = h(
      'div',
      { class: 'chips' },
      change.addedItems.map((v) => h('span', { class: 'chip chip-add' }, `+ ${displayValue(kind, change.path, [v])}`)),
      change.removedItems.map((v) => h('span', { class: DEL.chip }, `− ${displayValue(kind, change.path, [v])}`)),
    );
  } else {
    body = h(
      'div',
      { class: 'diff-inline' },
      change.before !== undefined ? h(DEL.tag, null, displayValue(kind, change.path, change.before)) : null,
      change.before !== undefined && change.after !== undefined ? ' → ' : null,
      change.after !== undefined ? h('ins', null, displayValue(kind, change.path, change.after)) : null,
    );
  }
  return h('section', { class: 'change' }, h('h3', null, describePath(kind, change.path, labelContext), h('span', { class: ['change-tag', `tag-${change.type}`] }, t.diff.tags[change.type])), body);
}

export async function diffView(outlet, params) {
  mount(outlet, loading());
  const to = Number(params.to);
  if (!isUuid(params.id) || !Number.isInteger(to)) {
    mount(outlet, errorBox({ message: t.diff.invalidVersion }));
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
    mount(outlet, errorBox({ message: t.diff.versionNotFound }));
    return null;
  }
  const fromVersion = params.from !== undefined ? Number(params.from) : to - 1;
  const from = history.find((r) => r.version === fromVersion) || null;
  const latest = history[history.length - 1];
  const item = getItem(params.id);
  const changes = diffSnapshots(from ? snapshotOf(from) : {}, snapshotOf(target));
  const { add: added, del: removed } = snapshotStats(changes);

  const revertButton = canWrite() && item && !item.deleted_at && target.version !== latest.version
    ? (() => {
        const b = button(t.diff.restore(target.version), { kind: 'primary', iconName: 'restore' });
        b.addEventListener('click', busy(b, async () => {
          const ok = await confirmDialog(t.diff.restoreConfirm(target.version), { title: t.diff.restoreTitle, okLabel: tx.common.actions.restore });
          if (!ok) return;
          try {
            await revertItem(getItem(params.id), target.version);
            toast(t.diff.restored(target.version), { type: 'success' });
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
    target.version > 1 ? h('a', { class: 'btn btn-ghost btn-small', href: `#/diff/${params.id}/${target.version - 1}` }, icon('back', 14), t.diff.previous) : null,
    target.version < latest.version ? h('a', { class: 'btn btn-ghost btn-small', href: `#/diff/${params.id}/${target.version + 1}` }, t.diff.next) : null,
    h('a', { class: 'btn btn-ghost btn-small', href: `#${LOG_PATH}/${params.id}` }, icon('history', 14), t.diff.allVersions),
  );

  mount(
    outlet,
    pageHeader({
      back: { href: `#${LOG_PATH}/${params.id}` },
      eyebrow: kindBadge(target.kind),
      title: target.title,
      subtitle: h(
        'span',
        null,
        `${t.diff.version(target.version, from?.version)} · `,
        memberName(target.author_id),
        ` ${verb(target.op)} · ${fmtDateTime(target.created_at)}`,
      ),
      actions: [revertButton],
    }),
    h('div', { class: 'commit-box' }, avatar(target.author_id, 32), h('div', null, h('strong', null, revisionSummary(target)), h('div', { class: 'diff-stats' }, h('span', { class: 'add' }, `+${added}`), ' ', h('span', { class: DEL.stat }, `−${removed}`)))),
    nav,
    changes.length ? h('div', { class: 'changes' }, changes.map((c) => changeView(target.kind, c))) : emptyState(target.op === 'delete' ? t.diff.archived : target.op === 'restore' ? t.diff.restoredFromTrash : t.diff.noDifference),
  );
  return null;
}

export async function itemHistoryView(outlet, params) {
  mount(outlet, loading());
  if (!isUuid(params.id)) {
    mount(outlet, errorBox({ message: t.versions.invalidItem }));
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
    mount(outlet, errorBox({ message: t.versions.none }));
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
      h('td', null, h('input', { type: 'radio', name: 'from', 'aria-label': t.versions.from(rev.version), checked: rev.version === fromVersion, onChange: () => (fromVersion = rev.version) })),
      h('td', null, h('input', { type: 'radio', name: 'to', 'aria-label': t.versions.to(rev.version), checked: rev.version === toVersion, onChange: () => (toVersion = rev.version) })),
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
      h('h2', null, t.versions.blame),
      h(
        'table',
        { class: 'table' },
        h('thead', null, h('tr', null, t.versions.blameColumns.map((label) => h('th', null, label)))),
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
      back: { href: item ? routeFor(item) : `#${LOG_PATH}` },
      eyebrow: kindBadge(latest.kind),
      title: t.versions.title(latest.title),
      subtitle: t.versions.count(history.length),
      actions: [
        button(t.versions.compare, {
          kind: 'primary',
          iconName: 'diff',
          onClick: () => navigate(`/diff/${params.id}/${Math.max(fromVersion, toVersion)}/${Math.min(fromVersion, toVersion)}`),
        }),
        button(t.versions.blame, { iconName: 'eye', onClick: toggleBlame }),
      ],
    }),
    h('table', { class: 'table' }, h('thead', null, h('tr', null, t.versions.columns.map((label) => h('th', null, label)))), h('tbody', null, rows)),
    blameHost,
  );
  return null;
}
