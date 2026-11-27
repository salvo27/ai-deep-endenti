import { autoGrow, busy, confirmDialog, h, mount, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { deepEqual, snapshotOf } from '../lib/diff.js';
import { LIMITS } from '../lib/validate.js';
import { truncate } from '../lib/format.js';
import { tx } from '../i18n/index.js';
import { QUESTION_ROLES, QUESTION_TYPES, SURVEY_ACCENT, SURVEY_LAYOUTS, SURVEY_LIMITS, SURVEY_PROGRESS, SURVEY_THEMES, sanitizeSnapshot } from '../schema.js';
import { itemsOf, memberName } from '../store.js';
import { estimateMinutes, minutesLabel } from '../public/survey-time.js';
import { accentTokens } from '../public/survey-colors.js';
import { ACCENT_PALETTE, accentCheck, countByRole, fmtRatio, hasBrackets, questionWarnings, surveyWarnings } from '../survey-checks.js';
import { SCALE_PRESETS, convertQuestion, duplicateQuestion, newQuestion, newRowId, presetLabels, scaleFromLabels } from '../survey-template.js';
import { saveWithMerge } from './merge.js';
import { surveyCoverUrl, uploadSurveyCover } from '../survey-images.js';

const t = tx.surveyEditor;
const TYPE_LABELS = Object.fromEntries(QUESTION_TYPES);

// Valori salvati: restano in italiano in ogni lingua.
const SECTION = 'sezione'; // i18n-ignore
const RESPONDENT = 'persona'; // i18n-ignore
const ONE_PER_SCREEN = 'una'; // i18n-ignore

// Avvisi con la forma migliore accanto: non bloccano mai il salvataggio.
export function warningList(warnings, { compact = false } = {}) {
  if (!warnings.length) return null;
  return h(
    'ul',
    { class: ['sv-warnings', compact && 'is-compact'] },
    warnings.map((w) => h('li', { class: 'sv-warning', dataset: { code: w.code } }, icon('flag', 14), h('div', null, h('span', null, w.text), w.hint ? h('span', { class: 'sv-hint' }, w.hint) : null))),
  );
}

// Copia di lavoro del questionario con barra di salvataggio: il salvataggio unisce le modifiche altrui come nell'editor.
function editSession(item, { message, onSaved }) {
  const base = snapshotOf(item);
  const working = structuredClone(base);
  const status = h('span', { class: 'save-status muted small', role: 'status' });
  const note = h('input', { class: 'input', type: 'text', maxlength: LIMITS.message, placeholder: t.editor.notePlaceholder, 'aria-label': t.editor.noteLabel });
  const saveButton = h('button', { type: 'button', class: 'btn btn-primary', disabled: true }, icon('commit', 16), h('span', null, tx.common.actions.save));
  const session = { working, dirty: false, saving: false, saveButton };
  session.changed = () => {
    session.dirty = !deepEqual(sanitizeSnapshot('survey', working), sanitizeSnapshot('survey', base));
    saveButton.disabled = !session.dirty;
    status.textContent = session.dirty ? t.editor.unsaved : '';
  };
  saveButton.addEventListener(
    'click',
    busy(saveButton, async () => {
      session.saving = true;
      try {
        const result = await saveWithMerge(item, base, sanitizeSnapshot('survey', working), note.value.trim() || message);
        if (result.cancelled) return;
        session.dirty = false;
        toast(t.editor.saved, { type: 'success' });
        onSaved?.();
      } catch (error) {
        toast(error.message, { type: 'error' });
      } finally {
        session.saving = false;
      }
    }),
  );
  session.bar = h('footer', { class: 'save-bar' }, status, note, saveButton);
  session.banner = h('div', { class: 'banner', role: 'status', hidden: true });
  session.notifyRemote = (theirs) => {
    session.banner.hidden = false;
    mount(session.banner, t.editor.remoteSaved(memberName(theirs.updated_by)));
  };
  return session;
}

const field = (label, control, { wide = false, help } = {}) =>
  h('label', { class: ['field', wide && 'is-wide'] }, h('span', { class: 'field-label' }, label), control, help ? h('span', { class: 'field-help' }, help) : null);

const checkbox = (label, checked, onChange, extra = {}) =>
  h('label', { class: 'check' }, h('input', { type: 'checkbox', checked, onChange: (e) => onChange(e.target.checked), ...extra }), label);

const toolButton = (label, iconName, onClick, { disabled = false, action, cls } = {}) =>
  h('button', { type: 'button', class: ['icon-btn', cls], 'aria-label': label, title: label, disabled, onClick, dataset: action ? { action } : undefined }, icon(iconName, 16));

function textCard(title, control, hint, extra = null) {
  return h('section', { class: 'card sq-text' }, h('div', { class: 'section-head' }, h('h2', null, title), extra), control, hint ? h('p', { class: 'field-help' }, hint) : null);
}

const readOnly = (content) => h('fieldset', { class: 'sv-readonly', disabled: true }, h('legend', { class: 'muted small' }, t.editor.readOnly), content);

export function questionsPanel(item, { writable, expanded, onSaved }) {
  const texts = t.questions;
  const session = editSession(item, { message: texts.message, onSaved });
  const data = session.working.data;
  if (!Array.isArray(data.questions)) data.questions = [];
  const summary = h('div', { class: 'sq-summary', 'aria-live': 'polite' });
  const list = h('div', { class: 'sq-list' });
  const warnHosts = new Map();
  const titles = new Map();
  const privacyBadge = h('span', { class: 'badge badge-warn' }, texts.toComplete);

  const hasEmail = () => data.questions.some((q) => q.type === 'email');

  function renderSummary() {
    const asked = data.questions.filter((q) => q.type !== SECTION);
    const open = asked.filter((q) => q.type === 'breve' || q.type === 'lunga').length;
    mount(
      summary,
      h(
        'p',
        { class: 'sq-counts' },
        h('strong', null, t.list.questions(asked.length)),
        ` · ${texts.aboutRespondent(countByRole(data.questions, RESPONDENT))} · ${texts.aboutProblem(countByRole(data.questions, 'problema'))} · ${texts.open(open)} · `,
        h('strong', { class: 'sq-time' }, texts.estimated(minutesLabel(estimateMinutes(data)))),
      ),
      warningList(surveyWarnings(data)),
    );
  }

  function refresh() {
    session.changed();
    renderSummary();
    privacyBadge.hidden = !hasBrackets(data.privacy);
    renderAddBar();
    for (const q of data.questions) {
      const host = warnHosts.get(q.id);
      if (host) mount(host, warningList(questionWarnings(q), { compact: true }));
    }
  }

  function rerender(focusKey) {
    renderList();
    refresh();
    if (focusKey) list.querySelector(`[data-focus="${focusKey}"]`)?.focus();
  }

  function move(index, delta, action) {
    const target = index + delta;
    if (target < 0 || target >= data.questions.length) return;
    const [q] = data.questions.splice(index, 1);
    data.questions.splice(target, 0, q);
    renderList();
    refresh();
    const card = list.querySelector(`[data-id="${q.id}"]`);
    const button = card?.querySelector(`[data-action="${action}"]`);
    (button && !button.disabled ? button : card?.querySelector('[data-action="up"]:not(:disabled), [data-action="down"]:not(:disabled)'))?.focus();
  }

  async function remove(q) {
    const ok = await confirmDialog(texts.removeText(truncate(q.label || texts.untitled, 80)), { title: texts.removeTitle, okLabel: tx.common.actions.delete, danger: true });
    if (!ok) return;
    data.questions = data.questions.filter((x) => x !== q);
    expanded.delete(q.id);
    rerender();
    list.querySelector('[data-action="toggle"]')?.focus();
  }

  // La voce con il campo di testo: nome (vuoto vale «Altro») ed esempio dentro il campo.
  function otherFields(q) {
    const text = (key, label, placeholder, focus) =>
      h(
        'label',
        { class: 'field' },
        h('span', { class: 'field-label' }, label),
        h('input', {
          class: 'input',
          type: 'text',
          value: q[key] || '',
          maxlength: SURVEY_LIMITS.option,
          placeholder,
          dataset: focus ? { focus } : undefined,
          onInput: (e) => {
            if (e.target.value.trim()) q[key] = e.target.value;
            else delete q[key];
            refresh();
          },
        }),
      );
    return h(
      'div',
      { class: 'sq-other row' },
      text('other_label', texts.otherName, t.other, `other-${q.id}`),
      text('other_placeholder', texts.otherExample, texts.otherExamplePlaceholder),
    );
  }

  function optionsEditor(q) {
    const rows = q.options.map((o, i) =>
      h(
        'div',
        { class: 'sq-option' },
        h('input', {
          class: 'input',
          type: 'text',
          value: o.label,
          maxlength: SURVEY_LIMITS.option,
          'aria-label': texts.option(i + 1),
          dataset: { focus: `opt-${o.id}` },
          onInput: (e) => {
            o.label = e.target.value;
            refresh();
          },
        }),
        toolButton(texts.optionUp(i + 1), 'chevron', () => {
          [q.options[i - 1], q.options[i]] = [q.options[i], q.options[i - 1]];
          rerender(`opt-${o.id}`);
        }, { disabled: i === 0, cls: 'is-up' }),
        toolButton(texts.optionDown(i + 1), 'chevron', () => {
          [q.options[i + 1], q.options[i]] = [q.options[i], q.options[i + 1]];
          rerender(`opt-${o.id}`);
        }, { disabled: i === q.options.length - 1 }),
        toolButton(texts.optionRemove(i + 1), 'close', () => {
          q.options.splice(i, 1);
          rerender(`add-opt-${q.id}`);
        }),
      ),
    );
    return h(
      'div',
      { class: 'field is-wide' },
      h('span', { class: 'field-label' }, texts.options),
      h('div', { class: 'sq-options' }, rows),
      h(
        'div',
        { class: 'row' },
        h('button', {
          type: 'button',
          class: 'btn btn-small btn-ghost',
          disabled: q.options.length >= SURVEY_LIMITS.options,
          dataset: { focus: `add-opt-${q.id}` },
          onClick: () => {
            const o = { id: newRowId('o'), label: '' };
            q.options.push(o);
            rerender(`opt-${o.id}`);
          },
        }, icon('plus', 14), texts.addOption),
      ),
      checkbox(texts.allowOther, q.allow_other, (v) => {
        q.allow_other = v;
        rerender(`other-${q.id}`);
      }),
      q.allow_other ? otherFields(q) : null,
      checkbox(texts.preferNot, q.prefer_not, (v) => {
        q.prefer_not = v;
        refresh();
      }),
      h('span', { class: 'field-help' }, texts.preferNotHelp),
    );
  }

  function scaleEditor(q) {
    const points = q.scale?.points === 7 ? 7 : 5;
    const labels = Array.from({ length: points }, (_, i) => q.scale?.labels?.[i] ?? '');
    const setLabels = (next) => {
      q.scale = scaleFromLabels(next);
    };
    return h(
      'div',
      { class: 'field is-wide sq-scale' },
      h(
        'div',
        { class: 'form-grid' },
        field(
          texts.points,
          h(
            'select',
            {
              class: 'input',
              dataset: { focus: `points-${q.id}` },
              onChange: (e) => {
                const n = Number(e.target.value);
                const preset = SCALE_PRESETS.find(([key]) => deepEqual(presetLabels(key, points), labels));
                setLabels(preset ? presetLabels(preset[0], n) : Array.from({ length: n }, (_, i) => labels[i] ?? ''));
                rerender(`points-${q.id}`);
              },
            },
            [5, 7].map((n) => h('option', { value: n, selected: n === points }, texts.pointsOption(n))),
          ),
          { help: texts.pointsHelp },
        ),
        field(
          texts.presets,
          h(
            'select',
            {
              class: 'input',
              dataset: { focus: `preset-${q.id}` },
              onChange: (e) => {
                if (!e.target.value) return;
                setLabels(presetLabels(e.target.value, points));
                rerender(`preset-${q.id}`);
              },
            },
            h('option', { value: '' }, texts.choosePreset),
            SCALE_PRESETS.map(([key, name, sets]) => h('option', { value: key, selected: deepEqual(sets[points], labels) }, `${name}: ${sets[points].join(', ')}`)),
          ),
        ),
      ),
      h('span', { class: 'field-label' }, texts.pointLabels),
      h(
        'ol',
        { class: 'sq-scale-labels' },
        labels.map((label, i) =>
          h(
            'li',
            null,
            h('input', {
              class: 'input',
              type: 'text',
              value: label,
              maxlength: SURVEY_LIMITS.scaleLabel,
              'aria-label': texts.pointLabel(i + 1),
              onInput: (e) => {
                const next = [...labels];
                next[i] = e.target.value;
                labels[i] = e.target.value;
                setLabels(next);
                refresh();
              },
            }),
          ),
        ),
      ),
    );
  }

  function numberEditor(q) {
    const bound = (key, label) =>
      field(label, h('input', {
        class: 'input',
        type: 'number',
        step: 1,
        inputmode: 'numeric',
        value: q.number?.[key] ?? '',
        onInput: (e) => {
          const n = Number(e.target.value);
          q.number = { ...(q.number || {}) };
          if (e.target.value === '' || !Number.isInteger(n)) delete q.number[key];
          else q.number[key] = n;
          refresh();
        },
      }));
    return h('div', { class: 'form-grid is-wide' }, bound('min', texts.min), bound('max', texts.max));
  }

  function questionBody(q) {
    const isSection = q.type === SECTION;
    const typeSelect = h(
      'select',
      {
        class: 'input',
        dataset: { focus: `type-${q.id}` },
        onChange: (e) => {
          const index = data.questions.indexOf(q);
          data.questions[index] = convertQuestion(q, e.target.value);
          rerender(`type-${q.id}`);
        },
      },
      QUESTION_TYPES.map(([value, label]) => h('option', { value, selected: value === q.type, disabled: value === 'email' && q.type !== 'email' && hasEmail() }, label)),
    );
    const specific =
      q.type === 'scelta' || q.type === 'scelte'
        ? optionsEditor(q)
        : q.type === 'scala'
        ? scaleEditor(q)
        : q.type === 'numero'
        ? numberEditor(q)
        : q.type === 'email'
        ? h('p', { class: 'field-help is-wide' }, texts.emailHelp)
        : isSection
        ? h('p', { class: 'field-help is-wide' }, texts.sectionHelp)
        : null;
    return h(
      'div',
      { class: 'sq-body form-grid' },
      field(isSection ? texts.sectionTitle : texts.questionText, h('input', {
        class: 'input',
        type: 'text',
        value: q.label,
        maxlength: SURVEY_LIMITS.label,
        dataset: { focus: `label-${q.id}` },
        onInput: (e) => {
          q.label = e.target.value;
          titles.get(q.id).textContent = q.label.trim() || texts.untitled;
          refresh();
        },
      }), { wide: true }),
      field(texts.explanation, autoGrow(h('textarea', {
        class: 'input',
        rows: 2,
        value: q.help || '',
        maxlength: SURVEY_LIMITS.help,
        onInput: (e) => {
          if (e.target.value.trim()) q.help = e.target.value;
          else delete q.help;
          refresh();
        },
      })), { wide: true }),
      field(texts.type, typeSelect),
      isSection
        ? null
        : field(texts.topic, h(
            'select',
            {
              class: 'input',
              dataset: { focus: `role-${q.id}` },
              onChange: (e) => {
                q.role = e.target.value;
                rerender(`role-${q.id}`);
              },
            },
            QUESTION_ROLES.map(([value, label]) => h('option', { value, selected: value === q.role }, label)),
          ), { help: texts.topicHelp }),
      isSection
        ? null
        : h('div', { class: 'field is-wide' }, checkbox(texts.required, q.required === true, (v) => {
            q.required = v;
            rerender(`req-${q.id}`);
          }, { dataset: { focus: `req-${q.id}` } }), h('span', { class: 'field-help' }, texts.requiredHelp)),
      specific,
    );
  }

  function questionCard(q, index, number) {
    const isSection = q.type === SECTION;
    const open = !writable || expanded.has(q.id);
    const title = h('span', { class: 'sq-label' }, q.label.trim() || texts.untitled);
    titles.set(q.id, title);
    const warnHost = h('div', { class: 'sq-warn' });
    warnHosts.set(q.id, warnHost);
    const meta = isSection
      ? null
      : h(
          'span',
          { class: 'sq-meta' },
          TYPE_LABELS[q.type],
          ` · ${texts.roles[q.role] || texts.roles.altro}`,
          q.required ? h('span', { class: 'badge badge-soft' }, texts.requiredBadge) : null,
        );
    const where = isSection ? texts.sectionRef(truncate(q.label, 40)) : texts.questionRef(number);
    const tools = writable
      ? h(
          'div',
          { class: 'sq-tools' },
          h('button', {
            type: 'button',
            class: 'btn btn-small btn-ghost',
            'aria-expanded': String(open),
            dataset: { action: 'toggle' },
            onClick: () => {
              if (expanded.has(q.id)) expanded.delete(q.id);
              else expanded.add(q.id);
              renderList();
              refresh();
              list.querySelector(`[data-id="${q.id}"] [data-action="toggle"]`)?.focus();
            },
          }, icon(open ? 'close' : 'edit', 14), open ? tx.common.actions.close : tx.common.actions.edit),
          toolButton(texts.moveUp(where), 'chevron', () => move(index, -1, 'up'), { disabled: index === 0, action: 'up', cls: 'is-up' }),
          toolButton(texts.moveDown(where), 'chevron', () => move(index, 1, 'down'), { disabled: index === data.questions.length - 1, action: 'down' }),
          toolButton(texts.duplicate(where), 'copy', () => {
            const copy = duplicateQuestion(q);
            if (copy.type === 'email') return toast(texts.onlyOneEmail, { type: 'error' });
            if (data.questions.length >= SURVEY_LIMITS.questions) return toast(texts.maxQuestions(SURVEY_LIMITS.questions), { type: 'error' });
            data.questions.splice(index + 1, 0, copy);
            expanded.add(copy.id);
            rerender(`label-${copy.id}`);
            return null;
          }, { action: 'duplicate', disabled: q.type === 'email' }),
          toolButton(texts.remove(where), 'trash', () => remove(q), { action: 'delete' }),
        )
      : null;
    return h(
      'article',
      { class: ['sq-card', isSection && 'is-section'], dataset: { id: q.id } },
      h('header', { class: 'sq-head' }, h('span', { class: 'sq-num' }, isSection ? texts.section : t.questionNumber(number)), h('div', { class: 'sq-title' }, title, meta), tools),
      warnHost,
      open ? questionBody(q) : null,
    );
  }

  function renderList() {
    warnHosts.clear();
    titles.clear();
    let number = 0;
    mount(
      list,
      data.questions.length ? null : h('p', { class: 'muted' }, texts.empty),
      data.questions.map((q, index) => questionCard(q, index, q.type === SECTION ? number : (number += 1))),
    );
  }

  const newType = h('select', { class: 'input input-small', 'aria-label': texts.newType });
  const addButton = h('button', { type: 'button', class: 'btn btn-primary btn-small' }, icon('plus', 14), h('span', null, tx.common.actions.add));
  const renderAddBar = () => {
    mount(newType, QUESTION_TYPES.map(([value, label]) => h('option', { value, selected: value === 'scelta', disabled: value === 'email' && hasEmail() }, label)));
    addButton.disabled = data.questions.length >= SURVEY_LIMITS.questions;
  };
  addButton.addEventListener('click', () => {
    const q = newQuestion(newType.value);
    data.questions.push(q);
    expanded.add(q.id);
    rerender(`label-${q.id}`);
    renderAddBar();
  });

  const textArea = (key, max, rows, onAfter) =>
    autoGrow(h('textarea', {
      class: 'input',
      rows,
      value: data[key] || '',
      maxlength: max,
      onInput: (e) => {
        if (e.target.value.trim()) data[key] = e.target.value;
        else delete data[key];
        onAfter?.();
        refresh();
      },
    }));

  renderList();
  refresh();

  const content = h(
    'div',
    { class: 'stack' },
    textCard(texts.intro, textArea('intro', SURVEY_LIMITS.intro, 4), texts.introHint),
    textCard(texts.privacy, textArea('privacy', SURVEY_LIMITS.privacy, 6), texts.privacyHint, privacyBadge),
    h(
      'section',
      { class: 'stack sq-questions' },
      h('h2', null, texts.title),
      list,
      writable ? h('div', { class: 'sq-add row' }, h('span', { class: 'field-label' }, texts.newQuestion), newType, addButton) : null,
    ),
    textCard(texts.thanks, textArea('thanks', SURVEY_LIMITS.thanks, 2), texts.thanksHint),
    textCard(texts.thanksContact, textArea('thanks_contact', SURVEY_LIMITS.thanks, 2), texts.thanksContactHint),
  );

  const el = h(
    'div',
    { class: 'stack survey-editor' },
    session.banner,
    summary,
    writable ? content : readOnly(content),
    writable ? session.bar : null,
  );
  return { el, session };
}

// Colori dei temi come in survey.css; il colore del questionario arriva già adattato al tema, come nella pagina pubblica.
const PREVIEW_THEMES = {
  chiaro: { key: 'l', bg: '#ffffff', text: '#1d1c1a', muted: '#5e5b55', line: '#d9d6ce' },
  seppia: { key: 's', bg: '#f8f1e3', text: '#33281c', muted: '#6a5843', line: '#d9c8a8' },
  scuro: { key: 'd', bg: '#1c1d21', text: '#ececee', muted: '#a6a8ae', line: '#3a3c43' },
  contrasto: { key: 'h', bg: '#ffffff', text: '#000000', muted: '#262626', line: '#000000' },
};

// Anteprima di una domanda con tema e colore scelti; il tema automatico mostra chiaro e scuro.
function previewCard(data, mode) {
  const texts = t.settings;
  const look = PREVIEW_THEMES[mode] || PREVIEW_THEMES.chiaro;
  const tokens = accentTokens(data.appearance?.accent || SURVEY_ACCENT);
  const asked = (data.questions || []).filter((q) => q.type !== SECTION);
  const sample = asked.find((q) => q.type === 'scelta' && q.options?.length >= 2);
  const options = sample ? sample.options.slice(0, 3).map((o) => o.label) : texts.previewOptions;
  const total = Math.max(asked.length, 1);
  const position = sample ? asked.indexOf(sample) + 1 : 1;
  return h(
    'div',
    {
      class: 'sv-preview',
      dataset: { mode },
      style: {
        '--sv-bg': look.bg,
        '--sv-text': look.text,
        '--sv-muted': look.muted,
        '--sv-line': look.line,
        '--sv-accent': tokens[`--ui-${look.key}`],
        '--sv-on-accent': tokens[`--on-${look.key}`],
      },
    },
    h('span', { class: 'sv-preview-mode' }, SURVEY_THEMES.find(([v]) => v === mode)?.[1] || texts.lightTheme),
    data.progress === 'barra' ? h('div', { class: 'sv-preview-bar' }, h('span', { style: { width: `${Math.round((position / total) * 100)}%` } })) : null,
    data.progress === 'contatore' ? h('p', { class: 'sv-preview-count' }, texts.previewCounter(position, total)) : null,
    h('p', { class: 'sv-preview-q' }, sample?.label || texts.previewQuestion),
    options.map((label, i) => h('div', { class: ['sv-preview-opt', i === 0 && 'is-on'] }, h('span', { class: 'sv-preview-dot' }), h('span', null, label))),
    h('span', { class: 'sv-preview-btn' }, tx.common.actions.next),
  );
}

function choiceGroup(legend, name, entries, value, onPick, { recommended, reason } = {}) {
  return h(
    'fieldset',
    { class: 'sv-choices' },
    h('legend', { class: 'field-label' }, legend),
    entries.map(([v, label]) =>
      h(
        'label',
        { class: 'sv-choice' },
        h('input', { type: 'radio', name, value: v, checked: v === value, onChange: () => onPick(v) }),
        h('span', null, label, v === recommended ? [' ', h('span', { class: 'badge badge-ok' }, t.editor.recommended)] : null, v === recommended && reason ? [' ', h('span', { class: 'sv-reason' }, reason)] : null),
      ),
    ),
  );
}

// Immagine del questionario (copertina o grazie): anteprima, scelta, descrizione per chi non la vede e rimozione.
function imagePicker({ item, data, session, key, empty, placeholder }) {
  const texts = t.settings;
  const host = h('div', { class: 'sv-cover' });
  const status = h('span', { class: 'muted small', role: 'status' });
  const input = h('input', {
    type: 'file',
    class: 'file-input',
    accept: 'image/jpeg,image/png,image/webp',
    onChange: async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      status.textContent = texts.uploading;
      try {
        const path = await uploadSurveyCover(item.id, file);
        data[key] = { path, alt: data[key]?.alt || '' };
        status.textContent = texts.uploaded;
        session.changed();
        render();
      } catch (error) {
        status.textContent = '';
        toast(error.message, { type: 'error' });
      }
    },
  });

  function render() {
    const image = data[key];
    const thumb = h('div', { class: ['sv-cover-thumb', !image && 'is-empty'] }, image ? null : h('span', { class: 'muted small' }, empty));
    if (image) {
      surveyCoverUrl(image.path).then((url) => {
        if (data[key]?.path !== image.path) return;
        mount(thumb, url ? h('img', { src: url, alt: '' }) : h('span', { class: 'muted small' }, texts.noPreview));
      });
    }
    const alt = image
      ? h(
          'label',
          { class: 'field' },
          h('span', { class: 'field-label' }, texts.imageAlt),
          h('input', {
            class: 'input',
            type: 'text',
            maxlength: SURVEY_LIMITS.coverAlt,
            value: image.alt,
            placeholder,
            onInput: (e) => {
              data[key].alt = e.target.value;
              session.changed();
            },
          }),
          h('span', { class: 'muted small' }, texts.imageAltHelp),
        )
      : null;
    const pick = h('button', { type: 'button', class: 'btn btn-small', onClick: () => input.click() }, icon('image', 14), h('span', null, image ? texts.changeImage : texts.chooseImage));
    const drop = image
      ? h('button', {
          type: 'button',
          class: 'btn btn-small btn-ghost',
          onClick: () => {
            delete data[key];
            status.textContent = '';
            session.changed();
            render();
          },
        }, icon('trash', 14), h('span', null, texts.removeImage))
      : null;
    mount(host, thumb, h('div', { class: 'row' }, pick, drop, status), alt, input);
  }

  render();
  return host;
}

export function settingsPanel(item, { writable, onSaved }) {
  const texts = t.settings;
  const session = editSession(item, { message: texts.message, onSaved });
  const { working } = session;
  const data = working.data;
  data.appearance = { theme: data.appearance?.theme || 'automatico', accent: data.appearance?.accent || '#3b4bc8' };
  const contrastHost = h('div', { class: 'sv-contrast', 'aria-live': 'polite' });
  const previewHost = h('div', { class: 'sv-previews' });
  const hex = h('input', { class: 'input input-small sv-hex', type: 'text', maxlength: 7, 'aria-label': texts.colourCode, value: data.appearance.accent });
  const picker = h('input', { class: 'input input-color', type: 'color', 'aria-label': texts.customColour, value: data.appearance.accent });
  const swatches = h('div', { class: 'sv-swatches', role: 'radiogroup', 'aria-label': texts.swatches });
  const coverPicker = imagePicker({ item, data, session, key: 'cover', empty: texts.coverEmpty, placeholder: texts.coverPlaceholder });
  const thanksPicker = imagePicker({ item, data, session, key: 'thanks_image', empty: texts.thanksEmpty, placeholder: texts.thanksPlaceholder });

  const renderSwatches = () =>
    mount(
      swatches,
      ACCENT_PALETTE.map(([color, name]) =>
        h(
          'label',
          { class: 'sv-swatch', title: name },
          h('input', {
            type: 'radio',
            name: 'sv-accent',
            value: color,
            checked: color === data.appearance.accent,
            'aria-label': name,
            onChange: () => setAccent(color),
          }),
          h('span', { class: 'sv-swatch-dot', style: { background: color } }),
        ),
      ),
    );

  const renderLook = () => {
    const check = accentCheck(data.appearance.accent, data.appearance.theme);
    mount(
      contrastHost,
      h('p', { class: 'small' }, texts.contrast({ white: fmtRatio(check.white), black: fmtRatio(check.black), onWhite: check.onAccent === '#ffffff' })),
      warningList(check.problems.map((p) => ({ code: `contrasto-${p.code}`, text: p.text, hint: p.hint }))),
    );
    const modes = data.appearance.theme === 'automatico' ? ['chiaro', 'scuro'] : [data.appearance.theme];
    mount(previewHost, modes.map((mode) => previewCard(data, mode)));
  };

  const update = () => {
    session.changed();
    renderLook();
  };

  function setAccent(color) {
    data.appearance.accent = color.toLowerCase();
    picker.value = data.appearance.accent;
    hex.value = data.appearance.accent;
    renderSwatches();
    update();
  }
  picker.addEventListener('input', () => setAccent(picker.value));
  hex.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hex.value.trim())) setAccent(hex.value.trim());
  });

  const recommended = h('span', { class: 'badge badge-ok' }, t.editor.recommended);
  const experiments = itemsOf('experiment', { ideaId: item.idea_id });
  const content = h(
    'div',
    { class: 'stack' },
    h(
      'section',
      { class: 'card stack' },
      h('h2', null, texts.settings),
      h(
        'div',
        { class: 'form-grid' },
        field(t.newSurvey.titleLabel, h('input', {
          class: 'input',
          type: 'text',
          value: working.title,
          maxlength: LIMITS.title,
          onInput: (e) => {
            working.title = e.target.value;
            update();
          },
        }), { help: texts.titleHelp }),
        field(t.newSurvey.experimentOptional, h(
          'select',
          {
            class: 'input',
            onChange: (e) => {
              if (e.target.value) data.experiment_id = e.target.value;
              else delete data.experiment_id;
              update();
            },
          },
          h('option', { value: '' }, t.newSurvey.noExperiment),
          experiments.map((x) => h('option', { value: x.id, selected: x.id === data.experiment_id }, x.title)),
        )),
      ),
      choiceGroup(texts.layout, 'sv-layout', SURVEY_LAYOUTS, data.layout, (v) => {
        data.layout = v;
        update();
      }, { recommended: ONE_PER_SCREEN, reason: texts.reasons.layout }),
      choiceGroup(texts.progress, 'sv-progress', SURVEY_PROGRESS, data.progress, (v) => {
        data.progress = v;
        update();
      }, { recommended: 'contatore', reason: texts.reasons.progress }),
      h(
        'div',
        { class: 'field' },
        checkbox(h('span', null, `${texts.showTime(minutesLabel(estimateMinutes(data)))} `, recommended), data.show_time !== false, (v) => {
          data.show_time = v;
          update();
        }),
        h('span', { class: 'sv-reason' }, texts.reasons.time),
      ),
    ),
    h(
      'section',
      { class: 'card stack' },
      h('h2', null, texts.appearance),
      choiceGroup(texts.theme, 'sv-theme', SURVEY_THEMES, data.appearance.theme, (v) => {
        data.appearance.theme = v;
        update();
      }, { recommended: 'automatico', reason: texts.reasons.theme }),
      h(
        'div',
        { class: 'field' },
        h('span', { class: 'field-label' }, texts.colour),
        swatches,
        h('div', { class: 'row' }, h('span', { class: 'small' }, texts.otherColour), picker, hex),
      ),
      contrastHost,
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, texts.preview), previewHost),
    ),
    h(
      'section',
      { class: 'card stack' },
      h('h2', null, texts.coverTitle),
      h('p', { class: 'sv-reason' }, texts.coverHelp),
      coverPicker,
    ),
    h(
      'section',
      { class: 'card stack' },
      h('h2', null, texts.thanksTitle),
      h('p', { class: 'sv-reason' }, texts.thanksHelp),
      thanksPicker,
    ),
  );

  renderSwatches();
  renderLook();
  const el = h(
    'div',
    { class: 'stack survey-settings' },
    session.banner,
    writable ? content : readOnly(content),
    writable ? session.bar : null,
  );
  return { el, session };
}
