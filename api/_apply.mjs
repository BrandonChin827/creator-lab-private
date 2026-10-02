// Server side of the Free Video application: saves each application to Notion (the
// main record) and Kit (so we can email them), then tells the page whether the
// applicant qualifies. The dev server and tests call handleApply directly.
// Files starting with "_" in api/ are not turned into routes by Vercel.
import { cleanApplication, isQualified, CHOICES } from '../free-video/apply-core.mjs';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const KIT_API = 'https://api.kit.com/v4';
const MAX_BODY = 10_000;
// Kit makes two calls in a row (subscriber, then tags) alongside one Notion call,
// so 2 × 5s stays inside the browser's 15s wait.
const TIMEOUT_MS = 5000;
const REQUIRED_ENV = ['NOTION_TOKEN', 'NOTION_APPLICATIONS_DB', 'KIT_API_KEY', 'KIT_TAG_APPLICANT', 'KIT_TAG_QUALIFIED'];

const json = (status, body) => Response.json(body, { status });

async function readJson(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return null;
  try {
    const body = JSON.parse(raw);
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

async function postJson(fetchImpl, url, headers, body) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

const richText = value => ({ rich_text: value ? [{ text: { content: value } }] : [] });
const select = name => ({ select: { name } });

// One row in the "Free Video Applications" database.
export function notionProperties(app, qualified, now, ownerId) {
  const properties = {
    Name: { title: [{ text: { content: `${app.firstName} ${app.lastName}` } }] },
    Email: { email: app.email },
    Status: select('New'),
    Qualified: { checkbox: qualified },
    'YouTube experience': select(CHOICES.youtube[app.youtube]),
    'Revenue business': select(CHOICES.business[app.business]),
    'Has offer': select(CHOICES.offer[app.offer]),
    'On camera': select(CHOICES.camera[app.camera]),
    Budget: select(CHOICES.budget[app.budget]),
    Niche: richText(app.niche),
    Channel: richText(app.channel),
    Why: richText(app.why),
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
    { parent: { database_id: env.NOTION_APPLICATIONS_DB }, properties: notionProperties(app, qualified, now, env.NOTION_OWNER_ID) });
}

// Create or update the subscriber, then tag them. No form, so no skill email.
async function saveToKit(app, qualified, env, fetchImpl) {
  const headers = { 'X-Kit-Api-Key': env.KIT_API_KEY };
  const fields = { last_name: app.lastName };
  if (app.channel) fields.youtube_channel = app.channel;
  for (const key of ['source', 'medium', 'campaign', 'content']) {
    if (app.utm[key]) fields[`utm_${key}`] = app.utm[key];
  }
  await postJson(fetchImpl, `${KIT_API}/subscribers`, headers, { email_address: app.email, first_name: app.firstName, fields });
  const tags = qualified ? [env.KIT_TAG_APPLICANT, env.KIT_TAG_QUALIFIED] : [env.KIT_TAG_APPLICANT];
  await Promise.all(tags.map(id => postJson(fetchImpl, `${KIT_API}/tags/${id}/subscribers`, headers, { email_address: app.email })));
}

// ---------- POST /api/apply ----------

export async function handleApply(request, { env = process.env, fetch: fetchImpl = fetch, now = Date.now() } = {}) {
  const missing = REQUIRED_ENV.filter(key => !env[key]);
  if (missing.length) {
    console.error(`Apply API is missing env vars: ${missing.join(', ')}`);
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
