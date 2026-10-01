// End-to-end tests for the YouTube Idea Skill lead magnet.
// Boots the local dev server (which mocks POST /api/subscribe) and drives Chromium.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 4199;
const BASE = `http://localhost:${PORT}`;
const LANDING = `${BASE}/youtube-idea-skill/`;
const ACCESS = `${BASE}/youtube-idea-skill/access/`;
const SIZES = { mobile: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } };

let server, browser;

before(async () => {
  // KIT_API_KEY is blanked so the suite always uses the mock and never creates real Kit subscribers.
  server = spawn(process.execPath, ['dev-server.mjs', String(PORT)], {
    cwd: ROOT, stdio: 'ignore', env: { ...process.env, KIT_API_KEY: '' },
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

// A fresh page that records console errors, uncaught exceptions, and subscribe requests.
async function open(url, { size = SIZES.desktop, gate, permissions } = {}) {
  const context = await browser.newContext({ viewport: size, permissions });
  context.setDefaultTimeout(5000);
  if (gate !== undefined) {
    await context.addInitScript(value => localStorage.setItem('portlock.ytSkill', value), gate);
  }
  const page = await context.newPage();
  const errors = [];
  const subscribes = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (r.url().endsWith('/api/subscribe')) subscribes.push(r); });
  await page.goto(url);
  return { page, context, errors, subscribes };
}

const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

async function completeStep1(page, name = 'Brandon', last = 'Chin') {
  await page.fill('#firstName', name);
  await page.fill('#lastName', last);
  await page.click('#next');
  await page.waitForSelector('#email', { state: 'visible' });
}

const visibleStep = page => page.evaluate(() => document.querySelector('#optin .step:not([hidden])')?.dataset.step);
const step = n => `#optin .step[data-step="${n}"]`;

// Name + email, then wait for the first optional qualifier step.
async function signUp(page, name = 'Ana', email = 'ana@example.com') {
  await completeStep1(page, name);
  await page.fill('#email', email);
  await page.click('#submit');
  await page.waitForSelector(step(3), { state: 'visible' });
}

// ---------- Landing page ----------

for (const [label, size] of Object.entries(SIZES)) {
  test(`landing loads cleanly on ${label} with no overflow`, async () => {
    const { page, context, errors } = await open(LANDING, { size });
    assert.equal(await page.locator('h1').innerText(), "Find What's Breaking Out in Your Niche. Make It Your Next Video.");
    assert.ok(await page.locator('#firstName').isVisible());
    assert.equal(await overflow(page), 0);
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test('landing works without a trailing slash (absolute asset paths)', async () => {
  const { page, context, errors } = await open(`${BASE}/youtube-idea-skill`);
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  assert.equal(bg, 'rgb(6, 6, 8)');
  await page.fill('#firstName', 'Ana');
  await page.fill('#lastName', 'Lee');
  await page.click('#next');
  assert.ok(await page.locator('#email').isVisible(), 'landing.mjs should have loaded');
  assert.deepEqual(errors, []);
  await context.close();
});

test('empty first name shows an error and keeps step 2 hidden', async () => {
  const { page, context } = await open(LANDING);
  await page.click('#next');
  assert.match(await page.locator('#firstName-err').innerText(), /first name/i);
  assert.equal(await page.locator('#firstName').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('#email').isVisible(), false);
  await context.close();
});

test('empty last name shows an error and keeps step 2 hidden', async () => {
  const { page, context } = await open(LANDING);
  await page.fill('#firstName', 'Ana');
  await page.click('#next');
  assert.match(await page.locator('#lastName-err').innerText(), /last name/i);
  assert.equal(await page.locator('#lastName').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'lastName');
  assert.equal(await page.locator('#email').isVisible(), false);
  await context.close();
});

test('both names empty: both errors show and focus goes to first name', async () => {
  const { page, context } = await open(LANDING);
  await page.click('#next');
  assert.match(await page.locator('#firstName-err').innerText(), /first name/i);
  assert.match(await page.locator('#lastName-err').innerText(), /last name/i);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'firstName');
  await context.close();
});

test('empty and malformed emails show an error and send nothing', async () => {
  const { page, context, subscribes } = await open(LANDING);
  await completeStep1(page);
  await page.click('#submit');
  assert.match(await page.locator('#email-err').innerText(), /email/i);
  await page.fill('#email', 'not-an-email');
  await page.click('#submit');
  assert.match(await page.locator('#email-err').innerText(), /doesn't look right/);
  assert.equal(subscribes.length, 0);
  await context.close();
});

test('back returns to step 1 with the name kept', async () => {
  const { page, context } = await open(LANDING);
  await completeStep1(page, 'Ana');
  await page.click('#back');
  assert.ok(await page.locator('#firstName').isVisible());
  assert.equal(await page.locator('#firstName').inputValue(), 'Ana');
  await context.close();
});

test('valid signup sends one request with name, email and UTMs, then shows the optional questions', async () => {
  const { page, context, subscribes } = await open(`${LANDING}?utm_source=yt&utm_campaign=test`);
  await completeStep1(page, '  Ana  ', '  Lee  ');
  await page.fill('#email', 'ana@example.com');
  await page.locator('#submit').dblclick();
  await page.waitForSelector(step(3), { state: 'visible' });
  assert.equal(page.url(), `${LANDING}?utm_source=yt&utm_campaign=test`);
  const gate = await page.evaluate(() => JSON.parse(localStorage.getItem('portlock.ytSkill')));
  assert.equal(gate.firstName, 'Ana', 'the lead is saved and the gate is open before the optional steps');
  assert.equal(subscribes.length, 1, 'double-click must send exactly one request');
  const body = subscribes[0].postDataJSON();
  assert.equal(body.firstName, 'Ana');
  assert.equal(body.lastName, 'Lee');
  assert.equal(body.email, 'ana@example.com');
  assert.deepEqual(body.utm, { source: 'yt', campaign: 'test' });
  assert.match(body.page, /\/youtube-idea-skill\/$/);
  await context.close();
});

test('server error shows the form error, stays put, and re-enables the button', async () => {
  const { page, context } = await open(LANDING);
  await completeStep1(page);
  await page.fill('#email', 'fail@example.com');
  await page.click('#submit');
  await page.waitForSelector('#form-err:not(:empty)');
  assert.match(await page.locator('#form-err').innerText(), /Something went wrong/);
  assert.equal(page.url(), LANDING);
  assert.equal(await page.locator('#submit').isDisabled(), false);
  await context.close();
});

test('network failure shows the form error and re-enables the button', async () => {
  const { page, context } = await open(LANDING);
  await page.route('**/api/subscribe', route => route.abort());
  await completeStep1(page);
  await page.fill('#email', 'ana@example.com');
  await page.click('#submit');
  await page.waitForSelector('#form-err:not(:empty)');
  assert.equal(page.url(), LANDING);
  assert.equal(await page.locator('#submit').isDisabled(), false);
  await context.close();
});

test('filled honeypot sends nothing but looks like success', async () => {
  const { page, context, subscribes } = await open(LANDING);
  await page.evaluate(() => { document.querySelector('.hp input').value = 'spam inc'; });
  await completeStep1(page);
  await page.fill('#email', 'bot@example.com');
  await Promise.all([page.waitForURL(ACCESS), page.click('#submit')]);
  assert.equal(subscribes.length, 0);
  await context.close();
});

test('honeypot is not named like a real profile field, so autofill leaves it alone', async () => {
  const { page, context } = await open(LANDING);
  const hp = await page.evaluate(() => {
    const input = document.querySelector('.hp input');
    return { name: input.name, id: input.id, label: input.closest('label').textContent, autocomplete: input.autocomplete };
  });
  const profileish = /company|org|name|email|phone|tel|address|city|zip|postal|country/i;
  assert.doesNotMatch(hp.name, profileish);
  assert.doesNotMatch(hp.id, profileish);
  assert.doesNotMatch(hp.label, profileish);
  assert.equal(hp.autocomplete, 'off');
  await context.close();
});

test('signup still works on browsers without AbortSignal.timeout (iOS 15)', async () => {
  const context = await browser.newContext();
  context.setDefaultTimeout(5000);
  await context.addInitScript(() => { delete AbortSignal.timeout; });
  const page = await context.newPage();
  await page.goto(LANDING);
  await completeStep1(page, 'Ana');
  await page.fill('#email', 'ana@example.com');
  await page.click('#submit');
  await page.waitForSelector(step(3), { state: 'visible' });
  await context.close();
});

// ---------- Access page ----------

const GOOD_GATE = JSON.stringify({ firstName: 'Ana', ts: 1 });
const FOUNDER_GATE = JSON.stringify({ firstName: 'Ana', ts: 1, role: 'founder' });
const TALLY = 'https://tally.so/r/2EdJOb';
// Third-party scripts (Tally) may log errors when offline; only our own errors count.
const ownErrors = errors => errors.filter(e => !/clickledger|tally/i.test(e));

test('access without a signup redirects to the landing page', async () => {
  const { page, context } = await open(ACCESS);
  await page.waitForURL(LANDING);
  await context.close();
});

test('access with a corrupt gate value redirects to the landing page', async () => {
  const { page, context, errors } = await open(ACCESS, { gate: 'garbage' });
  await page.waitForURL(LANDING);
  assert.deepEqual(errors, []);
  await context.close();
});

test('a name containing HTML is shown as text, never executed', async () => {
  const evil = '<img src=x onerror=alert(1)>';
  const context = await browser.newContext();
  context.setDefaultTimeout(5000);
  await context.addInitScript(v => localStorage.setItem('portlock.ytSkill', v), JSON.stringify({ firstName: evil, ts: 1 }));
  const page = await context.newPage();
  let dialog = false;
  page.on('dialog', d => { dialog = true; d.dismiss(); });
  await page.goto(ACCESS);
  await page.waitForSelector('#main:not([hidden])');
  assert.equal(await page.locator('#soft .greet').innerText(), `Sent! Check your inbox, ${evil}.`);
  assert.equal(await page.locator('.greet img').count(), 0);
  assert.equal(dialog, false);
  await context.close();
});

for (const [label, size] of Object.entries(SIZES)) {
  for (const [variant, gate] of [['pitch', FOUNDER_GATE], ['soft', GOOD_GATE]]) {
    test(`access page (${variant}) renders cleanly on ${label} with no overflow`, async () => {
      const { page, context, errors } = await open(ACCESS, { size, gate });
      await page.waitForSelector('#main:not([hidden])');
      assert.equal(await page.locator(`#${variant}`).isVisible(), true);
      assert.equal(await page.locator(`#${variant === 'pitch' ? 'soft' : 'pitch'}`).isVisible(), false);
      assert.equal(await overflow(page), 0);
      assert.deepEqual(ownErrors(errors), []);
      await context.close();
    });
  }
}

test('founders, coaches, and agencies get the Book a Call pitch', async () => {
  for (const role of ['founder', 'coach', 'agency']) {
    const { page, context } = await open(ACCESS, { gate: JSON.stringify({ firstName: 'Ana', ts: 1, role }) });
    await page.waitForSelector('#pitch:not([hidden])');
    assert.equal(await page.locator('#pitch .greet').innerText(), 'Sent! Check your inbox, Ana.');
    assert.match(await page.locator('#pitch h1').innerText(), /Want a whole YouTube system\s+built around your business\?/);
    const book = page.locator('#pitch .hero a[data-book]');
    assert.equal(await book.getAttribute('href'), TALLY);
    assert.equal((await book.textContent()).replace(/\s+/g, ' ').trim(), 'Book a Call→');
    assert.equal(await page.locator('text=Install this skill').count(), 0, 'no install steps on the page');
    await context.close();
  }
});

test('creators and visitors with no role get the softer bridge, with no Book a Call', async () => {
  for (const gate of [GOOD_GATE, JSON.stringify({ firstName: 'Ana', ts: 1, role: 'creator' }), JSON.stringify({ firstName: 'Ana', ts: 1, role: 'bogus' })]) {
    const { page, context } = await open(ACCESS, { gate });
    await page.waitForSelector('#soft:not([hidden])');
    assert.equal(await page.locator('#soft .greet').innerText(), 'Sent! Check your inbox, Ana.');
    assert.equal(await page.locator('a[data-book]:visible').count(), 0);
    await context.close();
  }
});

test('Book a Call clicks are tracked', async () => {
  const { page, context } = await open(ACCESS, { gate: FOUNDER_GATE });
  await page.waitForSelector('#pitch:not([hidden])');
  await page.evaluate(() => {
    window.Tally = { openPopup() {} }; // stand-in so the click opens the "popup" instead of navigating
    document.querySelector('#pitch .hero a[data-book]').click();
  });
  const names = await page.evaluate(() => portlockEvents.map(e => e.name));
  assert.ok(names.includes('call_clicked'), names.join(', '));
  assert.deepEqual(await page.evaluate(() => portlockEvents.find(e => e.name === 'access_viewed').props), { variant: 'pitch' });
  await context.close();
});

test('full flow: UTMs from the landing page carry onto the Portlock CTA', async () => {
  const { page, context } = await open(`${LANDING}?utm_source=yt&utm_campaign=test`);
  await signUp(page);
  await Promise.all([page.waitForURL(ACCESS), page.click(`${step(3)} .skip`)]);
  await page.waitForSelector('#soft:not([hidden])');
  assert.equal(await page.locator('#soft .greet').innerText(), 'Sent! Check your inbox, Ana.');
  const href = await page.locator('#offer').getAttribute('href');
  assert.equal(href, '/?utm_source=yt&utm_campaign=test');
  const label = (await page.locator('#offer').textContent()).replace(/\s+/g, ' ').trim();
  assert.equal(label, 'See How Portlock Creative Works→');
  await context.close();
});

test('with browser storage blocked, a new subscriber still sees the access page', async () => {
  const context = await browser.newContext();
  context.setDefaultTimeout(5000);
  await context.addInitScript(() => {
    for (const key of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(window, key, { get() { throw new DOMException('denied', 'SecurityError'); } });
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(LANDING);
  await signUp(page);
  await Promise.all([page.waitForURL(ACCESS), page.click(`${step(3)} .skip`)]);
  await page.waitForSelector('#main:not([hidden])');
  assert.deepEqual(errors, []);
  await context.close();
});

// WCAG AA: small text needs a 4.5:1 contrast ratio against the page background.
test('consent, footer, and label text meet WCAG AA contrast', async () => {
  const { page, context } = await open(ACCESS, { gate: GOOD_GATE });
  await page.waitForSelector('#main:not([hidden])');
  const landing = await context.newPage();
  await landing.goto(LANDING);
  const ratios = async (pg, selectors) => pg.evaluate(sels => {
    const rgb = c => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => {
      const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bg = lum([6, 6, 8]);
    return Object.fromEntries(sels.map(sel => {
      const l = lum(rgb(getComputedStyle(document.querySelector(sel)).color));
      return [sel, (Math.max(l, bg) + 0.05) / (Math.min(l, bg) + 0.05)];
    }));
  }, selectors);
  const results = {
    ...(await ratios(landing, ['.consent', '.consent a', 'footer', '.stepnum'])),
    ...(await ratios(page, ['#soft .sent-note', '#soft .closing-inner p', 'footer'])),
  };
  for (const [sel, ratio] of Object.entries(results)) {
    assert.ok(ratio >= 4.5, `${sel} contrast ${ratio.toFixed(2)} < 4.5`);
  }
  await context.close();
});

// ---------- Optional qualifier steps ----------

function recordQualifies(page) {
  const bodies = [];
  page.on('request', r => { if (r.url().endsWith('/api/qualify')) bodies.push(r.postDataJSON()); });
  return bodies;
}

test('progress bar and step label follow the visitor through the steps', async () => {
  const { page, context } = await open(LANDING);
  const state = () => page.evaluate(() => ({
    now: document.querySelector('.progress').getAttribute('aria-valuenow'),
    label: document.querySelector('#optin .step:not([hidden]) .stepnum').textContent,
  }));
  assert.deepEqual(await state(), { now: '1', label: 'Step 1 of 5' });
  await completeStep1(page);
  assert.deepEqual(await state(), { now: '2', label: 'Step 2 of 5' });
  await page.fill('#email', 'ana@example.com');
  await page.click('#submit');
  await page.waitForSelector(step(3), { state: 'visible' });
  assert.deepEqual(await state(), { now: '3', label: 'Step 3 of 5 · Optional' });
  await context.close();
});

test('answering every question sends cumulative answers and opens access', async () => {
  const { page, context } = await open(LANDING);
  const qualifies = recordQualifies(page);
  await signUp(page);
  await page.click(`${step(3)} [data-value="posting"]`);
  await page.waitForSelector(step(4), { state: 'visible' });
  await page.click(`${step(4)} [data-value="founder"]`);
  await page.waitForSelector(step(5), { state: 'visible' });
  await page.fill('#channel', '  @ana  ');
  await Promise.all([page.waitForURL(ACCESS), page.click('#finish')]);
  assert.deepEqual(qualifies.map(q => q.answers), [
    { youtube: 'posting' },
    { youtube: 'posting', role: 'founder' },
    { youtube: 'posting', role: 'founder', channel: '@ana' },
  ]);
  assert.ok(qualifies.every(q => q.email === 'ana@example.com' && q.token === 'dev-token'));
  await page.waitForSelector('#pitch:not([hidden])'); // a founder lands on the Book a Call pitch
  await context.close();
});

test('"Not yet" skips the channel question', async () => {
  const { page, context } = await open(LANDING);
  let sawStep5 = false;
  await signUp(page);
  await page.click(`${step(3)} [data-value="none"]`);
  await page.waitForSelector(step(4), { state: 'visible' });
  const watcher = page.waitForSelector(step(5), { state: 'visible', timeout: 1500 }).then(() => { sawStep5 = true; }, () => {});
  await Promise.all([page.waitForURL(ACCESS), page.click(`${step(4)} [data-value="creator"]`)]);
  await watcher;
  assert.equal(sawStep5, false);
  await page.waitForSelector('#soft:not([hidden])'); // a creator gets the softer bridge
  await context.close();
});

test('skip goes straight to the skill and sends no answers', async () => {
  const { page, context } = await open(LANDING);
  const qualifies = recordQualifies(page);
  await signUp(page);
  await Promise.all([page.waitForURL(ACCESS), page.click(`${step(3)} .skip`)]);
  assert.equal(qualifies.length, 0);
  await context.close();
});

test('a failed answer request never blocks the visitor', async () => {
  const { page, context } = await open(LANDING);
  await page.route('**/api/qualify', route => route.abort());
  await signUp(page);
  await page.click(`${step(3)} [data-value="posting"]`);
  await page.click(`${step(4)} [data-value="agency"]`);
  await Promise.all([page.waitForURL(ACCESS), page.click('#finish')]);
  await context.close();
});

test('every completed step is logged so drop-off can be measured', async () => {
  const { page, context } = await open(LANDING);
  await signUp(page);
  await page.click(`${step(3)} [data-value="inconsistent"]`);
  await page.waitForSelector(step(4), { state: 'visible' });
  const steps = await page.evaluate(() => portlockEvents.filter(e => e.name === 'optin_step').map(e => e.props));
  assert.deepEqual(steps, [
    { step: 1, field: 'name' },
    { step: 2, field: 'email' },
    { step: 3, field: 'youtube' },
  ]);
  await context.close();
});

// ---------- Branding ----------

for (const [label, url, opts] of [['landing', LANDING, {}], ['access', ACCESS, { gate: GOOD_GATE }]]) {
  test(`${label} page shows the Portlock PC logo top-left`, async () => {
    const { page, context } = await open(url, opts);
    await page.waitForFunction(() => document.querySelector('.logo img')?.complete);
    const logo = await page.evaluate(() => {
      const img = document.querySelector('.logo img');
      const box = img.getBoundingClientRect();
      return { src: img.getAttribute('src'), alt: img.alt, loaded: img.naturalWidth > 0, left: box.left, top: box.top, h: box.height, text: document.querySelector('.logo').textContent.trim() };
    });
    assert.equal(logo.src, '/assets/graphics/portlock-logo.png');
    assert.ok(logo.loaded, 'logo image must load');
    assert.ok(logo.left < 40 && logo.top < 40, `logo should sit top-left, got ${logo.left},${logo.top}`);
    assert.ok(logo.h >= 24 && logo.h <= 48, `logo height ${logo.h}`);
    assert.equal(logo.text, '', 'logo only, no spelled-out name');
    assert.equal(logo.alt, 'Portlock Creative');
    await context.close();
  });
}

test('homepage shows the Portlock PC logo top-left, linking to the top', async () => {
  const { page, context, errors } = await open(`${BASE}/`);
  await page.waitForFunction(() => document.querySelector('.logo-float img')?.complete);
  const logo = await page.evaluate(() => {
    const link = document.querySelector('.logo-float'), img = link.querySelector('img'), box = img.getBoundingClientRect();
    return { href: link.getAttribute('href'), label: link.getAttribute('aria-label'), src: img.getAttribute('src'), loaded: img.naturalWidth > 0, left: box.left, top: box.top, h: box.height };
  });
  assert.equal(logo.src, '/assets/graphics/portlock-logo.png');
  assert.ok(logo.loaded);
  assert.equal(logo.href, '#top');
  assert.match(logo.label, /Portlock Creative/);
  assert.ok(logo.left < 40 && logo.top < 40, `logo should sit top-left, got ${logo.left},${logo.top}`);
  assert.ok(logo.h >= 24 && logo.h <= 48, `logo height ${logo.h}`);
  assert.deepEqual(errors.filter(e => !/clickledger|tally/i.test(e)), []);
  await context.close();
});

for (const [label, url, opts] of [['homepage', `${BASE}/`, {}], ['landing', LANDING, {}], ['access', ACCESS, { gate: GOOD_GATE }]]) {
  test(`${label} uses the PC logo as its browser-tab icon`, async () => {
    const { page, context } = await open(url, opts);
    const icons = await page.evaluate(() => [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map(l => `${l.rel} ${l.getAttribute('href')}`));
    assert.ok(icons.includes('icon /assets/graphics/portlock-icon.png'), icons.join(', '));
    assert.ok(icons.includes('apple-touch-icon /assets/graphics/portlock-icon.png'), icons.join(', '));
    const res = await page.request.get(`${BASE}/assets/graphics/portlock-icon.png`);
    assert.equal(res.status(), 200);
    await context.close();
  });
}

for (const [label, url, sel, opts] of [['homepage', `${BASE}/`, '.logo-float img', {}], ['landing', LANDING, '.logo img', {}], ['access', ACCESS, '.logo img', { gate: GOOD_GATE }]]) {
  test(`${label} logo is smaller and softer on mobile`, async () => {
    const { page, context } = await open(url, { ...opts, size: SIZES.mobile });
    const m = await page.evaluate(s => {
      const img = document.querySelector(s);
      return { h: img.getBoundingClientRect().height, opacity: Number(getComputedStyle(img).opacity) };
    }, sel);
    assert.ok(m.h <= 26, `mobile logo height ${m.h}`);
    assert.ok(m.opacity < 1, `mobile logo opacity ${m.opacity}`);
    await context.close();
  });
}

// ---------- Privacy and Terms ----------

for (const path of ['/privacy', '/terms']) {
  for (const [label, size] of Object.entries(SIZES)) {
    test(`${path} loads cleanly on ${label} with no overflow`, async () => {
      const { page, context, errors } = await open(`${BASE}${path}`, { size });
      assert.equal(await page.locator('h1').count(), 1);
      assert.ok(await page.locator('a[href^="mailto:brandon@portlockcreative.com"]').count() > 0);
      assert.ok((await overflow(page)) <= 0);
      assert.deepEqual(errors, []);
      await context.close();
    });
  }
}

test('every page links to Privacy and Terms, and the links resolve', async () => {
  for (const url of [`${BASE}/`, LANDING]) {
    const { page, context } = await open(url);
    for (const path of ['/privacy', '/terms']) {
      assert.ok(await page.locator(`a[href="${path}"]`).count() > 0, `${url} links to ${path}`);
      assert.equal((await fetch(`${BASE}${path}`)).status, 200);
    }
    await context.close();
  }
});
