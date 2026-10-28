import { h, mount, autoGrow, busy, confirmDialog, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { deepEqual, snapshotOf } from '../lib/diff.js';
import { debounce, fmtDate, fmtDateTime, fmtMoney, shortId } from '../lib/format.js';
import { LIMITS, isUuid } from '../lib/validate.js';
import {
  DEFAULT_EQUITY_FACTORS,
  EDITABLE_KINDS,
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
  singleton,
  state,
  trackPresence,
  writeLocal,
} from '../store.js';
import { navigate, setLeaveGuard } from '../router.js';
import { canvasEditor } from './canvas.js';
import { competitorsEditor } from './competitors.js';
import { equityEditor } from './equity.js';
import { conceptButton } from './concept-help.js';
import { saveWithMerge } from './merge.js';
import { errorBox, pageHeader, photoView } from './components.js';
import { attachMentions } from './mention-input.js';
import { resizePhoto } from '../lib/photo.js';
import { MAX_NOTE_IMAGES, imagePaths, imagePointer, markdownToNote, noteTitle, removeUnusedImages, renderNote, uploadNoteImage } from '../notes.js';

const today = () => new Date().toISOString().slice(0, 10);
const stage = (status) => KINDS.contact.statuses.findIndex(([v]) => v === status);

const CUSTOM_EDITORS = { canvas: canvasEditor, competitors: competitorsEditor, equity: equityEditor };

const CHILD_TITLES = {
  deeptech: 'Scheda deep tech',
  vpc: 'Value Proposition Canvas',
  market: 'Mercato',
  competitors: 'Concorrenti',
};

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
  if (CHILD_TITLES[kind] && idea) snapshot.title = `${CHILD_TITLES[kind]}: ${idea.title}`.slice(0, LIMITS.title);
  if (kind === 'deeptech') snapshot.data = { trl_now: '3', company_form: 'da_decidere', ip_owner: 'da_chiarire' };
  if (kind === 'market') snapshot.data = { approach: 'top_down', som_year: new Date().getFullYear() + 3 };
  if (kind === 'competitors') {
    snapshot.data = {
      axes: { x: { label: 'Prezzo', low: 'Costoso', high: 'Economico' }, y: { label: 'Facilità d\'uso', low: 'Complicato', high: 'Semplice' } },
      us: { x: 7, y: 7 },
    };
  }
  if (kind === 'teamcanvas') snapshot.title = 'Team Canvas';
  if (kind === 'equity') {
    snapshot.title = 'Divisione delle quote';
    snapshot.data = {
      factors: DEFAULT_EQUITY_FACTORS,
      founders: state.members.filter((m) => m.role !== 'advisor').map((m) => ({ id: `f-${shortId().slice(0, 8)}`, name: m.display_name })),
    };
  }
  if (kind === 'contact') snapshot.data = { purpose: 'cliente', owner: state.user?.id };
  if (kind === 'interview') {
    snapshot.data = { date: today(), interviewer: state.user?.id };
    if (KINDS.interview.statuses.some(([v]) => v === query.get('stato'))) snapshot.status = query.get('stato');
    const from = isUuid(query.get('contatto')) ? getItem(query.get('contatto')) : null;
    if (from?.kind === 'contact' && !isExample(from)) {
      snapshot.title = from.title;
      snapshot.idea_id = from.idea_id;
      for (const key of ['role', 'organization', 'segment', 'contact']) if (from.data[key]) snapshot.data[key] = from.data[key];
    }
  }
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

function photoInput(def, working, onChange) {
  const box = h('div', { class: 'photo-input' });
  const render = () => {
    const value = working.data[def.key];
    const file = h('input', {
      type: 'file',
      class: 'file-input',
      accept: 'image/jpeg,image/png,image/webp,image/*',
      onChange: async (e) => {
        const chosen = e.target.files?.[0];
        e.target.value = '';
        if (!chosen) return;
        try {
          working.data[def.key] = await resizePhoto(chosen);
          onChange();
          render();
        } catch (error) {
          toast(error.message, { type: 'error' });
        }
      },
    });
    mount(
      box,
      photoView(value, { alt: 'Anteprima della foto', size: 96, fallback: working.title }),
      h(
        'div',
        { class: 'photo-actions' },
        h('label', { class: 'btn btn-ghost' }, icon('image', 16), h('span', null, value ? 'Cambia foto' : 'Carica una foto'), file),
        value
          ? h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => { working.data[def.key] = undefined; onChange(); render(); } }, icon('close', 16), h('span', null, 'Togli la foto'))
          : null,
      ),
    );
  };
  render();
  return box;
}

// Testo Markdown della nota, con immagini caricate nello spazio privato e anteprima.
function markdownInput(def, working, onChange) {
  const titleLine = h('p', { class: 'small md-title' });
  const text = attachMentions(autoGrow(
    h('textarea', {
      class: 'input md-input',
      rows: 14,
      value: working.data[def.key] || '',
      placeholder: 'Titolo della nota\n\nScrivi qui gli appunti. Usa i pulsanti sopra per grassetto, dimensioni, elenchi e tabelle.',
      maxlength: LIMITS.note,
      'aria-label': 'Testo della nota: la prima riga è il titolo',
      onInput: (e) => {
        working.data[def.key] = e.target.value;
        onChange();
        renderCount();
      },
      onKeydown: (e) => {
        if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
        const key = e.key.toLowerCase();
        if (key === 'b' || key === 'i') {
          e.preventDefault();
          wrap(key === 'b' ? '**' : '*', key === 'b' ? 'grassetto' : 'corsivo');
        }
      },
    }),
  ));
  const preview = h('div', { class: 'md-preview', hidden: true });
  const status = h('span', { class: 'muted small', 'aria-live': 'polite' });
  const renderCount = () => {
    status.textContent = `${imagePaths(text.value).size} di ${MAX_NOTE_IMAGES} immagini`;
    const title = noteTitle(text.value);
    mount(titleLine, title ? ['Titolo della nota: ', h('strong', null, title)] : 'La prima riga sarà il titolo della nota.');
  };
  const replaceRange = (start, end, snippet, selStart = start + snippet.length, selEnd = selStart) => {
    text.value = `${text.value.slice(0, start)}${snippet}${text.value.slice(end)}`;
    text.focus();
    text.setSelectionRange?.(selStart, selEnd);
    text.dispatchEvent(new Event('input'));
  };
  const setText = (value) => replaceRange(0, text.value.length, value);
  const selection = () => {
    const start = text.selectionStart ?? text.value.length;
    return [start, text.selectionEnd ?? start];
  };
  const insert = (snippet) => {
    const [start, end] = selection();
    replaceRange(start, end, snippet);
  };
  const wrap = (marker, placeholder) => {
    const [start, end] = selection();
    const inner = text.value.slice(start, end) || placeholder;
    replaceRange(start, end, `${marker}${inner}${marker}`, start + marker.length, start + marker.length + inner.length);
  };
  // Le righe toccate dalla selezione, intere.
  const editLines = (change) => {
    const [start, end] = selection();
    const from = text.value.lastIndexOf('\n', start - 1) + 1;
    let to = text.value.indexOf('\n', end);
    if (to < 0) to = text.value.length;
    const out = change(text.value.slice(from, to).split('\n')).join('\n');
    replaceRange(from, to, out, from, from + out.length);
  };
  const LIST = /^(\s*)([-*+]|\d{1,3}[.)])\s+/;
  const setSize = (level) => editLines((lines) => lines.map((l) => `${level ? `${'#'.repeat(level)} ` : ''}${l.replace(/^#{1,6}\s+/, '')}`));
  const bullets = () =>
    editLines((lines) => {
      const all = lines.every((l) => /^\s*[-*+]\s+/.test(l) || !l.trim());
      return lines.map((l) => (!l.trim() ? l : all ? l.replace(LIST, '$1') : `- ${l.replace(LIST, '$1')}`));
    });
  const numbers = () => {
    let n = 0;
    editLines((lines) => lines.map((l) => (!l.trim() ? l : `${(n += 1)}. ${l.replace(LIST, '$1')}`)));
  };
  const table = () => {
    const [, end] = selection();
    const lineEnd = text.value.indexOf('\n', end) < 0 ? text.value.length : text.value.indexOf('\n', end);
    const block = '\n\n| Colonna 1 | Colonna 2 | Colonna 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n';
    replaceRange(lineEnd, lineEnd, block, lineEnd + 4, lineEnd + 13);
  };
  const size = h(
    'select',
    {
      class: 'input input-small',
      'aria-label': 'Dimensione del testo',
      onChange: (e) => {
        if (e.target.value !== '') setSize(Number(e.target.value));
        e.target.value = '';
      },
    },
    h('option', { value: '', selected: true, disabled: true }, 'Dimensione'),
    h('option', { value: '0' }, 'Testo normale'),
    h('option', { value: '1' }, 'Titolo grande'),
    h('option', { value: '2' }, 'Titolo medio'),
    h('option', { value: '3' }, 'Titolo piccolo'),
  );
  const tool = (label, title, onClick, cls) => h('button', { type: 'button', class: ['btn', 'btn-ghost', 'btn-small', cls], title, 'aria-label': title, onClick }, label);
  const needsIdea = () => {
    if (isUuid(working.idea_id)) return false;
    toast('Scegli prima l\'idea a cui appartiene la nota.', { type: 'error' });
    return true;
  };
  const imageInput = h('input', {
    type: 'file',
    class: 'file-input',
    accept: 'image/jpeg,image/png,image/webp,image/*',
    multiple: true,
    onChange: async (e) => {
      const files = [...(e.target.files || [])];
      e.target.value = '';
      if (!files.length || needsIdea()) return;
      for (const file of files) {
        if (imagePaths(text.value).size >= MAX_NOTE_IMAGES) {
          toast(`Al massimo ${MAX_NOTE_IMAGES} immagini per nota.`, { type: 'error' });
          break;
        }
        status.textContent = `Carico «${file.name}»…`;
        try {
          const path = await uploadNoteImage(working.idea_id, file);
          insert(`\n${imagePointer(path, file.name.replace(/\.[^.]+$/, ''))}\n`);
        } catch (error) {
          toast(error.message, { type: 'error' });
        }
      }
      renderCount();
    },
  });
  const mdInput = h('input', {
    type: 'file',
    class: 'file-input',
    accept: '.md,.markdown,text/markdown,text/plain',
    onChange: async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || needsIdea()) return;
      try {
        status.textContent = 'Importo il file…';
        const imported = await markdownToNote(await file.text(), working.idea_id, {
          onProgress: (done, total) => (status.textContent = `Carico le immagini: ${done} di ${total}`),
        });
        setText(text.value.trim() ? `${text.value.trimEnd()}\n\n${imported.body}` : imported.body);
        toast('File importato.', { type: 'success' });
      } catch (error) {
        toast(error.message, { type: 'error' });
      }
      renderCount();
    },
  });
  const previewButton = h('button', {
    type: 'button',
    class: 'btn btn-ghost btn-small',
    onClick: () => {
      const show = preview.hidden;
      if (show) mount(preview, renderNote(text.value));
      preview.hidden = !show;
      text.hidden = show;
      previewButton.textContent = show ? 'Scrivi' : 'Anteprima';
    },
  }, 'Anteprima');
  renderCount();
  return h(
    'div',
    { class: 'md-editor' },
    h(
      'div',
      { class: 'md-toolbar', role: 'toolbar', 'aria-label': 'Formattazione' },
      size,
      tool(h('strong', null, 'B'), 'Grassetto (Cmd o Ctrl + B)', () => wrap('**', 'grassetto'), 'md-tool'),
      tool(h('em', null, 'I'), 'Corsivo (Cmd o Ctrl + I)', () => wrap('*', 'corsivo'), 'md-tool'),
      tool('• Elenco', 'Elenco puntato', bullets),
      tool('1. Elenco', 'Elenco numerato', numbers),
      tool('Tabella', 'Inserisci una tabella', table),
      h('span', { class: 'md-sep', 'aria-hidden': 'true' }),
      h('label', { class: 'btn btn-ghost btn-small' }, icon('image', 14), h('span', null, 'Immagine'), imageInput),
      h('label', { class: 'btn btn-ghost btn-small' }, icon('file', 14), h('span', null, 'Importa .md'), mdInput),
      previewButton,
      status,
    ),
    titleLine,
    text,
    preview,
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
      if (def.default) {
        return h('select', { class: 'input', onChange: (e) => set(e.target.value) }, def.options.map(([v, label]) => h('option', { value: v, selected: v === (value || def.default) }, label)));
      }
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
    case 'experiment':
    case 'interview': {
      const list = itemsOf(def.type, working.idea_id ? { ideaId: working.idea_id } : {});
      return h('select', { class: 'input', onChange: (e) => set(e.target.value || undefined) }, options(list.map((x) => [x.id, x.title]), value));
    }
    case 'tags':
      return tagInput(def, working, onChange);
    case 'image':
      return photoInput(def, working, onChange);
    case 'markdown':
      return markdownInput(def, working, onChange);
    case 'money': {
      const preview = h('span', { class: 'field-help' }, value ? fmtMoney(value) : '');
      const input = h('input', {
        class: 'input',
        type: 'number',
        min: 0,
        step: 1,
        inputmode: 'numeric',
        value: value ?? '',
        onInput: (e) => {
          const n = e.target.value === '' ? undefined : Math.round(Number(e.target.value));
          preview.textContent = Number.isFinite(n) ? fmtMoney(n) : '';
          set(Number.isFinite(n) ? n : undefined);
        },
      });
      return h('div', { class: 'money-input' }, input, preview);
    }
    case 'int':
      return h('input', {
        class: 'input',
        type: 'number',
        min: def.min,
        max: def.max,
        step: 1,
        value: value ?? '',
        onInput: (e) => set(e.target.value === '' ? undefined : Number(e.target.value)),
      });
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
  const existing = !editing && def?.singleton ? singleton(kind) : null;
  if (existing) {
    navigate(`/modifica/${existing.id}`);
    return null;
  }
  if ((params.id && !editing) || !EDITABLE_KINDS.includes(kind)) {
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
  const backTo = () => {
    if (editing) return routeFor(editing).slice(1);
    if (def.singleton) return routeFor({ kind }).slice(1);
    return base.idea_id ? `/idea/${base.idea_id}` : '/';
  };
  const cancelButton = h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => navigate(backTo()) }, 'Annulla');

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
      placeholder: def.titlePlaceholder || (kind === 'interview' ? 'Se lo lasci vuoto uso ruolo e organizzazione' : ''),
      onInput: (e) => { working.title = e.target.value; onChange(); },
    });

    const fieldsForm = (fields) =>
      h(
        'div',
        { class: 'form-grid' },
        fields.map((f) => [
          f.group ? h('h2', { class: 'form-group-title is-wide' }, f.group) : null,
          h(
            'div',
            { class: ['field', (f.wide || f.type === 'textarea' || f.type === 'markdown') && 'is-wide'] },
            h('span', { class: 'field-label' }, f.label, f.concept ? conceptButton(f.concept) : null),
            fieldControl(f, working, onChange),
            f.help ? h('span', { class: 'field-help' }, f.help) : null,
          ),
        ]),
      );
    const custom = CUSTOM_EDITORS[kind];
    const body = custom ? h('div', { class: 'stack' }, custom(working, onChange), def.fields.length && kind !== 'canvas' ? fieldsForm(def.fields) : null) : fieldsForm(def.fields);

    mount(
      formHost,
      h(
        'div',
        { class: 'form-top' },
        def.singleton || def.titleFromBody ? null : h('label', { class: 'field is-wide' }, h('span', { class: 'field-label' }, def.titleLabel), title),
        ideaSelect,
        statusSelect,
      ),
      body,
    );
  }

  // Un'intervista nata da una persona con cui interfacciarsi aggiorna anche la persona: la collega e la porta avanti, mai indietro.
  async function linkContact(interview) {
    const contact = kind === 'interview' && isUuid(query.get('contatto')) ? getItem(query.get('contatto')) : null;
    if (contact?.kind !== 'contact' || isExample(contact) || contact.deleted_at) return;
    const base = snapshotOf(contact);
    const next = { ...base, data: { ...base.data, interview_id: interview.id } };
    const target = interview.status === 'da_fare' ? 'fissata' : 'in_contatto';
    if (stage(contact.status) < stage(target)) next.status = target;
    try {
      const result = await saveWithMerge(contact, base, next, 'Collegata all\'intervista');
      if (result.cancelled) toast('Intervista salvata; collega a mano la persona.', { type: 'error' });
    } catch {
      toast('Intervista salvata; aggiorna a mano lo stato della persona.', { type: 'error' });
    }
  }

  async function save() {
    mount(error);
    let snapshot = sanitizeSnapshot(kind, working);
    if (kind === 'interview' && !snapshot.title) snapshot = { ...snapshot, title: autoInterviewTitle(snapshot.data) };
    if (def.titleFromBody) snapshot = { ...snapshot, title: noteTitle(snapshot.data.body) || `Nota del ${fmtDate(snapshot.data.date || new Date().toISOString().slice(0, 10))}` };
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
        if (kind === 'note') removeUnusedImages(base.data?.body, saved?.data?.body ?? snapshot.data.body).catch(() => {});
      } else {
        saved = await createItem(kind, snapshot, message.value);
        await linkContact(saved);
      }
      dirty = false;
      saveDraft.cancel();
      writeLocal(draftKey, null);
      setLeaveGuard(null);
      toast(editing ? 'Modifiche salvate.' : `Salvato: ${def.label}.`, { type: 'success' });
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
      back: { href: `#${backTo()}` },
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
