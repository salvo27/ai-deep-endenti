// Spese condivise: importi in unità minime della valuta (centesimi), funzioni pure tranne il cambio, chiesto alla BCE.
import { language, locale, tx } from './i18n/index.js';
import { csvCell } from './lib/format.js';
import { cleanLine, cleanText, isIsoDate, isUuid } from './lib/validate.js';

const t = tx.expenses;
// Le chiavi salvate nel database restano uguali in ogni lingua: si traducono solo i nomi mostrati.
const labelled = (keys, labels) => keys.map((key) => [key, labels[key]]);
export const SPESA = 'spesa'; // i18n-ignore: chiave salvata del tipo di movimento

export const EXPENSE_LIMITS = Object.freeze({
  people: 50,
  name: 60,
  pay: 120,
  note: 500,
  groupNotes: 1000,
  amount: 100_000_000_000,
  weight: 100,
});

export const CURRENCIES = labelled(
  ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'TRY', 'CNY', 'INR', 'BRL'],
  t.currencies,
);
const CURRENCY_CODES = new Set(CURRENCIES.map(([code]) => code));
export const isCurrency = (code) => CURRENCY_CODES.has(code);

export const MOVEMENT_TYPES = labelled([SPESA, 'rimborso', 'entrata'], t.types);

export const SPLIT_MODES = labelled(['parti', 'quote', 'importi'], t.splitModes);

export const EXPENSE_CATEGORIES = labelled(['software', 'viaggi', 'alloggio', 'pasti', 'eventi', 'materiali', 'consulenze', 'marketing', 'altro'], t.categories); // i18n-ignore: stored values

export const categoryLabel = (key) => EXPENSE_CATEGORIES.find(([k]) => k === key)?.[1] || t.categories.altro;
export const typeLabel = (key) => MOVEMENT_TYPES.find(([k]) => k === key)?.[1] || t.types[SPESA];

const PERSON_ID_RE = /^[a-z0-9-]{1,40}$/;
export const isPersonId = (value) => typeof value === 'string' && PERSON_ID_RE.test(value);
export const RECEIPT_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

const digitsCache = new Map();

// Cifre decimali della valuta: 2 per l'euro, 0 per lo yen.
export function currencyDigits(code) {
  if (!digitsCache.has(code)) {
    let digits = 2;
    try {
      digits = new Intl.NumberFormat(locale, { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits;
    } catch {
      // codice sconosciuto: due decimali
    }
    digitsCache.set(code, digits);
  }
  return digitsCache.get(code);
}

export function fmtAmount(minor, currency = 'EUR') {
  if (!Number.isFinite(minor)) return '';
  const digits = currencyDigits(currency);
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(minor / 10 ** digits);
}

// L'importo come si scrive in un campo, nella lingua in uso: «12,50» in italiano, «12.50» in inglese.
export function amountText(minor, currency = 'EUR') {
  if (!Number.isFinite(minor)) return '';
  const digits = currencyDigits(currency);
  return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).format(minor / 10 ** digits);
}

// Il cambio come si scrive nella lingua in uso, con al massimo i sei decimali che si salvano.
export function rateText(rate) {
  return Number.isFinite(rate) ? new Intl.NumberFormat(locale, { maximumFractionDigits: 6, useGrouping: false }).format(rate) : '';
}

// Le migliaia di ogni lingua: col punto in italiano, con la virgola in inglese. Un gruppo di migliaia non comincia
// mai con lo zero: «0.500» non sono cinquecento euro.
const THOUSANDS = { it: /^[1-9]\d{0,2}(\.\d{3})+$/, en: /^[1-9]\d{0,2}(,\d{3})+$/ };

// Alle unità minime, come lo scrive chi usa il sito: «1.234,50» o «12,5» in italiano, «1,234.50» o «12.5» in inglese.
// L'ultimo separatore apre i decimali, tranne quando separa le migliaia nel modo della lingua. null se non è un importo.
export function parseAmount(text, currency = 'EUR', lang = language) {
  // \u0027 è l'apostrofo delle migliaia svizzere (1'234.50): scritto così non sembra l'inizio di un testo.
  const s = String(text ?? '').replace(/[\s\u0027€$£¥]/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const at = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  let whole = s;
  let frac = '';
  if (at >= 0 && !(THOUSANDS[lang] || THOUSANDS.en).test(s)) {
    whole = s.slice(0, at);
    frac = s.slice(at + 1);
  }
  whole = whole.replace(/[.,]/g, '');
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(frac)) return null;
  const digits = currencyDigits(currency);
  if (frac.length > digits) return null;
  const minor = Number(whole) * 10 ** digits + Number(frac.padEnd(digits, '0') || 0);
  return Number.isSafeInteger(minor) ? minor : null;
}

export const roundRate = (rate) => Math.round(rate * 1e6) / 1e6;

export function sanitizeExpenseGroup(raw = {}) {
  const ids = new Set();
  const members = new Set();
  const people = [];
  for (const p of Array.isArray(raw.people) ? raw.people : []) {
    if (people.length >= EXPENSE_LIMITS.people) break;
    const name = cleanLine(p?.name, EXPENSE_LIMITS.name);
    if (!isPersonId(p?.id) || ids.has(p.id) || !name) continue;
    ids.add(p.id);
    const person = { id: p.id, name };
    if (isUuid(p.member) && !members.has(p.member)) {
      members.add(p.member);
      person.member = p.member;
    }
    const pay = cleanLine(p.pay, EXPENSE_LIMITS.pay);
    if (pay) person.pay = pay;
    people.push(person);
  }
  const data = { currency: isCurrency(raw.currency) ? raw.currency : 'EUR', people };
  const notes = cleanText(raw.notes, EXPENSE_LIMITS.groupNotes);
  if (notes) data.notes = notes;
  return data;
}

const positiveInt = (value, max) => (Number.isSafeInteger(value) && value > 0 && value <= max ? value : null);

export function sanitizeExpense(raw = {}) {
  const data = {};
  if (isUuid(raw.group)) data.group = raw.group;
  data.type = MOVEMENT_TYPES.some(([key]) => key === raw.type) ? raw.type : SPESA;
  const amount = positiveInt(raw.amount, EXPENSE_LIMITS.amount);
  if (amount) data.amount = amount;
  data.currency = isCurrency(raw.currency) ? raw.currency : 'EUR';
  const rate = Number(raw.rate);
  data.rate = Number.isFinite(rate) && rate > 0 && rate < 1e6 ? roundRate(rate) || 1 : 1;
  if (isIsoDate(raw.date)) data.date = raw.date;
  if (isPersonId(raw.paid_by)) data.paid_by = raw.paid_by;
  const mode = SPLIT_MODES.some(([m]) => m === raw.split?.mode) ? raw.split.mode : 'parti';
  const shares = {};
  const source = raw.split?.shares && typeof raw.split.shares === 'object' ? raw.split.shares : {};
  for (const [id, value] of Object.entries(source).slice(0, EXPENSE_LIMITS.people)) {
    if (!isPersonId(id)) continue;
    const n = positiveInt(value, mode === 'importi' ? EXPENSE_LIMITS.amount : mode === 'quote' ? EXPENSE_LIMITS.weight : 1);
    if (n) shares[id] = n;
  }
  data.split = { mode: data.type === 'rimborso' ? 'parti' : mode, shares };
  if (data.type === SPESA) data.category = EXPENSE_CATEGORIES.some(([c]) => c === raw.category) ? raw.category : 'altro';
  const note = cleanText(raw.note, EXPENSE_LIMITS.note);
  if (note) data.note = note;
  if (typeof raw.receipt === 'string' && RECEIPT_PATH_RE.test(raw.receipt)) data.receipt = raw.receipt;
  return data;
}

// Come pagare una persona: IBAN (raggruppato a quattro cifre), link https o testo libero.
const compact = (text) => String(text || '').replace(/\s+/g, '').toUpperCase();
export const looksLikeIban = (text) => /^[A-Z]{2}\d{2}[A-Z0-9]{4,}$/.test(compact(text));

export function ibanValid(text) {
  const iban = compact(text);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const digit of digits) rest = (rest * 10 + Number(digit)) % 97;
  return rest === 1;
}

// Banca dal codice ABI di un IBAN italiano, senza servizi esterni. Solo codici confermati da due fonti
// (la libreria MIT iban-bank-identifier e altri riscontri; PostePay dai documenti di trasparenza di Poste).
// I nomi delle banche restano quelli che sono in ogni lingua; la carta Postepay si descrive.
const ITALIAN_BANKS = {
  '01005': 'BNL',
  '01030': 'Monte dei Paschi di Siena', // i18n-ignore: nome della banca
  '02008': 'UniCredit',
  '03015': 'Fineco',
  '03032': 'Credem',
  '03069': 'Intesa Sanpaolo',
  '03268': 'Banca Sella',
  '03332': 'Banca Passadore',
  '05034': 'Banco BPM',
  '05387': 'BPER Banca',
  '05856': 'Volksbank',
  '06230': 'Crédit Agricole Italia', // i18n-ignore: nome della banca
  '07601': 'BancoPosta',
  '36081': t.iban.postepay,
};

export function ibanBank(text) {
  const iban = compact(text);
  if (!ibanValid(iban)) return null;
  const country = iban.slice(0, 2);
  if (country !== 'IT') return Object.hasOwn(t.iban.countries, country) ? t.iban.countries[country] : t.iban.otherCountry(country);
  const abi = iban.slice(5, 10);
  if (Object.hasOwn(ITALIAN_BANKS, abi)) return ITALIAN_BANKS[abi];
  return abi.startsWith('08') ? 'Credito Cooperativo (BCC)' : t.iban.abiCode(abi);
}

export function payInfo(text) {
  const value = cleanLine(text, EXPENSE_LIMITS.pay);
  if (!value) return null;
  const link = /^paypal\.me\//i.test(value) ? `https://${value}` : value;
  if (/^https:\/\/[^\s/]+\.[^\s]+$/i.test(link)) return { kind: 'link', text: value, copy: link, href: link };
  if (looksLikeIban(value)) return { kind: 'iban', text: compact(value).replace(/(.{4})(?=.)/g, '$1 '), copy: compact(value), bank: ibanBank(value) };
  return { kind: 'text', text: value, copy: value };
}

export const groupPeople = (group) => group?.data?.people || [];
export const personName = (group, id) => groupPeople(group).find((p) => p.id === id)?.name || t.removedPerson;
export const personOfMember = (group, userId) => (userId ? groupPeople(group).find((p) => p.member === userId) || null : null);

export const involves = (movement, personId) =>
  movement.data.paid_by === personId || Object.hasOwn(movement.data.split?.shares || {}, personId);

export function expenseProblem(data, group) {
  const p = t.problems;
  if (!group) return p.noGroup;
  if (!data.amount) return p.noAmount;
  if (!data.date) return p.noDate;
  const ids = new Set(groupPeople(group).map((person) => person.id));
  if (!ids.has(data.paid_by)) {
    if (data.type === 'entrata') return p.noReceiver;
    return data.type === 'rimborso' ? p.noGiver : p.noPayer;
  }
  const chosen = Object.keys(data.split?.shares || {});
  if (chosen.some((id) => !ids.has(id))) return p.personGone;
  if (data.type === 'rimborso') {
    if (chosen.length !== 1) return p.noRefundReceiver;
    if (chosen[0] === data.paid_by) return p.samePerson;
    return null;
  }
  if (!chosen.length) return p.noSplit;
  if (data.split.mode === 'importi') {
    const diff = data.amount - chosen.reduce((sum, id) => sum + data.split.shares[id], 0);
    if (diff > 0) return p.missing(fmtAmount(diff, data.currency));
    if (diff < 0) return p.over(fmtAmount(-diff, data.currency));
  }
  return null;
}

// Un totale in parti intere proporzionali ai pesi: i centesimi che avanzano vanno a chi ha il resto più alto, poi in ordine.
export function distribute(total, weights) {
  const sum = weights.reduce((s, [, w]) => s + w, 0);
  if (!sum || !total) return new Map(weights.map(([id]) => [id, 0]));
  const rows = weights.map(([id, w], index) => {
    const exact = (total * w) / sum;
    const base = Math.floor(exact);
    return { id, base, rest: exact - base, index };
  });
  let left = total - rows.reduce((s, r) => s + r.base, 0);
  for (const row of [...rows].sort((a, b) => b.rest - a.rest || a.index - b.index)) {
    if (left <= 0) break;
    row.base += 1;
    left -= 1;
  }
  return new Map(rows.map((r) => [r.id, r.base]));
}

// Le parti nella valuta del movimento, con la somma sempre uguale al totale.
export function movementShares(data) {
  const entries = Object.entries(data.split?.shares || {});
  if (data.split?.mode === 'importi' && entries.reduce((s, [, v]) => s + v, 0) === data.amount) return new Map(entries);
  return distribute(data.amount || 0, entries);
}

// Totale e parti nella valuta del gruppo, convertiti con il cambio salvato nel movimento.
export function inGroupCurrency(data, groupCurrency) {
  const shares = movementShares(data);
  if (data.currency === groupCurrency) return { total: data.amount || 0, shares };
  const scale = 10 ** (currencyDigits(groupCurrency) - currencyDigits(data.currency));
  const total = Math.round((data.amount || 0) * data.rate * scale);
  return { total, shares: distribute(total, [...shares]) };
}

// Saldo: positivo chi deve ricevere, negativo chi deve dare. Un'entrata è una spesa al contrario.
export function movementEffects(data, groupCurrency) {
  const { total, shares } = inGroupCurrency(data, groupCurrency);
  const sign = data.type === 'entrata' ? -1 : 1;
  const effects = new Map();
  const add = (id, value) => effects.set(id, (effects.get(id) || 0) + value);
  add(data.paid_by, sign * total);
  for (const [id, value] of shares) add(id, -sign * value);
  return effects;
}

export function groupBalances(group, movements) {
  const currency = group.data.currency;
  const rows = new Map(groupPeople(group).map((p) => [p.id, { paid: 0, cost: 0, balance: 0 }]));
  const row = (id) => {
    if (!rows.has(id)) rows.set(id, { paid: 0, cost: 0, balance: 0 });
    return rows.get(id);
  };
  for (const m of movements) {
    const { total, shares } = inGroupCurrency(m.data, currency);
    if (m.data.type === SPESA) {
      row(m.data.paid_by).paid += total;
      for (const [id, value] of shares) row(id).cost += value;
    } else if (m.data.type === 'entrata') {
      for (const [id, value] of shares) row(id).cost -= value;
    }
    for (const [id, value] of movementEffects(m.data, currency)) row(id).balance += value;
  }
  return rows;
}

// Chi dà quanto a chi per tornare in pari: ogni volta chi deve di più paga chi deve ricevere di più, quindi pochi bonifici.
export function settleUp(balances) {
  const creditors = [];
  const debtors = [];
  for (const [id, { balance }] of balances) {
    if (balance > 0) creditors.push({ id, left: balance });
    else if (balance < 0) debtors.push({ id, left: -balance });
  }
  const order = (a, b) => b.left - a.left || a.id.localeCompare(b.id);
  const transfers = [];
  while (creditors.length && debtors.length) {
    creditors.sort(order);
    debtors.sort(order);
    const [creditor] = creditors;
    const [debtor] = debtors;
    const amount = Math.min(creditor.left, debtor.left);
    transfers.push({ from: debtor.id, to: creditor.id, amount });
    creditor.left -= amount;
    debtor.left -= amount;
    if (!creditor.left) creditors.shift();
    if (!debtor.left) debtors.shift();
  }
  return transfers;
}

// Il nome breve del mese nella lingua in uso: «gen» in italiano, «Jan» in inglese.
const monthFormat = new Intl.DateTimeFormat(locale, { month: 'short' });

export function groupStats(group, movements, { me = null, now = new Date() } = {}) {
  const currency = group.data.currency;
  const months = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: monthFormat.format(d), total: 0 });
  }
  const byMonth = new Map(months.map((m) => [m.key, m]));
  const byCategory = new Map();
  let total = 0;
  let income = 0;
  let mine = 0;
  let count = 0;
  for (const m of movements) {
    const { total: value, shares } = inGroupCurrency(m.data, currency);
    if (m.data.type === SPESA) {
      count += 1;
      total += value;
      byCategory.set(m.data.category || 'altro', (byCategory.get(m.data.category || 'altro') || 0) + value);
      const month = byMonth.get(String(m.data.date || '').slice(0, 7));
      if (month) month.total += value;
      if (me) mine += shares.get(me) || 0;
    } else if (m.data.type === 'entrata') {
      income += value;
      if (me) mine -= shares.get(me) || 0;
    }
  }
  const categories = [...byCategory]
    .map(([key, value]) => ({ key, label: categoryLabel(key), total: value }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, locale));
  const people = groupPeople(group).length;
  return { total, income, mine, count, perPerson: people ? Math.round(total / people) : 0, categories, months };
}

export function sortMovements(movements) {
  return [...movements].sort(
    (a, b) => String(b.data.date || '').localeCompare(String(a.data.date || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')),
  );
}

export function movementsCsv(group, movements, { separator = ';' } = {}) {
  const currency = group.data.currency;
  const name = (id) => personName(group, id);
  const c = t.csv;
  const headers = [c.date, c.type, c.description, c.category, c.amount, c.currency, c.rate, c.amountIn(currency), c.paidBy, c.splitBetween, c.note];
  const rows = sortMovements(movements)
    .reverse()
    .map((m) => {
      const d = m.data;
      const { total, shares } = inGroupCurrency(d, currency);
      const split =
        d.type === 'rimborso'
          ? name(Object.keys(d.split.shares)[0])
          : [...shares].map(([id, value]) => `${name(id)} ${amountText(value, currency)}`).join('; ');
      return [
        d.date || '',
        typeLabel(d.type),
        m.title,
        d.type === SPESA ? categoryLabel(d.category) : '',
        amountText(d.amount, d.currency),
        d.currency,
        d.currency === currency ? '' : rateText(d.rate),
        amountText(total, currency),
        name(d.paid_by),
        split,
        d.note || '',
      ];
    });
  return [headers, ...rows].map((row) => row.map((cell) => csvCell(cell, separator)).join(separator)).join('\r\n');
}

// Cambio di riferimento della Banca centrale europea, tramite Frankfurter: partono solo i codici delle valute e la data.
export const RATE_SOURCE = 'https://api.frankfurter.dev/v1';

export async function fetchRate(from, to, date, { fetchImpl = globalThis.fetch, today = new Date().toISOString().slice(0, 10) } = {}) {
  if (from === to) return 1;
  if (!isCurrency(from) || !isCurrency(to)) throw new Error(t.rates.unsupported);
  const day = isIsoDate(date) && date < today ? date : 'latest';
  const res = await fetchImpl(`${RATE_SOURCE}/${day}?base=${from}&symbols=${to}`, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!res?.ok) throw new Error(t.rates.unavailable);
  const body = await res.json();
  const rate = Number(body?.rates?.[to]);
  if (!(rate > 0 && rate < 1e6)) throw new Error(t.rates.unavailable);
  return roundRate(rate);
}
