import { h, mount, busy, confirmDialog, toast } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { fmtDateTime } from '../lib/format.js';
import { LIMITS, cleanLine, isEmail } from '../lib/validate.js';
import { tx } from '../i18n/index.js';
import { exportBackup } from '../export.js';
import { currentProjectId, isAdmin, memberById, memberName, on, reloadMembers, state } from '../store.js';
import { avatar, button, errorBox, loading, pageHeader, timeAgo } from './components.js';

// Pagina Membri: le persone del progetto aperto e solo quelle. I membri non arrivano più dal vivo (docs/PROGETTI.md):
// la pagina li rilegge entrando e dopo ogni modifica.

const t = tx.team;

export const ROLES = ['admin', 'member', 'advisor'].map((role) => [role, tx.common.roles[role]]);

export const roleLabel = (role) => ROLES.find(([v]) => v === role)?.[1] || role;

export function activityCounts(rows) {
  const counts = new Map();
  for (const row of rows || []) counts.set(row.author_id, (counts.get(row.author_id) || 0) + 1);
  return counts;
}

function addMemberForm() {
  const a = t.add;
  const email = h('input', { class: 'input', type: 'email', maxlength: 254, required: true, placeholder: a.emailPlaceholder });
  const name = h('input', { class: 'input', type: 'text', maxlength: LIMITS.displayName, required: true, placeholder: a.namePlaceholder });
  const role = h('select', { class: 'input' }, ROLES.map(([v, l]) => h('option', { value: v, selected: v === 'member' }, l)));
  const error = h('div');
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, a.submit);
  const field = (label, input) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);
  const form = h(
    'form',
    { class: 'card form', novalidate: true },
    h('h2', null, a.title),
    h('p', { class: 'muted small' }, a.help),
    h('div', { class: 'form-grid' }, field(a.email, email), field(a.name, name), field(a.role, role)),
    error,
    submit,
  );
  form.addEventListener('submit', busy(submit, async (event) => {
    event.preventDefault();
    mount(error);
    const cleanName = cleanLine(name.value, LIMITS.displayName);
    if (!isEmail(email.value.trim()) || !cleanName) {
      mount(error, errorBox({ message: a.invalid }));
      return;
    }
    try {
      await api.addMember(currentProjectId(), email.value.trim(), cleanName, role.value);
      email.value = '';
      name.value = '';
      await reloadMembers();
      toast(a.done, { type: 'success' });
    } catch (e) {
      mount(error, errorBox(e));
    }
  }));
  return form;
}

const textOf = (value) => (typeof value === 'string' ? value : '');

// Link dell'email verso il sito: dentro il sito diventano link interni, gli altri restano testo.
function siteHash(href) {
  try {
    const url = new URL(href);
    return url.origin === location.origin && url.hash.startsWith('#/') ? url.hash : null;
  } catch {
    return null;
  }
}

export function weeklyPreviewNode(info) {
  const w = t.weekly;
  const extra = [info.empty ? w.nothingToRead(info.empty) : '', info.optedOut ? w.optedOut(info.optedOut) : ''].filter(Boolean);
  const counts = h('p', { class: 'small' }, `${w.wouldReceive(info.recipients || 0)}${extra.length ? ` (${extra.join(', ')})` : ''}.`);
  const preview = info.preview;
  if (!preview) return [counts, h('p', { class: 'muted' }, w.empty)];
  const part = (p) => {
    const hash = siteHash(p?.href);
    return hash ? h('a', { href: hash }, textOf(p.text)) : textOf(p?.text);
  };
  const sections = (Array.isArray(preview.sections) ? preview.sections : []).map((sec) => [
    h('h3', null, textOf(sec?.title)),
    h('ul', null, (Array.isArray(sec?.lines) ? sec.lines : []).map((line) => h('li', null, (Array.isArray(line?.parts) ? line.parts : []).map(part)))),
  ]);
  return [
    counts,
    h(
      'div',
      { class: 'email-preview' },
      h('p', { class: 'muted small' }, w.subject(textOf(preview.subject))),
      h('p', null, `${textOf(preview.hello)} ${textOf(preview.intro)}`),
      sections,
    ),
  ];
}

// Solo per l'admin: il riepilogo del lunedì del progetto aperto si può vedere e mandare subito a tutti.
function weeklyCard() {
  const w = t.weekly;
  const host = h('div', { class: 'stack' });
  let last = null;
  const load = async () => {
    last = await api.weeklyPreview();
    mount(host, weeklyPreviewNode(last));
    return last;
  };
  const show = button(w.preview, { iconName: 'eye' });
  show.addEventListener('click', busy(show, async () => {
    try {
      await load();
    } catch (error) {
      mount(host, errorBox(error));
    }
  }));
  const send = button(w.sendNow, { kind: 'primary', iconName: 'bell' });
  send.addEventListener('click', busy(send, async () => {
    try {
      const info = last || (await load());
      if (!info.recipients) {
        toast(w.nobody, { type: 'info' });
        return;
      }
      const ok = await confirmDialog(w.confirm(w.people(info.recipients)), { title: w.confirmTitle, okLabel: w.confirmOk });
      if (!ok) return;
      const result = await api.sendWeeklyNow();
      if (result?.configured === false) {
        toast(w.notConfigured, { type: 'error' });
        return;
      }
      const notes = [result.already ? w.already(result.already) : '', result.failed ? w.failed(result.failed) : ''].filter(Boolean);
      toast(`${w.sent(w.people(result.sent || 0))}${notes.length ? ` (${notes.join(', ')})` : ''}.`, { type: result.failed ? 'error' : 'success' });
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  }));
  return h('section', { class: 'card stack' }, h('h2', null, w.title), h('p', { class: 'muted small' }, w.help), h('div', { class: 'row' }, show, send), host);
}

// Who did it. A platform admin acting in a project they do not administer is not one of its members: the database marks
// those rows ("by"), and creating, archiving and reactivating a project are theirs only, even in rows written before.
const PLATFORM_EVENTS = new Set(['project_created', 'project_archived', 'project_unarchived']);

function auditActor(row, details) {
  if (row.actor_id && !memberById(row.actor_id) && (details.by === 'platform_admin' || PLATFORM_EVENTS.has(row.event))) return t.audit.platformAdmin;
  return memberName(row.actor_id);
}

// One line of the log: who did it, what, to whom (when someone), and the details that matter.
function auditLine(row) {
  const a = t.audit;
  const verb = Object.hasOwn(a.events, row.event) ? a.events[row.event] : row.event;
  const details = row.details || {};
  let extra = '';
  if (row.event === 'member_role_changed') extra = ` (${roleLabel(details.from)} → ${roleLabel(details.to)})`;
  else if (row.event === 'project_renamed') extra = ` (${textOf(details.from)} → ${textOf(details.to)})`;
  else if (row.event === 'project_created' && details.name) extra = ` ${a.quoted(textOf(details.name))}`;
  else if (details.role) extra = ` (${roleLabel(details.role)})`;
  return [h('strong', null, auditActor(row, details)), ` ${verb}`, row.target_id ? [' ', h('strong', null, memberName(row.target_id))] : null, extra];
}

export function teamView(outlet) {
  const activityHost = new Map();
  const auditHost = h('div');
  let counts = new Map();

  const render = () => {
    const admin = isAdmin();
    const exportButton = button(t.export, { iconName: 'download' });
    exportButton.addEventListener('click', busy(exportButton, async () => {
      try {
        await exportBackup();
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    }));
    const c = t.columns;
    mount(
      outlet,
      pageHeader({ title: t.title, subtitle: t.subtitle, actions: [exportButton] }),
      h(
        'div',
        { class: 'table-scroll' },
        h(
          'table',
          { class: 'table' },
          h('thead', null, h('tr', null, [c.person, c.role, c.email, c.mfa, c.lastSeen, c.edits, ''].map((label) => h('th', null, label)))),
          h(
            'tbody',
            null,
            state.members.map((m) => {
              const isMe = m.user_id === state.user.id;
              const roleCell = admin && !isMe
                ? h('select', {
                    class: 'input input-small',
                    'aria-label': t.roleOf(m.display_name),
                    onChange: async (e) => {
                      try {
                        await api.updateMemberRole(currentProjectId(), m.user_id, e.target.value);
                        await reloadMembers();
                        toast(t.roleChanged, { type: 'success' });
                      } catch (error) {
                        toast(error.message, { type: 'error' });
                        render();
                      }
                    },
                  }, ROLES.map(([v, l]) => h('option', { value: v, selected: v === m.role }, l)))
                : roleLabel(m.role);
              const remove = admin && !isMe
                ? button('', {
                    iconName: 'trash',
                    title: t.removeOf(m.display_name),
                    onClick: async () => {
                      const ok = await confirmDialog(t.removeConfirm(m.display_name), { okLabel: t.removeOk, danger: true });
                      if (!ok) return;
                      try {
                        await api.removeMember(currentProjectId(), m.user_id);
                        await reloadMembers();
                      } catch (error) {
                        toast(error.message, { type: 'error' });
                      }
                    },
                  })
                : null;
              const activity = h('span', null, String(counts.get(m.user_id) || 0));
              activityHost.set(m.user_id, activity);
              return h(
                'tr',
                null,
                h('td', null, avatar(m.user_id, 26), ' ', h('span', { class: 'person-name' }, m.display_name, isMe ? h('span', { class: 'muted small' }, ` ${t.you}`) : null)),
                h('td', null, roleCell),
                h('td', null, m.email),
                h('td', null, m.mfa_enabled ? h('span', { class: 'badge badge-ok' }, t.mfaOn) : h('span', { class: 'badge badge-warn' }, t.mfaOff)),
                h('td', null, m.last_sign_in_at ? timeAgo(m.last_sign_in_at) : '-'),
                h('td', null, activity),
                h('td', { class: 'row-actions' }, remove),
              );
            }),
          ),
        ),
      ),
      admin ? addMemberForm() : null,
      admin ? weeklyCard() : null,
      admin ? h('section', { class: 'card' }, h('h2', null, t.audit.title), auditHost) : null,
    );
  };

  const loadActivity = async () => {
    try {
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      counts = activityCounts(await api.activitySince(since));
      for (const [id, el] of activityHost) el.textContent = String(counts.get(id) || 0);
    } catch {
      // le statistiche sono facoltative
    }
  };

  const loadAudit = async () => {
    if (!isAdmin()) return;
    mount(auditHost, loading());
    try {
      const rows = await api.auditLog({ projectId: currentProjectId(), limit: 50 });
      mount(auditHost,
        rows.length
          ? h('ul', { class: 'log' }, rows.map((r) => h('li', { class: 'log-entry' }, h('div', { class: 'log-main' }, auditLine(r)), h('div', { class: 'log-side', title: fmtDateTime(r.created_at) }, timeAgo(r.created_at)))))
          : h('p', { class: 'muted' }, t.audit.empty),
      );
    } catch (error) {
      mount(auditHost, errorBox(error));
    }
  };

  render();
  const off = on('members', () => {
    render();
    loadActivity();
    loadAudit();
  });
  // Gli ultimi accessi cambiano mentre il sito resta aperto: si ricaricano a ogni apertura della pagina.
  reloadMembers().catch(() => {
    loadActivity();
    loadAudit();
  });
  return off;
}
