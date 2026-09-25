import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const indexPath = path.join(ROOT, 'public', 'index.html');
if (!fs.existsSync(indexPath)) {
  throw new Error('public/index.html not found; run node build.mjs first');
}

let html = fs.readFileSync(indexPath, 'utf8');
const before = html;
const KEY = 'v611-hide-duplicate-city-button-20260925';

// This runs last and owns the final client cache key.
html = html
  .split('v602-clan-siege-exit-visible-20260925').join(KEY)
  .split('v603-clan-siege-native-clean-20260925').join(KEY)
  .split('v604-clan-siege-native-leave-20260925').join(KEY)
  .split('v605-clan-siege-won-fps-20260925').join(KEY)
  .split('v606-clan-siege-city-exit-20260925').join(KEY)
  .split('v607-clan-siege-castle-cache-20260925').join(KEY)
  .split('v608-pc-mouse-hotkeys-20260925').join(KEY)
  .split('v609-pc-mouse-hotkeys-safe-20260925').join(KEY)
  .split('v610-pc-telegram-desktop-20260925').join(KEY);

// The original red siege exit button is visible again. Keep it and hide our temporary brown duplicate.
const style = `<style id="ppa-hide-clan-siege-leavebtn">#clanSiegeLeaveBtn{display:none!important;visibility:hidden!important;pointer-events:none!important}</style>`;
if (!html.includes('ppa-hide-clan-siege-leavebtn')) {
  const headPos = html.indexOf('</head>');
  if (headPos >= 0) html = html.slice(0, headPos) + style + html.slice(headPos);
  else html = style + html;
}

if (!html.includes(KEY) || !html.includes('ppa-hide-clan-siege-leavebtn') || !html.includes('#clanSiegeLeaveBtn{display:none!important')) {
  throw new Error('Duplicate clan siege city button hide validation failed');
}
if (html === before) throw new Error('No changes applied to public/index.html');

fs.writeFileSync(indexPath, html, 'utf8');
console.log('[PPA POSTBUILD] clan siege duplicate brown city button hidden; native red exit button remains.');
console.log('[PPA POSTBUILD] index.html: '+(Buffer.byteLength(html)/1024/1024).toFixed(2)+' MiB');
