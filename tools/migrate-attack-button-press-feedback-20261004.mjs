import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const PARTS=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const EXPECTED_OLD_HASH='7a67e1e1a42a1636e9f402ed99e91b7e4e94d9fcd40db3efc1b93cabfd47a0fa';
const oldBuffers=PARTS.map(p=>fs.readFileSync(p));
const oldPacked=Buffer.concat(oldBuffers);
const oldSourceBuf=zlib.gunzipSync(oldPacked);
const oldHash=crypto.createHash('sha256').update(oldSourceBuf).digest('hex');
if(oldHash!==EXPECTED_OLD_HASH)throw new Error(`Unexpected canonical source hash: ${oldHash}`);
let src=oldSourceBuf.toString('utf8');

const oldBlock=`function attackPointerDown(e){
  try{bA.setPointerCapture(e.pointerId)}catch(_){}
  triggerAttackInput(e);
}
function attackPointerEnd(e){
  if(e){
    try{e.preventDefault()}catch(_){}
    try{e.stopPropagation()}catch(_){}
    try{if(bA.hasPointerCapture(e.pointerId))bA.releasePointerCapture(e.pointerId)}catch(_){}
  }
  try{bA.blur()}catch(_){}
}
bA.addEventListener('pointerdown',attackPointerDown,{passive:false});
bA.addEventListener('touchstart',triggerAttackInput,{passive:false});
bA.addEventListener('touchend',triggerAttackInput,{passive:false});
bA.addEventListener('click',triggerAttackInput,{passive:false});
bA.addEventListener('pointerup',attackPointerEnd,{passive:false});
bA.addEventListener('pointercancel',attackPointerEnd,{passive:false});
bA.addEventListener('contextmenu',e=>e.preventDefault());`;

const newBlock=`// PPA_ATTACK_BUTTON_PRESS_FEEDBACK_20261004
// Raw input feedback only: this runs before combat eligibility/cooldown logic so
// a visible press means the attack control actually received the player's tap.
// It is event-driven and never adds work to the render/update loop.
let _attackPressCssReady=false;
let _attackPressReleaseTimer=0;
let _attackPressUntil=0;
function ensureAttackPressCss(){
  if(_attackPressCssReady)return;
  _attackPressCssReady=true;
  const s=document.createElement('style');
  s.textContent='#bAtk.ppaAttackPressed{scale:.94!important;filter:brightness(1.22) saturate(1.12)!important;box-shadow:inset 0 0 0 2px rgba(255,255,255,.28),0 0 12px rgba(255,210,90,.8)!important;}';
  document.head.appendChild(s);
}
function attackPressVisualStart(){
  ensureAttackPressCss();
  clearTimeout(_attackPressReleaseTimer);
  _attackPressUntil=performance.now()+90;
  bA.classList.add('ppaAttackPressed');
}
function attackPressVisualEnd(){
  clearTimeout(_attackPressReleaseTimer);
  const delay=Math.max(0,_attackPressUntil-performance.now());
  _attackPressReleaseTimer=setTimeout(()=>bA.classList.remove('ppaAttackPressed'),delay);
}
function attackPointerDown(e){
  attackPressVisualStart();
  try{bA.setPointerCapture(e.pointerId)}catch(_){}
  triggerAttackInput(e);
}
function attackTouchStart(e){
  attackPressVisualStart();
  triggerAttackInput(e);
}
function attackTouchEnd(e){
  attackPressVisualEnd();
  triggerAttackInput(e);
}
function attackPointerEnd(e){
  attackPressVisualEnd();
  if(e){
    try{e.preventDefault()}catch(_){}
    try{e.stopPropagation()}catch(_){}
    try{if(bA.hasPointerCapture(e.pointerId))bA.releasePointerCapture(e.pointerId)}catch(_){}
  }
  try{bA.blur()}catch(_){}
}
bA.addEventListener('pointerdown',attackPointerDown,{passive:false});
bA.addEventListener('touchstart',attackTouchStart,{passive:false});
bA.addEventListener('touchend',attackTouchEnd,{passive:false});
bA.addEventListener('click',triggerAttackInput,{passive:false});
bA.addEventListener('pointerup',attackPointerEnd,{passive:false});
bA.addEventListener('pointercancel',attackPointerEnd,{passive:false});
bA.addEventListener('contextmenu',e=>e.preventDefault());`;

const count=src.split(oldBlock).length-1;
if(count!==1)throw new Error(`attack pointer block target count=${count}`);
if(src.includes('PPA_ATTACK_BUTTON_PRESS_FEEDBACK_20261004'))throw new Error('Attack press feedback already present');
src=src.replace(oldBlock,newBlock);

for(const required of [
  'PPA_ATTACK_BUTTON_PRESS_FEEDBACK_20261004',
  "scale:.94!important",
  "performance.now()+90",
  'function attackTouchStart(e)',
  'function attackTouchEnd(e)',
  "bA.addEventListener('pointerdown',attackPointerDown,{passive:false});",
  "bA.addEventListener('click',triggerAttackInput,{passive:false});",
  'if(now-_combatAttackInputStamp<170)return;'
])if(!src.includes(required))throw new Error('Missing migrated invariant: '+required);
if((src.match(/PPA_ATTACK_BUTTON_PRESS_FEEDBACK_20261004/g)||[]).length!==1)throw new Error('Duplicate press feedback marker');

const newSourceBuf=Buffer.from(src,'utf8');
const newHash=crypto.createHash('sha256').update(newSourceBuf).digest('hex');
const newPacked=zlib.gzipSync(newSourceBuf,{level:9});

// Preserve the existing 12-part proportions. build.mjs concatenates all parts
// before gunzip, so the split points are storage-only and need no gzip boundary.
const oldTotal=oldBuffers.reduce((n,b)=>n+b.length,0);
let oldPrefix=0,newStart=0;
for(let i=0;i<PARTS.length;i++){
  let newEnd;
  if(i===PARTS.length-1)newEnd=newPacked.length;
  else{
    oldPrefix+=oldBuffers[i].length;
    newEnd=Math.round(newPacked.length*(oldPrefix/oldTotal));
  }
  fs.writeFileSync(PARTS[i],newPacked.subarray(newStart,newEnd));
  newStart=newEnd;
}
const verify=zlib.gunzipSync(Buffer.concat(PARTS.map(p=>fs.readFileSync(p))));
const verifyHash=crypto.createHash('sha256').update(verify).digest('hex');
if(verifyHash!==newHash)throw new Error(`Repacked source mismatch: ${verifyHash} != ${newHash}`);

const buildPath='build.mjs';
let build=fs.readFileSync(buildPath,'utf8');
const oldHashLine=`const EXPECTED_SOURCE_SHA256 = '${EXPECTED_OLD_HASH}';`;
const newHashLine=`const EXPECTED_SOURCE_SHA256 = '${newHash}';`;
if((build.split(oldHashLine).length-1)!==1)throw new Error('build.mjs old checksum target missing/drifted');
build=build.replace(oldHashLine,newHashLine);
const oldBuild="const CLIENT_BUILD = 'v636-player3d-melee-clipfilter-20261003';";
const newBuild="const CLIENT_BUILD = 'v637-attack-press-feedback-20261004';";
if((build.split(oldBuild).length-1)!==1)throw new Error('build.mjs client build target missing/drifted');
build=build.replace(oldBuild,newBuild);
fs.writeFileSync(buildPath,build,'utf8');

console.log(JSON.stringify({oldHash,newHash,oldPacked:oldPacked.length,newPacked:newPacked.length}));
