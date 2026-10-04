import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const PARTS=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const EXPECTED_OLD_HASH='a23969659df17d6f303e688c296f4a2de67b4be8b702693a1760afb4971e43b7';
const oldBuffers=PARTS.map(p=>fs.readFileSync(p));
const oldPacked=Buffer.concat(oldBuffers);
const oldSourceBuf=zlib.gunzipSync(oldPacked);
const oldHash=crypto.createHash('sha256').update(oldSourceBuf).digest('hex');
if(oldHash!==EXPECTED_OLD_HASH)throw new Error(`Unexpected canonical source hash: ${oldHash}`);
let src=oldSourceBuf.toString('utf8');

const start=src.indexOf('// Joystick — V38: one dedicated pointer owns movement.');
const end=src.indexOf('// Attack button: ONE press = ONE attack.',start);
if(start<0||end<0||end<=start)throw new Error('Joystick source block not found');
const oldBlock=src.slice(start,end);
if(!oldBlock.includes("joy.addEventListener('pointerdown'"))throw new Error('Unexpected joystick block');

const newBlock=`// Joystick — V645: touch-only floating joystick on the left half of the game canvas.\n// PPA_FLOATING_JOYSTICK_20261004\n// Movement values (jX/jY), speed and combat logic are unchanged. Only the touch origin moves.\nlet jA=false,jX=0,jY=0,jPointerId=null;\nlet jFloating=false,jCenterX=0,jCenterY=0;\nconst jB=document.getElementById('joyB'),jS=document.getElementById('joyS');\nconst joy=document.getElementById('joy');\nconst joySurface=document.getElementById('c');\nconst PPA_FLOATING_JOY_ENABLED=!!(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches)&&((navigator.maxTouchPoints||0)>0||('ontouchstart' in window));\nconst PPA_FLOATING_JOY_DEAD=8;\nconst PPA_FLOATING_JOY_MAX=50;\n\nif(PPA_FLOATING_JOY_ENABLED){\n  joy.style.display='none';\n  joy.style.bottom='auto';\n}\n\nfunction resetJoystick(pointerId){\n  if(pointerId!==undefined&&pointerId!==null&&jPointerId!==null&&pointerId!==jPointerId)return;\n  jA=false;jPointerId=null;jX=0;jY=0;jFloating=false;jCenterX=0;jCenterY=0;\n  jS.style.left='37px';jS.style.top='37px';\n  if(PPA_FLOATING_JOY_ENABLED)joy.style.display='none';\n}\nfunction updateJoystickFromPointer(e){\n  if(!jA||e.pointerId!==jPointerId)return;\n  e.preventDefault();\n  let cx,cy;\n  if(jFloating){cx=jCenterX;cy=jCenterY;}\n  else{\n    const r=joy.getBoundingClientRect();\n    cx=r.left+r.width/2;cy=r.top+r.height/2;\n  }\n  let dx=e.clientX-cx,dy=e.clientY-cy;\n  const d=Math.hypot(dx,dy),mx=PPA_FLOATING_JOY_MAX;\n  if(d>mx){dx=dx/d*mx;dy=dy/d*mx;}\n  if(jFloating&&d<=PPA_FLOATING_JOY_DEAD){\n    jX=0;jY=0;\n  }else if(jFloating&&d>0){\n    const clamped=Math.min(d,mx);\n    const mag=(clamped-PPA_FLOATING_JOY_DEAD)/(mx-PPA_FLOATING_JOY_DEAD);\n    const inv=1/d;\n    jX=(e.clientX-cx)*inv*mag;jY=(e.clientY-cy)*inv*mag;\n  }else{\n    jX=dx/mx;jY=dy/mx;\n  }\n  jS.style.left=(37+dx)+'px';jS.style.top=(37+dy)+'px';\n}\nfunction ppaFloatingJoystickEligible(e){\n  if(!PPA_FLOATING_JOY_ENABLED||e.pointerType!=='touch'||jPointerId!==null)return false;\n  if(e.target!==joySurface)return false;\n  return e.clientX<=window.innerWidth*.5;\n}\nfunction ppaFloatingPointerDown(e){\n  if(!ppaFloatingJoystickEligible(e))return;\n  e.preventDefault();e.stopPropagation();\n  jPointerId=e.pointerId;jA=true;jFloating=true;\n  jCenterX=e.clientX;jCenterY=e.clientY;\n  joy.style.left=(jCenterX-65)+'px';\n  joy.style.top=(jCenterY-65)+'px';\n  joy.style.bottom='auto';\n  joy.style.display='block';\n  try{joySurface.setPointerCapture(e.pointerId)}catch(_){}\n  updateJoystickFromPointer(e);\n}\nfunction ppaFloatingPointerMove(e){\n  if(!jFloating||e.pointerId!==jPointerId)return;\n  e.preventDefault();e.stopPropagation();\n  updateJoystickFromPointer(e);\n}\nfunction ppaFloatingPointerEnd(e){\n  if(!jFloating||e.pointerId!==jPointerId)return;\n  e.preventDefault();e.stopPropagation();\n  try{if(joySurface.hasPointerCapture(e.pointerId))joySurface.releasePointerCapture(e.pointerId)}catch(_){}\n  resetJoystick(e.pointerId);\n}\n\n// Capture phase turns a touch on the bare left-side game canvas into movement before\n// canvas click/target handlers can consume it. UI overlays/buttons remain untouched\n// because their event target is not the game canvas.\ndocument.addEventListener('pointerdown',ppaFloatingPointerDown,{passive:false,capture:true});\ndocument.addEventListener('pointermove',ppaFloatingPointerMove,{passive:false,capture:true});\ndocument.addEventListener('pointerup',ppaFloatingPointerEnd,{passive:false,capture:true});\ndocument.addEventListener('pointercancel',ppaFloatingPointerEnd,{passive:false,capture:true});\n\n// Keep the legacy fixed joystick for mouse/fine-pointer environments.\nfunction jPointerDown(e){\n  if(PPA_FLOATING_JOY_ENABLED||jPointerId!==null)return;\n  e.preventDefault();e.stopPropagation();\n  jPointerId=e.pointerId;jA=true;jFloating=false;\n  try{joy.setPointerCapture(e.pointerId)}catch(_){}\n  updateJoystickFromPointer(e);\n}\nfunction jPointerMove(e){\n  if(jFloating||e.pointerId!==jPointerId)return;\n  e.preventDefault();e.stopPropagation();\n  updateJoystickFromPointer(e);\n}\nfunction jPointerEnd(e){\n  if(jFloating||e.pointerId!==jPointerId)return;\n  e.preventDefault();e.stopPropagation();\n  try{if(joy.hasPointerCapture(e.pointerId))joy.releasePointerCapture(e.pointerId)}catch(_){}\n  resetJoystick(e.pointerId);\n}\n\njoy.addEventListener('pointerdown',jPointerDown,{passive:false});\njoy.addEventListener('pointermove',jPointerMove,{passive:false});\njoy.addEventListener('pointerup',jPointerEnd,{passive:false});\njoy.addEventListener('pointercancel',jPointerEnd,{passive:false});\njoy.addEventListener('lostpointercapture',e=>{if(!jFloating&&e.pointerId===jPointerId)resetJoystick(e.pointerId)});\njoySurface.addEventListener('lostpointercapture',e=>{if(jFloating&&e.pointerId===jPointerId)resetJoystick(e.pointerId)});\naddEventListener('blur',()=>resetJoystick());\ndocument.addEventListener('visibilitychange',()=>{if(document.hidden)resetJoystick()});\n\n`;
src=src.slice(0,start)+newBlock+src.slice(end);

for(const required of [
  'PPA_FLOATING_JOYSTICK_20261004',
  "e.target!==joySurface",
  "e.clientX<=window.innerWidth*.5",
  "PPA_FLOATING_JOY_DEAD=8",
  "document.addEventListener('pointerdown',ppaFloatingPointerDown,{passive:false,capture:true})",
  'PPA_MOB_PURSUIT_SLOTS_20261004',
  'PPA_MOB_CONTACT_TANGENT_GLIDE_20261004'
])if(!src.includes(required))throw new Error('Missing invariant: '+required);

const newSourceBuf=Buffer.from(src,'utf8');
const newHash=crypto.createHash('sha256').update(newSourceBuf).digest('hex');
const newPacked=zlib.gzipSync(newSourceBuf,{level:9});
const oldTotal=oldBuffers.reduce((n,b)=>n+b.length,0);
let oldPrefix=0,newStart=0;
for(let i=0;i<PARTS.length;i++){
  let newEnd;
  if(i===PARTS.length-1)newEnd=newPacked.length;
  else{oldPrefix+=oldBuffers[i].length;newEnd=Math.round(newPacked.length*(oldPrefix/oldTotal));}
  fs.writeFileSync(PARTS[i],newPacked.subarray(newStart,newEnd));
  newStart=newEnd;
}
const verify=zlib.gunzipSync(Buffer.concat(PARTS.map(p=>fs.readFileSync(p))));
const verifyHash=crypto.createHash('sha256').update(verify).digest('hex');
if(verifyHash!==newHash)throw new Error(`Repacked source mismatch: ${verifyHash} != ${newHash}`);

let build=fs.readFileSync('build.mjs','utf8');
const oldHashLine=`const EXPECTED_SOURCE_SHA256 = '${EXPECTED_OLD_HASH}';`;
if((build.split(oldHashLine).length-1)!==1)throw new Error('build checksum anchor drifted');
build=build.replace(oldHashLine,`const EXPECTED_SOURCE_SHA256 = '${newHash}';`);
const oldBuild="const CLIENT_BUILD = 'v644-mob-pursuit-slots-20261004';";
if((build.split(oldBuild).length-1)!==1)throw new Error('client build anchor drifted');
build=build.replace(oldBuild,"const CLIENT_BUILD = 'v645-floating-joystick-20261004';");
fs.writeFileSync('build.mjs',build,'utf8');
console.log(JSON.stringify({oldHash,newHash,build:'v645-floating-joystick-20261004'}));
