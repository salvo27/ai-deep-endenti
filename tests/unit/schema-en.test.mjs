import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { italianWords } from '../setup/italian.mjs';

// On a device in English: the site language is decided when it loads, so the modules are imported after the choice.
useLanguage('en');
const schema = await import('../../assets/js/schema.js');
const { language } = await import('../../assets/js/i18n/index.js');
const { dayName, hoursText, shortDate } = await import('../../assets/js/availability.js');
const { areaLabel, clockText, durationText } = await import('../../assets/js/timesheet.js');
const { CURRENCIES, MOVEMENT_TYPES, SPLIT_MODES } = await import('../../assets/js/expenses.js');
const { boards: english } = await import('../../assets/js/i18n/en/boards.js');
const { boards: italiano } = await import('../../assets/js/i18n/it/boards.js');

const { KINDS, describePath, formatValue, snapshotProblem, statusLabel, fieldOf, optionLabel } = schema;

const IDEA = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const GROUP = '33333333-3333-4333-8333-333333333333';
const AT = '2026-10-20T10:00:00.000Z';

// English data, so that Italian words in a result can only come from the site.
const ctx = {
  ideaTitle: (id) => (id === IDEA ? 'Smart scheduling' : null),
  memberName: (id) => (id === MEMBER ? 'Bruno' : null),
  personName: (id) => ({ p1: 'Anna' })[id] || null,
  itemTitle: (id) => (id === GROUP ? 'Startup costs' : null),
  criterionLabel: (key) => (key === 'mercato' ? 'Market size' : null),
  axisLabel: (id) => ({ 'r-a': 'XAI', 'c-x': 'Healthcare' })[id] || null,
  questionLabel: (id) => (id === 'ruolo' ? 'What is your job?' : null),
  roadmapStep: (key) => (key === 'mentor' ? 'Find a mentor' : null),
};

// Words that the Italian detector knows but English uses too: the shared ones of tests/setup/italian.mjs, "buyer
// persona", which is the English term, "per", as in "one per line", and the prefix "non-", as in "non-dilutive".
const ENGLISH_TOO = new Set(['idea', 'canvas', 'roadmap', 'team', 'advisor', 'email', 'link', 'pitch', 'persona', 'per']);
const italianIn = (text) => italianWords(String(text).replace(/\bnon-(?=[a-z])/gi, '')).filter((word) => !ENGLISH_TOO.has(word));

// Labels that other modules write (currencies, transaction types, expense categories): they are translated there.
const FROM_OTHER_MODULES = new Set(['expensegroup.currency', 'expense.type', 'expense.currency', 'expense.category']);

/** Every text of the board definitions that a person reads, with where it comes from. */
function boardTexts() {
  const out = [];
  const add = (where, text) => {
    if (text !== undefined) out.push([where, text]);
  };
  for (const [kind, def] of Object.entries(KINDS)) {
    for (const prop of ['label', 'plural', 'titleLabel', 'titlePlaceholder']) add(`${kind}.${prop}`, def[prop]);
    for (const [value, label] of def.statuses || []) add(`${kind}.status.${value}`, label);
    for (const f of def.fields) {
      for (const prop of ['label', 'help', 'placeholder', 'group']) add(`${kind}.${f.key}.${prop}`, f[prop]);
      if (!FROM_OTHER_MODULES.has(`${kind}.${f.key}`)) for (const [value, label] of f.options || []) add(`${kind}.${f.key}.${value}`, label);
    }
  }
  const lists = ['COMMITMENT', 'INTERVIEW_SOURCES', 'TRL', 'IMPORTANCE', 'QUESTION_TYPES', 'QUESTION_ROLES', 'SURVEY_LAYOUTS', 'SURVEY_PROGRESS', 'SURVEY_THEMES'];
  for (const name of lists) for (const [value, label] of schema[name]) add(`${name}.${value}`, label);
  for (const block of [...schema.CANVAS_BLOCKS, ...schema.TEAM_BLOCKS]) {
    add(`block.${block.key}.label`, block.label);
    add(`block.${block.key}.help`, block.help);
  }
  schema.TECH_SUGGESTIONS.forEach((text, i) => add(`TECH_SUGGESTIONS[${i}]`, text));
  for (const factor of schema.DEFAULT_EQUITY_FACTORS) add(`DEFAULT_EQUITY_FACTORS.${factor.key}`, factor.label);
  for (const c of schema.DEFAULT_CRITERIA) {
    add(`DEFAULT_CRITERIA.${c.key}.label`, c.label);
    add(`DEFAULT_CRITERIA.${c.key}.description`, c.description);
  }
  return out;
}

describe('schede in inglese', () => {
  it('il sito è in inglese su un dispositivo in inglese', () => {
    assert.equal(language, 'en');
  });

  it('ogni testo delle schede è una frase non vuota', () => {
    const texts = boardTexts();
    assert.ok(texts.length > 400, `testi: ${texts.length}`);
    assert.deepEqual(texts.filter(([, text]) => typeof text !== 'string' || !text.trim()).map(([where]) => where), []);
  });

  it('nessun testo delle schede è rimasto in italiano', () => {
    const leftovers = boardTexts()
      .filter(([, text]) => italianIn(text).length)
      .map(([where, text]) => `${where}: ${text} (${italianIn(text).join(', ')})`);
    assert.deepEqual(leftovers, []);
  });

  for (const [kind, label, plural, titleLabel] of [
    ['idea', 'Idea', 'Ideas', 'Idea name'],
    ['canvas', 'Lean Canvas', 'Lean Canvases', 'Title'],
    ['experiment', 'Experiment', 'Experiments', 'What we want to find out'],
    ['interview', 'Interview', 'Interviews', 'Title'],
    ['decision', 'Decision', 'Decisions', 'Decision in short'],
    ['contact', 'Person to talk to', 'People to talk to', 'Who they are (name or role)'],
    ['deeptech', 'Deep tech sheet', 'Deep tech sheets', 'Title'],
    ['persona', 'Buyer persona', 'Buyer personas', 'Name'],
    ['vpc', 'Value Proposition Canvas', 'Value Proposition Canvases', 'Title'],
    ['market', 'Market', 'Market analysis', 'Title'],
    ['competitors', 'Competitor analysis', 'Competitor analysis', 'Title'],
    ['survey', 'Survey', 'Surveys', 'Title'],
    ['note', 'Note', 'Notes', 'Title'],
    ['teamcanvas', 'Team Canvas', 'Team Canvas', 'Title'],
    ['equity', 'Equity split', 'Equity split', 'Title'],
    ['availability', 'Busy hours', 'Availability', 'Title'],
    ['timesheet', 'Hours worked', 'Hours worked', 'Title'],
    ['criteria', 'Scoring criteria', 'Criteria', 'Title'],
    ['score', 'Votes', 'Votes', 'Title'],
    ['scoresnap', 'Snapshot', 'Snapshots', 'Name'],
    ['generator', 'Generator', 'Generator', 'Title'],
    ['expensegroup', 'Expense group', 'Expenses', 'Group name'],
    ['expense', 'Transaction', 'Transactions', 'Description'],
  ]) {
    it(`${kind} si chiama ${label}, al plurale ${plural}`, () => {
      assert.deepEqual([KINDS[kind].label, KINDS[kind].plural, KINDS[kind].titleLabel], [label, plural, titleLabel]);
    });
  }

  it('la buyer persona ha un nome di fantasia inglese come esempio', () => {
    assert.equal(KINDS.persona.titlePlaceholder, 'A made-up name, for example Julia');
  });
});

describe('stati in inglese', () => {
  for (const [kind, labels] of [
    ['idea', { nuova: 'New', esplorazione: 'Exploring', validazione: 'Validating', scelta: 'Chosen', parcheggiata: 'Parked', scartata: 'Discarded' }],
    ['experiment', { pianificato: 'Planned', in_corso: 'Running', concluso: 'Done' }],
    ['interview', { da_fare: 'To do', fatta: 'Done', analizzata: 'Analysed' }],
    ['decision', { proposta: 'Proposed', presa: 'Made', rivista: 'Revised' }],
    ['contact', { da_contattare: 'To contact', contattata: 'Contacted, waiting', fissata: 'Meeting scheduled', in_contatto: 'In touch', chiusa: 'Closed or unavailable' }],
    ['survey', { bozza: 'Draft', aperto: 'Open', chiuso: 'Closed' }],
  ]) {
    it(`gli stati di ${kind} si leggono in inglese e si salvano come prima`, () => {
      assert.deepEqual(KINDS[kind].statuses, Object.entries(labels));
      for (const [value, label] of Object.entries(labels)) assert.equal(statusLabel(kind, value), label);
      assert.equal(schema.defaultStatus(kind), Object.keys(labels)[0]);
    });
  }

  it('uno stato sconosciuto si mostra com è, nessuno stato non si mostra', () => {
    assert.equal(statusLabel('idea', 'inventato'), 'inventato');
    assert.equal(statusLabel('canvas', null), '');
  });
});

describe('valori salvati', () => {
  // Il database e le schede salvate usano questi valori: cambiano le etichette, mai i valori.
  const STORED = {
    'experiment.assumption_type': ['problema', 'cliente', 'soluzione', 'prezzo', 'canale', 'tecnica', 'normativa'],
    'experiment.method': ['interviste', 'demo', 'landing', 'prevendita', 'dati', 'concierge', 'altro'],
    'experiment.decision': ['proseguire', 'cambiare', 'abbandonare'],
    'interview.source': ['colloquio', 'ricerca'],
    'interview.commitment': ['nessuno', 'interesse', 'demo', 'pilota', 'pagamento'],
    'contact.purpose': ['cliente', 'utente', 'esperto', 'realizzazione', 'design_partner', 'mentor', 'investitore', 'ateneo', 'norme', 'altro'],
    'deeptech.trl_now': ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    'deeptech.trl_target': ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    'deeptech.offer': ['prodotto', 'servizio', 'licenza', 'da_decidere'],
    'deeptech.ip_owner': ['ateneo', 'team', 'mista', 'da_chiarire'],
    'deeptech.company_form': ['spinoff', 'licenza', 'indipendente', 'da_decidere'],
    'persona.role_type': ['paga', 'usa', 'paga_usa', 'influenza'],
    'persona.early_adopter': ['si', 'forse', 'no'],
    'persona.gender': ['donna', 'uomo', 'qualsiasi'],
    'market.approach': ['top_down', 'bottom_up'],
    'survey.layout': ['una', 'sezioni'],
    'survey.progress': ['contatore', 'barra', 'nessuno'],
  };

  it('ogni campo a scelta ha le stesse opzioni di prima, nello stesso ordine', () => {
    const selects = Object.entries(KINDS)
      .flatMap(([kind, def]) => def.fields.filter((f) => f.type === 'select').map((f) => `${kind}.${f.key}`))
      .filter((key) => !FROM_OTHER_MODULES.has(key));
    assert.deepEqual(selects.sort(), Object.keys(STORED).sort());
    for (const [key, values] of Object.entries(STORED)) {
      const [kind, field] = key.split('.');
      assert.deepEqual(fieldOf(kind, field).options.map(([value]) => value), values, key);
    }
  });

  it('gli elenchi condivisi tengono i loro valori', () => {
    const values = (list) => list.map(([value]) => value);
    assert.deepEqual(values(schema.QUESTION_TYPES), ['sezione', 'scelta', 'scelte', 'scala', 'numero', 'breve', 'lunga', 'email']);
    assert.deepEqual(values(schema.QUESTION_ROLES), ['persona', 'problema', 'contatto', 'altro']);
    assert.deepEqual(values(schema.SURVEY_THEMES), ['automatico', 'chiaro', 'scuro', 'seppia', 'contrasto']);
    assert.deepEqual(values(schema.IMPORTANCE), ['alta', 'media', 'bassa']);
    assert.deepEqual(values(schema.COMMITMENT), STORED['interview.commitment']);
    assert.deepEqual(values(schema.INTERVIEW_SOURCES), STORED['interview.source']);
    assert.deepEqual(values(schema.TRL), STORED['deeptech.trl_now']);
    assert.deepEqual(values(schema.SURVEY_LAYOUTS), STORED['survey.layout']);
    assert.deepEqual(values(schema.SURVEY_PROGRESS), STORED['survey.progress']);
    assert.deepEqual(schema.CANVAS_BLOCKS.map((b) => [b.key, b.area, b.main === true]), [
      ['problem', 'prob', true], ['alternatives', 'prob', false], ['solution', 'sol', true], ['metrics', 'met', true],
      ['uvp', 'uvp', true], ['concept', 'uvp', false], ['advantage', 'adv', true], ['channels', 'chan', true],
      ['segments', 'seg', true], ['early_adopters', 'seg', false], ['costs', 'cost', true], ['revenue', 'rev', true],
    ]);
    assert.deepEqual(schema.TEAM_BLOCKS.map((b) => b.key), ['people', 'common_goals', 'personal_goals', 'purpose', 'values', 'needs', 'rules', 'strengths', 'weaknesses']);
    assert.deepEqual(schema.KINDS.canvas.fields.map((f) => f.key), schema.CANVAS_BLOCKS.map((b) => b.key));
    assert.deepEqual(schema.KINDS.teamcanvas.fields.map((f) => [f.key, f.rows]), schema.TEAM_BLOCKS.map((b) => [b.key, 3]));
  });

  it('una scheda nuova si salva con gli stessi valori in inglese', () => {
    assert.deepEqual(schema.sanitizeSnapshot('survey', { title: 'Shifts', idea_id: IDEA, data: {} }), {
      title: 'Shifts',
      status: 'bozza',
      idea_id: IDEA,
      data: { layout: 'una', progress: 'contatore', show_time: true, appearance: { theme: 'automatico', accent: schema.SURVEY_ACCENT }, questions: [] },
    });
    assert.equal(schema.sanitizeSnapshot('contact', { title: 'Dr Smith' }).status, 'da_contattare');
    assert.equal(schema.sanitizeSnapshot('interview', { title: 'X', data: { source: 'ricerca', commitment: 'pilota' } }).data.source, 'ricerca');
  });
});

describe('campi in inglese', () => {
  for (const [kind, key, expected] of [
    ['idea', 'pitch', { label: 'In one sentence', placeholder: 'We help [who] to [solve what] thanks to [how]' }],
    ['idea', 'why_us', { label: 'Why us', placeholder: 'Skills, data, contacts or research that others do not have' }],
    ['idea', 'resources', { label: 'Papers and links', placeholder: 'One reference per line' }],
    ['canvas', 'advantage', { label: 'Unfair advantage', help: 'What cannot be copied or bought' }],
    ['canvas', 'costs', { label: 'Cost structure', help: undefined }],
    ['experiment', 'assumption', { label: 'Riskiest assumption', placeholder: 'If it is false, the idea falls apart' }],
    ['experiment', 'success_criterion', { label: 'Success criterion', placeholder: 'Decided before starting. For example: at least 5 out of 15 ask for a demo' }],
    ['interview', 'source', { label: 'Type', help: 'Only conversations count as interviews in the numbers and in the roadmap.' }],
    ['interview', 'problem_intensity', { label: 'How much they feel the problem', help: '1 = not at all, 5 = it is a priority' }],
    ['interview', 'commitment', { label: 'Commitment made', help: 'Counts more than any compliment' }],
    ['decision', 'review_date', { label: 'Review by' }],
    ['contact', 'contact', { label: 'Contact', help: 'Email or phone, only if needed. It is never sent to Claude.' }],
    ['deeptech', 'trl_now', { label: 'Current TRL', group: 'Technology readiness' }],
    ['deeptech', 'milestone_cost', { label: 'Cost and length of the milestone', placeholder: 'For example: 80,000 euros, 9 months' }],
    ['deeptech', 'published', { label: 'Already published', group: 'Intellectual property', placeholder: 'Papers, theses, preprints, open source code: it can no longer be patented' }],
    ['persona', 'photo', { label: 'Photo', group: 'Profile', help: 'A stock or generated photo, not one of a real person: that would be personal data.' }],
    ['persona', 'income', { label: 'Income range', placeholder: 'Broad, for example €25,000-40,000 a year' }],
    ['vpc', 'jobs', { label: 'Jobs: what they want to get done', group: 'Customer profile', help: 'Functional, social and emotional tasks' }],
    ['market', 'tam', { label: 'TAM: total market (euros a year)', group: 'TAM: total market' }],
    ['market', 'som_basis', { label: 'SOM reasoning', placeholder: 'Competition, channels, team capacity: it must match the plan' }],
    ['competitors', 'gap', { label: 'The gap we want to fill' }],
    ['survey', 'intro', { label: 'Introduction', help: 'What the survey is for: it is the first thing respondents read.' }],
    ['note', 'body', { label: 'Text', help: 'The first line is the title. You can also write in Markdown: # headings, **bold**, - lists, | tables |.' }],
    ['teamcanvas', 'purpose', { label: 'Purpose', help: 'Why we do what we do' }],
    ['equity', 'vesting', { label: 'Vesting and founder agreements' }],
    ['expensegroup', 'currency', { label: 'Currency' }],
    ['expense', 'receipt', { label: 'Receipt' }],
  ]) {
    it(`${kind}.${key} si legge «${expected.label}»`, () => {
      const f = fieldOf(kind, key);
      for (const [prop, value] of Object.entries(expected)) assert.equal(f[prop], value, `${kind}.${key}.${prop}`);
    });
  }

  for (const [kind, key, value, label] of [
    ['experiment', 'assumption_type', 'prezzo', 'They are willing to pay'],
    ['experiment', 'method', 'landing', 'Landing page'],
    ['experiment', 'method', 'concierge', 'Manual service (concierge)'],
    ['experiment', 'decision', 'cambiare', 'Change direction'],
    ['interview', 'commitment', 'pagamento', 'Paid pilot or letter of intent'],
    ['interview', 'source', 'ricerca', 'Online research, without talking to anyone'],
    ['contact', 'purpose', 'design_partner', 'Possible design partner'],
    ['contact', 'purpose', 'norme', 'Legal or regulatory adviser'],
    ['deeptech', 'trl_now', '1', 'TRL 1: basic principles observed'],
    ['deeptech', 'trl_target', '9', 'TRL 9: system proven in a real operational environment'],
    ['deeptech', 'ip_owner', 'mista', 'Partly the university, partly the team'],
    ['deeptech', 'company_form', 'spinoff', 'University spin-off'],
    ['persona', 'early_adopter', 'si', 'Yes: has the problem, knows it and is looking for a solution'],
    ['persona', 'early_adopter', 'no', 'No'],
    ['persona', 'role_type', 'paga_usa', 'Pays and uses'],
    ['market', 'approach', 'bottom_up', 'Bottom-up: reachable customers times price'],
    ['survey', 'layout', 'sezioni', 'One section per screen'],
    ['survey', 'progress', 'contatore', 'Counter (Question 3 of 10)'],
  ]) {
    it(`${kind}.${key} = ${value} si legge «${label}»`, () => {
      assert.equal(optionLabel(fieldOf(kind, key), value), label);
    });
  }

  it('le valute, i tipi di movimento e le categorie vengono dal modulo delle spese', () => {
    assert.deepEqual(fieldOf('expensegroup', 'currency').options[0], ['EUR', `EUR, ${CURRENCIES[0][1]}`]);
    assert.deepEqual(fieldOf('expense', 'type').options, MOVEMENT_TYPES);
  });
});

describe('elenchi in inglese', () => {
  it('impegni, tipi di intervista, importanza e tipi di domanda', () => {
    assert.deepEqual(schema.COMMITMENT.map(([, label]) => label), ['None', 'General interest', 'Wants to see a demo', 'Open to a pilot', 'Paid pilot or letter of intent']);
    assert.deepEqual(schema.INTERVIEW_SOURCES.map(([, label]) => label), ['Conversation with a person', 'Online research, without talking to anyone']);
    assert.deepEqual(schema.IMPORTANCE.map(([, label]) => label), ['High', 'Medium', 'Low']);
    assert.deepEqual(schema.QUESTION_TYPES.map(([, label]) => label), ['Section title', 'Single choice', 'Multiple choice', 'Rating scale', 'Number', 'Short answer', 'Long answer', 'Contact email']);
    assert.deepEqual(schema.QUESTION_ROLES.map(([, label]) => label), ['Who is answering (socio-demographic data)', 'The problem', 'Contact', 'Other']);
    assert.deepEqual(schema.SURVEY_LAYOUTS.map(([, label]) => label), ['One question per screen', 'One section per screen']);
    assert.deepEqual(schema.SURVEY_PROGRESS.map(([, label]) => label), ['Counter (Question 3 of 10)', 'Progress bar', 'None']);
    assert.deepEqual(schema.SURVEY_THEMES.map(([, label]) => label), ['Same as the device', 'Light', 'Dark', 'Sepia', 'High contrast']);
  });

  it('i blocchi del Lean Canvas e del Team Canvas hanno i nomi inglesi dei due metodi', () => {
    const blocks = (list) => list.map((b) => b.label);
    assert.deepEqual(blocks(schema.CANVAS_BLOCKS), [
      'Problem', 'Existing alternatives', 'Solution', 'Key metrics', 'Unique value proposition', 'High-level concept',
      'Unfair advantage', 'Channels', 'Customer segments', 'Early adopters', 'Cost structure', 'Revenue streams',
    ]);
    assert.equal(schema.CANVAS_BLOCKS.find((b) => b.key === 'concept').help, 'For example "X for Y"');
    assert.equal('help' in schema.CANVAS_BLOCKS.find((b) => b.key === 'revenue'), false, 'senza aiuto non c è la voce');
    assert.deepEqual(blocks(schema.TEAM_BLOCKS), [
      'People and roles', 'Common goals', 'Personal goals', 'Purpose', 'Values', 'Needs and expectations', 'Rules and activities', 'Strengths', 'Weaknesses and risks',
    ]);
  });

  it('i suggerimenti di tecnologia sono in inglese', () => {
    assert.deepEqual(schema.TECH_SUGGESTIONS, [
      'Inverse design',
      'Declarative constraints',
      'Generative agents (LLMs)',
      'Explainable AI',
      'Counterfactual explanations',
      'Time series forecasting',
      'Constrained optimisation',
      'LLMs as interfaces',
      'Agent-based models',
    ]);
  });
});

describe('contenuti creati dal sito in inglese', () => {
  it('i criteri proposti sono in inglese, con le stesse chiavi e gli stessi pesi, e sono già validi', () => {
    assert.deepEqual(schema.DEFAULT_CRITERIA.map((c) => [c.key, c.label, c.weight]), [
      ['cliente', 'A customer we know', 3],
      ['demo', 'Demo in two months', 2],
      ['dati', 'Access to data', 3],
      ['competenze', 'Industry know-how', 3],
      ['mercato', 'Market', 2],
      ['concorrenza', 'Room against competitors', 2],
      ['difendibile', 'Defensible advantage', 2],
      ['team', 'Team fit', 2],
      ['ricavi', 'Time to first revenue', 2],
      ['norme', 'Regulatory simplicity', 1],
    ]);
    assert.equal(schema.DEFAULT_CRITERIA.find((c) => c.key === 'ricavi').description, '5 = revenue within six months');
    const clean = schema.sanitizeSnapshot('criteria', { data: { criteria: schema.DEFAULT_CRITERIA } });
    assert.deepEqual(clean.data.criteria, schema.DEFAULT_CRITERIA);
  });

  it('i fattori delle quote sono in inglese, con le stesse chiavi', () => {
    assert.deepEqual(schema.DEFAULT_EQUITY_FACTORS.map((f) => [f.key, f.label, f.weight]), [
      ['idea', 'Idea', 5],
      ['business-plan', 'Business plan', 5],
      ['esperienza', 'Industry experience', 5],
      ['rischio', 'Risk and commitment', 5],
      ['responsabilita', 'Responsibility', 5],
    ]);
  });

  it('un intervista senza ruolo né organizzazione si chiama Interview', () => {
    assert.equal(schema.autoInterviewTitle({}), 'Interview');
    assert.equal(schema.autoInterviewTitle({ role: 'Buyer', organization: 'Smith Ltd' }), 'Buyer, Smith Ltd');
    assert.equal(schema.autoInterviewTitle({ organization: 'Smith Ltd' }), 'Smith Ltd');
  });
});

describe('controlli prima del salvataggio in inglese', () => {
  for (const [kind, snapshot, expected] of [
    ['idea', { title: '', idea_id: null, data: {} }, 'Fill in "Idea name".'],
    ['survey', { title: '', idea_id: IDEA, data: {} }, 'Fill in "Title".'],
    ['experiment', { title: 'E', idea_id: null, data: {} }, 'Choose the idea it belongs to.'],
    ['note', { title: 'N', idea_id: null, data: {} }, 'Choose the idea it belongs to.'],
    ['expense', { title: 'Domain', idea_id: null, data: { amount: 3000 } }, 'Choose an expense group.'],
    ['expense', { title: 'Domain', idea_id: null, data: { group: GROUP } }, 'Enter an amount greater than zero.'],
    ['expense', { title: '', idea_id: null, data: { group: GROUP, amount: 1 } }, 'Fill in "Description".'],
    ['expensegroup', { title: '', idea_id: null, data: {} }, 'Fill in "Group name".'],
    ['scoresnap', { title: '', idea_id: null, data: {} }, 'Give the snapshot a name.'],
    ['interview', { title: 'I', idea_id: null, data: {} }, null],
    ['score', { title: '', idea_id: null, data: {} }, null],
  ]) {
    it(`${kind} ${JSON.stringify(snapshot.title)}: ${expected ?? 'nessun problema'}`, () => {
      assert.equal(snapshotProblem(kind, snapshot), expected);
    });
  }
});

describe('storico in inglese', () => {
  for (const [kind, path, expected] of [
    ['idea', 'title', 'Idea name'],
    ['idea', 'status', 'Status'],
    ['canvas', 'idea_id', 'Linked idea'],
    ['idea', 'data.problem', 'Problem'],
    ['idea', 'data.origin', 'Origin in the generator'],
    ['idea', 'data.roadmap', 'Roadmap'],
    ['idea', 'data.roadmap.mentor', 'Roadmap › Find a mentor'],
    ['idea', 'data.roadmap.altro', 'Roadmap › altro'],
    ['canvas', 'data.validated', 'Validated blocks'],
    ['canvas', 'data.validated.problem', 'Problem › validated'],
    ['score', `data.scores.${IDEA}.mercato`, 'Votes › Smart scheduling › Market size'],
    ['score', `data.scores.${IDEA}`, 'Votes › Smart scheduling'],
    ['score', `data.notes.${IDEA}`, 'Notes › Smart scheduling'],
    ['score', 'data.scores.x.mercato', 'Votes › Idea › Market size'],
    ['criteria', 'data.criteria', 'Criteria'],
    ['criteria', 'data.criteria.#order', 'Criteria › order'],
    ['criteria', 'data.criteria#mercato.label', 'Criteria › Market size › Name'],
    ['criteria', 'data.criteria#mercato.description', 'Criteria › Market size › Description'],
    ['criteria', 'data.criteria#mercato.weight', 'Criteria › Market size › Weight'],
    ['generator', 'data.rows', 'Rows'],
    ['generator', 'data.cols.#order', 'Columns › order'],
    ['generator', 'data.rows#r-a.label', 'Rows › XAI'],
    ['generator', 'data.rows#r-a.people', 'Rows › XAI › people'],
    ['generator', 'data.cells.r-a:c-x.text', 'XAI × Healthcare'],
    ['generator', 'data.cells.r-a:c-x.potential', 'XAI × Healthcare › potential'],
    ['competitors', 'data.features#f-a.label', 'Features compared'],
    ['competitors', 'data.rivals#c-a.name', 'Competitors'],
    ['competitors', 'data.cells.f-a:noi', 'Comparison table'],
    ['competitors', 'data.axes.x.label', 'Chart axes'],
    ['competitors', 'data.us.x', 'Our position on the chart'],
    ['equity', 'data.factors#idea.weight', 'Factors and weights'],
    ['equity', 'data.founders#f-a.name', 'Founders'],
    ['equity', 'data.scores.idea:f-a', 'Scores'],
    ['scoresnap', 'data.criteria#mercato.label', 'Criteria'],
    ['scoresnap', 'data.ideas.#order', 'Ideas'],
    ['scoresnap', 'data.votes', 'Votes'],
    ['scoresnap', 'data.names.x', 'Names'],
    ['survey', 'title', 'Title'],
    ['survey', 'data.questions', 'Questions'],
    ['survey', 'data.questions.#order', 'Questions › order'],
    ['survey', 'data.questions#ruolo.label', 'Questions › What is your job? › text'],
    ['survey', 'data.questions#ruolo.help', 'Questions › What is your job? › explanation'],
    ['survey', 'data.questions#ruolo.type', 'Questions › What is your job? › type'],
    ['survey', 'data.questions#ruolo.required', 'Questions › What is your job? › required'],
    ['survey', 'data.questions#ruolo.role', 'Questions › What is your job? › topic'],
    ['survey', 'data.questions#ruolo.options#a.label', 'Questions › What is your job? › options'],
    ['survey', 'data.questions#ruolo.allow_other', 'Questions › What is your job? › "Other" answer'],
    ['survey', 'data.questions#ruolo.other_label', 'Questions › What is your job? › name of the "Other" answer'],
    ['survey', 'data.questions#ruolo.other_placeholder', 'Questions › What is your job? › example in the "Other" field'],
    ['survey', 'data.questions#ruolo.prefer_not', 'Questions › What is your job? › "Prefer not to say" answer'],
    ['survey', 'data.questions#ruolo.scale.points', 'Questions › What is your job? › scale'],
    ['survey', 'data.questions#ruolo.number.min', 'Questions › What is your job? › limits'],
    ['survey', 'data.questions#altra.xyz', 'Questions › altra'],
    ['survey', 'data.appearance.theme', 'Appearance › theme'],
    ['survey', 'data.appearance.accent', 'Appearance › colour'],
    ['survey', 'data.appearance', 'Appearance'],
    ['survey', 'data.show_time', 'Estimated time shown'],
    ['survey', 'data.token', 'Public link'],
    ['survey', 'data.cover.path', 'Start screen image'],
    ['survey', 'data.cover.alt', 'Start screen image › description'],
    ['survey', 'data.thanks_image.path', 'Thank-you image'],
    ['survey', 'data.thanks_image.alt', 'Thank-you image › description'],
    ['survey', 'data.layout', 'Layout'],
    ['expensegroup', 'data.people#p1.name', 'People'],
    ['expense', 'data.group', 'Group'],
    ['expense', 'data.split', 'Split'],
    ['expense', 'data.split.mode', 'Split › method'],
    ['expense', 'data.split.shares.p1', 'Split › Anna'],
    ['expense', 'data.split.shares.p9', 'Split'],
    ['expense', 'data.paid_by', 'Paid by'],
    ['availability', 'title', 'Title'],
    ['availability', 'data.busy', 'Usual schedule'],
    ['availability', 'data.until', 'End of the usual schedule'],
    ['availability', 'data.weeks.#order', 'Weeks with a different schedule'],
    ['timesheet', 'data.week', 'Week'],
    ['timesheet', 'data.pledge', 'Hours pledged for the week'],
    ['timesheet', 'data.entries', 'Rows'],
    ['timesheet', 'data.entries.#order', 'Rows › order'],
    ['timesheet', 'data.entries#a1.day', 'Row › day'],
    ['timesheet', 'data.entries#a1.start', 'Row › start'],
    ['timesheet', 'data.entries#a1.end', 'Row › end'],
    ['timesheet', 'data.entries#a1.area', 'Row › area'],
    ['timesheet', 'data.entries#a1.note', 'Row › what'],
    ['timesheet', 'data.entries#a1.xyz', 'Row › row'],
    ['market', 'data.unknown', 'unknown'],
  ]) {
    it(`${kind} ${path} si legge «${expected}»`, () => {
      assert.equal(describePath(kind, path, ctx), expected);
    });
  }

  it('i giorni e le settimane degli impegni usano le date e i giorni del sito', () => {
    assert.equal(describePath('availability', 'data.busy.lun'), `Usual schedule › ${dayName('lun')}`);
    assert.equal(describePath('availability', 'data.weeks#2026-11-09.busy.mar'), `Week of ${shortDate('2026-11-09')} › ${dayName('mar')}`);
    assert.equal(describePath('availability', 'data.weeks#2027-01-11.busy'), `Week of ${shortDate('2027-01-11')}`);
    assert.equal(describePath('availability', 'data.weeks#garbage.busy'), 'Week of garbage');
  });

  it('senza contesto le parti dello storico tengono le chiavi', () => {
    assert.equal(describePath('score', `data.notes.${IDEA}`), 'Notes › Idea');
    assert.equal(describePath('generator', 'data.cells.r-a:c-x'), 'r-a × c-x');
    assert.equal(describePath('criteria', 'data.criteria#k.weight'), 'Criteria › k › Weight');
  });
});

describe('valori dello storico in inglese', () => {
  for (const [kind, path, value, expected, context = ctx] of [
    ['idea', 'status', 'parcheggiata', 'Parked'],
    ['idea', 'idea_id', IDEA, 'Smart scheduling'],
    ['canvas', 'idea_id', MEMBER, 'Idea'],
    ['idea', 'data.roadmap.mentor', schema.roadmapMark('done', MEMBER, AT), 'done (Bruno)'],
    ['idea', 'data.roadmap.mentor', schema.roadmapMark('skip', MEMBER, AT), 'not needed (Bruno)'],
    ['idea', 'data.roadmap.mentor', schema.roadmapMark('done', MEMBER, AT), 'done (Member)', {}],
    ['idea', 'data.roadmap.mentor', 'garbage', ''],
    ['idea', 'data.owner', MEMBER, 'Bruno'],
    ['idea', 'data.owner', IDEA, 'Member'],
    ['interview', 'data.commitment', 'pilota', 'Open to a pilot'],
    ['interview', 'data.problem_intensity', 4, '4/5'],
    ['interview', 'data.experiment_id', IDEA, 'Experiment', {}],
    ['contact', 'data.interview_id', IDEA, 'Interview', {}],
    ['market', 'data.tam', 30000000000, '€30bn'],
    ['market', 'data.som', 159000000, '€159m'],
    ['persona', 'data.photo', `data:image/jpeg;base64,${'A'.repeat(200)}`, 'photo'],
    ['canvas', 'data.validated.problem', true, 'yes'],
    ['survey', 'data.show_time', false, 'no'],
    ['survey', 'data.layout', 'una', 'One question per screen'],
    ['survey', 'data.appearance.theme', 'seppia', 'Sepia'],
    ['survey', 'data.cover.path', 'x.jpg', 'image uploaded'],
    ['survey', 'status', 'chiuso', 'Closed'],
    // In inglese il punto separa i decimali e la virgola le migliaia, già da quattro cifre.
    ['expense', 'data.amount', 0, '0.00'],
    ['expense', 'data.amount', 5, '0.05'],
    ['expense', 'data.amount', 99999, '999.99'],
    ['expense', 'data.amount', 123456, '1,234.56'],
    ['expense', 'data.amount', 1234567, '12,345.67'],
    ['expense', 'data.paid_by', 'p1', 'Anna'],
    ['expense', 'data.paid_by', 'p9', 'Person'],
    ['expense', 'data.group', GROUP, 'Startup costs'],
    ['expense', 'data.group', IDEA, 'Group'],
    ['expense', 'data.split.mode', 'parti', SPLIT_MODES[0][1]],
    ['expense', 'data.receipt', 'x.jpg', 'photo'],
    ['availability', 'data.until', '2026-12-31', '31 Dec 2026'],
    ['availability', 'data.busy.lun', [9, 10, 11, 15], hoursText([9, 10, 11, 15])],
    ['timesheet', 'data.pledge', 450, durationText(450)],
    ['timesheet', 'data.week', '2026-11-09', `week of ${shortDate('2026-11-09')}`],
    ['timesheet', 'data.week', 'garbage', 'week of garbage'],
    ['timesheet', 'data.entries#a1.start', 900, clockText(900)],
    ['timesheet', 'data.entries#a1.area', 'clienti', areaLabel('clienti')],
    ['timesheet', 'data.entries#a1.day', 'ven', dayName('ven')],
  ]) {
    it(`${kind} ${path} = ${JSON.stringify(value)} si mostra «${expected}»`, () => {
      assert.equal(formatValue(kind, path, value, context), expected);
    });
  }

  it('gli elenchi si mostrano uno per uno', () => {
    assert.deepEqual(formatValue('decision', 'data.ideas', [IDEA, MEMBER], ctx), ['Smart scheduling', 'Idea']);
    assert.deepEqual(formatValue('decision', 'data.decided_by', [MEMBER, IDEA], ctx), ['Bruno', 'Member']);
    assert.deepEqual(formatValue('criteria', 'data.criteria', [{ key: 'm', label: 'Market size' }]), ['Market size']);
    assert.deepEqual(formatValue('canvas', 'data.validated', { problem: true, uvp: true }), ['Problem', 'Unique value proposition']);
    assert.deepEqual(formatValue('availability', 'data.weeks.#order', '2026-11-09,garbage'), [`week of ${shortDate('2026-11-09')}`, 'week of garbage']);
  });

  it('un conflitto su tutte le settimane elenca ogni settimana con i suoi impegni, o nessuno', () => {
    assert.deepEqual(
      formatValue('availability', 'data.weeks', [{ key: '2026-11-09', busy: { mer: [15], lun: [9, 10] } }, { key: '2026-12-07', busy: {} }, { busy: {} }]),
      [
        `week of ${shortDate('2026-11-09')} (${dayName('lun')} ${hoursText([9, 10])}; ${dayName('mer')} ${hoursText([15])})`,
        `week of ${shortDate('2026-12-07')} (no busy hours)`,
        'week (no busy hours)',
      ],
    );
  });

  it('un conflitto su tutte le righe delle ore elenca ogni riga, o dice che non ce ne sono', () => {
    const row = { id: 'a1', day: 'lun', start: 900, end: 1050, area: 'clienti' };
    assert.deepEqual(formatValue('timesheet', 'data.entries', [row]), [`${dayName('lun')} ${clockText(900)}-${clockText(1050)} (${areaLabel('clienti')})`]);
    assert.deepEqual(formatValue('timesheet', 'data.entries', []), ['no rows']);
  });
});

describe('moduli dei testi delle schede', () => {
  it('ogni settimana si scrive con la sua data, in italiano con l articolo apostrofato davanti a 1, 8 e 11', () => {
    for (const [key, date, it, en] of [
      ['2027-01-01', '1 gen', "Settimana dell'1 gen", 'Week of 1 gen'],
      ['2027-01-08', '8 gen', "Settimana dell'8 gen", 'Week of 8 gen'],
      ['2027-01-11', '11 gen', "Settimana dell'11 gen", 'Week of 11 gen'],
      ['2027-01-10', '10 gen', 'Settimana del 10 gen', 'Week of 10 gen'],
      ['2027-01-18', '18 gen', 'Settimana del 18 gen', 'Week of 18 gen'],
      ['2027-01-21', '21 gen', 'Settimana del 21 gen', 'Week of 21 gen'],
      ['2027-01-31', '31 gen', 'Settimana del 31 gen', 'Week of 31 gen'],
      ['garbage', 'garbage', 'Settimana del garbage', 'Week of garbage'],
    ]) {
      assert.equal(italiano.history.weekOf(key, date), it, key);
      assert.equal(english.history.weekOf(key, date), en, key);
      assert.equal(italiano.history.weekValue(key, date), it.replace('Settimana', 'settimana'), key);
      assert.equal(english.history.weekValue(key, date), en.replace('Week', 'week'), key);
    }
  });
});
