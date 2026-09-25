import fs from 'node:fs';

const buildPath = 'build.mjs';
const fixPath = 'gateway/clan-siege-fixes.js';
let build = fs.readFileSync(buildPath, 'utf8');

// 1) Cache key for the real cleanup build.
build = build.replace(/const CLIENT_BUILD = '[^']+';/, "const CLIENT_BUILD = 'v600-clan-siege-native-hud-no-runtime-hacks-20260925';");

// 2) Remove previous cleanup block if this script is re-run, then insert source-level native HUD patch.
build = build.replace(/\/\* === CLAN SIEGE NATIVE HUD CLEANUP[\s\S]*?(?=\/\* === TIGHT MELEE BASIC RANGES)/, '');
const hudPatch = String.raw`
/* === CLAN SIEGE NATIVE HUD CLEANUP ====================================== */
// Do not mirror/scan the runtime DOM. Patch the original clan siege HUD once
// during build so the game creates the compact panel directly.
ppaPatchRegex(
  'native clan siege hud compact style',
  /el\.style\.cssText='position:fixed;z-index:48;left:50%;top:8px;transform:translateX\(-50%\);min-width:min\(92vw,520px\);max-width:94vw;padding:7px 10px;border:1px solid rgba\(231,177,82,\.62\);border-radius:9px;background:rgba\(7,8,10,\.86\);box-shadow:0 4px 20px rgba\(0,0,0,\.45\);color:#ead8b1;font:9px\/1\.35 monospace;text-align:center;pointer-events:none;display:none'/,
  "el.style.cssText='position:fixed;z-index:48;left:calc(60% - 30px);top:6px;transform:translateX(-50%);width:min(330px,54vw);max-width:330px;min-height:29px;box-sizing:border-box;padding:4px 8px;border:1px solid rgba(195,128,45,.7);border-radius:7px;background:rgba(21,18,12,.82);box-shadow:0 2px 9px rgba(0,0,0,.58);color:#e8d9ad;font:700 8px/1.25 monospace;text-align:center;white-space:normal;text-shadow:0 1px 2px #000;pointer-events:none;display:none'"
);
if(output.includes('min-width:min(92vw,520px);max-width:94vw;padding:7px 10px')){
  throw new Error('Clan siege native wide HUD style still present');
}
if(!output.includes('width:min(330px,54vw)')||!output.includes('font:700 8px/1.25 monospace')){
  throw new Error('Clan siege native compact HUD style missing');
}
/* ======================================================================== */

`;
const meleeAnchor = '/* === TIGHT MELEE BASIC RANGES';
if (!build.includes(meleeAnchor)) throw new Error('TIGHT MELEE anchor not found');
build = build.replace(meleeAnchor, hudPatch + meleeAnchor);

// 3) Replace the old audit that required runtime hooks with an audit that forbids them.
const auditRe = /if \(!clanSiegeFix\.includes\('__PPA_CLAN_SIEGE_FIX_V1'\)[\s\S]*?throw new Error\('Clan siege capture\/UI fix incomplete'\);\n  \}/;
const auditNew = `if (!clanSiegeFix.includes('__PPA_CLAN_SIEGE_FIX_DISABLED_V600') ||
      clanSiegeFix.includes('requestAnimationFrame(tick)') ||
      clanSiegeFix.includes('querySelectorAll') ||
      clanSiegeFix.includes('CanvasRenderingContext2D') ||
      !output.includes('width:min(330px,54vw)') ||
      output.includes('min-width:min(92vw,520px);max-width:94vw;padding:7px 10px') ||
      !realtimeClient.includes("if(siege)return Number.isFinite(RT.pingMs)?Math.round(RT.pingMs)+' ms':'… ms'") ||
      !realtimeClient.includes("el.style.right='8px';el.style.top='58px'")) {
    throw new Error('Clan siege native HUD cleanup incomplete');
  }`;
if (!auditRe.test(build)) throw new Error('Old clan siege audit block not found');
build = build.replace(auditRe, auditNew);
fs.writeFileSync(buildPath, build, 'utf8');

// 4) Remove all expensive runtime hacks. Source patch above owns HUD layout now.
fs.writeFileSync(fixPath, `(function(){\n  'use strict';\n  window.__PPA_CLAN_SIEGE_FIX_DISABLED_V600=true;\n})();\n`, 'utf8');

console.log('Applied native clan siege HUD cleanup: no runtime DOM/canvas hooks.');
