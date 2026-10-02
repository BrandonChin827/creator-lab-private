# Free $1,000 YouTube Video funnel — design

Date: 2026-10-01
Status: draft, waiting for Brandon's review

## Goal

A second lead funnel, separate from the YouTube Idea Skill. Qualified founders and
coaches apply for a free done-for-you YouTube video and strategy. Brandon gets on a
15-minute call, decides whether to make the video, and uses it to win a long-term
client. The free video gets Portlock's foot in the door, and the goal is retention.

The page copies the format, section order, and layout of mediaflowhq.com
(reference screenshots in `.context/mediaflow/`), but uses Portlock branding.

Success means:
- A visitor from one of Brandon's videos can apply in about a minute.
- Qualified applicants book a call on the thank-you page without being contacted first.
- Every application lands in a Notion database Brandon can work from, and in Kit.
- ClickLedger credits the visit, the application, and the booked call to the video
  that sent the visitor.

## Constraints

- **Separate from the skill funnel.** New page, new API route, new Kit tags. Never use
  Kit form 9977225, because it triggers the skill delivery email. The skill pages and
  `/api/subscribe` + `/api/qualify` are not changed.
- **No invented proof.** Only real numbers (7 figures from the personal brand, 300k+
  followers), and real client screenshots if he supplies them.
  Sections without real material are left out, not filled with placeholders.
- **The $1,000 value** is what one done-for-you video with strategy is worth to a
  Portlock client. Brandon chose to show it in the headline.
- **Portlock branding, built like the homepage:** the page uses `/assets/site.css`
  and `/assets/site.js`, the same as the homepage and the skill thank-you page. That
  gives it the drifting glow and grid background, the gradient accent line above
  section titles, the `btn-primary` buttons with the circling light and sliding arrow,
  cards whose border lights up following the cursor, scroll-in reveals, the homepage
  stat cards, and the numbered FAQ accordion. The form card styles come from
  `youtube-idea-skill/lead.css`. PC monogram logo, no wordmark. `site.js` currently
  expects `.hero` and `.closing` elements, so guard those lookups so pages without a
  closing section still work.
- **No sales video yet.** The hero ships without one. The layout leaves room for a
  16:9 video above the button, to be added once Brandon records it.
- Mobile-first, 320px to 1440px, with no horizontal overflow.

## Pages

### Landing page: `/free-video/`

Section order follows MediaFlow:

1. **Hero.** Soft orange→purple glow at the top (Portlock's version of MediaFlow's
   red glow). PC logo top left.
   - H1, on two lines: "Get a $1,000 YouTube Video" / "& Content Plan for Free"
     (second line in the gradient). Same font, size, weight, letter spacing, and
     gradient as the homepage hero headline.
   - Button: **See If You Qualify →**, which scrolls to the form.
   - Later: the sales video sits between the sub and the button.
2. **Application form** (anchor `#apply`). A card with a progress bar, one question
   per screen (see Form).
3. **"Here's how it works."** A vertical timeline with numbered gradient dots, cards
   alternating left and right on desktop and stacked on mobile:
   1. **Quick 15 min call.** We learn about you, your business, and what you want from
      YouTube, then walk you through how the free video works.
   2. **Strategy & content blueprint.** Before you film, we build your YouTube strategy
      and a content blueprint: your positioning, content pillars, and a list of video
      ideas. Then we write the title, script, and thumbnail idea for your first video.
   3. **You film.** Follow the script. We'll show you how to film it, and a phone is fine.
   4. **Video reveal.** We hand you the finished video, ready to post. If it makes sense,
      we talk about working together long-term.
4. **About Me** (`#about`). Built like the homepage's "Why us?" section, with the
   heading "About Me" and the same subline ("Personalized specific strategy, hands-on
   implementation, and done-for-you AI workflows."). It has the two stat cards (the page's
   bigger centred version: "**7 figures**" generated through my personal brand,
   "**300k+**" followers across platforms), Brandon's story card and photo
   (`/assets/photos/founder.jpg`), and a **See If You Qualify →** button to `#apply`
   (not the homepage's Tally "Book a Call"). Client result screenshots are added only
   if Brandon supplies real ones.
5. **FAQs.** An accordion with 6 questions:
   - *How long does the video take?* "Usually 3 to 7 days after you send us your
     footage, depending on how complex the video is."
   - *What if I don't want to work with you after the free video?* "No hard feelings.
     You keep the video and can post it on your channel."
   - *What's the catch?* "No catch. We make one video for free, and if it makes sense,
     we'll show you how we could keep working together."
   - *I've never done YouTube before. Is that a problem?* "Not at all. We'll guide you
     through the whole thing."
   - *Do I need a professional camera or microphone?* "No. A phone is enough."
   - *Why would you make this for free?* "Because the best way to show you what we can
     do is to do it."
6. **Footer.** PC logo, "© 2026 Portlock Creative", and Privacy and Terms links.
   Social icons are added only if Brandon sends the links.

A consent line sits under the form: "By applying you agree to receive emails from
Portlock Creative. Unsubscribe anytime." with Privacy and Terms links.

The landing page is indexable at launch, with its own title, description, and OG tags.

### Thank-you page: `/free-video/next/`

`noindex`. It reads the result saved by the form (see Gating) and shows one of two
outcomes:

- **Qualified:** "You qualify, {firstName}! Pick a time for your 15 min call." Below it
  is the Calendly inline embed for Brandon's 15 minute event
  (`https://calendly.com/bentoboi/youtube-vide-strategy-consultation`), with name and
  email pre-filled through Calendly's `name` and `email` URL parameters.
- **Not qualified:** "Thanks, {firstName}. We'll review your application and get back
  to you by email."

To see each one while testing: apply with a budget of "$1,000–$2,500" (qualified) or
"Under $1,000" (not qualified). There are no hidden preview switches.

## Form

One question per screen, with a progress bar and a Back link. Choice screens advance
when an answer is tapped.

| # | Question | Type | Required |
|---|---|---|---|
| 1 | What's your name? | First + last name | Yes |
| 2 | What's your email? | Email | Yes |
| 3 | What's your experience with YouTube so far? | Starting from zero / Grew but stagnant / Other | Yes |
| 4 | Do you run a business that's making revenue? | Yes / Not yet | Yes |
| 5 | Do you have an offer you actively sell? | Yes / Not yet | Yes |
| 6 | Are you willing to show up on camera? | Yes / No / Unsure | Yes |
| 7 | Monthly budget to invest in growth? | Under $1,000 / $1,000–$2,500 / $2,500–$5,000 / $5,000+ | Yes |
| 8 | Tell us about your business | Niche (text, required), YouTube channel link (optional), "Why do you want a free video?" (text, optional) | Partly |

Step 8's button is **Submit Application →**. While sending it shows "Sending…", and on
failure it shows "Something went wrong. Please try again." and stays on the form.
Name and email validation reuses `youtube-idea-skill/lead-core.mjs`. A hidden
honeypot field is included, and submissions with it filled are dropped silently.

**Qualification rule** (worked out on the server, and returned to the page):
business = Yes **and** offer = Yes **and** camera ≠ No **and** budget ≥ $1,000.

## Data flow

```
Browser ──POST /api/apply──▶ Vercel function ──▶ Notion (create row)    must succeed
                                               └─▶ Kit (upsert + tags)  best effort
        ◀── { ok, qualified } ──
        → saves result in sessionStorage → /free-video/next/
```

`POST /api/apply` JSON:
`{ firstName, lastName, email, youtube, business, offer, camera, budget, niche,
channel, why, utm: {source, medium, campaign, content, term}, ckid, hp }`.
The server checks every choice against the allowed list and caps text lengths
(niche 200, channel 200, why 1,000). Kit and Notion calls each time out after 5s,
matching PR #2.

- **Notion is the main record.** If the Notion write fails, the API returns 502 and the
  visitor can try again. If the Kit write fails, it's logged and the visitor still
  gets `ok`.
- **Kit:** create or update the subscriber (first name, `last_name`, `youtube_channel`,
  `utm_*` fields), then add the tag **free-video-applicant**, plus
  **free-video-qualified** when qualified. The tag IDs come from the env vars
  `KIT_TAG_APPLICANT` and `KIT_TAG_QUALIFIED`. No form, so no skill email. Before launch,
  check that no existing Kit automation fires for these subscribers.

### Notion database: "Free Video Applications"

| Property | Type |
|---|---|
| Name | Title |
| Email | Email |
| Status | Select: New (default), Call booked, Video made, Client, Not a fit |
| Qualified | Checkbox |
| YouTube experience, Revenue business, Has offer, On camera, Budget | Select (Notion doesn't allow commas in select options, so Budget is stored as Under $1k, $1k–$2.5k, $2.5k–$5k, $5k+) |
| Niche, Why | Text |
| Channel | Text (so "@handle" works as well as a link) |
| ClickLedger ID, UTM source, UTM campaign, UTM content | Text |
| Applied | Date |
| Owner | Person (set to Brandon) |

There's a Table view (all applications, newest first) and a Board view grouped by
Status. The API uses an internal Notion integration: `NOTION_TOKEN` and
`NOTION_APPLICATIONS_DB` live in `.env.local` and Vercel, and are never committed.

**New-application alerts:** setting Owner to Brandon should send him a Notion
notification for each new row. Verify this during the build. If it doesn't work on
his plan, bring back options rather than adding a mail service. Calendly already
emails him for every booked call.

## Tracking (ClickLedger)

- The ClickLedger snippet (same token as `index.html`) goes on both pages.
- On submit, the page calls `window.tk?.identify(email, fullName)` to tie the visitor
  to the application. The snippet also catches the form's submit event.
- ClickLedger tags the Calendly embed by itself (the `utm_content` parameter). Brandon's
  paid Calendly plan sends the booking webhook to ClickLedger. Check the webhook is
  connected in ClickLedger before launch.
- The ClickLedger visitor ID (`tk_vid` in localStorage) is sent as `ckid` and saved in
  Notion, so any applicant can be looked up in ClickLedger. ClickLedger shows the video
  name. Notion only shows it if the tracked links carry `utm_content`; check this with
  one real tracked link during the build.

## Gating

After a successful submit, `sessionStorage` stores
`portlock.freeVideo = { firstName, lastName, email, qualified }`. The thank-you page
reads it to show the right outcome and pre-fill Calendly. If it's missing, the page
sends the visitor back to `/free-video/`. A soft gate is enough, because the Calendly
link isn't secret.

## Other changes

- **Privacy page:** add Notion to the list of services ("Notion (storing
  applications)"), and add business details from applications to "What we collect".
- **Rate limit:** the Hobby plan allows one Vercel Firewall rate-limit rule. Extend the
  existing "Signup rate limit" rule (5 requests per IP per 600s) to cover
  `/api/apply` as well as `/api/subscribe`.
- **Dev server:** add an `/api/apply` route. It's a mock unless `NOTION_TOKEN` is set,
  and `fail@example.com` returns 500.

## Launch

The work stays on this branch. Pushing to `main` deploys portlockcreative.com
immediately, so merging is the launch. Before merging:

1. Notion database created and the integration connected; Vercel env vars set for
   Production and Preview.
2. Kit tags created; no existing automation fires.
3. ClickLedger Calendly webhook connected.
4. A preview-deploy test of both outcomes: Notion row, Kit tags, Calendly booking,
   and the ClickLedger events all check out.
5. Brandon says launch.

## Testing

- Unit tests: the qualification rule, input validation, and the apply handler with
  mocked Kit and Notion (success, Notion failure → 502, Kit failure → still ok,
  honeypot, bad choices rejected).
- End-to-end tests (Playwright, 390×844 and 1440×900): both outcomes from start to
  finish against the dev mock, validation errors, the error state, a direct visit to
  the thank-you page redirecting back, no console errors, and no horizontal overflow.
- Desktop and mobile screenshots of both pages, shown to Brandon after each change.

## Inputs still needed from Brandon

- Optional: social links for the footer, and real client screenshots for the proof
  section.

## Out of scope

- The sales video (added when recorded).
- Syncing Calendly bookings back to Notion's Status (Brandon updates Status by hand).
- Follow-up email sequences for applicants.
- Any change to the skill funnel, including adding ClickLedger to it.
