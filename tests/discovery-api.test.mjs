import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleDiscovery } from '../api/_discovery.mjs';

const ENV = {
  NOTION_TOKEN: 'ntn_test', NOTION_DISCOVERY_DB: 'db789',
  KIT_API_KEY: 'kit_test', KIT_TAG_DISCOVERY_APPLICANT: '55', KIT_TAG_DISCOVERY_QUALIFIED: '66',
};
const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);
const APP = {
  firstName: ' Ana ', lastName: 'Diaz', email: ' ana@example.com ',
  experience: 'zero', revenue: 'yes', offer: 'yes', camera: 'unsure', budget: '2.5k',
  niche: 'Fitness coaching', timeline: 'soon',
  utm: { source: 'youtube', medium: '', campaign: 'oct', content: 'video-7' },
};

// Fake Notion + Kit: records every call and answers each service with its own status.
function fakeServices({ notion = 200, kit = 200 } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const service = url.startsWith('https://api.notion.com/') ? 'notion' : 'kit';
    calls.push({
      service,
      path: url.replace('https://api.notion.com/v1', '').replace('https://api.kit.com/v4', ''),
      headers: init.headers,
      body: JSON.parse(init.body),
    });
    return new Response('{}', { status: service === 'notion' ? notion : kit });
  };
  return { calls, fetch, of: service => calls.filter(c => c.service === service) };
}

const post = body => new Request('http://x/api/discovery', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const run = (body, services, env = ENV) => handleDiscovery(post(body), { env, fetch: services.fetch, now: NOW });

test('a qualified application gets its own row in the Discovery Notion DB', async () => {
  const s = fakeServices();
  const res = await run(APP, s);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, qualified: true });

  const [notion] = s.of('notion');
  assert.equal(notion.path, '/pages');
  assert.equal(notion.headers.Authorization, 'Bearer ntn_test');
  assert.deepEqual(notion.body.parent, { database_id: 'db789' });
  const p = notion.body.properties;
  assert.equal(p.Name.title[0].text.content, 'Ana Diaz');
  assert.deepEqual(p.Email, { email: 'ana@example.com' });
  assert.deepEqual(p.Status, { select: { name: 'New' } });
  assert.deepEqual(p.Qualified, { checkbox: true });
  assert.deepEqual(p['YouTube experience'], { select: { name: 'Starting from zero' } });
  assert.deepEqual(p['Has revenue'], { select: { name: 'Yes' } });
  assert.deepEqual(p['Has offer'], { select: { name: 'Yes' } });
  assert.deepEqual(p['On camera'], { select: { name: 'Unsure' } });
  assert.deepEqual(p.Budget, { select: { name: '$2.5k–$5k' } });
  assert.deepEqual(p['Start timeline'], { select: { name: '1–3 months' } });
  assert.equal(p.Niche.rich_text[0].text.content, 'Fitness coaching');
  assert.equal(p['UTM source'].rich_text[0].text.content, 'youtube');
  assert.equal(p['UTM campaign'].rich_text[0].text.content, 'oct');
  assert.equal(p['UTM content'].rich_text[0].text.content, 'video-7');
  assert.deepEqual(p.Applied, { date: { start: '2026-10-07T12:00:00.000Z' } });
  assert.equal(p.Owner, undefined);
});

test('every Notion select label is comma-free, because Notion rejects commas in select options', async () => {
  for (const budget of ['under1000', '1k', '2.5k', '5k']) {
    const s = fakeServices();
    await run({ ...APP, budget }, s);
    const p = s.of('notion')[0].body.properties;
    for (const [column, value] of Object.entries(p)) {
      if (value.select) assert.ok(!value.select.name.includes(','), `${column}: ${value.select.name}`);
    }
  }
});

test('NOTION_OWNER_ID assigns Brandon as Owner', async () => {
  const s = fakeServices();
  await run(APP, s, { ...ENV, NOTION_OWNER_ID: 'user-1' });
  assert.deepEqual(s.of('notion')[0].body.properties.Owner, { people: [{ id: 'user-1' }] });
});

test('a qualified application saves every answer to Kit and adds both discovery tags', async () => {
  const s = fakeServices();
  const res = await run(APP, s);
  assert.deepEqual(await res.json(), { ok: true, qualified: true });

  const kit = { calls: s.of('kit') };
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
    const s = fakeServices();
    const res = await run({ ...APP, ...change }, s);
    assert.deepEqual(await res.json(), { ok: true, qualified: false });
    assert.deepEqual(s.of('notion')[0].body.properties.Qualified, { checkbox: false });
    assert.deepEqual(s.of('kit').map(c => c.path), ['/subscribers', '/tags/55/subscribers']);
  }
});

test('with the reminder sequence set, only qualified applicants join it', async () => {
  const env = { ...ENV, KIT_SEQUENCE_DISCOVERY_REMINDER: '88' };
  const qualified = fakeServices();
  await run(APP, qualified, env);
  const join = qualified.of('kit').find(c => c.path === '/sequences/88/subscribers');
  assert.deepEqual(join.body, { email_address: 'ana@example.com' });

  const unqualified = fakeServices();
  await run({ ...APP, camera: 'no' }, unqualified, env);
  assert.deepEqual(unqualified.of('kit').map(c => c.path), ['/subscribers', '/tags/55/subscribers']);
});

test('if only Kit fails, the Notion row still lands and the visitor gets through', async () => {
  const s = fakeServices({ kit: 500 });
  const res = await run(APP, s);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, qualified: true });
  assert.equal(s.of('notion').length, 1);
});

test('if only Notion fails, Kit still gets the answers and the visitor gets through', async () => {
  const s = fakeServices({ notion: 400 });
  const res = await run(APP, s);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, qualified: true });
  assert.equal(s.of('kit')[0].path, '/subscribers');
});

test('if both fail, the request fails so the visitor can retry', async () => {
  const res = await run(APP, fakeServices({ notion: 500, kit: 500 }));
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { ok: false });
});

test('bad input is rejected without calling Notion or Kit', async () => {
  for (const body of ['not json', 'x'.repeat(10_001), { ...APP, email: 'nope' }, { ...APP, niche: '' }, { ...APP, budget: '1500' }]) {
    const s = fakeServices();
    const res = await run(body, s);
    assert.equal(res.status, 400, typeof body === 'string' ? body.slice(0, 20) : JSON.stringify(body));
    assert.equal(s.calls.length, 0);
  }
});

test('a filled honeypot looks like success but saves nothing', async () => {
  const s = fakeServices();
  const res = await run({ ...APP, hp: 'bot' }, s);
  assert.deepEqual(await res.json(), { ok: true, qualified: false });
  assert.equal(s.calls.length, 0);
});

test('missing env vars fail fast without calling anything', async () => {
  for (const key of Object.keys(ENV)) {
    const s = fakeServices();
    const res = await run(APP, s, { ...ENV, [key]: '' });
    assert.equal(res.status, 500, key);
    assert.equal(s.calls.length, 0);
  }
});
