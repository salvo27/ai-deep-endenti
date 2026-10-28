import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FLAG_LABELS,
  QUALITY,
  answerText,
  contactCandidates,
  displayedWords,
  durationStats,
  flagCounts,
  fmtDuration,
  fmtShare,
  funnelSteps,
  hasAnswer,
  median,
  numberResponses,
  personaAnswer,
  qualityFlags,
  questionStats,
  responsesCsv,
  withoutFlagged,
} from '../../assets/js/survey-stats.js';

// Questionario e risposte di fantasia.
const survey = {
  intro: 'Due righe di introduzione.',
  questions: [
    { id: 'sez', type: 'sezione', label: 'Su di te' },
    { id: 'ruolo', type: 'scelta', label: 'Che lavoro fai?', role: 'persona', options: [{ id: 'a', label: 'Infermiere' }, { id: 'b', label: 'Medico' }], allow_other: true, prefer_not: true },
    { id: 'canali', type: 'scelte', label: 'Dove cerchi?', role: 'problema', options: [{ id: 'web', label: 'Web' }, { id: 'amici', label: 'Amici' }], allow_other: false, prefer_not: false },
    { id: 'f1', type: 'scala', label: 'Quanto spesso?', role: 'problema', scale: { points: 5, labels: ['Mai', 'Raramente', 'A volte', 'Spesso', 'Sempre'] } },
    { id: 'f2', type: 'scala', label: 'Quanto pesa?', role: 'problema', scale: { points: 5, labels: ['Per niente', 'Poco', 'Abbastanza', 'Molto', 'Moltissimo'] } },
    { id: 'f3', type: 'scala', label: 'Quanto costa?', role: 'problema', scale: { points: 5, labels: ['Niente', 'Poco', 'Il giusto', 'Tanto', 'Troppo'] } },
    { id: 'volte', type: 'numero', label: 'Quante volte?', role: 'problema' },
    { id: 'storia', type: 'lunga', label: 'Raccontaci l\'ultima volta', role: 'problema' },
    { id: 'mail', type: 'email', label: 'Email', role: 'contatto' },
  ],
};

const response = (id, over) => ({ id, survey_id: 's', session: `sess-${id}`, answers: {}, email: null, recontact: false, duration_seconds: 200, device: 'telefono', completed: true, created_at: `2026-10-2${id}T10:00:00Z`, ...over });

function sample() {
  return numberResponses([
    response(3, { answers: { ruolo: 'b', canali: ['web'], f1: 2, f2: 3, f3: 4, volte: 0, storia: 'Ho chiamato tre negozi prima di trovarlo.' }, duration_seconds: 300, device: 'computer' }),
    response(1, { answers: { ruolo: 'a', canali: ['web', 'amici'], f1: 4, f2: 4, f3: 4, volte: 5, storia: 'Ho perso una mattina intera al telefono.' }, email: 'Uno@Esempio.it', recontact: true }),
    response(2, { answers: { 'ruolo:altro': 'Tecnico di radiologia', canali: ['amici'], f1: 5, f2: 1, volte: 12, storia: 'Ok' }, email: 'due@esempio.it', duration_seconds: 100 }),
    response(4, { answers: { ruolo: 'non-rispondo', canali: ['web'] }, completed: false, duration_seconds: null, device: null }),
    response(5, { answers: { ruolo: 'a' }, completed: false, duration_seconds: 20 }),
  ]);
}

test('responses are numbered by arrival and answers are read as text', () => {
  const rows = sample();
  assert.deepEqual(rows.map((r) => [r.id, r.n]), [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]);
  const [ruolo, canali, f1] = survey.questions.slice(1);
  assert.equal(answerText(ruolo, rows[1]), 'Altro: Tecnico di radiologia');
  assert.equal(answerText(ruolo, rows[3]), 'Preferisco non rispondere');
  assert.equal(answerText(canali, rows[0]), 'Web; Amici');
  assert.equal(answerText(f1, rows[0]), 4);
  assert.equal(answerText(f1, rows[0], { scaleWithLabel: true }), '4 (Spesso)');
  assert.equal(answerText(survey.questions[8], rows[0]), 'Uno@Esempio.it');
  assert.equal(answerText(f1, rows[4]), null);
  assert.ok(hasAnswer(survey.questions[6], rows[2]), 'zero è una risposta');
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test('per question: answers with their base, nonresponse, breakoff and the right summary for each type', () => {
  const stats = questionStats(survey, sample());
  const byId = Object.fromEntries(stats.map((s) => [s.question.id, s]));
  assert.equal(stats.length, 8, 'le sezioni non hanno risposte');

  assert.deepEqual([byId.ruolo.reached, byId.ruolo.answered, byId.ruolo.skipped, byId.ruolo.breakoff], [5, 5, 0, 1]);
  assert.deepEqual(byId.ruolo.options.map((o) => o.count), [2, 1]);
  assert.deepEqual(byId.ruolo.other, [{ n: 2, text: 'Tecnico di radiologia' }]);
  assert.equal(byId.ruolo.preferNot, 1);

  assert.deepEqual([byId.canali.reached, byId.canali.answered, byId.canali.breakoff], [4, 4, 1], 'chi si è fermato alla prima domanda non conta nella base della seconda');
  assert.deepEqual(byId.canali.options.map((o) => o.count), [3, 2]);
  assert.equal(byId.canali.multiple, true);

  assert.deepEqual(byId.f1.distribution.map((d) => [d.value, d.label, d.count]), [[1, 'Mai', 0], [2, 'Raramente', 1], [3, 'A volte', 0], [4, 'Spesso', 1], [5, 'Sempre', 1]]);
  assert.equal(byId.f1.median, 4);
  assert.deepEqual([byId.f3.reached, byId.f3.answered, byId.f3.skipped], [3, 2, 1]);

  assert.deepEqual([byId.volte.median, byId.volte.min, byId.volte.max], [5, 0, 12]);
  assert.deepEqual(byId.storia.texts.map((t) => t.n), [1, 2, 3]);
  assert.deepEqual([byId.mail.answered, byId.mail.recontact], [2, 1]);
});

test('completion time is the median of complete responses, overall and by device', () => {
  const stats = durationStats(sample());
  assert.equal(stats.median, 200);
  assert.equal(stats.n, 3);
  assert.deepEqual(stats.byDevice, [{ device: 'telefono', median: 150, n: 2 }, { device: 'computer', median: 300, n: 1 }]);
  assert.deepEqual(durationStats([]).byDevice, []);
  assert.equal(fmtDuration(200), '3 min 20 s');
  assert.equal(fmtDuration(45), '45 s');
  assert.equal(fmtDuration(120), '2 min');
  assert.equal(fmtDuration(null), '-');
});

test('straight-lining, short open answers and many skips are flagged only on complete responses', () => {
  const flags = qualityFlags(survey, sample());
  assert.deepEqual(flags.get(1), ['uguali'], 'tre scale da 5 punti con la stessa risposta');
  assert.deepEqual(flags.get(2), ['aperta'], 'una risposta aperta di una parola');
  assert.equal(flags.has(3), false);
  assert.equal(flags.has(4) || flags.has(5), false, 'le compilazioni interrotte non si segnalano');

  const skipper = numberResponses([response(1, { answers: { ruolo: 'a', storia: 'Una storia lunga abbastanza da contare' } })]);
  assert.deepEqual(qualityFlags(survey, skipper).get(1), ['saltate']);
  const twoScales = numberResponses([response(1, { answers: { ruolo: 'a', canali: ['web'], f1: 3, f2: 3, volte: 1, storia: 'Tre parole bastano' } })]);
  assert.equal(qualityFlags(survey, twoScales).has(1), false, 'due scale uguali non bastano');
  const mixed = { questions: [...survey.questions.slice(0, 5), { id: 'f7', type: 'scala', label: 'Sette', scale: { points: 7 } }] };
  const mixedRows = numberResponses([response(1, { answers: { ruolo: 'a', canali: ['web'], f1: 3, f2: 3, f7: 3 } })]);
  assert.equal(qualityFlags(mixed, mixedRows).has(1), false, 'solo scale con gli stessi punti');
});

test('speeders: speed index above 2 from 20 complete responses, and the reading floor of 0.3 seconds per word', () => {
  const plain = { questions: [{ id: 'x', type: 'numero', label: 'Quante volte' }] };
  const make = (count, fast) =>
    numberResponses([
      ...Array.from({ length: count }, (_, i) => response(`a${String(i).padStart(2, '0')}`, { answers: { x: 1 }, duration_seconds: 120, created_at: `2026-10-01T10:${String(i).padStart(2, '0')}:00Z` })),
      response('z', { answers: { x: 1 }, duration_seconds: fast, created_at: '2026-10-02T10:00:00Z' }),
    ]);
  assert.equal(qualityFlags(plain, make(18, 40)).size, 0, 'con 19 compilazioni complete non si confronta');
  assert.deepEqual([...qualityFlags(plain, make(19, 40))], [[20, ['veloce']]]);
  assert.equal(qualityFlags(plain, make(19, 61)).size, 0, 'indice 1,97: sotto la soglia');
  assert.equal(QUALITY.speedIndex, 2);

  const words = displayedWords(survey);
  assert.equal(words, 4 + 3 + (3 + 2) + (2 + 2) + (2 + 6) + (2 + 6) + (2 + 6) + 2 + 3 + 1, 'introduzione, sezione, domande con opzioni ed etichette');
  const floor = QUALITY.secondsPerWord * words;
  const quick = numberResponses([response(1, { answers: { ruolo: 'a', canali: ['web'], f1: 1, f2: 2, f3: 3, volte: 1, storia: 'Una storia vera e lunga' }, duration_seconds: Math.floor(floor) - 1 })]);
  assert.deepEqual(qualityFlags(survey, quick).get(1), ['lettura']);
});

test('excluding flagged responses and counting flags', () => {
  const rows = sample();
  const flags = qualityFlags(survey, rows);
  assert.deepEqual(withoutFlagged(rows, flags).map((r) => r.n), [3, 4, 5]);
  assert.deepEqual(flagCounts(flags), { veloce: 0, lettura: 0, uguali: 1, aperta: 1, saltate: 0 });
  assert.equal(Object.keys(FLAG_LABELS).length, 5);
  const after = questionStats(survey, withoutFlagged(rows, flags));
  assert.equal(after.find((s) => s.question.id === 'ruolo').reached, 3);
});

test('the funnel goes from visits to complete responses, with completion over starts', () => {
  const funnel = funnelSteps({ views: 40, starts: 12, partial: 3, completed: 8 });
  assert.deepEqual(funnel.steps.map((s) => [s.label, s.count]), [['Link aperto', 40], ['Iniziati', 12], ['Interrotti a metà', 3], ['Completati', 8]]);
  assert.equal(fmtShare(funnel.completionRate), '67%');
  assert.equal(funnelSteps({ views: 0, starts: 0, partial: 1, completed: 2 }).starts, 3, 'gli inizi non sono mai meno delle risposte');
  assert.equal(funnelSteps(null).completionRate, null);
  assert.equal(fmtShare(null), '-');
});

test('people to contact: one per email, only with consent, skipping those already among the contacts', () => {
  const rows = numberResponses([
    response(1, { answers: { ruolo: 'non-rispondo' }, email: 'uno@esempio.it', recontact: true }),
    response(2, { answers: { ruolo: 'b' }, email: 'UNO@esempio.it ', recontact: true }),
    response(3, { answers: { 'ruolo:altro': 'Tecnico' }, email: 'tre@esempio.it', recontact: true }),
    response(4, { answers: { ruolo: 'a' }, email: 'quattro@esempio.it', recontact: false }),
    response(5, { answers: { ruolo: 'b' }, email: 'cinque@esempio.it', recontact: true }),
  ]);
  const contacts = [{ data: { contact: 'Cinque@esempio.it, 333 000 0000' } }, { data: {} }];
  const { fresh, already } = contactCandidates(survey, rows, contacts);
  assert.deepEqual(fresh.map((c) => [c.n, c.email, c.persona]), [[1, 'uno@esempio.it', null], [3, 'tre@esempio.it', 'Tecnico']]);
  assert.deepEqual(already.map((c) => c.email), ['cinque@esempio.it']);
  assert.equal(personaAnswer(survey, rows[1]), 'Medico');
});

test('the CSV has one row per response, readable headers, no internal ids and safe cells', () => {
  const rows = sample();
  rows[0].answers.storia = '=HYPERLINK("http://esempio.it")';
  rows[2].answers.storia = 'Prima riga; seconda "citata"\nterza';
  const flags = qualityFlags(survey, rows);
  const csv = responsesCsv(survey, rows, { flags });
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'Risposta;Data;Stato;Durata (secondi);Dispositivo;Che lavoro fai?;Dove cerchi?;Quanto spesso?;Quanto pesa?;Quanto costa?;Quante volte?;Raccontaci l\'ultima volta;Segnalazioni');
  assert.match(lines[1], /^1;2026-10-2\d \d\d:\d\d;completata;200;Telefono;Infermiere;"Web; Amici";4;4;4;5;/);
  assert.match(csv, /;"'=HYPERLINK\(""http:\/\/esempio\.it""\)";/, 'niente formule');
  assert.match(csv, /"Prima riga; seconda ""citata""\nterza"/);
  assert.match(csv, /Stessa risposta a tutte le scale/);
  assert.doesNotMatch(csv, /sess-|esempio\.it;|@/, 'né sessioni né email');
  assert.match(lines[4], /^4;[^;]*;interrotta;;;Preferisco non rispondere;Web;/);

  const withEmail = responsesCsv(survey, rows, { includeEmail: true });
  assert.match(withEmail.split('\r\n')[0], /;Email;Da ricontattare;Segnalazioni$/);
  assert.match(withEmail, /;Uno@Esempio\.it;sì;/);
  assert.match(withEmail, /;due@esempio\.it;no;/);

  const twins = responsesCsv({ questions: [{ id: 'a', type: 'breve', label: 'Perché?' }, { id: 'b', type: 'breve', label: 'Perché?' }] }, [], { separator: ',' });
  assert.equal(twins, 'Risposta,Data,Stato,Durata (secondi),Dispositivo,Perché?,Perché? (2),Segnalazioni');
});
