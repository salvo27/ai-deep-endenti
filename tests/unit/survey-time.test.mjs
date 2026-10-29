import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANSWER_SECONDS, countWords, estimateMinutes, estimateSeconds, minutesLabel } from '../../assets/js/public/survey-time.js';

const survey = {
  intro: 'Ciao, siamo un gruppo di studenti e ricercatori.',
  privacy: Array.from({ length: 400 }, () => 'parola').join(' '),
  questions: [
    { id: 'sez', type: 'sezione', label: 'Su di te' },
    { id: 'eta', type: 'scelta', label: 'Quanti anni hai?', options: [{ id: 'a', label: 'Meno di 30' }, { id: 'b', label: '30 o più' }] },
    { id: 'freq', type: 'scala', label: 'Quanto spesso?', scale: { points: 5, min_label: 'Mai', max_label: 'Sempre' } },
    { id: 'storia', type: 'lunga', label: 'Raccontaci l\'ultima volta che è successo.' },
  ],
};

test('the estimate reads intro and questions at 4 words per second, adds time per question type and a small phone margin', () => {
  const words = 8 + 2 + (4 + 3 + 3) + (3 + 1 + 1) + 6;
  const answering = ANSWER_SECONDS.sezione + ANSWER_SECONDS.scelta + ANSWER_SECONDS.scala + ANSWER_SECONDS.lunga;
  assert.equal(countWords('  due   parole '), 2);
  assert.equal(estimateSeconds(survey), Math.round(1.1 * (words / 4 + answering)), 'l\'informativa, chiusa, non conta');
  assert.equal(estimateMinutes(survey), Math.max(1, Math.round(estimateSeconds(survey) / 60)));
});

test('the observed median wins when it is known, and minutes never go below one', () => {
  assert.equal(estimateMinutes(survey, 301), 5, 'al minuto più vicino');
  assert.equal(estimateMinutes(survey, 331), 6);
  assert.equal(estimateMinutes({ questions: [] }), 1);
  assert.equal(estimateMinutes(survey, null), estimateMinutes(survey));
  assert.equal(minutesLabel(1), 'circa 1 minuto');
  assert.equal(minutesLabel(4), 'circa 4 minuti');
});
