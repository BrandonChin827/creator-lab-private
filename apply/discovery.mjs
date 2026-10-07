// Discovery Call application: nine one-question steps inside the form card. Picking an
// answer on the last step sends a single POST to /api/discovery, then the thank-you page
// shows the outcome (calendar or "we'll be in touch").
import {
  validateFirstName, validateLastName, validateEmail, parseUtms, mergeUtms, UTM_STORE_KEY,
} from '/youtube-idea-skill/lead-core.mjs';
import { validateNiche, RESULT_KEY } from '/apply/discovery-core.mjs';

const NEXT_URL = '/apply/next/';
const FAILURE = 'Something went wrong. Please try again.';

const $ = id => document.getElementById(id);
const form = $('apply-form');
const steps = [...form.querySelectorAll('.step')];
const LAST_STEP = steps.length;
const lastChoices = [...steps[LAST_STEP - 1].querySelectorAll('.choice')];
const progress = form.querySelector('.progress');
const formErr = $('form-err');
const note = $('note');
const noteText = note.textContent;
const answers = {};
let current = 1;
let sending = false;

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
  if (n === 8) return check($('niche'), validateNiche($('niche').value));
  const field = steps[n - 1].querySelector('.choice')?.dataset.field;
  return !field || Boolean(answers[field]);
}

async function apply(payload) {
  const res = await fetch('/api/discovery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout?.(15000), // missing on iOS 15
  });
  const data = await res.json().catch(() => null);
  return res.ok && data?.ok === true ? data : null;
}

function setSending(on) {
  sending = on;
  for (const option of lastChoices) option.disabled = on;
  note.textContent = on ? 'Sending…' : noteText;
}

async function send() {
  if (sending) return;
  setSending(true);
  formErr.textContent = '';
  const firstName = $('firstName').value.trim();
  const lastName = $('lastName').value.trim();
  const email = $('email').value.trim();

  // Honeypot: only bots fill it. They get the normal success path, minus the request.
  const isBot = Boolean(form.elements.hp_x.value);
  let result = isBot ? { qualified: false } : null;
  if (!isBot) {
    try {
      result = await apply({ firstName, lastName, email, ...answers, niche: $('niche').value.trim(), utm: utms });
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
  setSending(false);
}

// Enter or a step's button: validate the step, then move on.
form.addEventListener('submit', e => {
  e.preventDefault();
  if (sending || !stepIsValid(current)) return;
  if (current < LAST_STEP) goToStep(current + 1);
});

form.addEventListener('click', e => {
  const choice = e.target.closest('.choice');
  if (choice) {
    // The next step's options sit where this step's were, so the second click of a
    // double-click would answer a question the visitor never saw. Only the first counts.
    if (e.detail > 1 || sending) return;
    answers[choice.dataset.field] = choice.dataset.value;
    for (const option of choice.parentElement.querySelectorAll('.choice')) {
      option.setAttribute('aria-pressed', String(option === choice));
    }
    if (current < LAST_STEP) goToStep(current + 1);
    else send();
    return;
  }
  if (e.target.closest('.back') && current > 1 && !sending) goToStep(current - 1);
});
