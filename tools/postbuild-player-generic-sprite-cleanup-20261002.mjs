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
  if(!m) throw new Error(`Stage 2K cleanup: ${sym} externalized PNG declaration missing`);
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

fs.writeFileSync(htmlPath,html,'utf8');

function textFiles(dir,out=[]){
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,ent.name);
    if(ent.isDirectory())textFiles(p,out);
    else if(/\.(?:html|js|css|json|txt|map)$/i.test(ent.name))out.push(p);
  }
  return out;
}
function contexts(text,needle,radius=180){
  const out=[];
  let p=0;
  while((p=text.indexOf(needle,p))!==-1){
    out.push(text.slice(Math.max(0,p-radius),Math.min(text.length,p+needle.length+radius)).replace(/\s+/g,' '));
    p+=Math.max(1,needle.length);
    if(out.length>=8)break;
  }
  return out;
}
const texts=textFiles(publicDir);
const uniqueAssets=[...new Set(genericAssetPaths)];
if(uniqueAssets.length!==3) throw new Error(`Stage 2K cleanup: expected 3 unique generic player PNGs, got ${uniqueAssets.length}`);

const survivingRefs=[];
for(const relRaw of uniqueAssets){
  const rel=String(relRaw).replace(/^\.\//,'');
  for(const p of texts){
    const t=fs.readFileSync(p,'utf8');
    const needles=[relRaw,rel].filter((v,i,a)=>v&&a.indexOf(v)===i);
    for(const needle of needles){
      if(!t.includes(needle))continue;
      const hits=contexts(t,needle);
      survivingRefs.push({asset:relRaw,file:path.relative(publicDir,p),needle,hits});
      console.log(`Stage 2K surviving reference: asset=${relRaw} file=${path.relative(publicDir,p)} needle=${needle}`);
      for(const hit of hits) console.log(`Stage 2K context: ${hit}`);
    }
  }
}
if(survivingRefs.length){
  throw new Error(`Stage 2K cleanup: ${survivingRefs.length} surviving generic player PNG reference location(s) found; refusing physical deletion`);
}

let deleted=0;
for(const relRaw of uniqueAssets){
  const rel=String(relRaw).replace(/^\.\//,'');
  const abs=path.join(publicDir,rel);
  if(!fs.existsSync(abs)) throw new Error(`Stage 2K cleanup: expected externalized generic player PNG missing before deletion: ${abs}`);
  fs.unlinkSync(abs);
  if(fs.existsSync(abs)) throw new Error(`Stage 2K cleanup: failed to delete generic player PNG: ${abs}`);
  deleted++;
  console.log(`Stage 2K removed orphan generic player PNG: ${relRaw}`);
}

if(deleted!==3) throw new Error(`Stage 2K cleanup: expected to delete 3 generic player PNGs, deleted ${deleted}`);
console.log('Stage 2K cleanup: generic legacy player SPR_IDLE/RUN/ATK + imgIdle/imgRun/imgAtk + ANIM block removed; 3 orphan generic player PNGs physically deleted; stress/debug metadata preserved');
