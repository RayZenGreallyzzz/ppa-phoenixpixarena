import fs from 'node:fs';
import path from 'node:path';

const htmlPath=path.join(process.cwd(),'public','index.html');
if(!fs.existsSync(htmlPath))throw new Error('Frame-time movement postbuild: public/index.html missing');
let html=fs.readFileSync(htmlPath,'utf8');

const MARKER='PPA_FRAME_TIME_PLAYER_MOVEMENT_20261005';

// The packed V278 gameplay loop applies P.sp as pixels PER FRAME. When FPS drops,
// world displacement drops with it (60 -> 30 FPS ~= half speed, 60 -> 15 ~= quarter).
// Restore the previously proven elapsed-frame normalization, without touching
// joystick sampling, combat cadence, attack speed, mob AI, realtime or animation.
const clockRx=/let __ppaHudNextAt=0;\s*function update\(\)\{/g;
const moveRx=/P\.vx=_moveX\*P\.sp\*shopSpeedMul\(\)\*_aiMoveMul;\s*P\.vy=_moveY\*P\.sp\*shopSpeedMul\(\)\*_aiMoveMul;\s*let nx=P\.x\+P\.vx,\s*ny=P\.y\+P\.vy;/g;

if(html.includes(MARKER)){
  console.log('[PPA BUILD] Frame-time player movement already present');
}else{
  const clockMatches=html.match(clockRx)||[];
  const moveMatches=html.match(moveRx)||[];
  if(clockMatches.length!==1)throw new Error('Frame-time movement: expected one update() clock anchor, found '+clockMatches.length);
  if(moveMatches.length!==1)throw new Error('Frame-time movement: expected one native displacement anchor, found '+moveMatches.length);

  html=html.replace(clockRx,`let __ppaHudNextAt=0;
let __ppaPlayerMoveClock=0;
function ppaPlayerMoveFrameScale(){
  /* ${MARKER} */
  const now=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
  if(!Number.isFinite(__ppaPlayerMoveClock)||__ppaPlayerMoveClock<=0){
    __ppaPlayerMoveClock=now;
    return 1;
  }
  const elapsed=now-__ppaPlayerMoveClock;
  __ppaPlayerMoveClock=now;
  // Preserve the previously tested safety bounds: never turn a long tab/background
  // pause into a world-position teleport.
  if(!Number.isFinite(elapsed)||elapsed<=0||elapsed>120)return 1;
  return Math.max(.20,Math.min(4.25,elapsed/(1000/60)));
}
function update(){`);

  html=html.replace(moveRx,`const _moveFrameScale=ppaPlayerMoveFrameScale();
  P.vx=_moveX*P.sp*shopSpeedMul()*_aiMoveMul;
  P.vy=_moveY*P.sp*shopSpeedMul()*_aiMoveMul;
  let nx=P.x+P.vx*_moveFrameScale, ny=P.y+P.vy*_moveFrameScale;`);
}

if(!html.includes(MARKER)||!html.includes('P.x+P.vx*_moveFrameScale')||!html.includes('elapsed>120)return 1')){
  throw new Error('Frame-time movement postbuild: invariant check failed');
}

const buildMeta=/<meta name="ppa-client-build" content="[^"]+">/;
if(buildMeta.test(html))html=html.replace(buildMeta,'<meta name="ppa-client-build" content="v662-frame-time-movement-20261005">');

fs.writeFileSync(htmlPath,html,'utf8');
console.log('[PPA BUILD] v662: player world displacement normalized to elapsed frame time; gameplay cadence unchanged');
