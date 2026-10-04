import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const htmlPath=path.join(ROOT,'public','index.html');
if(!fs.existsSync(htmlPath))throw new Error('Floating joystick postbuild: public/index.html missing');
let html=fs.readFileSync(htmlPath,'utf8');

const START='// Joystick — V38: one dedicated pointer owns movement.';
const END='// Attack button: ONE press = ONE attack.';
const start=html.indexOf(START);
const end=html.indexOf(END,start);
if(start<0||end<0||end<=start)throw new Error('Floating joystick postbuild: legacy joystick block not found');
if(html.indexOf(START,start+START.length)>=0)throw new Error('Floating joystick postbuild: legacy joystick marker not unique');
if(html.includes('PPA_FLOATING_JOYSTICK_20261004'))throw new Error('Floating joystick postbuild: patch already present');

const block=`// Joystick — V646: touch-only floating joystick, low-cost canvas-local input.
// PPA_FLOATING_JOYSTICK_20261004
// PPA_FLOATING_JOYSTICK_PERF_20261004
// Movement values (jX/jY), character speed and combat logic are unchanged.
let jA=false,jX=0,jY=0,jPointerId=null;
let jFloating=false,jCenterX=0,jCenterY=0;
const jB=document.getElementById('joyB'),jS=document.getElementById('joyS');
const joy=document.getElementById('joy');
const joySurface=document.getElementById('c');
const PPA_FLOATING_JOY_ENABLED=((navigator.maxTouchPoints||0)>0||('ontouchstart' in window));
const PPA_FLOATING_JOY_DEAD=8;
const PPA_FLOATING_JOY_MAX=50;

if(PPA_FLOATING_JOY_ENABLED){
  // Keep the floating HUD on its own composited layer. Do not let the visual
  // joystick itself become a hit target; the canvas owns the captured pointer.
  joy.style.display='none';
  joy.style.position='fixed';
  joy.style.left='0px';
  joy.style.top='0px';
  joy.style.right='auto';
  joy.style.bottom='auto';
  joy.style.pointerEvents='none';
  joy.style.willChange='transform';
  jS.style.left='37px';
  jS.style.top='37px';
  jS.style.willChange='transform';
  joySurface.style.touchAction='none';
}

function resetJoystick(pointerId){
  if(pointerId!==undefined&&pointerId!==null&&jPointerId!==null&&pointerId!==jPointerId)return;
  jA=false;jPointerId=null;jX=0;jY=0;jFloating=false;jCenterX=0;jCenterY=0;
  if(PPA_FLOATING_JOY_ENABLED){
    jS.style.transform='translate3d(0,0,0)';
    joy.style.display='none';
  }else{
    jS.style.left='37px';jS.style.top='37px';
  }
}
function updateJoystickFromPointer(e){
  if(!jA||e.pointerId!==jPointerId)return;
  let cx,cy;
  if(jFloating){cx=jCenterX;cy=jCenterY;}
  else{
    const r=joy.getBoundingClientRect();
    cx=r.left+r.width/2;cy=r.top+r.height/2;
  }
  const rawDx=e.clientX-cx,rawDy=e.clientY-cy;
  const d=Math.hypot(rawDx,rawDy),mx=PPA_FLOATING_JOY_MAX;
  let dx=rawDx,dy=rawDy;
  if(d>mx){dx=rawDx/d*mx;dy=rawDy/d*mx;}
  if(jFloating){
    if(d<=PPA_FLOATING_JOY_DEAD){jX=0;jY=0;}
    else{
      const mag=(Math.min(d,mx)-PPA_FLOATING_JOY_DEAD)/(mx-PPA_FLOATING_JOY_DEAD);
      const inv=1/d;
      jX=rawDx*inv*mag;jY=rawDy*inv*mag;
    }
    // Transform-only visual update avoids layout/reflow on every touch move.
    jS.style.transform='translate3d('+dx+'px,'+dy+'px,0)';
  }else{
    jX=dx/mx;jY=dy/mx;
    jS.style.left=(37+dx)+'px';jS.style.top=(37+dy)+'px';
  }
}
function ppaFloatingJoystickEligible(e){
  if(!PPA_FLOATING_JOY_ENABLED||e.pointerType!=='touch'||jPointerId!==null)return false;
  return e.target===joySurface&&e.clientX<=window.innerWidth*.5;
}
function ppaFloatingPointerDown(e){
  if(!ppaFloatingJoystickEligible(e))return;
  e.preventDefault();e.stopPropagation();
  jPointerId=e.pointerId;jA=true;jFloating=true;
  jCenterX=e.clientX;jCenterY=e.clientY;
  joy.style.transform='translate3d('+(jCenterX-65)+'px,'+(jCenterY-65)+'px,0)';
  jS.style.transform='translate3d(0,0,0)';
  joy.style.display='block';
  try{joySurface.setPointerCapture(e.pointerId)}catch(_){}
}
function ppaFloatingPointerMove(e){
  if(!jFloating||e.pointerId!==jPointerId)return;
  e.preventDefault();e.stopPropagation();
  updateJoystickFromPointer(e);
}
function ppaFloatingPointerEnd(e){
  if(!jFloating||e.pointerId!==jPointerId)return;
  e.preventDefault();e.stopPropagation();
  try{if(joySurface.hasPointerCapture(e.pointerId))joySurface.releasePointerCapture(e.pointerId)}catch(_){}
  resetJoystick(e.pointerId);
}

// Touch input is local to the game canvas. Pointer capture keeps move/up events
// on the canvas after the initial touch without document-wide capture listeners.
joySurface.addEventListener('pointerdown',ppaFloatingPointerDown,{passive:false});
joySurface.addEventListener('pointermove',ppaFloatingPointerMove,{passive:false});
joySurface.addEventListener('pointerup',ppaFloatingPointerEnd,{passive:false});
joySurface.addEventListener('pointercancel',ppaFloatingPointerEnd,{passive:false});

// Fine-pointer/desktop keeps the old fixed joystick behaviour.
function jPointerDown(e){
  if(PPA_FLOATING_JOY_ENABLED||jPointerId!==null)return;
  e.preventDefault();e.stopPropagation();
  jPointerId=e.pointerId;jA=true;jFloating=false;
  try{joy.setPointerCapture(e.pointerId)}catch(_){}
  updateJoystickFromPointer(e);
}
function jPointerMove(e){
  if(jFloating||e.pointerId!==jPointerId)return;
  e.preventDefault();e.stopPropagation();
  updateJoystickFromPointer(e);
}
function jPointerEnd(e){
  if(jFloating||e.pointerId!==jPointerId)return;
  e.preventDefault();e.stopPropagation();
  try{if(joy.hasPointerCapture(e.pointerId))joy.releasePointerCapture(e.pointerId)}catch(_){}
  resetJoystick(e.pointerId);
}
joy.addEventListener('pointerdown',jPointerDown,{passive:false});
joy.addEventListener('pointermove',jPointerMove,{passive:false});
joy.addEventListener('pointerup',jPointerEnd,{passive:false});
joy.addEventListener('pointercancel',jPointerEnd,{passive:false});
joy.addEventListener('lostpointercapture',e=>{if(!jFloating&&e.pointerId===jPointerId)resetJoystick(e.pointerId)});
joySurface.addEventListener('lostpointercapture',e=>{if(jFloating&&e.pointerId===jPointerId)resetJoystick(e.pointerId)});
addEventListener('blur',()=>resetJoystick());
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetJoystick()});

`;

html=html.slice(0,start)+block+html.slice(end);
const buildMeta=/<meta name="ppa-client-build" content="[^"]+">/;
if(!buildMeta.test(html))throw new Error('Floating joystick postbuild: client build meta missing');
html=html.replace(buildMeta,'<meta name="ppa-client-build" content="v646-floating-joystick-perf-20261004">');
for(const required of [
  'PPA_FLOATING_JOYSTICK_20261004',
  'PPA_FLOATING_JOYSTICK_PERF_20261004',
  "e.target===joySurface",
  "e.clientX<=window.innerWidth*.5",
  'PPA_FLOATING_JOY_DEAD=8',
  "joySurface.addEventListener('pointerdown',ppaFloatingPointerDown,{passive:false})",
  "jS.style.transform='translate3d('",
  'content="v646-floating-joystick-perf-20261004"'
])if(!html.includes(required))throw new Error('Floating joystick postbuild: missing invariant '+required);
for(const forbidden of [
  "document.addEventListener('pointermove',ppaFloatingPointerMove",
  "document.addEventListener('pointerdown',ppaFloatingPointerDown"
])if(html.includes(forbidden))throw new Error('Floating joystick postbuild: hot-path regression '+forbidden);
if(html.includes(START))throw new Error('Floating joystick postbuild: legacy joystick block survived');
fs.writeFileSync(htmlPath,html,'utf8');
console.log('Floating joystick postbuild applied: v646-floating-joystick-perf-20261004');
