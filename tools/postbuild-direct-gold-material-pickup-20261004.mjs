import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const htmlPath=path.join(ROOT,'public','index.html');
if(!fs.existsSync(htmlPath))throw new Error('Direct loot postbuild: public/index.html missing');
let html=fs.readFileSync(htmlPath,'utf8');

const MARKER='PPA_DIRECT_GOLD_MATERIAL_PICKUP_20261004';

function findNamedFunction(src,name){
  const re=new RegExp('function\\s+'+name.replace(/[$]/g,'\\$&')+'\\s*\\(([^)]*)\\)\\s*\\{','g');
  const m=re.exec(src);
  if(!m)return null;
  const open=src.indexOf('{',m.index);
  if(open<0)return null;
  let depth=1,quote='',esc=false,line=false,block=false;
  for(let i=open+1;i<src.length;i++){
    const c=src[i],n=src[i+1]||'';
    if(line){if(c==='\n')line=false;continue;}
    if(block){if(c==='*'&&n==='/'){block=false;i++;}continue;}
    if(quote){
      if(esc){esc=false;continue;}
      if(c==='\\'){esc=true;continue;}
      if(c===quote){quote='';continue;}
      continue;
    }
    if(c==='/'&&n==='/'){line=true;i++;continue;}
    if(c==='/'&&n==='*'){block=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='{')depth++;
    else if(c==='}'){
      depth--;
      if(depth===0)return {start:m.index,open,end:i+1,params:m[1]};
    }
  }
  return null;
}

function injectPlayerDropOrigin(name,label){
  const f=findNamedFunction(html,name);
  if(!f)throw new Error('Direct loot postbuild: '+name+' function not found');
  const current=html.slice(f.start,f.end);
  if(current.includes(MARKER+'_'+label))return;
  const first=String(f.params||'').split(',')[0].trim();
  if(!/^[A-Za-z_$][\w$]*$/.test(first))throw new Error('Direct loot postbuild: '+name+' first parameter is not patchable');
  const inject=`\n/* ${MARKER}_${label} */\ntry{\n  if(typeof P!=='undefined'&&P&&Number.isFinite(Number(P.x))&&Number.isFinite(Number(P.y))&&${first}&&typeof ${first}==='object'){\n    ${first}=Object.assign({},${first},{x:Number(P.x),y:Number(P.y)});\n  }\n}catch(_ppaDirectLootErr){}\n`;
  html=html.slice(0,f.open+1)+inject+html.slice(f.open+1);
}

// Materials use the native material factory/pickup path, but originate at the
// player so they are collected immediately instead of living in the world list.
injectPlayerDropOrigin('pushMaterialDrop','MATERIAL');

// v232BaseCurrency is the shared dungeon currency path. Keeping its native
// calculation preserves gold bonuses, anti-farm multipliers and save/UI logic.
injectPlayerDropOrigin('v232BaseCurrency','GOLD');

const buildMeta=/<meta name="ppa-client-build" content="[^"]+">/;
if(buildMeta.test(html))html=html.replace(buildMeta,'<meta name="ppa-client-build" content="v651-direct-gold-material-pickup-20261004">');

if(!html.includes(MARKER+'_MATERIAL'))throw new Error('Direct loot postbuild: material marker missing');
if(!html.includes(MARKER+'_GOLD'))throw new Error('Direct loot postbuild: gold marker missing');

fs.writeFileSync(htmlPath,html,'utf8');
console.log('[PPA BUILD] Gold/material world drops now originate at player for immediate native pickup');
