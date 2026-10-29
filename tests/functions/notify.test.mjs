import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BREVO_URL,
  STRONG_COMMITMENTS,
  addDays,
  createHandler,
  mondayOf,
  personalTodo,
  readConfig,
  romeDate,
  teamSummary,
} from '../../supabase/functions/notify/handler.js';
import { escapeHtml, mentionRoute, mentionWhere } from '../../supabase/functions/notify/templates.js';
import { STRONG_COMMITMENTS as SITE_COMMITMENTS } from '../../assets/js/schema.js';

const SECRET = 's'.repeat(40);
const SITE = 'https://board.example/app';
const ANNA = '00000000-0000-4000-8000-00000000000a';
const BRUNO = '00000000-0000-4000-8000-00000000000b';
const CHIARA = '00000000-0000-4000-8000-00000000000c';
const DARIO = '00000000-0000-4000-8000-00000000000d';
const CHAT = 'c0000000-0000-4000-8000-000000000001';
const MSG = 'd0000000-0000-4000-8000-000000000001';
const IDEA = '11111111-1111-4111-8111-111111111111';
const IDEA2 = '11111111-1111-4111-8111-111111111112';
const ITEM = '22222222-2222-4222-8222-222222222222';
const XSS = '<img src=x onerror="alert(1)">';
// Lunedì 2 novembre 2026, 6:00 UTC: le 7:00 in Italia (ora solare).
const MONDAY = new Date('2026-11-02T06:00:00Z');

const ENV = {
  NOTIFY_SECRET: SECRET,
  BREVO_API_KEY: 'chiave-di-prova',
  BREVO_SENDER_EMAIL: 'avvisi@board.example',
  BREVO_SENDER_NAME: 'Board di prova',
  SITE_URL: SITE,
  ALLOWED_ORIGINS: 'https://board.example, http://localhost:8080',
};
const ORIGIN = 'https://board.example';

const people = () => [
  { user_id: ANNA, display_name: 'Anna', email: 'anna@board.example', mentions: true, weekly: true },
  { user_id: BRUNO, display_name: 'Bruno', email: 'bruno@board.example', mentions: true, weekly: true },
  { user_id: CHIARA, display_name: 'Chiara', email: 'chiara@board.example', mentions: false, weekly: false },
];

const minutesAgo = (now, m) => new Date(now.getTime() - m * 60000).toISOString();

function mention(over) {
  return {
    id: 1,
    user_id: ANNA,
    author_id: BRUNO,
    author_name: 'Bruno',
    source: 'chat',
    source_id: MSG,
    chat_id: CHAT,
    chat_title: 'Generale',
    item_id: null,
    item_title: null,
    item_kind: null,
    excerpt: 'Ciao @Anna, guarda i dati',
    created_at: minutesAgo(MONDAY, 15),
    read_at: null,
    ...over,
  };
}

function emptyWeek() {
  return { ideas: [], contacts: [], experiments: [], new_ideas: [], busy_ideas: [], reached: [], unread: [] };
}

function setup(over = {}) {
  const logs = [];
  const sent = [];
  const calls = { claimed: [], released: [], claimedWeekly: [], releasedWeekly: [], recipients: 0, pending: 0, weekly: 0 };
  let claimedOnce = new Set();
  const deps = {
    env: (name) => (over.env ? over.env[name] : ENV[name]),
    now: () => MONDAY,
    log: (event, fields) => logs.push({ event, ...fields }),
    fetch: async (url, init) => {
      sent.push({ url, init, body: JSON.parse(init.body) });
      return over.brevoStatus ? new Response('{"message":"no"}', { status: over.brevoStatus(sent.length) }) : new Response('{"messageId":"m1"}', { status: 201 });
    },
    recipients: async () => {
      calls.recipients += 1;
      return over.people ?? people();
    },
    pendingMentions: async () => {
      calls.pending += 1;
      return over.mentions ?? [];
    },
    claimMentions: async (ids) => {
      calls.claimed.push(ids);
      const fresh = ids.filter((id) => !claimedOnce.has(id) && !(over.readMeanwhile || []).includes(id));
      fresh.forEach((id) => claimedOnce.add(id));
      return fresh;
    },
    releaseMentions: async (ids) => {
      calls.released.push(ids);
      ids.forEach((id) => claimedOnce.delete(id));
    },
    weeklyData: async () => {
      calls.weekly += 1;
      return over.week ?? emptyWeek();
    },
    claimWeekly: async (userId, week) => {
      calls.claimedWeekly.push([userId, week]);
      return !(over.alreadySent || []).includes(userId);
    },
    releaseWeekly: async (userId, week) => calls.releasedWeekly.push([userId, week]),
    ...over.deps,
  };
  return { handle: createHandler(deps), logs, sent, calls };
}

function request({ job = 'mentions', secret = SECRET, method = 'POST', body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (secret) headers['x-notify-secret'] = secret;
  return new Request('https://x.supabase.co/functions/v1/notify', {
    method,
    headers,
    body: method === 'POST' ? (body ?? JSON.stringify({ job })) : undefined,
  });
}

test('only calls with the shared secret are accepted', async () => {
  const { handle, calls, sent, logs } = setup();
  assert.equal((await handle(request({ secret: null }))).status, 403, 'senza segreto è una chiamata dal sito, e senza origine non passa');
  assert.equal((await handle(request({ secret: 'x'.repeat(40) }))).status, 401);
  assert.equal((await handle(request({ secret: SECRET.slice(1) }))).status, 401);
  assert.equal((await handle(request({ method: 'GET' }))).status, 405);
  assert.equal((await handle(request({ body: '{"job":"tutto"}' }))).status, 400);
  assert.equal((await handle(request({ body: '{"job":"mentions","extra":1}' }))).status, 400);
  assert.equal((await handle(request({ body: 'non json' }))).status, 400);
  assert.equal(calls.recipients + calls.pending + calls.weekly, 0);
  assert.equal(sent.length, 0);
  assert.ok(logs.every((l) => !JSON.stringify(l).includes(SECRET)));
  assert.equal((await handle(request())).status, 200);
});

test('without a long enough secret in the environment every call is refused', async () => {
  for (const secret of [undefined, '', 'corto']) {
    const { handle, calls } = setup({ env: { ...ENV, NOTIFY_SECRET: secret } });
    const res = await handle(request({ secret: secret || SECRET }));
    assert.equal(res.status, 503);
    assert.equal(calls.recipients, 0);
  }
});

test('missing Brevo settings: nothing is read, marked or sent, and the answer says why', async () => {
  for (const missing of ['BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'SITE_URL']) {
    const { handle, calls, sent, logs } = setup({ env: { ...ENV, [missing]: '' }, mentions: [mention()] });
    const res = await handle(request());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.configured, false);
    assert.deepEqual(body.missing, [missing]);
    assert.equal(calls.recipients + calls.pending + calls.claimed.length, 0);
    assert.equal(sent.length, 0);
    assert.deepEqual(logs, [{ event: 'notify_not_configured', job: 'mentions', missing: [missing] }]);
  }
  assert.deepEqual(readConfig((n) => ({ ...ENV, SITE_URL: 'javascript:alert(1)' })[n]).missing, ['SITE_URL']);
  assert.equal(readConfig((n) => ENV[n]).siteUrl, `${SITE}/`);
  assert.equal(readConfig((n) => ({ ...ENV, BREVO_SENDER_NAME: '' })[n]).brevo.senderName, 'ai-deep-endenti');
});

test('mentions are grouped in one email per person after 10 minutes, then marked', async () => {
  const mentions = [
    mention({ id: 1 }),
    mention({ id: 2, source: 'comment', source_id: ITEM, chat_id: null, item_id: IDEA, item_title: 'Idea alfa', item_kind: 'idea', created_at: minutesAgo(MONDAY, 2), excerpt: 'Serve @Anna' }),
    mention({ id: 3, user_id: BRUNO, author_id: ANNA, author_name: 'Anna', source: 'note', item_id: ITEM, item_title: 'Riunione', item_kind: 'note', created_at: minutesAgo(MONDAY, 11) }),
    mention({ id: 4, user_id: BRUNO, created_at: minutesAgo(MONDAY, 3), source: 'chat' }),
  ];
  const { handle, sent, calls } = setup({ mentions: [...mentions, mention({ id: 5, user_id: DARIO, created_at: minutesAgo(MONDAY, 4) })] });
  const res = await handle(request());
  assert.deepEqual(await res.json(), { job: 'mentions', configured: true, sent: 2, mentions: 4, skipped: 0, waiting: 1, failed: 0 });
  assert.deepEqual(calls.claimed, [[1, 2], [3, 4]], 'si segnano tutte quelle della persona, anche le più recenti');

  assert.equal(sent.length, 2);
  const [toAnna, toBruno] = sent.map((s) => s.body);
  assert.equal(sent[0].url, BREVO_URL);
  assert.equal(sent[0].init.method, 'POST');
  assert.equal(sent[0].init.headers['api-key'], 'chiave-di-prova');
  assert.deepEqual(toAnna.sender, { email: 'avvisi@board.example', name: 'Board di prova' });
  assert.deepEqual(toAnna.to, [{ email: 'anna@board.example', name: 'Anna' }]);
  assert.equal(toAnna.subject, 'Hai 2 menzioni da leggere su ai-deep-endenti');
  assert.match(toAnna.htmlContent, /Bruno ti ha taggato in «Generale»/);
  assert.match(toAnna.htmlContent, /in un commento su «Idea alfa»/);
  assert.ok(toAnna.htmlContent.includes(`href="${SITE}/#/chat/${CHAT}?messaggio=${MSG}"`), 'link al messaggio esatto');
  assert.ok(toAnna.htmlContent.includes(`href="${SITE}/#/idea/${IDEA}/commenti"`));
  assert.ok(toAnna.htmlContent.includes(`${SITE}/#/profilo`), 'si spiega come spegnerle');
  assert.match(toAnna.textContent, /Ciao Anna,\nci sono 2 menzioni/);
  assert.match(toAnna.textContent, /"Ciao @Anna, guarda i dati"/);
  assert.ok(toAnna.textContent.includes(`${SITE}/#/chat/${CHAT}?messaggio=${MSG}`));
  assert.deepEqual(toBruno.to, [{ email: 'bruno@board.example', name: 'Bruno' }]);
  assert.match(toBruno.htmlContent, /Anna ti ha taggato nella nota «Riunione»/);
});

test('a single mention names who tagged and where', async () => {
  const { handle, sent } = setup({ mentions: [mention({ id: 9, user_id: BRUNO, author_name: 'Anna', source: 'note', chat_id: null, item_id: ITEM, item_title: 'Riunione' })] });
  await handle(request());
  assert.equal(sent[0].body.subject, 'Anna ti ha taggato su ai-deep-endenti');
  assert.match(sent[0].body.htmlContent, /Anna ti ha taggato nella nota «Riunione»/);
  assert.ok(sent[0].body.htmlContent.includes(`${SITE}/#/elemento/${ITEM}"`));
});

test('people who turned mentions off, or cannot receive email, are skipped but their mentions are marked', async () => {
  const { handle, sent, calls } = setup({
    mentions: [mention({ id: 1, user_id: CHIARA }), mention({ id: 2, user_id: DARIO }), mention({ id: 3, user_id: BRUNO })],
  });
  const body = await (await handle(request())).json();
  assert.equal(body.sent, 1);
  assert.equal(body.skipped, 2);
  assert.deepEqual(calls.claimed, [[1], [2], [3]]);
  assert.deepEqual(sent.map((s) => s.body.to[0].email), ['bruno@board.example']);
});

test('read mentions are never sent, even when read just before the email', async () => {
  const { handle, sent } = setup({
    mentions: [mention({ id: 1, read_at: minutesAgo(MONDAY, 1) }), mention({ id: 2 }), mention({ id: 3, excerpt: 'già letta nel frattempo' })],
    readMeanwhile: [3],
  });
  const body = await (await handle(request())).json();
  assert.equal(body.mentions, 1);
  assert.doesNotMatch(sent[0].body.htmlContent, /già letta/);

  const all = setup({ mentions: [mention({ id: 4 })], readMeanwhile: [4] });
  assert.equal((await (await all.handle(request())).json()).sent, 0);
  assert.equal(all.sent.length, 0, 'se nel frattempo sono state lette tutte non parte nulla');
});

test('the same mention is never emailed twice, even if the job runs again', async () => {
  const run = setup({ mentions: [mention({ id: 1 })] });
  await run.handle(request());
  await run.handle(request());
  assert.equal(run.sent.length, 1);
});

test('a refused email releases its mentions; an uncertain one keeps them marked and stops the run', async () => {
  const refused = setup({ mentions: [mention({ id: 1 }), mention({ id: 2, user_id: BRUNO })], brevoStatus: (n) => (n === 1 ? 400 : 201) });
  const r1 = await (await refused.handle(request())).json();
  assert.deepEqual([r1.sent, r1.failed], [1, 1]);
  assert.deepEqual(refused.calls.released, [[1]], 'rifiutata: si riprova al prossimo giro');

  const wrongKey = setup({ mentions: [mention({ id: 1 }), mention({ id: 2, user_id: BRUNO })], brevoStatus: () => 401 });
  await wrongKey.handle(request());
  assert.equal(wrongKey.sent.length, 1, 'con la chiave sbagliata non si insiste');
  assert.deepEqual(wrongKey.calls.claimed, [[1]]);
  assert.deepEqual(wrongKey.logs.find((l) => l.event === 'notify_send_failed'), { event: 'notify_send_failed', job: 'mentions', status: 401, released: true });

  const down = setup({ mentions: [mention({ id: 1 }), mention({ id: 2, user_id: BRUNO })], brevoStatus: () => 503 });
  await down.handle(request());
  assert.deepEqual(down.calls.released, [], 'esito incerto: niente secondo invio');
  assert.equal(down.sent.length, 1);

  const offline = setup({ mentions: [mention({ id: 1 })], deps: { fetch: async () => { throw new TypeError('fetch failed'); } } });
  const r4 = await (await offline.handle(request())).json();
  assert.equal(r4.failed, 1);
  assert.deepEqual(offline.calls.released, []);
});

test('database errors become a generic 500 without details', async () => {
  const { handle, logs } = setup({ deps: { recipients: async () => { throw new Error('connessione a anna@board.example rifiutata'); } } });
  const res = await handle(request());
  assert.equal(res.status, 500);
  assert.doesNotMatch(await res.text(), /anna/);
  assert.deepEqual(logs.at(-1), { event: 'notify_failed', job: 'mentions', kind: 'Error' });
});

function busyWeek() {
  return {
    ideas: [
      { id: IDEA, title: 'Idea alfa', owner: ANNA, next_step: 'Chiamare tre clienti' },
      { id: IDEA2, title: 'Idea beta', owner: ANNA, next_step: '  ' },
      { id: ITEM, title: 'Idea di Bruno', owner: BRUNO, next_step: '' },
    ],
    contacts: [
      { id: 'a0000000-0000-4000-8000-000000000001', role: 'Responsabile acquisti', idea_title: 'Idea alfa', owner: ANNA, next_date: '2026-10-28' },
      { id: 'a0000000-0000-4000-8000-000000000002', role: 'Esperto del settore', idea_title: 'Idea alfa', owner: ANNA, next_date: '2026-11-05' },
      { id: 'a0000000-0000-4000-8000-000000000003', role: 'Contatto lontano', idea_title: 'Idea alfa', owner: ANNA, next_date: '2026-11-20' },
      { id: 'a0000000-0000-4000-8000-000000000004', role: 'Contatto di Bruno', idea_title: 'Idea alfa', owner: BRUNO, next_date: '2026-11-02' },
    ],
    experiments: [
      { id: 'b0000000-0000-4000-8000-000000000001', title: 'I clienti pagano?', idea_title: 'Idea alfa', owner: ANNA, status: 'in_corso', end_date: '2026-10-30' },
      { id: 'b0000000-0000-4000-8000-000000000002', title: 'Landing page', idea_title: 'Idea beta', owner: ANNA, status: 'pianificato' },
      { id: 'b0000000-0000-4000-8000-000000000003', title: 'Pilota futuro', idea_title: 'Idea beta', owner: ANNA, status: 'pianificato', start_date: '2026-12-01' },
      { id: 'b0000000-0000-4000-8000-000000000004', title: 'In corso e in tempo', idea_title: 'Idea beta', owner: ANNA, status: 'in_corso', end_date: '2026-11-30' },
    ],
    new_ideas: [{ id: IDEA2, title: 'Idea beta' }],
    busy_ideas: [{ id: IDEA, title: 'Idea alfa', changes: 12 }, { id: IDEA2, title: 'Idea beta', changes: 3 }],
    reached: [
      { id: 'e0000000-0000-4000-8000-000000000001', kind: 'interview', title: 'Azienda A', source: null, commitment: 'pilota' },
      { id: 'e0000000-0000-4000-8000-000000000002', kind: 'interview', title: 'Azienda B', source: 'campo', commitment: 'interesse' },
      { id: 'e0000000-0000-4000-8000-000000000003', kind: 'interview', title: 'Rapporto di settore', source: 'ricerca', commitment: 'pagamento' },
      { id: 'e0000000-0000-4000-8000-000000000004', kind: 'experiment', title: 'Prezzo giusto?' },
      { id: 'e0000000-0000-4000-8000-000000000005', kind: 'decision', title: 'Due finalisti' },
    ],
    unread: [{ user_id: ANNA, mentions: 2, chat: 5 }],
  };
}

test('the weekly report has the three sections, short and only with what matters', async () => {
  const { handle, sent, calls } = setup({ people: [people()[0]], week: busyWeek() });
  const body = await (await handle(request({ job: 'weekly' }))).json();
  assert.equal(body.sent, 1);
  assert.deepEqual(calls.claimedWeekly, [[ANNA, '2026-11-02']]);
  const { subject, htmlContent: html, textContent: text } = sent[0].body;
  assert.equal(subject, 'La tua settimana su ai-deep-endenti');

  assert.match(html, /<h2[^>]*>Da fare questa settimana<\/h2>/);
  assert.match(text, /Contatto \(Responsabile acquisti\) per l'idea «Idea alfa»: in ritardo, era previsto il 28 ott/);
  assert.match(text, /Contatto \(Esperto del settore\) per l'idea «Idea alfa»: da sentire il 5 nov/);
  assert.doesNotMatch(text, /Contatto lontano|Contatto di Bruno/);
  assert.match(text, /Esperimento «I clienti pagano\?» per l'idea «Idea alfa»: scaduto il 30 ott/);
  assert.match(text, /Esperimento «Landing page» per l'idea «Idea beta»: ancora da avviare/);
  assert.doesNotMatch(text, /Pilota futuro|In corso e in tempo/);
  assert.match(text, /Idea «Idea beta»: manca il prossimo passo/);
  assert.doesNotMatch(text, /Idea «Idea alfa»: manca|Idea di Bruno/);

  assert.match(html, /<h2[^>]*>Nel team negli ultimi 7 giorni<\/h2>/);
  assert.match(text, /Nuove idee: 1 \(«Idea beta»\)/);
  assert.match(text, /Idee con più modifiche: «Idea alfa» \(12\), «Idea beta» \(3\)/);
  assert.match(text, /Interviste fatte: 2, di cui 1 con un impegno concreto/, 'la ricerca a tavolino non conta');
  assert.match(text, /Esperimenti conclusi: 1 \(«Prezzo giusto\?»\)/);
  assert.match(text, /Decisioni prese: 1 \(«Due finalisti»\)/);

  assert.match(html, /<h2[^>]*>Da leggere<\/h2>/);
  assert.match(text, /2 menzioni non lette/);
  assert.match(text, /5 messaggi non letti in chat/);
  assert.ok(html.includes(`href="${SITE}/#/chat"`));
  assert.ok(html.includes(`href="${SITE}/#/idea/${IDEA2}"`));
  assert.ok(html.includes(`href="${SITE}/"`), 'link al sito');
  assert.ok(text.includes(`${SITE}/#/elemento/a0000000-0000-4000-8000-000000000001`));
  assert.doesNotMatch(html + text, /\u2014/, 'niente lineette lunghe');
});

test('empty sections are left out and an empty report is not sent at all', async () => {
  const onlyUnread = { ...emptyWeek(), unread: [{ user_id: ANNA, mentions: 0, chat: 1 }] };
  const { handle, sent, calls } = setup({ week: onlyUnread });
  const body = await (await handle(request({ job: 'weekly' }))).json();
  assert.deepEqual([body.sent, body.empty, body.optedOut], [1, 1, 1]);
  assert.deepEqual(calls.claimedWeekly, [[ANNA, '2026-11-02']], 'chi non ha nulla da leggere non riceve nulla');
  assert.doesNotMatch(sent[0].body.htmlContent, /Da fare questa settimana|Nel team/);
  assert.match(sent[0].body.textContent, /1 messaggio non letto in chat/);

  const quiet = setup({ week: emptyWeek() });
  assert.equal((await (await quiet.handle(request({ job: 'weekly' }))).json()).sent, 0);
  assert.equal(quiet.sent.length, 0);
  assert.deepEqual(quiet.calls.claimedWeekly, []);
});

test('weekly: people who turned it off are skipped and a retry in the same week sends nothing', async () => {
  const off = setup({ people: [{ ...people()[0], weekly: false }], week: busyWeek() });
  await off.handle(request({ job: 'weekly' }));
  assert.equal(off.sent.length, 0);
  assert.deepEqual(off.calls.claimedWeekly, []);

  const again = setup({ people: [people()[0]], week: busyWeek(), alreadySent: [ANNA] });
  const body = await (await again.handle(request({ job: 'weekly' }))).json();
  assert.equal(body.already, 1);
  assert.equal(again.sent.length, 0);

  const refused = setup({ people: [people()[0]], week: busyWeek(), brevoStatus: () => 400 });
  await refused.handle(request({ job: 'weekly' }));
  assert.deepEqual(refused.calls.releasedWeekly, [[ANNA, '2026-11-02']], 'rifiutato: si potrà riprovare');
});

test('user content is escaped in every HTML email', async () => {
  const people1 = [{ ...people()[0], display_name: `Anna ${XSS}` }];
  const m = setup({ people: people1, mentions: [mention({ id: 1, author_name: `Bruno ${XSS}`, chat_title: XSS, excerpt: `ciao ${XSS} & "amici"` })] });
  await m.handle(request());
  const html = m.sent[0].body.htmlContent;
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /&amp; &quot;amici&quot;/);

  const week = busyWeek();
  week.ideas[1].title = XSS;
  week.new_ideas[0].title = XSS;
  week.contacts[0].role = XSS;
  week.reached[4].title = XSS;
  const w = setup({ people: people1, week });
  await w.handle(request({ job: 'weekly' }));
  assert.doesNotMatch(w.sent[0].body.htmlContent, /<img/);
  assert.equal(escapeHtml(`<a href='x'>&</a>`), '&lt;a href=&#39;x&#39;&gt;&amp;&lt;/a&gt;');
});

test('links are built only from valid identifiers', () => {
  assert.equal(mentionRoute({ source: 'chat', chat_id: 'x"><script>', source_id: MSG }), 'chat');
  assert.equal(mentionRoute({ source: 'comment', item_id: 'javascript:alert(1)' }), '');
  assert.equal(mentionRoute({ source: 'comment', item_id: ITEM, item_kind: 'experiment' }), `elemento/${ITEM}/commenti`);
  assert.equal(mentionWhere({ source: 'comment', item_title: '' }), 'in un commento su «una scheda»');
});

test('logs carry only counts, never names, emails or content', async () => {
  const runs = [
    setup({ mentions: [mention({ id: 1 }), mention({ id: 2, user_id: CHIARA })] }),
    setup({ mentions: [mention({ id: 1 })], brevoStatus: () => 400 }),
    setup({ people: [people()[0]], week: busyWeek() }),
  ];
  await runs[0].handle(request());
  await runs[1].handle(request());
  await runs[2].handle(request({ job: 'weekly' }));
  const logged = JSON.stringify(runs.flatMap((r) => r.logs));
  for (const secretish of ['Anna', 'Bruno', 'Chiara', 'board.example', 'Generale', 'guarda i dati', 'Idea alfa', 'Responsabile', 'chiave-di-prova', ANNA]) {
    assert.ok(!logged.includes(secretish), `nei log compare ${secretish}`);
  }
  assert.deepEqual(runs[0].logs, [{ event: 'notify_done', job: 'mentions', sent: 1, mentions: 1, skipped: 1, waiting: 0, failed: 0 }]);
});

test('dates follow the Italian calendar across daylight saving changes', () => {
  assert.equal(romeDate(new Date('2026-11-01T23:30:00Z')), '2026-11-02', 'mezzanotte e mezza in Italia è già lunedì');
  assert.equal(romeDate(new Date('2026-07-05T22:30:00Z')), '2026-07-06', 'con l\'ora legale si è due ore avanti');
  assert.equal(mondayOf('2026-11-02'), '2026-11-02');
  assert.equal(mondayOf('2026-11-08'), '2026-11-02');
  assert.equal(mondayOf('2026-11-04'), '2026-11-02');
  assert.equal(addDays('2026-10-31', 2), '2026-11-02');
});

test('personal tasks and team news follow the rules of the report', () => {
  const todo = personalTodo(busyWeek(), ANNA, { today: '2026-11-02', weekEnd: '2026-11-08' });
  assert.deepEqual(todo.contacts.map((c) => [c.role, c.late]), [['Responsabile acquisti', true], ['Esperto del settore', false]]);
  assert.ok(todo.contacts.every((c) => !('title' in c)), 'il nome del contatto non entra nell\'email');
  assert.deepEqual(todo.experiments.map((e) => e.state), ['late', 'planned']);
  const startsSoon = personalTodo({ experiments: [{ id: ITEM, owner: ANNA, status: 'pianificato', start_date: '2026-11-04' }, { id: IDEA, owner: ANNA, status: 'pianificato', start_date: '2026-10-20' }] }, ANNA, { today: '2026-11-02', weekEnd: '2026-11-08' });
  assert.deepEqual(startsSoon.experiments.map((e) => e.state), ['starts', 'overdue_start']);
  const team = teamSummary(busyWeek());
  assert.deepEqual([team.interviews, team.commitments], [2, 1]);
  assert.deepEqual([...STRONG_COMMITMENTS].sort(), [...SITE_COMMITMENTS].sort(), 'stessi impegni concreti del sito');
});

function fromSite({ job = 'weekly-preview', origin = ORIGIN, token = 'Bearer admin', method = 'POST', body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (origin) headers.origin = origin;
  if (token) headers.authorization = token;
  return new Request('https://x.supabase.co/functions/v1/notify', { method, headers, body: method === 'POST' ? (body ?? JSON.stringify({ job })) : undefined });
}

const verifyAdmin = async (authorization) => {
  if (authorization === 'Bearer admin') return { userId: ANNA, admin: true };
  if (authorization === 'Bearer membro') return { userId: BRUNO, admin: false };
  return null;
};

test('from the site only an admin from an allowed origin can ask for the weekly report, and never the cron jobs', async () => {
  const { handle, calls, sent } = setup({ deps: { verifyAdmin }, week: busyWeek() });
  const pre = await handle(fromSite({ method: 'OPTIONS' }));
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal((await handle(fromSite({ method: 'OPTIONS', origin: 'https://evil.example' }))).status, 403);
  assert.equal((await handle(fromSite({ origin: 'https://evil.example' }))).status, 403);
  assert.equal((await handle(fromSite({ origin: null }))).status, 403);
  assert.equal((await handle(fromSite({ token: null }))).status, 401);
  assert.equal((await handle(fromSite({ token: 'Bearer falso' }))).status, 401);
  const member = await handle(fromSite({ token: 'Bearer membro' }));
  assert.equal(member.status, 403);
  assert.match((await member.json()).error, /Solo l'admin/);
  for (const job of ['weekly', 'mentions', 'tutto']) assert.equal((await handle(fromSite({ job }))).status, 400, job);
  assert.equal((await handle(fromSite({ body: '{"job":"weekly-now","to":"x"}' }))).status, 400);
  assert.equal(calls.recipients + calls.pending + calls.weekly, 0);
  assert.equal(sent.length, 0);
});

test('the admin preview is their own report as text and links, with how many would receive it, and sends nothing', async () => {
  const { handle, calls, sent } = setup({ deps: { verifyAdmin }, week: busyWeek() });
  const res = await handle(fromSite());
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  const body = await res.json();
  assert.deepEqual([body.recipients, body.empty, body.optedOut], [2, 0, 1]);
  assert.equal(body.preview.subject, 'La tua settimana su ai-deep-endenti');
  assert.equal(body.preview.hello, 'Ciao Anna,');
  assert.equal(body.preview.intro, 'ecco il riepilogo della settimana.');
  assert.deepEqual(body.preview.sections.map((x) => x.title), ['Da fare questa settimana', 'Nel team negli ultimi 7 giorni', 'Da leggere']);
  const chat = body.preview.sections[2].lines[1].parts[0];
  assert.deepEqual(chat, { text: '5 messaggi non letti in chat', href: `${SITE}/#/chat` });
  assert.equal(sent.length, 0);
  assert.deepEqual(calls.claimedWeekly, []);

  const quiet = setup({ deps: { verifyAdmin }, week: emptyWeek() });
  const empty = await (await quiet.handle(fromSite())).json();
  assert.equal(empty.preview, null);
  assert.equal(empty.recipients, 0);
});

test('sending now from the site marks today, not Monday: a second click the same day sends nothing', async () => {
  const thursday = new Date('2026-10-29T15:00:00Z');
  const { handle, calls, sent, logs } = setup({ deps: { verifyAdmin, now: () => thursday }, week: busyWeek() });
  const body = await (await handle(fromSite({ job: 'weekly-now' }))).json();
  assert.equal(body.sent, 2);
  assert.deepEqual(calls.claimedWeekly, [[ANNA, '2026-10-29'], [BRUNO, '2026-10-29']]);
  assert.match(sent[0].body.textContent, /ecco il riepilogo della settimana\./);
  assert.doesNotMatch(sent[0].body.textContent, /del lunedì/);
  assert.ok(logs.some((l) => l.event === 'notify_done' && l.job === 'weekly-now' && l.sent === 2));

  const again = setup({ deps: { verifyAdmin, now: () => thursday }, week: busyWeek(), alreadySent: [ANNA, BRUNO] });
  const second = await (await again.handle(fromSite({ job: 'weekly-now' }))).json();
  assert.deepEqual([second.sent, second.already], [0, 2]);
  assert.equal(again.sent.length, 0);

  const noBrevo = setup({ deps: { verifyAdmin }, env: { ...ENV, BREVO_API_KEY: '' }, week: busyWeek() });
  const off = await (await noBrevo.handle(fromSite({ job: 'weekly-now' }))).json();
  assert.equal(off.configured, false);
  assert.equal(noBrevo.sent.length, 0);
});
