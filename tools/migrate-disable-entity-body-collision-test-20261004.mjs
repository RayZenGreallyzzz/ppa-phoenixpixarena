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

function balancedEnd(text,openAt){
  let depth=0,quote=null,escape=false,line=false,block=false;
  for(let i=openAt;i<text.length;i++){
    const ch=text[i],nx=text[i+1];
    if(line){if(ch==='\n')line=false;continue}
    if(block){if(ch==='*'&&nx==='/'){block=false;i++}continue}
    if(quote){if(escape){escape=false;continue}if(ch==='\\'){escape=true;continue}if(ch===quote)quote=null;continue}
    if(ch==='/'&&nx==='/'){line=true;i++;continue}
    if(ch==='/'&&nx==='*'){block=true;i++;continue}
    if(ch==='\''||ch==='"'||ch==='`'){quote=ch;continue}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return i;
  }
  throw new Error('Unbalanced function block');
}
function replaceFunction(name,replacement){
  const sig=`function ${name}(`;
  const start=src.indexOf(sig);
  if(start<0||src.indexOf(sig,start+sig.length)>=0)throw new Error(`Function anchor invalid: ${name}`);
  const open=src.indexOf('{',start),end=balancedEnd(src,open);
  src=src.slice(0,start)+replacement+src.slice(end+1);
}

// Diagnostic build: remove ONLY player<->entity body blocking.
// Map/wall/room collision remains authoritative in the normal scene resolver.
replaceFunction('ppaMoveWithWorldBodyCollision',`// PPA_ENTITY_BODY_COLLISION_DISABLED_TEST_20261004
function ppaMoveWithWorldBodyCollision(x,y,dx,dy,r){
  return{x:x+dx,y:y+dy};
}`);

// Clan-boss arena wall collision stays active; only the boss body is ignored.
replaceFunction('clanBossMoveWithBodyCollision',`function clanBossMoveWithBodyCollision(x,y,dx,dy,r){
  return clanBossSlide(x,y,dx,dy,r);
}`);

// World-boss arena wall collision stays active; only the crystal/boss body is ignored.
replaceFunction('worldBossMoveWithCrystalCollision',`function worldBossMoveWithCrystalCollision(x,y,dx,dy,r){
  return worldBossSlide(x,y,dx,dy,r);
}`);

for(const required of [
  'PPA_ENTITY_BODY_COLLISION_DISABLED_TEST_20261004',
  'return clanBossSlide(x,y,dx,dy,r);',
  'return worldBossSlide(x,y,dx,dy,r);',
  'PPA_MOB_BOSS_SHADOWS_OFF_20261004',
  'PPA_FARTZONE_AXIS_SLIDE_20261004',
  'PPA_ATTACK_BUTTON_PRESS_FEEDBACK_20261004'
])if(!src.includes(required))throw new Error('Missing invariant: '+required);

// Preserve the normal map/wall resolvers used before/around entity collision.
for(const required of [
  "const mv=dgSlide(P.x,P.y,nx-P.x,ny-P.y,P.sz*0.24);",
  "const mv=clanBossMoveWithBodyCollision(P.x,P.y,nx-P.x,ny-P.y,P.sz*0.24);",
  "const mv=worldBossMoveWithCrystalCollision(P.x,P.y,nx-P.x,ny-P.y,P.sz*0.24);",
  'const resolved=resolveCollision(nx,ny);'
])if(!src.includes(required))throw new Error('Map/wall resolver invariant missing: '+required);

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
build=build.replace(oldBuild,"const CLIENT_BUILD = 'v643-no-entity-body-collision-test-20261004';");
fs.writeFileSync('build.mjs',build,'utf8');

console.log(JSON.stringify({oldHash,newHash,oldPacked:oldPacked.length,newPacked:newPacked.length,build:'v643-no-entity-body-collision-test-20261004'}));
