import fs from 'node:fs';
import path from 'node:path';

const ROOT='public';
const SYMBOLS=['SPR_IDLE','SPR_RUN','SPR_ATK','imgIdle','imgRun','imgAtk'];
const TEXT_EXT=new Set(['.html','.js','.mjs','.css','.json','.txt']);

function walk(dir,out=[]){
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,ent.name);
    if(ent.isDirectory()) walk(p,out);
    else if(TEXT_EXT.has(path.extname(ent.name))) out.push(p);
  }
  return out;
}

const files=walk(ROOT);
console.log('=== STAGE 2H GENERIC PLAYER SPRITE AUDIT ===');
for(const sym of SYMBOLS){
  let total=0;
  const hits=[];
  for(const file of files){
    const text=fs.readFileSync(file,'utf8');
    let from=0;
    while((from=text.indexOf(sym,from))!==-1){
      total++;
      hits.push({file,pos:from,ctx:text.slice(Math.max(0,from-260),Math.min(text.length,from+620)).replace(/\s+/g,' ')});
      from+=sym.length;
    }
  }
  console.log(`SYMBOL ${sym} COUNT ${total}`);
  for(const h of hits.slice(0,12)) console.log(`  ${h.file}: ${h.ctx}`);
}

let animTotal=0;
for(const file of files){
  const text=fs.readFileSync(file,'utf8');
  const re=/\bANIM\b/g;
  let m;
  while((m=re.exec(text))){
    animTotal++;
    console.log(`EXACT ANIM ${file}:`,text.slice(Math.max(0,m.index-320),Math.min(text.length,m.index+720)).replace(/\s+/g,' '));
  }
}
console.log(`EXACT ANIM COUNT ${animTotal}`);

const html=fs.readFileSync('public/index.html','utf8');
for(const sym of ['SPR_IDLE','SPR_RUN','SPR_ATK']){
  const patterns=[
    new RegExp(`(?:const|let|var)\\s+${sym}\\s*=\\s*([^;]+);`),
    new RegExp(`${sym}\\s*=\\s*([^;]+);`)
  ];
  let m=null;
  for(const re of patterns){m=html.match(re);if(m)break;}
  console.log(`DECL ${sym}:`,m?m[0].replace(/\s+/g,' '):'NOT_FOUND');
}
for(const sym of ['imgIdle','imgRun','imgAtk']){
  for(const pattern of [`${sym}.src=`,`${sym}.src =`,`src:${sym}`,`src: ${sym}`]){
    let count=0,from=0;
    while((from=html.indexOf(pattern,from))!==-1){count++;from+=pattern.length;}
    console.log(`PATTERN ${pattern} COUNT ${count}`);
  }
}
console.log('=== END STAGE 2H AUDIT ===');
