import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const PARTS=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const EXPECTED_OLD_HASH='4e6ad47447515e1aaa430dd9d399e9253c6d067fe26d842a52c0be588c3e70e0';
const oldBuffers=PARTS.map(p=>fs.readFileSync(p));
const oldPacked=Buffer.concat(oldBuffers);
const oldSourceBuf=zlib.gunzipSync(oldPacked);
const oldHash=crypto.createHash('sha256').update(oldSourceBuf).digest('hex');
if(oldHash!==EXPECTED_OLD_HASH)throw new Error(`Unexpected canonical source hash: ${oldHash}`);
let src=oldSourceBuf.toString('utf8');

const oldBlock=`  }else if(P.scene==='fartzone'){
    // Exact user-drawn meadow boundary: outside = solid collision.
    // Do not alter town/building hitboxes or other scenes.
    if(!pointInPolygonFartZone(nx,ny)){
      nx=P.x;ny=P.y;
    }
  }else{`;

const newBlock=`  }else if(P.scene==='fartzone'){
    // PPA_FARTZONE_AXIS_SLIDE_20261004
    // Exact user-drawn meadow boundary: outside = solid collision.
    // Keep joystick input alive and reject only the blocked axis, matching the
    // cheap axis-slide policy already used by dungeon/PvP/boss collision.
    if(!pointInPolygonFartZone(nx,ny)){
      if(pointInPolygonFartZone(nx,P.y)){
        ny=P.y;
      }else if(pointInPolygonFartZone(P.x,ny)){
        nx=P.x;
      }else{
        nx=P.x;ny=P.y;
      }
    }
  }else{`;

const hits=src.split(oldBlock).length-1;
if(hits!==1)throw new Error(`Fart Zone movement block target count=${hits}`);
if(src.includes('PPA_FARTZONE_AXIS_SLIDE_20261004'))throw new Error('Axis-slide marker already present');
src=src.replace(oldBlock,newBlock);

for(const required of [
  'PPA_FARTZONE_AXIS_SLIDE_20261004',
  'if(pointInPolygonFartZone(nx,P.y))',
  'else if(pointInPolygonFartZone(P.x,ny))',
  'function dgSlide(x,y,dx,dy,r)',
  'function clanSiegeSlide(x,y,dx,dy,r)',
  'function ppaMoveWithWorldBodyCollision(x,y,dx,dy,r)',
  'function clanBossMoveWithBodyCollision(x,y,dx,dy,r)',
  'function worldBossSlide(x,y,dx,dy,r)'
])if(!src.includes(required))throw new Error('Missing collision invariant: '+required);
if((src.match(/PPA_FARTZONE_AXIS_SLIDE_20261004/g)||[]).length!==1)throw new Error('Duplicate Fart Zone slide marker');

const newSourceBuf=Buffer.from(src,'utf8');
const newHash=crypto.createHash('sha256').update(newSourceBuf).digest('hex');
const newPacked=zlib.gzipSync(newSourceBuf,{level:9});

// Preserve the existing 12-part proportions. build.mjs concatenates all parts
// before gunzip, so split points are storage-only.
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
const oldBuild="const CLIENT_BUILD = 'v639-player3d-anim-hotloop-fix-20261004';";
const newBuild="const CLIENT_BUILD = 'v640-fartzone-axis-slide-20261004';";
if((build.split(oldBuild).length-1)!==1)throw new Error('build.mjs client build target missing/drifted');
build=build.replace(oldBuild,newBuild);
fs.writeFileSync(buildPath,build,'utf8');

console.log(JSON.stringify({oldHash,newHash,oldPacked:oldPacked.length,newPacked:newPacked.length,build:'v640-fartzone-axis-slide-20261004'}));
