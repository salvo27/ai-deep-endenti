import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { looksItalian } from '../setup/italian.mjs';

// On a device in English: the site language is decided when it loads, so the modules are imported after the choice.
useLanguage('en');
const { api, toAppError } = await import('../../assets/js/lib/api.js');
const store = await import('../../assets/js/store.js');
const { language, tx } = await import('../../assets/js/i18n/index.js');

describe('errori in inglese', () => {
  it('il sito è in inglese', () => {
    assert.equal(language, 'en');
  });

  for (const [code, text] of Object.entries(tx.serverErrors)) {
    it(`il codice ${code} si legge in inglese`, () => {
      assert.equal(toAppError({ code: 'P0001', message: code }).message, text);
      assert.equal(looksItalian(text), false, text);
    });
  }

  for (const [error, text] of [
    [{ code: 'P0001', message: 'codice_nuovo' }, 'Something went wrong. Please try again.'],
    [{ code: '42501', message: 'new row violates row-level security policy' }, 'You do not have permission to do this.'],
    [{ code: 'invalid_credentials' }, 'Wrong email or password.'],
    [{ status: 429 }, 'Too many attempts. Wait a few minutes and try again.'],
    [{ name: 'TypeError', message: 'Failed to fetch' }, 'Could not connect. Check your network and try again.'],
    [null, 'Something went wrong. Please try again.'],
  ]) {
    it(`${JSON.stringify(error)} diventa «${text}»`, () => {
      assert.equal(toAppError(error).message, text);
    });
  }

  it('ogni testo di errore è in inglese', () => {
    const walk = (value) => (typeof value === 'string' ? [value] : typeof value === 'object' && value ? Object.values(value).flatMap(walk) : []);
    assert.deepEqual(walk(tx.errors).filter(looksItalian), []);
  });

  it('gli esiti di salvataggio e la persona che non c è più si leggono in inglese', () => {
    assert.equal(store.statusError('conflict').message, 'Someone changed this item in the meantime.');
    assert.equal(store.statusError('boh').message, 'Something went wrong. Please try again.');
    assert.equal(store.memberName('00000000-0000-4000-8000-00000000000f'), 'Former member');
    assert.equal(store.memberName(null), 'System');
  });

  it('senza progetto aperto lo dice in inglese', async () => {
    api.useProject(null);
    await assert.rejects(api.listItems(), (e) => e.code === 'no_project' && !looksItalian(e.message));
  });
});
