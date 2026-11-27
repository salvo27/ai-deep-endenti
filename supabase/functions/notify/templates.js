// Le email, una per persona e progetto, nella lingua di chi riceve (texts.js). Tutto ciò che scrivono gli utenti passa da escapeHtml.
import { APP_NAME, LOCALES, TEXTS, languageOf } from './texts.js';

export { APP_NAME };
export const MAX_LIST = 5;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const formats = new Map();
function format(language, kind) {
  const key = `${language}:${kind}`;
  if (!formats.has(key)) {
    const options = kind === 'day'
      ? { day: 'numeric', month: 'short', timeZone: 'UTC' }
      : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' };
    formats.set(key, new Intl.DateTimeFormat(LOCALES[languageOf(language)], options));
  }
  return formats.get(key);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

// Una riga di testo pulita: niente caratteri di controllo o a capo, lunghezza limitata.
export function oneLine(value, max = 200) {
  const text = String(value ?? '').replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export const fmtDay = (iso, language) => (isIsoDate(iso) ? format(language, 'day').format(new Date(`${iso}T00:00:00Z`)) : '');

export function fmtTime(value, language) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : format(language, 'time').format(date);
}

const uuid = (value) => (UUID.test(String(value ?? '')) ? String(value) : null);
const quoted = (t, title, fallback = t.untitled) => t.quote(oneLine(title, 80) || fallback);
// Il nome del progetto lo scrivono le persone: una riga, mai vuota.
const projectName = (project) => oneLine(project?.name, 80) || APP_NAME;

// Ogni link porta il progetto dell'email (?progetto=<id>), così il sito apre quello giusto.
export function siteLink(siteUrl, route = '', project = null) {
  const base = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
  const id = uuid(project);
  if (!id) return route ? `${base}#/${route}` : base;
  return `${base}#/${route}${route.includes('?') ? '&' : '?'}progetto=${id}`;
}

export const itemRoute = (kind, id) => (uuid(id) ? (kind === 'idea' ? `idea/${id}` : `elemento/${id}`) : '');

// Come mentions.js nel sito: dove si è stati taggati e il link al punto esatto. The general chat is stored as 'Generale'
// in every project: it is named in the language of whoever receives the email.
export function mentionWhere(m, language) {
  const t = TEXTS[languageOf(language)];
  if (m.source === 'chat') return t.mentions.inChat(m.chat_is_general === true ? t.quote(t.mentions.general) : quoted(t, m.chat_title, t.mentions.chat));
  if (m.source === 'note') return t.mentions.inNote(quoted(t, m.item_title, t.mentions.note));
  return t.mentions.inComment(quoted(t, m.item_title, t.mentions.card));
}

// The database writes the excerpt with @tutti for the tag of everyone and [immagine] for an image, in every language:
// as the site does (mentions.js), they are written in the reader's words. @tuttifrutti is a person, and stays.
const EVERYONE = /@tutti(?![\p{L}\p{N}])/giu;
const IMAGE = '[immagine]';

export function mentionExcerpt(excerpt, language) {
  const t = TEXTS[languageOf(language)];
  return String(excerpt ?? '').split(IMAGE).join(`[${t.mentions.image}]`).replace(EVERYONE, `@${t.mentions.everyone}`);
}

export function mentionRoute(m) {
  if (m.source === 'chat') return uuid(m.chat_id) && uuid(m.source_id) ? `chat/${m.chat_id}?messaggio=${m.source_id}` : 'chat';
  if (!uuid(m.item_id)) return '';
  if (m.source === 'note') return `elemento/${m.item_id}`;
  return m.item_kind === 'idea' ? `idea/${m.item_id}/commenti` : `elemento/${m.item_id}/commenti`;
}

export const greeting = (name, language) => TEXTS[languageOf(language)].hello(oneLine(name, 80));
export const weeklySubject = (project, language) => TEXTS[languageOf(language)].weekly.subject(projectName(project));

// Una riga è fatta di pezzi: testo semplice oppure testo con link.
const plain = (text) => ({ text });
const linked = (text, href) => ({ text, href });

function htmlParts(parts) {
  return parts.map((p) => (p.href ? `<a href="${escapeHtml(p.href)}" style="color:#3b47b8;">${escapeHtml(p.text)}</a>` : escapeHtml(p.text))).join('');
}

const textParts = (parts) => parts.map((p) => p.text).join('');

function layout({ title, hello, body, siteUrl, project, language }) {
  const t = TEXTS[language];
  const name = projectName(project);
  return [
    '<!doctype html>',
    `<html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapeHtml(title)}</title></head>`,
    '<body style="margin:0;padding:0;background:#f4f5f9;">',
    '<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:-apple-system,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2330;">',
    `<p style="margin:0 0 16px;">${escapeHtml(hello)}</p>`,
    body,
    `<p style="margin:24px 0;"><a href="${escapeHtml(siteLink(siteUrl, '', project?.id))}" style="display:inline-block;padding:10px 18px;background:#4f5bd5;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600;">${escapeHtml(t.open(name))}</a></p>`,
    `<p style="margin:0;font-size:13px;color:#6b7080;">${escapeHtml(t.why(name))} ${escapeHtml(t.turnOff)}<a href="${escapeHtml(siteLink(siteUrl, 'profilo', project?.id))}" style="color:#6b7080;">${escapeHtml(t.profile)}</a>.</p>`,
    '</div></body></html>',
  ].join('\n');
}

function textFooter({ siteUrl, project, language }) {
  const t = TEXTS[language];
  const name = projectName(project);
  return [`${t.open(name)}: ${siteLink(siteUrl, '', project?.id)}`, `${t.why(name)} ${t.turnOff}${t.profile}: ${siteLink(siteUrl, 'profilo', project?.id)}`];
}

export function mentionsEmail({ name, mentions, siteUrl, project, language }) {
  const lang = languageOf(language);
  const t = TEXTS[lang];
  const n = mentions.length;
  const author = (m) => oneLine(m.author_name, 80) || t.someone;
  const hello = greeting(name, lang);
  const intro = t.mentions.intro(n);
  const subject = n === 1 ? t.mentions.subjectOne(author(mentions[0]), projectName(project)) : t.mentions.subjectMany(n, projectName(project));
  const entries = mentions.map((m) => ({
    line: t.mentions.line(author(m), mentionWhere(m, lang)),
    when: fmtTime(m.created_at, lang),
    excerpt: oneLine(mentionExcerpt(m.excerpt, lang), 200),
    href: siteLink(siteUrl, mentionRoute(m), project?.id),
  }));

  const body = [
    `<p style="margin:0 0 16px;">${escapeHtml(intro)}</p>`,
    ...entries.map((e) =>
      [
        '<div style="margin:0 0 12px;padding:12px 14px;background:#ffffff;border:1px solid #e3e5ee;border-radius:8px;">',
        `<div style="font-weight:600;">${escapeHtml(e.line)}</div>`,
        e.when ? `<div style="font-size:13px;color:#6b7080;">${escapeHtml(e.when)}</div>` : '',
        e.excerpt ? `<div style="margin:8px 0;padding-left:10px;border-left:3px solid #c9cdf2;color:#3a3f52;">${escapeHtml(e.excerpt)}</div>` : '',
        `<a href="${escapeHtml(e.href)}" style="color:#3b47b8;">${escapeHtml(t.mentions.open)}</a>`,
        '</div>',
      ].join(''),
    ),
  ].join('\n');

  const text = [
    hello,
    intro,
    '',
    ...entries.flatMap((e) => [`- ${e.line}${e.when ? ` (${e.when})` : ''}`, ...(e.excerpt ? [`  "${e.excerpt}"`] : []), `  ${e.href}`, '']),
    ...textFooter({ siteUrl, project, language: lang }),
  ].join('\n');

  return { subject, html: layout({ title: subject, hello, body, siteUrl, project, language: lang }), text };
}

// Il contesto di una sezione: testi della lingua, link del progetto, date nella lingua.
function sectionContext(siteUrl, project, language) {
  const t = TEXTS[language];
  return { t, w: t.weekly, link: (route) => siteLink(siteUrl, route, project?.id), day: (iso) => fmtDay(iso, language), q: (title) => quoted(t, title) };
}

// Elenco breve di titoli con link: i primi tre, poi «e altri N».
function titleList(entries, ctx, max = 3) {
  const parts = [];
  entries.slice(0, max).forEach((e, i) => {
    if (i) parts.push(plain(', '));
    const route = itemRoute(e.kind, e.id);
    parts.push(route ? linked(ctx.q(e.title), ctx.link(route)) : plain(ctx.q(e.title)));
  });
  if (entries.length > max) parts.push(plain(ctx.w.others(entries.length - max)));
  return parts;
}

function todoLines(todo, ctx) {
  const { w, link, day, q } = ctx;
  const lines = [];
  const add = (prefix, entry, kind, note) => {
    const route = itemRoute(kind, entry.id);
    const title = q(entry.title);
    lines.push({ parts: [plain(prefix), route ? linked(title, link(route)) : plain(title), plain(note)], href: route ? link(route) : '' });
  };
  const forIdea = (title) => (title ? w.forIdea(q(title)) : '');
  // Dei contatti esterni solo il ruolo: il nome resta nel sito.
  for (const c of todo.contacts.slice(0, MAX_LIST)) {
    const route = itemRoute('contact', c.id);
    const label = w.contact(oneLine(c.role, 80));
    const note = c.late ? w.contactLate(day(c.date)) : c.isToday ? w.contactToday : w.contactOn(day(c.date));
    lines.push({ parts: [route ? linked(label, link(route)) : plain(label), plain(`${forIdea(c.ideaTitle)}${note}`)], href: route ? link(route) : '' });
  }
  for (const e of todo.experiments.slice(0, MAX_LIST)) {
    const note = {
      late: () => w.experimentLate(day(e.date)),
      overdue_start: () => w.experimentOverdueStart(day(e.date)),
      starts: () => w.experimentStarts(day(e.date)),
      planned: () => w.experimentPlanned,
    }[e.state]();
    add(w.experiment, e, 'experiment', `${forIdea(e.ideaTitle)}${note}`);
  }
  for (const i of todo.ideas.slice(0, MAX_LIST)) add(w.idea, i, 'idea', w.ideaNoNextStep);
  const hidden = Math.max(0, todo.contacts.length - MAX_LIST) + Math.max(0, todo.experiments.length - MAX_LIST) + Math.max(0, todo.ideas.length - MAX_LIST);
  if (hidden) lines.push({ parts: [plain(w.hidden(hidden))], href: link('') });
  return lines;
}

function teamLines(team, ctx) {
  const { w, link, q } = ctx;
  const lines = [];
  const counted = (label, entries) => ({ parts: [plain(`${label} (`), ...titleList(entries, ctx), plain(')')] });
  if (team.newIdeas.length) lines.push(counted(w.newIdeas(team.newIdeas.length), team.newIdeas.map((x) => ({ ...x, kind: 'idea' }))));
  if (team.busyIdeas.length) {
    const parts = [plain(w.busyIdeas)];
    team.busyIdeas.forEach((b, i) => {
      if (i) parts.push(plain(', '));
      const route = itemRoute('idea', b.id);
      parts.push(route ? linked(q(b.title), link(route)) : plain(q(b.title)), plain(` (${b.changes})`));
    });
    lines.push({ parts });
  }
  if (team.interviews) lines.push({ parts: [plain(w.interviews(team.interviews, team.commitments))] });
  if (team.experiments.length) lines.push(counted(w.experimentsDone(team.experiments.length), team.experiments));
  if (team.decisions.length) lines.push(counted(w.decisions(team.decisions.length), team.decisions));
  return lines;
}

function unreadLines(unread, ctx) {
  const { w, link } = ctx;
  const lines = [];
  if (unread.mentions) lines.push({ parts: [linked(w.unreadMentions(unread.mentions), link(''))], href: link('') });
  if (unread.chat) lines.push({ parts: [linked(w.unreadChat(unread.chat), link('chat'))], href: link('chat') });
  return lines;
}

export function weeklySections(report, siteUrl, project, language) {
  const ctx = sectionContext(siteUrl, project, languageOf(language));
  return [
    { title: ctx.w.todo, lines: todoLines(report.todo, ctx) },
    { title: ctx.w.team, lines: teamLines(report.team, ctx) },
    { title: ctx.w.unread, lines: unreadLines(report.unread, ctx) },
  ].filter((s) => s.lines.length);
}

// manual: inviato a mano dal sito, con l'introduzione «della settimana» invece di quella «del lunedì».
export function weeklyEmail({ name, report, siteUrl, project, language, manual = false }) {
  const lang = languageOf(language);
  const w = TEXTS[lang].weekly;
  const subject = weeklySubject(project, lang);
  const hello = greeting(name, lang);
  const intro = manual ? w.manualIntro : w.intro;
  const sections = weeklySections(report, siteUrl, project, lang);

  const body = [
    `<p style="margin:0 0 16px;">${escapeHtml(intro)}</p>`,
    ...sections.map((s) =>
      [
        `<h2 style="margin:20px 0 8px;font-size:16px;">${escapeHtml(s.title)}</h2>`,
        '<ul style="margin:0;padding-left:20px;">',
        ...s.lines.map((l) => `<li style="margin:0 0 6px;">${htmlParts(l.parts)}</li>`),
        '</ul>',
      ].join('\n'),
    ),
  ].join('\n');

  const text = [
    hello,
    intro,
    ...sections.flatMap((s) => ['', s.title.toUpperCase(), ...s.lines.flatMap((l) => [`- ${textParts(l.parts)}`, ...(l.href ? [`  ${l.href}`] : [])])]),
    '',
    ...textFooter({ siteUrl, project, language: lang }),
  ].join('\n');

  return { subject, html: layout({ title: subject, hello, body, siteUrl, project, language: lang }), text };
}
