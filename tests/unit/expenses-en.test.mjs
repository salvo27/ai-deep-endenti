import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useLanguage } from '../setup/language.mjs';
import { italianWords } from '../setup/italian.mjs';

// Su un dispositivo in inglese: la lingua si decide quando il sito si carica, quindi i moduli si importano dopo.
useLanguage('en');
const {
  CURRENCIES,
  EXPENSE_CATEGORIES,
  MOVEMENT_TYPES,
  SPLIT_MODES,
  amountText,
  categoryLabel,
  expenseProblem,
  fetchRate,
  fmtAmount,
  groupStats,
  ibanBank,
  ibanValid,
  movementsCsv,
  parseAmount,
  payInfo,
  personName,
  rateText,
  sanitizeExpense,
  typeLabel,
} = await import('../../assets/js/expenses.js');
const { language, locale } = await import('../../assets/js/i18n/index.js');

const GROUP_ID = '11111111-1111-4111-8111-111111111111';
const group = (over = {}) => ({
  id: GROUP_ID,
  title: 'Costs',
  data: { currency: 'EUR', people: [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Bruno' }, { id: 'c', name: 'Carla' }], ...over },
});
const move = (data, over = {}) => ({ id: over.id || 'm', title: over.title || 'Expense', created_at: '2026-10-01T10:00:00Z', data: { currency: 'EUR', rate: 1, date: '2026-10-01', ...data } });
const equal = (amount, paidBy, ids, extra = {}) => move({ type: 'spesa', amount, paid_by: paidBy, split: { mode: 'parti', shares: Object.fromEntries(ids.map((id) => [id, 1])) }, ...extra });

// Un IBAN italiano valido con il codice ABI scelto: le due cifre di controllo si cercano.
function italianIban(abi) {
  const bban = `X${abi}01600000000123456`;
  for (let check = 2; check < 99; check += 1) {
    const iban = `IT${String(check).padStart(2, '0')}${bban}`;
    if (ibanValid(iban)) return iban;
  }
  return null;
}

describe('spese su un dispositivo in inglese', () => {
  it('il sito è in inglese, con date e numeri britannici', () => {
    assert.equal(language, 'en');
    assert.equal(locale, 'en-GB');
  });
});

describe('nomi di valute, tipi, divisioni e categorie', () => {
  it('hanno il nome in inglese e la stessa chiave salvata di sempre', () => {
    assert.deepEqual(MOVEMENT_TYPES, [['spesa', 'Expense'], ['rimborso', 'Refund'], ['entrata', 'Income']]);
    assert.deepEqual(SPLIT_MODES, [['parti', 'Equally'], ['quote', 'By shares'], ['importi', 'By amounts']]);
    assert.deepEqual(EXPENSE_CATEGORIES.map(([key]) => key), ['software', 'viaggi', 'alloggio', 'pasti', 'eventi', 'materiali', 'consulenze', 'marketing', 'altro']);
    assert.deepEqual(CURRENCIES.map(([code]) => code), ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'TRY', 'CNY', 'INR', 'BRL']);
  });

  for (const [key, label] of [
    ['EUR', 'Euro'],
    ['USD', 'US dollar'],
    ['GBP', 'British pound'],
    ['CHF', 'Swiss franc'],
    ['JPY', 'Japanese yen'],
    ['BRL', 'Brazilian real'],
  ]) {
    it(`la valuta ${key} si chiama ${label}`, () => {
      assert.equal(CURRENCIES.find(([code]) => code === key)[1], label);
    });
  }

  for (const [key, label] of [
    ['software', 'Software and online services'],
    ['viaggi', 'Travel and transport'],
    ['alloggio', 'Accommodation'],
    ['pasti', 'Meals and drinks'],
    ['consulenze', 'Paperwork and consulting'],
    ['altro', 'Other'],
  ]) {
    it(`la categoria ${key} si legge ${label}`, () => {
      assert.equal(categoryLabel(key), label);
    });
  }

  it('una categoria o un tipo sconosciuti valgono Altro e Spesa, in inglese', () => {
    assert.equal(categoryLabel('boh'), 'Other');
    assert.equal(categoryLabel(undefined), 'Other');
    assert.equal(typeLabel('boh'), 'Expense');
    assert.equal(typeLabel('rimborso'), 'Refund');
  });

  it('nessun nome ha parole italiane', () => {
    const labels = [...CURRENCIES, ...MOVEMENT_TYPES, ...SPLIT_MODES, ...EXPENSE_CATEGORIES].map(([, label]) => label);
    assert.deepEqual(labels.filter((label) => italianWords(label).length), []);
  });
});

describe('importi scritti in inglese', () => {
  for (const [minor, currency, expected] of [
    [123456, 'EUR', '€1,234.56'],
    [-800, 'EUR', '-€8.00'],
    [0, 'EUR', '€0.00'],
    [1, 'EUR', '€0.01'],
    [6000, 'USD', 'US$60.00'],
    [1500, 'JPY', 'JP¥1,500'],
    [Number.NaN, 'EUR', ''],
  ]) {
    it(`${minor} ${currency} si mostra ${JSON.stringify(expected)}`, () => {
      assert.equal(fmtAmount(minor, currency), expected);
    });
  }

  for (const [minor, currency, expected] of [
    [1250, 'EUR', '12.50'],
    [123456, 'EUR', '1234.56'],
    [5, 'EUR', '0.05'],
    [1500, 'JPY', '1500'],
    [Number.POSITIVE_INFINITY, 'EUR', ''],
  ]) {
    it(`nel campo ${minor} ${currency} si scrive ${JSON.stringify(expected)}, con il punto e senza migliaia`, () => {
      assert.equal(amountText(minor, currency), expected);
    });
  }

  for (const [rate, expected] of [
    [0.9, '0.9'],
    [0.912346, '0.912346'],
    [1, '1'],
    [158.25, '158.25'],
  ]) {
    it(`il cambio ${rate} si scrive ${expected}`, () => {
      assert.equal(rateText(rate), expected);
    });
  }
});

describe('importi letti come li scrive chi usa il sito in inglese', () => {
  for (const [typed, expected] of [
    ['12.50', 1250],
    ['12.5', 1250],
    ['1,234.56', 123456],
    ['1,234', 123400],
    ['12,345', 1234500],
    ['1,000,000', 100000000],
    ['1.234,56', 123456],
    ['12,5', 1250],
    ['12,50', 1250],
    [' 7 € ', 700],
    ['£7', 700],
    ['0', 0],
    ['0.01', 1],
    ['90,071,992,547,409.91', 9007199254740991],
    ['90,071,992,547,409.92', null],
    ['1.234', null],
    ['12.345', null],
    ['0,500', null],
    ['', null],
    ['-3', null],
    ['abc', null],
    ['1e5', null],
    ['.5', null],
  ]) {
    it(`${JSON.stringify(typed)} vale ${expected}`, () => {
      assert.equal(parseAmount(typed), expected);
    });
  }

  it('lo yen non ha decimali, ma la virgola delle migliaia sì', () => {
    assert.equal(parseAmount('1,500', 'JPY'), 1500);
    assert.equal(parseAmount('1.5', 'JPY'), null);
  });

  // Lo stesso testo vale diverso a seconda della lingua: punto e virgola si scambiano i ruoli.
  for (const [typed, it_, en] of [
    ['1.234', 123400, null],
    ['1,234', null, 123400],
    ['12.345', 1234500, null],
    ['12,345', null, 1234500],
    ['12.5', 1250, 1250],
    ['12,5', 1250, 1250],
    ['1.234,56', 123456, 123456],
    ['1,234.56', 123456, 123456],
  ]) {
    it(`${JSON.stringify(typed)} vale ${it_} in italiano e ${en} in inglese`, () => {
      assert.equal(parseAmount(typed, 'EUR', 'it'), it_);
      assert.equal(parseAmount(typed, 'EUR', 'en'), en);
      assert.equal(parseAmount(typed, 'EUR'), en, 'senza lingua vale quella in uso');
    });
  }

  it('quello che il campo mostra si rilegge uguale', () => {
    for (const [minor, currency] of [[0, 'EUR'], [1, 'EUR'], [1250, 'EUR'], [123456789, 'EUR'], [1500, 'JPY'], [99, 'USD']]) {
      assert.equal(parseAmount(amountText(minor, currency), currency), minor, `${minor} ${currency}`);
      assert.equal(parseAmount(fmtAmount(minor, currency).replace(/[^\d.,]/g, ''), currency), minor, `${minor} ${currency} formattato`);
    }
  });
});

describe('problemi di un movimento, in inglese', () => {
  const g = group();
  const base = sanitizeExpense({ group: GROUP_ID, type: 'spesa', amount: 1000, date: '2026-10-01', paid_by: 'a', split: { mode: 'parti', shares: { a: 1, b: 1 } } });
  for (const [name, data, grp, expected] of [
    ['va bene', base, g, null],
    ['gruppo sparito', base, null, 'This expense group no longer exists.'],
    ['senza importo', { ...base, amount: undefined }, g, 'Enter an amount greater than zero.'],
    ['senza data', { ...base, date: undefined }, g, 'Choose the date.'],
    ['senza chi paga', { ...base, paid_by: 'z' }, g, 'Choose who paid.'],
    ['entrata senza chi riceve', { ...base, type: 'entrata', paid_by: undefined }, g, 'Choose who received the money.'],
    ['rimborso senza chi dà', { ...base, type: 'rimborso', paid_by: undefined }, g, 'Choose who gave the money.'],
    ['persona sparita', { ...base, split: { mode: 'parti', shares: { z: 1 } } }, g, 'Someone in the split is no longer in the group.'],
    ['rimborso a due persone', { ...base, type: 'rimborso', split: { mode: 'parti', shares: { b: 1, c: 1 } } }, g, 'Choose who received the refund.'],
    ['rimborso a sé stessi', { ...base, type: 'rimborso', split: { mode: 'parti', shares: { a: 1 } } }, g, 'The giver and the receiver must be different people.'],
    ['nessuno nella divisione', { ...base, split: { mode: 'parti', shares: {} } }, g, 'Choose who to split it between.'],
    ['importi che non bastano', { ...base, split: { mode: 'importi', shares: { a: 400 } } }, g, 'Still €6.00 to split.'],
    ['importi di troppo', { ...base, split: { mode: 'importi', shares: { a: 1400 } } }, g, 'The shares are €4.00 over the total.'],
    ['importi giusti al centesimo', { ...base, split: { mode: 'importi', shares: { a: 999, b: 1 } } }, g, null],
  ]) {
    it(`${name}: ${expected ?? 'nessun problema'}`, () => {
      assert.equal(expenseProblem(data, grp), expected);
    });
  }
});

describe('banca e paese dall IBAN, in inglese', () => {
  for (const [name, iban, expected] of [
    ['IBAN britannico', 'GB82 WEST 1234 5698 7654 32', 'British IBAN'],
    ['paese senza nome', 'NO93 8601 1117 947', 'IBAN from country NO'],
    ['codice ABI sconosciuto', italianIban('05428'), 'ABI code 05428'],
    ['Postepay', italianIban('36081'), 'Postepay, card with IBAN'],
    ['banca nota, il nome resta', italianIban('03069'), 'Intesa Sanpaolo'],
    ['credito cooperativo, il nome resta', italianIban('08327'), 'Credito Cooperativo (BCC)'],
    ['IBAN sbagliato', 'IT60 X054 2811 1010 0000 0123 457', null],
  ]) {
    it(`${name}: ${expected}`, () => {
      assert.equal(ibanBank(iban), expected);
    });
  }

  it('il modo di pagare dice la banca in inglese', () => {
    assert.equal(payInfo('it60x0542811101000000123456').bank, 'ABI code 05428');
  });
});

describe('persone e statistiche, in inglese', () => {
  it('chi non è più nel gruppo ha un nome di ripiego in inglese', () => {
    assert.equal(personName(group(), 'z'), 'Person removed from the group');
    assert.equal(personName(group(), 'b'), 'Bruno');
  });

  it('i mesi hanno il nome inglese breve', () => {
    const stats = groupStats(group(), [], { now: new Date(2026, 10, 1) });
    const labels = stats.months.map((m) => m.label);
    assert.equal(labels.length, 12);
    assert.deepEqual(labels.slice(-2), ['Oct', 'Nov']);
    assert.match(labels.at(-3), /^Sep/);
    assert.equal(labels[0], 'Dec');
    assert.deepEqual(labels.filter((label) => italianWords(label).length), []);
  });

  it('a pari totale le categorie vanno in ordine alfabetico inglese', () => {
    const movements = [
      equal(500, 'a', ['a'], { category: 'consulenze' }),
      equal(500, 'a', ['a'], { category: 'materiali' }),
      equal(900, 'a', ['a'], { category: 'viaggi' }),
    ];
    const stats = groupStats(group(), movements, { now: new Date(2026, 10, 1) });
    assert.deepEqual(stats.categories.map((c) => c.label), ['Travel and transport', 'Equipment and supplies', 'Paperwork and consulting']);
  });
});

describe('CSV in inglese', () => {
  it('intestazioni, tipi, categorie e numeri sono in inglese, i dati restano quelli scritti', () => {
    const movements = [
      equal(1000, 'a', ['a', 'b', 'c'], { category: 'software', date: '2026-10-02', note: '=SUM(A1)' }),
      move({ type: 'rimborso', amount: 333, paid_by: 'b', date: '2026-10-03', split: { mode: 'parti', shares: { a: 1 } } }, { title: 'Refund' }),
      move({ type: 'spesa', amount: 5000, currency: 'USD', rate: 0.9, paid_by: 'b', date: '2026-10-01', split: { mode: 'parti', shares: { a: 1, b: 1 } }, category: 'viaggi' }, { title: 'Taxi; airport' }),
      move({ type: 'entrata', amount: 123456, paid_by: 'z', date: '2026-10-04', split: { mode: 'parti', shares: { a: 1 } } }, { title: 'Grant' }),
    ];
    const lines = movementsCsv(group(), movements).split('\r\n');
    assert.equal(lines[0], 'Date;Type;Description;Category;Amount;Currency;Rate;Amount in EUR;Paid by;Split between;Note');
    assert.equal(lines[1], '2026-10-01;Expense;"Taxi; airport";Travel and transport;50.00;USD;0.9;45.00;Bruno;"Anna 22.50; Bruno 22.50";');
    assert.equal(lines[2], "2026-10-02;Expense;Expense;Software and online services;10.00;EUR;;10.00;Anna;\"Anna 3.34; Bruno 3.33; Carla 3.33\";'=SUM(A1)");
    assert.equal(lines[3], '2026-10-03;Refund;Refund;;3.33;EUR;;3.33;Bruno;Anna;');
    assert.equal(lines[4], '2026-10-04;Income;Grant;;1234.56;EUR;;1234.56;Person removed from the group;Anna 1234.56;');
  });
});

describe('cambio della BCE, in inglese', () => {
  it('gli errori si leggono in inglese', async () => {
    await assert.rejects(fetchRate('USD', 'XYZ', null, { fetchImpl: async () => ({ ok: true }) }), /^Error: Currency not supported\.$/);
    await assert.rejects(fetchRate('USD', 'EUR', null, { fetchImpl: async () => ({ ok: false }) }), /^Error: Rate not available\.$/);
    await assert.rejects(fetchRate('USD', 'EUR', null, { fetchImpl: async () => ({ ok: true, json: async () => ({ rates: { EUR: 0 } }) }) }), /^Error: Rate not available\.$/);
  });
});
