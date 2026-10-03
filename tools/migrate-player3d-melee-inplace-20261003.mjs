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
  "  const ENABLED=new Set(Object.keys(CLASS_CONFIG));\n  const instances=new Map(),assets=new Map();",
  "  const ENABLED=new Set(Object.keys(CLASS_CONFIG));\n  const MELEE_INPLACE_CLASSES=new Set(['tank','barbarian','paladin','assassin']);\n  const instances=new Map(),assets=new Map();",
  'melee class set'
);

const findBoneEnd=`  function findBone(root,type){
    const bones=[];root.traverse(o=>{if(o&&o.isBone)bones.push(o)});
    if(!bones.length)return null;
    if(type==='hips'){
      let hit=bones.find(b=>/(hips|pelvis)/i.test(String(b.name||'')));
      if(hit)return hit;
      hit=bones.find(b=>!(b.parent&&b.parent.isBone));
      return hit||bones[0];
    }
    let hit=bones.find(b=>/(^|[:_\\-.])head(end)?$/i.test(String(b.name||'')));
    if(hit)return hit;
    let best=null,bestY=-Infinity,tmp=new THREE.Vector3();
    for(const b of bones){
      try{b.getWorldPosition(tmp);if(tmp.y>bestY){bestY=tmp.y;best=b}}catch(_){}
    }
    return best;
  }
`;
const lowerBodyHelpers=`  function findBone(root,type){
    const bones=[];root.traverse(o=>{if(o&&o.isBone)bones.push(o)});
    if(!bones.length)return null;
    if(type==='hips'){
      let hit=bones.find(b=>/(hips|pelvis)/i.test(String(b.name||'')));
      if(hit)return hit;
      hit=bones.find(b=>!(b.parent&&b.parent.isBone));
      return hit||bones[0];
    }
    let hit=bones.find(b=>/(^|[:_\\-.])head(end)?$/i.test(String(b.name||'')));
    if(hit)return hit;
    let best=null,bestY=-Infinity,tmp=new THREE.Vector3();
    for(const b of bones){
      try{b.getWorldPosition(tmp);if(tmp.y>bestY){bestY=tmp.y;best=b}}catch(_){}
    }
    return best;
  }
  // PPA_PLAYER3D_MELEE_INPLACE_ATTACK_20261003
  // Melee gameplay owns approach distance. Attack clips are upper-body combat
  // only: hips/pelvis/legs stay on their canonical rest pose so GLB animation
  // cannot add a second visual lunge after the character already reached target.
  function captureMeleeLowerBody(root){
    const out=[];
    if(!root)return out;
    root.traverse(o=>{
      if(!o||!o.isBone)return;
      const n=String(o.name||'');
      if(!/(hips|pelvis|upleg|thigh|leg|calf|shin|knee|foot|toe)/i.test(n))return;
      out.push({bone:o,pos:o.position.clone(),quat:o.quaternion.clone(),scale:o.scale.clone()});
    });
    return out;
  }
  function lockMeleeAttackLowerBody(e){
    if(!e||e.anim!=='attack'||!MELEE_INPLACE_CLASSES.has(e.cls)||!Array.isArray(e.meleeLowerBody))return;
    for(const r of e.meleeLowerBody){
      if(!r||!r.bone)continue;
      r.bone.position.copy(r.pos);
      r.bone.quaternion.copy(r.quat);
      r.bone.scale.copy(r.scale);
    }
  }
`;
src=replaceOne(src,findBoneEnd,lowerBodyHelpers,'lower body helpers');

src=replaceOne(
  src,
  "      e.cfg=a.cfg;e.pivotBone=a.pivotBone||'';\n      // PPA_PLAYER3D_ROOT_MOTION_LOCK_20261003",
  "      e.cfg=a.cfg;e.pivotBone=a.pivotBone||'';\n      e.meleeLowerBody=MELEE_INPLACE_CLASSES.has(e.cls)?captureMeleeLowerBody(clone):[];\n      // PPA_PLAYER3D_ROOT_MOTION_LOCK_20261003",
  'capture lower body pose'
);

src=replaceOne(
  src,
  "hiddenState:null,pivotBone:'',rootMotionBone:null,modelBaseX:0,modelBaseZ:0,rootMotionBaseX:0,rootMotionBaseZ:0};",
  "hiddenState:null,pivotBone:'',rootMotionBone:null,modelBaseX:0,modelBaseZ:0,rootMotionBaseX:0,rootMotionBaseZ:0,meleeLowerBody:[]};",
  'instance lower body state'
);

src=replaceOne(
  src,
  "      if(e.model){e.model.position.x=e.modelBaseX;e.model.position.z=e.modelBaseZ}\n      if(e.rootMotionBone){e.rootMotionBone.position.x=e.rootMotionBaseX;e.rootMotionBone.position.z=e.rootMotionBaseZ}\n      applyHidden(e,wallNow);",
  "      if(e.model){e.model.position.x=e.modelBaseX;e.model.position.z=e.modelBaseZ}\n      if(e.rootMotionBone){e.rootMotionBone.position.x=e.rootMotionBaseX;e.rootMotionBone.position.z=e.rootMotionBaseZ}\n      lockMeleeAttackLowerBody(e);\n      applyHidden(e,wallNow);",
  'frame melee in-place lock'
);

src=src.replaceAll("version:'unified-v5-rootmotion-locked'","version:'unified-v6-melee-inplace'");
if((src.match(/unified-v6-melee-inplace/g)||[]).length!==2)throw new Error('expected runtime+diag version bumps');
for(const token of ['PPA_PLAYER3D_MELEE_INPLACE_ATTACK_20261003','captureMeleeLowerBody','lockMeleeAttackLowerBody(e);',"MELEE_INPLACE_CLASSES=new Set(['tank','barbarian','paladin','assassin'])"]){
  if(!src.includes(token))throw new Error('missing '+token);
}
fs.writeFileSync(runtimePath,src,'utf8');

const postPath='tools/postbuild-player-3d-unified-20261002.mjs';
let post=fs.readFileSync(postPath,'utf8');
post=post.replaceAll('player-3d-unified-runtime.js?v=20261003u15','player-3d-unified-runtime.js?v=20261003u16');
if(!post.includes('player-3d-unified-runtime.js?v=20261003u16'))throw new Error('u16 cache bump missing');
fs.writeFileSync(postPath,post,'utf8');

const buildPath='build.mjs';
let build=fs.readFileSync(buildPath,'utf8');
build=replaceOne(build,"const CLIENT_BUILD = 'v633-player3d-rootmotion-facing-20261003';","const CLIENT_BUILD = 'v634-player3d-melee-inplace-20261003';",'client build bump');
fs.writeFileSync(buildPath,build,'utf8');

console.log('Applied in-place melee attack pose for tank/barbarian/paladin/assassin.');
