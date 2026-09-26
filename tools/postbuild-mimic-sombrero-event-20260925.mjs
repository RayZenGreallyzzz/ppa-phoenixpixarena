import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const indexPath = path.join(ROOT, 'public', 'index.html');
const eventPath = path.join(ROOT, 'gateway', 'mimic-sombrero-event.js');
if (!fs.existsSync(indexPath)) throw new Error('public/index.html not found; run node build.mjs first');
if (!fs.existsSync(eventPath)) throw new Error('gateway/mimic-sombrero-event.js not found');

let html = fs.readFileSync(indexPath, 'utf8');
const code = fs.readFileSync(eventPath, 'utf8');
const marker = '<!-- PPA_MIMIC_SOMBRERO_EVENT_V2 -->';
const key = 'v639-admin-local-stress-panel-20260926';
html = html
  .split('v602-clan-siege-exit-visible-20260925').join(key)
  .split('v606-clan-siege-city-exit-20260925').join(key)
  .split('v607-clan-siege-castle-cache-20260925').join(key)
  .split('v609-pc-mouse-hotkeys-safe-20260925').join(key)
  .split('v610-pc-telegram-desktop-20260925').join(key)
  .split('v611-hide-duplicate-city-button-20260925').join(key)
  .split('v612-clan-boss-cerberus-drop-20260925').join(key)
  .split('v613-mimic-sombrero-event-20260925').join(key)
  .split('v614-mimic-sombrero-ticket-battle-20260925').join(key)
  .split('v615-mimic-sombrero-arena-idle-20260925').join(key)
  .split('v616-mimic-sombrero-live-drops-20260925').join(key)
  .split('v617-mimic-sombrero-card-ticket-qa-20260925').join(key)
  .split('v618-mimic-sombrero-combat-20260926').join(key)
  .split('v619-mimic-sombrero-native-input-20260926').join(key)
  .split('v620-mimic-sombrero-safe-exit-20260926').join(key)
  .split('v621-mimic-sombrero-handoff-combat-20260926').join(key)
  .split('v622-mimic-sombrero-reward-fx-mapfill-20260926').join(key)
  .split('v623-mimic-sombrero-victory-polish-20260926').join(key)
  .split('v624-mimic-sombrero-menu-restore-20260926').join(key)
  .split('v625-mimic-sombrero-native-gear-20260926').join(key)
  .split('v626-mimic-sombrero-no-level-gear-20260926').join(key)
  .split('v627-mimic-sombrero-native-smith-20260926').join(key)
  .split('v628-mimic-sombrero-approved-set-art-20260926').join(key)
  .split('v629-mimic-sombrero-set-bonuses-20260926').join(key)
  .split('v630-mimic-sombrero-stat-rows-20260926').join(key)
  .split('v631-mimic-sombrero-tap-stats-enh-base-20260926').join(key)
  .split('v632-admin-500-premium-smith-resources-20260926').join(key)
  .split('v633-admin-smith-resources-premium-storage-20260926').join(key)
  .split('v634-character-menu-native-fps-recovery-20260926').join(key)
  .split('v635-blacksmith-sharpen-fps-20260926').join(key)
  .split('v636-admin-reward-idempotent-20260926').join(key)
  .split('v637-blacksmith-canvas-batch-20260926').join(key)
  .split('v638-smith-native-img-mimic-spacing-ruri-arena-20260926').join(key)
  .split('v603-mimic-epic-art-exact-20260926').join(key);

if (!html.includes(marker)) {
  const script = `${marker}\n<script>\n${code}\n</script>`;
  if (html.includes('</body>')) html = html.replace('</body>', script + '\n</body>');
  else html += '\n' + script + '\n';
}
const count = (html.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
if (count !== 1) throw new Error('Mimic Sombrero event injected more than once: ' + count);
for (const required of [
  'PPA_MIMIC_SOMBRERO_EVENT',
  'Билет Мимика-Самбреро',
  '0.47%',
  'Мимик-Самбреро 20',
  'Мимик-Самбреро 40',
  'Мимик-Самбреро 60',
  '10000',
  '20000',
  '50000',
  'mimic-sombrero-event.js',
  'mimic-sombrero-event-card.webp',
  'mimicSombreroTestToggle',
  key
]) {
  if (!html.includes(required)) throw new Error('Mimic Sombrero validation missing: ' + required);
}
fs.writeFileSync(indexPath, html, 'utf8');
console.log('[PPA POSTBUILD] v639: admin local stress panel 0/5/10/14/18.');
console.log('[PPA POSTBUILD] index.html: ' + (Buffer.byteLength(html) / 1024 / 1024).toFixed(2) + ' MiB');
