import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CHAPTERS, CONCEPTS, VERIFIED_ON, conceptByKey } from '../../assets/js/concepts.js';
import { CONCEPTS_INTRO } from '../../assets/js/views/concepts.js';

// The tests run in Italian: the texts moved to i18n/it/concepts.js must read exactly as before.
describe('concetti in italiano', () => {
  it('i capitoli e la data della verifica sono quelli di sempre', () => {
    assert.deepEqual(CHAPTERS, [
      [1, 'Le basi'],
      [2, 'Prima di partire'],
      [3, 'Validazione'],
      [4, 'Lean Startup'],
      [5, 'Mercato e concorrenti'],
      [6, 'Team'],
      [7, 'Finanziamenti e pitch'],
      [8, 'Marketing e vendite'],
      [9, 'Aspetti economici e finanziari'],
      [10, 'Aspetti legali'],
      [11, 'Deep tech'],
    ]);
    assert.equal(VERIFIED_ON, '17 ottobre 2026');
    assert.equal(
      CONCEPTS_INTRO,
      'I concetti di «Il manuale dello startupper» e del capitolo sul deep tech, spiegati in breve e collegati agli strumenti della board. Norme e dati verificati il 17 ottobre 2026: ricontrollali prima di decidere.',
    );
  });

  for (const [key, term] of [
    ['startup', 'Startup'],
    ['tam-sam-som', 'TAM, SAM e SOM'],
    ['buyer-persona', 'Buyer persona'],
    ['javelin', 'Javelin Board'],
    ['mom-test', 'Il «Mom Test»'],
    ['lean-canvas', 'Lean Canvas'],
  ]) {
    it(`il concetto ${key} si chiama ancora «${term}»`, () => {
      assert.equal(conceptByKey(key).term, term);
    });
  }

  it('i nomi uguali nelle due lingue e quelli tradotti danno sempre un termine e una spiegazione', () => {
    assert.equal(CONCEPTS.length, 96);
    for (const concept of CONCEPTS) {
      assert.equal(typeof concept.term, 'string', concept.key);
      assert.ok(concept.term.length > 0, concept.key);
      assert.ok(concept.text.length > 60, concept.key);
    }
    assert.equal(conceptByKey('startup').where, 'Il passo «Verificate che sia una startup» nella roadmap di ogni idea');
  });
});
