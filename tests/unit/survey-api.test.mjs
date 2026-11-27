// The data layer of the public survey page: only the three public functions, errors turned into codes the page can
// put into words in its own language, and meta reduced to what submit_survey accepts.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PREFER_NOT, PublicSurveyError, coverUrl, loadPublicSurvey, newSurveySession, recordSurveyEvent, submitSurvey } from '../../assets/js/public/survey-api.js';
import { CONFIG } from '../../assets/js/config.js';

const fake = globalThis.__fakeSupabase;
const TOKEN = 'Qx7pL2mN9vR4tY6wZ1bC3d';
const rpcCalls = () => fake.calls.filter(([kind]) => kind === 'rpc');

beforeEach(() => fake.reset());

describe('client della pagina pubblica', () => {
  it('usa la chiave anon senza sessione né rinnovi', () => {
    assert.equal(fake.key, CONFIG.supabaseAnonKey);
    assert.deepEqual(fake.options.auth, { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
  });

  it('ogni compilazione ha un uuid v4 e la risposta riservata ha il suo id', () => {
    assert.match(newSurveySession(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.notEqual(newSurveySession(), newSurveySession());
    assert.equal(PREFER_NOT, 'non-rispondo');
  });

  it('le immagini arrivano solo dallo spazio pubblico dei questionari', () => {
    assert.equal(coverUrl('a/b.jpg'), `${CONFIG.supabaseUrl}/storage/v1/object/public/questionari-immagini/a/b.jpg`);
  });
});

describe('caricamento del questionario', () => {
  it('un codice malformato non arriva mai al database', async () => {
    for (const token of ['', 'corto', `${TOKEN}x`, null, 42]) assert.deepEqual(await loadPublicSurvey(token), { status: 'non_trovato' }, String(token));
    assert.deepEqual(rpcCalls(), []);
  });

  it('restituisce quello che manda il database, e niente diventa «non trovato»', async () => {
    fake.responses.rpc.public_survey = { data: { status: 'aperto', title: 'T' }, error: null };
    assert.deepEqual(await loadPublicSurvey(TOKEN), { status: 'aperto', title: 'T' });
    assert.deepEqual(rpcCalls(), [['rpc', 'public_survey', { p_token: TOKEN }]]);
    fake.responses.rpc.public_survey = { data: null, error: null };
    assert.deepEqual(await loadPublicSurvey(TOKEN), { status: 'non_trovato' });
  });

  for (const [what, response, code] of [
    ['troppi tentativi', { data: null, error: { status: 429, message: 'Too Many Requests' } }, 'rate_limit'],
    ['rete assente', () => { throw new TypeError('Failed to fetch'); }, 'network'],
    ['errore del server', { data: null, error: { status: 500, message: 'boom' } }, 'server'],
  ]) {
    it(`con ${what} lancia un errore con il codice ${code}, che la pagina traduce`, async () => {
      fake.responses.rpc.public_survey = response;
      await assert.rejects(loadPublicSurvey(TOKEN), (error) => error instanceof PublicSurveyError && error.code === code && error.name === 'PublicSurveyError');
    });
  }
});

describe('invio delle risposte', () => {
  it('passa al database solo i dati di meta che accetta, ripuliti', async () => {
    fake.responses.rpc.submit_survey = { data: { status: 'ok' }, error: null };
    const meta = { session: 's', final: true, duration_seconds: -3.4, device: 'tablet', recontact: true, website: '', extra: 'no', times: { a: 2.5, b: -1, c: 'x' } };
    assert.deepEqual(await submitSurvey(TOKEN, { a: 1 }, meta), { status: 'ok' });
    assert.deepEqual(rpcCalls(), [['rpc', 'submit_survey', { p_token: TOKEN, p_answers: { a: 1 }, p_meta: { session: 's', final: true, duration_seconds: 0, recontact: true, website: '', times: { a: 2.5 } } }]]);
    await submitSurvey(TOKEN, null, { device: 'telefono', duration_seconds: 94.6, times: [1] });
    assert.deepEqual(rpcCalls()[1][2], { p_token: TOKEN, p_answers: {}, p_meta: { duration_seconds: 95, device: 'telefono' } });
  });

  it('un link malformato risponde con il codice del database per un questionario che non c è, senza chiamarlo', async () => {
    for (const token of ['corto', TOKEN.slice(1), `${TOKEN}x`, `${TOKEN.slice(1)}.`, '', null, 42]) {
      assert.deepEqual(await submitSurvey(token, {}), { status: 'errore', reason: 'survey_not_found' }, String(token));
    }
    assert.deepEqual(rpcCalls(), []);
  });

  it('il motivo di un rifiuto arriva alla pagina com è, come codice', async () => {
    fake.responses.rpc.submit_survey = { data: { status: 'errore', reason: 'required_missing', question: 'eta' }, error: null };
    assert.deepEqual(await submitSurvey(TOKEN, {}), { status: 'errore', reason: 'required_missing', question: 'eta' });
  });

  it('una risposta vuota del database è un errore senza motivo: la pagina mostra il suo messaggio di invio fallito', async () => {
    fake.responses.rpc.submit_survey = { data: null, error: null };
    assert.deepEqual(await submitSurvey(TOKEN, {}), { status: 'errore' });
  });

  it('gli errori di rete diventano un codice', async () => {
    fake.responses.rpc.submit_survey = () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(submitSurvey(TOKEN, {}), (error) => error.code === 'network');
  });
});

describe('visite e inizi', () => {
  it('si registrano solo con un codice valido e un tipo noto, e un errore non ferma mai chi risponde', async () => {
    await recordSurveyEvent(TOKEN, 'view');
    await recordSurveyEvent(TOKEN, 'altro');
    await recordSurveyEvent('corto', 'start');
    assert.deepEqual(rpcCalls(), [['rpc', 'survey_event', { p_token: TOKEN, p_kind: 'view' }]]);
    fake.responses.rpc.survey_event = () => { throw new TypeError('Failed to fetch'); };
    await assert.doesNotReject(recordSurveyEvent(TOKEN, 'start'));
  });
});
