import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  amountText,
  currencyDigits,
  distribute,
  expenseProblem,
  fetchRate,
  fmtAmount,
  groupBalances,
  groupStats,
  ibanBank,
  ibanValid,
  inGroupCurrency,
  looksLikeIban,
  movementEffects,
  movementsCsv,
  parseAmount,
  payInfo,
  sanitizeExpense,
  sanitizeExpenseGroup,
  settleUp,
  sortMovements,
} from '../../assets/js/expenses.js';

const GROUP_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER = '00000000-0000-4000-8000-00000000000a';
const RECEIPT = `${GROUP_ID}/22222222-2222-4222-8222-222222222222.jpg`;

const group = (over = {}) => ({
  id: GROUP_ID,
  title: 'Costi',
  data: { currency: 'EUR', people: [{ id: 'a', name: 'Anna', member: MEMBER }, { id: 'b', name: 'Bruno' }, { id: 'c', name: 'Carla' }], ...over },
});

const move = (data, over = {}) => ({ id: over.id || 'm', title: over.title || 'Spesa', created_at: over.created_at || '2026-10-01T10:00:00Z', data: { currency: 'EUR', rate: 1, date: '2026-10-01', ...data } });

const equal = (amount, paidBy, ids, extra = {}) => move({ type: 'spesa', amount, paid_by: paidBy, split: { mode: 'parti', shares: Object.fromEntries(ids.map((id) => [id, 1])) }, ...extra });

test('amounts are parsed in Italian or English notation, in minor units, and refuse anything else', () => {
  assert.equal(parseAmount('12,50'), 1250);
  assert.equal(parseAmount('12.5'), 1250);
  assert.equal(parseAmount('1.234,56'), 123456);
  assert.equal(parseAmount('1,234.56'), 123456);
  assert.equal(parseAmount('1.234'), 123400, 'il punto seguito da tre cifre separa le migliaia');
  assert.equal(parseAmount(' 7 € '), 700);
  assert.equal(parseAmount('1500', 'JPY'), 1500, 'lo yen non ha decimali');
  for (const bad of ['', '-3', '12,345', 'abc', '1e5', '12,5,0x']) assert.equal(parseAmount(bad), null, bad);
  assert.equal(parseAmount('1,5', 'JPY'), null);
});

test('amounts are shown with the currency and with the decimals of that currency', () => {
  assert.equal(currencyDigits('EUR'), 2);
  assert.equal(currencyDigits('JPY'), 0);
  assert.match(fmtAmount(123456), /^1234,56\s€$/);
  assert.match(fmtAmount(-800), /^-8,00\s€$/);
  assert.match(fmtAmount(1500, 'JPY'), /1500/);
  assert.equal(amountText(1250), '12,50');
  assert.equal(amountText(1500, 'JPY'), '1500');
});

test('a total is split into whole cents that always add up, the leftover going to the first ones', () => {
  assert.deepEqual([...distribute(100, [['a', 1], ['b', 1], ['c', 1]])], [['a', 34], ['b', 33], ['c', 33]]);
  assert.deepEqual([...distribute(1000, [['a', 2], ['b', 1]])], [['a', 667], ['b', 333]]);
  assert.deepEqual([...distribute(0, [['a', 1]])], [['a', 0]]);
  for (let total = 1; total < 500; total += 7) {
    const parts = distribute(total, [['a', 3], ['b', 5], ['c', 7], ['d', 1]]);
    assert.equal([...parts.values()].reduce((s, v) => s + v, 0), total);
  }
});

test('expenses in another currency are converted with their own rate, keeping parts and total equal', () => {
  const m = move({ type: 'spesa', amount: 1000, currency: 'USD', rate: 0.9, paid_by: 'a', split: { mode: 'parti', shares: { a: 1, b: 1, c: 1 } } });
  const { total, shares } = inGroupCurrency(m.data, 'EUR');
  assert.equal(total, 900);
  assert.deepEqual([...shares], [['a', 300], ['b', 300], ['c', 300]]);
  const yen = inGroupCurrency({ ...m.data, amount: 1000, currency: 'JPY', rate: 0.006 }, 'EUR');
  assert.equal(yen.total, 600, '1000 yen a 0,006 sono 6,00 euro');
});

test('balances add up to zero and a refund or an income moves them the right way', () => {
  const movements = [
    equal(3000, 'a', ['a', 'b', 'c']),
    move({ type: 'spesa', amount: 1200, paid_by: 'b', split: { mode: 'quote', shares: { a: 2, b: 1 } } }),
    move({ type: 'rimborso', amount: 500, paid_by: 'c', split: { mode: 'parti', shares: { a: 1 } } }),
    move({ type: 'entrata', amount: 600, paid_by: 'a', split: { mode: 'parti', shares: { a: 1, b: 1, c: 1 } } }),
  ];
  const balances = groupBalances(group(), movements);
  assert.deepEqual(Object.fromEntries(balances), {
    a: { paid: 3000, cost: 1000 + 800 - 200, balance: 3000 - 1000 - 800 - 500 - 600 + 200 },
    b: { paid: 1200, cost: 1000 + 400 - 200, balance: 1200 - 1000 - 400 + 200 },
    c: { paid: 0, cost: 1000 - 200, balance: -1000 + 500 + 200 },
  });
  assert.equal([...balances.values()].reduce((s, r) => s + r.balance, 0), 0);
  assert.deepEqual([...movementEffects(movements[3].data, 'EUR')], [['a', -400], ['b', 200], ['c', 200]]);
});

test('amounts per person are used as they are when they add up, otherwise as proportions', () => {
  const exact = move({ type: 'spesa', amount: 1000, paid_by: 'a', split: { mode: 'importi', shares: { a: 250, b: 750 } } });
  assert.deepEqual([...inGroupCurrency(exact.data, 'EUR').shares], [['a', 250], ['b', 750]]);
  const wrong = move({ type: 'spesa', amount: 1000, paid_by: 'a', split: { mode: 'importi', shares: { a: 100, b: 100 } } });
  assert.deepEqual([...inGroupCurrency(wrong.data, 'EUR').shares], [['a', 500], ['b', 500]], 'dati incoerenti non rompono i saldi');
});

test('settling up pays the biggest creditor first, with one transfer less than the people involved at most', () => {
  const balances = new Map([
    ['a', { balance: 5000 }],
    ['b', { balance: -2000 }],
    ['c', { balance: -2500 }],
    ['d', { balance: -500 }],
    ['e', { balance: 0 }],
  ]);
  const transfers = settleUp(balances);
  assert.deepEqual(transfers, [
    { from: 'c', to: 'a', amount: 2500 },
    { from: 'b', to: 'a', amount: 2000 },
    { from: 'd', to: 'a', amount: 500 },
  ]);
  assert.deepEqual(settleUp(new Map([['a', { balance: 0 }]])), []);
  const mixed = settleUp(new Map([['a', { balance: 700 }], ['b', { balance: 300 }], ['c', { balance: -600 }], ['d', { balance: -400 }]]));
  assert.equal(mixed.length, 3);
  assert.equal(mixed.reduce((s, t) => s + t.amount, 0), 1000);
});

test('statistics sum expenses by category and by month, net of my share of incomes', () => {
  const movements = [
    equal(3000, 'a', ['a', 'b', 'c'], { category: 'software', date: '2026-10-05' }),
    equal(900, 'b', ['a', 'b', 'c'], { category: 'pasti', date: '2026-09-20' }),
    equal(600, 'b', ['b', 'c'], { category: 'software', date: '2025-01-01' }),
    move({ type: 'entrata', amount: 300, paid_by: 'a', split: { mode: 'parti', shares: { a: 1, b: 1, c: 1 } } }),
  ];
  const stats = groupStats(group(), movements, { me: 'a', now: new Date(2026, 10, 1) });
  assert.equal(stats.total, 4500);
  assert.equal(stats.income, 300);
  assert.equal(stats.mine, 1000 + 300 - 100);
  assert.equal(stats.count, 3);
  assert.equal(stats.perPerson, 1500);
  assert.deepEqual(stats.categories.map((c) => [c.key, c.total]), [['software', 3600], ['pasti', 900]]);
  assert.equal(stats.months.length, 12);
  assert.deepEqual(stats.months.slice(-3).map((m) => [m.label, m.total]), [['set', 900], ['ott', 3000], ['nov', 0]]);
});

test('group data keeps only valid people, unique ids and accounts, and a known currency', () => {
  const data = sanitizeExpenseGroup({
    currency: 'XYZ',
    people: [
      { id: 'a', name: '  Anna  ', member: MEMBER, pay: '  IT60 X054 2811 1010 0000 0123 456  ' },
      { id: 'a', name: 'Doppione' },
      { id: 'b', name: 'Bruno', member: MEMBER },
      { id: 'C!', name: 'Id non valido' },
      { id: 'd', name: '   ' },
      'stringa',
    ],
    notes: '  Note  ',
    extra: 'via',
  });
  assert.deepEqual(data, { currency: 'EUR', people: [{ id: 'a', name: 'Anna', member: MEMBER, pay: 'IT60 X054 2811 1010 0000 0123 456' }, { id: 'b', name: 'Bruno' }], notes: 'Note' });
  assert.equal(sanitizeExpenseGroup({ people: [{ id: 'a', name: 'A', pay: 'x'.repeat(300) }] }).people[0].pay.length, 120);
  assert.equal(sanitizeExpenseGroup({ people: Array.from({ length: 60 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })) }).people.length, 50);
});

test('movement data drops what is not valid and refunds always go to one person by parts', () => {
  const data = sanitizeExpense({
    group: GROUP_ID,
    type: 'spesa',
    amount: 1250,
    currency: 'USD',
    rate: 0.91234567,
    date: '2026-10-31',
    paid_by: 'a',
    split: { mode: 'quote', shares: { a: 2, b: 0, c: 101, 'X!': 1, d: 1.5 } },
    category: 'boh',
    note: ' ok ',
    receipt: RECEIPT,
    extra: 1,
  });
  assert.deepEqual(data, {
    group: GROUP_ID,
    type: 'spesa',
    amount: 1250,
    currency: 'USD',
    rate: 0.912346,
    date: '2026-10-31',
    paid_by: 'a',
    split: { mode: 'quote', shares: { a: 2 } },
    category: 'altro',
    note: 'ok',
    receipt: RECEIPT,
  });
  const refund = sanitizeExpense({ type: 'rimborso', amount: 1, split: { mode: 'importi', shares: { b: 1 } }, category: 'software', receipt: 'http://x/y.jpg' });
  assert.equal(refund.split.mode, 'parti');
  assert.equal(refund.category, undefined);
  assert.equal(refund.receipt, undefined);
  const bad = sanitizeExpense({ amount: -5, rate: 'x', date: '2026-02-30', type: 'altro' });
  assert.equal(bad.amount, undefined);
  assert.equal(bad.rate, 1);
  assert.equal(bad.date, undefined);
  assert.equal(bad.type, 'spesa');
});

test('a movement explains what is missing before it can be saved', () => {
  const g = group();
  const base = sanitizeExpense({ group: GROUP_ID, type: 'spesa', amount: 1000, date: '2026-10-01', paid_by: 'a', split: { mode: 'parti', shares: { a: 1, b: 1 } } });
  assert.equal(expenseProblem(base, g), null);
  assert.equal(expenseProblem(base, null), 'Il gruppo di spese non esiste più.');
  assert.equal(expenseProblem({ ...base, amount: undefined }, g), 'Scrivi un importo maggiore di zero.');
  assert.equal(expenseProblem({ ...base, paid_by: 'z' }, g), 'Scegli chi ha pagato.');
  assert.equal(expenseProblem({ ...base, split: { mode: 'parti', shares: {} } }, g), 'Scegli tra chi dividere.');
  assert.equal(expenseProblem({ ...base, split: { mode: 'parti', shares: { z: 1 } } }, g), 'Nella divisione c\'è una persona che non è più nel gruppo.');
  assert.match(expenseProblem({ ...base, split: { mode: 'importi', shares: { a: 400 } } }, g), /^Mancano 6,00\s€ da dividere\.$/);
  assert.match(expenseProblem({ ...base, split: { mode: 'importi', shares: { a: 1400 } } }, g), /^Le parti superano il totale di 4,00\s€\.$/);
  const refund = { ...base, type: 'rimborso', split: { mode: 'parti', shares: { a: 1 } } };
  assert.equal(expenseProblem(refund, g), 'Chi dà e chi riceve devono essere persone diverse.');
  assert.equal(expenseProblem({ ...refund, split: { mode: 'parti', shares: { b: 1 } } }, g), null);
  assert.equal(expenseProblem({ ...base, type: 'entrata', paid_by: undefined }, g), 'Scegli chi ha ricevuto i soldi.');
});

test('the CSV lists movements oldest first, with converted amounts, people names and no formulas', () => {
  const movements = [
    equal(1000, 'a', ['a', 'b', 'c'], { category: 'software', date: '2026-10-02', note: '=SOMMA(A1)' }),
    move({ type: 'rimborso', amount: 333, paid_by: 'b', date: '2026-10-03', split: { mode: 'parti', shares: { a: 1 } } }, { title: 'Rimborso' }),
    move({ type: 'spesa', amount: 5000, currency: 'USD', rate: 0.9, paid_by: 'b', date: '2026-10-01', split: { mode: 'parti', shares: { a: 1, b: 1 } }, category: 'viaggi' }, { title: 'Taxi; aeroporto' }),
  ];
  const lines = movementsCsv(group(), movements).split('\r\n');
  assert.equal(lines[0], 'Data;Tipo;Descrizione;Categoria;Importo;Valuta;Cambio;Importo in EUR;Pagato da;Diviso tra;Nota');
  assert.equal(lines[1], '2026-10-01;Spesa;"Taxi; aeroporto";Viaggi e trasporti;50,00;USD;0,9;45,00;Bruno;"Anna 22,50; Bruno 22,50";');
  assert.equal(lines[2], "2026-10-02;Spesa;Spesa;Software e servizi online;10,00;EUR;;10,00;Anna;\"Anna 3,34; Bruno 3,33; Carla 3,33\";'=SOMMA(A1)");
  assert.equal(lines[3], '2026-10-03;Rimborso;Rimborso;;3,33;EUR;;3,33;Bruno;Anna;');
});

test('movements are sorted by date, newest first, then by creation', () => {
  const list = sortMovements([
    move({ date: '2026-10-01' }, { id: 'old' }),
    move({ date: '2026-10-05' }, { id: 'new', created_at: '2026-10-05T08:00:00Z' }),
    move({ date: '2026-10-05' }, { id: 'newer', created_at: '2026-10-05T09:00:00Z' }),
  ]);
  assert.deepEqual(list.map((m) => m.id), ['newer', 'new', 'old']);
});

test('the rate comes from the ECB through Frankfurter, sending only currencies and date', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, init]);
    return { ok: true, json: async () => ({ rates: { EUR: 0.8950912 } }) };
  };
  assert.equal(await fetchRate('USD', 'EUR', '2026-10-30', { fetchImpl, today: '2026-11-01' }), 0.895091);
  assert.equal(calls[0][0], 'https://api.frankfurter.dev/v1/2026-10-30?base=USD&symbols=EUR');
  assert.equal(calls[0][1].credentials, 'omit');
  await fetchRate('USD', 'EUR', '2026-11-01', { fetchImpl, today: '2026-11-01' });
  assert.equal(calls[1][0], 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR', 'oggi e il futuro usano il cambio più recente');
  assert.equal(await fetchRate('EUR', 'EUR', '2026-10-30', { fetchImpl }), 1);
  assert.equal(calls.length, 2);
  await assert.rejects(fetchRate('USD', 'XYZ', null, { fetchImpl }), /Valuta non supportata/);
  await assert.rejects(fetchRate('USD', 'EUR', null, { fetchImpl: async () => ({ ok: false }) }), /Cambio non disponibile/);
  await assert.rejects(fetchRate('USD', 'EUR', null, { fetchImpl: async () => ({ ok: true, json: async () => ({ rates: { EUR: 'x' } }) }) }), /Cambio non disponibile/);
});

test('how to pay someone: IBANs are checked and grouped, only https links are clickable, the rest is plain text', () => {
  assert.equal(ibanValid('IT60 X054 2811 1010 0000 0123 456'), true);
  assert.equal(ibanValid('it60x0542811101000000123456'), true);
  assert.equal(ibanValid('GB82 WEST 1234 5698 7654 32'), true);
  assert.equal(ibanValid('IT60 X054 2811 1010 0000 0123 457'), false, 'una cifra sbagliata non passa');
  assert.equal(looksLikeIban('IT60 X054'), true);
  assert.equal(looksLikeIban('Satispay 333 1234567'), false);
  assert.deepEqual(payInfo('it60x0542811101000000123456'), { kind: 'iban', text: 'IT60 X054 2811 1010 0000 0123 456', copy: 'IT60X0542811101000000123456', bank: 'codice ABI 05428' });
  assert.deepEqual(payInfo('paypal.me/anna'), { kind: 'link', text: 'paypal.me/anna', copy: 'https://paypal.me/anna', href: 'https://paypal.me/anna' });
  assert.equal(payInfo('https://paypal.me/anna').kind, 'link');
  assert.equal(payInfo('http://paypal.me/anna').kind, 'text', 'solo https');
  assert.equal(payInfo('javascript:alert(1)').kind, 'text');
  assert.deepEqual(payInfo('Satispay al 333 1234567'), { kind: 'text', text: 'Satispay al 333 1234567', copy: 'Satispay al 333 1234567' });
  assert.equal(payInfo('   '), null);
});

test('the bank comes from the IBAN itself, with known Italian codes, cooperative banks and the country for foreign accounts', () => {
  const italian = (abi) => {
    const bban = `X${abi}01600000000123456`;
    for (let check = 2; check < 99; check += 1) {
      const iban = `IT${String(check).padStart(2, '0')}${bban}`;
      if (ibanValid(iban)) return iban;
    }
    return null;
  };
  assert.equal(ibanBank(italian('36081')), 'Postepay, carta con IBAN');
  assert.equal(ibanBank(italian('03069')), 'Intesa Sanpaolo');
  assert.equal(ibanBank(italian('08327')), 'Credito Cooperativo (BCC)');
  assert.equal(ibanBank(italian('05428')), 'codice ABI 05428');
  assert.equal(ibanBank('GB82 WEST 1234 5698 7654 32'), 'IBAN britannico');
  assert.equal(ibanBank('IT60 X054 2811 1010 0000 0123 457'), null, 'un IBAN sbagliato non dice nulla');
  assert.equal(ibanBank('Satispay'), null);
});
