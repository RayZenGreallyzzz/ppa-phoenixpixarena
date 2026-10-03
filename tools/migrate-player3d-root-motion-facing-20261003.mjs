import fs from 'node:fs';

function replaceOne(src,from,to,label){
  const n=src.split(from).length-1;
  if(n!==1)throw new Error(`${label}: expected 1 target, found ${n}`);
  return src.replace(from,to);
}

const runtimePath='gateway/player-3d-unified-runtime.js';
let src=fs.readFileSync(runtimePath,'utf8');

src=replaceOne(
  src,
  "      e.cfg=a.cfg;e.pivotBone=a.pivotBone||'';\n      e.retryAt=0;e.retryCount=0;",
  "      e.cfg=a.cfg;e.pivotBone=a.pivotBone||'';\n      // PPA_PLAYER3D_ROOT_MOTION_LOCK_20261003\n      // GLB clips may translate the scene root or hips in local X/Z. Gameplay\n      // already owns world movement, so animation root-motion must never move\n      // the visible body away from its canonical Player3D anchor. Preserve Y.\n      e.rootMotionBone=e.pivotBone?clone.getObjectByName(e.pivotBone):null;\n      e.modelBaseX=Number(clone.position.x)||0;e.modelBaseZ=Number(clone.position.z)||0;\n      e.rootMotionBaseX=e.rootMotionBone?(Number(e.rootMotionBone.position.x)||0):0;\n      e.rootMotionBaseZ=e.rootMotionBone?(Number(e.rootMotionBone.position.z)||0):0;\n      e.retryAt=0;e.retryCount=0;",
  'capture root-motion bind offsets'
);

src=replaceOne(
  src,
  "e={id,kind,cls,data,anchor,seenAt:performance.now(),alive:true,loading:false,retryAt:0,retryCount:0,root:null,model:null,head:null,muzzle:null,mixer:null,actions:null,current:null,anim:'idle',cfg:null,error:'',lastWX:null,lastWY:null,movingUntil:0,lastMotionYaw:0,hasMotionYaw:false,hud:{feetX:0,feetY:0,headX:0,headY:0},hiddenState:null,pivotBone:''};",
  "e={id,kind,cls,data,anchor,seenAt:performance.now(),alive:true,loading:false,retryAt:0,retryCount:0,root:null,model:null,head:null,muzzle:null,mixer:null,actions:null,current:null,anim:'idle',cfg:null,error:'',lastWX:null,lastWY:null,movingUntil:0,lastMotionYaw:0,hasMotionYaw:false,hud:{feetX:0,feetY:0,headX:0,headY:0},hiddenState:null,pivotBone:'',rootMotionBone:null,modelBaseX:0,modelBaseZ:0,rootMotionBaseX:0,rootMotionBaseZ:0};",
  'root-motion entry state'
);

src=replaceOne(
  src,
  "          if(Number.isFinite(dx)&&Number.isFinite(dy)&&Math.hypot(dx,dy)>.01)return cameraYaw+Math.atan2(dx,dy)+(Number(cfg.yawOffset)||0);",
  "          if(Number.isFinite(dx)&&Number.isFinite(dy)&&Math.hypot(dx,dy)>.01){\n            const raw=cameraYaw+Math.atan2(dx,dy)+(Number(cfg.yawOffset)||0);\n            e.lastMotionYaw=e.hasMotionYaw?shortestAngle(e.lastMotionYaw,raw):raw;\n            e.hasMotionYaw=true;\n            return e.lastMotionYaw;\n          }",
  'persist targeted attack yaw'
);

src=replaceOne(
  src,
  "      return cameraYaw+(4-dir)*(Math.PI/4)+(Number(cfg.yawOffset)||0);\n    }catch(_){return cameraYaw}\n  }\n  function remoteYaw(e,now){",
  "      const raw=cameraYaw+(4-dir)*(Math.PI/4)+(Number(cfg.yawOffset)||0);\n      if(attack){\n        e.lastMotionYaw=e.hasMotionYaw?shortestAngle(e.lastMotionYaw,raw):raw;\n        e.hasMotionYaw=true;\n        return e.lastMotionYaw;\n      }\n      return raw;\n    }catch(_){return cameraYaw}\n  }\n  function remoteYaw(e,now){",
  'persist fallback attack yaw'
);

src=replaceOne(
  src,
  "    if(e.hasMotionYaw&&!remoteAttack)return e.lastMotionYaw;\n    const f=Number(r.face);let dir=2;\n    if(f===-1)dir=6;else if(f===1)dir=2;else if(Number.isFinite(f)&&f>=0&&f<=7)dir=Math.round(f);else if(f===8)dir=0;\n    return cameraYaw+(4-dir)*(Math.PI/4)+(Number(cfg.yawOffset)||0);",
  "    if(e.hasMotionYaw&&!remoteAttack)return e.lastMotionYaw;\n    const f=Number(r.face);let dir=2;\n    if(f===-1)dir=6;else if(f===1)dir=2;else if(Number.isFinite(f)&&f>=0&&f<=7)dir=Math.round(f);else if(f===8)dir=0;\n    const raw=cameraYaw+(4-dir)*(Math.PI/4)+(Number(cfg.yawOffset)||0);\n    if(remoteAttack){\n      e.lastMotionYaw=e.hasMotionYaw?shortestAngle(e.lastMotionYaw,raw):raw;\n      e.hasMotionYaw=true;\n      return e.lastMotionYaw;\n    }\n    return raw;",
  'persist remote attack yaw'
);

src=replaceOne(
  src,
  "      try{if(e.mixer)e.mixer.update(dt)}catch(_){}\n      applyHidden(e,wallNow);",
  "      try{if(e.mixer)e.mixer.update(dt)}catch(_){}\n      // Animation may contain root translation. Neutralize horizontal root-motion\n      // after sampling so the body cannot orbit/slide away from the game anchor.\n      if(e.model){e.model.position.x=e.modelBaseX;e.model.position.z=e.modelBaseZ}\n      if(e.rootMotionBone){e.rootMotionBone.position.x=e.rootMotionBaseX;e.rootMotionBone.position.z=e.rootMotionBaseZ}\n      applyHidden(e,wallNow);",
  'neutralize sampled root-motion'
);

src=src.replaceAll("version:'unified-v4-state-isolated'","version:'unified-v5-rootmotion-locked'");
if(!src.includes('PPA_PLAYER3D_ROOT_MOTION_LOCK_20261003'))throw new Error('root-motion marker missing');
if(!src.includes("if(e.model){e.model.position.x=e.modelBaseX;e.model.position.z=e.modelBaseZ}"))throw new Error('model root-motion lock missing');
if(!src.includes('if(e.rootMotionBone){e.rootMotionBone.position.x=e.rootMotionBaseX;e.rootMotionBone.position.z=e.rootMotionBaseZ}'))throw new Error('hips root-motion lock missing');
if(!src.includes("version:'unified-v5-rootmotion-locked'"))throw new Error('runtime version bump missing');
fs.writeFileSync(runtimePath,src,'utf8');

const postPath='tools/postbuild-player-3d-unified-20261002.mjs';
let post=fs.readFileSync(postPath,'utf8');
post=post.replaceAll('player-3d-unified-runtime.js?v=20261003u14','player-3d-unified-runtime.js?v=20261003u15');
if(!post.includes('player-3d-unified-runtime.js?v=20261003u15'))throw new Error('u15 cache bump missing');
fs.writeFileSync(postPath,post,'utf8');

const buildPath='build.mjs';
let build=fs.readFileSync(buildPath,'utf8');
build=replaceOne(build,"const CLIENT_BUILD = 'v632-realtime-player3d-stability-20261003';","const CLIENT_BUILD = 'v633-player3d-rootmotion-facing-20261003';",'client build cache bump');
fs.writeFileSync(buildPath,build,'utf8');

console.log('Applied Player3D root-motion lock and persistent attack facing.');
