(function(){
  'use strict';
  if(window.__PPA_PRIMARY_3D_V4)return;
  window.__PPA_PRIMARY_3D_V4=true;

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
  const ENABLED_CLASSES=new Set(Object.keys(CLASS_CONFIG));
  const PX_PER_UNIT=34;
  const OVERSCAN_PX=128;

  let THREE=null,GLTFLoader=null,renderer=null,scene=null,camera=null,host=null,nameEl=null,clanEl=null;
  let modelRoot=null,model=null,mixer=null,actions={},currentAction=null,loadedClass='';
  let lastAt=performance.now(),lastPX=null,lastPY=null,movingUntil=0,lastMotionYaw=0,hasMotionYaw=false;
  let cameraYaw=0,lastRectW=0,lastRectH=0,loadToken=0;
  const state={ready:false,loading:false,error:'',anim:'idle',fps:0,frames:0,lastFpsAt:performance.now(),classKey:'',yawDeg:0,clips:[],missingAnims:[],bodyHeight:0,modelScale:0,facingSource:'legacy',targetId:null};

  function normalizeClass(v){
    const s=String(v||'').trim(),l=s.toLowerCase();
    if(['tank','barbarian','paladin','gnome','archer','mage','assassin','priest'].includes(l))return l;
    try{if(typeof classKeyFromName==='function'){const k=classKeyFromName(s);if(k)return String(k).toLowerCase()}}catch(_){}
    if(l.includes('луч')||l.includes('archer'))return'archer';
    if(l.includes('страж')||l.includes('tank'))return'tank';
    if(l.includes('бер')||l.includes('barb'))return'barbarian';
    if(l.includes('пал'))return'paladin';
    if(l.includes('гном')||l.includes('cannon'))return'gnome';
    if(l.includes('маг')||l.includes('mage'))return'mage';
    if(l.includes('асс')||l.includes('assassin'))return'assassin';
    if(l.includes('жр')||l.includes('priest'))return'priest';
    return'';
  }
  function currentClass(){
    const vals=[];
    try{if(typeof P!=='undefined'&&P)vals.push(P.classKey,P.cls,P.className,P._saved&&P._saved.cls)}catch(_){}
    try{if(typeof INV!=='undefined'&&INV)vals.push(INV.classKey,INV.cls,INV.className)}catch(_){}
    try{const s=JSON.parse(localStorage.getItem('pxSave')||'null');if(s)vals.push(s.classKey,s.cls,s.className)}catch(_){}
    for(const v of vals){const k=normalizeClass(v);if(k)return k}
    return'';
  }
  function currentName(){
    const vals=[];
    try{if(typeof P!=='undefined'&&P)vals.push(P.name,P.playerName,P.nickname)}catch(_){}
    try{if(typeof INV!=='undefined'&&INV)vals.push(INV.playerName,INV.name)}catch(_){}
    try{const s=JSON.parse(localStorage.getItem('pxSave')||'null');if(s)vals.push(s.playerName,s.nickname)}catch(_){}
    try{vals.push(localStorage.getItem('ppaPlayerNameV205'))}catch(_){}
    for(const v of vals){const s=String(v||'').trim();if(s)return s}
    return'Игрок';
  }
  function currentClanName(){
    try{return (typeof CLAN_LOCAL_STATE!=='undefined'&&CLAN_LOCAL_STATE&&CLAN_LOCAL_STATE.clan)?String(CLAN_LOCAL_STATE.clan.name||'').trim():''}catch(_){return''}
  }
  function playerReady(){try{return typeof P!=='undefined'&&P&&typeof cv!=='undefined'&&cv&&typeof cameraZoom==='function'}catch(_){return false}}
  function toast(t,c){try{if(typeof showPickup==='function')showPickup(t,c||'#91ffc1')}catch(_){} }
  function shortestAngle(a,b){let d=(b-a+Math.PI)%(Math.PI*2)-Math.PI;if(d<-Math.PI)d+=Math.PI*2;return a+d}
  function configFor(cls){return CLASS_CONFIG[cls]||CLASS_CONFIG.archer}
  function legacyYaw(){
    try{
      let f=Number(P&&P.face),dir=4;
      if(Number.isFinite(f)&&f>=0&&f<=7)dir=Math.round(f);else if(f===8)dir=0;else if(f===-1)dir=6;else if(f===1)dir=2;
      const cfg=configFor(loadedClass||currentClass());
      return cameraYaw+(4-dir)*(Math.PI/4)+(Number(cfg.yawOffset)||0);
    }catch(_){return cameraYaw}
  }
  function sampleMotion(now){
    try{
      const x=Number(P.x)||0,y=Number(P.y)||0;
      if(lastPX===null||lastPY===null){lastPX=x;lastPY=y;lastMotionYaw=legacyYaw();hasMotionYaw=true;return false}
      const dx=x-lastPX,dy=y-lastPY,d=Math.hypot(dx,dy);lastPX=x;lastPY=y;
      if(d>.015&&d<100){
        movingUntil=now+150;
        const cfg=configFor(loadedClass||currentClass());
        const raw=cameraYaw+Math.atan2(dx,dy)+(Number(cfg.yawOffset)||0);
        lastMotionYaw=hasMotionYaw?shortestAngle(lastMotionYaw,raw):raw;hasMotionYaw=true;
      }
      return now<movingUntil;
    }catch(_){return false}
  }
  function attackFacingActive(){
    try{
      return !!P.attacking||Number(P.runAttackT)>0||Number(P.shootT)>0||String(P.anim||'').toLowerCase().includes('attack');
    }catch(_){return false}
  }
  function attackFacingYaw(){
    if(!attackFacingActive())return null;
    try{
      const cfg=configFor(loadedClass||currentClass());
      const px=Number(P.x),py=Number(P.y);
      if(P.tid!=null&&typeof EN!=='undefined'&&Array.isArray(EN)){
        const t=EN.find(e=>e&&e.id==P.tid);
        let valid=!!t;
        try{if(valid&&typeof targetIsValid==='function')valid=!!targetIsValid(t)}catch(_){}
        if(valid){
          const dx=Number(t.x)-px,dy=Number(t.y)-py;
          if(Number.isFinite(dx)&&Number.isFinite(dy)&&Math.hypot(dx,dy)>.01){
            state.targetId=t.id;
            return cameraYaw+Math.atan2(dx,dy)+(Number(cfg.yawOffset)||0);
          }
        }
      }
      const a=Number(P.meleeAng);
      if(Number.isFinite(a)){
        state.targetId=P.tid==null?null:P.tid;
        return cameraYaw+Math.atan2(Math.cos(a),Math.sin(a))+(Number(cfg.yawOffset)||0);
      }
    }catch(_){}
    return null;
  }
  function desiredAnim(moving){try{const a=String(P&&P.anim||'').toLowerCase();if(a.includes('attack'))return'attack'}catch(_){}return moving?'run':'idle'}
  function switchAnim(name){
    const next=actions[name]||actions.idle;if(!next)return;
    if(next===currentAction){state.anim=name;return}
    try{next.enabled=true;next.reset();next.play();if(currentAction)currentAction.crossFadeTo(next,.10,false);currentAction=next;state.anim=name}catch(_){}
  }
  function findClip(clips,words){for(const word of words){const hit=clips.find(c=>String(c&&c.name||'').toLowerCase().includes(word));if(hit)return hit}return null}

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

  function bodyBounds(root){
    root.updateWorldMatrix(true,true);
    const box=new THREE.Box3();let found=false;
    root.traverse(o=>{
      if(!o||!o.isSkinnedMesh)return;
      try{
        if(typeof o.computeBoundingBox==='function')o.computeBoundingBox();
        else if(o.geometry&&!o.geometry.boundingBox)o.geometry.computeBoundingBox();
        const b=(o.boundingBox||o.geometry&&o.geometry.boundingBox);
        if(!b)return;
        box.union(b.clone().applyMatrix4(o.matrixWorld));found=true;
      }catch(_){}
    });
    if(found&&!box.isEmpty())return box;
    return new THREE.Box3().setFromObject(root);
  }

  function ensureHost(){
    if(host)return;
    host=document.createElement('div');host.id='ppaPrimary3DLayer';
    host.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;pointer-events:none;overflow:visible;z-index:4;contain:layout style;';document.body.appendChild(host);
    clanEl=document.createElement('div');clanEl.id='ppaPrimary3DClan';
    clanEl.style.cssText='position:absolute;transform:translate(-50%,-100%);white-space:nowrap;font:700 8px Georgia,serif;color:#a9cfff;text-shadow:-1px -1px 0 rgba(8,12,20,.94),1px -1px 0 rgba(8,12,20,.94),-1px 1px 0 rgba(8,12,20,.94),1px 1px 0 rgba(8,12,20,.94);pointer-events:none;z-index:2;';host.appendChild(clanEl);
    nameEl=document.createElement('div');nameEl.id='ppaPrimary3DName';
    nameEl.style.cssText='position:absolute;transform:translate(-50%,-100%);white-space:nowrap;font:600 11px Georgia,serif;color:#f2d39a;text-shadow:-1px -1px 0 rgba(18,8,5,.92),1px -1px 0 rgba(18,8,5,.92),-1px 1px 0 rgba(18,8,5,.92),1px 1px 0 rgba(18,8,5,.92);pointer-events:none;z-index:2;';host.appendChild(nameEl);
  }
  function resizeToGameCanvas(){
    if(!renderer||!camera||typeof cv==='undefined'||!cv)return null;
    const r=cv.getBoundingClientRect();if(!(r.width>2&&r.height>2))return null;
    host.style.left=r.left+'px';host.style.top=r.top+'px';host.style.width=r.width+'px';host.style.height=r.height+'px';
    const renderW=r.width+OVERSCAN_PX*2,renderH=r.height+OVERSCAN_PX*2;
    if(Math.abs(lastRectW-r.width)>.5||Math.abs(lastRectH-r.height)>.5){
      lastRectW=r.width;lastRectH=r.height;
      renderer.setSize(Math.max(2,Math.round(renderW)),Math.max(2,Math.round(renderH)),false);
      renderer.domElement.style.left=(-OVERSCAN_PX)+'px';renderer.domElement.style.top=(-OVERSCAN_PX)+'px';
      renderer.domElement.style.width=renderW+'px';renderer.domElement.style.height=renderH+'px';
      const frustumH=renderH/PX_PER_UNIT,aspect=renderW/renderH;camera.left=-frustumH*aspect/2;camera.right=frustumH*aspect/2;camera.top=frustumH/2;camera.bottom=-frustumH/2;camera.updateProjectionMatrix();
    }
    return {rect:r,renderW,renderH,offset:OVERSCAN_PX};
  }
  function anchorToGround(anchor,view){
    if(!THREE||!camera||!modelRoot||!anchor||!view)return false;
    const rect=view.rect,z=Math.max(.1,Number(anchor.zoom)||1),kx=rect.width/Math.max(1,Number(cv.width)||rect.width),ky=rect.height/Math.max(1,Number(cv.height)||rect.height);
    const px=view.offset+Number(anchor.x)*z*kx,py=view.offset+Number(anchor.y)*z*ky;if(!Number.isFinite(px)||!Number.isFinite(py))return false;
    const ndc=new THREE.Vector2(px/view.renderW*2-1,1-py/view.renderH*2),ray=new THREE.Raycaster();ray.setFromCamera(ndc,camera);
    const hit=new THREE.Vector3();if(!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),hit))return false;
    modelRoot.position.copy(hit);const cfg=configFor(loadedClass||'archer');modelRoot.scale.setScalar((Number(cfg.visualScale)||1)*z);return true;
  }
  function updateLabels(view){
    if(!nameEl||!clanEl||!modelRoot||!camera||!THREE||!view)return;
    try{
      const cfg=configFor(loadedClass||'archer'),z=Math.max(.1,Number((window.__PPA3D_LOCAL_ANCHOR||{}).zoom)||1);
      const h=(Number(cfg.targetHeight)||2.34)*(Number(cfg.visualScale)||1)*z+.42;
      const p=new THREE.Vector3(modelRoot.position.x,h,modelRoot.position.z).project(camera);
      const x=(p.x*.5+.5)*view.renderW-view.offset,y=(-p.y*.5+.5)*view.renderH-view.offset;
      nameEl.textContent=currentName();nameEl.style.left=x+'px';nameEl.style.top=(y-8)+'px';nameEl.style.display='block';
      const clan=currentClanName();if(clan){clanEl.textContent='['+clan.slice(0,18)+']';clanEl.style.left=x+'px';clanEl.style.top=(y-21)+'px';clanEl.style.display='block'}else clanEl.style.display='none';
    }catch(_){nameEl.style.display='none';clanEl.style.display='none'}
  }

  async function loadClass(cls){
    const cfg=CLASS_CONFIG[cls];if(!cfg||loadedClass===cls&&state.ready)return;
    const token=++loadToken;state.loading=true;state.ready=false;state.error='';state.classKey=cls;state.clips=[];state.missingAnims=[];
    try{
      if(!THREE){
        THREE=await import('https://esm.sh/three@0.180.0');const lm=await import('https://esm.sh/three@0.180.0/examples/jsm/loaders/GLTFLoader.js');GLTFLoader=lm.GLTFLoader;ensureHost();
        renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'high-performance'});renderer.setPixelRatio(1);renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
        renderer.domElement.style.cssText='position:absolute;left:0;top:0;display:block;pointer-events:none;filter:saturate(1.28) contrast(1.06) brightness(1.04);';host.insertBefore(renderer.domElement,clanEl);
        scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-10,10,10,-10,.01,100);camera.position.set(5.0,7.4,9.0);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);cameraYaw=Math.atan2(camera.position.x,camera.position.z);
        scene.add(new THREE.HemisphereLight(0xfff7ea,0x263451,1.55));const sun=new THREE.DirectionalLight(0xfff0cf,3.10);sun.position.set(4.5,8.0,5.5);scene.add(sun);const fill=new THREE.DirectionalLight(0x9ec8ff,.82);fill.position.set(-4.0,3.5,2.5);scene.add(fill);
      }
      const gltf=await new GLTFLoader().loadAsync(cfg.model);if(token!==loadToken)return;
      if(modelRoot){scene.remove(modelRoot);modelRoot=null;model=null;mixer=null;actions={};currentAction=null}
      modelRoot=new THREE.Group();scene.add(modelRoot);model=gltf.scene;modelRoot.add(model);
      applyApprovedWeaponPose(cls,model);
      model.updateWorldMatrix(true,true);
      const box=bodyBounds(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
      const targetHeight=Number(cfg.targetHeight)||2.34,bodyH=Math.max(.001,size.y),sc=targetHeight/bodyH;
      model.scale.setScalar(sc);model.position.set(-center.x*sc,-box.min.y*sc,-center.z*sc);state.bodyHeight=bodyH;state.modelScale=sc;
      mixer=new THREE.AnimationMixer(model);const clips=gltf.animations||[];state.clips=clips.map(c=>String(c&&c.name||''));
      const idle=findClip(clips,['idle','stand','breath'])||clips[0]||null,run=findClip(clips,['run','jog','walk']),attack=findClip(clips,['attack','shoot','slash','cast','swing','fire','hit']);
      if(idle)actions.idle=mixer.clipAction(idle);else state.missingAnims.push('idle');if(run)actions.run=mixer.clipAction(run);else state.missingAnims.push('run');if(attack)actions.attack=mixer.clipAction(attack);else state.missingAnims.push('attack');
      loadedClass=cls;state.ready=true;state.loading=false;lastPX=lastPY=null;hasMotionYaw=false;lastMotionYaw=legacyYaw();modelRoot.rotation.y=lastMotionYaw;switchAnim('idle');toast(String(cls).toUpperCase()+' · PRIMARY 3D ON','#91ffc1');
    }catch(e){if(token!==loadToken)return;state.loading=false;state.ready=false;state.error=String(e&&e.message||e||'3D load error');console.warn('[PPA primary 3D]',cls,e);toast(String(cls).toUpperCase()+' · 3D LOAD ERROR','#ff7b7b')}
  }

  function frame(now){
    requestAnimationFrame(frame);if(!playerReady())return;const cls=currentClass();if(!ENABLED_CLASSES.has(cls)){if(host)host.style.display='none';return}
    if(!state.ready||loadedClass!==cls){if(!state.loading||state.classKey!==cls)loadClass(cls);if(host)host.style.display='none';return}
    const anchor=window.__PPA3D_LOCAL_ANCHOR;if(!anchor||anchor.classKey!==cls||String(anchor.scene)!==String(P.scene)||P.dead||document.hidden){if(host)host.style.display='none';return}
    const view=resizeToGameCanvas();if(!view||!anchorToGround(anchor,view)){if(host)host.style.display='none';return}host.style.display='block';
    const dt=Math.max(0,Math.min(.05,(now-lastAt)/1000));lastAt=now;const moving=sampleMotion(now);switchAnim(desiredAnim(moving));try{if(mixer)mixer.update(dt)}catch(_){}
    try{
      const aimYaw=attackFacingYaw();
      const hasAim=Number.isFinite(aimYaw);
      const target=hasAim?aimYaw:(hasMotionYaw?lastMotionYaw:legacyYaw());
      state.facingSource=hasAim?'attack-target':(hasMotionYaw?'motion':'legacy');if(!hasAim)state.targetId=null;
      const desired=shortestAngle(modelRoot.rotation.y,target),turnSpeed=hasAim?22:12;
      modelRoot.rotation.y+=(desired-modelRoot.rotation.y)*Math.min(1,dt*turnSpeed);state.yawDeg=Math.round(modelRoot.rotation.y*180/Math.PI);
    }catch(_){}
    updateLabels(view);try{renderer.render(scene,camera)}catch(_){}state.frames++;if(now-state.lastFpsAt>=1000){state.fps=Math.round(state.frames*1000/(now-state.lastFpsAt));state.frames=0;state.lastFpsAt=now}
  }

  window.PPA_PRIMARY3D={diag:()=>Object.assign({},state,{anchor:window.__PPA3D_LOCAL_ANCHOR||null,loadedClass,config:CLASS_CONFIG[loadedClass]||null}),enabledClasses:Array.from(ENABLED_CLASSES)};
  requestAnimationFrame(frame);
})();