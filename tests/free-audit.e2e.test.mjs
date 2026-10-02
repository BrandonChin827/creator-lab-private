// End-to-end tests for the Free Channel Audit funnel (/free-audit/ and /free-audit/next/).
// Boots the local dev server, whose /api/audit is a mock, and drives Chromium.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 4197;
const BASE = `http://localhost:${PORT}`;
const LANDING = `${BASE}/free-audit/`;
const NEXT = `${BASE}/free-audit/next/`;
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

const post = body => fetch(`${BASE}/api/audit`, { method: 'POST', body: JSON.stringify(body) });
const QUALIFIED = { firstName: 'Ana', lastName: 'Diaz', email: 'ana@example.com', offer: 'yes', camera: 'yes', budget: '1500' };

test('dev /api/audit mock uses the audit rule (no filming or case-study questions)', async () => {
  assert.deepEqual(await (await post(QUALIFIED)).json(), { ok: true, qualified: true });
  assert.deepEqual(await (await post({ ...QUALIFIED, camera: 'no' })).json(), { ok: true, qualified: false });
  assert.equal((await post({ ...QUALIFIED, email: 'fail@example.com' })).status, 500);
  assert.equal((await fetch(`${BASE}/api/audit`)).status, 405);
});

// A fresh page with third-party scripts blocked, recording errors and /api/audit requests.
async function open(url, { size = SIZES.desktop, init } = {}) {
  const context = await browser.newContext({ viewport: size });
  context.setDefaultTimeout(5000);
  await context.route(/clickledger\.io|calendly\.com/, route => route.abort());
  // init is a function, or [function, arg] when it needs a value (init scripts can't see outer variables).
  if (init) await context.addInitScript(...[].concat(init));
  const page = await context.newPage();
  const errors = [];
  const audits = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.url().endsWith('/api/audit')) audits.push(r); });
  await page.goto(url);
  return { page, context, errors, audits };
}

const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

for (const [label, size] of Object.entries(SIZES)) {
  test(`landing loads cleanly on ${label} with no overflow`, async () => {
    const { page, context, errors } = await open(LANDING, { size });
    assert.equal(await page.locator('h1').innerText(), 'Get a Free YouTube Channel Audit\n& Strategy Call');
    assert.ok(await page.locator('#firstName').isVisible());
    assert.equal(await overflow(page), 0);
    assert.deepEqual(ownErrors(errors), []);
    await context.close();
  });
}

test('landing has the audit steps, the About Me section, and five audit FAQs', async () => {
  const { page, context } = await open(LANDING);
  assert.deepEqual(await page.locator('.ts h3').allInnerTexts(),
    ['Apply', 'Book your 30 min call', 'Live channel audit', 'Your growth plan']);
  const about = page.locator('#about');
  assert.deepEqual(await about.locator('.stat b').allInnerTexts(), ['7 figures', '300k+']);
  assert.match(await about.locator('.about-story').innerText(), /^I'm Brandon\. I built my personal brand from zero/);
  assert.equal(await about.locator('.cta-row .btn-primary').getAttribute('href'), '#apply');
  assert.equal(await page.locator('.faq-item').count(), 5);
  assert.match(await page.locator('#fa1').innerText(), /titles and thumbnails/);
  assert.match(await page.locator('#fa5').innerText(), /earn your trust/);
  await page.locator('.faq-q').nth(4).click();
  assert.ok(await page.locator('.faq-item').nth(4).evaluate(e => e.classList.contains('open')));
  await context.close();
});

test('landing carries ClickLedger, links Privacy and Terms, and is indexable', async () => {
  const { page, context } = await open(LANDING);
  assert.equal(await page.locator('script[src="https://www.clickledger.io/track.js"]').getAttribute('data-token'), 'cmt0v4wd90001la04k78fpg3j');
  for (const path of ['/privacy', '/terms']) assert.ok(await page.locator(`a[href="${path}"]`).count() > 0, path);
  assert.equal(await page.locator('meta[name="robots"]').count(), 0);
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://portlockcreative.com/free-audit/');
  await context.close();
});

const visibleStep = page => page.evaluate(() => document.querySelector('#apply-form .step:not([hidden])')?.dataset.step);
const nextButton = n => `#apply-form .step[data-step="${n}"] button[type="submit"]`;

// Fills every step up to (not including) Submit. Pass overrides to change answers.
async function fillApplication(page, o = {}) {
  const a = { first: 'Ana', last: 'Diaz', email: 'ana@example.com', stage: 'stagnant', offer: 'yes', camera: 'yes', budget: '1500', channel: '@anafit', niche: 'Fitness coaching', ...o };
  await page.fill('#firstName', a.first);
  await page.fill('#lastName', a.last);
  await page.click(nextButton(1));
  await page.fill('#email', a.email);
  await page.click(nextButton(2));
  for (const field of ['stage', 'offer', 'camera', 'budget']) {
    await page.click(`.choice[data-field="${field}"][data-value="${a[field]}"]`);
  }
  await page.fill('#channel', a.channel);
  await page.fill('#niche', a.niche);
}

test('the form walks through seven steps with the progress bar following', async () => {
  const { page, context } = await open(LANDING);
  const ratio = await page.evaluate(() => {
    const bar = document.querySelector('#apply-form .progress');
    return bar.querySelector('i').getBoundingClientRect().width / bar.getBoundingClientRect().width;
  });
  assert.ok(Math.abs(ratio - 1 / 7) < 0.005, String(ratio));
  await page.fill('#firstName', 'Ana');
  await page.fill('#lastName', 'Diaz');
  await page.keyboard.press('Enter');
  await page.fill('#email', 'ana@example.com');
  await page.keyboard.press('Enter');
  assert.equal(await visibleStep(page), '3');
  assert.equal(await page.locator('[data-step="3"] h2').innerText(), "Where's your channel at?");
  for (const value of ['growing', 'yes', 'unsure', '3000']) await page.click(`.choice[data-value="${value}"]:visible`);
  assert.equal(await visibleStep(page), '7');
  assert.equal(await page.locator('.progress').getAttribute('aria-valuenow'), '7');
  assert.equal(await page.locator('[data-step="7"] .stepnum').textContent(), 'Step 7 of 7');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'channel');
  await context.close();
});

test('an empty channel and niche show errors and send nothing', async () => {
  const { page, context, audits } = await open(LANDING);
  await fillApplication(page, { channel: '', niche: '' });
  await page.click('#submit');
  assert.match(await page.locator('#channel-err').innerText(), /none yet/);
  assert.match(await page.locator('#niche-err').innerText(), /niche/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'channel');
  assert.equal(audits.length, 0);
  await context.close();
});

test('Back keeps earlier answers and marks the chosen option', async () => {
  const { page, context } = await open(LANDING);
  await fillApplication(page);
  await page.locator('[data-step="7"] .back').click();
  assert.equal(await visibleStep(page), '6');
  assert.equal(await page.locator('.choice[data-field="budget"][data-value="1500"]').getAttribute('aria-pressed'), 'true');
  for (const n of [6, 5, 4, 3, 2]) await page.locator(`[data-step="${n}"] .back`).click();
  assert.equal(await page.inputValue('#firstName'), 'Ana');
  await context.close();
});

test('submitting sends one request with every answer, UTMs and the ClickLedger id', async () => {
  const { page, context, audits } = await open(`${LANDING}?utm_source=youtube&utm_content=video-7`, {
    init: () => localStorage.setItem('tk_vid', 'vis_1'),
  });
  await fillApplication(page, { stage: 'starting', camera: 'unsure', budget: '5k', channel: 'none yet' });
  await page.fill('#challenge', 'Not sure what to post');
  await page.fill('#source', 'Outliers video');
  await Promise.all([page.waitForURL(NEXT), page.click('#submit')]);
  assert.equal(audits.length, 1);
  assert.deepEqual(audits[0].postDataJSON(), {
    firstName: 'Ana', lastName: 'Diaz', email: 'ana@example.com',
    stage: 'starting', offer: 'yes', camera: 'unsure', budget: '5k',
    channel: 'none yet', niche: 'Fitness coaching', challenge: 'Not sure what to post', source: 'Outliers video',
    utm: { source: 'youtube', content: 'video-7' }, ckid: 'vis_1',
  });
  await context.close();
});

test('a server error shows the form error, stays put, and re-enables Submit', async () => {
  const { page, context } = await open(LANDING);
  await fillApplication(page, { email: 'fail@example.com' });
  await page.click('#submit');
  await page.waitForSelector('#form-err:not(:empty)');
  assert.equal(await page.locator('#form-err').innerText(), 'Something went wrong. Please try again.');
  assert.equal(await visibleStep(page), '7');
  assert.equal(await page.locator('#submit').isDisabled(), false);
  await context.close();
});

test('a filled honeypot sends nothing but looks like success', async () => {
  const { page, context, audits } = await open(LANDING);
  await fillApplication(page);
  await page.evaluate(() => { document.querySelector('[name="hp_x"]').value = 'bot'; });
  await Promise.all([page.waitForURL(NEXT), page.click('#submit')]);
  assert.equal(audits.length, 0);
  await context.close();
});

const saveResult = value => [v => sessionStorage.setItem('portlock.freeAudit', v), value];
const RESULT = (o = {}) => JSON.stringify({ firstName: 'Ana', lastName: 'Diaz', email: 'ana@example.com', qualified: true, ...o });

test('qualified applicants see the 30 min audit Calendly with name and email filled in', async () => {
  const { page, context, errors } = await open(NEXT, { init: saveResult(RESULT()) });
  assert.equal(await page.locator('h1').innerText(), 'You qualify, Ana!\nPick a time for your 30 min audit call.');
  const url = new URL(await page.locator('#cal').getAttribute('data-url'));
  assert.equal(url.pathname, '/bentoboi/youtube-consultation');
  assert.equal(url.searchParams.get('name'), 'Ana Diaz');
  assert.equal(url.searchParams.get('email'), 'ana@example.com');
  assert.ok(await page.locator('#cal').isVisible());
  assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex');
  assert.deepEqual(ownErrors(errors), []);
  await context.close();
});

test('everyone else is told we will review their application', async () => {
  const { page, context } = await open(NEXT, { init: saveResult(RESULT({ qualified: false })) });
  assert.equal(await page.locator('h1').innerText(), "Thanks, Ana.\nWe'll be in touch.");
  assert.equal(await page.locator('#cal').isVisible(), false);
  await context.close();
});

test('a Free Video result does not unlock the audit calendar', async () => {
  const { page, context } = await open(NEXT, { init: [v => sessionStorage.setItem('portlock.freeVideo', v), RESULT()] });
  await page.waitForURL(LANDING);
  await context.close();
});

for (const [label, size] of Object.entries(SIZES)) {
  test(`full flow on ${label}: apply, land on the calendar, no overflow`, async () => {
    const { page, context, errors } = await open(LANDING, { size });
    await fillApplication(page, { first: 'Brandon', last: 'Chin' });
    await Promise.all([page.waitForURL(NEXT), page.click('#submit')]);
    assert.equal(await page.locator('h1').innerText(), 'You qualify, Brandon!\nPick a time for your 30 min audit call.');
    assert.equal(await overflow(page), 0);
    assert.deepEqual(ownErrors(errors), []);
    await context.close();
  });
}

test('the privacy page mentions channel audit applications', async () => {
  const html = await (await fetch(`${BASE}/privacy`)).text();
  assert.match(html, /free video or channel audit/);
});
