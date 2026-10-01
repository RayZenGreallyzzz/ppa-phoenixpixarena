(function(){
  'use strict';
  if(window.__PPA_RANGER_3D_TEST_V4)return;
  window.__PPA_RANGER_3D_TEST_V4=true;

  var VIEW_W=240,VIEW_H=360;
  var state={enabled:true,ready:false,loading:false,error:'',anim:'',face:null,yawDeg:0,fps:0,frames:0,lastFpsAt:performance.now(),modelUrl:'/game/Ranger_Mobile_Bow_Z90.glb?v=20261001d',hide2D:true,moveSpeed:0,moveDir:4};
  var THREE=null,GLTFLoader=null,renderer=null,scene=null,camera=null,root=null,mixer=null,actions={},host=null,lastAt=performance.now(),currentAction=null;
  var transparentAtlases={};
  var lastPX=null,lastPY=null,lastMoveSampleAt=0,movingUntil=0,lastMotionYaw=0,hasMotionYaw=false,footX=VIEW_W/2,footY=VIEW_H*.84;

  function normalizeClass(v){
    var s=String(v||'').trim(),l=s.toLowerCase();
    if(['tank','barbarian','paladin','gnome','archer','mage','assassin','priest'].includes(l))return l;
    try{if(typeof classKeyFromName==='function'){var k=classKeyFromName(s);if(k)return String(k).toLowerCase()}}catch(_){}
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
    var vals=[];
    try{if(typeof P!=='undefined'&&P)vals.push(P.classKey,P.cls,P.className,P._saved&&P._saved.cls)}catch(_){}
    try{if(typeof INV!=='undefined'&&INV)vals.push(INV.classKey,INV.cls,INV.className)}catch(_){}
    try{var s=JSON.parse(localStorage.getItem('pxSave')||'null');if(s)vals.push(s.classKey,s.cls,s.className)}catch(_){}
    for(var i=0;i<vals.length;i++){var k=normalizeClass(vals[i]);if(k)return k}
    return'';
  }
  function toast(text,col){try{if(typeof showPickup==='function')showPickup(text,col||'#91ffc1')}catch(_){} }
  function playerAvailable(){try{return typeof P!=='undefined'&&P&&typeof cam!=='undefined'&&cam&&typeof cv!=='undefined'&&cv&&typeof cameraZoom==='function'}catch(_){return false}}

  function shortestAngle(a,b){
    var d=(b-a+Math.PI)%(Math.PI*2)-Math.PI;
    if(d<-Math.PI)d+=Math.PI*2;
    return a+d;
  }
  function legacyFaceYaw(){
    try{
      var f=Number(P&&P.face),dir=4;
      if(Number.isFinite(f)&&f>=0&&f<=7)dir=Math.round(f);
      else if(f===8)dir=0;
      else if(f===-1)dir=6;
      else if(f===1)dir=2;
      return (dir-4)*(Math.PI/4);
    }catch(_){return 0}
  }
  function yawFromVector(dx,dy){
    // Default model forward is screen-down. Use the real analog movement angle,
    // never round to one of eight sprite directions.
    return Math.atan2(dx,-dy)-Math.PI;
  }
  function dirForDiag(yaw){
    return ((Math.round((yaw+Math.PI)/(Math.PI/4))+4)%8+8)%8;
  }
  function sampleMotion(now){
    try{
      var x=Number(P&&P.x)||0,y=Number(P&&P.y)||0;
      if(lastPX===null||lastPY===null){
        lastPX=x;lastPY=y;lastMoveSampleAt=now;
        lastMotionYaw=legacyFaceYaw();hasMotionYaw=true;
        return false;
      }
      var dt=Math.max(1,now-lastMoveSampleAt),dx=x-lastPX,dy=y-lastPY,d=Math.hypot(dx,dy);
      lastPX=x;lastPY=y;lastMoveSampleAt=now;
      if(d>.015&&d<100){
        movingUntil=now+150;
        var raw=yawFromVector(dx,dy);
        lastMotionYaw=hasMotionYaw?shortestAngle(lastMotionYaw,raw):raw;
        hasMotionYaw=true;
        state.moveDir=dirForDiag(lastMotionYaw);
        state.moveSpeed=d/(dt/1000);
      }else if(now>movingUntil){
        state.moveSpeed=0;
      }
      return now<movingUntil;
    }catch(_){return false}
  }
  function desiredAnim(moving){
    try{
      var a=String(P&&P.anim||'').toLowerCase();
      if(a.indexOf('attack')>=0)return'attack';
    }catch(_){}
    return moving?'run':'idle';
  }
  function switchAnim(name){
    name=String(name||'idle').toLowerCase();
    var next=actions[name]||actions.idle;
    if(!next||next===currentAction)return;
    try{
      next.enabled=true;next.reset();next.play();
      if(currentAction)currentAction.crossFadeTo(next,.10,false);
      currentAction=next;state.anim=name;
    }catch(_){}
  }

  function transparentAtlas(a){
    try{
      var fw=Math.max(1,Math.round(Number(a&&a.fw)||1));
      var fh=Math.max(1,Math.round(Number(a&&a.fh)||1));
      var frames=Math.max(1,Math.min(16,Math.round(Number(a&&a.frames)||1)));
      var key=fw+'x'+fh+'x'+frames;
      if(transparentAtlases[key])return transparentAtlases[key];
      var c=document.createElement('canvas');c.width=fw*frames;c.height=fh*8;
      try{c.complete=true;c.naturalWidth=c.width;c.naturalHeight=c.height}catch(_){}
      transparentAtlases[key]=c;return c;
    }catch(_){return null}
  }
  function installHide2D(){
    try{
      if(typeof playerAnimDef!=='function')return false;
      if(playerAnimDef.__ppaRanger3DHide2D)return true;
      var base=playerAnimDef;
      var fn=function(){
        var a=base.apply(this,arguments);
        if(!state.hide2D||!state.ready||!state.enabled||currentClass()!=='archer'||!a||!a.img)return a;
        var out={};for(var k in a)out[k]=a[k];
        var blank=transparentAtlas(a);if(blank)out.img=blank;
        out.__ppaRanger3DHidden=true;return out;
      };
      fn.__ppaRanger3DHide2D=1;playerAnimDef=fn;try{window.playerAnimDef=fn}catch(_){}
      return true;
    }catch(_){return false}
  }

  function updateFootProjection(){
    if(!THREE||!camera)return;
    try{
      camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
      var p=new THREE.Vector3(0,0,0).project(camera);
      footX=(p.x*.5+.5)*VIEW_W;
      footY=(-p.y*.5+.5)*VIEW_H;
    }catch(_){}
  }
  function placeHost(){
    if(!host||!renderer||!playerAvailable())return false;
    try{
      var rect=cv.getBoundingClientRect();if(!rect.width||!rect.height)return false;
      var z=Math.max(.1,Number(cameraZoom())||1);
      var kx=rect.width/Math.max(1,cv.width),ky=rect.height/Math.max(1,cv.height);
      var sx=((Number(P.x)||0)-(Number(cam.x)||0))*z;
      var sy=((Number(P.y)||0)-(Number(cam.y)||0))*z;
      var x=rect.left+sx*kx,y=rect.top+sy*ky;
      var visualScale=Math.max(.32,Math.min(.78,.44*z*Math.max(kx,ky)));
      host.style.left=x+'px';host.style.top=y+'px';
      var el=renderer.domElement;
      el.style.left=(-footX*visualScale)+'px';
      el.style.top=(-footY*visualScale)+'px';
      el.style.width=(VIEW_W*visualScale)+'px';
      el.style.height=(VIEW_H*visualScale)+'px';
      return x>rect.left-200&&x<rect.right+200&&y>rect.top-280&&y<rect.bottom+160;
    }catch(_){return false}
  }

  async function init3D(){
    if(state.loading||state.ready)return;state.loading=true;
    try{
      THREE=await import('https://esm.sh/three@0.180.0');
      var lm=await import('https://esm.sh/three@0.180.0/examples/jsm/loaders/GLTFLoader.js');GLTFLoader=lm.GLTFLoader;

      host=document.createElement('div');host.id='ppaRanger3DTestLayer';
      host.style.cssText='position:fixed;width:1px;height:1px;left:-999px;top:-999px;pointer-events:none;z-index:4;overflow:visible;contain:none;';
      document.body.appendChild(host);

      renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'high-performance'});
      renderer.setPixelRatio(1);renderer.setSize(VIEW_W,VIEW_H,false);renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure=1.18;
      renderer.domElement.style.cssText='position:absolute;display:block;pointer-events:none;max-width:none;max-height:none;filter:saturate(1.28) contrast(1.06) brightness(1.04);';
      host.appendChild(renderer.domElement);

      scene=new THREE.Scene();
      var halfH=2.25,halfW=halfH*(VIEW_W/VIEW_H);
      camera=new THREE.OrthographicCamera(-halfW,halfW,halfH,-halfH,.01,50);
      camera.position.set(0,3.55,8.2);camera.lookAt(0,1.12,0);camera.updateProjectionMatrix();

      scene.add(new THREE.HemisphereLight(0xfff7ea,0x263451,1.55));
      var sun=new THREE.DirectionalLight(0xfff0cf,3.10);sun.position.set(3.8,7.0,5.8);scene.add(sun);
      var fill=new THREE.DirectionalLight(0x9ec8ff,.78);fill.position.set(-4.0,3.0,3.0);scene.add(fill);

      root=new THREE.Group();scene.add(root);
      var gltf=await new GLTFLoader().loadAsync(state.modelUrl);
      var model=gltf.scene;root.add(model);
      var box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
      var sc=2.34/Math.max(.001,size.y);model.scale.setScalar(sc);model.position.set(-center.x*sc,-box.min.y*sc,-center.z*sc);

      mixer=new THREE.AnimationMixer(model);
      (gltf.animations||[]).forEach(function(clip){
        var n=String(clip.name||'').toLowerCase();
        if(n.indexOf('idle')>=0&&!actions.idle)actions.idle=mixer.clipAction(clip);
        else if(n.indexOf('run')>=0&&!actions.run)actions.run=mixer.clipAction(clip);
        else if(n.indexOf('attack')>=0&&!actions.attack)actions.attack=mixer.clipAction(clip);
      });
      lastMotionYaw=legacyFaceYaw();hasMotionYaw=true;root.rotation.y=lastMotionYaw;
      switchAnim('idle');updateFootProjection();
      state.ready=true;state.loading=false;installHide2D();toast('RANGER 3D 360/COLOR TEST · ON','#91ffc1');requestAnimationFrame(frame);
    }catch(e){
      state.loading=false;state.error=String(e&&e.message||e||'3D load error');console.warn('[PPA Ranger 3D]',e);toast('RANGER 3D · LOAD ERROR','#ff7b7b');
    }
  }

  function frame(now){
    if(!state.ready)return;
    var dt=Math.max(0,Math.min(.05,(now-lastAt)/1000));lastAt=now;
    state.frames++;if(now-state.lastFpsAt>=1000){state.fps=Math.round(state.frames*1000/(now-state.lastFpsAt));state.frames=0;state.lastFpsAt=now}
    installHide2D();
    var moving=sampleMotion(now);
    var isArcher=currentClass()==='archer';
    var visible=isArcher&&state.enabled&&playerAvailable()&&!(P&&P.dead)&&placeHost()&&!document.hidden;
    if(host)host.style.display=visible?'block':'none';
    if(visible){
      switchAnim(desiredAnim(moving));
      try{if(mixer)mixer.update(dt)}catch(_){}
      try{
        var target=hasMotionYaw?lastMotionYaw:legacyFaceYaw();
        var desired=shortestAngle(root.rotation.y,target);
        root.rotation.y+=(desired-root.rotation.y)*Math.min(1,dt*12);
        state.yawDeg=Math.round(root.rotation.y*180/Math.PI);
        state.face=state.moveDir;
      }catch(_){}
      try{renderer.render(scene,camera)}catch(_){}
    }
    requestAnimationFrame(frame);
  }

  function boot(){installHide2D();if(currentClass()==='archer'&&playerAvailable()){init3D();return}setTimeout(boot,400)}
  window.PPA_RANGER3D={
    enable:function(v){state.enabled=v!==false;if(host)host.style.display=state.enabled?'block':'none';return state.enabled},
    toggle:function(){state.enabled=!state.enabled;if(host)host.style.display=state.enabled?'block':'none';return state.enabled},
    show2D:function(v){state.hide2D=v===false;return !state.hide2D},
    diag:function(){return Object.assign({},state,{classKey:currentClass(),playerReady:playerAvailable(),movingUntil:movingUntil,lastPX:lastPX,lastPY:lastPY,footX:footX,footY:footY,lastMotionYaw:lastMotionYaw})}
  };
  window.PPA_RANGER_3D_DIAG=function(){return window.PPA_RANGER3D.diag()};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
