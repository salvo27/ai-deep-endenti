import { h } from './lib/dom.js';
import { plural } from './lib/format.js';
import { statusLabel } from './schema.js';
import { estimateMinutes, minutesLabel } from './public/survey-time.js';

// Il questionario com'è fatto, da salvare in PDF: testi, domande numerate e risposte possibili, senza risultati.
// Le caselle vuote lo rendono usabile anche su carta.

const ROUND = '○';
const SQUARE = '☐';

function numberText(number) {
  const { min = null, max = null } = number || {};
  if (min !== null && max !== null) return `Numero intero da ${min} a ${max}`;
  if (min !== null) return `Numero intero, almeno ${min}`;
  if (max !== null) return `Numero intero, al massimo ${max}`;
  return 'Numero intero';
}

const KIND = {
  scelta: () => 'Una risposta',
  scelte: () => 'Una o più risposte',
  scala: (q) => `Scala da 1 a ${q.scale?.points || 5}`,
  numero: (q) => numberText(q.number),
  breve: () => 'Risposta breve',
  lunga: () => 'Risposta lunga',
  email: () => 'Email, facoltativa per ricontattare',
};

function answers(q) {
  if (q.type === 'scelta' || q.type === 'scelte') {
    const mark = q.type === 'scelte' ? SQUARE : ROUND;
    const other = q.other_label || 'Altro';
    return h(
      'ul',
      { class: 'ps-options' },
      (q.options || []).map((o) => h('li', null, `${mark} ${o.label}`)),
      q.allow_other ? h('li', null, `${mark} ${other}: `, h('span', { class: 'ps-fill' }, q.other_placeholder || '')) : null,
      q.prefer_not ? h('li', { class: 'ps-muted' }, `${mark} Preferisco non rispondere`) : null,
    );
  }
  if (q.type === 'scala') {
    const points = q.scale?.points || 5;
    const labelOf = (i) => q.scale?.labels?.[i - 1] || (i === 1 ? q.scale?.min_label : i === points ? q.scale?.max_label : '') || '';
    return h('ul', { class: 'ps-options' }, Array.from({ length: points }, (_, i) => h('li', null, `${ROUND} ${i + 1}${labelOf(i + 1) ? ` ${labelOf(i + 1)}` : ''}`)));
  }
  if (q.type === 'lunga') return h('div', { class: 'ps-box' });
  if (q.type === 'email') return [h('div', { class: 'ps-line' }), h('p', { class: 'ps-consent' }, `${SQUARE} Potete ricontattarmi per una breve chiacchierata`)];
  return h('div', { class: 'ps-line' });
}

function questionBlock(q, n) {
  return h(
    'section',
    { class: 'ps-question' },
    h('p', { class: 'ps-q' }, `${n}. ${q.label}`, q.required ? h('span', { class: 'ps-muted' }, ' (obbligatoria)') : null),
    h('p', { class: 'ps-kind' }, KIND[q.type]?.(q) || ''),
    q.help ? h('p', { class: 'ps-help' }, q.help) : null,
    answers(q),
  );
}

export function surveySheet(survey) {
  const data = survey.data || {};
  const questions = data.questions || [];
  const asked = questions.filter((q) => q.type !== 'sezione').length;
  let n = 0;
  const body = questions.map((q) => {
    if (q.type === 'sezione') return [h('h3', { class: 'ps-section' }, q.label), q.help ? h('p', { class: 'ps-help' }, q.help) : null];
    n += 1;
    return questionBlock(q, n);
  });
  const text = (title, value) => (value ? [h('h2', null, title), h('p', { class: 'ps-text' }, value)] : null);
  return h(
    'div',
    { id: 'print-root', class: 'print-root print-survey' },
    h('h1', null, survey.title),
    h('p', { class: 'muted' }, `Questionario · ${plural(asked, 'domanda', 'domande')} · ${minutesLabel(estimateMinutes(data))} · ${statusLabel('survey', survey.status)}`),
    text('Introduzione', data.intro),
    h('h2', null, 'Domande'),
    body,
    text('Messaggio finale', data.thanks),
    text('Messaggio per chi chiede di essere ricontattato', data.thanks_contact),
    text('Informativa sulla privacy', data.privacy),
  );
}

// Stesso meccanismo della stampa delle note: il foglio è l'unica cosa visibile in stampa, poi si toglie.
export function printSurvey(survey) {
  document.getElementById('print-root')?.remove();
  const root = surveySheet(survey);
  document.body.append(root);
  const previousTitle = document.title;
  document.title = `Questionario - ${survey.title}`;
  document.body.classList.add('print-note');
  window.addEventListener(
    'afterprint',
    () => {
      document.title = previousTitle;
      document.body.classList.remove('print-note');
      root.remove();
    },
    { once: true },
  );
  window.print();
}
