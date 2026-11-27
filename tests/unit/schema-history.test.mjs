import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CURRENCIES, MOVEMENT_TYPES, SPLIT_MODES } from '../../assets/js/expenses.js';
import {
  KINDS,
  TECH_SUGGESTIONS,
  DEFAULT_EQUITY_FACTORS,
  describePath,
  fieldOf,
  formatValue,
  kindOf,
  optionLabel,
  roadmapMark,
  sanitizeSnapshot,
  snapshotProblem,
  statusLabel,
} from '../../assets/js/schema.js';

// Le parti dello storico e delle schede che non avevano ancora una prova: le etichette italiane restano queste.
const IDEA = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const GROUP = '33333333-3333-4333-8333-333333333333';
const AT = '2026-10-20T10:00:00.000Z';

const ctx = {
  ideaTitle: (id) => (id === IDEA ? 'Idea alfa' : null),
  memberName: (id) => (id === MEMBER ? 'Bruno' : null),
  personName: (id) => ({ p1: 'Anna' })[id] || null,
  itemTitle: (id) => (id === GROUP ? 'Costi della startup' : null),
  criterionLabel: (key) => (key === 'mercato' ? 'Mercato' : null),
  axisLabel: (id) => ({ 'r-a': 'XAI', 'c-x': 'Settore A' })[id] || null,
};

describe('etichette dello storico', () => {
  for (const [kind, path, expected] of [
    ['competitors', 'data.gap', 'Il vuoto che vogliamo colmare'],
    ['competitors', 'data.features#f-a.label', 'Funzionalità confrontate'],
    ['competitors', 'data.features.#order', 'Funzionalità confrontate'],
    ['competitors', 'data.rivals#c-a.x', 'Concorrenti'],
    ['competitors', 'data.axes.x.low', 'Assi del grafico'],
    ['competitors', 'data.us.y', 'La nostra posizione nel grafico'],
    ['equity', 'data.vesting', 'Vesting e accordi tra soci'],
    ['equity', 'data.factors#idea.weight', 'Fattori e pesi'],
    ['equity', 'data.founders#f-a.name', 'Fondatori'],
    ['equity', 'data.scores.idea:f-a', 'Punteggi'],
    ['expensegroup', 'title', 'Nome del gruppo'],
    ['expensegroup', 'data.people#p1.name', 'Persone'],
    ['expensegroup', 'data.currency', 'Valuta'],
    ['expense', 'title', 'Descrizione'],
    ['expense', 'data.group', 'Gruppo'],
    ['expense', 'data.amount', 'Importo'],
    ['expense', 'data.receipt', 'Scontrino'],
    ['expense', 'data.split', 'Divisione'],
    ['expense', 'data.split.mode', 'Divisione › modo'],
    ['expense', 'data.split.shares.p1', 'Divisione › Anna'],
    ['expense', 'data.split.shares.p9', 'Divisione'],
    ['scoresnap', 'title', 'Nome'],
    ['scoresnap', 'data.criteria#mercato.label', 'Criteri'],
    ['scoresnap', 'data.ideas.#order', 'Idee'],
    ['scoresnap', 'data.names.x', 'Nomi'],
    ['scoresnap', 'data.altro', 'altro'],
    ['score', `data.scores.${IDEA}.boh`, 'Voti › Idea alfa › boh'],
    ['generator', 'data.rows', 'Righe'],
    ['generator', 'data.cols#c-x.others', 'Colonne › Settore A › persone'],
    ['generator', 'data.cols#c-y.label', 'Colonne › c-y'],
    ['generator', 'data.cells.r-a:c-y.text', 'XAI × c-y'],
    ['criteria', 'data.criteria#mercato.description', 'Criteri › Mercato › Descrizione'],
    ['criteria', 'data.criteria#nuovo.label', 'Criteri › nuovo › Nome'],
    ['contact', 'title', 'Chi è (nome o ruolo)'],
    ['contact', 'data.goal', 'Cosa vogliamo capire o ottenere'],
    ['deeptech', 'data.trl_now', 'TRL attuale'],
    ['persona', 'data.early_adopter', 'È un early adopter?'],
    ['market', 'data.tam', 'TAM: mercato totale (euro all\'anno)'],
    ['market', 'data.sconosciuto', 'sconosciuto'],
    ['vpc', 'data.pain_relievers', 'Come riduciamo i pains'],
    ['note', 'data.body', 'Testo'],
    ['teamcanvas', 'data.purpose', 'Scopo'],
    ['canvas', 'idea_id', 'Idea collegata'],
    ['canvas', 'data.validated.revenue', 'Flussi di ricavo › validato'],
    ['idea', 'data.roadmap.mentor', 'Roadmap › mentor'],
    ['survey', 'data.thanks_contact', 'Messaggio per chi vuole essere ricontattato'],
    ['survey', 'data.appearance.font', 'Aspetto'],
  ]) {
    it(`${kind} ${path} si legge «${expected}»`, () => {
      assert.equal(describePath(kind, path, ctx), expected);
    });
  }

  it('senza contesto i nomi mancano e restano idea e chiave', () => {
    assert.equal(describePath('score', `data.scores.${IDEA}.mercato`), 'Voti › Idea › mercato');
    assert.equal(describePath('score', `data.notes.${IDEA}`), 'Note › Idea');
    assert.equal(describePath('generator', 'data.cells.r-a:c-x'), 'r-a × c-x');
  });
});

describe('valori dello storico', () => {
  const photo = `data:image/jpeg;base64,${'A'.repeat(200)}`;
  for (const [kind, path, value, expected, context = ctx] of [
    // In italiano le migliaia si separano solo da cinque cifre in su.
    ['expense', 'data.amount', 123456, '1234,56'],
    ['expense', 'data.amount', 1234567, '12.345,67'],
    ['expense', 'data.amount', 5, '0,05'],
    ['expense', 'data.amount', 0, '0,00'],
    ['expense', 'data.amount', '12', '12'],
    ['expense', 'data.paid_by', 'p1', 'Anna'],
    ['expense', 'data.paid_by', 'p9', 'Persona'],
    ['expense', 'data.group', GROUP, 'Costi della startup'],
    ['expense', 'data.group', IDEA, 'Gruppo'],
    ['expense', 'data.split.mode', 'parti', SPLIT_MODES[0][1]],
    ['expense', 'data.split.mode', 'boh', 'boh'],
    ['expense', 'data.type', 'rimborso', MOVEMENT_TYPES[1][1]],
    ['expense', 'data.receipt', photo, 'foto'],
    ['expensegroup', 'data.currency', 'EUR', `EUR, ${CURRENCIES[0][1]}`],
    ['experiment', 'data.method', 'interviste', 'Interviste'],
    ['experiment', 'data.owner', MEMBER, 'Bruno'],
    ['experiment', 'data.owner', MEMBER, 'Membro', {}],
    ['interview', 'data.experiment_id', IDEA, 'Esperimento', {}],
    ['contact', 'data.interview_id', IDEA, 'Intervista', {}],
    ['contact', 'data.purpose', 'design_partner', 'Possibile design partner'],
    ['canvas', 'idea_id', IDEA, 'Idea', {}],
    ['market', 'data.som_year', 2027, 2027],
    ['deeptech', 'data.trl_now', '4', 'TRL 4: tecnologia validata in laboratorio'],
    ['persona', 'data.gender', 'qualsiasi', 'Qualsiasi'],
    ['survey', 'data.thanks_image.path', 'x.jpg', 'immagine caricata'],
    ['survey', 'data.show_time', false, 'no'],
    ['survey', 'data.show_time', true, 'sì'],
    ['survey', 'data.appearance.theme', 'contrasto', 'Contrasto elevato'],
    ['survey', 'data.appearance.theme', 'boh', 'boh'],
    ['survey', 'data.progress', 'barra', 'Barra di avanzamento'],
    ['idea', 'data.roadmap.mentor', 'non un segno', ''],
    ['idea', 'data.roadmap.mentor', roadmapMark('done', MEMBER, AT), 'fatto (Membro)', {}],
    ['idea', 'data.roadmap.deeptech', roadmapMark('skip', MEMBER, AT), 'non serve (Bruno)'],
    ['idea', 'data.pitch', null, ''],
  ]) {
    it(`${kind} ${path} = ${JSON.stringify(value)} si mostra «${expected}»`, () => {
      assert.equal(formatValue(kind, path, value, context), expected);
    });
  }

  it('gli elenchi di persone e idee si mostrano uno per uno, anche quando arriva un solo id', () => {
    assert.deepEqual(formatValue('decision', 'data.ideas', [IDEA, MEMBER], ctx), ['Idea alfa', 'Idea']);
    assert.deepEqual(formatValue('decision', 'data.decided_by', MEMBER, {}), ['Membro']);
  });
});

describe('controlli prima del salvataggio', () => {
  it('un movimento ha bisogno di un gruppo e di un importo maggiore di zero', () => {
    const movement = (data) => sanitizeSnapshot('expense', { title: 'Dominio', data });
    assert.equal(snapshotProblem('expense', movement({ amount: 3000 })), 'Manca il gruppo di spese.');
    assert.equal(snapshotProblem('expense', movement({ group: GROUP })), 'Scrivi un importo maggiore di zero.');
    assert.equal(snapshotProblem('expense', movement({ group: GROUP, amount: 3000 })), null);
    assert.equal(snapshotProblem('expense', { ...movement({ group: GROUP, amount: 3000 }), title: '' }), 'Manca il campo "Descrizione".');
    assert.equal(snapshotProblem('expensegroup', { title: '', idea_id: null, data: {} }), 'Manca il campo "Nome del gruppo".');
  });

  it('le schede della squadra non chiedono né titolo né idea', () => {
    for (const kind of ['teamcanvas', 'equity', 'criteria', 'score', 'generator', 'availability']) {
      assert.equal(snapshotProblem(kind, { title: '', idea_id: null, data: {} }), null, kind);
    }
  });
});

describe('definizioni delle schede', () => {
  it('kindOf dà la definizione di un tipo, o niente per un tipo sconosciuto', () => {
    assert.equal(kindOf('idea'), KINDS.idea);
    assert.equal(kindOf('boh'), null);
    assert.equal(kindOf(undefined), null);
  });

  it('optionLabel dà il nome di un opzione, o il valore stesso se non la conosce', () => {
    const method = fieldOf('experiment', 'method');
    assert.equal(optionLabel(method, 'concierge'), 'Servizio manuale (concierge)');
    assert.equal(optionLabel(method, 'boh'), 'boh');
    assert.equal(optionLabel(null, 'boh'), 'boh');
    assert.equal(optionLabel(fieldOf('idea', 'pitch'), 'x'), 'x');
  });

  it('statusLabel dà il nome dello stato, il valore se è sconosciuto e niente senza stato', () => {
    assert.equal(statusLabel('contact', 'fissata'), 'Incontro fissato');
    assert.equal(statusLabel('contact', 'boh'), 'boh');
    assert.equal(statusLabel('canvas', null), '');
    assert.equal(statusLabel('boh', undefined), '');
  });

  it('i suggerimenti di tecnologia e i fattori delle quote sono quelli proposti alla squadra', () => {
    assert.deepEqual(TECH_SUGGESTIONS, [
      'Inverse design',
      'Vincoli dichiarativi',
      'Agenti generativi (LLM)',
      'Explainable AI',
      'Spiegazioni controfattuali',
      'Previsione di serie temporali',
      'Ottimizzazione con vincoli',
      'LLM come interfaccia',
      'Modelli ad agenti',
    ]);
    assert.deepEqual(DEFAULT_EQUITY_FACTORS.map((f) => [f.key, f.label, f.weight]), [
      ['idea', 'Idea', 5],
      ['business-plan', 'Business plan', 5],
      ['esperienza', 'Esperienza nel settore', 5],
      ['rischio', 'Rischio e impegno', 5],
      ['responsabilita', 'Responsabilità', 5],
    ]);
    const clean = sanitizeSnapshot('equity', { data: { factors: DEFAULT_EQUITY_FACTORS } });
    assert.deepEqual(clean.data.factors, DEFAULT_EQUITY_FACTORS, 'i fattori proposti sono già validi');
  });
});
