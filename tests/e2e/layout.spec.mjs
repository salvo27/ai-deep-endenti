import { test, expect } from '@playwright/test';
import { addDays, thisMonday, weekLabel } from '../../assets/js/availability.js';

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
  test(`${hash}: nessun errore e niente esce dallo schermo`, async ({ page }) => {
    const errors = await open(page, hash);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'la pagina scorre in orizzontale').toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

for (const [hash, label] of [['#/valutazione?vista=miei', 'Salva i miei voti'], ['#/squadra/disponibilita?vista=miei', 'Salva i miei impegni']]) {
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

for (const [hash, view] of [['#/squadra/disponibilita', 'Orari della squadra'], ['#/squadra/disponibilita?vista=miei', 'I miei impegni']]) {
  test(`disponibilità: sul telefono la scheda attiva si legge tutta (${view})`, async ({ page }) => {
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
      .toEqual(['Sezioni Disponibilità: si legge', `Vista ${view}: si legge`]);
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
