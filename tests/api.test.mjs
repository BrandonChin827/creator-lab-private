import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleSubscribe, handleQualify, makeToken, verifyToken } from '../api/_lead.mjs';

const ENV = { KIT_API_KEY: 'kit_test', KIT_FORM_ID: '123', LEAD_TOKEN_SECRET: 'shh' };
const NOW = 1_800_000_000_000;

// A fake Kit that records each call and answers with `status`.
function fakeKit(status = 201) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ path: url.replace('https://api.kit.com/v4', ''), key: init.headers['X-Kit-Api-Key'], body: JSON.parse(init.body) });
    return new Response('{}', { status });
  };
  return { calls, fetch };
}

const post = body => new Request('http://x/api', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const SIGNUP = {
  firstName: ' Ana ', lastName: 'Diaz', email: ' ana@example.com ',
  utm: { source: 'youtube', medium: '', campaign: 'launch', term: 'x' },
  page: 'https://portlockcreative.com/youtube-idea-skill/',
};

test('subscribe saves the subscriber, adds them to the form, and returns a working token', async () => {
  const kit = fakeKit();
  const res = await handleSubscribe(post(SIGNUP), { env: ENV, fetch: kit.fetch, now: NOW });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(verifyToken(data.token, 'ana@example.com', 'shh', NOW));

  assert.deepEqual(kit.calls.map(c => c.path), ['/subscribers', '/forms/123/subscribers']);
  assert.ok(kit.calls.every(c => c.key === 'kit_test'));
  assert.deepEqual(kit.calls[0].body, {
    email_address: 'ana@example.com',
    first_name: 'Ana',
    fields: { last_name: 'Diaz', utm_source: 'youtube', utm_campaign: 'launch' }, // empty UTMs left out
  });
  assert.deepEqual(kit.calls[1].body, {
    email_address: 'ana@example.com',
    referrer: 'https://portlockcreative.com/youtube-idea-skill/?utm_source=youtube&utm_campaign=launch&utm_term=x',
  });
});

test('subscribe rejects bad input without calling Kit', async () => {
  for (const body of ['not json', { ...SIGNUP, email: 'nope' }, { ...SIGNUP, firstName: '' }, { ...SIGNUP, lastName: ' ' }]) {
    const kit = fakeKit();
    const res = await handleSubscribe(post(body), { env: ENV, fetch: kit.fetch });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(kit.calls.length, 0);
  }
});

test('subscribe ignores a page value that is not a web URL', async () => {
  const kit = fakeKit();
  await handleSubscribe(post({ ...SIGNUP, page: 'javascript:alert(1)' }), { env: ENV, fetch: kit.fetch });
  assert.equal(kit.calls[1].body.referrer, undefined);
});

test('subscribe reports failure when Kit errors, and when env vars are missing', async () => {
  const res = await handleSubscribe(post(SIGNUP), { env: ENV, fetch: fakeKit(500).fetch });
  assert.equal(res.status, 502);
  assert.equal((await res.json()).ok, false);

  const kit = fakeKit();
  const noKey = await handleSubscribe(post(SIGNUP), { env: { ...ENV, KIT_API_KEY: '' }, fetch: kit.fetch });
  assert.equal(noKey.status, 500);
  assert.equal(kit.calls.length, 0);
});

test('tokens only work for the same email and expire after an hour', () => {
  const token = makeToken('Ana@Example.com', 'shh', NOW);
  assert.ok(verifyToken(token, 'ana@example.com', 'shh', NOW + 59 * 60_000));
  assert.equal(verifyToken(token, 'ana@example.com', 'shh', NOW + 61 * 60_000), false);
  assert.equal(verifyToken(token, 'bob@example.com', 'shh', NOW), false);
  assert.equal(verifyToken(token, 'ana@example.com', 'other-secret', NOW), false);
  for (const bad of [undefined, '', 'garbage', `${NOW + 1000}.forged`, token.split('.')[0]]) {
    assert.equal(verifyToken(bad, 'ana@example.com', 'shh', NOW), false, String(bad));
  }
});

test('qualify tags the subscriber and saves their channel', async () => {
  const kit = fakeKit(200);
  const token = makeToken('ana@example.com', 'shh', NOW);
  const res = await handleQualify(
    post({ email: 'ana@example.com', token, answers: { youtube: 'posting', role: 'founder', channel: '  @ana ' } }),
    { env: ENV, fetch: kit.fetch, now: NOW },
  );
  assert.equal(res.status, 200);
  assert.deepEqual(kit.calls.map(c => [c.path, c.body]), [
    ['/tags/24106267/subscribers', { email_address: 'ana@example.com' }],
    ['/tags/24106270/subscribers', { email_address: 'ana@example.com' }],
    ['/subscribers', { email_address: 'ana@example.com', fields: { youtube_channel: '@ana' } }],
  ]);
});

test('qualify ignores answers that are not on the menu', async () => {
  const kit = fakeKit(200);
  const token = makeToken('ana@example.com', 'shh', NOW);
  await handleQualify(
    post({ email: 'ana@example.com', token, answers: { youtube: 'hacker', role: 'toString', extra: 'x' } }),
    { env: ENV, fetch: kit.fetch, now: NOW },
  );
  assert.equal(kit.calls.length, 0);
});

test('qualify refuses a missing, forged, or someone-else token', async () => {
  const bobToken = makeToken('bob@example.com', 'shh', NOW);
  for (const token of [undefined, 'forged', bobToken]) {
    const kit = fakeKit(200);
    const res = await handleQualify(
      post({ email: 'ana@example.com', token, answers: { role: 'agency' } }),
      { env: ENV, fetch: kit.fetch, now: NOW },
    );
    assert.equal(res.status, 401);
    assert.equal(kit.calls.length, 0);
  }
});
