import { h, mount, busy, confirmDialog, openModal, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { deepEqual, snapshotOf } from '../lib/diff.js';
import { shortId } from '../lib/format.js';
import { LIMITS, slugKey } from '../lib/validate.js';
import { DEFAULT_CRITERIA, sanitizeSnapshot } from '../schema.js';
import {
  canWrite,
  createItem,
  criteriaList,
  ideas,
  memberName,
  myScoreItem,
  on,
  scoreItems,
  singleton,
  state,
} from '../store.js';
import { ranking } from '../scoring.js';
import { setLeaveGuard } from '../router.js';
import { saveWithMerge } from './merge.js';
import { avatar, button, emptyState, errorBox, itemLink, pageHeader } from './components.js';

export function criteriaEditor(current, onSave) {
  const rows = current.map((c) => ({ ...c }));
  const host = h('div');
  const message = h('input', { class: 'input', type: 'text', maxlength: LIMITS.message, placeholder: 'Perché cambiano i criteri? (facoltativo)' });
  const render = () => {
    mount(host,
      h(
        'table',
        { class: 'table criteria-table' },
        h('thead', null, h('tr', null, h('th', null, 'Criterio'), h('th', null, 'Descrizione'), h('th', null, 'Peso'), h('th', null, ''))),
        h(
          'tbody',
          null,
          rows.map((row, i) =>
            h(
              'tr',
              null,
              h('td', null, h('input', { class: 'input', value: row.label, maxlength: 80, 'aria-label': 'Nome del criterio', onInput: (e) => (row.label = e.target.value) })),
              h('td', null, h('input', { class: 'input', value: row.description || '', maxlength: 240, 'aria-label': 'Descrizione', onInput: (e) => (row.description = e.target.value) })),
              h('td', null, h('select', { class: 'input', 'aria-label': 'Peso', onChange: (e) => (row.weight = Number(e.target.value)) }, [0, 1, 2, 3, 4, 5].map((w) => h('option', { value: w, selected: w === row.weight }, `×${w}`)))),
              h(
                'td',
                { class: 'row-actions' },
                h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Su', disabled: i === 0, onClick: () => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; render(); } }, '↑'),
                h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Giù', disabled: i === rows.length - 1, onClick: () => { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; render(); } }, '↓'),
                h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Rimuovi', onClick: () => { rows.splice(i, 1); render(); } }, '×'),
              ),
            ),
          ),
        ),
      ),
      h('button', { type: 'button', class: 'btn btn-ghost btn-small', onClick: () => { rows.push({ key: `${slugKey('nuovo')}-${shortId().slice(0, 4)}`, label: 'Nuovo criterio', description: '', weight: 1 }); render(); } }, icon('plus', 14), 'Aggiungi criterio'),
      h('p', { class: 'muted small' }, 'Peso ×0 = il criterio si vota ma non conta nel punteggio. Togliere un criterio non cancella i voti già dati: tornano se lo rimetti.'),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Messaggio della modifica'), message),
    );
  };
  render();
  openModal({
    title: 'Criteri di valutazione',
    wide: true,
    body: host,
    actions: [
      { label: 'Annulla', value: false },
      { label: 'Salva i criteri', kind: 'primary', onClick: async () => !(await onSave(rows, message.value)) },
    ],
  });
}

async function saveCriteria(rows, message) {
  const item = singleton('criteria');
  try {
    if (item) {
      const base = snapshotOf(item);
      const result = await saveWithMerge(item, base, { ...base, data: { criteria: rows } }, message || 'Criteri aggiornati');
      if (result.cancelled) return false;
    } else {
      await createItem('criteria', { title: 'Criteri di valutazione', data: { criteria: rows } }, message || 'Criteri iniziali');
    }
    toast('Criteri salvati.', { type: 'success' });
    return true;
  } catch (error) {
    toast(error.message, { type: 'error' });
    return false;
  }
}

function voteSelect(value, onChange) {
  return h(
    'select',
    { class: ['input', 'vote-select', value ? `v${value}` : ''], onChange: (e) => onChange(e.target.value ? Number(e.target.value) : undefined) },
    h('option', { value: '' }, '-'),
    [1, 2, 3, 4, 5].map((n) => h('option', { value: n, selected: n === value }, String(n))),
  );
}

export function scoringView(outlet, params, query) {
  const mode = query.get('vista') === 'miei' ? 'mine' : 'team';
  const includeAll = query.get('tutte') === '1';
  let working = null;
  let dirty = false;
  const message = h('input', { class: 'input', type: 'text', maxlength: LIMITS.message, placeholder: 'Nota sul voto (facoltativa)' });
  const saveButton = h('button', { type: 'button', class: 'btn btn-primary', disabled: true }, icon('commit', 16), h('span', null, 'Salva i miei voti'));
  const errorHost = h('div');

  const startWorking = () => {
    const mine = myScoreItem();
    working = structuredClone(mine?.data || { scores: {}, notes: {} });
    working.scores = working.scores || {};
    working.notes = working.notes || {};
  };

  const updateDirty = () => {
    const mine = myScoreItem();
    const clean = sanitizeSnapshot('score', { data: working }).data;
    dirty = !deepEqual(clean, mine?.data || { scores: {}, notes: {} });
    saveButton.disabled = !dirty;
    setLeaveGuard(dirty ? () => confirmDialog('Hai voti non salvati. Uscire comunque?', { title: 'Voti non salvati', okLabel: 'Esci', danger: true }) : null);
  };

  const render = () => {
    const criteria = criteriaList();
    const visibleIdeas = ideas().filter((i) => includeAll || !['scartata'].includes(i.status));
    if (!criteria.length) {
      mount(
        outlet,
        pageHeader({ title: 'Valutazione' }),
        emptyState(
          'Non ci sono ancora criteri di valutazione.',
          canWrite() ? button('Crea i criteri predefiniti', { kind: 'primary', onClick: () => saveCriteria(DEFAULT_CRITERIA, 'Criteri predefiniti') }) : null,
        ),
      );
      return;
    }
    const rows = ranking(visibleIdeas, criteria, scoreItems());
    const header = h(
      'tr',
      null,
      h('th', null, 'Idea'),
      criteria.map((c) => h('th', { title: c.description, class: 'crit' }, h('span', null, c.label), h('small', null, `×${c.weight}`))),
      h('th', null, mode === 'team' ? 'Punteggio' : 'Nota'),
    );
    let body;
    if (mode === 'team') {
      body = rows.map((r) =>
        h(
          'tr',
          null,
          h('th', { scope: 'row' }, itemLink(r.idea), h('div', { class: 'voters' }, r.voters.map((id) => avatar(id, 18)))),
          criteria.map((c) => {
            const s = r.perCriterion[c.key];
            const tip = s.byMember.map((v) => `${memberName(v.memberId)}: ${v.value}`).join('\n');
            return h(
              'td',
              { class: ['score-cell', s.mean !== null && `m${Math.round(s.mean)}`, s.disagreement && 'is-disagreement'], title: tip || 'Nessun voto' },
              s.mean === null ? '-' : s.mean.toFixed(1),
              s.disagreement ? h('span', { class: 'flag', 'aria-label': 'disaccordo' }, '!') : null,
            );
          }),
          h('td', { class: 'total' }, r.score === null ? '-' : h('span', { class: 'bar', style: { '--value': `${r.score}%` } }, String(r.score))),
        ),
      );
    } else {
      if (!working) startWorking();
      body = visibleIdeas.map((idea) =>
        h(
          'tr',
          null,
          h('th', { scope: 'row' }, itemLink(idea)),
          criteria.map((c) =>
            h(
              'td',
              null,
              voteSelect(working.scores[idea.id]?.[c.key], (value) => {
                working.scores[idea.id] = { ...(working.scores[idea.id] || {}) };
                if (value === undefined) delete working.scores[idea.id][c.key];
                else working.scores[idea.id][c.key] = value;
                updateDirty();
              }),
            ),
          ),
          h(
            'td',
            null,
            h('input', {
              class: 'input input-small',
              maxlength: 2000,
              value: working.notes[idea.id] || '',
              'aria-label': `Nota su ${idea.title}`,
              onInput: (e) => {
                working.notes[idea.id] = e.target.value;
                updateDirty();
              },
            }),
          ),
        ),
      );
    }

    mount(
      outlet,
      pageHeader({
        title: 'Valutazione',
        subtitle: mode === 'team'
          ? 'Media dei voti del team, pesata con i criteri. Il punto esclamativo segnala dove i voti distano almeno 2 punti: è lì che conviene discutere.'
          : 'I tuoi voti da 1 a 5. Gli altri vedono la media e, passando sopra una cella, i voti di ciascuno.',
        actions: [
          h('a', { class: ['btn', 'btn-small', mode === 'team' ? 'btn-primary' : 'btn-ghost'], href: '#/valutazione' }, 'Media del team'),
          h('a', { class: ['btn', 'btn-small', mode === 'mine' ? 'btn-primary' : 'btn-ghost'], href: '#/valutazione?vista=miei' }, 'I miei voti'),
          canWrite() ? button('Criteri', { iconName: 'edit', onClick: () => criteriaEditor(criteria, saveCriteria) }) : null,
        ],
      }),
      h(
        'label',
        { class: 'check' },
        h('input', { type: 'checkbox', checked: includeAll, onChange: (e) => (location.hash = `#/valutazione?${mode === 'mine' ? 'vista=miei&' : ''}${e.target.checked ? 'tutte=1' : ''}`) }),
        'Mostra anche le idee scartate',
      ),
      visibleIdeas.length
        ? h('div', { class: 'table-scroll' }, h('table', { class: 'table matrix' }, h('thead', null, header), h('tbody', null, body)))
        : emptyState('Nessuna idea da valutare.'),
      errorHost,
      mode === 'mine' ? h('footer', { class: 'save-bar' }, message, saveButton) : null,
    );
  };

  saveButton.addEventListener(
    'click',
    busy(saveButton, async () => {
      mount(errorHost);
      const mine = myScoreItem();
      const title = `Voti di ${state.me?.display_name || 'membro'}`;
      try {
        if (mine) {
          const base = snapshotOf(mine);
          const result = await saveWithMerge(mine, base, { ...base, data: working }, message.value || 'Voti aggiornati');
          if (result.cancelled) return;
        } else {
          await createItem('score', { title, data: working }, message.value || 'Primi voti');
        }
        message.value = '';
        startWorking();
        updateDirty();
        toast('Voti salvati.', { type: 'success' });
        render();
      } catch (error) {
        mount(errorHost, errorBox(error));
      }
    }),
  );

  render();
  const off = on('item', ({ item, byMe }) => {
    if (mode === 'mine' && dirty) return;
    if (['score', 'criteria', 'idea'].includes(item.kind) && !(mode === 'mine' && byMe && item.kind === 'score')) render();
  });
  return () => {
    off();
    setLeaveGuard(null);
  };
}
