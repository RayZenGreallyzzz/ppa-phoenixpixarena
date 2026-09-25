import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const indexPath = path.join(ROOT, 'public', 'index.html');
const eventPath = path.join(ROOT, 'gateway', 'mimic-sombrero-event.js');

if (!fs.existsSync(indexPath)) {
  throw new Error('public/index.html not found; run node build.mjs first');
}
if (!fs.existsSync(eventPath)) {
  throw new Error('gateway/mimic-sombrero-event.js not found');
}

let html = fs.readFileSync(indexPath, 'utf8');
const code = fs.readFileSync(eventPath, 'utf8');
const marker = '<!-- PPA_MIMIC_SOMBRERO_EVENT_V1 -->';
const cacheKey = 'v613-mimic-sombrero-event-20260925';

html = html
  .split('v602-clan-siege-exit-visible-20260925').join(cacheKey)
  .split('v606-clan-siege-city-exit-20260925').join(cacheKey)
  .split('v612-clan-boss-cerberus-drop-20260925').join(cacheKey);

if (!html.includes(marker)) {
  const script = `${marker}\n<script>\n${code}\n</script>`;
  if (html.includes('</body>')) html = html.replace('</body>', script + '\n</body>');
  else html += '\n' + script + '\n';
}

const count = (html.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
if (count !== 1) throw new Error('Mimic Sombrero event injected more than once: ' + count);
if (!html.includes('PPA_MIMIC_SOMBRERO_EVENT') || !html.includes('Мимик-Самбреро')) {
  throw new Error('Mimic Sombrero event runtime missing after injection');
}
if (!html.includes(cacheKey)) {
  throw new Error('Mimic Sombrero cache key was not applied');
}

fs.writeFileSync(indexPath, html);
console.log('[PPA POSTBUILD] Mimic-Sombrero event injected: active test event drops + drop info.');
console.log('[PPA POSTBUILD] index.html: ' + (Buffer.byteLength(html) / 1024 / 1024).toFixed(2) + ' MiB');
