import { busy, confirmDialog, h, mount, openModal, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { snapshotOf } from '../lib/diff.js';
import { plural } from '../lib/format.js';
import { LIMITS, isUuid } from '../lib/validate.js';
import { api } from '../lib/api.js';
import { KINDS, newSurveyToken, statusLabel } from '../schema.js';
import { canWrite, createItem, getItem, ideas, itemsOf, on, state, trackPresence } from '../store.js';
import { navigate, setLeaveGuard } from '../router.js';
import { estimateMinutes, minutesLabel } from '../public/survey-time.js';
import { previewPage, questionWarnings, surveyWarnings } from '../survey-checks.js';
import { surveyTemplate } from '../survey-template.js';
import { saveWithMerge } from './merge.js';
import { archiveWithConfirm } from './actions.js';
import { conceptButton } from './concept-help.js';
import { questionsPanel, settingsPanel } from './survey-editor.js';
import { resultsPanel } from './survey-results.js';
import { button, emptyState, errorBox, itemLink, metaLine, onlineHere, pageHeader, statusPill, tabs } from './components.js';

const TABS = [
  ['domande', 'Domande'],
  ['aspetto', 'Aspetto e impostazioni'],
  ['condividi', 'Condividi'],
  ['risposte', 'Risposte'],
];

// Link per chi risponde: la pagina pubblica accanto al sito, con il codice dopo #, nella copia con l'anteprima del colore scelto.
export function shareLink(token, accent) {
  return `${new URL(previewPage(accent), location.href).href}#${token}`;
}

const askedCount = (survey) => (survey.data.questions || []).filter((q) => q.type !== 'sezione').length;

export function warningCount(data) {
  return surveyWarnings(data).length + (data.questions || []).reduce((sum, q) => sum + questionWarnings(q).length, 0);
}

async function copyLink(url, input) {
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copiato.', { type: 'success' });
  } catch {
    input?.select();
    toast('Copia non riuscita: il link è selezionato, copialo a mano.', { type: 'error' });
  }
}

function linkBox(item, { compact = false } = {}) {
  const url = shareLink(item.data.token, item.data.appearance?.accent);
  const input = h('input', { class: 'input sv-link-input', type: 'text', value: url, readOnly: true, 'aria-label': 'Link pubblico del questionario', onFocus: (e) => e.target.select() });
  return h(
    'div',
    { class: ['sv-link', compact && 'is-compact'] },
    compact ? null : input,
    h('button', { type: 'button', class: 'btn btn-small', onClick: () => copyLink(url, input) }, icon('copy', 14), h('span', null, compact ? 'Copia il link' : 'Copia')),
    h('a', { class: 'btn btn-small btn-ghost', href: url, target: '_blank', rel: 'noopener noreferrer' }, 'Apri'),
  );
}

// Nuovo questionario dal modello: titolo, idea (se non è già scelta) ed esperimento facoltativo.
export function openNewSurvey({ ideaId = null } = {}) {
  const fixed = ideaId && getItem(ideaId)?.kind === 'idea' ? ideaId : null;
  let chosen = fixed || '';
  const defaultTitle = (id) => (id ? `Questionario: ${getItem(id)?.title || ''}`.slice(0, LIMITS.title) : '');
  const title = h('input', { class: 'input', type: 'text', maxlength: LIMITS.title, value: defaultTitle(chosen), 'aria-label': 'Titolo' });
  const experiment = h('select', { class: 'input', 'aria-label': 'Esperimento collegato' });
  const fillExperiments = () =>
    mount(experiment, h('option', { value: '' }, 'Nessuno'), chosen ? itemsOf('experiment', { ideaId: chosen }).map((x) => h('option', { value: x.id }, x.title)) : null);
  const ideaSelect = fixed
    ? null
    : h(
        'select',
        {
          class: 'input',
          'aria-label': 'Idea',
          onChange: (e) => {
            const before = defaultTitle(chosen);
            chosen = e.target.value;
            if (!title.value.trim() || title.value === before) title.value = defaultTitle(chosen);
            fillExperiments();
          },
        },
        h('option', { value: '' }, 'Scegli l\'idea'),
        ideas().map((i) => h('option', { value: i.id }, i.title)),
      );
  fillExperiments();
  const error = h('div');
  let creating = false;
  const label = (text, control) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, text), control);
  openModal({
    title: 'Nuovo questionario',
    body: h(
      'div',
      { class: 'stack' },
      h('p', { class: 'muted small' }, 'Parte da un modello che segue il manuale: introduzione, privacy, qualche domanda di esempio da adattare ed email facoltativa. Il questionario resta in bozza finché non lo aprite.'),
      label('Titolo', title),
      ideaSelect ? label('Idea', ideaSelect) : null,
      label('Esperimento collegato (facoltativo)', experiment),
      error,
    ),
    actions: [
      { label: 'Annulla', value: false },
      {
        label: 'Crea',
        kind: 'primary',
        onClick: async () => {
          if (creating) return true;
          creating = true;
          mount(error);
          try {
            const data = surveyTemplate();
            if (experiment.value) data.experiment_id = experiment.value;
            const row = await createItem('survey', { title: title.value, status: 'bozza', idea_id: chosen || null, data }, 'Nuovo questionario dal modello');
            toast('Questionario creato dal modello: adatta le parti tra parentesi quadre.', { type: 'success' });
            navigate(`/questionario/${row.id}`);
            return false;
          } catch (e) {
            mount(error, errorBox(e));
            creating = false;
            return true;
          }
        },
      },
    ],
  });
  setTimeout(() => title.focus(), 0);
}

function surveyCard(survey, { showIdea = false, count } = {}) {
  const warnings = warningCount(survey.data);
  return h(
    'article',
    { class: 'card sv-card', dataset: { id: survey.id } },
    h('div', { class: 'card-head' }, itemLink(survey), statusPill('survey', survey.status)),
    showIdea ? h('p', { class: 'small' }, 'Idea: ', itemLink(getItem(survey.idea_id))) : null,
    h(
      'p',
      { class: 'muted small' },
      `${plural(askedCount(survey), 'domanda', 'domande')} · ${minutesLabel(estimateMinutes(survey.data))}`,
      warnings ? h('span', { class: 'badge badge-warn' }, plural(warnings, 'avviso', 'avvisi')) : null,
    ),
    count !== undefined ? h('p', { class: 'small sv-count' }, count) : null,
    survey.data.token && survey.status === 'aperto'
      ? linkBox(survey, { compact: true })
      : h('p', { class: 'muted small' }, survey.data.token ? 'Il link mostra «questionario chiuso».' : 'Il link si crea quando lo aprite.'),
  );
}

export function ideaSurveysTab(idea, writable) {
  const surveys = itemsOf('survey', { ideaId: idea.id }).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'section-head' },
      h('h2', null, 'Questionari', conceptButton('questionario')),
      writable ? button('Nuovo questionario', { kind: surveys.length ? 'ghost' : 'primary', iconName: 'plus', onClick: () => openNewSurvey({ ideaId: idea.id }) }) : null,
    ),
    h('p', { class: 'muted' }, 'Servono soprattutto a trovare persone da intervistare: poche domande su chi risponde, al massimo dieci sul problema al passato, email facoltativa. Niente soluzione, niente condizionale, niente premi.'),
    surveys.length ? h('div', { class: 'cards' }, surveys.map((s) => surveyCard(s))) : emptyState('Nessun questionario. Il primo parte da un modello già impostato secondo il manuale.'),
  );
}

export function surveysView(outlet, params, query) {
  const ideaId = isUuid(query.get('idea')) ? query.get('idea') : null;
  const writable = canWrite();
  const counts = new Map();
  let alive = true;

  const countText = (survey) => {
    if (!survey.data.token) return 'Mai aperto';
    const value = counts.get(survey.id);
    if (value === undefined) return 'Risposte complete: …';
    if (value === null) return 'Risposte non disponibili';
    return `Risposte complete: ${value}`;
  };

  const render = () => {
    const all = itemsOf('survey').sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const list = ideaId ? all.filter((s) => s.idea_id === ideaId) : all;
    mount(
      outlet,
      pageHeader({
        title: 'Questionari',
        subtitle: 'I questionari di tutte le idee, con stato, risposte complete e link da condividere.',
        actions: [writable ? button('Nuovo questionario', { kind: 'primary', iconName: 'plus', onClick: () => openNewSurvey({ ideaId }) }) : null],
      }),
      h(
        'div',
        { class: 'filters' },
        h(
          'label',
          { class: 'field field-inline' },
          h('span', { class: 'field-label' }, 'Idea'),
          h(
            'select',
            { class: 'input', onChange: (e) => navigate(e.target.value ? `/questionari?idea=${e.target.value}` : '/questionari', { replace: true }) },
            h('option', { value: '' }, 'Tutte'),
            ideas().map((i) => h('option', { value: i.id, selected: i.id === ideaId }, i.title)),
          ),
        ),
      ),
      list.length
        ? h('div', { class: 'cards' }, list.map((s) => surveyCard(s, { showIdea: true, count: countText(s) })))
        : emptyState(all.length ? 'Nessun questionario per questa idea.' : 'Nessun questionario. Si creano dalla pagina di ogni idea, nella scheda Validazione.'),
    );
  };

  render();
  const pending = itemsOf('survey').filter((s) => s.data.token && !counts.has(s.id));
  Promise.all(
    pending.map((s) =>
      api.surveyFunnel(s.id).then(
        (f) => counts.set(s.id, f.completed),
        () => counts.set(s.id, null),
      ),
    ),
  ).then(() => alive && render());
  const off = on('item', ({ item }) => {
    if (item.kind === 'survey' || item.kind === 'idea') render();
  });
  return () => {
    alive = false;
    off();
  };
}

// Condividi: stato, link pubblico e cambio del link. Chi non può scrivere vede tutto senza poter cambiare.
function sharePanel(item, { writable, onSaved }) {
  const panel = { saving: false };
  const save = async (change, message) => {
    const current = getItem(item.id) || item;
    const base = snapshotOf(current);
    const next = change(structuredClone(base));
    panel.saving = true;
    try {
      const result = await saveWithMerge(current, base, next, message);
      if (!result.cancelled) toast(message, { type: 'success' });
    } catch (error) {
      toast(error.message, { type: 'error' });
    } finally {
      panel.saving = false;
      onSaved();
    }
  };

  const setStatus = async (status) => {
    if (item.status === status) return;
    if (status === 'aperto') {
      const blocking = surveyWarnings(item.data).filter((w) => ['parentesi', 'intro', 'privacy', 'nessuna'].includes(w.code));
      if (blocking.length) {
        const ok = await confirmDialog(`Ci sono ancora cose da sistemare: ${blocking.map((w) => w.text.replace(/\.$/, '').toLowerCase()).join('; ')}. Chi apre il link le vedrà così.`, { title: 'Aprire comunque?', okLabel: 'Apri comunque' });
        if (!ok) return;
      }
    }
    await save((s) => {
      s.status = status;
      if (status === 'aperto' && !s.data.token) s.data.token = newSurveyToken();
      return s;
    }, `Stato: ${statusLabel('survey', item.status)} → ${statusLabel('survey', status)}`);
  };

  const changeLink = async () => {
    const ok = await confirmDialog('Il link attuale smetterà di funzionare: chi lo ha già ricevuto vedrà «questionario non trovato». Le risposte già arrivate restano.', { title: 'Cambiare il link?', okLabel: 'Cambia link', danger: true });
    if (!ok) return;
    await save((s) => {
      s.data.token = newSurveyToken();
      return s;
    }, 'Link cambiato');
  };

  const STATUS_HELP = {
    bozza: 'Si prepara: il link non accetta risposte.',
    aperto: 'Chi ha il link può rispondere.',
    chiuso: 'Non si accettano più risposte.',
  };
  const statusButtons = KINDS.survey.statuses.map(([value, label]) => {
    const el = h(
      'button',
      { type: 'button', class: ['btn', 'sv-status', value === item.status ? 'btn-primary' : 'btn-ghost'], 'aria-pressed': String(value === item.status), dataset: { status: value } },
      label,
    );
    el.addEventListener('click', busy(el, () => setStatus(value)));
    return el;
  });

  const el = h(
    'div',
    { class: 'stack survey-share' },
    h(
      'section',
      { class: 'card stack' },
      h('h2', null, 'Stato'),
      writable ? h('div', { class: 'toolbar toolbar-wrap', role: 'group', 'aria-label': 'Stato del questionario' }, statusButtons) : h('p', null, statusPill('survey', item.status)),
      h('p', { class: 'muted small' }, STATUS_HELP[item.status] || ''),
    ),
    h(
      'section',
      { class: 'card stack' },
      h('h2', null, 'Link pubblico'),
      item.data.token
        ? [
            linkBox(item),
            item.status === 'aperto'
              ? h('p', { class: 'small' }, 'Chi apre il link risponde senza account. Condividetelo dove si trovano le persone che cercate. L\'anteprima nei messaggi (WhatsApp, Telegram, email) prende il colore scelto in «Aspetto».')
              : h('p', { class: 'banner banner-warn sv-closed' }, `Il questionario è «${statusLabel('survey', item.status)}»: chi apre il link ora vede «questionario chiuso». Apritelo per raccogliere risposte.`),
            writable
              ? h(
                  'div',
                  null,
                  button('Cambia link', { iconName: 'restore', onClick: changeLink }),
                  h('p', { class: 'muted small' }, 'Utile se il link è finito dove non doveva: quello vecchio smette di funzionare.'),
                )
              : null,
          ]
        : h('p', { class: 'muted' }, 'Il link si crea quando aprite il questionario.'),
    ),
  );
  panel.el = el;
  return panel;
}

const panelGuard = () => confirmDialog('Hai modifiche non salvate in questa scheda.', { title: 'Uscire senza salvare?', okLabel: 'Esci', danger: true });

export function surveyView(outlet, params) {
  const tab = TABS.some(([key]) => key === params.tab) ? params.tab : 'domande';
  const expanded = new Set();
  let panel = null;
  const hereHost = h('span', { class: 'here-host' });
  const renderHere = () => mount(hereHost, onlineHere(`/questionario/${params.id}`) || '');

  const render = () => {
    const item = getItem(params.id);
    if (!item || item.kind !== 'survey') {
      mount(outlet, errorBox({ message: 'Questionario non trovato.' }));
      panel = null;
      return;
    }
    const idea = getItem(item.idea_id);
    const writable = canWrite() && !item.deleted_at && !idea?.deleted_at;
    const onSaved = () => render();
    if (tab === 'domande') panel = questionsPanel(item, { writable, expanded, onSaved });
    else if (tab === 'aspetto') panel = settingsPanel(item, { writable, onSaved });
    else if (tab === 'condividi') panel = sharePanel(item, { writable, onSaved });
    else panel = resultsPanel(item, { writable });
    const comments = state.commentCounts.get(item.id) || 0;
    mount(
      outlet,
      item.deleted_at ? h('div', { class: 'banner banner-warn' }, 'Questo questionario è nel cestino. ', h('a', { href: '#/cestino' }, 'Vai al cestino')) : null,
      pageHeader({
        back: { href: idea ? `#/idea/${idea.id}/questionari` : '#/questionari' },
        eyebrow: h('span', { class: 'kind-eyebrow' }, 'Questionario', idea ? [' di ', itemLink(idea)] : null),
        title: item.title,
        subtitle: h('span', { class: 'row' }, statusPill('survey', item.status), metaLine(item), hereHost),
        actions: [
          button('Versioni', { iconName: 'history', href: `#/storico/${item.id}` }),
          h('a', { class: 'btn btn-ghost', href: `#/elemento/${item.id}/commenti`, title: 'Commenti su questo questionario' }, icon('comment', 16), h('span', null, comments ? `Commenti (${comments})` : 'Commenti')),
          writable ? button('', { iconName: 'trash', title: 'Archivia', onClick: () => archiveWithConfirm(item, { backTo: idea ? `/idea/${idea.id}/questionari` : '/questionari' }) }) : null,
        ],
      }),
      tabs(TABS, tab, (key) => `#/questionario/${item.id}/${key}`, { ariaLabel: 'Schede del questionario', className: 'survey-tabs' }),
      h('div', { class: 'tab-body' }, panel.el),
    );
  };

  render();
  renderHere();
  trackPresence({ route: `/questionario/${params.id}` });
  const dirty = () => Boolean(panel?.session?.dirty);
  setLeaveGuard(async () => !dirty() || panelGuard());
  const onKey = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && panel?.session) {
      event.preventDefault();
      if (!panel.session.saveButton.disabled) panel.session.saveButton.click();
    }
  };
  const onBeforeUnload = (event) => {
    if (dirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', onBeforeUnload);
  const offs = [
    on('item', ({ item }) => {
      if (item.id !== params.id && item.id !== getItem(params.id)?.idea_id) return;
      if (panel?.session?.saving || panel?.saving) return;
      if (dirty()) {
        if (item.id === params.id) panel.session.notifyRemote(item);
        return;
      }
      render();
    }),
    on('presence', renderHere),
  ];
  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('beforeunload', onBeforeUnload);
    offs.forEach((off) => off());
  };
}
