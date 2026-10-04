import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const PARTS=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const MARKER='/* PPA_DIRECT_GOLD_MATERIAL_STORAGE_20261004 */';
const BUILD_VERSION='v652-direct-loot-canonical-20261004';

function count(text,needle){return text.split(needle).length-1;}
function mustReplaceOnce(text,oldText,newText,label){
  const n=count(text,oldText);
  if(n!==1)throw new Error(`${label}: expected exactly 1 canonical anchor, found ${n}`);
  return text.replace(oldText,newText);
}

for(const p of PARTS)if(!fs.existsSync(p))throw new Error(`Missing packed source part ${p}`);
const packed=Buffer.concat(PARTS.map(p=>fs.readFileSync(p)));
const unpacked=zlib.gunzipSync(packed);
let source=unpacked.toString('utf8');
if(source.includes(MARKER))throw new Error('Canonical direct-loot marker already exists');

const oldGold="if(gold>0)LOOT.push({x:e.x+(Math.random()-.5)*20,y:e.y+(Math.random()-.5)*20,kind:'gold',amount:gold,bob:Math.random()*6});";
const newGold=`${MARKER}\n  if(gold>0){\n    INV.gold+=gold;\n    showPickup('+'+gold+' золота','#ffcc44');\n    scheduleCombatSave();\n    sendMerchantState();\n  }`;
source=mustReplaceOnce(source,oldGold,newGold,'gold world drop');

const oldMaterial=`function pushMaterialDrop(e,rarity,amount){\n  var pool=MATERIAL_BY_RARITY[rarity]||[];if(!pool.length)return;\n  var name=randFrom(pool),def=MATERIAL_DB[name];\n  LOOT.push({\n    x:e.x+(Math.random()-.5)*34,y:e.y+(Math.random()-.5)*34,\n    kind:'material',name:name,rarity:def.rarity,src:def.src,amount:amount||1,bob:Math.random()*6\n  });\n}`;
const newMaterial=`function pushMaterialDrop(e,rarity,amount){\n  var pool=MATERIAL_BY_RARITY[rarity]||[];if(!pool.length)return;\n  var name=randFrom(pool),def=MATERIAL_DB[name],n=amount||1;\n  INV.materials[name]=(INV.materials[name]||0)+n;\n  showPickup(name+' ×'+n,RCOL_P[def.rarity]||'#a7adb5');\n  scheduleCombatSave();\n  sendBlacksmithState();\n}`;
source=mustReplaceOnce(source,oldMaterial,newMaterial,'material world drop');

if(count(source,MARKER)!==1)throw new Error('Direct loot marker count invalid');
if(source.includes("kind:'gold',amount:gold,bob:Math.random()*6"))throw new Error('Canonical gold world-drop constructor survived');
if(source.includes("kind:'material',name:name,rarity:def.rarity,src:def.src,amount:amount||1,bob:Math.random()*6"))throw new Error('Canonical material world-drop constructor survived');
for(const required of ['INV.gold+=gold;','INV.materials[name]=(INV.materials[name]||0)+n;','scheduleCombatSave();','sendMerchantState();','sendBlacksmithState();',"kind:'ppa'"]){
  if(!source.includes(required))throw new Error(`Protected source requirement missing: ${required}`);
}

const newSource=Buffer.from(source,'utf8');
const newHash=crypto.createHash('sha256').update(newSource).digest('hex');
const newPacked=zlib.gzipSync(newSource,{level:9});
const base=Math.floor(newPacked.length/PARTS.length);
let off=0;
for(let i=0;i<PARTS.length;i++){
  const end=i===PARTS.length-1?newPacked.length:off+base;
  fs.writeFileSync(PARTS[i],newPacked.subarray(off,end));
  off=end;
}

let build=fs.readFileSync('build.mjs','utf8');
build=build.replace(/const EXPECTED_SOURCE_SHA256 = '[0-9a-f]{64}';/,`const EXPECTED_SOURCE_SHA256 = '${newHash}';`);
build=build.replace(/const CLIENT_BUILD = '[^']+';/,`const CLIENT_BUILD = '${BUILD_VERSION}';`);
if(!build.includes(`EXPECTED_SOURCE_SHA256 = '${newHash}'`))throw new Error('build.mjs checksum update failed');
if(!build.includes(`CLIENT_BUILD = '${BUILD_VERSION}'`))throw new Error('build.mjs build marker update failed');
fs.writeFileSync('build.mjs',build);

console.log(`[PPA MIGRATE] canonical direct loot complete`);
console.log(`[PPA MIGRATE] source sha256 ${newHash}`);
console.log(`[PPA MIGRATE] packed ${packed.length} -> ${newPacked.length} bytes`);
console.log(`[PPA MIGRATE] gold/material world objects removed at source`);
