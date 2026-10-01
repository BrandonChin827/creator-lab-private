// Landing page opt-in: name → email (saves the lead) → up to three optional qualifier
// questions, all inside the form card. Also captures UTMs and logs each completed step.
import {
  validateFirstName, validateLastName, validateEmail, parseUtms, mergeUtms, track, GATE_KEY, UTM_STORE_KEY,
} from '/youtube-idea-skill/lead-core.mjs';

const ACCESS_URL = '/youtube-idea-skill/access/';
const FAILURE = 'Something went wrong. Please try again.';

const $ = id => document.getElementById(id);
const form = $('optin');
const steps = [...form.querySelectorAll('.step')];
const progress = form.querySelector('.progress');
const nameInput = $('firstName');
const lastInput = $('lastName');
const emailInput = $('email');
const submit = $('submit');
const formErr = $('form-err');
const submitLabel = submit.innerHTML;
let sending = false;
let current = 1;
let email = '';
let token = ''; // from /api/subscribe; lets the answers below update this subscriber
const answers = {};

function readStoredUtms() {
  try { return JSON.parse(sessionStorage.getItem(UTM_STORE_KEY)) || {}; } catch { return {}; }
}
const utms = mergeUtms(readStoredUtms(), parseUtms(location.search));
try { sessionStorage.setItem(UTM_STORE_KEY, JSON.stringify(utms)); } catch {}

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
  (active.querySelector('input:not([type=hidden])') || active.querySelector('h2')).focus();
}

function next() {
  // Check both so both errors show; focus lands on the first invalid field.
  const lastOk = check(lastInput, validateLastName(lastInput.value));
  const firstOk = check(nameInput, validateFirstName(nameInput.value));
  if (!firstOk || !lastOk) return;
  track('optin_step', { step: 1, field: 'name' });
  goToStep(2);
}

$('next').addEventListener('click', next);
for (const input of [nameInput, lastInput]) {
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); next(); }
  });
}
$('back').addEventListener('click', () => goToStep(1));

async function subscribe(payload) {
  const res = await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout?.(15000), // missing on iOS 15
  });
  const data = await res.json().catch(() => null);
  return res.ok && data?.ok === true ? data : null;
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (sending || current !== 2) return;
  if (!check(emailInput, validateEmail(emailInput.value))) return;
  const firstName = nameInput.value.trim();
  sending = true;
  submit.disabled = true;
  submit.textContent = 'Sending…';
  formErr.textContent = '';

  // Honeypot: only bots fill it. They get the normal success path, minus the request.
  const isBot = Boolean(form.elements.hp_x.value);
  let ok = isBot;
  if (!isBot) {
    try {
      const data = await subscribe({
        firstName,
        lastName: lastInput.value.trim(),
        email: emailInput.value.trim(),
        utm: utms,
        referrer: document.referrer,
        page: location.origin + location.pathname,
      });
      ok = Boolean(data);
      token = data?.token || '';
    } catch {}
  }

  if (ok) {
    try { localStorage.setItem(GATE_KEY, JSON.stringify({ firstName, ts: Date.now() })); } catch {}
    if (isBot) return location.assign(ACCESS_URL);
    email = emailInput.value.trim();
    track('optin_step', { step: 2, field: 'email' });
    track('optin_submitted');
    goToStep(3);
    return;
  }
  track('optin_failed');
  formErr.textContent = FAILURE;
  submit.disabled = false;
  submit.innerHTML = submitLabel;
  sending = false;
});

// ---------- Optional qualifier steps (the lead is already saved) ----------

// Sends every answer so far. Never blocks: keepalive lets it finish after navigation.
function sendAnswers() {
  fetch('/api/qualify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, token, answers }),
    keepalive: true,
  }).catch(() => {});
}

function toAccess() {
  location.assign(ACCESS_URL);
}

function answer(field, value) {
  answers[field] = value;
  sendAnswers();
  track('optin_step', { step: current, field });
  // No channel to ask about when they don't have one yet.
  if (current === 3 || (current === 4 && answers.youtube !== 'none')) goToStep(current + 1);
  else { track('qualify_completed'); toAccess(); }
}

form.addEventListener('click', e => {
  const choice = e.target.closest('.choice');
  if (choice) return answer(choice.dataset.field, choice.dataset.value);
  if (e.target.closest('.skip')) {
    track('qualify_skipped', { step: current });
    toAccess();
  }
});

function finish() {
  const channel = $('channel').value.trim();
  if (channel) answer('channel', channel);
  else { track('qualify_completed'); toAccess(); }
}
$('finish').addEventListener('click', finish);
$('channel').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); finish(); }
});
