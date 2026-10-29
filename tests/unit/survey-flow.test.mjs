import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import {
  DEFAULT_ACCENT,
  LIMITS,
  MESSAGES,
  OTHER,
  accentTokens,
  buildMeta,
  buildScreens,
  collectAnswers,
  contrastRatio,
  contrastText,
  durationText,
  firstInvalidScreen,
  normalizeSurvey,
  numberHint,
  parseInteger,
  progressFor,
  readStored,
  sentKey,
  tabKey,
  unanswered,
  screenOf,
  selectedChoices,
  toggleChoice,
  tokenFromHash,
  tooLong,
  validateQuestion,
  validateScreen,
} from '../../assets/js/public/survey-flow.js';

const ROOT = new URL('../../', import.meta.url);
const SESSION = '0b6f3c2e-8d1a-4c5b-9e7f-1a2b3c4d5e6f';

const raw = {
  status: 'aperto',
  title: 'Questionario di prova',
  intro: 'Introduzione.',
  privacy: 'Informativa.',
  thanks: '',
  layout: 'una',
  progress: 'contatore',
  show_time: true,
  median_seconds: null,
  appearance: { theme: 'automatico', accent: '#3B4BC8' },
  questions: [
    { id: 'uno', type: 'sezione', label: 'Prima parte', help: '' },
    { id: 'eta', type: 'scelta', label: 'Età?', required: true, options: [{ id: 'giovane', label: 'Meno di 30' }, { id: 'adulto', label: '30 o più' }], allow_other: false, prefer_not: true },
    { id: 'dove', type: 'scelte', label: 'Dove?', options: [{ id: 'casa', label: 'Casa' }, { id: 'ufficio', label: 'Ufficio' }], allow_other: true, prefer_not: true },
    { id: 'due', type: 'sezione', label: 'Seconda parte', help: '' },
    { id: 'voto', type: 'scala', label: 'Quanto?', scale: { points: 5, min_label: 'Poco', max_label: 'Molto' } },
    { id: 'volte', type: 'numero', label: 'Quante volte?', number: { min: 0, max: 30 } },
    { id: 'nome', type: 'breve', label: 'Nome della cosa?' },
    { id: 'storia', type: 'lunga', label: 'Racconta.' },
    { id: 'mail', type: 'email', label: 'Email' },
  ],
};

const survey = normalizeSurvey(raw);
const byId = (id) => survey.questions.find((q) => q.id === id);

test('the token comes only from a well formed hash of 22 characters', () => {
  assert.equal(tokenFromHash('#Qx7pL2mN9vR4tY6wZ1bC3d'), 'Qx7pL2mN9vR4tY6wZ1bC3d');
  assert.equal(tokenFromHash('Qx7pL2mN9vR4tY6wZ1b_-d'), 'Qx7pL2mN9vR4tY6wZ1b_-d');
  for (const hash of ['', '#', '#corto', '#Qx7pL2mN9vR4tY6wZ1bC3d!', '#Qx7pL2mN9vR4tY6wZ1bC3dX', '#%E0%A4%A', '#<script>alert(1)</script>', null, undefined]) {
    assert.equal(tokenFromHash(hash), null, String(hash));
  }
});

test('the survey payload is normalized: defaults for unknown settings, malformed questions and options dropped', () => {
  assert.equal(survey.layout, 'una');
  assert.deepEqual(survey.appearance, { theme: 'automatico', accent: '#3b4bc8', onAccent: '#ffffff' });
  const odd = normalizeSurvey({
    title: '  ',
    layout: 'griglia',
    progress: 'conto alla rovescia',
    show_time: 'no',
    median_seconds: -4,
    appearance: { theme: 'viola', accent: 'red; background: url(x)' },
    questions: [
      null,
      { id: 'Maiuscole', type: 'breve', label: 'Id non valido' },
      { id: 'tipo', type: 'griglia', label: 'Tipo sconosciuto' },
      { id: 'vuota', type: 'breve', label: '   ' },
      { id: 'nessuna', type: 'scelta', label: 'Senza opzioni', options: [], allow_other: false },
      { id: 'solo-altro', type: 'scelta', label: 'Solo Altro', options: [], allow_other: true },
      {
        id: 'opzioni',
        type: 'scelte',
        label: 'Opzioni',
        required: 'true',
        options: [{ id: 'non-rispondo', label: 'Riservato' }, { id: 'ok', label: ' Buona ' }, { id: 'ok', label: 'Doppia' }, { id: 'a:b', label: 'Due punti' }, { id: 'senza', label: '' }],
      },
      { id: 'opzioni', type: 'breve', label: 'Id ripetuto' },
      { id: 'scala', type: 'scala', label: 'Scala', scale: { points: 6, labels: ['a', 'b'] } },
      { id: 'scala-7', type: 'scala', label: 'Scala a 7', scale: { points: 7, labels: ['1', '2', '3', '4', '5', '6', ''] } },
      { id: 'numero', type: 'numero', label: 'Numero', number: { min: 10, max: 2, extra: 1 } },
      { id: 'sez', type: 'sezione', label: 'Sezione', required: true },
    ],
  });
  assert.equal(odd.title, 'Questionario');
  assert.equal(odd.layout, 'una');
  assert.equal(odd.progress, 'contatore');
  assert.equal(odd.show_time, true);
  assert.equal(odd.median_seconds, null);
  assert.deepEqual(odd.appearance, { theme: 'automatico', accent: DEFAULT_ACCENT, onAccent: '#ffffff' });
  assert.deepEqual(odd.questions.map((q) => q.id), ['solo-altro', 'opzioni', 'scala', 'scala-7', 'numero', 'sez']);
  const options = odd.questions[1];
  assert.deepEqual(options.options, [{ id: 'ok', label: 'Buona' }]);
  assert.equal(options.required, false, 'solo true vale come obbligatoria');
  assert.deepEqual(odd.questions[2].scale, { points: 5, min_label: '', max_label: '', labels: null });
  assert.equal(odd.questions[3].scale.labels.length, 7);
  assert.deepEqual(odd.questions[4].number, { min: 2, max: 10 });
  assert.equal(odd.questions[5].required, false, 'una sezione non è mai obbligatoria');
  assert.deepEqual(normalizeSurvey(null).questions, []);
});

test('layout «una»: one screen per question, a section is only the heading of the questions after it', () => {
  const screens = buildScreens(survey);
  assert.equal(screens.length, 7);
  assert.deepEqual(screens.map((s) => s.questions.map((q) => q.id)), [['eta'], ['dove'], ['voto'], ['volte'], ['nome'], ['storia'], ['mail']]);
  assert.deepEqual(screens.map((s) => s.section?.id), ['uno', 'uno', 'due', 'due', 'due', 'due', 'due']);
});

test('layout «sezioni»: one screen per section, questions before the first section get their own, empty sections vanish', () => {
  const questions = [
    { id: 'intro', type: 'breve', label: 'Prima di tutto' },
    { id: 'a', type: 'sezione', label: 'A' },
    { id: 'b', type: 'sezione', label: 'B vuota' },
    ...raw.questions.filter((q) => q.type !== 'sezione'),
    { id: 'c', type: 'sezione', label: 'C in fondo' },
  ];
  const screens = buildScreens(normalizeSurvey({ ...raw, layout: 'sezioni', questions }));
  assert.equal(screens.length, 2);
  assert.equal(screens[0].section, null);
  assert.deepEqual(screens[0].questions.map((q) => q.id), ['intro']);
  assert.equal(screens[1].section.id, 'b');
  assert.equal(screens[1].questions.length, 7);
  const sections = buildScreens(normalizeSurvey({ ...raw, layout: 'sezioni' }));
  assert.deepEqual(sections.map((s) => [s.section.label, s.questions.length]), [['Prima parte', 2], ['Seconda parte', 5]]);
});

test('progress counts only answerable questions, linearly', () => {
  const one = buildScreens(survey);
  assert.deepEqual(progressFor(one, 0), { first: 1, last: 1, total: 7, ratio: 1 / 7, text: 'Domanda 1 di 7' });
  assert.equal(progressFor(one, 6).text, 'Domanda 7 di 7');
  assert.equal(progressFor(one, 6).ratio, 1);
  const sections = buildScreens(normalizeSurvey({ ...raw, layout: 'sezioni' }));
  assert.equal(progressFor(sections, 0).text, 'Domande 1-2 di 7');
  assert.equal(progressFor(sections, 1).text, 'Domande 3-7 di 7');
  assert.equal(progressFor(sections, 0).ratio, 2 / 7);
});

test('questions are optional unless required, and a required one asks politely for an answer', () => {
  for (const q of survey.questions.filter((x) => x.type !== 'sezione' && x.type !== 'scelta')) assert.equal(validateQuestion(q, {}), null, q.id);
  const eta = byId('eta');
  assert.equal(validateQuestion(eta, {}), MESSAGES.required);
  assert.equal(validateQuestion(eta, { eta: 'inventata' }), MESSAGES.required);
  assert.equal(validateQuestion(eta, { eta: 'adulto' }), null);
  assert.equal(validateQuestion(eta, { eta: 'non-rispondo' }), null, 'preferisco non rispondere è una risposta');
  const required = (q) => ({ ...byId(q), required: true });
  assert.equal(validateQuestion(required('dove'), { dove: [] }), MESSAGES.required);
  assert.equal(validateQuestion(required('dove'), { dove: [OTHER] }), MESSAGES.other);
  assert.equal(validateQuestion(required('dove'), { dove: [OTHER], 'dove:altro': ' In treno ' }), null);
  assert.equal(validateQuestion(required('voto'), { voto: 6 }), MESSAGES.required);
  assert.equal(validateQuestion(required('voto'), { voto: 5 }), null);
  assert.equal(validateQuestion(required('volte'), { volte: '  ' }), MESSAGES.required);
  assert.equal(validateQuestion(required('nome'), { nome: '\u0007 ' }), MESSAGES.required, 'caratteri di controllo e spazi non contano');
  assert.equal(validateQuestion(required('mail'), {}), MESSAGES.required);
  const other = { id: 'tipo', type: 'scelta', label: 'Tipo', required: true, options: [{ id: 'a', label: 'A' }], allow_other: true, prefer_not: false };
  assert.equal(validateQuestion(other, { tipo: OTHER }), MESSAGES.other);
  assert.equal(validateQuestion(other, { tipo: OTHER, 'tipo:altro': 'B' }), null);
});

test('client limits mirror the database: text lengths in characters, integers in range, email format and recontact', () => {
  const short = byId('nome');
  assert.equal(validateQuestion(short, { nome: 'é'.repeat(LIMITS.short) }), null);
  assert.equal(validateQuestion(short, { nome: 'x'.repeat(LIMITS.short + 1) }), tooLong(300));
  assert.equal(validateQuestion(short, { nome: '😀'.repeat(LIMITS.short) }), null, 'un emoji conta un carattere come nel database');
  assert.equal(validateQuestion(byId('storia'), { storia: 'x'.repeat(3001) }), tooLong(3000));
  assert.equal(validateQuestion(byId('dove'), { dove: [OTHER], 'dove:altro': 'x'.repeat(301) }), tooLong(300));
  const volte = byId('volte');
  assert.equal(validateQuestion(volte, { volte: '12' }), null);
  assert.equal(validateQuestion(volte, { volte: '1.000' }), MESSAGES.integer);
  assert.equal(validateQuestion(volte, { volte: '2,5' }), MESSAGES.integer);
  assert.equal(validateQuestion(volte, { volte: '31' }), 'Scrivi un numero da 0 a 30.');
  assert.equal(validateQuestion(volte, { volte: '-1' }), 'Scrivi un numero da 0 a 30.');
  assert.deepEqual(parseInteger('+7'), { value: 7 });
  assert.deepEqual(parseInteger('-0'), { value: 0 });
  assert.deepEqual(parseInteger('99999999999'), { error: MESSAGES.huge });
  assert.deepEqual(parseInteger('5', { min: 10, max: null }), { error: 'Scrivi un numero uguale o maggiore di 10.' });
  assert.deepEqual(parseInteger('50', { min: null, max: 10 }), { error: 'Scrivi un numero uguale o minore di 10.' });
  assert.equal(parseInteger(''), null);
  assert.equal(numberHint({ min: 0, max: 30 }), 'Un numero intero da 0 a 30.');
  assert.equal(numberHint({ min: 1, max: null }), 'Un numero intero, almeno 1.');
  assert.equal(numberHint({ min: null, max: 9 }), 'Un numero intero, al massimo 9.');
  assert.equal(numberHint({ min: null, max: null }), 'Un numero intero.');
  const mail = byId('mail');
  assert.equal(validateQuestion(mail, { mail: 'persona@esempio.it' }), null);
  for (const bad of ['persona', 'persona@esempio', 'per sona@esempio.it', `${'x'.repeat(250)}@esempio.it`]) assert.equal(validateQuestion(mail, { mail: bad }), MESSAGES.email, bad);
  assert.equal(validateQuestion(mail, {}, { recontact: true }), MESSAGES.recontact);
  assert.equal(validateQuestion(mail, { mail: 'persona@esempio.it' }, { recontact: true }), null);
});

test('screens are validated together, and the final check finds the first screen with a problem', () => {
  const screens = buildScreens(normalizeSurvey({ ...raw, layout: 'sezioni' }));
  assert.deepEqual(validateScreen(screens[0], {}), [{ id: 'eta', message: MESSAGES.required }]);
  assert.deepEqual(validateScreen(screens[1], { volte: 'tante', mail: 'no' }).map((e) => e.id), ['volte', 'mail']);
  assert.deepEqual(firstInvalidScreen(screens, { eta: 'adulto', volte: 'tante' }), { index: 1, errors: [{ id: 'volte', message: MESSAGES.integer }] });
  assert.equal(firstInvalidScreen(screens, { eta: 'adulto' }), null);
  assert.equal(screenOf(screens, 'mail'), 1);
  assert.equal(screenOf(screens, 'sconosciuta'), -1);
});

test('answers are collected in the submit_survey format, only valid values and only known questions', () => {
  const draft = {
    eta: 'adulto',
    dove: ['ufficio', OTHER, 'casa', 'ufficio', 7],
    'dove:altro': '  In treno\u0001 ',
    voto: 4,
    volte: ' 12 ',
    nome: ' Agenda ',
    storia: 'Riga 1\nRiga 2',
    mail: ' Persona@Esempio.it ',
    sconosciuta: 'x',
    'eta:altro': 'non previsto',
  };
  assert.deepEqual(collectAnswers(survey.questions, draft), {
    eta: 'adulto',
    dove: ['casa', 'ufficio'],
    'dove:altro': 'In treno',
    voto: 4,
    volte: 12,
    nome: 'Agenda',
    storia: 'Riga 1\nRiga 2',
    mail: 'Persona@Esempio.it',
  });
  const invalid = { eta: 'inventata', dove: 'casa', voto: 9, volte: '1.5', nome: 'x'.repeat(301), storia: '   ', mail: 'no' };
  assert.deepEqual(collectAnswers(survey.questions, invalid), {});
  assert.deepEqual(collectAnswers(survey.questions, { dove: ['casa', 'non-rispondo', OTHER], 'dove:altro': 'Altro' }), { dove: ['non-rispondo'] }, 'preferisco non rispondere esclude il resto, anche Altro');
  const other = { id: 'tipo', type: 'scelta', label: 'Tipo', required: false, options: [{ id: 'a', label: 'A' }], allow_other: true, prefer_not: false };
  assert.deepEqual(collectAnswers([other], { tipo: OTHER, 'tipo:altro': 'B' }), { 'tipo:altro': 'B' }, 'Altro sostituisce la scelta');
  assert.deepEqual(collectAnswers([other], { tipo: 'a', 'tipo:altro': 'B' }), { tipo: 'a' });
  assert.deepEqual(collectAnswers([other], { tipo: OTHER, 'tipo:altro': '  ' }), {});
  assert.deepEqual(collectAnswers([byId('eta')], { eta: OTHER }), {}, 'Altro solo dove previsto');
});

test('choosing «Preferisco non rispondere» clears the other choices and any other choice clears it', () => {
  const dove = byId('dove');
  assert.deepEqual(toggleChoice(['casa', OTHER], 'non-rispondo', true), ['non-rispondo']);
  assert.deepEqual(toggleChoice(['non-rispondo'], 'casa', true), ['casa']);
  assert.deepEqual(toggleChoice(['casa', 'ufficio'], 'casa', false), ['ufficio']);
  assert.deepEqual(toggleChoice('rotto', 'casa', true), ['casa']);
  assert.deepEqual(selectedChoices(dove, [OTHER, 'ufficio', 'casa', 'inventata']), ['casa', 'ufficio', OTHER]);
  assert.deepEqual(selectedChoices({ ...dove, prefer_not: false, allow_other: false }, ['non-rispondo', OTHER, 'casa']), ['casa']);
});

test('text on the accent colour is black or white, whichever contrasts more', () => {
  assert.equal(contrastText('#3b4bc8'), '#ffffff');
  assert.equal(contrastText('#ffcc00'), '#000000');
  assert.equal(contrastText('#ffffff'), '#000000');
  assert.equal(contrastText('#000000'), '#ffffff');
  assert.equal(contrastText('#777777'), '#000000');
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
  for (const color of ['#18794e', '#c2372f', '#7d8cff', '#0f766e', '#f3b453', '#1b1f2a', '#e6e9fb']) {
    const chosen = contrastText(color);
    const other = chosen === '#ffffff' ? '#000000' : '#ffffff';
    assert.ok(contrastRatio(color, chosen) >= contrastRatio(color, other), color);
    assert.ok(contrastRatio(color, chosen) >= 4.5, `${color}: almeno 4,5:1`);
  }
});

test('meta carries the session and the trap field; recontact only with an email, duration and device only at the end', () => {
  const answers = collectAnswers(survey.questions, { eta: 'adulto' });
  const base = { session: SESSION, startedAt: 1_000, now: 95_400, width: 1280, recontact: true, website: '' };
  assert.deepEqual(buildMeta(survey, answers, base), { session: SESSION, final: false, website: '' });
  const withEmail = { ...answers, mail: 'persona@esempio.it' };
  assert.deepEqual(buildMeta(survey, withEmail, base), { session: SESSION, final: false, website: '', recontact: true });
  assert.deepEqual(buildMeta(survey, withEmail, { ...base, final: true, recontact: false, width: 720, website: 'spam' }), {
    session: SESSION,
    final: true,
    website: 'spam',
    recontact: false,
    duration_seconds: 94,
    device: 'telefono',
  });
  assert.equal(buildMeta(survey, answers, { ...base, final: true, width: 721 }).device, 'computer');
  assert.equal(buildMeta(survey, answers, { ...base, final: true, startedAt: null }).duration_seconds, 0);
});

test('a stored session resumes only when well formed, with the screen kept within the survey', () => {
  const stored = JSON.stringify({ session: SESSION, index: 3, draft: { eta: 'adulto' }, recontact: true, startedAt: 5 });
  assert.deepEqual(readStored(stored, 7), { session: SESSION, index: 3, draft: { eta: 'adulto' }, recontact: true, startedAt: 5 });
  assert.equal(readStored(stored, 2).index, 1);
  assert.deepEqual(readStored(JSON.stringify({ session: SESSION, index: -2, draft: [1], startedAt: 'ieri' }), 7), { session: SESSION, index: 0, draft: {}, recontact: false, startedAt: null });
  for (const bad of [null, '', '{', '[]', JSON.stringify({ session: 'non-un-uuid' }), JSON.stringify({ session: '0b6f3c2e-8d1a-1c5b-9e7f-1a2b3c4d5e6f' })]) {
    assert.equal(readStored(bad, 7), null, String(bad));
  }
  assert.equal(readStored(stored, 0), null);
  const day = 86_400_000;
  const dated = (savedAt) => JSON.stringify({ session: SESSION, index: 1, draft: {}, savedAt });
  assert.ok(readStored(dated(1000), 7, 1000 + 29 * day), 'entro 30 giorni si riprende');
  assert.equal(readStored(dated(1000), 7, 1000 + 31 * day), null, 'dopo 30 giorni si ricomincia');
  assert.equal(sentKey('Qx7pL2mN9vR4tY6wZ1bC3d'), 'questionario:Qx7pL2mN9vR4tY6wZ1bC3d:inviato');
  assert.equal(tabKey('Qx7pL2mN9vR4tY6wZ1bC3d'), 'questionario:Qx7pL2mN9vR4tY6wZ1bC3d:scheda');
});

test('q.html is a separate page with a strict policy that loads only the public survey modules', () => {
  const html = readFileSync(new URL('q.html', ROOT), 'utf8');
  assert.match(html, /<html lang="it">/);
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1"/);
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.match(html, /name="referrer" content="no-referrer"/);
  const csp = html.match(/Content-Security-Policy"\s+content="([^"]+)"/)[1];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self' https:\/\/cdn\.jsdelivr\.net;/);
  assert.match(csp, /style-src 'self';/);
  assert.match(csp, /img-src 'self' https:\/\/ixhnqeabctkpflwkdarj\.supabase\.co;/, 'immagini solo dal sito e dallo spazio file del progetto');
  assert.match(csp, /connect-src https:\/\/ixhnqeabctkpflwkdarj\.supabase\.co;/);
  assert.match(csp, /form-action 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*|wss:/);
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(scripts, ['<script type="module" src="assets/js/public/survey-page.js">']);
  assert.doesNotMatch(html, /<style|style="/);
  assert.deepEqual([...html.matchAll(/rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]), ['assets/css/survey.css']);
  for (const [, file] of html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)) assert.ok(existsSync(new URL(file, ROOT)), file);
});

test('the browser test page runs under the same policy as q.html, plus only the hash of its import map', () => {
  const policy = (file) => readFileSync(new URL(file, ROOT), 'utf8').match(/Content-Security-Policy"\s+content="([^"]+)"/)[1];
  const preview = readFileSync(new URL('tests/e2e/q-preview.html', ROOT), 'utf8');
  const map = preview.match(/<script type="importmap">([^]*?)<\/script>/)[1];
  const hash = `'sha256-${createHash('sha256').update(map).digest('base64')}'`;
  const expected = policy('q.html').replace("script-src 'self' https://cdn.jsdelivr.net;", `script-src 'self' https://cdn.jsdelivr.net ${hash};`);
  assert.equal(policy('tests/e2e/q-preview.html'), expected);
});

test('the public page never imports the app, the store, the router or anything that needs a login', () => {
  const importsOf = (file) =>
    [...readFileSync(new URL(`assets/js/public/${file}`, ROOT), 'utf8').matchAll(/(?:import|export)\s[^'"]*?from\s*'([^']+)'|import\s*'([^']+)'/g)].map((m) => m[1] || m[2]);
  assert.deepEqual(importsOf('survey-page.js'), ['./survey-api.js', './survey-time.js', './survey-flow.js']);
  assert.deepEqual(importsOf('survey-flow.js'), ['./survey-api.js', './survey-time.js', './survey-colors.js']);
  assert.deepEqual(importsOf('survey-time.js'), []);
  assert.deepEqual(importsOf('survey-colors.js'), []);
});

test('the accent adapts to every theme only as much as needed to stay readable', () => {
  const backgrounds = { l: ['#f4f3ef', '#ffffff', '#faf9f6'], s: ['#ede3cf', '#f8f1e3', '#f3ead8'], d: ['#141518', '#1c1d21', '#222328'] };
  for (const accent of ['#3b4bc8', '#1d6fb8', '#0f766e', '#15803d', '#b45309', '#c2372f', '#be185d', '#7c3aed', '#ffcc00', '#f5e663', '#111111', '#ffffff']) {
    const tokens = accentTokens(accent);
    for (const [key, list] of Object.entries(backgrounds)) {
      const ui = tokens[`--ui-${key}`];
      for (const bg of list) assert.ok(contrastRatio(ui, bg) >= 3, `${accent} ${key}: ${ui} su ${bg}`);
      assert.ok(contrastRatio(tokens[`--on-${key}`], ui) >= 4.5, `${accent} ${key}: testo sul colore`);
      assert.ok(contrastRatio(tokens[`--text-${key}`], list[1]) >= 4.5, `${accent} ${key}: testo colorato`);
      assert.ok(contrastRatio(tokens[`--text-${key}`], tokens[`--tint-${key}`]) >= 4.5, `${accent} ${key}: testo sulla tinta`);
    }
    assert.ok(contrastRatio(tokens['--ui-h'], '#ffffff') >= 7, `${accent}: contrasto elevato`);
  }
  const indaco = accentTokens('#3b4bc8');
  assert.equal(indaco['--ui-l'], '#3b4bc8', 'sul chiaro resta com\'è');
  assert.notEqual(indaco['--ui-d'], '#3b4bc8', 'sul tema scuro si schiarisce');
  assert.equal(accentTokens('#ffcc00')['--ui-d'], '#ffcc00');
  assert.equal(accentTokens('#ffcc00')['--on-d'], '#000000');
  assert.equal(indaco['--ui-h'], '#000000', 'sotto 7:1 sul bianco diventa nero');
});

test('unanswered lists the questions without a valid answer, counting «Altro» and «Preferisco non rispondere» as answers', () => {
  const ids = (draft) => unanswered(survey.questions, draft).map((q) => q.id);
  const all = survey.questions.filter((q) => q.type !== 'sezione').map((q) => q.id);
  assert.deepEqual(ids({}), all);
  assert.deepEqual(ids({ eta: 'adulto', dove: [OTHER], 'dove:altro': 'Al parco', voto: 3 }), ['volte', 'nome', 'storia', 'mail']);
  assert.ok(!ids({ eta: 'non-rispondo' }).includes('eta'), '«Preferisco non rispondere» è una risposta');
  assert.ok(ids({ eta: 'non-esiste' }).includes('eta'), 'una risposta non valida non conta');
});

test('the cover image path comes only from the survey images space, with a short description', () => {
  const path = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg';
  assert.deepEqual(normalizeSurvey({ ...raw, cover: { path, alt: ' Il gruppo ' } }).cover, { path, alt: 'Il gruppo' });
  assert.equal(normalizeSurvey({ ...raw, cover: { path: 'https://altro.example/x.jpg', alt: 'x' } }).cover, null);
  assert.equal(normalizeSurvey({ ...raw, cover: { path: `${path}#x` } }).cover, null);
  assert.equal(normalizeSurvey(raw).cover, null);
});
