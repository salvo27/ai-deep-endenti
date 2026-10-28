import { h, mount, busy, confirmDialog, openModal, toast } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { fmtDateTime } from '../lib/format.js';
import { LIMITS, cleanLine, isHexColor, passwordProblem } from '../lib/validate.js';
import { enrollFlow, passwordInput, verifiedTotp } from '../auth.js';
import { reloadMembers, state } from '../store.js';
import { browserAlertsEnabled, enableBrowserAlerts } from '../notifications.js';
import { button, errorBox, loading, pageHeader } from './components.js';
import { roleLabel } from './team.js';

function profileCard() {
  const name = h('input', { class: 'input', type: 'text', maxlength: LIMITS.displayName, value: state.me.display_name });
  const color = h('input', { class: 'input input-color', type: 'color', value: state.me.color || '#4f5bd5', 'aria-label': 'Colore' });
  const save = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Salva');
  const form = h(
    'form',
    { class: 'card form' },
    h('h2', null, 'Profilo'),
    h('p', { class: 'muted small' }, `${state.me.email} · ${roleLabel(state.me.role)}`),
    h('div', { class: 'form-grid' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nome visualizzato'), name), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Colore'), color)),
    save,
  );
  form.addEventListener('submit', busy(save, async (event) => {
    event.preventDefault();
    const displayName = cleanLine(name.value, LIMITS.displayName);
    if (!displayName || !isHexColor(color.value)) return toast('Nome o colore non validi.', { type: 'error' });
    try {
      await api.updateMember(state.user.id, { display_name: displayName, color: color.value });
      await reloadMembers();
      toast('Profilo aggiornato.', { type: 'success' });
    } catch (error) {
      toast(error.message, { type: 'error' });
    }
  }));
  return form;
}

function passwordCard() {
  const { input: password, field: passwordField } = passwordInput({ autocomplete: 'new-password' });
  const { input: confirm, field: confirmField } = passwordInput({ autocomplete: 'new-password' });
  const error = h('div');
  const save = h('button', { type: 'submit', class: 'btn btn-primary' }, 'Cambia password');
  const form = h(
    'form',
    { class: 'card form' },
    h('h2', null, 'Password'),
    h('div', { class: 'form-grid' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nuova password'), passwordField), h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Ripeti'), confirmField)),
    h('p', { class: 'muted small' }, 'Almeno 12 caratteri, con minuscole, maiuscole e un numero.'),
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
      toast('Password cambiata.', { type: 'success' });
    } catch (e) {
      mount(error, errorBox(e));
    }
  }));
  return form;
}

function factorsCard() {
  const host = h('div', { class: 'card-stack' }, loading());
  const card = h('section', { class: 'card card-stack' }, h('h2', null, 'Verifica in due passaggi'), h('p', { class: 'muted small' }, 'Aggiungi un secondo dispositivo: se perdi il telefono potrai ancora entrare.'), host);

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
              h('div', null, h('strong', null, f.friendly_name || 'Dispositivo'), h('div', { class: 'muted small' }, `Aggiunto il ${fmtDateTime(f.created_at)}`)),
              factors.length > 1
                ? button('Rimuovi', {
                    onClick: async () => {
                      const ok = await confirmDialog('Il dispositivo non potrà più generare codici validi per il tuo account.', { title: 'Rimuovere il dispositivo?', okLabel: 'Rimuovi', danger: true });
                      if (!ok) return;
                      try {
                        await api.unenrollFactor(f.id);
                        toast('Dispositivo rimosso.', { type: 'success' });
                        load();
                      } catch (error) {
                        toast(error.message, { type: 'error' });
                      }
                    },
                  })
                : h('span', { class: 'muted small' }, 'È l\'unico dispositivo: non si può rimuovere'),
            ),
          ),
        ),
        button('Aggiungi un dispositivo', {
          iconName: 'plus',
          onClick: async () => {
            try {
              let modal;
              const flow = await enrollFlow({ onCancel: async () => { modal.close(); await api.unenrollFactor(flow.factorId).catch(() => {}); } });
              modal = openModal({ title: 'Nuovo dispositivo', body: flow.form });
              await flow.verified;
              modal.close();
              toast('Dispositivo aggiunto.', { type: 'success' });
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
  const supported = typeof Notification !== 'undefined';
  const status = h('p', { class: 'muted small' });
  const describe = () => {
    if (!supported) status.textContent = 'Questo browser non supporta gli avvisi.';
    else if (Notification.permission === 'denied') status.textContent = 'Il browser ha bloccato gli avvisi per questo sito: riattivali dalle impostazioni del sito nel browser.';
    else status.textContent = browserAlertsEnabled() ? 'Attivi su questo browser.' : 'Spenti su questo browser.';
  };
  const box = h('input', {
    type: 'checkbox',
    checked: browserAlertsEnabled(),
    disabled: !supported,
    onChange: async (event) => {
      const wanted = event.target.checked;
      const enabled = await enableBrowserAlerts(wanted);
      event.target.checked = enabled;
      if (wanted && !enabled) toast('Il browser non ha concesso il permesso.', { type: 'error' });
      describe();
    },
  });
  describe();
  return h(
    'section',
    { class: 'card card-stack' },
    h('h2', null, 'Notifiche'),
    h('p', { class: 'muted small' }, 'La campanella in alto raccoglie le novità degli altri: nuove idee, cambi di fase, decisioni, esperimenti conclusi, nuove schede e commenti.'),
    h('label', { class: 'check' }, box, 'Avvisami anche quando il sito è aperto in un\'altra scheda'),
    status,
  );
}

const EMAIL_OPTIONS = [
  ['mentions', 'Menzioni', 'Se qualcuno ti tagga e non lo leggi entro una decina di minuti.'],
  ['weekly', 'Riepilogo settimanale', 'Il lunedì mattina: cosa ti tocca in settimana, novità del team, cosa resta da leggere.'],
];

function emailCard() {
  const status = h('p', { class: 'muted small' }, 'Caricamento…');
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
          toast(wanted ? `${label}: email attivata.` : `${label}: email spenta.`, { type: 'success' });
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
      status.textContent = state.me.email ? `Arrivano a ${state.me.email}.` : 'Arrivano alla tua email.';
    })
    .catch(() => (status.textContent = 'Non riesco a leggere le preferenze. Riprova più tardi.'));

  return h('section', { class: 'card card-stack' }, h('h2', null, 'Email'), ...options, status);
}

function sessionCard() {
  const usage = h('span', null, '…');
  api.aiUsageLastDay(state.user.id).then((n) => (usage.textContent = String(n))).catch(() => (usage.textContent = '-'));
  return h(
    'section',
    { class: 'card card-stack' },
    h('h2', null, 'Sessioni e uso'),
    h('p', null, 'Richieste a Claude nelle ultime 24 ore: ', usage),
    button('Esci da tutti i dispositivi', {
      kind: 'danger',
      iconName: 'logout',
      onClick: async () => {
        const ok = await confirmDialog('Verrai disconnesso ovunque, anche da questo browser.', { okLabel: 'Esci ovunque', danger: true });
        if (ok) await api.signOut('global');
      },
    }),
  );
}

export function profileView(outlet) {
  if (!state.me) {
    mount(outlet, errorBox({ message: 'Profilo non disponibile.' }));
    return null;
  }
  mount(outlet, pageHeader({ title: 'Profilo e sicurezza' }), h('div', { class: 'cards cards-2' }, profileCard(), passwordCard(), factorsCard(), notificationsCard(), emailCard(), sessionCard()));
  return null;
}
