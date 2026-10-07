// Server side of the Discovery Call application (the homepage "Book a Call" form): saves
// the answers to Kit, the only place they're stored, then tells the page whether the
// applicant qualifies. The dev server and tests call handleDiscovery directly.
// Files starting with "_" in api/ are not turned into routes by Vercel.
import { cleanApplication, isQualified, CHOICES } from '../apply/discovery-core.mjs';
import { json, readJson, postJson } from './_apply.mjs';

const KIT_API = 'https://api.kit.com/v4';
const REQUIRED_ENV = ['KIT_API_KEY', 'KIT_TAG_DISCOVERY_APPLICANT', 'KIT_TAG_DISCOVERY_QUALIFIED'];

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

export async function handleDiscovery(request, { env = process.env, fetch: fetchImpl = fetch } = {}) {
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

  try {
    await saveToKit(app, qualified, env, fetchImpl);
  } catch (err) {
    console.error(err);
    return json(502, { ok: false });
  }
  return json(200, { ok: true, qualified });
}
