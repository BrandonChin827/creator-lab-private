// Thank-you page: soft gate, personalised "Sent!" greeting, and the Portlock pitch.
import { readGate, track, GATE_KEY } from '/youtube-idea-skill/lead-core.mjs';

// Returns undefined when the browser blocks storage entirely (not the same as "not set").
const read = (store, key) => { try { return window[store].getItem(key); } catch { return undefined; } };

const rawGate = read('localStorage', GATE_KEY);
// Soft gate: if storage is blocked we can't tell, so let them in (the email delivers it too).
const gate = rawGate === undefined ? { firstName: '' } : readGate(rawGate);
if (!gate) {
  location.replace('/youtube-idea-skill/');
} else {
  const name = gate.firstName ? `, ${gate.firstName}` : '';
  document.getElementById('greet').textContent = `Sent! Check your inbox${name}.`;
  document.getElementById('main').hidden = false;
  track('access_viewed');

  for (const a of document.querySelectorAll('a[data-book]')) a.addEventListener('click', () => track('call_clicked'));
}
