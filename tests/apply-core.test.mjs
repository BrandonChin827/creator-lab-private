import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHOICES, LIMITS, RESULT_KEY, CALENDLY_URL, isQualified, validateNiche, cleanApplication, calendlyUrl, readResult,
} from '../free-video/apply-core.mjs';

const GOOD = {
  firstName: ' Ana ', lastName: ' Diaz ', email: ' ana@example.com ',
  youtube: 'zero', offer: 'yes', camera: 'unsure', budget: '1500', film: 'week', share: 'both',
  niche: ' Fitness coaching ', channel: ' @anafit ', source: ' Outliers video ', why: ' Want to grow ', ckid: ' vis_1 ',
  utm: { source: ' youtube ', medium: '', campaign: 'oct', content: 'video-7', term: 7 },
};

test('books instantly only with an offer, on camera, $1,500+ budget, filming within 7 days, and yes to posting + case study', () => {
  const base = { offer: 'yes', camera: 'yes', budget: '1500', film: 'week', share: 'both' };
  assert.equal(isQualified(base), true);
  assert.equal(isQualified({ ...base, camera: 'unsure' }), true);
  for (const budget of ['3000', '5k']) assert.equal(isQualified({ ...base, budget }), true, budget);
  for (const offer of ['planning', 'no']) assert.equal(isQualified({ ...base, offer }), false, offer);
  assert.equal(isQualified({ ...base, camera: 'no' }), false);
  assert.equal(isQualified({ ...base, budget: 'under1500' }), false);
  assert.equal(isQualified({ ...base, budget: 'lots' }), false);
  for (const film of ['weeks', 'unsure']) assert.equal(isQualified({ ...base, film }), false, film);
  for (const share of ['post', 'unsure']) assert.equal(isQualified({ ...base, share }), false, share);
  assert.equal(isQualified({}), false);
});

test('every label is comma-free, because Notion rejects commas in select options', () => {
  for (const [field, options] of Object.entries(CHOICES)) {
    for (const label of Object.values(options)) assert.ok(!label.includes(','), `${field}: ${label}`);
  }
});

test('niche is required', () => {
  assert.equal(validateNiche(' Fitness '), null);
  assert.ok(validateNiche('   '));
  assert.ok(validateNiche(undefined));
});

test('cleanApplication trims everything and keeps only non-empty UTMs', () => {
  assert.deepEqual(cleanApplication(GOOD), {
    firstName: 'Ana', lastName: 'Diaz', email: 'ana@example.com',
    youtube: 'zero', offer: 'yes', camera: 'unsure', budget: '1500', film: 'week', share: 'both',
    niche: 'Fitness coaching', channel: '@anafit', source: 'Outliers video', why: 'Want to grow', ckid: 'vis_1',
    utm: { source: 'youtube', campaign: 'oct', content: 'video-7' },
  });
});

test('cleanApplication caps the free-text answers', () => {
  const app = cleanApplication({ ...GOOD, niche: 'n'.repeat(500), channel: 'c'.repeat(500), source: 's'.repeat(500), why: 'w'.repeat(5000), ckid: 'k'.repeat(500) });
  assert.equal(app.niche.length, LIMITS.niche);
  assert.equal(app.channel.length, LIMITS.channel);
  assert.equal(app.source.length, LIMITS.source);
  assert.equal(app.why.length, LIMITS.why);
  assert.equal(app.ckid.length, 100);
});

test('cleanApplication treats optional answers as optional', () => {
  const app = cleanApplication({ ...GOOD, channel: undefined, source: undefined, why: 42, ckid: null, utm: 'nope' });
  assert.equal(app.channel, '');
  assert.equal(app.source, '');
  assert.equal(app.why, '');
  assert.equal(app.ckid, '');
  assert.deepEqual(app.utm, {});
});

test('cleanApplication rejects missing or invalid required answers', () => {
  const bad = [
    null, 'text', [],
    { ...GOOD, firstName: '' }, { ...GOOD, lastName: 'x'.repeat(61) }, { ...GOOD, email: 'nope' },
    { ...GOOD, niche: ' ' }, { ...GOOD, youtube: 'expert' }, { ...GOOD, budget: undefined },
    { ...GOOD, camera: 'toString' }, // inherited object keys are not answers
    { ...GOOD, budget: ['1500'] }, { ...GOOD, film: 'never' }, { ...GOOD, share: undefined }, { ...GOOD, offer: { toString: () => 'yes' } }, // only exact strings
  ];
  for (const body of bad) assert.equal(cleanApplication(body), null, JSON.stringify(body));
});

test('calendlyUrl pre-fills name and email on the 15 min event and uses Portlock colours', () => {
  const url = new URL(calendlyUrl({ firstName: 'Ana', lastName: 'Diaz', email: 'ana+yt@example.com' }));
  assert.equal(url.origin + url.pathname, CALENDLY_URL);
  assert.equal(url.searchParams.get('name'), 'Ana Diaz');
  assert.equal(url.searchParams.get('email'), 'ana+yt@example.com');
  assert.equal(url.searchParams.get('primary_color'), 'ff7a1a');
  assert.equal(new URL(calendlyUrl({ firstName: 'Ana', lastName: '', email: '' })).searchParams.has('email'), false);
});

test('readResult accepts only a well-formed saved result', () => {
  assert.deepEqual(readResult(JSON.stringify({ firstName: 'Ana', lastName: 'Diaz', email: 'a@b.co', qualified: true })),
    { firstName: 'Ana', lastName: 'Diaz', email: 'a@b.co', qualified: true });
  assert.deepEqual(readResult(JSON.stringify({ firstName: 'Ana', qualified: false })),
    { firstName: 'Ana', lastName: '', email: '', qualified: false });
  for (const raw of [null, '', 'garbage', '{}', JSON.stringify({ firstName: 'Ana', qualified: 'yes' })]) {
    assert.equal(readResult(raw), null, String(raw));
  }
});

test('storage key is stable', () => {
  assert.equal(RESULT_KEY, 'portlock.freeVideo');
});

test('calendlyUrl sends spaces as %20, because Calendly shows a + literally ("Ana+Diaz")', () => {
  const raw = calendlyUrl({ firstName: 'Ana Maria', lastName: 'Diaz', email: 'ana+yt@example.com' });
  assert.ok(raw.includes('name=Ana%20Maria%20Diaz'), raw);
  assert.ok(!/name=[^&]*\+/.test(raw), raw);
  assert.equal(new URL(raw).searchParams.get('email'), 'ana+yt@example.com'); // a + inside the email survives
});
