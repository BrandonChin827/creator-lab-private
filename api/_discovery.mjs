// Server side of the Discovery Call application (the homepage "Book a Call" form): saves
// each application to Notion (one row per application) and Kit (answers on the subscriber,
// so we can email them), then tells the page whether the applicant qualifies.
// The dev server and tests call handleDiscovery directly.
// Files starting with "_" in api/ are not turned into routes by Vercel.
import { cleanApplication, isQualified, CHOICES } from '../apply/discovery-core.mjs';
import { json, readJson, postJson, richText, select } from './_apply.mjs';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const KIT_API = 'https://api.kit.com/v4';
const REQUIRED_ENV = ['NOTION_TOKEN', 'NOTION_DISCOVERY_DB', 'KIT_API_KEY', 'KIT_TAG_DISCOVERY_APPLICANT', 'KIT_TAG_DISCOVERY_QUALIFIED'];

// Notion rejects commas in select options, so budgets are shortened there.
const NOTION_BUDGET = { under1000: 'Under $1k', '1k': '$1k–$2.5k', '2.5k': '$2.5k–$5k', '5k': '$5k+' };

// One row in the "Discovery Call Applications" database.
export function notionProperties(app, qualified, now, ownerId) {
  const properties = {
    Name: { title: [{ text: { content: `${app.firstName} ${app.lastName}` } }] },
    Email: { email: app.email },
    Status: select('New'),
    Qualified: { checkbox: qualified },
    'YouTube experience': select(CHOICES.experience[app.experience]),
    'Has revenue': select(CHOICES.revenue[app.revenue]),
    'Has offer': select(CHOICES.offer[app.offer]),
    'On camera': select(CHOICES.camera[app.camera]),
    Budget: select(NOTION_BUDGET[app.budget]),
    'Start timeline': select(CHOICES.timeline[app.timeline]),
    Niche: richText(app.niche),
    'UTM source': richText(app.utm.source),
    'UTM campaign': richText(app.utm.campaign),
    'UTM content': richText(app.utm.content),
    Applied: { date: { start: new Date(now).toISOString() } },
  };
  if (ownerId) properties.Owner = { people: [{ id: ownerId }] };
  return properties;
}

function saveToNotion(app, qualified, env, fetchImpl, now) {
  return postJson(fetchImpl, `${NOTION_API}/pages`,
    { Authorization: `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION },
    { parent: { database_id: env.NOTION_DISCOVERY_DB }, properties: notionProperties(app, qualified, now, env.NOTION_OWNER_ID) });
}

// Kit custom fields for each answer, saved as the label shown on the form.
export function kitFields(app) {
  const fields = {
    last_name: app.lastName,
    yt_experience: CHOICES.experience[app.experience],
    has_revenue: CHOICES.revenue[app.revenue],
    has_offer: CHOICES.offer[app.offer],
    on_camera: CHOICES.camera[app.camera],
    monthly_budget: CHOICES.budget[app.budget],
    niche: app.niche,
    start_timeline: CHOICES.timeline[app.timeline],
  };
  for (const key of ['source', 'medium', 'campaign', 'content']) {
    if (app.utm[key]) fields[`utm_${key}`] = app.utm[key];
  }
  return fields;
}

// Create or update the subscriber, then tag them. No form, so no skill email.
async function saveToKit(app, qualified, env, fetchImpl) {
  const headers = { 'X-Kit-Api-Key': env.KIT_API_KEY };
  await postJson(fetchImpl, `${KIT_API}/subscribers`, headers, { email_address: app.email, first_name: app.firstName, fields: kitFields(app) });
  const tags = qualified ? [env.KIT_TAG_DISCOVERY_APPLICANT, env.KIT_TAG_DISCOVERY_QUALIFIED] : [env.KIT_TAG_DISCOVERY_APPLICANT];
  await Promise.all(tags.map(id => postJson(fetchImpl, `${KIT_API}/tags/${id}/subscribers`, headers, { email_address: app.email })));
}

// ---------- POST /api/discovery ----------

export async function handleDiscovery(request, { env = process.env, fetch: fetchImpl = fetch, now = Date.now() } = {}) {
  const missing = REQUIRED_ENV.filter(key => !env[key]);
  if (missing.length) {
    console.error(`Discovery API is missing env vars: ${missing.join(', ')}`);
    return json(500, { ok: false });
  }
  const body = await readJson(request);
  if (!body) return json(400, { ok: false });
  if (body.hp) return json(200, { ok: true, qualified: false }); // honeypot: only bots fill it
  const app = cleanApplication(body);
  if (!app) return json(400, { ok: false });
  const qualified = isQualified(app);

  // Either copy is enough to follow up, so the visitor only has to retry when both fail.
  const results = await Promise.allSettled([
    saveToNotion(app, qualified, env, fetchImpl, now),
    saveToKit(app, qualified, env, fetchImpl),
  ]);
  for (const result of results) if (result.status === 'rejected') console.error(result.reason);
  if (results.every(result => result.status === 'rejected')) return json(502, { ok: false });
  return json(200, { ok: true, qualified });
}
