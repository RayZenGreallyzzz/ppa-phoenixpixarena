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

const block=`// Joystick — V645: touch-only floating joystick on the left half of the game canvas.
// PPA_FLOATING_JOYSTICK_20261004
// Movement values (jX/jY), character speed and combat logic are unchanged.
let jA=false,jX=0,jY=0,jPointerId=null;
let jFloating=false,jCenterX=0,jCenterY=0;
const jB=document.getElementById('joyB'),jS=document.getElementById('joyS');
const joy=document.getElementById('joy');
const joySurface=document.getElementById('c');
const PPA_FLOATING_JOY_ENABLED=!!(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches)&&((navigator.maxTouchPoints||0)>0||('ontouchstart' in window));
const PPA_FLOATING_JOY_DEAD=8;
const PPA_FLOATING_JOY_MAX=50;

if(PPA_FLOATING_JOY_ENABLED){
  joy.style.display='none';
  joy.style.bottom='auto';
}

function resetJoystick(pointerId){
  if(pointerId!==undefined&&pointerId!==null&&jPointerId!==null&&pointerId!==jPointerId)return;
  jA=false;jPointerId=null;jX=0;jY=0;jFloating=false;jCenterX=0;jCenterY=0;
  jS.style.left='37px';jS.style.top='37px';
  if(PPA_FLOATING_JOY_ENABLED)joy.style.display='none';
}
function updateJoystickFromPointer(e){
  if(!jA||e.pointerId!==jPointerId)return;
  e.preventDefault();
  let cx,cy;
  if(jFloating){cx=jCenterX;cy=jCenterY;}
  else{
    const r=joy.getBoundingClientRect();
    cx=r.left+r.width/2;cy=r.top+r.height/2;
  }
  let rawDx=e.clientX-cx,rawDy=e.clientY-cy;
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
  }else{
    jX=dx/mx;jY=dy/mx;
  }
  jS.style.left=(37+dx)+'px';jS.style.top=(37+dy)+'px';
}
function ppaFloatingJoystickEligible(e){
  if(!PPA_FLOATING_JOY_ENABLED||e.pointerType!=='touch'||jPointerId!==null)return false;
  if(e.target!==joySurface)return false;
  return e.clientX<=window.innerWidth*.5;
}
function ppaFloatingPointerDown(e){
  if(!ppaFloatingJoystickEligible(e))return;
  e.preventDefault();e.stopPropagation();
  jPointerId=e.pointerId;jA=true;jFloating=true;
  jCenterX=e.clientX;jCenterY=e.clientY;
  joy.style.left=(jCenterX-65)+'px';
  joy.style.top=(jCenterY-65)+'px';
  joy.style.bottom='auto';
  joy.style.display='block';
  try{joySurface.setPointerCapture(e.pointerId)}catch(_){}
  updateJoystickFromPointer(e);
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

// Capture phase claims only a bare-canvas touch in the left half. UI overlays,
// chat, inventory and action buttons remain untouched because their target is not #c.
document.addEventListener('pointerdown',ppaFloatingPointerDown,{passive:false,capture:true});
document.addEventListener('pointermove',ppaFloatingPointerMove,{passive:false,capture:true});
document.addEventListener('pointerup',ppaFloatingPointerEnd,{passive:false,capture:true});
document.addEventListener('pointercancel',ppaFloatingPointerEnd,{passive:false,capture:true});

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
for(const required of [
  'PPA_FLOATING_JOYSTICK_20261004',
  "e.target!==joySurface",
  "e.clientX<=window.innerWidth*.5",
  'PPA_FLOATING_JOY_DEAD=8',
  "document.addEventListener('pointerdown',ppaFloatingPointerDown,{passive:false,capture:true})"
])if(!html.includes(required))throw new Error('Floating joystick postbuild: missing invariant '+required);
if(html.includes(START))throw new Error('Floating joystick postbuild: legacy joystick block survived');
fs.writeFileSync(htmlPath,html,'utf8');
console.log('Floating joystick postbuild applied');
