import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom } from '../setup/dom.mjs';

let router;

before(async () => {
  setupDom();
  router = await import('../../assets/js/router.js');
});

test('compile builds patterns with required and optional parameters', () => {
  const { re, keys } = router.compile('/idea/:id/:tab?');
  assert.deepEqual(keys, ['id', 'tab']);
  assert.ok(re.test('/idea/abc'));
  assert.ok(re.test('/idea/abc/canvas'));
  assert.ok(re.test('/idea/abc/'));
  assert.ok(!re.test('/idea'));
  assert.ok(!re.test('/idea/abc/canvas/extra'));
  assert.ok(router.compile('/').re.test('/'));
  assert.ok(!router.compile('/a.b').re.test('/aXb'));
});

test('parseHash splits path and query and defaults to the dashboard', () => {
  assert.deepEqual(router.parseHash('').path, '/');
  const parsed = router.parseHash('#/storico?autore=x&tipo=idea');
  assert.equal(parsed.path, '/storico');
  assert.equal(parsed.query.get('tipo'), 'idea');
});

test('match decodes parameters and returns the first route that fits', () => {
  router.clearRoutes();
  router.addRoute('/diff/:id/:to/:from?', () => {});
  router.addRoute('/idea/:id', () => {});
  const m = router.match('/diff/abc/5');
  assert.deepEqual(m.params, { id: 'abc', to: '5' });
  assert.deepEqual(router.match('/idea/a%20b').params, { id: 'a b' });
  assert.deepEqual(router.match('/idea/%E0%A4%A').params, { id: '%E0%A4%A' });
  assert.equal(router.match('/sconosciuta'), null);
});

test('render runs the view, cleans up the previous one and respects the leave guard', async () => {
  router.clearRoutes();
  const outlet = document.createElement('main');
  const log = [];
  router.addRoute('/', (el) => {
    el.textContent = 'home';
    log.push('home');
    return () => log.push('cleanup-home');
  });
  router.addRoute('/b', (el, params, query) => {
    el.textContent = `b ${query.get('x') || ''}`;
    log.push('b');
  });
  router.addRoute('/boom', () => {
    throw new Error('rotta rotta');
  });
  const changes = [];
  router.onRouteChange((path) => changes.push(path));
  await router.startRouter(outlet, { fallback: (el) => (el.textContent = 'non trovata') });
  assert.equal(outlet.textContent, 'home');

  await router.render('#/b?x=1');
  assert.equal(outlet.textContent, 'b 1');
  assert.deepEqual(log, ['home', 'cleanup-home', 'b']);

  router.setLeaveGuard(async () => false);
  await router.render('#/');
  assert.equal(outlet.textContent, 'b 1', 'il guard blocca la navigazione');
  assert.equal(location.hash, '#/b?x=1', 'torna esattamente all\'indirizzo di prima, filtri compresi');

  router.setLeaveGuard(async () => true);
  await router.render('#/inesistente');
  assert.equal(outlet.textContent, 'non trovata');

  await router.render('#/boom');
  assert.match(outlet.textContent, /rotta rotta/);
  assert.equal(router.currentPath(), '/boom');
  assert.ok(changes.includes('/b'));
  router.stopRouter();
});

test('tabs and filters replace the history entry instead of adding one', async () => {
  router.clearRoutes();
  const outlet = document.createElement('main');
  router.addRoute('/a/:tab?', (el, params, query) => {
    el.textContent = `a ${params.tab || ''} ${query.get('f') || ''}`.trim();
    const link = Object.assign(document.createElement('a'), { href: '#/a/due', textContent: 'scheda' });
    link.dataset.replace = '';
    el.append(link);
  });
  document.body.append(outlet);
  await router.startRouter(outlet);
  await router.render('#/a');
  const before = history.length;
  outlet.querySelector('a').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  await new Promise((r) => setTimeout(r, 0));
  assert.match(outlet.textContent, /^a due/);
  assert.equal(location.hash, '#/a/due');
  await router.navigate('/a/due?f=1', { replace: true });
  assert.match(outlet.textContent, /^a due 1/);
  assert.equal(history.length, before, 'schede e filtri non aggiungono voci alla cronologia');
  outlet.remove();
  router.stopRouter();
});

test('the leave guard also asks when only the view in the address changes', async () => {
  router.clearRoutes();
  const outlet = document.createElement('main');
  router.addRoute('/v', (el, params, query) => (el.textContent = `vista ${query.get('vista') || 'team'}`));
  await router.startRouter(outlet);
  await router.render('#/v?vista=miei');
  let asked = 0;
  router.setLeaveGuard(async () => {
    asked += 1;
    return false;
  });
  await router.navigate('/v?vista=fotografie', { replace: true });
  assert.equal(asked, 1, 'cambiare vista con voti non salvati chiede conferma');
  assert.equal(outlet.textContent, 'vista miei');
  assert.equal(location.hash, '#/v?vista=miei');
  router.setLeaveGuard(null);
  router.stopRouter();
});
