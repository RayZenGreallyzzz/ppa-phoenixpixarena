(function(){
  'use strict';
  if(window.__PPA_REMOTE_3D_V1)return;
  window.__PPA_REMOTE_3D_V1=true;

  const CLASS_CONFIG={
    tank:{model:'/game/Tank_Mobile_Shield_Hammer_Final.glb?v=20261001m',targetHeight:2.34,visualScale:.88,yawOffset:0},
    barbarian:{model:'/game/Berserker_Final.glb?v=20261001m',targetHeight:2.34,visualScale:.88,yawOffset:0},
    paladin:{model:'/game/Paladin_Final.glb?v=20261001m',targetHeight:2.34,visualScale:.88,yawOffset:0},
    gnome:{model:'/game/Dwarf.glb?v=20261001m',targetHeight:1.68,visualScale:.88,yawOffset:0},
    archer:{model:'/game/Ranger_Mobile_Bow_Z90.glb?v=20261001m',targetHeight:2.34,visualScale:.88,yawOffset:0},
    mage:{model:'/game/Mage_Final.glb?v=20261001m',targetHeight:2.34,visualScale:.88,yawOffset:0},
    assassin:{model:'/game/Assassin.glb?v=20261001m',targetHeight:2.34,visualScale:.88,yawOffset:0},
    priest:{model:'/game/Priest_Final_GitHub.glb?v=20261001m',targetHeight:2.34,visualScale:.88,yawOffset:0}
  };
  const ENABLED=new Set(Object.keys(CLASS_CONFIG));
  const PX_PER_UNIT=34;
  const live=new Map();
  const assets=new Map();
  let THREE=null,GLTFLoader=null,SkeletonUtils=null,renderer=null,scene=null,camera=null,host=null,cameraYaw=0,lastW=0,lastH=0;
  let installed=false,fallbackDraw=null,frames=0,lastFpsAt=performance.now(),fps=0,lastFrameAt=performance.now();

  function normalizeClass(v){
    const s=String(v||'').trim(),l=s.toLowerCase();
    if(ENABLED.has(l))return l;
    try{if(typeof classKeyFromName==='function'){const k=String(classKeyFromName(s)||'').toLowerCase();if(ENABLED.has(k))return k}}catch(_){}
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
  function findClip(clips,words){for(const w of words){const c=clips.find(x=>String(x&&x.name||'').toLowerCase().includes(w));if(c)return c}return null}
  function setNodePose(node,p){if(!node||!p||!THREE)return;if(p.pos)node.position.set(p.pos[0],p.pos[1],p.pos[2]);if(p.rot)node.rotation.set(THREE.MathUtils.degToRad(p.rot[0]),THREE.MathUtils.degToRad(p.rot[1]),THREE.MathUtils.degToRad(p.rot[2]),'XYZ');if(Number.isFinite(p.scale))node.scale.setScalar(p.scale);node.updateMatrix()}
  function applyApprovedWeaponPose(cls,root){
    const byName=n=>root.getObjectByName(n);
    if(cls==='paladin')setNodePose(byName('Dawnblade'),{pos:[.31,.16,-.25],rot:[0,45,90],scale:.60});
    else if(cls==='barbarian'){setNodePose(byName('Embercleaver_Right'),{pos:[.22,.30,.06],rot:[0,0,-90],scale:.60});setNodePose(byName('Embercleaver_Left'),{pos:[-.28,.30,.06],rot:[0,-175,-90],scale:.60})}
    else if(cls==='assassin'){setNodePose(byName('AssassinDagger_Right'),{pos:[-.30,.15,0],rot:[0,0,-100],scale:.50});setNodePose(byName('AssassinDagger_Left'),{pos:[-.30,.15,0],rot:[0,0,-100],scale:.50})}
    else if(cls==='gnome')setNodePose(byName('DwarfCannon'),{pos:[.04,.42,.04],rot:[-560,-10,40],scale:.70});
    else if(cls==='priest')setNodePose(byName('SunspireScepter'),{pos:[.01,.12,.02],rot:[-95,20,85],scale:.60});
  }
  function bodyBounds(root){root.updateWorldMatrix(true,true);const box=new THREE.Box3();let found=false;root.traverse(o=>{if(!o||!o.isSkinnedMesh)return;try{if(typeof o.computeBoundingBox==='function')o.computeBoundingBox();else if(o.geometry&&!o.geometry.boundingBox)o.geometry.computeBoundingBox();const b=o.boundingBox||(o.geometry&&o.geometry.boundingBox);if(!b)return;box.union(b.clone().applyMatrix4(o.matrixWorld));found=true}catch(_){}});return found&&!box.isEmpty()?box:new THREE.Box3().setFromObject(root)}
  function shortestAngle(a,b){let d=(b-a+Math.PI)%(Math.PI*2)-Math.PI;if(d<-Math.PI)d+=Math.PI*2;return a+d}

  async function ensureThree(){
    if(THREE)return;
    THREE=await import('https://esm.sh/three@0.180.0');
    const lm=await import('https://esm.sh/three@0.180.0/examples/jsm/loaders/GLTFLoader.js');GLTFLoader=lm.GLTFLoader;
    SkeletonUtils=await import('https://esm.sh/three@0.180.0/examples/jsm/utils/SkeletonUtils.js');
    host=document.createElement('div');host.id='ppaRemote3DLayer';host.style.cssText='position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:3;overflow:hidden;';document.body.appendChild(host);
    renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'high-performance'});renderer.setPixelRatio(1);renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;renderer.domElement.style.cssText='position:absolute;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none;filter:saturate(1.28) contrast(1.06) brightness(1.04);';host.appendChild(renderer.domElement);
    scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-10,10,10,-10,.01,100);camera.position.set(5.0,7.4,9.0);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);cameraYaw=Math.atan2(camera.position.x,camera.position.z);
    scene.add(new THREE.HemisphereLight(0xfff7ea,0x263451,1.55));const sun=new THREE.DirectionalLight(0xfff0cf,3.10);sun.position.set(4.5,8.0,5.5);scene.add(sun);const fill=new THREE.DirectionalLight(0x9ec8ff,.82);fill.position.set(-4.0,3.5,2.5);scene.add(fill);
  }
  function resize(){if(!renderer||!camera)return null;const w=Math.max(2,Math.round(innerWidth||document.documentElement.clientWidth||2)),h=Math.max(2,Math.round(innerHeight||document.documentElement.clientHeight||2));if(w!==lastW||h!==lastH){lastW=w;lastH=h;renderer.setSize(w,h,false);const fh=h/PX_PER_UNIT,a=w/h;camera.left=-fh*a/2;camera.right=fh*a/2;camera.top=fh/2;camera.bottom=-fh/2;camera.updateProjectionMatrix()}return{w,h}}
  async function loadAsset(cls){
    if(assets.has(cls))return assets.get(cls);
    const promise=(async()=>{await ensureThree();const cfg=CLASS_CONFIG[cls],gltf=await new GLTFLoader().loadAsync(cfg.model);applyApprovedWeaponPose(cls,gltf.scene);gltf.scene.updateWorldMatrix(true,true);const box=bodyBounds(gltf.scene),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),sc=(Number(cfg.targetHeight)||2.34)/Math.max(.001,size.y);gltf.scene.scale.setScalar(sc);gltf.scene.position.set(-center.x*sc,-box.min.y*sc,-center.z*sc);gltf.scene.updateMatrixWorld(true);const clips=gltf.animations||[];return{scene:gltf.scene,clips,sc,cfg,idle:findClip(clips,['idle','stand','breath'])||clips[0]||null,run:findClip(clips,['run','jog','walk']),attack:findClip(clips,['attack','shoot','slash','cast','swing','fire','hit'])}})();
    assets.set(cls,promise);try{return await promise}catch(e){assets.delete(cls);throw e}
  }
  async function ensureInstance(entry){
    if(entry.root||entry.loading)return;entry.loading=true;
    try{
      const a=await loadAsset(entry.cls);if(!entry.alive)return;
      const clone=SkeletonUtils.clone(a.scene);
      clone.traverse(o=>{if(!o||!o.material)return;try{if(Array.isArray(o.material))o.material=o.material.map(m=>m&&m.clone?m.clone():m);else if(o.material.clone)o.material=o.material.clone()}catch(_){}});
      entry.root=new THREE.Group();entry.model=clone;entry.root.add(clone);scene.add(entry.root);
      entry.mixer=new THREE.AnimationMixer(clone);entry.actions={};if(a.idle)entry.actions.idle=entry.mixer.clipAction(a.idle);if(a.run)entry.actions.run=entry.mixer.clipAction(a.run);if(a.attack)entry.actions.attack=entry.mixer.clipAction(a.attack);entry.cfg=a.cfg;entry.current=null;switchAnim(entry,'idle');
    }catch(e){entry.error=String(e&&e.message||e)}finally{entry.loading=false}
  }
  function switchAnim(e,name){const next=e.actions&&(e.actions[name]||e.actions.idle);if(!next||next===e.current)return;try{next.enabled=true;next.reset();next.play();if(e.current)e.current.crossFadeTo(next,.10,false);e.current=next;e.anim=name}catch(_){}}
  function dirFromRemote(r,dx,dy){const d=Math.hypot(dx,dy),face=Number(r&&r.face);if(d>.35){const oct=Math.round(Math.atan2(dy,dx)/(Math.PI/4));return((oct+2)+8)%8}if(Number.isFinite(face)){if(face===-1)return 6;if(face===1)return 2;if(face>=0&&face<=7)return Math.round(face);if(face===8)return 0}return 2}
  function screenGround(sx,sy,z,view){try{const rect=cv.getBoundingClientRect(),kx=rect.width/Math.max(1,cv.width),ky=rect.height/Math.max(1,cv.height),px=rect.left+sx*z*kx,py=rect.top+sy*z*ky,ndc=new THREE.Vector2(px/view.w*2-1,1-py/view.h*2),ray=new THREE.Raycaster();ray.setFromCamera(ndc,camera);const hit=new THREE.Vector3();if(!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),hit))return null;return hit}catch(_){return null}}
  function removeEntry(id,e){if(e)e.alive=false;if(e&&e.root&&scene)scene.remove(e.root);if(e&&e.mixer)try{e.mixer.stopAllAction()}catch(_){}live.delete(id)}

  function drawRemoteHud(r,sx,sy,nearCount,hidden){
    try{
      if(typeof cx==='undefined'||!cx)return;
      const remoteScale=(typeof PHONE_REMOTE_PLAYER_VISUAL_SCALE==='number'?PHONE_REMOTE_PLAYER_VISUAL_SCALE:1);
      let body=48;
      try{if(typeof phoneCharacterBodySize==='function')body=Math.max(32,Number(phoneCharacterBodySize(60,1))||48)*remoteScale}catch(_){}
      const topY=sy-Math.max(30,body*.58),dist=Math.hypot(Number(r.x)-Number(P.x),Number(r.y)-Number(P.y));
      cx.save();if(hidden)cx.globalAlpha=.38;
      if(Number(r.mhp)>0&&dist<650){const bw=Math.max(30,36*remoteScale);cx.fillStyle='rgba(0,0,0,.68)';cx.fillRect(sx-bw/2,topY-5,bw,4);cx.fillStyle='#47dd78';cx.fillRect(sx-bw/2,topY-5,bw*Math.max(0,Math.min(1,(Number(r.hp)||0)/Number(r.mhp))),4)}
      if(Number(nearCount)<=14||dist<360){cx.textAlign='center';cx.textBaseline='bottom';cx.lineJoin='round';if(r.clanName){cx.font='700 8px Georgia, serif';cx.lineWidth=2.2;cx.strokeStyle='rgba(8,12,20,.94)';cx.strokeText('['+String(r.clanName).slice(0,18)+']',sx,topY-18);cx.fillStyle='#a9cfff';cx.fillText('['+String(r.clanName).slice(0,18)+']',sx,topY-18)}cx.font='600 10px Georgia, serif';cx.lineWidth=2.4;cx.strokeStyle='rgba(18,8,5,.92)';cx.strokeText(String(r.name||'Игрок').slice(0,18),sx,topY-8);cx.fillStyle='#f2d39a';cx.fillText(String(r.name||'Игрок').slice(0,18),sx,topY-8)}
      cx.restore();
    }catch(_){}
  }

  function wrapDraw(){
    if(installed)return true;
    if(typeof ppaOnlineDrawRemote!=='function')return false;
    fallbackDraw=ppaOnlineDrawRemote;
    const wrapped=function(r,now,nearCount){
      if(!r||!r.hasPos)return fallbackDraw(r,now,nearCount);
      const cls=normalizeClass(r.cls);if(!cls)return fallbackDraw(r,now,nearCount);
      const id=String(r.id||r.pid||r.playerId||r.name||'');if(!id)return fallbackDraw(r,now,nearCount);
      let e=live.get(id);
      if(!e||e.cls!==cls){if(e)removeEntry(id,e);e={id,cls,r,seenAt:performance.now(),alive:true,loading:false,root:null,mixer:null,actions:null,current:null,anim:'',error:''};live.set(id,e);ensureInstance(e)}
      e.r=r;e.seenAt=performance.now();e.nearCount=nearCount;
      if(!e.root)return fallbackDraw(r,now,nearCount);
      try{
        const dt=Math.max(0,Math.min(100,now-(r.lastDrawAt||now)));r.lastDrawAt=now;const alpha=1-Math.exp(-dt/105);r.x+=(r.tx-r.x)*alpha;r.y+=(r.ty-r.y)*alpha;
        const sx=r.x-cam.x,sy=r.y-cam.y,z=Math.max(.1,Number(cameraZoom())||1),body=48;
        r.__ppaHitX=sx;r.__ppaHitY=sy;r.__ppaHitBody=Math.max(26,body*.72);r.__ppaHitAt=now;
        const rect=cv.getBoundingClientRect(),kx=rect.width/Math.max(1,cv.width),ky=rect.height/Math.max(1,cv.height);r.__ppaClientX=rect.left+sx*z*kx;r.__ppaClientY=rect.top+sy*z*ky;const hidden=Number(r.hiddenUntil)>Date.now();r.__ppaClientRadius=hidden?0:Math.max(42,Math.min(82,body*z*Math.max(kx,ky)*1.65));r.__ppaUntargetable=hidden;r.__ppaClientAt=now;
        drawRemoteHud(r,sx,sy,nearCount,hidden);
      }catch(_){}
      return true;
    };
    wrapped.__ppaRemote3D=true;ppaOnlineDrawRemote=wrapped;try{window.ppaOnlineDrawRemote=wrapped}catch(_){}installed=true;return true;
  }

  function frame(now){
    requestAnimationFrame(frame);if(!installed)wrapDraw();if(!THREE||!renderer||!scene||!camera)return;
    const view=resize();if(!view)return;const z=Math.max(.1,Number(typeof cameraZoom==='function'?cameraZoom():1)||1),dt=Math.max(0,Math.min(.05,(now-lastFrameAt)/1000));lastFrameAt=now;
    for(const [id,e] of live){
      if(now-e.seenAt>1800||!e.alive){removeEntry(id,e);continue}
      const r=e.r;if(!r||!e.root)continue;
      const sx=Number(r.x)-Number(cam&&cam.x||0),sy=Number(r.y)-Number(cam&&cam.y||0),vw=(typeof cv!=='undefined'&&cv)?cv.width/z:view.w,vh=(typeof cv!=='undefined'&&cv)?cv.height/z:view.h;
      if(sx<-120||sy<-170||sx>vw+120||sy>vh+170){e.root.visible=false;continue}
      e.root.visible=true;const hit=screenGround(sx,sy,z,view);if(!hit){e.root.visible=false;continue}
      e.root.position.copy(hit);e.root.scale.setScalar((Number(e.cfg&&e.cfg.visualScale)||1)*z);
      const dx=(Number(r.tx)||0)-(Number(r.x)||0),dy=(Number(r.ty)||0)-(Number(r.y)||0),moving=Math.hypot(dx,dy)>.55||String(r.anim||'').toLowerCase()==='run';let anim=String(r.anim||'').toLowerCase();if(!['idle','run','attack'].includes(anim))anim=moving?'run':'idle';switchAnim(e,anim);try{if(e.mixer)e.mixer.update(dt)}catch(_){}
      const dir=dirFromRemote(r,dx,dy),target=cameraYaw+(4-dir)*(Math.PI/4)+(Number(e.cfg&&e.cfg.yawOffset)||0),desired=shortestAngle(e.root.rotation.y,target);e.root.rotation.y+=(desired-e.root.rotation.y)*Math.min(1,dt*12);
      const hidden=Number(r.hiddenUntil)>Date.now();e.root.traverse(o=>{if(o&&o.material){const mats=Array.isArray(o.material)?o.material:[o.material];for(const m of mats){if(!m)continue;if(m.userData.__ppaBaseTransparent===undefined)m.userData.__ppaBaseTransparent=!!m.transparent;if(m.userData.__ppaBaseOpacity===undefined)m.userData.__ppaBaseOpacity=Number.isFinite(Number(m.opacity))?Number(m.opacity):1;m.transparent=hidden||m.userData.__ppaBaseTransparent===true;m.opacity=hidden?.38:m.userData.__ppaBaseOpacity;m.needsUpdate=true}}});
    }
    try{renderer.render(scene,camera)}catch(_){}frames++;if(now-lastFpsAt>=1000){fps=Math.round(frames*1000/(now-lastFpsAt));frames=0;lastFpsAt=now}
  }

  window.PPA_REMOTE3D={diag:()=>({enabled:true,installed,players:live.size,loadedClasses:Array.from(assets.keys()),fps,entries:Array.from(live.values()).map(e=>({id:e.id,cls:e.cls,ready:!!e.root,loading:!!e.loading,error:e.error||'',anim:e.anim}))})};
  function boot(){if(!wrapDraw())setTimeout(boot,250)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  requestAnimationFrame(frame);
})();
