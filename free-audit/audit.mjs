// Free Channel Audit application: seven one-question steps inside the form card, then a
// single POST to /api/audit. The thank-you page shows the outcome (calendar or "we'll review").
import {
  validateFirstName, validateLastName, validateEmail, parseUtms, mergeUtms, UTM_STORE_KEY,
} from '/youtube-idea-skill/lead-core.mjs';
import { validateNiche, validateChannel, RESULT_KEY } from '/free-audit/audit-core.mjs';

const NEXT_URL = '/free-audit/next/';
const FAILURE = 'Something went wrong. Please try again.';

const $ = id => document.getElementById(id);
const form = $('apply-form');
const steps = [...form.querySelectorAll('.step')];
const LAST_STEP = steps.length;
const progress = form.querySelector('.progress');
const formErr = $('form-err');
const submit = $('submit');
const submitLabel = submit.innerHTML;
const answers = {};
let current = 1;
let sending = false;

function readStoredUtms() {
  try { return JSON.parse(sessionStorage.getItem(UTM_STORE_KEY)) || {}; } catch { return {}; }
}
const utms = mergeUtms(readStoredUtms(), parseUtms(location.search));
try { sessionStorage.setItem(UTM_STORE_KEY, JSON.stringify(utms)); } catch {}

// ClickLedger keeps the visitor's id here; sent along so Notion can link back to it.
function readCkid() {
  try { return localStorage.getItem('tk_vid') || ''; } catch { return ''; }
}

// Shows or clears a field's error; returns true when the field is valid.
function check(input, message, focus = true) {
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  $(`${input.id}-err`).textContent = message || '';
  if (message && focus) input.focus();
  return !message;
}

function goToStep(n) {
  current = n;
  for (const step of steps) step.hidden = Number(step.dataset.step) !== n;
  progress.setAttribute('aria-valuenow', n);
  progress.style.setProperty('--pct', `${(n / steps.length) * 100}%`);
  formErr.textContent = '';
  const active = steps[n - 1];
  (active.querySelector('input') || active.querySelector('h2')).focus();
}

function stepIsValid(n) {
  if (n === 1) {
    // Check both so both errors show; focus lands on the first invalid field.
    const lastOk = check($('lastName'), validateLastName($('lastName').value));
    const firstOk = check($('firstName'), validateFirstName($('firstName').value));
    return firstOk && lastOk;
  }
  if (n === 2) return check($('email'), validateEmail($('email').value));
  if (n === LAST_STEP) {
    const nicheOk = check($('niche'), validateNiche($('niche').value));
    const channelOk = check($('channel'), validateChannel($('channel').value));
    return channelOk && nicheOk;
  }
  const field = steps[n - 1].querySelector('.choice')?.dataset.field;
  return !field || Boolean(answers[field]);
}

async function apply(payload) {
  const res = await fetch('/api/audit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout?.(15000), // missing on iOS 15
  });
  const data = await res.json().catch(() => null);
  return res.ok && data?.ok === true ? data : null;
}

async function send() {
  if (sending) return;
  sending = true;
  submit.disabled = true;
  submit.textContent = 'Sending…';
  formErr.textContent = '';
  const firstName = $('firstName').value.trim();
  const lastName = $('lastName').value.trim();
  const email = $('email').value.trim();

  // Honeypot: only bots fill it. They get the normal success path, minus the request.
  const isBot = Boolean(form.elements.hp_x.value);
  let result = isBot ? { qualified: false } : null;
  if (!isBot) {
    try {
      result = await apply({
        firstName, lastName, email, ...answers,
        channel: $('channel').value.trim(),
        niche: $('niche').value.trim(),
        challenge: $('challenge').value.trim(),
        source: $('source').value.trim(),
        utm: utms,
        ckid: readCkid(),
      });
    } catch {}
  }

  if (result) {
    const saved = { firstName, lastName, email, qualified: result.qualified === true };
    try { sessionStorage.setItem(RESULT_KEY, JSON.stringify(saved)); } catch {}
    if (!isBot) window.tk?.identify?.(email, `${firstName} ${lastName}`);
    location.assign(NEXT_URL);
    return;
  }
  formErr.textContent = FAILURE;
  submit.disabled = false;
  submit.innerHTML = submitLabel;
  sending = false;
}

// Enter or a step's button: validate the step, then move on (or send on the last step).
form.addEventListener('submit', e => {
  e.preventDefault();
  if (sending || !stepIsValid(current)) return;
  if (current < LAST_STEP) goToStep(current + 1);
  else send();
});

form.addEventListener('click', e => {
  const choice = e.target.closest('.choice');
  if (choice) {
    // The next step's options sit where this step's were, so the second click of a
    // double-click would answer a question the visitor never saw. Only the first counts.
    if (e.detail > 1) return;
    answers[choice.dataset.field] = choice.dataset.value;
    for (const option of choice.parentElement.querySelectorAll('.choice')) {
      option.setAttribute('aria-pressed', String(option === choice));
    }
    goToStep(current + 1);
    return;
  }
  if (e.target.closest('.back') && current > 1) goToStep(current - 1);
});
