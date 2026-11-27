import { h, mount } from '../lib/dom.js';
import { CHAPTERS, CONCEPTS, VERIFIED_ON } from '../concepts.js';
import { KINDS } from '../schema.js';
import { tx } from '../i18n/index.js';
import { emptyState } from './components.js';
import { conceptBody } from './concept-help.js';

const t = tx.concepts;
const normalize = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ADDED_CHAPTER = 11;

export const CONCEPTS_INTRO = t.intro(VERIFIED_ON);

// Seconda scheda della Guida: filtri ed elenco dei concetti, con in evidenza quello aperto da un link.
export function conceptsPanel(focus) {
  let search = '';
  let chapter = 0;
  let phase = '';
  let showMinor = true;
  const listHost = h('div', { class: 'concept-list' });

  const matches = (concept) => {
    if (chapter && concept.chapter !== chapter) return false;
    if (phase && !concept.phases.includes(phase)) return false;
    if (!showMinor && concept.minor) return false;
    if (!search) return true;
    return normalize(`${concept.term} ${concept.text}`).includes(normalize(search));
  };

  const render = () => {
    const shown = CONCEPTS.filter(matches);
    mount(
      listHost,
      shown.length
        ? CHAPTERS.map(([n, label]) => {
            const items = shown.filter((concept) => concept.chapter === n);
            if (!items.length) return null;
            return h(
              'section',
              { class: 'concept-chapter' },
              h('h2', null, n === ADDED_CHAPTER ? t.addedChapter(label) : `${n}. ${label}`),
              h(
                'div',
                { class: 'cards' },
                items.map((concept) =>
                  h(
                    'article',
                    { class: ['card', 'concept-card', concept.key === focus && 'is-focus', concept.minor && 'is-minor'], id: `concetto-${concept.key}` },
                    h('h3', null, concept.term),
                    conceptBody(concept),
                  ),
                ),
              ),
            );
          })
        : emptyState(t.panel.noMatch),
    );
  };

  const searchInput = h('input', {
    class: 'input',
    type: 'search',
    placeholder: t.panel.search,
    'aria-label': t.panel.search,
    onInput: (event) => {
      search = event.target.value.trim();
      render();
    },
  });
  const chapterSelect = h(
    'select',
    { class: 'input', 'aria-label': t.panel.chapter, onChange: (event) => { chapter = Number(event.target.value); render(); } },
    h('option', { value: 0 }, t.panel.allChapters),
    CHAPTERS.map(([n, label]) => h('option', { value: n }, n === ADDED_CHAPTER ? label : `${n}. ${label}`)),
  );
  const phaseSelect = h(
    'select',
    { class: 'input', 'aria-label': t.panel.phase, onChange: (event) => { phase = event.target.value; render(); } },
    h('option', { value: '' }, t.panel.allPhases),
    KINDS.idea.statuses.map(([value, label]) => h('option', { value }, label)),
  );
  const minorToggle = h(
    'label',
    { class: 'check' },
    h('input', { type: 'checkbox', checked: true, onChange: (event) => { showMinor = event.target.checked; render(); } }),
    t.panel.showMinor,
  );

  render();
  return [h('div', { class: 'filters concept-filters' }, searchInput, chapterSelect, phaseSelect, minorToggle), listHost];
}
