import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACCENT_PALETTE,
  LIMITS_ADVICE,
  accentCheck,
  conditionalWords,
  contrastRatio,
  fmtRatio,
  hasBrackets,
  questionWarnings,
  surveyWarnings,
} from '../../assets/js/survey-checks.js';
import { PRIVACY_TEMPLATE, convertQuestion, duplicateQuestion, newQuestion, presetLabels, surveyTemplate } from '../../assets/js/survey-template.js';
import { countWords, estimateMinutes } from '../../assets/js/public/survey-time.js';
import { SURVEY_ACCENT, sanitizeSnapshot } from '../../assets/js/schema.js';

const codes = (warnings) => warnings.map((w) => w.code);
const q = (label, over = {}) => ({ id: 'q-1', type: 'breve', label, required: false, role: 'problema', ...over });

test('conditional verbs are found by their endings, without flagging common words with the same letters', () => {
  assert.deepEqual(conditionalWords('Compreresti un\'app? La useresti? Quanto pagheresti?'), ['compreresti', 'useresti', 'pagheresti']);
  assert.deepEqual(conditionalWords('Ti piacerebbe? Lo faremmo? Lo usereste? Lo comprerebbero?'), ['piacerebbe', 'faremmo', 'usereste', 'comprerebbero']);
  assert.deepEqual(conditionalWords('Quanto saresti disposto a spendere? L\'useresti?'), ['saresti', 'useresti']);
  for (const text of ['Hai visitato foreste?', 'Cosa ti resti da fare?', 'Mi presti la penna?', 'Ci sono stati arresti?', 'Il problema crebbe', 'Le spese crebbero', 'Ambiente agreste', 'Quanto ti interessa?', 'L\'ultima volta che è successo']) {
    assert.deepEqual(conditionalWords(text), [], text);
  }
});

test('each phrasing problem gets a warning with a better form', () => {
  const conditional = questionWarnings(q('Compreresti un servizio che ti ricorda le scadenze?'));
  assert.ok(codes(conditional).includes('condizionale'));
  assert.match(conditional[0].text, /«compreresti»/);
  assert.match(conditional[0].hint, /L'ultima volta che\.\.\./);

  assert.ok(codes(questionWarnings(q('Quanto sei d’accordo con questa frase?'))).includes('accordo'));
  assert.ok(codes(questionWarnings(q('Non pensi che sia scomodo?'))).includes('suggerisce'));
  assert.ok(codes(questionWarnings(q('Non è vero che perdi tempo?'))).includes('suggerisce'));
  for (const label of ['Partecipa all\'estrazione', 'Vinci un premio', 'Ti diamo un buono sconto', 'Riceverai un buono da 10 euro', 'Uno sconto per te', 'Un regalo per chi risponde']) {
    assert.ok(codes(questionWarnings(q(label))).includes('incentivo'), label);
  }
  assert.ok(!codes(questionWarnings(q('Hai un buon motivo per farlo?'))).includes('incentivo'));
  assert.ok(codes(questionWarnings(q('Cosa pensi della nostra app?'))).includes('soluzione'));
  assert.ok(codes(questionWarnings(q('Useresti i nostri servizi?'))).includes('soluzione'));
  assert.ok(codes(questionWarnings(q('Se esistesse un servizio, lo proveresti?'))).includes('soluzione'));
  assert.ok(codes(questionWarnings(q('Cerchiamo solo infermieri: che turni fai?'))).includes('selezione'));
  assert.ok(codes(questionWarnings(q('Se sei un medico, quante visite fai?'))).includes('selezione'));
  assert.deepEqual(questionWarnings(q('L\'ultima volta che hai cercato un idraulico, come l\'hai trovato?')), []);
  assert.deepEqual(questionWarnings(q('Nelle ultime 4 settimane, quante volte ti è capitato?')), []);
});

test('questions without text, options or scale labels, and with brackets left, are flagged', () => {
  assert.deepEqual(codes(questionWarnings(q('  '))), ['vuota']);
  assert.ok(codes(questionWarnings(q('Che lavoro fai?', { type: 'scelta', options: [], allow_other: false }))).includes('opzioni'));
  assert.ok(!codes(questionWarnings(q('Che lavoro fai?', { type: 'scelta', options: [], allow_other: true }))).includes('opzioni'));
  assert.ok(codes(questionWarnings(q('Quanto spesso?', { type: 'scala', scale: { points: 5, min_label: 'Mai', max_label: 'Sempre' } }))).includes('etichette'));
  const agreeScale = q('Mi capita spesso', { type: 'scala', scale: { points: 5, labels: ['Per niente d\'accordo', 'Poco', 'Così così', 'Abbastanza', 'Del tutto d\'accordo'] } });
  assert.deepEqual(codes(questionWarnings(agreeScale)), ['accordo']);
  assert.deepEqual(codes(questionWarnings(q('Quale descrive la tua situazione?', { type: 'scelta', options: [{ id: 'a', label: '[Situazione 1]' }] }))), ['parentesi']);
  assert.ok(hasBrackets('Siamo [nomi]') && !hasBrackets('Siamo Anna e Bruno'));
  assert.deepEqual(questionWarnings(null), []);
});

test('the template follows the book: only the brackets to replace are left as warnings', () => {
  const data = surveyTemplate();
  const clean = sanitizeSnapshot('survey', { title: 'Q', idea_id: '11111111-1111-4111-8111-111111111111', data }).data;
  assert.equal(clean.questions.length, data.questions.length, 'ogni domanda del modello è valida');
  assert.match(clean.intro, /^Siamo \[nomi\], \[chi siete davvero.*\]\. Stiamo studiando come le persone \[affrontano il problema\]\. Non vendiamo nulla\./);
  const words = countWords(PRIVACY_TEMPLATE);
  assert.ok(words >= 130 && words <= 190, `privacy di circa 150 parole: ${words}`);
  for (const part of ['Chi raccoglie', 'Perché', 'Quali dati', 'Anonimato', 'Per quanto tempo', 'diritti', 'scrivendo a']) assert.match(PRIVACY_TEMPLATE, new RegExp(part));
  assert.ok(clean.thanks);
  const roles = clean.questions.map((x) => x.role);
  assert.equal(roles.filter((r) => r === 'persona').length, 2);
  assert.ok(roles.filter((r) => r === 'problema').length >= 3);
  assert.equal(clean.questions.filter((x) => x.type === 'lunga').length, 1);
  assert.deepEqual(clean.questions.filter((x) => x.type === 'email').map((x) => [x.role, x.required]), [['contatto', false]]);
  assert.ok(clean.questions.every((x) => x.required === false), 'nessuna domanda obbligatoria');
  assert.ok(clean.questions.some((x) => /^L'ultima volta/.test(x.label)));
  assert.ok(clean.questions.some((x) => /^Nelle ultime 4 settimane, quante volte/.test(x.label)));
  assert.ok(estimateMinutes(clean) <= LIMITS_ADVICE.minutes);
  assert.deepEqual(codes(surveyWarnings(clean)), ['parentesi']);
  assert.match(surveyWarnings(clean)[0].text, /introduzione, privacy, \d domande/);
  for (const question of clean.questions) assert.ok(codes(questionWarnings(question)).every((c) => c === 'parentesi' || c === 'etichette'), question.id);
});

test('survey warnings count roles, open and required questions, duration, intro, privacy and email', () => {
  const many = (n, over) => Array.from({ length: n }, (_, i) => q(`Domanda ${i}`, { id: `q-${over.role}-${i}`, ...over }));
  const data = {
    questions: [
      ...many(11, { role: 'problema', type: 'scelta', options: [{ id: 'a', label: 'Sì' }] }),
      ...many(4, { role: 'persona', type: 'numero' }),
      ...many(3, { role: 'altro', type: 'lunga', required: true, help: 'parola '.repeat(200) }),
    ],
  };
  const found = codes(surveyWarnings(data));
  for (const code of ['intro', 'privacy', 'troppe-problema', 'troppe-persona', 'troppe-aperte', 'obbligatorie', 'durata', 'email']) assert.ok(found.includes(code), code);
  assert.match(surveyWarnings(data).find((w) => w.code === 'durata').text, /circa \d+ minuti/);
  assert.deepEqual(codes(surveyWarnings({ questions: [] })), ['nessuna', 'intro', 'privacy']);
  const intro = surveyWarnings({ intro: 'Cerchiamo solo medici. Chi risponde partecipa all\'estrazione di un premio per provare la nostra app.', privacy: 'Ok', thanks: 'Ecco il tuo buono sconto', questions: [q('Email', { type: 'email', role: 'contatto' })] });
  assert.deepEqual(codes(intro), ['incentivo', 'soluzione', 'selezione', 'incentivo']);
  assert.match(intro[0].text, /^Introduzione: /);
  assert.deepEqual(LIMITS_ADVICE, { problem: 10, persona: 3, open: 2, minutes: 5, required: 2 });
});

test('contrast follows WCAG and warns when the accent would be hard to see', () => {
  assert.equal(contrastRatio('#ffffff', '#000000'), 21);
  assert.equal(contrastRatio('#777777', '#777777'), 1);
  assert.equal(fmtRatio(contrastRatio(SURVEY_ACCENT, '#ffffff')), '6,9:1');
  assert.equal(fmtRatio(4.49), '4,4:1', 'arrotondato per difetto: mai 4,5 se non ci arriva');
  for (const [color, name] of ACCENT_PALETTE) {
    const check = accentCheck(color, 'automatico');
    assert.ok(check.white >= 4.5, name);
    assert.equal(check.onAccent, '#ffffff', name);
    assert.deepEqual(check.problems, [], name);
  }
  assert.equal(ACCENT_PALETTE.length, 8);
  const yellow = accentCheck('#f5e663', 'chiaro');
  assert.equal(yellow.onAccent, '#000000');
  assert.deepEqual(yellow.problems.map((p) => p.code), ['sfondo-chiaro']);
  assert.match(yellow.problems[0].text, /1,2:1/);
  assert.deepEqual(accentCheck('#f5e663', 'scuro').problems, []);
  assert.deepEqual(accentCheck(SURVEY_ACCENT, 'scuro').problems.map((p) => p.code), ['sfondo-scuro']);
  // Il testo migliore tra bianco e nero arriva sempre almeno a 4,58:1: l'avviso sul testo scatta solo con colori fuori standard.
  for (let i = 0; i < 4096; i += 1) {
    const hex = `#${[i >> 8, (i >> 4) & 15, i & 15].map((n) => (n * 17).toString(16).padStart(2, '0')).join('')}`;
    assert.ok(!accentCheck(hex).problems.some((p) => p.code === 'testo'), hex);
  }
});

test('new, converted and duplicated questions stay valid for the schema', () => {
  for (const [type] of [['sezione'], ['scelta'], ['scelte'], ['scala'], ['numero'], ['breve'], ['lunga'], ['email']]) {
    const fresh = newQuestion(type);
    const clean = sanitizeSnapshot('survey', { data: { questions: [fresh] } }).data.questions;
    assert.equal(clean.length, 1, type);
    assert.equal(clean[0].type, type);
  }
  const choice = newQuestion('scelta');
  const scale = convertQuestion(choice, 'scala');
  assert.deepEqual(scale.scale.labels, presetLabels('frequenza', 5));
  assert.equal(scale.options, undefined);
  const back = convertQuestion({ ...choice, options: [{ id: 'x', label: 'Tenuta' }] }, 'scelte');
  assert.deepEqual(back.options, [{ id: 'x', label: 'Tenuta' }]);
  assert.equal(convertQuestion(choice, 'email').role, 'contatto');
  assert.equal(convertQuestion({ ...convertQuestion(choice, 'email') }, 'breve').role, 'altro');
  const copy = duplicateQuestion(choice);
  assert.notEqual(copy.id, choice.id);
  assert.notEqual(copy.options[0].id, choice.options[0].id);
  assert.equal(copy.label, choice.label);
  assert.equal(presetLabels('frequenza', 7).length, 7);
  assert.deepEqual(presetLabels('inesistente', 5), []);
});
