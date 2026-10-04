import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const PARTS=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const EXPECTED_OLD_HASH='edbb99deae7bb62deabc5fb5081267a714ef7fbad401f9d468cbc1f144f07357';
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
function replaceOne(from,to,label){
  const n=src.split(from).length-1;
  if(n!==1)throw new Error(`${label}: expected 1 target, got ${n}`);
  src=src.replace(from,to);
}

replaceFunction('ppaWorldBodyMetric',`// PPA_MOB_COLLISION_LITE_20261004
// Same contact ellipse as before, evaluated without temporary geometry/player
// objects and without division in the movement hot path.
function ppaWorldBodyMetric(e,x,y){
  if(!e||e.hp<=0||e.isClanBoss)return Infinity;
  var sz=e.sz||30,cx0=e.x,cy0,rx0,ry0;
  if(e.isBoss){cy0=e.y+sz*.55;rx0=sz*.60;ry0=sz*.20;}
  else if(e.type&&e.type.slimeScavenger){cy0=e.y+6;rx0=13;ry0=4;}
  else if(e.type&&e.type.caveSpider){cy0=e.y+10;rx0=24;ry0=7;}
  else if(e.animPack){var sh=Math.max(8,e.animPack.h*.28);cy0=e.y+7;rx0=sh;ry0=Math.max(3,sh*.28);}
  else{cy0=e.y+sz*.50;rx0=sz*.45;ry0=sz*.18;}
  var ps=P.sz||60;
  var rx=Math.max(1,rx0+ps*.38),ry=Math.max(1,ry0+ps*.14);
  var dx=x-cx0,dy=(y+ps*.45)-cy0;
  var rx2=rx*rx,ry2=ry*ry;
  return dx*dx*ry2+dy*dy*rx2-rx2*ry2;
}`);

replaceFunction('ppaWorldBodiesFreeAt',`function ppaWorldBodiesFreeAt(x,y,fromX,fromY){
  const near=ppaNearWorldBodies();
  for(var i=0;i<near.length;i++){
    var e=near[i];
    if(Math.abs(e.x-x)>230||Math.abs(e.y-y)>230)continue;
    var q=ppaWorldBodyMetric(e,x,y);
    if(q<0){
      if(fromX!==undefined&&fromY!==undefined){
        var q0=ppaWorldBodyMetric(e,fromX,fromY);
        if(q0<0&&q>q0)continue;
      }
      return false;
    }
  }
  return true;
}`);

replaceFunction('ppaMoveWithWorldBodyCollision',`function ppaMoveWithWorldBodyCollision(x,y,dx,dy,r){
  var fx=x+dx,fy=y+dy;
  if(ppaWorldBodiesFreeAt(fx,fy,x,y))return{x:fx,y:fy};

  var xx=x+dx;
  if(ppaScenePointWalkableForBody(xx,y,r)&&ppaWorldBodiesFreeAt(xx,y,x,y))return{x:xx,y:y};

  var yy=y+dy;
  if(ppaScenePointWalkableForBody(x,yy,r)&&ppaWorldBodiesFreeAt(x,yy,x,y))return{x:x,y:yy};

  return{x:x,y:y};
}`);

replaceFunction('clanBossBodyFreeAt',`function clanBossBodyFreeAt(x,y){
  var e=clanBossCombatTarget();
  if(!e)return true;
  var sz=e.sz||176,ps=P.sz||60,cerb=clanBossIsCerberus(e);
  var cy=e.y+sz*(cerb?.46:.55);
  var rx=sz*(cerb?.73:.62)+ps*.38;
  var ry=sz*(cerb?.27:.28)+ps*.14;
  var dx=x-e.x,dy=(y+ps*.45)-cy;
  var rx2=rx*rx,ry2=ry*ry;
  return dx*dx*ry2+dy*dy*rx2>=rx2*ry2;
}`);

replaceFunction('worldCrystalBossBodyMetric',`function worldCrystalBossBodyMetric(e,x,y){
  if(!e)return Infinity;
  const ps=P.sz||60;
  const rx=Math.max(1,WORLD_CRYSTAL_BOSS_SHADOW.rx+ps*.38);
  const ry=Math.max(1,WORLD_CRYSTAL_BOSS_SHADOW.ry+ps*.14);
  const dx=x-e.x,dy=(y+ps*.45)-(e.y+WORLD_CRYSTAL_BOSS_SHADOW.cy);
  const rx2=rx*rx,ry2=ry*ry;
  return dx*dx*ry2+dy*dy*rx2-rx2*ry2;
}`);
replaceFunction('worldCrystalBossBodyFreeAt',`function worldCrystalBossBodyFreeAt(x,y,fromX,fromY){
  const e=worldCrystalBossEntity();
  if(!e)return true;
  const q=worldCrystalBossBodyMetric(e,x,y);
  if(q>=0)return true;
  if(fromX!==undefined&&fromY!==undefined){
    const prev=worldCrystalBossBodyMetric(e,fromX,fromY);
    if(prev<0&&q>prev)return true;
  }
  return false;
}`);

const oldBossShadow=`      cx.fillStyle='rgba(0,0,0,0.45)';
      cx.beginPath();
      if(e.isClanBoss){
        // V101: visible contact shadow and physical body collision use the same geometry.
        const _bg=clanBossBodyGeometry(e);
        cx.ellipse(
          sx+(_bg.cx-e.x),
          sy+(_bg.cy-e.y),
          _bg.rx,_bg.ry,0,0,Math.PI*2
        );
      }else{
        cx.ellipse(sx,sy+e.sz*0.55,e.sz*0.6,e.sz*0.2,0,0,Math.PI*2);
      }
      cx.fill();`;
replaceOne(oldBossShadow,`      // PPA_MOB_BOSS_SHADOWS_OFF_20261004
      // Contact footprint stays collision-only; no extra ellipse draw per frame.`, 'main boss shadow');

const oldMobShadow=`    cx.fillStyle='rgba(0,0,0,0.4)';
    cx.beginPath();
    if(isScavengerSlime)cx.ellipse(sx,sy+6,13*eliteScale,4*eliteScale,0,0,Math.PI*2);
    else if(isCaveSpider)cx.ellipse(sx,sy+10,24*eliteScale,7*eliteScale,0,0,Math.PI*2);
    else if(isApprovedAnimated){
      const sh=Math.max(8,e.animPack.h*0.28)*eliteScale;
      cx.ellipse(sx,sy+7,sh,Math.max(3,sh*0.28),0,0,Math.PI*2);
    }
    else cx.ellipse(sx,sy+e.sz*0.5,e.sz*0.45*eliteScale,e.sz*0.18*eliteScale,0,0,Math.PI*2);
    cx.fill();`;
replaceOne(oldMobShadow,`    // Visual mob contact shadow removed; collision footprint remains invisible.`, 'ordinary mob shadow');

const oldCrystalShadow=`  // Shadow is also the physical body collision footprint.
  cx.fillStyle='rgba(0,0,0,.42)';
  cx.beginPath();
  cx.ellipse(
    sx,sy+WORLD_CRYSTAL_BOSS_SHADOW.cy,
    WORLD_CRYSTAL_BOSS_SHADOW.rx,WORLD_CRYSTAL_BOSS_SHADOW.ry,
    0,0,Math.PI*2
  );
  cx.fill();`;
replaceOne(oldCrystalShadow,`  // Titan contact shadow removed; WORLD_CRYSTAL_BOSS_SHADOW is collision-only.`, 'Titan shadow');

const oldD21Shadow=`  cx.fillStyle='rgba(0,0,0,.42)';
  cx.beginPath();cx.ellipse(sx,sy+30,62,20,0,0,Math.PI*2);cx.fill();`;
replaceOne(oldD21Shadow,`  // Dungeon boss contact shadow removed; collision remains independent.`, 'Dungeon21 shadow');

for(const required of [
  'PPA_MOB_COLLISION_LITE_20261004',
  'PPA_MOB_BOSS_SHADOWS_OFF_20261004',
  'function ppaMoveWithWorldBodyCollision(x,y,dx,dy,r)',
  'function clanBossMoveWithBodyCollision(x,y,dx,dy,r)',
  'function worldBossMoveWithCrystalCollision(x,y,dx,dy,r)',
  'PPA_FARTZONE_AXIS_SLIDE_20261004',
  'PPA_ATTACK_BUTTON_PRESS_FEEDBACK_20261004'
])if(!src.includes(required))throw new Error('Missing invariant: '+required);
for(const old of [oldBossShadow,oldMobShadow,oldCrystalShadow,oldD21Shadow])if(src.includes(old))throw new Error('Visual shadow block survived');

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

const buildPath='build.mjs';
let build=fs.readFileSync(buildPath,'utf8');
const oldHashLine=`const EXPECTED_SOURCE_SHA256 = '${EXPECTED_OLD_HASH}';`;
const newHashLine=`const EXPECTED_SOURCE_SHA256 = '${newHash}';`;
if((build.split(oldHashLine).length-1)!==1)throw new Error('build checksum anchor drifted');
build=build.replace(oldHashLine,newHashLine);
const oldBuild="const CLIENT_BUILD = 'v640-fartzone-axis-slide-20261004';";
const newBuild="const CLIENT_BUILD = 'v641-mob-collision-lite-shadowless-20261004';";
if((build.split(oldBuild).length-1)!==1)throw new Error('client build anchor drifted');
build=build.replace(oldBuild,newBuild);
fs.writeFileSync(buildPath,build,'utf8');

console.log(JSON.stringify({oldHash,newHash,oldPacked:oldPacked.length,newPacked:newPacked.length,build:'v641-mob-collision-lite-shadowless-20261004'}));
