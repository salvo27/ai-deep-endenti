import { h, mount, busy, confirmDialog, toast } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { fmtDateTime, plural } from '../lib/format.js';
import { LIMITS, cleanLine, isEmail } from '../lib/validate.js';
import { exportBackup } from '../export.js';
import { isAdmin, memberName, on, reloadMembers, state } from '../store.js';
import { avatar, button, errorBox, loading, pageHeader, timeAgo } from './components.js';

export const ROLES = [
  ['admin', 'Admin'],
  ['member', 'Membro'],
  ['advisor', 'Advisor'],
];

export const roleLabel = (role) => ROLES.find(([v]) => v === role)?.[1] || role;

const EVENTS = {
  member_added: 'ha aggiunto',
  member_role_changed: 'ha cambiato il ruolo di',
  member_removed: 'ha rimosso',
};

export function activityCounts(rows) {
  const counts = new Map();
  for (const row of rows || []) counts.set(row.author_id, (counts.get(row.author_id) || 0) + 1);
  return counts;
}

function addMemberForm() {
  const email = h('input', { class: 'input', type: 'email', maxlength: 254, required: true, placeholder: 'nome@esempio.it' });
  const name = h('input', { class: 'input', type: 'text', maxlength: LIMITS.displayName, required: true, placeholder: 'Nome e cognome' });
  const role = h('select', { class: 'input' }, ROLES.map(([v, l]) => h('option', { value: v, selected: v === 'member' }, l)));
  const error = h('div');
  const submit = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Aggiungi al team');
  const form = h(
    'form',
    { class: 'card form', novalidate: true },
    h('h2', null, 'Aggiungi un membro'),
    h('p', { class: 'muted small' }, 'Prima crea l\'account in Supabase: Authentication › Users › Add user, con email, password temporanea e "Auto Confirm User". Poi aggiungilo qui. Al primo accesso dovrà attivare la verifica in due passaggi.'),
    h('div', { class: 'form-grid' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Email'), email), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nome'), name), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Ruolo'), role)),
    error,
    submit,
  );
  form.addEventListener('submit', busy(submit, async (event) => {
    event.preventDefault();
    mount(error);
    const cleanName = cleanLine(name.value, LIMITS.displayName);
    if (!isEmail(email.value.trim()) || !cleanName) {
      mount(error, errorBox({ message: 'Inserisci email e nome.' }));
      return;
    }
    try {
      await api.addMember(email.value.trim(), cleanName, role.value);
      email.value = '';
      name.value = '';
      await reloadMembers();
      toast('Membro aggiunto.', { type: 'success' });
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
  const extra = [
    info.empty ? `${plural(info.empty, 'persona non ha', 'persone non hanno')} nulla da leggere` : '',
    info.optedOut ? `${plural(info.optedOut, 'persona l\'ha spento', 'persone l\'hanno spento')}` : '',
  ].filter(Boolean);
  const counts = h('p', { class: 'small' }, `Adesso lo riceverebbero ${plural(info.recipients || 0, 'persona', 'persone')}${extra.length ? ` (${extra.join(', ')})` : ''}.`);
  const preview = info.preview;
  if (!preview) return [counts, h('p', { class: 'muted' }, 'Il tuo riepilogo sarebbe vuoto: questa settimana non c\'è nulla da segnalarti.')];
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
      h('p', { class: 'muted small' }, `Oggetto: ${textOf(preview.subject)}`),
      h('p', null, `${textOf(preview.hello)} ${textOf(preview.intro)}`),
      sections,
    ),
  ];
}

// Solo per l'admin: il riepilogo del lunedì si può vedere e mandare subito a tutti.
function weeklyCard() {
  const host = h('div', { class: 'stack' });
  let last = null;
  const load = async () => {
    last = await api.weeklyPreview();
    mount(host, weeklyPreviewNode(last));
    return last;
  };
  const show = button('Anteprima', { iconName: 'eye' });
  show.addEventListener('click', busy(show, async () => {
    try {
      await load();
    } catch (error) {
      mount(host, errorBox(error));
    }
  }));
  const send = button('Manda a tutti ora', { kind: 'primary', iconName: 'bell' });
  send.addEventListener('click', busy(send, async () => {
    try {
      const info = last || (await load());
      if (!info.recipients) {
        toast('Adesso non partirebbe a nessuno: non c\'è nulla da segnalare.', { type: 'info' });
        return;
      }
      const ok = await confirmDialog(
        `Il riepilogo parte adesso per ${plural(info.recipients, 'persona', 'persone')}. Chi l'ha spento dal profilo non lo riceve, e lunedì parte comunque quello automatico.`,
        { title: 'Mandare il riepilogo a tutti?', okLabel: 'Manda' },
      );
      if (!ok) return;
      const result = await api.sendWeeklyNow();
      if (result?.configured === false) {
        toast('Le email non sono configurate: mancano le impostazioni di Brevo nella funzione.', { type: 'error' });
        return;
      }
      const notes = [
        result.already ? `${plural(result.already, 'persona l\'aveva', 'persone l\'avevano')} già ricevuto oggi` : '',
        result.failed ? `${plural(result.failed, 'invio non riuscito', 'invii non riusciti')}` : '',
      ].filter(Boolean);
      toast(`Riepilogo mandato a ${plural(result.sent || 0, 'persona', 'persone')}${notes.length ? ` (${notes.join(', ')})` : ''}.`, { type: result.failed ? 'error' : 'success' });
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  }));
  return h(
    'section',
    { class: 'card stack' },
    h('h2', null, 'Riepilogo settimanale via email'),
    h('p', { class: 'muted small' }, 'Parte da solo ogni lunedì mattina per chi non l\'ha spento dal profilo. Qui vedi la tua versione e puoi mandarlo subito a tutti; un secondo invio nello stesso giorno non parte.'),
    h('div', { class: 'row' }, show, send),
    host,
  );
}

export function teamView(outlet) {
  const activityHost = new Map();
  const auditHost = h('div');
  let counts = new Map();

  const render = () => {
    const admin = isAdmin();
    const exportButton = button('Esporta un backup completo', { iconName: 'download' });
    exportButton.addEventListener('click', busy(exportButton, async () => {
      try {
        await exportBackup();
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
    }));
    mount(
      outlet,
      pageHeader({
        title: 'Membri',
        subtitle: 'Admin: gestisce il team. Membro: crea e modifica le board. Advisor: legge, commenta e vota.',
        actions: [exportButton],
      }),
      h(
        'table',
        { class: 'table' },
        h('thead', null, h('tr', null, ['Persona', 'Ruolo', 'Email', 'Verifica in due passaggi', 'Ultimo accesso', 'Modifiche (30 giorni)', ''].map((t) => h('th', null, t)))),
        h(
          'tbody',
          null,
          state.members.map((m) => {
            const isMe = m.user_id === state.user.id;
            const roleCell = admin && !isMe
              ? h('select', {
                  class: 'input input-small',
                  'aria-label': `Ruolo di ${m.display_name}`,
                  onChange: async (e) => {
                    try {
                      await api.updateMember(m.user_id, { role: e.target.value });
                      await reloadMembers();
                      toast('Ruolo aggiornato.', { type: 'success' });
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
                  title: `Rimuovi ${m.display_name}`,
                  onClick: async () => {
                    const ok = await confirmDialog(`${m.display_name} perderà subito l'accesso. Il suo storico resta. Per bloccare anche l'account, disattivalo in Supabase.`, { okLabel: 'Rimuovi', danger: true });
                    if (!ok) return;
                    try {
                      await api.removeMember(m.user_id);
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
              h('td', null, avatar(m.user_id, 26), ' ', m.display_name, isMe ? h('span', { class: 'muted small' }, ' (tu)') : null),
              h('td', null, roleCell),
              h('td', null, m.email),
              h('td', null, m.mfa_enabled ? h('span', { class: 'badge badge-ok' }, 'attiva') : h('span', { class: 'badge badge-warn' }, 'non ancora attiva')),
              h('td', null, m.last_sign_in_at ? timeAgo(m.last_sign_in_at) : '-'),
              h('td', null, activity),
              h('td', { class: 'row-actions' }, remove),
            );
          }),
        ),
      ),
      admin ? addMemberForm() : null,
      admin ? weeklyCard() : null,
      admin ? h('section', { class: 'card' }, h('h2', null, 'Registro di sicurezza'), auditHost) : null,
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
      const rows = await api.auditLog(50);
      mount(auditHost,
        rows.length
          ? h('ul', { class: 'log' }, rows.map((r) => h('li', { class: 'log-entry' }, h('div', { class: 'log-main' }, h('strong', null, memberName(r.actor_id)), ` ${EVENTS[r.event] || r.event} `, h('strong', null, memberName(r.target_id)), r.event === 'member_role_changed' ? ` (${roleLabel(r.details?.from)} → ${roleLabel(r.details?.to)})` : r.details?.role ? ` (${roleLabel(r.details.role)})` : ''), h('div', { class: 'log-side', title: fmtDateTime(r.created_at) }, timeAgo(r.created_at)))))
          : h('p', { class: 'muted' }, 'Nessun evento registrato.'),
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
