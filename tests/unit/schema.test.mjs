import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_KINDS,
  DEFAULT_CRITERIA,
  IDEA_CHILD_KINDS,
  INTERVIEW_SOURCES,
  KINDS,
  SURVEY_ACCENT,
  SURVEY_PREFER_NOT,
  SURVEY_TOKEN_RE,
  autoInterviewTitle,
  defaultStatus,
  describePath,
  fieldOf,
  formatValue,
  isConversation,
  newSurveyToken,
  routeFor,
  sanitizeSnapshot,
  snapshotProblem,
  statusLabel,
} from '../../assets/js/schema.js';

const IDEA = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';

test('every board kind declares labels, statuses and fields consistently', () => {
  for (const kind of BOARD_KINDS) {
    const def = KINDS[kind];
    assert.ok(def.label && def.plural && def.titleLabel && def.icon, kind);
    const keys = def.fields.map((f) => f.key);
    assert.equal(new Set(keys).size, keys.length, `chiavi duplicate in ${kind}`);
    for (const f of def.fields) {
      assert.ok(f.label, `${kind}.${f.key} senza etichetta`);
      if (f.type === 'select') assert.ok(f.options.length > 1, `${kind}.${f.key} senza opzioni`);
    }
  }
});

test('the statuses match those allowed by the database', () => {
  assert.deepEqual(KINDS.idea.statuses.map(([v]) => v), ['nuova', 'esplorazione', 'validazione', 'scelta', 'parcheggiata', 'scartata']);
  assert.deepEqual(KINDS.experiment.statuses.map(([v]) => v), ['pianificato', 'in_corso', 'concluso']);
  assert.deepEqual(KINDS.interview.statuses.map(([v]) => v), ['da_fare', 'fatta', 'analizzata']);
  assert.deepEqual(KINDS.decision.statuses.map(([v]) => v), ['proposta', 'presa', 'rivista']);
  assert.deepEqual(KINDS.survey.statuses.map(([v]) => v), ['bozza', 'aperto', 'chiuso']);
  assert.equal(defaultStatus('survey'), 'bozza');
  assert.equal(defaultStatus('canvas'), null);
  assert.equal(statusLabel('idea', 'validazione'), 'In validazione');
});

test('sanitizeSnapshot drops unknown fields and malformed values', () => {
  const clean = sanitizeSnapshot('idea', {
    title: '  Idea\nalfa  ',
    status: 'inventato',
    idea_id: IDEA,
    data: {
      pitch: '  uno ',
      owner: 'non-uuid',
      technologies: ['XAI', 'xai', ''],
      sector: 'Settore A\ndelle PMI',
      evil: '<script>',
      origin: 'r-xai:c-saanza',
      __proto__: { polluted: true },
    },
  });
  assert.deepEqual(clean, {
    title: 'Idea alfa',
    status: 'nuova',
    idea_id: null,
    data: { pitch: 'uno', technologies: ['XAI'], sector: 'Settore A delle PMI', origin: 'r-xai:c-saanza' },
  });
  assert.equal({}.polluted, undefined);
});

test('sanitizeSnapshot validates every field type', () => {
  const interview = sanitizeSnapshot('interview', {
    title: 'Int',
    status: 'fatta',
    idea_id: IDEA,
    data: { date: '2026-02-30', interviewer: MEMBER, problem_intensity: '4', commitment: 'pilota', experiment_id: 'x' },
  });
  assert.deepEqual(interview.data, { interviewer: MEMBER, problem_intensity: 4, commitment: 'pilota' });
  assert.equal(interview.idea_id, IDEA);

  const decision = sanitizeSnapshot('decision', { title: 'D', status: 'presa', idea_id: IDEA, data: { decided_by: [MEMBER, MEMBER, 'x'], ideas: [IDEA] } });
  assert.equal(decision.idea_id, null);
  assert.deepEqual(decision.data, { decided_by: [MEMBER], ideas: [IDEA] });

  const canvas = sanitizeSnapshot('canvas', { title: 'C', idea_id: IDEA, data: { problem: 'p', validated: { problem: true, solution: 'yes', nope: true } } });
  assert.deepEqual(canvas.data, { problem: 'p', validated: { problem: true } });
  assert.equal(canvas.status, null);
});

test('criteria, scores and generator are sanitized by shape', () => {
  const criteria = sanitizeSnapshot('criteria', { data: { criteria: [{ label: 'Mercato', weight: 9 }, { key: 'mercato', label: 'Altro', weight: 2 }, { label: '' }] } });
  assert.deepEqual(criteria.data.criteria.map((c) => [c.key, c.weight]), [['mercato', 1], ['mercato-x', 2]]);

  const score = sanitizeSnapshot('score', { data: { scores: { [IDEA]: { mercato: 4, team: 9, 'Bad Key': 3 }, nope: { a: 1 } }, notes: { [IDEA]: ' nota ', x: 'y' } } });
  assert.deepEqual(score.data, { scores: { [IDEA]: { mercato: 4 } }, notes: { [IDEA]: 'nota' } });

  const gen = sanitizeSnapshot('generator', {
    data: {
      rows: [{ id: 'r-a', label: 'A' }, { id: 'r-a', label: 'dup' }, { id: 'R B', label: 'bad id' }],
      cols: [{ id: 'c-x', label: 'X', people: [IDEA, IDEA, 'non uuid'], others: '  Prof. esterno  ' }],
      cells: { 'r-a:c-x': { text: 'ok', potential: 2 }, 'r-z:c-x': { text: 'orfana' }, 'r-a:c-x2': { text: 'no' } },
    },
  });
  assert.deepEqual(gen.data.rows, [{ id: 'r-a', label: 'A' }]);
  assert.deepEqual(gen.data.cols, [{ id: 'c-x', label: 'X', people: [IDEA], others: 'Prof. esterno' }], 'persone: solo id validi, senza doppioni');
  assert.deepEqual(gen.data.cells, { 'r-a:c-x': { text: 'ok', potential: 2 } });
});

test('a scoring photo keeps only well formed criteria, ideas and votes', () => {
  const OTHER_IDEA = '22222222-2222-4222-8222-222222222222';
  const MEMBER = '33333333-3333-4333-8333-333333333333';
  const photo = sanitizeSnapshot('scoresnap', {
    title: '  Prima della riunione  ',
    idea_id: IDEA,
    data: {
      criteria: [{ key: 'mercato', label: 'Mercato', weight: 3 }, { label: '' }],
      ideas: [{ id: IDEA, title: 'Alfa', status: 'boh' }, { id: IDEA, title: 'doppia' }, { id: 'non uuid', title: 'X' }, { id: OTHER_IDEA, title: '' }],
      votes: {
        [MEMBER]: { [IDEA]: { mercato: 4, team: 3, 'Bad Key': 2 }, [OTHER_IDEA]: { mercato: 5 } },
        'non uuid': { [IDEA]: { mercato: 1 } },
        [IDEA]: { [IDEA]: { mercato: 9 } },
      },
      names: { [MEMBER]: '  Anna  ', [IDEA]: 'nessuno' },
    },
  });
  assert.equal(photo.title, 'Prima della riunione');
  assert.equal(photo.idea_id, null, 'una fotografia non appartiene a un\'idea');
  assert.deepEqual(photo.data, {
    criteria: [{ key: 'mercato', label: 'Mercato', description: '', weight: 3 }],
    ideas: [{ id: IDEA, title: 'Alfa', status: 'nuova' }],
    votes: { [MEMBER]: { [IDEA]: { mercato: 4 } } },
    names: { [MEMBER]: 'Anna' },
  });
  assert.match(snapshotProblem('scoresnap', { title: '', idea_id: null }), /nome/);
  assert.equal(routeFor({ kind: 'scoresnap', id: IDEA }), `#/valutazione?foto=${IDEA}`);
  assert.equal(describePath('scoresnap', 'data.votes'), 'Voti');
});

const TOKEN = 'TokenDiProvaAperto0001';

test('a new survey gets the default settings and appearance, and belongs to an idea', () => {
  const clean = sanitizeSnapshot('survey', { title: '  Turni  ', idea_id: IDEA, data: {} });
  assert.deepEqual(clean, {
    title: 'Turni',
    status: 'bozza',
    idea_id: IDEA,
    data: { layout: 'una', progress: 'contatore', show_time: true, appearance: { theme: 'automatico', accent: SURVEY_ACCENT }, questions: [] },
  });
  assert.equal(SURVEY_ACCENT, '#3b4bc8');
  assert.equal(SURVEY_PREFER_NOT, 'non-rispondo', 'lo stesso id riservato che accetta il database');
  assert.ok(BOARD_KINDS.includes('survey') && IDEA_CHILD_KINDS.includes('survey'));
  assert.equal(KINDS.survey.label, 'Questionario');
  assert.equal(KINDS.survey.plural, 'Questionari');
  assert.match(snapshotProblem('survey', { ...clean, idea_id: null }), /idea/);
  assert.match(snapshotProblem('survey', { ...clean, title: '' }), /Titolo/);
  assert.equal(snapshotProblem('survey', clean), null);
});

test('a survey keeps only known settings, capped texts, a valid link and a valid experiment', () => {
  const clean = sanitizeSnapshot('survey', {
    title: 'Q',
    status: 'aperto',
    idea_id: IDEA,
    data: {
      intro: ` ${'a'.repeat(2100)} `,
      privacy: 'p'.repeat(3100),
      thanks: 'Grazie!\r\nA presto',
      layout: 'sezioni',
      progress: 'nessuno',
      show_time: false,
      experiment_id: MEMBER,
      token: TOKEN,
      evil: '<script>',
      __proto__: { polluted: true },
    },
  });
  assert.equal(clean.status, 'aperto');
  assert.equal(clean.data.intro.length, 2000);
  assert.equal(clean.data.privacy.length, 3000);
  assert.equal(clean.data.thanks, 'Grazie!\nA presto');
  assert.equal(clean.data.layout, 'sezioni');
  assert.equal(clean.data.progress, 'nessuno');
  assert.equal(clean.data.show_time, false);
  assert.equal(clean.data.experiment_id, MEMBER);
  assert.equal(clean.data.token, TOKEN);
  assert.equal('evil' in clean.data, false);
  assert.equal({}.polluted, undefined);

  const bad = sanitizeSnapshot('survey', {
    title: 'Q',
    status: 'pubblicato',
    data: { thanks: '   ', layout: 'tutte', progress: 'percentuale', show_time: 'no', experiment_id: 'x', token: 'TokenDiProvaAperto00.1' },
  });
  assert.equal(bad.status, 'bozza');
  assert.deepEqual(bad.data, { layout: 'una', progress: 'contatore', show_time: true, appearance: { theme: 'automatico', accent: SURVEY_ACCENT }, questions: [] });
  for (const token of ['corto', `${TOKEN}x`, 'TokenDiProva Aperto001', 12345]) {
    assert.equal('token' in sanitizeSnapshot('survey', { data: { token } }).data, false, String(token));
  }
});

test('the survey appearance is only a theme and a lowercase accent color', () => {
  const look = (appearance) => sanitizeSnapshot('survey', { data: { appearance } }).data.appearance;
  assert.deepEqual(look({ theme: 'scuro', accent: '#AA3300' }), { theme: 'scuro', accent: '#aa3300' });
  assert.deepEqual(look({ theme: 'chiaro', accent: '#00ff7f', font: 'Comic Sans', css: 'body { display: none }', image: 'x.png' }), { theme: 'chiaro', accent: '#00ff7f' });
  for (const accent of ['red', '#abc', '#aa3300; background: url(x)', ' #aa3300', '#aa33001', 'rgb(1,2,3)', 0xaa3300, null]) {
    assert.equal(look({ accent }).accent, SURVEY_ACCENT, String(accent));
  }
  assert.equal(look({ theme: 'rosa' }).theme, 'automatico');
  assert.deepEqual(look('scuro'), { theme: 'automatico', accent: SURVEY_ACCENT });
});

test('the survey cover is only a JPEG of the survey images space and a one-line description', () => {
  const path = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg';
  const cover = (value) => sanitizeSnapshot('survey', { data: { cover: value } }).data.cover;
  assert.deepEqual(cover({ path, alt: '  Il gruppo\n davanti all\'università ', url: 'https://altro.example/x.jpg' }), { path, alt: 'Il gruppo davanti all\'università' });
  assert.deepEqual(cover({ path }), { path, alt: '' });
  assert.equal(cover({ path, alt: 'x'.repeat(500) }).alt.length, 200);
  for (const bad of [null, 'x.jpg', { path: 'https://altro.example/x.jpg' }, { path: path.replace('.jpg', '.png') }, { path: `../${path}` }, { path: `${path}?x=1` }]) {
    assert.equal(cover(bad), undefined, JSON.stringify(bad));
  }
  assert.equal(formatValue('survey', 'data.cover.path', path), 'immagine caricata');
});

test('survey questions are validated by type, with unique ids and one email question at most', () => {
  const { questions } = sanitizeSnapshot('survey', {
    data: {
      questions: [
        { id: 's-1', type: 'sezione', label: ' Chi sei ', help: 'Due domande', required: true, role: 'persona', options: [{ id: 'a', label: 'A' }] },
        {
          id: 'ruolo',
          type: 'scelta',
          label: 'Che lavoro fai?',
          required: true,
          role: 'persona',
          allow_other: true,
          prefer_not: true,
          options: [
            { id: 'a', label: ' Medico ' },
            { id: 'a', label: 'Doppia' },
            { id: 'B C', label: 'Id non valido' },
            { id: 'b', label: '' },
            { id: SURVEY_PREFER_NOT, label: 'Id riservato' },
            { id: 'c', label: 'x'.repeat(200) },
          ],
          scale: { points: 7 },
        },
        { id: 'canali', type: 'scelte', label: 'Dove?', required: 'si', role: 'boh', allow_other: 'si', prefer_not: 'si', options: Array.from({ length: 25 }, (_, i) => ({ id: `o${i}`, label: `Opzione ${i}` })) },
        { id: 'fatica', type: 'scala', label: 'Quanto pesa?', role: 'problema', scale: { points: '7', min_label: 'Poco', max_label: 'm'.repeat(80), labels: ['1', '2', '3', '4', '5', '6', '7'] }, options: [{ id: 'a', label: 'A' }], allow_other: true, prefer_not: true },
        { id: 'voto', type: 'scala', label: 'Voto', scale: { points: 10, labels: ['solo uno'] } },
        { id: 'ore', type: 'numero', label: 'Ore?', number: { min: 80, max: '0' } },
        { id: 'eta', type: 'numero', label: 'Età?', number: { min: 1.5, max: 2e9 } },
        { id: 'parola', type: 'breve', label: 'x'.repeat(400), help: 'h'.repeat(600), options: [{ id: 'a', label: 'A' }], scale: { points: 5 }, number: { min: 1 } },
        { id: 'racconto', type: 'lunga', label: 'Racconta', role: 'problema' },
        { id: 'mail', type: 'email', label: 'Email', role: 'contatto' },
        { id: 'mail-2', type: 'email', label: 'Seconda email' },
        { id: 'ruolo', type: 'breve', label: 'Id ripetuto' },
        { id: 'tipo', type: 'griglia', label: 'Tipo sconosciuto' },
        { id: 'muta', type: 'breve', label: '   ' },
        { id: 'Non Valida', type: 'breve', label: 'Id non valido' },
        'non un oggetto',
      ],
    },
  }).data;

  assert.deepEqual(questions.map((q) => q.id), ['s-1', 'ruolo', 'canali', 'fatica', 'voto', 'ore', 'eta', 'parola', 'racconto', 'mail']);
  const byId = Object.fromEntries(questions.map((q) => [q.id, q]));
  assert.deepEqual(byId['s-1'], { id: 's-1', type: 'sezione', label: 'Chi sei', help: 'Due domande' }, 'una sezione non ha risposta, ruolo né opzioni');
  assert.deepEqual(byId.ruolo, {
    id: 'ruolo',
    type: 'scelta',
    label: 'Che lavoro fai?',
    required: true,
    role: 'persona',
    options: [{ id: 'a', label: 'Medico' }, { id: 'c', label: 'x'.repeat(120) }],
    allow_other: true,
    prefer_not: true,
  }, 'l\'id riservato a «Preferisco non rispondere» non è un\'opzione');
  assert.equal(byId.canali.options.length, 20);
  assert.equal(byId.canali.required, false, 'obbligatoria solo con true');
  assert.equal(byId.canali.allow_other, false);
  assert.equal(byId.canali.prefer_not, false);
  assert.equal(byId.canali.role, 'altro');
  assert.deepEqual(byId.fatica, {
    id: 'fatica',
    type: 'scala',
    label: 'Quanto pesa?',
    required: false,
    role: 'problema',
    scale: { points: 7, min_label: 'Poco', max_label: 'm'.repeat(60), labels: ['1', '2', '3', '4', '5', '6', '7'] },
  });
  assert.deepEqual(byId.voto.scale, { points: 5 }, 'punti 5 o 7, etichette solo una per punto');
  assert.deepEqual(byId.ore.number, { min: 0, max: 80 }, 'minimo e massimo invertiti');
  assert.deepEqual(byId.eta.number, {}, 'solo interi entro un miliardo');
  assert.equal(byId.parola.label.length, 300);
  assert.equal(byId.parola.help.length, 500);
  assert.deepEqual(Object.keys(byId.parola).sort(), ['help', 'id', 'label', 'required', 'role', 'type']);
  assert.equal(byId.mail.role, 'contatto');

  const many = sanitizeSnapshot('survey', { data: { questions: Array.from({ length: 45 }, (_, i) => ({ id: `q${i}`, type: 'breve', label: `Domanda ${i}` })) } });
  assert.equal(many.data.questions.length, 40);
});

test('survey links are random, 22 characters long and safe in a URL', () => {
  const tokens = new Set(Array.from({ length: 50 }, () => newSurveyToken()));
  assert.equal(tokens.size, 50);
  for (const token of tokens) assert.match(token, SURVEY_TOKEN_RE);
  assert.match(newSurveyToken(), /^[A-Za-z0-9_-]{22}$/);
});

test('survey history paths and routes are readable', () => {
  const ctx = { questionLabel: (id) => (id === 'ruolo' ? 'Che lavoro fai?' : null), itemTitle: () => 'Sondaggio online' };
  assert.equal(routeFor({ kind: 'survey', id: IDEA }), `#/questionario/${IDEA}`);
  assert.equal(describePath('survey', 'title'), 'Titolo');
  assert.equal(describePath('survey', 'status'), 'Stato');
  assert.equal(describePath('survey', 'data.intro'), 'Introduzione');
  assert.equal(describePath('survey', 'data.layout'), 'Impaginazione');
  assert.equal(describePath('survey', 'data.experiment_id'), 'Esperimento collegato');
  assert.equal(describePath('survey', 'data.token'), 'Link pubblico');
  assert.equal(describePath('survey', 'data.show_time'), 'Durata stimata visibile');
  assert.equal(describePath('survey', 'data.appearance.accent'), 'Aspetto › colore');
  assert.equal(describePath('survey', 'data.appearance.theme'), 'Aspetto › tema');
  assert.equal(describePath('survey', 'data.questions.#order'), 'Domande › ordine');
  assert.equal(describePath('survey', 'data.questions#ruolo.label', ctx), 'Domande › Che lavoro fai? › testo');
  assert.equal(describePath('survey', 'data.questions#ruolo.options#a.label', ctx), 'Domande › Che lavoro fai? › opzioni');
  assert.equal(describePath('survey', 'data.questions#altra.required', ctx), 'Domande › altra › obbligatoria');
  assert.equal(describePath('survey', 'data.questions#altra', ctx), 'Domande › altra');
  assert.equal(describePath('survey', 'data.questions#ruolo.prefer_not', ctx), 'Domande › Che lavoro fai? › risposta «Preferisco non rispondere»');
  assert.equal(formatValue('survey', 'data.layout', 'sezioni'), 'Una sezione per schermata');
  assert.equal(formatValue('survey', 'data.appearance.theme', 'scuro'), 'Scuro');
  assert.equal(formatValue('survey', 'data.experiment_id', MEMBER, ctx), 'Sondaggio online');
  assert.equal(formatValue('survey', 'status', 'aperto'), 'Aperto');
});

test('snapshotProblem requires titles and parent ideas where the database does', () => {
  assert.match(snapshotProblem('idea', { title: '', idea_id: null }), /Nome/);
  assert.match(snapshotProblem('experiment', { title: 'E', idea_id: null }), /idea/);
  assert.equal(snapshotProblem('interview', { title: 'I', idea_id: null }), null);
  assert.equal(snapshotProblem('score', { title: '', idea_id: null }), null);
  assert.equal(sanitizeSnapshot('experiment', { title: 'x', idea_id: 'bad' }).idea_id, null);
  assert.throws(() => sanitizeSnapshot('boh', {}), /Tipo sconosciuto/);
});

test('an interview is a conversation with a person unless it is marked as online research', () => {
  const source = fieldOf('interview', 'source');
  assert.equal(source.type, 'select');
  assert.equal(source.label, 'Tipo');
  assert.equal(source.default, 'colloquio');
  assert.deepEqual(INTERVIEW_SOURCES, [
    ['colloquio', 'Colloquio con una persona'],
    ['ricerca', 'Ricerca online, senza parlare con nessuno'],
  ]);
  assert.equal(sanitizeSnapshot('interview', { title: 'X', data: { source: 'ricerca' } }).data.source, 'ricerca');
  assert.equal(sanitizeSnapshot('interview', { title: 'X', data: { source: 'colloquio' } }).data.source, 'colloquio');
  assert.equal('source' in sanitizeSnapshot('interview', { title: 'X', data: { source: 'sondaggio' } }).data, false);
  assert.equal('source' in sanitizeSnapshot('interview', { title: 'X', data: {} }).data, false, 'nessun valore inventato al salvataggio');

  assert.equal(isConversation({ data: {} }), true, 'le interviste di prima del campo sono colloqui');
  assert.equal(isConversation({ data: { source: 'colloquio' } }), true);
  assert.equal(isConversation({ data: { source: 'ricerca' } }), false);
  assert.equal(isConversation({ data: { source: 'altro' } }), true);
  assert.equal(isConversation(null), true);
  assert.equal(describePath('interview', 'data.source'), 'Tipo');
  assert.equal(formatValue('interview', 'data.source', 'ricerca'), 'Ricerca online, senza parlare con nessuno');
});

test('autoInterviewTitle builds a title from role and organization', () => {
  assert.equal(autoInterviewTitle({ role: 'Responsabile acquisti', organization: 'Azienda Rossi' }), 'Responsabile acquisti, Azienda Rossi');
  assert.equal(autoInterviewTitle({}), 'Intervista');
});

test('describePath gives readable labels for history paths', () => {
  const ctx = {
    ideaTitle: (id) => (id === IDEA ? 'Idea alfa' : null),
    criterionLabel: (k) => (k === 'mercato' ? 'Mercato' : null),
    axisLabel: (id) => ({ 'r-a': 'XAI', 'c-x': 'Settore A' })[id] || null,
  };
  assert.equal(describePath('idea', 'title'), 'Nome dell\'idea');
  assert.equal(describePath('idea', 'status'), 'Stato');
  assert.equal(describePath('idea', 'data.problem'), 'Problema');
  assert.equal(describePath('idea', 'data.origin'), 'Origine nel generatore');
  assert.equal(describePath('canvas', 'data.validated.problem'), 'Problema › validato');
  assert.equal(describePath('score', `data.scores.${IDEA}.mercato`, ctx), 'Voti › Idea alfa › Mercato');
  assert.equal(describePath('score', `data.notes.${IDEA}`, ctx), 'Note › Idea alfa');
  assert.equal(describePath('criteria', 'data.criteria#mercato.weight', ctx), 'Criteri › Mercato › Peso');
  assert.equal(describePath('criteria', 'data.criteria.#order', ctx), 'Criteri › ordine');
  assert.equal(describePath('generator', 'data.cells.r-a:c-x.text', ctx), 'XAI × Settore A');
  assert.equal(describePath('generator', 'data.cells.r-a:c-x.potential', ctx), 'XAI × Settore A › potenziale');
  assert.equal(describePath('generator', 'data.rows#r-a.label', ctx), 'Righe › XAI');
  assert.equal(describePath('generator', 'data.rows#r-a.people', ctx), 'Righe › XAI › persone');
  assert.equal(describePath('generator', 'data.cols.#order', ctx), 'Colonne › ordine');
});

test('formatValue resolves ids, options and scales', () => {
  const ctx = { memberName: () => 'Bruno', ideaTitle: () => 'Idea X', itemTitle: () => 'Esp' };
  assert.equal(formatValue('idea', 'status', 'scelta'), 'Scelta');
  assert.equal(formatValue('canvas', 'idea_id', IDEA, ctx), 'Idea X');
  assert.equal(formatValue('idea', 'data.owner', MEMBER, ctx), 'Bruno');
  assert.deepEqual(formatValue('decision', 'data.decided_by', [MEMBER], ctx), ['Bruno']);
  assert.equal(formatValue('interview', 'data.commitment', 'pilota'), 'Disponibile a un pilota');
  assert.equal(formatValue('interview', 'data.problem_intensity', 4), '4/5');
  assert.equal(formatValue('interview', 'data.experiment_id', IDEA, ctx), 'Esp');
  assert.equal(formatValue('canvas', 'data.validated.problem', true), 'sì');
  assert.equal(formatValue('idea', 'data.pitch', undefined), '');
});

test('routeFor sends each kind to its page', () => {
  assert.equal(routeFor({ kind: 'idea', id: IDEA }), `#/idea/${IDEA}`);
  assert.equal(routeFor({ kind: 'experiment', id: IDEA }), `#/elemento/${IDEA}`);
  assert.equal(routeFor({ kind: 'score', id: IDEA }), '#/valutazione');
  assert.equal(routeFor({ kind: 'generator', id: IDEA }), '#/generatore');
  assert.equal(routeFor(null), '#/');
});

test('the default criteria are already valid', () => {
  const clean = sanitizeSnapshot('criteria', { data: { criteria: DEFAULT_CRITERIA } });
  assert.deepEqual(clean.data.criteria, DEFAULT_CRITERIA);
});
