# Free YouTube Channel Audit funnel — plan

Spec: `docs/superpowers/specs/2026-10-02-free-audit-funnel-design.md`

Approach: copy the `/free-video/` files and adapt them. Small helpers that are identical
are exported from the Free Video files and imported, not duplicated. Run
`npm test --prefix tests` after each task.

## Task 1 — Rules: `free-audit/audit-core.mjs`
- Export `RESULT_KEY = 'portlock.freeAudit'`, `CALENDLY_URL`, `LIMITS`, `CHOICES`
  (`stage`, `offer`, `camera`, `budget`; offer/camera/budget reuse Free Video's labels).
- `isQualified`: offer yes, camera not no, budget ≥ $1,500.
- `validateNiche` (reused), `validateChannel`.
- `cleanApplication`: name, email, channel, niche required; challenge/source optional.
- `calendlyUrl` and `readResult`: reuse Free Video's (give `calendlyUrl` an optional
  base URL argument).
- Tests: `tests/audit-core.test.mjs`.

## Task 2 — API: `api/_audit.mjs` + `api/audit.mjs`
- Export `readJson`, `postJson`, `richText`, `select` from `api/_apply.mjs` and reuse them.
- `notionProperties` for the audit columns; `saveToKit` with the audit tags.
- Env: `NOTION_TOKEN`, `NOTION_AUDIT_DB`, `KIT_API_KEY`, `KIT_TAG_AUDIT_APPLICANT`,
  `KIT_TAG_AUDIT_QUALIFIED` (+ optional `NOTION_OWNER_ID`).
- Tests: `tests/audit-api.test.mjs`.

## Task 3 — Dev server
- `/api/audit` route: real handler when `NOTION_TOKEN` is set, otherwise a mock using the
  audit rule (`fail@example.com` → 500). Share the body-reading code with `/api/apply`.

## Task 4 — Landing page: `free-audit/index.html` + `free-audit/audit.mjs`
- Copy from `/free-video/`, swap the copy per the spec (hero, 7-step form, how it works,
  About Me unchanged, 5 FAQs).
- `audit.mjs`: the Free Video form script adapted (7 steps, channel + niche checks,
  `/api/audit`, `/free-audit/next/`).
- Screenshots (desktop + mobile) for Brandon.

## Task 5 — Thank-you page: `free-audit/next/`
- Copy and adapt: 30 min copy, audit Calendly URL, audit result key.

## Task 6 — Privacy + e2e tests
- Privacy: "if you apply for a free video or channel audit".
- `tests/free-audit.e2e.test.mjs` mirroring `free-video.e2e.test.mjs`.

## Task 7 — Live setup (with Brandon, step by step)
1. Brandon creates the 30 min Calendly event (`bentoboi/youtube-consultation`).
2. Create the Notion DB "Channel Audit Applications" with the spec's columns (Status is a
   plain Select) and share it with the "Portlock Site" connection.
3. Create Kit tags `audit-applicant` and `audit-qualified`.
4. Vercel env vars (Production + Preview): `NOTION_AUDIT_DB`, `KIT_TAG_AUDIT_APPLICANT`,
   `KIT_TAG_AUDIT_QUALIFIED`.
5. Add `/api/audit` to the "Signup rate limit" firewall rule.
6. Live local test, then commit, PR, merge after Brandon's go-ahead, and a production test.
