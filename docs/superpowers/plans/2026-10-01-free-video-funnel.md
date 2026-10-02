# Free $1,000 YouTube Video Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/free-video/`, an application page where qualified founders and coaches apply for a free $1,000 YouTube video and content plan. Each application goes to Notion and Kit, and qualified applicants book a 15 min Calendly call on `/free-video/next/`.

**Architecture:** Static HTML pages styled with the homepage's `/assets/site.css` + `/assets/site.js`, plus a small `free-video.css`. A browser module runs the 8-step form and sends one `POST /api/apply`. A Vercel function (`api/apply.mjs` → `api/_apply.mjs`) writes the application to Notion (it must succeed) and to Kit (best effort), and returns whether the applicant qualifies. Rules shared by the browser and the server live in `free-video/apply-core.mjs`.

**Tech Stack:** Plain HTML/CSS/ES modules, Vercel Node functions (Web `Request`/`Response`), Notion REST API (`Notion-Version: 2022-06-28`), Kit v4 API, Calendly inline embed, ClickLedger snippet, `node:test` + Playwright 1.63 (in `tests/`).

**Spec:** `docs/superpowers/specs/2026-10-01-free-video-funnel-design.md`

## Global Constraints

- Separate from the skill funnel: never use Kit form 9977225. Don't change `/api/subscribe`, `/api/qualify`, or the `youtube-idea-skill/` pages.
- No invented proof: the only claims are "7 figures" (generated through my personal brand) and "300k+" (followers across platforms). No portfolio, testimonials, or client results.
- Headline, word for word, on two lines: `Get a $1,000 YouTube Video` / `& Content Plan for Free` (second line in the gradient `<em>`; "for Free" never wraps apart).
- Copy style: write "15 min call", with no hyphen and no em dashes in page copy.
- Calendly event: `https://calendly.com/bentoboi/youtube-vide-strategy-consultation` (15 min).
- ClickLedger snippet: `<script src="https://www.clickledger.io/track.js" data-token="cmt0v4wd90001la04k78fpg3j" defer></script>`, on both pages.
- Qualification: business = yes AND offer = yes AND camera ≠ no AND budget ≥ $1,000.
- Text caps: niche 200, channel 200, why 1,000; names 60 (existing validators).
- Each Kit/Notion call times out at 5s; the browser waits up to 15s.
- Secrets live only in `.env.local` (gitignored by `.env*`) and Vercel. Never print, echo, or commit `NOTION_TOKEN` or `KIT_API_KEY`. The Kit key is read with `security find-generic-password -a "$USER" -s KIT_API_KEY -w`.
- Mobile-first, 320–1440px, no horizontal overflow; no console errors from our own code.
- Pushing to `main` deploys portlockcreative.com. Work stays on this branch. Never push, merge, or change Vercel, Kit, or Notion settings without asking Brandon first.
- Ask Brandon before every commit (his global rule). The "Commit" steps below mean: show the diff summary, ask, then commit.

## Review Focus

1. **A budget label with a comma** ("Under $1,000") is rejected by Notion's API, so every application would 502. Every label stored in Notion must be comma-free (Task 1 test).
2. **A choice sent as an array or number** (`budget: ['1k']`) slips through `Object.hasOwn`, which converts it to a string, and lands in Notion as junk. Only exact string values are accepted (Task 1 test).
3. **Double-clicking Submit** creates two Notion rows. Only one request is ever sent (Task 5 test).
4. **Reloading the thank-you page** should keep the calendar for a qualified applicant instead of bouncing them back to the form (Task 6 test).
5. **A name containing HTML** must show as text on the thank-you page, never run as markup (Task 6 test).

---

## File Structure

| File | Responsibility |
|---|---|
| `free-video/apply-core.mjs` (new) | Pure rules shared by browser and server: answer choices, qualification, cleaning an application, the result storage key, the Calendly URL |
| `api/_apply.mjs` (new) | `handleApply`: validate → Notion + Kit → `{ ok, qualified }` |
| `api/apply.mjs` (new) | Vercel route wrapper |
| `dev-server.mjs` (modify) | `/api/apply` mock (or live with `NOTION_TOKEN`) |
| `assets/site.js` (modify) | Guard `.hero` / `.closing` lookups so pages without them don't throw |
| `free-video/free-video.css` (new) | Styles for both free-video pages on top of `site.css` |
| `free-video/index.html` (new) | Landing page |
| `free-video/apply.mjs` (new) | 8-step form behaviour and submit |
| `free-video/next/index.html` (new) | Thank-you page |
| `free-video/next/next.mjs` (new) | Thank-you page logic (outcome + Calendly) |
| `privacy/index.html` (modify) | Mention Notion and the application answers |
| `tests/apply-core.test.mjs` (new) | Unit tests for apply-core |
| `tests/apply-api.test.mjs` (new) | Unit tests for handleApply |
| `tests/free-video.e2e.test.mjs` (new) | Browser tests for both pages |

Run every test with `cd tests && npm test` (it runs `node --test 'tests/*.test.mjs'` from the repo root). The baseline is 61 passing.

---

### Task 1: Shared application rules (`apply-core.mjs`)

**Files:**
- Create: `free-video/apply-core.mjs`
- Test: `tests/apply-core.test.mjs`

**Interfaces:**
- Consumes: `validateFirstName`, `validateLastName`, `validateEmail`, `UTM_KEYS` from `youtube-idea-skill/lead-core.mjs` (imported with the relative path `../youtube-idea-skill/lead-core.mjs` so the same file works in Node and the browser).
- Produces:
  - `CHOICES: { youtube, business, offer, camera, budget }`, each `{ [value: string]: label: string }`
  - `LIMITS = { niche: 200, channel: 200, why: 1000 }`
  - `RESULT_KEY = 'portlock.freeVideo'`
  - `CALENDLY_URL: string`
  - `isQualified(answers: object) → boolean`
  - `validateNiche(value) → string | null`
  - `cleanApplication(body: unknown) → App | null`, where `App = { firstName, lastName, email, youtube, business, offer, camera, budget, niche, channel, why, ckid, utm: { source?, medium?, campaign?, content?, term? } }`
  - `calendlyUrl({ firstName, lastName, email }) → string`
  - `readResult(raw: string | null) → { firstName, lastName, email, qualified } | null`

- [ ] **Step 1: Write the failing tests**

Create `tests/apply-core.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHOICES, LIMITS, RESULT_KEY, CALENDLY_URL, isQualified, validateNiche, cleanApplication, calendlyUrl, readResult,
} from '../free-video/apply-core.mjs';

const GOOD = {
  firstName: ' Ana ', lastName: ' Diaz ', email: ' ana@example.com ',
  youtube: 'zero', business: 'yes', offer: 'yes', camera: 'unsure', budget: '1k',
  niche: ' Fitness coaching ', channel: ' @anafit ', why: ' Want to grow ', ckid: ' vis_1 ',
  utm: { source: ' youtube ', medium: '', campaign: 'oct', content: 'video-7', term: 7 },
};

test('qualifies only with revenue, an offer, willing to film, and $1,000+ budget', () => {
  const base = { business: 'yes', offer: 'yes', camera: 'yes', budget: '1k' };
  assert.equal(isQualified(base), true);
  assert.equal(isQualified({ ...base, camera: 'unsure' }), true);
  for (const budget of ['2500', '5k']) assert.equal(isQualified({ ...base, budget }), true, budget);
  assert.equal(isQualified({ ...base, business: 'no' }), false);
  assert.equal(isQualified({ ...base, offer: 'no' }), false);
  assert.equal(isQualified({ ...base, camera: 'no' }), false);
  assert.equal(isQualified({ ...base, budget: 'under1k' }), false);
  assert.equal(isQualified({ ...base, budget: 'lots' }), false);
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
    youtube: 'zero', business: 'yes', offer: 'yes', camera: 'unsure', budget: '1k',
    niche: 'Fitness coaching', channel: '@anafit', why: 'Want to grow', ckid: 'vis_1',
    utm: { source: 'youtube', campaign: 'oct', content: 'video-7' },
  });
});

test('cleanApplication caps the free-text answers', () => {
  const app = cleanApplication({ ...GOOD, niche: 'n'.repeat(500), channel: 'c'.repeat(500), why: 'w'.repeat(5000), ckid: 'k'.repeat(500) });
  assert.equal(app.niche.length, LIMITS.niche);
  assert.equal(app.channel.length, LIMITS.channel);
  assert.equal(app.why.length, LIMITS.why);
  assert.equal(app.ckid.length, 100);
});

test('cleanApplication treats optional answers as optional', () => {
  const app = cleanApplication({ ...GOOD, channel: undefined, why: 42, ckid: null, utm: 'nope' });
  assert.equal(app.channel, '');
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
    { ...GOOD, budget: ['1k'] }, { ...GOOD, offer: { toString: () => 'yes' } }, // only exact strings
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd tests && node --test ../tests/apply-core.test.mjs`
Expected: FAIL with `Cannot find module '.../free-video/apply-core.mjs'`

- [ ] **Step 3: Write the implementation**

Create `free-video/apply-core.mjs`:

```js
// Rules for the Free Video application, shared by the page and the /api/apply function:
// the allowed answers, who qualifies, and cleaning a submitted application.
// No DOM access, so it also runs under node:test.
import { validateFirstName, validateLastName, validateEmail, UTM_KEYS } from '../youtube-idea-skill/lead-core.mjs';

export const RESULT_KEY = 'portlock.freeVideo';
export const CALENDLY_URL = 'https://calendly.com/bentoboi/youtube-vide-strategy-consultation';
export const LIMITS = { niche: 200, channel: 200, why: 1000 };
const MAX_CKID = 100;
const MAX_UTM = 200;

// Value the form sends → label saved in Notion. Notion rejects commas in select
// options, so labels never contain one.
export const CHOICES = {
  youtube: { zero: 'Starting from zero', stagnant: 'Grew but stagnant', other: 'Other' },
  business: { yes: 'Yes', no: 'Not yet' },
  offer: { yes: 'Yes', no: 'Not yet' },
  camera: { yes: 'Yes', no: 'No', unsure: 'Unsure' },
  budget: { under1k: 'Under $1k', '1k': '$1k–$2.5k', '2500': '$2.5k–$5k', '5k': '$5k+' },
};

const isChoice = (field, value) => typeof value === 'string' && Object.hasOwn(CHOICES[field], value);

export function isQualified(answers) {
  return answers.business === 'yes'
    && answers.offer === 'yes'
    && isChoice('camera', answers.camera) && answers.camera !== 'no'
    && isChoice('budget', answers.budget) && answers.budget !== 'under1k';
}

export function validateNiche(value) {
  return String(value ?? '').trim() ? null : 'Please tell us your niche.';
}

const text = (value, max = Infinity) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

// The cleaned application, or null when a required answer is missing or invalid.
export function cleanApplication(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const firstName = text(body.firstName);
  const lastName = text(body.lastName);
  const email = text(body.email);
  if (validateFirstName(firstName) || validateLastName(lastName) || validateEmail(email)) return null;
  if (validateNiche(body.niche)) return null;
  for (const field of Object.keys(CHOICES)) if (!isChoice(field, body[field])) return null;

  const rawUtm = body.utm && typeof body.utm === 'object' ? body.utm : {};
  const utm = {};
  for (const key of UTM_KEYS) {
    const value = text(rawUtm[key], MAX_UTM);
    if (value) utm[key] = value;
  }
  return {
    firstName, lastName, email,
    youtube: body.youtube, business: body.business, offer: body.offer, camera: body.camera, budget: body.budget,
    niche: text(body.niche, LIMITS.niche),
    channel: text(body.channel, LIMITS.channel),
    why: text(body.why, LIMITS.why),
    ckid: text(body.ckid, MAX_CKID),
    utm,
  };
}

// Calendly inline embed URL: name and email filled in, colours matched to the page.
export function calendlyUrl({ firstName = '', lastName = '', email = '' }) {
  const url = new URL(CALENDLY_URL);
  url.searchParams.set('name', `${firstName} ${lastName}`.trim());
  if (email) url.searchParams.set('email', email);
  url.searchParams.set('hide_gdpr_banner', '1');
  url.searchParams.set('background_color', '0b0b0e');
  url.searchParams.set('text_color', 'f4f1eb');
  url.searchParams.set('primary_color', 'ff7a1a');
  return url.toString();
}

// The result the form saves for the thank-you page, or null if missing or malformed.
export function readResult(raw) {
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object' && typeof value.firstName === 'string' && typeof value.qualified === 'boolean') {
      return {
        firstName: value.firstName,
        lastName: typeof value.lastName === 'string' ? value.lastName : '',
        email: typeof value.email === 'string' ? value.email : '',
        qualified: value.qualified,
      };
    }
  } catch {}
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd tests && node --test ../tests/apply-core.test.mjs`
Expected: all 10 tests PASS.

- [ ] **Step 5: Commit (ask Brandon first)**

```bash
git add free-video/apply-core.mjs tests/apply-core.test.mjs
git commit -m "feat: add the Free Video application rules (choices, qualification, cleaning)"
```

---

### Task 2: The `/api/apply` function (Notion + Kit)

**Files:**
- Create: `api/_apply.mjs`, `api/apply.mjs`
- Test: `tests/apply-api.test.mjs`

**Interfaces:**
- Consumes: `cleanApplication`, `isQualified`, `CHOICES` from `free-video/apply-core.mjs` (Task 1).
- Produces:
  - `handleApply(request: Request, { env?, fetch?, now? }) → Promise<Response>`. The response JSON is `{ ok: true, qualified: boolean }` (200), or `{ ok: false }` with 400 (bad input), 500 (missing env), or 502 (Notion failed).
  - `notionProperties(app, qualified: boolean, now: number, ownerId?: string) → object`
  - Required env: `NOTION_TOKEN`, `NOTION_APPLICATIONS_DB`, `KIT_API_KEY`, `KIT_TAG_APPLICANT`, `KIT_TAG_QUALIFIED`. Optional: `NOTION_OWNER_ID`.

- [ ] **Step 1: Write the failing tests**

Create `tests/apply-api.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd tests && node --test ../tests/apply-api.test.mjs`
Expected: FAIL with `Cannot find module '.../api/_apply.mjs'`

- [ ] **Step 3: Write the implementation**

Create `api/_apply.mjs`:

```js
// Server side of the Free Video application: saves each application to Notion (the
// main record) and Kit (so we can email them), then tells the page whether the
// applicant qualifies. The dev server and tests call handleApply directly.
// Files starting with "_" in api/ are not turned into routes by Vercel.
import { cleanApplication, isQualified, CHOICES } from '../free-video/apply-core.mjs';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const KIT_API = 'https://api.kit.com/v4';
const MAX_BODY = 10_000;
// Kit makes two calls in a row (subscriber, then tags) alongside one Notion call,
// so 2 × 5s stays inside the browser's 15s wait.
const TIMEOUT_MS = 5000;
const REQUIRED_ENV = ['NOTION_TOKEN', 'NOTION_APPLICATIONS_DB', 'KIT_API_KEY', 'KIT_TAG_APPLICANT', 'KIT_TAG_QUALIFIED'];

const json = (status, body) => Response.json(body, { status });

async function readJson(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return null;
  try {
    const body = JSON.parse(raw);
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

async function postJson(fetchImpl, url, headers, body) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

const richText = value => ({ rich_text: value ? [{ text: { content: value } }] : [] });
const select = name => ({ select: { name } });

// One row in the "Free Video Applications" database.
export function notionProperties(app, qualified, now, ownerId) {
  const properties = {
    Name: { title: [{ text: { content: `${app.firstName} ${app.lastName}` } }] },
    Email: { email: app.email },
    Status: select('New'),
    Qualified: { checkbox: qualified },
    'YouTube experience': select(CHOICES.youtube[app.youtube]),
    'Revenue business': select(CHOICES.business[app.business]),
    'Has offer': select(CHOICES.offer[app.offer]),
    'On camera': select(CHOICES.camera[app.camera]),
    Budget: select(CHOICES.budget[app.budget]),
    Niche: richText(app.niche),
    Channel: richText(app.channel),
    Why: richText(app.why),
    'ClickLedger ID': richText(app.ckid),
    'UTM source': richText(app.utm.source),
    'UTM campaign': richText(app.utm.campaign),
    'UTM content': richText(app.utm.content),
    Applied: { date: { start: new Date(now).toISOString() } },
  };
  if (ownerId) properties.Owner = { people: [{ id: ownerId }] };
  return properties;
}

function saveToNotion(app, qualified, env, fetchImpl, now) {
  return postJson(fetchImpl, `${NOTION_API}/pages`,
    { Authorization: `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION },
    { parent: { database_id: env.NOTION_APPLICATIONS_DB }, properties: notionProperties(app, qualified, now, env.NOTION_OWNER_ID) });
}

// Create or update the subscriber, then tag them. No form, so no skill email.
async function saveToKit(app, qualified, env, fetchImpl) {
  const headers = { 'X-Kit-Api-Key': env.KIT_API_KEY };
  const fields = { last_name: app.lastName };
  if (app.channel) fields.youtube_channel = app.channel;
  for (const key of ['source', 'medium', 'campaign', 'content']) {
    if (app.utm[key]) fields[`utm_${key}`] = app.utm[key];
  }
  await postJson(fetchImpl, `${KIT_API}/subscribers`, headers, { email_address: app.email, first_name: app.firstName, fields });
  const tags = qualified ? [env.KIT_TAG_APPLICANT, env.KIT_TAG_QUALIFIED] : [env.KIT_TAG_APPLICANT];
  await Promise.all(tags.map(id => postJson(fetchImpl, `${KIT_API}/tags/${id}/subscribers`, headers, { email_address: app.email })));
}

// ---------- POST /api/apply ----------

export async function handleApply(request, { env = process.env, fetch: fetchImpl = fetch, now = Date.now() } = {}) {
  const missing = REQUIRED_ENV.filter(key => !env[key]);
  if (missing.length) {
    console.error(`Apply API is missing env vars: ${missing.join(', ')}`);
    return json(500, { ok: false });
  }
  const body = await readJson(request);
  if (!body) return json(400, { ok: false });
  if (body.hp) return json(200, { ok: true, qualified: false }); // honeypot: only bots fill it
  const app = cleanApplication(body);
  if (!app) return json(400, { ok: false });
  const qualified = isQualified(app);

  const [notion, kit] = await Promise.allSettled([
    saveToNotion(app, qualified, env, fetchImpl, now),
    saveToKit(app, qualified, env, fetchImpl),
  ]);
  if (kit.status === 'rejected') console.error(kit.reason);
  if (notion.status === 'rejected') {
    console.error(notion.reason);
    return json(502, { ok: false });
  }
  return json(200, { ok: true, qualified });
}
```

Create `api/apply.mjs`:

```js
// POST /api/apply: saves a Free Video application to Notion and Kit.
import { handleApply } from './_apply.mjs';

export const POST = request => handleApply(request);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd tests && node --test ../tests/apply-api.test.mjs`
Expected: all 9 tests PASS. The "Kit failure" and "Notion failure" tests print a logged error, which is expected.

- [ ] **Step 5: Run the whole suite**

Run: `cd tests && npm test`
Expected: 80 pass (61 + 10 + 9), 0 fail.

- [ ] **Step 6: Commit (ask Brandon first)**

```bash
git add api/_apply.mjs api/apply.mjs tests/apply-api.test.mjs
git commit -m "feat: add /api/apply, saving Free Video applications to Notion and Kit"
```

---

### Task 3: Dev server route + `site.js` guard

**Files:**
- Modify: `dev-server.mjs` (add an `/api/apply` block just above the `if (pathname === '/api/subscribe' || pathname === '/api/qualify')` block, and update the startup log)
- Modify: `assets/site.js` (line 3, the two `IntersectionObserver(...).observe(...)` calls)
- Test: `tests/free-video.e2e.test.mjs` (created here, extended in Tasks 4–6)

**Interfaces:**
- Consumes: `handleApply` (Task 2), `isQualified` (Task 1).
- Produces: a local `POST /api/apply`. With `NOTION_TOKEN` set it runs the real handler. Otherwise it's a mock that returns `{ ok: true, qualified: isQualified(payload) }`, or 500 for `fail@example.com`. `site.js` no longer throws on pages without `.hero` or `.closing`.

- [ ] **Step 1: Write the failing test**

Create `tests/free-video.e2e.test.mjs`:

```js
// End-to-end tests for the Free Video funnel (/free-video/ and /free-video/next/).
// Boots the local dev server, whose /api/apply is a mock, and drives Chromium.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 4198;
const BASE = `http://localhost:${PORT}`;
const LANDING = `${BASE}/free-video/`;
const NEXT = `${BASE}/free-video/next/`;
const SIZES = { mobile: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };
// Third-party scripts are blocked in tests; only our own errors count.
const ownErrors = errors => errors.filter(e => !/clickledger|calendly|Failed to load resource/i.test(e));

let server, browser;

before(async () => {
  // NOTION_TOKEN is blanked so the suite always uses the mock and never writes to Notion or Kit.
  server = spawn(process.execPath, ['dev-server.mjs', String(PORT)], {
    cwd: ROOT, stdio: 'ignore', env: { ...process.env, NOTION_TOKEN: '', KIT_API_KEY: '' },
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE); break; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.kill();
});

const post = body => fetch(`${BASE}/api/apply`, { method: 'POST', body: JSON.stringify(body) });
const QUALIFIED = { firstName: 'Ana', lastName: 'Diaz', email: 'ana@example.com', business: 'yes', offer: 'yes', camera: 'yes', budget: '1k' };

test('dev /api/apply mock answers qualified, not qualified, and forced failure', async () => {
  assert.deepEqual(await (await post(QUALIFIED)).json(), { ok: true, qualified: true });
  assert.deepEqual(await (await post({ ...QUALIFIED, budget: 'under1k' })).json(), { ok: true, qualified: false });
  const failed = await post({ ...QUALIFIED, email: 'fail@example.com' });
  assert.equal(failed.status, 500);
  assert.equal((await fetch(`${BASE}/api/apply`)).status, 405);
});

test('homepage still loads without errors after the site.js guard', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/`);
  assert.deepEqual(errors, []);
  await context.close();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd tests && node --test ../tests/free-video.e2e.test.mjs`
Expected: the mock test FAILS (the static server answers `/api/apply` with 404 and non-JSON). The homepage test passes.

- [ ] **Step 3: Add the dev-server route**

In `dev-server.mjs`, insert this block directly above the comment `// Lead-magnet signup and its optional qualifier answers.`:

```js
  // Free Video application. With NOTION_TOKEN set (`node --env-file=.env.local dev-server.mjs`)
  // it runs the real api/ handler against Notion and Kit. Otherwise it's a mock that logs the
  // payload, answers with the real qualification rule, and returns 500 for `fail@example.com`.
  if (pathname === '/api/apply') {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' }).end('{"ok":false}');
      return;
    }
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 10_000) break;
    }
    if (process.env.NOTION_TOKEN) {
      const { handleApply } = await import('./api/_apply.mjs');
      const response = await handleApply(new Request(`http://localhost${pathname}`, { method: 'POST', body: raw }));
      const text = await response.text();
      console.log(`  ✉ apply → Notion/Kit ${response.status} ${text}`);
      res.writeHead(response.status, { 'Content-Type': 'application/json' }).end(text);
      return;
    }
    let payload;
    try { payload = JSON.parse(raw); } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' }).end('{"ok":false}');
      return;
    }
    const { isQualified } = await import('./free-video/apply-core.mjs');
    const failed = payload?.email === 'fail@example.com';
    console.log(`  ✉ apply ${failed ? '(forced failure) ' : ''}${JSON.stringify(payload)}`);
    res.writeHead(failed ? 500 : 200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify(failed ? { ok: false } : { ok: true, qualified: isQualified(payload) }));
    return;
  }

```

In the `server.listen` callback, under the existing `Signup API:` line, add:

```js
  console.log(`  Apply API:  ${process.env.NOTION_TOKEN ? 'LIVE — applications go to Notion and Kit' : 'mock (no Notion)'}\n`);
```

- [ ] **Step 4: Guard `site.js`**

In `assets/site.js`, replace exactly:

```js
new IntersectionObserver(([e])=>{heroVisible=e.isIntersecting;syncViewportState()},{threshold:.05}).observe(hero);new IntersectionObserver(([e])=>{closingVisible=e.isIntersecting;syncViewportState()},{threshold:.15}).observe(closingSection)
```

with:

```js
if(hero)new IntersectionObserver(([e])=>{heroVisible=e.isIntersecting;syncViewportState()},{threshold:.05}).observe(hero);if(closingSection)new IntersectionObserver(([e])=>{closingVisible=e.isIntersecting;syncViewportState()},{threshold:.15}).observe(closingSection)
```

Also change the first comment line to `// Shared UI for the Portlock sales pages (homepage, the skill thank-you page, and the Free Video pages).`

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd tests && npm test`
Expected: 82 pass, 0 fail (the existing homepage and access-page e2e tests confirm `site.js` still works).

- [ ] **Step 6: Commit (ask Brandon first)**

```bash
git add dev-server.mjs assets/site.js tests/free-video.e2e.test.mjs
git commit -m "feat: add a dev /api/apply route and let site.js run on pages without a closing section"
```

---

### Task 4: Landing page (static content and styles)

**Files:**
- Create: `free-video/index.html`, `free-video/free-video.css`
- Test: `tests/free-video.e2e.test.mjs` (append)

**Interfaces:**
- Consumes: `/assets/site.css`, `/assets/site.js` (Task 3 guard).
- Produces: form markup that Task 5 wires up, with ids `apply-form`, `firstName`, `lastName`, `email`, `niche`, `channel`, `why`, `submit`, `form-err`, and error paragraphs `<id>-err`. Each step is `.step[data-step="1..8"]`. Choice buttons are `.choice[data-field][data-value]`, back buttons are `.back`, and the honeypot is `input[name="hp_x"]`. CSS classes `.cal` and `.hero-sub` are used by Task 6.

- [ ] **Step 1: Write the failing tests**

Append to `tests/free-video.e2e.test.mjs`:

```js
// A fresh page with third-party scripts blocked, recording errors and /api/apply requests.
async function open(url, { size = SIZES.desktop, init } = {}) {
  const context = await browser.newContext({ viewport: size });
  context.setDefaultTimeout(5000);
  await context.route(/clickledger\.io|calendly\.com/, route => route.abort());
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  const applies = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.url().endsWith('/api/apply')) applies.push(r); });
  await page.goto(url);
  return { page, context, errors, applies };
}

const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const [label, size] of Object.entries(SIZES)) {
  test(`landing loads cleanly on ${label} with no overflow`, async () => {
    const { page, context, errors } = await open(LANDING, { size });
    assert.equal(await page.locator('h1').innerText(), 'Get a $1,000 YouTube Video\n& Content Plan for Free');
    assert.ok(await page.locator('#firstName').isVisible());
    assert.equal(await overflow(page), 0);
    assert.deepEqual(ownErrors(errors), []);
    await context.close();
  });
}

test('landing has the how-it-works steps, the two real stats, and six FAQs', async () => {
  const { page, context } = await open(LANDING);
  assert.deepEqual(await page.locator('.ts h3').allInnerTexts(),
    ['Quick 15 min call', 'Strategy & content blueprint', 'You film', 'Video reveal']);
  assert.deepEqual(await page.locator('.stat b').allInnerTexts(), ['7 figures', '300k+']);
  assert.equal(await page.locator('.faq-item').count(), 6);
  assert.equal(await page.locator('.faq-item.open').count(), 1);
  await page.locator('.faq-q').nth(2).click();
  assert.ok(await page.locator('.faq-item').nth(2).evaluate(e => e.classList.contains('open')));
  assert.match(await page.locator('#fa1').innerText(), /3 to 7 days/);
  await context.close();
});

test('See If You Qualify jumps to the form', async () => {
  const { page, context } = await open(LANDING);
  assert.equal(await page.locator('.hero .btn-primary').getAttribute('href'), '#apply');
  assert.equal(await page.locator('#apply #apply-form').count(), 1);
  await context.close();
});

test('landing carries the ClickLedger snippet, links Privacy and Terms, and is indexable', async () => {
  const { page, context } = await open(LANDING);
  assert.equal(await page.locator('script[src="https://www.clickledger.io/track.js"]').getAttribute('data-token'), 'cmt0v4wd90001la04k78fpg3j');
  for (const path of ['/privacy', '/terms']) assert.ok(await page.locator(`a[href="${path}"]`).count() > 0, path);
  assert.equal(await page.locator('meta[name="robots"]').count(), 0);
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://portlockcreative.com/free-video/');
  await context.close();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd tests && node --test ../tests/free-video.e2e.test.mjs`
Expected: the new landing tests FAIL (404, no `h1`).

- [ ] **Step 3: Create `free-video/free-video.css`**

```css
/* Free Video pages: extras on top of the homepage styles (/assets/site.css). */
.hero{padding-bottom:40px}
.hero h1{max-width:none}
.hero h1 .nw{white-space:nowrap}
.hero-sub{max-width:640px;margin:22px auto 0;color:var(--muted);font-size:clamp(17px,2vw,19px);line-height:1.6}

/* Application card (form styles from the skill page, with the homepage button) */
.apply{padding-top:20px}
.card{position:relative;max-width:600px;margin:0 auto;padding:34px 32px 26px;border-radius:18px;background:linear-gradient(180deg,#131217,#0b0b0e);text-align:left;box-shadow:0 30px 80px rgba(0,0,0,.55)}
.card:before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;background:linear-gradient(140deg,rgba(255,152,74,.8),rgba(172,124,246,.7));-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;pointer-events:none}
.progress{height:3px;margin:0 0 14px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden}
.progress i{display:block;height:100%;width:var(--pct,12.5%);border-radius:inherit;background:linear-gradient(90deg,#ff984a,#ac7cf6);transition:width .35s ease}
.stepnum{font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#8b878e}
.card h2{margin:6px 0 20px;font:650 28px/1.2 var(--display);letter-spacing:-.02em}
.card h2[tabindex]:focus{outline:none}
.card h2 label{display:block}
.names{display:grid;gap:12px}
.card input,.card textarea{width:100%;padding:0 20px;border:1px solid rgba(255,255,255,.18);border-radius:12px;background:rgba(255,255,255,.05);color:var(--ink);font-size:19px;transition:border-color .2s}
.card input{height:66px}
.card textarea{min-height:110px;padding-block:16px;font-size:17px;resize:vertical}
.card input::placeholder,.card textarea::placeholder{color:#7a767d;letter-spacing:.06em;text-transform:uppercase;font-size:15px}
.card input:focus,.card textarea:focus{border-color:rgba(195,165,255,.6);outline:none;box-shadow:0 0 0 3px rgba(139,92,246,.25)}
.card input[aria-invalid=true]{border-color:#ff7a6a}
.field-label{display:block;margin:16px 0 8px;color:#d6d1cf;font-size:14px;font-weight:600}
.field-label span{color:#8b878e;font-weight:400}
.choices{display:grid;gap:10px}
.choice{min-height:60px;padding:14px 20px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:rgba(255,255,255,.04);color:var(--ink);font-size:16px;font-weight:600;text-align:left;cursor:pointer;transition:border-color .2s,background .2s,transform .2s}
.choice:focus-visible,.choice[aria-pressed=true]{border-color:rgba(255,152,74,.6);background:rgba(255,122,26,.08)}
.choice:active{transform:scale(.99)}
@media(hover:hover){.choice:hover{border-color:rgba(255,152,74,.6);background:rgba(255,122,26,.08)}}
.err{margin:8px 0 0;color:#ff9b8a;font-size:13px;line-height:1.4}
.err:empty{margin:0}
.card .btn-primary{width:100%;margin-top:20px}
.card .btn-primary:disabled{opacity:.6;cursor:progress;transform:none}
.linkish{display:block;margin:14px auto 0;padding:4px 8px;border:0;background:none;color:var(--muted);font-size:13px;cursor:pointer}
.linkish:hover{color:var(--ink)}
.note{margin:14px 0 0;text-align:center;color:#c9c4bf;font-size:13px}
.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
.consent{max-width:620px;margin:22px auto 0;color:#8b878e;font-size:12px;line-height:1.6;text-align:center}
.consent a{color:#bdb8b4;text-decoration:underline}

/* How it works: zig-zag timeline of spotlight cards */
.tl{position:relative;max-width:900px;margin:0 auto}
.tl:before{content:"";position:absolute;left:50%;top:30px;bottom:30px;width:2px;transform:translateX(-50%);background:linear-gradient(180deg,rgba(255,152,74,.7),rgba(172,124,246,.7))}
.ts{position:relative;display:grid;grid-template-columns:1fr 80px 1fr;align-items:center;margin-bottom:24px}
.ts:last-child{margin-bottom:0}
.ts .dot{grid-column:2;grid-row:1;justify-self:center;z-index:1;display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#ff984a,#ac7cf6);font-weight:800;box-shadow:0 0 0 7px var(--bg),0 0 30px rgba(255,122,26,.4)}
.ts .deliver{grid-row:1}
.ts.l .deliver{grid-column:1}.ts.r .deliver{grid-column:3}
.ts .deliver h3{text-align:left;margin:0 0 10px}

/* Stats: homepage cards, centred and bigger. inline-block so the gradient spans the
   number itself and runs the full orange to purple. */
.stats .stat{padding:36px 30px 38px;text-align:center}
.stats .stat-icon{margin-inline:auto}
.stats .stat b{display:inline-block;margin-top:20px;font-size:clamp(48px,5vw,64px);line-height:1.15}
.stats .stat span{margin-top:6px;color:#f4f1eb;font-size:18px}

/* FAQ answers: bigger, white */
.faq-a p{color:#f4f1eb;font-size:18px}

/* Thank-you page */
.cal{min-width:320px;max-width:1000px;height:720px;margin:36px auto 0;border-radius:16px;overflow:hidden}

.foot{padding:70px 0 40px;text-align:center;color:#918c94;font-size:12px}
.foot img{height:30px;filter:drop-shadow(0 0 14px rgba(252,125,33,.28))}
.foot p{margin:14px 0 0}
.foot a{text-decoration:underline}

@media(max-width:620px){
  .card{padding:24px 18px 20px}
  .card h2{font-size:23px}
  .card input{height:60px;font-size:18px}
  .tl:before{left:21px}
  .ts{grid-template-columns:42px 1fr;gap:14px}
  .ts .dot{grid-column:1}
  .ts.l .deliver,.ts.r .deliver{grid-column:2}
  .stats .stat b{font-size:48px}
  .stats .stat span{font-size:17px}
  .faq-a p{font-size:17px}
  .cal{height:1000px}
  body{padding-bottom:0}
}
```

- [ ] **Step 4: Create `free-video/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Free $1,000 YouTube Video &amp; Content Plan | Portlock Creative</title>
<meta name="description" content="Qualified founders and coaches get a done-for-you YouTube video and content plan, free. Apply in about a minute.">
<link rel="canonical" href="https://portlockcreative.com/free-video/">
<meta property="og:type" content="website"><meta property="og:site_name" content="Portlock Creative"><meta property="og:url" content="https://portlockcreative.com/free-video/">
<meta property="og:title" content="Get a $1,000 YouTube Video & Content Plan for Free">
<meta property="og:description" content="Qualified founders and coaches get a done-for-you YouTube video and content plan, free. Apply in about a minute.">
<meta property="og:image" content="https://portlockcreative.com/assets/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#060608">
<link rel="icon" type="image/png" href="/assets/graphics/portlock-icon.png"><link rel="apple-touch-icon" href="/assets/graphics/portlock-icon.png">
<!-- ClickLedger: attributes visitors back to the video that sent them. -->
<script src="https://www.clickledger.io/track.js" data-token="cmt0v4wd90001la04k78fpg3j" defer></script>
<link rel="stylesheet" href="/assets/site.css">
<link rel="stylesheet" href="/free-video/free-video.css">
<script>document.documentElement.classList.add('js')</script>
</head>
<body>
<a class="skip" href="#apply">Skip to the application</a>
<div class="flair-layer" aria-hidden="true"><div class="flair a"></div><div class="flair c"></div></div>
<div class="logo logo-float"><img src="/assets/graphics/portlock-logo.png" alt="Portlock Creative" width="37" height="34"></div>
<svg width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute"><defs><linearGradient id="brandGrad" gradientUnits="userSpaceOnUse" x1="3" y1="21" x2="21" y2="3"><stop offset="0" stop-color="#ff984a"/><stop offset="1" stop-color="#ac7cf6"/></linearGradient></defs></svg>

<main>
<header class="hero"><div class="container">
  <h1>Get a $1,000 YouTube Video<br><em>&amp; Content Plan <span class="nw">for Free</span></em></h1>
  <div class="cta-row"><a class="btn-primary" href="#apply">See If You Qualify<span class="arrow" aria-hidden="true">→</span></a></div>
</div></header>

<section class="apply" id="apply"><div class="container">
  <form class="card reveal" id="apply-form" novalidate>
    <div class="progress" role="progressbar" aria-label="Application progress" aria-valuemin="1" aria-valuemax="8" aria-valuenow="1"><i></i></div>

    <div class="step" data-step="1">
      <div class="stepnum">Step 1 of 8</div>
      <h2 id="q1">What's your name?</h2>
      <div class="names">
        <div>
          <label class="sr-only" for="firstName">First name</label>
          <input id="firstName" name="firstName" type="text" autocomplete="given-name" maxlength="60" placeholder="First name" aria-describedby="firstName-err" enterkeyhint="next">
          <p class="err" id="firstName-err" aria-live="polite"></p>
        </div>
        <div>
          <label class="sr-only" for="lastName">Last name</label>
          <input id="lastName" name="lastName" type="text" autocomplete="family-name" maxlength="60" placeholder="Last name" aria-describedby="lastName-err" enterkeyhint="next">
          <p class="err" id="lastName-err" aria-live="polite"></p>
        </div>
      </div>
      <button class="btn-primary" type="submit">Let's Start<span class="arrow" aria-hidden="true">→</span></button>
    </div>

    <div class="step" data-step="2" hidden>
      <div class="stepnum">Step 2 of 8</div>
      <h2 id="q2"><label for="email">What's your email?</label></h2>
      <input id="email" name="email" type="email" autocomplete="email" inputmode="email" placeholder="Email address" aria-describedby="email-err" enterkeyhint="next">
      <p class="err" id="email-err" aria-live="polite"></p>
      <button class="btn-primary" type="submit">Next<span class="arrow" aria-hidden="true">→</span></button>
      <button class="linkish back" type="button">← Back</button>
    </div>

    <div class="step" data-step="3" hidden>
      <div class="stepnum">Step 3 of 8</div>
      <h2 id="q3" tabindex="-1">What's your experience with YouTube so far?</h2>
      <div class="choices" role="group" aria-labelledby="q3">
        <button class="choice" type="button" data-field="youtube" data-value="zero">Starting from zero</button>
        <button class="choice" type="button" data-field="youtube" data-value="stagnant">Grew but stagnant</button>
        <button class="choice" type="button" data-field="youtube" data-value="other">Other</button>
      </div>
      <button class="linkish back" type="button">← Back</button>
    </div>

    <div class="step" data-step="4" hidden>
      <div class="stepnum">Step 4 of 8</div>
      <h2 id="q4" tabindex="-1">Do you run a business that's making revenue?</h2>
      <div class="choices" role="group" aria-labelledby="q4">
        <button class="choice" type="button" data-field="business" data-value="yes">Yes</button>
        <button class="choice" type="button" data-field="business" data-value="no">Not yet</button>
      </div>
      <button class="linkish back" type="button">← Back</button>
    </div>

    <div class="step" data-step="5" hidden>
      <div class="stepnum">Step 5 of 8</div>
      <h2 id="q5" tabindex="-1">Do you have an offer you actively sell?</h2>
      <div class="choices" role="group" aria-labelledby="q5">
        <button class="choice" type="button" data-field="offer" data-value="yes">Yes</button>
        <button class="choice" type="button" data-field="offer" data-value="no">Not yet</button>
      </div>
      <button class="linkish back" type="button">← Back</button>
    </div>

    <div class="step" data-step="6" hidden>
      <div class="stepnum">Step 6 of 8</div>
      <h2 id="q6" tabindex="-1">Are you willing to show up on camera?</h2>
      <div class="choices" role="group" aria-labelledby="q6">
        <button class="choice" type="button" data-field="camera" data-value="yes">Yes</button>
        <button class="choice" type="button" data-field="camera" data-value="no">No</button>
        <button class="choice" type="button" data-field="camera" data-value="unsure">Unsure</button>
      </div>
      <button class="linkish back" type="button">← Back</button>
    </div>

    <div class="step" data-step="7" hidden>
      <div class="stepnum">Step 7 of 8</div>
      <h2 id="q7" tabindex="-1">Monthly budget to invest in growth?</h2>
      <div class="choices" role="group" aria-labelledby="q7">
        <button class="choice" type="button" data-field="budget" data-value="under1k">Under $1,000</button>
        <button class="choice" type="button" data-field="budget" data-value="1k">$1,000 to $2,500</button>
        <button class="choice" type="button" data-field="budget" data-value="2500">$2,500 to $5,000</button>
        <button class="choice" type="button" data-field="budget" data-value="5k">$5,000+</button>
      </div>
      <button class="linkish back" type="button">← Back</button>
    </div>

    <div class="step" data-step="8" hidden>
      <div class="stepnum">Step 8 of 8</div>
      <h2 id="q8" tabindex="-1">Tell us about your business</h2>
      <label class="field-label" for="niche">Your niche</label>
      <input id="niche" name="niche" type="text" maxlength="200" placeholder="e.g. Fitness coaching" aria-describedby="niche-err">
      <p class="err" id="niche-err" aria-live="polite"></p>
      <label class="field-label" for="channel">YouTube channel <span>(optional)</span></label>
      <input id="channel" name="channel" type="text" maxlength="200" placeholder="@handle or link" autocomplete="url">
      <label class="field-label" for="why">Why do you want a free video? <span>(optional)</span></label>
      <textarea id="why" name="why" maxlength="1000" rows="3"></textarea>
      <button class="btn-primary" id="submit" type="submit">Submit Application<span class="arrow" aria-hidden="true">→</span></button>
      <button class="linkish back" type="button">← Back</button>
    </div>

    <div class="hp" aria-hidden="true"><label>Leave this blank <input name="hp_x" type="text" tabindex="-1" autocomplete="off"></label></div>
    <p class="err" id="form-err" role="alert"></p>
    <p class="note">Takes about a minute.</p>
  </form>
  <p class="consent">By applying you agree to receive emails from Portlock Creative. Unsubscribe anytime. <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms</a></p>
</div></section>

<section class="how"><div class="container">
  <div class="section-head center reveal"><span class="mark" aria-hidden="true"></span><h2>Here's how it works</h2></div>
  <div class="tl">
    <div class="ts l"><span class="dot" aria-hidden="true">1</span><article class="deliver spotlight reveal"><h3>Quick 15 min call</h3><p>We learn about you, your business, and what you want from YouTube, then walk you through how the free video works.</p></article></div>
    <div class="ts r"><span class="dot" aria-hidden="true">2</span><article class="deliver spotlight reveal"><h3>Strategy &amp; content blueprint</h3><p>Before you film, we build your YouTube strategy and a content blueprint: your positioning, content pillars, and a list of video ideas. Then we write the title, script, and thumbnail idea for your first video.</p></article></div>
    <div class="ts l"><span class="dot" aria-hidden="true">3</span><article class="deliver spotlight reveal"><h3>You film</h3><p>Follow the script. We'll show you how to film it, and a phone is fine.</p></article></div>
    <div class="ts r"><span class="dot" aria-hidden="true">4</span><article class="deliver spotlight reveal"><h3>Video reveal</h3><p>We hand you the finished video, ready to post. If it makes sense, we talk about working together long-term.</p></article></div>
  </div>
</div></section>

<section><div class="container">
  <div class="stats">
    <div class="stat spotlight reveal"><div class="stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><polyline points="3 17 9.5 10.5 13.5 14.5 21 7"/><polyline points="15 7 21 7 21 13"/></svg></div><b>7 figures</b><span>Generated through my personal brand</span></div>
    <div class="stat spotlight reveal"><div class="stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3.2"/><path d="M2.8 19.6a6.2 6.2 0 0 1 12.4 0"/><path d="M15.5 5.7a3.2 3.2 0 0 1 0 5.6"/><path d="M17.6 13.9a6.2 6.2 0 0 1 3.6 5.7"/></svg></div><b>300k+</b><span>Followers across platforms</span></div>
  </div>
</div></section>

<section id="faq"><div class="container">
  <div class="section-head center reveal"><span class="mark" aria-hidden="true"></span><h2>FAQs</h2><p>Everything you need to know</p></div>
  <div class="faq">
    <div class="faq-item open"><button class="faq-q" type="button" aria-expanded="true" aria-controls="fa1"><span><b class="faq-num">01</b>How long does the video take?</span><span class="faq-icon" aria-hidden="true"></span></button><div class="faq-a" id="fa1" aria-hidden="false"><div><p>Usually 3 to 7 days after you send us your footage, depending on how complex the video is.</p></div></div></div>
    <div class="faq-item"><button class="faq-q" type="button" aria-expanded="false" aria-controls="fa2"><span><b class="faq-num">02</b>What if I don't want to work with you after the free video?</span><span class="faq-icon" aria-hidden="true"></span></button><div class="faq-a" id="fa2" aria-hidden="true"><div><p>No hard feelings. You keep the video and can post it on your channel.</p></div></div></div>
    <div class="faq-item"><button class="faq-q" type="button" aria-expanded="false" aria-controls="fa3"><span><b class="faq-num">03</b>What's the catch?</span><span class="faq-icon" aria-hidden="true"></span></button><div class="faq-a" id="fa3" aria-hidden="true"><div><p>No catch. We make one video for free, and if it makes sense, we'll show you how we could keep working together.</p></div></div></div>
    <div class="faq-item"><button class="faq-q" type="button" aria-expanded="false" aria-controls="fa4"><span><b class="faq-num">04</b>I've never done YouTube before. Is that a problem?</span><span class="faq-icon" aria-hidden="true"></span></button><div class="faq-a" id="fa4" aria-hidden="true"><div><p>Not at all. We'll guide you through the whole thing.</p></div></div></div>
    <div class="faq-item"><button class="faq-q" type="button" aria-expanded="false" aria-controls="fa5"><span><b class="faq-num">05</b>Do I need a professional camera or microphone?</span><span class="faq-icon" aria-hidden="true"></span></button><div class="faq-a" id="fa5" aria-hidden="true"><div><p>No. A phone is enough.</p></div></div></div>
    <div class="faq-item"><button class="faq-q" type="button" aria-expanded="false" aria-controls="fa6"><span><b class="faq-num">06</b>Why would you make this for free?</span><span class="faq-icon" aria-hidden="true"></span></button><div class="faq-a" id="fa6" aria-hidden="true"><div><p>Because the best way to show you what we can do is to do it.</p></div></div></div>
  </div>
</div></section>
</main>

<div class="foot"><img src="/assets/graphics/portlock-logo.png" alt="Portlock Creative" width="33" height="30"><p>© 2026 Portlock Creative · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p></div>
<script src="/assets/site.js" defer></script>
</body>
</html>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd tests && node --test ../tests/free-video.e2e.test.mjs`
Expected: all PASS.

- [ ] **Step 6: Screenshot for Brandon**

Run the dev server (`node dev-server.mjs`) and take full-page Playwright screenshots of `/free-video/` at 1440×900 and 390×844 into `.context/free-video-landing-{desktop,mobile}.png`. Compare them against `.context/mockup/landing-desktop.png`: it should look the same, minus the MOCKUP tag.

- [ ] **Step 7: Commit (ask Brandon first)**

```bash
git add free-video/index.html free-video/free-video.css tests/free-video.e2e.test.mjs
git commit -m "feat: add the Free Video landing page in Portlock homepage styling"
```

---

### Task 5: The 8-step application form

**Files:**
- Create: `free-video/apply.mjs`
- Modify: `free-video/index.html` (add the module script in `<head>`)
- Test: `tests/free-video.e2e.test.mjs` (append)

**Interfaces:**
- Consumes: from `/youtube-idea-skill/lead-core.mjs`: `validateFirstName`, `validateLastName`, `validateEmail`, `parseUtms`, `mergeUtms`, `UTM_STORE_KEY`. From `/free-video/apply-core.mjs`: `validateNiche`, `RESULT_KEY`. The Task 4 markup ids, and `POST /api/apply` (Tasks 2–3).
- Produces: on success, `sessionStorage['portlock.freeVideo'] = JSON.stringify({ firstName, lastName, email, qualified })`, a call to `window.tk?.identify(email, fullName)`, and navigation to `/free-video/next/`. The request body is `{ firstName, lastName, email, youtube, business, offer, camera, budget, niche, channel, why, utm, ckid }`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/free-video.e2e.test.mjs`:

```js
const visibleStep = page => page.evaluate(() => document.querySelector('#apply-form .step:not([hidden])')?.dataset.step);
const nextButton = n => `#apply-form .step[data-step="${n}"] button[type="submit"]`;

// Fills every step up to (not including) Submit. Pass overrides to change answers.
async function fillApplication(page, o = {}) {
  const a = { first: 'Ana', last: 'Diaz', email: 'ana@example.com', youtube: 'zero', business: 'yes', offer: 'yes', camera: 'yes', budget: '1k', niche: 'Fitness coaching', ...o };
  await page.fill('#firstName', a.first);
  await page.fill('#lastName', a.last);
  await page.click(nextButton(1));
  await page.fill('#email', a.email);
  await page.click(nextButton(2));
  for (const field of ['youtube', 'business', 'offer', 'camera', 'budget']) {
    await page.click(`.choice[data-field="${field}"][data-value="${a[field]}"]`);
  }
  await page.fill('#niche', a.niche);
}

test('the form walks through eight steps with the progress bar following', async () => {
  const { page, context } = await open(LANDING);
  assert.equal(await visibleStep(page), '1');
  await page.fill('#firstName', 'Ana');
  await page.fill('#lastName', 'Diaz');
  await page.keyboard.press('Enter');
  assert.equal(await visibleStep(page), '2');
  await page.fill('#email', 'ana@example.com');
  await page.keyboard.press('Enter');
  assert.equal(await visibleStep(page), '3');
  assert.equal(await page.locator('.progress').getAttribute('aria-valuenow'), '3');
  await page.click('.choice[data-value="zero"]');
  assert.equal(await visibleStep(page), '4');
  await context.close();
});

test('empty names, a bad email, and an empty niche show errors and send nothing', async () => {
  const { page, context, applies } = await open(LANDING);
  await page.click(nextButton(1));
  assert.match(await page.locator('#firstName-err').innerText(), /first name/);
  assert.match(await page.locator('#lastName-err').innerText(), /last name/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'firstName');
  await page.fill('#firstName', 'Ana');
  await page.fill('#lastName', 'Diaz');
  await page.click(nextButton(1));
  await page.fill('#email', 'nope');
  await page.click(nextButton(2));
  assert.match(await page.locator('#email-err').innerText(), /doesn't look right/);
  assert.equal(await visibleStep(page), '2');

  await page.reload();
  await fillApplication(page, { niche: '' });
  await page.click('#submit');
  assert.match(await page.locator('#niche-err').innerText(), /niche/);
  assert.equal(applies.length, 0);
  await context.close();
});

test('Back keeps earlier answers and marks the chosen option', async () => {
  const { page, context } = await open(LANDING);
  await fillApplication(page);
  await page.locator('[data-step="8"] .back').click();
  assert.equal(await visibleStep(page), '7');
  assert.equal(await page.locator('.choice[data-field="budget"][data-value="1k"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-step="7"] .back').click();
  await page.locator('[data-step="6"] .back').click();
  await page.locator('[data-step="5"] .back').click();
  await page.locator('[data-step="4"] .back').click();
  await page.locator('[data-step="3"] .back').click();
  await page.locator('[data-step="2"] .back').click();
  assert.equal(await page.inputValue('#firstName'), 'Ana');
  await context.close();
});

test('submitting sends one request with every answer, UTMs and the ClickLedger id', async () => {
  const { page, context, applies } = await open(`${LANDING}?utm_source=youtube&utm_content=video-7`, {
    init: () => localStorage.setItem('tk_vid', 'vis_1'),
  });
  await fillApplication(page, { camera: 'unsure', budget: '5k' });
  await page.fill('#channel', '@anafit');
  await page.fill('#why', 'Want to grow');
  await Promise.all([page.waitForURL(NEXT), page.click('#submit')]);
  assert.equal(applies.length, 1);
  assert.deepEqual(applies[0].postDataJSON(), {
    firstName: 'Ana', lastName: 'Diaz', email: 'ana@example.com',
    youtube: 'zero', business: 'yes', offer: 'yes', camera: 'unsure', budget: '5k',
    niche: 'Fitness coaching', channel: '@anafit', why: 'Want to grow',
    utm: { source: 'youtube', content: 'video-7' }, ckid: 'vis_1',
  });
  await context.close();
});

test('a successful submit tells ClickLedger who applied', async () => {
  const { page, context } = await open(LANDING, {
    init: () => { window.tk = { identify: (email, name) => sessionStorage.setItem('identified', `${email}|${name}`) }; },
  });
  await fillApplication(page);
  await Promise.all([page.waitForURL(NEXT), page.click('#submit')]);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('identified')), 'ana@example.com|Ana Diaz');
  await context.close();
});

test('double-clicking Submit sends only one application', async () => {
  const { page, context, applies } = await open(LANDING);
  await context.route('**/api/apply', async route => { await new Promise(r => setTimeout(r, 300)); await route.continue(); });
  await fillApplication(page);
  await page.locator('#submit').dblclick();
  await page.waitForURL(NEXT);
  assert.equal(applies.length, 1);
  await context.close();
});

test('a server error shows the form error, stays put, and re-enables Submit', async () => {
  const { page, context } = await open(LANDING);
  await fillApplication(page, { email: 'fail@example.com' });
  await page.click('#submit');
  await page.waitForSelector('#form-err:not(:empty)');
  assert.equal(await page.locator('#form-err').innerText(), 'Something went wrong. Please try again.');
  assert.equal(await visibleStep(page), '8');
  assert.equal(await page.locator('#submit').isDisabled(), false);
  assert.match(await page.locator('#submit').innerText(), /Submit Application/);
  await context.close();
});

test('a filled honeypot sends nothing but looks like success', async () => {
  const { page, context, applies } = await open(LANDING);
  await fillApplication(page);
  await page.evaluate(() => { document.querySelector('[name="hp_x"]').value = 'bot'; });
  await Promise.all([page.waitForURL(NEXT), page.click('#submit')]);
  assert.equal(applies.length, 0);
  await context.close();
});

test('the form works on browsers without AbortSignal.timeout (iOS 15)', async () => {
  const { page, context } = await open(LANDING, { init: () => { delete AbortSignal.timeout; } });
  await fillApplication(page);
  await Promise.all([page.waitForURL(NEXT), page.click('#submit')]);
  await context.close();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd tests && node --test ../tests/free-video.e2e.test.mjs`
Expected: the new form tests FAIL (nothing handles submit, so the page reloads on step 1).

- [ ] **Step 3: Write `free-video/apply.mjs`**

```js
// Free Video application: eight one-question steps inside the form card, then a single
// POST to /api/apply. The thank-you page shows the outcome (calendar or "we'll review").
import {
  validateFirstName, validateLastName, validateEmail, parseUtms, mergeUtms, UTM_STORE_KEY,
} from '/youtube-idea-skill/lead-core.mjs';
import { validateNiche, RESULT_KEY } from '/free-video/apply-core.mjs';

const NEXT_URL = '/free-video/next/';
const FAILURE = 'Something went wrong. Please try again.';
const LAST_STEP = 8;

const $ = id => document.getElementById(id);
const form = $('apply-form');
const steps = [...form.querySelectorAll('.step')];
const progress = form.querySelector('.progress');
const formErr = $('form-err');
const submit = $('submit');
const submitLabel = submit.innerHTML;
const answers = {};
let current = 1;
let sending = false;

function readStoredUtms() {
  try { return JSON.parse(sessionStorage.getItem(UTM_STORE_KEY)) || {}; } catch { return {}; }
}
const utms = mergeUtms(readStoredUtms(), parseUtms(location.search));
try { sessionStorage.setItem(UTM_STORE_KEY, JSON.stringify(utms)); } catch {}

// ClickLedger keeps the visitor's id here; sent along so Notion can link back to it.
function readCkid() {
  try { return localStorage.getItem('tk_vid') || ''; } catch { return ''; }
}

// Shows or clears a field's error; returns true when the field is valid.
function check(input, message, focus = true) {
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  $(`${input.id}-err`).textContent = message || '';
  if (message && focus) input.focus();
  return !message;
}

function goToStep(n) {
  current = n;
  for (const step of steps) step.hidden = Number(step.dataset.step) !== n;
  progress.setAttribute('aria-valuenow', n);
  progress.style.setProperty('--pct', `${(n / steps.length) * 100}%`);
  formErr.textContent = '';
  const active = steps[n - 1];
  (active.querySelector('input') || active.querySelector('h2')).focus();
}

function stepIsValid(n) {
  if (n === 1) {
    // Check both so both errors show; focus lands on the first invalid field.
    const lastOk = check($('lastName'), validateLastName($('lastName').value));
    const firstOk = check($('firstName'), validateFirstName($('firstName').value));
    return firstOk && lastOk;
  }
  if (n === 2) return check($('email'), validateEmail($('email').value));
  if (n === LAST_STEP) return check($('niche'), validateNiche($('niche').value));
  const field = steps[n - 1].querySelector('.choice')?.dataset.field;
  return !field || Boolean(answers[field]);
}

async function apply(payload) {
  const res = await fetch('/api/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout?.(15000), // missing on iOS 15
  });
  const data = await res.json().catch(() => null);
  return res.ok && data?.ok === true ? data : null;
}

async function send() {
  if (sending) return;
  sending = true;
  submit.disabled = true;
  submit.textContent = 'Sending…';
  formErr.textContent = '';
  const firstName = $('firstName').value.trim();
  const lastName = $('lastName').value.trim();
  const email = $('email').value.trim();

  // Honeypot: only bots fill it. They get the normal success path, minus the request.
  const isBot = Boolean(form.elements.hp_x.value);
  let result = isBot ? { qualified: false } : null;
  if (!isBot) {
    try {
      result = await apply({
        firstName, lastName, email, ...answers,
        niche: $('niche').value.trim(),
        channel: $('channel').value.trim(),
        why: $('why').value.trim(),
        utm: utms,
        ckid: readCkid(),
      });
    } catch {}
  }

  if (result) {
    const saved = { firstName, lastName, email, qualified: result.qualified === true };
    try { sessionStorage.setItem(RESULT_KEY, JSON.stringify(saved)); } catch {}
    if (!isBot) window.tk?.identify?.(email, `${firstName} ${lastName}`);
    location.assign(NEXT_URL);
    return;
  }
  formErr.textContent = FAILURE;
  submit.disabled = false;
  submit.innerHTML = submitLabel;
  sending = false;
}

// Enter or a step's button: validate the step, then move on (or send on the last step).
form.addEventListener('submit', e => {
  e.preventDefault();
  if (sending || !stepIsValid(current)) return;
  if (current < LAST_STEP) goToStep(current + 1);
  else send();
});

form.addEventListener('click', e => {
  const choice = e.target.closest('.choice');
  if (choice) {
    answers[choice.dataset.field] = choice.dataset.value;
    for (const option of choice.parentElement.querySelectorAll('.choice')) {
      option.setAttribute('aria-pressed', String(option === choice));
    }
    goToStep(current + 1);
    return;
  }
  if (e.target.closest('.back') && current > 1) goToStep(current - 1);
});
```

- [ ] **Step 4: Load the module**

In `free-video/index.html`, add this line right after the `<link rel="stylesheet" href="/free-video/free-video.css">` line:

```html
<script type="module" src="/free-video/apply.mjs"></script>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd tests && node --test ../tests/free-video.e2e.test.mjs`
Expected: all PASS. The tests that wait for `NEXT` get a 404 page there until Task 6, but `waitForURL` only checks the address, so they pass.

- [ ] **Step 6: Commit (ask Brandon first)**

```bash
git add free-video/apply.mjs free-video/index.html tests/free-video.e2e.test.mjs
git commit -m "feat: wire up the Free Video 8-step application form"
```

---

### Task 6: Thank-you page (calendar or "we'll review")

**Files:**
- Create: `free-video/next/index.html`, `free-video/next/next.mjs`
- Test: `tests/free-video.e2e.test.mjs` (append)

**Interfaces:**
- Consumes: `readResult`, `calendlyUrl`, `RESULT_KEY` from `/free-video/apply-core.mjs`, the saved result from Task 5, and the `.cal` / `.hero-sub` CSS from Task 4.
- Produces: the page outcome. Qualified: an `h1` of "You qualify, {name}!" plus "Pick a time for your 15 min call.", and a visible `#cal.calendly-inline-widget` with `data-url` set. Not qualified: "Thanks, {name}." plus "We'll be in touch.", with `#cal` hidden. No saved result: redirect to `/free-video/`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/free-video.e2e.test.mjs`:

```js
const saveResult = value => () => sessionStorage.setItem('portlock.freeVideo', value);
const RESULT = (o = {}) => JSON.stringify({ firstName: 'Ana', lastName: 'Diaz', email: 'ana@example.com', qualified: true, ...o });

test('qualified applicants see the 15 min Calendly with name and email filled in', async () => {
  const { page, context, errors } = await open(NEXT, { init: saveResult(RESULT()) });
  assert.equal(await page.locator('h1').innerText(), 'You qualify, Ana!\nPick a time for your 15 min call.');
  const url = new URL(await page.locator('#cal').getAttribute('data-url'));
  assert.equal(url.pathname, '/bentoboi/youtube-vide-strategy-consultation');
  assert.equal(url.searchParams.get('name'), 'Ana Diaz');
  assert.equal(url.searchParams.get('email'), 'ana@example.com');
  assert.ok(await page.locator('#cal').isVisible());
  assert.equal(await page.locator('script[src="https://assets.calendly.com/assets/external/widget.js"]').count(), 1);
  assert.deepEqual(ownErrors(errors), []);
  await context.close();
});

test('reloading keeps a qualified applicant on the calendar', async () => {
  const { page, context } = await open(NEXT, { init: saveResult(RESULT()) });
  await page.reload();
  assert.equal(page.url(), NEXT);
  assert.ok(await page.locator('#cal').isVisible());
  await context.close();
});

test('everyone else is told we will review their application', async () => {
  const { page, context } = await open(NEXT, { init: saveResult(RESULT({ qualified: false })) });
  assert.equal(await page.locator('h1').innerText(), "Thanks, Ana.\nWe'll be in touch.");
  assert.match(await page.locator('#sub').innerText(), /review your application/);
  assert.equal(await page.locator('#cal').isVisible(), false);
  assert.equal(await page.locator('script[src*="calendly"]').count(), 0);
  await context.close();
});

test('visiting the thank-you page without applying goes back to the form', async () => {
  for (const init of [undefined, saveResult('garbage')]) {
    const { page, context } = await open(NEXT, { init });
    await page.waitForURL(LANDING);
    await context.close();
  }
});

test('a name containing HTML is shown as text, never run', async () => {
  const name = '<img src=x onerror="window.pwned=1">';
  const { page, context } = await open(NEXT, { init: saveResult(RESULT({ firstName: name })) });
  assert.equal(await page.locator('h1').innerText(), `You qualify, ${name}!\nPick a time for your 15 min call.`);
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  assert.equal(await page.locator('h1 img').count(), 0);
  await context.close();
});

test('with storage blocked, the page still shows the review message', async () => {
  const { page, context } = await open(NEXT, {
    init: () => Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }),
  });
  assert.equal(await page.locator('h1').innerText(), "Thanks.\nWe'll be in touch.");
  await context.close();
});

for (const [label, size] of Object.entries(SIZES)) {
  test(`full flow on ${label}: apply, land on the calendar, no overflow`, async () => {
    const { page, context, errors } = await open(LANDING, { size });
    await fillApplication(page, { first: 'Brandon', last: 'Chin' });
    await Promise.all([page.waitForURL(NEXT), page.click('#submit')]);
    assert.equal(await page.locator('h1').innerText(), 'You qualify, Brandon!\nPick a time for your 15 min call.');
    assert.equal(await overflow(page), 0);
    assert.deepEqual(ownErrors(errors), []);
    await context.close();
  });
}

test('the thank-you page has the ClickLedger snippet and is not indexed', async () => {
  const { page, context } = await open(NEXT, { init: saveResult(RESULT()) });
  assert.equal(await page.locator('script[src="https://www.clickledger.io/track.js"]').count(), 1);
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex');
  await context.close();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd tests && node --test ../tests/free-video.e2e.test.mjs`
Expected: the thank-you tests FAIL (404).

- [ ] **Step 3: Create `free-video/next/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Application Received | Portlock Creative</title>
<meta name="theme-color" content="#060608">
<link rel="icon" type="image/png" href="/assets/graphics/portlock-icon.png"><link rel="apple-touch-icon" href="/assets/graphics/portlock-icon.png">
<!-- ClickLedger: attributes visitors back to the video that sent them, including the Calendly booking. -->
<script src="https://www.clickledger.io/track.js" data-token="cmt0v4wd90001la04k78fpg3j" defer></script>
<link rel="stylesheet" href="/assets/site.css">
<link rel="stylesheet" href="/free-video/free-video.css">
<script>document.documentElement.classList.add('js')</script>
<script type="module" src="/free-video/next/next.mjs"></script>
</head>
<body>
<div class="flair-layer" aria-hidden="true"><div class="flair a"></div><div class="flair c"></div></div>
<div class="logo logo-float"><img src="/assets/graphics/portlock-logo.png" alt="Portlock Creative" width="37" height="34"></div>
<noscript><main><header class="hero"><div class="container"><h1>Thanks for applying.</h1><p class="hero-sub">We'll review your application and get back to you by email.</p></div></header></main></noscript>
<main id="main" tabindex="-1" hidden>
<header class="hero"><div class="container">
  <h1 id="title"></h1>
  <p class="hero-sub" id="sub"></p>
  <div id="cal" class="calendly-inline-widget cal" hidden></div>
</div></header>
</main>
<div class="foot"><img src="/assets/graphics/portlock-logo.png" alt="Portlock Creative" width="33" height="30"><p>© 2026 Portlock Creative · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p></div>
<script src="/assets/site.js" defer></script>
</body>
</html>
```

- [ ] **Step 4: Create `free-video/next/next.mjs`**

```js
// Free Video thank-you page: qualified applicants book their call in Calendly (name and
// email filled in); everyone else is told we'll review their application.
import { readResult, calendlyUrl, RESULT_KEY } from '/free-video/apply-core.mjs';

const LANDING_URL = '/free-video/';

// Returns undefined when the browser blocks storage entirely (not the same as "not set").
const read = key => { try { return sessionStorage.getItem(key); } catch { return undefined; } };

// Builds "Title<br><em>Accent</em>" with textContent, so names are never parsed as HTML.
function setHeading(title, accent, sub) {
  const h1 = document.getElementById('title');
  const em = document.createElement('em');
  em.textContent = accent;
  h1.replaceChildren(document.createTextNode(title), document.createElement('br'), em);
  document.getElementById('sub').textContent = sub;
}

function showCalendar(result) {
  const cal = document.getElementById('cal');
  cal.dataset.url = calendlyUrl(result);
  cal.hidden = false;
  const script = document.createElement('script');
  script.src = 'https://assets.calendly.com/assets/external/widget.js';
  script.async = true;
  document.body.append(script);
}

const raw = read(RESULT_KEY);
// Storage blocked: we can't know the outcome, so show the safe "we'll review" message.
const result = raw === undefined ? { firstName: '', lastName: '', email: '', qualified: false } : readResult(raw);

if (!result) {
  location.replace(LANDING_URL);
} else {
  const name = result.firstName ? `, ${result.firstName}` : '';
  if (result.qualified) {
    setHeading(`You qualify${name}!`, 'Pick a time for your 15 min call.', "We'll talk about your business and plan your free video.");
    showCalendar(result);
  } else {
    setHeading(`Thanks${name}.`, "We'll be in touch.", "We'll review your application and get back to you by email.");
  }
  document.getElementById('main').hidden = false;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd tests && npm test`
Expected: all pass, 0 fail.

- [ ] **Step 6: Screenshot for Brandon**

With `node dev-server.mjs` running, complete the form in Playwright at 1440×900 and 390×844, once qualified and once with budget "Under $1,000". Save `.context/free-video-next-{qualified,review}-{desktop,mobile}.png`. Allow network for these screenshots so the real Calendly loads, then show them to Brandon.

- [ ] **Step 7: Commit (ask Brandon first)**

```bash
git add free-video/next/index.html free-video/next/next.mjs tests/free-video.e2e.test.mjs
git commit -m "feat: add the Free Video thank-you page with Calendly for qualified applicants"
```

---

### Task 7: Privacy page

**Files:**
- Modify: `privacy/index.html` (the "What we collect" first bullet and the "Who we share it with" paragraph)
- Test: `tests/free-video.e2e.test.mjs` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces: privacy copy that covers the application answers and Notion.

- [ ] **Step 1: Write the failing test**

```js
test('the privacy page mentions Notion and the application answers', async () => {
  const html = await (await fetch(`${BASE}/privacy`)).text();
  assert.match(html, /Notion \(storing applications\)/);
  assert.match(html, /budget/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd tests && node --test ../tests/free-video.e2e.test.mjs`
Expected: FAIL on the Notion match.

- [ ] **Step 3: Update the copy**

In `privacy/index.html`, replace:

```html
    <li><strong>What you type into our forms:</strong> your name and email, plus any optional answers (like whether you have a YouTube channel, what you do, and your channel link).</li>
```

with:

```html
    <li><strong>What you type into our forms:</strong> your name and email, plus your answers (like whether you have a YouTube channel, what you do, your channel link, and, if you apply for a free video, details about your business, offer, and budget).</li>
```

Then replace:

```html
Kit (email), Vercel (website hosting),
```

with:

```html
Kit (email), Notion (storing applications), Vercel (website hosting),
```

- [ ] **Step 4: Run all tests**

Run: `cd tests && npm test`
Expected: all pass.

- [ ] **Step 5: Commit (ask Brandon first)**

```bash
git add privacy/index.html tests/free-video.e2e.test.mjs
git commit -m "docs: cover Free Video applications and Notion in the privacy policy"
```

---

### Task 8: Connect Notion, Kit, and Vercel, then test live (with Brandon)

This task touches external services and live settings. **Ask Brandon before each numbered step**, and never print a secret. There's no code here unless a check fails.

**Files:**
- Create: `.env.local` (gitignored; holds secrets; never committed)

- [ ] **Step 1: Create the two Kit tags**

After Brandon says yes, run this. It reads the key from the Keychain without printing it, and prints only tag names and IDs:

```bash
KIT_API_KEY="$(security find-generic-password -a "$USER" -s KIT_API_KEY -w)" node --input-type=module -e '
for (const name of ["free-video-applicant", "free-video-qualified"]) {
  const res = await fetch("https://api.kit.com/v4/tags", { method: "POST", headers: { "Content-Type": "application/json", "X-Kit-Api-Key": process.env.KIT_API_KEY }, body: JSON.stringify({ name }) });
  const data = await res.json();
  console.log(name, res.status, data.tag?.id);
}'
```

Expected: two lines, each with status 201 (or 200 if the tag already exists) and an id. Write the IDs into `.env.local` as `KIT_TAG_APPLICANT=<id>` and `KIT_TAG_QUALIFIED=<id>`. Also add `KIT_API_KEY` to `.env.local` with `printf 'KIT_API_KEY=%s\n' "$(security find-generic-password -a "$USER" -s KIT_API_KEY -w)" >> .env.local`, which never shows the key on screen.

- [ ] **Step 2: Create the Notion database**

Use the Notion MCP tools (`notion-create-database`) in Brandon's workspace, at the location he picks, to create "Free Video Applications" with these properties:

| Property | Type | Options |
|---|---|---|
| Name | Title | |
| Email | Email | |
| Status | Select | New, Call booked, Video made, Client, Not a fit |
| Qualified | Checkbox | |
| YouTube experience | Select | Starting from zero, Grew but stagnant, Other |
| Revenue business | Select | Yes, Not yet |
| Has offer | Select | Yes, Not yet |
| On camera | Select | Yes, No, Unsure |
| Budget | Select | Under $1k, $1k–$2.5k, $2.5k–$5k, $5k+ |
| Niche | Text | |
| Channel | Text | |
| Why | Text | |
| ClickLedger ID | Text | |
| UTM source | Text | |
| UTM campaign | Text | |
| UTM content | Text | |
| Applied | Date | |
| Owner | Person | |

Add two views: "All applications" (a table sorted by Applied, newest first) and "Pipeline" (a board grouped by Status). Copy the database ID from its URL into `.env.local` as `NOTION_APPLICATIONS_DB=<id>`. Use `notion-get-users` to find Brandon's user ID, and add it as `NOTION_OWNER_ID=<id>`.

- [ ] **Step 3: Brandon connects the integration**

Brandon does this himself; walk him through it:
1. Go to https://www.notion.so/profile/integrations → **New integration** → name it "Portlock Site", type Internal, select his workspace → Save.
2. Copy the **Internal Integration Secret**.
3. Open the "Free Video Applications" database → **•••** → **Connections** → add "Portlock Site".
4. Add the secret to `.env.local` on its own line as `NOTION_TOKEN=<secret>`, typing it in an editor so it never goes through the chat.

Check (prints only the status code):

```bash
node --env-file=.env.local --input-type=module -e 'const r = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_APPLICATIONS_DB}`, { headers: { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, "Notion-Version": "2022-06-28" } }); console.log("Notion DB", r.status)'
```

Expected: `Notion DB 200`.

- [ ] **Step 4: Live local test of both outcomes**

Run `node --env-file=.env.local dev-server.mjs` and apply twice in the browser at `http://localhost:4173/free-video/`:
- `bentoboi808+fvtest1@gmail.com`, qualifying answers → the calendar shows.
- `bentoboi808+fvtest2@gmail.com`, budget "Under $1,000" → the review message shows.

Verify:
1. Two Notion rows, with every column filled correctly and Status = New.
2. In Kit, both subscribers exist with the right tags, and fvtest1 also has `free-video-qualified`.
3. Wait 3 minutes. Neither address receives the skill email, so no Kit automation fired.
4. Brandon got a Notion notification for the Owner assignment. If he didn't, write down what happened and bring him options in plain language. Don't add a mail service.

Then clean up: delete the two Notion rows, and unsubscribe both test subscribers in Kit.

- [ ] **Step 5: Vercel env vars (ask Brandon)**

Link this workspace to the live project (not `creator-lab-private`): `npx vercel link --project creator-lab-private-18wj`. Then, for each of `NOTION_TOKEN`, `NOTION_APPLICATIONS_DB`, `NOTION_OWNER_ID`, `KIT_TAG_APPLICANT`, `KIT_TAG_QUALIFIED`, add the value from `.env.local` to Production and Preview as sensitive, piping it so it isn't printed:

```bash
for NAME in NOTION_TOKEN NOTION_APPLICATIONS_DB NOTION_OWNER_ID KIT_TAG_APPLICANT KIT_TAG_QUALIFIED; do
  VALUE="$(grep "^$NAME=" .env.local | cut -d= -f2-)"
  for ENV in production preview; do printf '%s' "$VALUE" | npx vercel env add "$NAME" "$ENV" --sensitive; done
done
```

If the CLI asks which Git branch a Preview variable is for, leave it empty (all preview branches). `KIT_API_KEY` is already set in Vercel.

- [ ] **Step 6: Rate limit (Brandon, in the Vercel dashboard)**

Vercel → creator-lab-private-18wj → Firewall → edit the rule "Signup rate limit" → change the path condition to match **either** `/api/subscribe` or `/api/apply` (keep 5 requests per IP per 600s → 429) → Publish.

- [ ] **Step 7: ClickLedger checks (Brandon)**

1. In ClickLedger settings, confirm the Calendly webhook is connected.
2. Brandon sends one tracked link. Run `curl -sI "<link>" | grep -i location` to see whether the redirect carries `utm_content`. If it doesn't, tell him Notion will show the ClickLedger ID (not the video name), and that the video name is in ClickLedger.

- [ ] **Step 8: Push the branch and open the PR (ask Brandon)**

Run `git push -u origin HEAD`, then `gh pr create --base main`, with a PR body that lists what's live after merge and ends with the attribution line. On the preview deployment, test the API without a browser:

```bash
npx vercel curl /api/apply --deployment <preview-url> -- -X POST -H 'Content-Type: application/json' -d '{"hp":"x"}'
```

Expected: `{"ok":true,"qualified":false}`. This proves the function deploys and has its env vars without creating a row.

- [ ] **Step 9: Launch (only when Brandon says "launch")**

Brandon merges the PR, which deploys portlockcreative.com. Then run one real application on `https://portlockcreative.com/free-video/` with `bentoboi808+fvlive1@gmail.com`, verify the Notion row, Kit tags, the calendar, and the ClickLedger events, and clean up (delete the row and unsubscribe).

---

## Self-Review Notes

- **Spec coverage:** pages and copy (Tasks 4, 6), form and qualification (Tasks 1, 5), data flow, Notion and Kit (Task 2), tracking (Tasks 4–6 snippet, Task 5 identify and ckid, Task 8 webhook check), gating (Tasks 5–6), privacy (Task 7), rate limit, dev server, and launch (Tasks 3, 8), and testing throughout.
- **Out of scope (unchanged from the spec):** sales video, Calendly → Notion status sync, follow-up emails, ClickLedger on the skill pages.
