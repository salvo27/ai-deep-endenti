import { test, expect } from '@playwright/test';

const IDEA = '11111111-1111-4111-8111-111111111111';

async function open(page, hash) {
  await page.goto(`/tests/e2e/preview.html${hash}`);
  await expect(page.locator('#content > *').first()).toBeVisible();
}

test('menzioni, notifiche e menu non restano mai aperti insieme', async ({ page }) => {
  await open(page, '#/');
  const at = page.getByRole('button', { name: 'Menzioni' });
  const bell = page.getByRole('button', { name: /^Notifiche/ });
  const atPanel = page.getByRole('dialog', { name: 'Menzioni' });
  const bellPanel = page.getByRole('dialog', { name: 'Notifiche' });
  await at.click();
  await expect(atPanel).toBeVisible();
  await bell.click();
  await expect(bellPanel).toBeVisible();
  await expect(atPanel).toBeHidden();
  await at.click();
  await expect(bellPanel).toBeHidden();
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(atPanel).toBeHidden();
});

test('dal menu Profilo ed Esci si vedono senza scorrere, e l\'avatar apre il Profilo', async ({ page }) => {
  await open(page, '#/');
  await page.getByRole('button', { name: 'Menu' }).click();
  for (const name of ['Profilo', 'Esci']) {
    const box = await page.locator('.sidebar-foot').getByText(name, { exact: true }).boundingBox();
    const viewport = page.viewportSize();
    expect(box, name).not.toBeNull();
    expect(box.y + box.height, `${name} dentro lo schermo`).toBeLessThanOrEqual(viewport.height);
  }
  await page.keyboard.press('Escape');
  await page.locator('.topbar .user-box').click();
  await expect(page).toHaveURL(/#\/profilo$/);
});

test('cambiare scheda non riempie la cronologia: Indietro torna alla pagina di prima', async ({ page }) => {
  await open(page, '#/idee');
  await page.goto(`/tests/e2e/preview.html#/idea/${IDEA}`);
  await expect(page.locator('#content > *').first()).toBeVisible();
  const before = await page.evaluate(() => history.length);
  for (const name of ['Roadmap', 'Analisi', 'Validazione', 'Discussione']) {
    await page.locator('.idea-groups').getByRole('link', { name: new RegExp(`^${name}`) }).click();
  }
  await expect(page).toHaveURL(/\/discussione$|\/commenti$/);
  expect(await page.evaluate(() => history.length)).toBe(before);
  await page.goBack();
  await expect(page).toHaveURL(/#\/idee$/);
});
