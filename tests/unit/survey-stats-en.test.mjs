// Survey results on an English device: readable answers, quality flags, funnel and CSV in English, while the
// values that come from the database (device keys, option ids, flag codes) stay as they are.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { italianWords } from '../setup/italian.mjs';

useLanguage('en');
const stats = await import('../../assets/js/survey-stats.js');
const { DEVICE_LABELS, FLAG_LABELS, answerText, contactCandidates, funnelSteps, numberResponses, personaAnswer, qualityFlags, responsesCsv } = stats;

// A survey and answers written in English, so any Italian left is the site's.
const survey = {
  intro: 'Two lines of introduction.',
  questions: [
    { id: 'sez', type: 'sezione', label: 'About you' },
    { id: 'ruolo', type: 'scelta', label: 'What is your job?', role: 'persona', options: [{ id: 'a', label: 'Nurse' }, { id: 'b', label: 'Doctor' }], allow_other: true, prefer_not: true },
    { id: 'canali', type: 'scelte', label: 'Where do you look?', role: 'problema', options: [{ id: 'web', label: 'Web' }, { id: 'amici', label: 'Friends' }], allow_other: false, prefer_not: false },
    { id: 'f1', type: 'scala', label: 'How often?', role: 'problema', scale: { points: 5, labels: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'] } },
    { id: 'f2', type: 'scala', label: 'How heavy?', role: 'problema', scale: { points: 5, labels: ['Not at all', 'A little', 'Moderately', 'A lot', 'A great deal'] } },
    { id: 'f3', type: 'scala', label: 'How costly?', role: 'problema', scale: { points: 5, labels: ['Nothing', 'Little', 'Fair', 'Much', 'Too much'] } },
    { id: 'storia', type: 'lunga', label: 'Tell us about the last time', role: 'problema' },
    { id: 'mail', type: 'email', label: 'Email', role: 'contatto' },
  ],
};

const response = (id, over) => ({ id, answers: {}, email: null, recontact: false, duration_seconds: 200, device: 'telefono', completed: true, created_at: `2026-10-2${id}T10:00:00Z`, ...over });

const rows = numberResponses([
  response(1, { answers: { ruolo: 'a', canali: ['web', 'amici'], f1: 4, f2: 4, f3: 4, storia: 'I lost a whole morning on the phone.' }, email: 'one@example.com', recontact: true }),
  response(2, { answers: { 'ruolo:altro': 'Radiographer', canali: ['amici'], f1: 5, f2: 1, storia: 'Ok' }, email: 'two@example.com', duration_seconds: 100, device: 'computer' }),
  response(3, { answers: { ruolo: 'non-rispondo', canali: ['web'] }, completed: false, duration_seconds: null, device: null }),
]);

describe('risposte leggibili in inglese', () => {
  const [, ruolo, canali, f1] = survey.questions;
  for (const [question, row, options, expected] of [
    [ruolo, 1, {}, 'Other: Radiographer'],
    [ruolo, 2, {}, 'Prefer not to say'],
    [canali, 0, {}, 'Web; Friends'],
    [f1, 0, { scaleWithLabel: true }, '4 (Often)'],
    [{ ...ruolo, other_label: 'Something else' }, 1, {}, 'Something else: Radiographer'],
  ]) {
    it(`la risposta ${row + 1} a «${question.label}» si legge «${expected}»`, () => {
      assert.equal(answerText(question, rows[row], options), expected);
    });
  }

  it('chi risponde con «Other» compare come persona senza il nome della voce davanti', () => {
    assert.equal(personaAnswer(survey, rows[1]), 'Radiographer');
    assert.equal(personaAnswer(survey, rows[2]), null, '«Prefer not to say» non descrive nessuno');
    const { fresh } = contactCandidates(survey, numberResponses([response(1, { answers: { 'ruolo:altro': 'Radiographer' }, email: 'a@example.com', recontact: true })]));
    assert.equal(fresh[0].persona, 'Radiographer');
  });
});

describe('etichette dei risultati in inglese', () => {
  it('ogni segnalazione di qualità ha un nome inglese, con i codici di sempre', () => {
    assert.deepEqual(Object.keys(FLAG_LABELS), ['veloce', 'lettura', 'uguali', 'aperta', 'saltate', 'domande']);
    assert.equal(FLAG_LABELS.uguali, 'Same answer on every scale');
    for (const label of Object.values(FLAG_LABELS)) assert.deepEqual(italianWords(label), [], label);
  });

  it('i dispositivi del database hanno un nome inglese', () => {
    assert.deepEqual(DEVICE_LABELS, { telefono: 'Phone', computer: 'Computer' });
  });

  it('l imbuto va dal link aperto alle compilazioni complete', () => {
    const funnel = funnelSteps({ views: 40, starts: 12, partial: 3, completed: 8 });
    assert.deepEqual(funnel.steps.map((s) => [s.key, s.label, s.count]), [['views', 'Link opened', 40], ['starts', 'Started', 12], ['partial', 'Stopped halfway', 3], ['completed', 'Completed', 8]]);
  });
});

describe('CSV delle risposte in inglese', () => {
  const flags = qualityFlags(survey, rows);

  it('ha intestazioni inglesi e le virgole come separatore, come si aspetta un foglio di calcolo inglese', () => {
    const lines = responsesCsv(survey, rows, { flags }).split('\r\n');
    assert.equal(lines[0], 'Response,Date,Status,Duration (seconds),Device,What is your job?,Where do you look?,How often?,How heavy?,How costly?,Tell us about the last time,Flags');
    assert.match(lines[1], /^1,2026-10-21 \d\d:\d\d,completed,200,Phone,Nurse,Web; Friends,4,4,4,/);
    assert.match(lines[1], /,Same answer on every scale$/);
    assert.match(lines[2], /^2,[^,]*,completed,100,Computer,Other: Radiographer,Friends,5,1,,Ok,Open answer empty or under 3 words$/);
    assert.match(lines[3], /^3,[^,]*,stopped,,,Prefer not to say,Web,/);
  });

  it('con le email aggiunge chi vuole essere ricontattato, con sì e no in inglese', () => {
    const csv = responsesCsv(survey, rows, { includeEmail: true });
    assert.match(csv.split('\r\n')[0], /,Email,Contact again,Flags$/);
    assert.match(csv, /,one@example\.com,yes,/);
    assert.match(csv, /,two@example\.com,no,/);
  });

  it('il separatore si può ancora scegliere, e le celle con il separatore vanno tra virgolette', () => {
    const csv = responsesCsv(survey, rows, { separator: ';' });
    assert.match(csv.split('\r\n')[0], /^Response;Date;Status;/);
    assert.match(csv.split('\r\n')[1], /;"Web; Friends";/);
    assert.match(responsesCsv(survey, rows).split('\r\n')[1], /,Web; Friends,/);
  });

  it('non resta italiano nel CSV inglese', () => {
    assert.deepEqual(italianWords(responsesCsv(survey, rows, { includeEmail: true, flags })), []);
  });
});
