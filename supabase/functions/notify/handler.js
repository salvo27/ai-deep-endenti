import { APP_NAME, WEEKLY_SUBJECT, greeting, isIsoDate, mentionsEmail, oneLine, weeklyEmail, weeklySections } from './templates.js';

export const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
export const MIN_SECRET_LENGTH = 32;
export const MENTION_DELAY_MS = 10 * 60 * 1000;
// Menzioni più vecchie di un giorno non partono più: le ricorda il riepilogo del lunedì.
export const MENTION_WINDOW_MS = 24 * 3600 * 1000;
export const WEEK_MS = 7 * 24 * 3600 * 1000;
// Come STRONG_COMMITMENTS in assets/js/schema.js (un test controlla che restino uguali).
export const STRONG_COMMITMENTS = new Set(['pilota', 'pagamento']);

const JOBS = new Set(['mentions', 'weekly']);
// Dal sito, solo per l'admin: anteprima del riepilogo (la sua versione) e invio subito a tutti.
const ADMIN_JOBS = new Set(['weekly-preview', 'weekly-now']);
export const MANUAL_INTRO = 'ecco il riepilogo della settimana.';
const MAX_BODY_BYTES = 1024;
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const ROME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' });

// notSent: il servizio email ha risposto con un rifiuto, quindi l'email di sicuro non è partita.
export class SendError extends Error {
  constructor(status, notSent) {
    super('Invio non riuscito');
    this.name = 'SendError';
    this.status = status;
    this.notSent = notSent;
  }
}

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

export function parseOrigins(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter((s) => /^https?:\/\/[^/\s]+$/.test(s));
}

function corsHeaders(origin, allowed) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function readConfig(getEnv) {
  const get = (name) => String(getEnv(name) ?? '').trim();
  const secret = get('NOTIFY_SECRET');
  const apiKey = get('BREVO_API_KEY');
  const senderEmail = get('BREVO_SENDER_EMAIL');
  const siteUrl = get('SITE_URL');
  const missing = [];
  if (!apiKey) missing.push('BREVO_API_KEY');
  if (!EMAIL.test(senderEmail)) missing.push('BREVO_SENDER_EMAIL');
  if (!/^https?:\/\/[^\s"'<>#?]+$/.test(siteUrl)) missing.push('SITE_URL');
  return {
    secret: secret.length >= MIN_SECRET_LENGTH ? secret : '',
    missing,
    brevo: { apiKey, senderEmail, senderName: oneLine(get('BREVO_SENDER_NAME'), 70) || APP_NAME },
    siteUrl: siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`,
  };
}

// Confronto a tempo costante: si confrontano le impronte SHA-256, sempre della stessa lunghezza.
export async function sameSecret(given, expected) {
  if (!given || !expected) return false;
  const digest = async (text) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const [x, y] = await Promise.all([digest(given), digest(expected)]);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function readJob(req, jobs = JOBS) {
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return null;
  try {
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((k) => k !== 'job')) return null;
    return jobs.has(body.job) ? body.job : null;
  } catch {
    return null;
  }
}

export async function sendWithBrevo(fetchFn, brevo, to, message) {
  let res;
  try {
    res = await fetchFn(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': brevo.apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: brevo.senderEmail, name: brevo.senderName },
        to: [{ email: to.email, name: oneLine(to.display_name, 70) || undefined }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new SendError(null, false);
  }
  if (res.ok) return;
  throw new SendError(res.status, res.status >= 400 && res.status < 500);
}

export function romeDate(date) {
  const parts = Object.fromEntries(ROME.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const mondayOf = (iso) => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));

export function personalTodo(data, userId, { today, weekEnd }) {
  const contacts = (data.contacts || [])
    .filter((c) => c.owner === userId && isIsoDate(c.next_date) && c.next_date <= weekEnd)
    .sort((x, y) => x.next_date.localeCompare(y.next_date))
    .map((c) => ({ id: c.id, role: c.role, ideaTitle: c.idea_title, date: c.next_date, late: c.next_date < today, isToday: c.next_date === today }));

  const experiments = (data.experiments || [])
    .filter((e) => e.owner === userId && e.status !== 'concluso')
    .map((e) => {
      const base = { id: e.id, title: e.title, ideaTitle: e.idea_title };
      if (isIsoDate(e.end_date) && e.end_date < today) return { ...base, state: 'late', date: e.end_date };
      if (e.status !== 'pianificato') return null;
      if (!isIsoDate(e.start_date)) return { ...base, state: 'planned' };
      if (e.start_date < today) return { ...base, state: 'overdue_start', date: e.start_date };
      if (e.start_date <= weekEnd) return { ...base, state: 'starts', date: e.start_date };
      return null;
    })
    .filter(Boolean);

  const ideas = (data.ideas || [])
    .filter((i) => i.owner === userId && !String(i.next_step ?? '').trim())
    .map((i) => ({ id: i.id, title: i.title }));

  return { contacts, experiments, ideas };
}

export function teamSummary(data) {
  const reached = data.reached || [];
  // Le ricerche a tavolino non sono interviste vere.
  const interviews = reached.filter((r) => r.kind === 'interview' && r.source !== 'ricerca');
  return {
    newIdeas: data.new_ideas || [],
    busyIdeas: (data.busy_ideas || []).filter((b) => b.changes > 0).slice(0, 3),
    interviews: interviews.length,
    commitments: interviews.filter((r) => STRONG_COMMITMENTS.has(r.commitment)).length,
    experiments: reached.filter((r) => r.kind === 'experiment'),
    decisions: reached.filter((r) => r.kind === 'decision'),
  };
}

export function unreadFor(data, userId) {
  const row = (data.unread || []).find((u) => u.user_id === userId);
  return { mentions: Number(row?.mentions) || 0, chat: Number(row?.chat) || 0 };
}

export function isEmptyReport({ todo, team, unread }) {
  return (
    !todo.contacts.length && !todo.experiments.length && !todo.ideas.length
    && !team.newIdeas.length && !team.busyIdeas.length && !team.interviews && !team.experiments.length && !team.decisions.length
    && !unread.mentions && !unread.chat
  );
}

// Si invia dopo aver segnato il lavoro come fatto. Se il servizio rifiuta, il segno si toglie e si riprova al giro dopo;
// se l'esito è incerto (rete, errore del servizio) il segno resta: meglio un'email persa che una doppia.
async function deliver(ctx, person, message, release) {
  try {
    await ctx.send(person, message);
    return 'sent';
  } catch (error) {
    const status = error instanceof SendError ? error.status : null;
    const notSent = error instanceof SendError && error.notSent;
    if (notSent) await release().catch(() => ctx.log('notify_release_failed', { job: ctx.job }));
    ctx.log('notify_send_failed', { job: ctx.job, status, released: notSent });
    return !notSent || [401, 403, 429].includes(status) ? 'stop' : 'failed';
  }
}

async function runMentions(ctx) {
  const { deps, now, siteUrl } = ctx;
  const since = new Date(now.getTime() - MENTION_WINDOW_MS).toISOString();
  const [people, rows] = await Promise.all([deps.recipients(), deps.pendingMentions(since)]);
  const byUser = new Map((people || []).map((p) => [p.user_id, p]));
  const groups = new Map();
  for (const row of rows || []) {
    if (row.read_at) continue;
    if (!groups.has(row.user_id)) groups.set(row.user_id, []);
    groups.get(row.user_id).push(row);
  }

  const result = { sent: 0, mentions: 0, skipped: 0, waiting: 0, failed: 0 };
  for (const [userId, list] of groups) {
    // Si scrive solo se almeno una menzione aspetta da 10 minuti; allora partono tutte quelle non lette.
    if (!list.some((m) => now.getTime() - Date.parse(m.created_at) >= MENTION_DELAY_MS)) {
      result.waiting += 1;
      continue;
    }
    const person = byUser.get(userId);
    const ids = list.map((m) => m.id);
    if (!person?.mentions) {
      // Email spente (o senza email e 2FA): le menzioni si segnano comunque, così non partono quando si riaccendono.
      await deps.claimMentions(ids);
      result.skipped += 1;
      continue;
    }
    const claimed = new Set(await deps.claimMentions(ids));
    const mentions = list.filter((m) => claimed.has(m.id));
    if (!mentions.length) continue;
    const message = mentionsEmail({ name: person.display_name, mentions, siteUrl });
    const outcome = await deliver(ctx, person, message, () => deps.releaseMentions(mentions.map((m) => m.id)));
    if (outcome === 'sent') {
      result.sent += 1;
      result.mentions += mentions.length;
    } else {
      result.failed += 1;
      if (outcome === 'stop') break;
    }
  }
  return result;
}

async function loadWeek(ctx) {
  const { deps, now } = ctx;
  const today = romeDate(now);
  const weekStart = mondayOf(today);
  const weekEnd = addDays(weekStart, 6);
  const since = new Date(now.getTime() - WEEK_MS).toISOString();
  const [people, data] = await Promise.all([deps.recipients(), deps.weeklyData(since)]);
  const team = teamSummary(data || {});
  const reportFor = (userId) => ({ todo: personalTodo(data || {}, userId, { today, weekEnd }), team, unread: unreadFor(data || {}, userId) });
  return { people: people || [], today, weekStart, reportFor };
}

// key: il giorno con cui si segna l'invio a ogni persona. Il lunedì automatico usa il lunedì della settimana,
// l'invio a mano dal sito il giorno stesso: un secondo clic nello stesso giorno non manda nulla, il lunedì dopo sì.
async function runWeekly(ctx, { manual = false } = {}) {
  const { deps, siteUrl } = ctx;
  const { people, today, weekStart, reportFor } = await loadWeek(ctx);
  const key = manual ? today : weekStart;
  const result = { sent: 0, empty: 0, optedOut: 0, already: 0, failed: 0 };
  for (const person of people) {
    if (!person.weekly) {
      result.optedOut += 1;
      continue;
    }
    const report = reportFor(person.user_id);
    if (isEmptyReport(report)) {
      result.empty += 1;
      continue;
    }
    const message = weeklyEmail({ name: person.display_name, report, siteUrl, intro: manual ? MANUAL_INTRO : undefined });
    if (!(await deps.claimWeekly(person.user_id, key))) {
      result.already += 1;
      continue;
    }
    const outcome = await deliver(ctx, person, message, () => deps.releaseWeekly(person.user_id, key));
    if (outcome === 'sent') {
      result.sent += 1;
    } else {
      result.failed += 1;
      if (outcome === 'stop') break;
    }
  }
  return result;
}

// L'anteprima è la versione di chi la chiede, in pezzi di testo e link: il sito la mostra senza HTML.
// I conteggi dicono quante persone la riceverebbero adesso.
async function previewWeekly(ctx, userId) {
  const { people, reportFor } = await loadWeek(ctx);
  const counts = { recipients: 0, empty: 0, optedOut: 0 };
  for (const person of people) {
    if (!person.weekly) counts.optedOut += 1;
    else if (isEmptyReport(reportFor(person.user_id))) counts.empty += 1;
    else counts.recipients += 1;
  }
  const report = reportFor(userId);
  const me = people.find((p) => p.user_id === userId);
  const preview = isEmptyReport(report)
    ? null
    : { subject: WEEKLY_SUBJECT, hello: greeting(me?.display_name), intro: MANUAL_INTRO, sections: weeklySections(report, ctx.siteUrl) };
  return { ...counts, preview };
}

export function createHandler(deps) {
  const log = deps.log || ((event, fields) => console.log(JSON.stringify({ event, ...fields })));
  const clock = deps.now || (() => new Date());
  const getEnv = deps.env || (() => undefined);

  const context = (job, config) => ({
    job,
    deps,
    log,
    now: clock(),
    siteUrl: config.siteUrl,
    send: (person, message) => sendWithBrevo(deps.fetch, config.brevo, person, message),
  });

  // Dal sito: solo dalle origini ammesse, con il token di un admin con la verifica in due passaggi.
  async function fromSite(req) {
    const allowed = parseOrigins(getEnv('ALLOWED_ORIGINS'));
    const origin = req.headers.get('origin');
    const cors = corsHeaders(origin, allowed);
    if (req.method === 'OPTIONS') return new Response(null, { status: origin && allowed.includes(origin) ? 204 : 403, headers: cors });
    if (!origin || !allowed.includes(origin)) return json(403, { error: 'Origine non autorizzata.' }, cors);
    if (req.method !== 'POST') return json(405, { error: 'Metodo non consentito.' }, cors);
    const caller = await Promise.resolve(deps.verifyAdmin?.(req.headers.get('authorization'))).catch(() => null);
    if (!caller?.userId) return json(401, { error: 'Accesso richiesto.' }, cors);
    if (!caller.admin) return json(403, { error: 'Solo l\'admin, con la verifica in due passaggi, può farlo.' }, cors);
    const job = await readJob(req, ADMIN_JOBS);
    if (!job) return json(400, { error: 'Richiesta non valida.' }, cors);
    const config = readConfig(getEnv);
    if (job === 'weekly-now' && config.missing.length) {
      log('notify_not_configured', { job, missing: config.missing });
      return json(200, { job, configured: false, missing: config.missing }, cors);
    }
    try {
      const ctx = context(job, config);
      const result = job === 'weekly-preview' ? await previewWeekly(ctx, caller.userId) : await runWeekly(ctx, { manual: true });
      if (job === 'weekly-now') log('notify_done', { job, sent: result.sent, empty: result.empty, optedOut: result.optedOut, already: result.already, failed: result.failed });
      return json(200, { job, configured: !config.missing.length, ...result }, cors);
    } catch (error) {
      log('notify_failed', { job, kind: error?.name || 'Error' });
      return json(500, { error: 'Riepilogo non riuscito. Riprova tra poco.' }, cors);
    }
  }

  return async function handle(req) {
    // I job di pg_cron mandano il segreto condiviso; tutto il resto arriva dal sito.
    if (!req.headers.has('x-notify-secret')) return fromSite(req);
    if (req.method !== 'POST') return json(405, { error: 'Metodo non consentito.' });
    const config = readConfig(getEnv);
    if (!config.secret) {
      log('notify_no_secret', {});
      return json(503, { error: 'Funzione non configurata.' });
    }
    if (!(await sameSecret(req.headers.get('x-notify-secret') || '', config.secret))) {
      log('notify_rejected', { status: 401 });
      return json(401, { error: 'Non autorizzato.' });
    }
    const job = await readJob(req);
    if (!job) return json(400, { error: 'Richiesta non valida.' });

    // Senza Brevo non si fa nulla e non si segna nulla: una riga di log e una risposta normale.
    if (config.missing.length) {
      log('notify_not_configured', { job, missing: config.missing });
      return json(200, { job, configured: false, missing: config.missing });
    }

    const ctx = context(job, config);
    try {
      const result = job === 'mentions' ? await runMentions(ctx) : await runWeekly(ctx);
      log('notify_done', { job, ...result });
      return json(200, { job, configured: true, ...result });
    } catch (error) {
      log('notify_failed', { job, kind: error?.name || 'Error' });
      return json(500, { error: 'Invio non riuscito.' });
    }
  };
}
