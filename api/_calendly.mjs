// Calendly webhook: when someone books a Discovery Call, tags them discovery-booked in Kit
// (so the Kit reminder email skips them) and sets their latest Notion application to
// "Call booked". Other Calendly events are acknowledged and ignored.
// Files starting with "_" in api/ are not turned into routes by Vercel.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { json } from './_apply.mjs';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const KIT_API = 'https://api.kit.com/v4';
const TIMEOUT_MS = 5000;
const MAX_BODY = 100_000;
// Calendly signs every request; older signatures are rejected so a captured one can't be replayed.
const MAX_AGE_MS = 5 * 60 * 1000;
const REQUIRED_ENV = ['CALENDLY_WEBHOOK_SIGNING_KEY', 'NOTION_TOKEN', 'NOTION_DISCOVERY_DB', 'KIT_API_KEY', 'KIT_TAG_DISCOVERY_BOOKED'];

// The "Discovery Call" event (calendly.com/brandonchinportlock/one-on-one-meeting).
export const DISCOVERY_EVENT_TYPE = 'https://api.calendly.com/event_types/d1624d4b-5151-4749-bf47-28dd5d238476';

// Checks the Calendly-Webhook-Signature header ("t=<seconds>,v1=<hex HMAC of `t.body`>").
export function verifySignature(header, raw, key, now = Date.now()) {
  const parts = Object.fromEntries(String(header || '').split(',').map(p => p.trim().split('=')));
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(now - t * 1000) > MAX_AGE_MS) return false;
  const expected = createHmac('sha256', key).update(`${parts.t}.${raw}`).digest('hex');
  const given = Buffer.from(parts.v1, 'utf8');
  return given.length === expected.length && timingSafeEqual(given, Buffer.from(expected, 'utf8'));
}

// Kit answers 404 for someone who isn't a subscriber (booked without applying). They never
// get the reminder, so there's nothing to tag, and they aren't added to the email list.
async function tagBooked(email, env, fetchImpl) {
  const res = await fetchImpl(`${KIT_API}/tags/${env.KIT_TAG_DISCOVERY_BOOKED}/subscribers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Kit-Api-Key': env.KIT_API_KEY },
    body: JSON.stringify({ email_address: email }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok && res.status !== 404) throw new Error(`Kit tag → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

async function notion(fetchImpl, env, method, path, body) {
  const res = await fetchImpl(`${NOTION_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Notion ${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// Marks their most recent application as booked. Someone who booked without applying has no row.
async function markNotionBooked(email, env, fetchImpl) {
  const { results } = await notion(fetchImpl, env, 'POST', `/databases/${env.NOTION_DISCOVERY_DB}/query`, {
    filter: { property: 'Email', email: { equals: email } },
    sorts: [{ property: 'Applied', direction: 'descending' }],
    page_size: 1,
  });
  if (!results.length) return;
  await notion(fetchImpl, env, 'PATCH', `/pages/${results[0].id}`, { properties: { Status: { select: { name: 'Call booked' } } } });
}

// ---------- POST /api/calendly ----------

export async function handleCalendly(request, { env = process.env, fetch: fetchImpl = fetch, now = Date.now() } = {}) {
  const missing = REQUIRED_ENV.filter(key => !env[key]);
  if (missing.length) {
    console.error(`Calendly webhook is missing env vars: ${missing.join(', ')}`);
    return json(500, { ok: false });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY || !verifySignature(request.headers.get('calendly-webhook-signature'), raw, env.CALENDLY_WEBHOOK_SIGNING_KEY, now)) {
    return json(401, { ok: false });
  }
  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { ok: false }); }

  const email = String(body?.payload?.email || '').trim();
  if (body?.event !== 'invitee.created' || body.payload?.scheduled_event?.event_type !== DISCOVERY_EVENT_TYPE || !email) {
    return json(200, { ok: true, ignored: true });
  }

  const results = await Promise.allSettled([tagBooked(email, env, fetchImpl), markNotionBooked(email, env, fetchImpl)]);
  for (const result of results) if (result.status === 'rejected') console.error(result.reason);
  // A non-2xx makes Calendly retry. Both saves are safe to repeat, so retry if either failed:
  // a missing Kit tag would send the reminder to someone who already booked.
  if (results.some(result => result.status === 'rejected')) return json(502, { ok: false });
  return json(200, { ok: true });
}
