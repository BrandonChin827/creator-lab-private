// Free Video thank-you page: qualified applicants book their call in Calendly (name and
// email filled in); everyone else is told we'll review their application.
import { readResult, calendlyUrl, RESULT_KEY } from '/free-video/apply-core.mjs';

const LANDING_URL = '/free-video/';

// Returns undefined when the browser blocks storage entirely (not the same as "not set").
const read = key => { try { return sessionStorage.getItem(key); } catch { return undefined; } };

// Builds "Title<br><em>Accent</em>" with textContent, so names are never parsed as HTML.
function setHeading(title, accent, sub) {
  const h1 = document.getElementById('title');
  const em = document.createElement('em');
  em.textContent = accent;
  h1.replaceChildren(document.createTextNode(title), document.createElement('br'), em);
  document.getElementById('sub').textContent = sub;
}

function showCalendar(result) {
  const cal = document.getElementById('cal');
  cal.dataset.url = calendlyUrl(result);
  cal.hidden = false;
  const script = document.createElement('script');
  script.src = 'https://assets.calendly.com/assets/external/widget.js';
  script.async = true;
  document.body.append(script);
}

const raw = read(RESULT_KEY);
// Storage blocked: we can't know the outcome, so show the safe "we'll review" message.
const result = raw === undefined ? { firstName: '', lastName: '', email: '', qualified: false } : readResult(raw);

if (!result) {
  location.replace(LANDING_URL);
} else {
  const name = result.firstName ? `, ${result.firstName}` : '';
  if (result.qualified) {
    setHeading(`You qualify${name}!`, 'Pick a time for your 15 min call.', "We'll talk about your business and plan your free video.");
    showCalendar(result);
  } else {
    setHeading(`Thanks${name}.`, "We'll be in touch.", "We'll review your application and get back to you by email.");
  }
  document.getElementById('main').hidden = false;
}
