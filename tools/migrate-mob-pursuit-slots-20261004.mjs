import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const PARTS=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const EXPECTED_OLD_HASH='573cd5a78045c5ca5e9ef9a222baaedc559efc295eb0f376c9458e15e39cd167';
const oldBuffers=PARTS.map(p=>fs.readFileSync(p));
const oldPacked=Buffer.concat(oldBuffers);
const oldSourceBuf=zlib.gunzipSync(oldPacked);
const oldHash=crypto.createHash('sha256').update(oldSourceBuf).digest('hex');
if(oldHash!==EXPECTED_OLD_HASH)throw new Error(`Unexpected canonical source hash: ${oldHash}`);
let src=oldSourceBuf.toString('utf8');

function replaceOnce(oldText,newText,label){
  const n=src.split(oldText).length-1;
  if(n!==1)throw new Error(`${label}: expected 1 anchor, got ${n}`);
  src=src.replace(oldText,newText);
}

// 24 deterministic pursuit slots. No mob-vs-mob search/collision is used.
// First 16 are on the outer attack ring; last 8 are on an inner staggered ring.
replaceOnce(
  'const DUNGEON_AGGRO_R=200;',
  `const DUNGEON_AGGRO_R=200;\n// PPA_MOB_PURSUIT_SLOTS_20261004\n// Flat precomputed unit vectors: no per-frame sin/cos and no pairwise mob collision.\nconst PPA_MOB_PURSUIT_SLOT_VEC=[\n  1,0, .92388,.38268, .70711,.70711, .38268,.92388,\n  0,1, -.38268,.92388, -.70711,.70711, -.92388,.38268,\n  -1,0, -.92388,-.38268, -.70711,-.70711, -.38268,-.92388,\n  0,-1, .38268,-.92388, .70711,-.70711, .92388,-.38268,\n  .92388,.38268, .38268,.92388, -.38268,.92388, -.92388,.38268,\n  -.92388,-.38268, -.38268,-.92388, .38268,-.92388, .92388,-.38268\n];`,
  'slot-vector insert'
);

const oldMove=`      let tx,ty,move=false;\n\n      if(e.aggro){\n        const cdx=chaseX-e.x,cdy=chaseY-e.y;\n        const cd=Math.hypot(cdx,cdy);\n        const stopDist=(P.scene==='dungeon'&&e.edgeChase)?10:(e.isFartGuard?FART_GUARD_ATTACK_REACH:reach);\n        if(cd>stopDist){\n          tx=cdx/cd*e.sp*P.slowMul*(typeof v189EnemyMoveMul==='function'?v189EnemyMoveMul(e):1);\n          ty=cdy/cd*e.sp*P.slowMul*(typeof v189EnemyMoveMul==='function'?v189EnemyMoveMul(e):1);\n          move=true;\n        }\n      }else if(homeD>4){`;

const newMove=`      let tx,ty,move=false;\n\n      // Standard dungeon/arena mobs no longer all chase the exact same P.x/P.y.\n      // A stable id selects one of 24 attack positions around the player. This is\n      // O(1) per active mob and avoids expensive mob-vs-mob separation entirely.\n      let ppaSlotChase=false;\n      if(e.aggro&&!e.edgeChase&&(P.scene==='dungeon'||P.scene==='arena')){\n        const slot=(Math.abs(Number(e.id)||0)|0)%24;\n        const vi=slot*2;\n        const rr=slot<16?Math.max(14,reach-4):Math.max(10,reach*.56);\n        chaseX=P.x+PPA_MOB_PURSUIT_SLOT_VEC[vi]*rr;\n        chaseY=P.y+PPA_MOB_PURSUIT_SLOT_VEC[vi+1]*rr;\n        // Only allocate/clamp on the rare frame where a slot falls outside its room.\n        if(P.scene==='dungeon'&&e.room!==undefined&&!dgPointInRoom(e.room,chaseX,chaseY,0)){\n          const sq=dgClampToRoom(e.room,chaseX,chaseY,Math.max(8,e.sz*.14));\n          chaseX=sq.x;chaseY=sq.y;\n        }\n        ppaSlotChase=true;\n      }\n\n      if(e.aggro){\n        const cdx=chaseX-e.x,cdy=chaseY-e.y;\n        const cd=Math.hypot(cdx,cdy);\n        const stopDist=(P.scene==='dungeon'&&e.edgeChase)?10:(ppaSlotChase?3:(e.isFartGuard?FART_GUARD_ATTACK_REACH:reach));\n        if(cd>stopDist){\n          tx=cdx/cd*e.sp*P.slowMul*(typeof v189EnemyMoveMul==='function'?v189EnemyMoveMul(e):1);\n          ty=cdy/cd*e.sp*P.slowMul*(typeof v189EnemyMoveMul==='function'?v189EnemyMoveMul(e):1);\n          move=true;\n        }\n      }else if(homeD>4){`;
replaceOnce(oldMove,newMove,'mob chase block');

for(const required of [
  'PPA_MOB_PURSUIT_SLOTS_20261004',
  'const slot=(Math.abs(Number(e.id)||0)|0)%24;',
  "(P.scene==='dungeon'||P.scene==='arena')",
  'ppaSlotChase?3',
  'PPA_MOB_BOSS_SHADOWS_OFF_20261004',
  'PPA_MOB_CONTACT_TANGENT_GLIDE_20261004',
  'PPA_ATTACK_BUTTON_PRESS_FEEDBACK_20261004'
])if(!src.includes(required))throw new Error('Missing invariant: '+required);

// Guard against accidentally introducing pairwise mob separation in this patch.
if(src.includes('PPA_MOB_PAIRWISE_SEPARATION_20261004'))throw new Error('Pairwise mob separation must stay disabled');

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
const oldBuild="const CLIENT_BUILD = 'v642-mob-contact-tangent-glide-20261004';";
if((build.split(oldBuild).length-1)!==1)throw new Error('client build anchor drifted');
build=build.replace(oldBuild,"const CLIENT_BUILD = 'v644-mob-pursuit-slots-20261004';");
fs.writeFileSync('build.mjs',build,'utf8');

console.log(JSON.stringify({oldHash,newHash,oldPacked:oldPacked.length,newPacked:newPacked.length,build:'v644-mob-pursuit-slots-20261004'}));
