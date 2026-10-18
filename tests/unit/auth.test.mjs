import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupDom } from '../setup/dom.mjs';

let auth;
let api;
let original;

before(async () => {
  setupDom();
  auth = await import('../../assets/js/auth.js');
  ({ api } = await import('../../assets/js/lib/api.js'));
  original = { ...api };
});

afterEach(() => Object.assign(api, original));

const totp = (status) => ({ id: `f-${status}`, factor_type: 'totp', status });

test('without a session the user must log in', () => {
  assert.equal(auth.nextAuthStep({ session: null }), 'login');
});

test('after the password the second factor is always required', () => {
  const session = { user: { id: 'u' } };
  assert.equal(auth.nextAuthStep({ session, assurance: { currentLevel: 'aal1' }, factors: [] }), 'enroll');
  assert.equal(auth.nextAuthStep({ session, assurance: { currentLevel: 'aal1' }, factors: [totp('unverified')] }), 'enroll');
  assert.equal(auth.nextAuthStep({ session, assurance: { currentLevel: 'aal1' }, factors: [totp('verified')] }), 'verify');
  assert.equal(auth.nextAuthStep({ session, assurance: null, factors: [totp('verified')] }), 'verify');
});

test('with two factors the user enters, or sets a new password after a recovery link', () => {
  const session = { user: { id: 'u' } };
  assert.equal(auth.nextAuthStep({ session, assurance: { currentLevel: 'aal2' }, factors: [totp('verified')] }), 'ready');
  assert.equal(auth.nextAuthStep({ session, assurance: { currentLevel: 'aal2' }, factors: [totp('verified')], recovery: true }), 'new-password');
});

test('verifiedTotp keeps only verified authenticator apps', () => {
  assert.deepEqual(auth.verifiedTotp([totp('verified'), totp('unverified'), { factor_type: 'phone', status: 'verified' }]), [totp('verified')]);
  assert.deepEqual(auth.verifiedTotp(undefined), []);
});

test('the QR code is accepted only as an inline SVG image', () => {
  assert.equal(auth.isSafeQr('data:image/svg+xml;utf-8,<svg/>'), true);
  assert.equal(auth.isSafeQr('javascript:alert(1)'), false);
  assert.equal(auth.isSafeQr('https://evil.example/qr.svg'), false);
  assert.equal(auth.isSafeQr(undefined), false);
});

test('currentAuthStep asks Supabase for session, level and factors', async () => {
  api.getSession = async () => ({ user: { id: 'u' } });
  api.getAssurance = async () => ({ currentLevel: 'aal1', nextLevel: 'aal2' });
  api.listFactors = async () => [totp('verified')];
  api.isRecovery = () => false;
  assert.equal(await auth.currentAuthStep(), 'verify');
  api.getSession = async () => null;
  assert.equal(await auth.currentAuthStep(), 'login');
});
