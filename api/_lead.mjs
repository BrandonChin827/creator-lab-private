// Server-side lead handling for the YouTube Idea Skill page: saves signups to Kit and
// applies the optional qualifier answers as tags. The api/*.mjs routes are thin wrappers
// around these handlers, and the dev server and tests call them directly.
// Files starting with "_" in api/ are not turned into routes by Vercel.
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  validateFirstName, validateLastName, validateEmail, appendUtms, UTM_KEYS,
} from '../youtube-idea-skill/lead-core.mjs';

const KIT_API = 'https://api.kit.com/v4';
const MAX_BODY = 10_000;
const MAX_CHANNEL = 200;
const TOKEN_TTL_MS = 60 * 60 * 1000; // answers are accepted for an hour after signup

// Kit tag IDs for each allowed answer (created in Kit on 2026-09-29).
// Anything not listed here is ignored, so visitors can't invent tags.
export const ANSWER_TAGS = {
  youtube: { posting: 24106267, inconsistent: 24106268, none: 24106269 },
  role: { founder: 24106270, coach: 24106271, creator: 24106272, agency: 24106273 },
};

const json = (status, body) => Response.json(body, { status });
const clean = value => (typeof value === 'string' ? value.trim() : '');

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

// ---------- Answer token: proves the answers come from the person who just signed up ----------

function sign(email, exp, secret) {
  return createHmac('sha256', secret).update(`${email.toLowerCase()}.${exp}`).digest('base64url');
}

export function makeToken(email, secret, now = Date.now()) {
  const exp = now + TOKEN_TTL_MS;
  return `${exp}.${sign(email, exp, secret)}`;
}

export function verifyToken(token, email, secret, now = Date.now()) {
  if (typeof token !== 'string') return false;
  const [expRaw, sig = ''] = token.split('.');
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < now) return false;
  const expected = Buffer.from(sign(email, exp, secret));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// ---------- Kit ----------

function kit(env, fetchImpl) {
  return async (path, body) => {
    const res = await fetchImpl(`${KIT_API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Kit-Api-Key': env.KIT_API_KEY },
      body: JSON.stringify(body),
      // Signup makes two Kit calls in a row; 2 × 5s stays inside the browser's 15s wait.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Kit ${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  };
}

function missingEnv(env) {
  const missing = ['KIT_API_KEY', 'KIT_FORM_ID', 'LEAD_TOKEN_SECRET'].filter(key => !env[key]);
  if (missing.length) console.error(`Lead API is missing env vars: ${missing.join(', ')}`);
  return missing.length > 0;
}

// ---------- POST /api/subscribe ----------

export async function handleSubscribe(request, { env = process.env, fetch: fetchImpl = fetch, now } = {}) {
  if (missingEnv(env)) return json(500, { ok: false });
  const body = await readJson(request);
  if (!body) return json(400, { ok: false });

  const firstName = clean(body.firstName);
  const lastName = clean(body.lastName);
  const email = clean(body.email);
  if (validateFirstName(firstName) || validateLastName(lastName) || validateEmail(email)) {
    return json(400, { ok: false });
  }

  // Only send UTMs that have a value, so a returning subscriber's are never blanked.
  const utm = body.utm && typeof body.utm === 'object' ? body.utm : {};
  const fields = { last_name: lastName };
  const utms = {};
  for (const key of UTM_KEYS) {
    const value = clean(utm[key]).slice(0, 200);
    if (value) utms[key] = value;
    if (value && key !== 'term') fields[`utm_${key}`] = value;
  }
  const page = clean(body.page);
  const referrer = /^https?:\/\//.test(page) && page.length <= 500 ? appendUtms(page, utms) : undefined;

  const post = kit(env, fetchImpl);
  try {
    // Create or update the subscriber, then add them to the form (which starts email 1).
    await post('/subscribers', { email_address: email, first_name: firstName, fields });
    await post(`/forms/${env.KIT_FORM_ID}/subscribers`, { email_address: email, referrer });
  } catch (err) {
    console.error(err);
    return json(502, { ok: false });
  }
  return json(200, { ok: true, token: makeToken(email, env.LEAD_TOKEN_SECRET, now) });
}

// ---------- POST /api/qualify ----------

export async function handleQualify(request, { env = process.env, fetch: fetchImpl = fetch, now } = {}) {
  if (missingEnv(env)) return json(500, { ok: false });
  const body = await readJson(request);
  if (!body) return json(400, { ok: false });

  const email = clean(body.email);
  if (validateEmail(email)) return json(400, { ok: false });
  if (!verifyToken(body.token, email, env.LEAD_TOKEN_SECRET, now)) return json(401, { ok: false });

  const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};
  const tagIds = Object.entries(ANSWER_TAGS)
    .map(([field, tags]) => Object.hasOwn(tags, answers[field]) && tags[answers[field]])
    .filter(Boolean);
  const channel = clean(answers.channel).slice(0, MAX_CHANNEL);

  const post = kit(env, fetchImpl);
  try {
    await Promise.all([
      ...tagIds.map(id => post(`/tags/${id}/subscribers`, { email_address: email })),
      ...(channel ? [post('/subscribers', { email_address: email, fields: { youtube_channel: channel } })] : []),
    ]);
  } catch (err) {
    console.error(err);
    return json(502, { ok: false });
  }
  return json(200, { ok: true });
}
