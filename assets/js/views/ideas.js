import { h, mount } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { truncate } from '../lib/format.js';
import { KINDS, isHeldConversation } from '../schema.js';
import { canWrite, criteriaList, exampleIdeas, getItem, ideas, itemsOf, on, readLocal, scoreItems, state, writeLocal } from '../store.js';
import { ranking } from '../scoring.js';
import { navigate } from '../router.js';
import { avatar, button, emptyState, itemLink, pageHeader, statusPill, timeAgo } from './components.js';
import { changeStatus } from './actions.js';

export function ideaCounts(ideaId) {
  return {
    experiments: itemsOf('experiment', { ideaId }).length,
    interviews: itemsOf('interview', { ideaId }).filter(isHeldConversation).length,
    comments: state.commentCounts.get(ideaId) || 0,
  };
}

function scoreBadge(score) {
  if (score === null || score === undefined) return null;
  return h('span', { class: 'score-badge', title: 'Punteggio del team (0-100)' }, String(score));
}

function ideaCard(row, writable) {
  const { idea, score } = row;
  const counts = ideaCounts(idea.id);
  const card = h(
    'article',
    { class: 'idea-card', draggable: writable ? 'true' : undefined, dataset: { id: idea.id } },
    h('div', { class: 'idea-card-head' }, itemLink(idea), scoreBadge(score)),
    idea.data.pitch ? h('p', { class: 'muted small' }, truncate(idea.data.pitch, 140)) : null,
    idea.data.technologies?.length ? h('div', { class: 'chips' }, idea.data.technologies.slice(0, 3).map((t) => h('span', { class: 'chip' }, t))) : null,
    h(
      'div',
      { class: 'idea-card-foot' },
      idea.data.owner ? avatar(idea.data.owner, 22) : null,
      h('span', { class: 'counter', title: 'Esperimenti' }, icon('experiment', 14), String(counts.experiments)),
      h('span', { class: 'counter', title: 'Interviste' }, icon('interview', 14), String(counts.interviews)),
      h('span', { class: 'counter', title: 'Commenti' }, icon('comment', 14), String(counts.comments)),
    ),
  );
  if (writable) {
    card.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', idea.id);
      event.dataTransfer.effectAllowed = 'move';
    });
  }
  return card;
}

function exampleCard(idea) {
  const counts = ideaCounts(idea.id);
  return h(
    'article',
    { class: 'idea-card is-example', dataset: { id: idea.id } },
    h('div', { class: 'idea-card-head' }, itemLink(idea), h('span', { class: 'badge badge-example' }, 'Esempio')),
    idea.data.pitch ? h('p', { class: 'muted small' }, truncate(idea.data.pitch, 140)) : null,
    h(
      'div',
      { class: 'idea-card-foot' },
      h('span', { class: 'counter', title: 'Esperimenti' }, icon('experiment', 14), String(counts.experiments)),
      h('span', { class: 'counter', title: 'Interviste' }, icon('interview', 14), String(counts.interviews)),
    ),
  );
}

export function ideasView(outlet, params, query) {
  const mode = query.get('vista') === 'tabella' ? 'table' : 'board';
  const writable = canWrite();
  let showExamples = readLocal('esempi', true) !== false;

  const render = () => {
    const rows = ranking(ideas(), criteriaList(), scoreItems());
    const toolbar = h(
      'div',
      { class: 'toolbar' },
      h('a', { class: ['btn', 'btn-small', mode === 'board' ? 'btn-primary' : 'btn-ghost'], href: '#/idee', dataset: { replace: '' } }, icon('columns', 16), 'Colonne'),
      h('a', { class: ['btn', 'btn-small', mode === 'table' ? 'btn-primary' : 'btn-ghost'], href: '#/idee?vista=tabella', dataset: { replace: '' } }, icon('list', 16), 'Tabella'),
      mode === 'board'
        ? h(
            'button',
            {
              type: 'button',
              class: ['btn', 'btn-small', showExamples ? 'btn-example' : 'btn-ghost'],
              'aria-pressed': String(showExamples),
              title: showExamples ? 'Nascondi le idee di esempio' : 'Mostra le idee di esempio',
              onClick: () => {
                showExamples = !showExamples;
                writeLocal('esempi', showExamples);
                render();
              },
            },
            icon('idea', 16),
            'Esempi',
          )
        : null,
    );
    let body;
    if (!rows.length && (mode === 'table' || !showExamples)) {
      body = emptyState('Nessuna idea ancora.', writable ? button('Crea la prima idea', { kind: 'primary', href: '#/nuovo/idea' }) : null);
    } else if (mode === 'board') {
      body = h(
        'div',
        { class: 'kanban' },
        KINDS.idea.statuses.map(([status]) => {
          const column = h(
            'section',
            { class: 'kanban-col', dataset: { status } },
            h('header', null, statusPill('idea', status), h('span', { class: 'muted small' }, String(rows.filter((r) => r.idea.status === status).length))),
            rows.filter((r) => r.idea.status === status).map((r) => ideaCard(r, writable)),
            showExamples ? exampleIdeas().filter((idea) => idea.status === status).map(exampleCard) : null,
          );
          if (writable) {
            column.addEventListener('dragover', (event) => {
              event.preventDefault();
              column.classList.add('is-drop');
            });
            column.addEventListener('dragleave', () => column.classList.remove('is-drop'));
            column.addEventListener('drop', async (event) => {
              event.preventDefault();
              column.classList.remove('is-drop');
              const idea = getItem(event.dataTransfer.getData('text/plain'));
              if (idea?.kind === 'idea') await changeStatus(idea, status);
            });
          }
          return column;
        }),
      );
    } else {
      body = h(
        'table',
        { class: 'table' },
        h('thead', null, h('tr', null, ['Idea', 'Stato', 'Settore', 'Responsabile', 'Punteggio', 'Esperimenti', 'Interviste', 'Aggiornata'].map((t) => h('th', null, t)))),
        h(
          'tbody',
          null,
          rows.map(({ idea, score }) => {
            const counts = ideaCounts(idea.id);
            return h(
              'tr',
              { class: 'clickable', onClick: (e) => { if (e.target.tagName !== 'A') navigate(`/idea/${idea.id}`); } },
              h('td', null, itemLink(idea)),
              h('td', null, statusPill('idea', idea.status)),
              h('td', null, idea.data.sector || '-'),
              h('td', null, idea.data.owner ? avatar(idea.data.owner, 22) : '-'),
              h('td', null, score === null ? '-' : String(score)),
              h('td', null, String(counts.experiments)),
              h('td', null, String(counts.interviews)),
              h('td', null, timeAgo(idea.updated_at)),
            );
          }),
        ),
      );
    }
    mount(
      outlet,
      pageHeader({
        title: 'Idee',
        subtitle: [
          writable ? 'Per cambiare lo stato trascina una scheda in un\'altra colonna, oppure usa il menu nella pagina dell\'idea. ' : null,
          mode === 'board' && showExamples ? 'Le schede tratteggiate sono esempi da startup note: mostrano come si compila un\'idea in ogni stato.' : null,
        ].filter(Boolean),
        actions: [toolbar, writable ? button('Nuova idea', { kind: 'primary', iconName: 'plus', href: '#/nuovo/idea' }) : null],
      }),
      body,
    );
  };

  render();
  const offs = [on('item', render), on('comment-counts', render)];
  return () => offs.forEach((off) => off());
}
