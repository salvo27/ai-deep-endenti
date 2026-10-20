import { h, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { snapshotOf } from '../lib/diff.js';
import { fmtDate } from '../lib/format.js';
import { roadmapState } from '../roadmap.js';
import { roadmapMark } from '../schema.js';
import { criteriaList, decisionsFor, getItem, ideas, isExample, itemsOf, memberName, scoreItems, singleton, state } from '../store.js';
import { conceptByKey } from '../concepts.js';
import { conceptLink } from './concept-help.js';
import { saveWithMerge } from './merge.js';

// I passi aperti restano aperti quando la pagina si aggiorna dopo un salvataggio.
const openSteps = new Map();

export function roadmapContext(idea) {
  const ideaId = idea.id;
  const criteria = criteriaList();
  const fullVoters = criteria.length
    ? scoreItems().filter((s) => criteria.every((c) => Number.isInteger(s.data?.scores?.[ideaId]?.[c.key]))).length
    : 0;
  return {
    canvases: itemsOf('canvas', { ideaId }),
    experiments: itemsOf('experiment', { ideaId }),
    interviews: itemsOf('interview', { ideaId }),
    personas: itemsOf('persona', { ideaId }),
    vpcs: itemsOf('vpc', { ideaId }),
    markets: itemsOf('market', { ideaId }),
    competitors: itemsOf('competitors', { ideaId }),
    deeptechs: itemsOf('deeptech', { ideaId }),
    contacts: itemsOf('contact', { ideaId }),
    decisions: decisionsFor(ideaId),
    ideasCount: ideas().length,
    hasCriteria: Boolean(singleton('criteria')),
    fullVoters,
    example: isExample(idea),
  };
}

export const ideaRoadmap = (idea) => roadmapState(idea, roadmapContext(idea));

async function setMark(ideaId, step, markState) {
  const item = getItem(ideaId);
  if (!item || !state.user?.id) return false;
  const base = snapshotOf(item);
  const next = structuredClone(base);
  const marks = { ...(next.data.roadmap || {}) };
  if (markState) marks[step.key] = roadmapMark(markState, state.user.id);
  else delete marks[step.key];
  if (Object.keys(marks).length) next.data.roadmap = marks;
  else delete next.data.roadmap;
  const message = markState === 'skip' ? `Roadmap: «${step.title}» non serve` : markState ? `Roadmap: «${step.title}» fatto` : `Roadmap: «${step.title}» da fare`;
  try {
    const result = await saveWithMerge(item, base, next, message);
    return !result.cancelled;
  } catch (error) {
    toast(error.message, { type: 'error' });
    return false;
  }
}

function progressBar(done, total, label) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return h(
    'div',
    { class: 'rm-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done), 'aria-label': label },
    h('span', { style: { width: `${pct}%` } }),
  );
}

function statusLine(s, example) {
  if (s.status === 'auto') return 'Fatto: lo vede il sito dai dati.';
  if (s.status === 'skip') return `Non serve, segnato da ${memberName(s.mark.by)} il ${fmtDate(s.mark.at)}.`;
  if (s.status === 'done') return s.mark ? `Fatto, segnato da ${memberName(s.mark.by)} il ${fmtDate(s.mark.at)}.` : example ? 'Fatto (esempio).' : 'Fatto.';
  return null;
}

function stepRow(s, { idea, writable, reference }) {
  const { step, status } = s;
  const done = status !== 'todo';
  const opened = openSteps.get(idea?.id || 'guida') || new Set();
  let control = null;
  if (!reference) {
    control =
      status === 'auto'
        ? h('span', { class: 'rm-check is-auto', title: 'Fatto: lo vede il sito dai dati', role: 'img', 'aria-label': 'Fatto, rilevato dal sito' }, icon('check', 14))
        : h('input', {
            type: 'checkbox',
            class: 'rm-check',
            checked: done,
            disabled: !writable || status === 'skip',
            'aria-label': `Fatto: ${step.title}`,
            onChange: async (e) => {
              const box = e.target;
              box.disabled = true;
              const ok = await setMark(idea.id, step, box.checked ? 'done' : null);
              if (!ok) {
                box.checked = !box.checked;
                box.disabled = false;
              }
            },
          });
  }
  const line = reference ? null : statusLine(s, isExample(idea));
  const details = h(
    'details',
    {
      class: 'rm-details',
      open: opened.has(step.key) || (!reference && s.isNext),
      onToggle: (e) => {
        const set = openSteps.get(idea?.id || 'guida') || new Set();
        if (e.target.open) set.add(step.key);
        else set.delete(step.key);
        openSteps.set(idea?.id || 'guida', set);
      },
    },
    h(
      'summary',
      null,
      h('span', { class: 'rm-title' }, step.title),
      step.optional ? h('span', { class: 'chip' }, 'se serve') : null,
      s.progress && !reference ? h('span', { class: 'chip' }, s.progress) : null,
      s.isNext && !reference ? h('span', { class: 'badge badge-strong' }, 'Prossimo passo') : null,
    ),
    h(
      'div',
      { class: 'rm-body' },
      h('p', null, step.what),
      h('h4', null, 'Come si fa'),
      h('ul', null, step.how.map((text) => h('li', null, text))),
      h('p', { class: 'rm-done' }, h('strong', null, 'Fatto quando: '), step.done),
      h('p', { class: 'rm-mistake' }, h('strong', null, 'Errore da evitare: '), step.mistake),
      h(
        'div',
        { class: 'row rm-links' },
        s.href && !reference ? h('a', { class: 'btn btn-ghost btn-small', href: s.href }, 'Vai alla pagina') : null,
        step.concept ? conceptLink(step.concept, `Nel libro: ${conceptByKey(step.concept)?.term || 'concetto'}`) : null,
        writable && !reference && step.optional && status === 'todo'
          ? h('button', { type: 'button', class: 'link-btn small', onClick: () => setMark(idea.id, step, 'skip') }, 'Non serve per questa idea')
          : null,
        writable && !reference && status === 'skip'
          ? h('button', { type: 'button', class: 'link-btn small', onClick: () => setMark(idea.id, step, null) }, 'Riapri il passo')
          : null,
      ),
    ),
  );
  return h(
    'li',
    { class: ['rm-step', `is-${status}`, s.isNext && !reference && 'is-next'] },
    control,
    h('div', { class: 'rm-main' }, details, line ? h('p', { class: 'muted small rm-status' }, line) : null),
  );
}

export function phaseSection(p, { idea = null, writable = false, reference = false } = {}) {
  const { phase } = p;
  const notOpenYet = !reference && phase.onlyChosen && idea && idea.status !== 'scelta';
  return h(
    'section',
    { class: ['card', 'rm-phase', !reference && p.complete && 'is-complete'], id: `fase-${phase.key}` },
    h(
      'header',
      { class: 'rm-phase-head' },
      h('span', { class: 'rm-n' }, String(p.index + 1)),
      h('div', { class: 'rm-phase-title' }, h('h2', null, phase.title), h('p', { class: 'muted' }, phase.goal)),
      reference ? null : h('div', { class: 'rm-phase-progress' }, h('span', { class: 'small' }, `${p.done} di ${p.total}`), progressBar(p.done, p.total, `Avanzamento della fase ${phase.title}`)),
    ),
    phase.note ? h('p', { class: 'small muted' }, phase.note) : null,
    notOpenYet ? h('p', { class: 'banner' }, 'Questa fase si apre quando l\'idea è «Scelta». Potete già leggerla per prepararvi.') : null,
    !reference && !notOpenYet && p.previousIncomplete && p.done < p.total
      ? h('p', { class: 'banner banner-warn' }, icon('flag', 14), ' La fase precedente non è completa. ', phase.skipRisk)
      : null,
    h('ol', { class: 'rm-steps' }, p.steps.map((s) => stepRow(s, { idea, writable, reference }))),
    h('p', { class: 'rm-gate' }, icon('flag', 14), h('span', null, h('strong', null, 'Prima di andare avanti: '), phase.gate)),
  );
}

export function roadmapPanel(idea, { writable }) {
  const rm = ideaRoadmap(idea);
  return h(
    'div',
    { class: 'stack' },
    h(
      'section',
      { class: 'card rm-summary' },
      h('div', { class: 'rm-summary-head' }, h('h2', null, icon('compass', 18), 'Roadmap dell\'idea'), h('strong', null, `${rm.percent}%`)),
      progressBar(rm.done, rm.total, 'Avanzamento della roadmap'),
      h('p', { class: 'small' }, `${rm.done} passi su ${rm.total}`, rm.current ? ` · fase attuale: ${rm.current.phase.title}` : ''),
      rm.next ? h('p', null, h('strong', null, 'Prossimo passo: '), rm.next.step.title, h('span', { class: 'muted' }, ` (fase ${rm.next.phase.title})`)) : h('p', null, 'Tutti i passi sono completati.'),
      h(
        'p',
        { class: 'muted small' },
        'Un segno di spunta pieno vuol dire che il sito lo vede dai dati; le caselle le segnate voi quando il passo è davvero fatto. Le fasi vanno in ordine: saltarne una aumenta il rischio.',
      ),
    ),
    rm.phases.map((p) => phaseSection(p, { idea, writable })),
  );
}

// Riquadro della panoramica: dove siete e qual è il prossimo passo.
export function roadmapBox(idea, { sample } = {}) {
  const rm = ideaRoadmap(idea);
  const nextStep = rm.next?.step;
  return h(
    'section',
    { class: 'next-step' },
    h(
      'div',
      { class: 'next-step-head' },
      h('h2', null, icon('compass', 18), `Prossimo passo · ${rm.next ? rm.next.phase.title : 'Roadmap completata'}`),
      h('span', { class: 'muted small' }, `${rm.done} di ${rm.total} · ${rm.percent}%`),
    ),
    progressBar(rm.done, rm.total, 'Avanzamento della roadmap'),
    nextStep ? h('p', null, h('strong', null, nextStep.title), h('br'), h('span', { class: 'muted small' }, `Fatto quando: ${nextStep.done}`)) : h('p', null, 'Tutti i passi della roadmap sono completati.'),
    h(
      'div',
      { class: 'row' },
      h('a', { class: 'btn btn-primary btn-small', href: `#/idea/${idea.id}/roadmap` }, icon('compass', 14), h('span', null, 'Apri la roadmap')),
      sample ? h('a', { class: 'btn btn-example btn-small', href: `#/idea/${sample.id}/roadmap` }, icon('idea', 14), h('span', null, `Esempio: ${sample.title.split(':')[0]}`)) : null,
    ),
  );
}

