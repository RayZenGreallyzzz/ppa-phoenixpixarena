(function(){
  'use strict';
  if(window.__PPA_PRIMARY_3D_V1)return;
  window.__PPA_PRIMARY_3D_V1=true;

  const ENABLED_CLASSES=new Set(['archer']);
  const MODELS={archer:'/game/Ranger_Mobile_Bow_Z90.glb?v=20261001h'};
  const VISUAL_SCALE={archer:.88};
  const MODEL_HEIGHT=2.34;
  const PX_PER_UNIT=34;

  let THREE=null,GLTFLoader=null,renderer=null,scene=null,camera=null,host=null,nameEl=null;
  let modelRoot=null,model=null,mixer=null,actions={},currentAction=null,loadedClass='';
  let lastAt=performance.now(),lastPX=null,lastPY=null,movingUntil=0,lastMotionYaw=0,hasMotionYaw=false;
  let cameraYaw=0,lastRectW=0,lastRectH=0;
  const state={ready:false,loading:false,error:'',anim:'idle',fps:0,frames:0,lastFpsAt:performance.now(),classKey:'',yawDeg:0};

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
  function playerReady(){
    try{return typeof P!=='undefined'&&P&&typeof cv!=='undefined'&&cv&&typeof cameraZoom==='function'}catch(_){return false}
  }
  function toast(t,c){try{if(typeof showPickup==='function')showPickup(t,c||'#91ffc1')}catch(_){} }
  function shortestAngle(a,b){
    let d=(b-a+Math.PI)%(Math.PI*2)-Math.PI;
    if(d<-Math.PI)d+=Math.PI*2;
    return a+d;
  }
  function legacyYaw(){
    try{
      let f=Number(P&&P.face),dir=4;
      if(Number.isFinite(f)&&f>=0&&f<=7)dir=Math.round(f);else if(f===8)dir=0;else if(f===-1)dir=6;else if(f===1)dir=2;
      return cameraYaw+(4-dir)*(Math.PI/4);
    }catch(_){return cameraYaw}
  }
  function sampleMotion(now){
    try{
      const x=Number(P.x)||0,y=Number(P.y)||0;
      if(lastPX===null||lastPY===null){lastPX=x;lastPY=y;lastMotionYaw=legacyYaw();hasMotionYaw=true;return false}
      const dx=x-lastPX,dy=y-lastPY,d=Math.hypot(dx,dy);
      lastPX=x;lastPY=y;
      if(d>.015&&d<100){
        movingUntil=now+150;
        const raw=cameraYaw+Math.atan2(dx,dy);
        lastMotionYaw=hasMotionYaw?shortestAngle(lastMotionYaw,raw):raw;
        hasMotionYaw=true;
      }
      return now<movingUntil;
    }catch(_){return false}
  }
  function desiredAnim(moving){
    try{const a=String(P&&P.anim||'').toLowerCase();if(a.includes('attack'))return'attack'}catch(_){}
    return moving?'run':'idle';
  }
  function switchAnim(name){
    const next=actions[name]||actions.idle;
    if(!next||next===currentAction)return;
    try{
      next.enabled=true;next.reset();next.play();
      if(currentAction)currentAction.crossFadeTo(next,.10,false);
      currentAction=next;state.anim=name;
    }catch(_){}
  }

  function ensureHost(){
    if(host)return;
    host=document.createElement('div');
    host.id='ppaPrimary3DLayer';
    host.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;pointer-events:none;overflow:visible;z-index:4;contain:layout style;';
    document.body.appendChild(host);
    nameEl=document.createElement('div');
    nameEl.id='ppaPrimary3DName';
    nameEl.style.cssText='position:absolute;transform:translate(-50%,-100%);white-space:nowrap;font:600 11px Georgia,serif;color:#f2d39a;text-shadow:-1px -1px 0 rgba(18,8,5,.92),1px -1px 0 rgba(18,8,5,.92),-1px 1px 0 rgba(18,8,5,.92),1px 1px 0 rgba(18,8,5,.92);pointer-events:none;z-index:2;';
    host.appendChild(nameEl);
  }
  function resizeToGameCanvas(){
    if(!renderer||!camera||typeof cv==='undefined'||!cv)return null;
    const r=cv.getBoundingClientRect();
    if(!(r.width>2&&r.height>2))return null;
    host.style.left=r.left+'px';host.style.top=r.top+'px';host.style.width=r.width+'px';host.style.height=r.height+'px';
    if(Math.abs(lastRectW-r.width)>.5||Math.abs(lastRectH-r.height)>.5){
      lastRectW=r.width;lastRectH=r.height;
      renderer.setSize(Math.max(2,Math.round(r.width)),Math.max(2,Math.round(r.height)),false);
      renderer.domElement.style.width=r.width+'px';renderer.domElement.style.height=r.height+'px';
      const frustumH=r.height/PX_PER_UNIT,aspect=r.width/r.height;
      camera.left=-frustumH*aspect/2;camera.right=frustumH*aspect/2;camera.top=frustumH/2;camera.bottom=-frustumH/2;camera.updateProjectionMatrix();
    }
    return r;
  }
  function anchorToGround(anchor,rect){
    if(!THREE||!camera||!modelRoot||!anchor||!rect)return false;
    const z=Math.max(.1,Number(anchor.zoom)||1);
    const kx=rect.width/Math.max(1,Number(cv.width)||rect.width),ky=rect.height/Math.max(1,Number(cv.height)||rect.height);
    const px=Number(anchor.x)*z*kx,py=Number(anchor.y)*z*ky;
    if(!Number.isFinite(px)||!Number.isFinite(py))return false;
    const ndc=new THREE.Vector2(px/rect.width*2-1,1-py/rect.height*2);
    const ray=new THREE.Raycaster();ray.setFromCamera(ndc,camera);
    const hit=new THREE.Vector3();
    if(!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),hit))return false;
    modelRoot.position.copy(hit);
    const cls=loadedClass||'archer';
    const s=(VISUAL_SCALE[cls]||1)*z;
    modelRoot.scale.setScalar(s);
    return true;
  }
  function updateName(rect){
    if(!nameEl||!modelRoot||!camera||!THREE||!rect)return;
    try{
      const cls=loadedClass||'archer',z=Math.max(.1,Number((window.__PPA3D_LOCAL_ANCHOR||{}).zoom)||1);
      const h=(MODEL_HEIGHT*(VISUAL_SCALE[cls]||1)*z)+.30;
      const p=new THREE.Vector3(modelRoot.position.x,h,modelRoot.position.z).project(camera);
      nameEl.textContent=currentName();
      nameEl.style.left=((p.x*.5+.5)*rect.width)+'px';
      nameEl.style.top=((-p.y*.5+.5)*rect.height-8)+'px';
      nameEl.style.display='block';
    }catch(_){nameEl.style.display='none'}
  }

  async function loadClass(cls){
    if(state.loading||loadedClass===cls&&state.ready||!MODELS[cls])return;
    state.loading=true;state.error='';
    try{
      if(!THREE){
        THREE=await import('https://esm.sh/three@0.180.0');
        const lm=await import('https://esm.sh/three@0.180.0/examples/jsm/loaders/GLTFLoader.js');GLTFLoader=lm.GLTFLoader;
        ensureHost();
        renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'high-performance'});
        renderer.setPixelRatio(1);renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
        renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
        renderer.domElement.style.cssText='position:absolute;left:0;top:0;display:block;pointer-events:none;filter:saturate(1.28) contrast(1.06) brightness(1.04);';
        host.insertBefore(renderer.domElement,nameEl);
        scene=new THREE.Scene();
        camera=new THREE.OrthographicCamera(-10,10,10,-10,.01,100);
        camera.position.set(5.0,7.4,9.0);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
        cameraYaw=Math.atan2(camera.position.x,camera.position.z);
        scene.add(new THREE.HemisphereLight(0xfff7ea,0x263451,1.55));
        const sun=new THREE.DirectionalLight(0xfff0cf,3.10);sun.position.set(4.5,8.0,5.5);scene.add(sun);
        const fill=new THREE.DirectionalLight(0x9ec8ff,.82);fill.position.set(-4.0,3.5,2.5);scene.add(fill);
      }
      if(modelRoot){scene.remove(modelRoot);modelRoot=null;model=null;mixer=null;actions={};currentAction=null}
      const gltf=await new GLTFLoader().loadAsync(MODELS[cls]);
      modelRoot=new THREE.Group();scene.add(modelRoot);model=gltf.scene;modelRoot.add(model);
      const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
      const sc=MODEL_HEIGHT/Math.max(.001,size.y);model.scale.setScalar(sc);model.position.set(-center.x*sc,-box.min.y*sc,-center.z*sc);
      mixer=new THREE.AnimationMixer(model);
      for(const clip of (gltf.animations||[])){
        const n=String(clip.name||'').toLowerCase();
        if(n.includes('idle')&&!actions.idle)actions.idle=mixer.clipAction(clip);
        else if(n.includes('run')&&!actions.run)actions.run=mixer.clipAction(clip);
        else if(n.includes('attack')&&!actions.attack)actions.attack=mixer.clipAction(clip);
      }
      loadedClass=cls;state.classKey=cls;state.ready=true;state.loading=false;
      lastPX=lastPY=null;hasMotionYaw=false;lastMotionYaw=legacyYaw();modelRoot.rotation.y=lastMotionYaw;
      switchAnim('idle');toast('RANGER · PRIMARY 3D ON','#91ffc1');
    }catch(e){state.loading=false;state.error=String(e&&e.message||e||'3D load error');console.warn('[PPA primary 3D]',e);toast('PRIMARY 3D · LOAD ERROR','#ff7b7b')}
  }

  function frame(now){
    requestAnimationFrame(frame);
    if(!playerReady())return;
    const cls=currentClass();
    if(!ENABLED_CLASSES.has(cls)){if(host)host.style.display='none';return}
    if(!state.ready||loadedClass!==cls){loadClass(cls);if(host)host.style.display='none';return}
    const anchor=window.__PPA3D_LOCAL_ANCHOR;
    if(!anchor||anchor.classKey!==cls||String(anchor.scene)!==String(P.scene)||P.dead||document.hidden){if(host)host.style.display='none';return}
    const rect=resizeToGameCanvas();if(!rect||!anchorToGround(anchor,rect)){if(host)host.style.display='none';return}
    host.style.display='block';
    const dt=Math.max(0,Math.min(.05,(now-lastAt)/1000));lastAt=now;
    const moving=sampleMotion(now);switchAnim(desiredAnim(moving));
    try{if(mixer)mixer.update(dt)}catch(_){}
    try{
      const target=hasMotionYaw?lastMotionYaw:legacyYaw(),desired=shortestAngle(modelRoot.rotation.y,target);
      modelRoot.rotation.y+=(desired-modelRoot.rotation.y)*Math.min(1,dt*12);state.yawDeg=Math.round(modelRoot.rotation.y*180/Math.PI);
    }catch(_){}
    updateName(rect);
    try{renderer.render(scene,camera)}catch(_){}
    state.frames++;if(now-state.lastFpsAt>=1000){state.fps=Math.round(state.frames*1000/(now-state.lastFpsAt));state.frames=0;state.lastFpsAt=now}
  }

  window.PPA_PRIMARY3D={diag:()=>Object.assign({},state,{anchor:window.__PPA3D_LOCAL_ANCHOR||null}),enabledClasses:Array.from(ENABLED_CLASSES)};
  requestAnimationFrame(frame);
})();
