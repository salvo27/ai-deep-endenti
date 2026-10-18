import { h, mount, autoGrow, busy, confirmDialog, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { deepEqual, snapshotOf } from '../lib/diff.js';
import { debounce, fmtDateTime } from '../lib/format.js';
import { LIMITS, isUuid } from '../lib/validate.js';
import {
  BOARD_KINDS,
  KINDS,
  autoInterviewTitle,
  defaultStatus,
  routeFor,
  sanitizeSnapshot,
  snapshotProblem,
} from '../schema.js';
import {
  canWrite,
  createItem,
  getItem,
  ideas,
  isExample,
  itemsOf,
  memberName,
  on,
  readLocal,
  state,
  trackPresence,
  writeLocal,
} from '../store.js';
import { navigate, setLeaveGuard } from '../router.js';
import { canvasEditor } from './canvas.js';
import { saveWithMerge } from './merge.js';
import { errorBox, pageHeader } from './components.js';

const today = () => new Date().toISOString().slice(0, 10);

export function initialSnapshot(kind, query = new URLSearchParams()) {
  const parent = isUuid(query.get('idea')) ? getItem(query.get('idea')) : null;
  const ideaId = parent?.kind === 'idea' && !isExample(parent) ? parent.id : null;
  const idea = ideaId ? getItem(ideaId) : null;
  const snapshot = { title: '', status: defaultStatus(kind), idea_id: ideaId, data: {} };
  if (kind === 'canvas' && idea) {
    snapshot.title = `Lean Canvas: ${idea.title}`.slice(0, LIMITS.title);
    snapshot.data = { problem: idea.data.problem, segments: idea.data.customer, solution: idea.data.solution, uvp: idea.data.pitch };
  }
  if (kind === 'experiment' && idea) {
    snapshot.data = { customer: idea.data.customer, problem: idea.data.problem, solution: idea.data.solution, owner: state.user?.id };
  }
  if (kind === 'interview') snapshot.data = { date: today(), interviewer: state.user?.id };
  if (kind === 'decision') snapshot.data = { date: today(), ideas: ideaId ? [ideaId] : [] };
  if (kind === 'idea') {
    snapshot.title = query.get('title') || '';
    if (query.get('origin')) snapshot.data.origin = query.get('origin');
    if (query.get('tech')) snapshot.data.technologies = [query.get('tech')];
    if (query.get('sector')) snapshot.data.sector = query.get('sector');
    snapshot.data.owner = state.user?.id;
  }
  return sanitizeSnapshot(kind, snapshot);
}

function options(list, value, empty = '-') {
  return [h('option', { value: '' }, empty), ...list.map(([v, label]) => h('option', { value: v, selected: v === value }, label))];
}

function tagInput(def, working, onChange) {
  const chips = h('div', { class: 'chips' });
  const listId = `sugg-${def.key}`;
  const input = h('input', { class: 'input', type: 'text', list: listId, placeholder: 'Scrivi e premi Invio', maxlength: LIMITS.tag });
  const render = () => {
    const tags = working.data[def.key] || [];
    mount(chips,
      ...tags.map((tag) =>
        h(
          'span',
          { class: 'chip chip-removable' },
          tag,
          h('button', {
            type: 'button',
            class: 'chip-x',
            'aria-label': `Rimuovi ${tag}`,
            onClick: () => {
              working.data[def.key] = tags.filter((t) => t !== tag);
              render();
              onChange();
            },
          }, '×'),
        ),
      ),
    );
  };
  const add = () => {
    const value = input.value.trim();
    if (!value) return;
    const tags = working.data[def.key] || [];
    if (!tags.some((t) => t.toLowerCase() === value.toLowerCase()) && tags.length < LIMITS.tags) {
      working.data[def.key] = [...tags, value];
    }
    input.value = '';
    render();
    onChange();
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add();
    }
  });
  input.addEventListener('change', add);
  render();
  return h('div', { class: 'tag-input' }, chips, input, h('datalist', { id: listId }, (def.suggestions || []).map((s) => h('option', { value: s }))));
}

function checkList(entries, selected, onToggle) {
  const set = new Set(selected || []);
  if (!entries.length) return h('p', { class: 'muted small' }, 'Nessuna voce disponibile.');
  return h(
    'div',
    { class: 'check-list' },
    entries.map(([value, label]) =>
      h(
        'label',
        { class: 'check' },
        h('input', { type: 'checkbox', checked: set.has(value), onChange: (e) => onToggle(value, e.target.checked) }),
        label,
      ),
    ),
  );
}

export function fieldControl(def, working, onChange) {
  const value = working.data[def.key];
  const set = (v) => {
    working.data[def.key] = v;
    onChange();
  };
  switch (def.type) {
    case 'text':
      return h('input', { class: 'input', type: 'text', value: value || '', placeholder: def.placeholder || '', maxlength: LIMITS.line, onInput: (e) => set(e.target.value) });
    case 'textarea':
      return autoGrow(h('textarea', { class: 'input', rows: def.rows || 4, value: value || '', placeholder: def.placeholder || '', maxlength: LIMITS.text, onInput: (e) => set(e.target.value) }));
    case 'select':
      return h('select', { class: 'input', onChange: (e) => set(e.target.value || undefined) }, options(def.options, value));
    case 'date':
      return h('input', { class: 'input', type: 'date', value: value || '', onChange: (e) => set(e.target.value || undefined) });
    case 'member':
      return h('select', { class: 'input', onChange: (e) => set(e.target.value || undefined) }, options(state.members.map((m) => [m.user_id, m.display_name]), value));
    case 'members':
      return checkList(state.members.map((m) => [m.user_id, m.display_name]), value, (id, checked) => {
        const list = new Set(working.data[def.key] || []);
        if (checked) list.add(id);
        else list.delete(id);
        set([...list]);
      });
    case 'ideas':
      return checkList(ideas().map((i) => [i.id, i.title]), value, (id, checked) => {
        const list = new Set(working.data[def.key] || []);
        if (checked) list.add(id);
        else list.delete(id);
        set([...list]);
      });
    case 'experiment': {
      const list = itemsOf('experiment', working.idea_id ? { ideaId: working.idea_id } : {});
      return h('select', { class: 'input', onChange: (e) => set(e.target.value || undefined) }, options(list.map((x) => [x.id, x.title]), value));
    }
    case 'tags':
      return tagInput(def, working, onChange);
    case 'scale':
      return h(
        'div',
        { class: 'scale-input', role: 'radiogroup', 'aria-label': def.label },
        [1, 2, 3, 4, 5].map((n) =>
          h('label', { class: 'scale-option' }, h('input', { type: 'radio', name: `scale-${def.key}`, value: n, checked: value === n, onChange: () => set(n) }), String(n)),
        ),
        h('button', { type: 'button', class: 'link-btn small', onClick: () => { set(undefined); onChange(true); } }, 'azzera'),
      );
    default:
      return h('span', { class: 'muted' }, 'Campo non supportato');
  }
}

export function editorView(outlet, params, query) {
  const editing = params.id ? getItem(params.id) : null;
  const kind = editing ? editing.kind : params.kind;
  const def = KINDS[kind];
  if ((params.id && !editing) || !BOARD_KINDS.includes(kind)) {
    mount(outlet, errorBox({ message: 'Elemento non trovato.' }));
    return null;
  }
  if (!canWrite()) {
    mount(outlet, errorBox({ message: 'Solo i membri del team possono modificare le board. Gli advisor possono commentare e votare.' }));
    return null;
  }
  if (isExample(editing)) {
    mount(outlet, errorBox({ message: 'Gli esempi sono in sola lettura: crea una nuova idea e usali come traccia.' }));
    return null;
  }
  if (editing?.deleted_at) {
    mount(outlet, errorBox({ message: 'Questo elemento è archiviato: ripristinalo dal cestino per modificarlo.' }));
    return null;
  }

  const draftKey = `draft:${editing ? editing.id : `new-${kind}-${query.get('idea') || ''}`}`;
  let base = editing ? snapshotOf(editing) : initialSnapshot(kind, query);
  let baseVersion = editing ? editing.version : 0;
  let working = structuredClone(base);
  let dirty = false;
  const cleanups = [];

  const isDirty = () => !deepEqual(sanitizeSnapshot(kind, working), sanitizeSnapshot(kind, base));
  const saveDraft = debounce(() => {
    if (dirty) writeLocal(draftKey, { snapshot: working, base, baseVersion, savedAt: new Date().toISOString() });
  }, 600);
  const onChange = (rerender = false) => {
    dirty = isDirty();
    saveButton.disabled = !dirty;
    saveDraft();
    if (rerender) renderForm();
  };

  const banner = h('div', { class: 'banner', hidden: true, role: 'status' });
  const formHost = h('div');
  const message = h('input', {
    class: 'input',
    type: 'text',
    maxlength: LIMITS.message,
    placeholder: 'Descrivi la modifica (facoltativo), come un messaggio di commit',
    'aria-label': 'Messaggio della modifica',
  });
  const error = h('div');
  const saveButton = h('button', { type: 'button', class: 'btn btn-primary', disabled: true }, icon('commit', 16), h('span', null, editing ? 'Salva' : 'Crea'));
  const cancelButton = h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => navigate(editing ? routeFor(editing).slice(1) : '/') }, 'Annulla');

  const draft = readLocal(draftKey);
  if (draft?.snapshot && !deepEqual(draft.snapshot, base)) {
    banner.hidden = false;
    mount(banner,
      h('span', null, `Hai una bozza non salvata del ${fmtDateTime(draft.savedAt)}.`),
      h('button', {
        type: 'button',
        class: 'btn btn-small',
        onClick: () => {
          working = structuredClone(draft.snapshot);
          if (editing && draft.base && Number.isInteger(draft.baseVersion)) {
            base = draft.base;
            baseVersion = draft.baseVersion;
          }
          banner.hidden = true;
          renderForm();
          onChange();
        },
      }, 'Ripristina la bozza'),
      h('button', { type: 'button', class: 'btn btn-small btn-ghost', onClick: () => { writeLocal(draftKey, null); banner.hidden = true; } }, 'Scarta'),
    );
  }

  function renderForm() {
    const ideaSelect = def.needsIdea || kind === 'interview'
      ? h(
          'label',
          { class: 'field' },
          h('span', { class: 'field-label' }, def.needsIdea ? 'Idea' : 'Idea (facoltativa)'),
          h('select', { class: 'input', onChange: (e) => { working.idea_id = e.target.value || null; onChange(true); } }, options(ideas().map((i) => [i.id, i.title]), working.idea_id, def.needsIdea ? 'Scegli l\'idea' : 'Nessuna')),
        )
      : null;
    const statusSelect = def.statuses
      ? h(
          'label',
          { class: 'field' },
          h('span', { class: 'field-label' }, 'Stato'),
          h('select', { class: 'input', onChange: (e) => { working.status = e.target.value; onChange(); } }, def.statuses.map(([v, label]) => h('option', { value: v, selected: v === working.status }, label))),
        )
      : null;
    const title = h('input', {
      class: 'input input-title',
      type: 'text',
      value: working.title,
      maxlength: LIMITS.title,
      placeholder: kind === 'interview' ? 'Se lo lasci vuoto uso ruolo e organizzazione' : '',
      onInput: (e) => { working.title = e.target.value; onChange(); },
    });

    const body = kind === 'canvas'
      ? canvasEditor(working, onChange)
      : h(
          'div',
          { class: 'form-grid' },
          def.fields.map((f) =>
            h(
              'div',
              { class: ['field', (f.wide || f.type === 'textarea') && 'is-wide'] },
              h('span', { class: 'field-label' }, f.label),
              fieldControl(f, working, onChange),
              f.help ? h('span', { class: 'field-help' }, f.help) : null,
            ),
          ),
        );

    mount(
      formHost,
      h(
        'div',
        { class: 'form-top' },
        h('label', { class: 'field is-wide' }, h('span', { class: 'field-label' }, def.titleLabel), title),
        ideaSelect,
        statusSelect,
      ),
      body,
    );
  }

  async function save() {
    mount(error);
    let snapshot = sanitizeSnapshot(kind, working);
    if (kind === 'interview' && !snapshot.title) snapshot = { ...snapshot, title: autoInterviewTitle(snapshot.data) };
    const problem = snapshotProblem(kind, snapshot);
    if (problem) {
      mount(error, errorBox({ message: problem }));
      return;
    }
    try {
      let saved;
      if (editing) {
        const result = await saveWithMerge({ ...editing, version: baseVersion }, base, snapshot, message.value);
        if (result.cancelled) return;
        saved = result.item;
      } else {
        saved = await createItem(kind, snapshot, message.value);
      }
      dirty = false;
      saveDraft.cancel();
      writeLocal(draftKey, null);
      setLeaveGuard(null);
      toast(editing ? 'Modifiche salvate.' : `${def.label} creata.`, { type: 'success' });
      navigate(routeFor(saved).slice(1));
    } catch (e) {
      mount(error, errorBox(e));
    }
  }

  saveButton.addEventListener('click', busy(saveButton, save));
  const onKey = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (!saveButton.disabled) saveButton.click();
    }
  };
  const onBeforeUnload = (event) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', onBeforeUnload);
  cleanups.push(() => window.removeEventListener('keydown', onKey), () => window.removeEventListener('beforeunload', onBeforeUnload));

  setLeaveGuard(async () => !dirty || confirmDialog('Hai modifiche non salvate. Restano come bozza su questo dispositivo.', { title: 'Uscire senza salvare?', okLabel: 'Esci', danger: true }));

  if (editing) {
    cleanups.push(
      on('item', ({ item, byMe }) => {
        if (item.id !== editing.id || byMe) return;
        banner.hidden = false;
        mount(banner,
          h('span', null, `${memberName(item.updated_by)} ha salvato una nuova versione mentre modificavi. Al salvataggio unirò le vostre modifiche e ti chiederò solo dove si sovrappongono.`),
        );
      }),
    );
  }

  trackPresence({ route: editing ? routeFor(editing).slice(1) : `/nuovo/${kind}`, editing: true });
  renderForm();
  mount(
    outlet,
    pageHeader({
      title: editing ? `Modifica: ${editing.title}` : `Nuovo: ${def.label}`,
    }),
    banner,
    formHost,
    error,
    h('footer', { class: 'save-bar' }, message, cancelButton, saveButton),
  );
  return () => {
    saveDraft.cancel();
    for (const fn of cleanups) fn();
  };
}
