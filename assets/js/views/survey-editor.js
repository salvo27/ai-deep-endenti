import { autoGrow, busy, confirmDialog, h, mount, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { deepEqual, snapshotOf } from '../lib/diff.js';
import { LIMITS } from '../lib/validate.js';
import { truncate } from '../lib/format.js';
import { QUESTION_ROLES, QUESTION_TYPES, SURVEY_LAYOUTS, SURVEY_LIMITS, SURVEY_PROGRESS, SURVEY_THEMES, sanitizeSnapshot } from '../schema.js';
import { itemsOf, memberName } from '../store.js';
import { estimateMinutes, minutesLabel } from '../public/survey-time.js';
import { ACCENT_PALETTE, accentCheck, countByRole, fmtRatio, hasBrackets, questionWarnings, surveyWarnings } from '../survey-checks.js';
import { SCALE_PRESETS, convertQuestion, duplicateQuestion, newQuestion, newRowId, presetLabels, scaleFromLabels } from '../survey-template.js';
import { saveWithMerge } from './merge.js';

const TYPE_LABELS = Object.fromEntries(QUESTION_TYPES);
const ROLE_SHORT = { persona: 'Chi risponde', problema: 'Problema', contatto: 'Contatto', altro: 'Altro' };

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
  const note = h('input', { class: 'input', type: 'text', maxlength: LIMITS.message, placeholder: 'Descrivi la modifica (facoltativo)', 'aria-label': 'Messaggio della modifica' });
  const saveButton = h('button', { type: 'button', class: 'btn btn-primary', disabled: true }, icon('commit', 16), h('span', null, 'Salva'));
  const session = { working, dirty: false, saving: false, saveButton };
  session.changed = () => {
    session.dirty = !deepEqual(sanitizeSnapshot('survey', working), sanitizeSnapshot('survey', base));
    saveButton.disabled = !session.dirty;
    status.textContent = session.dirty ? 'Modifiche non salvate' : '';
  };
  saveButton.addEventListener(
    'click',
    busy(saveButton, async () => {
      session.saving = true;
      try {
        const result = await saveWithMerge(item, base, sanitizeSnapshot('survey', working), note.value.trim() || message);
        if (result.cancelled) return;
        session.dirty = false;
        toast('Questionario salvato.', { type: 'success' });
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
    mount(session.banner, `${memberName(theirs.updated_by)} ha salvato una nuova versione mentre modificavi. Al salvataggio unirò le vostre modifiche e ti chiederò solo dove si sovrappongono.`);
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

export function questionsPanel(item, { writable, expanded, onSaved }) {
  const session = editSession(item, { message: 'Domande del questionario', onSaved });
  const data = session.working.data;
  if (!Array.isArray(data.questions)) data.questions = [];
  const summary = h('div', { class: 'sq-summary', 'aria-live': 'polite' });
  const list = h('div', { class: 'sq-list' });
  const warnHosts = new Map();
  const titles = new Map();
  const privacyBadge = h('span', { class: 'badge badge-warn' }, 'Da completare');

  const hasEmail = () => data.questions.some((q) => q.type === 'email');

  function renderSummary() {
    const asked = data.questions.filter((q) => q.type !== 'sezione');
    const open = asked.filter((q) => q.type === 'breve' || q.type === 'lunga').length;
    mount(
      summary,
      h(
        'p',
        { class: 'sq-counts' },
        h('strong', null, `${asked.length} ${asked.length === 1 ? 'domanda' : 'domande'}`),
        ` · ${countByRole(data.questions, 'persona')} su chi risponde · ${countByRole(data.questions, 'problema')} sul problema · ${open} aperte · `,
        h('strong', { class: 'sq-time' }, `Durata stimata: ${minutesLabel(estimateMinutes(data))}`),
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
    const ok = await confirmDialog(`«${truncate(q.label || 'Senza testo', 80)}» sparirà dal questionario quando salvi.`, { title: 'Eliminare la domanda?', okLabel: 'Elimina', danger: true });
    if (!ok) return;
    data.questions = data.questions.filter((x) => x !== q);
    expanded.delete(q.id);
    rerender();
    list.querySelector('[data-action="toggle"]')?.focus();
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
          'aria-label': `Opzione ${i + 1}`,
          dataset: { focus: `opt-${o.id}` },
          onInput: (e) => {
            o.label = e.target.value;
            refresh();
          },
        }),
        toolButton(`Sposta su l'opzione ${i + 1}`, 'chevron', () => {
          [q.options[i - 1], q.options[i]] = [q.options[i], q.options[i - 1]];
          rerender(`opt-${o.id}`);
        }, { disabled: i === 0, cls: 'is-up' }),
        toolButton(`Sposta giù l'opzione ${i + 1}`, 'chevron', () => {
          [q.options[i + 1], q.options[i]] = [q.options[i], q.options[i + 1]];
          rerender(`opt-${o.id}`);
        }, { disabled: i === q.options.length - 1 }),
        toolButton(`Togli l'opzione ${i + 1}`, 'close', () => {
          q.options.splice(i, 1);
          rerender(`add-opt-${q.id}`);
        }),
      ),
    );
    return h(
      'div',
      { class: 'field is-wide' },
      h('span', { class: 'field-label' }, 'Opzioni'),
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
        }, icon('plus', 14), 'Aggiungi un\'opzione'),
      ),
      checkbox('Aggiungi «Altro» con uno spazio per scrivere', q.allow_other, (v) => {
        q.allow_other = v;
        refresh();
      }),
      checkbox('Aggiungi «Preferisco non rispondere»', q.prefer_not, (v) => {
        q.prefer_not = v;
        refresh();
      }),
      h('span', { class: 'field-help' }, '«Preferisco non rispondere» solo per le domande delicate, come età o reddito.'),
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
          'Punti',
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
            [5, 7].map((n) => h('option', { value: n, selected: n === points }, `${n} punti`)),
          ),
          { help: '5 punti bastano quasi sempre.' },
        ),
        field(
          'Etichette suggerite',
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
            h('option', { value: '' }, 'Scegli un insieme'),
            SCALE_PRESETS.map(([key, name, sets]) => h('option', { value: key, selected: deepEqual(sets[points], labels) }, `${name}: ${sets[points].join(', ')}`)),
          ),
        ),
      ),
      h('span', { class: 'field-label' }, 'Un\'etichetta per ogni punto'),
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
              'aria-label': `Etichetta del punto ${i + 1}`,
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
    return h('div', { class: 'form-grid is-wide' }, bound('min', 'Minimo (facoltativo)'), bound('max', 'Massimo (facoltativo)'));
  }

  function questionBody(q) {
    const isSection = q.type === 'sezione';
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
        ? h('p', { class: 'field-help is-wide' }, 'L\'email va in una colonna a parte e chi risponde può chiedere di essere ricontattato. Dalla scheda Risposte la aggiungete ai Contatti con un clic.')
        : isSection
        ? h('p', { class: 'field-help is-wide' }, 'Un titolo che divide le domande. Con «Una sezione per schermata» ogni sezione è una pagina.')
        : null;
    return h(
      'div',
      { class: 'sq-body form-grid' },
      field(isSection ? 'Titolo della sezione' : 'Testo della domanda', h('input', {
        class: 'input',
        type: 'text',
        value: q.label,
        maxlength: SURVEY_LIMITS.label,
        dataset: { focus: `label-${q.id}` },
        onInput: (e) => {
          q.label = e.target.value;
          titles.get(q.id).textContent = q.label.trim() || 'Senza testo';
          refresh();
        },
      }), { wide: true }),
      field('Spiegazione (facoltativa)', autoGrow(h('textarea', {
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
      field('Tipo', typeSelect),
      isSection
        ? null
        : field('Argomento', h(
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
          ), { help: 'Serve ai controlli: al massimo 3 domande su chi risponde e 10 sul problema.' }),
      isSection
        ? null
        : h('div', { class: 'field is-wide' }, checkbox('Obbligatoria', q.required === true, (v) => {
            q.required = v;
            rerender(`req-${q.id}`);
          }, { dataset: { focus: `req-${q.id}` } }), h('span', { class: 'field-help' }, 'Meglio di no: obbligare a rispondere fa abbandonare di più.')),
      specific,
    );
  }

  function questionCard(q, index, number) {
    const isSection = q.type === 'sezione';
    const open = !writable || expanded.has(q.id);
    const title = h('span', { class: 'sq-label' }, q.label.trim() || 'Senza testo');
    titles.set(q.id, title);
    const warnHost = h('div', { class: 'sq-warn' });
    warnHosts.set(q.id, warnHost);
    const meta = isSection
      ? null
      : h(
          'span',
          { class: 'sq-meta' },
          TYPE_LABELS[q.type],
          ` · ${ROLE_SHORT[q.role] || 'Altro'}`,
          q.required ? h('span', { class: 'badge badge-soft' }, 'obbligatoria') : null,
        );
    const where = isSection ? `la sezione «${truncate(q.label, 40)}»` : `la domanda ${number}`;
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
          }, icon(open ? 'close' : 'edit', 14), open ? 'Chiudi' : 'Modifica'),
          toolButton(`Sposta su ${where}`, 'chevron', () => move(index, -1, 'up'), { disabled: index === 0, action: 'up', cls: 'is-up' }),
          toolButton(`Sposta giù ${where}`, 'chevron', () => move(index, 1, 'down'), { disabled: index === data.questions.length - 1, action: 'down' }),
          toolButton(`Duplica ${where}`, 'copy', () => {
            const copy = duplicateQuestion(q);
            if (copy.type === 'email') return toast('Ci può essere una sola domanda per l\'email.', { type: 'error' });
            if (data.questions.length >= SURVEY_LIMITS.questions) return toast(`Al massimo ${SURVEY_LIMITS.questions} domande.`, { type: 'error' });
            data.questions.splice(index + 1, 0, copy);
            expanded.add(copy.id);
            rerender(`label-${copy.id}`);
            return null;
          }, { action: 'duplicate', disabled: q.type === 'email' }),
          toolButton(`Elimina ${where}`, 'trash', () => remove(q), { action: 'delete' }),
        )
      : null;
    return h(
      'article',
      { class: ['sq-card', isSection && 'is-section'], dataset: { id: q.id } },
      h('header', { class: 'sq-head' }, h('span', { class: 'sq-num' }, isSection ? 'Sezione' : `D${number}`), h('div', { class: 'sq-title' }, title, meta), tools),
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
      data.questions.length ? null : h('p', { class: 'muted' }, 'Nessuna domanda.'),
      data.questions.map((q, index) => questionCard(q, index, q.type === 'sezione' ? number : (number += 1))),
    );
  }

  const newType = h('select', { class: 'input input-small', 'aria-label': 'Tipo della nuova domanda' });
  const addButton = h('button', { type: 'button', class: 'btn btn-primary btn-small' }, icon('plus', 14), h('span', null, 'Aggiungi'));
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
    textCard('Introduzione', textArea('intro', SURVEY_LIMITS.intro, 4), 'Sostituisci le parti tra parentesi quadre. Nomina l\'università solo se sponsorizza o autorizza davvero il progetto: farla sembrare una ricerca ufficiale è scorretto.'),
    textCard('Informativa sulla privacy', textArea('privacy', SURVEY_LIMITS.privacy, 6), 'Circa 150 parole: chi siete, perché raccogliete i dati, quali dati, anonimato, per quanto li tenete, diritti e un contatto. È un modello, non una consulenza legale.', privacyBadge),
    h(
      'section',
      { class: 'stack sq-questions' },
      h('h2', null, 'Domande'),
      list,
      writable ? h('div', { class: 'sq-add row' }, h('span', { class: 'field-label' }, 'Nuova domanda'), newType, addButton) : null,
    ),
    textCard('Messaggio finale', textArea('thanks', SURVEY_LIMITS.thanks, 2), 'Un grazie e, se hanno lasciato l\'email, cosa succede dopo.'),
  );

  const el = h(
    'div',
    { class: 'stack survey-editor' },
    session.banner,
    summary,
    writable ? content : h('fieldset', { class: 'sv-readonly', disabled: true }, h('legend', { class: 'muted small' }, 'Sola lettura'), content),
    writable ? session.bar : null,
  );
  return { el, session };
}

// Anteprima di una domanda con tema e colore scelti; il tema automatico mostra chiaro e scuro.
function previewCard(data, mode) {
  const accent = data.appearance?.accent;
  const { onAccent } = accentCheck(accent);
  const asked = (data.questions || []).filter((q) => q.type !== 'sezione');
  const sample = asked.find((q) => q.type === 'scelta' && q.options?.length >= 2);
  const options = sample ? sample.options.slice(0, 3).map((o) => o.label) : ['Prima opzione', 'Seconda opzione'];
  const total = Math.max(asked.length, 1);
  const position = sample ? asked.indexOf(sample) + 1 : 1;
  return h(
    'div',
    { class: ['sv-preview', mode === 'scuro' ? 'is-dark' : 'is-light'], style: { '--sv-accent': accent, '--sv-on-accent': onAccent } },
    h('span', { class: 'sv-preview-mode' }, mode === 'scuro' ? 'Scuro' : 'Chiaro'),
    data.progress === 'barra' ? h('div', { class: 'sv-preview-bar' }, h('span', { style: { width: `${Math.round((position / total) * 100)}%` } })) : null,
    data.progress === 'contatore' ? h('p', { class: 'sv-preview-count' }, `Domanda ${position} di ${total}`) : null,
    h('p', { class: 'sv-preview-q' }, sample?.label || 'Quale di queste descrive meglio la tua situazione?'),
    options.map((label, i) => h('div', { class: ['sv-preview-opt', i === 0 && 'is-on'] }, h('span', { class: 'sv-preview-dot' }), h('span', null, label))),
    h('span', { class: 'sv-preview-btn' }, 'Avanti'),
  );
}

const REASONS = {
  layout: 'Sul telefono si saltano meno domande, e chi abbandona lascia comunque le risposte date (Mavletova e Couper 2016).',
  progress: 'Dice onestamente quante domande mancano; in media non cambia gli abbandoni, una barra ingannevole li aumenta (Villar e altri 2013).',
  time: 'Dire quanto dura, senza sottostimarlo, fa iniziare e finire più persone (Galesic e Bosnjak 2009).',
};

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
        h('span', null, label, v === recommended ? [' ', h('span', { class: 'badge badge-ok' }, 'consigliato')] : null, v === recommended && reason ? [' ', h('span', { class: 'sv-reason' }, reason)] : null),
      ),
    ),
  );
}

export function settingsPanel(item, { writable, onSaved }) {
  const session = editSession(item, { message: 'Aspetto e impostazioni', onSaved });
  const { working } = session;
  const data = working.data;
  data.appearance = { theme: data.appearance?.theme || 'automatico', accent: data.appearance?.accent || '#3b4bc8' };
  const contrastHost = h('div', { class: 'sv-contrast', 'aria-live': 'polite' });
  const previewHost = h('div', { class: 'sv-previews' });
  const hex = h('input', { class: 'input input-small sv-hex', type: 'text', maxlength: 7, 'aria-label': 'Codice del colore', value: data.appearance.accent });
  const picker = h('input', { class: 'input input-color', type: 'color', 'aria-label': 'Colore personalizzato', value: data.appearance.accent });
  const swatches = h('div', { class: 'sv-swatches', role: 'radiogroup', 'aria-label': 'Colori consigliati' });

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
      h(
        'p',
        { class: 'small' },
        `Testo sul colore: bianco ${fmtRatio(check.white)}, nero ${fmtRatio(check.black)}. I pulsanti useranno il testo ${check.onAccent === '#ffffff' ? 'bianco' : 'nero'}.`,
      ),
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

  const experiments = itemsOf('experiment', { ideaId: item.idea_id });
  const content = h(
    'div',
    { class: 'stack' },
    h(
      'section',
      { class: 'card stack' },
      h('h2', null, 'Impostazioni'),
      h(
        'div',
        { class: 'form-grid' },
        field('Titolo', h('input', {
          class: 'input',
          type: 'text',
          value: working.title,
          maxlength: LIMITS.title,
          onInput: (e) => {
            working.title = e.target.value;
            update();
          },
        }), { help: 'Lo vede anche chi risponde.' }),
        field('Esperimento collegato (facoltativo)', h(
          'select',
          {
            class: 'input',
            onChange: (e) => {
              if (e.target.value) data.experiment_id = e.target.value;
              else delete data.experiment_id;
              update();
            },
          },
          h('option', { value: '' }, 'Nessuno'),
          experiments.map((x) => h('option', { value: x.id, selected: x.id === data.experiment_id }, x.title)),
        )),
      ),
      choiceGroup('Impaginazione', 'sv-layout', SURVEY_LAYOUTS, data.layout, (v) => {
        data.layout = v;
        update();
      }, { recommended: 'una', reason: REASONS.layout }),
      choiceGroup('Avanzamento', 'sv-progress', SURVEY_PROGRESS, data.progress, (v) => {
        data.progress = v;
        update();
      }, { recommended: 'contatore', reason: REASONS.progress }),
      h(
        'div',
        { class: 'field' },
        checkbox(h('span', null, `Mostra la durata stimata nell'introduzione (${minutesLabel(estimateMinutes(data))}) `, h('span', { class: 'badge badge-ok' }, 'consigliato')), data.show_time !== false, (v) => {
          data.show_time = v;
          update();
        }),
        h('span', { class: 'sv-reason' }, REASONS.time),
      ),
    ),
    h(
      'section',
      { class: 'card stack' },
      h('h2', null, 'Aspetto'),
      choiceGroup('Tema', 'sv-theme', SURVEY_THEMES, data.appearance.theme, (v) => {
        data.appearance.theme = v;
        update();
      }),
      h(
        'div',
        { class: 'field' },
        h('span', { class: 'field-label' }, 'Colore'),
        swatches,
        h('div', { class: 'row' }, h('span', { class: 'small' }, 'Altro colore'), picker, hex),
      ),
      contrastHost,
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Anteprima'), previewHost),
    ),
  );

  renderSwatches();
  renderLook();
  const el = h(
    'div',
    { class: 'stack survey-settings' },
    session.banner,
    writable ? content : h('fieldset', { class: 'sv-readonly', disabled: true }, h('legend', { class: 'muted small' }, 'Sola lettura'), content),
    writable ? session.bar : null,
  );
  return { el, session };
}

