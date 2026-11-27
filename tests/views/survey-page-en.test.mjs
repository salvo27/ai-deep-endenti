// The public survey page (q.html) on an English device, from the introduction to the thanks, with every state
// in between: the page speaks English, the database values stay the same, and the survey's own words are untouched.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { italianWords } from '../setup/italian.mjs';
import { flush, setupDom, text, typeInto } from '../setup/dom.mjs';

useLanguage('en');

const TOKEN = 'Qx7pL2mN9vR4tY6wZ1bC3d';

// A survey written in English by the team, so any Italian on the page is the page's own.
const SURVEY = {
  status: 'aperto',
  title: 'How you plan your shopping',
  intro: 'We are a group of students looking at how people plan their shopping.',
  privacy: 'We keep your answers for six months and then delete them.',
  thanks: 'Thank you for your time!',
  thanks_contact: 'We will be in touch soon.',
  layout: 'una',
  progress: 'contatore',
  show_time: true,
  median_seconds: null,
  appearance: { theme: 'automatico', accent: '#3b4bc8' },
  questions: [
    { id: 'about', type: 'sezione', label: 'About you', help: '' },
    { id: 'age', type: 'scelta', label: 'How old are you?', required: true, options: [{ id: 'under-30', label: 'Under 30' }, { id: 'over-30', label: '30 or over' }], allow_other: false, prefer_not: true },
    { id: 'where', type: 'scelte', label: 'Where did you shop?', options: [{ id: 'shop', label: 'Supermarket' }, { id: 'web', label: 'Online' }], allow_other: true, prefer_not: false },
    { id: 'effort', type: 'scala', label: 'How much effort did it take?', scale: { points: 5, min_label: 'None', max_label: 'A great deal' } },
    { id: 'times', type: 'numero', label: 'How many times did you shop?', number: { min: 0, max: 60 } },
    { id: 'mail', type: 'email', label: 'Your email', help: 'Optional.' },
  ],
};

let pages = 0;

// Opens q.html in a fresh document, with the answers of the fake database chosen by the test.
async function openPage({ hash = `#${TOKEN}`, load = { data: SURVEY, error: null }, submit = [], storage = {}, session = {} } = {}) {
  setupDom(`https://team.example/q.html${hash}`);
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const main = document.createElement('main');
  main.id = 'survey';
  document.body.append(main);
  for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
  for (const [key, value] of Object.entries(session)) sessionStorage.setItem(key, value);
  await import('../../assets/js/public/survey-api.js');
  const fake = globalThis.__fakeSupabase;
  fake.reset();
  fake.responses.rpc.public_survey = load;
  const answers = [...submit];
  fake.responses.rpc.submit_survey = () => {
    const next = answers.length ? answers.shift() : 'ok';
    if (next === 'network') throw new TypeError('Failed to fetch');
    if (next === 'rate_limit') return { data: null, error: { status: 429, message: 'Too Many Requests' } };
    return { data: next === 'ok' ? { status: 'ok' } : next, error: null };
  };
  pages += 1;
  await import(`../../assets/js/public/survey-page.js?page=${pages}`);
  await flush();
  return { main, fake, submits: () => fake.calls.filter(([kind, name]) => kind === 'rpc' && name === 'submit_survey').map(([, , params]) => params) };
}

const button = (name) => [...document.querySelectorAll('button')].find((b) => text(b) === name || b.getAttribute('aria-label') === name) || null;
const press = async (name) => {
  const target = button(name);
  assert.ok(target, `manca il pulsante «${name}»`);
  target.click();
  await flush();
};
const option = (questionId, value) => document.querySelector(`input[data-q="${questionId}"][value="${value}"]`);
const field = (questionId) => document.querySelector(`[data-q="${questionId}"].field:not([data-other])`);
const counter = () => text(document.querySelector('.progress-text'));
const alertText = () => text(document.querySelector('.alert'));

// Everything a person can read or hear on the page: the text and the labels for screen readers.
function readable() {
  const labels = [...document.querySelectorAll('[aria-label], [title], [placeholder], [aria-valuetext]')].flatMap((el) => ['aria-label', 'title', 'placeholder', 'aria-valuetext'].map((name) => el.getAttribute(name) || ''));
  return [text(document.body), document.title, ...labels].join(' ');
}
const noItalian = () => assert.deepEqual(italianWords(readable()), []);

describe('pagina pubblica in inglese, dall introduzione al grazie', () => {
  it('l introduzione dichiara l inglese e spiega durata, email e salvataggio', async () => {
    await openPage();
    assert.equal(document.documentElement.lang, 'en');
    assert.equal(document.title, SURVEY.title);
    const facts = [...document.querySelectorAll('.facts li')].map(text);
    assert.match(facts[0], /^It will take about \d+ minutes?\.$/);
    assert.equal(facts[1], 'At the end, if you like, you can leave us your email.');
    assert.equal(facts[2], 'Your answers are saved at every step: if you stop, you can pick up where you left off.');
    assert.ok(button('Start'));
    assert.equal(text(button('Read the privacy notice')), 'Read the privacy notice');
    assert.equal(document.querySelector('.privacy').getAttribute('aria-label'), 'Privacy notice');
    assert.equal(document.querySelector('.progress-bar').getAttribute('aria-label'), 'Progress');
    assert.equal(text(document.querySelector('.hp label')), 'Website');
    noItalian();
  });

  it('con l email obbligatoria lo dice già nell introduzione', async () => {
    const questions = SURVEY.questions.map((q) => (q.type === 'email' ? { ...q, required: true } : q));
    await openPage({ load: { data: { ...SURVEY, questions }, error: null } });
    assert.equal(text(document.querySelectorAll('.facts li')[1]), 'At the end we will ask you for an email address.');
  });

  it('si risponde domanda per domanda con messaggi, suggerimenti e pulsanti in inglese, e si invia', async () => {
    const { submits } = await openPage();
    await press('Start');
    assert.equal(counter(), 'Question 1 of 5');
    assert.equal(document.querySelector('.progress-bar').getAttribute('aria-valuetext'), 'Question 1 of 5');
    assert.equal(text(document.querySelector('.q-required')), '(required)');
    assert.ok([...document.querySelectorAll('.opt-label')].some((el) => text(el) === 'Prefer not to say'));
    assert.equal(text(document.querySelector('.key-hint')), 'or press Enter ↵');
    noItalian();

    await press('Next');
    assert.equal(text(document.querySelector('.q-error')), 'Please answer this question to continue.');
    assert.equal(alertText(), 'Please answer this question to continue.');
    option('age', 'under-30').click();
    await press('Next');

    assert.equal(counter(), 'Question 2 of 5');
    assert.ok(button('Back'), 'il pulsante per tornare indietro ha un nome');
    assert.equal(document.querySelector('[data-other]').getAttribute('aria-label'), 'Other: write your answer');
    assert.ok([...document.querySelectorAll('.opt-label')].some((el) => text(el) === 'Other'));
    noItalian();
    await press('Next');
    await press('Next');

    assert.equal(text(document.querySelector('[id$="-limiti"]')), 'A whole number from 0 to 60.');
    typeInto(field('times'), '1.5');
    await press('Next');
    assert.equal(text(document.querySelector('.q-error')), 'Write digits only, without dots or commas.');
    typeInto(field('times'), '3');
    await press('Next');

    assert.equal(counter(), 'Question 5 of 5');
    assert.ok(button('Send'), 'all ultima domanda il pulsante invia');
    assert.ok([...document.querySelectorAll('.opt-label')].some((el) => text(el) === 'You can contact me for a short chat'));
    typeInto(field('mail'), 'sam@gmial.com');
    await flush();
    assert.equal(text(document.querySelector('.email-suggest span')), 'Did you mean sam@gmail.com?');
    await press('Yes, fix it');
    assert.equal(field('mail').value, 'sam@gmail.com');
    document.querySelector('input[name="recontact"]').click();
    noItalian();

    await press('Send');
    assert.equal(text(document.querySelector('.reminder-title')), 'You left 2 questions unanswered:');
    assert.equal(document.querySelector('.reminder').getAttribute('aria-label'), 'Unanswered questions');
    assert.equal(text(document.querySelector('.reminder-text')), 'They are not required: if you prefer, send them as they are.');
    assert.ok(button('Answer the skipped ones'));
    assert.ok(button('Send anyway'));
    noItalian();

    await press('Send anyway');
    assert.equal(document.title, 'Thank you');
    assert.equal(text(document.querySelector('h1')), 'Thank you!');
    assert.equal(text(document.querySelector('.text')), 'We will be in touch soon.');
    assert.deepEqual([...document.querySelector('.thanks-mail').children].map(text), ['We will write to', 'sam@gmail.com']);
    assert.equal(text(document.querySelector('.thanks-close')), 'You can now close this page.');
    noItalian();
    const last = submits().at(-1);
    assert.equal(last.p_meta.final, true);
    assert.deepEqual(last.p_answers, { age: 'under-30', times: 3, mail: 'sam@gmail.com' });
    assert.equal(last.p_meta.device, 'computer', 'i valori per il database restano quelli');
  });

  it('con una domanda saltata il promemoria è al singolare', async () => {
    await openPage({ load: { data: { ...SURVEY, questions: SURVEY.questions.slice(1, 3) }, error: null } });
    await press('Start');
    option('age', 'over-30').click();
    await press('Next');
    await press('Send');
    assert.equal(text(document.querySelector('.reminder-title')), 'You left one question unanswered:');
    assert.ok(button('Answer it'));
  });

  it('senza risposte valide chiede di rispondere almeno a una domanda', async () => {
    await openPage({ load: { data: { ...SURVEY, questions: [SURVEY.questions[2]] }, error: null } });
    await press('Start');
    await press('Send');
    assert.equal(alertText(), 'Answer at least one question before sending.');
  });

  it('il grazie senza messaggio del team usa il suo, in inglese', async () => {
    await openPage({ load: { data: { ...SURVEY, thanks: '', questions: [SURVEY.questions[1]] }, error: null } });
    await press('Start');
    option('age', 'over-30').click();
    await press('Send');
    assert.equal(text(document.querySelector('.text')), 'We have received your answers.');
  });
});

describe('errori di invio in inglese', () => {
  const one = { data: { ...SURVEY, questions: SURVEY.questions.slice(0, 2) }, error: null };

  async function sendOnce(submit) {
    const page = await openPage({ load: one, submit });
    await press('Start');
    option('age', 'over-30').click();
    await press('Send');
    return page;
  }

  it('senza rete lo dice e il pulsante diventa Try again', async () => {
    await sendOnce(['network']);
    assert.equal(alertText(), 'Connection failed. Check your network and try again.');
    assert.ok(button('Try again'));
  });

  it('con troppi tentativi chiede di aspettare', async () => {
    await sendOnce(['rate_limit']);
    assert.equal(alertText(), 'Too many attempts. Wait a few minutes and try again.');
  });

  it('un messaggio del database su una domanda si mostra sotto la domanda, in inglese', async () => {
    await sendOnce([{ status: 'errore', reason: 'Rispondi a tutte le domande obbligatorie.', question: 'age' }]);
    assert.equal(text(document.querySelector('.q-error')), 'Answer all the required questions.');
    noItalian();
  });

  it('un messaggio del database senza domanda va nell avviso, in inglese', async () => {
    await sendOnce([{ status: 'errore', reason: 'Il questionario non accetta altre risposte.' }]);
    assert.equal(alertText(), 'The survey is not accepting any more answers.');
  });

  it('un messaggio sconosciuto del database non arriva in italiano', async () => {
    await sendOnce([{ status: 'errore', reason: 'Un errore nuovo del database.' }]);
    assert.equal(alertText(), 'Sending failed. Please try again shortly.');
  });

  it('«già inviate» vale come invio riuscito: le risposte erano arrivate', async () => {
    await sendOnce(['network', { status: 'errore', reason: 'Le risposte sono già state inviate.' }]);
    await press('Try again');
    assert.equal(text(document.querySelector('h1')), 'Thank you!');
  });
});

describe('stati senza domande in inglese', () => {
  it('un link sbagliato dice che il questionario non si trova', async () => {
    await openPage({ hash: '#corto' });
    assert.equal(document.title, 'Survey not found');
    assert.equal(text(document.querySelector('h1')), 'Survey not found');
    assert.match(text(document.querySelector('.text')), /^The link may be incomplete or no longer valid\./);
    noItalian();
  });

  it('un codice che il database non conosce dice lo stesso', async () => {
    await openPage({ load: { data: { status: 'non_trovato' }, error: null } });
    assert.equal(text(document.querySelector('h1')), 'Survey not found');
  });

  it('un questionario chiuso lo dice e ringrazia', async () => {
    await openPage({ load: { data: { status: 'chiuso' }, error: null } });
    assert.equal(text(document.querySelector('h1')), 'Survey closed');
    assert.equal(text(document.querySelector('.text')), 'This survey is no longer accepting answers. Thank you for your interest all the same.');
    noItalian();
  });

  it('se il caricamento non riesce si può riprovare, e al secondo tentativo si apre', async () => {
    let calls = 0;
    await openPage({
      load: () => {
        calls += 1;
        if (calls === 1) throw new TypeError('Failed to fetch');
        return { data: SURVEY, error: null };
      },
    });
    assert.equal(text(document.querySelector('h1')), 'We could not open the survey');
    assert.equal(text(document.querySelector('.text')), 'Connection failed. Check your network and try again.');
    noItalian();
    await press('Try again');
    assert.ok(button('Start'));
  });

  it('un errore del server al caricamento chiede di riprovare più tardi', async () => {
    await openPage({ load: { data: null, error: { status: 500, message: 'boom' } } });
    assert.equal(text(document.querySelector('.text')), 'Survey not available. Please try again later.');
  });

  it('chi ha già risposto da questo dispositivo vede la data scritta all inglese', async () => {
    await openPage({ storage: { [`questionario:${TOKEN}:inviato`]: '2026-11-27' } });
    assert.equal(document.title, 'You have already answered');
    assert.equal(text(document.querySelector('h1')), 'You have already answered, thank you!');
    assert.equal(text(document.querySelector('.text')), 'Your answers arrived on 27/11/2026: there is no need to fill it in again. You can now close this page.');
    noItalian();
  });

  it('con una data illeggibile lo dice senza data', async () => {
    await openPage({ storage: { [`questionario:${TOKEN}:inviato`]: 'ieri' } });
    assert.equal(text(document.querySelector('.text')), 'Your answers have arrived: there is no need to fill it in again. You can now close this page.');
  });

  it('chi torna più tardi viene salutato con le domande che mancano', async () => {
    const stored = JSON.stringify({ session: '0b6f3c2e-8d1a-4c5b-9e7f-1a2b3c4d5e6f', index: 2, draft: { age: 'over-30', times: '4' }, savedAt: Date.now() });
    await openPage({ storage: { [`questionario:${TOKEN}`]: stored } });
    assert.equal(text(document.querySelector('.text')), 'You have 3 questions left out of 5: the answers you gave are still here, so you can pick up where you left off.');
    assert.ok(button('Continue'));
    noItalian();
    await press('Continue');
    assert.equal(counter(), 'Question 3 of 5');
  });

  it('con una sola domanda mancante il saluto è al singolare', async () => {
    const stored = JSON.stringify({ session: '0b6f3c2e-8d1a-4c5b-9e7f-1a2b3c4d5e6f', index: 0, draft: { age: 'over-30' }, savedAt: Date.now() });
    await openPage({ load: { data: { ...SURVEY, questions: SURVEY.questions.slice(0, 3) }, error: null }, storage: { [`questionario:${TOKEN}`]: stored } });
    assert.match(text(document.querySelector('.text')), /^You have one question left out of 2:/);
  });
});
