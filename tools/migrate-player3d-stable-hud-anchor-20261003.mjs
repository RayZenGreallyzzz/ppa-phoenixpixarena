import fs from 'node:fs';

const runtimePath='gateway/player-3d-unified-runtime.js';
const postbuildPath='tools/postbuild-player-3d-unified-20261002.mjs';
let src=fs.readFileSync(runtimePath,'utf8');
let post=fs.readFileSync(postbuildPath,'utf8');

function functionRange(text,signature){
  const start=text.indexOf(signature);
  if(start<0)throw new Error('missing '+signature);
  if(text.indexOf(signature,start+signature.length)>=0)throw new Error('not unique '+signature);
  const open=text.indexOf('{',start+signature.length-1);
  let depth=0,state='code',quote='',escaped=false;
  for(let i=open;i<text.length;i++){
    const ch=text[i],next=text[i+1]||'';
    if(state==='line'){if(ch==='\n')state='code';continue}
    if(state==='block'){if(ch==='*'&&next==='/'){state='code';i++}continue}
    if(state==='string'){
      if(escaped){escaped=false;continue}
      if(ch==='\\'){escaped=true;continue}
      if(ch===quote){state='code';quote=''}
      continue;
    }
    if(state==='template'){
      if(escaped){escaped=false;continue}
      if(ch==='\\'){escaped=true;continue}
      if(ch==='`')state='code';
      continue;
    }
    if(ch==='/'&&next==='/'){state='line';i++;continue}
    if(ch==='/'&&next==='*'){state='block';i++;continue}
    if(ch==='\''||ch==='"'){state='string';quote=ch;continue}
    if(ch==='`'){state='template';continue}
    if(ch==='{'){depth++;continue}
    if(ch==='}'&&--depth===0)return[start,i+1];
  }
  throw new Error('unclosed '+signature);
}
function replaceFunction(text,signature,replacement){const[a,b]=functionRange(text,signature);return text.slice(0,a)+replacement+text.slice(b)}

const stableAnchor=`function updateHudAnchor(e,view,z){
    try{
      // PPA_PLAYER3D_STABLE_HUD_ANCHOR_20261003
      // Labels must not follow an animated head bone: idle/run/attack move the
      // skeleton every frame and make nickname/clan text visibly shake.
      const h=e.hud||(e.hud={feetX:0,feetY:0,headX:0,headY:0});
      projectIntoHud(e.root.position,view,h,'feetX','feetY');
      const cfg=e.cfg||CLASS_CONFIG[e.cls];
      const stableHeight=(Number(cfg.targetHeight)||2.34)*(Number(cfg.visualScale)||1)*z;
      scratchHead.set(e.root.position.x,e.root.position.y+stableHeight,e.root.position.z);
      projectIntoHud(scratchHead,view,h,'headX','headY');
      return h;
    }catch(_){return null}
  }`;
src=replaceFunction(src,'function updateHudAnchor(e,view,z){',stableAnchor);

const stableDrawHud=`function drawHud(e,wallNow){
    if(!hx||!e.hud)return;
    const h=e.hud,remote=e.kind==='remote',r=e.data||{};
    hx.save();
    if(remote&&Number(r.hiddenUntil)>wallNow)hx.globalAlpha=.38;
    const feetY=Math.round(Number(h.feetY));
    const headX=Math.round(Number(h.headX));
    const headY=Math.round(Number(h.headY));
    const bodyPx=Math.max(0,feetY-headY);
    const labelGap=Math.max(14,Math.min(24,bodyPx*.12));
    const y=Math.round(headY-labelGap);
    if(remote&&Number(r.mhp)>0){
      const bw=36;hx.fillStyle='rgba(0,0,0,.68)';hx.fillRect(headX-bw/2,y-7,bw,4);
      hx.fillStyle='#47dd78';hx.fillRect(headX-bw/2,y-7,bw*Math.max(0,Math.min(1,(Number(r.hp)||0)/Number(r.mhp))),4);
    }
    const name=remote?String(r.name||'Игрок').slice(0,18):localName().slice(0,18);
    const clan=remote?String(r.clanName||'').slice(0,18):localClan().slice(0,18);
    if(clan)textStrokeFill('['+clan+']',headX,y-15,'700 8px Georgia, serif','#a9cfff');
    textStrokeFill(name,headX,y,'600 10px Georgia, serif','#f2d39a');
    hx.restore();
  }`;
src=replaceFunction(src,'function drawHud(e,wallNow){',stableDrawHud);

if(src.includes("if(e.head)e.head.getWorldPosition(scratchHead)"))throw new Error('animated head HUD anchor survived');
if(!src.includes('PPA_PLAYER3D_STABLE_HUD_ANCHOR_20261003'))throw new Error('stable HUD marker missing');
if(!src.includes('const headX=Math.round(Number(h.headX));'))throw new Error('HUD pixel snap missing');

post=post.replaceAll('player-3d-unified-runtime.js?v=20261003u12','player-3d-unified-runtime.js?v=20261003u13');
post=post.replaceAll("player-3d-unified-runtime.js?v=20261003u12'))","player-3d-unified-runtime.js?v=20261003u13'))");
if(post.includes('player-3d-unified-runtime.js?v=20261003u12'))throw new Error('old runtime cache tag survived');
if(!post.includes('player-3d-unified-runtime.js?v=20261003u13'))throw new Error('new runtime cache tag missing');

fs.writeFileSync(runtimePath,src,'utf8');
fs.writeFileSync(postbuildPath,post,'utf8');
console.log('migrated: stable Player3D HUD anchor + pixel snap + u13 cache tag');
