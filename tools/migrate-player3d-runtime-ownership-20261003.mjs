import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const runtimePath=path.join(ROOT,'gateway','player-3d-unified-runtime.js');
const postbuildPath=path.join(ROOT,'tools','postbuild-player-3d-unified-20261002.mjs');
const auditPath=path.join(ROOT,'tools','audit-player-render-ownership-20261003.mjs');
const unifiedWorkflowPath=path.join(ROOT,'.github','workflows','test-unified-player3d.yml');
const cleanupWorkflowPath=path.join(ROOT,'.github','workflows','test-player-source-cleanup.yml');
const perfWorkflowPath=path.join(ROOT,'.github','workflows','test-player3d-performance.yml');
const packagePath=path.join(ROOT,'package.json');
const obsoleteLifecyclePath=path.join(ROOT,'tools','postbuild-player-3d-local-lifecycle-20261003.mjs');

for(const p of [runtimePath,postbuildPath,auditPath,unifiedWorkflowPath,cleanupWorkflowPath,perfWorkflowPath,packagePath]){
  if(!fs.existsSync(p))throw new Error('Player3D ownership migration: missing '+p);
}

function oneReplace(src,from,to,label){
  const n=src.split(from).length-1;
  if(n!==1)throw new Error(`Player3D ownership migration: ${label} expected once, found ${n}`);
  return src.replace(from,to);
}
function functionRange(src,signature){
  const start=src.indexOf(signature);
  if(start<0)throw new Error('Player3D ownership migration: function missing '+signature);
  if(src.indexOf(signature,start+signature.length)>=0)throw new Error('Player3D ownership migration: function not unique '+signature);
  const open=src.indexOf('{',start+signature.length-1);
  if(open<0)throw new Error('Player3D ownership migration: opening brace missing '+signature);
  let depth=0,state='code',quote='',escaped=false;
  for(let i=open;i<src.length;i++){
    const ch=src[i],next=src[i+1]||'';
    if(state==='line'){if(ch==='\n')state='code';continue}
    if(state==='block'){if(ch==='*'&&next==='/'){state='code';i++}continue}
    if(state==='string'){
      if(escaped){escaped=false;continue}
      if(ch==='\\'){escaped=true;continue}
      if(ch===quote){state='code';quote=''}
      continue;
    }
    if(state==='template'){
      if(escaped){escaped=false;continue}
      if(ch==='\\'){escaped=true;continue}
      if(ch==='`'){state='code'}
      continue;
    }
    if(ch==='/'&&next==='/'){state='line';i++;continue}
    if(ch==='/'&&next==='*'){state='block';i++;continue}
    if(ch==='\''||ch==='"'){state='string';quote=ch;continue}
    if(ch==='`'){state='template';continue}
    if(ch==='{'){depth++;continue}
    if(ch==='}'){
      depth--;
      if(depth===0)return[start,i+1];
      if(depth<0)break;
    }
  }
  throw new Error('Player3D ownership migration: closing brace missing '+signature);
}
function replaceFunction(src,signature,replacement){
  const [a,b]=functionRange(src,signature);
  return src.slice(0,a)+replacement+src.slice(b);
}
function write(p,s){fs.writeFileSync(p,s,'utf8')}

let runtime=fs.readFileSync(runtimePath,'utf8');
runtime=oneReplace(runtime,
  `  let THREE=null,GLTFLoader=null,SkeletonUtils=null;\n  let renderer=null,scene=null,camera=null,host=null,hud=null,hx=null;`,
  `  let THREE=null,GLTFLoader=null,SkeletonUtils=null;\n  let renderer=null,scene=null,camera=null,host=null,hud=null,hx=null;\n  let threeInitPromise=null,threeRetryAt=0,threeRetryCount=0;`,
  'serialized Three init state');
runtime=oneReplace(runtime,
  `  const groundResult={hit:null,z:1};\n  let scratchNdc=null,scratchRay=null,scratchGround=null,scratchPlane=null,scratchProject=null,scratchHead=null,scratchMuzzleWorld=null,scratchMuzzleProject=null;`,
  `  const groundResult={hit:null,z:1};\n  // PPA_PLAYER3D_RUNTIME_OWNS_LOCAL_STATE_20261003\n  // Canonical local-player anchor. Canvas no longer owns the GLB lifecycle.\n  const localAnchor={classKey:'',worldX:0,worldY:0,scene:null};\n  let localStateMissingSince=0;\n  let scratchNdc=null,scratchRay=null,scratchGround=null,scratchPlane=null,scratchProject=null,scratchHead=null,scratchMuzzleWorld=null,scratchMuzzleProject=null;`,
  'canonical local anchor');

const ensureThree=`  async function ensureThree(){
    if(THREE&&GLTFLoader&&SkeletonUtils&&renderer&&scene&&camera)return true;
    if(threeInitPromise)return threeInitPromise;
    if(performance.now()<threeRetryAt)throw new Error('Player3D renderer init backoff');

    threeInitPromise=(async()=>{
      const ThreeModule=await import('https://esm.sh/three@0.180.0');
      const loaderModule=await import('https://esm.sh/three@0.180.0/examples/jsm/loaders/GLTFLoader.js');
      const skeletonModule=await import('https://esm.sh/three@0.180.0/examples/jsm/utils/SkeletonUtils.js');
      THREE=ThreeModule;
      GLTFLoader=loaderModule.GLTFLoader;
      SkeletonUtils=skeletonModule;

      scratchNdc=new THREE.Vector2();
      scratchRay=new THREE.Raycaster();
      scratchGround=new THREE.Vector3();
      scratchPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
      scratchProject=new THREE.Vector3();
      scratchHead=new THREE.Vector3();
      scratchMuzzleWorld=new THREE.Vector3();
      scratchMuzzleProject=new THREE.Vector3();
      groundResult.hit=scratchGround;

      const stale=document.getElementById('ppaPlayer3DSystem');
      if(stale)stale.remove();
      host=document.createElement('div');
      host.id='ppaPlayer3DSystem';
      host.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:4;overflow:hidden;';
      document.body.appendChild(host);

      renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'high-performance'});
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000,0);
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure=1.18;
      renderer.domElement.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;filter:saturate(1.28) contrast(1.06) brightness(1.04);';
      host.appendChild(renderer.domElement);

      hud=document.createElement('canvas');
      hud.id='ppaPlayer3DHud';
      hud.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
      host.appendChild(hud);
      hx=hud.getContext('2d');
      if(!hx)throw new Error('Player3D HUD 2D context unavailable');

      scene=new THREE.Scene();
      camera=new THREE.OrthographicCamera(-10,10,10,-10,.01,100);
      camera.position.set(5.0,7.4,9.0);
      camera.lookAt(0,0,0);
      camera.updateMatrixWorld(true);
      cameraYaw=Math.atan2(camera.position.x,camera.position.z);

      scene.add(new THREE.HemisphereLight(0xfff7ea,0x263451,1.55));
      const sun=new THREE.DirectionalLight(0xfff0cf,3.10);sun.position.set(4.5,8.0,5.5);scene.add(sun);
      const fill=new THREE.DirectionalLight(0x9ec8ff,.82);fill.position.set(-4.0,3.5,2.5);scene.add(fill);
      threeRetryAt=0;threeRetryCount=0;
      return true;
    })();

    try{return await threeInitPromise}
    catch(err){
      try{if(renderer&&typeof renderer.dispose==='function')renderer.dispose()}catch(_){}
      try{if(host&&host.remove)host.remove()}catch(_){}
      THREE=null;GLTFLoader=null;SkeletonUtils=null;
      renderer=null;scene=null;camera=null;host=null;hud=null;hx=null;
      scratchNdc=null;scratchRay=null;scratchGround=null;scratchPlane=null;scratchProject=null;scratchHead=null;scratchMuzzleWorld=null;scratchMuzzleProject=null;
      groundResult.hit=null;
      threeInitPromise=null;
      threeRetryCount=Math.min(6,threeRetryCount+1);
      threeRetryAt=performance.now()+Math.min(10000,500*Math.pow(2,threeRetryCount-1));
      throw err;
    }
  }`;
runtime=replaceFunction(runtime,'  async function ensureThree(){',ensureThree);

const ensureInstance=`  async function ensureInstance(e){
    const now=performance.now();
    if(!e||!e.alive||e.root||e.loading||now<Number(e.retryAt||0))return;
    e.loading=true;e.error='';
    try{
      const a=await loadAsset(e.cls);
      if(!e.alive)return;
      const clone=SkeletonUtils.clone(a.scene);
      clone.traverse(o=>{
        if(!o||!o.material)return;
        try{
          if(Array.isArray(o.material))o.material=o.material.map(m=>m&&m.clone?m.clone():m);
          else if(o.material.clone)o.material=o.material.clone();
        }catch(_){}
      });
      e.root=new THREE.Group();e.model=clone;e.root.add(clone);scene.add(e.root);
      e.head=findBone(clone,'head');
      e.muzzle=clone.getObjectByName('PPA_DwarfMuzzle')||null;
      e.mixer=new THREE.AnimationMixer(clone);e.actions={};
      if(a.idle)e.actions.idle=e.mixer.clipAction(a.idle);
      if(a.run)e.actions.run=e.mixer.clipAction(a.run);
      if(a.attack)e.actions.attack=e.mixer.clipAction(a.attack);
      e.cfg=a.cfg;e.pivotBone=a.pivotBone||'';
      e.retryAt=0;e.retryCount=0;
      switchAnim(e,'idle');
    }catch(err){
      e.error=String(err&&err.message||err);
      e.retryCount=Math.min(6,Number(e.retryCount||0)+1);
      e.retryAt=performance.now()+Math.min(10000,500*Math.pow(2,e.retryCount-1));
    }finally{e.loading=false}
  }`;
runtime=replaceFunction(runtime,'  async function ensureInstance(e){',ensureInstance);

runtime=oneReplace(runtime,
  `e={id,kind,cls,data,anchor,seenAt:performance.now(),alive:true,loading:false,root:null,model:null,head:null,muzzle:null,mixer:null,actions:null,current:null,anim:'idle',cfg:null,error:'',lastWX:null,lastWY:null,movingUntil:0,lastMotionYaw:0,hasMotionYaw:false,hud:{feetX:0,feetY:0,headX:0,headY:0},hiddenState:null,pivotBone:''};`,
  `e={id,kind,cls,data,anchor,seenAt:performance.now(),alive:true,loading:false,retryAt:0,retryCount:0,root:null,model:null,head:null,muzzle:null,mixer:null,actions:null,current:null,anim:'idle',cfg:null,error:'',lastWX:null,lastWY:null,movingUntil:0,lastMotionYaw:0,hasMotionYaw:false,hud:{feetX:0,feetY:0,headX:0,headY:0},hiddenState:null,pivotBone:''};`,
  'instance retry state');

const registerLocalBlock=`  function registerLocal(a){
    const cls=normalizeClass(a&&a.classKey)||localClass();
    if(!cls||!a||!Number.isFinite(Number(a.worldX))||!Number.isFinite(Number(a.worldY)))return false;
    return upsert('local','local',cls,null,a);
  }`;
const runtimeLocalOwnership=`${registerLocalBlock}
  function syncLocalFromGame(now){
    try{
      if(typeof P==='undefined'||!P)throw new Error('local state unavailable');
      const cls=localClass(),x=Number(P.x),y=Number(P.y);
      if(!cls||!Number.isFinite(x)||!Number.isFinite(y))throw new Error('local state incomplete');
      localStateMissingSince=0;
      localAnchor.classKey=cls;
      localAnchor.worldX=x;
      localAnchor.worldY=y;
      localAnchor.scene=P.scene;
      upsert('local','local',cls,null,localAnchor);
      return true;
    }catch(_){
      if(!localStateMissingSince)localStateMissingSince=now;
      if(now-localStateMissingSince>1500){
        const e=instances.get('local');
        if(e)removeEntry('local',e);
      }
      return false;
    }
  }`;
runtime=oneReplace(runtime,registerLocalBlock,runtimeLocalOwnership,'runtime-owned local sync');

runtime=oneReplace(runtime,
  `  function frame(now){\n    requestAnimationFrame(frame);\n    if(!THREE||!renderer||!scene||!camera)return;\n    const view=resize();if(!view)return;`,
  `  function frame(now){\n    requestAnimationFrame(frame);\n    if(!THREE||!renderer||!scene||!camera){\n      if(now>=threeRetryAt&&!threeInitPromise)ensureThree().catch(()=>{});\n      return;\n    }\n    syncLocalFromGame(now);\n    const view=resize();if(!view)return;`,
  'frame local ownership and renderer retry');
runtime=oneReplace(runtime,
  `    for(const [id,e] of instances){\n      const ttl=e.kind==='local'?500:1800;\n      if(now-e.seenAt>ttl||!e.alive){removeEntry(id,e);continue}\n      if(!e.root||!e.anchor)continue;`,
  `    for(const [id,e] of instances){\n      if(!e.alive||(e.kind==='remote'&&now-e.seenAt>1800)){removeEntry(id,e);continue}\n      if(!e.root||!e.anchor){\n        if(!e.loading&&now>=Number(e.retryAt||0))ensureInstance(e);\n        continue;\n      }`,
  'remove local draw-call TTL and retry failed instances');
runtime=runtime.replaceAll(`version:'unified-v2-world'`,`version:'unified-v3-runtime-owned-local'`);
runtime=oneReplace(runtime,
  `  if(window.__PPA3D_LOCAL_PENDING)try{registerLocal(window.__PPA3D_LOCAL_PENDING)}catch(_){}\n  ensureThree().catch(e=>console.warn('PPA unified 3D init',e));`,
  `  ensureThree().catch(e=>console.warn('PPA unified 3D init',e));`,
  'remove legacy pending local registration');

for(const required of ['PPA_PLAYER3D_RUNTIME_OWNS_LOCAL_STATE_20261003','syncLocalFromGame(now);','threeInitPromise','retryAt:0,retryCount:0',"version:'unified-v3-runtime-owned-local'"]){
  if(!runtime.includes(required))throw new Error('Player3D ownership migration: runtime invariant missing '+required);
}
for(const forbidden of ["e.kind==='local'?500:1800",'__PPA3D_LOCAL_PENDING']){
  if(runtime.includes(forbidden))throw new Error('Player3D ownership migration: obsolete runtime dependency survived '+forbidden);
}
write(runtimePath,runtime);

let postbuild=fs.readFileSync(postbuildPath,'utf8');
const oldLocal3D=`const local3DFunction=\`function drawPlayer(){
  /* PPA_PLAYER3D_LOCAL_ONLY_20261002 */
  const primary3DClass=playerClassKey();
  window.__PPA3D_LOCAL_CLASS=primary3DClass;
  if(!primary3DClass)return;
  const __ppa3DLocal={classKey:primary3DClass,worldX:Number(P.x),worldY:Number(P.y),scene:P.scene};
  window.__PPA3D_LOCAL_PENDING=__ppa3DLocal;
  try{if(window.PPA_PLAYER3D&&typeof window.PPA_PLAYER3D.local==='function')window.PPA_PLAYER3D.local(__ppa3DLocal)}catch(_){}
}\`;`;
const newLocal3D=`const local3DFunction=\`function drawPlayer(){
  /* PPA_PLAYER3D_LOCAL_ONLY_20261002 */
  /* PPA_PLAYER3D_RUNTIME_OWNS_LOCAL_STATE_20261003 */
  // Compatibility hook only. The unified WebGL runtime reads canonical P itself.
}\`;`;
postbuild=oneReplace(postbuild,oldLocal3D,newLocal3D,'compatibility-only drawPlayer');
postbuild=postbuild.replaceAll('player-3d-unified-runtime.js?v=20261002u7','player-3d-unified-runtime.js?v=20261003u9');
postbuild=oneReplace(postbuild,
  `if(!html.includes('window.__PPA3D_LOCAL_PENDING=__ppa3DLocal'))throw new Error('Unified 3D build: local registration missing');\nif(!html.includes('worldX:Number(P.x),worldY:Number(P.y)'))throw new Error('Unified 3D build: local world-space anchor missing');\nif(!html.includes('player-3d-unified-runtime.js?v=20261003u9'))throw new Error('Unified 3D build: runtime tag missing');`,
  `if(!drawBody.includes('PPA_PLAYER3D_RUNTIME_OWNS_LOCAL_STATE_20261003'))throw new Error('Unified 3D build: runtime-owned local marker missing from drawPlayer compatibility hook');\nfor(const forbidden of ['__PPA3D_LOCAL_PENDING','worldX:Number(P.x)','worldY:Number(P.y)','PPA_PLAYER3D.local(']){\n  if(drawBody.includes(forbidden))throw new Error('Unified 3D build: drawPlayer still owns local Player3D lifecycle: '+forbidden);\n}\nif(!html.includes('player-3d-unified-runtime.js?v=20261003u9'))throw new Error('Unified 3D build: runtime tag missing');`,
  'postbuild runtime ownership assertions');
if(!postbuild.includes('PPA_PLAYER3D_RUNTIME_OWNS_LOCAL_STATE_20261003'))throw new Error('Player3D ownership migration: postbuild runtime ownership marker missing');
if(postbuild.includes('window.__PPA3D_LOCAL_PENDING=__ppa3DLocal'))throw new Error('Player3D ownership migration: postbuild pending registration survived');
write(postbuildPath,postbuild);

let audit=fs.readFileSync(auditPath,'utf8');
audit=oneReplace(audit,
  `if(!runtime.includes('__PPA_PLAYER3D_UNIFIED_V2'))fail('unified Player3D runtime marker missing');\nif(!remote.includes('__PPA_REMOTE_PLAYER3D_DISPATCH_V1'))fail('remote Player3D dispatch marker missing');`,
  `if(!runtime.includes('__PPA_PLAYER3D_UNIFIED_V2'))fail('unified Player3D runtime marker missing');\nif(!runtime.includes('PPA_PLAYER3D_RUNTIME_OWNS_LOCAL_STATE_20261003'))fail('runtime-owned local Player3D marker missing');\nif(!runtime.includes('syncLocalFromGame(now);'))fail('runtime does not synchronize local player from canonical P');\nif(runtime.includes(\"e.kind==='local'?500:1800\"))fail('local Player3D still depends on 500ms draw-call TTL');\nif(!runtime.includes('threeInitPromise'))fail('Player3D Three.js initialization is not serialized');\nif(runtime.includes('__PPA3D_LOCAL_PENDING'))fail('legacy pending local registration survived runtime');\nif(!remote.includes('__PPA_REMOTE_PLAYER3D_DISPATCH_V1'))fail('remote Player3D dispatch marker missing');`,
  'audit runtime ownership invariants');
audit=oneReplace(audit,
  `    for(const bad of ['drawImage','fillRect','ellipse(','arc(','ANIM[','visualBody','phoneCharacter','playerUses']){`,
  `    for(const bad of ['drawImage','fillRect','ellipse(','arc(','ANIM[','visualBody','phoneCharacter','playerUses','__PPA3D_LOCAL_PENDING','worldX','worldY','PPA_PLAYER3D.local']){`,
  'audit compatibility hook ownership');
write(auditPath,audit);

for(const workflowPath of [unifiedWorkflowPath,cleanupWorkflowPath,perfWorkflowPath]){
  let w=fs.readFileSync(workflowPath,'utf8');
  w=w.replaceAll('player-3d-unified-runtime.js?v=20261002u7','player-3d-unified-runtime.js?v=20261003u9');
  w=w.replaceAll('grep -q "worldX:Number(P.x),worldY:Number(P.y)" public/index.html','grep -q "PPA_PLAYER3D_RUNTIME_OWNS_LOCAL_STATE_20261003" public/game/player-3d-unified-runtime.js\n          grep -q "syncLocalFromGame(now);" public/game/player-3d-unified-runtime.js\n          ! grep -q "e.kind===\x27local\x27?500:1800" public/game/player-3d-unified-runtime.js\n          ! grep -q "__PPA3D_LOCAL_PENDING" public/game/player-3d-unified-runtime.js');
  write(workflowPath,w);
}

const pkg=JSON.parse(fs.readFileSync(packagePath,'utf8'));
pkg.version='278.0.8-player3d-runtime-owner';
write(packagePath,JSON.stringify(pkg,null,2)+'\n');

if(fs.existsSync(obsoleteLifecyclePath))fs.unlinkSync(obsoleteLifecyclePath);

console.log('Player3D ownership migration complete: runtime owns canonical local state, Three init serialized, model retries enabled, obsolete lifecycle patch removed.');
