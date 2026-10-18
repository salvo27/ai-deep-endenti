import { h, mount } from '../lib/dom.js';
import { daysUntil, fmtDate, plural, truncate } from '../lib/format.js';
import { isUuid } from '../lib/validate.js';
import { COMMITMENT, KINDS } from '../schema.js';
import { canWrite, getItem, ideas, itemsOf, on, state } from '../store.js';
import { navigate } from '../router.js';
import { changeStatus } from './actions.js';
import { avatar, button, commitmentBadge, emptyState, itemLink, pageHeader, statusPill } from './components.js';

const ROUTES = { experiment: '/esperimenti', interview: '/interviste', decision: '/decisioni' };

export function readListFilters(query) {
  return {
    ideaId: isUuid(query.get('idea')) ? query.get('idea') : null,
    memberId: isUuid(query.get('persona')) ? query.get('persona') : null,
    commitment: COMMITMENT.some(([v]) => v === query.get('impegno')) ? query.get('impegno') : null,
    text: (query.get('q') || '').slice(0, 100),
  };
}

export function filterItems(kind, filters) {
  const text = filters.text.trim().toLowerCase();
  return itemsOf(kind).filter((item) => {
    if (filters.ideaId && item.idea_id !== filters.ideaId && !(item.data.ideas || []).includes(filters.ideaId)) return false;
    if (filters.memberId) {
      const people = [item.data.owner, item.data.interviewer, ...(item.data.decided_by || [])];
      if (!people.includes(filters.memberId)) return false;
    }
    if (filters.commitment && item.data.commitment !== filters.commitment) return false;
    if (text && !`${item.title} ${JSON.stringify(item.data)}`.toLowerCase().includes(text)) return false;
    return true;
  });
}

function filtersBar(kind, filters) {
  const go = (patch) => {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams();
    if (next.ideaId) params.set('idea', next.ideaId);
    if (next.memberId) params.set('persona', next.memberId);
    if (next.commitment) params.set('impegno', next.commitment);
    if (next.text) params.set('q', next.text);
    const qs = params.toString();
    navigate(`${ROUTES[kind]}${qs ? `?${qs}` : ''}`);
  };
  const select = (label, value, entries, key) =>
    h(
      'label',
      { class: 'field field-inline' },
      h('span', { class: 'field-label' }, label),
      h('select', { class: 'input', onChange: (e) => go({ [key]: e.target.value || null }) }, h('option', { value: '' }, 'Tutti'), entries.map(([v, l]) => h('option', { value: v, selected: v === value }, l))),
    );
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Cerca', value: filters.text, maxlength: 100 });
  search.addEventListener('change', () => go({ text: search.value.trim() }));
  return h(
    'div',
    { class: 'filters' },
    select('Idea', filters.ideaId, ideas().map((i) => [i.id, i.title]), 'ideaId'),
    select('Persona', filters.memberId, state.members.map((m) => [m.user_id, m.display_name]), 'memberId'),
    kind === 'interview' ? select('Impegno', filters.commitment, COMMITMENT, 'commitment') : null,
    h('label', { class: 'field field-inline' }, h('span', { class: 'field-label' }, 'Testo'), search),
  );
}

function deadline(item) {
  if (!item.data.end_date || item.status === 'concluso') return null;
  const days = daysUntil(item.data.end_date);
  return h('span', { class: ['deadline', days < 0 && 'is-late'] }, days < 0 ? `in ritardo di ${plural(-days, 'giorno', 'giorni')}` : `${plural(days, 'giorno', 'giorni')} alla scadenza`);
}

function experimentsBody(list, writable) {
  return h(
    'div',
    { class: 'kanban kanban-3' },
    KINDS.experiment.statuses.map(([status]) => {
      const col = h(
        'section',
        { class: 'kanban-col', dataset: { status } },
        h('header', null, statusPill('experiment', status), h('span', { class: 'muted small' }, String(list.filter((e) => e.status === status).length))),
        list
          .filter((e) => e.status === status)
          .map((e) => {
            const card = h(
              'article',
              { class: 'idea-card', draggable: writable ? 'true' : undefined },
              itemLink(e),
              e.idea_id ? h('p', { class: 'muted small' }, itemLink(getItem(e.idea_id))) : null,
              e.data.assumption ? h('p', { class: 'small' }, truncate(e.data.assumption, 160)) : null,
              h('div', { class: 'idea-card-foot' }, e.data.owner ? avatar(e.data.owner, 20) : null, deadline(e)),
            );
            card.addEventListener('dragstart', (event) => event.dataTransfer.setData('text/plain', e.id));
            return card;
          }),
      );
      if (writable) {
        col.addEventListener('dragover', (event) => event.preventDefault());
        col.addEventListener('drop', async (event) => {
          event.preventDefault();
          const item = getItem(event.dataTransfer.getData('text/plain'));
          if (item?.kind === 'experiment') await changeStatus(item, status);
        });
      }
      return col;
    }),
  );
}

function interviewsBody(list) {
  const sorted = [...list].sort((a, b) => (b.data.date || '').localeCompare(a.data.date || ''));
  return h(
    'table',
    { class: 'table' },
    h('thead', null, h('tr', null, ['Data', 'Intervista', 'Idea', 'Intervistatore', 'Stato', 'Impegno', 'Problema'].map((t) => h('th', null, t)))),
    h(
      'tbody',
      null,
      sorted.map((i) =>
        h(
          'tr',
          null,
          h('td', null, i.data.date ? fmtDate(i.data.date) : '-'),
          h('td', null, itemLink(i)),
          h('td', null, i.idea_id ? itemLink(getItem(i.idea_id)) : '-'),
          h('td', null, i.data.interviewer ? avatar(i.data.interviewer, 20) : '-'),
          h('td', null, statusPill('interview', i.status)),
          h('td', null, commitmentBadge(i.data.commitment) || '-'),
          h('td', null, i.data.problem_intensity ? `${i.data.problem_intensity}/5` : '-'),
        ),
      ),
    ),
  );
}

function decisionsBody(list) {
  const sorted = [...list].sort((a, b) => (b.data.date || b.created_at).localeCompare(a.data.date || a.created_at));
  return h(
    'ol',
    { class: 'timeline' },
    sorted.map((d) =>
      h(
        'li',
        null,
        h('div', { class: 'timeline-date' }, d.data.date ? fmtDate(d.data.date) : fmtDate(d.created_at)),
        h(
          'div',
          { class: 'card' },
          h('div', { class: 'card-head' }, itemLink(d), statusPill('decision', d.status)),
          d.data.decision ? h('p', null, truncate(d.data.decision, 280)) : null,
          d.data.ideas?.length ? h('div', { class: 'chips' }, d.data.ideas.map((id) => itemLink(getItem(id)))) : null,
        ),
      ),
    ),
  );
}

export function listView(kind) {
  return (outlet, params, query) => {
    const filters = readListFilters(query);
    const writable = canWrite();
    const render = () => {
      const list = filterItems(kind, filters);
      const newHref = `#/nuovo/${kind}${filters.ideaId ? `?idea=${filters.ideaId}` : ''}`;
      let body;
      if (!list.length) body = emptyState(`Nessun elemento: ${KINDS[kind].plural.toLowerCase()} con questi filtri.`);
      else if (kind === 'experiment') body = experimentsBody(list, writable);
      else if (kind === 'interview') body = interviewsBody(list);
      else body = decisionsBody(list);
      mount(
        outlet,
        pageHeader({
          title: KINDS[kind].plural,
          subtitle: {
            experiment: 'Ogni esperimento mette alla prova un\'assunzione, con un criterio di successo deciso prima.',
            interview: 'Fatti e impegni contano più delle opinioni e dei complimenti.',
            decision: 'Cosa abbiamo deciso, quando e perché.',
          }[kind],
          actions: [writable ? button(`Nuovo: ${KINDS[kind].label.toLowerCase()}`, { kind: 'primary', iconName: 'plus', href: newHref }) : null],
        }),
        filtersBar(kind, filters),
        body,
      );
    };
    render();
    return on('item', ({ item }) => {
      if (item.kind === kind || item.kind === 'idea') render();
    });
  };
}
