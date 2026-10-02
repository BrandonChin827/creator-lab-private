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
