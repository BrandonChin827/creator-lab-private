// End-to-end tests for the Discovery Call application (/apply/ and /apply/next/), which
// replaced the homepage's Tally form. Boots the local dev server, whose /api/discovery is
// a mock, and drives Chromium.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 4196;
const BASE = `http://localhost:${PORT}`;
const LANDING = `${BASE}/apply/`;
const NEXT = `${BASE}/apply/next/`;
const SIZES = { mobile: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };
// Third-party scripts are blocked in tests; only our own errors count.
const ownErrors = errors => errors.filter(e => !/clickledger|calendly|bunny|mediadelivery|Failed to load resource/i.test(e));

let server, browser;

before(async () => {
  // Keys are blanked so the suite always uses the mock and never writes to Notion or Kit.
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

const post = body => fetch(`${BASE}/api/discovery`, { method: 'POST', body: JSON.stringify(body) });

test('dev /api/discovery mock uses the discovery rule', async () => {
  const good = { email: 'ana@example.com', camera: 'unsure', budget: '1k' };
  assert.deepEqual(await (await post(good)).json(), { ok: true, qualified: true });
  assert.deepEqual(await (await post({ ...good, budget: 'under1000' })).json(), { ok: true, qualified: false });
  assert.equal((await post({ ...good, email: 'fail@example.com' })).status, 500);
  assert.equal((await fetch(`${BASE}/api/discovery`)).status, 405);
});

// A fresh page with third-party scripts blocked, recording errors and /api/discovery requests.
async function open(url, { size = SIZES.desktop, init } = {}) {
  const context = await browser.newContext({ viewport: size });
  context.setDefaultTimeout(5000);
  await context.route(/clickledger\.io|calendly\.com|mediadelivery\.net|tally\.so/, route => route.abort());
  // init is a function, or [function, arg] when it needs a value (init scripts can't see outer variables).
  if (init) await context.addInitScript(...[].concat(init));
  const page = await context.newPage();
  const errors = [];
  const sent = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.url().endsWith('/api/discovery')) sent.push(r); });
  await page.goto(url);
  return { page, context, errors, sent };
}

const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const visibleStep = page => page.evaluate(() => document.querySelector('#apply-form .step:not([hidden])')?.dataset.step);
const nextButton = n => `#apply-form .step[data-step="${n}"] button[type="submit"]`;
const CHOICE_FIELDS = ['experience', 'revenue', 'offer', 'camera', 'budget'];

// Fills every step up to (not including) the last question. Pass overrides to change answers.
async function fillApplication(page, o = {}) {
  const a = { first: 'Ana', last: 'Diaz', email: 'ana@example.com', experience: 'zero', revenue: 'yes', offer: 'yes', camera: 'yes', budget: '1k', niche: 'Fitness coaching', ...o };
  await page.fill('#firstName', a.first);
  await page.fill('#lastName', a.last);
  await page.click(nextButton(1));
  await page.fill('#email', a.email);
  await page.click(nextButton(2));
  for (const field of CHOICE_FIELDS) await page.click(`.choice[data-field="${field}"][data-value="${a[field]}"]`);
  await page.fill('#niche', a.niche);
  await page.click(nextButton(8));
}
const pickTimeline = (page, value = 'month') => page.click(`.choice[data-field="timeline"][data-value="${value}"]`);

for (const [label, size] of Object.entries(SIZES)) {
  test(`landing loads cleanly on ${label} with no overflow`, async () => {
    const { page, context, errors } = await open(LANDING, { size });
    assert.equal(await page.locator('h1').innerText(), 'Book a\nDiscovery Call');
    assert.ok(await page.locator('#firstName').isVisible());
    assert.equal(await overflow(page), 0);
    assert.deepEqual(ownErrors(errors), []);
    await context.close();
  });
}

test('landing carries ClickLedger and links Privacy and Terms', async () => {
  const { page, context } = await open(LANDING);
  assert.equal(await page.locator('script[src="https://www.clickledger.io/track.js"]').getAttribute('data-token'), 'cmt0v4wd90001la04k78fpg3j');
  for (const path of ['/privacy', '/terms']) assert.ok(await page.locator(`a[href="${path}"]`).count() > 0, path);
  await context.close();
});

test('the form asks the Tally questions in order across nine steps', async () => {
  const { page, context } = await open(LANDING);
  assert.deepEqual(await page.locator('#apply-form .step h2').allTextContents(), [
    "What's your name?",
    "What's your email?",
    'What has been your experience with YouTube for your business or personal brand so far?',
    "Do you run a business that's currently generating revenue?",
    'Do you have an offer you actively sell?',
    'Are you willing to show up on camera and publish consistently?',
    'Monthly budget to invest in growth?',
    'What does your business do / your niche?',
    'How soon do you want to start?',
  ]);
  await fillApplication(page);
  assert.equal(await visibleStep(page), '9');
  assert.equal(await page.locator('.progress').getAttribute('aria-valuenow'), '9');
  assert.equal(await page.locator('[data-step="9"] .stepnum').textContent(), 'Step 9 of 9');
  await context.close();
});

test('an empty niche shows an error and stays on that step', async () => {
  const { page, context, sent } = await open(LANDING);
  await fillApplication(page, { niche: '' });
  assert.equal(await visibleStep(page), '8');
  assert.match(await page.locator('#niche-err').innerText(), /niche/);
  assert.equal(sent.length, 0);
  await context.close();
});

test('Back keeps earlier answers and marks the chosen option', async () => {
  const { page, context } = await open(LANDING);
  await fillApplication(page);
  await page.locator('[data-step="9"] .back').click();
  assert.equal(await page.inputValue('#niche'), 'Fitness coaching');
  await page.locator('[data-step="8"] .back').click();
  assert.equal(await page.locator('.choice[data-field="budget"][data-value="1k"]').getAttribute('aria-pressed'), 'true');
  await context.close();
});

test('picking a start time sends one request with every answer and the UTMs', async () => {
  const { page, context, sent } = await open(`${LANDING}?utm_source=youtube&utm_content=video-7`);
  await fillApplication(page, { experience: 'stagnant', revenue: 'notyet', offer: 'notyet', camera: 'unsure', budget: '5k' });
  await Promise.all([page.waitForURL(NEXT), pickTimeline(page, 'exploring')]);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].postDataJSON(), {
    firstName: 'Ana', lastName: 'Diaz', email: 'ana@example.com',
    experience: 'stagnant', revenue: 'notyet', offer: 'notyet', camera: 'unsure', budget: '5k', timeline: 'exploring',
    niche: 'Fitness coaching', utm: { source: 'youtube', content: 'video-7' },
  });
  await context.close();
});

test('a server error shows the form error, stays put, and lets them try again', async () => {
  const { page, context } = await open(LANDING);
  await fillApplication(page, { email: 'fail@example.com' });
  await pickTimeline(page);
  await page.waitForSelector('#form-err:not(:empty)');
  assert.equal(await page.locator('#form-err').innerText(), 'Something went wrong. Please try again.');
  assert.equal(await visibleStep(page), '9');
  assert.equal(await page.locator('.choice[data-field="timeline"][data-value="month"]').isDisabled(), false);
  assert.equal(await page.locator('#note').innerText(), 'Takes about a minute.');
  await context.close();
});

test('a filled honeypot sends nothing but looks like success', async () => {
  const { page, context, sent } = await open(LANDING);
  await fillApplication(page);
  await page.evaluate(() => { document.querySelector('[name="hp_x"]').value = 'bot'; });
  await Promise.all([page.waitForURL(NEXT), pickTimeline(page)]);
  assert.equal(sent.length, 0);
  await context.close();
});

const saveResult = value => [v => sessionStorage.setItem('portlock.discovery', v), value];
const RESULT = (o = {}) => JSON.stringify({ firstName: 'Ana', lastName: 'Diaz', email: 'ana@example.com', qualified: true, ...o });

test('qualified applicants see the Discovery Call Calendly with name and email filled in', async () => {
  const { page, context, errors } = await open(NEXT, { init: saveResult(RESULT()) });
  assert.equal(await page.locator('h1').innerText(), 'Great to meet you, Ana!\nYou look like a great fit.');
  const url = new URL(await page.locator('#cal').getAttribute('data-url'));
  assert.equal(url.pathname, '/brandonchinportlock/one-on-one-meeting');
  assert.equal(url.searchParams.get('name'), 'Ana Diaz');
  assert.equal(url.searchParams.get('email'), 'ana@example.com');
  assert.ok(await page.locator('#cal').isVisible());
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex');
  assert.deepEqual(ownErrors(errors), []);
  await context.close();
});

test('everyone else gets the Tally "thanks for your interest" message', async () => {
  const { page, context } = await open(NEXT, { init: saveResult(RESULT({ qualified: false })) });
  assert.equal(await page.locator('h1').innerText(), "Thanks for your interest, Ana!\nWe'll be in touch.");
  assert.equal(await page.locator('#cal').isVisible(), false);
  await context.close();
});

test('another funnel\'s result does not unlock the discovery calendar', async () => {
  const { page, context } = await open(NEXT, { init: [v => sessionStorage.setItem('portlock.freeAudit', v), RESULT()] });
  await page.waitForURL(LANDING);
  await context.close();
});

for (const [label, size] of Object.entries(SIZES)) {
  test(`full flow on ${label}: apply, land on the calendar, no overflow`, async () => {
    const { page, context, errors } = await open(LANDING, { size });
    await fillApplication(page, { first: 'Brandon', last: 'Chin' });
    await Promise.all([page.waitForURL(NEXT), pickTimeline(page)]);
    assert.equal(await page.locator('h1').innerText(), 'Great to meet you, Brandon!\nYou look like a great fit.');
    assert.equal(await overflow(page), 0);
    assert.deepEqual(ownErrors(errors), []);
    await context.close();
  });
}

test('every Book a Call button on the homepage goes to /apply/, and Tally is gone', async () => {
  const { page, context } = await open(`${BASE}/`);
  const hrefs = await page.locator('a[data-book]').evaluateAll(as => as.map(a => a.getAttribute('href')));
  assert.equal(hrefs.length, 6);
  assert.ok(hrefs.every(h => h === '/apply/'), hrefs.join(', '));
  assert.equal(await page.locator('script[src*="tally"]').count(), 0);
  await Promise.all([page.waitForURL(LANDING), page.locator('a[data-book]:visible').first().click()]);
  await context.close();
});

test('UTMs on the homepage ride along through Book a Call and reach the application', async () => {
  const { page, context, sent } = await open(`${BASE}/?utm_source=youtube&utm_campaign=oct&utm_content=video-7`);
  await page.waitForFunction(() => document.querySelector('a[data-book]').getAttribute('href') !== '/apply/');
  const hrefs = await page.locator('a[data-book]').evaluateAll(as => as.map(a => a.getAttribute('href')));
  assert.ok(hrefs.every(h => h === '/apply/?utm_source=youtube&utm_campaign=oct&utm_content=video-7'), hrefs.join(', '));
  await Promise.all([page.waitForURL(/\/apply\/\?/), page.locator('a[data-book]:visible').first().click()]);
  await fillApplication(page);
  await Promise.all([page.waitForURL(NEXT), pickTimeline(page)]);
  assert.deepEqual(sent[0].postDataJSON().utm, { source: 'youtube', campaign: 'oct', content: 'video-7' });
  await context.close();
});

test('the privacy page no longer lists Tally', async () => {
  const html = await (await fetch(`${BASE}/privacy`)).text();
  assert.doesNotMatch(html, /Tally/);
  assert.match(html, /Calendly \(booking a call\)/);
});
