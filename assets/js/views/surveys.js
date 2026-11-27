import { busy, confirmDialog, h, mount, openModal, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { snapshotOf } from '../lib/diff.js';
import { LIMITS, isUuid } from '../lib/validate.js';
import { api } from '../lib/api.js';
import { tx } from '../i18n/index.js';
import { KINDS, newSurveyToken, statusLabel } from '../schema.js';
import { canWrite, createItem, getItem, ideas, itemsOf, on, state, trackPresence } from '../store.js';
import { navigate, setLeaveGuard } from '../router.js';
import { estimateMinutes, minutesLabel } from '../public/survey-time.js';
import { previewPage, questionWarnings, surveyWarnings } from '../survey-checks.js';
import { surveyTemplate } from '../survey-template.js';
import { printSurvey } from '../survey-print.js';
import { saveWithMerge } from './merge.js';
import { archiveWithConfirm } from './actions.js';
import { conceptButton } from './concept-help.js';
import { questionsPanel, settingsPanel } from './survey-editor.js';
import { resultsPanel } from './survey-results.js';
import { button, emptyState, errorBox, itemLink, metaLine, onlineHere, pageHeader, statusPill, tabs } from './components.js';

const t = tx.surveyEditor;

// Valori salvati e indirizzi delle pagine: restano in italiano in ogni lingua.
const TAB_KEYS = ['domande', 'aspetto', 'condividi', 'risposte']; // i18n-ignore
const [QUESTIONS_TAB, LOOK_TAB, SHARE_TAB] = TAB_KEYS;
const SECTION = 'sezione'; // i18n-ignore
const DRAFT = 'bozza'; // i18n-ignore
const OPEN = 'aperto'; // i18n-ignore
const BLOCKING = ['parentesi', 'intro', 'privacy', 'nessuna']; // i18n-ignore
const CONCEPT = 'questionario'; // i18n-ignore
const PATHS = {
  list: '/questionari', // i18n-ignore
  filtered: (ideaId) => `/questionari?idea=${ideaId}`, // i18n-ignore
  survey: (id) => `/questionario/${id}`, // i18n-ignore
  ideaTab: (ideaId) => `/idea/${ideaId}/questionari`, // i18n-ignore
  trash: '#/cestino', // i18n-ignore
  history: (id) => `#/storico/${id}`, // i18n-ignore
  comments: (id) => `#/elemento/${id}/commenti`, // i18n-ignore
};

const TABS = TAB_KEYS.map((key) => [key, t.page.tabs[key]]);

// Link per chi risponde: la pagina pubblica accanto al sito, con il codice dopo #, nella copia con l'anteprima del colore scelto.
export function shareLink(token, accent) {
  return `${new URL(previewPage(accent), location.href).href}#${token}`;
}

const askedCount = (survey) => (survey.data.questions || []).filter((q) => q.type !== SECTION).length;

export function warningCount(data) {
  return surveyWarnings(data).length + (data.questions || []).reduce((sum, q) => sum + questionWarnings(q).length, 0);
}

// Se la copia non riesce il link si mostra selezionato, anche nella scheda compatta dove prima non c'era.
async function copyLink(url, input, box) {
  try {
    await navigator.clipboard.writeText(url);
    toast(t.link.copied, { type: 'success' });
  } catch {
    if (!input.isConnected) box.prepend(input);
    input.focus();
    input.select();
    toast(t.link.copyFailed, { type: 'error' });
  }
}

function linkBox(item, { compact = false } = {}) {
  const url = shareLink(item.data.token, item.data.appearance?.accent);
  const input = h('input', { class: 'input sv-link-input', type: 'text', value: url, readOnly: true, 'aria-label': t.link.label, onFocus: (e) => e.target.select() });
  const box = h(
    'div',
    { class: ['sv-link', compact && 'is-compact'] },
    compact ? null : input,
    h('button', { type: 'button', class: 'btn btn-small', onClick: () => copyLink(url, input, box) }, icon('copy', 14), h('span', null, compact ? t.link.copyLink : tx.common.actions.copy)),
    h('a', { class: 'btn btn-small btn-ghost', href: url, target: '_blank', rel: 'noopener noreferrer' }, tx.common.actions.open),
  );
  return box;
}

// Nuovo questionario dal modello: titolo, idea (se non è già scelta) ed esperimento facoltativo.
export function openNewSurvey({ ideaId = null } = {}) {
  const texts = t.newSurvey;
  const fixed = ideaId && getItem(ideaId)?.kind === 'idea' ? ideaId : null;
  let chosen = fixed || '';
  const defaultTitle = (id) => (id ? texts.defaultTitle(getItem(id)?.title || '').slice(0, LIMITS.title) : '');
  const title = h('input', { class: 'input', type: 'text', maxlength: LIMITS.title, value: defaultTitle(chosen), 'aria-label': texts.titleLabel });
  const experiment = h('select', { class: 'input', 'aria-label': texts.experiment });
  const fillExperiments = () =>
    mount(experiment, h('option', { value: '' }, texts.noExperiment), chosen ? itemsOf('experiment', { ideaId: chosen }).map((x) => h('option', { value: x.id }, x.title)) : null);
  const ideaSelect = fixed
    ? null
    : h(
        'select',
        {
          class: 'input',
          'aria-label': texts.idea,
          onChange: (e) => {
            const before = defaultTitle(chosen);
            chosen = e.target.value;
            if (!title.value.trim() || title.value === before) title.value = defaultTitle(chosen);
            fillExperiments();
          },
        },
        h('option', { value: '' }, texts.chooseIdea),
        ideas().map((i) => h('option', { value: i.id }, i.title)),
      );
  fillExperiments();
  const error = h('div');
  let creating = false;
  const label = (text, control) => h('label', { class: 'field' }, h('span', { class: 'field-label' }, text), control);
  openModal({
    title: texts.title,
    body: h(
      'div',
      { class: 'stack' },
      h('p', { class: 'muted small' }, texts.help),
      label(texts.titleLabel, title),
      ideaSelect ? label(texts.idea, ideaSelect) : null,
      label(texts.experimentOptional, experiment),
      error,
    ),
    actions: [
      { label: tx.common.actions.cancel, value: false },
      {
        label: texts.create,
        kind: 'primary',
        onClick: async () => {
          if (creating) return true;
          creating = true;
          mount(error);
          try {
            const data = surveyTemplate();
            if (experiment.value) data.experiment_id = experiment.value;
            const row = await createItem('survey', { title: title.value, status: DRAFT, idea_id: chosen || null, data }, texts.message);
            toast(texts.created, { type: 'success' });
            navigate(PATHS.survey(row.id));
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
    showIdea ? h('p', { class: 'small' }, t.list.ideaOf, ' ', itemLink(getItem(survey.idea_id))) : null,
    h(
      'p',
      { class: 'muted small' },
      `${t.list.questions(askedCount(survey))} · ${minutesLabel(estimateMinutes(survey.data))}`,
      warnings ? h('span', { class: 'badge badge-warn' }, t.list.warnings(warnings)) : null,
    ),
    count !== undefined ? h('p', { class: 'small sv-count' }, count) : null,
    survey.data.token && survey.status === OPEN
      ? linkBox(survey, { compact: true })
      : h('p', { class: 'muted small' }, survey.data.token ? t.list.linkClosed : t.list.linkLater),
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
      h('h2', null, t.list.title, conceptButton(CONCEPT)),
      writable ? button(t.list.newSurvey, { kind: surveys.length ? 'ghost' : 'primary', iconName: 'plus', onClick: () => openNewSurvey({ ideaId: idea.id }) }) : null,
    ),
    h('p', { class: 'muted' }, t.list.ideaHelp),
    surveys.length ? h('div', { class: 'cards' }, surveys.map((s) => surveyCard(s))) : emptyState(t.list.emptyIdea),
  );
}

export function surveysView(outlet, params, query) {
  const ideaId = isUuid(query.get('idea')) ? query.get('idea') : null;
  const writable = canWrite();
  const counts = new Map();
  let alive = true;

  const countText = (survey) => {
    if (!survey.data.token) return t.list.neverOpened;
    const value = counts.get(survey.id);
    if (value === undefined) return t.list.completed('…');
    if (value === null) return t.list.countUnavailable;
    return t.list.completed(value);
  };

  const render = () => {
    const all = itemsOf('survey').sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const list = ideaId ? all.filter((s) => s.idea_id === ideaId) : all;
    mount(
      outlet,
      pageHeader({
        title: t.list.title,
        subtitle: t.list.subtitle,
        actions: [writable ? button(t.list.newSurvey, { kind: 'primary', iconName: 'plus', onClick: () => openNewSurvey({ ideaId }) }) : null],
      }),
      h(
        'div',
        { class: 'filters' },
        h(
          'label',
          { class: 'field field-inline' },
          h('span', { class: 'field-label' }, t.list.idea),
          h(
            'select',
            { class: 'input', onChange: (e) => navigate(e.target.value ? PATHS.filtered(e.target.value) : PATHS.list, { replace: true }) },
            h('option', { value: '' }, t.list.allIdeas),
            ideas().map((i) => h('option', { value: i.id, selected: i.id === ideaId }, i.title)),
          ),
        ),
      ),
      list.length
        ? h('div', { class: 'cards' }, list.map((s) => surveyCard(s, { showIdea: true, count: countText(s) })))
        : emptyState(all.length ? t.list.emptyFiltered : t.list.empty),
    );
  };

  // Una richiesta per questionario, anche per quelli aperti mentre l'elenco è sullo schermo.
  const asked = new Set();
  const fetchCounts = () => {
    const pending = itemsOf('survey').filter((s) => s.data.token && !asked.has(s.id));
    if (!pending.length) return;
    pending.forEach((s) => asked.add(s.id));
    Promise.all(
      pending.map((s) =>
        api.surveyFunnel(s.id).then(
          (f) => counts.set(s.id, f.completed),
          () => counts.set(s.id, null),
        ),
      ),
    ).then(() => alive && render());
  };

  render();
  fetchCounts();
  const off = on('item', ({ item }) => {
    if (item.kind !== 'survey' && item.kind !== 'idea') return;
    render();
    fetchCounts();
  });
  return () => {
    alive = false;
    off();
  };
}

// Condividi: stato, link pubblico e cambio del link. Chi non può scrivere vede tutto senza poter cambiare.
function sharePanel(item, { writable, onSaved }) {
  const texts = t.share;
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
    if (status === OPEN) {
      const blocking = surveyWarnings(item.data).filter((w) => BLOCKING.includes(w.code));
      if (blocking.length) {
        const ok = await confirmDialog(texts.stillToFix(blocking.map((w) => w.text.replace(/\.$/, '').toLowerCase())), { title: texts.openAnywayTitle, okLabel: texts.openAnyway });
        if (!ok) return;
      }
    }
    await save((s) => {
      s.status = status;
      if (status === OPEN && !s.data.token) s.data.token = newSurveyToken();
      return s;
    }, texts.statusChange(statusLabel('survey', item.status), statusLabel('survey', status)));
  };

  const changeLink = async () => {
    const ok = await confirmDialog(texts.changeLinkText, { title: texts.changeLinkTitle, okLabel: texts.changeLink, danger: true });
    if (!ok) return;
    await save((s) => {
      s.data.token = newSurveyToken();
      return s;
    }, texts.linkChanged);
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
      h('h2', null, texts.status),
      writable ? h('div', { class: 'toolbar toolbar-wrap', role: 'group', 'aria-label': texts.statusGroup }, statusButtons) : h('p', null, statusPill('survey', item.status)),
      h('p', { class: 'muted small' }, texts.statusHelp[item.status] || ''),
    ),
    h(
      'section',
      { class: 'card stack' },
      h('h2', null, texts.publicLink),
      item.data.token
        ? [
            linkBox(item),
            item.status === OPEN
              ? h('p', { class: 'small' }, texts.openHelp)
              : h('p', { class: 'banner banner-warn sv-closed' }, texts.closed(statusLabel('survey', item.status))),
            writable
              ? h(
                  'div',
                  null,
                  button(texts.changeLink, { iconName: 'restore', onClick: changeLink }),
                  h('p', { class: 'muted small' }, texts.changeLinkHelp),
                )
              : null,
          ]
        : h('p', { class: 'muted' }, texts.noLinkYet),
    ),
  );
  panel.el = el;
  return panel;
}

const panelGuard = () => confirmDialog(t.page.leaveText, { title: t.page.leaveTitle, okLabel: t.page.leave, danger: true });

export function surveyView(outlet, params) {
  const texts = t.page;
  const tab = TAB_KEYS.includes(params.tab) ? params.tab : QUESTIONS_TAB;
  const expanded = new Set();
  let panel = null;
  const hereHost = h('span', { class: 'here-host' });
  const renderHere = () => mount(hereHost, onlineHere(PATHS.survey(params.id)) || '');

  const render = () => {
    const item = getItem(params.id);
    if (!item || item.kind !== 'survey') {
      mount(outlet, errorBox({ message: texts.notFound }));
      panel = null;
      return;
    }
    const idea = getItem(item.idea_id);
    const writable = canWrite() && !item.deleted_at && !idea?.deleted_at;
    const onSaved = () => render();
    if (tab === QUESTIONS_TAB) panel = questionsPanel(item, { writable, expanded, onSaved });
    else if (tab === LOOK_TAB) panel = settingsPanel(item, { writable, onSaved });
    else if (tab === SHARE_TAB) panel = sharePanel(item, { writable, onSaved });
    else panel = resultsPanel(item, { writable });
    const comments = state.commentCounts.get(item.id) || 0;
    const backTo = idea ? PATHS.ideaTab(idea.id) : PATHS.list;
    mount(
      outlet,
      item.deleted_at ? h('div', { class: 'banner banner-warn' }, texts.inTrash, ' ', h('a', { href: PATHS.trash }, texts.goToTrash)) : null,
      pageHeader({
        back: { href: `#${backTo}` },
        eyebrow: h('span', { class: 'kind-eyebrow' }, texts.eyebrow, idea ? [' ', texts.eyebrowIdea, ' ', itemLink(idea)] : null),
        title: item.title,
        subtitle: h('span', { class: 'row' }, statusPill('survey', item.status), metaLine(item), hereHost),
        actions: [
          button(texts.exportPdf, {
            iconName: 'download',
            title: texts.exportPdfHint,
            onClick: () => {
              if (panel?.session?.dirty) toast(texts.pdfUnsaved, { type: 'info' });
              printSurvey(getItem(item.id) || item);
            },
          }),
          button(texts.versions, { iconName: 'history', href: PATHS.history(item.id) }),
          h('a', { class: 'btn btn-ghost', href: PATHS.comments(item.id), title: texts.commentsHint }, icon('comment', 16), h('span', null, texts.comments(comments))),
          writable ? button('', { iconName: 'trash', title: tx.common.actions.archive, onClick: () => archiveWithConfirm(item, { backTo }) }) : null,
        ],
      }),
      tabs(TABS, tab, (key) => `#${PATHS.survey(item.id)}/${key}`, { ariaLabel: texts.tabsLabel, className: 'survey-tabs' }),
      h('div', { class: 'tab-body' }, panel.el),
    );
  };

  render();
  renderHere();
  trackPresence({ route: PATHS.survey(params.id) });
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
