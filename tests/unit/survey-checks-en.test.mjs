// The survey template and the writing checks on an English device: the template is created in English, the
// checks find the English mistakes as well as the Italian ones, and every warning reads in English.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { italianWords } from '../setup/italian.mjs';

useLanguage('en');
const checks = await import('../../assets/js/survey-checks.js');
const template = await import('../../assets/js/survey-template.js');
const { countWords, estimateMinutes } = await import('../../assets/js/public/survey-time.js');
const { SURVEY_ACCENT, sanitizeSnapshot } = await import('../../assets/js/schema.js');

const { ACCENT_PALETTE, LIMITS_ADVICE, PREVIEW_PAGES, accentCheck, conditionalWords, contrastRatio, fmtRatio, previewPage, questionWarnings, surveyWarnings } = checks;
const codes = (warnings) => warnings.map((w) => w.code);
const q = (label, over = {}) => ({ id: 'q-1', type: 'breve', label, required: false, role: 'problema', ...over });
// Italian words in the messages, leaving out what the author wrote and the message quotes back.
const leftovers = (warnings, quoted = '') => warnings.flatMap((w) => italianWords(`${w.text} ${w.hint}`.replace(quoted, '')));

describe('verbi che chiedono un intenzione, in inglese', () => {
  for (const [text, expected] of [
    ['Would you buy it? Would they pay?', ['would']],
    ['You\'d use it every day?', ['you\'d']],
    ['You’d use it, wouldn’t you?', ['you\'d', 'wouldn\'t']],
    ['How likely are you to recommend it?', ['how likely']],
    ['Are you willing to pay for it?', ['willing to']],
    ['Compreresti un\'app? Would you?', ['compreresti', 'would']],
  ]) {
    it(`trova ${expected.join(' e ')} in «${text}»`, () => {
      assert.deepEqual(conditionalWords(text), expected);
    });
  }

  for (const text of ['How often do you buy wood for the fireplace?', 'Could you find what you needed last time?', 'What did you buy the last time?', 'Was it likely to rain?']) {
    it(`non segnala «${text}»`, () => {
      assert.deepEqual(conditionalWords(text), []);
    });
  }
});

describe('avvisi su come è scritta una domanda in inglese', () => {
  const FLAGGED = [
    ['condizionale', 'Would you buy an app that reminds you of deadlines?'],
    ['condizionale', 'How much would you pay for it?'],
    ['condizionale', 'You\'d use it every day?'],
    ['condizionale', 'How likely are you to recommend it?'],
    ['condizionale', 'Are you willing to pay for it?'],
    ['accordo', 'How much do you agree with this statement?'],
    ['accordo', 'Do you disagree?'],
    ['suggerisce', 'Don\'t you think it is annoying?'],
    ['suggerisce', 'Isn’t it true that you waste time?'],
    ['suggerisce', 'Do you agree that prices are too high?'],
    ['suggerisce', 'Wouldn\'t it be easier with a list?'],
    ['incentivo', 'Enter our prize draw'],
    ['incentivo', 'Win a prize'],
    ['incentivo', 'Get a £10 voucher'],
    ['incentivo', 'A discount for you'],
    ['incentivo', 'A gift for everyone who answers'],
    ['incentivo', 'Answer and get an Amazon gift card'],
    ['incentivo', 'Answer and enter the raffle'],
    ['soluzione', 'What do you think of our app?'],
    ['soluzione', 'Would you use our services?'],
    ['soluzione', 'If there were a service like this, would you try it?'],
    ['soluzione', 'Imagine an app that plans your shopping'],
    ['selezione', 'We are only looking for nurses: which shifts do you work?'],
    ['selezione', 'We\'re looking for people who cook every day'],
    ['selezione', 'If you\'re a doctor, how many visits do you do?'],
    ['selezione', 'If you are an engineer, which tools do you use?'],
    ['selezione', 'This survey is only for people who run'],
  ];
  for (const [code, label] of FLAGGED) {
    it(`«${label}» ha l avviso ${code}, scritto in inglese`, () => {
      const warnings = questionWarnings(q(label));
      assert.ok(codes(warnings).includes(code), codes(warnings).join(', '));
      assert.deepEqual(leftovers(warnings), []);
    });
  }

  for (const label of [
    'The last time you looked for a plumber, how did you find one?',
    'In the last 4 weeks, how many times did it happen?',
    'Do you have a good reason to do it?',
    'How often do you buy wood for the fireplace?',
    'Which agreement did you sign with your landlord?',
    'When did you last go to the doctor?',
    'What did you do the last time it happened?',
    'What\'s the hardest part of planning your shopping?',
  ]) {
    it(`«${label}» non ha avvisi`, () => {
      assert.deepEqual(questionWarnings(q(label)), []);
    });
  }

  it('gli schemi italiani valgono anche su un dispositivo inglese, con l avviso in inglese', () => {
    const warnings = questionWarnings(q('Compreresti un servizio che ti ricorda le scadenze?'));
    assert.deepEqual(codes(warnings), ['condizionale']);
    assert.match(warnings[0].text, /‘compreresti’/);
    assert.match(warnings[0].text, /^Hypothetical wording/);
    assert.match(warnings[0].hint, /The last time you\.\.\./);
    assert.deepEqual(leftovers(warnings, 'compreresti'), []);
    for (const [code, label] of [['accordo', 'Quanto sei d\'accordo?'], ['suggerisce', 'Non pensi che sia scomodo?'], ['incentivo', 'Vinci un premio'], ['soluzione', 'Cosa pensi della nostra app?'], ['selezione', 'Se sei un medico, quante visite fai?']]) {
      assert.ok(codes(questionWarnings(q(label))).includes(code), label);
    }
  });

  it('domande vuote, senza opzioni, con etichette mancanti o con parentesi hanno avvisi in inglese', () => {
    const cases = [
      [q('  '), ['vuota']],
      [q('Which job do you do?', { type: 'scelta', options: [], allow_other: false }), ['opzioni']],
      [q('How often?', { type: 'scala', scale: { points: 5, min_label: 'Never', max_label: 'Always' } }), ['etichette']],
      [q('It happens to me often', { type: 'scala', scale: { points: 5, labels: ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'] } }), ['accordo']],
      [q('Which describes your situation?', { type: 'scelta', options: [{ id: 'a', label: '[Situation 1]' }] }), ['parentesi']],
    ];
    for (const [question, expected] of cases) {
      const warnings = questionWarnings(question);
      assert.deepEqual(codes(warnings), expected, question.label);
      assert.deepEqual(leftovers(warnings), [], question.label);
    }
    assert.equal(questionWarnings(q('  '))[0].text, 'The question has no text: it will not be saved.');
  });
});

describe('avvisi sul questionario intero in inglese', () => {
  it('un questionario vuoto chiede domande, introduzione e informativa', () => {
    const warnings = surveyWarnings({ questions: [] });
    assert.deepEqual(codes(warnings), ['nessuna', 'intro', 'privacy']);
    assert.deepEqual(leftovers(warnings), []);
  });

  it('conta ruoli, domande aperte e obbligatorie e durata, con i numeri nel testo', () => {
    const many = (n, over) => Array.from({ length: n }, (_, i) => q(`Question ${i}`, { id: `q-${over.role}-${i}`, ...over }));
    const data = {
      questions: [
        ...many(11, { role: 'problema', type: 'scelta', options: [{ id: 'a', label: 'Yes' }] }),
        ...many(4, { role: 'persona', type: 'numero' }),
        ...many(3, { role: 'altro', type: 'lunga', required: true, help: 'word '.repeat(200) }),
      ],
    };
    const warnings = surveyWarnings(data);
    const text = (code) => warnings.find((w) => w.code === code).text;
    assert.match(text('troppe-problema'), /^11 questions about the problem: the handbook recommends 10 at most\.$/);
    assert.match(text('troppe-persona'), /^4 questions about who is answering/);
    assert.match(text('troppe-aperte'), /^3 open questions/);
    assert.match(text('obbligatorie'), /^3 required questions/);
    assert.match(text('durata'), /about \d+ minutes/);
    assert.ok(text('email'));
    assert.deepEqual(leftovers(warnings), []);
  });

  it('introduzione e messaggio finale si controllano in entrambe le lingue', () => {
    const warnings = surveyWarnings({
      intro: 'We are only looking for doctors. Everyone who answers enters a prize draw to try our app.',
      privacy: 'Short notice.',
      thanks: 'Here is your discount voucher',
      questions: [q('Email', { type: 'email', role: 'contatto' })],
    });
    assert.deepEqual(codes(warnings), ['incentivo', 'soluzione', 'selezione', 'incentivo']);
    assert.match(warnings[0].text, /^Introduction: /);
    assert.deepEqual(leftovers(warnings), []);
  });

  it('dice dove sono rimaste le parentesi quadre, con una o più domande', () => {
    const one = surveyWarnings({ intro: 'We are [names].', privacy: 'Ok', thanks: 'Thanks [name]', thanks_contact: '[x]', questions: [q('[What?]'), q('Email', { type: 'email', role: 'contatto' })] });
    assert.equal(one.find((w) => w.code === 'parentesi').text, 'Parts in square brackets still to replace: introduction, final message, message for people who want to be contacted, 1 question.');
    const two = surveyWarnings({ intro: 'Ok', privacy: '[who]', questions: [q('[a]'), q('[b]', { id: 'q-2' }), q('Email', { type: 'email', role: 'contatto' })] });
    assert.match(two.find((w) => w.code === 'parentesi').text, /: privacy notice, 2 questions\.$/);
  });
});

describe('modello di partenza in inglese', () => {
  const data = template.surveyTemplate();
  const clean = sanitizeSnapshot('survey', { title: 'Q', idea_id: '11111111-1111-4111-8111-111111111111', data }).data;

  it('ha introduzione, informativa di circa 150 parole e messaggi finali in inglese', () => {
    assert.equal(clean.questions.length, data.questions.length, 'ogni domanda del modello è valida');
    assert.match(clean.intro, /^We are \[names\], \[who you really are.*\]\. We are studying how people \[deal with the problem\]\. We are not selling anything\./);
    const words = countWords(template.PRIVACY_TEMPLATE);
    assert.ok(words >= 130 && words <= 190, `privacy di circa 150 parole: ${words}`);
    for (const part of ['Who collects', 'Why', 'What data', 'Anonymity', 'How long', 'rights', 'writing to']) assert.match(template.PRIVACY_TEMPLATE, new RegExp(part));
    assert.ok(clean.thanks && clean.thanks_contact);
    const texts = [clean.intro, template.PRIVACY_TEMPLATE, clean.thanks, clean.thanks_contact, ...clean.questions.flatMap((x) => [x.label, x.help, ...(x.options || []).map((o) => o.label), ...(x.scale?.labels || [])])];
    assert.deepEqual(texts.flatMap((t) => italianWords(t)), []);
  });

  it('tiene gli stessi identificativi di domande e opzioni in ogni lingua', () => {
    assert.deepEqual(clean.questions.map((x) => x.id), ['situazione', 'eta', 'ultima-volta', 'episodio', 'quante-volte', 'quanto-pesa', 'email']);
    assert.deepEqual(clean.questions[1].options.map((o) => o.id), ['meno-25', '25-34', '35-44', '45-54', '55-piu']);
    assert.deepEqual(clean.questions[2].options.map((o) => o.id), ['settimana', 'mese', 'sei-mesi', 'prima', 'mai']);
    assert.deepEqual(clean.questions.map((x) => x.role), ['persona', 'persona', 'problema', 'problema', 'problema', 'problema', 'contatto']);
  });

  it('chiede fatti passati e lascia come avvisi solo le parentesi da sostituire', () => {
    assert.ok(clean.questions.some((x) => /^The last time/.test(x.label)));
    assert.ok(clean.questions.some((x) => /^In the last 4 weeks, how many times/.test(x.label)));
    assert.deepEqual(clean.questions[1].options.map((o) => o.label), ['Under 25', '25 to 34', '35 to 44', '45 to 54', '55 or over']);
    assert.deepEqual(clean.questions.at(-2).scale.labels, template.presetLabels('quantita', 5));
    assert.ok(estimateMinutes(clean) <= LIMITS_ADVICE.minutes);
    assert.deepEqual(codes(surveyWarnings(clean)), ['parentesi']);
    assert.match(surveyWarnings(clean)[0].text, /introduction, privacy notice, final message, \d questions/);
    for (const question of clean.questions) assert.ok(codes(questionWarnings(question)).every((c) => c === 'parentesi' || c === 'etichette'), question.id);
  });

  it('le domande nuove nascono in inglese e restano valide per lo schema', () => {
    const cases = { sezione: 'New section', scelta: 'New question', scelte: 'New question', scala: 'New question', numero: 'New question', breve: 'New question', lunga: 'New question', email: 'If you\'re happy to talk about it in a short chat, leave us your email' };
    for (const [type, label] of Object.entries(cases)) {
      const fresh = template.newQuestion(type);
      assert.equal(fresh.label, label, type);
      assert.equal(sanitizeSnapshot('survey', { data: { questions: [fresh] } }).data.questions.length, 1, type);
    }
    assert.deepEqual(template.newQuestion('scelta').options.map((o) => o.label), ['First option', 'Second option']);
    assert.deepEqual(questionWarnings(template.newQuestion('email')), []);
  });
});

describe('etichette suggerite per le scale in inglese', () => {
  const EXPECTED = {
    frequenza: ['Frequency', ['Never', 'Rarely', 'Sometimes', 'Often', 'Always']],
    quantita: ['Amount', ['Not at all', 'A little', 'Moderately', 'A lot', 'A great deal']],
    facilita: ['Ease', ['Very difficult', 'Difficult', 'Neither easy nor difficult', 'Easy', 'Very easy']],
    qualita: ['Quality', ['Very poor', 'Poor', 'Fair', 'Good', 'Excellent']],
    importanza: ['Importance', ['Not at all important', 'Slightly important', 'Moderately important', 'Very important', 'Essential']],
  };
  for (const [key, [name, five]] of Object.entries(EXPECTED)) {
    it(`${key} si chiama ${name} e ha un etichetta per ogni punto, a 5 e a 7`, () => {
      const preset = template.SCALE_PRESETS.find(([k]) => k === key);
      assert.equal(preset[1], name);
      assert.deepEqual(template.presetLabels(key, 5), five);
      assert.equal(template.presetLabels(key, 7).length, 7);
      assert.equal(new Set(template.presetLabels(key, 7)).size, 7, 'sette etichette diverse');
      assert.deepEqual([...five, ...template.presetLabels(key, 7)].flatMap((l) => italianWords(l)), []);
      assert.deepEqual(questionWarnings(q('How often?', { type: 'scala', scale: template.scaleFromLabels(template.presetLabels(key, 7)) })), []);
    });
  }

  it('le chiavi restano le stesse in ogni lingua e una chiave sconosciuta non dà etichette', () => {
    assert.deepEqual(template.SCALE_PRESETS.map(([k]) => k), Object.keys(EXPECTED));
    assert.deepEqual(template.presetLabels('inesistente', 5), []);
  });
});

describe('colori e contrasto in inglese', () => {
  it('il rapporto di contrasto si scrive con il punto decimale, arrotondato per difetto', () => {
    assert.equal(fmtRatio(contrastRatio(SURVEY_ACCENT, '#ffffff')), '6.9:1');
    assert.equal(fmtRatio(4.49), '4.4:1');
    assert.equal(fmtRatio(21), '21.0:1');
  });

  it('i colori della tavolozza hanno nomi inglesi ma le pagine di anteprima restano quelle pubblicate', () => {
    assert.deepEqual(ACCENT_PALETTE.map(([, name]) => name), ['Indigo', 'Blue', 'Teal', 'Green', 'Amber', 'Red', 'Raspberry', 'Violet']);
    assert.deepEqual(PREVIEW_PAGES.map((p) => p.page), ['q-indaco.html', 'q-blu.html', 'q-verde-acqua.html', 'q-verde.html', 'q-ambra.html', 'q-rosso.html', 'q-lampone.html', 'q-viola.html']);
    assert.deepEqual(PREVIEW_PAGES.map((p) => p.name), ACCENT_PALETTE.map(([, name]) => name));
    assert.equal(previewPage('#15803d'), 'q-verde.html');
    assert.equal(previewPage('#123456'), 'q.html');
  });

  it('gli avvisi di contrasto sono in inglese con il rapporto scritto all inglese', () => {
    const yellow = accentCheck('#f5e663', 'chiaro');
    assert.deepEqual(yellow.problems.map((p) => p.code), ['sfondo-chiaro']);
    assert.match(yellow.problems[0].text, /\(1\.2:1\)/);
    const dark = accentCheck(SURVEY_ACCENT, 'scuro');
    assert.deepEqual(dark.problems.map((p) => p.code), ['sfondo-scuro']);
    const grey = accentCheck('#7a7a7a');
    const all = [...yellow.problems, ...dark.problems, ...grey.problems];
    assert.deepEqual(leftovers(all), []);
  });
});
