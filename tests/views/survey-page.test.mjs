// La pagina pubblica dei questionari (q.html) su un dispositivo in italiano: gli stessi passaggi della versione
// inglese, con i testi italiani di sempre e i codici del database messi in parole italiane.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { flush, setupDom, text, typeInto } from '../setup/dom.mjs';

const TOKEN = 'Qx7pL2mN9vR4tY6wZ1bC3d';

const SURVEY = {
  status: 'aperto',
  title: 'Come organizzi la spesa',
  intro: 'Siamo un gruppo di studenti.',
  privacy: 'Teniamo le risposte sei mesi.',
  thanks: 'Grazie per il tuo tempo!',
  thanks_contact: '',
  layout: 'una',
  progress: 'contatore',
  show_time: true,
  median_seconds: null,
  appearance: { theme: 'automatico', accent: '#3b4bc8' },
  questions: [
    { id: 'chi', type: 'sezione', label: 'Su di te', help: '' },
    { id: 'eta', type: 'scelta', label: 'Quanti anni hai?', required: true, options: [{ id: 'meno-30', label: 'Meno di 30' }, { id: 'oltre-30', label: '30 o più' }], allow_other: false, prefer_not: true },
    { id: 'dove', type: 'scelte', label: 'Dove hai fatto la spesa?', options: [{ id: 'super', label: 'Supermercato' }], allow_other: true, prefer_not: false },
    { id: 'fatica', type: 'scala', label: 'Quanta fatica?', scale: { points: 5, min_label: 'Nessuna', max_label: 'Moltissima' } },
    { id: 'volte', type: 'numero', label: 'Quante volte?', number: { min: 0, max: 60 } },
    { id: 'mail', type: 'email', label: 'La tua email', help: '' },
  ],
};

let pages = 0;

async function openPage({ hash = `#${TOKEN}`, load = { data: SURVEY, error: null }, submit = [], storage = {} } = {}) {
  setupDom(`https://team.example/q.html${hash}`);
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const main = document.createElement('main');
  main.id = 'survey';
  document.body.append(main);
  for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
  await import('../../assets/js/public/survey-api.js');
  const fake = globalThis.__fakeSupabase;
  fake.reset();
  fake.responses.rpc.public_survey = load;
  const answers = [...submit];
  fake.responses.rpc.submit_survey = () => {
    const next = answers.length ? answers.shift() : 'ok';
    if (next === 'network') throw new TypeError('Failed to fetch');
    return { data: next === 'ok' ? { status: 'ok' } : next, error: null };
  };
  pages += 1;
  await import(`../../assets/js/public/survey-page.js?pagina=${pages}`);
  await flush();
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

describe('pagina pubblica in italiano', () => {
  it('l introduzione dichiara l italiano e spiega durata, email e salvataggio', async () => {
    await openPage();
    assert.equal(document.documentElement.lang, 'it');
    const facts = [...document.querySelectorAll('.facts li')].map(text);
    assert.match(facts[0], /^Ci vorr(à|anno) circa \d+ minut[oi]\.$/);
    assert.equal(facts[1], 'Alla fine, se vuoi, potrai lasciarci la tua email.');
    assert.equal(facts[2], 'Le risposte si salvano a ogni passaggio: se ti fermi, riprendi da dove eri.');
    assert.ok(button('Inizia'));
    assert.ok(button('Leggi l\'informativa sulla privacy'));
    assert.equal(document.querySelector('.progress-bar').getAttribute('aria-label'), 'Avanzamento');
  });

  it('si risponde e si invia con i testi italiani di sempre', async () => {
    await openPage();
    await press('Inizia');
    assert.equal(counter(), 'Domanda 1 di 5');
    assert.equal(text(document.querySelector('.q-required')), '(obbligatoria)');
    assert.equal(text(document.querySelector('.key-hint')), 'oppure premi Invio ↵');
    await press('Avanti');
    assert.equal(text(document.querySelector('.q-error')), 'Per continuare rispondi a questa domanda, per favore.');
    option('eta', 'meno-30').click();
    await press('Avanti');
    assert.ok(button('Indietro'));
    assert.equal(document.querySelector('[data-other]').getAttribute('aria-label'), 'Altro: scrivi la tua risposta');
    await press('Avanti');
    await press('Avanti');
    assert.equal(text(document.querySelector('[id$="-limiti"]')), 'Un numero intero da 0 a 60.');
    typeInto(field('volte'), '2');
    await press('Avanti');
    assert.ok(button('Invia'));
    typeInto(field('mail'), 'anna@gmial.com');
    await flush();
    assert.equal(text(document.querySelector('.email-suggest span')), 'Intendevi anna@gmail.com?');
    await press('Sì, correggi');
    document.querySelector('input[name="recontact"]').click();
    await press('Invia');
    assert.equal(text(document.querySelector('.reminder-title')), 'Hai lasciato senza risposta 2 domande:');
    assert.equal(text(document.querySelector('.reminder-text')), 'Non sono obbligatorie: se preferisci, invia pure così.');
    assert.ok(button('Rispondi a quelle saltate'));
    await press('Invia comunque');
    assert.equal(document.title, 'Grazie');
    assert.equal(text(document.querySelector('h1')), 'Grazie!');
    assert.equal(text(document.querySelector('.text')), 'Grazie per il tuo tempo!');
    assert.deepEqual([...document.querySelector('.thanks-mail').children].map(text), ['Ti scriveremo a', 'anna@gmail.com']);
    assert.equal(text(document.querySelector('.thanks-close')), 'Ora puoi chiudere questa pagina.');
  });

  it('i codici del database si mostrano in italiano, e uno sconosciuto con il messaggio di invio fallito', async () => {
    const one = { data: { ...SURVEY, questions: SURVEY.questions.slice(0, 2) }, error: null };
    for (const [reason, shown] of [
      ['survey_full', 'Il questionario non accetta altre risposte.'],
      ['survey_busy', 'Troppe risposte in questo momento. Riprova tra qualche minuto.'],
      ['codice_nuovo', 'Invio non riuscito. Riprova tra poco.'],
      ['Il questionario non accetta altre risposte.', 'Invio non riuscito. Riprova tra poco.'],
      [undefined, 'Invio non riuscito. Riprova tra poco.'],
    ]) {
      await openPage({ load: one, submit: [{ status: 'errore', reason }] });
      await press('Inizia');
      option('eta', 'oltre-30').click();
      await press('Invia');
      assert.equal(alertText(), shown, String(reason));
    }
    await openPage({ load: one, submit: [{ status: 'errore', reason: 'required_missing', question: 'eta' }] });
    await press('Inizia');
    option('eta', 'oltre-30').click();
    await press('Invia');
    assert.equal(text(document.querySelector('.q-error')), 'Rispondi a tutte le domande obbligatorie.');
    await openPage({ load: one, submit: ['network'] });
    await press('Inizia');
    option('eta', 'oltre-30').click();
    await press('Invia');
    assert.equal(alertText(), 'Connessione non riuscita. Controlla la rete e riprova.');
    assert.ok(button('Riprova'));
  });

  it('già inviate vale come invio riuscito solo con il suo codice: le risposte erano arrivate', async () => {
    const one = { data: { ...SURVEY, questions: SURVEY.questions.slice(0, 2) }, error: null };
    await openPage({ load: one, submit: ['network', { status: 'errore', reason: 'already_submitted' }] });
    await press('Inizia');
    option('eta', 'oltre-30').click();
    await press('Invia');
    await press('Riprova');
    assert.equal(text(document.querySelector('h1')), 'Grazie!');
    await openPage({ load: one, submit: [{ status: 'errore', reason: 'Le risposte sono già state inviate.' }] });
    await press('Inizia');
    option('eta', 'oltre-30').click();
    await press('Invia');
    assert.equal(alertText(), 'Invio non riuscito. Riprova tra poco.');
  });

  it('link sbagliato, questionario chiuso e caricamento fallito hanno il loro messaggio', async () => {
    await openPage({ hash: '#corto' });
    assert.equal(text(document.querySelector('h1')), 'Questionario non trovato');
    await openPage({ load: { data: { status: 'chiuso' }, error: null } });
    assert.equal(text(document.querySelector('h1')), 'Questionario chiuso');
    assert.equal(text(document.querySelector('.text')), 'Questo questionario non accetta più risposte. Grazie comunque per il tuo interesse.');
    await openPage({ load: () => { throw new TypeError('Failed to fetch'); } });
    assert.equal(text(document.querySelector('h1')), 'Non riesco ad aprire il questionario');
    assert.equal(text(document.querySelector('.text')), 'Connessione non riuscita. Controlla la rete e riprova.');
    assert.ok(button('Riprova'));
  });

  it('chi ha già risposto vede la data, chi torna vede le domande che mancano', async () => {
    await openPage({ storage: { [`questionario:${TOKEN}:inviato`]: '2026-11-27' } });
    assert.equal(document.title, 'Hai già risposto');
    assert.equal(text(document.querySelector('.text')), 'Le tue risposte sono arrivate il 27/11/2026: non serve compilarlo di nuovo. Ora puoi chiudere questa pagina.');
    const stored = JSON.stringify({ session: '0b6f3c2e-8d1a-4c5b-9e7f-1a2b3c4d5e6f', index: 2, draft: { eta: 'oltre-30', volte: '4' }, savedAt: Date.now() });
    await openPage({ storage: { [`questionario:${TOKEN}`]: stored } });
    assert.equal(text(document.querySelector('.text')), 'Ti mancano 3 domande su 5: le risposte che avevi dato sono ancora qui, riprendi da dove eri.');
    assert.ok(button('Riprendi'));
  });
});
