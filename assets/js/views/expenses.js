import { api } from '../lib/api.js';
import { busy, confirmDialog, h, mount, openModal, svg, toast } from '../lib/dom.js';
import { dayKey, downloadFile, fmtDate, plural, shortId, slugFile } from '../lib/format.js';
import { icon } from '../lib/icons.js';
import {
  CURRENCIES,
  EXPENSE_CATEGORIES,
  EXPENSE_LIMITS,
  MOVEMENT_TYPES,
  SPLIT_MODES,
  amountText,
  categoryLabel,
  currencyDigits,
  distribute,
  expenseProblem,
  fetchRate,
  fmtAmount,
  groupBalances,
  groupPeople,
  groupStats,
  ibanValid,
  inGroupCurrency,
  involves,
  looksLikeIban,
  movementEffects,
  movementShares,
  movementsCsv,
  parseAmount,
  payInfo,
  personName,
  personOfMember,
  sanitizeExpense,
  sanitizeExpenseGroup,
  settleUp,
  sortMovements,
} from '../expenses.js';
import { imageUrl, uploadNoteImage } from '../notes.js';
import { navigate } from '../router.js';
import { EXPENSE_KINDS } from '../schema.js';
import { archiveItem, canWrite, createItem, getItem, itemsOf, on, saveSnapshot, state, statusError } from '../store.js';
import { button, emptyState, pageHeader, tabs } from './components.js';

const TABS = [
  ['movimenti', 'Movimenti'],
  ['saldi', 'Saldi'],
  ['statistiche', 'Statistiche'],
  ['gruppo', 'Gruppo'],
];

const today = () => dayKey(new Date());
const movementsOf = (groupId) => itemsOf('expense').filter((m) => m.data.group === groupId);
const isGroup = (item) => item?.kind === 'expensegroup' && !item.deleted_at;
const teamPeople = () => state.members.filter((m) => m.role !== 'advisor').map((m) => ({ id: shortId(), name: m.display_name, member: m.user_id }));

function balanceText(balance, currency, { you = false } = {}) {
  if (balance > 0) return `${you ? 'ricevi' : 'riceve'} ${fmtAmount(balance, currency)}`;
  if (balance < 0) return `${you ? 'devi' : 'deve'} ${fmtAmount(-balance, currency)}`;
  return you ? 'sei in pari' : 'in pari';
}

const balanceClass = (balance) => (balance > 0 ? 'is-credit' : balance < 0 ? 'is-debit' : 'is-even');

function whoLine(group, m) {
  const d = m.data;
  if (d.type === 'rimborso') return `${personName(group, d.paid_by)} ha dato a ${personName(group, Object.keys(d.split.shares)[0])}`;
  if (d.type === 'entrata') return `Ricevuto da ${personName(group, d.paid_by)}`;
  return `Pagato da ${personName(group, d.paid_by)}`;
}

// Cosa cambia per chi guarda: quanto anticipa, quanto gli tocca, quanto riceve.
function myPart(group, m, me) {
  if (!me || !involves(m, me.id)) return null;
  const effect = movementEffects(m.data, group.data.currency).get(me.id) || 0;
  const cur = group.data.currency;
  const d = m.data;
  if (d.type === 'rimborso') return d.paid_by === me.id ? `Hai dato ${fmtAmount(effect, cur)}` : `Hai ricevuto ${fmtAmount(-effect, cur)}`;
  if (d.type === 'entrata') return effect >= 0 ? `Ti spettano ${fmtAmount(effect, cur)}` : `Da dividere con gli altri: ${fmtAmount(-effect, cur)}`;
  if (effect > 0) return `Hai anticipato ${fmtAmount(effect, cur)}`;
  return effect < 0 ? `La tua parte: ${fmtAmount(-effect, cur)}` : 'Sei in pari';
}

function exportCsv(group, movements) {
  const csv = movementsCsv(group, movements);
  downloadFile(`spese-${slugFile(group.title)}-${today()}.csv`, `﻿${csv}`, 'text/csv;charset=utf-8');
}

function receiptImage(path, alt) {
  const img = h('img', { class: 'exp-receipt-img is-loading', alt, loading: 'lazy' });
  imageUrl(path).then((url) => {
    if (url) {
      img.src = url;
      img.classList.remove('is-loading');
    } else {
      img.replaceWith(h('span', { class: 'muted small' }, 'Scontrino non più disponibile'));
    }
  });
  return img;
}

// Lo scontrino tolto o sostituito si cancella, se nessun'altra spesa lo usa (lo decide il database).
async function dropReceipt(path) {
  if (!path) return;
  try {
    const orphans = await api.noteImageOrphans([path]);
    if (orphans.length) await api.removeNoteImages(orphans);
  } catch {
    // resta: la pulizia periodica lo toglierà
  }
}

// --- Persone del gruppo -------------------------------------------------------

function peopleEditor(initial, { usedCount = () => 0 } = {}) {
  let people = initial.map((p) => ({ ...p }));
  const host = h('div', { class: 'exp-people' });
  const memberOptions = (current) => {
    const taken = new Set(people.filter((p) => p !== current && p.member).map((p) => p.member));
    return state.members.filter((m) => !taken.has(m.user_id));
  };
  const render = () => {
    const rows = people.map((p, index) => {
      const used = usedCount(p.id);
      return h(
        'div',
        { class: 'exp-person-row' },
        h('input', {
          class: 'input exp-person-name-input',
          type: 'text',
          value: p.name,
          maxlength: EXPENSE_LIMITS.name,
          'aria-label': `Nome della persona ${index + 1}`,
          onInput: (e) => {
            p.name = e.target.value;
          },
        }),
        h(
          'select',
          {
            class: 'input',
            'aria-label': `Account di ${p.name || `persona ${index + 1}`}`,
            onChange: (e) => {
              p.member = e.target.value || undefined;
              const member = state.members.find((m) => m.user_id === p.member);
              if (member && !p.name.trim()) p.name = member.display_name;
              render();
            },
          },
          h('option', { value: '' }, 'Senza account'),
          memberOptions(p).map((m) => h('option', { value: m.user_id, selected: m.user_id === p.member }, m.display_name)),
        ),
        h('input', {
          class: 'input exp-person-pay-input',
          type: 'text',
          value: p.pay || '',
          maxlength: EXPENSE_LIMITS.pay,
          placeholder: 'Come pagarmi: IBAN o link PayPal',
          'aria-label': `Come pagare ${p.name || `persona ${index + 1}`}`,
          onInput: (e) => {
            p.pay = e.target.value;
          },
        }),
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn',
            'aria-label': `Togli ${p.name || 'questa persona'}`,
            title: used ? `Non si può togliere: è in ${plural(used, 'movimento', 'movimenti')}` : 'Togli dal gruppo',
            disabled: used > 0,
            onClick: () => {
              people = people.filter((x) => x !== p);
              render();
            },
          },
          icon('close', 16),
        ),
      );
    });
    const missing = state.members.filter((m) => m.role !== 'advisor' && !people.some((p) => p.member === m.user_id));
    mount(
      host,
      rows.length ? rows : h('p', { class: 'muted small' }, 'Nessuna persona: aggiungi chi partecipa alle spese.'),
      h(
        'div',
        { class: 'toolbar toolbar-wrap' },
        people.length < EXPENSE_LIMITS.people
          ? h('button', { type: 'button', class: 'btn btn-small', onClick: () => { people.push({ id: shortId(), name: '' }); render(); [...host.querySelectorAll('.exp-person-name-input')].at(-1)?.focus(); } }, icon('plus', 14), h('span', null, 'Aggiungi una persona'))
          : null,
        missing.length
          ? h('button', { type: 'button', class: 'btn btn-small', onClick: () => { people.push(...missing.map((m) => ({ id: shortId(), name: m.display_name, member: m.user_id }))); render(); } }, icon('users', 14), h('span', null, `Aggiungi i membri del team (${missing.length})`))
          : null,
      ),
    );
  };
  render();
  return { node: host, read: () => people.map((p) => ({ id: p.id, name: p.name, member: p.member, pay: p.pay })) };
}

function groupFields(group, { movements = [] } = {}) {
  const used = (id) => movements.filter((m) => involves(m, id)).length;
  const name = h('input', { class: 'input', type: 'text', value: group?.title || '', maxlength: 200, placeholder: 'Per esempio: Costi della startup' });
  const currency = h(
    'select',
    { class: 'input', disabled: movements.length > 0 },
    CURRENCIES.map(([code, label]) => h('option', { value: code, selected: code === (group?.data.currency || 'EUR') }, `${code}, ${label}`)),
  );
  const notes = h('textarea', { class: 'input', rows: 2, maxlength: EXPENSE_LIMITS.groupNotes, value: group?.data.notes || '', placeholder: 'Facoltative: a cosa serve il gruppo, come vi rimborsate' });
  const people = peopleEditor(group ? groupPeople(group) : teamPeople(), { usedCount: used });
  const node = h(
    'div',
    { class: 'form-grid' },
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Nome del gruppo'), name),
    h(
      'label',
      { class: 'field' },
      h('span', { class: 'field-label' }, 'Valuta del gruppo'),
      currency,
      movements.length ? h('span', { class: 'field-help' }, 'Non si cambia dopo il primo movimento: i cambi salvati sono verso questa valuta.') : h('span', { class: 'field-help' }, 'Saldi e statistiche sono in questa valuta. Le spese possono essere anche in altre.'),
    ),
    h(
      'div',
      { class: 'field is-wide' },
      h('span', { class: 'field-label' }, 'Persone'),
      h('span', { class: 'field-help' }, 'Chi paga e chi divide le spese. Chi non ha un account si aggiunge solo con il nome. «Come pagarmi» compare nei Saldi a chi deve dare dei soldi.'),
      people.node,
    ),
    h('label', { class: 'field is-wide' }, h('span', { class: 'field-label' }, 'Note'), notes),
  );
  const read = () => ({
    title: name.value.trim(),
    data: sanitizeExpenseGroup({ currency: currency.value, people: people.read(), notes: notes.value }),
  });
  const problem = () => {
    if (!name.value.trim()) return 'Dai un nome al gruppo.';
    const raw = people.read();
    if (raw.some((p) => !p.name.trim())) return 'Ogni persona ha bisogno di un nome.';
    if (!raw.length) return 'Aggiungi almeno una persona.';
    const badIban = raw.find((p) => looksLikeIban(p.pay) && !ibanValid(p.pay));
    if (badIban) return `L'IBAN di ${badIban.name.trim()} non torna: controlla le cifre.`;
    const kept = new Set(raw.map((p) => p.id));
    const lost = group ? groupPeople(group).filter((p) => !kept.has(p.id) && used(p.id)) : [];
    return lost.length ? `${lost.map((p) => p.name).join(', ')} è nei movimenti: non si può togliere.` : null;
  };
  return { node, read, problem, focus: () => name.focus() };
}

function openGroupDialog() {
  const fields = groupFields(null);
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const fail = (text) => {
    error.textContent = text;
    error.hidden = false;
    return true;
  };
  openModal({
    title: 'Nuovo gruppo di spese',
    wide: true,
    body: [fields.node, error],
    actions: [
      { label: 'Annulla', value: false },
      {
        label: 'Crea il gruppo',
        kind: 'primary',
        onClick: async () => {
          const problem = fields.problem();
          if (problem) return fail(problem);
          try {
            const row = await createItem('expensegroup', fields.read(), 'Nuovo gruppo di spese');
            navigate(`/spese/${row.id}`);
            return false;
          } catch (err) {
            return fail(err?.message || 'Non sono riuscito a creare il gruppo.');
          }
        },
      },
    ],
  });
  setTimeout(() => fields.focus(), 0);
}

// --- Elenco dei gruppi --------------------------------------------------------

function groupCard(group) {
  const movements = movementsOf(group.id);
  const me = personOfMember(group, state.user?.id);
  const currency = group.data.currency;
  const stats = groupStats(group, movements);
  const balance = me ? groupBalances(group, movements).get(me.id)?.balance || 0 : null;
  const last = movements.reduce((max, m) => (m.data.date > max ? m.data.date : max), '');
  return h(
    'a',
    { class: 'card exp-group-card', href: `#/spese/${group.id}`, dataset: { id: group.id } },
    h('div', { class: 'card-head' }, h('h2', null, group.title), h('span', { class: 'muted small' }, currency)),
    h('p', { class: 'muted small' }, groupPeople(group).map((p) => p.name).join(', ') || 'Nessuna persona'),
    h('p', null, h('strong', null, fmtAmount(stats.total, currency)), ` di spese · ${plural(movements.length, 'movimento', 'movimenti')}`),
    me ? h('p', { class: ['exp-balance', balanceClass(balance)] }, `Tu: ${balanceText(balance, currency, { you: true })}`) : null,
    last ? h('p', { class: 'muted small' }, `Ultimo movimento: ${fmtDate(last)}`) : null,
  );
}

export function expensesView(outlet) {
  const writable = canWrite();
  const lastActivity = (g) => movementsOf(g.id).reduce((max, m) => (m.updated_at > max ? m.updated_at : max), g.updated_at);
  const render = () => {
    const list = itemsOf('expensegroup').sort((a, b) => lastActivity(b).localeCompare(lastActivity(a)));
    const create = writable ? button('Nuovo gruppo', { kind: 'primary', iconName: 'plus', onClick: openGroupDialog }) : null;
    mount(
      outlet,
      pageHeader({ title: 'Spese', subtitle: 'Chi ha pagato cosa e chi deve a chi.', actions: [create] }),
      list.length
        ? h('div', { class: 'cards exp-groups' }, list.map(groupCard))
        : emptyState(
            'Nessun gruppo di spese. Creane uno per ogni occasione: i costi della startup, una trasferta, un evento.',
            writable ? button('Crea il primo gruppo', { kind: 'primary', iconName: 'plus', onClick: openGroupDialog }) : null,
          ),
    );
  };
  render();
  const offs = [
    on('item', ({ item }) => {
      if (EXPENSE_KINDS.includes(item.kind)) render();
    }),
    on('members', render),
  ];
  return () => offs.forEach((off) => off());
}

// --- Finestra di un movimento -------------------------------------------------

function movementDetails(group, m) {
  const d = m.data;
  const cur = group.data.currency;
  const { total, shares } = inGroupCurrency(d, cur);
  const rows = [
    ['Tipo', MOVEMENT_TYPES.find(([t]) => t === d.type)?.[1]],
    ['Importo', d.currency === cur ? fmtAmount(d.amount, cur) : `${fmtAmount(d.amount, d.currency)} (${fmtAmount(total, cur)} al cambio ${String(d.rate).replace('.', ',')})`],
    ['Data', fmtDate(d.date)],
    [d.type === 'entrata' ? 'Ricevuto da' : d.type === 'rimborso' ? 'Da' : 'Pagato da', personName(group, d.paid_by)],
    d.type === 'rimborso'
      ? ['A', personName(group, Object.keys(d.split.shares)[0])]
      : ['Diviso tra', [...shares].map(([id, value]) => `${personName(group, id)} ${fmtAmount(value, cur)}`).join(', ')],
    d.type === 'spesa' ? ['Categoria', categoryLabel(d.category)] : null,
    d.note ? ['Nota', d.note] : null,
  ].filter(Boolean);
  return h(
    'div',
    { class: 'exp-details' },
    h('dl', { class: 'field-view' }, rows.map(([label, value]) => [h('dt', null, label), h('dd', null, value)])),
    d.receipt ? receiptImage(d.receipt, `Scontrino: ${m.title}`) : null,
    h('p', null, h('a', { href: `#/storico/${m.id}` }, 'Storico delle modifiche')),
  );
}

function openMovementDialog(group, movement, { onSaved } = {}) {
  if (!canWrite()) {
    openModal({ title: movement.title, body: movementDetails(group, movement), actions: [{ label: 'Chiudi', value: false }] });
    return;
  }
  const people = groupPeople(group);
  const cur = group.data.currency;
  const me = personOfMember(group, state.user?.id);
  const draft = movement
    ? structuredClone(movement.data)
    : {
        type: 'spesa',
        currency: cur,
        rate: 1,
        date: today(),
        paid_by: me?.id || people[0]?.id,
        split: { mode: 'parti', shares: Object.fromEntries(people.map((p) => [p.id, 1])) },
        category: 'altro',
      };
  // Per i rimborsi chi riceve sta nella divisione; ricordata a parte per non perderla cambiando tipo.
  let receiver = draft.type === 'rimborso' ? Object.keys(draft.split.shares)[0] : people.find((p) => p.id !== draft.paid_by)?.id;
  let everyone = draft.type === 'rimborso' ? { mode: 'parti', shares: Object.fromEntries(people.map((p) => [p.id, 1])) } : draft.split;
  let rateSet = Boolean(movement) || draft.currency === cur;
  const originalReceipt = movement?.data.receipt || null;

  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const fail = (text) => {
    error.textContent = text;
    error.hidden = false;
    error.scrollIntoView?.({ block: 'nearest' });
    return true;
  };

  const title = h('input', { class: 'input', type: 'text', maxlength: 200, value: movement?.title || '', placeholder: 'Per esempio: Dominio del sito' });
  const amount = h('input', { class: 'input exp-amount-input', type: 'text', inputmode: 'decimal', value: movement ? amountText(draft.amount, draft.currency) : '', placeholder: '0,00', autocomplete: 'off' });
  const currency = h(
    'select',
    { class: 'input', 'aria-label': 'Valuta' },
    CURRENCIES.map(([code, label]) => h('option', { value: code, selected: code === draft.currency, title: label }, code)),
  );
  const date = h('input', { class: 'input', type: 'date', value: draft.date || today(), max: '2100-12-31' });
  const payerLabel = h('span', { class: 'field-label' });
  const personSelect = (value, onChange, label) =>
    h('select', { class: 'input', 'aria-label': label, onChange: (e) => onChange(e.target.value) }, people.map((p) => h('option', { value: p.id, selected: p.id === value }, p.name)));
  const payer = personSelect(draft.paid_by, (value) => {
    draft.paid_by = value;
    renderDynamic();
  });
  const note = h('textarea', { class: 'input', rows: 2, maxlength: EXPENSE_LIMITS.note, value: draft.note || '', placeholder: 'Facoltativa' });

  const typeHost = h('div', { class: 'exp-types', role: 'radiogroup', 'aria-label': 'Tipo di movimento' });
  const rateHost = h('div', { class: 'exp-rate' });
  const receiverHost = h('div');
  const splitHost = h('div', { class: 'exp-split' });
  const categoryHost = h('div');
  const receiptHost = h('div', { class: 'exp-receipt' });

  const amountMinor = () => parseAmount(amount.value, draft.currency);

  function renderTypes() {
    mount(
      typeHost,
      MOVEMENT_TYPES.map(([value, label]) =>
        h(
          'button',
          {
            type: 'button',
            role: 'radio',
            class: ['btn', 'btn-small', value === draft.type ? 'btn-primary' : 'btn-ghost'],
            'aria-checked': String(value === draft.type),
            onClick: () => {
              if (value === draft.type) return;
              if (draft.type === 'rimborso') draft.split = everyone;
              else everyone = draft.split;
              draft.type = value;
              if (value === 'rimborso' && !title.value.trim()) title.placeholder = 'Rimborso';
              renderTypes();
              renderDynamic();
            },
          },
          label,
        ),
      ),
    );
  }

  function renderRate() {
    if (draft.currency === cur) {
      mount(rateHost);
      return;
    }
    const minor = amountMinor();
    const converted = minor ? fmtAmount(Math.round(minor * draft.rate * 10 ** (currencyDigits(cur) - currencyDigits(draft.currency))), cur) : null;
    const status = h('span', { class: 'muted small', 'aria-live': 'polite' }, rateSet ? (converted ? `= ${converted}` : '') : 'Chiedo il cambio alla BCE…');
    const input = h('input', {
      class: 'input input-small',
      type: 'text',
      inputmode: 'decimal',
      value: rateSet ? String(draft.rate).replace('.', ',') : '',
      'aria-label': `Cambio: quanti ${cur} vale 1 ${draft.currency}`,
      onChange: (e) => {
        const value = Number(String(e.target.value).replace(',', '.'));
        if (value > 0 && value < 1e6) {
          draft.rate = value;
          rateSet = true;
        }
        renderRate();
      },
    });
    mount(
      rateHost,
      h('span', { class: 'field-label' }, `Cambio: 1 ${draft.currency} =`),
      input,
      h('span', null, cur),
      h('button', { type: 'button', class: 'btn btn-small', onClick: () => loadRate(true) }, 'Cambio BCE del giorno'),
      status,
    );
  }

  let rateRequest = 0;
  function loadRate(force = false) {
    if (draft.currency === cur || (rateSet && !force)) return;
    const id = ++rateRequest;
    fetchRate(draft.currency, cur, draft.date)
      .then((rate) => {
        if (id !== rateRequest) return;
        draft.rate = rate;
        rateSet = true;
        renderRate();
      })
      .catch(() => {
        if (id !== rateRequest) return;
        renderRate();
        rateHost.querySelector('[aria-live]').textContent = 'Cambio non disponibile: scrivilo a mano.';
      });
  }

  function previewShares() {
    const minor = amountMinor() || 0;
    return movementShares({ ...draft, amount: minor });
  }

  function updatePreviews() {
    const shares = previewShares();
    for (const el of splitHost.querySelectorAll('[data-preview]')) el.textContent = fmtAmount(shares.get(el.dataset.preview) || 0, draft.currency);
    const left = splitHost.querySelector('.exp-left');
    if (left) {
      const minor = amountMinor() || 0;
      const diff = minor - Object.values(draft.split.shares).reduce((s, v) => s + v, 0);
      left.textContent = diff === 0 ? 'Le parti tornano con il totale.' : diff > 0 ? `Restano ${fmtAmount(diff, draft.currency)} da dividere.` : `Le parti superano il totale di ${fmtAmount(-diff, draft.currency)}.`;
      left.classList.toggle('is-off', diff !== 0);
    }
    renderRate();
  }

  function setMode(mode) {
    const chosen = Object.keys(draft.split.shares);
    let shares;
    if (mode === 'importi') shares = Object.fromEntries(distribute(amountMinor() || 0, chosen.map((id) => [id, draft.split.mode === 'quote' ? draft.split.shares[id] : 1])));
    else shares = Object.fromEntries(chosen.map((id) => [id, 1]));
    draft.split = { mode, shares };
    renderSplit();
  }

  function renderSplit() {
    const { mode, shares } = draft.split;
    const rows = people.map((p) => {
      const on = Object.hasOwn(shares, p.id);
      let control;
      if (mode === 'parti') {
        control = h(
          'label',
          { class: 'check' },
          h('input', {
            type: 'checkbox',
            checked: on,
            onChange: (e) => {
              if (e.target.checked) shares[p.id] = 1;
              else delete shares[p.id];
              updatePreviews();
            },
          }),
          h('span', null, p.name),
        );
      } else {
        const value = mode === 'quote' ? (on ? String(shares[p.id]) : '') : on ? amountText(shares[p.id], draft.currency) : '';
        control = h(
          'label',
          { class: 'exp-split-input' },
          h('span', null, p.name),
          h('input', {
            class: 'input input-small',
            type: 'text',
            inputmode: mode === 'quote' ? 'numeric' : 'decimal',
            value,
            placeholder: mode === 'quote' ? '0' : '0,00',
            'aria-label': mode === 'quote' ? `Quote di ${p.name}` : `Importo di ${p.name}`,
            onInput: (e) => {
              const raw = e.target.value.trim();
              const n = mode === 'quote' ? (/^\d{1,3}$/.test(raw) ? Number(raw) : 0) : parseAmount(raw, draft.currency) || 0;
              if (n > 0 && (mode !== 'quote' || n <= EXPENSE_LIMITS.weight)) shares[p.id] = n;
              else delete shares[p.id];
              updatePreviews();
            },
          }),
        );
      }
      return h('div', { class: 'exp-split-row' }, control, h('span', { class: 'exp-split-preview muted small', dataset: { preview: p.id } }));
    });
    const all = () => {
      const weights = people.map((p) => [p.id, 1]);
      draft.split.shares = Object.fromEntries(mode === 'importi' ? distribute(amountMinor() || 0, weights) : weights);
      renderSplit();
    };
    const none = () => {
      draft.split.shares = {};
      renderSplit();
    };
    mount(
      splitHost,
      h(
        'div',
        { class: 'exp-split-head' },
        h('span', { class: 'field-label' }, 'Diviso tra'),
        h(
          'select',
          { class: 'input input-small', 'aria-label': 'Come dividere', onChange: (e) => setMode(e.target.value) },
          SPLIT_MODES.map(([value, label]) => h('option', { value, selected: value === mode }, label)),
        ),
        h('button', { type: 'button', class: 'link-btn', onClick: all }, 'Tutti'),
        h('button', { type: 'button', class: 'link-btn', onClick: none }, 'Nessuno'),
      ),
      mode === 'quote' ? h('p', { class: 'field-help' }, 'Per esempio 2 a chi conta doppio, 1 agli altri.') : null,
      rows,
      mode === 'importi' ? h('p', { class: 'exp-left small', 'aria-live': 'polite' }) : null,
    );
    updatePreviews();
  }

  function renderDynamic() {
    payerLabel.textContent = draft.type === 'entrata' ? 'Ricevuto da' : draft.type === 'rimborso' ? 'Da' : 'Pagato da';
    if (draft.type === 'rimborso') {
      if (!receiver || receiver === draft.paid_by) receiver = people.find((p) => p.id !== draft.paid_by)?.id;
      draft.split = { mode: 'parti', shares: receiver ? { [receiver]: 1 } : {} };
      mount(
        receiverHost,
        h(
          'label',
          { class: 'field' },
          h('span', { class: 'field-label' }, 'A'),
          personSelect(receiver, (value) => {
            receiver = value;
            draft.split = { mode: 'parti', shares: { [value]: 1 } };
          }, 'Chi riceve'),
        ),
      );
      mount(splitHost);
    } else {
      mount(receiverHost);
      renderSplit();
    }
    if (draft.type === 'spesa') {
      mount(
        categoryHost,
        h(
          'label',
          { class: 'field' },
          h('span', { class: 'field-label' }, 'Categoria'),
          h(
            'select',
            { class: 'input', onChange: (e) => { draft.category = e.target.value; } },
            EXPENSE_CATEGORIES.map(([value, label]) => h('option', { value, selected: value === (draft.category || 'altro') }, label)),
          ),
        ),
      );
    } else {
      mount(categoryHost);
    }
  }

  function renderReceipt() {
    const file = h('input', {
      type: 'file',
      accept: 'image/*',
      hidden: true,
      onChange: async (e) => {
        const source = e.target.files?.[0];
        if (!source) return;
        mount(receiptHost, h('span', { class: 'muted small' }, 'Carico la foto…'));
        try {
          draft.receipt = await uploadNoteImage(group.id, source);
        } catch (err) {
          toast(err?.message || 'Non sono riuscito a caricare la foto.', { type: 'error' });
        }
        renderReceipt();
      },
    });
    const pick = h('button', { type: 'button', class: 'btn btn-small', onClick: () => file.click() }, icon('image', 14), h('span', null, draft.receipt ? 'Cambia foto' : 'Aggiungi la foto dello scontrino'));
    mount(
      receiptHost,
      h('span', { class: 'field-label' }, 'Scontrino'),
      draft.receipt ? receiptImage(draft.receipt, 'Scontrino') : null,
      h(
        'div',
        { class: 'toolbar' },
        pick,
        draft.receipt ? h('button', { type: 'button', class: 'btn btn-small', onClick: () => { delete draft.receipt; renderReceipt(); } }, 'Togli') : null,
        file,
      ),
    );
  }

  amount.addEventListener('input', () => {
    if (draft.split.mode === 'importi' && Object.keys(draft.split.shares).length === 1) {
      const [only] = Object.keys(draft.split.shares);
      draft.split.shares[only] = amountMinor() || 0;
      renderSplit();
      return;
    }
    updatePreviews();
  });
  currency.addEventListener('change', () => {
    draft.currency = currency.value;
    rateSet = draft.currency === cur;
    draft.rate = 1;
    if (draft.split.mode === 'importi') setMode('importi');
    renderRate();
    updatePreviews();
    loadRate();
  });
  date.addEventListener('change', () => {
    draft.date = date.value;
    if (draft.currency !== cur && !movement) {
      rateSet = false;
      renderRate();
      loadRate();
    }
  });

  renderTypes();
  renderDynamic();
  renderRate();
  renderReceipt();
  loadRate();

  const body = h(
    'div',
    { class: 'exp-form' },
    typeHost,
    h(
      'div',
      { class: 'form-grid' },
      h('label', { class: 'field is-wide' }, h('span', { class: 'field-label' }, 'Descrizione'), title),
      h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Importo'), h('div', { class: 'exp-amount' }, amount, currency)),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Data'), date),
      h('div', { class: 'is-wide' }, rateHost),
      h('label', { class: 'field' }, payerLabel, payer),
      receiverHost,
      h('div', { class: 'is-wide' }, splitHost),
      categoryHost,
      h('label', { class: 'field is-wide' }, h('span', { class: 'field-label' }, 'Nota'), note),
      h('div', { class: 'is-wide' }, receiptHost),
    ),
    movement ? h('p', { class: 'small' }, h('a', { href: `#/storico/${movement.id}` }, 'Storico delle modifiche')) : null,
    error,
  );

  async function save() {
    error.hidden = true;
    const minor = amountMinor();
    if (!minor) return fail('Scrivi un importo valido, per esempio 12,50.');
    if (draft.currency !== cur && !rateSet) return fail('Manca il cambio: aspetta quello della BCE o scrivilo a mano.');
    const data = sanitizeExpense({ ...draft, group: group.id, amount: minor, date: date.value, note: note.value, rate: draft.currency === cur ? 1 : draft.rate });
    const problem = expenseProblem(data, group);
    if (problem) return fail(problem);
    const text = title.value.trim() || (draft.type === 'rimborso' ? 'Rimborso' : '');
    if (!text) return fail('Scrivi una descrizione.');
    const snapshot = { title: text, data };
    try {
      if (movement) {
        const current = getItem(movement.id) || movement;
        const res = await saveSnapshot(current, snapshot, null);
        if (res.status !== 'ok') return fail(statusError(res.status).message);
      } else {
        await createItem('expense', snapshot, null);
      }
    } catch (err) {
      return fail(err?.message || 'Non sono riuscito a salvare.');
    }
    if (originalReceipt && originalReceipt !== data.receipt) dropReceipt(originalReceipt);
    onSaved?.();
    return false;
  }

  const actions = [{ label: 'Annulla', value: false }];
  if (movement) {
    actions.push({
      label: 'Sposta nel cestino',
      kind: 'danger',
      onClick: async () => {
        if (!(await confirmDialog(`«${movement.title}» finisce nel cestino e non conta più nei saldi. Si può ripristinare dal cestino.`, { title: 'Spostare nel cestino?', okLabel: 'Sposta nel cestino', danger: true }))) return true;
        try {
          await archiveItem(getItem(movement.id) || movement, 'Movimento spostato nel cestino');
          return false;
        } catch (err) {
          return fail(err?.message || 'Operazione non riuscita.');
        }
      },
    });
  }
  actions.push({ label: movement ? 'Salva' : 'Aggiungi', kind: 'primary', onClick: save });
  openModal({ title: movement ? 'Modifica movimento' : 'Nuovo movimento', wide: true, body, actions });
  setTimeout(() => (movement ? title : amount).focus(), 0);
}

// --- Schede del gruppo --------------------------------------------------------

function movementsTab(group, movements, me, filters, { writable }) {
  const cur = group.data.currency;
  const listHost = h('div', { class: 'exp-list-host' });
  const matches = (m) => {
    const d = m.data;
    if (filters.type && d.type !== filters.type) return false;
    if (filters.category && (d.type !== 'spesa' || d.category !== filters.category)) return false;
    if (filters.person && !involves(m, filters.person)) return false;
    const q = filters.text.trim().toLowerCase();
    return !q || m.title.toLowerCase().includes(q) || String(d.note || '').toLowerCase().includes(q);
  };
  const row = (m) => {
    const d = m.data;
    const { total } = inGroupCurrency(d, cur);
    const mine = myPart(group, m, me);
    return h(
      'li',
      { class: ['exp-row', `exp-${d.type}`], dataset: { id: m.id } },
      h('span', { class: 'exp-icon', 'aria-hidden': 'true' }, icon(d.type === 'rimborso' ? 'restore' : d.type === 'entrata' ? 'download' : 'wallet', 18)),
      h(
        'div',
        { class: 'exp-main' },
        h('button', { type: 'button', class: 'link-btn exp-title', onClick: () => openMovementDialog(group, m) }, m.title),
        h('div', { class: 'muted small' }, [whoLine(group, m), d.type === 'spesa' ? categoryLabel(d.category) : null, d.receipt ? 'con scontrino' : null].filter(Boolean).join(' · ')),
      ),
      h(
        'div',
        { class: 'exp-amounts' },
        h('strong', null, d.type === 'entrata' ? `+${fmtAmount(total, cur)}` : fmtAmount(total, cur)),
        d.currency !== cur ? h('div', { class: 'muted small' }, fmtAmount(d.amount, d.currency)) : null,
        mine ? h('div', { class: 'small exp-mine' }, mine) : null,
      ),
    );
  };
  const renderList = () => {
    const list = movements.filter(matches);
    if (!movements.length) {
      mount(listHost, emptyState('Nessun movimento. Aggiungi la prima spesa: chi ha pagato e tra chi dividerla.', writable ? button('Aggiungi una spesa', { kind: 'primary', iconName: 'plus', onClick: () => openMovementDialog(group, null) }) : null));
      return;
    }
    if (!list.length) {
      mount(listHost, emptyState('Nessun movimento con questi filtri.'));
      return;
    }
    const days = new Map();
    for (const m of list) {
      if (!days.has(m.data.date)) days.set(m.data.date, []);
      days.get(m.data.date).push(m);
    }
    const spent = list.filter((m) => m.data.type === 'spesa').reduce((s, m) => s + inGroupCurrency(m.data, cur).total, 0);
    mount(
      listHost,
      h('p', { class: 'muted small exp-count' }, `${plural(list.length, 'movimento', 'movimenti')} · spese ${fmtAmount(spent, cur)}`),
      [...days].map(([day, items]) => h('section', { class: 'exp-day' }, h('h3', { class: 'exp-day-title' }, fmtDate(day)), h('ul', { class: 'exp-list' }, items.map(row)))),
    );
  };
  const select = (label, key, entries, empty) =>
    h(
      'select',
      {
        class: 'input',
        'aria-label': label,
        onChange: (e) => {
          filters[key] = e.target.value;
          renderList();
        },
      },
      h('option', { value: '' }, empty),
      entries.map(([value, text]) => h('option', { value, selected: value === filters[key] }, text)),
    );
  renderList();
  return h(
    'div',
    { class: 'exp-movements' },
    movements.length
      ? h(
          'div',
          { class: 'filters' },
          h('input', {
            class: 'input',
            type: 'search',
            value: filters.text,
            placeholder: 'Cerca nella descrizione o nella nota',
            'aria-label': 'Cerca tra i movimenti',
            maxlength: 100,
            onInput: (e) => {
              filters.text = e.target.value;
              renderList();
            },
          }),
          select('Tipo', 'type', [['spesa', 'Spese'], ['rimborso', 'Rimborsi'], ['entrata', 'Entrate']], 'Tutti i movimenti'),
          select('Persona', 'person', groupPeople(group).map((p) => [p.id, `Riguarda ${p.name}`]), 'Chiunque'),
          select('Categoria', 'category', EXPENSE_CATEGORIES, 'Tutte le categorie'),
        )
      : null,
    listHost,
  );
}

async function copyPay(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiato.', { type: 'success' });
  } catch {
    toast('Copia non riuscita: selezionalo e copialo a mano.', { type: 'error' });
  }
}

function payLine(group, personId) {
  const pay = payInfo(groupPeople(group).find((p) => p.id === personId)?.pay);
  if (!pay) return null;
  const value =
    pay.kind === 'link'
      ? h('a', { href: pay.href, target: '_blank', rel: 'noopener noreferrer' }, pay.text)
      : h('span', { class: pay.kind === 'iban' ? 'exp-iban' : null }, pay.text);
  return h(
    'div',
    { class: 'exp-pay' },
    h('span', { class: 'muted small' }, `Come pagare ${personName(group, personId)}:`),
    value,
    pay.bank ? h('span', { class: 'muted small exp-bank' }, pay.bank) : null,
    h('button', { type: 'button', class: 'btn btn-small', onClick: () => copyPay(pay.copy) }, icon('copy', 14), h('span', null, 'Copia')),
  );
}

function balancesTab(group, movements, me, { writable }) {
  const cur = group.data.currency;
  const balances = groupBalances(group, movements);
  if (!movements.length) return emptyState('I saldi compaiono con il primo movimento.');
  const max = Math.max(1, ...[...balances.values()].map((r) => Math.abs(r.balance)));
  const rows = [...balances].map(([id, r]) => {
    const share = `${Math.round((Math.abs(r.balance) / max) * 100)}%`;
    return h(
      'li',
      { class: 'exp-balance-row', dataset: { id } },
      h('span', { class: 'exp-person-name' }, personName(group, id), me?.id === id ? h('span', { class: 'muted' }, ' (tu)') : null),
      h(
        'span',
        { class: 'exp-diverging', 'aria-hidden': 'true' },
        h('span', { class: 'exp-half exp-half-neg' }, r.balance < 0 ? h('span', { class: 'exp-bar exp-bar-neg', style: { width: share } }) : null),
        h('span', { class: 'exp-half exp-half-pos' }, r.balance > 0 ? h('span', { class: 'exp-bar exp-bar-pos', style: { width: share } }) : null),
      ),
      h('span', { class: ['exp-balance', balanceClass(r.balance)] }, balanceText(r.balance, cur)),
      h('span', { class: 'muted small exp-balance-detail' }, `ha pagato ${fmtAmount(r.paid, cur)} · la sua parte ${fmtAmount(r.cost, cur)}`),
    );
  });
  const transfers = settleUp(balances);
  const settle = (t) => async (event) => {
    const ok = await confirmDialog(`Registro un rimborso di ${fmtAmount(t.amount, cur)} da ${personName(group, t.from)} a ${personName(group, t.to)}, con la data di oggi.`, { title: 'Segnare come pagato?', okLabel: 'Segna come pagato' });
    if (!ok) return;
    await busy(event.currentTarget || event.target, async () => {
      try {
        await createItem('expense', { title: 'Rimborso', data: { group: group.id, type: 'rimborso', amount: t.amount, currency: cur, rate: 1, date: today(), paid_by: t.from, split: { mode: 'parti', shares: { [t.to]: 1 } } } }, 'Segnato come pagato');
        toast('Rimborso registrato.', { type: 'success' });
      } catch (err) {
        toast(err?.message || 'Non sono riuscito a registrarlo.', { type: 'error' });
      }
    })();
  };
  return h(
    'div',
    { class: 'cards cards-2 exp-balances' },
    h(
      'section',
      { class: 'card' },
      h('h2', null, 'Saldi'),
      h('p', { class: 'muted small' }, `Chi ha anticipato più della sua parte riceve, gli altri devono. In ${cur}: le spese in altre valute contano al cambio salvato in ognuna.`),
      h('ul', { class: 'exp-balance-list' }, rows),
    ),
    h(
      'section',
      { class: 'card exp-settle' },
      h('h2', null, 'Chi deve a chi'),
      transfers.length
        ? [
            h('p', { class: 'muted small' }, 'Il modo più semplice per tornare in pari: ognuno paga direttamente chi deve ricevere.'),
            h(
              'ul',
              { class: 'exp-transfer-list' },
              transfers.map((t) =>
                h(
                  'li',
                  { class: 'exp-transfer' },
                  h('span', null, h('strong', null, personName(group, t.from)), ' dà ', h('strong', null, fmtAmount(t.amount, cur)), ' a ', h('strong', null, personName(group, t.to))),
                  writable ? h('button', { type: 'button', class: 'btn btn-small', onClick: settle(t) }, icon('check', 14), h('span', null, 'Segna come pagato')) : null,
                  payLine(group, t.to),
                ),
              ),
            ),
            writable && transfers.some((t) => !payInfo(groupPeople(group).find((p) => p.id === t.to)?.pay))
              ? h('p', { class: 'muted small' }, 'Per chi non ha indicato come pagarlo, si aggiunge IBAN o link nella scheda ', h('a', { href: `#/spese/${group.id}/gruppo` }, 'Gruppo'), '.')
              : null,
          ]
        : h('p', { class: 'exp-even' }, 'Tutti in pari.'),
    ),
  );
}

// Torta: le tre categorie più grandi, il resto insieme in grigio.
function categoryDonut(stats, cur) {
  const top = stats.categories.slice(0, 3);
  const rest = stats.categories.slice(3).reduce((s, c) => s + c.total, 0);
  const slices = [...top.map((c, i) => ({ label: c.label, total: c.total, cls: `exp-c${i + 1}` })), ...(rest ? [{ label: 'Altre categorie', total: rest, cls: 'exp-cother' }] : [])];
  const r = 60;
  const length = 2 * Math.PI * r;
  let start = 0;
  const circles = slices.map((s) => {
    const part = (s.total / stats.total) * length;
    const gap = slices.length > 1 ? 2 : 0;
    const circle = svg(
      'circle',
      { cx: 80, cy: 80, r, class: ['exp-slice', s.cls].join(' '), 'stroke-dasharray': `${Math.max(0, part - gap)} ${length - Math.max(0, part - gap)}`, 'stroke-dashoffset': String(-start), transform: 'rotate(-90 80 80)' },
      svg('title', {}, `${s.label}: ${fmtAmount(s.total, cur)}`),
    );
    start += part;
    return circle;
  });
  const percent = (value) => `${Math.round((value / stats.total) * 100)}%`;
  return h(
    'div',
    { class: 'exp-donut' },
    svg(
      'svg',
      { viewBox: '0 0 160 160', role: 'img', 'aria-label': `Spese per categoria: ${slices.map((s) => `${s.label} ${percent(s.total)}`).join(', ')}`, class: 'exp-donut-svg' },
      svg('circle', { cx: 80, cy: 80, r, class: 'exp-slice exp-track' }),
      ...circles,
    ),
    h(
      'ul',
      { class: 'exp-legend' },
      slices.map((s) => h('li', null, h('span', { class: ['exp-swatch', s.cls], 'aria-hidden': 'true' }), h('span', null, s.label), h('strong', null, percent(s.total)))),
    ),
  );
}

function monthChart(stats, cur) {
  const max = Math.max(1, ...stats.months.map((m) => m.total));
  const width = 600;
  const base = 170;
  const height = 140;
  const slot = width / stats.months.length;
  const last = stats.months.length - 1;
  const bars = stats.months.flatMap((m, i) => {
    const barH = (m.total / max) * height;
    const x = i * slot + (slot - 28) / 2;
    const r = Math.min(4, barH);
    const y = base - barH;
    const d = barH > 0 ? `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + 28 - r} Q${x + 28},${y} ${x + 28},${y + r} V${base} Z` : '';
    const tip = `${m.label}: ${fmtAmount(m.total, cur)}`;
    return [
      svg('rect', { x: i * slot, y: 10, width: slot, height: base - 10, class: 'exp-hit' }, svg('title', {}, tip)),
      d ? svg('path', { d, class: i === last ? 'exp-col exp-col-now' : 'exp-col' }, svg('title', {}, tip)) : null,
      svg('text', { x: x + 14, y: 190, class: i === last ? 'exp-axis exp-axis-now' : 'exp-axis', 'text-anchor': 'middle' }, m.label),
    ].filter(Boolean);
  });
  const now = stats.months[last];
  const label = now.total ? [svg('text', { x: last * slot + slot / 2, y: base - (now.total / max) * height - 6, class: 'exp-value', 'text-anchor': 'middle' }, fmtAmount(now.total, cur))] : [];
  return svg(
    'svg',
    { viewBox: `0 0 ${width} 200`, role: 'img', class: 'exp-month-svg', 'aria-label': `Spese per mese: ${stats.months.filter((m) => m.total).map((m) => `${m.label} ${fmtAmount(m.total, cur)}`).join(', ') || 'nessuna'}` },
    svg('line', { x1: 0, y1: base, x2: width, y2: base, class: 'exp-baseline' }),
    ...bars,
    ...label,
  );
}

function statsTab(group, movements, me) {
  const cur = group.data.currency;
  const stats = groupStats(group, movements, { me: me?.id });
  if (!stats.count) return emptyState('Le statistiche compaiono con la prima spesa.');
  const balances = groupBalances(group, movements);
  const maxPaid = Math.max(1, ...[...balances.values()].map((r) => r.paid));
  const tile = (label, value, note) => h('div', { class: 'stat' }, h('span', null, label), h('strong', null, value), note ? h('span', { class: 'small' }, note) : null);
  return h(
    'div',
    { class: 'exp-stats' },
    h(
      'div',
      { class: 'stats' },
      tile('Totale spese', fmtAmount(stats.total, cur), plural(stats.count, 'spesa', 'spese')),
      me ? tile('La tua parte', fmtAmount(stats.mine, cur), stats.total ? `${Math.round((stats.mine / stats.total) * 100)}% del totale` : null) : null,
      tile('Media a persona', fmtAmount(stats.perPerson, cur), plural(groupPeople(group).length, 'persona', 'persone')),
      tile('Entrate', fmtAmount(stats.income, cur), stats.income ? 'già tolte dalle parti' : 'nessuna'),
    ),
    h(
      'div',
      { class: 'cards cards-2' },
      h('section', { class: 'card' }, h('h2', null, 'Per categoria'), categoryDonut(stats, cur)),
      h(
        'section',
        { class: 'card' },
        h('h2', null, 'Chi ha pagato'),
        h(
          'ul',
          { class: 'exp-paid-list' },
          [...balances].map(([id, r]) =>
            h(
              'li',
              { class: 'exp-paid-row' },
              h('span', null, personName(group, id)),
              h('span', { class: 'exp-track', 'aria-hidden': 'true' }, h('span', { class: 'exp-fill', style: { width: `${Math.round((Math.max(0, r.paid) / maxPaid) * 100)}%` } })),
              h('strong', null, fmtAmount(r.paid, cur)),
            ),
          ),
        ),
      ),
      h('section', { class: 'card card-wide' }, h('h2', null, 'Per mese'), h('p', { class: 'muted small' }, 'Gli ultimi 12 mesi. Passa sopra una barra per il totale.'), monthChart(stats, cur)),
      h(
        'section',
        { class: 'card card-wide' },
        h('h2', null, 'Tutte le categorie'),
        h(
          'div',
          { class: 'table-scroll' },
          h(
            'table',
            { class: 'table exp-category-table' },
            h('thead', null, h('tr', null, h('th', null, 'Categoria'), h('th', null, 'Totale'), h('th', null, 'Sul totale'))),
            h('tbody', null, stats.categories.map((c) => h('tr', null, h('td', null, c.label), h('td', null, fmtAmount(c.total, cur)), h('td', null, `${Math.round((c.total / stats.total) * 100)}%`)))),
          ),
        ),
      ),
    ),
  );
}

function settingsTab(group, movements, { writable }) {
  if (!writable) {
    return h(
      'section',
      { class: 'card' },
      h('h2', null, 'Persone'),
      h('ul', null, groupPeople(group).map((p) => h('li', null, p.name, p.member ? h('span', { class: 'muted small' }, ' · ha un account') : null, p.pay ? h('div', { class: 'muted small' }, `Come pagarmi: ${payInfo(p.pay).text}`) : null))),
      group.data.notes ? h('p', null, group.data.notes) : null,
    );
  }
  const fields = groupFields(group, { movements });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const saveBtn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Salva');
  saveBtn.addEventListener(
    'click',
    busy(saveBtn, async () => {
      error.hidden = true;
      const problem = fields.problem();
      if (problem) {
        error.textContent = problem;
        error.hidden = false;
        return;
      }
      const snapshot = fields.read();
      if (movements.length) snapshot.data.currency = group.data.currency;
      const res = await saveSnapshot(getItem(group.id) || group, snapshot, 'Gruppo aggiornato');
      if (res.status !== 'ok') {
        error.textContent = statusError(res.status).message;
        error.hidden = false;
        return;
      }
      toast('Gruppo salvato.', { type: 'success' });
    }),
  );
  const archive = h('button', { type: 'button', class: 'btn btn-danger' }, icon('trash', 14), h('span', null, 'Sposta il gruppo nel cestino'));
  archive.addEventListener(
    'click',
    busy(archive, async () => {
      const ok = await confirmDialog(`Il gruppo «${group.title}» e i suoi movimenti spariscono dalle Spese. Si può ripristinare dal cestino.`, { title: 'Spostare nel cestino?', okLabel: 'Sposta nel cestino', danger: true });
      if (!ok) return;
      try {
        await archiveItem(getItem(group.id) || group, 'Gruppo di spese spostato nel cestino');
        navigate('/spese');
      } catch (err) {
        toast(err?.message || 'Operazione non riuscita.', { type: 'error' });
      }
    }),
  );
  return h('section', { class: 'card exp-settings' }, fields.node, error, h('div', { class: 'toolbar toolbar-wrap exp-settings-actions' }, saveBtn, archive));
}

function mySummary(group, movements, me) {
  const cur = group.data.currency;
  if (!me) return h('p', { class: 'exp-summary muted' }, 'Non sei tra le persone del gruppo: vedi i conti, ma nessun movimento ti riguarda.');
  const balance = groupBalances(group, movements).get(me.id)?.balance || 0;
  const stats = groupStats(group, movements, { me: me.id });
  return h(
    'p',
    { class: 'exp-summary' },
    h('span', { class: ['exp-balance', balanceClass(balance)] }, `Tu ${balanceText(balance, cur, { you: true })}`),
    h('span', { class: 'muted' }, ` · totale spese ${fmtAmount(stats.total, cur)} · la tua parte ${fmtAmount(stats.mine, cur)}`),
  );
}

export function expenseGroupView(outlet, params, query) {
  const tab = TABS.some(([key]) => key === params.tab) ? params.tab : 'movimenti';
  const writable = canWrite();
  const filters = { text: '', type: '', person: '', category: '' };
  let pendingOpen = query?.get('movimento') || null;
  let editing = false;

  const render = () => {
    const group = getItem(params.id);
    if (!isGroup(group)) {
      mount(
        outlet,
        pageHeader({ title: 'Gruppo non disponibile', back: { href: '#/spese' } }),
        emptyState(group?.deleted_at ? 'Questo gruppo è nel cestino: ripristinalo da lì per vederlo.' : 'Il gruppo non esiste o non è più disponibile.', button('Torna alle spese', { href: '#/spese' })),
      );
      return;
    }
    const movements = sortMovements(movementsOf(group.id));
    const me = personOfMember(group, state.user?.id);
    const add = writable && tab !== 'gruppo' ? button('Aggiungi', { kind: 'primary', iconName: 'plus', onClick: () => openMovementDialog(group, null) }) : null;
    let body;
    if (tab === 'saldi') body = balancesTab(group, movements, me, { writable });
    else if (tab === 'statistiche') body = statsTab(group, movements, me);
    else if (tab === 'gruppo') body = settingsTab(group, movements, { writable });
    else body = movementsTab(group, movements, me, filters, { writable });
    mount(
      outlet,
      pageHeader({
        title: group.title,
        subtitle: `${plural(groupPeople(group).length, 'persona', 'persone')} · ${group.data.currency}`,
        back: { href: '#/spese' },
        actions: [add, movements.length ? button('Esporta CSV', { iconName: 'download', onClick: () => exportCsv(group, movements) }) : null, button('Storico', { iconName: 'history', href: `#/storico/${group.id}` })],
      }),
      mySummary(group, movements, me),
      tabs(TABS, tab, (key) => `#/spese/${group.id}${key === 'movimenti' ? '' : `/${key}`}`, { ariaLabel: 'Sezioni del gruppo' }),
      body,
    );
    editing = tab === 'gruppo';
    if (pendingOpen) {
      const target = getItem(pendingOpen);
      pendingOpen = null;
      if (target?.kind === 'expense' && target.data.group === group.id && !target.deleted_at) openMovementDialog(group, target);
    }
  };

  render();
  const offs = [
    on('item', ({ item, byMe }) => {
      if (!EXPENSE_KINDS.includes(item.kind)) return;
      if (item.kind === 'expense' && item.data.group !== params.id) return;
      // Nella scheda Gruppo un aggiornamento da fuori non cancella quello che si sta scrivendo.
      if (editing && !byMe && item.id === params.id) {
        toast('Qualcuno ha modificato il gruppo: ricarica la scheda prima di salvare.');
        return;
      }
      if (editing && item.kind === 'expense') return;
      render();
    }),
    on('members', () => {
      if (!editing) render();
    }),
  ];
  return () => offs.forEach((off) => off());
}
