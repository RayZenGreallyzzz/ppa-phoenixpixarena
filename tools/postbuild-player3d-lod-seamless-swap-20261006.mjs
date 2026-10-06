import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const runtimePath=path.join(ROOT,'public','game','player-3d-unified-runtime.js');
const htmlPath=path.join(ROOT,'public','index.html');
for(const p of [runtimePath,htmlPath])if(!fs.existsSync(p))throw new Error('Player3D LOD seamless swap: missing '+p);

function one(text,from,to,label){
  const n=text.split(from).length-1;
  if(n!==1)throw new Error('Player3D LOD seamless swap: '+label+' target count='+n);
  return text.replace(from,to);
}

let runtime=fs.readFileSync(runtimePath,'utf8');
if(!runtime.includes('PPA_PLAYER3D_DISTANCE_LOD_20261006'))throw new Error('Player3D LOD seamless swap: distance LOD marker missing');

const head=`  function upsert(id,kind,cls,data,anchor){\n    if(!id||!cls||!anchor)return false;\n    let e=instances.get(id);\n    const assetVariant=kind==='local'?'full':ppaRemoteLodVariant(e&&e.assetVariant,cls,anchor);\n    if(!e||e.cls!==cls||e.assetVariant!==assetVariant){`;

const replacement=`  // PPA_PLAYER3D_LOD_SEAMLESS_SWAP_20261006\n  // Keep the currently rendered GLB alive while the next distance LOD is loaded\n  // and cloned. Only swap scene roots after the replacement is fully ready.\n  function ppaStartLodSwap(e,desiredVariant){\n    if(!e||!e.alive||e.kind==='local'||!desiredVariant||desiredVariant===e.assetVariant||e.pendingVariant)return;\n    e.pendingVariant=desiredVariant;\n    const next={...e,assetVariant:desiredVariant,pendingVariant:'',alive:true,loading:false,retryAt:0,retryCount:0,root:null,model:null,head:null,muzzle:null,mixer:null,actions:null,current:null,error:''};\n    Promise.resolve(ensureInstance(next)).then(()=>{\n      const current=instances.get(e.id);\n      if(!next.root||current!==e||!e.alive){\n        next.alive=false;\n        try{if(next.root&&scene)scene.remove(next.root)}catch(_){}\n        try{if(next.mixer)next.mixer.stopAllAction()}catch(_){}\n        if(e&&e.alive)e.pendingVariant='';\n        return;\n      }\n      // Carry the newest realtime/anchor references gathered while the LOD loaded.\n      next.kind=e.kind;next.data=e.data;next.anchor=e.anchor;next.seenAt=e.seenAt;next.alive=true;\n      e.alive=false;e.pendingVariant='';\n      try{if(e.root&&scene)scene.remove(e.root)}catch(_){}\n      try{if(e.mixer)e.mixer.stopAllAction()}catch(_){}\n      instances.set(e.id,next);\n    }).catch(()=>{if(e&&e.alive)e.pendingVariant=''});\n  }\n  function upsert(id,kind,cls,data,anchor){\n    if(!id||!cls||!anchor)return false;\n    let e=instances.get(id);\n    const desiredVariant=kind==='local'?'full':ppaRemoteLodVariant(e&&e.assetVariant,cls,anchor);\n    if(e&&e.cls===cls&&e.assetVariant!==desiredVariant){\n      // Update canonical data first so the old visible model keeps following the player.\n      e.kind=kind;e.data=data;e.anchor=anchor;e.seenAt=performance.now();e.alive=true;\n      ppaStartLodSwap(e,desiredVariant);\n      return !!e.root;\n    }\n    const assetVariant=desiredVariant;\n    if(!e||e.cls!==cls){`;

runtime=one(runtime,head,replacement,'upsert transition');
if(!runtime.includes('PPA_PLAYER3D_LOD_SEAMLESS_SWAP_20261006'))throw new Error('Player3D LOD seamless swap: marker missing after patch');
fs.writeFileSync(runtimePath,runtime,'utf8');

let html=fs.readFileSync(htmlPath,'utf8');
const rx=/player-3d-unified-runtime\.js\?v=[^"']+/g;
const matches=html.match(rx)||[];
if(matches.length!==1)throw new Error('Player3D LOD seamless swap: runtime script tag count='+matches.length);
html=html.replace(rx,'player-3d-unified-runtime.js?v=20261006dlod3swap');
const buildMeta=/<meta name="ppa-client-build" content="[^"]+">/;
if(buildMeta.test(html))html=html.replace(buildMeta,'<meta name="ppa-client-build" content="v668-player3d-distance-lod-seamless-20261006">');
fs.writeFileSync(htmlPath,html,'utf8');

console.log('[PPA BUILD] Player3D distance LOD seamless swap: old GLB stays visible until replacement root is ready');
