import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const ROOT=process.cwd();
const gameDir=path.join(ROOT,'public','game');
const runtimePath=path.join(gameDir,'player-3d-unified-runtime.js');

if(!fs.existsSync(runtimePath))throw new Error('Player3D distance LOD: unified runtime missing');

// PPA_PLAYER3D_DISTANCE_LOD_20261006
// Local player always stays FULL. Every other unified Player3D (real remote,
// arena AI and debug stress) uses a prebuilt geometry LOD selected by distance.
// Only geometry changes in this experiment: materials/textures/rig/animations,
// gameplay and realtime cadence are intentionally untouched.
const MODELS={
  tank:'Tank_Mobile_Shield_Hammer_Final.glb',
  barbarian:'Berserker_Final.glb',
  paladin:'Paladin_Final.glb',
  gnome:'Dwarf.glb',
  archer:'Ranger_Mobile_Bow_Z90.glb',
  mage:'Mage_Final.glb',
  assassin:'Assassin.glb',
  priest:'Priest_Final_GitHub.glb'
};
const LEVELS={
  lod35:{ratio:'0.35',error:'0.010'},
  lod22:{ratio:'0.22',error:'0.020'},
  lod12:{ratio:'0.12',error:'0.035'}
};
const bin=path.join(ROOT,'node_modules','.bin',process.platform==='win32'?'gltf-transform.cmd':'gltf-transform');

function lodName(src,level){return src.replace(/\.glb$/i,'__ppa_'+level+'.glb')}
function one(text,from,to,label){
  const n=text.split(from).length-1;
  if(n!==1)throw new Error('Player3D distance LOD: '+label+' target count='+n);
  return text.replace(from,to);
}

if(!fs.existsSync(bin))throw new Error('Player3D distance LOD: @gltf-transform/cli binary missing');

const generated={};
for(const [cls,file] of Object.entries(MODELS)){
  const input=path.join(gameDir,file);
  if(!fs.existsSync(input))throw new Error('Player3D distance LOD: source missing '+file);
  generated[cls]={};
  for(const [level,opt] of Object.entries(LEVELS)){
    const lod=lodName(file,level),output=path.join(gameDir,lod);
    try{fs.rmSync(output,{force:true})}catch(_){}
    const r=spawnSync(bin,[
      'simplify',input,output,
      '--ratio',opt.ratio,
      '--error',opt.error,
      '--lock-border','true'
    ],{
      cwd:ROOT,
      encoding:'utf8',
      stdio:['ignore','pipe','pipe'],
      maxBuffer:16*1024*1024
    });
    if(r.status!==0||!fs.existsSync(output)||fs.statSync(output).size<32768){
      if(r.stderr)console.error(String(r.stderr).slice(-3000));
      throw new Error('Player3D distance LOD: simplify failed for '+cls+' '+level+' status='+String(r.status));
    }
    const before=fs.statSync(input).size,after=fs.statSync(output).size;
    generated[cls][level]={lod,before,after};
    console.log('[PPA BUILD] Player3D '+level+' '+cls+': '+Math.round(before/1024)+' KiB -> '+Math.round(after/1024)+' KiB');
  }
}

let runtime=fs.readFileSync(runtimePath,'utf8');

const configTail="  };\n  const ENABLED=new Set(Object.keys(CLASS_CONFIG));";
const rows=Object.entries(generated).map(([cls,levels])=>{
  const parts=Object.keys(LEVELS).map(level=>`${level}:'/game/${levels[level].lod}?v=20261006dlod1'`);
  return `    ${cls}:{${parts.join(',')}}`;
}).join(',\n');
const lodMap=`  };\n  // PPA_PLAYER3D_DISTANCE_LOD_20261006\n  const REMOTE_LOD_MODELS={\n${rows}\n  };\n  const REMOTE_LOD_CLOSE='lod35',REMOTE_LOD_MID='lod22',REMOTE_LOD_FAR='lod12';\n  const ENABLED=new Set(Object.keys(CLASS_CONFIG));`;
runtime=one(runtime,configTail,lodMap,'config map');

const loadHead=`  async function loadAsset(cls){\n    if(assets.has(cls))return assets.get(cls);\n    const promise=(async()=>{\n      await ensureThree();\n      const cfg=CLASS_CONFIG[cls],gltf=await new GLTFLoader().loadAsync(cfg.model);`;
const loadHeadNew=`  async function loadAsset(cls,variant){\n    const lodSet=REMOTE_LOD_MODELS[cls]||null;\n    const lodUrl=variant&&variant!=='full'&&lodSet?lodSet[variant]:null;\n    const assetKey=lodUrl?(cls+'|'+variant):cls;\n    if(assets.has(assetKey))return assets.get(assetKey);\n    const promise=(async()=>{\n      await ensureThree();\n      const cfg=CLASS_CONFIG[cls],modelUrl=lodUrl||cfg.model;\n      let gltf;\n      try{gltf=await new GLTFLoader().loadAsync(modelUrl)}catch(err){\n        if(!lodUrl)throw err;\n        console.warn('PPA Player3D distance LOD fallback to full model',cls,variant,err);\n        gltf=await new GLTFLoader().loadAsync(cfg.model);\n      }`;
runtime=one(runtime,loadHead,loadHeadNew,'loadAsset head');
runtime=one(runtime,
  `    assets.set(cls,promise);\n    try{return await promise}catch(e){assets.delete(cls);throw e}`,
  `    assets.set(assetKey,promise);\n    try{return await promise}catch(e){assets.delete(assetKey);throw e}`,
  'asset cache key'
);
runtime=one(runtime,'      const a=await loadAsset(e.cls);','      const a=await loadAsset(e.cls,e.assetVariant);','instance asset variant');

const upsertHead=`  function upsert(id,kind,cls,data,anchor){\n    if(!id||!cls||!anchor)return false;\n    let e=instances.get(id);\n    if(!e||e.cls!==cls){`;
const upsertHeadNew=`  function ppaRemoteLodVariant(current,cls,anchor){\n    if(!REMOTE_LOD_MODELS[cls]||!anchor)return 'full';\n    const lx=Number(localAnchor.worldX),ly=Number(localAnchor.worldY),rx=Number(anchor.worldX),ry=Number(anchor.worldY);\n    if(!Number.isFinite(lx)||!Number.isFinite(ly)||!Number.isFinite(rx)||!Number.isFinite(ry))return current&&current!=='full'?current:REMOTE_LOD_CLOSE;\n    const d=Math.hypot(rx-lx,ry-ly);\n    // Hysteresis: close -> mid only after 340; mid -> close below 240.\n    // mid -> far only after 600; far -> mid below 480.\n    if(current===REMOTE_LOD_CLOSE)return d>340?REMOTE_LOD_MID:REMOTE_LOD_CLOSE;\n    if(current===REMOTE_LOD_MID){if(d<240)return REMOTE_LOD_CLOSE;if(d>600)return REMOTE_LOD_FAR;return REMOTE_LOD_MID}\n    if(current===REMOTE_LOD_FAR)return d<480?REMOTE_LOD_MID:REMOTE_LOD_FAR;\n    if(d>560)return REMOTE_LOD_FAR;if(d>300)return REMOTE_LOD_MID;return REMOTE_LOD_CLOSE;\n  }\n  function upsert(id,kind,cls,data,anchor){\n    if(!id||!cls||!anchor)return false;\n    let e=instances.get(id);\n    const assetVariant=kind==='local'?'full':ppaRemoteLodVariant(e&&e.assetVariant,cls,anchor);\n    if(!e||e.cls!==cls||e.assetVariant!==assetVariant){`;
runtime=one(runtime,upsertHead,upsertHeadNew,'upsert distance LOD');
runtime=one(runtime,
  '      e={id,kind,cls,data,anchor,seenAt:performance.now()',
  '      e={id,kind,cls,data,anchor,assetVariant,seenAt:performance.now()',
  'entry asset variant'
);

// Lightweight diagnostics queried only by the debug overlay / console, never by hot render code.
const apiTail=`    diag:()=>({\n      version:'unified-v9-anim-speed-hotloop-fix',fps,`;
const apiTailNew=`    lodDiag:()=>{const out={full:0,lod35:0,lod22:0,lod12:0};for(const q of instances.values()){const k=String(q&&q.assetVariant||'full');if(Object.prototype.hasOwnProperty.call(out,k))out[k]++}return out},\n    diag:()=>({\n      version:'unified-v9-anim-speed-hotloop-fix',fps,`;
runtime=one(runtime,apiTail,apiTailNew,'LOD diag API');

if(!runtime.includes('PPA_PLAYER3D_DISTANCE_LOD_20261006'))throw new Error('Player3D distance LOD: runtime marker missing');
fs.writeFileSync(runtimePath,runtime,'utf8');
console.log('[PPA BUILD] Player3D distance LOD active: LOCAL full; REMOTE/AI/STRESS lod35/lod22/lod12 with hysteresis');
