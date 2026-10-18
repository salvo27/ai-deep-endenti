import { h, openModal } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { CHAPTERS, VERIFIED_ON, conceptByKey } from '../concepts.js';
import { KINDS } from '../schema.js';

const chapterLabel = (n) => CHAPTERS.find(([key]) => key === n)?.[1] || '';
const phaseLabel = (status) => KINDS.idea.statuses.find(([value]) => value === status)?.[1] || status;

export function conceptBody(concept) {
  return [
    h('p', null, concept.text),
    concept.where ? h('p', { class: 'concept-where' }, icon('compass', 14), h('span', null, `Nella board: ${concept.where}`)) : null,
    h(
      'p',
      { class: 'muted small' },
      concept.chapter === 11 ? 'Capitolo aggiunto sul deep tech' : `Capitolo ${concept.chapter}: ${chapterLabel(concept.chapter)}`,
      concept.phases.length ? ` · ${concept.phases.map(phaseLabel).join(', ')}` : '',
      concept.verified ? ` · norme e dati verificati il ${VERIFIED_ON}` : '',
    ),
  ];
}

export function openConcept(key) {
  const concept = conceptByKey(key);
  if (!concept) return null;
  const modal = openModal({
    title: concept.term,
    body: h(
      'div',
      { class: 'stack' },
      conceptBody(concept),
      h('a', { class: 'btn btn-ghost', href: `#/concetti?c=${concept.key}`, onClick: () => modal.close() }, icon('book', 16), h('span', null, 'Tutti i concetti')),
    ),
  });
  return modal;
}

export function conceptButton(key) {
  const concept = conceptByKey(key);
  if (!concept) return null;
  return h(
    'button',
    {
      type: 'button',
      class: 'concept-btn',
      title: `Cos'è: ${concept.term}`,
      'aria-label': `Cos'è: ${concept.term}`,
      onClick: (event) => {
        event.preventDefault();
        openConcept(key);
      },
    },
    icon('help', 15),
  );
}

export function conceptLink(key, text) {
  const concept = conceptByKey(key);
  if (!concept) return null;
  return h('a', { href: `#/concetti?c=${key}`, class: 'concept-link' }, text || concept.term);
}
