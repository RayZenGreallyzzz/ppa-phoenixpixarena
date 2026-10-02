import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8').replace(/data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/=]+/g,'[DATA_IMAGE]');
const rt=fs.readFileSync('gateway/realtime-client.js','utf8');
const compact=s=>s.replace(/\s+/g,' ').trim();

function extractFunctionFrom(text,name){
  const sig=`function ${name}(`, start=text.indexOf(sig);
  if(start<0)return `NOT FOUND: ${name}`;
  const brace=text.indexOf('{',start); let depth=0, quote='', esc=false;
  for(let i=brace;i<text.length;i++){
    const c=text[i];
    if(quote){if(esc)esc=false;else if(c==='\\')esc=true;else if(c===quote)quote='';continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='{')depth++; else if(c==='}'&&--depth===0)return compact(text.slice(start,i+1));
  }
  return compact(text.slice(start,start+12000));
}
const extractFunction=name=>extractFunctionFrom(src,name);

function parseGlbJson(path){
  const b=fs.readFileSync(path);
  if(b.toString('utf8',0,4)!=='glTF')throw new Error('Not GLB');
  let off=12,json=null;
  while(off+8<=b.length){
    const len=b.readUInt32LE(off),type=b.readUInt32LE(off+4);off+=8;
    if(type===0x4e4f534a)json=JSON.parse(b.toString('utf8',off,off+len).replace(/\0+$/,''));
    off+=len;
  }
  if(!json)throw new Error('GLB JSON chunk missing');
  return json;
}
function cannonTreeReport(){
  const g=parseGlbJson('Dwarf.glb'),nodes=g.nodes||[],meshes=g.meshes||[],acc=g.accessors||[];
  const parents=new Map();
  nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parents.set(c,i)));
  const hits=[];
  nodes.forEach((n,i)=>{if(/cannon|muzzle|barrel|gun/i.test(String(n.name||'')))hits.push(i)});
  function chain(i){const a=[];let p=i,guard=0;while(Number.isInteger(p)&&guard++<20){const n=nodes[p]||{};a.unshift(`${p}:${n.name||'(unnamed)'}`);p=parents.get(p)}return a.join(' > ')}
  function meshInfo(mi){
    const m=meshes[mi];if(!m)return null;
    return (m.primitives||[]).map((p,j)=>{const ai=p.attributes&&p.attributes.POSITION,ac=Number.isInteger(ai)?acc[ai]:null;return{primitive:j,positionAccessor:ai,min:ac&&ac.min,max:ac&&ac.max,count:ac&&ac.count}});
  }
  const rows=hits.map(i=>{const n=nodes[i]||{};return{index:i,name:n.name||'',chain:chain(i),translation:n.translation||null,rotation:n.rotation||null,scale:n.scale||null,matrix:n.matrix||null,mesh:n.mesh,meshInfo:Number.isInteger(n.mesh)?meshInfo(n.mesh):null,children:(n.children||[]).map(c=>({index:c,name:nodes[c]&&nodes[c].name||''}))}});
  return JSON.stringify({nodeCount:nodes.length,meshCount:meshes.length,hits:rows},null,2);
}

const sections=[
  '=== FUNCTION gnomeFireCannonball ===\n'+extractFunction('gnomeFireCannonball'),
  '=== FUNCTION updatePlayerCannonballs ===\n'+extractFunction('updatePlayerCannonballs'),
  '=== FUNCTION applyBasicAttackHit ===\n'+extractFunction('applyBasicAttackHit'),
  '=== FUNCTION basicAttackRoll ===\n'+extractFunction('basicAttackRoll'),
  '=== FUNCTION playerBasicRange ===\n'+extractFunction('playerBasicRange'),
  '=== REALTIME pkTryBasicDirect ===\n'+extractFunctionFrom(rt,'pkTryBasicDirect'),
  '=== REALTIME arenaTryBasicDirect ===\n'+extractFunctionFrom(rt,'arenaTryBasicDirect'),
  '=== DWARF GLB CANNON TREE ===\n'+cannonTreeReport(),
];
const text=sections.join('\n\n')+'\n';
fs.writeFileSync('gnome-projectile-audit.txt',text);
console.log(text);
