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
import { textsFor, tx } from '../i18n/index.js';
import { LANGUAGES } from '../i18n/languages.js';
import { archiveWithConfirm } from './actions.js';
import { saveWithMerge } from './merge.js';
import { avatar, button, emptyState, errorBox, itemLink, pageHeader } from './components.js';

const t = tx.scoring;
const signed = (n) => (n > 0 ? `+${n}` : String(n));
const fmtMean = (v) => (v === null ? '-' : v.toFixed(1));
const placing = (p) => (p ? t.place(p.rank, p.score) : '-');

// Gli indirizzi della pagina restano uguali in ogni lingua.
const PAGE = '#/valutazione'; // i18n-ignore
const MINE_HREF = '#/valutazione?vista=miei'; // i18n-ignore
const PHOTOS_PATH = '/valutazione?vista=fotografie'; // i18n-ignore
const compareHref = (from, to) => `#${PHOTOS_PATH}&da=${from}&a=${to}`; // i18n-ignore

// Cosa manca a una descrizione per spiegare la scala; stringa vuota se è chiara.
function endsProblem(description) {
  const { high, low } = scaleEnds(description);
  if (high && low) return '';
  if (!high && !low) return t.criterion.noEnds;
  return high ? t.criterion.noLow : t.criterion.noHigh;
}

export function criteriaEditor(current, onSave) {
  const rows = current.map((c) => ({ ...c }));
  const host = h('div');
  const message = h('input', { class: 'input', type: 'text', maxlength: LIMITS.message, placeholder: t.editor.messagePlaceholder });
  const criterionRow = (row, i) => {
    const warning = h('small', { class: 'crit-warn' });
    const tr = h(
      'tr',
      null,
      h('td', null, h('input', { class: 'input', value: row.label, maxlength: 80, 'aria-label': t.editor.criterionName, onInput: (e) => (row.label = e.target.value) })),
      h(
        'td',
        null,
        h('input', {
          class: 'input',
          value: row.description || '',
          maxlength: 240,
          placeholder: '5 = ...; 1 = ...',
          'aria-label': t.editor.description,
          onInput: (e) => {
            row.description = e.target.value;
            check();
          },
        }),
        warning,
      ),
      h('td', null, h('select', { class: 'input', 'aria-label': t.editor.weight, onChange: (e) => (row.weight = Number(e.target.value)) }, [0, 1, 2, 3, 4, 5].map((w) => h('option', { value: w, selected: w === row.weight }, `×${w}`)))),
      h(
        'td',
        { class: 'row-actions' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': t.editor.up, disabled: i === 0, onClick: () => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; render(); } }, '↑'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': t.editor.down, disabled: i === rows.length - 1, onClick: () => { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; render(); } }, '↓'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': t.editor.remove, onClick: () => { rows.splice(i, 1); render(); } }, '×'),
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
      h('p', { class: 'muted small' }, t.editor.help),
      h(
        'table',
        { class: 'table criteria-table' },
        h('thead', null, h('tr', null, h('th', null, t.editor.criterion), h('th', null, t.editor.description), h('th', null, t.editor.weight), h('th', null, ''))),
        h('tbody', null, rows.map(criterionRow)),
      ),
      h('button', { type: 'button', class: 'btn btn-ghost btn-small', onClick: () => { rows.push({ key: newKey(), label: t.editor.newCriterion, description: '', weight: 1 }); render(); } }, icon('plus', 14), t.editor.add),
      h('p', { class: 'muted small' }, t.editor.rules),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, t.editor.message), message),
    );
  };
  render();
  openModal({
    title: t.editor.title,
    wide: true,
    body: host,
    actions: [
      { label: tx.common.actions.cancel, value: false },
      { label: t.editor.save, kind: 'primary', onClick: async () => !(await onSave(rows, message.value)) },
    ],
  });
}

// La chiave di un criterio nuovo è un dato salvato: resta la stessa in ogni lingua.
const newKey = () => `${slugKey('nuovo')}-${shortId().slice(0, 4)}`; // i18n-ignore

// Prima di un cambio che sposta la classifica si salva una fotografia, per poter confrontare prima e dopo.
// Restituisce false se la fotografia non riesce e si sceglie di non continuare.
async function photoBeforeCriteria(before, after) {
  const hasVotes = scoreItems().some((s) => Object.keys(s.data?.scores || {}).length);
  if (!hasVotes || !criteriaWeightsChanged(before, after)) return true;
  const title = t.photos.beforeCriteria(nextPhotoName());
  try {
    await createItem('scoresnap', { title, data: currentPhoto() }, t.photos.message(title));
    toast(t.photos.savedBeforeCriteria(title), { type: 'success' });
    return true;
  } catch (error) {
    return confirmDialog(t.photos.failedQuestion(error.message), { title: t.photos.failedTitle, okLabel: t.photos.saveAnyway });
  }
}

async function saveCriteria(rows, message) {
  const item = singleton('criteria');
  try {
    if (item) {
      const next = sanitizeSnapshot('criteria', { data: { criteria: rows } }).data.criteria;
      if (!(await photoBeforeCriteria(item.data?.criteria || [], next))) return false;
      const base = snapshotOf(item);
      const result = await saveWithMerge(item, base, { ...base, data: { criteria: rows } }, message || t.editor.updateMessage);
      if (result.cancelled) return false;
    } else {
      await createItem('criteria', { title: t.editor.title, data: { criteria: rows } }, message || t.editor.firstMessage);
    }
    toast(t.editor.saved, { type: 'success' });
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
    h('span', { class: ['ev-chip', !e.conversations && 'is-warn'] }, e.conversations ? t.evidence.conversations(e.conversations) : t.evidence.noConversations),
    h('span', { class: ['ev-chip', !e.commitments && 'is-zero'] }, t.evidence.commitments(e.commitments)),
    h('span', { class: ['ev-chip', !e.experiments && 'is-zero'] }, t.evidence.experiments(e.experiments)),
  );
}

const EVIDENCE_LEGEND = t.evidence.legend;

const closeAction = [{ label: tx.common.actions.close, value: false }];

function showCriterion(c) {
  const problem = endsProblem(c.description);
  openModal({
    title: c.label,
    body: h(
      'div',
      { class: 'stack' },
      c.description ? h('p', null, c.description) : h('p', { class: 'muted' }, t.criterion.noDescription),
      h('p', { class: 'muted' }, c.weight ? t.criterion.weight(c.weight) : t.criterion.weightZero),
      problem ? h('p', { class: 'crit-warn' }, t.criterion.unclear(problem)) : null,
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
      h('p', null, h('strong', null, stats.mean === null ? t.cell.noVotes : t.cell.mean(fmtMean(stats.mean)))),
      stats.byMember.length ? h('ul', null, stats.byMember.map((v) => h('li', null, `${nameOf(v.memberId)}: ${v.value}`))) : null,
      missing.length ? h('p', { class: 'muted' }, t.cell.notYet(missing.length, missing.map(nameOf).join(', '))) : null,
      stats.disagreement ? h('p', { class: 'crit-warn' }, t.cell.disagreement(stats.min, stats.max, stats.spread, DISAGREEMENT_SPREAD)) : null,
    ),
    actions: closeAction,
  });
}

function showMissing(idea, missing, criteria) {
  const labelOf = new Map(criteria.map((c) => [c.key, c.label]));
  openModal({
    title: t.missing.title,
    body: h(
      'div',
      { class: 'stack' },
      h('p', null, t.missing.intro(idea.title)),
      h(
        'ul',
        null,
        missing.map((m) =>
          h('li', null, `${memberName(m.memberId)}: ${m.keys.length === criteria.length ? t.missing.allOfIdea : m.keys.map((k) => labelOf.get(k)).join(', ')}`),
        ),
      ),
      h('p', { class: 'muted' }, t.missing.where),
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
  return `${PAGE}${search ? `?${search}` : ''}`;
}

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

// Il numero continua anche dopo archiviazioni e rinomine, così non si ripete: vale anche per i nomi dati
// in un'altra lingua da chi ha il sito in italiano o in inglese («Fotografia 3», "Snapshot 4").
const PHOTO_NUMBER = new RegExp(`^(?:${LANGUAGES.map((lang) => textsFor(lang).scoring.photos.prefix).join('|')}) (\\d+)\\b`);

function nextPhotoName() {
  const all = itemsOf('scoresnap', { includeDeleted: true });
  const numbers = all.map((p) => Number(PHOTO_NUMBER.exec(p.title)?.[1]) || 0);
  return t.photos.numbered(Math.max(all.length, ...numbers) + 1);
}

function nameDialog({ title, value, okLabel, intro, save }) {
  const name = h('input', { class: 'input', type: 'text', maxlength: LIMITS.title, value, 'aria-label': t.photos.nameLabel });
  openModal({
    title,
    body: h('div', { class: 'stack' }, intro ? h('p', { class: 'muted' }, intro) : null, h('label', { class: 'field' }, h('span', { class: 'field-label' }, t.photos.name), name)),
    actions: [
      { label: tx.common.actions.cancel, value: false },
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
    title: t.photos.takeTitle,
    value: nextPhotoName(),
    okLabel: t.photos.take,
    intro: t.photos.takeIntro,
    save: async (title) => {
      await createItem('scoresnap', { title, data: currentPhoto() }, t.photos.message(title));
      toast(t.photos.saved, { type: 'success' });
      navigate(PHOTOS_PATH, { replace: true });
    },
  });
}

function renamePhoto(photo) {
  nameDialog({
    title: t.photos.renameTitle,
    value: photo.title,
    okLabel: tx.common.actions.rename,
    save: async (title) => {
      const current = getItem(photo.id) || photo;
      const base = snapshotOf(current);
      const result = await saveWithMerge(current, base, { ...base, title }, t.photos.renamedMessage(title));
      if (!result.cancelled) toast(t.photos.renamed, { type: 'success' });
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
    h('th', null, t.idea),
    criteria.map((c) =>
      h(
        'th',
        { class: 'crit', scope: 'col' },
        h(
          'button',
          { type: 'button', class: 'crit-btn', title: c.description || undefined, 'aria-label': t.matrix.criterionButton(c.label, c.weight), onClick: () => showCriterion(c) },
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
            ? h('button', { type: 'button', class: 'missing-btn', onClick: () => showMissing(r.idea, missing, criteria) }, t.matrix.missingVotes(count))
            : null,
        ),
      ),
      criteria.map((c) => {
        const s = r.perCriterion[c.key];
        const tip = s.byMember.map((v) => `${nameOf(v.memberId)}: ${v.value}`).join('\n');
        return h(
          'td',
          { class: ['score-cell', s.mean !== null && `m${Math.round(s.mean)}`, s.disagreement && 'is-disagreement'], title: tip || t.matrix.noVotes },
          h(
            'button',
            {
              type: 'button',
              class: 'cell-btn',
              'aria-label': t.matrix.cell(c.label, s.mean === null ? null : fmtMean(s.mean), s.disagreement),
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
  if (row.move === null) return row.after ? t.compare.newIdea : t.compare.notScored;
  if (row.move > 0) return `▲ ${row.move}`;
  if (row.move < 0) return `▼ ${-row.move}`;
  return '=';
}

const CRITERIA_CHANGE = {
  added: (c) => t.compare.added(c.label, c.to),
  removed: (c) => t.compare.removed(c.label, c.from),
  weight: (c) => t.compare.weight(c.label, c.from, c.to),
  renamed: (c) => t.compare.renamed(c.from, c.label),
};

function voterLabel(v) {
  const parts = [
    v.changed && t.compare.changedVotes(v.changed),
    v.added && t.compare.newVotes(v.added),
    v.removed && t.compare.removedVotes(v.removed),
  ].filter(Boolean);
  return `${v.name || memberName(v.memberId)}: ${parts.join(', ')}`;
}

function comparisonView(cmp) {
  if (!cmp.rows.length) return emptyState(t.compare.noIdeas);
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
        h('thead', null, h('tr', null, h('th', null, t.idea), h('th', null, t.photos.before), h('th', null, t.photos.after), h('th', null, t.compare.points), h('th', null, t.compare.position))),
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
        h('h3', null, t.compare.criteria),
        cmp.criteria.length
          ? h('ul', null, cmp.criteria.map((c) => h('li', null, CRITERIA_CHANGE[c.change](c))))
          : h('p', { class: 'muted' }, t.compare.noCriteriaChanges),
      ),
      h(
        'section',
        null,
        h('h3', null, t.compare.votes),
        cmp.voters.length ? h('ul', null, cmp.voters.map((v) => h('li', null, voterLabel(v)))) : h('p', { class: 'muted' }, t.compare.noVoteChanges),
      ),
    ),
    changed.length
      ? h(
          'section',
          null,
          h('h3', null, t.compare.means),
          changed.map((r) =>
            h(
              'details',
              { class: 'compare-means' },
              h('summary', null, `${r.title}: ${t.compare.criteriaCount(r.means.length)}`),
              h('ul', null, r.means.map((m) => h('li', null, `${m.label}: ${fmtMean(m.from)} → ${fmtMean(m.to)}`))),
            ),
          ),
        )
      : null,
  );
}

function photosPanel(query, keep) {
  const list = photoItems();
  const saveButton = canWrite() ? button(t.photos.take, { kind: 'primary', iconName: 'image', onClick: takePhoto }) : null;
  if (!list.length) {
    return emptyState(t.photos.empty, saveButton);
  }
  const valid = (value) => value === 'adesso' || list.some((p) => p.id === value);
  const asked = query.get('da'); // i18n-ignore: parametro dell'indirizzo
  const from = valid(asked) ? asked : list[0].id;
  const to = valid(query.get('a')) ? query.get('a') : 'adesso';
  const dataOf = (value) => (value === 'adesso' ? currentPhoto() : list.find((p) => p.id === value).data);
  const options = (selected) => [
    h('option', { value: 'adesso', selected: selected === 'adesso' }, t.photos.now),
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
      pick(t.photos.before, from, (value) => navigate(hrefWith(query, { da: value, a: to }).slice(1), { replace: true })),
      pick(t.photos.after, to, (value) => navigate(hrefWith(query, { da: from, a: value }).slice(1), { replace: true })),
    ),
    from === to ? h('p', { class: 'muted' }, t.photos.sameTwice) : comparisonView(comparePhotos(dataOf(from), dataOf(to), keep)),
    h('div', { class: 'section-head' }, h('h2', null, t.photos.savedList), saveButton),
    h(
      'div',
      { class: 'table-scroll' },
      h(
        'table',
        { class: 'table' },
        h('thead', null, h('tr', null, h('th', null, t.photos.name), h('th', null, t.photos.date), h('th', null, t.photos.savedBy), h('th', null, ''))),
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
                h('a', { class: 'btn btn-ghost btn-small', href: hrefWith(query, { da: p.id, a: 'adesso' }) }, t.photos.compareNow),
                canWrite() ? h('button', { type: 'button', class: 'btn btn-ghost btn-small', onClick: () => renamePhoto(p) }, tx.common.actions.rename) : null,
                canWrite()
                  ? h('button', { type: 'button', class: 'btn btn-ghost btn-small', onClick: () => archiveWithConfirm(p, { backTo: PHOTOS_PATH }) }, tx.common.actions.archive)
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
  const includeAll = query.get('tutte') === '1'; // i18n-ignore: parametro dell'indirizzo
  const keep = (idea) => includeAll || idea.status !== 'scartata';
  let working = null;
  let dirty = false;
  const message = h('input', { class: 'input', type: 'text', maxlength: LIMITS.message, placeholder: t.mine.notePlaceholder });
  const saveButton = h('button', { type: 'button', class: 'btn btn-primary', disabled: true }, icon('commit', 16), h('span', null, t.mine.save));
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
      mount(missingHost, h('span', { class: 'missing-ok' }, t.mine.allDone));
      return;
    }
    mount(
      missingHost,
      h('span', null, t.mine.toGive(votes, count)),
      h('button', { type: 'button', class: 'btn btn-ghost btn-small', onClick: jumpToMissing }, t.mine.goToFirst),
    );
  };

  const updateDirty = () => {
    const mine = myScoreItem();
    const clean = sanitizeSnapshot('score', { data: working }).data;
    dirty = !deepEqual(clean, mine?.data || { scores: {}, notes: {} });
    saveButton.disabled = !dirty;
    setLeaveGuard(dirty ? () => confirmDialog(t.mine.leaveQuestion, { title: t.mine.leaveTitle, okLabel: t.mine.leave, danger: true }) : null);
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
      'aria-label': t.mine.noteOn(idea.title),
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
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, t.note), noteField(idea, 'textarea')),
        ),
      ),
    );

  const photoContent = (photo, evidence) => {
    if (photo?.kind !== 'scoresnap' || photo.deleted_at) {
      return emptyState(t.photos.notFound, button(t.photos.all, { href: `#${PHOTOS_PATH}` }));
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
          h('p', { class: 'muted small' }, `${EVIDENCE_LEGEND} ${t.evidence.now}`),
          matrix(
            photo.data.criteria,
            t.score,
            teamBody(rows, photo.data.criteria, { nameOf, linkOf: photoIdeaLink, evidenceOf, voters: Object.keys(photo.data.votes || {}) }),
          ),
        )
      : emptyState(t.photos.noIdeas);
  };

  const teamContent = (visibleIdeas, criteria, evidence) => {
    const voters = activeVoters();
    return h(
      'div',
      { class: 'stack' },
      h('p', { class: 'muted small' }, EVIDENCE_LEGEND),
      matrix(
        criteria,
        t.score,
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
      withoutTalks ? h('p', { class: 'evidence-hint' }, t.evidence.withoutTalks) : null,
      narrow?.matches ? myVoteCards(visibleIdeas, criteria, evidence) : matrix(criteria, t.note, myVotesBody(visibleIdeas, criteria, evidence)),
    );
  };

  const render = () => {
    const criteria = criteriaList();
    if (!criteria.length && (mode === 'team' || mode === 'mine')) {
      mount(
        outlet,
        pageHeader({ title: t.title }),
        emptyState(
          t.noCriteria,
          canWrite() ? button(t.createDefaults, { kind: 'primary', onClick: () => saveCriteria(DEFAULT_CRITERIA, t.defaultsMessage) }) : null,
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
    else if (!visibleIdeas.length) content = emptyState(t.noIdeas);
    else if (mode === 'team') content = teamContent(visibleIdeas, criteria, evidence);
    else content = mineContent(visibleIdeas, criteria, evidence);
    updateMissing();

    const tab = (label, href, active) => h('a', { class: ['btn', 'btn-small', active ? 'btn-primary' : 'btn-ghost'], href, dataset: { replace: '' } }, label);
    const subtitle =
      mode === 'photo' && photo?.kind === 'scoresnap'
        ? t.subtitles.photo(photo.title, fmtDateTime(photo.created_at), memberName(photo.created_by))
        : t.subtitles[mode] || '';

    mount(
      outlet,
      pageHeader({
        title: t.title,
        subtitle,
        actions: [
          tab(t.tabs.team, PAGE, mode === 'team'),
          tab(t.tabs.mine, MINE_HREF, mode === 'mine'),
          tab(t.tabs.photos, `#${PHOTOS_PATH}`, mode === 'photos' || mode === 'photo'),
          mode === 'photo' && photo?.kind === 'scoresnap' ? button(t.photos.compareNow, { iconName: 'diff', href: compareHref(photo.id, 'adesso') }) : null,
          canWrite() && mode === 'photo' && photo?.kind === 'scoresnap' && !photo.deleted_at ? button(tx.common.actions.rename, { iconName: 'edit', onClick: () => renamePhoto(photo) }) : null,
          canWrite() && mode === 'team' ? button(t.photos.take, { iconName: 'image', onClick: takePhoto }) : null,
          canWrite() ? button(t.criteriaButton, { iconName: 'edit', onClick: () => criteriaEditor(criteria, saveCriteria) }) : null,
        ],
      }),
      h(
        'label',
        { class: 'check' },
        h('input', { type: 'checkbox', checked: includeAll, onChange: (e) => navigate(hrefWith(query, { tutte: e.target.checked ? '1' : null }).slice(1), { replace: true }) }),
        t.showDiscarded,
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
      const title = t.mine.itemTitle(state.me?.display_name || tx.common.roles.member.toLowerCase());
      try {
        if (mine) {
          const base = snapshotOf(mine);
          const result = await saveWithMerge(mine, base, { ...base, data: working }, message.value || t.mine.updateMessage);
          if (result.cancelled) return;
        } else {
          await createItem('score', { title, data: working }, message.value || t.mine.firstMessage);
        }
        message.value = '';
        startWorking();
        updateDirty();
        toast(t.mine.saved, { type: 'success' });
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
