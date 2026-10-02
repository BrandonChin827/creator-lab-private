// Rules for the Free Video application, shared by the page and the /api/apply function:
// the allowed answers, who qualifies, and cleaning a submitted application.
// No DOM access, so it also runs under node:test.
import { validateFirstName, validateLastName, validateEmail, UTM_KEYS } from '../youtube-idea-skill/lead-core.mjs';

export const RESULT_KEY = 'portlock.freeVideo';
export const CALENDLY_URL = 'https://calendly.com/bentoboi/youtube-vide-strategy-consultation';
export const LIMITS = { niche: 200, channel: 200, source: 200, why: 1000 };
const MAX_CKID = 100;
const MAX_UTM = 200;

// Value the form sends → label saved in Notion. Notion rejects commas in select
// options, so labels never contain one.
export const CHOICES = {
  youtube: { zero: 'Starting from zero', stagnant: 'Grew but stagnant', other: 'Other' },
  offer: { yes: 'Yes', planning: 'Planning one', no: 'Not planning' },
  camera: { yes: 'Yes', no: 'No', unsure: 'Unsure' },
  budget: { under1500: 'Under $1.5k', 1500: '$1.5k–$3k', 3000: '$3k–$5k', '5k': '$5k+' },
  film: { week: 'Within 7 days', weeks: 'Within 2–3 weeks', unsure: 'Not sure' },
  share: { both: 'Yes to both', post: 'Post only', unsure: 'Not sure yet' },
};

const isChoice = (field, value) => typeof value === 'string' && Object.hasOwn(CHOICES[field], value);

// Books a call instantly. Everyone else is reviewed by hand from Notion. The budget
// floor matches the $1,500/month retainer (first 3 clients).
export function isQualified(answers) {
  return answers.offer === 'yes'
    && isChoice('camera', answers.camera) && answers.camera !== 'no'
    && isChoice('budget', answers.budget) && answers.budget !== 'under1500'
    && answers.film === 'week'
    && answers.share === 'both';
}

export function validateNiche(value) {
  return String(value ?? '').trim() ? null : 'Please tell us your niche.';
}

const text = (value, max = Infinity) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

// The cleaned application, or null when a required answer is missing or invalid.
export function cleanApplication(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const firstName = text(body.firstName);
  const lastName = text(body.lastName);
  const email = text(body.email);
  if (validateFirstName(firstName) || validateLastName(lastName) || validateEmail(email)) return null;
  if (validateNiche(body.niche)) return null;
  for (const field of Object.keys(CHOICES)) if (!isChoice(field, body[field])) return null;

  const rawUtm = body.utm && typeof body.utm === 'object' ? body.utm : {};
  const utm = {};
  for (const key of UTM_KEYS) {
    const value = text(rawUtm[key], MAX_UTM);
    if (value) utm[key] = value;
  }
  return {
    firstName, lastName, email,
    youtube: body.youtube, offer: body.offer, camera: body.camera, budget: body.budget, film: body.film, share: body.share,
    niche: text(body.niche, LIMITS.niche),
    channel: text(body.channel, LIMITS.channel),
    source: text(body.source, LIMITS.source),
    why: text(body.why, LIMITS.why),
    ckid: text(body.ckid, MAX_CKID),
    utm,
  };
}

// Calendly inline embed URL: name and email filled in, colours matched to the page.
export function calendlyUrl({ firstName = '', lastName = '', email = '' }) {
  const url = new URL(CALENDLY_URL);
  url.searchParams.set('name', `${firstName} ${lastName}`.trim());
  if (email) url.searchParams.set('email', email);
  url.searchParams.set('hide_gdpr_banner', '1');
  url.searchParams.set('background_color', '0b0b0e');
  url.searchParams.set('text_color', 'f4f1eb');
  url.searchParams.set('primary_color', 'ff7a1a');
  return url.toString();
}

// The result the form saves for the thank-you page, or null if missing or malformed.
export function readResult(raw) {
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object' && typeof value.firstName === 'string' && typeof value.qualified === 'boolean') {
      return {
        firstName: value.firstName,
        lastName: typeof value.lastName === 'string' ? value.lastName : '',
        email: typeof value.email === 'string' ? value.email : '',
        qualified: value.qualified,
      };
    }
  } catch {}
  return null;
}
