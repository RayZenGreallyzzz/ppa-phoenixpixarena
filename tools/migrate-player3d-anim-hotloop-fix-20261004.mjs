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
if(runtime.includes('PPA_PLAYER3D_ANIM_HOTLOOP_FIX_20261004'))throw new Error('hot-loop fix already present');
runtime=replaceExact(
  runtime,
  '// PPA_PLAYER3D_ANIM_SPEED_SYNC_20261004',
  '// PPA_PLAYER3D_ANIM_SPEED_SYNC_20261004\n  // PPA_PLAYER3D_ANIM_HOTLOOP_FIX_20261004',
  1,
  'runtime marker'
);
const oldSwitch=`  function switchAnim(e,name,now){
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
const newSwitch=`  function switchAnim(e,name){
    const next=e.actions&&(e.actions[name]||e.actions.idle);
    if(!next||next===e.current){e.anim=name;return}
    const rate=playerAnimTimeScale(e,name);
    try{
      next.enabled=true;next.reset();next.setEffectiveTimeScale(rate);next.play();
      if(e.current)e.current.crossFadeTo(next,.10,false);
      e.current=next;e.anim=name;e.animRate=rate;
    }catch(_){}
  }`;
runtime=replaceExact(runtime,oldSwitch,newSwitch,1,'runtime switchAnim');
runtime=replaceExact(runtime,'anim:\'idle\',animRate:1,animRateCheckAt:0,cfg:','anim:\'idle\',animRate:1,cfg:',1,'runtime instance hot-loop fields');
runtime=replaceExact(runtime,"switchAnim(e,'idle',performance.now());","switchAnim(e,'idle');",1,'runtime idle switch');
runtime=replaceExact(runtime,'switchAnim(e,desiredAnim(e,now),now);','switchAnim(e,desiredAnim(e,now));',1,'runtime frame switch');
runtime=replaceExact(runtime,'unified-v8-anim-speed-sync','unified-v9-anim-speed-hotloop-fix',2,'runtime version');
for(const required of [
  'PPA_PLAYER3D_ANIM_SPEED_SYNC_20261004',
  'PPA_PLAYER3D_ANIM_HOTLOOP_FIX_20261004',
  'function playerAnimTimeScale(e,name)',
  'next.setEffectiveTimeScale(rate)',
  'unified-v9-anim-speed-hotloop-fix',
  'PPA_PLAYER3D_MELEE_CLIP_FILTER_20261003'
])if(!runtime.includes(required))throw new Error('runtime invariant missing: '+required);
for(const forbidden of ['animRateCheckAt','lockMeleeAttackLowerBody','captureMeleeLowerBody'])if(runtime.includes(forbidden))throw new Error('forbidden hot-loop/per-frame helper survived: '+forbidden);
write(runtimePath,runtime);

const postPath='tools/postbuild-player-3d-unified-20261002.mjs';
let post=read(postPath);
const hotLoopBlock=`const attackFrameOld='const frameDur = Math.max(1, Math.round(60/a.fps));';
const attackFrameNew='const frameDur = Math.max(1, Math.round(60/(a.fps*playerAttackAnimRate())));';
const attackFrameCount=html.split(attackFrameOld).length-1;
if(attackFrameCount!==1)throw new Error('Unified 3D build: expected one attack frame-duration target, found '+attackFrameCount);
html=html.replace(attackFrameOld,attackFrameNew);
`;
post=replaceExact(post,hotLoopBlock,'',1,'remove legacy gameplay animation hot-loop');
post=replaceExact(post,'20261004u18','20261004u19',3,'runtime cache token');
post=replaceExact(
  post,
  "console.log('Unified Player3D V6: attack follows attack speed · run follows movement speed · idle stays 1x · zero-hot-loop melee guard preserved');",
  "console.log('Unified Player3D V7: attack/run 3D clip speed sync is transition-only · legacy gameplay animation timer restored · zero-hot-loop guard preserved');",
  1,
  'postbuild log version'
);
for(const required of [
  'PPA_PLAYER_ANIM_RATE_SYNC_20261004',
  'function playerAttackAnimRate()',
  'function playerRunAnimRate()',
  'player-3d-unified-runtime.js?v=20261004u19'
])if(!post.includes(required))throw new Error('postbuild invariant missing: '+required);
if(post.includes('60/(a.fps*playerAttackAnimRate())'))throw new Error('legacy gameplay attack timer is still speed-scaled');
write(postPath,post);

const buildPath='build.mjs';
let build=read(buildPath);
build=replaceExact(
  build,
  "const CLIENT_BUILD = 'v638-player3d-anim-speed-sync-20261004';",
  "const CLIENT_BUILD = 'v639-player3d-anim-hotloop-fix-20261004';",
  1,
  'client build version'
);
write(buildPath,build);

const testPath='.github/workflows/test-player3d-performance.yml';
let test=read(testPath);
test=replaceExact(test,'unified-v8-anim-speed-sync','unified-v9-anim-speed-hotloop-fix',2,'test runtime version');
test=replaceExact(test,'player-3d-unified-runtime.js?v=20261004u18','player-3d-unified-runtime.js?v=20261004u19',2,'test runtime cache');
test=replaceExact(test,'          grep -q "e.animRateCheckAt=stamp+120" gateway/player-3d-unified-runtime.js\n','          grep -q "PPA_PLAYER3D_ANIM_HOTLOOP_FIX_20261004" gateway/player-3d-unified-runtime.js\n          ! grep -q "animRateCheckAt" gateway/player-3d-unified-runtime.js\n',1,'source hot-loop guard');
test=replaceExact(test,"          if(!frame.includes('switchAnim(e,desiredAnim(e,now),now);'))throw new Error('timestamped animation switch missing');","          if(!frame.includes('switchAnim(e,desiredAnim(e,now));'))throw new Error('transition-only animation switch missing');\n          if(frame.includes('animRateCheckAt'))throw new Error('animation rate polling returned to Player3D frame loop');",1,'frame hot-loop node guard');
test=replaceExact(test,'          grep -q "e.animRateCheckAt=stamp+120" public/game/player-3d-unified-runtime.js\n','          grep -q "PPA_PLAYER3D_ANIM_HOTLOOP_FIX_20261004" public/game/player-3d-unified-runtime.js\n          ! grep -q "animRateCheckAt" public/game/player-3d-unified-runtime.js\n',1,'built hot-loop guard');
test=replaceExact(test,'          grep -q "function playerRunAnimRate()" public/index.html\n','          grep -q "function playerRunAnimRate()" public/index.html\n          ! grep -Fq "60/(a.fps*playerAttackAnimRate())" public/index.html\n',1,'built gameplay timer guard');
write(testPath,test);

console.log(JSON.stringify({
  runtimeVersion:'unified-v9-anim-speed-hotloop-fix',
  clientBuild:'v639-player3d-anim-hotloop-fix-20261004',
  runtimeCache:'20261004u19',
  policy:'3D animation speed is set only on clip transitions; gameplay attack timer remains fixed-FPS'
}));
