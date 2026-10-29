// Controlli mentre si scrive un questionario, dal manuale e dalla ricerca: solo avvisi con una forma migliore, mai blocchi.
import { estimateMinutes } from './public/survey-time.js';

export const LIMITS_ADVICE = Object.freeze({ problem: 10, persona: 3, open: 2, minutes: 5, required: 2 });
export const OPEN_TYPES = ['breve', 'lunga'];

const normalize = (text) => String(text || '').toLowerCase().replace(/[’`]/g, '\'');
const wordsOf = (text) => normalize(text).match(/[a-zàáèéìíòóùú]+/g) || [];

// Desinenze del condizionale (seconda e terza persona, plurali). Le parole comuni con le stesse lettere finali non contano.
const CONDITIONAL_ENDINGS = ['rebbero', 'rebbe', 'remmo', 'resti', 'reste'];
const NOT_CONDITIONAL = new Set([
  'arresti', 'presti', 'agresti', 'foreste', 'agreste', 'accrebbe', 'decrebbe', 'rincrebbe', 'increbbe',
  'crebbero', 'accrebbero', 'decrebbero', 'rincrebbero',
]);

export function conditionalWords(text) {
  return [...new Set(wordsOf(text).filter((word) =>
    !NOT_CONDITIONAL.has(word) && CONDITIONAL_ENDINGS.some((end) => word.endsWith(end) && word.length >= end.length + 2),
  ))];
}

const AGREE_RE = /\bd'?\s?accordo\b|\bdisaccordo\b/;
const LEADING_RE = /\bnon (pensi|credi|trovi|ritieni|pensate|credete|trovate) che\b|\bnon (è|e') (vero|forse)\b|\bnon ti (sembra|pare)\b|\bnon (sei|siete) d'accordo\b|\bsei d'accordo che\b/;
const INCENTIVE_RE = /\b(premio|premi in palio|regalo|regali|regaliamo|omaggio|omaggi|estrazione|estrazioni|estraiamo|sorteggio|sorteggiamo|ricompensa|sconto|sconti|coupon|gift card)\b|\bbuon[oi] (sconto|regalo|acquisto|amazon|spesa|pasto|carburante|da \d)|\b(un|dei) buon[oi](?= da |\s*$|[.,;:!?])/;
const SOLUTION_RE = /\bnostr[aoie] (app|applicazion[ei]|prodott[oi]|soluzion[ei]|piattaform[ae]|servizio|servizi|startup|software|sit[oi]|strument[oi]|dispositiv[oi]|idea|idee|tecnologi[ae]|innovazion[ei])\b|\bun'?\s?app che\b|\bse esistesse\b/;
const SCREENING_RE = /\bcerchiamo (solo|soltanto|persone che|chi)\b|\bse sei (un|una|uno)\b|\bse sei un'|\bsolo (per )?chi\b|\briservat[oa] a\b/;
const BRACKETS_RE = /\[[^\]\n]*\]/;

export const hasBrackets = (text) => BRACKETS_RE.test(String(text || ''));

const warning = (code, text, hint) => ({ code, text, hint });

function phraseWarnings(text, { questionText = true } = {}) {
  const t = normalize(text);
  const out = [];
  if (questionText) {
    const conditional = conditionalWords(t);
    if (conditional.length) {
      out.push(warning(
        'condizionale',
        `Verbo al condizionale («${conditional.join('», «')}»): chiede un'intenzione, e le intenzioni prevedono male quello che le persone fanno davvero.`,
        'Chiedi un fatto passato: «L\'ultima volta che...» o «Nelle ultime 4 settimane, quante volte...» invece di «Compreresti...».',
      ));
    }
    if (AGREE_RE.test(t)) {
      out.push(warning(
        'accordo',
        'Domanda «d\'accordo / in disaccordo»: porta a dire di sì e misura peggio di una domanda diretta.',
        'Chiedi la cosa che vuoi sapere: invece di «Quanto sei d\'accordo: mi capita spesso» chiedi «Quanto spesso ti capita?» con le etichette Mai, Raramente, A volte, Spesso, Sempre.',
      ));
    }
    if (LEADING_RE.test(t)) {
      out.push(warning('suggerisce', 'La domanda suggerisce la risposta.', 'Falla neutra: invece di «Non pensi che sia scomodo...?» chiedi «Com\'è andata l\'ultima volta che...?».'));
    }
  }
  if (INCENTIVE_RE.test(t)) {
    out.push(warning('incentivo', 'Si parla di premi, buoni o sconti: attirano persone interessate al premio e non al problema.', 'Togli l\'incentivo: il manuale lo sconsiglia. Spiega piuttosto perché le risposte vi servono.'));
  }
  if (SOLUTION_RE.test(t)) {
    out.push(warning('soluzione', 'Si parla della soluzione: chi risponde tende a dare ragione a chi ha fatto la domanda.', 'Chiedi del problema e di cosa fanno oggi: «Come lo hai risolto l\'ultima volta?».'));
  }
  if (SCREENING_RE.test(t)) {
    out.push(warning('selezione', 'Si capisce chi state cercando: qualcuno potrebbe rispondere per rientrarci.', 'Chiedi la situazione con una domanda a scelta che abbia anche opzioni che non vi interessano, senza dire quale cercate.'));
  }
  return out;
}

function questionText(q) {
  return [q.label, q.help, ...(q.options || []).map((o) => o.label)].join('\n');
}

export function questionWarnings(q) {
  if (!q) return [];
  const out = [];
  if (!String(q.label || '').trim()) {
    out.push(warning('vuota', 'La domanda non ha testo: non verrà salvata.', 'Scrivi la domanda o eliminala.'));
  }
  out.push(...phraseWarnings(questionText(q), { questionText: q.type !== 'sezione' }));
  if (q.type === 'scala') {
    const labels = q.scale?.labels || [];
    if (!out.some((w) => w.code === 'accordo') && [...labels, q.scale?.min_label, q.scale?.max_label].some((l) => AGREE_RE.test(normalize(l)))) {
      out.push(warning('accordo', 'Scala «d\'accordo / in disaccordo»: misura peggio di una scala specifica.', 'Usa etichette legate alla domanda, per esempio Mai, Raramente, A volte, Spesso, Sempre.'));
    }
    if (labels.length !== (q.scale?.points || 5) || labels.some((l) => !String(l || '').trim())) {
      out.push(warning('etichette', 'Non tutti i punti della scala hanno un\'etichetta.', 'Dai un nome a ogni punto: le scale con tutte le etichette sono più affidabili.'));
    }
  }
  if ((q.type === 'scelta' || q.type === 'scelte') && !(q.options || []).some((o) => String(o.label || '').trim()) && !q.allow_other) {
    out.push(warning('opzioni', 'La domanda non ha opzioni: chi risponde non la vedrà.', 'Aggiungi almeno un\'opzione.'));
  }
  if (hasBrackets(questionText(q))) {
    out.push(warning('parentesi', 'Ci sono ancora parti tra parentesi quadre.', 'Sostituiscile con il vostro testo.'));
  }
  return out;
}

export function countByRole(questions, role) {
  return questions.filter((q) => q.type !== 'sezione' && q.role === role).length;
}

export function surveyWarnings(data) {
  const questions = Array.isArray(data?.questions) ? data.questions : [];
  const asked = questions.filter((q) => q.type !== 'sezione');
  const out = [];
  if (!asked.length) out.push(warning('nessuna', 'Non ci sono domande.', 'Parti dal modello: poche domande su chi risponde, poi il problema al passato.'));
  if (!String(data?.intro || '').trim()) {
    out.push(warning('intro', 'Manca l\'introduzione.', 'Scrivi chi siete, cosa state studiando e che non vendete nulla.'));
  } else {
    out.push(...phraseWarnings(data.intro, { questionText: false }).map((w) => ({ ...w, text: `Introduzione: ${w.text}` })));
  }
  if (!String(data?.privacy || '').trim()) {
    out.push(warning('privacy', 'Manca l\'informativa sulla privacy.', 'Circa 150 parole: chi siete, perché raccogliete i dati, quali dati, anonimato, per quanto li tenete, diritti e un contatto.'));
  }
  if (INCENTIVE_RE.test(normalize(data?.thanks))) {
    out.push(warning('incentivo', 'Messaggio finale: si parla di premi, buoni o sconti.', 'Togli l\'incentivo: il manuale lo sconsiglia.'));
  }

  const where = [];
  if (hasBrackets(data?.intro)) where.push('introduzione');
  if (hasBrackets(data?.privacy)) where.push('privacy');
  if (hasBrackets(data?.thanks)) where.push('messaggio finale');
  const inQuestions = questions.filter((q) => hasBrackets(questionText(q))).length;
  if (inQuestions) where.push(inQuestions === 1 ? '1 domanda' : `${inQuestions} domande`);
  if (where.length) out.push(warning('parentesi', `Parti tra parentesi quadre ancora da sostituire: ${where.join(', ')}.`, 'Sostituisci le parti tra [ ] con il vostro testo prima di aprire il questionario.'));

  const problem = countByRole(questions, 'problema');
  if (problem > LIMITS_ADVICE.problem) {
    out.push(warning('troppe-problema', `${problem} domande sul problema: il manuale ne consiglia al massimo ${LIMITS_ADVICE.problem}.`, 'Tieni quelle che vi servono per decidere; il resto chiedetelo nelle interviste.'));
  }
  const persona = countByRole(questions, 'persona');
  if (persona > LIMITS_ADVICE.persona) {
    out.push(warning('troppe-persona', `${persona} domande su chi risponde: ne bastano ${LIMITS_ADVICE.persona} al massimo.`, 'Tieni solo quelle che dicono se la persona è nel vostro target.'));
  }
  const open = asked.filter((q) => OPEN_TYPES.includes(q.type)).length;
  if (open > LIMITS_ADVICE.open) {
    out.push(warning('troppe-aperte', `${open} domande aperte: oltre ${LIMITS_ADVICE.open} le risposte si accorciano e più persone abbandonano.`, 'Trasforma le altre in domande a scelta; tieni aperta quella che chiede un episodio concreto.'));
  }
  const required = asked.filter((q) => q.required).length;
  if (required > LIMITS_ADVICE.required) {
    out.push(warning('obbligatorie', `${required} domande obbligatorie: obbligare a rispondere fa abbandonare di più.`, 'Lasciale facoltative; al massimo una o due, per esempio quella che dice se la persona è nel target.'));
  }
  const minutes = estimateMinutes(data);
  if (minutes > LIMITS_ADVICE.minutes) {
    out.push(warning('durata', `Durata stimata di circa ${minutes} minuti: oltre ${LIMITS_ADVICE.minutes} le risposte diventano più frettolose e più persone abbandonano.`, 'Togli le domande che non userete per decidere.'));
  }
  if (asked.length && !asked.some((q) => q.type === 'email')) {
    out.push(warning('email', 'Manca la domanda per l\'email.', 'Il questionario serve soprattutto a trovare persone da intervistare: aggiungi l\'email facoltativa alla fine.'));
  }
  return out;
}

// Contrasto WCAG 2.1 tra due colori #rrggbb.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

export const LIGHT_BACKGROUND = '#ffffff';
export const DARK_BACKGROUND = '#141518';

// Colori con testo bianco sopra ad almeno 5:1.
export const ACCENT_PALETTE = [
  ['#3b4bc8', 'Indaco'],
  ['#1d6fb8', 'Blu'],
  ['#0f766e', 'Verde acqua'],
  ['#15803d', 'Verde'],
  ['#b45309', 'Ambra'],
  ['#c2372f', 'Rosso'],
  ['#be185d', 'Lampone'],
  ['#7c3aed', 'Viola'],
];

// Ogni colore della tavolozza ha la sua copia di q.html con l'anteprima del link in quel colore (scripts/anteprime.mjs).
const slugOf = (name) => name.toLowerCase().replace(/\s+/g, '-');
export const PREVIEW_PAGES = ACCENT_PALETTE.map(([color, name]) => ({
  color,
  name,
  page: `q-${slugOf(name)}.html`,
  image: `anteprima-${slugOf(name)}.png`,
}));

// Un colore fuori dalla tavolozza usa q.html, con l'anteprima del colore predefinito.
export const previewPage = (accent) => PREVIEW_PAGES.find((p) => p.color === String(accent || '').toLowerCase())?.page || 'q.html';

// Testo del pulsante: bianco o nero, quello che si legge meglio (almeno 4,5:1). Colore sullo sfondo: almeno 3:1 per bordi e barra.
export function accentCheck(accent, theme = 'automatico') {
  const white = contrastRatio(accent, '#ffffff');
  const black = contrastRatio(accent, '#000000');
  const onAccent = white >= black ? '#ffffff' : '#000000';
  const problems = [];
  if (Math.max(white, black) < 4.5) {
    problems.push({ code: 'testo', ratio: Math.max(white, black), text: 'Né il testo bianco né quello nero arrivano a 4,5:1 sul colore: il testo dei pulsanti si leggerebbe male.', hint: 'Scegli un colore più chiaro o più scuro.' });
  }
  const light = contrastRatio(accent, LIGHT_BACKGROUND);
  const dark = contrastRatio(accent, DARK_BACKGROUND);
  // La pagina pubblica adatta da sola il colore a ogni tema (accentTokens): qui si avvisa solo che sarà diverso.
  if (theme !== 'scuro' && theme !== 'contrasto' && light < 3) {
    problems.push({ code: 'sfondo-chiaro', ratio: light, text: `Sullo sfondo chiaro il colore si vede poco (${fmtRatio(light)}): la pagina lo scurisce da sola quanto basta, quindi chi risponde vedrà un colore più scuro.`, hint: 'Per avere proprio questo colore scegline uno più scuro.' });
  }
  if (theme === 'scuro' && dark < 3) {
    problems.push({ code: 'sfondo-scuro', ratio: dark, text: `Sullo sfondo scuro il colore si vede poco (${fmtRatio(dark)}): la pagina lo schiarisce da sola quanto basta, quindi chi risponde vedrà un colore più chiaro.`, hint: 'Per avere proprio questo colore scegline uno più chiaro.' });
  }
  return { white, black, onAccent, light, dark, problems };
}

export const fmtRatio = (ratio) => `${(Math.floor(ratio * 10) / 10).toFixed(1).replace('.', ',')}:1`;
