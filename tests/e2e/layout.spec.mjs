import { test, expect } from '@playwright/test';

const IDEA = '11111111-1111-4111-8111-111111111111';
const SURVEY = 'eeeeeeee-0000-4000-8000-000000000001';
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
  '#/guida',
  '#/guida/concetti',
  '#/concetti',
  '#/storico',
  '#/cestino',
  '#/membri',
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

test('la barra "Salva i miei voti" resta sopra la tabella anche in fondo alla pagina', async ({ page }) => {
  await open(page, '#/valutazione?vista=miei');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const bar = page.locator('.save-bar');
  await expect(bar).toBeVisible();
  const box = await bar.boundingBox();
  const covered = await page.evaluate(({ x, y, width, height }) => {
    const points = [[x + 8, y + height / 2], [x + width / 2, y + height / 2], [x + width - 8, y + height / 2]];
    return points.filter(([px, py]) => !document.elementFromPoint(px, py)?.closest('.save-bar')).length;
  }, box);
  expect(covered, 'qualcosa copre la barra di salvataggio').toBe(0);
});

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
