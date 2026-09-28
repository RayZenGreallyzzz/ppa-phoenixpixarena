import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');

const classes=['tank','barbarian','paladin','gnome','archer','mage','assassin','priest'];
const skills={};
for(const cls of classes){
  const re=new RegExp('"'+cls+'":\\{"name":"[^"]+","active":\\[([\\s\\S]*?)\\],"passive":');
  const m=src.match(re);
  skills[cls]=m?[...m[1].matchAll(/"id":"([^"]+)"/g)].map(x=>x[1]):[];
}

const potion=(src.match(/var QUICK_POTION_META=\{([\s\S]*?)\};/)||[])[0]||'';
const invPotion=[];
for(const n of ['potions:{','INV.potions','hpMedium','mpMedium']){
  let p=0,c=0;
  while((p=src.indexOf(n,p))>=0&&c<4){
    invPotion.push(src.slice(Math.max(0,p-350),Math.min(src.length,p+800)));
    p+=n.length;c++;
  }
}

const gearFunctions=[];
const seen=new Set();
for(const m of src.matchAll(/function\s+([A-Za-z0-9_$]*Gear[A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{/g)){
  const name=m[1];
  if(seen.has(name))continue;
  seen.add(name);
  const p=m.index;
  gearFunctions.push({name,context:src.slice(Math.max(0,p-300),Math.min(src.length,p+2200))});
  if(gearFunctions.length>=35)break;
}
for(const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z0-9_$]*(?:SLOT|Slot|slot|GEAR|Gear)[A-Za-z0-9_$]*)\s*=\s*[^;]{0,1500};/g)){
  if(/slot|gear/i.test(m[1])) gearFunctions.push({name:m[1],context:m[0]});
  if(gearFunctions.length>=55)break;
}

const out={skills,potion,invPotion,gearFunctions};
fs.writeFileSync('diag-newbie-kit-source-small.txt',JSON.stringify(out,null,2));
console.log('wrote',JSON.stringify(out).length);
