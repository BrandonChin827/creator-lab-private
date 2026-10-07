// Rules for the Discovery Call application (the homepage "Book a Call" form), shared by
// the page and the /api/discovery function: the allowed answers, who qualifies, and
// cleaning a submitted application. No DOM access, so it also runs under node:test.
import { validateFirstName, validateLastName, validateEmail, UTM_KEYS } from '../youtube-idea-skill/lead-core.mjs';
import { validateNiche, text, calendlyUrl as videoCalendlyUrl, readResult } from '../free-video/apply-core.mjs';

export { validateNiche, readResult };
export const RESULT_KEY = 'portlock.discovery';
export const CALENDLY_URL = 'https://calendly.com/brandonchinportlock/one-on-one-meeting';
export const LIMITS = { niche: 200 };
const MAX_UTM = 200;

// Value the form sends → label saved in Kit. Same questions and answers as the old Tally form.
export const CHOICES = {
  experience: { zero: 'Starting from zero', stagnant: 'Grew but stagnant', other: 'Other' },
  revenue: { yes: 'Yes', notyet: 'Not yet' },
  offer: { yes: 'Yes', notyet: 'Not yet' },
  camera: { yes: 'Yes', no: 'No', unsure: 'Unsure' },
  budget: { under1000: 'Under $1,000', '1k': '$1,000–$2,500', '2.5k': '$2,500–$5,000', '5k': '$5,000+' },
  timeline: { month: 'This month', soon: '1–3 months', exploring: 'Just exploring' },
};

const isChoice = (field, value) => typeof value === 'string' && Object.hasOwn(CHOICES[field], value);

// Books a call instantly unless they won't go on camera or the budget is under $1,000
// (the rules the Tally form used). Everyone else is told we'll be in touch.
export function isQualified(answers) {
  return isChoice('camera', answers.camera) && answers.camera !== 'no'
    && isChoice('budget', answers.budget) && answers.budget !== 'under1000';
}

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
    experience: body.experience, revenue: body.revenue, offer: body.offer, camera: body.camera, budget: body.budget,
    niche: text(body.niche, LIMITS.niche),
    timeline: body.timeline,
    utm,
  };
}

// Calendly inline embed URL for the Discovery Call: name and email filled in.
export const calendlyUrl = result => videoCalendlyUrl(result, CALENDLY_URL);
