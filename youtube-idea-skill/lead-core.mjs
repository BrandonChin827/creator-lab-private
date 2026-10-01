// Pure helpers shared by the lead-magnet pages: validation, UTMs, the access gate,
// and a no-op analytics hook. No DOM access here, so it runs under node:test too.

export const GATE_KEY = 'portlock.ytSkill';
export const UTM_STORE_KEY = 'portlock.utm';
export const UTM_KEYS = ['source', 'medium', 'campaign', 'content', 'term'];

const MAX_NAME = 60;
const MAX_UTM = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;

function validateName(value, label) {
  const name = String(value ?? '').trim();
  if (!name) return `Please enter your ${label}.`;
  if (name.length > MAX_NAME) return `That's a long name. Please keep it under ${MAX_NAME} characters.`;
  return null;
}

export const validateFirstName = value => validateName(value, 'first name');
export const validateLastName = value => validateName(value, 'last name');

export function validateEmail(value) {
  const email = String(value ?? '').trim();
  if (!email) return 'Please enter your email.';
  if (!EMAIL_RE.test(email)) return "That email doesn't look right. Check for typos.";
  return null;
}

export function parseUtms(search) {
  const params = new URLSearchParams(search);
  const utms = {};
  for (const key of UTM_KEYS) {
    const value = (params.get(`utm_${key}`) ?? '').trim().slice(0, MAX_UTM);
    if (value) utms[key] = value;
  }
  return utms;
}

// First touch wins: a value already stored is never replaced by a later visit's.
export function mergeUtms(stored, fresh) {
  return { ...fresh, ...stored };
}

export function appendUtms(href, utms) {
  const [base, hash = ''] = href.split('#');
  const [path, query = ''] = base.split('?');
  const params = new URLSearchParams(query);
  for (const key of UTM_KEYS) {
    if (utms?.[key] && !params.has(`utm_${key}`)) params.set(`utm_${key}`, utms[key]);
  }
  const qs = params.toString();
  return path + (qs ? `?${qs}` : '') + (hash ? `#${hash}` : '');
}

export function readGate(raw) {
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object' && typeof value.firstName === 'string' && typeof value.ts === 'number') {
      return { firstName: value.firstName };
    }
  } catch {}
  return null;
}

// Analytics hook. Events queue on window.portlockEvents until a provider is chosen.
export function track(name, props = {}) {
  (globalThis.portlockEvents ||= []).push({ name, props, ts: Date.now() });
}
