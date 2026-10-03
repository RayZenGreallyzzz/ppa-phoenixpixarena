import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const PARTS=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const EXPECTED_OLD_HASH='caea00852b6e54cef46d18c479f6042faa705a04313e342ab8b90cfaac18192b';
const oldBuffers=PARTS.map(p=>fs.readFileSync(p));
const oldPacked=Buffer.concat(oldBuffers);
const oldSourceBuf=zlib.gunzipSync(oldPacked);
const oldHash=crypto.createHash('sha256').update(oldSourceBuf).digest('hex');
if(oldHash!==EXPECTED_OLD_HASH)throw new Error(`Unexpected canonical source hash: ${oldHash}`);
let src=oldSourceBuf.toString('utf8');

const oldBlock=`function smartAttackReach(target){
  const range=playerBasicRange();
  if(P.scene==='clanboss1'&&target&&target.isClanBoss){
    return Math.max(35,range*.90);
  }
  const edge=(target&&target.sz&&target.sz>30)
    ?Math.max(0,(target.sz-30)*.4)
    :0;
  // Stop a little inside the legal attack range so moving targets
  // do not instantly step out again.
  return Math.max(35,range*.90+edge);
}`;

const newBlock=`// PPA_MELEE_SMART_APPROACH_20261003
// Damage eligibility keeps playerBasicRange(). Smart Attack movement uses a
// separate, closer stop distance so melee reaches the target visually before
// starting its in-place combo. Large mobs keep the existing body-size offset.
const MELEE_SMART_APPROACH_RANGE={tank:72,barbarian:78,paladin:74,assassin:64};
function smartAttackBaseReach(){
  const key=classBaseKey();
  const melee=MELEE_SMART_APPROACH_RANGE[key];
  return Number.isFinite(melee)?melee:playerBasicRange()*.90;
}
function smartAttackReach(target){
  const base=smartAttackBaseReach();
  if(P.scene==='clanboss1'&&target&&target.isClanBoss){
    return Math.max(35,base);
  }
  const edge=(target&&target.sz&&target.sz>30)
    ?Math.max(0,(target.sz-30)*.4)
    :0;
  return Math.max(35,base+edge);
}`;

const count=src.split(oldBlock).length-1;
if(count!==1)throw new Error(`smartAttackReach canonical target count=${count}`);
if(src.includes('PPA_MELEE_SMART_APPROACH_20261003'))throw new Error('Melee approach migration already present');
src=src.replace(oldBlock,newBlock);

for(const required of [
  'PPA_MELEE_SMART_APPROACH_20261003',
  'tank:72,barbarian:78,paladin:74,assassin:64',
  'return Number.isFinite(melee)?melee:playerBasicRange()*.90;',
  'return Math.max(35,base+edge);'
])if(!src.includes(required))throw new Error('Missing migrated invariant: '+required);

const newSourceBuf=Buffer.from(src,'utf8');
const newHash=crypto.createHash('sha256').update(newSourceBuf).digest('hex');
const newPacked=zlib.gzipSync(newSourceBuf,{level:9});

// Preserve the existing 12-part proportions. The parts are only storage chunks;
// build.mjs concatenates them before gunzip, so no gzip boundary is required.
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
const oldBuild="const CLIENT_BUILD = 'v634-player3d-melee-inplace-20261003';";
const newBuild="const CLIENT_BUILD = 'v635-melee-smart-approach-20261003';";
if((build.split(oldBuild).length-1)!==1)throw new Error('build.mjs client build target missing/drifted');
build=build.replace(oldBuild,newBuild);
fs.writeFileSync(buildPath,build,'utf8');

console.log(JSON.stringify({oldHash,newHash,oldPacked:oldPacked.length,newPacked:newPacked.length}));
