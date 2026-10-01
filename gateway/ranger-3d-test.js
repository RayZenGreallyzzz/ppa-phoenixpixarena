(function(){
  'use strict';
  if(window.__PPA_RANGER_3D_MAIN_V6)return;
  window.__PPA_RANGER_3D_MAIN_V6=true;

  var VIEW_W=260,VIEW_H=400,RANGER_VISUAL_SCALE=.88;
  var state={enabled:true,ready:false,loading:false,error:'',anim:'',face:null,yawDeg:0,fps:0,frames:0,lastFpsAt:performance.now(),modelUrl:'/game/Ranger_Mobile_Bow_Z90.glb?v=20261001f',hide2D:true,moveSpeed:0,moveDir:4,visualScale:RANGER_VISUAL_SCALE};
  var THREE=null,GLTFLoader=null,renderer=null,scene=null,camera=null,root=null,mixer=null,actions={},host=null,nameEl=null,lastAt=performance.now(),currentAction=null;
  var transparentAtlases={};
  var lastPX=null,lastPY=null,lastMoveSampleAt=0,movingUntil=0,lastMotionYaw=0,hasMotionYaw=false;
  var footX=VIEW_W/2,footY=VIEW_H*.84,headX=VIEW_W/2,headY=VIEW_H*.18,CAMERA_YAW=0;

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
  function currentName(){
    var vals=[];
    try{if(typeof P!=='undefined'&&P)vals.push(P.name,P.playerName,P.nickname)}catch(_){}
    try{if(typeof INV!=='undefined'&&INV)vals.push(INV.playerName,INV.name)}catch(_){}
    try{var s=JSON.parse(localStorage.getItem('pxSave')||'null');if(s)vals.push(s.playerName,s.nickname)}catch(_){}
    try{vals.push(localStorage.getItem('ppaPlayerNameV205'))}catch(_){}
    for(var i=0;i<vals.length;i++){var v=String(vals[i]||'').trim();if(v)return v}
    return'Игрок';
  }
  function toast(text,col){try{if(typeof showPickup==='function')showPickup(text,col||'#91ffc1')}catch(_){} }
  function playerAvailable(){try{return typeof P!=='undefined'&&P&&typeof cam!=='undefined'&&cam&&typeof cv!=='undefined'&&cv&&typeof cameraZoom==='function'}catch(_){return false}}
  function shortestAngle(a,b){var d=(b-a+Math.PI)%(Math.PI*2)-Math.PI;if(d<-Math.PI)d+=Math.PI*2;return a+d}
  function legacyFaceYaw(){
    try{
      var f=Number(P&&P.face),dir=4;
      if(Number.isFinite(f)&&f>=0&&f<=7)dir=Math.round(f);else if(f===8)dir=0;else if(f===-1)dir=6;else if(f===1)dir=2;
      return CAMERA_YAW+(4-dir)*(Math.PI/4);
    }catch(_){return CAMERA_YAW}
  }
  function yawFromVector(dx,dy){return CAMERA_YAW+Math.atan2(dx,dy)}
  function dirForDiag(dx,dy){var a=Math.atan2(dx,-dy);return (Math.round(a/(Math.PI/4))+8)%8}
  function sampleMotion(now){
    try{
      var x=Number(P&&P.x)||0,y=Number(P&&P.y)||0;
      if(lastPX===null||lastPY===null){lastPX=x;lastPY=y;lastMoveSampleAt=now;lastMotionYaw=legacyFaceYaw();hasMotionYaw=true;return false}
      var dt=Math.max(1,now-lastMoveSampleAt),dx=x-lastPX,dy=y-lastPY,d=Math.hypot(dx,dy);
      lastPX=x;lastPY=y;lastMoveSampleAt=now;
      if(d>.015&&d<100){movingUntil=now+150;var raw=yawFromVector(dx,dy);lastMotionYaw=hasMotionYaw?shortestAngle(lastMotionYaw,raw):raw;hasMotionYaw=true;state.moveDir=dirForDiag(dx,dy);state.moveSpeed=d/(dt/1000)}
      else if(now>movingUntil)state.moveSpeed=0;
      return now<movingUntil;
    }catch(_){return false}
  }
  function desiredAnim(moving){try{var a=String(P&&P.anim||'').toLowerCase();if(a.indexOf('attack')>=0)return'attack'}catch(_){}return moving?'run':'idle'}
  function switchAnim(name){
    name=String(name||'idle').toLowerCase();var next=actions[name]||actions.idle;if(!next||next===currentAction)return;
    try{next.enabled=true;next.reset();next.play();if(currentAction)currentAction.crossFadeTo(next,.10,false);currentAction=next;state.anim=name}catch(_){}
  }

  function transparentAtlas(a){
    try{
      var fw=Math.max(1,Math.round(Number(a&&a.fw)||1)),fh=Math.max(1,Math.round(Number(a&&a.fh)||1)),frames=Math.max(1,Math.min(16,Math.round(Number(a&&a.frames)||1)));
      var key=fw+'x'+fh+'x'+frames;if(transparentAtlases[key])return transparentAtlases[key];
      var c=document.createElement('canvas');c.width=fw*frames;c.height=fh*8;try{c.complete=true;c.naturalWidth=c.width;c.naturalHeight=c.height}catch(_){}transparentAtlases[key]=c;return c;
    }catch(_){return null}
  }
  function installHide2D(){
    try{
      if(typeof playerAnimDef!=='function')return false;if(playerAnimDef.__ppaRanger3DHide2D)return true;
      var base=playerAnimDef;
      var fn=function(){
        var a=base.apply(this,arguments);
        if(!state.ready||!state.enabled||currentClass()!=='archer'||!a||!a.img)return a;
        var out={};for(var k in a)out[k]=a[k];var blank=transparentAtlas(a);if(blank)out.img=blank;out.__ppaRanger3DHidden=true;return out;
      };
      fn.__ppaRanger3DHide2D=1;playerAnimDef=fn;try{window.playerAnimDef=fn}catch(_){}return true;
    }catch(_){return false}
  }

  function localCanvasPos(){try{return{x:(Number(P.x)||0)-(Number(cam.x)||0),y:(Number(P.y)||0)-(Number(cam.y)||0)}}catch(_){return{x:-9999,y:-9999}}}
  function darkStyle(v){var s=String(v||'').toLowerCase().replace(/\s+/g,'');return s.indexOf('rgba(0,0,0')===0||s.indexOf('rgb(0,0,0')===0||s==='#000'||s==='#000000'||s.indexOf('rgba(8,')===0||s.indexOf('rgba(12,')===0}
  function shouldSuppressLegacy(){return state.ready&&state.enabled&&currentClass()==='archer'&&playerAvailable()}
  function installLegacyPaintSuppression(){
    try{
      if(typeof cx==='undefined'||!cx||cx.__ppaRanger3DNoLegacyPaint)return !!(cx&&cx.__ppaRanger3DNoLegacyPaint);
      var baseEllipse=cx.ellipse.bind(cx),baseFillText=cx.fillText.bind(cx),baseStrokeText=cx.strokeText.bind(cx);
      cx.ellipse=function(x,y,rx,ry,rot,a0,a1,ccw){
        try{
          if(shouldSuppressLegacy()&&darkStyle(this.fillStyle)){
            var p=localCanvasPos();
            if(Math.abs(Number(x)-p.x)<70&&Math.abs(Number(y)-p.y)<90&&Number(rx)>=8&&Number(rx)<=65&&Number(ry)>=2&&Number(ry)<=28&&Number(ry)<Number(rx)*.72)return;
          }
        }catch(_){}
        return baseEllipse(x,y,rx,ry,rot,a0,a1,ccw);
      };
      function hideOldName(text,x,y){
        try{
          if(!shouldSuppressLegacy())return false;
          var n=currentName(),t=String(text||'').trim();if(!n||t!==n)return false;
          var p=localCanvasPos();return Math.abs(Number(x)-p.x)<120&&Math.abs(Number(y)-p.y)<150;
        }catch(_){return false}
      }
      cx.fillText=function(text,x,y,maxWidth){if(hideOldName(text,x,y))return;return maxWidth===undefined?baseFillText(text,x,y):baseFillText(text,x,y,maxWidth)};
      cx.strokeText=function(text,x,y,maxWidth){if(hideOldName(text,x,y))return;return maxWidth===undefined?baseStrokeText(text,x,y):baseStrokeText(text,x,y,maxWidth)};
      cx.__ppaRanger3DNoLegacyPaint=true;return true;
    }catch(_){return false}
  }

  function updateAnchorProjection(){
    if(!THREE||!camera)return;
    try{
      camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
      var fp=new THREE.Vector3(0,0,0).project(camera),hp=new THREE.Vector3(0,2.52,0).project(camera);
      footX=(fp.x*.5+.5)*VIEW_W;footY=(-fp.y*.5+.5)*VIEW_H;headX=(hp.x*.5+.5)*VIEW_W;headY=(-hp.y*.5+.5)*VIEW_H;
    }catch(_){}
  }
  function placeHost(){
    if(!host||!renderer||!playerAvailable())return false;
    try{
      var rect=cv.getBoundingClientRect();if(!rect.width||!rect.height)return false;
      var z=Math.max(.1,Number(cameraZoom())||1),kx=rect.width/Math.max(1,cv.width),ky=rect.height/Math.max(1,cv.height);
      var sx=((Number(P.x)||0)-(Number(cam.x)||0))*z,sy=((Number(P.y)||0)-(Number(cam.y)||0))*z;
      var x=rect.left+sx*kx,y=rect.top+sy*ky;
      var baseScale=Math.max(.32,Math.min(.80,.46*z*Math.max(kx,ky))),visualScale=baseScale*RANGER_VISUAL_SCALE;
      host.style.left=x+'px';host.style.top=y+'px';
      var el=renderer.domElement;el.style.left=(-footX*visualScale)+'px';el.style.top=(-footY*visualScale)+'px';el.style.width=(VIEW_W*visualScale)+'px';el.style.height=(VIEW_H*visualScale)+'px';
      if(nameEl){nameEl.textContent=currentName();nameEl.style.left=((headX-footX)*visualScale)+'px';nameEl.style.top=((headY-footY)*visualScale-10)+'px'}
      return x>rect.left-220&&x<rect.right+220&&y>rect.top-320&&y<rect.bottom+180;
    }catch(_){return false}
  }

  async function init3D(){
    if(state.loading||state.ready)return;state.loading=true;
    try{
      THREE=await import('https://esm.sh/three@0.180.0');var lm=await import('https://esm.sh/three@0.180.0/examples/jsm/loaders/GLTFLoader.js');GLTFLoader=lm.GLTFLoader;
      host=document.createElement('div');host.id='ppaRanger3DMainLayer';host.style.cssText='position:fixed;width:1px;height:1px;left:-999px;top:-999px;pointer-events:none;z-index:4;overflow:visible;contain:none;';document.body.appendChild(host);
      renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'high-performance'});renderer.setPixelRatio(1);renderer.setSize(VIEW_W,VIEW_H,false);renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.18;
      renderer.domElement.style.cssText='position:absolute;display:block;pointer-events:none;max-width:none;max-height:none;filter:saturate(1.28) contrast(1.06) brightness(1.04);';host.appendChild(renderer.domElement);
      nameEl=document.createElement('div');nameEl.id='ppaRanger3DName';nameEl.style.cssText='position:absolute;transform:translate(-50%,-100%);white-space:nowrap;font:600 11px Georgia,serif;color:#f2d39a;text-shadow:-1px -1px 0 rgba(18,8,5,.92),1px -1px 0 rgba(18,8,5,.92),-1px 1px 0 rgba(18,8,5,.92),1px 1px 0 rgba(18,8,5,.92);pointer-events:none;z-index:2;';host.appendChild(nameEl);

      scene=new THREE.Scene();var halfH=2.55,halfW=halfH*(VIEW_W/VIEW_H);camera=new THREE.OrthographicCamera(-halfW,halfW,halfH,-halfH,.01,60);camera.position.set(4.4,6.6,8.0);camera.lookAt(0,1.00,0);camera.updateProjectionMatrix();CAMERA_YAW=Math.atan2(camera.position.x,camera.position.z);
      scene.add(new THREE.HemisphereLight(0xfff7ea,0x263451,1.55));var sun=new THREE.DirectionalLight(0xfff0cf,3.10);sun.position.set(4.5,8.0,5.5);scene.add(sun);var fill=new THREE.DirectionalLight(0x9ec8ff,.82);fill.position.set(-4.0,3.5,2.5);scene.add(fill);

      root=new THREE.Group();scene.add(root);var gltf=await new GLTFLoader().loadAsync(state.modelUrl);var model=gltf.scene;root.add(model);
      var box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());var sc=2.34/Math.max(.001,size.y);model.scale.setScalar(sc);model.position.set(-center.x*sc,-box.min.y*sc,-center.z*sc);
      mixer=new THREE.AnimationMixer(model);(gltf.animations||[]).forEach(function(clip){var n=String(clip.name||'').toLowerCase();if(n.indexOf('idle')>=0&&!actions.idle)actions.idle=mixer.clipAction(clip);else if(n.indexOf('run')>=0&&!actions.run)actions.run=mixer.clipAction(clip);else if(n.indexOf('attack')>=0&&!actions.attack)actions.attack=mixer.clipAction(clip)});
      lastMotionYaw=legacyFaceYaw();hasMotionYaw=true;root.rotation.y=lastMotionYaw;switchAnim('idle');updateAnchorProjection();
      state.ready=true;state.loading=false;installHide2D();installLegacyPaintSuppression();toast('RANGER 3D MAIN · ON','#91ffc1');requestAnimationFrame(frame);
    }catch(e){state.loading=false;state.error=String(e&&e.message||e||'3D load error');console.warn('[PPA Ranger 3D]',e);toast('RANGER 3D · LOAD ERROR','#ff7b7b')}
  }

  function frame(now){
    if(!state.ready)return;var dt=Math.max(0,Math.min(.05,(now-lastAt)/1000));lastAt=now;state.frames++;if(now-state.lastFpsAt>=1000){state.fps=Math.round(state.frames*1000/(now-state.lastFpsAt));state.frames=0;state.lastFpsAt=now}
    installHide2D();installLegacyPaintSuppression();var moving=sampleMotion(now),isArcher=currentClass()==='archer';var visible=isArcher&&state.enabled&&playerAvailable()&&!(P&&P.dead)&&placeHost()&&!document.hidden;if(host)host.style.display=visible?'block':'none';
    if(visible){switchAnim(desiredAnim(moving));try{if(mixer)mixer.update(dt)}catch(_){}try{var target=hasMotionYaw?lastMotionYaw:legacyFaceYaw(),desired=shortestAngle(root.rotation.y,target);root.rotation.y+=(desired-root.rotation.y)*Math.min(1,dt*12);state.yawDeg=Math.round(root.rotation.y*180/Math.PI);state.face=state.moveDir}catch(_){}try{renderer.render(scene,camera)}catch(_){}}
    requestAnimationFrame(frame);
  }

  function boot(){installHide2D();installLegacyPaintSuppression();if(currentClass()==='archer'&&playerAvailable()){init3D();return}setTimeout(boot,400)}
  window.PPA_RANGER3D={enable:function(v){state.enabled=v!==false;if(host)host.style.display=state.enabled?'block':'none';return state.enabled},toggle:function(){state.enabled=!state.enabled;if(host)host.style.display=state.enabled?'block':'none';return state.enabled},diag:function(){return Object.assign({},state,{classKey:currentClass(),playerReady:playerAvailable(),movingUntil:movingUntil,lastPX:lastPX,lastPY:lastPY,footX:footX,footY:footY,headX:headX,headY:headY,lastMotionYaw:lastMotionYaw,cameraYaw:CAMERA_YAW})}};
  window.PPA_RANGER_3D_DIAG=function(){return window.PPA_RANGER3D.diag()};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
