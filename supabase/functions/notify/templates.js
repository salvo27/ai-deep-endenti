// Testi delle email in italiano semplice. Tutto ciò che scrivono gli utenti passa da escapeHtml.
export const APP_NAME = 'ai-deep-endenti';
export const MAX_LIST = 5;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const dayFormat = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const timeFormat = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });

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

export const fmtDay = (iso) => (isIsoDate(iso) ? dayFormat.format(new Date(`${iso}T00:00:00Z`)) : '');

export function fmtTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : timeFormat.format(date);
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const quoted = (title, fallback = 'senza titolo') => `«${oneLine(title, 80) || fallback}»`;
const uuid = (value) => (UUID.test(String(value ?? '')) ? String(value) : null);

export function siteLink(siteUrl, route = '') {
  const base = siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`;
  return route ? `${base}#/${route}` : base;
}

export const itemRoute = (kind, id) => (uuid(id) ? (kind === 'idea' ? `idea/${id}` : `elemento/${id}`) : '');

// Come mentions.js nel sito: dove si è stati taggati e il link al punto esatto.
export function mentionWhere(m) {
  if (m.source === 'chat') return `in ${quoted(m.chat_title, 'chat')}`;
  if (m.source === 'note') return `nella nota ${quoted(m.item_title, 'nota')}`;
  return `in un commento su ${quoted(m.item_title, 'una scheda')}`;
}

export function mentionRoute(m) {
  if (m.source === 'chat') return uuid(m.chat_id) && uuid(m.source_id) ? `chat/${m.chat_id}?messaggio=${m.source_id}` : 'chat';
  if (!uuid(m.item_id)) return '';
  if (m.source === 'note') return `elemento/${m.item_id}`;
  return m.item_kind === 'idea' ? `idea/${m.item_id}/commenti` : `elemento/${m.item_id}/commenti`;
}

const authorName = (m) => oneLine(m.author_name, 80) || 'Qualcuno';
export const greeting = (name) => (oneLine(name, 80) ? `Ciao ${oneLine(name, 80)},` : 'Ciao,');
export const WEEKLY_INTRO = 'ecco il riepilogo del lunedì.';
export const WEEKLY_SUBJECT = `La tua settimana su ${APP_NAME}`;

// Una riga è fatta di pezzi: testo semplice oppure testo con link.
const t = (text) => ({ text });
const a = (text, href) => ({ text, href });

function htmlParts(parts) {
  return parts.map((p) => (p.href ? `<a href="${escapeHtml(p.href)}" style="color:#3b47b8;">${escapeHtml(p.text)}</a>` : escapeHtml(p.text))).join('');
}

const textParts = (parts) => parts.map((p) => p.text).join('');

function layout({ title, hello, body, siteUrl }) {
  const profile = siteLink(siteUrl, 'profilo');
  return [
    '<!doctype html>',
    '<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title></head>`,
    '<body style="margin:0;padding:0;background:#f4f5f9;">',
    '<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:-apple-system,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2330;">',
    `<p style="margin:0 0 16px;">${escapeHtml(hello)}</p>`,
    body,
    `<p style="margin:24px 0;"><a href="${escapeHtml(siteLink(siteUrl))}" style="display:inline-block;padding:10px 18px;background:#4f5bd5;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600;">Apri ${APP_NAME}</a></p>`,
    `<p style="margin:0;font-size:13px;color:#6b7080;">Ricevi questa email perché fai parte del team di ${APP_NAME}. Puoi spegnerla dal <a href="${escapeHtml(profile)}" style="color:#6b7080;">tuo profilo</a>.</p>`,
    '</div></body></html>',
  ].join('\n');
}

const textFooter = (siteUrl) => [`Apri ${APP_NAME}: ${siteLink(siteUrl)}`, `Ricevi questa email perché fai parte del team di ${APP_NAME}. Puoi spegnerla dal tuo profilo: ${siteLink(siteUrl, 'profilo')}`];

export function mentionsEmail({ name, mentions, siteUrl }) {
  const n = mentions.length;
  const hello = greeting(name);
  const intro = n === 1 ? 'c\'è una menzione che non hai ancora letto.' : `ci sono ${n} menzioni che non hai ancora letto.`;
  const subject = n === 1 ? `${authorName(mentions[0])} ti ha taggato su ${APP_NAME}` : `Hai ${n} menzioni da leggere su ${APP_NAME}`;
  const entries = mentions.map((m) => ({
    line: `${authorName(m)} ti ha taggato ${mentionWhere(m)}`,
    when: fmtTime(m.created_at),
    excerpt: oneLine(m.excerpt, 200),
    href: siteLink(siteUrl, mentionRoute(m)),
  }));

  const body = [
    `<p style="margin:0 0 16px;">${escapeHtml(intro)}</p>`,
    ...entries.map((e) =>
      [
        '<div style="margin:0 0 12px;padding:12px 14px;background:#ffffff;border:1px solid #e3e5ee;border-radius:8px;">',
        `<div style="font-weight:600;">${escapeHtml(e.line)}</div>`,
        e.when ? `<div style="font-size:13px;color:#6b7080;">${escapeHtml(e.when)}</div>` : '',
        e.excerpt ? `<div style="margin:8px 0;padding-left:10px;border-left:3px solid #c9cdf2;color:#3a3f52;">${escapeHtml(e.excerpt)}</div>` : '',
        `<a href="${escapeHtml(e.href)}" style="color:#3b47b8;">Apri dove ti hanno taggato</a>`,
        '</div>',
      ].join(''),
    ),
  ].join('\n');

  const text = [
    hello,
    intro,
    '',
    ...entries.flatMap((e) => [`- ${e.line}${e.when ? ` (${e.when})` : ''}`, ...(e.excerpt ? [`  "${e.excerpt}"`] : []), `  ${e.href}`, '']),
    ...textFooter(siteUrl),
  ].join('\n');

  return { subject, html: layout({ title: subject, hello, body, siteUrl }), text };
}

// Elenco breve di titoli con link: i primi tre, poi «e altri N».
function titleList(entries, siteUrl, max = 3) {
  const parts = [];
  entries.slice(0, max).forEach((e, i) => {
    if (i) parts.push(t(', '));
    const route = itemRoute(e.kind, e.id);
    parts.push(route ? a(quoted(e.title), siteLink(siteUrl, route)) : t(quoted(e.title)));
  });
  if (entries.length > max) parts.push(t(` e altri ${entries.length - max}`));
  return parts;
}

function todoLines(todo, siteUrl) {
  const lines = [];
  const add = (prefix, entry, kind, note) => {
    const route = itemRoute(kind, entry.id);
    const title = quoted(entry.title);
    lines.push({ parts: [t(prefix), route ? a(title, siteLink(siteUrl, route)) : t(title), t(note)], href: route ? siteLink(siteUrl, route) : '' });
  };
  // Dei contatti esterni solo il ruolo: il nome resta nel sito.
  for (const c of todo.contacts.slice(0, MAX_LIST)) {
    const route = itemRoute('contact', c.id);
    const role = oneLine(c.role, 80);
    const label = role ? `Contatto (${role})` : 'Contatto';
    const note = c.late ? `: in ritardo, era previsto il ${fmtDay(c.date)}` : c.isToday ? ': da sentire oggi' : `: da sentire il ${fmtDay(c.date)}`;
    lines.push({
      parts: [route ? a(label, siteLink(siteUrl, route)) : t(label), t(`${c.ideaTitle ? ` per l'idea ${quoted(c.ideaTitle)}` : ''}${note}`)],
      href: route ? siteLink(siteUrl, route) : '',
    });
  }
  for (const e of todo.experiments.slice(0, MAX_LIST)) {
    const note = {
      late: `: scaduto il ${fmtDay(e.date)}`,
      overdue_start: `: doveva iniziare il ${fmtDay(e.date)}`,
      starts: `: inizia il ${fmtDay(e.date)}`,
      planned: ': ancora da avviare',
    }[e.state];
    add('Esperimento ', e, 'experiment', `${e.ideaTitle ? ` per l'idea ${quoted(e.ideaTitle)}` : ''}${note}`);
  }
  for (const i of todo.ideas.slice(0, MAX_LIST)) add('Idea ', i, 'idea', ': manca il prossimo passo');
  const hidden = Math.max(0, todo.contacts.length - MAX_LIST) + Math.max(0, todo.experiments.length - MAX_LIST) + Math.max(0, todo.ideas.length - MAX_LIST);
  if (hidden) lines.push({ parts: [t(`E altre ${hidden} cose: le trovi nella dashboard.`)], href: siteLink(siteUrl) });
  return lines;
}

function teamLines(team, siteUrl) {
  const lines = [];
  if (team.newIdeas.length) lines.push({ parts: [t(`Nuove idee: ${team.newIdeas.length} (`), ...titleList(team.newIdeas.map((x) => ({ ...x, kind: 'idea' })), siteUrl), t(')')] });
  if (team.busyIdeas.length) {
    const parts = [t('Idee con più modifiche: ')];
    team.busyIdeas.forEach((b, i) => {
      if (i) parts.push(t(', '));
      const route = itemRoute('idea', b.id);
      parts.push(route ? a(quoted(b.title), siteLink(siteUrl, route)) : t(quoted(b.title)), t(` (${b.changes})`));
    });
    lines.push({ parts });
  }
  if (team.interviews) {
    const strong = team.commitments ? `, di cui ${team.commitments} con un impegno concreto (pilota o pagamento)` : '';
    lines.push({ parts: [t(`Interviste fatte: ${team.interviews}${strong}`)] });
  }
  if (team.experiments.length) lines.push({ parts: [t(`Esperimenti conclusi: ${team.experiments.length} (`), ...titleList(team.experiments, siteUrl), t(')')] });
  if (team.decisions.length) lines.push({ parts: [t(`Decisioni prese: ${team.decisions.length} (`), ...titleList(team.decisions, siteUrl), t(')')] });
  return lines;
}

function unreadLines(unread, siteUrl) {
  const lines = [];
  if (unread.mentions) lines.push({ parts: [a(plural(unread.mentions, 'menzione non letta', 'menzioni non lette'), siteLink(siteUrl))], href: siteLink(siteUrl) });
  if (unread.chat) lines.push({ parts: [a(plural(unread.chat, 'messaggio non letto in chat', 'messaggi non letti in chat'), siteLink(siteUrl, 'chat'))], href: siteLink(siteUrl, 'chat') });
  return lines;
}

export function weeklySections(report, siteUrl) {
  return [
    { title: 'Da fare questa settimana', lines: todoLines(report.todo, siteUrl) },
    { title: 'Nel team negli ultimi 7 giorni', lines: teamLines(report.team, siteUrl) },
    { title: 'Da leggere', lines: unreadLines(report.unread, siteUrl) },
  ].filter((s) => s.lines.length);
}

export function weeklyEmail({ name, report, siteUrl, intro = WEEKLY_INTRO }) {
  const subject = WEEKLY_SUBJECT;
  const hello = greeting(name);
  const sections = weeklySections(report, siteUrl);

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
    ...textFooter(siteUrl),
  ].join('\n');

  return { subject, html: layout({ title: subject, hello, body, siteUrl }), text };
}
