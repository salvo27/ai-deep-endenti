import { h, mount } from '../lib/dom.js';
import { tx } from '../i18n/index.js';
import { navigate } from '../router.js';
import { BOARD_KINDS, KINDS } from '../schema.js';
import { canWrite, getItem, isExample, on, state, trackPresence } from '../store.js';
import { canvasView } from './canvas.js';
import { deeptechView, marketView, personaView, vpcView } from './boards.js';
import { competitorsView } from './competitors.js';
import { noteView } from './notes.js';
import { commentsPanel } from './comments.js';
import { aiButton } from './ai-panel.js';
import { archiveWithConfirm, changeStatus } from './actions.js';
import { ideaContext } from './idea.js';
import { button, errorBox, exampleBanner, fieldsGrid, itemLink, metaLine, onlineHere, pageHeader, sourceBadge, statusPill, tabs } from './components.js';

// Addresses of the site: their Italian words are part of the URL, not text the reader sees.
const PATHS = { details: 'dettagli', comments: 'commenti', notes: 'appunti', edit: '#/modifica/', history: '#/storico/', trash: '#/cestino', survey: '/questionario/' }; // i18n-ignore
const LIST_ROUTES = { experiment: '/esperimenti', interview: '/interviste', decision: '/decisioni' }; // i18n-ignore

const TABS = [
  [PATHS.details, tx.editor.item.details],
  [PATHS.comments, tx.editor.item.comments],
];

const VIEWS = { canvas: canvasView, deeptech: deeptechView, vpc: vpcView, market: marketView, competitors: competitorsView, persona: personaView, note: noteView };
const CRITIQUE_KINDS = ['canvas', 'experiment', 'persona', 'vpc', 'market', 'competitors', 'deeptech']; // i18n-ignore (kinds)

export function itemView(outlet, params) {
  const texts = tx.editor.item;
  const example = isExample(getItem(params.id));
  const tab = TABS.some(([key]) => key === params.tab) && !example ? params.tab : PATHS.details;
  const onComments = tab === PATHS.comments;
  // Un questionario ha la sua pagina; qui restano solo i commenti.
  if (getItem(params.id)?.kind === 'survey' && !onComments) {
    setTimeout(() => navigate(`${PATHS.survey}${params.id}`, { replace: true }), 0);
    return null;
  }
  let commentsEl = null;
  const hereHost = h('span', { class: 'here-host' });
  const renderHere = () => mount(hereHost, onlineHere(`/elemento/${params.id}`) || '');

  const render = () => {
    const item = getItem(params.id);
    if (!item || !BOARD_KINDS.includes(item.kind) || item.kind === 'idea') {
      mount(outlet, errorBox({ message: texts.notFound }));
      return;
    }
    const def = KINDS[item.kind];
    const idea = item.idea_id ? getItem(item.idea_id) : null;
    const writable = canWrite() && !item.deleted_at && !example;
    const statusControl = def.statuses
      ? writable
        ? h(
            'select',
            { class: 'input input-small', 'aria-label': texts.status, onChange: (e) => changeStatus(getItem(item.id), e.target.value) },
            def.statuses.map(([v, label]) => h('option', { value: v, selected: v === item.status }, label)),
          )
        : statusPill(item.kind, item.status)
      : null;
    const critique = CRITIQUE_KINDS.includes(item.kind) && idea && !example
      ? aiButton('critique', () => ({ ...ideaContext(idea.id), item }), { item, label: texts.critique })
      : null;

    commentsEl?.cleanup?.();
    commentsEl = null;
    const body = onComments
      ? (commentsEl = commentsPanel(item))
      : h('div', null, VIEWS[item.kind] ? VIEWS[item.kind](item) : fieldsGrid(item));

    mount(
      outlet,
      item.deleted_at ? h('div', { class: 'banner banner-warn' }, texts.inTrash, ' ', h('a', { href: PATHS.trash }, texts.goToTrash)) : null,
      example ? exampleBanner(item) : null,
      pageHeader({
        back: { href: idea ? `#/idea/${idea.id}${item.kind === 'note' ? `/${PATHS.notes}` : ''}` : `#${LIST_ROUTES[item.kind] || '/'}` },
        eyebrow: h('span', { class: 'kind-eyebrow' }, def.label, idea ? [' ', texts.ofIdea, ' ', itemLink(idea)] : null),
        title: item.title,
        subtitle: h('span', { class: 'row' }, statusControl, item.kind === 'interview' ? sourceBadge(item) : null, metaLine(item), hereHost),
        actions: [
          critique,
          writable ? button(tx.common.actions.edit, { iconName: 'edit', href: `${PATHS.edit}${item.id}` }) : null,
          example ? null : button(texts.versions, { iconName: 'history', href: `${PATHS.history}${item.id}` }),
          writable ? button('', { iconName: 'trash', title: tx.common.actions.archive, onClick: () => archiveWithConfirm(item, { backTo: idea ? `/idea/${idea.id}` : LIST_ROUTES[item.kind] || '/' }) }) : null,
        ],
      }),
      example ? null : tabs(TABS.map(([key, label]) => [key, label, key === PATHS.comments ? state.commentCounts.get(item.id) : 0]), tab, (key) => `#/elemento/${item.id}/${key}`),
      h('div', { class: 'tab-body' }, body),
    );
  };

  render();
  renderHere();
  trackPresence({ route: `/elemento/${params.id}` });
  const offs = [
    on('item', ({ item }) => {
      if (item.id === params.id && !onComments) render();
    }),
    on('presence', renderHere),
  ];
  return () => {
    commentsEl?.cleanup?.();
    offs.forEach((off) => off());
  };
}
