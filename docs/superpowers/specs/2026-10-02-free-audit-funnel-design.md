# Free YouTube Channel Audit funnel — design

Date: 2026-10-02
Status: approved by Brandon in chat (2026-10-02)

## Goal

A third lead funnel. Founders and coaches apply for a free YouTube channel audit and
strategy call. Brandon reviews the channel before a 30-minute call and walks through
the audit live, then the applicant leaves with a ranked list of fixes and next videos.
If it makes sense, Brandon pitches working together.

The page reuses the `/free-video/` layout and styles. Only the copy, the form questions,
and where the answers are stored change.

Success means:
- A visitor can apply in about a minute.
- Qualified applicants book the 30-minute call on the thank-you page right away.
- Every application lands in its own Notion database and in Kit with its own tags.
- ClickLedger credits the visit, the application, and the booking to the video that
  sent the visitor (same snippet as `/free-video/`).

## Constraints

- **Separate from the other funnels.** New pages, new API route (`/api/audit`), new
  Notion database, new Kit tags. Never use Kit form 9977225 (it sends the skill email).
  The live `/free-video/` funnel keeps its behaviour; only tiny shared-helper exports
  are added to its files.
- **No invented proof.** Only the real About Me numbers (7 figures, 300k+). No dollar
  value on the audit.
- Mobile-first, 320px to 1440px, no horizontal overflow.

## Pages

### Landing page: `/free-audit/`

Same section order and styles as `/free-video/` (it links `/assets/site.css` and
`/free-video/free-video.css`).

1. **Hero.** H1: "Get a Free YouTube Channel Audit" / *"& Strategy Call"* (second line
   in the gradient). Button: **See If You Qualify →** to `#apply`.
2. **Application form** (`#apply`), 7 steps (see Form).
3. **Here's how it works** (zig-zag timeline, 4 steps):
   1. **Apply** — Takes about a minute. Tell us about your channel and your business.
   2. **Book your 30 min call** — If you're a fit, you pick a time right away.
   3. **Live channel audit** — Before the call I go through your channel: titles,
      thumbnails, topics, hooks, upload consistency, and how your videos lead viewers to
      your offer. On the call I walk you through what's holding it back.
   4. **Your growth plan** — You leave with a ranked list of fixes and next videos. If it
      makes sense, we talk about working together.
4. **About Me** — identical to `/free-video/`.
5. **FAQs** (5):
   1. *What do you look at in the audit?* — Packaging (titles and thumbnails), topics and
      positioning, hooks and retention, posting consistency, and whether your channel
      actually leads viewers to your offer.
   2. *How long is the call?* — 30 minutes over video call.
   3. *Do I need an existing channel?* — It helps, but no. If you're starting from zero,
      we'll spend the call on positioning, content pillars, and your first videos.
   4. *Do I need to give you access to my channel?* — No. We review everything public. If
      you want to go deeper on click-through rate and retention, you can share your
      YouTube Studio screen on the call.
   5. *Why is it free?* — To help you grow your YouTube channel and earn your trust. We'll
      point out where you can improve, and see if we can help you get there.
6. Footer (same as `/free-video/`).

### Thank-you page: `/free-audit/next/` (noindex)

- Qualified: "You qualify, {first}!" / *"Pick a time for your 30 min audit call."* — sub:
  "I'll review your channel before we talk." — Calendly inline embed, name and email
  filled in.
- Not qualified: "Thanks, {first}." / *"We'll be in touch."* — "We'll review your
  application and get back to you by email."
- No saved result: back to `/free-audit/`. Storage blocked: the review message.

## Form

One question per screen, progress bar, Back links, honeypot. Same behaviour as
`/free-video/`.

| Step | Question | Answers (value → Notion label) |
|---|---|---|
| 1 | What's your name? | first + last (required) |
| 2 | What's your email? | required |
| 3 | Where's your channel at? | `starting` Just getting started → "Just starting"; `stagnant` Grew but stagnant → "Grew but stagnant"; `growing` Growing, want to scale → "Growing" |
| 4 | Do you have an offer you're selling? | same as Free Video |
| 5 | Are you willing to show up on camera? | same as Free Video |
| 6 | Monthly budget to invest in growth? | same as Free Video |
| 7 | Tell us about your channel | YouTube channel (required; "none yet" is fine), niche (required), biggest YouTube challenge (optional, 1000 chars), which video brought you here (optional) |

**Instant booking:** offer = Yes, camera Yes or Unsure, budget $1,500+. Everyone else is
reviewed by hand from Notion.

## Data

`POST /api/audit` → cleaned with `free-audit/audit-core.mjs`, then saved in parallel:

- **Notion** database "Channel Audit Applications" (env `NOTION_AUDIT_DB`, same
  `NOTION_TOKEN` / "Portlock Site" connection). Columns: Name (title), Email (email),
  Status (select, "New"), Qualified (checkbox), Channel stage, Has offer, On camera,
  Budget (selects), Channel, Niche, Biggest challenge, Found us via, ClickLedger ID,
  UTM source, UTM campaign, UTM content (text), Applied (date), Owner (person, optional
  via `NOTION_OWNER_ID`). A Notion failure returns 502 so the visitor can retry.
- **Kit** subscriber (first name, last_name, youtube_channel, utm fields) + tag
  `audit-applicant` (`KIT_TAG_AUDIT_APPLICANT`), plus `audit-qualified`
  (`KIT_TAG_AUDIT_QUALIFIED`) when qualified. No form. A Kit failure is logged only.

Calendly: a new 30-minute event Brandon creates. The code expects
`https://calendly.com/bentoboi/youtube-channel-audit`; update `CALENDLY_URL` in
`audit-core.mjs` if the slug differs.

The privacy page line becomes "if you apply for a free video or channel audit".

## Testing

Mirror the Free Video tests: rules (`audit-core`), API with fake Notion/Kit, and a
Playwright run-through against the dev-server mock (desktop + mobile, no overflow,
validation, Back, payload, failure, honeypot, thank-you states).
