// Modello di partenza di un questionario, secondo il manuale e la ricerca: introduzione con scopo e privacy,
// poche domande su chi risponde, domande sul problema al passato, un episodio concreto, email facoltativa, ringraziamento.
// The template is created in the language in use; ids, types and roles are stored values and stay the same in every language.
import { shortId } from './lib/format.js';
import { tx } from './i18n/index.js';

const t = tx.surveys.template;

const SECTION = 'sezione'; // i18n-ignore: stored question type
const PERSONA = 'persona'; // i18n-ignore: stored question role
const ONE_PER_SCREEN = 'una'; // i18n-ignore: stored layout
const AGE_IDS = ['meno-25', '25-34', '35-44', '45-54', '55-piu'];
const LAST_TIME_IDS = ['settimana', 'mese', 'sei-mesi', 'prima', 'mai']; // i18n-ignore: stored option ids
const SITUATION_IDS = ['a', 'b', 'c'];

export const INTRO_TEMPLATE = t.intro;

export const PRIVACY_TEMPLATE = t.privacy.join('\n');

// Per chi lascia l'email e chiede di essere ricontattato; la pagina aggiunge sotto l'indirizzo che ha scritto.
export const THANKS_CONTACT_TEMPLATE = t.thanksContact;

// Per tutti gli altri: grazie e una porta aperta, senza insistere.
export const THANKS_TEMPLATE = t.thanks;

// Etichette per ogni punto: specifiche della domanda, mai «d'accordo / in disaccordo» (Saris e altri 2010).
// [key, name, { 5: labels, 7: labels }]: the key is what the editor stores, the same in every language.
export const SCALE_PRESETS = Object.entries(tx.surveys.scales).map(([key, { name, five, seven }]) => [key, name, { 5: five, 7: seven }]);

export function presetLabels(key, points) {
  return [...(SCALE_PRESETS.find(([k]) => k === key)?.[2][points] || [])];
}

export function scaleFromLabels(labels) {
  return { points: labels.length, min_label: labels[0] || '', max_label: labels[labels.length - 1] || '', labels };
}

export const newRowId = (prefix) => `${prefix}-${shortId()}`;

const option = (label) => ({ id: newRowId('o'), label });

const DEFAULT_LABELS = { [SECTION]: t.newSection, email: t.newEmail };

export function newQuestion(type) {
  return convertQuestion({ id: newRowId('q'), type, label: DEFAULT_LABELS[type] || t.newQuestion, required: false, role: 'altro' }, type);
}

// Cambiando tipo si tiene quello che ha senso (testo, spiegazione, opzioni) e si scarta il resto.
export function convertQuestion(q, type) {
  const next = { id: q.id, type, label: q.label };
  if (q.help) next.help = q.help;
  if (type === SECTION) return next;
  next.required = q.required === true;
  next.role = type === 'email' ? 'contatto' : q.role && q.role !== 'contatto' ? q.role : 'altro';
  if (type === 'scelta' || type === 'scelte') {
    next.options = q.options?.length ? q.options.map((o) => ({ ...o })) : [option(t.firstOption), option(t.secondOption)];
    next.allow_other = q.allow_other === true;
    if (q.other_label) next.other_label = q.other_label;
    if (q.other_placeholder) next.other_placeholder = q.other_placeholder;
    next.prefer_not = q.prefer_not === true;
  }
  if (type === 'scala') next.scale = q.scale ? structuredClone(q.scale) : scaleFromLabels(presetLabels('frequenza', 5));
  if (type === 'numero') next.number = q.number ? { ...q.number } : { min: 0 };
  return next;
}

export function duplicateQuestion(q) {
  const copy = structuredClone(q);
  copy.id = newRowId('q');
  if (copy.options) copy.options = copy.options.map((o) => ({ ...o, id: newRowId('o') }));
  return copy;
}

const options = (ids, labels) => ids.map((id, i) => ({ id, label: labels[i] }));

export function surveyTemplate() {
  return {
    intro: INTRO_TEMPLATE,
    privacy: PRIVACY_TEMPLATE,
    thanks: THANKS_TEMPLATE,
    thanks_contact: THANKS_CONTACT_TEMPLATE,
    layout: ONE_PER_SCREEN,
    progress: 'contatore',
    show_time: true,
    questions: [
      {
        id: 'situazione',
        type: 'scelta',
        label: t.situation.label,
        required: false,
        role: PERSONA,
        options: options(SITUATION_IDS, t.situation.options),
        allow_other: true,
        prefer_not: false,
      },
      {
        id: 'eta',
        type: 'scelta',
        label: t.age.label,
        required: false,
        role: PERSONA,
        options: options(AGE_IDS, t.age.options),
        allow_other: false,
        prefer_not: true,
      },
      {
        id: 'ultima-volta', // i18n-ignore: stored question id
        type: 'scelta',
        label: t.lastTime.label,
        required: false,
        role: 'problema',
        options: options(LAST_TIME_IDS, t.lastTime.options),
        allow_other: false,
        prefer_not: false,
      },
      {
        id: 'episodio',
        type: 'lunga',
        label: t.episode.label,
        help: t.episode.help,
        required: false,
        role: 'problema',
      },
      {
        id: 'quante-volte',
        type: 'numero',
        label: t.howOften.label,
        help: t.howOften.help,
        required: false,
        role: 'problema',
        number: { min: 0, max: 1000 },
      },
      {
        id: 'quanto-pesa',
        type: 'scala',
        label: t.timeLost.label,
        required: false,
        role: 'problema',
        scale: scaleFromLabels(presetLabels('quantita', 5)),
      },
      {
        id: 'email',
        type: 'email',
        label: t.email.label,
        help: t.email.help,
        required: false,
        role: 'contatto',
      },
    ],
  };
}
