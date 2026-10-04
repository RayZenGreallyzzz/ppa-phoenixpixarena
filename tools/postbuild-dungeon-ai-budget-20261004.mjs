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

const re=/if\(P\.scene==='dungeon'&&!e\.isBoss&&!e\.aggro&&e\.hp===e\.mhp&&\s*\(\(dx\*dx\)\/(PPA_DUNGEON_ACTIVE_RX\*PPA_DUNGEON_ACTIVE_RX)\+\(dy\*dy\)\/(PPA_DUNGEON_ACTIVE_RY\*PPA_DUNGEON_ACTIVE_RY)>1\)\)\{/;
const matches=html.match(new RegExp(re.source,'g'))||[];
if(matches.length!==1){
  console.warn('[PPA BUILD WARN] Dungeon AI budget target count='+matches.length+'; leaving gameplay unchanged');
  process.exit(0);
}

html=html.replace(re,`/* ${marker}: normal dungeon mobs outside the active ellipse sleep regardless of stale aggro/damage state. Bosses remain exempt. */\nif(P.scene==='dungeon'&&!e.isBoss&&\n     ((dx*dx)/(PPA_DUNGEON_ACTIVE_RX*PPA_DUNGEON_ACTIVE_RX)+(dy*dy)/(PPA_DUNGEON_ACTIVE_RY*PPA_DUNGEON_ACTIVE_RY)>1)){`);

const buildMeta=/<meta name="ppa-client-build" content="[^"]+">/;
if(buildMeta.test(html))html=html.replace(buildMeta,'<meta name="ppa-client-build" content="v648-dungeon-ai-budget-20261004">');

fs.writeFileSync(htmlPath,html,'utf8');
console.log('[PPA BUILD] Dungeon AI budget: distant normal mobs now sleep even after stale aggro/damage; bosses unchanged');
