import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const PARTS=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const EXPECTED_OLD_HASH='e16a8febcde72799d2fe9345b181598ab57e7cc766b66cd0d1f80c84108424e4';
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

replaceFunction('ppaWorldBodiesFreeAt',`// PPA_MOB_CONTACT_TANGENT_GLIDE_20261004
// Return the blocking body itself so one near-body snapshot can be reused for
// full/X/Y/tangent checks during the same movement step.
function ppaWorldBlockingBody(near,x,y,fromX,fromY){
  for(var i=0;i<near.length;i++){
    var e=near[i];
    if(Math.abs(e.x-x)>230||Math.abs(e.y-y)>230)continue;
    var q=ppaWorldBodyMetric(e,x,y);
    if(q<0){
      if(fromX!==undefined&&fromY!==undefined){
        var q0=ppaWorldBodyMetric(e,fromX,fromY);
        if(q0<0&&q>q0)continue;
      }
      return e;
    }
  }
  return null;
}
function ppaWorldBodiesFreeAt(x,y,fromX,fromY,near){
  near=near||ppaNearWorldBodies();
  return !ppaWorldBlockingBody(near,x,y,fromX,fromY);
}

let PPA_BODY_GLIDE_TARGET=null;
let PPA_BODY_GLIDE_SIDE=1;
function ppaWorldBodyTangentGlide(x,y,dx,dy,r,near,e){
  if(!e)return null;
  var speed=Math.hypot(dx,dy);
  if(speed<.001)return null;

  // Match ppaWorldBodyMetric's invisible contact ellipse exactly.
  var sz=e.sz||30,cx0=e.x,cy0,rx0,ry0;
  if(e.isBoss){cy0=e.y+sz*.55;rx0=sz*.60;ry0=sz*.20;}
  else if(e.type&&e.type.slimeScavenger){cy0=e.y+6;rx0=13;ry0=4;}
  else if(e.type&&e.type.caveSpider){cy0=e.y+10;rx0=24;ry0=7;}
  else if(e.animPack){var sh=Math.max(8,e.animPack.h*.28);cy0=e.y+7;rx0=sh;ry0=Math.max(3,sh*.28);}
  else{cy0=e.y+sz*.50;rx0=sz*.45;ry0=sz*.18;}

  var ps=P.sz||60;
  var rx=Math.max(1,rx0+ps*.38),ry=Math.max(1,ry0+ps*.14);
  var relX=x-cx0,relY=(y+ps*.45)-cy0;

  // Tangent to the ellipse = perpendicular to its gradient normal.
  var tx=-relY/(ry*ry),ty=relX/(rx*rx);
  var tl=Math.hypot(tx,ty);
  if(tl<1e-7){tx=-dy;ty=dx;tl=Math.hypot(tx,ty);if(tl<1e-7)return null;}
  tx/=tl;ty/=tl;

  var along=dx*tx+dy*ty;
  if(PPA_BODY_GLIDE_TARGET!==e){
    PPA_BODY_GLIDE_TARGET=e;
    var cross=relX*dy-relY*dx;
    if(Math.abs(cross)>.001)PPA_BODY_GLIDE_SIDE=cross>0?1:-1;
    else if(Math.abs(relX)>=Math.abs(relY))PPA_BODY_GLIDE_SIDE=relX<=0?1:-1;
    else PPA_BODY_GLIDE_SIDE=relY<=0?-1:1;
  }
  if(Math.abs(along)>speed*.12)PPA_BODY_GLIDE_SIDE=along>0?1:-1;

  // Keep full joystick speed on the tangent. This is intentionally only used
  // after direct + axis movement have all failed, so there is no extra work in free movement.
  var step=PPA_BODY_GLIDE_SIDE*speed;
  var gx=x+tx*step,gy=y+ty*step;
  if(ppaScenePointWalkableForBody(gx,gy,r)&&!ppaWorldBlockingBody(near,gx,gy,x,y))return{x:gx,y:gy};

  // If the preferred side is occupied by another body/wall, try the opposite tangent once.
  gx=x-tx*step;gy=y-ty*step;
  if(ppaScenePointWalkableForBody(gx,gy,r)&&!ppaWorldBlockingBody(near,gx,gy,x,y)){
    PPA_BODY_GLIDE_SIDE=-PPA_BODY_GLIDE_SIDE;
    return{x:gx,y:gy};
  }
  return null;
}`);

replaceFunction('ppaMoveWithWorldBodyCollision',`function ppaMoveWithWorldBodyCollision(x,y,dx,dy,r){
  // Snapshot nearby bodies once. Contact resolution reuses this exact list,
  // avoiding repeated cache/timer work when the joystick is held against a mob.
  var near=ppaNearWorldBodies();
  var fx=x+dx,fy=y+dy;
  var blocker=ppaWorldBlockingBody(near,fx,fy,x,y);
  if(!blocker){PPA_BODY_GLIDE_TARGET=null;return{x:fx,y:fy};}

  // Never accept a zero-length axis as a successful slide.
  if(Math.abs(dx)>.001){
    var xx=x+dx;
    if(ppaScenePointWalkableForBody(xx,y,r)&&!ppaWorldBlockingBody(near,xx,y,x,y))return{x:xx,y:y};
  }
  if(Math.abs(dy)>.001){
    var yy=y+dy;
    if(ppaScenePointWalkableForBody(x,yy,r)&&!ppaWorldBlockingBody(near,x,yy,x,y))return{x:x,y:yy};
  }

  // Head-on contact: glide around the body instead of returning the same point.
  var glide=ppaWorldBodyTangentGlide(x,y,dx,dy,r,near,blocker);
  if(glide)return glide;
  return{x:x,y:y};
}`);

for(const required of [
  'PPA_MOB_CONTACT_TANGENT_GLIDE_20261004',
  'function ppaWorldBlockingBody(near,x,y,fromX,fromY)',
  'function ppaWorldBodyTangentGlide(x,y,dx,dy,r,near,e)',
  'Math.abs(dx)>.001',
  'Math.abs(dy)>.001',
  'PPA_MOB_COLLISION_LITE_20261004',
  'PPA_MOB_BOSS_SHADOWS_OFF_20261004',
  'PPA_FARTZONE_AXIS_SLIDE_20261004',
  'PPA_ATTACK_BUTTON_PRESS_FEEDBACK_20261004'
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
const oldBuild="const CLIENT_BUILD = 'v641-mob-collision-lite-shadowless-20261004';";
if((build.split(oldBuild).length-1)!==1)throw new Error('client build anchor drifted');
build=build.replace(oldBuild,"const CLIENT_BUILD = 'v642-mob-contact-tangent-glide-20261004';");
fs.writeFileSync('build.mjs',build,'utf8');

console.log(JSON.stringify({oldHash,newHash,oldPacked:oldPacked.length,newPacked:newPacked.length,build:'v642-mob-contact-tangent-glide-20261004'}));
