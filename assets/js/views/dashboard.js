import { h, mount } from '../lib/dom.js';
import { daysUntil, fmtDate } from '../lib/format.js';
import { tx } from '../i18n/index.js';
import { KINDS, STRONG_COMMITMENTS, isHeldConversation } from '../schema.js';
import { api } from '../lib/api.js';
import {
  criteriaList,
  ideas,
  canWrite,
  itemsOf,
  on,
  readLocal,
  scoreItems,
  state,
  writeLocal,
} from '../store.js';
import { ranking } from '../scoring.js';
import { avatar, button, emptyState, errorBox, itemLink, kindBadge, loading, pageHeader, statusPill } from './components.js';
import { revisionLine } from './history.js';
import { dueLabel, myContactTodos, unownedContacts } from './contacts.js';

// Addresses of the site: their Italian words are part of the URL, not text the reader sees.
const PATHS = { ideas: '#/idee', experiments: '#/esperimenti', conversations: '#/interviste?tipo=colloquio', scoring: '#/valutazione', generator: '#/generatore', create: '#/nuovo/idea', unowned: '#/contatti?filtro=senza', history: '#/storico' }; // i18n-ignore
const INACTIVE = ['scartata', 'parcheggiata']; // i18n-ignore: stored values

export function dashboardData(now = new Date()) {
  const allIdeas = ideas();
  const active = allIdeas.filter((i) => !INACTIVE.includes(i.status));
  const experiments = itemsOf('experiment');
  const running = experiments.filter((e) => e.status === 'in_corso');
  const interviews = itemsOf('interview');
  // Come prova contano solo i colloqui avvenuti, non le ricerche online né quelli ancora da fare.
  const conversations = interviews.filter(isHeldConversation);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const recentInterviews = conversations.filter((i) => (i.data.date || i.created_at.slice(0, 10)) >= monthAgo);
  const strong = conversations.filter((i) => STRONG_COMMITMENTS.has(i.data.commitment));
  const pipeline = KINDS.idea.statuses.map(([status, label]) => ({ status, label, count: allIdeas.filter((i) => i.status === status).length }));
  const myId = state.user?.id;
  const myTodo = [
    ...experiments.filter((e) => e.data.owner === myId && e.status !== 'concluso'),
    ...interviews.filter((i) => i.data.interviewer === myId && i.status === 'da_fare'), // i18n-ignore (status)
    ...myContactTodos(myId, now),
  ];
  const unowned = unownedContacts().length;
  const top = ranking(active, criteriaList(), scoreItems()).slice(0, 5);
  return { allIdeas, active, running, recentInterviews, strong, pipeline, myTodo, unowned, top };
}

// The number and its label: the label agrees with the number (1 idea, 2 ideas).
function stat(value, label, href) {
  return h('a', { class: 'stat', href }, h('strong', null, String(value)), h('span', null, label(value)));
}

function deadline(item) {
  if (!item.data.end_date) return null;
  const days = daysUntil(item.data.end_date);
  const texts = tx.dashboard;
  const text = days < 0 ? texts.late(-days) : days === 0 ? texts.dueToday : texts.dueIn(days);
  return h('span', { class: ['deadline', days < 0 && 'is-late'], title: fmtDate(item.data.end_date) }, text);
}

export function dashboardView(outlet) {
  const texts = tx.dashboard;
  const news = h('div', null, loading());
  const lastSeen = readLocal('lastSeen');

  const render = () => {
    const d = dashboardData();
    const empty = !d.allIdeas.length;
    mount(
      outlet,
      pageHeader({
        back: false,
        title: texts.hello(state.me?.display_name || ''),
        subtitle: texts.subtitle,
        actions: [button(texts.newIdea, { kind: 'primary', iconName: 'plus', href: PATHS.create })],
      }),
      empty ? emptyState(texts.empty, canWrite() ? button(texts.openGenerator, { href: PATHS.generator, iconName: 'generator' }) : null) : null,
      h(
        'section',
        { class: 'stats' },
        stat(d.active.length, texts.stats.activeIdeas, PATHS.ideas),
        stat(d.running.length, texts.stats.running, PATHS.experiments),
        stat(d.recentInterviews.length, texts.stats.interviews, PATHS.conversations),
        stat(d.strong.length, texts.stats.commitments, PATHS.conversations),
      ),
      h(
        'div',
        { class: 'dash-grid' },
        h(
          'section',
          { class: 'card' },
          h('h2', null, texts.ranking),
          d.top.length && d.top.some((r) => r.score !== null)
            ? h(
                'ol',
                { class: 'ranking' },
                d.top.map((r) =>
                  h(
                    'li',
                    null,
                    itemLink(r.idea),
                    h('span', { class: 'bar', style: { '--value': `${r.score ?? 0}%` } }),
                    h('strong', null, r.score === null ? '-' : String(r.score)),
                    r.disagreements ? h('span', { class: 'badge badge-warn', title: texts.disagreementsHint }, texts.disagreements(r.disagreements)) : null,
                  ),
                ),
              )
            : h('p', { class: 'muted' }, texts.noVotes, ' ', h('a', { href: PATHS.scoring }, texts.voteIdeas)),
        ),
        h(
          'section',
          { class: 'card' },
          h('h2', null, texts.pipeline),
          h('ul', { class: 'pipeline' }, d.pipeline.map((p) => h('li', null, statusPill('idea', p.status), h('strong', null, String(p.count))))),
        ),
        h(
          'section',
          { class: 'card' },
          h('h2', null, texts.running),
          d.running.length
            ? h('ul', { class: 'list' }, d.running.map((e) => h('li', null, itemLink(e), e.data.owner ? avatar(e.data.owner, 20) : null, deadline(e))))
            : h('p', { class: 'muted' }, texts.noRunning),
        ),
        h(
          'section',
          { class: 'card' },
          h('h2', null, texts.todo),
          d.myTodo.length
            ? h('ul', { class: 'list' }, d.myTodo.map((i) => h('li', null, kindBadge(i.kind), itemLink(i), i.kind === 'experiment' ? deadline(i) : i.kind === 'contact' ? dueLabel(i) : null)))
            : h('p', { class: 'muted' }, texts.nothingPending),
          canWrite() && d.unowned
            ? h('p', { class: 'small' }, h('a', { href: PATHS.unowned }, texts.unowned(d.unowned)), texts.chooseOwner)
            : null,
        ),
        h('section', { class: 'card card-wide' }, h('h2', null, lastSeen ? texts.newsSince : texts.latest), news),
      ),
    );
  };

  const loadNews = async () => {
    try {
      const revisions = await api.listRevisions({ sinceIso: lastSeen || undefined, limit: 15 });
      const others = revisions.filter((r) => r.author_id !== state.user.id || !lastSeen);
      mount(news,
        others.length
          ? h('ul', { class: 'log' }, others.map((r) => revisionLine(r)))
          : h('p', { class: 'muted' }, lastSeen ? texts.noNewsSince : texts.noChanges),
        h('a', { class: 'link-btn', href: PATHS.history }, texts.fullHistory),
      );
    } catch (error) {
      mount(news, errorBox(error));
    }
  };

  render();
  loadNews();
  writeLocal('lastSeen', new Date().toISOString());
  const offs = [on('item', render), on('members', render)];
  return () => offs.forEach((off) => off());
}
