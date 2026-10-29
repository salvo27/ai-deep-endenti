// Modello di partenza di un questionario, secondo il manuale e la ricerca: introduzione con scopo e privacy,
// poche domande su chi risponde, domande sul problema al passato, un episodio concreto, email facoltativa, ringraziamento.
import { shortId } from './lib/format.js';

export const INTRO_TEMPLATE =
  'Siamo [nomi], [chi siete davvero, per esempio un gruppo di studenti del corso X]. Stiamo studiando come le persone [affrontano il problema]. Non vendiamo nulla. Le risposte sono anonime e alla fine, se vuoi, puoi lasciarci la tua email per una breve chiacchierata.';

export const PRIVACY_TEMPLATE = [
  'Chi raccoglie i dati: [nomi], [chi siete, per esempio studenti del corso X]. Per qualsiasi domanda scrivete a [email di contatto].',
  'Perché: capire come le persone [affrontano il problema] per il nostro progetto. Non vendiamo nulla e non usiamo le risposte per pubblicità.',
  'Quali dati: solo le risposte che scegli di dare. Non salviamo nome, indirizzo IP o posizione. L\'email è facoltativa e serve solo a ricontattarti, se lo chiedi.',
  'Anonimato: le risposte senza email sono anonime e i risultati si mostrano solo tutti insieme.',
  'Sul tuo dispositivo: il browser tiene le risposte in corso per 30 giorni, così puoi riprendere da dove eri, e dopo l\'invio solo la data, così non ti chiediamo di rispondere due volte. Niente cookie né strumenti di analisi.',
  'Per quanto tempo: teniamo le risposte fino a [data, per esempio la fine del progetto], poi le cancelliamo. L\'email la cancelliamo dopo il contatto o quando ce lo chiedi.',
  'I tuoi diritti: puoi chiedere di vedere, correggere o cancellare i tuoi dati scrivendo a [email di contatto], e puoi rivolgerti al Garante per la protezione dei dati personali.',
  'Rispondere è volontario e puoi fermarti quando vuoi.',
].join('\n');

// Per chi lascia l'email e chiede di essere ricontattato; la pagina aggiunge sotto l'indirizzo che ha scritto.
export const THANKS_CONTACT_TEMPLATE =
  'Grazie! Ti scriviamo nei prossimi giorni per fissare una chiacchierata di 20 minuti, quando ti è comodo. Se cambi idea, basta risponderci «no grazie».';

// Per tutti gli altri: grazie e una porta aperta, senza insistere.
export const THANKS_TEMPLATE =
  'Grazie per il tuo tempo! Le tue risposte ci aiutano a capire meglio il problema. Se più avanti ti va di raccontarci la tua esperienza, scrivici a [email di contatto].';

// Etichette per ogni punto: specifiche della domanda, mai «d'accordo / in disaccordo» (Saris e altri 2010).
export const SCALE_PRESETS = [
  ['frequenza', 'Frequenza', { 5: ['Mai', 'Raramente', 'A volte', 'Spesso', 'Sempre'], 7: ['Mai', 'Quasi mai', 'Raramente', 'A volte', 'Spesso', 'Quasi sempre', 'Sempre'] }],
  ['quantita', 'Quantità', { 5: ['Per niente', 'Poco', 'Abbastanza', 'Molto', 'Moltissimo'], 7: ['Per niente', 'Pochissimo', 'Poco', 'Abbastanza', 'Molto', 'Moltissimo', 'Estremamente'] }],
  ['facilita', 'Facilità', {
    5: ['Molto difficile', 'Difficile', 'Né facile né difficile', 'Facile', 'Molto facile'],
    7: ['Molto difficile', 'Difficile', 'Abbastanza difficile', 'Né facile né difficile', 'Abbastanza facile', 'Facile', 'Molto facile'],
  }],
  ['qualita', 'Qualità', { 5: ['Pessima', 'Scarsa', 'Sufficiente', 'Buona', 'Ottima'], 7: ['Pessima', 'Molto scarsa', 'Scarsa', 'Sufficiente', 'Buona', 'Molto buona', 'Ottima'] }],
  ['importanza', 'Importanza', {
    5: ['Per niente importante', 'Poco importante', 'Abbastanza importante', 'Molto importante', 'Fondamentale'],
    7: ['Per niente importante', 'Quasi per niente importante', 'Poco importante', 'Abbastanza importante', 'Importante', 'Molto importante', 'Fondamentale'],
  }],
];

export function presetLabels(key, points) {
  return [...(SCALE_PRESETS.find(([k]) => k === key)?.[2][points] || [])];
}

export function scaleFromLabels(labels) {
  return { points: labels.length, min_label: labels[0] || '', max_label: labels[labels.length - 1] || '', labels };
}

export const newRowId = (prefix) => `${prefix}-${shortId()}`;

const option = (label) => ({ id: newRowId('o'), label });

const DEFAULT_LABELS = { sezione: 'Nuova sezione', email: 'Se vuoi parlarne in una breve chiacchierata, lasciaci la tua email' };

export function newQuestion(type) {
  return convertQuestion({ id: newRowId('q'), type, label: DEFAULT_LABELS[type] || 'Nuova domanda', required: false, role: 'altro' }, type);
}

// Cambiando tipo si tiene quello che ha senso (testo, spiegazione, opzioni) e si scarta il resto.
export function convertQuestion(q, type) {
  const next = { id: q.id, type, label: q.label };
  if (q.help) next.help = q.help;
  if (type === 'sezione') return next;
  next.required = q.required === true;
  next.role = type === 'email' ? 'contatto' : q.role && q.role !== 'contatto' ? q.role : 'altro';
  if (type === 'scelta' || type === 'scelte') {
    next.options = q.options?.length ? q.options.map((o) => ({ ...o })) : [option('Prima opzione'), option('Seconda opzione')];
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

export function surveyTemplate() {
  return {
    intro: INTRO_TEMPLATE,
    privacy: PRIVACY_TEMPLATE,
    thanks: THANKS_TEMPLATE,
    thanks_contact: THANKS_CONTACT_TEMPLATE,
    layout: 'una',
    progress: 'contatore',
    show_time: true,
    questions: [
      {
        id: 'situazione',
        type: 'scelta',
        label: 'Quale di queste descrive meglio la tua situazione?',
        required: false,
        role: 'persona',
        options: [
          { id: 'a', label: '[Situazione 1, per esempio studente]' },
          { id: 'b', label: '[Situazione 2, per esempio lavoratore dipendente]' },
          { id: 'c', label: '[Situazione 3, per esempio libero professionista]' },
        ],
        allow_other: true,
        prefer_not: false,
      },
      {
        id: 'eta',
        type: 'scelta',
        label: 'Quanti anni hai?',
        required: false,
        role: 'persona',
        options: [
          { id: 'meno-25', label: 'Meno di 25' },
          { id: '25-34', label: 'Da 25 a 34' },
          { id: '35-44', label: 'Da 35 a 44' },
          { id: '45-54', label: 'Da 45 a 54' },
          { id: '55-piu', label: '55 o più' },
        ],
        allow_other: false,
        prefer_not: true,
      },
      {
        id: 'ultima-volta',
        type: 'scelta',
        label: 'L\'ultima volta che [ti è capitato il problema], quanto tempo fa è stato?',
        required: false,
        role: 'problema',
        options: [
          { id: 'settimana', label: 'Nell\'ultima settimana' },
          { id: 'mese', label: 'Nell\'ultimo mese' },
          { id: 'sei-mesi', label: 'Negli ultimi 6 mesi' },
          { id: 'prima', label: 'Più di 6 mesi fa' },
          { id: 'mai', label: 'Non mi è mai capitato' },
        ],
        allow_other: false,
        prefer_not: false,
      },
      {
        id: 'episodio',
        type: 'lunga',
        label: 'Raccontaci l\'ultima volta che [ti è capitato il problema]: cosa è successo e cosa hai fatto?',
        help: 'Bastano poche righe.',
        required: false,
        role: 'problema',
      },
      {
        id: 'quante-volte',
        type: 'numero',
        label: 'Nelle ultime 4 settimane, quante volte [ti è capitato il problema]?',
        help: 'Scrivi un numero, anche 0.',
        required: false,
        role: 'problema',
        number: { min: 0, max: 1000 },
      },
      {
        id: 'quanto-pesa',
        type: 'scala',
        label: 'L\'ultima volta, quanto tempo ti ha fatto perdere?',
        required: false,
        role: 'problema',
        scale: scaleFromLabels(presetLabels('quantita', 5)),
      },
      {
        id: 'email',
        type: 'email',
        label: 'Se vuoi parlarne in una chiacchierata di 15 minuti, lasciaci la tua email',
        help: 'Facoltativa. La usiamo solo per questo.',
        required: false,
        role: 'contatto',
      },
    ],
  };
}
