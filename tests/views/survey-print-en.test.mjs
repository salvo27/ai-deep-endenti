// The printable survey on an English device: headings, kinds of answer and empty boxes in English, the survey's
// own words untouched.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { italianWords } from '../setup/italian.mjs';
import { setupDom, text } from '../setup/dom.mjs';

useLanguage('en');

let surveySheet;
let printSurvey;
let statusLabel;

before(async () => {
  setupDom();
  ({ surveySheet, printSurvey } = await import('../../assets/js/survey-print.js'));
  ({ statusLabel } = await import('../../assets/js/schema.js'));
});

const QUESTIONS = [
  { id: 's', type: 'sezione', label: 'About you', help: 'Two short questions.' },
  { id: 'job', type: 'scelta', label: 'What is your job?', required: true, options: [{ id: 'a', label: 'Nurse' }, { id: 'b', label: 'Doctor' }], allow_other: true, prefer_not: true },
  { id: 'where', type: 'scelte', label: 'Where do you look?', options: [{ id: 'w', label: 'Web' }], allow_other: true, other_label: 'Something else', other_placeholder: 'Which one?' },
  { id: 'often', type: 'scala', label: 'How often?', scale: { points: 5, labels: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'] } },
  { id: 'n1', type: 'numero', label: 'How many?', number: { min: 0, max: 10 } },
  { id: 'n2', type: 'numero', label: 'How many at least?', number: { min: 1 } },
  { id: 'n3', type: 'numero', label: 'How many at most?', number: { max: 9 } },
  { id: 'n4', type: 'numero', label: 'Any number?' },
  { id: 'short', type: 'breve', label: 'Short?' },
  { id: 'long', type: 'lunga', label: 'Long?' },
  { id: 'mail', type: 'email', label: 'Your email' },
  { id: 'mail2', type: 'email', label: 'Your email again', required: true },
];
const survey = { title: 'Shifts on the ward', status: 'bozza', data: { intro: 'We are a group of students.', thanks: 'Thanks a lot.', thanks_contact: 'We will write to you.', privacy: 'Short notice.', questions: QUESTIONS } };

describe('questionario da stampare in inglese', () => {
  it('l intestazione dice cosa è, quante domande e quanto tempo', () => {
    const root = surveySheet(survey);
    assert.match(text(root.querySelector('.muted')), /^Survey · 11 questions · about \d+ minutes? · /);
    assert.match(text(surveySheet({ ...survey, data: { questions: [QUESTIONS[1]] } }).querySelector('.muted')), /^Survey · 1 question · about 1 minute · /);
  });

  it('i titoli delle parti sono in inglese', () => {
    const root = surveySheet(survey);
    assert.deepEqual([...root.querySelectorAll('h2')].map(text), ['Introduction', 'Questions', 'Final message', 'Message for people who ask to be contacted', 'Privacy notice']);
  });

  it('ogni tipo di domanda dice come si risponde', () => {
    const root = surveySheet(survey);
    assert.deepEqual([...root.querySelectorAll('.ps-kind')].map(text), [
      'One answer',
      'One or more answers',
      'Scale from 1 to 5',
      'Whole number from 0 to 10',
      'Whole number, at least 1',
      'Whole number, at most 9',
      'Whole number',
      'Short answer',
      'Long answer',
      'Email, optional, to get back in touch',
      'Email, to get back in touch',
    ]);
  });

  it('le risposte possibili hanno caselle vuote, con «Other» e «Prefer not to say»', () => {
    const root = surveySheet(survey);
    const options = [...root.querySelectorAll('.ps-question')].map((q) => [...q.querySelectorAll('li')].map(text));
    assert.deepEqual(options[0], ['○ Nurse', '○ Doctor', '○ Other:', '○ Prefer not to say']);
    assert.deepEqual(options[1], ['☐ Web', '☐ Something else: Which one?']);
    assert.equal(text(root.querySelector('.ps-q')), '1. What is your job? (required)');
    assert.match(text(root), /☐ You can contact me for a short chat/);
  });

  it('non resta italiano, a parte lo stato che viene dallo schema', () => {
    const root = surveySheet(survey);
    assert.deepEqual(italianWords(text(root).replace(statusLabel('survey', survey.status), '')), []);
  });

  it('in stampa il nome del file proposto è in inglese, e dopo torna quello di prima', () => {
    let printed = null;
    const savedPrint = window.print;
    document.title = 'Before';
    window.print = () => {
      printed = { title: document.title, active: document.body.classList.contains('print-note') };
    };
    try {
      printSurvey(survey);
    } finally {
      window.print = savedPrint;
    }
    assert.deepEqual(printed, { title: 'Survey - Shifts on the ward', active: true });
    window.dispatchEvent(new window.Event('afterprint'));
    assert.equal(document.title, 'Before');
    assert.equal(document.getElementById('print-root'), null);
  });
});
