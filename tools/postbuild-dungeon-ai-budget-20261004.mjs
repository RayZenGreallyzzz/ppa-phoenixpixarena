import fs from 'node:fs';
import path from 'node:path';

const htmlPath=path.join(process.cwd(),'public','index.html');
if(!fs.existsSync(htmlPath))throw new Error('Dungeon AI budget postbuild: public/index.html missing');
let html=fs.readFileSync(htmlPath,'utf8');

const marker='PPA_DUNGEON_AI_BUDGET_20261004';
if(!html.includes(marker)){
  const re=/if\(P\.scene==='dungeon'&&!e\.isBoss&&!e\.aggro&&e\.hp===e\.mhp&&\s*\(\(dx\*dx\)\/(PPA_DUNGEON_ACTIVE_RX\*PPA_DUNGEON_ACTIVE_RX)\+\(dy\*dy\)\/(PPA_DUNGEON_ACTIVE_RY\*PPA_DUNGEON_ACTIVE_RY)>1\)\)\{/;
  const matches=html.match(new RegExp(re.source,'g'))||[];
  if(matches.length!==1){
    console.warn('[PPA BUILD WARN] Dungeon AI budget target count='+matches.length+'; leaving gameplay unchanged');
  }else{
    html=html.replace(re,`/* ${marker}: normal dungeon mobs outside the active ellipse sleep regardless of stale aggro/damage state. Bosses remain exempt. */\nif(P.scene==='dungeon'&&!e.isBoss&&\n     ((dx*dx)/(PPA_DUNGEON_ACTIVE_RX*PPA_DUNGEON_ACTIVE_RX)+(dy*dy)/(PPA_DUNGEON_ACTIVE_RY*PPA_DUNGEON_ACTIVE_RY)>1)){`);

    const buildMeta=/<meta name="ppa-client-build" content="[^"]+">/;
    if(buildMeta.test(html))html=html.replace(buildMeta,'<meta name="ppa-client-build" content="v648-dungeon-ai-budget-20261004">');

    fs.writeFileSync(htmlPath,html,'utf8');
    console.log('[PPA BUILD] Dungeon AI budget: distant normal mobs now sleep even after stale aggro/damage; bosses unchanged');
  }
}else{
  console.log('[PPA BUILD] Dungeon AI budget already present');
}

// A/B PERF TEST: on coarse/mobile input, authoritative 10 Hz mob positions are
// applied directly. This removes only the extra client requestAnimationFrame
// smoothing loop; server AI, packet cadence, combat and desktop smoothing stay intact.
const mobEventsPath=path.join(process.cwd(),'public','game','dungeon-mob-events.js');
if(!fs.existsSync(mobEventsPath))throw new Error('Dungeon mobile smoothing A/B: public/game/dungeon-mob-events.js missing');
let mobJs=fs.readFileSync(mobEventsPath,'utf8');
const smoothMarker='PPA_MOBILE_MOB_SMOOTH_AB_20261004';
if(!mobJs.includes(smoothMarker)){
  const stateAnchor="var authority=new Map(), deadUntil=new Map(), entityCache=new Map(), entityCacheLen=-1, entityCacheAt=0, diagCache=null, diagCacheAt=0, catalogCount=0, smoothEntities=new Set(), smoothRaf=0, smoothLast=0, smoothQueuedAt=0;";
  const queueAnchor="e.__ppaTargetX=x;e.__ppaTargetY=y;\n      // Stationary/remote-far mobs do not need a second animation loop.";
  if((mobJs.split(stateAnchor).length-1)!==1)throw new Error('Dungeon mobile smoothing A/B: state anchor changed');
  if((mobJs.split(queueAnchor).length-1)!==1)throw new Error('Dungeon mobile smoothing A/B: queueSmooth anchor changed');

  mobJs=mobJs.replace(stateAnchor,stateAnchor+"\n  /* "+smoothMarker+" */\n  var PPA_MOBILE_DIRECT_MOB_POS=false;\n  try{PPA_MOBILE_DIRECT_MOB_POS=((navigator.maxTouchPoints||0)>0)||matchMedia('(pointer:coarse)').matches}catch(_){}" );

  mobJs=mobJs.replace(queueAnchor,"e.__ppaTargetX=x;e.__ppaTargetY=y;\n      if(PPA_MOBILE_DIRECT_MOB_POS){\n        applying++;\n        try{e.x=x;e.y=y}finally{applying--}\n        smoothEntities.delete(e);\n        return;\n      }\n      // Stationary/remote-far mobs do not need a second animation loop.");

  fs.writeFileSync(mobEventsPath,mobJs,'utf8');
  console.log('[PPA BUILD] Mobile mob smoothing A/B: direct authoritative positions enabled on coarse/touch devices; desktop unchanged');
}else{
  console.log('[PPA BUILD] Mobile mob smoothing A/B already present');
}
