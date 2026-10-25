import { h, mount, busy, confirmDialog, openModal, toast } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { deepEqual, snapshotOf } from '../lib/diff.js';
import { fmtDateTime, shortId } from '../lib/format.js';
import { LIMITS, slugKey } from '../lib/validate.js';
import { DEFAULT_CRITERIA, sanitizeSnapshot } from '../schema.js';
import {
  canWrite,
  createItem,
  criteriaList,
  getItem,
  ideas,
  itemsOf,
  memberName,
  myScoreItem,
  on,
  scoreItems,
  singleton,
  state,
} from '../store.js';
import { comparePhotos, photoRanking, ranking } from '../scoring.js';
import { setLeaveGuard } from '../router.js';
import { archiveWithConfirm } from './actions.js';
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

function hrefWith(query, changes) {
  const next = new URLSearchParams(query);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined || value === '') next.delete(key);
    else next.set(key, value);
  }
  const search = next.toString();
  return `#/valutazione${search ? `?${search}` : ''}`;
}

const PHOTOS_PATH = '/valutazione?vista=fotografie';
const photoItems = () => itemsOf('scoresnap').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

// La situazione di adesso nello stesso formato di una fotografia, per salvarla o confrontarla.
function currentPhoto() {
  const scores = scoreItems();
  return sanitizeSnapshot('scoresnap', {
    data: {
      criteria: criteriaList(),
      ideas: ideas().map((i) => ({ id: i.id, title: i.title, status: i.status })),
      votes: Object.fromEntries(scores.map((s) => [s.created_by, s.data?.scores || {}])),
      names: Object.fromEntries(scores.map((s) => [s.created_by, memberName(s.created_by)])),
    },
  }).data;
}

function takePhoto() {
  const name = h('input', { class: 'input', type: 'text', maxlength: LIMITS.title, value: `Fotografia del ${fmtDateTime(new Date())}`, 'aria-label': 'Nome della fotografia' });
  openModal({
    title: 'Salva una fotografia',
    body: h(
      'div',
      { class: 'stack' },
      h('p', { class: 'muted' }, 'Salva criteri, pesi e voti di tutti come sono adesso. Potrai confrontarla con le fotografie successive o con la situazione del momento.'),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nome'), name),
    ),
    actions: [
      { label: 'Annulla', value: false },
      {
        label: 'Salva fotografia',
        kind: 'primary',
        onClick: async () => {
          const title = name.value.trim();
          try {
            await createItem('scoresnap', { title, data: currentPhoto() }, `Fotografia: ${title}`);
            toast('Fotografia salvata.', { type: 'success' });
            location.hash = PHOTOS_PATH;
            return false;
          } catch (error) {
            toast(error.message, { type: 'error' });
            return true;
          }
        },
      },
    ],
  });
}

// Un'idea della fotografia: link all'idea se esiste ancora, con il nome che aveva allora.
function photoIdeaLink(idea) {
  const live = getItem(idea.id);
  return live ? itemLink(live, idea.title) : h('span', null, idea.title);
}

function matrix(criteria, lastLabel, body) {
  const header = h(
    'tr',
    null,
    h('th', null, 'Idea'),
    criteria.map((c) => h('th', { title: c.description, class: 'crit' }, h('span', null, c.label), h('small', null, `×${c.weight}`))),
    h('th', null, lastLabel),
  );
  return h('div', { class: 'table-scroll matrix-scroll' }, h('table', { class: 'table matrix' }, h('thead', null, header), h('tbody', null, body)));
}

function teamBody(rows, criteria, { nameOf = memberName, linkOf = itemLink } = {}) {
  return rows.map((r) =>
    h(
      'tr',
      null,
      h('th', { scope: 'row' }, linkOf(r.idea), h('div', { class: 'voters' }, r.voters.map((id) => avatar(id, 18)))),
      criteria.map((c) => {
        const s = r.perCriterion[c.key];
        const tip = s.byMember.map((v) => `${nameOf(v.memberId)}: ${v.value}`).join('\n');
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
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const signed = (n) => (n > 0 ? `+${n}` : String(n));
const fmtMean = (v) => (v === null ? '-' : v.toFixed(1));
const placing = (p) => (p ? `${p.rank}° · ${p.score}` : '-');

function moveLabel(row) {
  if (row.move === null) return row.after ? 'nuova' : 'non più votata';
  if (row.move > 0) return `▲ ${row.move}`;
  if (row.move < 0) return `▼ ${-row.move}`;
  return '=';
}

const CRITERIA_CHANGE = {
  added: (c) => `Aggiunto «${c.label}» (×${c.to})`,
  removed: (c) => `Tolto «${c.label}» (era ×${c.from})`,
  weight: (c) => `«${c.label}»: peso da ×${c.from} a ×${c.to}`,
  renamed: (c) => `«${c.from}» rinominato in «${c.label}»`,
};

function voterLabel(v) {
  const parts = [
    v.changed && plural(v.changed, 'voto cambiato', 'voti cambiati'),
    v.added && plural(v.added, 'voto nuovo', 'voti nuovi'),
    v.removed && plural(v.removed, 'voto tolto', 'voti tolti'),
  ].filter(Boolean);
  return `${v.name || memberName(v.memberId)}: ${parts.join(', ')}`;
}

function comparisonView(cmp) {
  if (!cmp.rows.length) return emptyState('Nessuna idea con voti da confrontare.');
  const trend = (n) => ['delta', n > 0 && 'is-up', n < 0 && 'is-down'];
  const changed = cmp.rows.filter((r) => r.means.length);
  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'table-scroll' },
      h(
        'table',
        { class: 'table compare-table' },
        h('thead', null, h('tr', null, h('th', null, 'Idea'), h('th', null, 'Prima'), h('th', null, 'Dopo'), h('th', null, 'Punti'), h('th', null, 'Posizione'))),
        h(
          'tbody',
          null,
          cmp.rows.map((r) =>
            h(
              'tr',
              null,
              h('th', { scope: 'row' }, photoIdeaLink({ id: r.ideaId, title: r.title })),
              h('td', null, placing(r.before)),
              h('td', null, placing(r.after)),
              h('td', { class: trend(r.delta) }, r.delta === null ? '-' : signed(r.delta)),
              h('td', { class: trend(r.move) }, moveLabel(r)),
            ),
          ),
        ),
      ),
    ),
    h(
      'div',
      { class: 'compare-notes' },
      h(
        'section',
        null,
        h('h3', null, 'Criteri'),
        cmp.criteria.length
          ? h('ul', null, cmp.criteria.map((c) => h('li', null, CRITERIA_CHANGE[c.change](c))))
          : h('p', { class: 'muted' }, 'Nessun cambiamento nei criteri.'),
      ),
      h(
        'section',
        null,
        h('h3', null, 'Voti'),
        cmp.voters.length ? h('ul', null, cmp.voters.map((v) => h('li', null, voterLabel(v)))) : h('p', { class: 'muted' }, 'Nessun voto cambiato.'),
      ),
    ),
    changed.length
      ? h(
          'section',
          null,
          h('h3', null, 'Medie cambiate per idea'),
          changed.map((r) =>
            h(
              'details',
              { class: 'compare-means' },
              h('summary', null, `${r.title}: ${plural(r.means.length, 'criterio', 'criteri')}`),
              h('ul', null, r.means.map((m) => h('li', null, `${m.label}: ${fmtMean(m.from)} → ${fmtMean(m.to)}`))),
            ),
          ),
        )
      : null,
  );
}

function photosPanel(query, keep) {
  const list = photoItems();
  const saveButton = canWrite() ? button('Salva fotografia', { kind: 'primary', iconName: 'image', onClick: takePhoto }) : null;
  if (!list.length) {
    return emptyState('Nessuna fotografia. Salvane una prima di cambiare voti o criteri: potrai confrontarla con quelle successive.', saveButton);
  }
  const valid = (value) => value === 'adesso' || list.some((p) => p.id === value);
  const from = valid(query.get('da')) ? query.get('da') : list[0].id;
  const to = valid(query.get('a')) ? query.get('a') : 'adesso';
  const dataOf = (value) => (value === 'adesso' ? currentPhoto() : list.find((p) => p.id === value).data);
  const options = (selected) => [
    h('option', { value: 'adesso', selected: selected === 'adesso' }, 'Adesso'),
    list.map((p) => h('option', { value: p.id, selected: selected === p.id }, `${p.title} · ${fmtDateTime(p.created_at)}`)),
  ];
  const pick = (label, selected, onPick) =>
    h('label', { class: 'field compare-pick' }, h('span', { class: 'field-label' }, label), h('select', { class: 'input', onChange: (e) => onPick(e.target.value) }, options(selected)));
  return h(
    'div',
    { class: 'stack' },
    h(
      'div',
      { class: 'row compare-bar' },
      pick('Prima', from, (value) => (location.hash = hrefWith(query, { da: value, a: to }))),
      pick('Dopo', to, (value) => (location.hash = hrefWith(query, { da: from, a: value }))),
    ),
    from === to ? h('p', { class: 'muted' }, 'Hai scelto la stessa fotografia due volte.') : comparisonView(comparePhotos(dataOf(from), dataOf(to), keep)),
    h('div', { class: 'section-head' }, h('h2', null, 'Fotografie salvate'), saveButton),
    h(
      'div',
      { class: 'table-scroll' },
      h(
        'table',
        { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, 'Nome'), h('th', null, 'Data'), h('th', null, 'Salvata da'), h('th', null, ''))),
        h(
          'tbody',
          null,
          list.map((p) =>
            h(
              'tr',
              null,
              h('td', null, itemLink(p)),
              h('td', null, fmtDateTime(p.created_at)),
              h('td', null, memberName(p.created_by)),
              h(
                'td',
                { class: 'row-actions' },
                h('a', { class: 'btn btn-ghost btn-small', href: hrefWith(query, { da: p.id, a: 'adesso' }) }, 'Confronta con adesso'),
                canWrite()
                  ? h('button', { type: 'button', class: 'btn btn-ghost btn-small', onClick: () => archiveWithConfirm(p, { backTo: PHOTOS_PATH }) }, 'Archivia')
                  : null,
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

export function scoringView(outlet, params, query) {
  const photoId = query.get('foto');
  const view = query.get('vista');
  const mode = photoId ? 'photo' : view === 'miei' ? 'mine' : view === 'fotografie' ? 'photos' : 'team';
  const includeAll = query.get('tutte') === '1';
  const keep = (idea) => includeAll || idea.status !== 'scartata';
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

  const myVotesBody = (visibleIdeas, criteria) => {
    if (!working) startWorking();
    return visibleIdeas.map((idea) =>
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
  };

  const photoContent = (photo) => {
    if (photo?.kind !== 'scoresnap' || photo.deleted_at) {
      return emptyState('Fotografia non trovata: forse è stata archiviata.', button('Tutte le fotografie', { href: `#${PHOTOS_PATH}` }));
    }
    const rows = photoRanking(photo.data, keep);
    const nameOf = (id) => photo.data.names?.[id] || memberName(id);
    return rows.length
      ? matrix(photo.data.criteria, 'Punteggio', teamBody(rows, photo.data.criteria, { nameOf, linkOf: photoIdeaLink }))
      : emptyState('Nessuna idea in questa fotografia.');
  };

  const SUBTITLES = {
    team: 'Media dei voti del team, pesata con i criteri. Il punto esclamativo segnala dove i voti distano almeno 2 punti: è lì che conviene discutere.',
    mine: 'I tuoi voti da 1 a 5. Gli altri vedono la media e, passando sopra una cella, i voti di ciascuno.',
    photos: 'Ogni fotografia salva criteri, pesi e voti di tutti in quel momento. Scegli due fotografie, o una fotografia e la situazione di adesso, per vedere cosa è cambiato.',
  };

  const render = () => {
    const criteria = criteriaList();
    if (!criteria.length && (mode === 'team' || mode === 'mine')) {
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
    const visibleIdeas = ideas().filter(keep);
    const photo = mode === 'photo' ? getItem(photoId) : null;
    let content;
    if (mode === 'photo') content = photoContent(photo);
    else if (mode === 'photos') content = photosPanel(query, keep);
    else if (!visibleIdeas.length) content = emptyState('Nessuna idea da valutare.');
    else if (mode === 'team') content = matrix(criteria, 'Punteggio', teamBody(ranking(visibleIdeas, criteria, scoreItems()), criteria));
    else content = matrix(criteria, 'Nota', myVotesBody(visibleIdeas, criteria));

    const tab = (label, href, active) => h('a', { class: ['btn', 'btn-small', active ? 'btn-primary' : 'btn-ghost'], href }, label);
    const subtitle =
      mode === 'photo' && photo?.kind === 'scoresnap'
        ? `Fotografia «${photo.title}» del ${fmtDateTime(photo.created_at)}, salvata da ${memberName(photo.created_by)}. Criteri, pesi e voti sono quelli di quel momento.`
        : SUBTITLES[mode] || '';

    mount(
      outlet,
      pageHeader({
        title: 'Valutazione',
        subtitle,
        actions: [
          tab('Media del team', '#/valutazione', mode === 'team'),
          tab('I miei voti', '#/valutazione?vista=miei', mode === 'mine'),
          tab('Fotografie', `#${PHOTOS_PATH}`, mode === 'photos' || mode === 'photo'),
          mode === 'photo' && photo?.kind === 'scoresnap' ? button('Confronta con adesso', { iconName: 'diff', href: `#${PHOTOS_PATH}&da=${photo.id}&a=adesso` }) : null,
          canWrite() && mode === 'team' ? button('Salva fotografia', { iconName: 'image', onClick: takePhoto }) : null,
          canWrite() ? button('Criteri', { iconName: 'edit', onClick: () => criteriaEditor(criteria, saveCriteria) }) : null,
        ],
      }),
      h(
        'label',
        { class: 'check' },
        h('input', { type: 'checkbox', checked: includeAll, onChange: (e) => (location.hash = hrefWith(query, { tutte: e.target.checked ? '1' : null })) }),
        'Mostra anche le idee scartate',
      ),
      content,
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
    if (['score', 'criteria', 'idea', 'scoresnap'].includes(item.kind) && !(mode === 'mine' && byMe && item.kind === 'score')) render();
  });
  return () => {
    off();
    setLeaveGuard(null);
  };
}
