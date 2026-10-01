# YouTube Idea Skill Lead Magnet — Design

**Date:** 2026-09-28
**Status:** Approved 2026-09-28
**Branch:** `BrandonChin827/youtube-ideation-lead-magnet`

## Goal

Collect email addresses from founders and creators by giving away the free
YouTube Outliers Claude Code skill. Visitors arrive from YouTube, understand the
offer in about five seconds, give a first name and email, and get the skill.

This phase builds the landing and access pages and tests them locally.
**Kit is not connected, and nothing is merged or deployed in this phase.**

## The lead magnet

The skill is public at <https://github.com/BrandonChin827/youtube-outliers-claude-code>.
Only make claims the repository README supports:

- It checks creators you follow and scores each long-form video against that
  creator's typical views at the same age (2x = notable, 5x = breakout).
- It groups breakouts by topic and breaks down the five that best fit your channel:
  the hook, why it worked, and three title ideas written for your channel.
- It covers this week, this month, 3 months, or 6 months.
- It saves reports locally, can also publish them to Notion, and sets itself up in chat.

It requires Claude Code and a ScrapeCreators account. That requirement is stated
on the access page and in email 1, not on the landing page. Never promise views,
leads, or growth.

## Pages

Two static pages in the existing Vercel project, next to the flagship `index.html`:

| URL | File |
|---|---|
| `/youtube-idea-skill/` | `youtube-idea-skill/index.html` |
| `/youtube-idea-skill/access/` | `youtube-idea-skill/access/index.html` |

Shared styles and scripts live in `youtube-idea-skill/lead.css` and
`youtube-idea-skill/lead.js`. The flagship `index.html` is not changed.
ClickLedger is not added to these pages for now.

### Landing page (Hormozi `/roadmap` format, Portlock styling)

Top to bottom, with no nav, one CTA, and no testimonials:

1. **Logo:** a small Portlock Creative mark, not linked.
2. **Headline:** "Find What's Breaking Out in Your Niche. Make It Your Next Video."
   The second sentence is in the orange→purple gradient.
3. **Fanned 3-panel mockup:** HTML/CSS panels built from the real 2026-09-22
   report, with creator handles anonymized (`@creator_one`, …):
   - left: the ranked outliers list (score · views · age · label);
   - center: one top-five breakdown (Hook / Why it worked / Titles for you);
   - right: topic clusters.
   The center panel is in front; the side panels are angled behind it. On mobile
   the side panels shrink and tuck behind the center, as on Hormozi's page. The
   panels are decorative (`aria-hidden`) and a short visually hidden caption
   describes them. The mockup is kept compact (about 85% of the approved first
   mockup's size), so the form card starts high on the page.
4. **Form card with a progress bar** (a thin gradient bar above the "Step X of 5" label).
   Everything stays inside the card; nothing covers the page.
   - Step 1: "What's your name?" with First name and Last name fields (both required)
     → button **Let's Start**.
   - Step 2: "Where should we send it?" (email) → button **Get the Free AI Skill**,
     with a small "Back" link. **Submitting this step saves the lead.**
   - Steps 3–5 are optional qualifiers, labelled "Step N of 5 · Optional", each with a
     "Skip and get the skill →" link that goes straight to the access page:
     - Step 3: "Do you have a YouTube channel?" with tap answers: Yes, posting
       regularly (`posting`) / Yes, but not consistently (`inconsistent`) / Not yet (`none`).
     - Step 4: "What best describes you?" with tap answers: Founder (`founder`) /
       Coach or consultant (`coach`) / Creator (`creator`) / Agency (`agency`).
       If step 3 was `none`, this step finishes the flow.
     - Step 5: "What's your YouTube channel?", an optional text field (up to 200
       characters, e.g. "@handle or link") → **Get My Skill**.
   - Tapping an answer advances immediately. There is no Back button after the
     email step, because the lead is already saved.
   - Under the card: "Free. Takes about 30 seconds."
5. **Two proof lines with icons:** "Get the skill in your inbox instantly" and
   "Built by the creator behind 300k+ followers" (the same claim as the homepage).
6. **Consent line:** "By signing up you agree to receive emails from Portlock
   Creative. Unsubscribe anytime." with Privacy and Terms links.
7. Copyright footer. (A "See how the skill works" YouTube section below the consent
   line was designed but is deferred until the video exists.)

Visual language: the flagship tokens (`--bg #060608`, `--ink`, `--orange #ff7a1a`,
`--purple #8b5cf6`, Inter plus Helvetica Neue display) and the flagship
`btn-primary` gradient pill. The form card has a thin gradient border.

### Access page

Shown only after a successful signup (see Gating). The email delivers the skill and
the install steps, so this page sells Portlock Creative instead (revised 2026-09-30).
Every subscriber sees the same page, built from the homepage's styles and scripts
(`/assets/site.css`, `/assets/site.js`):

1. A "Sent! Check your inbox, {firstName}." card with a note that the skill and
   setup steps were emailed (and to check spam or Promotions).
2. "While you're here", then the headline "Want a whole YouTube system
   *built around your business?*", a short subline, and **Book a Call**.
3. The homepage's program diagram, "How our program works", "Why us?", FAQ,
   closing CTA, and mobile sticky CTA.

Every Book a Call button opens the Tally screener popup (`2EdJOb`), which hands
qualified people to Calendly. If the popup can't load, the link opens the full Tally
page. There are no install steps on the page.

## Behaviour

### Form

- First and last name are required (trimmed, 1–60 characters each). Email is required and must pass
  a standard format check. Errors appear inline, are linked with
  `aria-describedby`, and move focus to the first invalid field.
- Submitting disables the button and shows "Sending…". On success, the gate is
  set and the card moves to step 3. On failure it shows "Something went
  wrong. Please try again." and re-enables the button. It never redirects on failure.
- A hidden honeypot field is included. Submissions with it filled are dropped silently.

### Submission contract

`POST /api/subscribe` with JSON
`{ firstName, lastName, email, utm: { source, medium, campaign, content, term }, referrer, page }`.
Success means HTTP 200 with `{ ok: true }`. Anything else is a failure.

In this phase, only `dev-server.mjs` answers this route. It logs the payload to the
terminal and returns `{ ok: true }`. It returns a 500 for the email
`fail@example.com`, so the error state can be tested. In production the route does
not exist yet, so the form shows its error state. This is why these pages are not
deployed until the Kit function exists.

### Qualifier answers

`POST /api/qualify` with JSON `{ email, answers: { youtube?, role?, channel? } }`.
It is sent after each answer with all answers so far, so a visitor who leaves
partway still counts. These requests never block the visitor: failures are ignored
and the flow continues. Finishing or skipping goes to the access page. Later the
Kit function turns these into tags and custom fields. Before launch, that function
must make sure only the person who just subscribed can update their own answers
(for example with a short-lived token returned by `/api/subscribe`).

The dev server mocks this route the same way as `/api/subscribe`.

### Gating (soft)

After a successful submission, `localStorage` stores
`portlock.ytSkill = { firstName, ts }`. The access page checks this flag first and
redirects to the landing page if it is missing. The repo is public, and the email
also delivers the skill, so a soft gate is enough.

### UTMs

When someone lands, `utm_*` parameters from the URL are saved in `sessionStorage`,
and the first values win. They are sent with the submission.

### Analytics

`track(name, props)` in `lead-core.mjs` is a no-op hook until a provider is chosen. Events:
`optin_step` (`{ step, field }`, logged each time a step is completed, so drop-off
can be measured per step), `optin_submitted`, `optin_failed`, `qualify_skipped`
(`{ step }`), `qualify_completed`, `access_viewed`, `call_clicked`.

## Accessibility and responsiveness

- Semantic landmarks, one `h1`, labelled inputs, visible focus rings, and form
  errors announced with `aria-live`.
- Works from 320px to 1440px with no horizontal overflow. The form card is full
  width on mobile.
- Motion is limited to the entrance fade and the mockup fan. It is off under
  `prefers-reduced-motion`.
- `noindex` stays on both pages until launch. The landing page gets its own title,
  description, and OG tags.

## Verification (this phase)

Run with `node dev-server.mjs` and a headless browser at 390×844 and 1440×900:

- Both pages load with no console errors and no horizontal overflow.
- An empty name, an empty email, and a malformed email each show the right error.
- A valid submission reaches the dev route with the name, email, and UTMs, then
  lands on the access page with the name shown.
- `fail@example.com` shows the error state and stays on the form.
- Visiting the access page directly without the flag redirects to the landing page.
- The Copy button copies the install prompt, and the Portlock CTA carries the UTMs.
- Desktop and mobile screenshots of both pages are saved to `.context/`.

## Out of scope for this phase (next phases)

- Kit: the API key, form, tags, sequence, the real `/api/subscribe` Vercel function,
  a real test subscriber, and the five emails.
- The Tally → Kit "Applied" webhook.
- Choosing an analytics provider.
- Privacy and terms pages. Those links point to `/privacy` and `/terms`, which
  don't exist yet and must exist before launch.
- The tutorial video (landing and access pages), YouTube/X follow buttons, and a
  second lead-magnet page.
- Merging and deploying.
