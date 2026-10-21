import { h, mount, busy, toast } from '../lib/dom.js';
import { navigate } from '../router.js';
import { icon } from '../lib/icons.js';
import { fmtDate } from '../lib/format.js';
import { IDEA_CHILD_KINDS, KINDS, optionLabel } from '../schema.js';
import { api } from '../lib/api.js';
import {
  canWrite,
  criteriaList,
  decisionsFor,
  exampleIdeas,
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
import { deeptechView, marketView, personaCard, vpcView } from './boards.js';
import { ideaRoadmap, roadmapBox, roadmapPanel } from './roadmap.js';
import { notesTab } from './notes.js';
import { ideaChat, openIdeaChat, unreadOf } from '../chat.js';
import { competitorsView } from './competitors.js';
import { conceptButton } from './concept-help.js';
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
  memberChip,
  metaLine,
  onlineHere,
  pageHeader,
  statusPill,
  tabs,
} from './components.js';

const EXAMPLE_TABS = new Set(['panoramica', 'roadmap', 'canvas', 'clienti', 'mercato', 'deeptech', 'esperimenti', 'interviste']);

const TABS = [
  ['panoramica', 'Panoramica'],
  ['roadmap', 'Roadmap'],
  ['canvas', 'Lean Canvas'],
  ['clienti', 'Clienti'],
  ['mercato', 'Mercato'],
  ['deeptech', 'Deep tech'],
  ['esperimenti', 'Esperimenti'],
  ['interviste', 'Persone e interviste'],
  ['appunti', 'Appunti'],
  ['voti', 'Voti'],
  ['commenti', 'Commenti'],
  ['storico', 'Storico'],
];

// Tutte le schede collegate all'idea: i loro commenti compaiono anche nella sezione Commenti dell'idea.
function childIds(ideaId) {
  return IDEA_CHILD_KINDS.flatMap((kind) => itemsOf(kind, { ideaId })).map((child) => child.id);
}

const BOARD_VIEWS = { canvas: canvasView, deeptech: deeptechView, vpc: vpcView, market: marketView, competitors: competitorsView };
const EXTRA_KINDS = ['persona', 'vpc', 'market', 'competitors', 'deeptech'];

export function ideaContext(ideaId) {
  return {
    idea: getItem(ideaId),
    canvases: itemsOf('canvas', { ideaId }),
    experiments: itemsOf('experiment', { ideaId }),
    interviews: itemsOf('interview', { ideaId }),
    boards: EXTRA_KINDS.flatMap((kind) => itemsOf(kind, { ideaId })),
  };
}

// Apre la chat dell'idea, creandola la prima volta.
function chatButton(idea) {
  const chat = ideaChat(idea.id);
  const unread = chat ? unreadOf(chat.id) : 0;
  const el = button(unread ? `Chat dell'idea (${unread})` : 'Chat dell\'idea', { iconName: 'comment' });
  el.addEventListener(
    'click',
    busy(el, async () => {
      try {
        navigate(`/chat/${(await openIdeaChat(getItem(idea.id))).id}`);
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    }),
  );
  return el;
}

function nextStepBox(idea) {
  const sample = isExample(idea) ? null : exampleIdeas().find((e) => e.status === 'scelta');
  return roadmapBox(idea, { sample });
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
  return h('div', { class: 'stack' }, nextStepBox(idea), originNote(idea), fieldsGrid(idea), decisionsSection(idea));
}

function boardSection(item, idea, writable) {
  const example = isExample(idea);
  const view = BOARD_VIEWS[item.kind];
  return h(
    'section',
    { class: 'canvas-section' },
    h(
      'div',
      { class: 'section-head' },
      h('h3', null, item.title),
      h(
        'div',
        { class: 'row' },
        example ? null : aiButton('critique', () => ({ ...ideaContext(idea.id), item }), { item, label: 'Critica' }),
        writable ? button('Modifica', { iconName: 'edit', href: `#/modifica/${item.id}` }) : null,
        example ? null : button('Versioni', { iconName: 'history', href: `#/storico/${item.id}` }),
        state.commentCounts.get(item.id)
          ? h('a', { class: 'btn btn-ghost', href: `#/elemento/${item.id}/commenti`, title: 'Commenti su questa scheda' }, icon('comment', 16), h('span', null, String(state.commentCounts.get(item.id))))
          : null,
        h('a', { class: 'btn btn-ghost', href: `#/elemento/${item.id}` }, 'Apri'),
      ),
    ),
    view ? view(item) : fieldsGrid(item),
    metaLine(item),
  );
}

const KIND_INFO = {
  canvas: { concept: 'lean-canvas', empty: 'Nessun Lean Canvas. Lo precompilo con problema, cliente e soluzione dell\'idea.', add: 'Nuovo Lean Canvas' },
  persona: { concept: 'buyer-persona', empty: 'Nessuna buyer persona. Una per ogni tipo di cliente, basata sulle interviste.', add: 'Nuova buyer persona' },
  vpc: { concept: 'vpc', empty: 'Nessun Value Proposition Canvas. Si compila prima il profilo del cliente, poi la mappa del valore.', add: 'Nuovo Value Proposition Canvas' },
  market: { concept: 'tam-sam-som', empty: 'Nessuna stima del mercato. TAM, SAM e SOM in euro all\'anno, con fonti e ragionamento.', add: 'Nuova stima del mercato' },
  competitors: { concept: 'concorrenti', empty: 'Nessuna analisi dei concorrenti. «Non abbiamo concorrenti» non è mai vero.', add: 'Nuova analisi dei concorrenti' },
  deeptech: {
    concept: 'deep-tech',
    empty: 'Nessuna scheda deep tech. Serve se l\'idea nasce da una ricerca: maturità della tecnologia, proprietà intellettuale, rapporti con l\'ateneo, bandi.',
    add: 'Nuova scheda deep tech',
  },
};

function kindBlock(idea, writable, kind) {
  const info = KIND_INFO[kind];
  const items = itemsOf(kind, { ideaId: idea.id });
  const list =
    kind === 'persona'
      ? h(
          'div',
          { class: 'cards' },
          items.map((p) => personaCard(p)),
        )
      : items.map((item) => boardSection(item, idea, writable));
  return h(
    'section',
    { class: 'kind-block stack' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', null, KINDS[kind].plural, conceptButton(info.concept)),
      writable ? button(info.add, { kind: items.length ? 'ghost' : 'primary', iconName: 'plus', href: `#/nuovo/${kind}?idea=${idea.id}` }) : null,
    ),
    items.length ? list : h('p', { class: 'muted' }, info.empty),
  );
}

function boardsTab(idea, writable, kinds) {
  return h('div', { class: 'stack' }, kinds.map((kind) => kindBlock(idea, writable, kind)));
}

const JAVELIN_ROWS = [
  ['Cliente', (e) => e.data.customer],
  ['Problema', (e) => e.data.problem],
  ['Soluzione', (e) => e.data.solution],
  ['Assunzione più rischiosa', (e) => e.data.assumption],
  ['Metodo e criterio di successo', (e) => [e.data.method ? optionLabel(KINDS.experiment.fields.find((f) => f.key === 'method'), e.data.method) : null, e.data.success_criterion].filter(Boolean).join('\n')],
  null,
  ['Risultato e decisione', (e) => [e.data.result, e.data.decision ? `Decisione: ${optionLabel(KINDS.experiment.fields.find((f) => f.key === 'decision'), e.data.decision)}` : null].filter(Boolean).join('\n')],
  ['Cosa abbiamo imparato', (e) => e.data.learnings],
];

function javelinBoard(experiments) {
  const sorted = [...experiments].sort((a, b) => (a.data.start_date || '9999').localeCompare(b.data.start_date || '9999'));
  return h(
    'div',
    { class: 'table-scroll' },
    h(
      'table',
      { class: 'table javelin' },
      h(
        'thead',
        null,
        h('tr', null, h('th', null, 'Esperimenti'), sorted.map((e, i) => h('th', null, h('span', { class: 'javelin-n' }, String(i + 1)), itemLink(e), h('div', null, statusPill('experiment', e.status))))),
      ),
      h(
        'tbody',
        null,
        JAVELIN_ROWS.map((row) =>
          row
            ? h('tr', null, h('th', { scope: 'row' }, row[0]), sorted.map((e) => h('td', null, row[1](e) ? h('div', { class: 'text-block' }, row[1](e)) : h('span', { class: 'muted' }, '-'))))
            : h('tr', { class: 'javelin-divider' }, h('th', { colspan: sorted.length + 1 }, 'Esci dall\'ufficio: si va a parlare con i clienti')),
        ),
      ),
    ),
  );
}

function experimentsTab(idea, writable, javelin) {
  const experiments = itemsOf('experiment', { ideaId: idea.id });
  const base = `#/idea/${idea.id}/esperimenti`;
  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'row' },
      writable ? button('Nuovo esperimento', { kind: 'primary', iconName: 'plus', href: `#/nuovo/experiment?idea=${idea.id}` }) : null,
      isExample(idea) ? null : aiButton('next_experiment', () => ideaContext(idea.id), { item: idea, label: 'Proponi il prossimo esperimento' }),
      experiments.length
        ? h(
            'span',
            { class: 'toolbar' },
            h('a', { class: ['btn', 'btn-small', javelin ? 'btn-ghost' : 'btn-primary'], href: base }, icon('columns', 14), 'Schede'),
            h('a', { class: ['btn', 'btn-small', javelin ? 'btn-primary' : 'btn-ghost'], href: `${base}?vista=javelin` }, icon('list', 14), 'Javelin'),
            conceptButton('javelin'),
          )
        : null,
    ),
    experiments.length && javelin
      ? javelinBoard(experiments)
      : experiments.length
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

const CONTACT_ORDER = Object.fromEntries(KINDS.contact.statuses.map(([value], index) => [value, index]));

function contactsBlock(idea, writable) {
  const example = isExample(idea);
  const contacts = itemsOf('contact', { ideaId: idea.id }).sort(
    (a, b) => CONTACT_ORDER[a.status] - CONTACT_ORDER[b.status] || (a.data.next_date || '9999').localeCompare(b.data.next_date || '9999'),
  );
  const purpose = KINDS.contact.fields.find((f) => f.key === 'purpose');
  return h(
    'section',
    { class: 'kind-block stack' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', null, 'Persone con cui interfacciarsi', conceptButton('fuori-dall-ufficio')),
      writable ? button('Aggiungi una persona', { kind: contacts.length ? 'ghost' : 'primary', iconName: 'plus', href: `#/nuovo/contact?idea=${idea.id}` }) : null,
    ),
    contacts.length
      ? h(
          'div',
          { class: 'table-scroll' },
          h(
            'table',
            { class: 'table' },
            h('thead', null, h('tr', null, ['Chi', 'Perché', 'Come ci arriviamo', 'Chi se ne occupa', 'Prossimo contatto', 'Stato', ''].map((t) => h('th', null, t)))),
            h(
              'tbody',
              null,
              contacts.map((c) =>
                h(
                  'tr',
                  null,
                  h('td', null, itemLink(c), c.data.organization ? h('div', { class: 'muted small' }, c.data.organization) : null),
                  h('td', null, c.data.purpose ? optionLabel(purpose, c.data.purpose) : '-'),
                  h('td', null, c.data.via || '-'),
                  h('td', null, c.data.owner ? (example ? h('span', { class: 'chip' }, c.data.owner) : memberChip(c.data.owner)) : '-'),
                  h('td', null, c.data.next_date ? fmtDate(c.data.next_date) : '-'),
                  h('td', null, statusPill('contact', c.status)),
                  h(
                    'td',
                    null,
                    c.data.interview_id
                      ? itemLink(getItem(c.data.interview_id), 'Intervista')
                      : writable && c.status !== 'chiusa'
                      ? button('Intervista', { iconName: 'interview', href: `#/nuovo/interview?contatto=${c.id}`, title: 'Crea l\'intervista con i dati di questa persona' })
                      : null,
                  ),
                ),
              ),
            ),
          ),
        )
      : h('p', { class: 'muted' }, 'Nessuno in lista. Scrivete qui chi intervistare e con chi interfacciarsi per realizzare l\'idea: clienti, esperti, fornitori, ateneo, investitori.'),
  );
}

function interviewsTab(idea, writable) {
  const interviews = itemsOf('interview', { ideaId: idea.id }).sort((a, b) => (b.data.date || '').localeCompare(a.data.date || ''));
  return h(
    'div',
    { class: 'stack' },
    contactsBlock(idea, writable),
    h('h2', { class: 'section-title' }, 'Interviste', conceptButton('intervista-validazione')),
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

export function ideaView(outlet, params, query = new URLSearchParams()) {
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
    const count = (...kinds) => kinds.reduce((sum, kind) => sum + itemsOf(kind, { ideaId: idea.id }).length, 0);
    const counts = {
      roadmap: `${ideaRoadmap(idea).percent}%`,
      canvas: count('canvas'),
      clienti: count('persona', 'vpc'),
      mercato: count('market', 'competitors'),
      deeptech: count('deeptech'),
      esperimenti: itemsOf('experiment', { ideaId: idea.id }).length,
      interviste: count('interview', 'contact'),
      appunti: count('note'),
      commenti: [idea.id, ...childIds(idea.id)].reduce((sum, id) => sum + (state.commentCounts.get(id) || 0), 0),
    };

    commentsEl?.cleanup?.();
    commentsEl = null;
    let body;
    if (tab === 'panoramica') body = overviewTab(idea);
    else if (tab === 'roadmap') body = roadmapPanel(idea, { writable });
    else if (tab === 'canvas') body = boardsTab(idea, writable, ['canvas']);
    else if (tab === 'clienti') body = boardsTab(idea, writable, ['persona', 'vpc']);
    else if (tab === 'mercato') body = boardsTab(idea, writable, ['market', 'competitors']);
    else if (tab === 'deeptech') body = boardsTab(idea, writable, ['deeptech']);
    else if (tab === 'esperimenti') body = experimentsTab(idea, writable, query.get('vista') === 'javelin');
    else if (tab === 'interviste') body = interviewsTab(idea, writable);
    else if (tab === 'appunti') body = notesTab(idea, writable);
    else if (tab === 'voti') body = votesTab(idea);
    else if (tab === 'commenti') body = commentsEl = commentsPanel(idea, { related: childIds(idea.id) });
    else body = historyTab(idea);

    mount(
      outlet,
      idea.deleted_at ? h('div', { class: 'banner banner-warn' }, 'Questa idea è nel cestino. ', h('a', { href: '#/cestino' }, 'Vai al cestino')) : null,
      example ? exampleBanner(idea) : null,
      pageHeader({
        back: { href: '#/idee' },
        title: idea.title,
        subtitle: h('span', { class: 'row' }, statusSelect, idea.data.sector ? h('span', { class: 'muted' }, idea.data.sector) : null, metaLine(idea), hereHost),
        actions: [
          example ? null : aiButton('critique', () => ideaContext(idea.id), { item: idea, label: 'Critica l\'idea' }),
          example ? null : chatButton(idea),
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
      if (item.id === params.id || item.idea_id === params.id || ['idea', 'score', 'criteria', 'decision', 'teamcanvas', 'equity'].includes(item.kind)) render();
    }),
    on('presence', renderHere),
    on('comment-counts', () => {
      if (tab !== 'commenti') render();
    }),
  ];
  return () => {
    commentsEl?.cleanup?.();
    offs.forEach((off) => off());
  };
}

