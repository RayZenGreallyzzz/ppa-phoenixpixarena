export function functionRange(src,name){
  const sig=`function ${name}(`;
  const start=src.indexOf(sig);
  if(start<0)throw new Error(`Missing function ${name}`);
  const brace=src.indexOf('{',start);
  if(brace<0)throw new Error(`Missing body for ${name}`);
  let depth=0,quote='',esc=false,comment='';
  for(let i=brace;i<src.length;i++){
    const c=src[i],next=src[i+1];
    if(comment==='line'){if(c==='\n')comment='';continue}
    if(comment==='block'){if(c==='*'&&next==='/'){comment='';i++}continue}
    if(quote){
      if(esc)esc=false;
      else if(c==='\\')esc=true;
      else if(c===quote)quote='';
      continue;
    }
    if(c==='/'&&next==='/'){comment='line';i++;continue}
    if(c==='/'&&next==='*'){comment='block';i++;continue}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='{')depth++;
    else if(c==='}'&&--depth===0)return{start,end:i+1,text:src.slice(start,i+1)};
  }
  throw new Error(`Unclosed function ${name}`);
}

function replaceFunction(src,name,next,guard){
  const r=functionRange(src,name);
  if(guard&&!guard(r.text))throw new Error(`Unexpected ${name} shape`);
  return src.slice(0,r.start)+next+src.slice(r.end);
}

// Extract the existing formula verbatim. Never install a stale copy of damage
// math over a newer canonical source, or change the RNG/impact timing.
function basicDamageFunctions(source){
  const roll=functionRange(source,'basicAttackRoll').text;
  const rng='const crit=Math.random()*100<(P.crit||0);';
  const multiplier='const critMul=crit?((P.critDmg||180)/100):1;';
  const result='return {damage:real,crit:crit};';
  for(const token of [rng,multiplier,result]){
    if(roll.split(token).length!==2)throw new Error('Unexpected basicAttackRoll shape: '+token);
  }
  const helper=roll.replace('function basicAttackRoll(target){','function basicAttackDamage(target,critMul){')
    .replace(rng,'').replace(multiplier,'critMul=Number.isFinite(Number(critMul))?Number(critMul):1;')
    .replace(result,'return real;');
  return helper+`\nfunction basicAttackRoll(target){
  const crit=Math.random()*100<(P.crit||0);
  const critMul=crit?((P.critDmg||180)/100):1;
  return {damage:basicAttackDamage(target,critMul),crit:crit};
}`;
}

const GNOME_FIRE=`function gnomeFireCannonball(){
  // Select ONCE at the moment of the shot. No target search is done in the projectile update loop.
  let target=null;
  if(P.tid!=null){
    target=EN.find(function(e){return e&&e.id==P.tid&&e.hp>0&&targetIsValid(e)})||null;
    if(target){
      const edge=(target.sz&&target.sz>30)?Math.max(0,(target.sz-30)*.4):0;
      if(Math.hypot(target.x-P.x,target.y-P.y)>playerBasicRange()+edge)target=null;
    }
  }
  if(!target)target=findNearBasic();
  P.tid=target?target.id:null;
  if(!target)return false;

  // Do not queue extra cannonballs when shots already in flight are sufficient to
  // kill this exact target at non-critical damage. Strong targets still receive
  // the full normal attack-rate stream.
  let pendingMin=0;
  for(let i=0;i<PLAYER_CANNONBALLS.length;i++){
    const b=PLAYER_CANNONBALLS[i];
    if(!b||!b.target||!(b.remaining>0))continue;
    // A respawn may reuse an ID. Reservations belong to this live object only.
    const same=b.target===target;
    if(same)pendingMin+=Math.max(0,Number(b.minDamage)||0);
  }
  if(pendingMin>=Math.max(1,Number(target.hp)||0))return true;

  const dx=target.x-P.x,dy=target.y-P.y;
  const dist=Math.max(1,Math.hypot(dx,dy));
  const ang=Math.atan2(dy,dx);
  const speed=7;
  P.face=dx<0?-1:1;
  P.meleeAng=ang;
  P.shootT=1;
  P.recoil=0;

  // Fallback remains game-space safe while Player3D is loading. Once the GLB is
  // ready, use the actual DwarfCannon mesh endpoint projected back to world space.
  let muzzleX=P.x+dx/dist*24;
  let muzzleY=P.y-7+dy/dist*10;
  try{
    const api=window.PPA_PLAYER3D;
    const m=api&&typeof api.muzzle==='function'?api.muzzle('local'):null;
    if(m&&Number.isFinite(Number(m.x))&&Number.isFinite(Number(m.y))){
      muzzleX=Number(m.x);muzzleY=Number(m.y);
    }
  }catch(_){}

  const pdx=target.x-muzzleX,pdy=target.y-muzzleY;
  const pdist=Math.max(1,Math.hypot(pdx,pdy));
  const minDamage=basicAttackDamage(target,1);
  PLAYER_CANNONBALLS.push({
    x:muzzleX,y:muzzleY,
    vx:pdx/pdist*speed,vy:pdy/pdist*speed,
    remaining:pdist,target:target,minDamage:minDamage
  });
  // PvE already renders its gameplay ball. Broadcast exactly one peer-only FX;
  // do not feed it into the local PK/Arena visual queue as a second projectile.
  try{if(window.PPA_RT_COMBAT_FX)window.PPA_RT_COMBAT_FX({
    kind:'gnome-cannon',x:muzzleX,y:muzzleY,tx:target.x,ty:target.y,
    ang:Math.atan2(pdy,pdx),animMs:480,originResolved:true
  })}catch(_){}

  for(let i=0;i<3;i++){
    PT.push({
      x:muzzleX,y:muzzleY,
      vx:pdx/pdist*(1.2+i*.45)+(Math.random()-.5)*.6,
      vy:pdy/pdist*(1.2+i*.45)+(Math.random()-.5)*.6,
      life:6,ml:6,sz:1.5+i*.45,col:i===0?'#ffd36a':'#c47a32'
    });
  }
  return true;
}`;

export function patchGnomeCannonSource(source){
  if(typeof source!=='string'||source.length<1000)throw new Error('Invalid PPA source');
  let out=source;
  out=replaceFunction(out,'basicAttackRoll',basicDamageFunctions(source));
  out=replaceFunction(out,'gnomeFireCannonball',GNOME_FIRE,(s)=>s.includes('const muzzleX=P.x+dx/dist*24')&&s.includes('PLAYER_CANNONBALLS.push'));
  if(!out.includes('function basicAttackDamage(target,critMul)'))throw new Error('basicAttackDamage was not installed');
  if(!out.includes("typeof api.muzzle==='function'"))throw new Error('Player3D muzzle bridge was not installed');
  if(!out.includes('pendingMin>=Math.max(1,Number(target.hp)||0)'))throw new Error('Lethal in-flight reservation was not installed');
  return {source:out,stats:{basicDamageRefactored:1,gnomeCannonPatched:1}};
}
