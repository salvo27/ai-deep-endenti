import { api } from './lib/api.js';
import { h, mount, busy, toast } from './lib/dom.js';
import { icon } from './lib/icons.js';
import { isEmail, isTotpCode, passwordProblem } from './lib/validate.js';
import { CONFIG } from './config.js';

export function verifiedTotp(factors) {
  return (factors || []).filter((f) => f.factor_type === 'totp' && f.status === 'verified');
}

// Ordine obbligato: password, poi secondo fattore. Senza aal2 il database non restituisce nulla.
export function nextAuthStep({ session, assurance, factors, recovery }) {
  if (!session) return 'login';
  if (assurance?.currentLevel !== 'aal2') return verifiedTotp(factors).length ? 'verify' : 'enroll';
  if (recovery) return 'new-password';
  return 'ready';
}

export async function currentAuthStep() {
  const session = await api.getSession();
  if (!session) return 'login';
  const [assurance, factors] = await Promise.all([api.getAssurance(), api.listFactors()]);
  return nextAuthStep({ session, assurance, factors, recovery: api.isRecovery() });
}

function layout(title, subtitle, ...content) {
  return h(
    'main',
    { class: 'auth' },
    h(
      'section',
      { class: 'auth-card' },
      h('div', { class: 'auth-brand' }, icon('shield', 28), h('span', null, CONFIG.appName)),
      h('h1', null, title),
      subtitle ? h('p', { class: 'muted' }, subtitle) : null,
      ...content,
    ),
  );
}

function errorBox() {
  return h('p', { class: 'form-error', role: 'alert', hidden: true });
}

function showError(box, error) {
  box.textContent = error?.message || String(error);
  box.hidden = false;
}

export function passwordInput(attrs = {}) {
  const input = h('input', { class: 'input', type: 'password', maxlength: 128, ...attrs });
  const toggle = h('button', { type: 'button', class: 'pw-toggle', 'aria-label': 'Mostra password', 'aria-pressed': 'false', title: 'Mostra password' }, icon('eye', 18));
  toggle.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    const label = show ? 'Nascondi password' : 'Mostra password';
    toggle.setAttribute('aria-pressed', String(show));
    toggle.setAttribute('aria-label', label);
    toggle.title = label;
    mount(toggle, icon(show ? 'eyeOff' : 'eye', 18));
    input.focus();
  });
  return { input, field: h('div', { class: 'pw-field' }, input, toggle) };
}

function codeInput() {
  return h('input', {
    class: 'input input-code',
    name: 'code',
    inputmode: 'numeric',
    autocomplete: 'one-time-code',
    pattern: '[0-9]{6}',
    maxlength: 6,
    required: true,
    placeholder: '000000',
    'aria-label': 'Codice a sei cifre',
  });
}

export function loginScreen(root, done) {
  const email = h('input', { class: 'input', type: 'email', name: 'email', autocomplete: 'username', required: true, maxlength: 254 });
  const { input: password, field: passwordField } = passwordInput({ name: 'password', autocomplete: 'current-password', required: true });
  const error = errorBox();
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Accedi');
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Email'), email),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Password'), passwordField),
    error,
    submit,
    h('button', { class: 'link-btn', type: 'button', onClick: () => resetScreen(root, done, email.value) }, 'Password dimenticata?'),
  );
  form.addEventListener(
    'submit',
    busy(submit, async (event) => {
      event.preventDefault();
      error.hidden = true;
      const value = email.value.trim();
      if (!isEmail(value) || !password.value) return showError(error, 'Inserisci email e password.');
      try {
        await api.signIn(value, password.value);
        password.value = '';
        done();
      } catch (e) {
        showError(error, e);
      }
    }),
  );
  mount(root, layout('Accedi', 'Gli account li crea l\'amministratore del team.', form));
  email.focus();
}

export function resetScreen(root, done, prefill = '') {
  const email = h('input', { class: 'input', type: 'email', autocomplete: 'username', required: true, value: prefill, maxlength: 254 });
  const error = errorBox();
  const info = h('p', { class: 'form-info', hidden: true, role: 'status' });
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Invia il link');
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Email'), email),
    error,
    info,
    submit,
    h('button', { class: 'link-btn', type: 'button', onClick: () => loginScreen(root, done) }, 'Torna all\'accesso'),
  );
  form.addEventListener(
    'submit',
    busy(submit, async (event) => {
      event.preventDefault();
      error.hidden = true;
      const value = email.value.trim();
      if (!isEmail(value)) return showError(error, 'Inserisci un indirizzo email valido.');
      try {
        await api.requestPasswordReset(value, `${location.origin}${location.pathname}`);
      } catch (e) {
        if (e?.code === 'over_email_send_rate_limit' || e?.code === 'network') return showError(error, e);
      }
      info.textContent = 'Se l\'indirizzo appartiene a un account riceverai un\'email con il link. Dopo il link servirà comunque il codice dell\'app di autenticazione.';
      info.hidden = false;
    }),
  );
  mount(root, layout('Recupera la password', null, form));
}

export async function verifyScreen(root, done) {
  const factors = verifiedTotp(await api.listFactors());
  const select = factors.length > 1
    ? h('select', { class: 'input' }, factors.map((f) => h('option', { value: f.id }, f.friendly_name || 'Dispositivo')))
    : null;
  const code = codeInput();
  const error = errorBox();
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Verifica');
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    select ? h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Dispositivo'), select) : null,
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Codice dell\'app di autenticazione'), code),
    error,
    submit,
    h('button', { class: 'link-btn', type: 'button', onClick: async () => { await api.signOut(); done(); } }, 'Esci'),
  );
  form.addEventListener(
    'submit',
    busy(submit, async (event) => {
      event.preventDefault();
      error.hidden = true;
      const value = code.value.replace(/\s/g, '');
      if (!isTotpCode(value)) return showError(error, 'Il codice ha sei cifre.');
      try {
        await api.verifyTotp(select ? select.value : factors[0].id, value);
        done();
      } catch (e) {
        code.value = '';
        showError(error, e);
      }
    }),
  );
  mount(root, layout('Verifica in due passaggi', 'Apri l\'app di autenticazione e inserisci il codice.', form));
  code.focus();
}

export function isSafeQr(src) {
  return typeof src === 'string' && /^data:image\/svg\+xml[;,]/.test(src);
}

export async function enrollFlow({ onCancel } = {}) {
  const leftovers = (await api.listFactors()).filter((f) => f.factor_type === 'totp' && f.status !== 'verified');
  for (const factor of leftovers) await api.unenrollFactor(factor.id).catch(() => {});
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const enrolled = await api.enrollTotp(`Authenticator ${stamp}`);
  const qr = isSafeQr(enrolled?.totp?.qr_code)
    ? h('img', { class: 'qr', src: enrolled.totp.qr_code, alt: 'Codice QR da scansionare con l\'app di autenticazione', width: 200, height: 200 })
    : null;
  const secret = typeof enrolled?.totp?.secret === 'string' ? enrolled.totp.secret.slice(0, 128) : '';
  const code = codeInput();
  const error = errorBox();
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Attiva');
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h(
      'ol',
      { class: 'steps' },
      h('li', null, 'Installa un\'app di autenticazione: Google Authenticator, Microsoft Authenticator, 1Password o simili.'),
      h('li', null, 'Scansiona il codice QR, oppure inserisci a mano la chiave qui sotto.'),
      h('li', null, 'Scrivi il codice a sei cifre che compare nell\'app.'),
    ),
    h('div', { class: 'qr-box' }, qr, h('code', { class: 'secret' }, secret)),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Codice'), code),
    error,
    submit,
    onCancel ? h('button', { class: 'link-btn', type: 'button', onClick: onCancel }, 'Annulla') : null,
  );
  const verified = new Promise((resolve) => {
    form.addEventListener(
      'submit',
      busy(submit, async (event) => {
        event.preventDefault();
        error.hidden = true;
        const value = code.value.replace(/\s/g, '');
        if (!isTotpCode(value)) return showError(error, 'Il codice ha sei cifre.');
        try {
          await api.verifyTotp(enrolled.id, value);
          resolve(true);
        } catch (e) {
          code.value = '';
          showError(error, e);
        }
      }),
    );
  });
  return { form, verified, factorId: enrolled.id };
}

export async function enrollScreen(root, done) {
  const { form, verified } = await enrollFlow({
    onCancel: async () => {
      await api.signOut();
      done();
    },
  });
  mount(root, layout('Attiva la verifica in due passaggi', 'È obbligatoria per tutti: protegge le idee del team anche se qualcuno scopre la tua password.', form));
  await verified;
  toast('Verifica in due passaggi attivata.', { type: 'success' });
  done();
}

export function newPasswordScreen(root, done) {
  const { input: password, field: passwordField } = passwordInput({ autocomplete: 'new-password', required: true });
  const { input: confirm, field: confirmField } = passwordInput({ autocomplete: 'new-password', required: true });
  const error = errorBox();
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Salva la nuova password');
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nuova password'), passwordField),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Ripeti la password'), confirmField),
    h('p', { class: 'muted small' }, 'Almeno 12 caratteri, con minuscole, maiuscole e un numero.'),
    error,
    submit,
  );
  form.addEventListener(
    'submit',
    busy(submit, async (event) => {
      event.preventDefault();
      error.hidden = true;
      const problem = passwordProblem(password.value, confirm.value);
      if (problem) return showError(error, problem);
      try {
        await api.updatePassword(password.value);
        api.clearRecovery();
        toast('Password aggiornata.', { type: 'success' });
        done();
      } catch (e) {
        showError(error, e);
      }
    }),
  );
  mount(root, layout('Scegli una nuova password', null, form));
}

export function notMemberScreen(root) {
  mount(
    root,
    layout(
      'Account non abilitato',
      'Il tuo account esiste ma non fa parte del team. Chiedi all\'amministratore di aggiungerti.',
      h('button', { class: 'btn btn-ghost btn-block', type: 'button', onClick: async () => { await api.signOut(); location.reload(); } }, 'Esci'),
    ),
  );
}

export function errorScreen(root, error, retry) {
  mount(
    root,
    layout(
      'Qualcosa non ha funzionato',
      error?.message || 'Riprova tra poco.',
      h('button', { class: 'btn btn-primary btn-block', type: 'button', onClick: retry }, 'Riprova'),
    ),
  );
}

const SCREENS = {
  login: loginScreen,
  verify: verifyScreen,
  enroll: enrollScreen,
  'new-password': newPasswordScreen,
};

export async function runAuthGate(root) {
  for (;;) {
    let step;
    try {
      step = await currentAuthStep();
    } catch (error) {
      await new Promise((resolve) => errorScreen(root, error, resolve));
      continue;
    }
    if (step === 'ready') return;
    await new Promise((resolve) => {
      Promise.resolve(SCREENS[step](root, resolve)).catch((error) => errorScreen(root, error, resolve));
    });
  }
}
