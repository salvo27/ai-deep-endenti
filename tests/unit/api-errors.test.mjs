import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AppError, api, toAppError } from '../../assets/js/lib/api.js';
import { tx } from '../../assets/js/i18n/index.js';
import { PROJECT } from '../setup/fixtures.mjs';

const fake = globalThis.__fakeSupabase;
const GENERIC = 'Operazione non riuscita. Riprova.';

describe('codici del database', () => {
  for (const [code, text] of Object.entries(tx.serverErrors)) {
    it(`${code} diventa «${text}»`, () => {
      const error = toAppError({ code: 'P0001', message: code });
      assert.equal(error.message, text);
      assert.equal(error.code, code, 'il codice resta, per chi deve distinguere i casi');
    });
  }

  for (const [sqlstate, code] of [['42501', 'not_allowed'], ['P0002', 'project_not_found'], ['22023', 'invalid_role'], ['P0001', 'cross_project']]) {
    it(`il codice ${code} vale con qualunque SQLSTATE, qui ${sqlstate}`, () => {
      assert.equal(toAppError({ code: sqlstate, message: code }).message, tx.serverErrors[code]);
    });
  }

  for (const message of ['codice_nuovo_che_il_sito_non_conosce', 'constructor', '__proto__', 'hasownproperty']) {
    it(`un codice sconosciuto (${message}) dà il testo generico, senza mostrarlo`, () => {
      const error = toAppError({ code: 'P0001', message });
      assert.equal(error.message, GENERIC);
      assert.doesNotMatch(error.message, new RegExp(message));
    });
  }

  it('un codice sconosciuto con un SQLSTATE noto dà il testo del SQLSTATE', () => {
    const error = toAppError({ code: '42501', message: 'codice_nuovo' });
    assert.equal(error.message, 'Non hai i permessi per questa operazione.');
    assert.equal(error.code, '42501');
  });

  it('un codice sconosciuto dà il testo di ripiego della chiamata quando c è', () => {
    assert.equal(toAppError({ code: 'P0001', message: 'codice_nuovo' }, 'Salvataggio non riuscito.').message, 'Salvataggio non riuscito.');
  });

  for (const message of ['Not_allowed', 'not allowed', 'not-allowed', 'not_allowed2', 'not_allowed\n', '']) {
    it(`${JSON.stringify(message)} non è un codice: vale il SQLSTATE`, () => {
      assert.equal(toAppError({ code: '42501', message }).message, 'Non hai i permessi per questa operazione.');
    });
  }

  it('le regole di accesso di Postgres rifiutano con il loro testo, senza dettagli interni', () => {
    const error = toAppError({ code: '42501', message: 'new row violates row-level security policy for table "items"' });
    assert.equal(error.message, 'Non hai i permessi per questa operazione.');
    assert.equal(error.code, '42501');
  });
});

describe('errori di accesso, di rete e di stato', () => {
  for (const [error, text] of [
    [{ code: 'invalid_credentials', message: 'Invalid login credentials' }, 'Email o password non corretti.'],
    [{ code: 'mfa_verification_failed' }, 'Codice non valido. Controlla l\'orario del telefono e riprova.'],
    [{ code: 'signup_disabled' }, 'Le registrazioni sono chiuse: gli account li crea l\'amministratore.'],
    [{ code: '23505', message: 'duplicate key value violates unique constraint' }, 'Esiste già un elemento di questo tipo.'],
    [{ code: '22P02', message: 'invalid input syntax for type uuid' }, 'Alcuni dati non sono validi.'],
    [{ code: 'PGRST301', message: 'JWT expired' }, 'Sessione scaduta. Accedi di nuovo.'],
    [{ status: 429 }, 'Troppi tentativi. Aspetta qualche minuto e riprova.'],
    [{ name: 'TypeError', message: 'Failed to fetch' }, 'Connessione non riuscita. Controlla la rete e riprova.'],
    [{ code: 'XX000', message: 'segreto interno' }, GENERIC],
    [null, GENERIC],
  ]) {
    it(`${JSON.stringify(error)} diventa «${text}»`, () => {
      assert.equal(toAppError(error).message, text);
    });
  }

  it('un errore già tradotto resta com è', () => {
    const original = new AppError('già tradotto');
    assert.equal(toAppError(original), original);
  });
});

describe('errori delle funzioni di Supabase', () => {
  beforeEach(() => {
    fake.reset();
    api.useProject(PROJECT);
  });
  afterEach(() => api.useProject(null));

  const failing = (payload) => ({ data: null, error: { context: { status: 403, json: async () => payload } } });

  it('un codice della funzione diventa il suo testo', async () => {
    fake.responses.functions.claude = failing({ error: 'not_allowed' });
    await assert.rejects(api.invokeClaude('critique', 'x'), (e) => e.message === tx.serverErrors.not_allowed && e.status === 403);
  });

  it('un codice sconosciuto della funzione dà il testo di ripiego', async () => {
    fake.responses.functions.claude = failing({ error: 'qualcosa_di_nuovo' });
    await assert.rejects(api.invokeClaude('critique', 'x'), /Claude non è disponibile/);
  });

  it('una frase della funzione passa così com è, al massimo 300 caratteri', async () => {
    fake.responses.functions.claude = failing({ error: `Hai raggiunto il limite di 40 richieste ${'x'.repeat(400)}` });
    await assert.rejects(api.invokeClaude('critique', 'x'), (e) => /limite di 40/.test(e.message) && e.message.length === 300);
  });
});

describe('errori del sito', () => {
  it('un identificativo malformato e un progetto mancante hanno il loro testo', async () => {
    await assert.rejects(api.itemHistory('x'), (e) => e.code === 'invalid_id' && e.message === 'Identificativo non valido.');
    api.useProject(null);
    await assert.rejects(api.listItems(), (e) => e.code === 'no_project' && e.message === tx.errors.noProject);
  });
});
