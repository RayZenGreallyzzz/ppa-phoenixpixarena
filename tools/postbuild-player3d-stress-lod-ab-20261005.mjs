import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const runtimePath=path.join(root,'public','game','player-3d-unified-runtime.js');
const htmlPath=path.join(root,'public','index.html');

function replaceOnce(text,from,to,label){
  const first=text.indexOf(from);
  if(first<0)throw new Error('Player3D stress LOD A/B: missing '+label);
  if(text.indexOf(from,first+from.length)>=0)throw new Error('Player3D stress LOD A/B: duplicate '+label);
  return text.slice(0,first)+to+text.slice(first+from.length);
}

let runtime=fs.readFileSync(runtimePath,'utf8');

runtime=replaceOnce(
  runtime,
  '  let THREE=null,GLTFLoader=null,SkeletonUtils=null;',
  `  let THREE=null,GLTFLoader=null,SkeletonUtils=null;\n  // PPA_PLAYER3D_STRESS_GEOMETRY_LOD_20261005\n  // A/B only: geometry simplification is applied to local stress BOT remotes,\n  // never to the local player or real network players.\n  let MeshoptSimplifier=null,stressLodModulePromise=null;\n  const stressLodGeometryCache=new WeakMap();\n  const STRESS_LOD_RATIO=.35;\n  const STRESS_LOD_ERROR=.02;`,
  'Three module state'
);

const helper=`\n  async function ensureStressLodSimplifier(){\n    if(MeshoptSimplifier)return MeshoptSimplifier;\n    if(stressLodModulePromise)return stressLodModulePromise;\n    stressLodModulePromise=(async()=>{\n      const mod=await import('https://esm.sh/meshoptimizer@1.2.0');\n      const simplifier=mod.MeshoptSimplifier||(mod.default&&mod.default.MeshoptSimplifier);\n      if(!simplifier||typeof simplifier.simplify!=='function')throw new Error('MeshoptSimplifier unavailable');\n      await simplifier.ready;\n      MeshoptSimplifier=simplifier;\n      return simplifier;\n    })().catch(err=>{stressLodModulePromise=null;throw err});\n    return stressLodModulePromise;\n  }\n\n  function stressLodPositions(position){\n    const out=new Float32Array(position.count*3);\n    for(let i=0,j=0;i<position.count;i++,j+=3){\n      out[j]=position.getX(i);out[j+1]=position.getY(i);out[j+2]=position.getZ(i);\n    }\n    return out;\n  }\n\n  function stressLodShell(src,index,groups){\n    const g=new THREE.BufferGeometry();\n    for(const name of Object.keys(src.attributes||{}))g.setAttribute(name,src.attributes[name]);\n    if(src.morphAttributes){\n      for(const name of Object.keys(src.morphAttributes))g.morphAttributes[name]=src.morphAttributes[name];\n      g.morphTargetsRelative=src.morphTargetsRelative;\n    }\n    g.setIndex(new THREE.BufferAttribute(index,1));\n    g.clearGroups();\n    for(const group of groups)g.addGroup(group.start,group.count,group.materialIndex||0);\n    g.boundingBox=src.boundingBox;g.boundingSphere=src.boundingSphere;\n    g.userData=Object.assign({},src.userData||{}, {ppaStressLod:true,ppaStressLodRatio:STRESS_LOD_RATIO});\n    return g;\n  }\n\n  async function buildStressLodGeometry(src){\n    if(!src||!src.index||!src.attributes||!src.attributes.position)return src;\n    const raw=src.index.array;\n    if(!raw||raw.length<180)return src;\n    const simplifier=await ensureStressLodSimplifier();\n    const positions=stressLodPositions(src.attributes.position);\n    const sourceGroups=(src.groups&&src.groups.length)?src.groups:[{start:0,count:raw.length,materialIndex:0}];\n    const chunks=[];const outGroups=[];let total=0;\n    for(const group of sourceGroups){\n      const start=Math.max(0,Math.floor(Number(group.start)||0));\n      const count=Math.max(0,Math.min(raw.length-start,Math.floor(Number(group.count)||0)));\n      const triCount=Math.floor(count/3)*3;\n      if(triCount<3)continue;\n      const input=new Uint32Array(triCount);\n      for(let i=0;i<triCount;i++)input[i]=raw[start+i];\n      let output=input;\n      if(triCount>=180){\n        const target=Math.max(3,Math.floor((triCount*STRESS_LOD_RATIO)/3)*3);\n        try{\n          // Meshopt JS stride is measured in Float32 elements, so packed xyz = 3.\n          const result=simplifier.simplify(input,positions,3,target,STRESS_LOD_ERROR);\n          if(result&&result[0]&&result[0].length>=3)output=result[0];\n        }catch(_){}\n      }\n      chunks.push(output);\n      outGroups.push({start:total,count:output.length,materialIndex:Number(group.materialIndex)||0});\n      total+=output.length;\n    }\n    if(!total||total>=raw.length*.94)return src;\n    const merged=new Uint32Array(total);let offset=0;\n    for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.length}\n    return stressLodShell(src,merged,outGroups);\n  }\n\n  async function stressLodGeometry(src){\n    if(!src)return src;\n    let cached=stressLodGeometryCache.get(src);\n    if(!cached){\n      cached=buildStressLodGeometry(src).catch(()=>src);\n      stressLodGeometryCache.set(src,cached);\n    }\n    return cached;\n  }\n\n  async function applyStressBotGeometryLod(root){\n    const jobs=[];\n    root.traverse(o=>{\n      if(!o||!o.isMesh||!o.geometry)return;\n      jobs.push(stressLodGeometry(o.geometry).then(g=>{if(g)o.geometry=g}));\n    });\n    if(jobs.length)await Promise.all(jobs);\n  }\n`;

runtime=replaceOnce(
  runtime,
  '\n  async function loadAsset(cls){',
  helper+'\n  async function loadAsset(cls){',
  'loadAsset insertion point'
);

runtime=replaceOnce(
  runtime,
  '      });\n      e.root=new THREE.Group();e.model=clone;e.root.add(clone);scene.add(e.root);',
  `      });\n      // Geometry-only A/B: preserve original rig, clips, materials and render cadence.\n      // Only synthetic BOT remotes receive the simplified index buffers.\n      if(e.kind==='remote'&&isStressBot(e.data)){\n        try{await applyStressBotGeometryLod(clone)}catch(err){console.warn('PPA stress LOD',err)}\n      }\n      e.root=new THREE.Group();e.model=clone;e.root.add(clone);scene.add(e.root);`,
  'stress clone hook'
);

runtime=runtime.replace(
  "version:'unified-v9-anim-speed-hotloop-fix'",
  "version:'unified-v9-stress-geometry-lod-ab2'"
);

fs.writeFileSync(runtimePath,runtime,'utf8');

let html=fs.readFileSync(htmlPath,'utf8');
const rx=/player-3d-unified-runtime\.js\?v=[^"']+/g;
const matches=html.match(rx)||[];
if(matches.length!==1)throw new Error('Player3D stress LOD A/B: expected one runtime script tag, found '+matches.length);
html=html.replace(rx,'player-3d-unified-runtime.js?v=20261005lod2');
fs.writeFileSync(htmlPath,html,'utf8');

console.log('[PPA BUILD] Player3D stress geometry LOD A/B · BOT only · ratio 0.35 · error 0.02 · stride 3 · lod2');
