import { test, expect } from '@playwright/test';
import { estimateMinutes } from '../../assets/js/public/survey-time.js';
import { SURVEY, TOKEN } from './q-fixture.mjs';

// Pagina pubblica dei questionari (q.html) con il client Supabase finto: tests/e2e/q-preview.html.

async function open(page, scenario = {}, hash = `#${TOKEN}`) {
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', (request) => requests.push(request.url()));
  await page.addInitScript((value) => {
    window.__surveyScenario = value;
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (event) => window.__csp.push(`${event.violatedDirective} ${event.blockedURI}`));
  }, scenario);
  await page.goto(`/tests/e2e/q-preview.html${hash}`);
  await expect(page.locator('.loading, .survey-boot')).toHaveCount(0);
  return { errors, requests };
}

async function start(page, scenario) {
  const result = await open(page, scenario);
  await page.getByRole('button', { name: 'Inizia' }).click();
  return result;
}

const next = (page) => page.getByRole('button', { name: 'Avanti' }).click();
const counter = (page) => page.locator('.progress-text');
const rpc = (page, name) => page.evaluate((n) => window.__fakeSupabase.calls.filter((c) => c[0] === 'rpc' && c[1] === n).map((c) => c[2]), name);
const withQuestions = (ids, extra = {}) => ({ ...SURVEY, ...extra, questions: SURVEY.questions.filter((q) => ids.includes(q.id)) });

test('l\'introduzione mostra durata, email facoltativa e privacy riassunta che si apre sul posto', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { level: 1, name: SURVEY.title })).toBeVisible();
  await expect(page.getByText('Non vendiamo nulla.')).toBeVisible();
  const minutes = estimateMinutes(SURVEY);
  await expect(page.locator('.facts')).toContainText(`Ci vorranno circa ${minutes} minuti.`);
  await expect(page.locator('.facts')).toContainText('Alla fine, se vuoi, potrai lasciarci la tua email.');
  const privacy = page.locator('.privacy-text');
  await expect(privacy).not.toContainText('Fine dell\'informativa.');
  const more = page.getByRole('button', { name: 'Leggi tutto' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(privacy).toContainText('Fine dell\'informativa.');
  await expect(page.getByRole('button', { name: 'Mostra meno' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  expect(await rpc(page, 'survey_event')).toEqual([{ p_token: TOKEN, p_kind: 'view' }]);
  await page.getByRole('button', { name: 'Inizia' }).click();
  expect((await rpc(page, 'survey_event')).map((e) => e.p_kind)).toEqual(['view', 'start']);
});

test('senza tempo mostrato e senza domanda email le due righe non compaiono; la mediana osservata vince sulla stima', async ({ page }) => {
  await open(page, { survey: withQuestions(['eta'], { show_time: false }) });
  await expect(page.locator('.facts')).not.toContainText('Ci vorr');
  await expect(page.locator('.facts')).not.toContainText('email');
  const other = await page.context().newPage();
  await open(other, { survey: { ...SURVEY, median_seconds: 400 } });
  await expect(other.locator('.facts')).toContainText('Ci vorranno circa 7 minuti.');
});

test('una domanda per schermata, la sezione come titoletto, il contatore e il fuoco sul titolo; nessuna voce nella cronologia', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => history.length);
  await page.getByRole('button', { name: 'Inizia' }).click();
  const title = page.getByRole('heading', { level: 1, name: 'Quanti anni hai? (obbligatoria)' });
  await expect(title).toBeFocused();
  await expect(page.locator('.section-title')).toHaveText('Su di te');
  await expect(counter(page)).toHaveText('Domanda 1 di 7');
  await expect(page.getByRole('button', { name: 'Indietro' })).toHaveCount(0);
  await page.getByLabel('Da 30 a 50').check();
  await next(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Che lavoro fai?' })).toBeFocused();
  await expect(page.locator('.section-title')).toHaveText('Su di te');
  await expect(counter(page)).toHaveText('Domanda 2 di 7');
  await expect(page.locator('.q')).toHaveCount(1);
  await next(page);
  await expect(page.locator('.section-title')).toHaveText('L\'ultima spesa');
  await expect(counter(page)).toHaveText('Domanda 3 di 7');
  await page.getByRole('button', { name: 'Indietro' }).click();
  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page.getByLabel('Da 30 a 50')).toBeChecked();
  expect(await page.evaluate(() => history.length)).toBe(before);
});

test('dopo ogni Avanti salva tutte le risposte date finora con final false', async ({ page }) => {
  await start(page);
  await page.getByLabel('Meno di 30').check();
  await next(page);
  await expect(counter(page)).toHaveText('Domanda 2 di 7');
  let saves = await rpc(page, 'submit_survey');
  expect(saves).toHaveLength(1);
  expect(saves[0].p_token).toBe(TOKEN);
  expect(saves[0].p_answers).toEqual({ eta: 'meno-30' });
  expect(saves[0].p_meta).toEqual({ session: expect.stringMatching(/^[0-9a-f-]{36}$/), final: false, website: '' });
  await page.getByLabel('Che lavoro fai?').fill('  Insegnante ');
  await next(page);
  await expect(counter(page)).toHaveText('Domanda 3 di 7');
  saves = await rpc(page, 'submit_survey');
  expect(saves).toHaveLength(2);
  expect(saves[1].p_answers).toEqual({ eta: 'meno-30', lavoro: 'Insegnante' });
  expect(saves[1].p_meta.session).toBe(saves[0].p_meta.session);
});

test('una domanda obbligatoria vuota ferma lo scorrimento con un messaggio gentile, una volta sola', async ({ page }) => {
  await start(page);
  await next(page);
  await expect(counter(page)).toHaveText('Domanda 1 di 7');
  const alert = page.locator('.alert');
  await expect(alert).toHaveAttribute('aria-live', 'polite');
  await expect(alert).toHaveText('Per continuare rispondi a questa domanda, per favore.');
  await expect(page.locator('.q-error')).toHaveText('Per continuare rispondi a questa domanda, per favore.');
  expect(await rpc(page, 'submit_survey')).toEqual([]);
  await page.getByLabel('Preferisco non rispondere').check();
  await expect(page.locator('.q-error')).toBeHidden();
  await expect(alert).toHaveText('');
  await next(page);
  await expect(counter(page)).toHaveText('Domanda 2 di 7');
  expect((await rpc(page, 'submit_survey'))[0].p_answers).toEqual({ eta: 'non-rispondo' });
});

test('limiti come nel database: numero intero nell\'intervallo ed email ben scritta', async ({ page }) => {
  await start(page, { survey: withQuestions(['volte', 'mail']) });
  const number = page.getByLabel('Quante volte hai fatto la spesa?');
  await expect(number).toHaveAttribute('inputmode', 'numeric');
  await expect(page.getByText('Un numero intero da 0 a 60.')).toBeVisible();
  await number.fill('1.000');
  await next(page);
  await expect(page.locator('.q-error')).toHaveText('Scrivi solo cifre, senza punti né virgole.');
  await expect(number).toHaveAttribute('aria-invalid', 'true');
  await number.fill('61');
  await next(page);
  await expect(page.locator('.q-error')).toHaveText('Scrivi un numero da 0 a 60.');
  await number.fill('7');
  await next(page);
  const email = page.getByLabel('La tua email');
  await expect(email).toHaveAttribute('type', 'email');
  const consent = page.getByLabel('Potete ricontattarmi per una breve chiacchierata');
  await expect(consent).not.toBeChecked();
  await consent.check();
  await page.getByRole('button', { name: 'Invia' }).click();
  await expect(page.locator('.q-error')).toHaveText('Per farti ricontattare scrivi la tua email, oppure togli la spunta.');
  await email.fill('persona@esempio');
  await page.getByRole('button', { name: 'Invia' }).click();
  await expect(page.locator('.q-error')).toHaveText('L\'indirizzo email non sembra completo: controllalo, per favore.');
  await email.fill('persona@esempio.it');
  await page.getByRole('button', { name: 'Invia' }).click();
  await expect(page.getByRole('heading', { name: 'Grazie!' })).toBeVisible();
  const final = (await rpc(page, 'submit_survey')).at(-1);
  expect(final.p_answers).toEqual({ volte: 7, mail: 'persona@esempio.it' });
  expect(final.p_meta.recontact).toBe(true);
});

test('invio finale con tutte le risposte, durata e dispositivo, poi il grazie; nessuna richiesta esce dal server locale', async ({ page, baseURL }, testInfo) => {
  const { requests, errors } = await start(page);
  await page.getByLabel('Meno di 30').check();
  await next(page);
  await page.getByLabel('Che lavoro fai?').fill('Insegnante');
  await next(page);
  const other = page.getByLabel('Altro: scrivi la tua risposta');
  await expect(other).toBeHidden();
  await page.getByLabel('Supermercato').check();
  await page.getByLabel('Altro', { exact: true }).check();
  await expect(other).toBeVisible();
  await other.fill('Negozio sotto casa');
  await page.getByLabel('Preferisco non rispondere').check();
  await expect(page.getByLabel('Supermercato')).not.toBeChecked();
  await expect(page.getByLabel('Altro', { exact: true })).not.toBeChecked();
  await expect(other).toBeHidden();
  await page.getByLabel('Mercato', { exact: true }).check();
  await expect(page.getByLabel('Preferisco non rispondere')).not.toBeChecked();
  await page.getByLabel('Altro', { exact: true }).check();
  await next(page);
  await expect(page.getByLabel('1 Nessuna')).toBeVisible();
  await expect(page.getByLabel('5 Moltissima')).toBeVisible();
  await page.getByLabel('4', { exact: true }).check();
  await next(page);
  await page.getByLabel('Quante volte hai fatto la spesa?').fill('12');
  await next(page);
  const story = page.getByLabel('Raccontaci l\'ultima volta che hai dimenticato qualcosa.');
  await expect(story).toHaveAttribute('rows', '4');
  const height = (await story.boundingBox()).height;
  await story.fill('Il latte.\nPoi il pane.\nPoi le uova.\nPoi il caffè.\nE alla fine anche lo zucchero.\nE il sale.');
  expect((await story.boundingBox()).height, 'il riquadro cresce con il testo').toBeGreaterThan(height);
  await next(page);
  await expect(counter(page)).toHaveText('Domanda 7 di 7');
  await page.getByLabel('La tua email').fill('persona@esempio.it');
  await page.getByLabel('Potete ricontattarmi per una breve chiacchierata').check();
  await page.getByRole('button', { name: 'Invia' }).click();
  await expect(page.getByRole('heading', { name: 'Grazie!' })).toBeFocused();
  await expect(page.getByText('Grazie per il tuo tempo!')).toBeVisible();
  await expect(page.locator('.progress')).toBeHidden();

  const saves = await rpc(page, 'submit_survey');
  expect(saves).toHaveLength(7);
  const final = saves.at(-1);
  expect(final.p_answers).toEqual({
    eta: 'meno-30',
    lavoro: 'Insegnante',
    dove: ['mercato'],
    'dove:altro': 'Negozio sotto casa',
    fatica: 4,
    volte: 12,
    racconto: 'Il latte.\nPoi il pane.\nPoi le uova.\nPoi il caffè.\nE alla fine anche lo zucchero.\nE il sale.',
    mail: 'persona@esempio.it',
  });
  expect(final.p_meta).toEqual({
    session: saves[0].p_meta.session,
    final: true,
    website: '',
    recontact: true,
    duration_seconds: expect.any(Number),
    device: testInfo.project.name === 'telefono' ? 'telefono' : 'computer',
  });
  expect(saves.slice(0, -1).every((s) => s.p_meta.final === false && !('duration_seconds' in s.p_meta))).toBe(true);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  const origin = new URL(baseURL).origin;
  expect(requests.filter((url) => new URL(url).origin !== origin)).toEqual([]);
  expect(await page.evaluate(() => window.__csp), 'la pagina rispetta la stessa policy di q.html').toEqual([]);
  expect(errors).toEqual([]);
});

test('layout a sezioni: una schermata per sezione con le sue domande e «Domande X-Y di Z»', async ({ page }) => {
  await start(page, { survey: { ...SURVEY, layout: 'sezioni' } });
  await expect(page.getByRole('heading', { level: 1, name: 'Su di te' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Quanti anni hai? (obbligatoria)' })).toBeFocused();
  await expect(page.getByRole('heading', { level: 2, name: 'Che lavoro fai?' })).toBeVisible();
  await expect(counter(page)).toHaveText('Domande 1-2 di 7');
  await page.getByLabel('Più di 50').check();
  await next(page);
  await expect(page.getByRole('heading', { level: 1, name: 'L\'ultima spesa' })).toBeVisible();
  await expect(page.getByText('Pensa alle ultime quattro settimane.')).toBeVisible();
  await expect(page.locator('.q')).toHaveCount(5);
  await expect(counter(page)).toHaveText('Domande 3-7 di 7');
  await expect(page.getByRole('button', { name: 'Invia' })).toBeVisible();
});

for (const mode of ['barra', 'nessuno']) {
  test(`avanzamento «${mode}»`, async ({ page }) => {
    await start(page, { survey: { ...SURVEY, progress: mode } });
    await expect(page.getByRole('heading', { level: 1, name: /Quanti anni hai/ })).toBeVisible();
    await expect(counter(page)).toBeHidden();
    if (mode === 'barra') {
      await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Domanda 1 di 7');
    } else {
      await expect(page.getByRole('progressbar')).toBeHidden();
    }
  });
}

test('ricaricando la pagina si riprende dalla stessa schermata con le risposte e la compilazione di prima', async ({ page }) => {
  await start(page);
  await page.getByLabel('Più di 50').check();
  await next(page);
  await page.getByLabel('Che lavoro fai?').fill('Cuoca');
  const session = (await rpc(page, 'submit_survey'))[0].p_meta.session;
  await page.reload();
  await expect(counter(page)).toHaveText('Domanda 2 di 7');
  await expect(page.getByLabel('Che lavoro fai?')).toHaveValue('Cuoca');
  expect(await rpc(page, 'survey_event'), 'una ripresa non è una nuova visita').toEqual([]);
  await next(page);
  const save = (await rpc(page, 'submit_survey'))[0];
  expect(save.p_meta.session).toBe(session);
  expect(save.p_answers).toEqual({ eta: 'oltre-50', lavoro: 'Cuoca' });
  await page.getByRole('button', { name: 'Indietro' }).click();
  await page.getByRole('button', { name: 'Indietro' }).click();
  await expect(page.getByLabel('Più di 50')).toBeChecked();
});

test('un salvataggio intermedio fallito non ferma chi risponde e si riprova alla schermata dopo', async ({ page }) => {
  await start(page, { submit: ['network'] });
  await page.getByLabel('Meno di 30').check();
  await next(page);
  await expect(counter(page)).toHaveText('Domanda 2 di 7');
  await expect(page.locator('.alert')).toHaveText('');
  await page.getByLabel('Che lavoro fai?').fill('Fornaio');
  await next(page);
  await expect(counter(page)).toHaveText('Domanda 3 di 7');
  const saves = await rpc(page, 'submit_survey');
  expect(saves).toHaveLength(2);
  expect(saves[1].p_answers).toEqual({ eta: 'meno-30', lavoro: 'Fornaio' });
});

test('invio finale senza rete o con troppi tentativi: messaggio chiaro e Riprova', async ({ page }) => {
  await start(page, { survey: withQuestions(['eta']), submit: ['network', 'rate_limit', 'ok'] });
  await page.getByLabel('Meno di 30').check();
  await page.getByRole('button', { name: 'Invia' }).click();
  await expect(page.locator('.alert')).toHaveText('Connessione non riuscita. Controlla la rete e riprova.');
  await page.getByRole('button', { name: 'Riprova' }).click();
  await expect(page.locator('.alert')).toHaveText('Troppi tentativi. Aspetta qualche minuto e riprova.');
  await page.getByRole('button', { name: 'Riprova' }).click();
  await expect(page.getByRole('heading', { name: 'Grazie!' })).toBeVisible();
  expect((await rpc(page, 'submit_survey')).every((s) => s.p_meta.final === true)).toBe(true);
});

test('se il primo invio era arrivato ma la risposta si è persa, Riprova porta comunque al grazie', async ({ page }) => {
  await start(page, { survey: withQuestions(['eta']), submit: ['network', { status: 'errore', reason: 'Le risposte sono già state inviate.' }] });
  await page.getByLabel('Più di 50').check();
  await page.getByRole('button', { name: 'Invia' }).click();
  await page.getByRole('button', { name: 'Riprova' }).click();
  await expect(page.getByRole('heading', { name: 'Grazie!' })).toBeVisible();
  await expect(page.locator('form')).toHaveAttribute('aria-busy', 'false');
});

test('un errore del database su una domanda si mostra sotto quella domanda', async ({ page }) => {
  await start(page, { survey: withQuestions(['eta', 'lavoro']), submit: ['ok', { status: 'errore', reason: 'Una risposta è troppo lunga.', question: 'lavoro' }] });
  await page.getByLabel('Meno di 30').check();
  await next(page);
  await page.getByLabel('Che lavoro fai?').fill('Fornaio');
  await page.getByRole('button', { name: 'Invia' }).click();
  await expect(page.locator('.q-error')).toHaveText('Una risposta è troppo lunga.');
  await expect(page.getByRole('button', { name: 'Invia' })).toBeVisible();
});

test('questionario chiuso, non trovato e link senza codice valido', async ({ page }) => {
  await open(page, { survey: { status: 'chiuso' } });
  await expect(page.getByRole('heading', { level: 1, name: 'Questionario chiuso' })).toBeVisible();
  await expect(page.getByRole('button')).toHaveCount(0);

  const missing = await page.context().newPage();
  await open(missing, { survey: { status: 'non_trovato' } });
  await expect(missing.getByRole('heading', { level: 1, name: 'Questionario non trovato' })).toBeVisible();

  for (const hash of ['', '#corto', `#${TOKEN}!`]) {
    const bad = await page.context().newPage();
    await open(bad, {}, hash);
    await expect(bad.getByRole('heading', { level: 1, name: 'Questionario non trovato' })).toBeVisible();
    expect(await rpc(bad, 'public_survey'), hash).toEqual([]);
  }
});

test('se il questionario non si carica c\'è un messaggio con Riprova', async ({ page }) => {
  await open(page, { load: 'network' });
  await expect(page.getByRole('heading', { level: 1, name: 'Non riesco ad aprire il questionario' })).toBeVisible();
  await expect(page.getByText('Connessione non riuscita. Controlla la rete e riprova.')).toBeVisible();
  await page.getByRole('button', { name: 'Riprova' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Non riesco ad aprire il questionario' })).toBeVisible();
  expect(await rpc(page, 'public_survey')).toHaveLength(2);
});

test('tema scuro forzato e colore del questionario su pulsanti, barra e righe scelte, con testo nero su un colore chiaro', async ({ page }) => {
  await open(page, { survey: { ...SURVEY, appearance: { theme: 'scuro', accent: '#ffcc00' } } });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'scuro');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(18, 20, 27)');
  const begin = page.getByRole('button', { name: 'Inizia' });
  await expect(begin).toHaveCSS('background-color', 'rgb(255, 204, 0)');
  await expect(begin).toHaveCSS('color', 'rgb(0, 0, 0)');
  await begin.click();
  await expect(page.locator('.progress-fill')).toHaveCSS('background-color', 'rgb(255, 204, 0)');
  await page.getByLabel('Da 30 a 50').check();
  await expect(page.locator('label.opt', { hasText: 'Da 30 a 50' })).toHaveCSS('border-color', 'rgb(255, 204, 0)');
});

test('tema automatico segue il dispositivo, chiaro lo ignora; testo bianco sul colore predefinito', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page);
  expect(await page.locator('html').getAttribute('data-theme')).toBeNull();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(18, 20, 27)');
  await expect(page.getByRole('button', { name: 'Inizia' })).toHaveCSS('color', 'rgb(255, 255, 255)');
  const light = await page.context().newPage();
  await light.emulateMedia({ colorScheme: 'dark' });
  await open(light, { survey: { ...SURVEY, appearance: { theme: 'chiaro', accent: '#3b4bc8' } } });
  await expect(light.locator('body')).toHaveCSS('background-color', 'rgb(245, 246, 250)');
});

test('i testi del questionario restano testo e un colore non valido torna quello predefinito', async ({ page }) => {
  const xss = '<img src=x onerror="window.__xss=1">';
  const survey = {
    ...SURVEY,
    title: `Titolo ${xss}`,
    intro: xss,
    appearance: { theme: 'scuro', accent: 'red; background: url(x)' },
    questions: [{ ...SURVEY.questions[1], label: `Domanda ${xss}`, options: [{ id: 'a', label: xss }] }],
  };
  await open(page, { survey });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Titolo ${xss}`);
  await page.getByRole('button', { name: 'Inizia' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`Domanda ${xss}`);
  await expect(page.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent'))).toBe('#3b4bc8');
});

test('il campo trappola è nascosto, fuori dal Tab, e il suo valore va in meta.website', async ({ page }) => {
  await start(page);
  const trap = page.locator('input[name="website"]');
  await expect(trap).toHaveAttribute('tabindex', '-1');
  await expect(trap).toHaveAttribute('autocomplete', 'off');
  await expect(page.locator('.hp')).toHaveAttribute('aria-hidden', 'true');
  const box = await trap.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(0);
  await trap.evaluate((el) => {
    el.value = 'https://spam.example';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.getByLabel('Meno di 30').check();
  await next(page);
  await expect(counter(page)).toHaveText('Domanda 2 di 7');
  expect((await rpc(page, 'submit_survey'))[0].p_meta.website).toBe('https://spam.example');
});

test('sul telefono a 360 px niente scorre in orizzontale, ogni riga si tocca bene e non ci sono errori', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'telefono', 'solo sul telefono');
  await page.setViewportSize({ width: 360, height: 740 });
  const { errors } = await open(page);
  const check = async (where) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${where}: la pagina scorre in orizzontale`).toBeLessThanOrEqual(0);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('.opt, .btn, .field, .link-btn')]
        .filter((el) => el.getClientRects().length && el.getBoundingClientRect().height < 44)
        .map((el) => el.textContent || el.className),
    );
    expect(small, `${where}: elementi troppo piccoli da toccare`).toEqual([]);
  };
  await check('introduzione');
  await page.getByRole('button', { name: 'Leggi tutto' }).click();
  await check('privacy aperta');
  await page.getByRole('button', { name: 'Inizia' }).click();
  for (let i = 1; i <= 7; i += 1) {
    await expect(counter(page)).toHaveText(`Domanda ${i} di 7`);
    if (i === 1) await page.getByLabel('Meno di 30').check();
    if (i === 3) await page.getByLabel('Altro', { exact: true }).check();
    await check(`domanda ${i}`);
    if (i < 7) await next(page);
  }
  await page.getByRole('button', { name: 'Invia' }).click();
  await expect(page.getByRole('heading', { name: 'Grazie!' })).toBeVisible();
  await check('grazie');
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});
