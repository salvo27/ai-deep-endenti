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
  memberById,
  memberName,
  myScoreItem,
  on,
  scoreItems,
  singleton,
  state,
} from '../store.js';
import {
  DISAGREEMENT_SPREAD,
  NO_EVIDENCE,
  comparePhotos,
  countMissing,
  criteriaWeightsChanged,
  evidenceByIdea,
  missingVotes,
  photoRanking,
  ranking,
  scaleEnds,
} from '../scoring.js';
import { navigate, setLeaveGuard } from '../router.js';
import { archiveWithConfirm } from './actions.js';
import { saveWithMerge } from './merge.js';
import { avatar, button, emptyState, errorBox, itemLink, pageHeader } from './components.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const signed = (n) => (n > 0 ? `+${n}` : String(n));
const fmtMean = (v) => (v === null ? '-' : v.toFixed(1));
const placing = (p) => (p ? `${p.rank}° · ${p.score}` : '-');

// Cosa manca a una descrizione per spiegare la scala; stringa vuota se è chiara.
function endsProblem(description) {
  const { high, low } = scaleEnds(description);
  if (high && low) return '';
  if (!high && !low) return 'Non dice cosa vuol dire 5 e cosa vuol dire 1.';
  return high ? 'Non dice cosa vuol dire 1.' : 'Non dice cosa vuol dire 5.';
}

export function criteriaEditor(current, onSave) {
  const rows = current.map((c) => ({ ...c }));
  const host = h('div');
  const message = h('input', { class: 'input', type: 'text', maxlength: LIMITS.message, placeholder: 'Perché cambiano i criteri? (facoltativo)' });
  const criterionRow = (row, i) => {
    const warning = h('small', { class: 'crit-warn' });
    const tr = h(
      'tr',
      null,
      h('td', null, h('input', { class: 'input', value: row.label, maxlength: 80, 'aria-label': 'Nome del criterio', onInput: (e) => (row.label = e.target.value) })),
      h(
        'td',
        null,
        h('input', {
          class: 'input',
          value: row.description || '',
          maxlength: 240,
          placeholder: '5 = ...; 1 = ...',
          'aria-label': 'Descrizione',
          onInput: (e) => {
            row.description = e.target.value;
            check();
          },
        }),
        warning,
      ),
      h('td', null, h('select', { class: 'input', 'aria-label': 'Peso', onChange: (e) => (row.weight = Number(e.target.value)) }, [0, 1, 2, 3, 4, 5].map((w) => h('option', { value: w, selected: w === row.weight }, `×${w}`)))),
      h(
        'td',
        { class: 'row-actions' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Su', disabled: i === 0, onClick: () => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; render(); } }, '↑'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Giù', disabled: i === rows.length - 1, onClick: () => { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; render(); } }, '↓'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Rimuovi', onClick: () => { rows.splice(i, 1); render(); } }, '×'),
      ),
    );
    // Si aggiorna mentre si scrive, senza ridisegnare la tabella e perdere il cursore.
    const check = () => {
      const problem = endsProblem(row.description);
      mount(warning, problem);
      warning.hidden = !problem;
      tr.classList.toggle('is-unclear', Boolean(problem));
    };
    check();
    return tr;
  };
  const render = () => {
    mount(host,
      h('p', { class: 'muted small' }, 'Nella descrizione scrivi cosa vuol dire 5 e cosa vuol dire 1, per esempio «5 = ...; 1 = ...»: così nessuno legge la scala al contrario.'),
      h(
        'table',
        { class: 'table criteria-table' },
        h('thead', null, h('tr', null, h('th', null, 'Criterio'), h('th', null, 'Descrizione'), h('th', null, 'Peso'), h('th', null, ''))),
        h('tbody', null, rows.map(criterionRow)),
      ),
      h('button', { type: 'button', class: 'btn btn-ghost btn-small', onClick: () => { rows.push({ key: `${slugKey('nuovo')}-${shortId().slice(0, 4)}`, label: 'Nuovo criterio', description: '', weight: 1 }); render(); } }, icon('plus', 14), 'Aggiungi criterio'),
      h(
        'p',
        { class: 'muted small' },
        'Peso ×0 = il criterio si vota ma non conta nel punteggio. Togliere un criterio non cancella i voti già dati: tornano se lo rimetti. Se cambi i pesi, aggiungi o togli criteri, prima si salva da sola una fotografia dei voti, per poter confrontare prima e dopo.',
      ),
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

// Prima di un cambio che sposta la classifica si salva una fotografia, per poter confrontare prima e dopo.
// Restituisce false se la fotografia non riesce e si sceglie di non continuare.
async function photoBeforeCriteria(before, after) {
  const hasVotes = scoreItems().some((s) => Object.keys(s.data?.scores || {}).length);
  if (!hasVotes || !criteriaWeightsChanged(before, after)) return true;
  const title = `${nextPhotoName()}, prima di cambiare i criteri`;
  try {
    await createItem('scoresnap', { title, data: currentPhoto() }, `Fotografia: ${title}`);
    toast(`Prima di cambiare i criteri è stata salvata la fotografia «${title}».`, { type: 'success' });
    return true;
  } catch (error) {
    return confirmDialog(
      `Non è stato possibile salvare una fotografia dei voti prima del cambio (${error.message}). Senza fotografia non potrai confrontare la classifica di prima con quella nuova. Salvare comunque i criteri?`,
      { title: 'Fotografia non salvata', okLabel: 'Salva comunque i criteri' },
    );
  }
}

async function saveCriteria(rows, message) {
  const item = singleton('criteria');
  try {
    if (item) {
      const next = sanitizeSnapshot('criteria', { data: { criteria: rows } }).data.criteria;
      if (!(await photoBeforeCriteria(item.data?.criteria || [], next))) return false;
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

// Un voto vuoto resta evidenziato finché non si sceglie un numero.
const voteClass = (value) => ['input', 'vote-select', value ? `v${value}` : 'is-empty'].join(' ');

function voteSelect(value, label, onChange) {
  return h(
    'select',
    {
      class: voteClass(value),
      'aria-label': label,
      onChange: (e) => {
        const next = e.target.value ? Number(e.target.value) : undefined;
        e.target.className = voteClass(next);
        onChange(next);
      },
    },
    h('option', { value: '' }, '-'),
    [1, 2, 3, 4, 5].map((n) => h('option', { value: n, selected: n === value }, String(n))),
  );
}

// Prove raccolte sull'idea, sotto il suo nome: senza conversazioni l'avviso salta all'occhio.
function evidenceChips(evidence) {
  const e = evidence || NO_EVIDENCE;
  return h(
    'div',
    { class: 'evidence' },
    h('span', { class: ['ev-chip', !e.conversations && 'is-warn'] }, e.conversations ? plural(e.conversations, 'conversazione', 'conversazioni') : 'Nessuna conversazione'),
    h('span', { class: ['ev-chip', !e.commitments && 'is-zero'] }, plural(e.commitments, 'impegno', 'impegni')),
    h('span', { class: ['ev-chip', !e.experiments && 'is-zero'] }, plural(e.experiments, 'esperimento concluso', 'esperimenti conclusi')),
  );
}

const EVIDENCE_LEGEND = 'Sotto ogni idea: conversazioni vere (interviste fatte, senza le ricerche a tavolino), impegni concreti (disponibili a un pilota o a pagare) ed esperimenti conclusi.';

const closeAction = [{ label: 'Chiudi', value: false }];

function showCriterion(c) {
  const problem = endsProblem(c.description);
  openModal({
    title: c.label,
    body: h(
      'div',
      { class: 'stack' },
      c.description ? h('p', null, c.description) : h('p', { class: 'muted' }, 'Nessuna descrizione.'),
      h('p', { class: 'muted' }, c.weight ? `Peso ×${c.weight}.` : 'Peso ×0: si vota ma non conta nel punteggio.'),
      problem ? h('p', { class: 'crit-warn' }, `${problem} Prima di votare chiedete a chi gestisce i criteri di scriverlo.`) : null,
    ),
    actions: closeAction,
  });
}

// I voti di ciascuno in una cella: con un tocco o un clic, senza dipendere dal passaggio del mouse.
function showCell({ idea, criterion, stats, voters, nameOf }) {
  const missing = voters.filter((id) => !stats.byMember.some((v) => v.memberId === id));
  openModal({
    title: `${idea.title} · ${criterion.label}`,
    body: h(
      'div',
      { class: 'stack cell-detail' },
      criterion.description ? h('p', { class: 'muted' }, criterion.description) : null,
      h('p', null, h('strong', null, stats.mean === null ? 'Nessun voto.' : `Media: ${fmtMean(stats.mean)} su 5`)),
      stats.byMember.length ? h('ul', null, stats.byMember.map((v) => h('li', null, `${nameOf(v.memberId)}: ${v.value}`))) : null,
      missing.length ? h('p', { class: 'muted' }, `${missing.length === 1 ? 'Non ha ancora votato' : 'Non hanno ancora votato'}: ${missing.map(nameOf).join(', ')}.`) : null,
      stats.disagreement
        ? h(
            'p',
            { class: 'crit-warn' },
            `Segnalata come disaccordo: i voti vanno da ${stats.min} a ${stats.max}, cioè distano ${stats.spread} punti. Il segnale scatta da ${DISAGREEMENT_SPREAD} punti in su: conviene parlarne.`,
          )
        : null,
    ),
    actions: closeAction,
  });
}

function showMissing(idea, missing, criteria) {
  const labelOf = new Map(criteria.map((c) => [c.key, c.label]));
  openModal({
    title: 'Voti mancanti',
    body: h(
      'div',
      { class: 'stack' },
      h('p', null, `Su «${idea.title}» mancano ancora questi voti:`),
      h(
        'ul',
        null,
        missing.map((m) =>
          h('li', null, `${memberName(m.memberId)}: ${m.keys.length === criteria.length ? 'nessun voto su questa idea' : m.keys.map((k) => labelOf.get(k)).join(', ')}`),
        ),
      ),
      h('p', { class: 'muted' }, 'Ognuno vota dalla scheda «I miei voti».'),
    ),
    actions: closeAction,
  });
}

// Chi vota oggi: membri con permesso di scrittura che hanno già dato almeno un voto.
function activeVoters() {
  const ids = scoreItems()
    .filter((s) => Object.keys(s.data?.scores || {}).length && ['admin', 'member'].includes(memberById(s.created_by)?.role))
    .map((s) => s.created_by);
  return [...new Set(ids)];
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

// Il numero continua anche dopo archiviazioni e rinomine, così non si ripete.
function nextPhotoName() {
  const all = itemsOf('scoresnap', { includeDeleted: true });
  const numbers = all.map((p) => Number(/^Fotografia (\d+)\b/.exec(p.title)?.[1]) || 0);
  return `Fotografia ${Math.max(all.length, ...numbers) + 1}`;
}

function nameDialog({ title, value, okLabel, intro, save }) {
  const name = h('input', { class: 'input', type: 'text', maxlength: LIMITS.title, value, 'aria-label': 'Nome della fotografia' });
  openModal({
    title,
    body: h('div', { class: 'stack' }, intro ? h('p', { class: 'muted' }, intro) : null, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nome'), name)),
    actions: [
      { label: 'Annulla', value: false },
      {
        label: okLabel,
        kind: 'primary',
        onClick: async () => {
          try {
            await save(name.value.trim());
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

function takePhoto() {
  nameDialog({
    title: 'Salva una fotografia',
    value: nextPhotoName(),
    okLabel: 'Salva fotografia',
    intro: 'Salva criteri, pesi e voti di tutti come sono adesso. Potrai confrontarla con le fotografie successive o con la situazione del momento.',
    save: async (title) => {
      await createItem('scoresnap', { title, data: currentPhoto() }, `Fotografia: ${title}`);
      toast('Fotografia salvata.', { type: 'success' });
      navigate(PHOTOS_PATH, { replace: true });
    },
  });
}

function renamePhoto(photo) {
  nameDialog({
    title: 'Rinomina la fotografia',
    value: photo.title,
    okLabel: 'Rinomina',
    save: async (title) => {
      const current = getItem(photo.id) || photo;
      const base = snapshotOf(current);
      const result = await saveWithMerge(current, base, { ...base, title }, `Fotografia rinominata in «${title}»`);
      if (!result.cancelled) toast('Fotografia rinominata.', { type: 'success' });
    },
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
    criteria.map((c) =>
      h(
        'th',
        { class: 'crit', scope: 'col' },
        h(
          'button',
          { type: 'button', class: 'crit-btn', title: c.description || undefined, 'aria-label': `${c.label}, peso ${c.weight}: mostra la descrizione`, onClick: () => showCriterion(c) },
          h('span', null, c.label),
          h('small', null, `×${c.weight}`),
        ),
      ),
    ),
    h('th', null, lastLabel),
  );
  return h('div', { class: 'table-scroll matrix-scroll' }, h('table', { class: 'table matrix' }, h('thead', null, header), h('tbody', null, body)));
}

// evidenceOf restituisce le prove di un'idea o null per non mostrarle; missingOf i voti mancanti o null.
function teamBody(rows, criteria, { nameOf = memberName, linkOf = itemLink, evidenceOf = () => null, voters = [], missingOf = () => null } = {}) {
  return rows.map((r) => {
    const evidence = evidenceOf(r.idea);
    const missing = missingOf(r) || [];
    const count = missing.reduce((sum, m) => sum + m.keys.length, 0);
    return h(
      'tr',
      null,
      h(
        'th',
        { scope: 'row' },
        linkOf(r.idea),
        evidence ? evidenceChips(evidence) : null,
        h(
          'div',
          { class: 'voters' },
          r.voters.map((id) => avatar(id, 18)),
          count
            ? h('button', { type: 'button', class: 'missing-btn', onClick: () => showMissing(r.idea, missing, criteria) }, count === 1 ? 'Manca 1 voto' : `Mancano ${count} voti`)
            : null,
        ),
      ),
      criteria.map((c) => {
        const s = r.perCriterion[c.key];
        const tip = s.byMember.map((v) => `${nameOf(v.memberId)}: ${v.value}`).join('\n');
        return h(
          'td',
          { class: ['score-cell', s.mean !== null && `m${Math.round(s.mean)}`, s.disagreement && 'is-disagreement'], title: tip || 'Nessun voto' },
          h(
            'button',
            {
              type: 'button',
              class: 'cell-btn',
              'aria-label': `${c.label}: ${s.mean === null ? 'nessun voto' : `media ${fmtMean(s.mean)}`}${s.disagreement ? ', disaccordo' : ''}. Mostra i voti di ciascuno`,
              onClick: () => showCell({ idea: r.idea, criterion: c, stats: s, voters, nameOf }),
            },
            fmtMean(s.mean),
            s.disagreement ? h('span', { class: 'flag', 'aria-hidden': 'true' }, '!') : null,
          ),
        );
      }),
      h('td', { class: 'total' }, r.score === null ? '-' : h('span', { class: 'bar', style: { '--value': `${r.score}%` } }, String(r.score))),
    );
  });
}

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
      pick('Prima', from, (value) => navigate(hrefWith(query, { da: value, a: to }).slice(1), { replace: true })),
      pick('Dopo', to, (value) => navigate(hrefWith(query, { da: from, a: value }).slice(1), { replace: true })),
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
                canWrite() ? h('button', { type: 'button', class: 'btn btn-ghost btn-small', onClick: () => renamePhoto(p) }, 'Rinomina') : null,
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
  const missingHost = h('div', { class: 'missing-summary', role: 'status' });
  // Sul telefono «I miei voti» diventa una scheda per idea; cambiando larghezza si ridisegna con gli stessi voti non salvati.
  const narrow = mode === 'mine' ? window.matchMedia?.('(max-width: 720px)') : null;
  let shown = { ideas: [], criteria: [] };

  const startWorking = () => {
    const mine = myScoreItem();
    working = structuredClone(mine?.data || { scores: {}, notes: {} });
    working.scores = working.scores || {};
    working.notes = working.notes || {};
  };

  const jumpToMissing = () => {
    const first = outlet.querySelector('.vote-select.is-empty');
    if (!first) return;
    first.scrollIntoView?.({ block: 'center', inline: 'center', behavior: 'smooth' });
    first.focus({ preventScroll: true });
  };

  const updateMissing = () => {
    if (mode !== 'mine' || !working || !shown.ideas.length) {
      mount(missingHost);
      return;
    }
    const { votes, ideas: count } = countMissing(shown.ideas.map((i) => i.id), shown.criteria, working.scores);
    if (!votes) {
      mount(missingHost, h('span', { class: 'missing-ok' }, 'Hai votato tutti i criteri di tutte le idee.'));
      return;
    }
    mount(
      missingHost,
      h('span', null, `Ti ${votes === 1 ? 'manca' : 'mancano'} ${plural(votes, 'voto', 'voti')} su ${plural(count, 'idea', 'idee')}`),
      h('button', { type: 'button', class: 'btn btn-ghost btn-small', onClick: jumpToMissing }, 'Vai al primo'),
    );
  };

  const updateDirty = () => {
    const mine = myScoreItem();
    const clean = sanitizeSnapshot('score', { data: working }).data;
    dirty = !deepEqual(clean, mine?.data || { scores: {}, notes: {} });
    saveButton.disabled = !dirty;
    setLeaveGuard(dirty ? () => confirmDialog('Hai voti non salvati. Uscire comunque?', { title: 'Voti non salvati', okLabel: 'Esci', danger: true }) : null);
    updateMissing();
  };

  const setVote = (ideaId, key, value) => {
    working.scores[ideaId] = { ...(working.scores[ideaId] || {}) };
    if (value === undefined) delete working.scores[ideaId][key];
    else working.scores[ideaId][key] = value;
    updateDirty();
  };

  const myVote = (idea, c) => voteSelect(working.scores[idea.id]?.[c.key], `${c.label}, ${idea.title}`, (value) => setVote(idea.id, c.key, value));

  const noteField = (idea, tag) =>
    h(tag, {
      class: tag === 'textarea' ? 'input' : 'input input-small',
      rows: tag === 'textarea' ? 2 : undefined,
      maxlength: 2000,
      value: working.notes[idea.id] || '',
      'aria-label': `Nota su ${idea.title}`,
      onInput: (e) => {
        working.notes[idea.id] = e.target.value;
        updateDirty();
      },
    });

  const myVotesBody = (visibleIdeas, criteria, evidence) =>
    visibleIdeas.map((idea) =>
      h(
        'tr',
        null,
        h('th', { scope: 'row' }, itemLink(idea), evidenceChips(evidence.get(idea.id))),
        criteria.map((c) => h('td', null, myVote(idea, c))),
        h('td', null, noteField(idea, 'input')),
      ),
    );

  const myVoteCards = (visibleIdeas, criteria, evidence) =>
    h(
      'div',
      { class: 'vote-cards' },
      visibleIdeas.map((idea) =>
        h(
          'section',
          { class: 'vote-card' },
          h('header', { class: 'vote-card-head' }, h('h2', null, itemLink(idea)), evidenceChips(evidence.get(idea.id))),
          criteria.map((c) =>
            h(
              'div',
              { class: 'vote-row' },
              h(
                'div',
                { class: 'vote-row-text' },
                h('div', { class: 'vote-row-label' }, h('strong', null, c.label), h('small', null, `×${c.weight}`)),
                c.description ? h('p', { class: 'vote-row-desc' }, c.description) : null,
              ),
              myVote(idea, c),
            ),
          ),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nota'), noteField(idea, 'textarea')),
        ),
      ),
    );

  const photoContent = (photo, evidence) => {
    if (photo?.kind !== 'scoresnap' || photo.deleted_at) {
      return emptyState('Fotografia non trovata: forse è stata archiviata.', button('Tutte le fotografie', { href: `#${PHOTOS_PATH}` }));
    }
    const rows = photoRanking(photo.data, keep);
    const nameOf = (id) => photo.data.names?.[id] || memberName(id);
    // Le prove si mostrano solo per le idee che esistono ancora.
    const evidenceOf = (idea) => {
      const live = getItem(idea.id);
      return live?.kind === 'idea' && !live.deleted_at ? evidence.get(idea.id) || NO_EVIDENCE : null;
    };
    return rows.length
      ? h(
          'div',
          { class: 'stack' },
          h('p', { class: 'muted small' }, `${EVIDENCE_LEGEND} Sono quelli di adesso, non del giorno della fotografia.`),
          matrix(
            photo.data.criteria,
            'Punteggio',
            teamBody(rows, photo.data.criteria, { nameOf, linkOf: photoIdeaLink, evidenceOf, voters: Object.keys(photo.data.votes || {}) }),
          ),
        )
      : emptyState('Nessuna idea in questa fotografia.');
  };

  const teamContent = (visibleIdeas, criteria, evidence) => {
    const voters = activeVoters();
    return h(
      'div',
      { class: 'stack' },
      h('p', { class: 'muted small' }, EVIDENCE_LEGEND),
      matrix(
        criteria,
        'Punteggio',
        teamBody(ranking(visibleIdeas, criteria, scoreItems()), criteria, {
          evidenceOf: (idea) => evidence.get(idea.id) || NO_EVIDENCE,
          voters,
          missingOf: (row) => missingVotes(row, criteria, voters),
        }),
      ),
    );
  };

  const mineContent = (visibleIdeas, criteria, evidence) => {
    const withoutTalks = visibleIdeas.some((idea) => !evidence.get(idea.id)?.conversations);
    return h(
      'div',
      { class: 'stack' },
      h('p', { class: 'muted small' }, EVIDENCE_LEGEND),
      withoutTalks ? h('p', { class: 'evidence-hint' }, 'Per le idee senza conversazioni, i voti sul problema e sul mercato sono solo ipotesi.') : null,
      narrow?.matches ? myVoteCards(visibleIdeas, criteria, evidence) : matrix(criteria, 'Nota', myVotesBody(visibleIdeas, criteria, evidence)),
    );
  };

  const SUBTITLES = {
    team: 'Media dei voti del team, pesata con i criteri. Il punto esclamativo segnala dove i voti distano almeno 2 punti: è lì che conviene discutere. Tocca una cella per vedere i voti di ciascuno, o il nome di un criterio per leggerne la descrizione.',
    mine: 'I tuoi voti da 1 a 5. Gli altri vedono la media e, toccando una cella, i voti di ciascuno. Tocca il nome di un criterio per leggerne la descrizione.',
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
    const evidence = evidenceByIdea(itemsOf('interview'), itemsOf('experiment'));
    if (mode === 'mine' && !working) startWorking();
    shown = mode === 'mine' ? { ideas: visibleIdeas, criteria } : { ideas: [], criteria: [] };
    let content;
    if (mode === 'photo') content = photoContent(photo, evidence);
    else if (mode === 'photos') content = photosPanel(query, keep);
    else if (!visibleIdeas.length) content = emptyState('Nessuna idea da valutare.');
    else if (mode === 'team') content = teamContent(visibleIdeas, criteria, evidence);
    else content = mineContent(visibleIdeas, criteria, evidence);
    updateMissing();

    const tab = (label, href, active) => h('a', { class: ['btn', 'btn-small', active ? 'btn-primary' : 'btn-ghost'], href, dataset: { replace: '' } }, label);
    const subtitle =
      mode === 'photo' && photo?.kind === 'scoresnap'
        ? `Fotografia «${photo.title}» del ${fmtDateTime(photo.created_at)}, salvata da ${memberName(photo.created_by)}. Criteri, pesi e voti sono quelli di quel momento: tocca una cella per vedere i voti di ciascuno.`
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
          canWrite() && mode === 'photo' && photo?.kind === 'scoresnap' && !photo.deleted_at ? button('Rinomina', { iconName: 'edit', onClick: () => renamePhoto(photo) }) : null,
          canWrite() && mode === 'team' ? button('Salva fotografia', { iconName: 'image', onClick: takePhoto }) : null,
          canWrite() ? button('Criteri', { iconName: 'edit', onClick: () => criteriaEditor(criteria, saveCriteria) }) : null,
        ],
      }),
      h(
        'label',
        { class: 'check' },
        h('input', { type: 'checkbox', checked: includeAll, onChange: (e) => navigate(hrefWith(query, { tutte: e.target.checked ? '1' : null }).slice(1), { replace: true }) }),
        'Mostra anche le idee scartate',
      ),
      content,
      errorHost,
      mode === 'mine' ? h('footer', { class: 'save-bar' }, missingHost, message, saveButton) : null,
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
    if (['score', 'criteria', 'idea', 'scoresnap', 'interview', 'experiment'].includes(item.kind) && !(mode === 'mine' && byMe && item.kind === 'score')) render();
  });
  narrow?.addEventListener?.('change', render);
  return () => {
    off();
    narrow?.removeEventListener?.('change', render);
    setLeaveGuard(null);
  };
}
