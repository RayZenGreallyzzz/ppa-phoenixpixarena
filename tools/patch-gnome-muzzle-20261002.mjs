import fs from 'node:fs';

function read(p){return fs.readFileSync(p,'utf8')}
function write(p,s){fs.writeFileSync(p,s,'utf8')}
function count(h,n){return h.split(n).length-1}
function replaceOnce(src,from,to,label){
  const n=count(src,from);
  if(n!==1)throw new Error(`${label}: expected exactly one target, found ${n}`);
  return src.replace(from,to);
}

// 1) Unified Player3D: derive a real muzzle marker from the DwarfCannon geometry
// and expose its current game-world position through PPA_PLAYER3D.muzzle().
{
  const p='gateway/player-3d-unified-runtime.js';
  let s=read(p);
  if(!s.includes('PPA_DWARF_MUZZLE_FROM_MODEL_20261002')){
    s=replaceOnce(
      s,
      "  let scratchNdc=null,scratchRay=null,scratchGround=null,scratchPlane=null,scratchProject=null,scratchHead=null;",
      "  let scratchNdc=null,scratchRay=null,scratchGround=null,scratchPlane=null,scratchProject=null,scratchHead=null,scratchMuzzleWorld=null,scratchMuzzleProject=null;",
      'Player3D scratch state'
    );

    const poseNeedle="  function bodyBounds(root){";
    const muzzleHelper=`  // PPA_DWARF_MUZZLE_FROM_MODEL_20261002\n  // Build one marker from the cannon's own geometry. We take the longest local\n  // axis of DwarfCannon and select the end farther from LeftHand; this gives the\n  // barrel end without any game-world pixel offset guesses.\n  function attachDwarfMuzzle(root){\n    try{\n      const cannon=root&&root.getObjectByName&&root.getObjectByName('DwarfCannon');\n      if(!cannon||cannon.getObjectByName('PPA_DwarfMuzzle'))return cannon&&cannon.getObjectByName('PPA_DwarfMuzzle');\n      const hand=(root.getObjectByName&&root.getObjectByName('LeftHand'))||cannon.parent||cannon;\n      root.updateWorldMatrix(true,true);\n      cannon.updateWorldMatrix(true,true);\n\n      const inv=new THREE.Matrix4().copy(cannon.matrixWorld).invert();\n      const localBox=new THREE.Box3().makeEmpty();\n      const v=new THREE.Vector3();\n      cannon.traverse(o=>{\n        const attr=o&&o.geometry&&o.geometry.attributes&&o.geometry.attributes.position;\n        if(!attr||!Number.isFinite(attr.count)||attr.count<=0)return;\n        const step=Math.max(1,Math.floor(attr.count/16000));\n        for(let i=0;i<attr.count;i+=step){\n          v.fromBufferAttribute(attr,i);\n          try{if(o.isSkinnedMesh&&typeof o.applyBoneTransform==='function')o.applyBoneTransform(i,v)}catch(_){}\n          v.applyMatrix4(o.matrixWorld).applyMatrix4(inv);\n          localBox.expandByPoint(v);\n        }\n      });\n      if(localBox.isEmpty())return null;\n\n      const handLocal=new THREE.Vector3();\n      hand.getWorldPosition(handLocal);handLocal.applyMatrix4(inv);\n      const size=localBox.getSize(new THREE.Vector3());\n      const pos=localBox.getCenter(new THREE.Vector3());\n      const axis=(size.x>=size.y&&size.x>=size.z)?'x':(size.y>=size.z?'y':'z');\n      pos[axis]=Math.abs(localBox.max[axis]-handLocal[axis])>=Math.abs(localBox.min[axis]-handLocal[axis])\n        ?localBox.max[axis]:localBox.min[axis];\n\n      const marker=new THREE.Object3D();\n      marker.name='PPA_DwarfMuzzle';\n      marker.userData.ppaMuzzleFromModel=true;\n      marker.position.copy(pos);\n      cannon.add(marker);\n      marker.updateWorldMatrix(true,false);\n      return marker;\n    }catch(e){console.warn('PPA dwarf muzzle marker',e);return null}\n  }\n`;
    s=replaceOnce(s,poseNeedle,muzzleHelper+poseNeedle,'Player3D muzzle helper insertion');

    s=replaceOnce(
      s,
      "    scratchHead=new THREE.Vector3();\n    groundResult.hit=scratchGround;",
      "    scratchHead=new THREE.Vector3();\n    scratchMuzzleWorld=new THREE.Vector3();\n    scratchMuzzleProject=new THREE.Vector3();\n    groundResult.hit=scratchGround;",
      'Player3D muzzle scratch init'
    );

    const projectNeedle="  async function loadAsset(cls){";
    const projectionHelper=`  function nodeGamePoint(node){\n    try{\n      if(!node||!camera||!scratchMuzzleWorld||!scratchMuzzleProject)return null;\n      const view=resize();if(!view||!prepareWorldMap())return null;\n      node.getWorldPosition(scratchMuzzleWorld);\n      scratchMuzzleProject.copy(scratchMuzzleWorld).project(camera);\n      const px=(scratchMuzzleProject.x*.5+.5)*view.w;\n      const py=(-scratchMuzzleProject.y*.5+.5)*view.h;\n      const z=Math.max(.1,Number(mapState.z)||1);\n      const dx=z*Number(mapState.kx||0),dy=z*Number(mapState.ky||0);\n      if(!Number.isFinite(px)||!Number.isFinite(py)||!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)<1e-7||Math.abs(dy)<1e-7)return null;\n      const x=Number(cam.x||0)+(px-mapState.left)/dx;\n      const y=Number(cam.y||0)+(py-mapState.top)/dy;\n      if(!Number.isFinite(x)||!Number.isFinite(y))return null;\n      return{x:x,y:y,screenX:px,screenY:py};\n    }catch(_){return null}\n  }\n  function muzzlePoint(id){\n    try{\n      const raw=String(id||'local');\n      const e=instances.get(raw)||instances.get('remote:'+raw);\n      if(!e||e.cls!=='gnome'||!e.muzzle)return null;\n      if(e.root)e.root.updateWorldMatrix(true,true);\n      return nodeGamePoint(e.muzzle);\n    }catch(_){return null}\n  }\n\n`;
    s=replaceOnce(s,projectNeedle,projectionHelper+projectNeedle,'Player3D projection helper insertion');

    s=replaceOnce(
      s,
      "      applyApprovedWeaponPose(cls,gltf.scene);\n      gltf.scene.updateWorldMatrix(true,true);",
      "      applyApprovedWeaponPose(cls,gltf.scene);\n      gltf.scene.updateWorldMatrix(true,true);\n      if(cls==='gnome')attachDwarfMuzzle(gltf.scene);",
      'Player3D attach muzzle on asset load'
    );

    s=replaceOnce(
      s,
      "      e.head=findBone(clone,'head');\n      e.mixer=new THREE.AnimationMixer(clone);",
      "      e.head=findBone(clone,'head');\n      e.muzzle=clone.getObjectByName('PPA_DwarfMuzzle')||null;\n      e.mixer=new THREE.AnimationMixer(clone);",
      'Player3D instance muzzle binding'
    );

    s=replaceOnce(
      s,
      "root:null,model:null,head:null,mixer:null",
      "root:null,model:null,head:null,muzzle:null,mixer:null",
      'Player3D entry muzzle field'
    );

    s=replaceOnce(
      s,
      "    local:registerLocal,\n    remote:registerRemote,\n    diag:()=>({",
      "    local:registerLocal,\n    remote:registerRemote,\n    muzzle:muzzlePoint,\n    diag:()=>({",
      'Player3D public muzzle API'
    );

    s=replaceOnce(
      s,
      "        pivotBone:e.pivotBone||'',headBone:e.head&&e.head.name||'',",
      "        pivotBone:e.pivotBone||'',headBone:e.head&&e.head.name||'',muzzle:e.muzzle&&e.muzzle.name||'',",
      'Player3D muzzle diagnostic'
    );

    write(p,s);
  }
}

// 2) Realtime FX sender: every gnome-cannon event resolves through the same
// Player3D muzzle API, so PK/arena remotes receive the true 3D start point.
{
  const p='gateway/realtime-client.js';
  let s=read(p);
  if(!s.includes('PPA_GNOME_FX_3D_MUZZLE_20261002')){
    s=replaceOnce(
      s,
      "      return send({\n        type:'player-combat-fx',kind:kind,\n        x:Number(d.x)||0,y:Number(d.y)||0,tx:Number(d.tx)||0,ty:Number(d.ty)||0,",
      "      var fxX=Number(d.x)||0,fxY=Number(d.y)||0;\n      // PPA_GNOME_FX_3D_MUZZLE_20261002\n      if(kind==='gnome-cannon'){\n        try{\n          var muzzle=window.PPA_PLAYER3D&&typeof window.PPA_PLAYER3D.muzzle==='function'?window.PPA_PLAYER3D.muzzle('local'):null;\n          if(muzzle&&Number.isFinite(Number(muzzle.x))&&Number.isFinite(Number(muzzle.y))){fxX=Number(muzzle.x);fxY=Number(muzzle.y)}\n        }catch(_){}\n      }\n      return send({\n        type:'player-combat-fx',kind:kind,\n        x:fxX,y:fxY,tx:Number(d.tx)||0,ty:Number(d.ty)||0,",
      'Realtime combat FX muzzle origin'
    );
    write(p,s);
  }
}

// 3) Build-time PvE source replacement: keep targeting/damage semantics, but
// remove the legacy P.x/P.y cannon offset and launch toward the target from the
// same Player3D muzzle used by realtime.
{
  const p='tools/postbuild-player-3d-unified-20261002.mjs';
  let s=read(p);
  if(!s.includes('PPA_GNOME_PVE_3D_MUZZLE_20261002')){
    const gnomeFunction=`function gnomeFireCannonball(){\n  let target=null;\n  if(P.tid!=null){\n    target=EN.find(function(e){return e&&e.id==P.tid&&e.hp>0&&targetIsValid(e)})||null;\n    if(target){\n      const edge=(target.sz&&target.sz>30)?Math.max(0,(target.sz-30)*.4):0;\n      if(Math.hypot(target.x-P.x,target.y-P.y)>playerBasicRange()+edge)target=null;\n    }\n  }\n  if(!target)target=findNearBasic();\n  P.tid=target?target.id:null;\n  if(!target)return false;\n\n  const dx=target.x-P.x,dy=target.y-P.y;\n  const dist=Math.max(1,Math.hypot(dx,dy));\n  const ang=Math.atan2(dy,dx);\n  const speed=7;\n\n  P.face=dx<0?-1:1;\n  P.meleeAng=ang;\n  P.shootT=1;\n  P.recoil=0;\n\n  let muzzleX=P.x,muzzleY=P.y;\n  try{\n    const muzzle=window.PPA_PLAYER3D&&typeof window.PPA_PLAYER3D.muzzle==='function'?window.PPA_PLAYER3D.muzzle('local'):null;\n    if(muzzle&&Number.isFinite(Number(muzzle.x))&&Number.isFinite(Number(muzzle.y))){muzzleX=Number(muzzle.x);muzzleY=Number(muzzle.y)}\n  }catch(_){}\n\n  const shotDx=target.x-muzzleX,shotDy=target.y-muzzleY;\n  const shotDist=Math.max(1,Math.hypot(shotDx,shotDy));\n  PLAYER_CANNONBALLS.push({\n    x:muzzleX,\n    y:muzzleY,\n    vx:shotDx/shotDist*speed,\n    vy:shotDy/shotDist*speed,\n    remaining:shotDist,\n    target:target\n  });\n\n  for(let i=0;i<3;i++){\n    PT.push({\n      x:muzzleX,y:muzzleY,\n      vx:shotDx/shotDist*(1.2+i*.45)+(Math.random()-.5)*.6,\n      vy:shotDy/shotDist*(1.2+i*.45)+(Math.random()-.5)*.6,\n      life:6,ml:6,sz:1.5+i*.45,\n      col:i===0?'#ffd36a':'#c47a32'\n    });\n  }\n  return true;\n}`;
    const insert=`\n// PPA_GNOME_PVE_3D_MUZZLE_20261002\nconst gnome3DFire=${JSON.stringify(gnomeFunction)};\nhtml=replaceFunction(html,'function gnomeFireCannonball(){',gnome3DFire);\nif(html.includes('const muzzleX=P.x+dx/dist*24')||html.includes('const muzzleY=P.y-7+dy/dist*10'))throw new Error('Unified 3D build: legacy gnome 2D muzzle survived');\nif(!html.includes("window.PPA_PLAYER3D.muzzle('local')"))throw new Error('Unified 3D build: gnome 3D muzzle hook missing');\n\n`;
    s=replaceOnce(
      s,
      "html=removeFunction(html,'function playerAnimDef(name){');",
      insert+"html=removeFunction(html,'function playerAnimDef(name){');",
      'Postbuild gnome PvE replacement insertion'
    );
    const oldVersionCount=count(s,'20261002u4');
    if(oldVersionCount<1)throw new Error('Postbuild runtime cache version target missing');
    s=s.split('20261002u4').join('20261002u6');
    write(p,s);
  }
}

// 4) Bump the main client build key so Telegram/Cloudflare cannot serve a stale
// HTML/script graph after the projectile-origin change.
{
  const p='build.mjs';
  let s=read(p);
  const next="const CLIENT_BUILD = 'v630-gnome-3d-muzzle-20261002';";
  if(!s.includes(next)){
    s=replaceOnce(
      s,
      "const CLIENT_BUILD = 'v629-dungeon-add-plus3-plus9-spread-20260929';",
      next,
      'Client build cache key'
    );
    write(p,s);
  }
}

console.log('Applied gnome 3D muzzle patch: model-derived DwarfCannon muzzle -> PvE + realtime combat FX');
