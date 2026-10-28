import { h, mount, toast } from '../lib/dom.js';
import { snapshotOf } from '../lib/diff.js';
import { daysUntil, fmtDate, plural } from '../lib/format.js';
import { isUuid } from '../lib/validate.js';
import { KINDS } from '../schema.js';
import { canWrite, getItem, ideas, itemsOf, memberName, on, state } from '../store.js';
import { navigate } from '../router.js';
import { changeStatus } from './actions.js';
import { saveWithMerge } from './merge.js';
import { button, emptyState, itemLink, memberChip, pageHeader, statusPill } from './components.js';

const STATUSES = KINDS.contact.statuses;
const STAGE = Object.fromEntries(STATUSES.map(([value], index) => [value, index]));
const EARLY = new Set(['da_contattare', 'contattata', 'fissata']);

export const CONTACT_FILTERS = [
  ['tutte', 'Tutte'],
  ['mie', 'Mie'],
  ['senza', 'Senza responsabile'],
  ['settimana', 'Da sentire questa settimana'],
];

const isOpen = (contact) => contact.status !== 'chiusa';

// Giorni al prossimo contatto, negativi se in ritardo; null senza data o per le persone chiuse.
export function daysToContact(contact, now = new Date()) {
  if (!isOpen(contact) || !contact.data.next_date) return null;
  return daysUntil(contact.data.next_date, now);
}

// La settimana finisce la domenica.
const daysToSunday = (now) => (7 - now.getDay()) % 7;

export const isOverdue = (contact, now = new Date()) => (daysToContact(contact, now) ?? 0) < 0;

export function dueWithin(contact, days, now = new Date()) {
  const left = daysToContact(contact, now);
  return left !== null && left <= days;
}

export const dueThisWeek = (contact, now = new Date()) => dueWithin(contact, daysToSunday(now), now);
export const needsOwner = (contact) => isOpen(contact) && !contact.data.owner;

export function readContactFilters(query) {
  return {
    filter: CONTACT_FILTERS.some(([v]) => v === query.get('filtro')) ? query.get('filtro') : 'tutte',
    status: STATUSES.some(([v]) => v === query.get('stato')) ? query.get('stato') : null,
    ideaId: isUuid(query.get('idea')) ? query.get('idea') : null,
  };
}

export function filterContacts(list, filters, { me = state.user?.id, now = new Date() } = {}) {
  return list.filter((c) => {
    if (filters.ideaId && c.idea_id !== filters.ideaId) return false;
    if (filters.status && c.status !== filters.status) return false;
    if (filters.filter === 'mie') return Boolean(me) && c.data.owner === me;
    if (filters.filter === 'senza') return needsOwner(c);
    if (filters.filter === 'settimana') return dueThisWeek(c, now);
    return true;
  });
}

// Prima chi è in ritardo, poi per data, poi chi non ha una data; le persone chiuse in fondo.
export function sortContacts(list, now = new Date()) {
  const rank = (c) => {
    if (!isOpen(c)) return 3;
    const days = daysToContact(c, now);
    if (days === null) return 2;
    return days < 0 ? 0 : 1;
  };
  return [...list].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const byDate = ra < 2 ? a.data.next_date.localeCompare(b.data.next_date) : 0;
    return byDate || STAGE[a.status] - STAGE[b.status] || a.title.localeCompare(b.title, 'it');
  });
}

// Per la dashboard: le mie persone da sentire entro una settimana, più quelle ancora senza data.
export function myContactTodos(me, now = new Date()) {
  if (!me) return [];
  const mine = itemsOf('contact').filter((c) => c.data.owner === me && isOpen(c) && (c.data.next_date ? dueWithin(c, 7, now) : EARLY.has(c.status)));
  return sortContacts(mine, now);
}

export const unownedContacts = () => itemsOf('contact').filter(needsOwner);

export function dueLabel(contact, now = new Date()) {
  if (!isOpen(contact)) return null;
  const days = daysToContact(contact, now);
  if (days === null) return h('span', { class: 'deadline' }, 'senza data');
  const text = days < 0 ? `in ritardo di ${plural(-days, 'giorno', 'giorni')}` : days === 0 ? 'oggi' : days === 1 ? 'domani' : `tra ${plural(days, 'giorno', 'giorni')}`;
  return h('span', { class: ['deadline', days < 0 && 'is-late'], title: fmtDate(contact.data.next_date) }, text);
}

export function contactsSummary(list, now = new Date()) {
  return {
    total: list.length,
    toContact: list.filter((c) => c.status === 'da_contattare').length,
    withOwner: list.filter((c) => c.data.owner).length,
    thisWeek: list.filter((c) => dueThisWeek(c, now)).length,
    overdue: list.filter((c) => isOverdue(c, now)).length,
  };
}

function summaryText(s, forIdea) {
  const late = s.overdue ? ` (${s.overdue} in ritardo)` : '';
  return `${plural(s.total, 'persona', 'persone')}${forIdea ? ' per questa idea' : ''}: ${s.toContact} da contattare, ${s.withOwner} con un responsabile, ${s.thisWeek} da sentire questa settimana${late}.`;
}

async function saveContact(id, change, message) {
  const item = getItem(id);
  if (!item || item.deleted_at) return;
  const base = snapshotOf(item);
  const next = change(structuredClone(base));
  try {
    const result = await saveWithMerge(item, base, next, message);
    if (!result.cancelled) toast(message, { type: 'success' });
  } catch (error) {
    toast(error.message, { type: 'error' });
  }
}

function setData(key, value) {
  return (snapshot) => {
    if (value) snapshot.data[key] = value;
    else delete snapshot.data[key];
    return snapshot;
  };
}

export function contactsView(outlet, params, query) {
  const filters = readContactFilters(query);
  const writable = canWrite();
  let alive = true;

  const hrefFor = (patch) => {
    const next = { ...filters, ...patch };
    const qs = new URLSearchParams();
    if (next.filter && next.filter !== 'tutte') qs.set('filtro', next.filter);
    if (next.status) qs.set('stato', next.status);
    if (next.ideaId) qs.set('idea', next.ideaId);
    const s = qs.toString();
    return `/contatti${s ? `?${s}` : ''}`;
  };

  // Dopo un salvataggio riuscito la pagina si ridisegna da sola; se non riesce, si torna ai valori salvati.
  const after = (promise) => promise.finally(() => alive && render());

  const statusControl = (c) =>
    h(
      'select',
      { class: 'input input-small', 'aria-label': `Stato: ${c.title}`, onChange: (e) => after(changeStatus(getItem(c.id), e.target.value)) },
      STATUSES.map(([v, label]) => h('option', { value: v, selected: v === c.status }, label)),
    );

  const ownerControl = (c) => {
    const entries = state.members.map((m) => [m.user_id, m.display_name]);
    if (c.data.owner && !entries.some(([id]) => id === c.data.owner)) entries.push([c.data.owner, memberName(c.data.owner)]);
    return h(
      'select',
      {
        class: 'input input-small',
        'aria-label': `Chi se ne occupa: ${c.title}`,
        onChange: (e) => {
          const owner = e.target.value || undefined;
          after(saveContact(c.id, setData('owner', owner), `Chi se ne occupa: ${owner ? memberName(owner) : 'nessuno'}`));
        },
      },
      h('option', { value: '' }, 'Nessuno'),
      entries.map(([id, name]) => h('option', { value: id, selected: id === c.data.owner }, name)),
    );
  };

  const dateControl = (c) =>
    h('input', {
      class: 'input input-small',
      type: 'date',
      value: c.data.next_date || '',
      'aria-label': `Prossimo contatto: ${c.title}`,
      onChange: (e) => {
        const date = e.target.value || undefined;
        if (date === c.data.next_date) return;
        after(saveContact(c.id, setData('next_date', date), `Prossimo contatto: ${date ? fmtDate(date) : 'nessuna data'}`));
      },
    });

  const action = (c) => {
    const interview = c.data.interview_id ? getItem(c.data.interview_id) : null;
    if (interview && !interview.deleted_at) return itemLink(interview, 'Intervista');
    if (!writable || !isOpen(c)) return null;
    return button('Registra il colloquio', {
      iconName: 'interview',
      href: `#/nuovo/interview?contatto=${c.id}&stato=fatta`,
      title: 'Scrivi com\'è andata: la persona viene collegata all\'intervista e passa a «In contatto»',
    });
  };

  const row = (c, now) => {
    const who = [c.data.role, c.data.organization].filter(Boolean).join(', ');
    return h(
      'tr',
      { class: isOverdue(c, now) && 'is-overdue', dataset: { id: c.id } },
      h('td', null, itemLink(c), who ? h('div', { class: 'muted small' }, who) : null),
      h('td', null, itemLink(getItem(c.idea_id))),
      h('td', null, writable ? statusControl(c) : statusPill('contact', c.status)),
      h('td', null, writable ? ownerControl(c) : c.data.owner ? memberChip(c.data.owner) : h('span', { class: 'muted' }, 'Nessuno')),
      h(
        'td',
        { class: 'contact-date' },
        writable ? dateControl(c) : c.data.next_date ? fmtDate(c.data.next_date) : h('span', { class: 'muted' }, '-'),
        c.data.next_date ? dueLabel(c, now) : null,
      ),
      h('td', { class: 'row-actions' }, action(c)),
    );
  };

  const select = (label, value, entries, key, empty) =>
    h(
      'label',
      { class: 'field field-inline' },
      h('span', { class: 'field-label' }, label),
      h(
        'select',
        { class: 'input', onChange: (e) => navigate(hrefFor({ [key]: e.target.value || null })) },
        h('option', { value: '' }, empty),
        entries.map(([v, l]) => h('option', { value: v, selected: v === value }, l)),
      ),
    );

  function render() {
    const now = new Date();
    const all = itemsOf('contact');
    const scope = filters.ideaId ? all.filter((c) => c.idea_id === filters.ideaId) : all;
    const list = sortContacts(filterContacts(all, filters, { now }), now);
    let body;
    if (!all.length) body = emptyState('Nessuna persona in lista. Si aggiungono dalla pagina di ogni idea, nella scheda «Persone e interviste».');
    else if (!list.length) body = emptyState('Nessuna persona con questi filtri.');
    else {
      body = h(
        'div',
        { class: 'table-scroll' },
        h(
          'table',
          { class: 'table contacts-table' },
          h('thead', null, h('tr', null, ['Persona', 'Idea', 'Stato', 'Chi se ne occupa', 'Prossimo contatto', ''].map((t) => h('th', null, t)))),
          h('tbody', null, list.map((c) => row(c, now))),
        ),
      );
    }
    mount(
      outlet,
      pageHeader({
        title: 'Contatti',
        subtitle: 'Le persone da sentire per tutte le idee. A ognuna serve qualcuno che se ne occupi e una data.',
        actions: [writable ? button('Aggiungi una persona', { kind: 'primary', iconName: 'plus', href: `#/nuovo/contact${filters.ideaId ? `?idea=${filters.ideaId}` : ''}` }) : null],
      }),
      h('p', { class: 'contacts-summary' }, summaryText(contactsSummary(scope, now), Boolean(filters.ideaId))),
      h(
        'div',
        { class: 'filters' },
        h(
          'div',
          { class: 'toolbar toolbar-wrap', role: 'group', 'aria-label': 'Quali persone' },
          CONTACT_FILTERS.map(([value, label]) =>
            h(
              'a',
              { class: ['btn', 'btn-small', value === filters.filter ? 'btn-primary' : 'btn-ghost'], href: `#${hrefFor({ filter: value })}`, 'aria-current': value === filters.filter ? 'true' : undefined },
              label,
            ),
          ),
        ),
        select('Stato', filters.status, STATUSES, 'status', 'Tutti'),
        select('Idea', filters.ideaId, ideas().map((i) => [i.id, i.title]), 'ideaId', 'Tutte'),
      ),
      body,
    );
  }

  render();
  const offs = [
    on('item', ({ item }) => {
      if (['contact', 'idea', 'interview'].includes(item.kind)) render();
    }),
    on('members', render),
  ];
  return () => {
    alive = false;
    offs.forEach((off) => off());
  };
}
