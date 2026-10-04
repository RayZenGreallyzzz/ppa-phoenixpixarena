import fs from 'node:fs';
import path from 'node:path';

const htmlPath=path.join(process.cwd(),'public','index.html');
if(!fs.existsSync(htmlPath))throw new Error('Dungeon AI budget postbuild: public/index.html missing');
let html=fs.readFileSync(htmlPath,'utf8');

const marker='PPA_DUNGEON_AI_BUDGET_20261004';
if(html.includes(marker)){
  console.log('[PPA BUILD] Dungeon AI budget already present');
  process.exit(0);
}

// Keep one source of truth for the performance test. build.mjs currently emits
// 360x620; this build-stage normalization narrows the live client zone to 240x400.
const rxOld='const PPA_DUNGEON_ACTIVE_RX=360;';
const ryOld='const PPA_DUNGEON_ACTIVE_RY=620;';
if((html.split(rxOld).length-1)!==1||(html.split(ryOld).length-1)!==1){
  throw new Error('Dungeon AI budget: active-zone constants changed');
}
html=html.replace(rxOld,'const PPA_DUNGEON_ACTIVE_RX=240;');
html=html.replace(ryOld,'const PPA_DUNGEON_ACTIVE_RY=400;');

const re=/if\(P\.scene==='dungeon'&&!e\.isBoss&&!e\.aggro&&e\.hp===e\.mhp&&\s*\(\(dx\*dx\)\/(PPA_DUNGEON_ACTIVE_RX\*PPA_DUNGEON_ACTIVE_RX)\+\(dy\*dy\)\/(PPA_DUNGEON_ACTIVE_RY\*PPA_DUNGEON_ACTIVE_RY)>1\)\)\{/;
const matches=html.match(new RegExp(re.source,'g'))||[];
if(matches.length!==1){
  console.warn('[PPA BUILD WARN] Dungeon AI budget target count='+matches.length+'; leaving gameplay unchanged');
  process.exit(0);
}

html=html.replace(re,`/* ${marker}: normal dungeon mobs outside the active ellipse sleep regardless of stale aggro/damage state. Bosses remain exempt. */\nif(P.scene==='dungeon'&&!e.isBoss&&\n     ((dx*dx)/(PPA_DUNGEON_ACTIVE_RX*PPA_DUNGEON_ACTIVE_RX)+(dy*dy)/(PPA_DUNGEON_ACTIVE_RY*PPA_DUNGEON_ACTIVE_RY)>1)){`);

// Expose read-only test geometry for the minimap visualizer. No gameplay logic
// reads this object; the actual sleep gate above still uses the constants.
html=html.replace('</body>',`<script>window.PPA_DUNGEON_ACTIVE_ZONE={rx:240,ry:400,worldW:2048,worldH:997};</script>\n</body>`);

// The authoritative server still sends mob coordinates at ~10 Hz. On mobile the
// client had been applying its interpolation only every 50 ms (~20 visual steps/s),
// which makes movement look robotic when packets arrive with any jitter. Raise the
// visual interpolation to ~30 Hz, while materializing fewer far-away entities so
// the extra smoothness does not cost FPS. Server authority and combat are unchanged.
const mobClientPath=path.join(process.cwd(),'public','game','dungeon-mob-events.js');
if(!fs.existsSync(mobClientPath))throw new Error('Dungeon AI budget: public/game/dungeon-mob-events.js missing');
let mobClient=fs.readFileSync(mobClientPath,'utf8');
const materializeOld='var MATERIALIZE_R=1450;';
const smoothStepOld='var minStep=smoothMobile()?50:16;';
if((mobClient.split(materializeOld).length-1)!==1)throw new Error('Dungeon AI budget: materialize radius target changed');
if((mobClient.split(smoothStepOld).length-1)!==1)throw new Error('Dungeon AI budget: mobile smoothing step target changed');
mobClient=mobClient.replace(materializeOld,'var MATERIALIZE_R=1100; // PPA_DUNGEON_CLIENT_MOB_BUDGET_20261005');
mobClient=mobClient.replace(smoothStepOld,'var minStep=smoothMobile()?33:16;');
fs.writeFileSync(mobClientPath,mobClient,'utf8');

const buildMeta=/<meta name="ppa-client-build" content="[^"]+">/;
if(buildMeta.test(html))html=html.replace(buildMeta,'<meta name="ppa-client-build" content="v654-dungeon-realtime-smooth-budget-20261005">');

fs.writeFileSync(htmlPath,html,'utf8');
console.log('[PPA BUILD] Dungeon AI budget: active ellipse 240 x 400; mobile mob smoothing ~30 Hz; materialize radius 1100; bosses unchanged');
