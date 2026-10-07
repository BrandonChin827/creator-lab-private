// Discovery Call thank-you page: qualified applicants book their call in Calendly (name
// and email filled in); everyone else is told we'll be in touch. Same wording as the old Tally form.
import { readResult, calendlyUrl, RESULT_KEY } from '/apply/discovery-core.mjs';

const LANDING_URL = '/apply/';

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
// Storage blocked: we can't know the outcome, so show the safe "we'll be in touch" message.
const result = raw === undefined ? { firstName: '', lastName: '', email: '', qualified: false } : readResult(raw);

if (!result) {
  location.replace(LANDING_URL);
} else {
  const name = result.firstName ? `, ${result.firstName}` : '';
  if (result.qualified) {
    setHeading(`Great to meet you${name}!`, 'You look like a great fit.', 'Please book a time to chat on my calendar.');
    showCalendar(result);
  } else {
    setHeading(`Thanks for your interest${name}!`, "We'll be in touch.", "Thank you for applying. We'll be in touch if your profile matches what we're looking for.");
  }
  document.getElementById('main').hidden = false;
}
