import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8')}
function write(path,text){fs.writeFileSync(path,text,'utf8')}
function count(text,needle){return text.split(needle).length-1}
function replaceExact(text,oldText,newText,expected,label){
  const n=count(text,oldText);
  if(n!==expected)throw new Error(`${label}: expected ${expected} target(s), found ${n}`);
  return text.split(oldText).join(newText);
}

const runtimePath='gateway/player-3d-unified-runtime.js';
let runtime=read(runtimePath);
if(runtime.includes('PPA_PLAYER3D_ATTACK_SPEED_SYNC_20261004'))throw new Error('Runtime attack-speed sync already present');
runtime=replaceExact(
  runtime,
  '// PPA_PLAYER3D_MELEE_CLIP_FILTER_20261003',
  '// PPA_PLAYER3D_MELEE_CLIP_FILTER_20261003\n  // PPA_PLAYER3D_ATTACK_SPEED_SYNC_20261004',
  1,
  'runtime marker'
);
const oldSwitch=`  function switchAnim(e,name){
    const next=e.actions&&(e.actions[name]||e.actions.idle);
    if(!next||next===e.current){e.anim=name;return}
    try{
      next.enabled=true;next.reset();next.play();
      if(e.current)e.current.crossFadeTo(next,.10,false);
      e.current=next;e.anim=name;
    }catch(_){}
  }`;
const newSwitch=`  function playerAttackAnimTimeScale(e){
    try{
      let raw=1;
      if(e&&e.kind==='local'){
        if(typeof window.playerAttackAnimRate==='function')raw=Number(window.playerAttackAnimRate());
        else{
          const base=Math.max(.01,Number(typeof P!=='undefined'&&P&&P.atkSpd)||1);
          let mul=1;
          if(typeof window.shopAtkSpeedMul==='function'){
            const m=Number(window.shopAtkSpeedMul());
            if(Number.isFinite(m)&&m>0)mul=m;
          }
          raw=base*mul;
        }
      }else if(e&&e.data){
        raw=Number(e.data.atkspd||e.data.atkSpd||e.data.attackSpeed||1);
      }
      if(!Number.isFinite(raw)||raw<=0)raw=1;
      return Math.max(.5,Math.min(2.5,raw));
    }catch(_){return 1}
  }
  function switchAnim(e,name){
    const next=e.actions&&(e.actions[name]||e.actions.idle);
    if(!next||next===e.current){e.anim=name;return}
    try{
      next.enabled=true;
      next.reset();
      next.setEffectiveTimeScale(name==='attack'?playerAttackAnimTimeScale(e):1);
      next.play();
      if(e.current)e.current.crossFadeTo(next,.10,false);
      e.current=next;e.anim=name;
    }catch(_){}
  }`;
runtime=replaceExact(runtime,oldSwitch,newSwitch,1,'runtime switchAnim');
const runtimeVersionCount=count(runtime,'unified-v7-melee-clip-filter');
if(runtimeVersionCount<2)throw new Error(`runtime version targets drifted: ${runtimeVersionCount}`);
runtime=runtime.split('unified-v7-melee-clip-filter').join('unified-v8-attack-speed-sync');
for(const required of [
  'PPA_PLAYER3D_ATTACK_SPEED_SYNC_20261004',
  'function playerAttackAnimTimeScale(e)',
  "next.setEffectiveTimeScale(name==='attack'?playerAttackAnimTimeScale(e):1);",
  'Math.max(.5,Math.min(2.5,raw))',
  'unified-v8-attack-speed-sync',
  'PPA_PLAYER3D_MELEE_CLIP_FILTER_20261003'
])if(!runtime.includes(required))throw new Error('runtime invariant missing: '+required);
for(const forbidden of ['lockMeleeAttackLowerBody','captureMeleeLowerBody'])if(runtime.includes(forbidden))throw new Error('forbidden per-frame melee helper returned: '+forbidden);
write(runtimePath,runtime);

const postPath='tools/postbuild-player-3d-unified-20261002.mjs';
let post=read(postPath);
if(post.includes('PPA_ATTACK_ANIM_RATE_SYNC_20261004'))throw new Error('Postbuild attack-speed sync already present');
const classHelperOld=`function playerIsClass(key){return playerClassKey()===key}
function playerAnimTiming(name){`;
const classHelperNew=`function playerIsClass(key){return playerClassKey()===key}
/* PPA_ATTACK_ANIM_RATE_SYNC_20261004 */
function playerAttackAnimRate(){
  var base=Math.max(.01,Number(P&&P.atkSpd)||1),mul=1;
  try{
    if(typeof window.shopAtkSpeedMul==='function'){
      var m=Number(window.shopAtkSpeedMul());
      if(Number.isFinite(m)&&m>0)mul=m;
    }
  }catch(_){}
  return Math.max(.5,Math.min(2.5,base*mul));
}
function playerAnimTiming(name){`;
post=replaceExact(post,classHelperOld,classHelperNew,1,'postbuild attack-rate helper');
const postTimingOld=`for(const [from,to] of timingReplacements){
  const n=html.split(from).length-1;
  if(n!==1)throw new Error('Unified 3D build: expected one gameplay animation timing target, found '+n+' for '+from);
  html=html.replace(from,to);
}
if(!html.includes('const PLAYER_ANIM_TIMING={'))throw new Error('Unified 3D build: gameplay animation timing table missing');`;
const postTimingNew=`for(const [from,to] of timingReplacements){
  const n=html.split(from).length-1;
  if(n!==1)throw new Error('Unified 3D build: expected one gameplay animation timing target, found '+n+' for '+from);
  html=html.replace(from,to);
}
const attackFrameOld='const frameDur = Math.max(1, Math.round(60/a.fps));';
const attackFrameNew='const frameDur = Math.max(1, Math.round(60/(a.fps*playerAttackAnimRate())));';
const attackFrameCount=html.split(attackFrameOld).length-1;
if(attackFrameCount!==1)throw new Error('Unified 3D build: expected one attack frame-duration target, found '+attackFrameCount);
html=html.replace(attackFrameOld,attackFrameNew);
if(!html.includes('const PLAYER_ANIM_TIMING={'))throw new Error('Unified 3D build: gameplay animation timing table missing');`;
post=replaceExact(post,postTimingOld,postTimingNew,1,'postbuild attack frame rate');
post=replaceExact(post,'20261003u17','20261004u18',3,'runtime cache token');
post=replaceExact(
  post,
  "console.log('Unified Player3D V5: local/remote real players are 3D-only · legacy local sprite renderer/HUD/direction helpers removed · Stage 5A2 AI/stress cleanup verified');",
  "console.log('Unified Player3D V6: attack animation follows effective attack speed · local/remote real players remain 3D-only · zero-hot-loop melee guard preserved');",
  1,
  'postbuild log version'
);
for(const required of [
  'PPA_ATTACK_ANIM_RATE_SYNC_20261004',
  'function playerAttackAnimRate()',
  'Math.max(.5,Math.min(2.5,base*mul))',
  '60/(a.fps*playerAttackAnimRate())',
  'player-3d-unified-runtime.js?v=20261004u18'
])if(!post.includes(required))throw new Error('postbuild invariant missing: '+required);
write(postPath,post);

const buildPath='build.mjs';
let build=read(buildPath);
build=replaceExact(
  build,
  "const CLIENT_BUILD = 'v637-attack-press-feedback-20261004';",
  "const CLIENT_BUILD = 'v638-player3d-attack-speed-sync-20261004';",
  1,
  'client build version'
);
write(buildPath,build);

const testPath='.github/workflows/test-player3d-performance.yml';
let test=read(testPath);
test=replaceExact(test,'unified-v7-melee-clip-filter','unified-v8-attack-speed-sync',2,'test runtime version');
test=replaceExact(test,'player-3d-unified-runtime.js?v=20261003u17','player-3d-unified-runtime.js?v=20261004u18',1,'test runtime cache');
const testMarkerOld=`          grep -q "PPA_PLAYER3D_MELEE_CLIP_FILTER_20261003" gateway/player-3d-unified-runtime.js
          grep -Fq "MELEE_INPLACE_CLASSES=new Set(['tank','barbarian','paladin','assassin'])" gateway/player-3d-unified-runtime.js`;
const testMarkerNew=`          grep -q "PPA_PLAYER3D_MELEE_CLIP_FILTER_20261003" gateway/player-3d-unified-runtime.js
          grep -q "PPA_PLAYER3D_ATTACK_SPEED_SYNC_20261004" gateway/player-3d-unified-runtime.js
          grep -q "setEffectiveTimeScale(name==='attack'?playerAttackAnimTimeScale(e):1)" gateway/player-3d-unified-runtime.js
          grep -Fq "MELEE_INPLACE_CLASSES=new Set(['tank','barbarian','paladin','assassin'])" gateway/player-3d-unified-runtime.js`;
test=replaceExact(test,testMarkerOld,testMarkerNew,1,'gateway performance guard');
const builtMarkerOld=`          grep -q "PPA_PLAYER3D_MELEE_CLIP_FILTER_20261003" public/game/player-3d-unified-runtime.js
          grep -Fq "MELEE_INPLACE_CLASSES=new Set(['tank','barbarian','paladin','assassin'])" public/game/player-3d-unified-runtime.js`;
const builtMarkerNew=`          grep -q "PPA_PLAYER3D_MELEE_CLIP_FILTER_20261003" public/game/player-3d-unified-runtime.js
          grep -q "PPA_PLAYER3D_ATTACK_SPEED_SYNC_20261004" public/game/player-3d-unified-runtime.js
          grep -q "setEffectiveTimeScale(name==='attack'?playerAttackAnimTimeScale(e):1)" public/game/player-3d-unified-runtime.js
          grep -Fq "MELEE_INPLACE_CLASSES=new Set(['tank','barbarian','paladin','assassin'])" public/game/player-3d-unified-runtime.js`;
test=replaceExact(test,builtMarkerOld,builtMarkerNew,1,'built performance guard');
write(testPath,test);

console.log(JSON.stringify({
  runtimeVersion:'unified-v8-attack-speed-sync',
  clientBuild:'v638-player3d-attack-speed-sync-20261004',
  runtimeCache:'20261004u18',
  animationRateClamp:[0.5,2.5]
}));
