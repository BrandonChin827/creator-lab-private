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

// A fresh page with third-party scripts blocked, recording errors and /api/apply requests.
async function open(url, { size = SIZES.desktop, init } = {}) {
  const context = await browser.newContext({ viewport: size });
  context.setDefaultTimeout(5000);
  await context.route(/clickledger\.io|calendly\.com/, route => route.abort());
  // init is a function, or [function, arg] when it needs a value (init scripts can't see outer variables).
  if (init) await context.addInitScript(...[].concat(init));
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
  assert.match(await page.locator('#submit').innerText(), /Submit Application/i); // innerText applies the uppercase styling
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

const saveResult = value => [v => sessionStorage.setItem('portlock.freeVideo', v), value];
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

test('the privacy page mentions Notion and the application answers', async () => {
  const html = await (await fetch(`${BASE}/privacy`)).text();
  assert.match(html, /Notion \(storing applications\)/);
  assert.match(html, /budget/);
});

for (const [label, size] of Object.entries(SIZES)) {
  test(`double-clicking an answer only answers that question (${label})`, async () => {
    const { page, context } = await open(LANDING, { size });
    await page.fill('#firstName', 'Ana');
    await page.fill('#lastName', 'Diaz');
    await page.click(nextButton(1));
    await page.fill('#email', 'ana@example.com');
    await page.click(nextButton(2));
    // The next step's options sit where this step's were, so a second click would answer it.
    await page.locator('.choice[data-field="youtube"][data-value="zero"]').dblclick();
    assert.equal(await visibleStep(page), '4');
    assert.equal(await page.locator('.choice[data-field="business"][aria-pressed="true"]').count(), 0);
    await page.locator('.choice[data-field="business"][data-value="yes"]').dblclick();
    assert.equal(await visibleStep(page), '5');
    assert.equal(await page.locator('.choice[data-field="offer"][aria-pressed="true"]').count(), 0);
    await context.close();
  });
}

test('the calendar fits a 320px-wide phone', async () => {
  const { page, context } = await open(NEXT, { size: { width: 320, height: 640 }, init: saveResult(RESULT()) });
  const box = await page.locator('#cal').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 320, JSON.stringify(box));
  await context.close();
});
