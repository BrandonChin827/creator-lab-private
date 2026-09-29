// Access page: soft gate, personalised greeting, copy-to-clipboard, and the Portlock CTA.
import { readGate, appendUtms, track, GATE_KEY, UTM_STORE_KEY } from '/youtube-idea-skill/lead-core.mjs';

// Returns undefined when the browser blocks storage entirely (not the same as "not set").
const read = (store, key) => { try { return window[store].getItem(key); } catch { return undefined; } };

const rawGate = read('localStorage', GATE_KEY);
// Soft gate: if storage is blocked we can't tell, so let them in (the email delivers it too).
const gate = rawGate === undefined ? { firstName: '' } : readGate(rawGate);
if (!gate) {
  location.replace('/youtube-idea-skill/');
} else {
  const $ = id => document.getElementById(id);
  let utms = {};
  try { utms = JSON.parse(read('sessionStorage', UTM_STORE_KEY)) || {}; } catch {}

  if (gate.firstName) $('greet').textContent = `You're in, ${gate.firstName}.`;
  $('offer').href = appendUtms('/', utms);
  $('access').hidden = false;
  track('access_viewed');

  const copy = $('copy');
  const cmd = $('install-cmd');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(cmd.textContent);
      copy.textContent = 'Copied!';
      track('install_copied');
      setTimeout(() => { copy.textContent = 'Copy'; }, 2000);
    } catch {
      getSelection().selectAllChildren(cmd); // let them copy it by hand
    }
  });

  $('offer').addEventListener('click', () => track('offer_clicked'));
}
