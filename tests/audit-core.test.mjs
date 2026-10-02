import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHOICES, LIMITS, RESULT_KEY, CALENDLY_URL, isQualified, validateChannel, cleanApplication, calendlyUrl, readResult,
} from '../free-audit/audit-core.mjs';

const GOOD = {
  firstName: ' Ana ', lastName: ' Diaz ', email: ' ana@example.com ',
  stage: 'stagnant', offer: 'yes', camera: 'unsure', budget: '1500',
  channel: ' @anafit ', niche: ' Fitness coaching ', challenge: ' Views dropped ', source: ' Outliers video ', ckid: ' vis_1 ',
  utm: { source: ' youtube ', medium: '', campaign: 'oct', content: 'video-7', term: 7 },
};

test('books instantly only with an offer, on camera, and a $1,500+ budget', () => {
  const base = { offer: 'yes', camera: 'yes', budget: '1500' };
  assert.equal(isQualified(base), true);
  assert.equal(isQualified({ ...base, camera: 'unsure' }), true);
  for (const budget of ['3000', '5k']) assert.equal(isQualified({ ...base, budget }), true, budget);
  for (const offer of ['planning', 'no']) assert.equal(isQualified({ ...base, offer }), false, offer);
  assert.equal(isQualified({ ...base, camera: 'no' }), false);
  assert.equal(isQualified({ ...base, budget: 'under1500' }), false);
  assert.equal(isQualified({ ...base, budget: 'lots' }), false);
  assert.equal(isQualified({}), false);
});

test('every label is comma-free, because Notion rejects commas in select options', () => {
  for (const [field, options] of Object.entries(CHOICES)) {
    for (const label of Object.values(options)) assert.ok(!label.includes(','), `${field}: ${label}`);
  }
});

test('channel is required ("none yet" counts)', () => {
  assert.equal(validateChannel(' @anafit '), null);
  assert.equal(validateChannel('none yet'), null);
  assert.ok(validateChannel('   '));
  assert.ok(validateChannel(undefined));
});

test('cleanApplication trims everything and keeps only non-empty UTMs', () => {
  assert.deepEqual(cleanApplication(GOOD), {
    firstName: 'Ana', lastName: 'Diaz', email: 'ana@example.com',
    stage: 'stagnant', offer: 'yes', camera: 'unsure', budget: '1500',
    channel: '@anafit', niche: 'Fitness coaching', challenge: 'Views dropped', source: 'Outliers video', ckid: 'vis_1',
    utm: { source: 'youtube', campaign: 'oct', content: 'video-7' },
  });
});

test('cleanApplication caps the free-text answers', () => {
  const app = cleanApplication({ ...GOOD, channel: 'c'.repeat(500), niche: 'n'.repeat(500), challenge: 'w'.repeat(5000), source: 's'.repeat(500), ckid: 'k'.repeat(500) });
  assert.equal(app.channel.length, LIMITS.channel);
  assert.equal(app.niche.length, LIMITS.niche);
  assert.equal(app.challenge.length, LIMITS.challenge);
  assert.equal(app.source.length, LIMITS.source);
  assert.equal(app.ckid.length, 100);
});

test('cleanApplication treats optional answers as optional', () => {
  const app = cleanApplication({ ...GOOD, challenge: 42, source: undefined, ckid: null, utm: 'nope' });
  assert.equal(app.challenge, '');
  assert.equal(app.source, '');
  assert.equal(app.ckid, '');
  assert.deepEqual(app.utm, {});
});

test('cleanApplication rejects missing or invalid required answers', () => {
  const bad = [
    null, 'text', [],
    { ...GOOD, firstName: '' }, { ...GOOD, lastName: 'x'.repeat(61) }, { ...GOOD, email: 'nope' },
    { ...GOOD, channel: ' ' }, { ...GOOD, niche: ' ' }, { ...GOOD, stage: 'expert' }, { ...GOOD, budget: undefined },
    { ...GOOD, camera: 'toString' }, // inherited object keys are not answers
    { ...GOOD, budget: ['1500'] }, { ...GOOD, offer: { toString: () => 'yes' } }, // only exact strings
  ];
  for (const body of bad) assert.equal(cleanApplication(body), null, JSON.stringify(body));
});

test('calendlyUrl pre-fills name and email on the 30 min audit event', () => {
  const raw = calendlyUrl({ firstName: 'Ana Maria', lastName: 'Diaz', email: 'ana+yt@example.com' });
  const url = new URL(raw);
  assert.equal(url.origin + url.pathname, CALENDLY_URL);
  assert.ok(raw.includes('name=Ana%20Maria%20Diaz'), raw);
  assert.equal(url.searchParams.get('email'), 'ana+yt@example.com');
  assert.equal(url.searchParams.get('primary_color'), 'ff7a1a');
});

test('readResult accepts only a well-formed saved result', () => {
  assert.deepEqual(readResult(JSON.stringify({ firstName: 'Ana', qualified: false })),
    { firstName: 'Ana', lastName: '', email: '', qualified: false });
  assert.equal(readResult('garbage'), null);
});

test('storage key is separate from the Free Video one', () => {
  assert.equal(RESULT_KEY, 'portlock.freeAudit');
});
