import { h, mount, busy, toast } from '../lib/dom.js';
import { navigate } from '../router.js';
import { icon } from '../lib/icons.js';
import { fmtDate } from '../lib/format.js';
import { locale, tx } from '../i18n/index.js';
import { IDEA_CHILD_KINDS, KINDS, isHeldConversation, optionLabel } from '../schema.js';
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
import { ideaSurveysTab } from './surveys.js';
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
  sourceBadge,
  statusPill,
  tabs,
} from './components.js';

// Section keys and addresses of the site: their Italian words are part of the URL (#/idea/<id>/commenti), not text
// the reader sees, so they stay as they are in every language.
const S = { overview: 'panoramica', roadmap: 'roadmap', canvas: 'canvas', customers: 'clienti', market: 'mercato', deeptech: 'deeptech', experiments: 'esperimenti', interviews: 'interviste', surveys: 'questionari', notes: 'appunti', comments: 'commenti', votes: 'voti', history: 'storico' }; // i18n-ignore
const PATHS = { generator: '#/generatore', edit: '#/modifica/', history: '#/storico/', create: '#/nuovo/', survey: '#/questionario/', contacts: '#/contatti', scoring: '#/valutazione', vote: '#/valutazione?vista=miei', trash: '#/cestino', ideas: '#/idee', contact: 'contatto' }; // i18n-ignore
const OPEN_SURVEY = 'aperto'; // i18n-ignore (survey status)
const CUSTOMER_KINDS = ['persona', 'vpc']; // i18n-ignore (kinds)

const EXAMPLE_TABS = new Set([S.overview, S.roadmap, S.canvas, S.customers, S.market, S.deeptech, S.experiments, S.interviews]);

// Lean Canvas, Roadmap and Deep tech have the same name in every language.
const SECTIONS = { ...tx.idea.sections, roadmap: 'Roadmap', canvas: 'Lean Canvas', deeptech: 'Deep tech' };

// Sei schede con le sezioni sotto. L'indirizzo tiene la sezione (#/idea/<id>/commenti apre Discussione su Commenti); quello della scheda apre la prima sezione.
const GROUPS = [
  [S.overview, [S.overview]],
  [S.roadmap, [S.roadmap]],
  ['analisi', [S.canvas, S.customers, S.market, S.deeptech]],
  ['validazione', [S.experiments, S.interviews, S.surveys]],
  [S.notes, [S.notes]],
  ['discussione', [S.comments, S.votes, S.history]],
].map(([key, sections]) => [key, key === S.roadmap ? 'Roadmap' : tx.idea.groups[key], sections]);

function visibleGroups(example) {
  return GROUPS.map(([key, label, sections]) => [key, label, sections.filter((s) => !example || EXAMPLE_TABS.has(s))]).filter(([, , sections]) => sections.length);
}

function sectionFor(param, groups) {
  const group = groups.find(([key]) => key === param);
  if (group) return group[2][0];
  return groups.some(([, , sections]) => sections.includes(param)) ? param : S.overview;
}

function ideaTabs(idea, groups, section, counts) {
  const href = (key) => `#/idea/${idea.id}/${key}`;
  const [activeKey, activeLabel, activeSections] = groups.find(([, , sections]) => sections.includes(section));
  const total = (sections) => (sections.length === 1 ? counts[sections[0]] : sections.reduce((sum, key) => sum + (Number(counts[key]) || 0), 0));
  return h(
    'div',
    { class: 'idea-tabs' },
    tabs(groups.map(([key, label, sections]) => [key, label, total(sections)]), activeKey, href, { ariaLabel: tx.idea.tabsLabel, className: 'idea-groups' }),
    activeSections.length > 1
      ? tabs(activeSections.map((key) => [key, SECTIONS[key], counts[key]]), section, href, { ariaLabel: activeLabel, className: 'subtabs' })
      : null,
  );
}

// Tutte le schede collegate all'idea: i loro commenti compaiono anche nella sezione Commenti dell'idea.
function childIds(ideaId) {
  return IDEA_CHILD_KINDS.flatMap((kind) => itemsOf(kind, { ideaId })).map((child) => child.id);
}

const BOARD_VIEWS = { canvas: canvasView, deeptech: deeptechView, vpc: vpcView, market: marketView, competitors: competitorsView };
const EXTRA_KINDS = [...CUSTOMER_KINDS, 'market', 'competitors', 'deeptech'];

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
  const el = button(unread ? tx.idea.chatUnread(unread) : tx.idea.chat, { iconName: 'comment' });
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
  return h('p', { class: 'muted small' }, tx.idea.bornInGenerator, ' ', h('a', { href: PATHS.generator }, `${labelContext.axisLabel(rowId) || rowId} × ${labelContext.axisLabel(colId) || colId}`));
}

function decisionsSection(idea) {
  const decisions = decisionsFor(idea.id).sort((a, b) => (b.data.date || '').localeCompare(a.data.date || ''));
  if (!decisions.length) return null;
  return h(
    'section',
    { class: 'idea-decisions' },
    h('h2', null, tx.idea.decisions),
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

// Validazione a un clic dalla Panoramica: esperimenti, interviste fatte e, dei questionari, solo quelli aperti.
function validationRow(idea) {
  const texts = tx.idea;
  const base = `#/idea/${idea.id}`;
  const chip = (href, iconName, text) => h('a', { class: 'validation-chip', href }, icon(iconName, 14), h('span', null, text));
  const experiments = itemsOf('experiment', { ideaId: idea.id });
  const running = experiments.filter((e) => e.status === 'in_corso').length;
  const held = itemsOf('interview', { ideaId: idea.id }).filter(isHeldConversation).length;
  const chips = [
    chip(`${base}/${S.experiments}`, 'experiment', texts.experiments(experiments.length, running)),
    chip(`${base}/${S.interviews}`, 'interview', texts.heldInterviews(held)),
  ];
  if (!isExample(idea)) {
    const open = itemsOf('survey', { ideaId: idea.id }).filter((s) => s.status === OPEN_SURVEY);
    chips.push(...(open.length ? open.map((s) => chip(`${PATHS.survey}${s.id}`, 'list', texts.openSurvey(s.title))) : [chip(`${base}/${S.surveys}`, 'list', texts.noOpenSurvey)]));
  }
  return h('nav', { class: 'validation-row', 'aria-label': texts.validation }, h('span', { class: 'validation-label' }, texts.validation), chips);
}

function overviewTab(idea) {
  return h('div', { class: 'stack' }, nextStepBox(idea), validationRow(idea), originNote(idea), fieldsGrid(idea), decisionsSection(idea));
}

function boardSection(item, idea, writable) {
  const example = isExample(idea);
  const view = BOARD_VIEWS[item.kind];
  const comments = state.commentCounts.get(item.id);
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
        example ? null : aiButton('critique', () => ({ ...ideaContext(idea.id), item }), { item, label: tx.idea.critique }),
        writable ? button(tx.common.actions.edit, { iconName: 'edit', href: `${PATHS.edit}${item.id}` }) : null,
        example ? null : button(tx.idea.versions, { iconName: 'history', href: `${PATHS.history}${item.id}` }),
        comments
          ? h('a', { class: 'btn btn-ghost', href: `#/elemento/${item.id}/${S.comments}`, title: tx.idea.boardComments }, icon('comment', 16), h('span', null, String(comments)))
          : null,
        h('a', { class: 'btn btn-ghost', href: `#/elemento/${item.id}` }, tx.common.actions.open),
      ),
    ),
    view ? view(item) : fieldsGrid(item),
    metaLine(item),
  );
}

const CONCEPTS = { canvas: 'lean-canvas', persona: 'buyer-persona', vpc: 'vpc', market: 'tam-sam-som', competitors: 'concorrenti', deeptech: 'deep-tech', interviews: 'intervista-validazione' }; // i18n-ignore (concept ids)

function kindBlock(idea, writable, kind) {
  const info = tx.idea.kinds[kind];
  const items = itemsOf(kind, { ideaId: idea.id });
  const list = kind === CUSTOMER_KINDS[0] ? h('div', { class: 'cards' }, items.map((p) => personaCard(p))) : items.map((item) => boardSection(item, idea, writable));
  return h(
    'section',
    { class: 'kind-block stack' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', null, KINDS[kind].plural, conceptButton(CONCEPTS[kind])),
      writable ? button(info.add, { kind: items.length ? 'ghost' : 'primary', iconName: 'plus', href: `${PATHS.create}${kind}?idea=${idea.id}` }) : null,
    ),
    items.length ? list : h('p', { class: 'muted' }, info.empty),
  );
}

function boardsTab(idea, writable, kinds) {
  return h('div', { class: 'stack' }, kinds.map((kind) => kindBlock(idea, writable, kind)));
}

const fieldOfExperiment = (key) => KINDS.experiment.fields.find((f) => f.key === key);

function javelinRows() {
  const texts = tx.idea.javelin;
  return [
    [texts.customer, (e) => e.data.customer],
    [texts.problem, (e) => e.data.problem],
    [texts.solution, (e) => e.data.solution],
    [texts.assumption, (e) => e.data.assumption],
    [texts.method, (e) => [e.data.method ? optionLabel(fieldOfExperiment('method'), e.data.method) : null, e.data.success_criterion].filter(Boolean).join('\n')],
    null,
    [texts.result, (e) => [e.data.result, e.data.decision ? texts.decision(optionLabel(fieldOfExperiment('decision'), e.data.decision)) : null].filter(Boolean).join('\n')],
    [texts.learnings, (e) => e.data.learnings],
  ];
}

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
        h('tr', null, h('th', null, tx.idea.javelin.experiments), sorted.map((e, i) => h('th', null, h('span', { class: 'javelin-n' }, String(i + 1)), itemLink(e), h('div', null, statusPill('experiment', e.status))))),
      ),
      h(
        'tbody',
        null,
        javelinRows().map((row) =>
          row
            ? h('tr', null, h('th', { scope: 'row' }, row[0]), sorted.map((e) => h('td', null, row[1](e) ? h('div', { class: 'text-block' }, row[1](e)) : h('span', { class: 'muted' }, '-'))))
            : h('tr', { class: 'javelin-divider' }, h('th', { colspan: sorted.length + 1 }, tx.idea.javelin.outOfBuilding)),
        ),
      ),
    ),
  );
}

function experimentsTab(idea, writable, javelin) {
  const texts = tx.idea.experimentsTab;
  const experiments = itemsOf('experiment', { ideaId: idea.id });
  const base = `#/idea/${idea.id}/${S.experiments}`;
  const label = (text) => h('strong', null, text, ' ');
  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'row' },
      writable ? button(texts.add, { kind: 'primary', iconName: 'plus', href: `${PATHS.create}experiment?idea=${idea.id}` }) : null,
      isExample(idea) ? null : aiButton('next_experiment', () => ideaContext(idea.id), { item: idea, label: texts.suggest }),
      experiments.length
        ? h(
            'span',
            { class: 'toolbar' },
            h('a', { class: ['btn', 'btn-small', javelin ? 'btn-ghost' : 'btn-primary'], href: base, dataset: { replace: '' } }, icon('columns', 14), texts.cards),
            h('a', { class: ['btn', 'btn-small', javelin ? 'btn-primary' : 'btn-ghost'], href: `${base}?vista=javelin`, dataset: { replace: '' } }, icon('list', 14), 'Javelin'),
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
              e.data.assumption ? h('p', null, label(texts.assumption), e.data.assumption) : null,
              e.data.success_criterion ? h('p', { class: 'muted small' }, label(texts.criterion), e.data.success_criterion) : null,
              e.data.result ? h('p', { class: 'small' }, label(texts.result), e.data.result) : null,
              h('div', { class: 'card-foot' }, e.data.owner && !isExample(e) ? avatar(e.data.owner, 20) : null, e.data.end_date ? h('span', { class: 'muted small' }, texts.due(fmtDate(e.data.end_date))) : null),
            ),
          ),
        )
      : emptyState(texts.none),
  );
}

const CONTACT_ORDER = Object.fromEntries(KINDS.contact.statuses.map(([value], index) => [value, index]));

function contactsBlock(idea, writable) {
  const texts = tx.idea.contacts;
  const example = isExample(idea);
  const contacts = itemsOf('contact', { ideaId: idea.id }).sort(
    (a, b) => CONTACT_ORDER[a.status] - CONTACT_ORDER[b.status] || (a.data.next_date || '9999').localeCompare(b.data.next_date || '9999'),
  );
  const purpose = KINDS.contact.fields.find((f) => f.key === 'purpose');
  const headers = texts.headers;
  return h(
    'section',
    { class: 'kind-block stack' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', null, texts.title, conceptButton('fuori-dall-ufficio')),
      h(
        'div',
        { class: 'row' },
        contacts.length && !example ? button(texts.openInContacts, { iconName: 'users', href: `${PATHS.contacts}?idea=${idea.id}`, title: texts.openInContactsHint }) : null,
        writable ? button(texts.add, { kind: contacts.length ? 'ghost' : 'primary', iconName: 'plus', href: `${PATHS.create}contact?idea=${idea.id}` }) : null,
      ),
    ),
    contacts.length
      ? h(
          'div',
          { class: 'table-scroll' },
          h(
            'table',
            { class: 'table' },
            h('thead', null, h('tr', null, [headers.who, headers.why, headers.how, headers.owner, headers.next, headers.status, ''].map((t) => h('th', null, t)))),
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
                      ? itemLink(getItem(c.data.interview_id), texts.interview)
                      : writable && c.status !== 'chiusa'
                      ? button(texts.interview, { iconName: 'interview', href: `${PATHS.create}interview?${PATHS.contact}=${c.id}`, title: texts.createInterview })
                      : null,
                  ),
                ),
              ),
            ),
          ),
        )
      : h('p', { class: 'muted' }, texts.none),
  );
}

function interviewsTab(idea, writable) {
  const texts = tx.idea.interviews;
  const headers = texts.headers;
  const interviews = itemsOf('interview', { ideaId: idea.id }).sort((a, b) => (b.data.date || '').localeCompare(a.data.date || ''));
  return h(
    'div',
    { class: 'stack' },
    contactsBlock(idea, writable),
    h('h2', { class: 'section-title' }, texts.title, conceptButton(CONCEPTS.interviews)),
    h(
      'div',
      { class: 'row' },
      writable ? button(texts.add, { kind: 'primary', iconName: 'plus', href: `${PATHS.create}interview?idea=${idea.id}` }) : null,
      isExample(idea) ? null : aiButton('interview_questions', () => ideaContext(idea.id), { item: idea, label: texts.questions }),
      interviews.length && !isExample(idea) ? aiButton('interview_synthesis', () => ideaContext(idea.id), { item: idea, label: texts.synthesis }) : null,
    ),
    interviews.length
      ? h(
          'table',
          { class: 'table' },
          h('thead', null, h('tr', null, [headers.date, headers.interview, headers.status, headers.commitment, headers.problem].map((t) => h('th', null, t)))),
          h(
            'tbody',
            null,
            interviews.map((i) =>
              h(
                'tr',
                null,
                h('td', null, i.data.date ? fmtDate(i.data.date) : '-'),
                h('td', null, itemLink(i), sourceBadge(i)),
                h('td', null, statusPill('interview', i.status)),
                h('td', null, commitmentBadge(i.data.commitment) || '-'),
                h('td', null, i.data.problem_intensity ? `${i.data.problem_intensity}/5` : '-'),
              ),
            ),
          ),
        )
      : emptyState(texts.none),
  );
}

// The average of the votes, with one decimal in the format of the language in use (3.5 in English, 3,5 in Italian).
const oneDecimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function votesTab(idea) {
  const texts = tx.idea.votes;
  const criteria = criteriaList();
  if (!criteria.length) return emptyState(texts.noCriteria, button(texts.goToScoring, { href: PATHS.scoring }));
  const result = ideaScore(idea.id, criteria, scoreItems());
  const headers = texts.headers;
  return h(
    'div',
    { class: 'stack' },
    h('p', null, texts.teamScore, ' ', h('strong', null, result.score === null ? texts.noVotes : `${result.score}/100`), ` · ${texts.voters(result.voters.length)}`),
    h(
      'table',
      { class: 'table' },
      h('thead', null, h('tr', null, h('th', null, headers.criterion), h('th', null, headers.weight), h('th', null, headers.votes), h('th', null, headers.mean))),
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
            h('td', null, stats.mean === null ? '-' : oneDecimal.format(stats.mean), stats.disagreement ? h('span', { class: 'badge badge-warn' }, texts.disagreement) : null),
          );
        }),
      ),
    ),
    button(texts.voteInMatrix, { kind: 'primary', href: PATHS.vote }),
  );
}

function historyTab(idea) {
  const host = h('div', { class: 'stack' }, loading());
  api
    .listRevisions({ ideaId: idea.id, limit: 100 })
    .then((revs) => mount(host, revs.length ? h('ul', { class: 'log' }, revs.map(revisionLine)) : emptyState(tx.idea.history.none), button(tx.idea.history.versions, { iconName: 'history', href: `${PATHS.history}${idea.id}` })))
    .catch((error) => mount(host, errorBox(error)));
  return host;
}

export function ideaView(outlet, params, query = new URLSearchParams()) {
  const texts = tx.idea;
  const example = isExample(getItem(params.id));
  const groups = visibleGroups(example);
  const tab = sectionFor(params.tab, groups);
  let commentsEl = null;
  const hereHost = h('span', { class: 'here-host' });
  const renderHere = () => mount(hereHost, onlineHere(`/idea/${params.id}`) || '');

  const render = () => {
    const idea = getItem(params.id);
    if (!idea || idea.kind !== 'idea') {
      mount(outlet, errorBox({ message: texts.notFound }));
      return;
    }
    const writable = canWrite() && !idea.deleted_at && !example;
    const statusSelect = writable
      ? h(
          'select',
          { class: 'input input-small', 'aria-label': texts.status, onChange: (e) => changeStatus(getItem(idea.id), e.target.value) },
          KINDS.idea.statuses.map(([v, label]) => h('option', { value: v, selected: v === idea.status }, label)),
        )
      : statusPill('idea', idea.status);
    const count = (...kinds) => kinds.reduce((sum, kind) => sum + itemsOf(kind, { ideaId: idea.id }).length, 0);
    const counts = {
      [S.roadmap]: `${ideaRoadmap(idea).percent}%`,
      [S.canvas]: count('canvas'),
      [S.customers]: count(...CUSTOMER_KINDS),
      [S.market]: count('market', 'competitors'),
      [S.deeptech]: count('deeptech'),
      [S.experiments]: itemsOf('experiment', { ideaId: idea.id }).length,
      [S.interviews]: count('interview', 'contact'),
      [S.surveys]: count('survey'),
      [S.notes]: count('note'),
      [S.comments]: [idea.id, ...childIds(idea.id)].reduce((sum, id) => sum + (state.commentCounts.get(id) || 0), 0),
    };

    commentsEl?.cleanup?.();
    commentsEl = null;
    let body;
    if (tab === S.overview) body = overviewTab(idea);
    else if (tab === S.roadmap) body = roadmapPanel(idea, { writable });
    else if (tab === S.canvas) body = boardsTab(idea, writable, ['canvas']);
    else if (tab === S.customers) body = boardsTab(idea, writable, CUSTOMER_KINDS);
    else if (tab === S.market) body = boardsTab(idea, writable, ['market', 'competitors']);
    else if (tab === S.deeptech) body = boardsTab(idea, writable, ['deeptech']);
    else if (tab === S.experiments) body = experimentsTab(idea, writable, query.get('vista') === 'javelin');
    else if (tab === S.interviews) body = interviewsTab(idea, writable);
    else if (tab === S.surveys) body = ideaSurveysTab(idea, writable);
    else if (tab === S.notes) body = notesTab(idea, writable);
    else if (tab === S.votes) body = votesTab(idea);
    else if (tab === S.comments) body = commentsEl = commentsPanel(idea, { related: childIds(idea.id) });
    else body = historyTab(idea);

    mount(
      outlet,
      idea.deleted_at ? h('div', { class: 'banner banner-warn' }, texts.inTrash, ' ', h('a', { href: PATHS.trash }, texts.goToTrash)) : null,
      example ? exampleBanner(idea) : null,
      pageHeader({
        back: { href: PATHS.ideas },
        title: idea.title,
        subtitle: h('span', { class: 'row' }, statusSelect, idea.data.sector ? h('span', { class: 'muted' }, idea.data.sector) : null, metaLine(idea), hereHost),
        actions: [
          example ? null : aiButton('critique', () => ideaContext(idea.id), { item: idea, label: texts.critiqueIdea }),
          example ? null : chatButton(idea),
          writable ? button(tx.common.actions.edit, { iconName: 'edit', href: `${PATHS.edit}${idea.id}` }) : null,
          button('', { iconName: 'file', title: texts.exportMarkdown, onClick: () => exportIdeaMarkdown(idea) }),
          writable ? button('', { iconName: 'trash', title: tx.common.actions.archive, onClick: () => archiveWithConfirm(idea, { backTo: PATHS.ideas.slice(1) }) }) : null,
        ],
      }),
      ideaTabs(idea, groups, tab, counts),
      h('div', { class: 'tab-body' }, body),
    );
  };

  render();
  renderHere();
  trackPresence({ route: `/idea/${params.id}` });
  const offs = [
    on('item', ({ item }) => {
      if (tab === S.comments) {
        if (item.id === params.id) render();
        return;
      }
      if (item.id === params.id || item.idea_id === params.id || ['idea', 'score', 'criteria', 'decision', 'teamcanvas', 'equity'].includes(item.kind)) render();
    }),
    on('presence', renderHere),
    on('comment-counts', () => {
      if (tab !== S.comments) render();
    }),
  ];
  return () => {
    commentsEl?.cleanup?.();
    offs.forEach((off) => off());
  };
}
