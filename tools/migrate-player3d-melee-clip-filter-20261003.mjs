import fs from 'node:fs';

function replaceOne(src,from,to,label){
  const n=src.split(from).length-1;
  if(n!==1)throw new Error(`${label}: expected 1 target, found ${n}`);
  return src.replace(from,to);
}

const runtimePath='gateway/player-3d-unified-runtime.js';
let s=fs.readFileSync(runtimePath,'utf8');

s=replaceOne(
  s,
  "  const MELEE_INPLACE_CLASSES=new Set(['tank','barbarian','paladin','assassin']);\n",
  "  const MELEE_INPLACE_CLASSES=new Set(['tank','barbarian','paladin','assassin']);\n  const MELEE_LOWER_TRACK_RE=/(hips|pelvis|upleg|thigh|leg|calf|shin|knee|foot|toe)/i;\n",
  'melee lower track regex'
);

const oldFns=`  // PPA_PLAYER3D_MELEE_INPLACE_ATTACK_20261003
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
const newFns=`  // PPA_PLAYER3D_MELEE_INPLACE_ATTACK_20261003
  // PPA_PLAYER3D_MELEE_CLIP_FILTER_20261003
  // Melee gameplay owns approach distance. Remove pelvis/leg tracks once when
  // the GLB asset is loaded instead of overwriting bone transforms every frame.
  // Upper-body/arms/weapon tracks remain untouched, so the combo still plays.
  function makeMeleeInPlaceAttackClip(clip,cls){
    if(!clip||!MELEE_INPLACE_CLASSES.has(cls)||!THREE)return clip;
    const tracks=(clip.tracks||[]).filter(t=>!MELEE_LOWER_TRACK_RE.test(String(t&&t.name||'')));
    if(!tracks.length||tracks.length===(clip.tracks||[]).length)return clip;
    return new THREE.AnimationClip(clip.name,clip.duration,tracks,clip.blendMode);
  }
`;
s=replaceOne(s,oldFns,newFns,'replace per-frame melee bone lock with clip filter');

const oldClipBlock=`      const clips=gltf.animations||[];
      return{
        scene:gltf.scene,cfg,
        idle:findClip(clips,['idle','stand','breath'])||clips[0]||null,
        run:findClip(clips,['run','jog','walk']),
        attack:findClip(clips,['attack','shoot','slash','cast','swing','fire','hit']),
        pivotBone:hips&&hips.name||''
      };`;
const newClipBlock=`      const clips=gltf.animations||[];
      const rawAttack=findClip(clips,['attack','shoot','slash','cast','swing','fire','hit']);
      const attack=makeMeleeInPlaceAttackClip(rawAttack,cls);
      return{
        scene:gltf.scene,cfg,
        idle:findClip(clips,['idle','stand','breath'])||clips[0]||null,
        run:findClip(clips,['run','jog','walk']),
        attack,
        pivotBone:hips&&hips.name||''
      };`;
s=replaceOne(s,oldClipBlock,newClipBlock,'filter melee attack clip at asset load');

s=replaceOne(
  s,
  "      e.cfg=a.cfg;e.pivotBone=a.pivotBone||'';\n      e.meleeLowerBody=MELEE_INPLACE_CLASSES.has(e.cls)?captureMeleeLowerBody(clone):[];\n",
  "      e.cfg=a.cfg;e.pivotBone=a.pivotBone||'';\n",
  'remove per-instance lower body capture'
);

s=replaceOne(
  s,
  ",rootMotionBaseX:0,rootMotionBaseZ:0,meleeLowerBody:[]};",
  ",rootMotionBaseX:0,rootMotionBaseZ:0};",
  'remove meleeLowerBody entry state'
);

s=replaceOne(
  s,
  "      if(e.rootMotionBone){e.rootMotionBone.position.x=e.rootMotionBaseX;e.rootMotionBone.position.z=e.rootMotionBaseZ}\n      lockMeleeAttackLowerBody(e);\n      applyHidden(e,wallNow);",
  "      if(e.rootMotionBone){e.rootMotionBone.position.x=e.rootMotionBaseX;e.rootMotionBone.position.z=e.rootMotionBaseZ}\n      applyHidden(e,wallNow);",
  'remove per-frame melee bone writes'
);

s=s.replaceAll("version:'unified-v6-melee-inplace'","version:'unified-v7-melee-clip-filter'");

for(const forbidden of ['captureMeleeLowerBody','lockMeleeAttackLowerBody','meleeLowerBody']){
  if(s.includes(forbidden))throw new Error(`old per-frame melee path survived: ${forbidden}`);
}
for(const required of ['PPA_PLAYER3D_MELEE_CLIP_FILTER_20261003','makeMeleeInPlaceAttackClip','new THREE.AnimationClip']){
  if(!s.includes(required))throw new Error(`missing clip filter invariant: ${required}`);
}
fs.writeFileSync(runtimePath,s,'utf8');

const postPath='tools/postbuild-player-3d-unified-20261002.mjs';
let post=fs.readFileSync(postPath,'utf8');
post=post.replaceAll('player-3d-unified-runtime.js?v=20261003u16','player-3d-unified-runtime.js?v=20261003u17');
if(!post.includes('player-3d-unified-runtime.js?v=20261003u17'))throw new Error('u17 cache bump missing');
fs.writeFileSync(postPath,post,'utf8');

const buildPath='build.mjs';
let build=fs.readFileSync(buildPath,'utf8');
build=replaceOne(build,"const CLIENT_BUILD = 'v635-melee-smart-approach-20261003';","const CLIENT_BUILD = 'v636-player3d-melee-clipfilter-20261003';",'client build bump');
fs.writeFileSync(buildPath,build,'utf8');

console.log('Applied Player3D melee clip-filter optimization: no per-frame lower-body bone writes.');
