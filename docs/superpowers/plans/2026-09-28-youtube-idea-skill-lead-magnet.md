# YouTube Idea Skill Lead Magnet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/youtube-idea-skill/` landing page (Hormozi-format two-step opt-in) and the gated `/youtube-idea-skill/access/` page, fully testable locally against a mock `/api/subscribe`.

**Architecture:** Plain static HTML pages next to the flagship `index.html`. They share one stylesheet and one module of pure logic (`lead-core.mjs`: validation, UTMs, gate parsing, `track`). Each page has its own small wiring module (`landing.mjs`, `access.mjs`). The zero-dependency `dev-server.mjs` gains a dev-only mock of `POST /api/subscribe`. Tests: `node:test` unit tests for `lead-core.mjs`, plus a Playwright end-to-end suite that boots the dev server.

**Tech Stack:** HTML, CSS, browser ES modules, Node 24 (`node:test`), Playwright 1.63 (test-only, isolated in `tests/`).

**Spec:** `docs/superpowers/specs/2026-09-28-youtube-idea-skill-lead-magnet-design.md`

## Global Constraints

- Do not modify the flagship `index.html`.
- No ClickLedger snippet, no Kit, no analytics provider, and no video on the new pages.
- All asset URLs are absolute (`/youtube-idea-skill/...`), so the pages work with or without a trailing slash.
- Both pages use `<meta name="robots" content="noindex">` until launch.
- Brand tokens: `--bg #060608`, `--ink #f4f1eb`, `--orange #ff7a1a`, `--purple #8b5cf6`; fonts: Inter (sans) and "Helvetica Neue" (display).
- Headline: "Find What's Breaking Out in Your Niche. Make It Your Next Video."
- CTA copy: step 1 **Let's Start**; step 2 **Get the Free AI Skill**; access page **See How Portlock Creative Works**.
- Proof lines: "Get the skill in your inbox instantly" and "Built by the creator behind 300k+ followers". No testimonials.
- Gate key: `localStorage['portlock.ytSkill'] = JSON.stringify({ firstName, ts })`. UTM key: `sessionStorage['portlock.utm']`.
- User-supplied text is rendered only via `textContent` (never `innerHTML`).
- Test-only dependencies stay in `tests/`. `tests` is added to `.vercelignore`.
- Commits: Brandon approves every commit. Batch the work and ask before committing.

## Review Focus

1. **Double-click on submit:** exactly one request is sent (the button is disabled while sending). This is pinned in the e2e suite, Task 4.
2. **Network failure or a non-JSON/500 response:** an error is shown, there's no redirect, and the button is re-enabled. Pinned by the e2e `fail@example.com` test and the abort test, Task 4.
3. **A name containing HTML (`<img src=x onerror=alert(1)>`):** it is shown literally on the access page and never executed. Pinned in e2e, Task 5.
4. **Corrupt or missing gate value in `localStorage`:** the access page redirects to the landing page and doesn't crash. Unit tests in Task 1 and e2e in Task 5.
5. **URL without a trailing slash (`/youtube-idea-skill`):** the CSS and JS still load. Pinned in e2e, Task 4.

---

### Task 1: Pure logic module + unit tests

**Files:**
- Create: `youtube-idea-skill/lead-core.mjs`
- Create: `tests/package.json`, `tests/lead-core.test.mjs`
- Modify: `.gitignore` (add `node_modules/`), `.vercelignore` (add `tests`)

**Interfaces — Produces:**
- `validateFirstName(value: string): string | null` returns the error message, or null when valid.
- `validateEmail(value: string): string | null`
- `UTM_KEYS = ['source','medium','campaign','content','term']`
- `parseUtms(search: string): Record<string,string>` reads `utm_*` from the query string, trims values, drops empty ones, and caps each at 200 characters.
- `mergeUtms(stored, fresh): Record<string,string>`, where the first touch wins per key.
- `appendUtms(href: string, utms): string` adds `utm_*` params that aren't already present and keeps the hash.
- `GATE_KEY = 'portlock.ytSkill'`, `UTM_STORE_KEY = 'portlock.utm'`
- `readGate(raw: string | null): { firstName: string } | null`
- `track(name: string, props?: object): void` pushes `{ name, props, ts }` onto `globalThis.portlockEvents`.

- [ ] **Step 1: Write failing tests** (`tests/lead-core.test.mjs`). The tests cover:
  - Name: `''` and `'   '` return the required-name error; a 61-character name returns the too-long error; `' José '` is valid.
  - Email: `''` returns the required-email error; `'a@b'`, `'a b@c.com'`, and `'@c.com'` are invalid; `'x@y.co'` is valid.
  - `parseUtms('?utm_source=yt&utm_medium=&x=1')` returns `{source:'yt'}`.
  - `mergeUtms({source:'yt'}, {source:'x', campaign:'c'})` returns `{source:'yt', campaign:'c'}`.
  - `appendUtms('/', {source:'yt'})` returns `'/?utm_source=yt'`; an existing param isn't overwritten; the hash is kept.
  - `readGate`: `null`, `'garbage'`, `'[]'`, and `'{"firstName":1}'` all return null; `'{"firstName":"Ana","ts":1}'` returns `{firstName:'Ana'}`.
  - `track` pushes to `globalThis.portlockEvents`.
- [ ] **Step 2:** Run `node --test tests/lead-core.test.mjs`. Expected: FAIL (the module is missing).
- [ ] **Step 3:** Implement `lead-core.mjs`.
- [ ] **Step 4:** Run `node --test tests/lead-core.test.mjs`. Expected: all PASS.

### Task 2: Dev-server mock for `POST /api/subscribe`

**Files:** Modify `dev-server.mjs`. Before static handling, add a route; also add `tests` to the `IGNORED` watch regex.

**Behavior:** It reads the JSON body (up to 10 KB). Invalid JSON returns 400 `{ok:false}`. `email === 'fail@example.com'` returns 500 `{ok:false}`. Anything else logs `  ✉ subscribe <payload>` and returns 200 `{ok:true}`. A non-POST request returns 405. The route is clearly commented as dev-only; production will be a Vercel function.

- [ ] Covered by the Task 4 e2e tests (valid submission hits the mock and returns ok; `fail@example.com` returns an error).

### Task 3: Landing page markup + styles

**Files:** Create `youtube-idea-skill/index.html` and `youtube-idea-skill/lead.css`.

**Structure** (ported from the approved mockup; the video section is omitted):
- `<head>`: title "Free YouTube Outliers Skill | Portlock Creative", a description, `noindex`, OG tags pointing at `/assets/og-image.png`, `<link rel="stylesheet" href="/youtube-idea-skill/lead.css">`, and `<script type="module" src="/youtube-idea-skill/landing.mjs">`.
- A skip link, the Portlock logo (mark plus wordmark, not linked), and `<main>` with:
  - an `h1` with the second sentence wrapped in `<em>` (gradient);
  - `.fan` (`aria-hidden="true"`) with three `.panel`s (left: ranked, center: breakdown, right: clusters), anonymized handles, and badge text "45.2× the creator's normal views · breakout";
  - a `<p class="sr-only">` describing the preview;
  - `<form class="card" id="optin" novalidate>`:
    - `<div class="step" data-step="1">`: step label "Step 1 of 2", `h2#q1` "What's your first name?", a label and `input#firstName` (`autocomplete="given-name"`, `maxlength=60`, `aria-describedby="firstName-err"`), `p#firstName-err.err` with `aria-live="polite"`, and a button of `type="button"` with id `next`, "Let's Start →".
    - `<div class="step" data-step="2" hidden>`: "Step 2 of 2", `h2` "Where should we send it?", a label and `input#email` (`type=email`, `autocomplete=email`, `inputmode=email`), `p#email-err`, a submit button `#submit` "Get the Free AI Skill →", and a `button#back.linkish` "← Back".
    - A honeypot (visually hidden, `tabindex=-1`, `autocomplete=off`): `input name="company"`.
    - `p#form-err.err` (`role="alert"`), and `p.note` "Free. Takes about 30 seconds."
  - `.proof` with the two lines;
  - `.consent` with `/privacy` and `/terms` links.
- A footer: "© 2026 Portlock Creative".
- CSS: the mockup styles, plus `.err` (color `#ff9b8a`, 13px, min-height reserved), `input[aria-invalid=true]` (border `#ff7a6a`), `.sr-only`, `.skip`, `:focus-visible` rings, `[hidden]{display:none!important}`, the flagship `fall` entrance animation for h1, fan, and card, and a `prefers-reduced-motion` override. Mobile breakpoint at 620px.

- [ ] Verified by the Task 4 e2e suite and screenshots.

### Task 4: Landing page behavior (`landing.mjs`) + e2e suite

**Files:** Create `youtube-idea-skill/landing.mjs` and `tests/e2e.test.mjs`.

**Behavior:**
- On load, merge `parseUtms(location.search)` into the stored UTMs (first touch wins).
- **Let's Start** (or Enter in the name field): validate the name. On error, set `aria-invalid`, show the message, and focus the field. On success, `track('optin_step1')`, hide step 1, show step 2, and focus the email field.
- **Back:** return to step 1 and focus the name field.
- **Submit:**
  - Validate the email. If the honeypot is filled, stop silently.
  - Otherwise disable the button and set its text to "Sending…".
  - `fetch('/api/subscribe', {method:'POST', headers:{'Content-Type':'application/json'}, body, signal: AbortSignal.timeout(15000)})`.
  - Success is `res.ok && (await res.json()).ok === true`: `localStorage.setItem(GATE_KEY, JSON.stringify({firstName, ts: Date.now()}))`, `track('optin_submitted')`, then `location.assign('/youtube-idea-skill/access/')`.
  - Anything else: `track('optin_failed')`, show "Something went wrong. Please try again.", and restore the button.

**e2e tests** (the test file boots `node dev-server.mjs 4199`, waits for the port, and uses Chromium):
1. The landing page loads at 390×844 and 1440×900 with no console errors and no horizontal overflow; it also loads at `/youtube-idea-skill` with no trailing slash and the stylesheet applied.
2. An empty name shows an error and step 2 stays hidden.
3. A valid name, then an empty email shows an error; `not-an-email` shows an error.
4. The happy path from `?utm_source=yt&utm_campaign=test`: the mock receives exactly one request (after a double-clicked submit) with firstName, email, and utm `{source:'yt', campaign:'test'}`, and the page lands on `/youtube-idea-skill/access/`.
5. `fail@example.com` shows the form error, the URL doesn't change, and the button is re-enabled.
6. When the request is aborted (Playwright `route.abort()`), the form error shows and the button is re-enabled.

- [ ] Write the e2e tests and run `node --test tests/`. Expected: FAIL.
- [ ] Implement `landing.mjs`.
- [ ] Run `node --test tests/`. Expected: PASS.

### Task 5: Access page

**Files:** Create `youtube-idea-skill/access/index.html` and `youtube-idea-skill/access.mjs`; extend `tests/e2e.test.mjs`.

**Structure:**
- The same head pattern, with title "Your YouTube Outliers Skill | Portlock Creative".
- The logo, then `<main id="access" hidden>` with:
  - `h1#greet` "You're in." (`access.mjs` sets it to `You're in, ${firstName}.` via `textContent`), and the sub-line "Here's your free YouTube Outliers skill."
  - Card 1, "Install it in one line": text "Paste this into Claude Code:", a `<pre id="install-cmd">Install this skill: https://github.com/BrandonChin827/youtube-outliers-claude-code</pre>` with a `button#copy` "Copy", "Then type `/youtube-outliers`. Claude sets it up with you in chat, in about 2 minutes.", a link "View it on GitHub →" to the repo, and a `<details>` titled "Prefer to install manually?" containing the `git clone … && python3 install.py` command from the README.
  - Card 2, "What you'll need": "Claude Code" (link to https://claude.com/claude-code) and "A ScrapeCreators account (it looks up the YouTube data)" (link to https://app.scrapecreators.com/), plus the line "Claude always tells you the credit cost and waits for your OK before a scan."
  - Card 3, "Three prompts to try": `/youtube-outliers`, `Run a report for the last 3 months`, `add @somecreator`, each with a one-line explanation.
  - The bridge card: the spec copy, and `a#offer.btn` "See How Portlock Creative Works →" with `href="/"`.
- `<noscript>`: "Turn on JavaScript to see your skill, or check your email."

**access.mjs:**
- If `readGate(localStorage.getItem(GATE_KEY))` is null, call `location.replace('/youtube-idea-skill/')`.
- Otherwise set the greeting, unhide `main`, set the offer href with `appendUtms('/', storedUtms)`, and `track('access_viewed')`.
- Copy: `navigator.clipboard.writeText(text)`, then the button reads "Copied!" for 2 seconds and `track('install_copied')`. If the clipboard fails, select the `<pre>` text.
- Offer click: `track('offer_clicked')`.

**e2e tests:**
1. Direct visit with no gate redirects to the landing page; a corrupt gate (`'garbage'`) also redirects.
2. With the gate `{firstName:'<img src=x onerror=alert(1)>'}`, the h1 shows the literal text, no `img` exists inside the h1, and no dialog fires.
3. After the happy path, the greeting shows the name; the offer href contains `utm_source=yt`; Copy (with clipboard permission granted) puts the install line on the clipboard; there are no console errors and no overflow at either size.

- [ ] Write the tests and confirm they FAIL. Implement, then confirm they PASS.

### Task 6: Screenshots + final verification

- [ ] Run `node --test tests/`: everything passes.
- [ ] Save full-page screenshots of the landing page (step 1 and step 2) and the access page at 1440×900 and 390×844 to `.context/screens/`.
- [ ] `git diff --stat origin/main...` shows the flagship `index.html` unchanged.
- [ ] Ask Brandon before committing.

### Task 7: Qualifier steps, progress bar, per-step tracking (added 2026-09-28)

**Files:** Modify `youtube-idea-skill/index.html`, `landing.mjs`, `lead.css`, `dev-server.mjs` (add a `/api/qualify` mock), and `tests/e2e.test.mjs`.

**e2e tests (written first):**
- A valid email submission shows step 3 (no redirect), sets the gate, and sends one subscribe request.
- The progress bar's `aria-valuenow` and the step label match the current step (1 → 2 → 3).
- Posting → Founder → channel "@ana" → Get My Skill: this lands on the access page, and the qualify
  requests carry cumulative answers (the last one is `{youtube:'posting', role:'founder', channel:'@ana'}`).
- "Not yet" → Founder: this lands on the access page and step 5 is never shown.
- Skip at step 3 lands on the access page with no qualify request.
- An aborted qualify request still lands on the access page.
- `portlockEvents` contains `optin_step` for steps 1, 2, 3, and 4 in order.
- The existing tests that expected a redirect after the email now skip the qualifiers first.
