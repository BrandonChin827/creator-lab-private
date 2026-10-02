// Rules for the Free Channel Audit application, shared by the page and the /api/audit
// function: the allowed answers, who qualifies, and cleaning a submitted application.
// No DOM access, so it also runs under node:test.
import { validateFirstName, validateLastName, validateEmail, UTM_KEYS } from '../youtube-idea-skill/lead-core.mjs';
import { CHOICES as VIDEO_CHOICES, validateNiche, text, calendlyUrl as videoCalendlyUrl, readResult } from '../free-video/apply-core.mjs';

export { validateNiche, readResult };
export const RESULT_KEY = 'portlock.freeAudit';
export const CALENDLY_URL = 'https://calendly.com/bentoboi/youtube-consultation';
export const LIMITS = { channel: 200, niche: 200, challenge: 1000, source: 200 };
const MAX_CKID = 100;
const MAX_UTM = 200;

// Value the form sends → label saved in Notion. Notion rejects commas in select
// options, so labels never contain one.
export const CHOICES = {
  stage: { starting: 'Just starting', stagnant: 'Grew but stagnant', growing: 'Growing' },
  offer: VIDEO_CHOICES.offer,
  camera: VIDEO_CHOICES.camera,
  budget: VIDEO_CHOICES.budget,
};

const isChoice = (field, value) => typeof value === 'string' && Object.hasOwn(CHOICES[field], value);

// Books a call instantly. Everyone else is reviewed by hand from Notion. The budget
// floor matches the $1,500/month retainer.
export function isQualified(answers) {
  return answers.offer === 'yes'
    && isChoice('camera', answers.camera) && answers.camera !== 'no'
    && isChoice('budget', answers.budget) && answers.budget !== 'under1500';
}

export function validateChannel(value) {
  return String(value ?? '').trim() ? null : 'Please add your channel (or type "none yet").';
}

// The cleaned application, or null when a required answer is missing or invalid.
export function cleanApplication(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const firstName = text(body.firstName);
  const lastName = text(body.lastName);
  const email = text(body.email);
  if (validateFirstName(firstName) || validateLastName(lastName) || validateEmail(email)) return null;
  if (validateChannel(body.channel) || validateNiche(body.niche)) return null;
  for (const field of Object.keys(CHOICES)) if (!isChoice(field, body[field])) return null;

  const rawUtm = body.utm && typeof body.utm === 'object' ? body.utm : {};
  const utm = {};
  for (const key of UTM_KEYS) {
    const value = text(rawUtm[key], MAX_UTM);
    if (value) utm[key] = value;
  }
  return {
    firstName, lastName, email,
    stage: body.stage, offer: body.offer, camera: body.camera, budget: body.budget,
    channel: text(body.channel, LIMITS.channel),
    niche: text(body.niche, LIMITS.niche),
    challenge: text(body.challenge, LIMITS.challenge),
    source: text(body.source, LIMITS.source),
    ckid: text(body.ckid, MAX_CKID),
    utm,
  };
}

// Calendly inline embed URL for the 30 min audit call: name and email filled in.
export const calendlyUrl = result => videoCalendlyUrl(result, CALENDLY_URL);
