import { h, mount, toast } from '../lib/dom.js';
import { snapshotOf } from '../lib/diff.js';
import { daysUntil, fmtDate } from '../lib/format.js';
import { isUuid } from '../lib/validate.js';
import { language, tx } from '../i18n/index.js';
import { KINDS } from '../schema.js';
import { canWrite, getItem, ideas, itemsOf, memberName, on, state } from '../store.js';
import { navigate } from '../router.js';
import { changeStatus } from './actions.js';
import { saveWithMerge } from './merge.js';
import { button, emptyState, itemLink, memberChip, pageHeader, statusPill } from './components.js';

const STATUSES = KINDS.contact.statuses;
const STAGE = Object.fromEntries(STATUSES.map(([value], index) => [value, index]));
// Stored values and addresses: their Italian words are part of the data and of the URL, not text the reader sees.
const EARLY = new Set(['da_contattare', 'contattata', 'fissata']); // i18n-ignore
const FILTERS = { all: 'tutte', mine: 'mie', noOwner: 'senza', thisWeek: 'settimana' }; // i18n-ignore
const PARAMS = { filter: 'filtro', status: 'stato', idea: 'idea' }; // i18n-ignore
const PATHS = { contacts: '/contatti', interview: '#/nuovo/interview?contatto=', held: '&stato=fatta', create: '#/nuovo/contact' }; // i18n-ignore

export const CONTACT_FILTERS = Object.values(FILTERS).map((value) => [value, tx.contacts.filters[value]]);

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
    filter: CONTACT_FILTERS.some(([v]) => v === query.get(PARAMS.filter)) ? query.get(PARAMS.filter) : FILTERS.all,
    status: STATUSES.some(([v]) => v === query.get(PARAMS.status)) ? query.get(PARAMS.status) : null,
    ideaId: isUuid(query.get(PARAMS.idea)) ? query.get(PARAMS.idea) : null,
  };
}

export function filterContacts(list, filters, { me = state.user?.id, now = new Date() } = {}) {
  return list.filter((c) => {
    if (filters.ideaId && c.idea_id !== filters.ideaId) return false;
    if (filters.status && c.status !== filters.status) return false;
    if (filters.filter === FILTERS.mine) return Boolean(me) && c.data.owner === me;
    if (filters.filter === FILTERS.noOwner) return needsOwner(c);
    if (filters.filter === FILTERS.thisWeek) return dueThisWeek(c, now);
    return true;
  });
}

// Prima chi è in ritardo, poi per data, poi chi non ha una data; le persone chiuse in fondo. I nomi in ordine alfabetico nella lingua in uso.
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
    return byDate || STAGE[a.status] - STAGE[b.status] || a.title.localeCompare(b.title, language);
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
  const texts = tx.contacts;
  const days = daysToContact(contact, now);
  if (days === null) return h('span', { class: 'deadline' }, texts.noDate);
  const text = days < 0 ? texts.late(-days) : days === 0 ? texts.today : days === 1 ? texts.tomorrow : texts.inDays(days);
  return h('span', { class: ['deadline', days < 0 && 'is-late'], title: fmtDate(contact.data.next_date) }, text);
}

export function contactsSummary(list, now = new Date()) {
  return {
    total: list.length,
    toContact: list.filter((c) => c.status === 'da_contattare').length, // i18n-ignore (status)
    withOwner: list.filter((c) => c.data.owner).length,
    thisWeek: list.filter((c) => dueThisWeek(c, now)).length,
    overdue: list.filter((c) => isOverdue(c, now)).length,
  };
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
  const texts = tx.contacts;
  const filters = readContactFilters(query);
  const writable = canWrite();
  let alive = true;

  const hrefFor = (patch) => {
    const next = { ...filters, ...patch };
    const qs = new URLSearchParams();
    if (next.filter && next.filter !== FILTERS.all) qs.set(PARAMS.filter, next.filter);
    if (next.status) qs.set(PARAMS.status, next.status);
    if (next.ideaId) qs.set(PARAMS.idea, next.ideaId);
    const s = qs.toString();
    return `${PATHS.contacts}${s ? `?${s}` : ''}`;
  };

  // Dopo un salvataggio riuscito la pagina si ridisegna da sola; se non riesce, si torna ai valori salvati.
  const after = (promise) => promise.finally(() => alive && render());

  const statusControl = (c) =>
    h(
      'select',
      { class: 'input input-small', 'aria-label': texts.statusOf(c.title), onChange: (e) => after(changeStatus(getItem(c.id), e.target.value)) },
      STATUSES.map(([v, label]) => h('option', { value: v, selected: v === c.status }, label)),
    );

  const ownerControl = (c) => {
    const entries = state.members.map((m) => [m.user_id, m.display_name]);
    if (c.data.owner && !entries.some(([id]) => id === c.data.owner)) entries.push([c.data.owner, memberName(c.data.owner)]);
    return h(
      'select',
      {
        class: 'input input-small',
        'aria-label': texts.ownerOf(c.title),
        onChange: (e) => {
          const owner = e.target.value || undefined;
          after(saveContact(c.id, setData('owner', owner), texts.ownerMessage(owner ? memberName(owner) : texts.ownerNone)));
        },
      },
      h('option', { value: '' }, tx.common.states.nobody),
      entries.map(([id, name]) => h('option', { value: id, selected: id === c.data.owner }, name)),
    );
  };

  const dateControl = (c) =>
    h('input', {
      class: 'input input-small',
      type: 'date',
      value: c.data.next_date || '',
      'aria-label': texts.nextOf(c.title),
      onChange: (e) => {
        const date = e.target.value || undefined;
        if (date === c.data.next_date) return;
        after(saveContact(c.id, setData('next_date', date), texts.nextMessage(date ? fmtDate(date) : texts.nextNone)));
      },
    });

  const action = (c) => {
    const interview = c.data.interview_id ? getItem(c.data.interview_id) : null;
    if (interview && !interview.deleted_at) return itemLink(interview, texts.interview);
    if (!writable || !isOpen(c)) return null;
    return button(texts.logConversation, {
      iconName: 'interview',
      href: `${PATHS.interview}${c.id}${PATHS.held}`,
      title: texts.logConversationHint,
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
      h('td', null, writable ? ownerControl(c) : c.data.owner ? memberChip(c.data.owner) : h('span', { class: 'muted' }, tx.common.states.nobody)),
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
        { class: 'input', onChange: (e) => navigate(hrefFor({ [key]: e.target.value || null }), { replace: true }) },
        h('option', { value: '' }, empty),
        entries.map(([v, l]) => h('option', { value: v, selected: v === value }, l)),
      ),
    );

  function render() {
    const now = new Date();
    const all = itemsOf('contact');
    const scope = filters.ideaId ? all.filter((c) => c.idea_id === filters.ideaId) : all;
    const list = sortContacts(filterContacts(all, filters, { now }), now);
    const headers = texts.headers;
    let body;
    if (!all.length) body = emptyState(texts.empty);
    else if (!list.length) body = emptyState(texts.noMatch);
    else {
      body = h(
        'div',
        { class: 'table-scroll' },
        h(
          'table',
          { class: 'table contacts-table' },
          h('thead', null, h('tr', null, [headers.person, headers.idea, headers.status, headers.owner, headers.next, ''].map((t) => h('th', null, t)))),
          h('tbody', null, list.map((c) => row(c, now))),
        ),
      );
    }
    mount(
      outlet,
      pageHeader({
        title: texts.title,
        subtitle: texts.subtitle,
        actions: [writable ? button(texts.add, { kind: 'primary', iconName: 'plus', href: `${PATHS.create}${filters.ideaId ? `?idea=${filters.ideaId}` : ''}` }) : null],
      }),
      h('p', { class: 'contacts-summary' }, texts.summary(contactsSummary(scope, now), Boolean(filters.ideaId))),
      h(
        'div',
        { class: 'filters' },
        h(
          'div',
          { class: 'toolbar toolbar-wrap', role: 'group', 'aria-label': texts.which },
          CONTACT_FILTERS.map(([value, label]) =>
            h(
              'a',
              { class: ['btn', 'btn-small', value === filters.filter ? 'btn-primary' : 'btn-ghost'], href: `#${hrefFor({ filter: value })}`, 'aria-current': value === filters.filter ? 'true' : undefined, dataset: { replace: '' } },
              label,
            ),
          ),
        ),
        select(texts.status, filters.status, STATUSES, 'status', texts.allStatuses),
        select(texts.idea, filters.ideaId, ideas().map((i) => [i.id, i.title]), 'ideaId', texts.allIdeas),
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
