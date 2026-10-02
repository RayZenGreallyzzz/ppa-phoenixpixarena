import fs from 'node:fs';

const p='gateway/player-3d-unified-runtime.js';
let s=fs.readFileSync(p,'utf8');
function once(from,to,label){
  const n=s.split(from).length-1;
  if(n!==1)throw new Error(`Stage 4A ${label}: expected 1 target, got ${n}`);
  s=s.replace(from,to);
}

once(
"  let THREE=null,GLTFLoader=null,SkeletonUtils=null;\n  let renderer=null,scene=null,camera=null,host=null,hud=null,hx=null;\n  let cameraYaw=0,lastW=0,lastH=0,lastFrameAt=performance.now(),frames=0,lastFpsAt=performance.now(),fps=0;",
"  let THREE=null,GLTFLoader=null,SkeletonUtils=null;\n  let renderer=null,scene=null,camera=null,host=null,hud=null,hx=null;\n  let cameraYaw=0,lastW=0,lastH=0,lastFrameAt=performance.now(),frames=0,lastFpsAt=performance.now(),fps=0;\n  // Stage 4A: shared per-frame/per-projection scratch state. These objects are\n  // reused for every player so the render loop does not create temporary Three.js\n  // objects or re-read canvas layout once per visible character.\n  const viewState={w:0,h:0};\n  const mapState={ready:false,left:0,top:0,right:0,bottom:0,z:1,kx:1,ky:1};\n  const groundResult={hit:null,z:1};\n  let scratchNdc=null,scratchRay=null,scratchGround=null,scratchPlane=null,scratchProject=null,scratchHead=null;",
'add scratch state');

once(
"    SkeletonUtils=await import('https://esm.sh/three@0.180.0/examples/jsm/utils/SkeletonUtils.js');\n\n    host=document.createElement('div');",
"    SkeletonUtils=await import('https://esm.sh/three@0.180.0/examples/jsm/utils/SkeletonUtils.js');\n    scratchNdc=new THREE.Vector2();\n    scratchRay=new THREE.Raycaster();\n    scratchGround=new THREE.Vector3();\n    scratchPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);\n    scratchProject=new THREE.Vector3();\n    scratchHead=new THREE.Vector3();\n    groundResult.hit=scratchGround;\n\n    host=document.createElement('div');",
'initialize scratch objects');

once(
"    return{w,h};\n  }\n  function worldToGround(wx,wy,view){\n    try{\n      if(typeof cv==='undefined'||!cv||typeof cam==='undefined'||!cam)return null;\n      const rect=cv.getBoundingClientRect(),z=Math.max(.1,Number(typeof cameraZoom==='function'?cameraZoom():1)||1);\n      const sx=Number(wx)-Number(cam.x||0),sy=Number(wy)-Number(cam.y||0);\n      const kx=rect.width/Math.max(1,cv.width),ky=rect.height/Math.max(1,cv.height);\n      const px=rect.left+sx*z*kx,py=rect.top+sy*z*ky;\n      if(!Number.isFinite(px)||!Number.isFinite(py))return null;\n      if(px<rect.left-160||px>rect.right+160||py<rect.top-200||py>rect.bottom+200)return null;\n      const ndc=new THREE.Vector2(px/view.w*2-1,1-py/view.h*2),ray=new THREE.Raycaster();\n      ray.setFromCamera(ndc,camera);\n      const hit=new THREE.Vector3();\n      if(!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),hit))return null;\n      return{hit,z};\n    }catch(_){return null}\n  }\n  function projectWorld(v,view){\n    const p=v.clone().project(camera);\n    return{x:(p.x*.5+.5)*view.w,y:(-p.y*.5+.5)*view.h};\n  }",
"    viewState.w=w;viewState.h=h;return viewState;\n  }\n  function prepareWorldMap(){\n    try{\n      if(typeof cv==='undefined'||!cv||typeof cam==='undefined'||!cam){mapState.ready=false;return false}\n      const rect=cv.getBoundingClientRect(),z=Math.max(.1,Number(typeof cameraZoom==='function'?cameraZoom():1)||1);\n      mapState.left=rect.left;mapState.top=rect.top;mapState.right=rect.right;mapState.bottom=rect.bottom;\n      mapState.z=z;mapState.kx=rect.width/Math.max(1,cv.width);mapState.ky=rect.height/Math.max(1,cv.height);\n      mapState.ready=true;return true;\n    }catch(_){mapState.ready=false;return false}\n  }\n  function worldToGround(wx,wy,view){\n    try{\n      if(!mapState.ready||!scratchNdc||!scratchRay||!scratchGround||!scratchPlane)return null;\n      const sx=Number(wx)-Number(cam.x||0),sy=Number(wy)-Number(cam.y||0),z=mapState.z;\n      const px=mapState.left+sx*z*mapState.kx,py=mapState.top+sy*z*mapState.ky;\n      if(!Number.isFinite(px)||!Number.isFinite(py))return null;\n      if(px<mapState.left-160||px>mapState.right+160||py<mapState.top-200||py>mapState.bottom+200)return null;\n      scratchNdc.set(px/view.w*2-1,1-py/view.h*2);\n      scratchRay.setFromCamera(scratchNdc,camera);\n      if(!scratchRay.ray.intersectPlane(scratchPlane,scratchGround))return null;\n      groundResult.z=z;return groundResult;\n    }catch(_){return null}\n  }\n  function projectIntoHud(v,view,h,xKey,yKey){\n    scratchProject.copy(v).project(camera);\n    h[xKey]=(scratchProject.x*.5+.5)*view.w;\n    h[yKey]=(-scratchProject.y*.5+.5)*view.h;\n  }",
'cache layout and projection scratch');

once(
"      e={id,kind,cls,data,anchor,seenAt:performance.now(),alive:true,loading:false,root:null,model:null,head:null,mixer:null,actions:null,current:null,anim:'idle',cfg:null,error:'',lastWX:null,lastWY:null,movingUntil:0,lastMotionYaw:0,hasMotionYaw:false,hud:null,pivotBone:''};",
"      e={id,kind,cls,data,anchor,seenAt:performance.now(),alive:true,loading:false,root:null,model:null,head:null,mixer:null,actions:null,current:null,anim:'idle',cfg:null,error:'',lastWX:null,lastWY:null,movingUntil:0,lastMotionYaw:0,hasMotionYaw:false,hud:{feetX:0,feetY:0,headX:0,headY:0},hiddenState:null,pivotBone:''};",
'preallocate HUD and hidden state');

once(
"  function applyHidden(e){\n    if(!e.model)return;\n    const hidden=e.kind==='remote'&&Number(e.data&&e.data.hiddenUntil)>Date.now();\n    e.model.traverse(o=>{",
"  function applyHidden(e){\n    if(!e.model)return;\n    const hidden=e.kind==='remote'&&Number(e.data&&e.data.hiddenUntil)>Date.now();\n    if(e.hiddenState===hidden)return;\n    e.hiddenState=hidden;\n    e.model.traverse(o=>{",
'avoid redundant material traversal');

once(
"  function updateHudAnchor(e,view,z){\n    try{\n      const feet=projectWorld(e.root.position,view);\n      let hp=null;\n      if(e.head){\n        const p=new THREE.Vector3();e.head.getWorldPosition(p);hp=projectWorld(p,view);\n      }\n      if(!hp){\n        const cfg=e.cfg||CLASS_CONFIG[e.cls];\n        const p=new THREE.Vector3(e.root.position.x,e.root.position.y+(Number(cfg.targetHeight)||2.34)*(Number(cfg.visualScale)||1)*z,e.root.position.z);\n        hp=projectWorld(p,view);\n      }\n      e.hud={feetX:feet.x,feetY:feet.y,headX:hp.x,headY:hp.y};\n      return e.hud;\n    }catch(_){return null}\n  }",
"  function updateHudAnchor(e,view,z){\n    try{\n      const h=e.hud||(e.hud={feetX:0,feetY:0,headX:0,headY:0});\n      projectIntoHud(e.root.position,view,h,'feetX','feetY');\n      if(e.head)e.head.getWorldPosition(scratchHead);\n      else{\n        const cfg=e.cfg||CLASS_CONFIG[e.cls];\n        scratchHead.set(e.root.position.x,e.root.position.y+(Number(cfg.targetHeight)||2.34)*(Number(cfg.visualScale)||1)*z,e.root.position.z);\n      }\n      projectIntoHud(scratchHead,view,h,'headX','headY');\n      return h;\n    }catch(_){return null}\n  }",
'reuse HUD vectors');

once(
"    const view=resize();if(!view)return;\n    const dt=Math.max(0,Math.min(.05,(now-lastFrameAt)/1000));lastFrameAt=now;\n    hx.clearRect(0,0,view.w,view.h);",
"    const view=resize();if(!view)return;\n    prepareWorldMap();\n    const dt=Math.max(0,Math.min(.05,(now-lastFrameAt)/1000));lastFrameAt=now;\n    hx.clearRect(0,0,view.w,view.h);",
'prepare map once per frame');

for(const forbidden of [
  "new THREE.Vector2(px/view.w*2-1,1-py/view.h*2)",
  "ray=new THREE.Raycaster()",
  "ray.ray.intersectPlane(new THREE.Plane",
  "const p=new THREE.Vector3();e.head.getWorldPosition(p)",
  "const p=new THREE.Vector3(e.root.position.x",
  "e.hud={feetX:feet.x"
])if(s.includes(forbidden))throw new Error('Stage 4A dead per-frame allocation survived: '+forbidden);

for(const required of [
  'const viewState={w:0,h:0};','const mapState={ready:false','scratchRay=new THREE.Raycaster();',
  'scratchPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);','groundResult.z=z;return groundResult;',
  'if(e.hiddenState===hidden)return;',"projectIntoHud(e.root.position,view,h,'feetX','feetY');",'prepareWorldMap();'
])if(!s.includes(required))throw new Error('Stage 4A required optimization missing: '+required);

fs.writeFileSync(p,s,'utf8');
console.log('Stage 4A runtime refactor applied: shared projection scratch, one canvas layout read per frame, persistent HUD state, hidden-material updates only on state change');
