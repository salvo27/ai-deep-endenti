import { test, expect } from '@playwright/test';
import { addDays, shortDate, thisMonday, weekLabel } from '../../assets/js/availability.js';

const IDEA = '11111111-1111-4111-8111-111111111111';
const SURVEY = 'eeeeeeee-0000-4000-8000-000000000001';
const EXPENSES = 'ffffffff-0000-4000-8000-000000000001';
const IDEA_TABS = ['roadmap', 'analisi', 'validazione', 'discussione', 'canvas', 'clienti', 'mercato', 'deeptech', 'esperimenti', 'interviste', 'questionari', 'appunti', 'voti', 'commenti', 'storico'];

const PAGES = [
  '#/',
  '#/idee',
  `#/idea/${IDEA}`,
  ...IDEA_TABS.map((tab) => `#/idea/${IDEA}/${tab}`),
  '#/valutazione',
  '#/valutazione?vista=miei',
  '#/valutazione?vista=fotografie',
  '#/esperimenti',
  '#/interviste',
  '#/interviste?tipo=ricerca',
  '#/contatti',
  '#/contatti?filtro=senza',
  '#/questionari',
  `#/questionario/${SURVEY}`,
  `#/questionario/${SURVEY}/aspetto`,
  `#/questionario/${SURVEY}/condividi`,
  `#/questionario/${SURVEY}/risposte`,
  '#/decisioni',
  '#/generatore',
  '#/squadra',
  '#/squadra/disponibilita',
  '#/squadra/disponibilita?vista=miei',
  '#/squadra/ore',
  '#/squadra/ore?vista=mie',
  '#/guida',
  '#/guida/concetti',
  '#/concetti',
  '#/storico',
  '#/cestino',
  '#/membri',
  '#/spese',
  `#/spese/${EXPENSES}`,
  `#/spese/${EXPENSES}/saldi`,
  `#/spese/${EXPENSES}/statistiche`,
  `#/spese/${EXPENSES}/gruppo`,
  '#/team',
  '#/profilo',
];

async function open(page, hash) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`/tests/e2e/preview.html${hash}`);
  await expect(page.locator('#content > *').first()).toBeVisible();
  await page.waitForTimeout(150);
  return errors;
}

for (const hash of PAGES) {
  test(`${hash}: nessun errore e niente esce dallo schermo`, async ({ page, isMobile }) => {
    const errors = await open(page, hash);
    // Sul telefono una pagina più larga allarga anche innerWidth: si confronta con lo schermo vero.
    const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, window.innerWidth) - window.visualViewport.width);
    expect(overflow, 'la pagina scorre in orizzontale').toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

for (const [hash, label] of [['#/valutazione?vista=miei', 'Salva i miei voti'], ['#/squadra/disponibilita?vista=miei', 'Salva i miei impegni'], ['#/squadra/ore?vista=mie', 'Salva le mie ore']]) {
  test(`la barra "${label}" resta sopra la tabella anche in fondo alla pagina`, async ({ page }) => {
    await open(page, hash);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const bar = page.locator('.save-bar');
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('button', { name: label })).toBeVisible();
    const box = await bar.boundingBox();
    const covered = await page.evaluate(({ x, y, width, height }) => {
      const points = [[x + 8, y + height / 2], [x + width / 2, y + height / 2], [x + width - 8, y + height / 2]];
      return points.filter(([px, py]) => !document.elementFromPoint(px, py)?.closest('.save-bar')).length;
    }, box);
    expect(covered, 'qualcosa copre la barra di salvataggio').toBe(0);
  });
}

test('il menu si apre e si chiude toccando fuori', async ({ page }) => {
  await open(page, '#/');
  const menu = page.getByRole('button', { name: 'Menu' });
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  const viewport = page.viewportSize();
  await page.mouse.click(viewport.width - 10, viewport.height - 10);
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});

test('questionario: domande aperte e risposte singole restano dentro lo schermo', async ({ page }) => {
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const errors = await open(page, `#/questionario/${SURVEY}`);
  for (const button of await page.locator('.sq-card [data-action="toggle"]').all()) await button.click();
  await expect(page.locator('.sq-body').first()).toBeVisible();
  expect(await overflow(), 'le domande aperte scorrono in orizzontale').toBeLessThanOrEqual(1);
  await page.goto(`/tests/e2e/preview.html#/questionario/${SURVEY}/risposte`);
  await expect(page.locator('.sv-response').first()).toBeVisible();
  for (const details of await page.locator('.sv-response summary').all()) await details.click();
  for (const details of await page.locator('.sv-other summary').all()) await details.click();
  expect(await overflow(), 'le risposte scorrono in orizzontale').toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

const overflowOf = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const editCell = (page, day, hour) => page.locator(`.av-edit .av-cell[data-day="${day}"][data-hour="${hour}"]`);

async function centerOf(locator) {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Sul telefono eventi touch di Chrome, sul computer il mouse.
async function drag(page, hasTouch, from, to) {
  const a = await centerOf(from);
  const b = await centerOf(to);
  const steps = 8;
  const along = (i) => ({ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps });
  if (!hasTouch) {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps });
    await page.mouse.up();
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
  for (let i = 1; i <= steps; i += 1) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [along(i)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

// Un tocco vero: il dito resta giù un attimo e il clic arriva dopo, in un compito a parte.
async function fingerTap(page, cell) {
  const point = await centerOf(cell);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(80);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(400);
}

test('disponibilità: col dito un tocco segna l\'ora e il tocco dopo la toglie, ogni volta', async ({ page, hasTouch }) => {
  test.skip(!hasTouch, 'solo sul telefono');
  await open(page, '#/squadra/disponibilita?vista=miei');
  await page.locator('.av-edit').evaluate((table) => table.scrollIntoView({ block: 'center' }));
  const cell = editCell(page, 3, 15);
  let pressed = (await cell.getAttribute('aria-pressed')) === 'true';
  for (let i = 0; i < 4; i += 1) {
    await fingerTap(page, cell);
    pressed = !pressed;
    expect(await cell.getAttribute('aria-pressed'), `tocco ${i + 1}`).toBe(String(pressed));
  }
});

test('disponibilità: toccando la vista già aperta le ore non salvate restano', async ({ page }) => {
  await open(page, '#/squadra/disponibilita?vista=miei');
  const cell = editCell(page, 2, 16);
  const before = await cell.getAttribute('aria-pressed');
  await cell.click();
  await expect(page.getByRole('status').filter({ hasText: 'Modifiche non salvate' })).toBeVisible();
  await page.locator('nav.subtabs a.is-active').click();
  await page.waitForTimeout(150);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  expect(await cell.getAttribute('aria-pressed')).not.toBe(before);
  await expect(page.getByRole('status').filter({ hasText: 'Modifiche non salvate' })).toBeVisible();
});

test('disponibilità: l\'ultima riga della griglia non resta sotto la barra di salvataggio', async ({ page }) => {
  await open(page, '#/squadra/disponibilita?vista=miei');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll('.av-edit .av-cell[data-hour="21"]')].filter((cell) => {
      const box = cell.getBoundingClientRect();
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) !== cell;
    }).length,
  );
  expect(hidden, 'celle delle 21-22 coperte').toBe(0);
});

test('disponibilità: trascinando sulle ore si segnano e si tolgono, anche col dito', async ({ page, hasTouch }) => {
  const errors = await open(page, '#/squadra/disponibilita?vista=miei');
  const hint = page.locator('.av-touch-hint');
  if (hasTouch) await expect(hint).toBeVisible();
  else await expect(hint).toBeHidden();
  await page.locator('.av-edit').evaluate((table) => table.scrollIntoView({ block: 'center' }));
  // Gli eventi touch finti non fanno scorrere la pagina: si controlla la regola che lo impedisce col dito.
  expect(await editCell(page, 5, 8).evaluate((cell) => getComputedStyle(cell).touchAction)).toBe('none');
  const pressed = (day, hours) =>
    Promise.all(
      hours.map((hour) =>
        editCell(page, day, hour).evaluate((cell) => {
          const value = cell.getAttribute('aria-pressed');
          return cell.classList.contains('av-taken') === (value === 'true') ? value : `av-taken diverso da aria-pressed ${value}`;
        }),
      ),
    );

  await drag(page, hasTouch, editCell(page, 5, 8), editCell(page, 5, 11));
  expect(await pressed(5, [8, 9, 10, 11, 12])).toEqual(['true', 'true', 'true', 'true', 'false']);
  await expect(page.getByRole('status').filter({ hasText: 'Modifiche non salvate' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salva i miei impegni' })).toBeEnabled();

  // Partendo da un'ora impegnata il trascinamento la libera.
  await drag(page, hasTouch, editCell(page, 5, 11), editCell(page, 5, 10));
  expect(await pressed(5, [8, 9, 10, 11])).toEqual(['true', 'true', 'false', 'false']);

  // Il clic che segue il tocco non deve cambiare l'ora una seconda volta.
  const tap = (cell) => (hasTouch ? cell.tap() : cell.click());
  await tap(editCell(page, 6, 13));
  await page.waitForTimeout(50);
  expect(await pressed(6, [13])).toEqual(['true']);
  await tap(editCell(page, 6, 13));
  await page.waitForTimeout(50);
  expect(await pressed(6, [13])).toEqual(['false']);
  expect(errors).toEqual([]);
});

test('disponibilità: con la tastiera le frecce passano tra le ore e Invio segna l\'ora', async ({ page }) => {
  await open(page, '#/squadra/disponibilita?vista=miei');
  await editCell(page, 6, 8).focus();
  await page.keyboard.press('ArrowDown');
  await expect(editCell(page, 6, 9)).toBeFocused();
  await expect(page.locator('.av-edit .av-cell[tabindex="0"]')).toHaveCount(1);
  await expect(editCell(page, 6, 9)).toHaveAttribute('tabindex', '0');
  await page.keyboard.press('ArrowLeft');
  await expect(editCell(page, 5, 9)).toBeFocused();
  await expect(editCell(page, 5, 9)).toHaveAttribute('tabindex', '0');
  await page.keyboard.press('Enter');
  await expect(editCell(page, 5, 9)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Salva i miei impegni' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(editCell(page, 5, 9)).toBeFocused();
  await page.keyboard.press(' ');
  await expect(editCell(page, 5, 9)).toHaveAttribute('aria-pressed', 'false');
});

test('disponibilità: con la tastiera il fuoco resta sul pulsante premuto anche dopo il ridisegno', async ({ page }) => {
  await open(page, '#/squadra/disponibilita?vista=miei');
  const week = page.getByRole('button', { name: 'Una settimana precisa' });
  await week.focus();
  await page.keyboard.press('Enter');
  await expect(week).toHaveAttribute('aria-pressed', 'true');
  await expect(week).toBeFocused();
  const next = page.getByRole('button', { name: 'Settimana successiva' });
  await next.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.locator('.av-week-title strong')).toHaveText('Tra 2 settimane');
  await expect(next).toBeFocused();
  const prev = page.getByRole('button', { name: 'Settimana precedente' });
  await prev.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.av-week-title strong')).toHaveText('La prossima settimana');
  await expect(prev).toBeFocused();
});

test('disponibilità: le ore impegnate sono piene, senza la rotellina di caricamento', async ({ page }) => {
  await open(page, '#/squadra/disponibilita?vista=miei');
  // Orario tipo di Anna tra le 8 e le 22: 5 + 5 + 3 + 4 + 2 ore, le 7 e le 22 restano fuori.
  await expect(page.locator('.av-edit .av-cell.av-taken')).toHaveCount(19);
  await expect(page.locator('.av-cell.is-busy')).toHaveCount(0);
  await expect(page.locator('.av-edit .av-cell[aria-pressed="true"]:not(.av-taken), .av-edit .av-cell.av-taken:not([aria-pressed="true"])')).toHaveCount(0);
  const look = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.av-edit .av-cell')];
    const taken = cells.filter((cell) => cell.classList.contains('av-taken'));
    const free = getComputedStyle(cells.find((cell) => !cell.classList.contains('av-taken')));
    return {
      spinning: taken.filter((cell) => getComputedStyle(cell, '::after').animationName !== 'none').length,
      notFilled: taken.filter((cell) => {
        const style = getComputedStyle(cell);
        return style.backgroundColor !== style.borderTopColor || style.backgroundColor === free.backgroundColor;
      }).length,
    };
  });
  expect(look.spinning, 'ore impegnate con la rotellina').toBe(0);
  expect(look.notFilled, 'ore impegnate senza il colore pieno').toBe(0);
});

for (const [hash, section, view] of [
  ['#/squadra/disponibilita', 'Disponibilità', 'Orari della squadra'],
  ['#/squadra/disponibilita?vista=miei', 'Disponibilità', 'I miei impegni'],
  ['#/squadra/ore', 'Ore lavorate', 'Ore della squadra'],
  ['#/squadra/ore?vista=mie', 'Ore lavorate', 'Le mie ore'],
]) {
  test(`${section.toLowerCase()}: sul telefono la scheda attiva si legge tutta (${view})`, async ({ page }) => {
    await open(page, hash);
    // Le schede si portano in vista al fotogramma dopo il disegno.
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.querySelectorAll('.tabs')].map((strip) => {
            const box = strip.getBoundingClientRect();
            const active = strip.querySelector('.tab.is-active');
            const tab = active.getBoundingClientRect();
            const outside = Math.max(0, box.left - tab.left, tab.right - box.right);
            return `${strip.getAttribute('aria-label')} ${active.textContent}: ${outside > 1 ? `${Math.round(outside)} px fuori` : 'si legge'}`;
          }),
        ),
      )
      .toEqual([`Sezioni ${section}: si legge`, `Vista ${view}: si legge`]);
    expect(await page.evaluate(() => window.scrollY), 'la pagina si è spostata').toBe(0);
  });
}

function weekRowProblems(page) {
  return page.locator('.av-week').evaluate((nav) => {
    const parts = [...nav.children];
    if (parts.length !== 3 || !parts[1].classList.contains('av-week-title')) return ['frecce e titolo non sono tre pezzi'];
    const [prev, title, next] = parts.map((el) => el.getBoundingClientRect());
    const middle = (box) => box.top + box.height / 2;
    const problems = [];
    if (prev.right > title.left + 1 || title.right > next.left + 1) problems.push('titolo non tra le due frecce');
    if ([prev, next].some((box) => middle(box) < title.top || middle(box) > title.bottom)) problems.push('frecce non sulla riga del titolo');
    if (prev.left < 0 || next.right > window.innerWidth + 1) problems.push('frecce fuori dallo schermo');
    return problems;
  });
}

test('disponibilità: titolo della settimana e frecce restano su una riga, anche a 375 px', async ({ page }) => {
  await open(page, '#/squadra/disponibilita');
  const title = page.locator('.av-week-title');
  await expect(title).toHaveAttribute('aria-live', 'polite');
  const next = page.getByRole('button', { name: 'Settimana successiva' });
  const names = ['Questa settimana', 'La prossima settimana', ...Array.from({ length: 10 }, (_, i) => `Tra ${i + 2} settimane`)];
  for (const [i, name] of names.entries()) {
    if (i) await next.click();
    await expect(title.locator('strong')).toHaveText(name);
    await expect(title.locator('span.muted')).toHaveText(weekLabel(addDays(thisMonday(), i * 7)));
    expect(await weekRowProblems(page), name).toEqual([]);
  }
  await expect(next).toBeDisabled();

  await page.getByRole('link', { name: 'I miei impegni' }).click();
  await page.getByRole('button', { name: 'Una settimana precisa' }).click();
  expect(await weekRowProblems(page), 'settimana precisa').toEqual([]);
  await page.getByRole('button', { name: 'Settimana successiva' }).click();
  await expect(page.getByRole('button', { name: 'Torna all\'orario tipo' })).toBeVisible();
  expect(await weekRowProblems(page), 'settimana precisa con un orario diverso').toEqual([]);
});

test('disponibilità: dettaglio di un\'ora, ultima settimana e settimana precisa restano dentro lo schermo', async ({ page }) => {
  const errors = await open(page, '#/squadra/disponibilita');
  const next = page.getByRole('button', { name: 'Settimana successiva' });
  await next.click();
  await page.locator('.av-team .av-cell[data-day="3"][data-hour="12"]').click();
  await expect(page.locator('.av-detail')).toContainText('Liberi: Anna e Bruno');
  await expect(page.locator('.av-detail')).not.toContainText('già passato');
  const clipped = await page.locator('.av-team .av-cell').evaluateAll((cells) => cells.filter((cell) => cell.scrollWidth > cell.clientWidth + 1).length);
  expect(clipped, 'numeri tagliati nelle celle').toBe(0);
  expect(await overflowOf(page), 'il dettaglio scorre in orizzontale').toBeLessThanOrEqual(1);

  for (let i = 1; i < 11; i += 1) await next.click();
  await expect(next).toBeDisabled();
  await expect(page.locator('.av-week-title strong')).toHaveText('Tra 11 settimane');
  expect(await overflowOf(page), 'l\'ultima settimana scorre in orizzontale').toBeLessThanOrEqual(1);

  await page.getByRole('link', { name: 'I miei impegni' }).click();
  await page.getByRole('button', { name: 'Una settimana precisa' }).click();
  await page.getByRole('button', { name: 'Settimana successiva' }).click();
  await expect(page.getByRole('button', { name: 'Torna all\'orario tipo' })).toBeVisible();
  expect(await overflowOf(page), 'la settimana precisa scorre in orizzontale').toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

// Ore lavorate: l'anteprima conta le settimane da thisMonday(), come qui.
const MONDAY = thisMonday();
const LAST_WEEK = addDays(MONDAY, -7);
// Anna non ha ore tre settimane fa: lì le righe nuove partono vuote.
const EMPTY_WEEK = addDays(MONDAY, -21);
const MINE = '#/squadra/ore?vista=mie';
const MINE_LAST_WEEK = `${MINE}&settimana=${LAST_WEEK}`;
const MINE_EMPTY_WEEK = `${MINE}&settimana=${EMPTY_WEEK}`;
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const saveStatus = (page) => page.locator('.save-bar').getByRole('status');
const problemAlert = (page) => page.locator('.save-bar').getByRole('alert');
const dayOf = (page, name) => page.getByRole('region', { name: new RegExp(`^${name} `) });
const rowOf = (page, day, n) => page.getByRole('group', { name: `${day}, riga ${n}`, exact: true });
const field = (row, label) => row.getByLabel(label, { exact: true });
const addButton = (page, day) => page.getByRole('button', { name: `Aggiungi ore a ${day}`, exact: true });
const pledgeField = (page) => page.getByLabel('Ore a settimana che puoi dare', { exact: true });
const weekTitle = (page) => page.locator('.av-week-title strong');
const hashOf = (page) => page.evaluate(() => location.hash);

// Le ore di ogni settimana dalla più vecchia, come le sente chi usa un lettore di schermo.
const chartLabel = (name, weeks, last = MONDAY) =>
  `${name}, dalla settimana più vecchia: ${weeks.map((text, i) => `${shortDate(addDays(last, (i - weeks.length + 1) * 7))} ${text}`).join(', ')}`;
const ANNA_WEEKS = ['0 h', '6 h 30 su 10 h', '0 h su 10 h', '0 h su 10 h', '5 h su 10 h', '0 h su 10 h', '0 h su 10 h', '5 h 30 su 8 h', '0 h su 8 h', '5 h su 8 h', '13 h 30 su 8 h', '2 h su 8 h'];
const BRUNO_WEEKS = ['0 h', '0 h', '0 h', '0 h', '0 h', '3 h su 6 h', '0 h su 6 h', '0 h su 6 h', '3 h su 6 h', '0 h', '7 h 15 su 6 h', '2 h 45 su 6 h'];

// Fuori dallo schermo può andare solo ciò che sta dentro un riquadro che scorre di lato: la tabella o la fila delle schede.
function outsideScreen(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('#content *')].flatMap((el) => {
      const box = el.getBoundingClientRect();
      if (!box.width || (box.left >= -1 && box.right <= window.innerWidth + 1)) return [];
      if (el.parentElement.closest('.av-scroll, .tabs')) return [];
      return [`${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')} da ${Math.round(box.left)} a ${Math.round(box.right)}`];
    }),
  );
}

// La colonna dei nomi deve restare nel riquadro, sopra le altre celle e con uno sfondo che le copre.
function namesHidden(scroller) {
  return scroller.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return [...el.querySelectorAll('thead th:first-child, tbody th[scope="row"]')].flatMap((cell) => {
      const b = cell.getBoundingClientRect();
      const name = cell.textContent.trim();
      if (b.left < box.left - 1 || b.right > box.right + 1) return [`${name}: fuori dal riquadro`];
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      if (!cell.contains(hit)) return [`${name}: coperta da ${hit?.tagName.toLowerCase()}`];
      if (getComputedStyle(cell).backgroundColor === 'rgba(0, 0, 0, 0)') return [`${name}: senza sfondo, sotto si vedono le altre celle`];
      return [];
    });
  });
}

test.describe(() => {
  // Campi orario a 24 ore come per chi usa il sito.
  test.use({ locale: 'it-IT' });

  for (const [hash, view] of [['#/squadra/ore', 'Squadra'], [MINE_LAST_WEEK, 'Le mie ore, settimana scorsa']]) {
    test(`ore lavorate: niente esce dallo schermo, la tabella scorre nel suo riquadro (${view})`, async ({ page, isMobile }) => {
      const errors = await open(page, hash);
      // Sul telefono la pagina più larga dello schermo allarga anche innerWidth: si confronta con lo schermo vero.
      const wider = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, window.innerWidth) - window.visualViewport.width);
      expect(wider, 'la pagina è più larga dello schermo').toBeLessThanOrEqual(1);
      for (const summary of await page.locator('.ts-detail summary').all()) await summary.click();
      expect(await outsideScreen(page), 'pezzi fuori dallo schermo').toEqual([]);
      expect(await overflowOf(page), 'la pagina scorre in orizzontale').toBeLessThanOrEqual(1);
      if (view === 'Squadra') {
        const scroller = page.locator('.av-scroll').filter({ has: page.locator('.ts-table') });
        await expect(scroller).toHaveCount(1);
        const scrolls = await scroller.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
        expect(scrolls, 'la tabella scorre solo sul telefono').toBe(isMobile);
        await scroller.evaluate((el) => {
          el.scrollLeft = el.scrollWidth;
        });
        const totalSeen = await scroller.evaluate((el) => {
          const box = el.getBoundingClientRect();
          const total = el.querySelector('thead th:last-child').getBoundingClientRect();
          return total.left >= box.left - 1 && total.right <= box.right + 1;
        });
        expect(totalSeen, 'la colonna Totale si raggiunge scorrendo').toBe(true);
      }
      expect(errors).toEqual([]);
    });
  }

  test('ore lavorate: scorrendo la tabella della squadra i nomi restano in vista, anche quando la pagina si ridisegna', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'la tabella scorre solo sul telefono');
    const errors = await open(page, '#/squadra/ore');
    const scroller = page.getByRole('region', { name: `Ore della squadra ${weekLabel(MONDAY)}`, exact: true });
    await expect(scroller).toHaveAttribute('tabindex', '0');
    const annaDetail = page.locator('.ts-detail').filter({ has: page.locator('summary', { hasText: /^Anna,/ }) });
    await annaDetail.locator('summary').click();
    await expect(annaDetail).toHaveJSProperty('open', true);

    await scroller.scrollIntoViewIfNeeded();
    // Si aspetta un fotogramma: l'evento di scorrimento arriva lì.
    const left = await scroller.evaluate(async (el) => {
      el.scrollLeft = el.scrollWidth;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return el.scrollLeft;
    });
    expect(left, 'la tabella non scorre').toBeGreaterThan(0);
    expect(await namesHidden(scroller), 'nomi nascosti scorrendo').toEqual([]);

    // Bruno salva un'ora in più: la pagina si ridisegna e la tabella resta dov'era.
    await page.evaluate(async (week) => {
      const store = await import('/assets/js/store.js');
      const sheet = [...store.state.items.values()].find((i) => i.kind === 'timesheet' && i.created_by !== store.state.user.id && i.data.week === week);
      const entries = [...sheet.data.entries, { id: 'b9', day: 'lun', start: 17 * 60, end: 18 * 60, area: 'altro' }];
      store.applyItem({ ...sheet, data: { ...sheet.data, entries }, version: sheet.version + 1 });
    }, MONDAY);
    await expect(page.locator('.ts-table tbody tr').nth(1).locator('.ts-sum')).toHaveText('3 h 45 su 6 h');
    expect(await scroller.evaluate((el) => el.scrollLeft), 'la tabella è tornata all\'inizio').toBe(left);
    await scroller.scrollIntoViewIfNeeded();
    expect(await namesHidden(scroller), 'nomi nascosti dopo il ridisegno').toEqual([]);
    await expect(annaDetail).toHaveJSProperty('open', true);
    expect(errors).toEqual([]);
  });

  test('ore lavorate: una riga ha orari, area, nota e pulsante in fila e sul telefono area e nota vanno sotto', async ({ page }) => {
    await open(page, MINE_LAST_WEEK);
    await expect(page.locator('.ts-row')).toHaveCount(5);
    const problems = await page.locator('.ts-row').evaluateAll((rows) =>
      rows.flatMap((row, i) => {
        const [start, end] = [...row.querySelectorAll('.ts-time')].map((el) => el.getBoundingClientRect());
        const [area, note, remove] = ['.ts-area', '.ts-note', '.ts-remove'].map((sel) => row.querySelector(sel).getBoundingClientRect());
        const box = row.getBoundingClientRect();
        const middle = (b) => b.top + b.height / 2;
        const inLine = (line) => line.every((b) => Math.abs(middle(b) - middle(line[0])) <= 4) && line.every((b, j) => !j || line[j - 1].right <= b.left + 1);
        const name = `riga ${i + 1}`;
        const found = [];
        if ([start, end, area, note, remove].some((b) => b.left < box.left - 1 || b.right > box.right + 1 || b.right > window.innerWidth)) found.push(`${name}: esce dalla riga`);
        if (window.innerWidth <= 640) {
          if (!inLine([start, end, remove])) found.push(`${name}: orari e pulsante non sono in fila`);
          if (!inLine([area, note])) found.push(`${name}: area e nota non sono in fila`);
          if (area.top < Math.max(start.bottom, end.bottom, remove.bottom) - 1) found.push(`${name}: area e nota non vanno sotto gli orari`);
          if (Math.abs(area.left - start.left) > 1 || Math.abs(note.right - remove.right) > 1) found.push(`${name}: area e nota non sono larghe quanto la riga`);
          if (remove.width < 36 || remove.height < 36) found.push(`${name}: pulsante per togliere troppo piccolo per il dito`);
        } else {
          if (!inLine([start, end, area, note, remove])) found.push(`${name}: orari, area, nota e pulsante non sono in fila`);
          if (remove.width < 24 || remove.height < 24) found.push(`${name}: pulsante per togliere troppo piccolo`);
        }
        return found;
      }),
    );
    expect(problems).toEqual([]);
  });

  test('ore lavorate: sul telefono orari e area delle righe si leggono per intero', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'solo sul telefono');
    await open(page, MINE_LAST_WEEK);
    expect(await page.evaluate(() => CSS.supports('field-sizing', 'content'))).toBe(true);
    // Un doppione che si allarga quanto il testo dice quanto spazio serve; per l'area si provano tutte le scelte.
    // Il doppione tiene anche un pixel per il cursore, da qui la tolleranza di 2 px.
    const cut = await page.locator('.ts-row').evaluateAll((rows) =>
      rows.flatMap((row) =>
        [...row.querySelectorAll('.ts-time, .ts-area')].flatMap((el) => {
          const values = el.tagName === 'SELECT' ? [...el.options].map((option) => option.value) : [el.value];
          const has = el.getBoundingClientRect().width;
          return values.flatMap((value) => {
            const probe = el.cloneNode(true);
            // Fisso sullo schermo, così la larghezza non la limita la casella della griglia.
            probe.style.cssText = 'field-sizing: content; width: auto; min-width: 0; max-width: none; position: fixed; left: 0; top: 0; grid-area: auto; visibility: hidden';
            el.parentElement.append(probe);
            probe.value = value;
            const need = probe.getBoundingClientRect().width;
            const text = probe.tagName === 'SELECT' ? probe.selectedOptions[0].textContent : probe.value;
            probe.remove();
            return need > has + 2 ? [`${text}: ${Math.round(has)} px su ${Math.round(need)}`] : [];
          });
        }),
      ),
    );
    expect(cut, 'testo tagliato').toEqual([]);
  });

  test('ore lavorate: sul telefono i campi hanno il testo ad almeno 16 px, così la pagina non si ingrandisce a ogni tocco', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'solo sul telefono');
    await open(page, MINE_LAST_WEEK);
    await addButton(page, 'mercoledì').click();
    const fields = page.locator('.ts-pledge-input, .ts-days input, .ts-days select');
    expect(await fields.count()).toBeGreaterThan(20);
    const small = await fields.evaluateAll((list) =>
      list.flatMap((el) => {
        const size = parseFloat(getComputedStyle(el).fontSize);
        return size < 16 ? [`${el.getAttribute('aria-label') || el.dataset.focus}: ${size} px`] : [];
      }),
    );
    expect(small, 'campi col testo piccolo').toEqual([]);
  });

  test('ore lavorate: con la tastiera le frecce cambiano gli orari a quarti d\'ora e i totali si aggiornano', async ({ page }) => {
    const errors = await open(page, MINE_EMPTY_WEEK);
    const total = page.locator('.ts-total strong');
    const week = capital(weekLabel(EMPTY_WEEK));
    await expect(total).toHaveText(`${week}: 0 h su 8 h dichiarate`);
    // Prima riga della settimana: orari vuoti e l'area di partenza.
    await addButton(page, 'mercoledì').focus();
    await page.keyboard.press('Enter');
    const wednesday = rowOf(page, 'Mercoledì', 1);
    const start = field(wednesday, 'Inizio');
    const end = field(wednesday, 'Fine');
    await expect(start).toBeFocused();
    await expect(start).toHaveValue('');
    await expect(end).toHaveValue('');
    await expect(field(wednesday, 'Area')).toHaveValue('prodotto');
    await page.keyboard.type('09');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(start).toHaveValue('09:15');
    await expect(start).toBeFocused();
    await end.focus();
    await page.keyboard.type('11');
    for (const key of ['ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowDown']) await page.keyboard.press(key);
    await expect(end).toHaveValue('11:15');
    await expect(end).toBeFocused();
    await expect(dayOf(page, 'Mercoledì').locator('[data-day-total]')).toHaveText('2 h');
    await expect(total).toHaveText(`${week}: 2 h su 8 h dichiarate`);
    await expect(saveStatus(page)).toHaveText('Modifiche non salvate');

    // La fine alle 00:00 vale mezzanotte.
    await addButton(page, 'lunedì').focus();
    await page.keyboard.press('Enter');
    const monday = rowOf(page, 'Lunedì', 1);
    await expect(field(monday, 'Inizio')).toBeFocused();
    await page.keyboard.type('22');
    await page.keyboard.press('ArrowUp');
    await field(monday, 'Fine').focus();
    await page.keyboard.type('00');
    await page.keyboard.press('ArrowUp');
    await expect(field(monday, 'Fine')).toHaveValue('00:00');
    await expect(dayOf(page, 'Lunedì').locator('[data-day-total]')).toHaveText('2 h');
    await expect(total).toHaveText(`${week}: 4 h su 8 h dichiarate`);
    await field(monday, 'Fine').blur();
    await expect(field(monday, 'Fine')).toHaveValue('00:00');
    expect(errors).toEqual([]);
  });

  test('ore lavorate: scrivendo un orario con la tastiera restano i minuti scritti', async ({ page }) => {
    const errors = await open(page, MINE_LAST_WEEK);
    // Il primo orario del venerdì riprende quello del giovedì.
    await addButton(page, 'venerdì').click();
    const row = rowOf(page, 'Venerdì', 1);
    const start = field(row, 'Inizio');
    const end = field(row, 'Fine');
    await expect(start).toBeFocused();
    await expect(start).toHaveValue('09:00');
    await expect(end).toHaveValue('13:00');
    await expect(field(row, 'Area')).toHaveValue('numeri');
    await page.keyboard.type('1430');
    await expect(start).toHaveValue('14:30');
    await end.focus();
    await page.keyboard.type('1645');
    await expect(end).toHaveValue('16:45');
    await expect(start).toHaveValue('14:30');
    const total = dayOf(page, 'Venerdì').locator('[data-day-total]');
    await expect(total).toHaveText('2 h 15');

    // Mentre si scrive restano i minuti scritti, uscendo dal campo l'orario va al quarto d'ora.
    await start.focus();
    await page.keyboard.type('1007');
    await expect(start).toHaveValue('10:07');
    await expect(total).toHaveText('6 h 45');
    await start.blur();
    await expect(start).toHaveValue('10:00');
    expect(errors).toEqual([]);
  });

  test('ore lavorate: aggiungendo e togliendo una riga il fuoco resta al suo posto', async ({ page }) => {
    const errors = await open(page, MINE_LAST_WEEK);
    const monday = dayOf(page, 'Lunedì');
    const add = addButton(page, 'lunedì');
    await expect(add).toHaveText('Aggiungi ore');
    await expect(monday.locator('.ts-row')).toHaveCount(2);
    await add.focus();
    await page.keyboard.press('Enter');
    await expect(monday.locator('.ts-row')).toHaveCount(3);
    // La riga nuova parte dalla fine di quella prima, con la sua area.
    const added = rowOf(page, 'Lunedì', 3);
    await expect(field(added, 'Inizio')).toBeFocused();
    await expect(field(added, 'Inizio')).toHaveValue('12:00');
    await expect(field(added, 'Fine')).toHaveValue('13:00');
    await expect(field(added, 'Area')).toHaveValue('prodotto');
    await expect(monday.locator('[data-day-total]')).toHaveText('4 h');
    await expect(saveStatus(page)).toHaveText('Modifiche non salvate');

    const note = field(added, 'Nota');
    await note.focus();
    await page.keyboard.type('Bozza');
    await expect(note).toBeFocused();
    await expect(note).toHaveValue('Bozza');

    await page.getByRole('button', { name: 'Togli la riga 3 di lunedì', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(monday.locator('.ts-row')).toHaveCount(2);
    await expect(add).toBeFocused();
    await expect(monday.locator('[data-day-total]')).toHaveText('3 h');
    await expect(saveStatus(page)).not.toHaveText('Modifiche non salvate');

    // Dopo una riga che finisce a mezzanotte la nuova parte vuota, con l'area di quella prima.
    const sunday = dayOf(page, 'Domenica');
    await addButton(page, 'domenica').focus();
    await page.keyboard.press('Enter');
    const empty = rowOf(page, 'Domenica', 2);
    await expect(field(empty, 'Inizio')).toBeFocused();
    await expect(field(empty, 'Inizio')).toHaveValue('');
    await expect(field(empty, 'Area')).toHaveValue('altro');
    await expect(field(rowOf(page, 'Domenica', 1), 'Inizio')).toHaveValue('22:00');
    await page.getByRole('button', { name: 'Togli la riga 1 di domenica', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(addButton(page, 'domenica')).toBeFocused();
    await expect(sunday.locator('.ts-row')).toHaveCount(1);
    await expect(field(rowOf(page, 'Domenica', 1), 'Inizio')).toHaveValue('');
    await expect(sunday.locator('[data-day-total]')).toHaveText('0 h');
    expect(errors).toEqual([]);
  });

  test('ore lavorate: i problemi si vedono prima di salvare e spariscono quando li sistemi', async ({ page }) => {
    const errors = await open(page, MINE_LAST_WEEK);
    const save = page.getByRole('button', { name: 'Salva le mie ore' });
    const alert = problemAlert(page);
    await addButton(page, 'mercoledì').click();
    const first = rowOf(page, 'Mercoledì', 1);
    // Il mercoledì vuoto riprende il primo orario del martedì.
    await expect(field(first, 'Inizio')).toHaveValue('14:15');
    await expect(field(first, 'Fine')).toHaveValue('18:45');
    await expect(field(first, 'Area')).toHaveValue('ricerca');
    await field(first, 'Inizio').fill('');
    await save.click();
    await expect(alert).toHaveText('Mercoledì: in una riga manca l\'ora di inizio o di fine.');
    await expect(field(first, 'Inizio')).toBeFocused();
    await expect(field(first, 'Inizio')).toHaveAttribute('aria-invalid', 'true');

    // Il problema mostrato si aggiorna mentre si scrive, finché non è sistemato.
    await field(first, 'Fine').fill('09:00');
    await expect(alert).toHaveText('Mercoledì: in una riga manca l\'ora di inizio o di fine.');
    await field(first, 'Inizio').fill('10:00');
    await expect(alert).toHaveText('Mercoledì: una riga finisce prima di cominciare. Se passi la mezzanotte, dividila in due righe.');
    await expect(field(first, 'Fine')).toHaveAttribute('aria-invalid', 'true');
    await expect(field(first, 'Inizio')).not.toHaveAttribute('aria-invalid');
    await field(first, 'Fine').fill('12:00');
    await expect(alert).toHaveCount(0);
    await expect(page.locator('[aria-invalid]')).toHaveCount(0);

    await addButton(page, 'mercoledì').click();
    const second = rowOf(page, 'Mercoledì', 2);
    await expect(field(second, 'Inizio')).toBeFocused();
    await expect(field(second, 'Inizio')).toHaveValue('12:00');
    await expect(field(second, 'Fine')).toHaveValue('13:00');
    await field(second, 'Inizio').fill('11:00');
    await save.click();
    await expect(alert).toHaveText('Mercoledì due righe si accavallano: 10:00-12:00 e 11:00-13:00.');
    await expect(field(second, 'Inizio')).toBeFocused();
    await expect(field(second, 'Inizio')).toHaveAttribute('aria-invalid', 'true');
    await expect(saveStatus(page)).toHaveText('Modifiche non salvate');
    await field(second, 'Inizio').fill('12:00');
    await expect(alert).toHaveCount(0);

    // Dopo il salvataggio il pulsante si spegne e il fuoco passa alle ore dichiarate.
    await save.click();
    await expect(page.locator('.toast').filter({ hasText: /^Ore salvate\.$/ })).toBeVisible();
    await expect(saveStatus(page)).not.toHaveText('Modifiche non salvate');
    await expect(save).toBeDisabled();
    await expect(pledgeField(page)).toBeFocused();
    await expect(dayOf(page, 'Mercoledì').locator('[data-day-total]')).toHaveText('3 h');
    expect(errors).toEqual([]);
  });

  test('ore lavorate: il problema da sistemare si vede anche se si salva dal primo giorno', async ({ page }) => {
    const errors = await open(page, MINE_LAST_WEEK);
    await addButton(page, 'lunedì').click();
    const row = rowOf(page, 'Lunedì', 3);
    await field(row, 'Fine').fill('11:00');
    await page.getByRole('button', { name: 'Salva le mie ore' }).click();
    const alert = problemAlert(page);
    await expect(alert).toHaveText('Lunedì: una riga finisce prima di cominciare. Se passi la mezzanotte, dividila in due righe.');
    await expect(alert).toBeInViewport({ ratio: 1 });
    await expect(field(row, 'Fine')).toBeFocused();
    await expect(field(row, 'Fine')).toBeInViewport();
    expect(errors).toEqual([]);
  });

  test('ore lavorate: l\'ultimo giorno non resta sotto la barra di salvataggio', async ({ page }) => {
    await open(page, MINE_LAST_WEEK);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const covered = await page.locator('.ts-day').last().locator('input, select, button').evaluateAll((controls) =>
      controls.filter((el) => {
        const box = el.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return !el.contains(hit);
      }).length,
    );
    expect(covered, 'campi della domenica coperti').toBe(0);
  });

  test('ore lavorate: le ore dichiarate ereditate si vedono nel campo e si scrivono con la virgola', async ({ page }) => {
    const errors = await open(page, '#/squadra/ore');
    await expect(page.locator('.ts-table tbody tr').first().locator('.ts-sum')).toHaveText('2 h su 8 h');
    await page.locator('nav.subtabs').getByRole('link', { name: 'Le mie ore' }).click();
    await expect(weekTitle(page)).toHaveText('Questa settimana');
    const pledge = pledgeField(page);
    const total = page.locator('.ts-total strong');
    await expect(pledge).toHaveValue('8');
    await expect(pledge).toHaveAttribute('inputmode', 'decimal');
    await expect(page.getByText('Valgono da questa settimana in poi, finché non le cambi.')).toBeVisible();
    await expect(total).toHaveText('Questa settimana: 2 h su 8 h dichiarate');

    // Il valore si arrotonda al quarto d'ora e si riscrive con la virgola.
    await pledge.fill('7.3');
    await pledge.press('Tab');
    await expect(pledge).toHaveValue('7,25');
    await expect(total).toHaveText('Questa settimana: 2 h su 7 h 15 dichiarate');
    await expect(saveStatus(page)).toHaveText('Modifiche non salvate');
    await pledge.fill('200');
    await pledge.press('Tab');
    await expect(pledge).toHaveValue('80');
    // Uguali a quelle ereditate, o col campo vuoto, si torna a ereditarle e non c'è niente da salvare.
    await pledge.fill('8');
    await pledge.press('Tab');
    await expect(pledge).toHaveValue('8');
    await expect(saveStatus(page)).not.toHaveText('Modifiche non salvate');
    await pledge.fill('6,5');
    await pledge.press('Tab');
    await expect(pledge).toHaveValue('6,5');
    await pledge.fill('');
    await pledge.press('Tab');
    await expect(pledge).toHaveValue('8');
    await expect(total).toHaveText('Questa settimana: 2 h su 8 h dichiarate');
    await expect(saveStatus(page)).not.toHaveText('Modifiche non salvate');
    expect(errors).toEqual([]);
  });

  test('ore lavorate: cambiando settimana o pagina con ore non salvate chiede conferma', async ({ page }) => {
    const errors = await open(page, MINE_LAST_WEEK);
    const pledge = pledgeField(page);
    const dialog = page.locator('dialog[open]');
    await expect(pledge).toHaveValue('8');
    await pledge.fill('6');
    await pledge.press('Tab');
    await expect(saveStatus(page)).toHaveText('Modifiche non salvate');

    const prev = page.getByRole('button', { name: 'Settimana precedente' });
    await prev.click();
    await expect(dialog).toContainText('Hai ore non salvate in questa settimana. Cambiare settimana comunque?');
    await dialog.getByRole('button', { name: 'Annulla' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(weekTitle(page)).toHaveText('La settimana scorsa');
    await expect(pledge).toHaveValue('6');
    expect(await hashOf(page)).toBe(MINE_LAST_WEEK);

    await page.locator('nav.tabs').first().getByRole('link', { name: 'Disponibilità' }).click();
    await expect(dialog).toContainText('Hai ore non salvate. Uscire comunque?');
    await dialog.getByRole('button', { name: 'Annulla' }).click();
    await expect(weekTitle(page)).toHaveText('La settimana scorsa');
    await expect(pledge).toHaveValue('6');

    await prev.click();
    await dialog.getByRole('button', { name: 'Cambia' }).click();
    await expect(weekTitle(page)).toHaveText('2 settimane fa');
    await expect(pledge).toHaveValue('8');
    await expect(saveStatus(page)).not.toHaveText('Modifiche non salvate');
    expect(await hashOf(page)).toBe(`${MINE}&settimana=${addDays(MONDAY, -14)}`);
    expect(errors).toEqual([]);
  });

  test('ore lavorate: toccando la vista già aperta le ore non salvate restano', async ({ page }) => {
    const errors = await open(page, MINE_LAST_WEEK);
    await page.getByRole('button', { name: 'Settimana precedente' }).click();
    await expect(weekTitle(page)).toHaveText('2 settimane fa');
    // L'indirizzo segue la settimana senza aggiungere passi alla cronologia.
    expect(await hashOf(page)).toBe(`${MINE}&settimana=${addDays(MONDAY, -14)}`);
    const pledge = pledgeField(page);
    await pledge.fill('6');
    await pledge.press('Tab');
    await expect(saveStatus(page)).toHaveText('Modifiche non salvate');
    await page.locator('nav.subtabs a.is-active').click();
    await page.waitForTimeout(150);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(weekTitle(page)).toHaveText('2 settimane fa');
    await expect(pledge).toHaveValue('6');
    await expect(saveStatus(page)).toHaveText('Modifiche non salvate');
    expect(errors).toEqual([]);
  });

  test('ore lavorate: titolo della settimana e frecce restano su una riga, da questa settimana a 51 settimane fa', async ({ page }) => {
    const errors = await open(page, '#/squadra/ore');
    const title = page.locator('.av-week-title');
    await expect(title).toHaveAttribute('aria-live', 'polite');
    const prev = page.getByRole('button', { name: 'Settimana precedente' });
    const next = page.getByRole('button', { name: 'Settimana successiva' });
    await expect(next).toBeDisabled();
    const names = ['Questa settimana', 'La settimana scorsa', ...Array.from({ length: 4 }, (_, i) => `${i + 2} settimane fa`)];
    for (const [i, name] of names.entries()) {
      if (i) await prev.click();
      await expect(title.locator('strong')).toHaveText(name);
      await expect(title.locator('span.muted')).toHaveText(weekLabel(addDays(MONDAY, -i * 7)));
      if (i) expect(await hashOf(page), name).toBe(`#/squadra/ore?settimana=${addDays(MONDAY, -i * 7)}`);
      expect(await weekRowProblems(page), name).toEqual([]);
    }

    const visit = async (week, name) => {
      await page.goto(`/tests/e2e/preview.html#/squadra/ore?settimana=${week}`);
      await expect(title.locator('strong')).toHaveText(name);
    };
    await visit(addDays(MONDAY, -51 * 7), '51 settimane fa');
    await expect(prev).toBeDisabled();
    await expect(next).toBeEnabled();
    expect(await weekRowProblems(page), 'la settimana più vecchia').toEqual([]);
    // Fuori dai limiti o con una data sbagliata si torna a questa settimana.
    for (const wrong of [addDays(MONDAY, -52 * 7), addDays(MONDAY, 7), addDays(MONDAY, -5), `${LAST_WEEK}x`, '2026-02-30']) {
      await visit(addDays(MONDAY, -21), '3 settimane fa');
      await visit(wrong, 'Questa settimana');
    }
    expect(errors).toEqual([]);
  });

  test('ore lavorate: con la tastiera il fuoco resta sulla freccia premuta anche dopo il ridisegno', async ({ page }) => {
    await open(page, MINE);
    const prev = page.getByRole('button', { name: 'Settimana precedente' });
    const next = page.getByRole('button', { name: 'Settimana successiva' });
    await prev.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(weekTitle(page)).toHaveText('2 settimane fa');
    await expect(prev).toBeFocused();
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(weekTitle(page)).toHaveText('La settimana scorsa');
    await expect(next).toBeFocused();
    // Arrivati a questa settimana la freccia avanti si spegne e il fuoco passa all'altra.
    await page.keyboard.press('Enter');
    await expect(weekTitle(page)).toHaveText('Questa settimana');
    await expect(next).toBeDisabled();
    await expect(prev).toBeFocused();
    // Le schede tengono la settimana scelta.
    await page.keyboard.press('Enter');
    await page.locator('nav.subtabs').getByRole('link', { name: 'Ore della squadra' }).click();
    await expect(page.locator('nav.subtabs a.is-active')).toHaveText('Ore della squadra');
    await expect(weekTitle(page)).toHaveText('La settimana scorsa');
  });

  test('ore lavorate: il grafico delle 12 settimane si vede e dice le ore a chi non lo vede', async ({ page }) => {
    const errors = await open(page, '#/squadra/ore');
    await expect(page.locator('svg.ts-history')).toHaveCount(2);
    await expect(page.getByText('Le colonne sono le ore segnate, il segno orizzontale le ore dichiarate.')).toBeVisible();
    const anna = page.getByRole('img', { name: /^Anna, dalla settimana più vecchia: / });
    const bruno = page.getByRole('img', { name: /^Bruno, dalla settimana più vecchia: / });
    await expect(anna).toHaveAttribute('aria-label', chartLabel('Anna', ANNA_WEEKS));
    await expect(bruno).toHaveAttribute('aria-label', chartLabel('Bruno', BRUNO_WEEKS));
    await expect(page.getByRole('img', { name: /^Chiara/ })).toHaveCount(0);
    for (const [chart, columns, marks] of [[anna, 6, 11], [bruno, 4, 6]]) {
      await chart.scrollIntoViewIfNeeded();
      await expect(chart).toBeVisible();
      await expect(chart.locator('rect.ts-col')).toHaveCount(columns);
      await expect(chart.locator('rect.ts-col-now')).toHaveCount(1);
      await expect(chart.locator('line.ts-pledge-mark')).toHaveCount(marks);
      const box = await chart.boundingBox();
      expect(box.width, 'grafico troppo stretto').toBeGreaterThan(200);
      expect(box.height, 'grafico troppo basso').toBeGreaterThan(40);
      expect(box.x + box.width, 'grafico fuori dallo schermo').toBeLessThanOrEqual(page.viewportSize().width);
    }
    // Sotto ogni grafico la prima e l'ultima settimana, nascoste ai lettori di schermo che le hanno già nell'etichetta.
    const axes = page.locator('.ts-history-axis');
    await expect(axes).toHaveCount(2);
    await expect(axes.first()).toHaveAttribute('aria-hidden', 'true');
    await expect(axes.first().locator('span')).toHaveText([shortDate(addDays(MONDAY, -77)), shortDate(MONDAY)]);
    await expect(page.getByText('in media 6 h 15 nelle settimane segnate')).toBeVisible();
    await expect(page.getByText('in media 4 h nelle settimane segnate')).toBeVisible();

    await page.getByRole('button', { name: 'Settimana precedente' }).click();
    await expect(anna).toHaveAttribute('aria-label', chartLabel('Anna', ['0 h', ...ANNA_WEEKS.slice(0, 11)], LAST_WEEK));
    await expect(anna.locator('rect.ts-col-now')).toHaveCount(1);
    await expect(axes.first().locator('span')).toHaveText([shortDate(addDays(LAST_WEEK, -77)), shortDate(LAST_WEEK)]);
    expect(errors).toEqual([]);
  });

  test('ore lavorate: il lunedì la campanella ricorda le ore della settimana scorsa finché non le segni', async ({ page }) => {
    await page.clock.setFixedTime(new Date(`${MONDAY}T09:00:00`));
    const errors = await open(page, '#/squadra/ore');
    const bell = page.getByRole('button', { name: /^Notifiche/ });
    const reminder = page.getByRole('link', { name: /^Non hai ancora segnato le ore/ });
    await bell.click();
    await expect(page.getByRole('dialog', { name: 'Notifiche' })).toBeVisible();
    await expect(reminder).toHaveCount(0);
    await bell.click();

    // Anna svuota la settimana scorsa: il promemoria compare.
    await page.evaluate(async (week) => {
      const store = await import('/assets/js/store.js');
      const sheet = [...store.state.items.values()].find((i) => i.kind === 'timesheet' && i.created_by === store.state.user.id && i.data.week === week);
      store.applyItem({ ...sheet, data: { week, entries: [] }, version: sheet.version + 1 });
    }, LAST_WEEK);
    await bell.click();
    await expect(reminder).toBeVisible();
    await expect(reminder).toContainText(`Non hai ancora segnato le ore della settimana ${weekLabel(LAST_WEEK)}`);
    await expect(reminder).toHaveAttribute('href', `#/squadra/ore?vista=mie&settimana=${LAST_WEEK}`);
    await expect(reminder.locator('.bell-reminder')).toBeVisible();
    const panel = await page.getByRole('dialog', { name: 'Notifiche' }).boundingBox();
    expect(panel.x, 'pannello fuori a sinistra').toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width, 'pannello fuori a destra').toBeLessThanOrEqual(page.viewportSize().width);

    await reminder.click();
    await expect(page.locator('nav.subtabs a.is-active')).toHaveText('Le mie ore');
    await expect(weekTitle(page)).toHaveText('La settimana scorsa');
    await addButton(page, 'lunedì').click();
    const row = rowOf(page, 'Lunedì', 1);
    await field(row, 'Inizio').fill('09:00');
    await field(row, 'Fine').fill('10:00');
    await page.getByRole('button', { name: 'Salva le mie ore' }).click();
    await expect(page.locator('.toast').filter({ hasText: /^Ore salvate\.$/ })).toBeVisible();
    await bell.click();
    await expect(page.getByRole('dialog', { name: 'Notifiche' })).toBeVisible();
    await expect(reminder).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
