import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleDiscovery } from '../api/_discovery.mjs';

const ENV = { KIT_API_KEY: 'kit_test', KIT_TAG_DISCOVERY_APPLICANT: '55', KIT_TAG_DISCOVERY_QUALIFIED: '66' };
const APP = {
  firstName: ' Ana ', lastName: 'Diaz', email: ' ana@example.com ',
  experience: 'zero', revenue: 'yes', offer: 'yes', camera: 'unsure', budget: '2.5k',
  niche: 'Fitness coaching', timeline: 'soon',
  utm: { source: 'youtube', medium: '', campaign: 'oct', content: 'video-7' },
};

// Fake Kit: records every call and answers with the given status.
function fakeKit(status = 200) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ path: url.replace('https://api.kit.com/v4', ''), headers: init.headers, body: JSON.parse(init.body) });
    return new Response('{}', { status });
  };
  return { calls, fetch };
}

const post = body => new Request('http://x/api/discovery', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const run = (body, kit, env = ENV) => handleDiscovery(post(body), { env, fetch: kit.fetch });

test('a qualified application saves every answer to Kit and adds both discovery tags', async () => {
  const kit = fakeKit();
  const res = await run(APP, kit);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, qualified: true });

  assert.ok(kit.calls.every(c => c.headers['X-Kit-Api-Key'] === 'kit_test'));
  assert.deepEqual(kit.calls.map(c => c.path), ['/subscribers', '/tags/55/subscribers', '/tags/66/subscribers']);
  assert.deepEqual(kit.calls[0].body, {
    email_address: 'ana@example.com', first_name: 'Ana',
    fields: {
      last_name: 'Diaz',
      yt_experience: 'Starting from zero',
      has_revenue: 'Yes',
      has_offer: 'Yes',
      on_camera: 'Unsure',
      monthly_budget: '$2,500–$5,000',
      niche: 'Fitness coaching',
      start_timeline: '1–3 months',
      utm_source: 'youtube', utm_campaign: 'oct', utm_content: 'video-7',
    },
  });
  for (const tag of kit.calls.slice(1)) assert.deepEqual(tag.body, { email_address: 'ana@example.com' });
  // Never added to a Kit form, so the skill delivery email can't fire.
  assert.ok(!kit.calls.some(c => c.path.startsWith('/forms/')));
});

test('an unqualified application is saved but only gets the applicant tag', async () => {
  for (const change of [{ camera: 'no' }, { budget: 'under1000' }]) {
    const kit = fakeKit();
    const res = await run({ ...APP, ...change }, kit);
    assert.deepEqual(await res.json(), { ok: true, qualified: false });
    assert.deepEqual(kit.calls.map(c => c.path), ['/subscribers', '/tags/55/subscribers']);
  }
});

test('Kit is the only copy, so a Kit failure fails the request and the visitor can retry', async () => {
  const res = await run(APP, fakeKit(500));
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { ok: false });
});

test('bad input is rejected without calling Kit', async () => {
  for (const body of ['not json', 'x'.repeat(10_001), { ...APP, email: 'nope' }, { ...APP, niche: '' }, { ...APP, budget: '1500' }]) {
    const kit = fakeKit();
    const res = await run(body, kit);
    assert.equal(res.status, 400, typeof body === 'string' ? body.slice(0, 20) : JSON.stringify(body));
    assert.equal(kit.calls.length, 0);
  }
});

test('a filled honeypot looks like success but saves nothing', async () => {
  const kit = fakeKit();
  const res = await run({ ...APP, hp: 'bot' }, kit);
  assert.deepEqual(await res.json(), { ok: true, qualified: false });
  assert.equal(kit.calls.length, 0);
});

test('missing env vars fail fast without calling anything', async () => {
  for (const key of Object.keys(ENV)) {
    const kit = fakeKit();
    const res = await run(APP, kit, { ...ENV, [key]: '' });
    assert.equal(res.status, 500, key);
    assert.equal(kit.calls.length, 0);
  }
});
