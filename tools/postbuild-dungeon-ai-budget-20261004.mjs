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

const buildMeta=/<meta name="ppa-client-build" content="[^"]+">/;
if(buildMeta.test(html))html=html.replace(buildMeta,'<meta name="ppa-client-build" content="v653-dungeon-active-zone-240x400-20261004">');

fs.writeFileSync(htmlPath,html,'utf8');
console.log('[PPA BUILD] Dungeon AI budget: active ellipse 240 x 400; distant normal mobs sleep; bosses unchanged');
