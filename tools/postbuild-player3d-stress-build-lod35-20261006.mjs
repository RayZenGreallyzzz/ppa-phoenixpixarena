import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const ROOT=process.cwd();
const gameDir=path.join(ROOT,'public','game');
const runtimePath=path.join(gameDir,'player-3d-unified-runtime.js');

if(!fs.existsSync(runtimePath))throw new Error('Player3D stress LOD35: unified runtime missing');

// First clean A/B only: LOCAL / real players / Arena AI stay on the approved full GLBs.
// The five classes used by LOCAL STRESS 5 get prebuilt ~35% geometry GLBs during CI.
const MODELS={
  tank:'Tank_Mobile_Shield_Hammer_Final.glb',
  barbarian:'Berserker_Final.glb',
  paladin:'Paladin_Final.glb',
  gnome:'Dwarf.glb',
  archer:'Ranger_Mobile_Bow_Z90.glb'
};
const RATIO='0.35';
const ERROR='0.01';
const SUFFIX='__ppa_stress_lod35.glb';
const bin=path.join(ROOT,'node_modules','.bin',process.platform==='win32'?'gltf-transform.cmd':'gltf-transform');

function lodName(src){return src.replace(/\.glb$/i,SUFFIX)}
function one(text,from,to,label){
  const n=text.split(from).length-1;
  if(n!==1)throw new Error('Player3D stress LOD35: '+label+' target count='+n);
  return text.replace(from,to);
}

if(!fs.existsSync(bin)){
  console.warn('[PPA BUILD WARN] Player3D stress LOD35 skipped: @gltf-transform/cli binary missing');
  process.exit(0);
}

const generated=[];
for(const [cls,file] of Object.entries(MODELS)){
  const input=path.join(gameDir,file),output=path.join(gameDir,lodName(file));
  if(!fs.existsSync(input)){
    console.warn('[PPA BUILD WARN] Player3D stress LOD35 skipped: source missing '+file);
    for(const x of generated)try{fs.rmSync(x.output,{force:true})}catch(_){}
    process.exit(0);
  }
  try{fs.rmSync(output,{force:true})}catch(_){}
  const r=spawnSync(bin,[
    'simplify',input,output,
    '--ratio',RATIO,
    '--error',ERROR,
    '--lock-border','true'
  ],{
    cwd:ROOT,
    encoding:'utf8',
    stdio:['ignore','pipe','pipe'],
    maxBuffer:16*1024*1024
  });
  if(r.status!==0||!fs.existsSync(output)||fs.statSync(output).size<32768){
    console.warn('[PPA BUILD WARN] Player3D stress LOD35 simplify failed for '+cls+' status='+String(r.status));
    if(r.stderr)console.warn(String(r.stderr).slice(-2400));
    for(const x of generated)try{fs.rmSync(x.output,{force:true})}catch(_){}
    try{fs.rmSync(output,{force:true})}catch(_){}
    process.exit(0);
  }
  const before=fs.statSync(input).size,after=fs.statSync(output).size;
  generated.push({cls,input,output,before,after,file,lod:lodName(file)});
  console.log('[PPA BUILD] Player3D stress LOD35 '+cls+': '+Math.round(before/1024)+' KiB -> '+Math.round(after/1024)+' KiB');
}

let runtime=fs.readFileSync(runtimePath,'utf8');

const configTail="  };\n  const ENABLED=new Set(Object.keys(CLASS_CONFIG));";
const lodMap=`  };\n  // PPA_PLAYER3D_STRESS_BUILD_LOD35_20261006\n  // Prebuilt by CI: only debug stress bots use these files in this A/B.\n  const STRESS_LOD_MODELS={\n${generated.map(x=>`    ${x.cls}:'/game/${x.lod}?v=20261006lod35'`).join(',\n')}\n  };\n  const PPA_STRESS_LOD_VARIANT='stress-lod35';\n  const ENABLED=new Set(Object.keys(CLASS_CONFIG));`;
runtime=one(runtime,configTail,lodMap,'config map');

const loadHead=`  async function loadAsset(cls){\n    if(assets.has(cls))return assets.get(cls);\n    const promise=(async()=>{\n      await ensureThree();\n      const cfg=CLASS_CONFIG[cls],gltf=await new GLTFLoader().loadAsync(cfg.model);`;
const loadHeadNew=`  async function loadAsset(cls,variant){\n    const useStressLod=variant===PPA_STRESS_LOD_VARIANT&&!!STRESS_LOD_MODELS[cls];\n    const assetKey=useStressLod?(cls+'|'+PPA_STRESS_LOD_VARIANT):cls;\n    if(assets.has(assetKey))return assets.get(assetKey);\n    const promise=(async()=>{\n      await ensureThree();\n      const cfg=CLASS_CONFIG[cls],modelUrl=useStressLod?STRESS_LOD_MODELS[cls]:cfg.model;\n      let gltf;\n      try{gltf=await new GLTFLoader().loadAsync(modelUrl)}catch(err){\n        if(!useStressLod)throw err;\n        console.warn('PPA stress LOD35 fallback to full model',cls,err);\n        gltf=await new GLTFLoader().loadAsync(cfg.model);\n      }`;
runtime=one(runtime,loadHead,loadHeadNew,'loadAsset head');
runtime=one(runtime,
  `    assets.set(cls,promise);\n    try{return await promise}catch(e){assets.delete(cls);throw e}`,
  `    assets.set(assetKey,promise);\n    try{return await promise}catch(e){assets.delete(assetKey);throw e}`,
  'asset cache key'
);
runtime=one(runtime,'      const a=await loadAsset(e.cls);','      const a=await loadAsset(e.cls,e.assetVariant);','instance asset variant');

const upsertHead=`  function upsert(id,kind,cls,data,anchor){\n    if(!id||!cls||!anchor)return false;\n    let e=instances.get(id);\n    if(!e||e.cls!==cls){`;
const upsertHeadNew=`  function upsert(id,kind,cls,data,anchor){\n    if(!id||!cls||!anchor)return false;\n    const assetVariant=(kind==='remote'&&isStressBot(data)&&STRESS_LOD_MODELS[cls])?PPA_STRESS_LOD_VARIANT:'full';\n    let e=instances.get(id);\n    if(!e||e.cls!==cls||e.assetVariant!==assetVariant){`;
runtime=one(runtime,upsertHead,upsertHeadNew,'upsert variant guard');
runtime=one(runtime,
  '      e={id,kind,cls,data,anchor,seenAt:performance.now()',
  '      e={id,kind,cls,data,anchor,assetVariant,seenAt:performance.now()',
  'entry asset variant'
);

if(!runtime.includes('PPA_PLAYER3D_STRESS_BUILD_LOD35_20261006'))throw new Error('Player3D stress LOD35: runtime marker missing');
fs.writeFileSync(runtimePath,runtime,'utf8');
console.log('[PPA BUILD] Player3D stress LOD35 A/B active: LOCAL/real/AI full quality; LOCAL STRESS 5 uses prebuilt 35% geometry');
