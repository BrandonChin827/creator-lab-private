// Server side of the Free Channel Audit application: saves each application to Notion
// (the main record) and Kit (so we can email them), then tells the page whether the
// applicant qualifies. The dev server and tests call handleAudit directly.
// Files starting with "_" in api/ are not turned into routes by Vercel.
import { cleanApplication, isQualified, CHOICES } from '../free-audit/audit-core.mjs';
import { json, readJson, postJson, richText, select } from './_apply.mjs';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const KIT_API = 'https://api.kit.com/v4';
const REQUIRED_ENV = ['NOTION_TOKEN', 'NOTION_AUDIT_DB', 'KIT_API_KEY', 'KIT_TAG_AUDIT_APPLICANT', 'KIT_TAG_AUDIT_QUALIFIED'];

// One row in the "Channel Audit Applications" database.
export function notionProperties(app, qualified, now, ownerId) {
  const properties = {
    Name: { title: [{ text: { content: `${app.firstName} ${app.lastName}` } }] },
    Email: { email: app.email },
    Status: select('New'),
    Qualified: { checkbox: qualified },
    'Channel stage': select(CHOICES.stage[app.stage]),
    'Has offer': select(CHOICES.offer[app.offer]),
    'On camera': select(CHOICES.camera[app.camera]),
    Budget: select(CHOICES.budget[app.budget]),
    Channel: richText(app.channel),
    Niche: richText(app.niche),
    'Biggest challenge': richText(app.challenge),
    'Found us via': richText(app.source),
    'ClickLedger ID': richText(app.ckid),
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
    { parent: { database_id: env.NOTION_AUDIT_DB }, properties: notionProperties(app, qualified, now, env.NOTION_OWNER_ID) });
}

// Create or update the subscriber, then tag them. No form, so no skill email.
async function saveToKit(app, qualified, env, fetchImpl) {
  const headers = { 'X-Kit-Api-Key': env.KIT_API_KEY };
  const fields = { last_name: app.lastName, youtube_channel: app.channel };
  for (const key of ['source', 'medium', 'campaign', 'content']) {
    if (app.utm[key]) fields[`utm_${key}`] = app.utm[key];
  }
  await postJson(fetchImpl, `${KIT_API}/subscribers`, headers, { email_address: app.email, first_name: app.firstName, fields });
  const tags = qualified ? [env.KIT_TAG_AUDIT_APPLICANT, env.KIT_TAG_AUDIT_QUALIFIED] : [env.KIT_TAG_AUDIT_APPLICANT];
  await Promise.all(tags.map(id => postJson(fetchImpl, `${KIT_API}/tags/${id}/subscribers`, headers, { email_address: app.email })));
}

// ---------- POST /api/audit ----------

export async function handleAudit(request, { env = process.env, fetch: fetchImpl = fetch, now = Date.now() } = {}) {
  const missing = REQUIRED_ENV.filter(key => !env[key]);
  if (missing.length) {
    console.error(`Audit API is missing env vars: ${missing.join(', ')}`);
    return json(500, { ok: false });
  }
  const body = await readJson(request);
  if (!body) return json(400, { ok: false });
  if (body.hp) return json(200, { ok: true, qualified: false }); // honeypot: only bots fill it
  const app = cleanApplication(body);
  if (!app) return json(400, { ok: false });
  const qualified = isQualified(app);

  const [notion, kit] = await Promise.allSettled([
    saveToNotion(app, qualified, env, fetchImpl, now),
    saveToKit(app, qualified, env, fetchImpl),
  ]);
  if (kit.status === 'rejected') console.error(kit.reason);
  if (notion.status === 'rejected') {
    console.error(notion.reason);
    return json(502, { ok: false });
  }
  return json(200, { ok: true, qualified });
}
