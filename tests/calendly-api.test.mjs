import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handleCalendly, verifySignature, DISCOVERY_EVENT_TYPE } from '../api/_calendly.mjs';

const KEY = 'signing_test';
const NOW = 1_800_000_000_000;
const ENV = { CALENDLY_WEBHOOK_SIGNING_KEY: KEY, NOTION_TOKEN: 'secret_test', NOTION_DISCOVERY_DB: 'db123', KIT_API_KEY: 'kit_test', KIT_TAG_DISCOVERY_BOOKED: '77' };
const BOOKING = {
  event: 'invitee.created',
  payload: { email: ' ana@example.com ', name: 'Ana Diaz', scheduled_event: { event_type: DISCOVERY_EVENT_TYPE, name: 'Discovery Call' } },
};

const sign = (raw, t = NOW / 1000, key = KEY) => `t=${t},v1=${createHmac('sha256', key).update(`${t}.${raw}`).digest('hex')}`;

// Fake Kit + Notion: records every call. The Notion query finds `rows`.
function fakeApis({ kit = 200, notion = 200, rows = [{ id: 'page1' }] } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: JSON.parse(init.body) });
    const status = url.includes('kit.com') ? kit : notion;
    return Response.json(url.endsWith('/query') ? { results: rows } : {}, { status });
  };
  return { calls, fetch };
}

function run(body, apis, { env = ENV, signature } = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const request = new Request('http://x/api/calendly', { method: 'POST', body: raw, headers: { 'Calendly-Webhook-Signature': signature ?? sign(raw) } });
  return handleCalendly(request, { env, fetch: apis.fetch, now: NOW });
}

test('a Discovery Call booking tags them in Kit and sets their latest Notion row to Call booked', async () => {
  const apis = fakeApis();
  const res = await run(BOOKING, apis);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });

  const kit = apis.calls.find(c => c.url.includes('kit.com'));
  assert.equal(kit.url, 'https://api.kit.com/v4/tags/77/subscribers');
  assert.equal(kit.headers['X-Kit-Api-Key'], 'kit_test');
  assert.deepEqual(kit.body, { email_address: 'ana@example.com' });

  const [query, update] = apis.calls.filter(c => c.url.includes('notion.com'));
  assert.equal(query.url, 'https://api.notion.com/v1/databases/db123/query');
  assert.equal(query.headers.Authorization, 'Bearer secret_test');
  assert.deepEqual(query.body, {
    filter: { property: 'Email', email: { equals: 'ana@example.com' } },
    sorts: [{ property: 'Applied', direction: 'descending' }],
    page_size: 1,
  });
  assert.equal(update.url, 'https://api.notion.com/v1/pages/page1');
  assert.equal(update.method, 'PATCH');
  assert.deepEqual(update.body, { properties: { Status: { select: { name: 'Call booked' } } } });
});

test('someone who booked without applying (not in Kit, no Notion row) is acknowledged and not added anywhere', async () => {
  const apis = fakeApis({ kit: 404, rows: [] });
  const res = await run(BOOKING, apis);
  assert.equal(res.status, 200);
  assert.deepEqual(apis.calls.filter(c => c.url.includes('kit.com')).map(c => c.url), ['https://api.kit.com/v4/tags/77/subscribers']);
  assert.ok(!apis.calls.some(c => c.method === 'PATCH'));
});

test('other events and other event types are acknowledged and ignored', async () => {
  for (const body of [
    { ...BOOKING, event: 'invitee.canceled' },
    { ...BOOKING, payload: { ...BOOKING.payload, scheduled_event: { event_type: 'https://api.calendly.com/event_types/other' } } },
    { ...BOOKING, payload: { ...BOOKING.payload, email: '' } },
  ]) {
    const apis = fakeApis();
    const res = await run(body, apis);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, ignored: true });
    assert.equal(apis.calls.length, 0);
  }
});

test('a missing, wrong, or stale signature is rejected before anything is saved', async () => {
  const raw = JSON.stringify(BOOKING);
  for (const signature of ['', 'nonsense', sign(raw, NOW / 1000, 'wrong_key'), sign(raw, NOW / 1000 - 600), sign('{"other":1}')]) {
    const apis = fakeApis();
    const res = await run(raw, apis, { signature });
    assert.equal(res.status, 401, signature);
    assert.equal(apis.calls.length, 0);
  }
});

test('verifySignature accepts a fresh signature for the exact body', () => {
  const raw = '{"a":1}';
  assert.equal(verifySignature(sign(raw), raw, KEY, NOW), true);
  assert.equal(verifySignature(sign(raw), `${raw} `, KEY, NOW), false);
});

test('if either save fails it answers 502 so Calendly retries', async () => {
  assert.equal((await run(BOOKING, fakeApis({ kit: 500 }))).status, 502);
  assert.equal((await run(BOOKING, fakeApis({ notion: 500 }))).status, 502);
  assert.equal((await run(BOOKING, fakeApis({ kit: 500, notion: 500 }))).status, 502);
});

test('missing env vars answer 500 without calling anything', async () => {
  const apis = fakeApis();
  const res = await run(BOOKING, apis, { env: { ...ENV, KIT_TAG_DISCOVERY_BOOKED: '' } });
  assert.equal(res.status, 500);
  assert.equal(apis.calls.length, 0);
});

test('a signed body that is not JSON answers 400', async () => {
  assert.equal((await run('not json', fakeApis())).status, 400);
});
