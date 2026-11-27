// The logic of the public survey page on an English device: progress, durations, hints and every message in English,
// while the values the database expects (types, statuses, option ids, «:altro») stay the same.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { italianWords } from '../setup/italian.mjs';

useLanguage('en');
const flow = await import('../../assets/js/public/survey-flow.js');
const { minutesLabel } = await import('../../assets/js/public/survey-time.js');
const { language, texts, en } = await import('../../assets/js/public/texts.js');
const { MESSAGES, OTHER, buildScreens, durationText, normalizeSurvey, numberHint, otherMessage, parseInteger, progressFor, reasonText, tooLong, validateQuestion } = flow;

const raw = {
  status: 'aperto',
  title: 'How you plan your shopping',
  layout: 'una',
  questions: [
    { id: 'uno', type: 'sezione', label: 'About you' },
    { id: 'age', type: 'scelta', label: 'How old are you?', required: true, options: [{ id: 'young', label: 'Under 30' }, { id: 'adult', label: '30 or over' }], prefer_not: true },
    { id: 'where', type: 'scelte', label: 'Where?', options: [{ id: 'home', label: 'Home' }], allow_other: true },
    { id: 'times', type: 'numero', label: 'How many times?', number: { min: 0, max: 30 } },
    { id: 'name', type: 'breve', label: 'Name of the thing?' },
    { id: 'mail', type: 'email', label: 'Email' },
  ],
};
const survey = normalizeSurvey(raw);
const byId = (id) => survey.questions.find((q) => q.id === id);

describe('lingua della pagina pubblica su un dispositivo inglese', () => {
  it('è l inglese', () => {
    assert.equal(language, 'en');
    assert.equal(texts, en);
  });
});

describe('avanzamento e durata in inglese', () => {
  it('conta le domande con «Question n of total», o un intervallo con una schermata per sezione', () => {
    const one = buildScreens(survey);
    assert.equal(progressFor(one, 0).text, 'Question 1 of 5');
    assert.equal(progressFor(one, 4).text, 'Question 5 of 5');
    const sections = buildScreens(normalizeSurvey({ ...raw, layout: 'sezioni' }));
    assert.equal(progressFor(sections, 0).text, 'Questions 1-5 of 5');
  });

  for (const [minutes, sentence] of [[1, 'It will take about 1 minute.'], [2, 'It will take about 2 minutes.'], [25, 'It will take about 25 minutes.']]) {
    it(`${minutes} minuti si annunciano con «${sentence}»`, () => {
      assert.equal(durationText(minutes), sentence);
    });
  }

  it('i minuti senza frase seguono la lingua della pagina', () => {
    assert.equal(minutesLabel(1), 'about 1 minute');
    assert.equal(minutesLabel(6), 'about 6 minutes');
  });
});

describe('suggerimenti e messaggi in inglese', () => {
  for (const [number, hint] of [
    [{ min: 0, max: 30 }, 'A whole number from 0 to 30.'],
    [{ min: 1, max: null }, 'A whole number, at least 1.'],
    [{ min: null, max: 9 }, 'A whole number, at most 9.'],
    [{ min: null, max: null }, 'A whole number.'],
    [undefined, 'A whole number.'],
  ]) {
    it(`i limiti ${JSON.stringify(number)} si spiegano con «${hint}»`, () => {
      assert.equal(numberHint(number), hint);
    });
  }

  for (const [raw, bounds, error] of [
    ['31', { min: 0, max: 30 }, 'Write a number from 0 to 30.'],
    ['-1', { min: 0, max: 30 }, 'Write a number from 0 to 30.'],
    ['5', { min: 10, max: null }, 'Write a number of 10 or more.'],
    ['50', { min: null, max: 10 }, 'Write a number of 10 or less.'],
    ['1.000', {}, 'Write digits only, without dots or commas.'],
    ['99999999999', {}, 'The number is too large.'],
  ]) {
    it(`«${raw}» con ${JSON.stringify(bounds)} dà «${error}»`, () => {
      assert.deepEqual(parseInteger(raw, bounds), { error });
    });
  }

  it('le domande obbligatorie, «Other», le email e le risposte troppo lunghe hanno messaggi inglesi', () => {
    assert.equal(validateQuestion(byId('age'), {}), 'Please answer this question to continue.');
    assert.equal(validateQuestion({ ...byId('where'), required: true }, { where: [OTHER] }), 'Please write your answer next to ‘Other’.');
    assert.equal(validateQuestion(byId('mail'), { mail: 'person@example' }), 'The email address does not look complete: please check it.');
    assert.equal(validateQuestion(byId('mail'), {}, { recontact: true }), 'To be contacted, write your email or untick the box.');
    assert.equal(validateQuestion(byId('name'), { name: 'x'.repeat(301) }), 'At most 300 characters: please shorten your answer a little.');
    assert.equal(tooLong(3000), 'At most 3000 characters: please shorten your answer a little.');
    assert.equal(MESSAGES.empty, 'Answer at least one question before sending.');
  });

  it('«Other» è il nome predefinito della voce libera, e il messaggio usa il nome che il team le ha dato', () => {
    assert.equal(byId('where').other_label, 'Other');
    assert.equal(otherMessage(byId('where')), MESSAGES.other);
    assert.equal(otherMessage({ ...byId('where'), other_label: 'Another app' }), 'Please write your answer next to ‘Another app’.');
    assert.equal(otherMessage({ ...byId('where'), other_label: 'Altro' }), 'Please write your answer next to ‘Altro’.', 'un nome scritto dal team resta il suo');
  });

  it('un questionario senza titolo si chiama Survey', () => {
    assert.equal(normalizeSurvey({ ...raw, title: '  ' }).title, 'Survey');
    assert.equal(survey.title, 'How you plan your shopping');
  });

  it('i messaggi inglesi non contengono italiano', () => {
    const all = [...Object.values(MESSAGES), tooLong(300), otherMessage(byId('where')), numberHint({ min: 0, max: 3 }), progressFor(buildScreens(survey), 0).text, durationText(3)];
    assert.deepEqual(all.flatMap((text) => italianWords(text)), []);
  });
});

describe('codici del database in inglese', () => {
  for (const [code, english] of [
    ['required_missing', 'Answer all the required questions.'],
    ['invalid_answers', 'Some answers are not valid.'],
    ['survey_full', 'The survey is not accepting any more answers.'],
    ['survey_busy', 'Too many answers right now. Please try again in a few minutes.'],
    ['number_out_of_range', 'A number is outside the allowed range.'],
    ['already_submitted', 'Your answers have already been sent.'],
  ]) {
    it(`${code} si legge «${english}»`, () => {
      assert.equal(reasonText(code), english);
    });
  }

  it('ogni codice ha il suo testo inglese, senza italiano', () => {
    const all = Object.keys(texts.server).map((code) => reasonText(code));
    assert.ok(all.length > 15);
    assert.deepEqual(all.filter((text) => typeof text !== 'string' || italianWords(text).length), []);
  });

  it('un codice sconosciuto, una vecchia frase italiana o un nome di Object non danno testo: la pagina usa il suo messaggio di invio fallito', () => {
    for (const reason of ['codice_nuovo', 'Risposte non valide.', 'constructor', 'hasOwnProperty', '__proto__', '', null, undefined, 42]) {
      assert.equal(reasonText(reason), null, String(reason));
    }
  });
});
