import { h, mount } from '../lib/dom.js';
import { daysUntil, fmtDate, plural } from '../lib/format.js';
import { KINDS, STRONG_COMMITMENTS } from '../schema.js';
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

export function dashboardData(now = new Date()) {
  const allIdeas = ideas();
  const active = allIdeas.filter((i) => !['scartata', 'parcheggiata'].includes(i.status));
  const experiments = itemsOf('experiment');
  const running = experiments.filter((e) => e.status === 'in_corso');
  const interviews = itemsOf('interview');
  const monthAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const recentInterviews = interviews.filter((i) => (i.data.date || i.created_at.slice(0, 10)) >= monthAgo);
  const strong = interviews.filter((i) => STRONG_COMMITMENTS.has(i.data.commitment));
  const pipeline = KINDS.idea.statuses.map(([status, label]) => ({ status, label, count: allIdeas.filter((i) => i.status === status).length }));
  const myId = state.user?.id;
  const myTodo = [
    ...experiments.filter((e) => e.data.owner === myId && e.status !== 'concluso'),
    ...interviews.filter((i) => i.data.interviewer === myId && i.status === 'da_fare'),
    ...itemsOf('contact').filter((c) => c.data.owner === myId && ['da_contattare', 'contattata', 'fissata'].includes(c.status)),
  ];
  const top = ranking(active, criteriaList(), scoreItems()).slice(0, 5);
  return { allIdeas, active, running, recentInterviews, strong, pipeline, myTodo, top };
}

function stat(value, label, href) {
  return h('a', { class: 'stat', href }, h('strong', null, String(value)), h('span', null, label));
}

function deadline(item) {
  if (!item.data.end_date) return null;
  const days = daysUntil(item.data.end_date);
  const text = days < 0 ? `scaduto da ${plural(-days, 'giorno', 'giorni')}` : days === 0 ? 'scade oggi' : `scade tra ${plural(days, 'giorno', 'giorni')}`;
  return h('span', { class: ['deadline', days < 0 && 'is-late'], title: fmtDate(item.data.end_date) }, text);
}

export function dashboardView(outlet) {
  const news = h('div', null, loading());
  const lastSeen = readLocal('lastSeen');

  const render = () => {
    const d = dashboardData();
    const empty = !d.allIdeas.length;
    mount(
      outlet,
      pageHeader({
        back: false,
        title: `Ciao, ${state.me?.display_name || ''}`,
        subtitle: 'Le idee del team, gli esperimenti in corso e cosa è cambiato.',
        actions: [button('Nuova idea', { kind: 'primary', iconName: 'plus', href: '#/nuovo/idea' })],
      }),
      empty
        ? emptyState(
            'La board è vuota. Crea la prima idea, oppure parti dal generatore.',
            canWrite() ? button('Apri il generatore', { href: '#/generatore', iconName: 'generator' }) : null,
          )
        : null,
      h(
        'section',
        { class: 'stats' },
        stat(d.active.length, 'idee attive', '#/idee'),
        stat(d.running.length, 'esperimenti in corso', '#/esperimenti'),
        stat(d.recentInterviews.length, 'interviste negli ultimi 30 giorni', '#/interviste'),
        stat(d.strong.length, 'impegni concreti (piloti)', '#/interviste'),
      ),
      h(
        'div',
        { class: 'dash-grid' },
        h(
          'section',
          { class: 'card' },
          h('h2', null, 'Classifica'),
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
                    r.disagreements ? h('span', { class: 'badge badge-warn', title: 'Criteri su cui il team non è d\'accordo' }, `${r.disagreements} disaccordi`) : null,
                  ),
                ),
              )
            : h('p', { class: 'muted' }, 'Nessun voto ancora. ', h('a', { href: '#/valutazione' }, 'Vota le idee')),
        ),
        h(
          'section',
          { class: 'card' },
          h('h2', null, 'Pipeline delle idee'),
          h('ul', { class: 'pipeline' }, d.pipeline.map((p) => h('li', null, statusPill('idea', p.status), h('strong', null, String(p.count))))),
        ),
        h(
          'section',
          { class: 'card' },
          h('h2', null, 'Esperimenti in corso'),
          d.running.length
            ? h('ul', { class: 'list' }, d.running.map((e) => h('li', null, itemLink(e), e.data.owner ? avatar(e.data.owner, 20) : null, deadline(e))))
            : h('p', { class: 'muted' }, 'Nessun esperimento in corso.'),
        ),
        h(
          'section',
          { class: 'card' },
          h('h2', null, 'Le tue cose da fare'),
          d.myTodo.length
            ? h('ul', { class: 'list' }, d.myTodo.map((i) => h('li', null, kindBadge(i.kind), itemLink(i), i.kind === 'experiment' ? deadline(i) : null)))
            : h('p', { class: 'muted' }, 'Niente in sospeso.'),
        ),
        h('section', { class: 'card card-wide' }, h('h2', null, lastSeen ? 'Novità dall\'ultima visita' : 'Ultime modifiche'), news),
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
          : h('p', { class: 'muted' }, lastSeen ? 'Nessuna novità dagli altri dalla tua ultima visita.' : 'Ancora nessuna modifica.'),
        h('a', { class: 'link-btn', href: '#/storico' }, 'Apri lo storico completo'),
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

