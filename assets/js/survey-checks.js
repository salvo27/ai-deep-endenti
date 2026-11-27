// Controlli mentre si scrive un questionario, dal manuale e dalla ricerca: solo avvisi con una forma migliore, mai blocchi.
// A survey can be written in Italian or in English whatever the language of the site, so every text goes through both
// sets of patterns; the warnings are written in the language in use.
import { estimateMinutes } from './public/survey-time.js';
import { locale, tx } from './i18n/index.js';

const c = tx.surveys.checks;

export const LIMITS_ADVICE = Object.freeze({ problem: 10, persona: 3, open: 2, minutes: 5, required: 2 });
export const OPEN_TYPES = ['breve', 'lunga'];

const SECTION = 'sezione'; // i18n-ignore: stored question type
const PERSONA = 'persona'; // i18n-ignore: stored question role

// Inside the regexes of this file the backtick and the apostrophe are written as escapes (u0060 and x27): the check for
// Italian left in the code (tests/unit/i18n-coverage.test.mjs) reads every quote as the start of a string.
const normalize = (text) => String(text || '').toLowerCase().replace(/[’\u0060]/g, '\'');
const wordsOf = (text) => normalize(text).match(/[a-zàáèéìíòóùú]+/g) || [];

// Desinenze del condizionale (seconda e terza persona, plurali). Le parole comuni con le stesse lettere finali non contano.
const CONDITIONAL_ENDINGS = ['rebbero', 'rebbe', 'remmo', 'resti', 'reste'];
const NOT_CONDITIONAL = new Set([
  'arresti', 'presti', 'agresti', 'foreste', 'agreste', 'accrebbe', 'decrebbe', 'rincrebbe', 'increbbe',
  'crebbero', 'accrebbero', 'decrebbero', 'rincrebbero',
]);
// English asks about intentions with "would" and its short forms, and with "how likely" or "willing to".
const HYPOTHETICAL_EN = /\b(?:would(?:n\x27t)?|(?:i|you|we|they|he|she|people)\x27d|how likely|willing to)\b/g;

export function conditionalWords(text) {
  const italian = wordsOf(text).filter((word) =>
    !NOT_CONDITIONAL.has(word) && CONDITIONAL_ENDINGS.some((end) => word.endsWith(end) && word.length >= end.length + 2),
  );
  const english = [...normalize(text).matchAll(HYPOTHETICAL_EN)].map((m) => m[0]);
  return [...new Set([...italian, ...english])];
}

const AGREE_RE = /\bd\x27?\s?accordo\b|\bdisaccordo\b/;
const LEADING_RE = /\bnon (pensi|credi|trovi|ritieni|pensate|credete|trovate) che\b|\bnon (è|e\x27) (vero|forse)\b|\bnon ti (sembra|pare)\b|\bnon (sei|siete) d\x27accordo\b|\bsei d\x27accordo che\b/;
const INCENTIVE_RE = /\b(premio|premi in palio|regalo|regali|regaliamo|omaggio|omaggi|estrazione|estrazioni|estraiamo|sorteggio|sorteggiamo|ricompensa|sconto|sconti|coupon|gift card)\b|\bbuon[oi] (sconto|regalo|acquisto|amazon|spesa|pasto|carburante|da \d)|\b(un|dei) buon[oi](?= da |\s*$|[.,;:!?])/;
const SOLUTION_RE = /\bnostr[aoie] (app|applicazion[ei]|prodott[oi]|soluzion[ei]|piattaform[ae]|servizio|servizi|startup|software|sit[oi]|strument[oi]|dispositiv[oi]|idea|idee|tecnologi[ae]|innovazion[ei])\b|\bun\x27?\s?app che\b|\bse esistesse\b/;
const SCREENING_RE = /\bcerchiamo (solo|soltanto|persone che|chi)\b|\bse sei (un|una|uno)\b|\bse sei un\x27|\bsolo (per )?chi\b|\briservat[oa] a\b/;

// The same mistakes written in English.
const AGREE_EN = /\b(?:dis)?agree[sd]?\b/;
const LEADING_EN = /\b(?:don\x27t|do not|wouldn\x27t|would not) you (?:think|agree|say|find|feel)\b|\b(?:isn\x27t|wasn\x27t) it\b|\bis it not\b|\bdo you agree that\b|\bwouldn\x27t it be\b/;
const INCENTIVE_EN = /\b(?:prizes?|prize draws?|gifts?|gift cards?|gift vouchers?|vouchers?|coupons?|discounts?|rewards?|raffles?|sweepstakes?|giveaways?|chance to win)\b/;
const SOLUTION_EN = /\bour (?:apps?|applications?|products?|solutions?|platforms?|services?|startup|software|websites?|sites?|tools?|devices?|ideas?|technology|technologies|innovations?)\b|\ban app that\b|\bif there (?:were|was)\b|\bimagine (?:an?|our) (?:app|product|service|tool|device|platform)\b/;
const SCREENING_EN = /\bwe(?:\x27re| are) (?:only |just )?looking for\b|\bif you(?:\x27re| are) (?:a|an)\b|\bonly (?:for |open to )?(?:people|those|users|customers) (?:who|that)\b|\breserved for\b|\bopen only to\b/;

const BRACKETS_RE = /\[[^\]\n]*\]/;

const isAgree = (t) => AGREE_RE.test(t) || AGREE_EN.test(t);
const isLeading = (t) => LEADING_RE.test(t) || LEADING_EN.test(t);
const isIncentive = (t) => INCENTIVE_RE.test(t) || INCENTIVE_EN.test(t);
const isSolution = (t) => SOLUTION_RE.test(t) || SOLUTION_EN.test(t);
const isScreening = (t) => SCREENING_RE.test(t) || SCREENING_EN.test(t);

export const hasBrackets = (text) => BRACKETS_RE.test(String(text || ''));

const warning = (code, text, hint) => ({ code, text, hint });

function phraseWarnings(text, { questionText = true } = {}) {
  const t = normalize(text);
  const out = [];
  if (questionText) {
    const conditional = conditionalWords(t);
    if (conditional.length) out.push(warning('condizionale', c.conditional.text(conditional), c.conditional.hint));
    if (isAgree(t)) out.push(warning('accordo', c.agree.text, c.agree.hint));
    if (isLeading(t)) out.push(warning('suggerisce', c.leading.text, c.leading.hint));
  }
  if (isIncentive(t)) out.push(warning('incentivo', c.incentive.text, c.incentive.hint));
  if (isSolution(t)) out.push(warning('soluzione', c.solution.text, c.solution.hint));
  if (isScreening(t)) out.push(warning('selezione', c.screening.text, c.screening.hint));
  return out;
}

function questionText(q) {
  return [q.label, q.help, ...(q.options || []).map((o) => o.label)].join('\n');
}

export function questionWarnings(q) {
  if (!q) return [];
  const out = [];
  if (!String(q.label || '').trim()) out.push(warning('vuota', c.empty.text, c.empty.hint));
  out.push(...phraseWarnings(questionText(q), { questionText: q.type !== SECTION }));
  if (q.type === 'scala') {
    const labels = q.scale?.labels || [];
    if (!out.some((w) => w.code === 'accordo') && [...labels, q.scale?.min_label, q.scale?.max_label].some((l) => isAgree(normalize(l)))) {
      out.push(warning('accordo', c.agreeScale.text, c.agreeScale.hint));
    }
    if (labels.length !== (q.scale?.points || 5) || labels.some((l) => !String(l || '').trim())) {
      out.push(warning('etichette', c.labels.text, c.labels.hint));
    }
  }
  if ((q.type === 'scelta' || q.type === 'scelte') && !(q.options || []).some((o) => String(o.label || '').trim()) && !q.allow_other) {
    out.push(warning('opzioni', c.options.text, c.options.hint));
  }
  if (hasBrackets(questionText(q))) out.push(warning('parentesi', c.brackets.text, c.brackets.hint));
  return out;
}

export function countByRole(questions, role) {
  return questions.filter((q) => q.type !== SECTION && q.role === role).length;
}

export function surveyWarnings(data) {
  const questions = Array.isArray(data?.questions) ? data.questions : [];
  const asked = questions.filter((q) => q.type !== SECTION);
  const out = [];
  if (!asked.length) out.push(warning('nessuna', c.noQuestions.text, c.noQuestions.hint)); // i18n-ignore: warning code
  if (!String(data?.intro || '').trim()) {
    out.push(warning('intro', c.noIntro.text, c.noIntro.hint));
  } else {
    out.push(...phraseWarnings(data.intro, { questionText: false }).map((w) => ({ ...w, text: c.inIntro(w.text) })));
  }
  if (!String(data?.privacy || '').trim()) out.push(warning('privacy', c.noPrivacy.text, c.noPrivacy.hint));
  if (isIncentive(normalize(data?.thanks))) out.push(warning('incentivo', c.thanksIncentive.text, c.thanksIncentive.hint));

  const where = [];
  if (hasBrackets(data?.intro)) where.push(c.places.intro);
  if (hasBrackets(data?.privacy)) where.push(c.places.privacy);
  if (hasBrackets(data?.thanks)) where.push(c.places.thanks);
  if (hasBrackets(data?.thanks_contact)) where.push(c.places.thanksContact);
  const inQuestions = questions.filter((q) => hasBrackets(questionText(q))).length;
  if (inQuestions) where.push(c.places.questions(inQuestions));
  if (where.length) out.push(warning('parentesi', c.bracketsLeft.text(where), c.bracketsLeft.hint));

  const problem = countByRole(questions, 'problema');
  if (problem > LIMITS_ADVICE.problem) {
    out.push(warning('troppe-problema', c.tooManyProblem.text(problem, LIMITS_ADVICE.problem), c.tooManyProblem.hint));
  }
  const persona = countByRole(questions, PERSONA);
  if (persona > LIMITS_ADVICE.persona) {
    out.push(warning('troppe-persona', c.tooManyPersona.text(persona, LIMITS_ADVICE.persona), c.tooManyPersona.hint)); // i18n-ignore: warning code
  }
  const open = asked.filter((q) => OPEN_TYPES.includes(q.type)).length;
  if (open > LIMITS_ADVICE.open) {
    out.push(warning('troppe-aperte', c.tooManyOpen.text(open, LIMITS_ADVICE.open), c.tooManyOpen.hint));
  }
  const required = asked.filter((q) => q.required).length;
  if (required > LIMITS_ADVICE.required) {
    out.push(warning('obbligatorie', c.tooManyRequired.text(required), c.tooManyRequired.hint));
  }
  const minutes = estimateMinutes(data);
  if (minutes > LIMITS_ADVICE.minutes) {
    out.push(warning('durata', c.tooLong.text(minutes, LIMITS_ADVICE.minutes), c.tooLong.hint));
  }
  if (asked.length && !asked.some((q) => q.type === 'email')) out.push(warning('email', c.noEmail.text, c.noEmail.hint));
  return out;
}

// Contrasto WCAG 2.1 tra due colori #rrggbb.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

export const LIGHT_BACKGROUND = '#ffffff';
export const DARK_BACKGROUND = '#141518';

// Colori con testo bianco sopra ad almeno 5:1: [colore, chiave del nome, pagina di anteprima].
// Ogni colore della tavolozza ha la sua copia di q.html con l'anteprima del link in quel colore (scripts/anteprime.mjs):
// the page names are published files, so they stay the same in every language.
const PALETTE = [
  ['#3b4bc8', 'indigo', 'indaco'],
  ['#1d6fb8', 'blue', 'blu'],
  ['#0f766e', 'teal', 'verde-acqua'],
  ['#15803d', 'green', 'verde'],
  ['#b45309', 'amber', 'ambra'],
  ['#c2372f', 'red', 'rosso'],
  ['#be185d', 'raspberry', 'lampone'],
  ['#7c3aed', 'violet', 'viola'],
];

export const ACCENT_PALETTE = PALETTE.map(([color, key]) => [color, tx.surveys.colours[key]]);

export const PREVIEW_PAGES = PALETTE.map(([color, key, slug]) => ({
  color,
  name: tx.surveys.colours[key],
  page: `q-${slug}.html`,
  image: `anteprima-${slug}.png`,
}));

// Un colore fuori dalla tavolozza usa q.html, con l'anteprima del colore predefinito.
export const previewPage = (accent) => PREVIEW_PAGES.find((p) => p.color === String(accent || '').toLowerCase())?.page || 'q.html';

// Testo del pulsante: bianco o nero, quello che si legge meglio (almeno 4,5:1). Colore sullo sfondo: almeno 3:1 per bordi e barra.
export function accentCheck(accent, theme = 'automatico') {
  const white = contrastRatio(accent, '#ffffff');
  const black = contrastRatio(accent, '#000000');
  const onAccent = white >= black ? '#ffffff' : '#000000';
  const problems = [];
  const words = tx.surveys.contrast;
  if (Math.max(white, black) < 4.5) {
    problems.push({ code: 'testo', ratio: Math.max(white, black), text: words.text.text, hint: words.text.hint });
  }
  const light = contrastRatio(accent, LIGHT_BACKGROUND);
  const dark = contrastRatio(accent, DARK_BACKGROUND);
  // La pagina pubblica adatta da sola il colore a ogni tema (accentTokens): qui si avvisa solo che sarà diverso.
  if (theme !== 'scuro' && theme !== 'contrasto' && light < 3) {
    problems.push({ code: 'sfondo-chiaro', ratio: light, text: words.light.text(fmtRatio(light)), hint: words.light.hint });
  }
  if (theme === 'scuro' && dark < 3) {
    problems.push({ code: 'sfondo-scuro', ratio: dark, text: words.dark.text(fmtRatio(dark)), hint: words.dark.hint });
  }
  return { white, black, onAccent, light, dark, problems };
}

// Rounded down, so it never shows 4.5 for a colour that does not reach it.
const ratioFormat = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtRatio = (ratio) => `${ratioFormat.format(Math.floor(ratio * 10) / 10)}:1`;
