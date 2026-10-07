import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHOICES, LIMITS, RESULT_KEY, CALENDLY_URL, isQualified, cleanApplication, calendlyUrl, readResult,
} from '../apply/discovery-core.mjs';

const GOOD = {
  firstName: ' Ana ', lastName: ' Diaz ', email: ' ana@example.com ',
  experience: 'stagnant', revenue: 'yes', offer: 'notyet', camera: 'unsure', budget: '1k',
  niche: ' Fitness coaching ', timeline: 'month',
  utm: { source: ' youtube ', medium: '', campaign: 'oct', content: 'video-7', term: 7 },
};

test('books instantly unless camera is "No" or budget is under $1,000 (the old Tally rules)', () => {
  const base = { camera: 'yes', budget: '1k' };
  assert.equal(isQualified(base), true);
  assert.equal(isQualified({ ...base, camera: 'unsure' }), true);
  for (const budget of ['2.5k', '5k']) assert.equal(isQualified({ ...base, budget }), true, budget);
  // Revenue and offer don't decide anything, same as Tally.
  assert.equal(isQualified({ ...base, revenue: 'notyet', offer: 'notyet' }), true);
  assert.equal(isQualified({ ...base, camera: 'no' }), false);
  assert.equal(isQualified({ ...base, budget: 'under1000' }), false);
  assert.equal(isQualified({ ...base, budget: 'lots' }), false);
  assert.equal(isQualified({}), false);
});

test('the answer labels match the Tally form', () => {
  assert.deepEqual(Object.values(CHOICES.experience), ['Starting from zero', 'Grew but stagnant', 'Other']);
  assert.deepEqual(Object.values(CHOICES.budget), ['Under $1,000', '$1,000–$2,500', '$2,500–$5,000', '$5,000+']);
  assert.deepEqual(Object.values(CHOICES.timeline), ['This month', '1–3 months', 'Just exploring']);
});

test('cleanApplication trims everything and keeps only non-empty UTMs', () => {
  assert.deepEqual(cleanApplication(GOOD), {
    firstName: 'Ana', lastName: 'Diaz', email: 'ana@example.com',
    experience: 'stagnant', revenue: 'yes', offer: 'notyet', camera: 'unsure', budget: '1k',
    niche: 'Fitness coaching', timeline: 'month',
    utm: { source: 'youtube', campaign: 'oct', content: 'video-7' },
  });
});

test('cleanApplication caps the niche', () => {
  assert.equal(cleanApplication({ ...GOOD, niche: 'n'.repeat(500) }).niche.length, LIMITS.niche);
});

test('cleanApplication rejects missing or invalid required answers', () => {
  const bad = [
    null, 'text', [],
    { ...GOOD, firstName: '' }, { ...GOOD, lastName: 'x'.repeat(61) }, { ...GOOD, email: 'nope' },
    { ...GOOD, niche: ' ' }, { ...GOOD, experience: 'expert' }, { ...GOOD, timeline: undefined },
    { ...GOOD, camera: 'toString' }, // inherited object keys are not answers
    { ...GOOD, budget: ['1k'] }, { ...GOOD, revenue: { toString: () => 'yes' } }, // only exact strings
  ];
  for (const body of bad) assert.equal(cleanApplication(body), null, JSON.stringify(body));
});

test('calendlyUrl pre-fills name and email on the Discovery Call event', () => {
  assert.equal(CALENDLY_URL, 'https://calendly.com/brandonchinportlock/one-on-one-meeting');
  const raw = calendlyUrl({ firstName: 'Ana Maria', lastName: 'Diaz', email: 'ana+yt@example.com' });
  const url = new URL(raw);
  assert.equal(url.origin + url.pathname, CALENDLY_URL);
  assert.ok(raw.includes('name=Ana%20Maria%20Diaz'), raw);
  assert.equal(url.searchParams.get('email'), 'ana+yt@example.com');
});

test('readResult accepts only a well-formed saved result', () => {
  assert.deepEqual(readResult(JSON.stringify({ firstName: 'Ana', qualified: true })),
    { firstName: 'Ana', lastName: '', email: '', qualified: true });
  assert.equal(readResult('garbage'), null);
});

test('storage key is separate from the other funnels', () => {
  assert.equal(RESULT_KEY, 'portlock.discovery');
});
