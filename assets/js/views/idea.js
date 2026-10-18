import { h, mount } from '../lib/dom.js';
import { fmtDate } from '../lib/format.js';
import { KINDS } from '../schema.js';
import { api } from '../lib/api.js';
import {
  canWrite,
  criteriaList,
  decisionsFor,
  getItem,
  isExample,
  itemsOf,
  labelContext,
  on,
  scoreItems,
  singleton,
  state,
  trackPresence,
} from '../store.js';
import { ideaScore } from '../scoring.js';
import { exportIdeaMarkdown } from '../export.js';
import { canvasView } from './canvas.js';
import { commentsPanel } from './comments.js';
import { aiButton } from './ai-panel.js';
import { archiveWithConfirm, changeStatus } from './actions.js';
import { revisionLine } from './history.js';
import {
  avatar,
  button,
  commitmentBadge,
  emptyState,
  errorBox,
  exampleBanner,
  fieldsGrid,
  itemLink,
  loading,
  metaLine,
  onlineHere,
  pageHeader,
  statusPill,
  tabs,
} from './components.js';

const EXAMPLE_TABS = new Set(['panoramica', 'canvas', 'esperimenti', 'interviste']);

const TABS = [
  ['panoramica', 'Panoramica'],
  ['canvas', 'Lean Canvas'],
  ['esperimenti', 'Esperimenti'],
  ['interviste', 'Interviste'],
  ['voti', 'Voti'],
  ['commenti', 'Commenti'],
  ['storico', 'Storico'],
];

export function ideaContext(ideaId) {
  return {
    idea: getItem(ideaId),
    canvases: itemsOf('canvas', { ideaId }),
    experiments: itemsOf('experiment', { ideaId }),
    interviews: itemsOf('interview', { ideaId }),
  };
}

function originNote(idea) {
  if (!idea.data.origin) return null;
  const [rowId, colId] = idea.data.origin.split(':');
  if (!singleton('generator')) return null;
  return h('p', { class: 'muted small' }, 'Nata nel generatore: ', h('a', { href: '#/generatore' }, `${labelContext.axisLabel(rowId) || rowId} × ${labelContext.axisLabel(colId) || colId}`));
}

function decisionsSection(idea) {
  const decisions = decisionsFor(idea.id).sort((a, b) => (b.data.date || '').localeCompare(a.data.date || ''));
  if (!decisions.length) return null;
  return h(
    'section',
    { class: 'idea-decisions' },
    h('h2', null, 'Decisioni'),
    decisions.map((d) =>
      h(
        'article',
        { class: 'card' },
        h('div', { class: 'card-head' }, itemLink(d), statusPill('decision', d.status)),
        d.data.decision ? h('p', null, d.data.decision) : null,
        d.data.date ? h('p', { class: 'muted small' }, fmtDate(d.data.date)) : null,
      ),
    ),
  );
}

function overviewTab(idea) {
  return h('div', { class: 'stack' }, originNote(idea), fieldsGrid(idea), decisionsSection(idea));
}

function canvasTab(idea, writable) {
  const canvases = itemsOf('canvas', { ideaId: idea.id });
  if (!canvases.length) {
    return emptyState(
      'Questa idea non ha ancora un Lean Canvas. Lo precompilo con problema, cliente e soluzione dell\'idea.',
      writable ? button('Crea il Lean Canvas', { kind: 'primary', iconName: 'canvas', href: `#/nuovo/canvas?idea=${idea.id}` }) : null,
    );
  }
  return h(
    'div',
    { class: 'stack' },
    canvases.map((canvas) =>
      h(
        'section',
        { class: 'canvas-section' },
        h(
          'div',
          { class: 'section-head' },
          h('h2', null, canvas.title),
          h(
            'div',
            { class: 'row' },
            isExample(idea) ? null : aiButton('critique', () => ({ ...ideaContext(idea.id), item: canvas }), { item: canvas, label: 'Critica il canvas' }),
            writable ? button('Modifica', { iconName: 'edit', href: `#/modifica/${canvas.id}` }) : null,
            isExample(idea) ? null : button('Versioni', { iconName: 'history', href: `#/storico/${canvas.id}` }),
            h('a', { class: 'btn btn-ghost', href: `#/elemento/${canvas.id}` }, 'Apri'),
          ),
        ),
        canvasView(canvas),
        metaLine(canvas),
      ),
    ),
    writable ? button('Aggiungi un altro canvas', { iconName: 'plus', href: `#/nuovo/canvas?idea=${idea.id}` }) : null,
  );
}

function experimentsTab(idea, writable) {
  const experiments = itemsOf('experiment', { ideaId: idea.id });
  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'row' },
      writable ? button('Nuovo esperimento', { kind: 'primary', iconName: 'plus', href: `#/nuovo/experiment?idea=${idea.id}` }) : null,
      isExample(idea) ? null : aiButton('next_experiment', () => ideaContext(idea.id), { item: idea, label: 'Proponi il prossimo esperimento' }),
    ),
    experiments.length
      ? h(
          'div',
          { class: 'cards' },
          experiments.map((e) =>
            h(
              'article',
              { class: 'card' },
              h('div', { class: 'card-head' }, itemLink(e), statusPill('experiment', e.status)),
              e.data.assumption ? h('p', null, h('strong', null, 'Assunzione: '), e.data.assumption) : null,
              e.data.success_criterion ? h('p', { class: 'muted small' }, h('strong', null, 'Criterio: '), e.data.success_criterion) : null,
              e.data.result ? h('p', { class: 'small' }, h('strong', null, 'Risultato: '), e.data.result) : null,
              h('div', { class: 'card-foot' }, e.data.owner && !isExample(e) ? avatar(e.data.owner, 20) : null, e.data.end_date ? h('span', { class: 'muted small' }, `Scadenza ${fmtDate(e.data.end_date)}`) : null),
            ),
          ),
        )
      : emptyState('Nessun esperimento. Parti dall\'assunzione più rischiosa.'),
  );
}

function interviewsTab(idea, writable) {
  const interviews = itemsOf('interview', { ideaId: idea.id }).sort((a, b) => (b.data.date || '').localeCompare(a.data.date || ''));
  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'row' },
      writable ? button('Nuova intervista', { kind: 'primary', iconName: 'plus', href: `#/nuovo/interview?idea=${idea.id}` }) : null,
      isExample(idea) ? null : aiButton('interview_questions', () => ideaContext(idea.id), { item: idea, label: 'Domande per le interviste' }),
      interviews.length && !isExample(idea) ? aiButton('interview_synthesis', () => ideaContext(idea.id), { item: idea, label: 'Sintesi delle interviste' }) : null,
    ),
    interviews.length
      ? h(
          'table',
          { class: 'table' },
          h('thead', null, h('tr', null, ['Data', 'Intervista', 'Stato', 'Impegno', 'Problema sentito'].map((t) => h('th', null, t)))),
          h(
            'tbody',
            null,
            interviews.map((i) =>
              h(
                'tr',
                null,
                h('td', null, i.data.date ? fmtDate(i.data.date) : '-'),
                h('td', null, itemLink(i)),
                h('td', null, statusPill('interview', i.status)),
                h('td', null, commitmentBadge(i.data.commitment) || '-'),
                h('td', null, i.data.problem_intensity ? `${i.data.problem_intensity}/5` : '-'),
              ),
            ),
          ),
        )
      : emptyState('Nessuna intervista. Chiedi del passato e dei fatti, non delle intenzioni future.'),
  );
}

function votesTab(idea) {
  const criteria = criteriaList();
  if (!criteria.length) return emptyState('Mancano i criteri di valutazione.', button('Vai alla valutazione', { href: '#/valutazione' }));
  const result = ideaScore(idea.id, criteria, scoreItems());
  return h(
    'div',
    { class: 'stack' },
    h('p', null, 'Punteggio del team: ', h('strong', null, result.score === null ? 'nessun voto' : `${result.score}/100`), ` · ${result.voters.length} votanti`),
    h(
      'table',
      { class: 'table' },
      h('thead', null, h('tr', null, h('th', null, 'Criterio'), h('th', null, 'Peso'), h('th', null, 'Voti'), h('th', null, 'Media'))),
      h(
        'tbody',
        null,
        criteria.map((c) => {
          const stats = result.perCriterion[c.key];
          return h(
            'tr',
            { class: stats.disagreement && 'is-disagreement' },
            h('td', { title: c.description }, c.label),
            h('td', null, `×${c.weight}`),
            h('td', null, h('div', { class: 'votes' }, stats.byMember.map((v) => h('span', { class: 'vote' }, avatar(v.memberId, 20), String(v.value))))),
            h('td', null, stats.mean === null ? '-' : stats.mean.toFixed(1), stats.disagreement ? h('span', { class: 'badge badge-warn' }, 'disaccordo') : null),
          );
        }),
      ),
    ),
    button('Vota nella matrice', { kind: 'primary', href: '#/valutazione?vista=miei' }),
  );
}

function historyTab(idea) {
  const host = h('div', { class: 'stack' }, loading());
  api
    .listRevisions({ ideaId: idea.id, limit: 100 })
    .then((revs) => mount(host, revs.length ? h('ul', { class: 'log' }, revs.map(revisionLine)) : emptyState('Nessuna modifica.'), button('Versioni dell\'idea', { iconName: 'history', href: `#/storico/${idea.id}` })))
    .catch((error) => mount(host, errorBox(error)));
  return host;
}

export function ideaView(outlet, params) {
  const example = isExample(getItem(params.id));
  const tab = TABS.some(([key]) => key === params.tab) && (!example || EXAMPLE_TABS.has(params.tab)) ? params.tab : 'panoramica';
  let commentsEl = null;
  const hereHost = h('span', { class: 'here-host' });
  const renderHere = () => mount(hereHost, onlineHere(`/idea/${params.id}`) || '');

  const render = () => {
    const idea = getItem(params.id);
    if (!idea || idea.kind !== 'idea') {
      mount(outlet, errorBox({ message: 'Idea non trovata.' }));
      return;
    }
    const writable = canWrite() && !idea.deleted_at && !example;
    const statusSelect = writable
      ? h(
          'select',
          { class: 'input input-small', 'aria-label': 'Stato', onChange: (e) => changeStatus(getItem(idea.id), e.target.value) },
          KINDS.idea.statuses.map(([v, label]) => h('option', { value: v, selected: v === idea.status }, label)),
        )
      : statusPill('idea', idea.status);
    const counts = {
      canvas: itemsOf('canvas', { ideaId: idea.id }).length,
      esperimenti: itemsOf('experiment', { ideaId: idea.id }).length,
      interviste: itemsOf('interview', { ideaId: idea.id }).length,
      commenti: state.commentCounts.get(idea.id) || 0,
    };

    commentsEl?.cleanup?.();
    commentsEl = null;
    let body;
    if (tab === 'panoramica') body = overviewTab(idea);
    else if (tab === 'canvas') body = canvasTab(idea, writable);
    else if (tab === 'esperimenti') body = experimentsTab(idea, writable);
    else if (tab === 'interviste') body = interviewsTab(idea, writable);
    else if (tab === 'voti') body = votesTab(idea);
    else if (tab === 'commenti') body = commentsEl = commentsPanel(idea);
    else body = historyTab(idea);

    mount(
      outlet,
      idea.deleted_at ? h('div', { class: 'banner banner-warn' }, 'Questa idea è nel cestino. ', h('a', { href: '#/cestino' }, 'Vai al cestino')) : null,
      example ? exampleBanner(idea) : null,
      pageHeader({
        title: idea.title,
        subtitle: h('span', { class: 'row' }, statusSelect, idea.data.sector ? h('span', { class: 'muted' }, idea.data.sector) : null, metaLine(idea), hereHost),
        actions: [
          example ? null : aiButton('critique', () => ideaContext(idea.id), { item: idea, label: 'Critica l\'idea' }),
          writable ? button('Modifica', { iconName: 'edit', href: `#/modifica/${idea.id}` }) : null,
          button('', { iconName: 'file', title: 'Esporta in Markdown', onClick: () => exportIdeaMarkdown(idea) }),
          writable ? button('', { iconName: 'trash', title: 'Archivia', onClick: () => archiveWithConfirm(idea, { backTo: '/idee' }) }) : null,
        ],
      }),
      tabs(
        TABS.filter(([key]) => !example || EXAMPLE_TABS.has(key)).map(([key, label]) => [key, label, counts[key]]),
        tab,
        (key) => `#/idea/${idea.id}/${key}`,
      ),
      h('div', { class: 'tab-body' }, body),
    );
  };

  render();
  renderHere();
  trackPresence({ route: `/idea/${params.id}` });
  const offs = [
    on('item', ({ item }) => {
      if (tab === 'commenti') {
        if (item.id === params.id) render();
        return;
      }
      if (item.id === params.id || item.idea_id === params.id || item.kind === 'score' || item.kind === 'criteria') render();
    }),
    on('presence', renderHere),
  ];
  return () => {
    commentsEl?.cleanup?.();
    offs.forEach((off) => off());
  };
}

