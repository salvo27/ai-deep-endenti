// Fixtures of the notify tests: rows shaped like what the notify_* functions of supabase/schema.sql return
// (tests/functions/schema-calls.test.mjs checks that every column used here exists), and a fake of their calls.
import { createHandler } from '../../supabase/functions/notify/handler.js';

export const SECRET = 's'.repeat(40);
export const SITE = 'https://board.example/app';
export const ORIGIN = 'https://board.example';
export const ANNA = '00000000-0000-4000-8000-00000000000a';
export const BRUNO = '00000000-0000-4000-8000-00000000000b';
export const CHIARA = '00000000-0000-4000-8000-00000000000c';
export const DARIO = '00000000-0000-4000-8000-00000000000d';
export const ALFA = 'aaaaaaaa-0000-4000-8000-000000000001';
export const BETA = 'bbbbbbbb-0000-4000-8000-000000000002';
export const GAMMA = 'cccccccc-0000-4000-8000-000000000003';
export const CHAT = 'c0000000-0000-4000-8000-000000000001';
export const MSG = 'd0000000-0000-4000-8000-000000000001';
export const IDEA = '11111111-1111-4111-8111-111111111111';
export const IDEA2 = '11111111-1111-4111-8111-111111111112';
export const ITEM = '22222222-2222-4222-8222-222222222222';
export const XSS = '<img src=x onerror="alert(1)">';
// Monday 2 November 2026, 6:00 UTC: 7:00 in Italy (winter time).
export const MONDAY = new Date('2026-11-02T06:00:00Z');

export const ENV = {
  NOTIFY_SECRET: SECRET,
  BREVO_API_KEY: 'chiave-di-prova',
  BREVO_SENDER_EMAIL: 'avvisi@board.example',
  BREVO_SENDER_NAME: 'Board di prova',
  SITE_URL: SITE,
  ALLOWED_ORIGINS: 'https://board.example, http://localhost:8080',
};

export const minutesAgo = (now, m) => new Date(now.getTime() - m * 60000).toISOString();

const NAMES = { [ANNA]: 'Anna', [BRUNO]: 'Bruno', [CHIARA]: 'Chiara', [DARIO]: 'Dario' };
const PROJECT_NAMES = { [ALFA]: 'Alfa', [BETA]: 'Beta', [GAMMA]: 'Gamma' };

// One row of notify_recipients(): a person in one active project.
export function recipient(userId, over = {}) {
  const projectId = over.project_id ?? ALFA;
  return {
    project_id: projectId,
    project_name: PROJECT_NAMES[projectId] ?? 'Progetto',
    user_id: userId,
    display_name: NAMES[userId] ?? 'Persona',
    email: `${(NAMES[userId] ?? 'persona').toLowerCase()}@board.example`,
    language: 'it',
    mentions: true,
    weekly: true,
    ...over,
  };
}

// Anna and Bruno in Alfa with every email on; Chiara with both off. All of them read Italian.
export const people = () => [recipient(ANNA), recipient(BRUNO), recipient(CHIARA, { mentions: false, weekly: false })];

// One row of notify_pending_mentions().
export function mention(over = {}) {
  return {
    id: 1,
    user_id: ANNA,
    author_id: BRUNO,
    author_name: 'Bruno',
    source: 'chat',
    source_id: MSG,
    chat_id: CHAT,
    chat_title: 'Generale',
    chat_is_general: true,
    item_id: null,
    item_title: null,
    item_kind: null,
    excerpt: 'Ciao @Anna, guarda i dati',
    created_at: minutesAgo(MONDAY, 15),
    read_at: null,
    project_id: ALFA,
    project_name: 'Alfa',
    language: 'it',
    ...over,
  };
}

// What notify_weekly_data(p_project, p_since) returns for a quiet week.
export function emptyWeek(projectId = ALFA) {
  return { project_id: projectId, project_name: PROJECT_NAMES[projectId] ?? 'Progetto', ideas: [], contacts: [], experiments: [], new_ideas: [], busy_ideas: [], reached: [], unread: [] };
}

export function busyWeek(projectId = ALFA) {
  return {
    ...emptyWeek(projectId),
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
      { id: 'b0000000-0000-4000-8000-000000000001', title: 'I clienti pagano?', idea_title: 'Idea alfa', owner: ANNA, status: 'in_corso', start_date: null, end_date: '2026-10-30' },
      { id: 'b0000000-0000-4000-8000-000000000002', title: 'Landing page', idea_title: 'Idea beta', owner: ANNA, status: 'pianificato', start_date: null, end_date: null },
      { id: 'b0000000-0000-4000-8000-000000000003', title: 'Pilota futuro', idea_title: 'Idea beta', owner: ANNA, status: 'pianificato', start_date: '2026-12-01', end_date: null },
      { id: 'b0000000-0000-4000-8000-000000000004', title: 'In corso e in tempo', idea_title: 'Idea beta', owner: ANNA, status: 'in_corso', start_date: null, end_date: '2026-11-30' },
    ],
    new_ideas: [{ id: IDEA2, title: 'Idea beta' }],
    busy_ideas: [{ id: IDEA, title: 'Idea alfa', changes: 12 }, { id: IDEA2, title: 'Idea beta', changes: 3 }],
    reached: [
      { id: 'e0000000-0000-4000-8000-000000000001', kind: 'interview', title: 'Azienda A', source: null, commitment: 'pilota' },
      { id: 'e0000000-0000-4000-8000-000000000002', kind: 'interview', title: 'Azienda B', source: 'campo', commitment: 'interesse' },
      { id: 'e0000000-0000-4000-8000-000000000003', kind: 'interview', title: 'Rapporto di settore', source: 'ricerca', commitment: 'pagamento' },
      { id: 'e0000000-0000-4000-8000-000000000004', kind: 'experiment', title: 'Prezzo giusto?', source: null, commitment: null },
      { id: 'e0000000-0000-4000-8000-000000000005', kind: 'decision', title: 'Due finalisti', source: null, commitment: null },
    ],
    unread: [{ user_id: ANNA, language: 'it', mentions: 2, chat: 5 }],
  };
}

// The site asks with a token: Anna is admin of Alfa, Bruno a member, Dario admin of Beta only.
export const verifyCaller = async (authorization) => ({ 'Bearer admin': { userId: ANNA }, 'Bearer membro': { userId: BRUNO }, 'Bearer dario': { userId: DARIO } })[authorization] ?? null;
const ADMINS = { 'Bearer admin': [ALFA], 'Bearer dario': [BETA] };
export const isAdmin = async (authorization, project) => (ADMINS[authorization] || []).includes(project);

// over.week: the weekly data, or a function of the project. over.alreadySent: user ids, or "user|project" pairs.
export function setup(over = {}) {
  const logs = [];
  const sent = [];
  const calls = { claimed: [], released: [], claimedWeekly: [], releasedWeekly: [], recipients: 0, pending: 0, weekly: [], admin: [] };
  const claimedOnce = new Set();
  const deps = {
    env: (name) => (over.env ? over.env[name] : ENV[name]),
    now: () => MONDAY,
    log: (event, fields) => logs.push({ event, ...fields }),
    fetch: async (url, init) => {
      sent.push({ url, init, body: JSON.parse(init.body) });
      return over.brevoStatus ? new Response('{"message":"no"}', { status: over.brevoStatus(sent.length) }) : new Response('{"messageId":"m1"}', { status: 201 });
    },
    verifyCaller,
    isAdmin: async (authorization, project) => {
      calls.admin.push([authorization, project]);
      return isAdmin(authorization, project);
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
    weeklyData: async (project, since) => {
      calls.weekly.push([project, since]);
      const week = typeof over.week === 'function' ? over.week(project) : over.week;
      return week ?? emptyWeek(project);
    },
    claimWeekly: async (userId, project, week) => {
      calls.claimedWeekly.push([userId, project, week]);
      const already = over.alreadySent || [];
      return !already.includes(userId) && !already.includes(`${userId}|${project}`);
    },
    releaseWeekly: async (userId, project, week) => calls.releasedWeekly.push([userId, project, week]),
    ...over.deps,
  };
  return { handle: createHandler(deps), logs, sent, calls };
}

export function cron({ job = 'mentions', secret = SECRET, method = 'POST', body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (secret) headers['x-notify-secret'] = secret;
  return new Request('https://x.supabase.co/functions/v1/notify', { method, headers, body: method === 'POST' ? (body ?? JSON.stringify({ job })) : undefined });
}

export function fromSite({ job = 'weekly-preview', project = ALFA, language, origin = ORIGIN, token = 'Bearer admin', method = 'POST', body, extraHeaders = {} } = {}) {
  const headers = { 'content-type': 'application/json', ...extraHeaders };
  if (origin) headers.origin = origin;
  if (token) headers.authorization = token;
  const payload = { job, project };
  if (language !== undefined) payload.language = language;
  return new Request('https://x.supabase.co/functions/v1/notify', { method, headers, body: method === 'POST' ? (body ?? JSON.stringify(payload)) : undefined });
}

/** Every href of an HTML email. */
export const hrefs = (html) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replaceAll('&amp;', '&'));
