// Thank-you page: soft gate, personalised greeting, and the Portlock pitch.
// Founders, coaches, and agencies get the full Book a Call pitch; everyone else a softer bridge.
import { readGate, isQualified, appendUtms, track, GATE_KEY, UTM_STORE_KEY } from '/youtube-idea-skill/lead-core.mjs';

// Returns undefined when the browser blocks storage entirely (not the same as "not set").
const read = (store, key) => { try { return window[store].getItem(key); } catch { return undefined; } };

const rawGate = read('localStorage', GATE_KEY);
// Soft gate: if storage is blocked we can't tell, so let them in (the email delivers it too).
const gate = rawGate === undefined ? { firstName: '', role: '' } : readGate(rawGate);
if (!gate) {
  location.replace('/youtube-idea-skill/');
} else {
  const $ = id => document.getElementById(id);
  const variant = isQualified(gate.role) ? 'pitch' : 'soft';
  let utms = {};
  try { utms = JSON.parse(read('sessionStorage', UTM_STORE_KEY)) || {}; } catch {}

  const greet = gate.firstName ? `Sent! Check your inbox, ${gate.firstName}.` : 'Sent! Check your inbox.';
  $(variant).querySelector('.greet').textContent = greet;
  $('offer').href = appendUtms('/', utms);
  $(variant).hidden = false;
  $('main').hidden = false;
  track('access_viewed', { variant });

  $('offer').addEventListener('click', () => track('offer_clicked'));
  for (const a of document.querySelectorAll('a[data-book]')) a.addEventListener('click', () => track('call_clicked'));
}
