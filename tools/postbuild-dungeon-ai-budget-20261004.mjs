import fs from 'node:fs';
import path from 'node:path';

const htmlPath=path.join(process.cwd(),'public','index.html');
if(!fs.existsSync(htmlPath))throw new Error('Dungeon AI budget postbuild: public/index.html missing');
let html=fs.readFileSync(htmlPath,'utf8');

const marker='PPA_DUNGEON_AI_BUDGET_20261004';

// build.mjs already owns the authoritative dungeon sleep gate and emits it in
// terms of PPA_DUNGEON_ACTIVE_RX/RY. Do not re-match/rewrite that entire packed
// if-expression here: small formatting/source changes made the old regex brittle
// and silently skipped the whole mobile budget. Normalize only the two constants
// and then verify that the generated gate actually references them.
const rxOld='const PPA_DUNGEON_ACTIVE_RX=360;';
const ryOld='const PPA_DUNGEON_ACTIVE_RY=620;';
const rxNew='const PPA_DUNGEON_ACTIVE_RX=240;';
const ryNew='const PPA_DUNGEON_ACTIVE_RY=400;';

if(!html.includes(marker)){
  const rxOldCount=html.split(rxOld).length-1;
  const ryOldCount=html.split(ryOld).length-1;
  const rxNewCount=html.split(rxNew).length-1;
  const ryNewCount=html.split(ryNew).length-1;

  if(rxOldCount===1&&rxNewCount===0)html=html.replace(rxOld,rxNew);
  else if(!(rxOldCount===0&&rxNewCount===1))throw new Error('Dungeon AI budget: RX constant state changed');

  if(ryOldCount===1&&ryNewCount===0)html=html.replace(ryOld,ryNew);
  else if(!(ryOldCount===0&&ryNewCount===1))throw new Error('Dungeon AI budget: RY constant state changed');

  const gateRx='(dx*dx)/(PPA_DUNGEON_ACTIVE_RX*PPA_DUNGEON_ACTIVE_RX)';
  const gateRy='(dy*dy)/(PPA_DUNGEON_ACTIVE_RY*PPA_DUNGEON_ACTIVE_RY)>1';
  if(!html.includes(gateRx)||!html.includes(gateRy)){
    throw new Error('Dungeon AI budget: build.mjs active-zone gate missing');
  }

  html=html.replace(ryNew,ryNew+`\n/* ${marker}: build.mjs owns the sleep gate; postbuild narrows only its radii. */`);
}

// Expose read-only test geometry for the minimap visualizer. No gameplay logic
// reads this object; the actual sleep gate above still uses the constants.
if(!html.includes('window.PPA_DUNGEON_ACTIVE_ZONE=')){
  if(!html.includes('</body>'))throw new Error('Dungeon AI budget: </body> missing');
  html=html.replace('</body>',`<script>window.PPA_DUNGEON_ACTIVE_ZONE={rx:240,ry:400,worldW:2048,worldH:997};</script>\n</body>`);
}

// Combined low-FPS test: keep the server authoritative, but stop the client from
// materializing most of the dungeon at once. 600 px still covers the viewport and
// a useful safety margin while avoiding the previous near-whole-map budget.
// At low rendered FPS a 50 ms visual smoothing gate avoids doing interpolation
// work that cannot become a visible frame. Gameplay/combat packet frequency is
// unchanged.
const mobClientPath=path.join(process.cwd(),'public','game','dungeon-mob-events.js');
if(!fs.existsSync(mobClientPath))throw new Error('Dungeon AI budget: public/game/dungeon-mob-events.js missing');
let mobClient=fs.readFileSync(mobClientPath,'utf8');
const materializeRx=/var MATERIALIZE_R=\d+;(?:\s*\/\/[^\n]*)?/;
const smoothStepRx=/var minStep=smoothMobile\(\)\?\d+:16;/;
if(!materializeRx.test(mobClient))throw new Error('Dungeon AI budget: materialize radius target changed');
if(!smoothStepRx.test(mobClient))throw new Error('Dungeon AI budget: mobile smoothing step target changed');
mobClient=mobClient.replace(materializeRx,'var MATERIALIZE_R=600; // PPA_DUNGEON_CLIENT_MOB_BUDGET_20261005_V2');
mobClient=mobClient.replace(smoothStepRx,'var minStep=smoothMobile()?50:16;');
fs.writeFileSync(mobClientPath,mobClient,'utf8');

const buildMeta=/<meta name="ppa-client-build" content="[^"]+">/;
if(buildMeta.test(html))html=html.replace(buildMeta,'<meta name="ppa-client-build" content="v663-combined-lowfps-sync-test-20261005">');

if(!html.includes(rxNew)||!html.includes(ryNew)||!html.includes(marker)){
  throw new Error('Dungeon AI budget: active ellipse invariant failed');
}
fs.writeFileSync(htmlPath,html,'utf8');
console.log('[PPA BUILD] Combined low-FPS test: active ellipse 240 x 400; mobile mob smoothing 50 ms; materialize radius 600; bosses unchanged');
