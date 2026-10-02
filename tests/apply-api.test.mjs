import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleApply } from '../api/_apply.mjs';

const ENV = {
  NOTION_TOKEN: 'ntn_test', NOTION_APPLICATIONS_DB: 'db123',
  KIT_API_KEY: 'kit_test', KIT_TAG_APPLICANT: '11', KIT_TAG_QUALIFIED: '22',
};
const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);
const APP = {
  firstName: ' Ana ', lastName: 'Diaz', email: ' ana@example.com ',
  youtube: 'stagnant', business: 'yes', offer: 'yes', camera: 'unsure', budget: '1k',
  niche: 'Fitness coaching', channel: '@anafit', why: 'Want to grow', ckid: 'vis_1',
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

const post = body => new Request('http://x/api/apply', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const run = (body, services, env = ENV) => handleApply(post(body), { env, fetch: services.fetch, now: NOW });

test('a qualified application is saved to Notion and Kit with both tags', async () => {
  const s = fakeServices();
  const res = await run(APP, s);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, qualified: true });

  const [notion] = s.of('notion');
  assert.equal(notion.path, '/pages');
  assert.equal(notion.headers.Authorization, 'Bearer ntn_test');
  assert.equal(notion.headers['Notion-Version'], '2022-06-28');
  assert.deepEqual(notion.body.parent, { database_id: 'db123' });
  const p = notion.body.properties;
  assert.equal(p.Name.title[0].text.content, 'Ana Diaz');
  assert.deepEqual(p.Email, { email: 'ana@example.com' });
  assert.deepEqual(p.Status, { select: { name: 'New' } });
  assert.deepEqual(p.Qualified, { checkbox: true });
  assert.deepEqual(p['YouTube experience'], { select: { name: 'Grew but stagnant' } });
  assert.deepEqual(p['Revenue business'], { select: { name: 'Yes' } });
  assert.deepEqual(p['Has offer'], { select: { name: 'Yes' } });
  assert.deepEqual(p['On camera'], { select: { name: 'Unsure' } });
  assert.deepEqual(p.Budget, { select: { name: '$1k–$2.5k' } });
  assert.equal(p.Niche.rich_text[0].text.content, 'Fitness coaching');
  assert.equal(p.Channel.rich_text[0].text.content, '@anafit');
  assert.equal(p.Why.rich_text[0].text.content, 'Want to grow');
  assert.equal(p['ClickLedger ID'].rich_text[0].text.content, 'vis_1');
  assert.equal(p['UTM source'].rich_text[0].text.content, 'youtube');
  assert.equal(p['UTM campaign'].rich_text[0].text.content, 'oct');
  assert.equal(p['UTM content'].rich_text[0].text.content, 'video-7');
  assert.deepEqual(p.Applied, { date: { start: '2026-10-02T12:00:00.000Z' } });
  assert.equal(p.Owner, undefined);

  const kit = s.of('kit');
  assert.ok(kit.every(c => c.headers['X-Kit-Api-Key'] === 'kit_test'));
  assert.deepEqual(kit.map(c => c.path), ['/subscribers', '/tags/11/subscribers', '/tags/22/subscribers']);
  assert.deepEqual(kit[0].body, {
    email_address: 'ana@example.com', first_name: 'Ana',
    fields: { last_name: 'Diaz', youtube_channel: '@anafit', utm_source: 'youtube', utm_campaign: 'oct', utm_content: 'video-7' },
  });
  assert.deepEqual(kit[1].body, { email_address: 'ana@example.com' });
  // Never added to a Kit form, so the skill delivery email can't fire.
  assert.ok(!kit.some(c => c.path.startsWith('/forms/')));
});

test('an unqualified application is saved but only gets the applicant tag', async () => {
  const s = fakeServices();
  const res = await run({ ...APP, budget: 'under1k' }, s);
  assert.deepEqual(await res.json(), { ok: true, qualified: false });
  assert.deepEqual(s.of('notion')[0].body.properties.Qualified, { checkbox: false });
  assert.deepEqual(s.of('notion')[0].body.properties.Budget, { select: { name: 'Under $1k' } });
  assert.deepEqual(s.of('kit').map(c => c.path), ['/subscribers', '/tags/11/subscribers']);
});

test('empty optional answers become empty Notion text and are left out of Kit', async () => {
  const s = fakeServices();
  await run({ ...APP, channel: '', why: '', ckid: '', utm: {} }, s);
  const p = s.of('notion')[0].body.properties;
  for (const key of ['Channel', 'Why', 'ClickLedger ID', 'UTM source', 'UTM campaign', 'UTM content']) {
    assert.deepEqual(p[key], { rich_text: [] }, key);
  }
  assert.deepEqual(s.of('kit')[0].body.fields, { last_name: 'Diaz' });
});

test('NOTION_OWNER_ID assigns Brandon as Owner so Notion notifies him', async () => {
  const s = fakeServices();
  await run(APP, s, { ...ENV, NOTION_OWNER_ID: 'user-1' });
  assert.deepEqual(s.of('notion')[0].body.properties.Owner, { people: [{ id: 'user-1' }] });
});

test('a Notion failure fails the request so the visitor can retry', async () => {
  const s = fakeServices({ notion: 400 });
  const res = await run(APP, s);
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { ok: false });
});

test('a Kit failure is logged but the visitor still gets through', async () => {
  const s = fakeServices({ kit: 500 });
  const res = await run(APP, s);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, qualified: true });
});

test('bad input is rejected without calling Notion or Kit', async () => {
  for (const body of ['not json', 'x'.repeat(10_001), { ...APP, email: 'nope' }, { ...APP, niche: '' }, { ...APP, budget: ['1k'] }]) {
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
