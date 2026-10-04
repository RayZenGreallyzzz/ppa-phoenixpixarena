(function(){
  'use strict';
  if(window.__PPA_PLAYER3D_UNIFIED_V2)return;
  window.__PPA_PLAYER3D_UNIFIED_V2=true;

  const CLASS_CONFIG={
    tank:{model:'/game/Tank_Mobile_Shield_Hammer_Final.glb?v=20261002u2',targetHeight:2.34,visualScale:.88,yawOffset:0},
    barbarian:{model:'/game/Berserker_Final.glb?v=20261002u2',targetHeight:2.34,visualScale:.88,yawOffset:0},
    paladin:{model:'/game/Paladin_Final.glb?v=20261002u2',targetHeight:2.34,visualScale:.88,yawOffset:0},
    gnome:{model:'/game/Dwarf.glb?v=20261002u2',targetHeight:1.68,visualScale:.88,yawOffset:0},
    archer:{model:'/game/Ranger_Mobile_Bow_Z90.glb?v=20261002u2',targetHeight:2.34,visualScale:.88,yawOffset:0},
    mage:{model:'/game/Mage_Final.glb?v=20261002u2',targetHeight:2.34,visualScale:.88,yawOffset:0},
    assassin:{model:'/game/Assassin.glb?v=20261002u2',targetHeight:2.34,visualScale:.88,yawOffset:0},
    priest:{model:'/game/Priest_Final_GitHub.glb?v=20261002u2',targetHeight:2.34,visualScale:.88,yawOffset:0}
  };
  const ENABLED=new Set(Object.keys(CLASS_CONFIG));
  const MELEE_INPLACE_CLASSES=new Set(['tank','barbarian','paladin','assassin']);
  const MELEE_LOWER_TRACK_RE=/(hips|pelvis|upleg|thigh|leg|calf|shin|knee|foot|toe)/i;
  const instances=new Map(),assets=new Map();
  const PX_PER_UNIT=34;
  const ACCESSORY_RE=/weapon|sword|shield|dagger|cannon|bow|scepter|hammer|cleaver|blade|bulwark/i;

  let THREE=null,GLTFLoader=null,SkeletonUtils=null;
  let renderer=null,scene=null,camera=null,host=null,hud=null,hx=null;
  let threeInitPromise=null,threeRetryAt=0,threeRetryCount=0;
  let cameraYaw=0,lastW=0,lastH=0,lastFrameAt=performance.now(),frames=0,lastFpsAt=performance.now(),fps=0;
  // Stage 4A: shared per-frame/per-projection scratch state. These objects are
  // reused for every player so the render loop does not create temporary Three.js
  // objects or re-read canvas layout once per visible character.
  const viewState={w:0,h:0};
  const mapState={ready:false,left:0,top:0,right:0,bottom:0,z:1,kx:1,ky:1};
  const groundResult={hit:null,z:1};
  // PPA_PLAYER3D_RUNTIME_OWNS_LOCAL_STATE_20261003
  // Canonical local-player anchor. Canvas no longer owns the GLB lifecycle.
  const localAnchor={classKey:'',worldX:0,worldY:0,scene:null};
  let localSceneToken=null;
  let scratchNdc=null,scratchRay=null,scratchGround=null,scratchPlane=null,scratchProject=null,scratchHead=null,scratchMuzzleWorld=null,scratchMuzzleProject=null;

  function normalizeClass(v){
    const s=String(v||'').trim(),l=s.toLowerCase();
    if(ENABLED.has(l))return l;
    try{
      if(typeof classKeyFromName==='function'){
        const k=String(classKeyFromName(s)||'').toLowerCase();
        if(ENABLED.has(k))return k;
      }
    }catch(_){}
    if(l.includes('страж')||l.includes('tank'))return'tank';
    if(l.includes('бер')||l.includes('barb'))return'barbarian';
    if(l.includes('пал'))return'paladin';
    if(l.includes('гном')||l.includes('cannon'))return'gnome';
    if(l.includes('луч')||l.includes('archer'))return'archer';
    if(l.includes('маг')||l.includes('mage'))return'mage';
    if(l.includes('асс')||l.includes('assassin'))return'assassin';
    if(l.includes('жр')||l.includes('priest'))return'priest';
    return'';
  }
  function localClass(){
    const vals=[];
    try{if(typeof P!=='undefined'&&P)vals.push(P.classKey,P.cls,P.className,P._saved&&P._saved.cls)}catch(_){}
    try{if(typeof INV!=='undefined'&&INV)vals.push(INV.classKey,INV.cls,INV.className)}catch(_){}
    for(const v of vals){const k=normalizeClass(v);if(k)return k}
    return'';
  }
  function localName(){
    const vals=[];
    try{if(typeof P!=='undefined'&&P)vals.push(P.name,P.playerName,P.nickname)}catch(_){}
    try{if(typeof INV!=='undefined'&&INV)vals.push(INV.playerName,INV.name)}catch(_){}
    for(const v of vals){const s=String(v||'').trim();if(s)return s}
    return'Игрок';
  }
  function localClan(){
    try{return (typeof CLAN_LOCAL_STATE!=='undefined'&&CLAN_LOCAL_STATE&&CLAN_LOCAL_STATE.clan)?String(CLAN_LOCAL_STATE.clan.name||'').trim():''}catch(_){return''}
  }
  function isStressBot(r){return !!(r&&r.__ppaDebugRemote)||/^BOT\s*\d+$/i.test(String(r&&r.name||''))}
  function shortestAngle(a,b){let d=(b-a+Math.PI)%(Math.PI*2)-Math.PI;if(d<-Math.PI)d+=Math.PI*2;return a+d}
  function findClip(clips,words){for(const w of words){const c=clips.find(x=>String(x&&x.name||'').toLowerCase().includes(w));if(c)return c}return null}

  function setNodePose(node,p){
    if(!node||!p||!THREE)return;
    if(p.pos)node.position.set(p.pos[0],p.pos[1],p.pos[2]);
    if(p.rot)node.rotation.set(THREE.MathUtils.degToRad(p.rot[0]),THREE.MathUtils.degToRad(p.rot[1]),THREE.MathUtils.degToRad(p.rot[2]),'XYZ');
    if(Number.isFinite(p.scale))node.scale.setScalar(p.scale);
    node.updateMatrix();
  }
  function applyApprovedWeaponPose(cls,root){
    const byName=n=>root.getObjectByName(n);
    if(cls==='paladin')setNodePose(byName('Dawnblade'),{pos:[.31,.16,-.25],rot:[0,45,90],scale:.60});
    else if(cls==='barbarian'){
      setNodePose(byName('Embercleaver_Right'),{pos:[.22,.30,.06],rot:[0,0,-90],scale:.60});
      setNodePose(byName('Embercleaver_Left'),{pos:[-.28,.30,.06],rot:[0,-175,-90],scale:.60});
    }else if(cls==='assassin'){
      setNodePose(byName('AssassinDagger_Right'),{pos:[-.30,.15,0],rot:[0,0,-100],scale:.50});
      setNodePose(byName('AssassinDagger_Left'),{pos:[-.30,.15,0],rot:[0,0,-100],scale:.50});
    }else if(cls==='gnome')setNodePose(byName('DwarfCannon'),{pos:[.04,.42,.04],rot:[-560,-10,40],scale:.70});
    else if(cls==='priest')setNodePose(byName('SunspireScepter'),{pos:[.01,.12,.02],rot:[-95,20,85],scale:.60});
  }
  // PPA_DWARF_MUZZLE_FROM_MODEL_20261002
  // Build one marker from the cannon's own geometry. We take the longest local
  // axis of DwarfCannon and select the end farther from LeftHand; this gives the
  // barrel end without any game-world pixel offset guesses.
  function attachDwarfMuzzle(root){
    try{
      const cannon=root&&root.getObjectByName&&root.getObjectByName('DwarfCannon');
      if(!cannon||cannon.getObjectByName('PPA_DwarfMuzzle'))return cannon&&cannon.getObjectByName('PPA_DwarfMuzzle');
      const hand=(root.getObjectByName&&root.getObjectByName('LeftHand'))||cannon.parent||cannon;
      root.updateWorldMatrix(true,true);
      cannon.updateWorldMatrix(true,true);

      // PPA_DWARF_MUZZLE_GEOMETRY_AXIS_20261002
      // Sample the actual cannon mesh in DwarfCannon-local coordinates. The barrel
      // direction is derived from the mesh's geometric diameter, not from XYZ axes.
      const inv=new THREE.Matrix4().copy(cannon.matrixWorld).invert();
      const points=[];
      const v=new THREE.Vector3();
      cannon.traverse(o=>{
        const attr=o&&o.geometry&&o.geometry.attributes&&o.geometry.attributes.position;
        if(!attr||!Number.isFinite(attr.count)||attr.count<=0)return;
        const step=Math.max(1,Math.floor(attr.count/6000));
        for(let i=0;i<attr.count;i+=step){
          v.fromBufferAttribute(attr,i);
          try{if(o.isSkinnedMesh&&typeof o.applyBoneTransform==='function')o.applyBoneTransform(i,v)}catch(_){}
          v.applyMatrix4(o.matrixWorld).applyMatrix4(inv);
          points.push(v.clone());
        }
      });
      if(points.length<8)return null;

      const handLocal=new THREE.Vector3();
      hand.getWorldPosition(handLocal);handLocal.applyMatrix4(inv);
      const farthestFrom=q=>{
        let best=points[0],bestD=-1;
        for(const pt of points){const d=pt.distanceToSquared(q);if(d>bestD){bestD=d;best=pt}}
        return best;
      };
      const a=farthestFrom(points[0]);
      const b=farthestFrom(a);
      const axis=new THREE.Vector3().subVectors(b,a);
      if(axis.lengthSq()<1e-10)return null;
      axis.normalize();

      let minP=Infinity,maxP=-Infinity;
      for(const pt of points){const q=pt.dot(axis);if(q<minP)minP=q;if(q>maxP)maxP=q}
      const handP=handLocal.dot(axis);
      const towardMax=Math.abs(maxP-handP)>=Math.abs(minP-handP);
      const tipP=towardMax?maxP:minP;
      const span=Math.max(1e-6,maxP-minP);
      const band=Math.max(span*.08,span/120);

      // Average the outer 8% of the mesh to get the CENTER of the physical end,
      // then place the marker on the exact end plane. This avoids selecting a
      // random bounding-box corner or a sight/stock vertex.
      const pos=new THREE.Vector3();let n=0;
      for(const pt of points){
        const q=pt.dot(axis);
        if(towardMax?q>=tipP-band:q<=tipP+band){pos.add(pt);n++}
      }
      if(!n)return null;
      pos.multiplyScalar(1/n);
      pos.addScaledVector(axis,tipP-pos.dot(axis));

      const marker=new THREE.Object3D();
      marker.name='PPA_DwarfMuzzle';
      marker.userData.ppaMuzzleFromModel=true;
      marker.userData.ppaMuzzleMethod='geometry-diameter-endcap';
      marker.position.copy(pos);
      cannon.add(marker);
      marker.updateWorldMatrix(true,false);
      return marker;
    }catch(e){console.warn('PPA dwarf muzzle marker',e);return null}
  }
  function bodyBounds(root){
    root.updateWorldMatrix(true,true);
    const box=new THREE.Box3();let found=false;
    root.traverse(o=>{
      if(!o||!o.isSkinnedMesh||ACCESSORY_RE.test(String(o.name||'')))return;
      try{
        if(typeof o.computeBoundingBox==='function')o.computeBoundingBox();
        else if(o.geometry&&!o.geometry.boundingBox)o.geometry.computeBoundingBox();
        const b=o.boundingBox||(o.geometry&&o.geometry.boundingBox);
        if(!b)return;
        box.union(b.clone().applyMatrix4(o.matrixWorld));found=true;
      }catch(_){}
    });
    if(found&&!box.isEmpty())return box;
    root.traverse(o=>{
      if(!o||!o.isSkinnedMesh)return;
      try{
        if(typeof o.computeBoundingBox==='function')o.computeBoundingBox();
        else if(o.geometry&&!o.geometry.boundingBox)o.geometry.computeBoundingBox();
        const b=o.boundingBox||(o.geometry&&o.geometry.boundingBox);
        if(!b)return;
        box.union(b.clone().applyMatrix4(o.matrixWorld));found=true;
      }catch(_){}
    });
    return found&&!box.isEmpty()?box:new THREE.Box3().setFromObject(root);
  }
  function findBone(root,type){
    const bones=[];root.traverse(o=>{if(o&&o.isBone)bones.push(o)});
    if(!bones.length)return null;
    if(type==='hips'){
      let hit=bones.find(b=>/(hips|pelvis)/i.test(String(b.name||'')));
      if(hit)return hit;
      hit=bones.find(b=>!(b.parent&&b.parent.isBone));
      return hit||bones[0];
    }
    let hit=bones.find(b=>/(^|[:_\-.])head(end)?$/i.test(String(b.name||'')));
    if(hit)return hit;
    let best=null,bestY=-Infinity,tmp=new THREE.Vector3();
    for(const b of bones){
      try{b.getWorldPosition(tmp);if(tmp.y>bestY){bestY=tmp.y;best=b}}catch(_){}
    }
    return best;
  }
  // PPA_PLAYER3D_MELEE_INPLACE_ATTACK_20261003
  // PPA_PLAYER3D_MELEE_CLIP_FILTER_20261003
  // PPA_PLAYER3D_ANIM_SPEED_SYNC_20261004
  // Melee gameplay owns approach distance. Remove pelvis/leg tracks once when
  // the GLB asset is loaded instead of overwriting bone transforms every frame.
  // Upper-body/arms/weapon tracks remain untouched, so the combo still plays.
  function makeMeleeInPlaceAttackClip(clip,cls){
    if(!clip||!MELEE_INPLACE_CLASSES.has(cls)||!THREE)return clip;
    const tracks=(clip.tracks||[]).filter(t=>!MELEE_LOWER_TRACK_RE.test(String(t&&t.name||'')));
    if(!tracks.length||tracks.length===(clip.tracks||[]).length)return clip;
    return new THREE.AnimationClip(clip.name,clip.duration,tracks,clip.blendMode);
  }

  async function ensureThree(){
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
  }
  function resize(){
    if(!renderer||!camera||!hud)return null;
    const w=Math.max(2,Math.round(innerWidth||document.documentElement.clientWidth||2));
    const h=Math.max(2,Math.round(innerHeight||document.documentElement.clientHeight||2));
    if(w!==lastW||h!==lastH){
      lastW=w;lastH=h;
      renderer.setSize(w,h,false);
      hud.width=w;hud.height=h;
      const fh=h/PX_PER_UNIT,a=w/h;
      camera.left=-fh*a/2;camera.right=fh*a/2;camera.top=fh/2;camera.bottom=-fh/2;
      camera.updateProjectionMatrix();
    }
    viewState.w=w;viewState.h=h;return viewState;
  }
  function prepareWorldMap(){
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
  function worldToGround(wx,wy,view){
    try{
      if(!mapState.ready||!scratchNdc||!scratchRay||!scratchGround||!scratchPlane)return null;
      const sx=Number(wx)-Number(cam.x||0),sy=Number(wy)-Number(cam.y||0),z=mapState.z;
      const px=mapState.left+sx*z*mapState.kx,py=mapState.top+sy*z*mapState.ky;
      if(!Number.isFinite(px)||!Number.isFinite(py))return null;
      if(px<mapState.left-160||px>mapState.right+160||py<mapState.top-200||py>mapState.bottom+200)return null;
      scratchNdc.set(px/view.w*2-1,1-py/view.h*2);
      scratchRay.setFromCamera(scratchNdc,camera);
      if(!scratchRay.ray.intersectPlane(scratchPlane,scratchGround))return null;
      groundResult.z=z;return groundResult;
    }catch(_){return null}
  }
  function projectIntoHud(v,view,h,xKey,yKey){
    scratchProject.copy(v).project(camera);
    h[xKey]=(scratchProject.x*.5+.5)*view.w;
    h[yKey]=(-scratchProject.y*.5+.5)*view.h;
  }

  function nodeGamePoint(node){
    try{
      if(!node||!camera||!scratchMuzzleWorld||!scratchMuzzleProject)return null;
      const view=resize();if(!view||!prepareWorldMap())return null;
      node.getWorldPosition(scratchMuzzleWorld);
      scratchMuzzleProject.copy(scratchMuzzleWorld).project(camera);
      const px=(scratchMuzzleProject.x*.5+.5)*view.w;
      const py=(-scratchMuzzleProject.y*.5+.5)*view.h;
      const z=Math.max(.1,Number(mapState.z)||1);
      const dx=z*Number(mapState.kx||0),dy=z*Number(mapState.ky||0);
      if(!Number.isFinite(px)||!Number.isFinite(py)||!Number.isFinite(dx)||!Number.isFinite(dy)||Math.abs(dx)<1e-7||Math.abs(dy)<1e-7)return null;
      const x=Number(cam.x||0)+(px-mapState.left)/dx;
      const y=Number(cam.y||0)+(py-mapState.top)/dy;
      if(!Number.isFinite(x)||!Number.isFinite(y))return null;
      return{x:x,y:y,screenX:px,screenY:py};
    }catch(_){return null}
  }
  function muzzlePoint(id){
    try{
      const raw=String(id||'local');
      const e=instances.get(raw)||instances.get('remote:'+raw);
      if(!e||e.cls!=='gnome'||!e.muzzle)return null;
      if(e.root)e.root.updateWorldMatrix(true,true);
      return nodeGamePoint(e.muzzle);
    }catch(_){return null}
  }

  async function loadAsset(cls){
    if(assets.has(cls))return assets.get(cls);
    const promise=(async()=>{
      await ensureThree();
      const cfg=CLASS_CONFIG[cls],gltf=await new GLTFLoader().loadAsync(cfg.model);
      applyApprovedWeaponPose(cls,gltf.scene);
      gltf.scene.updateWorldMatrix(true,true);
      if(cls==='gnome')attachDwarfMuzzle(gltf.scene);

      const box=bodyBounds(gltf.scene),size=box.getSize(new THREE.Vector3());
      const hips=findBone(gltf.scene,'hips'),hipsPos=new THREE.Vector3();
      if(hips)hips.getWorldPosition(hipsPos);else box.getCenter(hipsPos);
      const sc=(Number(cfg.targetHeight)||2.34)/Math.max(.001,size.y);

      gltf.scene.scale.setScalar(sc);
      gltf.scene.position.set(-hipsPos.x*sc,-box.min.y*sc,-hipsPos.z*sc);
      gltf.scene.updateWorldMatrix(true,true);

      const clips=gltf.animations||[];
      const rawAttack=findClip(clips,['attack','shoot','slash','cast','swing','fire','hit']);
      const attack=makeMeleeInPlaceAttackClip(rawAttack,cls);
      return{
        scene:gltf.scene,cfg,
        idle:findClip(clips,['idle','stand','breath'])||clips[0]||null,
        run:findClip(clips,['run','jog','walk']),
        attack,
        pivotBone:hips&&hips.name||''
      };
    })();
    assets.set(cls,promise);
    try{return await promise}catch(e){assets.delete(cls);throw e}
  }
  function playerAnimTimeScale(e,name){
    if(name!=='attack'&&name!=='run')return 1;
    try{
      if(e&&e.kind==='local'){
        if(typeof window.playerAnimRate==='function'){
          const v=Number(window.playerAnimRate(name));
          if(Number.isFinite(v)&&v>0)return name==='attack'?Math.max(.60,Math.min(2.50,v)):Math.max(.65,Math.min(2.00,v));
        }
        if(typeof P!=='undefined'&&P){
          if(name==='attack'){
            const base=Math.max(.01,Number(P.baseAtkSpd)||Number(P.atkSpd)||1);
            const current=Math.max(.01,Number(P.atkSpd)||base);
            let mul=1;
            if(typeof window.shopAtkSpeedMul==='function'){
              const m=Number(window.shopAtkSpeedMul());
              if(Number.isFinite(m)&&m>0)mul=m;
            }
            return Math.max(.60,Math.min(2.50,(current*mul)/base));
          }
          const base=Math.max(.01,Number(P.baseSp)||Number(P.spd)||Number(P.sp)||1);
          const current=Math.max(.01,Number(P.spd)||Number(P.sp)||base);
          let mul=1;
          if(typeof window.shopSpeedMul==='function'){
            const m=Number(window.shopSpeedMul());
            if(Number.isFinite(m)&&m>0)mul=m;
          }
          return Math.max(.65,Math.min(2.00,(current*mul)/base));
        }
      }
    }catch(_){}
    return 1;
  }
  function switchAnim(e,name,now){
    const next=e.actions&&(e.actions[name]||e.actions.idle);
    if(!next){e.anim=name;return}
    const stamp=Number.isFinite(Number(now))?Number(now):performance.now();
    const same=next===e.current;
    if(same&&name===e.anim&&stamp<Number(e.animRateCheckAt||0))return;
    const rate=playerAnimTimeScale(e,name);
    e.animRateCheckAt=stamp+120;
    if(same){
      try{
        if(Math.abs(rate-(Number(e.animRate)||1))>.01)next.setEffectiveTimeScale(rate);
        e.animRate=rate;e.anim=name;
      }catch(_){}
      return;
    }
    try{
      next.enabled=true;next.reset();next.setEffectiveTimeScale(rate);next.play();
      if(e.current)e.current.crossFadeTo(next,.10,false);
      e.current=next;e.anim=name;e.animRate=rate;
    }catch(_){}
  }
  async function ensureInstance(e){
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
      // PPA_PLAYER3D_ROOT_MOTION_LOCK_20261003
      // GLB clips may translate the scene root or hips in local X/Z. Gameplay
      // already owns world movement, so animation root-motion must never move
      // the visible body away from its canonical Player3D anchor. Preserve Y.
      e.rootMotionBone=e.pivotBone?clone.getObjectByName(e.pivotBone):null;
      e.modelBaseX=Number(clone.position.x)||0;e.modelBaseZ=Number(clone.position.z)||0;
      e.rootMotionBaseX=e.rootMotionBone?(Number(e.rootMotionBone.position.x)||0):0;
      e.rootMotionBaseZ=e.rootMotionBone?(Number(e.rootMotionBone.position.z)||0):0;
      e.retryAt=0;e.retryCount=0;
      switchAnim(e,'idle',performance.now());
    }catch(err){
      e.error=String(err&&err.message||err);
      e.retryCount=Math.min(6,Number(e.retryCount||0)+1);
      e.retryAt=performance.now()+Math.min(10000,500*Math.pow(2,e.retryCount-1));
    }finally{e.loading=false}
  }
  function removeEntry(id,e){
    if(e)e.alive=false;
    if(e&&e.root&&scene)scene.remove(e.root);
    if(e&&e.mixer)try{e.mixer.stopAllAction()}catch(_){}
    instances.delete(id);
  }
  function upsert(id,kind,cls,data,anchor){
    if(!id||!cls||!anchor)return false;
    let e=instances.get(id);
    if(!e||e.cls!==cls){
      if(e)removeEntry(id,e);
      e={id,kind,cls,data,anchor,seenAt:performance.now(),alive:true,loading:false,retryAt:0,retryCount:0,root:null,model:null,head:null,muzzle:null,mixer:null,actions:null,current:null,anim:'idle',animRate:1,animRateCheckAt:0,cfg:null,error:'',lastWX:null,lastWY:null,movingUntil:0,lastMotionYaw:0,hasMotionYaw:false,hud:{feetX:0,feetY:0,headX:0,headY:0},hiddenState:null,pivotBone:'',rootMotionBone:null,modelBaseX:0,modelBaseZ:0,rootMotionBaseX:0,rootMotionBaseZ:0};
      instances.set(id,e);ensureInstance(e);
    }
    e.kind=kind;e.data=data;e.anchor=anchor;e.seenAt=performance.now();e.alive=true;
    return !!e.root;
  }
  function registerLocal(a){
    const cls=normalizeClass(a&&a.classKey)||localClass();
    if(!cls||!a||!Number.isFinite(Number(a.worldX))||!Number.isFinite(Number(a.worldY)))return false;
    return upsert('local','local',cls,null,a);
  }
  function syncLocalFromGame(now){
    try{
      if(typeof P==='undefined'||!P)return false;
      const x=Number(P.x),y=Number(P.y);
      if(!Number.isFinite(x)||!Number.isFinite(y))return false;
      const cls=localClass()||normalizeClass(localAnchor.classKey);
      if(!cls)return false;
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
      localAnchor.classKey=cls;
      localAnchor.worldX=x;
      localAnchor.worldY=y;
      localAnchor.scene=nextScene;
      upsert('local','local',cls,null,localAnchor);
      return true;
    }catch(_){return false}
  }
  function registerRemote(r,a){
    if(!r||isStressBot(r))return false;
    const cls=normalizeClass(r.cls||r.classKey||r.className);
    if(!cls||!a||!Number.isFinite(Number(a.worldX))||!Number.isFinite(Number(a.worldY)))return false;
    const raw=String(r.id||r.pid||r.playerId||r.uid||r.name||'');
    if(!raw)return false;
    return upsert('remote:'+raw,'remote',cls,r,a);
  }

  function localYaw(e,now){
    try{
      const cfg=e.cfg||CLASS_CONFIG[e.cls],px=Number(e.anchor.worldX),py=Number(e.anchor.worldY);
      if(e.lastWX===null){e.lastWX=px;e.lastWY=py}
      else{
        const dx=px-e.lastWX,dy=py-e.lastWY,d=Math.hypot(dx,dy);
        e.lastWX=px;e.lastWY=py;
        if(d>.015&&d<100){
          e.movingUntil=now+150;
          const raw=cameraYaw+Math.atan2(dx,dy)+(Number(cfg.yawOffset)||0);
          e.lastMotionYaw=e.hasMotionYaw?shortestAngle(e.lastMotionYaw,raw):raw;
          e.hasMotionYaw=true;
        }
      }
      const attack=!!P.attacking||Number(P.runAttackT)>0||Number(P.shootT)>0||String(P.anim||'').toLowerCase().includes('attack');
      if(attack&&P.tid!=null&&typeof EN!=='undefined'&&Array.isArray(EN)){
        const t=EN.find(x=>x&&x.id==P.tid);
        if(t){
          const dx=Number(t.x)-px,dy=Number(t.y)-py;
          if(Number.isFinite(dx)&&Number.isFinite(dy)&&Math.hypot(dx,dy)>.01){
            const raw=cameraYaw+Math.atan2(dx,dy)+(Number(cfg.yawOffset)||0);
            e.lastMotionYaw=e.hasMotionYaw?shortestAngle(e.lastMotionYaw,raw):raw;
            e.hasMotionYaw=true;
            return e.lastMotionYaw;
          }
        }
      }
      // Idle owns the last real movement yaw. Legacy P.face is only a startup/attack fallback.
      if(e.hasMotionYaw&&!attack)return e.lastMotionYaw;
      let f=Number(P&&P.face),dir=4;
      if(Number.isFinite(f)&&f>=0&&f<=7)dir=Math.round(f);else if(f===8)dir=0;else if(f===-1)dir=6;else if(f===1)dir=2;
      const raw=cameraYaw+(4-dir)*(Math.PI/4)+(Number(cfg.yawOffset)||0);
      if(attack){
        e.lastMotionYaw=e.hasMotionYaw?shortestAngle(e.lastMotionYaw,raw):raw;
        e.hasMotionYaw=true;
        return e.lastMotionYaw;
      }
      return raw;
    }catch(_){return cameraYaw}
  }
  function remoteYaw(e,now){
    const r=e.data||{},cfg=e.cfg||CLASS_CONFIG[e.cls];
    const x=Number(e.anchor.worldX),y=Number(e.anchor.worldY);
    if(e.lastWX===null){e.lastWX=x;e.lastWY=y}
    else{
      const dx=x-e.lastWX,dy=y-e.lastWY,d=Math.hypot(dx,dy);
      e.lastWX=x;e.lastWY=y;
      if(d>.015&&d<100){
        e.movingUntil=now+180;
        const raw=cameraYaw+Math.atan2(dx,dy)+(Number(cfg.yawOffset)||0);
        e.lastMotionYaw=e.hasMotionYaw?shortestAngle(e.lastMotionYaw,raw):raw;
        e.hasMotionYaw=true;
      }
    }
    // Preserve the last real movement yaw while idle; attack still follows network face.
    const remoteAttack=String(r.anim||'').toLowerCase()==='attack';
    if(e.hasMotionYaw&&!remoteAttack)return e.lastMotionYaw;
    const f=Number(r.face);let dir=2;
    if(f===-1)dir=6;else if(f===1)dir=2;else if(Number.isFinite(f)&&f>=0&&f<=7)dir=Math.round(f);else if(f===8)dir=0;
    const raw=cameraYaw+(4-dir)*(Math.PI/4)+(Number(cfg.yawOffset)||0);
    if(remoteAttack){
      e.lastMotionYaw=e.hasMotionYaw?shortestAngle(e.lastMotionYaw,raw):raw;
      e.hasMotionYaw=true;
      return e.lastMotionYaw;
    }
    return raw;
  }
  function desiredAnim(e,now){
    if(e.kind==='local'){
      try{
        const a=String(P&&P.anim||'').toLowerCase();
        if(a.includes('attack')||P.attacking||Number(P.runAttackT)>0||Number(P.shootT)>0)return'attack';
      }catch(_){}
      return now<e.movingUntil?'run':'idle';
    }
    const r=e.data||{},a=String(r.anim||'').toLowerCase();
    if(a==='attack')return'attack';
    return now<e.movingUntil||a==='run'?'run':'idle';
  }
  function applyHidden(e,wallNow){
    if(!e.model)return;
    const hidden=e.kind==='remote'&&Number(e.data&&e.data.hiddenUntil)>wallNow;
    if(e.hiddenState===hidden)return;
    e.hiddenState=hidden;
    e.model.traverse(o=>{
      if(!o||!o.material)return;
      const mats=Array.isArray(o.material)?o.material:[o.material];
      for(const m of mats){
        if(!m)continue;
        if(m.userData.__ppaBaseTransparent===undefined)m.userData.__ppaBaseTransparent=!!m.transparent;
        if(m.userData.__ppaBaseOpacity===undefined)m.userData.__ppaBaseOpacity=Number.isFinite(Number(m.opacity))?Number(m.opacity):1;
        m.transparent=hidden||m.userData.__ppaBaseTransparent===true;
        m.opacity=hidden?.38:m.userData.__ppaBaseOpacity;
        m.needsUpdate=true;
      }
    });
  }
  function updateHudAnchor(e,view,z){
    try{
      // PPA_PLAYER3D_STABLE_HUD_ANCHOR_20261003
      // Labels must not follow an animated head bone: idle/run/attack move the
      // skeleton every frame and make nickname/clan text visibly shake.
      const h=e.hud||(e.hud={feetX:0,feetY:0,headX:0,headY:0});
      projectIntoHud(e.root.position,view,h,'feetX','feetY');
      const cfg=e.cfg||CLASS_CONFIG[e.cls];
      const stableHeight=(Number(cfg.targetHeight)||2.34)*(Number(cfg.visualScale)||1)*z;
      scratchHead.set(e.root.position.x,e.root.position.y+stableHeight,e.root.position.z);
      projectIntoHud(scratchHead,view,h,'headX','headY');
      return h;
    }catch(_){return null}
  }
  function textStrokeFill(text,x,y,font,fill){
    hx.font=font;hx.textAlign='center';hx.textBaseline='bottom';hx.lineJoin='round';hx.lineWidth=2.4;
    hx.strokeStyle='rgba(18,8,5,.92)';hx.strokeText(text,x,y);hx.fillStyle=fill;hx.fillText(text,x,y);
  }
  function drawHud(e,wallNow){
    if(!hx||!e.hud)return;
    const h=e.hud,remote=e.kind==='remote',r=e.data||{};
    hx.save();
    if(remote&&Number(r.hiddenUntil)>wallNow)hx.globalAlpha=.38;
    const feetY=Math.round(Number(h.feetY));
    const headX=Math.round(Number(h.headX));
    const headY=Math.round(Number(h.headY));
    const bodyPx=Math.max(0,feetY-headY);
    const labelGap=Math.max(14,Math.min(24,bodyPx*.12));
    const y=Math.round(headY-labelGap);
    if(remote&&Number(r.mhp)>0){
      const bw=36;hx.fillStyle='rgba(0,0,0,.68)';hx.fillRect(headX-bw/2,y-7,bw,4);
      hx.fillStyle='#47dd78';hx.fillRect(headX-bw/2,y-7,bw*Math.max(0,Math.min(1,(Number(r.hp)||0)/Number(r.mhp))),4);
    }
    const name=remote?String(r.name||'Игрок').slice(0,18):localName().slice(0,18);
    const clan=remote?String(r.clanName||'').slice(0,18):localClan().slice(0,18);
    if(clan)textStrokeFill('['+clan+']',headX,y-15,'700 8px Georgia, serif','#a9cfff');
    textStrokeFill(name,headX,y,'600 10px Georgia, serif','#f2d39a');
    hx.restore();
  }

  function frame(now){
    requestAnimationFrame(frame);
    if(!THREE||!renderer||!scene||!camera){
      if(now>=threeRetryAt&&!threeInitPromise)ensureThree().catch(()=>{});
      return;
    }
    syncLocalFromGame(now);
    const view=resize();if(!view)return;
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
      if(!e.alive||(e.kind==='remote'&&now-e.seenAt>1800)){removeEntry(id,e);continue}
      if(!e.root||!e.anchor){
        if(!e.loading&&now>=Number(e.retryAt||0))ensureInstance(e);
        continue;
      }

      const mapped=worldToGround(e.anchor.worldX,e.anchor.worldY,view);
      if(!mapped){e.root.visible=false;continue}
      e.root.visible=true;
      e.root.position.copy(mapped.hit);
      e.root.scale.setScalar((Number(e.cfg&&e.cfg.visualScale)||1)*mapped.z);

      const yaw=e.kind==='local'?localYaw(e,now):remoteYaw(e,now);
      const target=shortestAngle(e.root.rotation.y,yaw);
      e.root.rotation.y+=(target-e.root.rotation.y)*Math.min(1,dt*14);

      switchAnim(e,desiredAnim(e,now),now);
      try{if(e.mixer)e.mixer.update(dt)}catch(_){}
      // Animation may contain root translation. Neutralize horizontal root-motion
      // after sampling so the body cannot orbit/slide away from the game anchor.
      if(e.model){e.model.position.x=e.modelBaseX;e.model.position.z=e.modelBaseZ}
      if(e.rootMotionBone){e.rootMotionBone.position.x=e.rootMotionBaseX;e.rootMotionBone.position.z=e.rootMotionBaseZ}
      applyHidden(e,wallNow);
      // Head.getWorldPosition() updates only the required parent chain for HUD.
      // The renderer updates the full scene graph later during render(), so a
      // forced full-tree update here was duplicate work for every visible GLB.
      updateHudAnchor(e,view,mapped.z);
      drawHud(e,wallNow);
    }

    try{renderer.render(scene,camera)}catch(_){}
    frames++;
    if(now-lastFpsAt>=1000){fps=Math.round(frames*1000/(now-lastFpsAt));frames=0;lastFpsAt=now}
  }

  window.PPA_PLAYER3D={
    version:'unified-v8-anim-speed-sync',
    local:registerLocal,
    remote:registerRemote,
    muzzle:muzzlePoint,
    diag:()=>({
      version:'unified-v8-anim-speed-sync',fps,
      instances:Array.from(instances.values()).map(e=>({
        id:e.id,kind:e.kind,cls:e.cls,ready:!!e.root,loading:!!e.loading,error:e.error||'',
        pivotBone:e.pivotBone||'',headBone:e.head&&e.head.name||'',muzzle:e.muzzle&&e.muzzle.name||'',
        worldX:e.anchor&&e.anchor.worldX,worldY:e.anchor&&e.anchor.worldY,anim:e.anim
      })),
      loadedClasses:Array.from(assets.keys())
    })
  };
  ensureThree().catch(e=>console.warn('PPA unified 3D init',e));
  requestAnimationFrame(frame);
})();