import fs from 'node:fs';
import path from 'node:path';

const publicDir=path.join(process.cwd(),'public');
const htmlPath=path.join(publicDir,'index.html');
if(!fs.existsSync(htmlPath)) throw new Error('Stage 2K cleanup: public/index.html missing');
let html=fs.readFileSync(htmlPath,'utf8');

const count=(text,needle)=>text.split(needle).length-1;
const exactAnimCount=(html.match(/\bANIM\b/g)||[]).length;
const genericSources=['SPR_IDLE','SPR_RUN','SPR_ATK'];
const genericImages=['imgIdle','imgRun','imgAtk'];
const genericAssetPaths=[];

for(const sym of genericSources){
  const n=count(html,sym);
  if(n!==1) throw new Error(`Stage 2K cleanup: ${sym} expected declaration-only count 1, got ${n}`);
  const re=new RegExp(`const\\s+${sym}\\s*=\\s*(['\"])([^'\"]+\\.png)\\1\\s*;`);
  const m=html.match(re);
  if(!m) throw new Error(`Stage 2K cleanup: ${sym} PNG declaration missing`);
  genericAssetPaths.push(m[2]);
}
for(const sym of genericImages){
  const n=count(html,sym);
  if(n!==2) throw new Error(`Stage 2K cleanup: ${sym} expected declaration+ANIM count 2, got ${n}`);
}
if(exactAnimCount!==1) throw new Error(`Stage 2K cleanup: exact legacy ANIM expected count 1, got ${exactAnimCount}`);

for(const sym of genericImages){
  for(const pattern of [`${sym}.src=`,`${sym}.src =`,`src:${sym}`,`src: ${sym}`]){
    if(html.includes(pattern)) throw new Error(`Stage 2K cleanup: live source binding survived: ${pattern}`);
  }
}

const comment='// Sprite sheets (assassin: idle/breathing, run, attack)';
let start=html.indexOf(comment);
if(start<0) start=html.indexOf('const SPR_IDLE=');
if(start<0) throw new Error('Stage 2K cleanup: generic sprite block start missing');
const animStart=html.indexOf('const ANIM=',start);
if(animStart<0) throw new Error('Stage 2K cleanup: legacy ANIM declaration missing');
const end=html.indexOf('};',animStart);
if(end<0) throw new Error('Stage 2K cleanup: legacy ANIM end missing');

html=html.slice(0,start)+html.slice(end+2);

for(const sym of [...genericSources,...genericImages]){
  if(html.includes(sym)) throw new Error(`Stage 2K cleanup: legacy symbol survived: ${sym}`);
}
if((html.match(/\bANIM\b/g)||[]).length!==0) throw new Error('Stage 2K cleanup: exact legacy ANIM survived');
for(const keep of ['GNOME_ANIM','ARCHER_ANIM','ASSASSIN_ANIM','TANK_ANIM','BERSERKER_ANIM','PRIEST_ANIM','MAGE_ANIM','PALADIN_ANIM']){
  if(!html.includes(keep)) throw new Error(`Stage 2K cleanup: required stress/debug metadata missing: ${keep}`);
}
if(!html.includes('PPA_ONLINE_STRESS')) throw new Error('Stage 2K cleanup: stress tool missing');

// The only surviving generic idle-sheet reference was the obsolete hidden
// #assassinModel portrait fallback. The current portrait runtime explicitly
// hides that element and renders #ppaClassPortraitV196 instead. Keep the
// legacy element inert for compatibility, but permanently detach its sprite.
const idleUrl=genericAssetPaths[0];
const legacyBg=`background-image:url(&quot;${idleUrl}&quot;);`;
if(count(html,legacyBg)!==1) throw new Error(`Stage 2K cleanup: expected one obsolete assassinModel idle background, got ${count(html,legacyBg)}`);
if(!html.includes('#assassinModel{ display:none;')) throw new Error('Stage 2K cleanup: legacy assassinModel CSS anchor missing');
if(!html.includes("var old=doc.getElementById('assassinModel');if(old)old.style.display='none'")) throw new Error('Stage 2K cleanup: current portrait runtime no longer proves assassinModel is obsolete');
if(!html.includes("img.id='ppaClassPortraitV196'")) throw new Error('Stage 2K cleanup: current replacement character portrait missing');
html=html.replace(legacyBg,'background-image:none;');
html=html.replace('#assassinModel{ display:none;','#assassinModel{ display:none!important;');

fs.writeFileSync(htmlPath,html,'utf8');

function textFiles(dir,out=[]){
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,ent.name);
    if(ent.isDirectory())textFiles(p,out);
    else if(/\.(?:html|js|css|json|txt|map)$/i.test(ent.name))out.push(p);
  }
  return out;
}
const texts=textFiles(publicDir);
const uniqueAssets=[...new Set(genericAssetPaths)];
if(uniqueAssets.length!==3) throw new Error(`Stage 2K cleanup: expected 3 unique generic player PNG sources, got ${uniqueAssets.length}`);

for(const source of uniqueAssets){
  for(const p of texts){
    const t=fs.readFileSync(p,'utf8');
    if(t.includes(source)) throw new Error(`Stage 2K cleanup: generic player PNG source still referenced in ${path.relative(publicDir,p)}: ${source}`);
  }
}

let localDeleted=0;
let remoteDetached=0;
for(const source of uniqueAssets){
  if(/^https?:\/\//i.test(source)){
    remoteDetached++;
    console.log(`Stage 2K detached obsolete remote generic player PNG: ${source}`);
    continue;
  }
  const rel=String(source).replace(/^\.\//,'').replace(/^\//,'');
  const abs=path.join(publicDir,rel);
  if(fs.existsSync(abs)){
    fs.unlinkSync(abs);
    if(fs.existsSync(abs)) throw new Error(`Stage 2K cleanup: failed to delete local generic player PNG: ${abs}`);
    localDeleted++;
    console.log(`Stage 2K removed orphan local generic player PNG: ${source}`);
  }
}

if(localDeleted+remoteDetached!==3) throw new Error(`Stage 2K cleanup: expected 3 generic player PNG sources handled, got ${localDeleted+remoteDetached}`);
console.log(`Stage 2K cleanup: generic SPR_IDLE/RUN/ATK + imgIdle/imgRun/imgAtk + ANIM removed; ${remoteDetached} obsolete remote PNG sources detached, ${localDeleted} local orphan PNGs deleted; assassinModel sprite fallback disabled; stress/debug metadata preserved`);
