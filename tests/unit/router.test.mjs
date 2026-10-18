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
  assert.equal(location.hash, '#/b');

  router.setLeaveGuard(async () => true);
  await router.render('#/inesistente');
  assert.equal(outlet.textContent, 'non trovata');

  await router.render('#/boom');
  assert.match(outlet.textContent, /rotta rotta/);
  assert.equal(router.currentPath(), '/boom');
  assert.ok(changes.includes('/b'));
  router.stopRouter();
});
