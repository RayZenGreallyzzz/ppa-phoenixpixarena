import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const indexPath = path.join(ROOT, 'public', 'index.html');
if (!fs.existsSync(indexPath)) {
  throw new Error('public/index.html not found; run node build.mjs first');
}

let html = fs.readFileSync(indexPath, 'utf8');
// This postbuild owns only the duplicate-button visibility rule.
// Cache-key ownership belongs to the active release postbuild; never downgrade it here.

// The original red siege exit button is visible again. Keep it and hide our temporary brown duplicate.
const style = `<style id="ppa-hide-clan-siege-leavebtn">#clanSiegeLeaveBtn{display:none!important;visibility:hidden!important;pointer-events:none!important}</style>`;
if (!html.includes('ppa-hide-clan-siege-leavebtn')) {
  const headPos = html.indexOf('</head>');
  if (headPos >= 0) html = html.slice(0, headPos) + style + html.slice(headPos);
  else html = style + html;
}

if (!html.includes('ppa-hide-clan-siege-leavebtn') || !html.includes('#clanSiegeLeaveBtn{display:none!important')) {
  throw new Error('Duplicate clan siege city button hide validation failed');
}

fs.writeFileSync(indexPath, html, 'utf8');
console.log('[PPA POSTBUILD] clan siege duplicate brown city button hidden; native red exit button remains.');
console.log('[PPA POSTBUILD] index.html: '+(Buffer.byteLength(html)/1024/1024).toFixed(2)+' MiB');
