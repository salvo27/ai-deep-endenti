import { h, mount, busy, confirmDialog, openModal, toast } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { fmtDateTime } from '../lib/format.js';
import { LIMITS, cleanLine, isHexColor, passwordProblem } from '../lib/validate.js';
import { enrollFlow, passwordInput, verifiedTotp } from '../auth.js';
import { currentProjectId, isPlatformAdmin, reloadMembers, state } from '../store.js';
import { browserAlertsEnabled, enableBrowserAlerts } from '../notifications.js';
import { button, errorBox, loading, pageHeader } from './components.js';
import { roleLabel } from './team.js';
import { languageChoice, saveLanguageChoice, tx } from '../i18n/index.js';
import { LANGUAGES, LANGUAGE_NAMES, deviceLanguage } from '../i18n/languages.js';

const t = tx.profile;
const DEFAULT_COLOR = '#4f5bd5';

// The address of the account: the one of the members list, or the one of the session when no project is open.
const myEmail = () => state.me?.email || state.user?.email || '';

// Waits for a promise, but never longer than ms and never for its error: what is saved this way is a nicety.
const settle = (start, ms) =>
  Promise.race([Promise.resolve().then(start).catch(() => {}), new Promise((resolve) => setTimeout(resolve, ms))]);

// The choice stays on this device and goes into the profile too, where emails and the answers of Claude read it
// ('auto' saves the language of the device). The page reloads so that every text, even the ones built when a module
// loads, comes back in the new language. Saving the profile is best effort: the reload waits for it a few seconds at most.
export function languageCard(reload = () => location.reload(), { waitMs = 3000 } = {}) {
  const texts = t.language;
  const options = [['auto', texts.auto(LANGUAGE_NAMES[deviceLanguage(navigator)])], ...LANGUAGES.map((lang) => [lang, LANGUAGE_NAMES[lang]])];
  const select = h(
    'select',
    { class: 'input', name: 'language', 'aria-label': texts.label },
    options.map(([value, label]) => h('option', { value, selected: value === languageChoice }, label)),
  );
  select.addEventListener('change', async () => {
    const choice = select.value;
    if (!saveLanguageChoice(choice)) {
      toast(texts.saveFailed, { type: 'error' });
      return;
    }
    select.disabled = true;
    const lang = choice === 'auto' ? deviceLanguage(navigator) : choice;
    await settle(() => api.updateProfile({ language: lang }), waitMs);
    reload();
  });
  return h('section', { class: 'card card-stack' }, h('h2', null, texts.title), h('p', { class: 'muted small' }, texts.help), select);
}

// Email, role in the open project and, for whoever has it, the role on the platform.
function roleLine() {
  const c = t.card;
  const role = state.me?.role ?? state.project?.role ?? null;
  const inProject = state.project ? (role ? c.roleIn(roleLabel(role), state.project.name) : null) : state.me ? roleLabel(role) : c.noProject;
  return [myEmail(), inProject, isPlatformAdmin() ? c.platformAdmin : null].filter(Boolean).join(' · ');
}

// Name and colour live in the profile and hold in every project. Inside a project the members list already has them;
// without one (a platform administrator in no project) they are read from the profile.
function profileCard() {
  const c = t.card;
  const name = h('input', { class: 'input', type: 'text', maxlength: LIMITS.displayName, value: state.me?.display_name || '' });
  const color = h('input', { class: 'input input-color', type: 'color', value: state.me?.color || DEFAULT_COLOR, 'aria-label': c.color });
  const save = h('button', { type: 'submit', class: 'btn btn-primary' }, tx.common.actions.save);
  const error = h('div');
  const field = (label, input) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input);
  const form = h(
    'form',
    { class: 'card form profile-card' },
    h('h2', null, c.title),
    h('p', { class: 'muted small profile-role' }, roleLine()),
    h('p', { class: 'muted small' }, c.help),
    h('div', { class: 'form-grid' }, field(c.name, name), field(c.color, color)),
    error,
    save,
  );
  let ready = Boolean(state.me);
  if (!ready) {
    save.disabled = true;
    api
      .myProfile()
      .then((row) => {
        if (!row) throw new Error('no profile');
        name.value = row.display_name || '';
        if (isHexColor(row.color)) color.value = row.color;
        ready = true;
        save.disabled = false;
      })
      .catch(() => mount(error, errorBox({ message: t.unavailable })));
  }
  form.addEventListener('submit', busy(save, async (event) => {
    event.preventDefault();
    if (!ready) return;
    const displayName = cleanLine(name.value, LIMITS.displayName);
    if (!displayName || !isHexColor(color.value)) {
      toast(c.invalid, { type: 'error' });
      return;
    }
    try {
      await api.updateProfile({ display_name: displayName, color: color.value });
      // Members are not sent live any more: the open project reads them again, so name and avatar change everywhere.
      if (currentProjectId()) await reloadMembers();
      toast(c.saved, { type: 'success' });
    } catch (e) {
      toast(e.message, { type: 'error' });
    }
  }));
  return form;
}

function passwordCard() {
  const p = t.password;
  const words = tx.auth.newPassword;
  const { input: password, field: passwordField } = passwordInput({ autocomplete: 'new-password' });
  const { input: confirm, field: confirmField } = passwordInput({ autocomplete: 'new-password' });
  const error = h('div');
  const save = h('button', { type: 'submit', class: 'btn btn-primary' }, p.submit);
  const form = h(
    'form',
    { class: 'card form' },
    h('h2', null, p.title),
    h('div', { class: 'form-grid' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, words.password), passwordField), h('label', { class: 'field' }, h('span', { class: 'field-label' }, words.confirm), confirmField)),
    h('p', { class: 'muted small' }, words.hint),
    error,
    save,
  );
  form.addEventListener('submit', busy(save, async (event) => {
    event.preventDefault();
    mount(error);
    const problem = passwordProblem(password.value, confirm.value);
    if (problem) return mount(error, errorBox({ message: problem }));
    try {
      await api.updatePassword(password.value);
      password.value = '';
      confirm.value = '';
      toast(p.done, { type: 'success' });
    } catch (e) {
      mount(error, errorBox(e));
    }
  }));
  return form;
}

function factorsCard() {
  const d = t.devices;
  const host = h('div', { class: 'card-stack' }, loading());
  const card = h('section', { class: 'card card-stack' }, h('h2', null, d.title), h('p', { class: 'muted small' }, d.help), host);

  const load = async () => {
    try {
      const factors = verifiedTotp(await api.listFactors());
      mount(host,
        h(
          'ul',
          { class: 'list' },
          factors.map((f) =>
            h(
              'li',
              { class: 'factor' },
              h('div', null, h('strong', null, f.friendly_name || d.unnamed), h('div', { class: 'muted small' }, d.added(fmtDateTime(f.created_at)))),
              factors.length > 1
                ? button(d.remove, {
                    onClick: async () => {
                      const ok = await confirmDialog(d.removeMessage, { title: d.removeTitle, okLabel: d.remove, danger: true });
                      if (!ok) return;
                      try {
                        await api.unenrollFactor(f.id);
                        toast(d.removed, { type: 'success' });
                        load();
                      } catch (error) {
                        toast(error.message, { type: 'error' });
                      }
                    },
                  })
                : h('span', { class: 'muted small' }, d.onlyOne),
            ),
          ),
        ),
        button(d.add, {
          iconName: 'plus',
          onClick: async () => {
            try {
              let modal;
              const flow = await enrollFlow({ onCancel: async () => { modal.close(); await api.unenrollFactor(flow.factorId).catch(() => {}); } });
              modal = openModal({ title: d.newTitle, body: flow.form });
              await flow.verified;
              modal.close();
              toast(d.addedToast, { type: 'success' });
              load();
            } catch (error) {
              toast(error.message, { type: 'error' });
            }
          },
        }),
      );
    } catch (error) {
      mount(host, errorBox(error));
    }
  };
  load();
  return card;
}

function notificationsCard() {
  const a = t.alerts;
  const supported = typeof Notification !== 'undefined';
  const status = h('p', { class: 'muted small' });
  const describe = () => {
    if (!supported) status.textContent = a.unsupported;
    else if (Notification.permission === 'denied') status.textContent = a.blocked;
    else status.textContent = browserAlertsEnabled() ? a.on : a.off;
  };
  const box = h('input', {
    type: 'checkbox',
    checked: browserAlertsEnabled(),
    disabled: !supported,
    onChange: async (event) => {
      const wanted = event.target.checked;
      const enabled = await enableBrowserAlerts(wanted);
      event.target.checked = enabled;
      if (wanted && !enabled) toast(a.denied, { type: 'error' });
      describe();
    },
  });
  describe();
  return h(
    'section',
    { class: 'card card-stack' },
    h('h2', null, a.title),
    h('p', { class: 'muted small' }, a.help),
    h('label', { class: 'check' }, box, a.label),
    status,
  );
}

const EMAIL_OPTIONS = [
  ['mentions', t.emails.mentions, t.emails.mentionsHelp],
  ['weekly', t.emails.weekly, t.emails.weeklyHelp],
];

// The database keeps the preferences only for whoever is in a project: a platform admin in none reads when emails start.
const inSomeProject = () => Boolean(state.project || state.me || state.projects.length);

function emailCard() {
  const e = t.emails;
  if (!inSomeProject()) return h('section', { class: 'card card-stack' }, h('h2', null, e.title), h('p', { class: 'muted small' }, e.noProject));
  const status = h('p', { class: 'muted small' }, tx.common.states.loading);
  const boxes = {};
  const setAll = (prefs) => {
    for (const [key] of EMAIL_OPTIONS) {
      boxes[key].checked = prefs[key];
      boxes[key].disabled = false;
    }
  };
  const options = EMAIL_OPTIONS.map(([key, label, help]) => {
    boxes[key] = h('input', {
      type: 'checkbox',
      name: key,
      disabled: true,
      onChange: async (event) => {
        const wanted = event.target.checked;
        Object.values(boxes).forEach((b) => (b.disabled = true));
        try {
          setAll(await api.setEmailPrefs({ [key]: wanted }));
          toast(wanted ? e.turnedOn(label) : e.turnedOff(label), { type: 'success' });
        } catch (error) {
          event.target.checked = !wanted;
          Object.values(boxes).forEach((b) => (b.disabled = false));
          toast(error.message, { type: 'error' });
        }
      },
    });
    return h('div', null, h('label', { class: 'check' }, boxes[key], label), h('p', { class: 'muted small' }, help));
  });

  api
    .emailPrefs(state.user.id)
    .then((prefs) => {
      setAll(prefs);
      status.textContent = myEmail() ? e.to(myEmail()) : e.toYou;
    })
    .catch(() => (status.textContent = e.unreadable));

  return h('section', { class: 'card card-stack' }, h('h2', null, e.title), ...options, status);
}

function sessionCard() {
  const s = t.sessions;
  const usage = h('span', null, '…');
  api.aiUsageLastDay(state.user.id).then((n) => (usage.textContent = String(n))).catch(() => (usage.textContent = '-'));
  return h(
    'section',
    { class: 'card card-stack' },
    h('h2', null, s.title),
    h('p', null, s.claude, ' ', usage),
    button(s.signOutAll, {
      kind: 'danger',
      iconName: 'logout',
      onClick: async () => {
        const ok = await confirmDialog(s.confirm, { okLabel: s.confirmOk, danger: true });
        if (ok) await api.signOut('global');
      },
    }),
  );
}

// Open to whoever is signed in, with or without a project: the menu of a platform administrator in no project offers it.
export function profileView(outlet) {
  if (!state.user) {
    mount(outlet, errorBox({ message: t.unavailable }));
    return null;
  }
  mount(outlet, pageHeader({ title: t.title }), h('div', { class: 'cards cards-2' }, profileCard(), languageCard(), passwordCard(), factorsCard(), notificationsCard(), emailCard(), sessionCard()));
  return null;
}
