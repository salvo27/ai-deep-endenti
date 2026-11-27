import { h, openModal } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { CHAPTERS, VERIFIED_ON, conceptByKey } from '../concepts.js';
import { KINDS } from '../schema.js';
import { tx } from '../i18n/index.js';

const t = tx.concepts.help;
const ADDED_CHAPTER = 11;
const conceptHref = (key) => `#/guida/concetti?c=${key}`; // i18n-ignore: the address of the page, not a text
const chapterLabel = (n) => CHAPTERS.find(([key]) => key === n)?.[1] || '';
const phaseLabel = (status) => KINDS.idea.statuses.find(([value]) => value === status)?.[1] || status;

export function conceptBody(concept) {
  return [
    h('p', null, concept.text),
    concept.where ? h('p', { class: 'concept-where' }, icon('compass', 14), h('span', null, t.onBoard(concept.where))) : null,
    h(
      'p',
      { class: 'muted small' },
      concept.chapter === ADDED_CHAPTER ? t.addedChapter : t.chapter(concept.chapter, chapterLabel(concept.chapter)),
      concept.phases.length ? ` · ${concept.phases.map(phaseLabel).join(', ')}` : '',
      concept.verified ? ` · ${t.verified(VERIFIED_ON)}` : '',
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
      h('a', { class: 'btn btn-ghost', href: conceptHref(concept.key), onClick: () => modal.close() }, icon('book', 16), h('span', null, t.allConcepts)),
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
      title: t.whatIs(concept.term),
      'aria-label': t.whatIs(concept.term),
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
  return h('a', { href: conceptHref(key), class: 'concept-link' }, text || concept.term);
}
