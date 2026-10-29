import { PREFER_NOT, PublicSurveyError, coverUrl, loadPublicSurvey, newSurveySession, recordSurveyEvent, submitSurvey } from './survey-api.js';
import { estimateMinutes } from './survey-time.js';
import {
  LIMITS,
  MESSAGES,
  OTHER,
  accentTokens,
  buildMeta,
  buildScreens,
  collectAnswers,
  condense,
  durationText,
  emailQuestion,
  firstInvalidScreen,
  normalizeSurvey,
  numberHint,
  otherKey,
  progressFor,
  readStored,
  screenOf,
  selectedChoices,
  sentKey,
  storageKey,
  tabKey,
  toggleChoice,
  tokenFromHash,
  unanswered,
  validateQuestion,
  validateScreen,
} from './survey-flow.js';

// Pagina pubblica dei questionari (q.html#<codice>): chi risponde non ha account e non carica nulla del sito.
// Tutti i testi del questionario entrano come testo, mai come HTML; dell'aspetto si usano solo tema, colore e l'immagine
// dello spazio dei questionari, già controllati.

const ALREADY_SENT = /già state inviate/i;
const SEND_ERROR = 'Invio non riuscito. Riprova tra poco.';
const THANKS = 'Le tue risposte sono arrivate. Ora puoi chiudere questa pagina.';
const asText = (value) => (typeof value === 'string' ? value : '');
const CHOICE_TYPES = new Set(['scelta', 'scelte', 'scala']);
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Icone disegnate qui, a tratto: niente immagini o font esterni, la policy della pagina li bloccherebbe.
const CIRCLE = 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0';
const ICONS = {
  clock: [CIRCLE, 'M12 7v5l3 2'],
  mail: ['M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M3 7l9 6 9-6'],
  saved: [CIRCLE, 'M8.5 12.5l2.5 2.5 4.5-5'],
  lock: ['M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z', 'M8 11V8a4 4 0 1 1 8 0v3'],
  back: ['M19 12H5', 'M11 6l-6 6 6 6'],
  hello: ['M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', 'M12 14l-2.6-2.5a1.6 1.6 0 0 1 2.6-2a1.6 1.6 0 0 1 2.6 2z'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
};

function icon(name, size = 20) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const attrs = { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' };
  for (const [key, value] of Object.entries(attrs)) svg.setAttribute(key, String(value));
  for (const d of ICONS[name]) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = [value].flat().filter(Boolean).join(' ');
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'value' || key === 'checked') el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  el.append(...children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false));
  return el;
}

const state = {
  token: null,
  survey: null,
  screens: [],
  mode: 'loading',
  index: 0,
  session: null,
  draft: {},
  recontact: false,
  startedAt: null,
  website: '',
  sending: false,
  reminded: false,
};

let ui = null;
let blocks = new Map();
let shortcuts = [];
let saving = null;
let saveAgain = false;

// Sul dispositivo restano la compilazione in corso (30 giorni al massimo, cancellata all'invio) e, dopo l'invio, solo la data.
// Senza spazio o con i dati del sito bloccati si perde solo la ripresa: il questionario funziona lo stesso.
function safe(action, fallback = null) {
  try {
    return action();
  } catch {
    return fallback;
  }
}

const storage = {
  read: () => safe(() => localStorage.getItem(storageKey(state.token))),
  write() {
    const { session, index, draft, recontact, startedAt } = state;
    safe(() => localStorage.setItem(storageKey(state.token), JSON.stringify({ session, index, draft, recontact, startedAt, savedAt: Date.now() })));
    safe(() => sessionStorage.setItem(tabKey(state.token), '1'));
  },
  clear() {
    safe(() => localStorage.removeItem(storageKey(state.token)));
    safe(() => sessionStorage.removeItem(tabKey(state.token)));
  },
  inThisTab: () => safe(() => sessionStorage.getItem(tabKey(state.token)) === '1', false),
  markSent: () => safe(() => localStorage.setItem(sentKey(state.token), new Date().toISOString().slice(0, 10))),
  sentOn: () => safe(() => localStorage.getItem(sentKey(state.token))),
};

function buildShell(root) {
  const fill = h('span', { class: 'progress-fill' });
  const bar = h('div', { class: 'progress-bar', role: 'progressbar', 'aria-label': 'Avanzamento', 'aria-valuemin': '0' }, fill);
  const counter = h('p', { class: 'progress-text' });
  const progress = h('div', { class: 'progress', hidden: true }, counter, bar);
  // Fascia colorata dell'introduzione e del grazie, sopra il resto.
  const band = h('header', { class: 'band', hidden: true });
  const screen = h('div', { class: 'screen' }, h('p', { class: 'loading', role: 'status' }, 'Caricamento…'));
  const alert = h('p', { class: 'alert', 'aria-live': 'polite' });
  const nav = h('div', { class: 'nav' });
  // Sotto i pulsanti: l'informativa dell'introduzione, così «Inizia» resta visibile anche sul telefono.
  const after = h('div', { class: 'after' });
  // Campo trappola per i bot: invisibile e fuori dal giro del tasto Tab, chi risponde non lo vede mai.
  const trap = h('input', { type: 'text', id: 'website', name: 'website', tabindex: '-1', autocomplete: 'off' });
  const honeypot = h('div', { class: 'hp', 'aria-hidden': 'true' }, h('label', { for: 'website' }, 'Sito web'), trap);
  const sheet = h('div', { class: 'sheet' }, progress, screen, alert, nav, after, honeypot);
  const form = h('form', { class: 'card', novalidate: true, 'data-mode': 'loading' }, band, sheet);
  form.addEventListener('submit', onSubmit);
  form.addEventListener('input', onInput);
  form.addEventListener('change', onChange);
  document.addEventListener('keydown', onKey);
  root.textContent = '';
  root.append(form);
  ui = { form, band, progress, bar, fill, counter, screen, alert, nav, after, trap, submit: null };
}

// Mostra una schermata; «enter» fa entrare il contenuto dal basso (avanti) o dall'alto (indietro).
function mount(nodes, { band = null, bandClass = null, enter = null } = {}) {
  ui.form.dataset.mode = state.mode;
  ui.band.textContent = '';
  if (band) ui.band.append(...band);
  ui.band.hidden = !band;
  ui.band.className = ['band', bandClass].filter(Boolean).join(' ');
  ui.screen.textContent = '';
  ui.screen.append(...nodes);
  ui.after.textContent = '';
  ui.alert.textContent = '';
  shortcuts = [];
  ui.screen.classList.remove('is-entering', 'is-entering-back');
  if (enter) {
    void ui.screen.offsetWidth;
    ui.screen.classList.add(enter === 'back' ? 'is-entering-back' : 'is-entering');
  }
}

function setAlert(text) {
  ui.alert.textContent = text || '';
}

function applyAppearance({ theme, accent }) {
  const root = document.documentElement;
  if (theme === 'automatico') delete root.dataset.theme;
  else root.dataset.theme = theme;
  root.style.setProperty('--accent', accent);
  for (const [name, value] of Object.entries(accentTokens(accent))) root.style.setProperty(name, value);
}

// Stati senza domande: caricamento fallito, questionario chiuso o link sbagliato.
function showMessage(title, text, retry = null) {
  state.mode = 'message';
  document.title = title;
  ui.progress.hidden = true;
  mount([h('h1', { class: 'title', tabindex: '-1' }, title), h('p', { class: 'text' }, text)]);
  ui.nav.textContent = '';
  if (retry) ui.nav.append(h('button', { type: 'button', class: 'btn btn-primary', onclick: retry }, 'Riprova'));
}

const showNotFound = () =>
  showMessage('Questionario non trovato', 'Il link potrebbe essere incompleto o non più valido. Controlla di averlo copiato per intero, oppure chiedilo di nuovo a chi te l\'ha mandato.');

const showClosed = () => showMessage('Questionario chiuso', 'Questo questionario non accetta più risposte. Grazie comunque per il tuo interesse.');

function privacyBlock(text) {
  const short = condense(text);
  const body = h('p', { class: 'privacy-text', id: 'privacy-testo' }, short.text);
  const nodes = [h('h2', { class: 'privacy-title', id: 'privacy-titolo' }, 'Informativa sulla privacy'), body];
  if (short.truncated) {
    const toggle = h('button', { type: 'button', class: 'link-btn', 'aria-expanded': 'false', 'aria-controls': body.id }, 'Leggi tutto');
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      body.textContent = open ? text : short.text;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Mostra meno' : 'Leggi tutto';
    });
    nodes.push(toggle);
  }
  return h('section', { class: 'privacy', 'aria-labelledby': 'privacy-titolo' }, nodes);
}

// Copertina: l'immagine scelta dal team o, senza immagine (o se non si carica), una fascia leggera con un'icona.
function cover() {
  const empty = () => h('span', { class: 'cover-icon' }, icon('hello', 44));
  const data = state.survey.cover;
  if (!data) return { band: [empty()], bandClass: 'band-cover is-empty' };
  const img = h('img', { src: coverUrl(data.path), alt: data.alt, decoding: 'async', fetchpriority: 'high' });
  img.addEventListener('error', () => {
    img.replaceWith(empty());
    ui.band.classList.add('is-empty');
  });
  return { band: [img], bandClass: 'band-cover' };
}

function showIntro() {
  const survey = state.survey;
  state.mode = 'intro';
  ui.progress.hidden = true;
  const facts = [];
  if (survey.show_time) facts.push(['clock', durationText(estimateMinutes(survey, survey.median_seconds))]);
  const email = emailQuestion(survey);
  if (email) facts.push(['mail', email.required ? 'Alla fine ti chiederemo un indirizzo email.' : 'Alla fine, se vuoi, potrai lasciarci la tua email.']);
  facts.push(['saved', 'Le risposte si salvano a ogni passaggio: se ti fermi, riprendi da dove eri.']);
  if (survey.privacy) facts.push(['lock', 'Trovi l\'informativa sulla privacy qui sotto.']);
  mount(
    [
      h('p', { class: 'hello' }, 'Ciao!'),
      h('h1', { class: 'title' }, survey.title),
      survey.intro ? h('p', { class: 'text' }, survey.intro) : null,
      h('ul', { class: 'facts' }, facts.map(([name, fact]) => h('li', {}, h('span', { class: 'fact-icon' }, icon(name, 18)), h('span', {}, fact)))),
    ].filter(Boolean),
    cover(),
  );
  ui.nav.textContent = '';
  ui.nav.append(h('button', { type: 'submit', class: 'btn btn-primary' }, 'Inizia'));
  if (survey.privacy) ui.after.append(privacyBlock(survey.privacy));
}

// Chi torna dopo aver chiuso la pagina: saluto, quante domande mancano e si riprende dalla stessa schermata.
function showWelcomeBack() {
  const survey = state.survey;
  state.mode = 'ritorno';
  ui.progress.hidden = true;
  const asked = survey.questions.filter((q) => q.type !== 'sezione').length;
  const missing = unanswered(survey.questions, state.draft).length;
  const left = missing === 1 ? 'Ti manca una domanda' : `Ti mancano ${missing} domande`;
  mount(
    [
      h('p', { class: 'hello' }, 'Rieccoci!'),
      h('h1', { class: 'title' }, survey.title),
      h('p', { class: 'text' }, `${left} su ${asked}: le risposte che avevi dato sono ancora qui, riprendi da dove eri.`),
    ],
    cover(),
  );
  ui.nav.textContent = '';
  ui.nav.append(h('button', { type: 'submit', class: 'btn btn-primary' }, 'Riprendi'));
}

// Chi ha già inviato da questo dispositivo non ricomincia: niente compilazioni doppie per sbaglio.
function showAlreadySent(day) {
  state.mode = 'done';
  document.title = 'Hai già risposto';
  ui.progress.hidden = true;
  const [y, m, d] = String(day).split('-');
  const when = y && m && d ? ` il ${d}/${m}/${y}` : '';
  mount(
    [h('h1', { class: 'title', tabindex: '-1' }, 'Hai già risposto, grazie!'), h('p', { class: 'text' }, `Le tue risposte sono arrivate${when}: non serve compilarlo di nuovo. Ora puoi chiudere questa pagina.`)],
    { band: [h('span', { class: 'band-mark' }, icon('check', 40))] },
  );
  ui.nav.textContent = '';
}

function begin() {
  state.session = newSurveySession();
  state.draft = {};
  state.recontact = false;
  state.startedAt = Date.now();
  state.index = 0;
  state.reminded = false;
  recordSurveyEvent(state.token, 'start');
  storage.write();
  showQuestions({ enter: 'next' });
}

function isChecked(q, value) {
  const current = state.draft[q.id];
  if (q.type === 'scala') return current === Number(value);
  if (q.type === 'scelta') return current === value;
  return selectedChoices(q, current).includes(value);
}

// Con «keyed» ogni riga mostra la sua lettera: sul computer si sceglie anche dalla tastiera.
function choiceControls(q, block, keyed) {
  const type = q.type === 'scelte' ? 'checkbox' : 'radio';
  const row = (value, label, extra = null) => {
    const input = h('input', { type, name: `q-${q.id}`, value, class: 'opt-input', 'data-q': q.id, checked: isChecked(q, value) });
    const key = keyed && block.inputs.length < LETTERS.length ? h('span', { class: 'opt-key', 'data-key': LETTERS[block.inputs.length], 'aria-hidden': 'true' }) : null;
    block.inputs.push(input);
    return h('label', { class: ['opt', extra] }, input, key, label, h('span', { class: ['opt-mark', type === 'checkbox' && 'is-box'] }));
  };
  const rows = [];
  if (q.type === 'scala') {
    const { points, labels, min_label: minLabel, max_label: maxLabel } = q.scale;
    for (let i = 1; i <= points; i += 1) {
      const end = i === 1 ? minLabel : i === points ? maxLabel : '';
      const label = labels
        ? h('span', { class: 'opt-label' }, labels[i - 1] || String(i))
        : [h('span', { class: 'opt-num' }, String(i)), end ? [' ', h('span', { class: 'opt-label' }, end)] : null];
      rows.push(row(String(i), label));
    }
  } else {
    for (const option of q.options) rows.push(row(option.id, h('span', { class: 'opt-label' }, option.label)));
    if (q.allow_other) {
      rows.push(row(OTHER, h('span', { class: 'opt-label' }, 'Altro')));
      block.otherField = h('input', {
        type: 'text',
        class: 'field opt-other',
        'data-q': q.id,
        'data-other': '',
        maxlength: LIMITS.other,
        autocomplete: 'off',
        'aria-label': 'Altro: scrivi la tua risposta',
        value: asText(state.draft[otherKey(q.id)]),
      });
      rows.push(block.otherField);
    }
    if (q.prefer_not) rows.push(row(PREFER_NOT, h('span', { class: 'opt-label' }, 'Preferisco non rispondere'), 'opt-prefer'));
  }
  return h('div', { class: 'opts' }, rows);
}

function fieldControl(q, block, describedBy, last) {
  const common = { id: `q-${q.id}-campo`, class: 'field', 'data-q': q.id, 'aria-describedby': describedBy, autocomplete: 'off' };
  const enter = last ? 'send' : 'next';
  let input;
  if (q.type === 'lunga') {
    input = h('textarea', { ...common, class: 'field field-long', rows: 4, maxlength: LIMITS.long, value: asText(state.draft[q.id]) });
  } else if (q.type === 'numero') {
    // Il tastierino numerico dei telefoni non ha il segno meno: serve solo se il minimo è negativo.
    const inputmode = (q.number.min ?? 0) < 0 ? 'text' : 'numeric';
    input = h('input', { ...common, class: 'field field-number', type: 'text', inputmode, enterkeyhint: enter, value: asText(state.draft[q.id]) });
  } else if (q.type === 'email') {
    input = h('input', {
      ...common,
      type: 'email',
      autocomplete: 'email',
      spellcheck: 'false',
      autocapitalize: 'off',
      enterkeyhint: enter,
      maxlength: LIMITS.email,
      value: asText(state.draft[q.id]),
    });
  } else {
    input = h('input', { ...common, type: 'text', maxlength: LIMITS.short, enterkeyhint: enter, value: asText(state.draft[q.id]) });
  }
  block.inputs.push(input);
  if (q.type !== 'email') return input;
  const consent = h('input', { type: 'checkbox', name: 'recontact', class: 'opt-input', 'data-q': q.id, checked: state.recontact });
  return [input, h('label', { class: 'opt opt-consent' }, consent, h('span', { class: 'opt-label' }, 'Potete ricontattarmi per una breve chiacchierata'), h('span', { class: 'opt-mark is-box' }))];
}

function questionBlock(q, level, last, keyed) {
  const base = `q-${q.id}`;
  const block = { q, node: null, title: null, inputs: [], otherField: null, error: h('p', { class: 'q-error', id: `${base}-errore`, hidden: true }) };
  const help = q.help ? h('p', { class: 'q-help', id: `${base}-aiuto` }, q.help) : null;
  const hint = q.type === 'numero' ? h('p', { class: 'q-help', id: `${base}-limiti` }, numberHint(q.number)) : null;
  const describedBy = [help?.id, hint?.id, block.error.id].filter(Boolean).join(' ');
  const label = [q.label, q.required ? h('span', { class: 'q-required' }, ' (obbligatoria)') : null];
  block.title = h(level, { class: 'q-title', id: `${base}-titolo`, tabindex: '-1' });
  if (q.type === 'scelta' || q.type === 'scelte' || q.type === 'scala') {
    block.title.append(...label.filter(Boolean));
    const controls = choiceControls(q, block, keyed);
    block.node = h('fieldset', { class: 'q', 'aria-describedby': describedBy }, h('legend', { class: 'q-legend' }, block.title), help, controls, block.error);
    syncOther(block);
  } else {
    const control = fieldControl(q, block, describedBy, last);
    block.title.append(h('label', { for: block.inputs[0].id }, label));
    block.node = h('div', { class: 'q' }, block.title, help, hint, h('div', { class: 'q-field' }, control), block.error);
  }
  blocks.set(q.id, block);
  return block.node;
}

function updateProgress() {
  const mode = state.survey.progress;
  ui.progress.hidden = mode === 'nessuno';
  if (mode === 'nessuno') return;
  const p = progressFor(state.screens, state.index);
  ui.fill.style.width = `${Math.round(p.ratio * 1000) / 10}%`;
  ui.bar.setAttribute('aria-valuemax', String(p.total));
  ui.bar.setAttribute('aria-valuenow', String(p.last));
  ui.bar.setAttribute('aria-valuetext', p.text);
  ui.counter.textContent = p.text;
  ui.counter.hidden = mode !== 'contatore';
}

function grow(area) {
  area.style.height = 'auto';
  area.style.height = `${area.scrollHeight + area.offsetHeight - area.clientHeight}px`;
}

function showQuestions({ focus = true, enter = null } = {}) {
  state.mode = 'question';
  blocks = new Map();
  const screen = state.screens[state.index];
  const one = state.survey.layout === 'una';
  const last = state.index === state.screens.length - 1;
  const keyed = screen.questions.length === 1 && CHOICE_TYPES.has(screen.questions[0].type);
  const nodes = [];
  if (screen.section) {
    const { label, help } = screen.section;
    nodes.push(h('div', { class: one ? 'section section-small' : 'section' }, h(one ? 'p' : 'h1', { class: 'section-title' }, label), help ? h('p', { class: 'section-help' }, help) : null));
  }
  const level = one || !screen.section ? 'h1' : 'h2';
  for (const q of screen.questions) nodes.push(questionBlock(q, level, last, keyed));
  mount(nodes, { enter });
  if (keyed) shortcuts = blocks.get(screen.questions[0].id).inputs;
  updateProgress();
  ui.nav.textContent = '';
  if (state.index > 0) ui.nav.append(h('button', { type: 'button', class: 'btn btn-back', 'aria-label': 'Indietro', title: 'Indietro', onclick: goBack }, icon('back')));
  ui.submit = h('button', { type: 'submit', class: 'btn btn-primary', 'aria-keyshortcuts': 'Enter' }, last ? 'Invia' : 'Avanti');
  ui.nav.append(h('span', { class: 'key-hint', 'aria-hidden': 'true' }, 'oppure premi Invio ↵'), ui.submit);
  for (const area of ui.screen.querySelectorAll('textarea')) grow(area);
  if (focus) {
    window.scrollTo(0, 0);
    blocks.get(screen.questions[0].id).title.focus({ preventScroll: true });
  }
}

function goBack() {
  if (state.sending || state.index === 0) return;
  state.index -= 1;
  storage.write();
  showQuestions({ enter: 'back' });
}

function setError(id, message) {
  const block = blocks.get(id);
  if (!block) return;
  block.error.textContent = message || '';
  block.error.hidden = !message;
  block.node.classList.toggle('has-error', Boolean(message));
  for (const input of block.inputs) {
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
}

function showErrors(errors) {
  for (const id of blocks.keys()) setError(id, null);
  for (const { id, message } of errors) setError(id, message);
  setAlert(errors.length === 1 ? errors[0].message : 'Controlla le risposte segnate, per favore.');
  const first = blocks.get(errors[0]?.id);
  if (!first) return;
  const other = first.otherField && !first.otherField.hidden && first.error.textContent !== MESSAGES.required;
  (other ? first.otherField : first.inputs[0])?.focus();
}

function syncOther(block) {
  if (!block.otherField) return;
  const value = state.draft[block.q.id];
  const chosen = block.q.type === 'scelta' ? value === OTHER : selectedChoices(block.q, value).includes(OTHER);
  block.otherField.hidden = !chosen;
}

function afterChange(id) {
  storage.write();
  const block = blocks.get(id);
  if (!block || block.error.hidden || validateQuestion(block.q, state.draft, { recontact: state.recontact })) return;
  setError(id, null);
  if (![...blocks.values()].some((b) => !b.error.hidden)) setAlert('');
}

function onInput(event) {
  const el = event.target;
  if (el === ui.trap) {
    state.website = el.value;
    return;
  }
  if (el.type === 'radio' || el.type === 'checkbox' || !el.dataset.q) return;
  const id = el.dataset.q;
  if ('other' in el.dataset) state.draft[otherKey(id)] = el.value;
  else state.draft[id] = el.value;
  if (el.tagName === 'TEXTAREA') grow(el);
  afterChange(id);
}

function onChange(event) {
  const el = event.target;
  const block = blocks.get(el.dataset.q);
  if (!block || (el.type !== 'radio' && el.type !== 'checkbox')) return;
  const { q } = block;
  if (el.name === 'recontact') {
    state.recontact = el.checked;
  } else if (q.type === 'scala') {
    state.draft[q.id] = Number(el.value);
    revealNext();
  } else if (q.type === 'scelta') {
    state.draft[q.id] = el.value;
    if (el.value !== OTHER) revealNext();
  } else if (q.type === 'scelte') {
    state.draft[q.id] = toggleChoice(selectedChoices(q, state.draft[q.id]), el.value, el.checked);
    const list = selectedChoices(q, state.draft[q.id]);
    for (const input of block.inputs) input.checked = list.includes(input.value);
  }
  syncOther(block);
  afterChange(q.id);
}

// Niente passaggio automatico alla domanda dopo (Giroux e altri 2019): dopo una scelta singola, se «Avanti» è fuori
// dallo schermo, lo si porta in vista.
function revealNext() {
  if (state.screens[state.index]?.questions.length !== 1) return;
  const box = ui.nav.getBoundingClientRect();
  if (box.bottom <= window.innerHeight) return;
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  ui.nav.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
}

// Sul computer: una lettera sceglie la riga con quella lettera, «Invio» va avanti. Mai mentre si scrive.
function onKey(event) {
  if (state.mode !== 'question' || state.sending || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  const typing = event.target.closest?.('textarea, input:not([type="radio"]):not([type="checkbox"]), button, a, summary, select');
  if (typing) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    ui.form.requestSubmit();
    return;
  }
  const index = event.key.length === 1 ? LETTERS.indexOf(event.key.toUpperCase()) : -1;
  const input = shortcuts[index];
  if (!input) return;
  event.preventDefault();
  input.click();
  input.focus({ preventScroll: true });
}

const meta = (final, answers) =>
  buildMeta(state.survey, answers, {
    session: state.session,
    final,
    startedAt: state.startedAt,
    width: window.innerWidth,
    recontact: state.recontact,
    website: state.website,
  });

// Salvataggi intermedi uno alla volta, sempre con tutte le risposte: se uno fallisce, il successivo recupera.
function saveProgress() {
  if (saving) {
    saveAgain = true;
    return;
  }
  saving = (async () => {
    do {
      saveAgain = false;
      const answers = collectAnswers(state.survey.questions, state.draft);
      try {
        await submitSurvey(state.token, answers, meta(false, answers));
      } catch {
        // si riprova alla prossima schermata
      }
    } while (saveAgain);
  })().finally(() => {
    saving = null;
  });
}

function setBusy(busy, label) {
  ui.form.setAttribute('aria-busy', String(busy));
  if (!ui.submit) return;
  ui.submit.setAttribute('aria-disabled', String(busy));
  ui.submit.textContent = label;
}

function showThanks() {
  storage.clear();
  storage.markSent();
  state.mode = 'done';
  document.title = 'Grazie';
  ui.progress.hidden = true;
  const title = h('h1', { class: 'title', tabindex: '-1' }, 'Grazie!');
  mount([title, h('p', { class: 'text' }, state.survey.thanks || THANKS)], { band: [h('span', { class: 'band-mark' }, icon('check', 40))], enter: 'next' });
  ui.nav.textContent = '';
  window.scrollTo(0, 0);
  title.focus({ preventScroll: true });
}

async function finish() {
  const options = { recontact: state.recontact };
  const invalid = firstInvalidScreen(state.screens, state.draft, options);
  if (invalid) {
    if (invalid.index !== state.index) {
      state.index = invalid.index;
      storage.write();
      showQuestions();
    }
    showErrors(invalid.errors);
    return;
  }
  const answers = collectAnswers(state.survey.questions, state.draft);
  if (!Object.keys(answers).length) {
    setAlert(MESSAGES.empty);
    return;
  }
  if (remindSkipped()) return;
  state.sending = true;
  setBusy(true, 'Invio in corso…');
  setAlert('');
  let result;
  try {
    await saving;
    result = await submitSurvey(state.token, answers, meta(true, answers));
  } catch (error) {
    state.sending = false;
    setBusy(false, 'Riprova');
    setAlert(error instanceof PublicSurveyError ? error.message : SEND_ERROR);
    return;
  }
  state.sending = false;
  setBusy(false, 'Invia');
  // «Già inviate» arriva quando il primo invio era passato ma la risposta si è persa per strada.
  if (result?.status === 'ok' || ALREADY_SENT.test(asText(result?.reason))) {
    showThanks();
    return;
  }
  const reason = asText(result?.reason) || SEND_ERROR;
  const target = result?.question ? screenOf(state.screens, result.question) : -1;
  if (target < 0) {
    setAlert(reason);
    return;
  }
  if (target !== state.index) {
    state.index = target;
    storage.write();
    showQuestions();
  }
  showErrors([{ id: result.question, message: reason }]);
}

// Una volta sola, prima dell'invio: le domande facoltative saltate, con il modo di tornarci. Non blocca nulla.
function remindSkipped() {
  if (state.reminded) return false;
  state.reminded = true;
  const skipped = unanswered(state.survey.questions, state.draft).filter((q) => q.type !== 'email');
  if (!skipped.length) return false;
  const title = h('p', { class: 'reminder-title', tabindex: '-1' }, skipped.length === 1 ? 'Hai lasciato senza risposta una domanda:' : `Hai lasciato senza risposta ${skipped.length} domande:`);
  const review = h('button', { type: 'button', class: 'btn btn-quiet' }, skipped.length === 1 ? 'Rispondi' : 'Rispondi a quelle saltate');
  review.addEventListener('click', () => {
    state.index = screenOf(state.screens, skipped[0].id);
    storage.write();
    showQuestions({ enter: 'back' });
  });
  const box = h(
    'section',
    { class: 'reminder', 'aria-label': 'Domande senza risposta' },
    title,
    h('ul', { class: 'reminder-list' }, skipped.slice(0, 5).map((q) => h('li', {}, q.label))),
    skipped.length > 5 ? h('p', { class: 'reminder-more' }, `e altre ${skipped.length - 5}.`) : null,
    h('p', { class: 'reminder-text' }, 'Non sono obbligatorie: se preferisci, invia pure così.'),
    review,
  );
  ui.screen.append(box);
  if (ui.submit) ui.submit.textContent = 'Invia comunque';
  title.focus({ preventScroll: true });
  ui.nav.scrollIntoView({ block: 'nearest' });
  return true;
}

function advance() {
  const errors = validateScreen(state.screens[state.index], state.draft, { recontact: state.recontact });
  if (errors.length) {
    showErrors(errors);
    return;
  }
  if (state.index === state.screens.length - 1) {
    finish();
    return;
  }
  state.index += 1;
  storage.write();
  saveProgress();
  showQuestions({ enter: 'next' });
}

function onSubmit(event) {
  event.preventDefault();
  if (state.sending) return;
  if (state.mode === 'intro') begin();
  else if (state.mode === 'ritorno') {
    storage.write();
    showQuestions({ enter: 'next' });
  } else if (state.mode === 'question') advance();
}

async function load() {
  state.token = tokenFromHash(location.hash);
  if (!state.token) {
    showNotFound();
    return;
  }
  let data;
  try {
    data = await loadPublicSurvey(state.token);
  } catch (error) {
    const text = error instanceof PublicSurveyError ? error.message : 'Questionario non disponibile. Riprova più tardi.';
    showMessage('Non riesco ad aprire il questionario', text, () => {
      mount([h('p', { class: 'loading', role: 'status' }, 'Caricamento…')]);
      ui.nav.textContent = '';
      load();
    });
    return;
  }
  if (data?.status === 'chiuso') {
    showClosed();
    return;
  }
  if (data?.status !== 'aperto') {
    showNotFound();
    return;
  }
  state.survey = normalizeSurvey(data);
  state.screens = buildScreens(state.survey);
  applyAppearance(state.survey.appearance);
  if (!state.screens.length) {
    showClosed();
    return;
  }
  document.title = state.survey.title;
  const sent = storage.sentOn();
  if (sent) {
    showAlreadySent(sent);
    return;
  }
  // Con una compilazione salvata non è una nuova visita: dopo un ricaricamento si riprende subito dalla stessa schermata,
  // tornando più tardi si passa prima dal saluto con le domande che mancano.
  const saved = readStored(storage.read(), state.screens.length);
  if (saved) {
    Object.assign(state, saved, { startedAt: saved.startedAt ?? Date.now() });
    if (storage.inThisTab()) showQuestions({ focus: false });
    else showWelcomeBack();
    return;
  }
  recordSurveyEvent(state.token, 'view');
  showIntro();
}

const root = document.getElementById('survey');
if (root) {
  buildShell(root);
  load();
}
