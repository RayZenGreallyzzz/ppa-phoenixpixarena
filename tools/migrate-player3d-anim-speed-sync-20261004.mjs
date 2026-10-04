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
if(runtime.includes('PPA_PLAYER3D_ANIM_SPEED_SYNC_20261004'))throw new Error('Runtime animation-speed sync already present');
runtime=replaceExact(
  runtime,
  '// PPA_PLAYER3D_MELEE_CLIP_FILTER_20261003',
  '// PPA_PLAYER3D_MELEE_CLIP_FILTER_20261003\n  // PPA_PLAYER3D_ANIM_SPEED_SYNC_20261004',
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
const newSwitch=`  function playerAnimTimeScale(e,name){
    if(name!=='attack'&&name!=='run')return 1;
    try{
      if(e&&e.kind==='local'){
        if(typeof window.playerAnimRate==='function'){
          const v=Number(window.playerAnimRate(name));
          if(Number.isFinite(v)&&v>0)return name==='attack'?Math.max(.60,Math.min(2.50,v)):Math.max(.65,Math.min(2.00,v));
        }
        if(typeof P!=='undefined'&&P){
          if(name==='attack'){
            const base=Math.max(.01,Number(P.baseAtkSpd)||Number(P.atkSpd)||1);
            const current=Math.max(.01,Number(P.atkSpd)||base);
            let mul=1;
            if(typeof window.shopAtkSpeedMul==='function'){
              const m=Number(window.shopAtkSpeedMul());
              if(Number.isFinite(m)&&m>0)mul=m;
            }
            return Math.max(.60,Math.min(2.50,(current*mul)/base));
          }
          const base=Math.max(.01,Number(P.baseSp)||Number(P.spd)||Number(P.sp)||1);
          const current=Math.max(.01,Number(P.spd)||Number(P.sp)||base);
          let mul=1;
          if(typeof window.shopSpeedMul==='function'){
            const m=Number(window.shopSpeedMul());
            if(Number.isFinite(m)&&m>0)mul=m;
          }
          return Math.max(.65,Math.min(2.00,(current*mul)/base));
        }
      }
    }catch(_){}
    return 1;
  }
  function switchAnim(e,name,now){
    const next=e.actions&&(e.actions[name]||e.actions.idle);
    if(!next){e.anim=name;return}
    const stamp=Number.isFinite(Number(now))?Number(now):performance.now();
    const same=next===e.current;
    if(same&&name===e.anim&&stamp<Number(e.animRateCheckAt||0))return;
    const rate=playerAnimTimeScale(e,name);
    e.animRateCheckAt=stamp+120;
    if(same){
      try{
        if(Math.abs(rate-(Number(e.animRate)||1))>.01)next.setEffectiveTimeScale(rate);
        e.animRate=rate;e.anim=name;
      }catch(_){}
      return;
    }
    try{
      next.enabled=true;next.reset();next.setEffectiveTimeScale(rate);next.play();
      if(e.current)e.current.crossFadeTo(next,.10,false);
      e.current=next;e.anim=name;e.animRate=rate;
    }catch(_){}
  }`;
runtime=replaceExact(runtime,oldSwitch,newSwitch,1,'runtime switchAnim');
runtime=replaceExact(runtime,"switchAnim(e,'idle');","switchAnim(e,'idle',performance.now());",1,'initial idle switch');
runtime=replaceExact(runtime,"switchAnim(e,desiredAnim(e,now));","switchAnim(e,desiredAnim(e,now),now);",1,'frame animation switch');
runtime=replaceExact(
  runtime,
  "actions:null,current:null,anim:'idle',cfg:null,error:'',lastWX:null",
  "actions:null,current:null,anim:'idle',animRate:1,animRateCheckAt:0,cfg:null,error:'',lastWX:null",
  1,
  'instance animation-rate cache'
);
const runtimeVersionCount=count(runtime,'unified-v7-melee-clip-filter');
if(runtimeVersionCount<2)throw new Error(`runtime version targets drifted: ${runtimeVersionCount}`);
runtime=runtime.split('unified-v7-melee-clip-filter').join('unified-v8-anim-speed-sync');
for(const required of [
  'PPA_PLAYER3D_ANIM_SPEED_SYNC_20261004',
  'function playerAnimTimeScale(e,name)',
  "if(name!=='attack'&&name!=='run')return 1;",
  'Math.max(.60,Math.min(2.50,(current*mul)/base))',
  'Math.max(.65,Math.min(2.00,(current*mul)/base))',
  'e.animRateCheckAt=stamp+120;',
  'next.setEffectiveTimeScale(rate)',
  'unified-v8-anim-speed-sync',
  'PPA_PLAYER3D_MELEE_CLIP_FILTER_20261003'
])if(!runtime.includes(required))throw new Error('runtime invariant missing: '+required);
for(const forbidden of ['lockMeleeAttackLowerBody','captureMeleeLowerBody'])if(runtime.includes(forbidden))throw new Error('forbidden per-frame melee helper returned: '+forbidden);
write(runtimePath,runtime);

const postPath='tools/postbuild-player-3d-unified-20261002.mjs';
let post=read(postPath);
if(post.includes('PPA_PLAYER_ANIM_RATE_SYNC_20261004'))throw new Error('Postbuild animation-rate sync already present');
const classHelperOld=`function playerIsClass(key){return playerClassKey()===key}
function playerAnimTiming(name){`;
const classHelperNew=`function playerIsClass(key){return playerClassKey()===key}
/* PPA_PLAYER_ANIM_RATE_SYNC_20261004 */
function playerAttackAnimRate(){
  var base=Math.max(.01,Number(P&&P.baseAtkSpd)||Number(P&&P.atkSpd)||1);
  var current=Math.max(.01,Number(P&&P.atkSpd)||base),mul=1;
  try{
    if(typeof window.shopAtkSpeedMul==='function'){
      var m=Number(window.shopAtkSpeedMul());
      if(Number.isFinite(m)&&m>0)mul=m;
    }
  }catch(_){}
  return Math.max(.60,Math.min(2.50,(current*mul)/base));
}
function playerRunAnimRate(){
  var base=Math.max(.01,Number(P&&P.baseSp)||Number(P&&P.spd)||Number(P&&P.sp)||1);
  var current=Math.max(.01,Number(P&&P.spd)||Number(P&&P.sp)||base),mul=1;
  try{
    if(typeof window.shopSpeedMul==='function'){
      var m=Number(window.shopSpeedMul());
      if(Number.isFinite(m)&&m>0)mul=m;
    }
  }catch(_){}
  return Math.max(.65,Math.min(2.00,(current*mul)/base));
}
function playerAnimRate(name){
  return name==='attack'?playerAttackAnimRate():(name==='run'?playerRunAnimRate():1);
}
function playerAnimTiming(name){`;
post=replaceExact(post,classHelperOld,classHelperNew,1,'postbuild animation-rate helpers');
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
  "console.log('Unified Player3D V6: attack follows attack speed · run follows movement speed · idle stays 1x · zero-hot-loop melee guard preserved');",
  1,
  'postbuild log version'
);
for(const required of [
  'PPA_PLAYER_ANIM_RATE_SYNC_20261004',
  'function playerAttackAnimRate()',
  'function playerRunAnimRate()',
  'function playerAnimRate(name)',
  'Math.max(.60,Math.min(2.50,(current*mul)/base))',
  'Math.max(.65,Math.min(2.00,(current*mul)/base))',
  '60/(a.fps*playerAttackAnimRate())',
  'player-3d-unified-runtime.js?v=20261004u18'
])if(!post.includes(required))throw new Error('postbuild invariant missing: '+required);
write(postPath,post);

const buildPath='build.mjs';
let build=read(buildPath);
build=replaceExact(
  build,
  "const CLIENT_BUILD = 'v637-attack-press-feedback-20261004';",
  "const CLIENT_BUILD = 'v638-player3d-anim-speed-sync-20261004';",
  1,
  'client build version'
);
write(buildPath,build);

console.log(JSON.stringify({
  runtimeVersion:'unified-v8-anim-speed-sync',
  clientBuild:'v638-player3d-anim-speed-sync-20261004',
  runtimeCache:'20261004u18',
  attackRateClamp:[0.60,2.50],
  runRateClamp:[0.65,2.00],
  refreshMs:120,
  baseline:'effective stat / class base stat'
}));
