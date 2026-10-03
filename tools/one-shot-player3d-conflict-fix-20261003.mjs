import fs from 'node:fs';

function replaceOne(src,from,to,label){
  const n=src.split(from).length-1;
  if(n!==1)throw new Error(`${label}: expected 1 target, found ${n}`);
  return src.replace(from,to);
}

const runtimePath='gateway/player-3d-unified-runtime.js';
let runtime=fs.readFileSync(runtimePath,'utf8');

runtime=replaceOne(
  runtime,
  "  let localStateMissingSince=0;\n",
  "  let localStateMissingSince=0,localSceneToken=null;\n",
  'local scene state'
);

const oldPrepare=`  function prepareWorldMap(){
    try{
      if(typeof cv==='undefined'||!cv||typeof cam==='undefined'||!cam){mapState.ready=false;return false}
      const rect=cv.getBoundingClientRect(),z=Math.max(.1,Number(typeof cameraZoom==='function'?cameraZoom():1)||1);
      mapState.left=rect.left;mapState.top=rect.top;mapState.right=rect.right;mapState.bottom=rect.bottom;
      mapState.z=z;mapState.kx=rect.width/Math.max(1,cv.width);mapState.ky=rect.height/Math.max(1,cv.height);
      mapState.ready=true;return true;
    }catch(_){mapState.ready=false;return false}
  }
`;
const newPrepare=`  function prepareWorldMap(){
    try{
      if(typeof cv==='undefined'||!cv||!cv.isConnected||typeof cam==='undefined'||!cam){mapState.ready=false;return false}
      const rect=cv.getBoundingClientRect();
      if(!rect||rect.width<2||rect.height<2||Number(cv.width)<2||Number(cv.height)<2){mapState.ready=false;return false}
      const z=Math.max(.1,Number(typeof cameraZoom==='function'?cameraZoom():1)||1);
      mapState.left=rect.left;mapState.top=rect.top;mapState.right=rect.right;mapState.bottom=rect.bottom;
      mapState.z=z;mapState.kx=rect.width/Math.max(1,cv.width);mapState.ky=rect.height/Math.max(1,cv.height);
      mapState.ready=Number.isFinite(mapState.kx)&&Number.isFinite(mapState.ky)&&mapState.kx>0&&mapState.ky>0;
      return mapState.ready;
    }catch(_){mapState.ready=false;return false}
  }
`;
runtime=replaceOne(runtime,oldPrepare,newPrepare,'world-map lifecycle');

const oldSync=`  function syncLocalFromGame(now){
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
  }
`;
const newSync=`  function syncLocalFromGame(now){
    try{
      if(typeof P==='undefined'||!P)throw new Error('local state unavailable');
      const cls=localClass(),x=Number(P.x),y=Number(P.y);
      if(!cls||!Number.isFinite(x)||!Number.isFinite(y))throw new Error('local state incomplete');
      const nextScene=String(P.scene==null?'':P.scene);
      if(localSceneToken!==null&&localSceneToken!==nextScene){
        const current=instances.get('local');
        if(current){
          current.lastWX=null;current.lastWY=null;current.movingUntil=0;
          current.lastMotionYaw=0;current.hasMotionYaw=false;
          if(current.root)current.root.visible=false;
        }
      }
      localSceneToken=nextScene;
      localStateMissingSince=0;
      localAnchor.classKey=cls;
      localAnchor.worldX=x;
      localAnchor.worldY=y;
      localAnchor.scene=nextScene;
      upsert('local','local',cls,null,localAnchor);
      return true;
    }catch(_){
      if(!localStateMissingSince)localStateMissingSince=now;
      if(now-localStateMissingSince>1500){
        const e=instances.get('local');
        if(e)removeEntry('local',e);
        localSceneToken=null;
      }
      return false;
    }
  }
`;
runtime=replaceOne(runtime,oldSync,newSync,'local scene reset');

runtime=replaceOne(
  runtime,
  "    let y=h.headY-6;\n",
  "    const bodyPx=Math.max(0,Number(h.feetY)-Number(h.headY));\n    const labelGap=Math.max(14,Math.min(24,bodyPx*.12));\n    let y=h.headY-labelGap;\n",
  'HUD head spacing'
);

const oldFrameHead=`    const view=resize();if(!view)return;
    prepareWorldMap();
    const wallNow=Date.now();
    const dt=Math.max(0,Math.min(.05,(now-lastFrameAt)/1000));lastFrameAt=now;
    hx.clearRect(0,0,view.w,view.h);

    for(const [id,e] of instances){
`;
const newFrameHead=`    const view=resize();if(!view)return;
    const mapReady=prepareWorldMap();
    const wallNow=Date.now();
    const dt=Math.max(0,Math.min(.05,(now-lastFrameAt)/1000));lastFrameAt=now;
    hx.clearRect(0,0,view.w,view.h);
    if(!mapReady){
      for(const e of instances.values())if(e&&e.root)e.root.visible=false;
      try{renderer.render(scene,camera)}catch(_){}
      return;
    }

    for(const [id,e] of instances){
`;
runtime=replaceOne(runtime,oldFrameHead,newFrameHead,'frame map guard');

runtime=runtime.replaceAll("version:'unified-v3-runtime-owned-local'","version:'unified-v4-state-isolated'");
if(!runtime.includes("version:'unified-v4-state-isolated'"))throw new Error('runtime version bump missing');
if(runtime.includes('let y=h.headY-6'))throw new Error('legacy nickname spacing survived');
fs.writeFileSync(runtimePath,runtime,'utf8');

const postPath='tools/postbuild-player-3d-unified-20261002.mjs';
let post=fs.readFileSync(postPath,'utf8');
post=post.replaceAll('player-3d-unified-runtime.js?v=20261003u9','player-3d-unified-runtime.js?v=20261003u10');
post=post.replaceAll('remote-player-3d-dispatch.js?v=20261002u5','remote-player-3d-dispatch.js?v=20261003u6');
post=post.replaceAll('Unified Player3D V4:','Unified Player3D V5:');
if(!post.includes('player-3d-unified-runtime.js?v=20261003u10'))throw new Error('runtime cache bump missing');
if(!post.includes('remote-player-3d-dispatch.js?v=20261003u6'))throw new Error('remote cache bump missing');
fs.writeFileSync(postPath,post,'utf8');

const packagePath='package.json';
const pkg=JSON.parse(fs.readFileSync(packagePath,'utf8'));
pkg.version='278.0.9-player3d-state-isolated';
fs.writeFileSync(packagePath,JSON.stringify(pkg,null,2)+'\n','utf8');

const remote=fs.readFileSync('gateway/remote-player-3d-dispatch.js','utf8');
for(const bad of ['r.x+=(r.tx-r.x)*alpha','r.y+=(r.ty-r.y)*alpha','r.lastDrawAt=now']){
  if(remote.includes(bad))throw new Error('remote renderer still mutates gameplay state: '+bad);
}
if(!remote.includes('__ppa3DX')||!remote.includes('__ppa3DLastAt'))throw new Error('isolated remote interpolation missing');

console.log('Player3D conflict repair applied: realtime coords isolated, scene transitions reset, hidden canvas guarded, HUD lifted, cache bumped.');
