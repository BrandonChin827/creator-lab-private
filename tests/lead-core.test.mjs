import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFirstName, validateLastName, validateEmail, parseUtms, mergeUtms, appendUtms,
  readGate, isQualified, track, GATE_KEY, UTM_STORE_KEY,
} from '../youtube-idea-skill/lead-core.mjs';

test('first name is required, trimmed, and capped at 60 characters', () => {
  assert.match(validateFirstName(''), /first name/i);
  assert.match(validateFirstName('   '), /first name/i);
  assert.match(validateFirstName('a'.repeat(61)), /60/);
  assert.equal(validateFirstName(' José '), null);
  assert.equal(validateFirstName('a'.repeat(60)), null);
});

test('last name is required, trimmed, and capped at 60 characters', () => {
  assert.match(validateLastName(''), /last name/i);
  assert.match(validateLastName('  '), /last name/i);
  assert.match(validateLastName('b'.repeat(61)), /60/);
  assert.equal(validateLastName(" O'Brien-Díaz "), null);
});

test('email must be present and look like an address', () => {
  assert.match(validateEmail(''), /email/i);
  for (const bad of ['a@b', 'a b@c.com', '@c.com', 'a@.com', 'plain']) {
    assert.notEqual(validateEmail(bad), null, `${bad} should be rejected`);
  }
  assert.equal(validateEmail('x@y.co'), null);
  assert.equal(validateEmail('  first.last+yt@sub.example.com  '), null);
});

test('parseUtms keeps only non-empty utm_* values, trimmed and capped', () => {
  assert.deepEqual(parseUtms('?utm_source=yt&utm_medium=&x=1'), { source: 'yt' });
  assert.deepEqual(parseUtms('?utm_campaign=%20launch%20'), { campaign: 'launch' });
  assert.equal(parseUtms('?utm_term=' + 'z'.repeat(500)).term.length, 200);
  assert.deepEqual(parseUtms(''), {});
});

test('mergeUtms keeps the first-touch value for each key', () => {
  assert.deepEqual(
    mergeUtms({ source: 'yt' }, { source: 'x', campaign: 'c' }),
    { source: 'yt', campaign: 'c' },
  );
  assert.deepEqual(mergeUtms(null, { source: 'yt' }), { source: 'yt' });
});

test('appendUtms adds missing params without overwriting and keeps the hash', () => {
  assert.equal(appendUtms('/', { source: 'yt' }), '/?utm_source=yt');
  assert.equal(appendUtms('/', {}), '/');
  assert.equal(
    appendUtms('/?utm_source=keep#faq', { source: 'yt', campaign: 'c' }),
    '/?utm_source=keep&utm_campaign=c#faq',
  );
});

test('readGate returns the stored first name only for a well-formed value', () => {
  for (const raw of [null, '', 'garbage', '[]', 'null', '{"firstName":1,"ts":1}', '{"firstName":"Ana"}']) {
    assert.equal(readGate(raw), null, `${raw} should not open the gate`);
  }
  assert.deepEqual(readGate('{"firstName":"Ana","ts":1}'), { firstName: 'Ana', role: '' });
});

test('readGate keeps a known role and drops anything else', () => {
  assert.deepEqual(readGate('{"firstName":"Ana","ts":1,"role":"founder"}'), { firstName: 'Ana', role: 'founder' });
  assert.deepEqual(readGate('{"firstName":"Ana","ts":1,"role":"ceo"}'), { firstName: 'Ana', role: '' });
});

test('founders, coaches, and agencies qualify for the call pitch', () => {
  for (const role of ['founder', 'coach', 'agency']) assert.equal(isQualified(role), true, role);
  for (const role of ['creator', '', undefined]) assert.equal(isQualified(role), false, String(role));
});

test('track records events on globalThis.portlockEvents', () => {
  globalThis.portlockEvents = [];
  track('optin_step1', { a: 1 });
  assert.equal(globalThis.portlockEvents.length, 1);
  assert.equal(globalThis.portlockEvents[0].name, 'optin_step1');
  assert.deepEqual(globalThis.portlockEvents[0].props, { a: 1 });
});

test('storage keys are stable', () => {
  assert.equal(GATE_KEY, 'portlock.ytSkill');
  assert.equal(UTM_STORE_KEY, 'portlock.utm');
});
