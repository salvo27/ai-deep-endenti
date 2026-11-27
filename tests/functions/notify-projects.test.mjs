// The notify function in a site with many projects: one email per person and project, in the language of whoever
// receives it, with links that open that project; the site asks for the summary of one project at a time.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MENTION_DELAY_MS } from '../../supabase/functions/notify/handler.js';
import { siteLink } from '../../supabase/functions/notify/templates.js';
import { DEFAULT_LANGUAGE, ERRORS, LANGUAGES, TEXTS } from '../../supabase/functions/notify/texts.js';
import { looksItalian } from '../setup/italian.mjs';
import {
  ALFA, ANNA, BETA, BRUNO, CHAT, CHIARA, DARIO, GAMMA, IDEA, IDEA2, ITEM, MONDAY, MSG, SITE,
  busyWeek, cron, emptyWeek, fromSite, hrefs, mention, minutesAgo, recipient, setup,
} from './notify.helpers.mjs';

const WEEK_AGO = new Date(MONDAY.getTime() - 7 * 24 * 3600 * 1000).toISOString();
const json = async (res) => ({ status: res.status, ...(await res.json()) });

// Anna is in Alfa and in Beta; Bruno only in Alfa.
const twoProjects = (over = {}) => [recipient(ANNA, over), recipient(BRUNO, over), recipient(ANNA, { project_id: BETA, ...over })];
const betaWeek = () => ({ ...emptyWeek(BETA), new_ideas: [{ id: IDEA, title: 'Idea di Beta' }] });
const weekOf = (project) => (project === ALFA ? busyWeek(ALFA) : project === BETA ? betaWeek() : emptyWeek(project));

describe('le menzioni: una email per persona e progetto', () => {
  it('chi è taggato in due progetti riceve due email, ognuna con il nome e i link del suo progetto', async () => {
    const { handle, sent, calls } = setup({
      people: twoProjects(),
      mentions: [
        mention({ id: 1 }),
        mention({ id: 2, project_id: BETA, project_name: 'Beta', chat_title: 'Spesa' }),
        mention({ id: 3, project_id: BETA, project_name: 'Beta', source: 'comment', chat_id: null, item_id: IDEA, item_title: 'Idea di Beta', item_kind: 'idea' }),
      ],
    });
    const body = await json(await handle(cron()));
    assert.deepEqual([body.sent, body.mentions, body.skipped, body.waiting], [2, 3, 0, 0]);
    assert.deepEqual(calls.claimed, [[1], [2, 3]]);
    assert.deepEqual(sent.map((s) => s.body.subject), ['Bruno ti ha taggato in Alfa', 'Hai 2 menzioni da leggere in Beta']);
    assert.deepEqual(sent.map((s) => s.body.to[0].email), ['anna@board.example', 'anna@board.example']);
    assert.doesNotMatch(sent[0].body.htmlContent, /Spesa|Idea di Beta/, 'il testo di Beta non entra nell email di Alfa');
    assert.doesNotMatch(sent[1].body.htmlContent, /Generale/);
    for (const [i, project] of [[0, ALFA], [1, BETA]]) {
      for (const href of hrefs(sent[i].body.htmlContent)) assert.ok(href.endsWith(`progetto=${project}`), href);
    }
  });

  for (const [minutes, outcome] of [[9, 'waiting'], [10, 'sent'], [11, 'sent']]) {
    it(`una menzione di ${minutes} minuti fa ${outcome === 'sent' ? 'parte' : 'aspetta'}, e l attesa di un progetto non ferma l altro`, async () => {
      const { handle, sent, calls } = setup({
        people: twoProjects(),
        mentions: [mention({ id: 1, created_at: new Date(MONDAY.getTime() - minutes * 60000).toISOString() }), mention({ id: 2, project_id: BETA, project_name: 'Beta', created_at: minutesAgo(MONDAY, 30) })],
      });
      const body = await json(await handle(cron()));
      assert.equal(MENTION_DELAY_MS, 10 * 60000);
      assert.equal(body.waiting, outcome === 'waiting' ? 1 : 0);
      assert.deepEqual(calls.claimed, outcome === 'waiting' ? [[2]] : [[1], [2]]);
      assert.equal(sent.length, outcome === 'waiting' ? 1 : 2);
    });
  }

  it('una menzione di un progetto che non è tra i progetti attivi della persona non parte, ad esempio se è archiviato', async () => {
    const { handle, sent, calls } = setup({ people: [recipient(ANNA)], mentions: [mention({ id: 7, project_id: GAMMA, project_name: 'Gamma' })] });
    const body = await json(await handle(cron()));
    assert.deepEqual([body.sent, body.skipped], [0, 1]);
    assert.deepEqual(calls.claimed, [[7]]);
    assert.equal(sent.length, 0);
  });

  it('chi è taggato in un progetto da cui è uscito non riceve nulla, anche se resta in un altro', async () => {
    const { handle, sent } = setup({ people: [recipient(ANNA, { project_id: BETA })], mentions: [mention({ id: 1 })] });
    await handle(cron());
    assert.equal(sent.length, 0);
  });
});

describe('il riepilogo del lunedì: uno per persona e progetto', () => {
  it('chi sta in due progetti riceve un riepilogo per ciascuno, con i dati di quel progetto', async () => {
    const { handle, sent, calls } = setup({ people: twoProjects(), week: weekOf });
    const body = await json(await handle(cron({ job: 'weekly' })));
    assert.equal(body.sent, 3);
    assert.deepEqual(calls.weekly, [[ALFA, WEEK_AGO], [BETA, WEEK_AGO]], 'i dati si leggono una volta per progetto');
    assert.deepEqual(calls.claimedWeekly, [[ANNA, ALFA, '2026-11-02'], [BRUNO, ALFA, '2026-11-02'], [ANNA, BETA, '2026-11-02']]);
    assert.deepEqual(sent.map((s) => s.body.subject), ['La tua settimana in Alfa', 'La tua settimana in Alfa', 'La tua settimana in Beta']);
    assert.match(sent[2].body.textContent, /Nuove idee: 1 \(«Idea di Beta»\)/);
    assert.doesNotMatch(sent[2].body.textContent, /Idea alfa/);
  });

  it('il segno è per persona, progetto e settimana: già inviato in Alfa non ferma Beta', async () => {
    const { handle, sent } = setup({ people: twoProjects(), week: weekOf, alreadySent: [`${ANNA}|${ALFA}`] });
    const body = await json(await handle(cron({ job: 'weekly' })));
    assert.deepEqual([body.sent, body.already], [2, 1]);
    assert.deepEqual(sent.map((s) => [s.body.to[0].email, s.body.subject]), [['bruno@board.example', 'La tua settimana in Alfa'], ['anna@board.example', 'La tua settimana in Beta']]);
  });

  it('un rifiuto del servizio libera solo il riepilogo di quella persona in quel progetto', async () => {
    const { handle, calls } = setup({ people: twoProjects(), week: weekOf, brevoStatus: (n) => (n === 1 ? 400 : 201) });
    const body = await json(await handle(cron({ job: 'weekly' })));
    assert.deepEqual([body.sent, body.failed], [2, 1]);
    assert.deepEqual(calls.releasedWeekly, [[ANNA, ALFA, '2026-11-02']]);
  });

  it('un esito incerto ferma il giro anche per gli altri progetti', async () => {
    const { handle, sent, calls } = setup({ people: twoProjects(), week: weekOf, brevoStatus: () => 503 });
    await handle(cron({ job: 'weekly' }));
    assert.equal(sent.length, 1);
    assert.deepEqual(calls.weekly.map(([p]) => p), [ALFA]);
  });

  it('un progetto in cui nessuno vuole il riepilogo non si legge nemmeno', async () => {
    const { handle, calls } = setup({ people: [recipient(ANNA), recipient(CHIARA, { project_id: BETA, weekly: false })], week: weekOf });
    const body = await json(await handle(cron({ job: 'weekly' })));
    assert.deepEqual(calls.weekly.map(([p]) => p), [ALFA]);
    assert.equal(body.optedOut, 1);
  });

  it('si scrive solo ai progetti tra i destinatari: un progetto archiviato non ne ha, e non si legge', async () => {
    const { handle, calls, sent } = setup({ people: [recipient(ANNA)], week: weekOf });
    await handle(cron({ job: 'weekly' }));
    assert.deepEqual(calls.weekly.map(([p]) => p), [ALFA]);
    assert.ok(sent.every((s) => !s.body.subject.includes('Gamma')));
  });

  for (const [when, now, week] of [
    ['domenica alle 23:30 in Italia', '2026-11-08T22:30:00Z', '2026-11-02'],
    ['lunedì alle 00:30 in Italia', '2026-11-08T23:30:00Z', '2026-11-09'],
    ['lunedì alle 7:00 in Italia', '2026-11-09T06:00:00Z', '2026-11-09'],
  ]) {
    it(`${when} il segno è della settimana del ${week}`, async () => {
      const { handle, calls } = setup({ people: [recipient(ANNA)], week: weekOf, deps: { now: () => new Date(now) } });
      await handle(cron({ job: 'weekly' }));
      assert.deepEqual(calls.claimedWeekly, [[ANNA, ALFA, week]]);
    });
  }
});

describe('la lingua di chi riceve', () => {
  for (const [language, expected] of [['it', 'it'], ['en', 'en'], [null, 'en'], [undefined, 'en'], ['fr', 'en'], ['IT', 'en']]) {
    it(`con la lingua ${JSON.stringify(language)} nel profilo menzioni e riepilogo arrivano in ${expected}`, async () => {
      const person = recipient(ANNA, { language });
      if (language === undefined) delete person.language;
      const t = TEXTS[expected];
      const m = setup({ people: [person], mentions: [mention({ language })] });
      await m.handle(cron());
      assert.equal(m.sent[0].body.subject, t.mentions.subjectOne('Bruno', 'Alfa'));
      assert.match(m.sent[0].body.htmlContent, new RegExp(`<html lang="${expected}">`));
      assert.ok(m.sent[0].body.textContent.startsWith(`${t.hello('Anna')}\n${t.mentions.intro(1)}`));

      const w = setup({ people: [person], week: busyWeek() });
      await w.handle(cron({ job: 'weekly' }));
      assert.equal(w.sent[0].body.subject, t.weekly.subject('Alfa'));
      assert.match(w.sent[0].body.htmlContent, new RegExp(`<h2[^>]*>${t.weekly.todo}</h2>`));
      assert.ok(w.sent[0].body.textContent.startsWith(`${t.hello('Anna')}\n${t.weekly.intro}`));
    });
  }

  it('l inglese è la lingua predefinita, e le lingue sono quelle del sito', () => {
    assert.equal(DEFAULT_LANGUAGE, 'en');
    assert.deepEqual(LANGUAGES, ['en', 'it']);
  });

  // Content written by people in English, so that any Italian left can only come from the templates.
  function englishWeek() {
    const ideas = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'].map((title, i) => ({ id: `11111111-1111-4111-8111-11111111111${i}`, title, owner: ANNA, next_step: '' }));
    return {
      ...emptyWeek(ALFA),
      project_name: 'Sensors',
      ideas,
      contacts: [
        { id: 'a0000000-0000-4000-8000-000000000001', role: 'Buyer', idea_title: 'Alpha', owner: ANNA, next_date: '2026-10-28' },
        { id: 'a0000000-0000-4000-8000-000000000002', role: '', idea_title: 'Alpha', owner: ANNA, next_date: '2026-11-02' },
        { id: 'a0000000-0000-4000-8000-000000000003', role: 'Expert', idea_title: 'Alpha', owner: ANNA, next_date: '2026-11-05' },
      ],
      experiments: [
        { id: 'b0000000-0000-4000-8000-000000000001', title: 'Will they pay?', idea_title: 'Alpha', owner: ANNA, status: 'in_corso', start_date: null, end_date: '2026-10-30' },
        { id: 'b0000000-0000-4000-8000-000000000002', title: 'Landing page', idea_title: 'Alpha', owner: ANNA, status: 'pianificato', start_date: null, end_date: null },
        { id: 'b0000000-0000-4000-8000-000000000003', title: 'Pilot', idea_title: 'Alpha', owner: ANNA, status: 'pianificato', start_date: '2026-11-04', end_date: null },
        { id: 'b0000000-0000-4000-8000-000000000004', title: 'Survey', idea_title: 'Alpha', owner: ANNA, status: 'pianificato', start_date: '2026-10-20', end_date: null },
      ],
      new_ideas: ideas.slice(0, 5).map(({ id, title }) => ({ id, title })),
      busy_ideas: [{ id: ideas[0].id, title: 'Alpha', changes: 4 }],
      reached: [
        { id: 'e0000000-0000-4000-8000-000000000001', kind: 'interview', title: 'Company A', source: null, commitment: 'pilota' },
        { id: 'e0000000-0000-4000-8000-000000000004', kind: 'experiment', title: 'Right price?', source: null, commitment: null },
        { id: 'e0000000-0000-4000-8000-000000000005', kind: 'decision', title: 'Two finalists', source: null, commitment: null },
      ],
      unread: [{ user_id: ANNA, language: 'en', mentions: 1, chat: 2 }],
    };
  }

  it('le email in inglese non contengono italiano, con ogni riga dei modelli', async () => {
    const person = recipient(ANNA, { language: 'en', project_name: 'Sensors' });
    const m = setup({
      people: [person],
      mentions: [
        mention({ id: 1, project_name: 'Sensors', chat_title: 'General', excerpt: 'Look at the numbers' }),
        mention({ id: 2, project_name: 'Sensors', source: 'note', chat_id: null, item_id: ITEM, item_title: '', item_kind: 'note', excerpt: '' }),
        mention({ id: 3, project_name: 'Sensors', source: 'comment', chat_id: null, item_id: IDEA, item_title: '', item_kind: 'idea', author_name: '', excerpt: 'Ok' }),
      ],
    });
    await m.handle(cron());
    const w = setup({ people: [person], week: englishWeek() });
    await w.handle(cron({ job: 'weekly' }));
    const { subject, textContent, htmlContent } = w.sent[0].body;
    assert.equal(subject, 'Your week in Sensors');
    assert.match(textContent, /Contact \(Buyer\) for the idea “Alpha”: late, it was due on 28 Oct/);
    assert.match(textContent, /And 1 more thing: you will find it in the dashboard\./);
    assert.match(textContent, /New ideas: 5 \(“Alpha”, “Bravo”, “Charlie” and 2 more\)/);
    // The routes of the site stay Italian in the addresses: only the words around them count.
    for (const email of [m.sent[0].body, w.sent[0].body]) {
      for (const line of `${email.subject}\n${email.textContent}`.split('\n')) assert.equal(looksItalian(line.replace(/https?:\/\/\S+/g, '')), false, line);
      assert.match(email.htmlContent, /<html lang="en">/);
    }
    assert.doesNotMatch(htmlContent, /«|»/, 'le virgolette sono quelle inglesi');
  });

  it('le date e le ore seguono la lingua di chi riceve', async () => {
    for (const [language, day, time] of [['it', /28 ott/, /2 nov, 06:45/], ['en', /28 Oct/, /2 Nov, 06:45/]]) {
      const w = setup({ people: [recipient(ANNA, { language })], week: busyWeek() });
      await w.handle(cron({ job: 'weekly' }));
      assert.match(w.sent[0].body.textContent, day, language);
      const m = setup({ people: [recipient(ANNA, { language })], mentions: [mention()] });
      await m.handle(cron());
      assert.match(m.sent[0].body.textContent, time, language);
    }
  });
});

describe('i link aprono il progetto dell email', () => {
  for (const [route, project, expected] of [
    ['', ALFA, `${SITE}/#/?progetto=${ALFA}`],
    ['chat', ALFA, `${SITE}/#/chat?progetto=${ALFA}`],
    [`idea/${IDEA}/commenti`, BETA, `${SITE}/#/idea/${IDEA}/commenti?progetto=${BETA}`],
    [`chat/${CHAT}?messaggio=${MSG}`, ALFA, `${SITE}/#/chat/${CHAT}?messaggio=${MSG}&progetto=${ALFA}`],
    ['profilo', ALFA.toUpperCase(), `${SITE}/#/profilo?progetto=${ALFA.toUpperCase()}`],
    ['profilo', 'non-un-uuid', `${SITE}/#/profilo`],
    ['', null, `${SITE}/`],
  ]) {
    it(`${JSON.stringify(route)} con il progetto ${project} diventa ${expected.slice(SITE.length)}`, () => {
      assert.equal(siteLink(`${SITE}/`, route, project), expected);
      assert.equal(siteLink(SITE, route, project), expected, 'anche senza barra finale');
    });
  }

  it('ogni link di menzioni e riepilogo porta il progetto della sua email', async () => {
    const m = setup({ people: twoProjects(), mentions: [mention({ id: 1 }), mention({ id: 2, project_id: BETA, project_name: 'Beta' })] });
    await m.handle(cron());
    const w = setup({ people: twoProjects(), week: weekOf });
    await w.handle(cron({ job: 'weekly' }));
    const emails = [...m.sent, ...w.sent].map((s) => s.body);
    assert.equal(emails.length, 5);
    for (const email of emails) {
      const project = email.subject.endsWith('Beta') ? BETA : ALFA;
      const links = hrefs(email.htmlContent);
      assert.ok(links.length >= 3, email.subject);
      for (const href of links) {
        assert.ok(href.startsWith(`${SITE}/#/`), href);
        assert.equal(new URLSearchParams(href.split('?')[1]).get('progetto'), project, href);
      }
      for (const url of email.textContent.match(/https:\/\/\S+/g)) assert.ok(url.endsWith(`progetto=${project}`), url);
    }
  });
});

describe('dal sito: un progetto alla volta, solo per il suo admin', () => {
  for (const [what, project] of [['manca', undefined], ['è vuoto', ''], ['non è un uuid', 'alfa'], ['ha un carattere in più', `${ALFA}0`], ['è un numero', 7], ['è null', null]]) {
    it(`se il progetto ${what} la richiesta è rifiutata prima di chiedere i permessi`, async () => {
      const { handle, calls } = setup();
      const body = project === undefined ? JSON.stringify({ job: 'weekly-preview' }) : undefined;
      const res = await json(await handle(fromSite({ project, body })));
      assert.deepEqual(res, { status: 400, error: ERRORS.en.invalid_project, code: 'invalid_project' });
      assert.deepEqual(calls.admin, []);
    });
  }

  it('i permessi si chiedono con is_admin per il progetto della richiesta, con il token di chi chiama', async () => {
    const { handle, calls } = setup();
    assert.equal((await handle(fromSite({ project: ALFA.toUpperCase() }))).status, 200);
    assert.deepEqual(calls.admin, [['Bearer admin', ALFA]]);
  });

  it('l admin di un altro progetto non può chiedere il riepilogo di questo', async () => {
    const { handle, calls, sent } = setup({ people: [recipient(ANNA), recipient(DARIO, { project_id: BETA })] });
    assert.deepEqual(await json(await handle(fromSite({ token: 'Bearer dario', job: 'weekly-now', project: ALFA }))), { status: 403, error: ERRORS.en.admin_only, code: 'admin_only' });
    assert.equal(calls.recipients, 0);
    assert.equal(sent.length, 0);
    assert.equal((await handle(fromSite({ token: 'Bearer dario', project: BETA }))).status, 200);
  });

  it('l anteprima conta e mostra solo il progetto della richiesta', async () => {
    const { handle, calls } = setup({ people: [...twoProjects(), recipient(CHIARA, { project_id: BETA })], week: weekOf });
    const body = await json(await handle(fromSite({ project: ALFA })));
    assert.deepEqual([body.recipients, body.empty, body.optedOut], [2, 0, 0]);
    assert.deepEqual(calls.weekly, [[ALFA, WEEK_AGO]]);
    assert.equal(body.preview.subject, 'La tua settimana in Alfa');
    const links = body.preview.sections.flatMap((s) => s.lines.flatMap((l) => l.parts.map((p) => p.href))).filter(Boolean);
    assert.ok(links.length > 0);
    for (const href of links) assert.ok(href.endsWith(`progetto=${ALFA}`), href);
  });

  it('l invio subito manda solo il riepilogo di quel progetto', async () => {
    const { handle, calls, sent } = setup({ people: twoProjects(), week: weekOf });
    const body = await json(await handle(fromSite({ job: 'weekly-now', project: BETA, token: 'Bearer dario' })));
    assert.equal(body.sent, 1);
    assert.deepEqual(calls.weekly.map(([p]) => p), [BETA]);
    assert.deepEqual(calls.claimedWeekly, [[ANNA, BETA, '2026-11-02']]);
    assert.equal(sent[0].body.subject, 'La tua settimana in Beta');
  });

  it('un progetto senza destinatari attivi, come uno archiviato, non riceve nulla anche se la richiesta passa', async () => {
    const { handle, calls, sent } = setup({ people: [recipient(ANNA)], week: weekOf, deps: { isAdmin: async () => true } });
    const body = await json(await handle(fromSite({ job: 'weekly-now', project: GAMMA })));
    assert.deepEqual([body.sent, body.empty, body.optedOut], [0, 0, 0]);
    assert.deepEqual([calls.weekly, calls.claimedWeekly, sent], [[], [], []]);
  });

  for (const [who, person, unread, language] of [
    ['che legge in inglese', recipient(ANNA, { language: 'en' }), [], 'en'],
    ['che legge in italiano', recipient(ANNA, { language: 'it' }), [], 'it'],
    ['senza lingua nel profilo', recipient(ANNA, { language: null }), [], 'en'],
    ['senza email, con la lingua dai non letti', null, [{ user_id: ANNA, language: 'it', mentions: 1, chat: 0 }], 'it'],
    ['senza email né lingua', null, [{ user_id: ANNA, language: null, mentions: 1, chat: 0 }], 'en'],
  ]) {
    it(`l anteprima dell admin ${who} è in ${language}, come la sua email`, async () => {
      const week = { ...busyWeek(), unread: unread.length ? unread : busyWeek().unread };
      const { handle } = setup({ people: [...(person ? [person] : []), recipient(BRUNO)], week });
      const { preview } = await json(await handle(fromSite()));
      const t = TEXTS[language];
      assert.equal(preview.language, language);
      assert.equal(preview.subject, t.weekly.subject('Alfa'));
      assert.equal(preview.hello, t.hello(person ? 'Anna' : ''));
      assert.equal(preview.intro, t.weekly.manualIntro);
      assert.equal(preview.sections[0].title, t.weekly.todo);
    });
  }

  const FAILURES = [
    ['senza accesso', { token: null }, 401, 'sign_in_required'],
    ['da un membro che non è admin', { token: 'Bearer membro' }, 403, 'admin_only'],
    ['con un progetto non valido', { project: 'alfa' }, 400, 'invalid_project'],
    ['con un job sconosciuto', { job: 'weekly' }, 400, 'invalid_request'],
    ['se il database non risponde', { broken: true }, 500, 'summary_failed'],
  ];
  for (const [what, how, status, code] of FAILURES) {
    for (const language of [...LANGUAGES, undefined]) {
      it(`${what}: ${status} con il testo ${language ?? 'predefinito'} di ${code}`, async () => {
        const deps = how.broken ? { recipients: async () => { throw new Error('giù'); } } : {};
        const { handle } = setup({ deps });
        const res = await json(await handle(fromSite({ ...how, language })));
        assert.deepEqual(res, { status, error: ERRORS[language ?? DEFAULT_LANGUAGE][code], code });
      });
    }
  }

  for (const [size, status] of [[1024, 200], [1025, 400]]) {
    it(`una richiesta che dichiara ${size} byte ${status === 200 ? 'si legge' : 'non si legge nemmeno'}`, async () => {
      const { handle, calls } = setup();
      const res = await handle(fromSite({ language: 'it', extraHeaders: { 'content-length': String(size) } }));
      assert.equal(res.status, status);
      if (status === 400) assert.deepEqual(await res.json(), { error: ERRORS.en.invalid_request, code: 'invalid_request' });
      assert.equal(calls.recipients, status === 200 ? 1 : 0);
    });
  }

  for (const language of ['fr', 'IT', '', 1]) {
    it(`la lingua ${JSON.stringify(language)} non è valida: la richiesta è rifiutata in inglese`, async () => {
      const { handle } = setup();
      assert.deepEqual(await json(await handle(fromSite({ language }))), { status: 400, error: ERRORS.en.invalid_request, code: 'invalid_request' });
    });
  }
});

describe('i testi delle email e degli errori', () => {
  // Every entry of a set of texts with its path; a function is called with one, many and no values, to reach every branch.
  const SAMPLES = [[1, 'Alfa'], [2, 'Alfa'], [0, '']];
  function entries(texts, path = '') {
    return Object.entries(texts).flatMap(([name, entry]) => {
      const at = path ? `${path}.${name}` : name;
      if (typeof entry === 'object' && entry !== null) return entries(entry, at);
      if (typeof entry === 'function') return SAMPLES.map((args) => [`${at}(${args})`, entry(...args)]);
      return [[at, entry]];
    });
  }
  const shape = (texts) => entries(texts).map(([path, value]) => `${path}: ${typeof value}`).sort();

  it('le due lingue hanno le stesse voci, dello stesso tipo', () => {
    assert.deepEqual(shape(TEXTS.en), shape(TEXTS.it));
    assert.deepEqual(shape(ERRORS.en), shape(ERRORS.it));
  });

  it('nessun testo è vuoto o usa le lineette lunghe', () => {
    for (const language of LANGUAGES) {
      for (const [path, value] of [...entries(TEXTS[language]), ...entries(ERRORS[language])]) {
        assert.equal(typeof value, 'string', `${language}.${path}`);
        assert.ok(value.length > 0, `${language}.${path}`);
        assert.doesNotMatch(value, /[–—]/, `${language}.${path}`);
      }
    }
  });

  it('i testi in inglese non contengono italiano', () => {
    for (const [path, value] of [...entries(TEXTS.en), ...entries(ERRORS.en)]) assert.equal(looksItalian(value), false, `${path}: ${value}`);
  });

  it('i due testi di ogni errore sono diversi', () => {
    for (const code of Object.keys(ERRORS.en)) assert.notEqual(ERRORS.en[code], ERRORS.it[code], code);
  });
});

describe('i log', () => {
  it('con più progetti contengono ancora solo numeri', async () => {
    const runs = [
      setup({ people: twoProjects(), mentions: [mention({ id: 1 }), mention({ id: 2, project_id: BETA, project_name: 'Beta' })] }),
      setup({ people: twoProjects(), week: weekOf, brevoStatus: (n) => (n === 2 ? 400 : 201) }),
      setup({ people: twoProjects(), week: weekOf }),
    ];
    await runs[0].handle(cron());
    await runs[1].handle(cron({ job: 'weekly' }));
    await runs[2].handle(fromSite({ job: 'weekly-now' }));
    const logs = runs.flatMap((r) => r.logs);
    assert.ok(logs.length >= 3);
    for (const { event, job, statuses, ...rest } of logs) {
      assert.match(event, /^notify_[a-z_]+$/);
      assert.match(job, /^(mentions|weekly|weekly-now|weekly-preview)$/);
      for (const status of statuses || []) assert.ok(Number.isInteger(status) || status === 'rete', String(status));
      for (const [field, value] of Object.entries(rest)) assert.ok(typeof value === 'number' || typeof value === 'boolean' || value === null, `${event}.${field}: ${value}`);
    }
    assert.doesNotMatch(JSON.stringify(logs), /[0-9a-f]{8}-[0-9a-f]{4}-|Alfa|Beta|Anna|Bruno|board\.example/);
  });
});
