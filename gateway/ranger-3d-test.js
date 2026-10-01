(function(){
  'use strict';
  if(window.__PPA_RANGER_3D_TEST_V1)return;
  window.__PPA_RANGER_3D_TEST_V1=true;

  var state={enabled:true,ready:false,loading:false,error:'',anim:'',face:null,fps:0,frames:0,lastFpsAt:performance.now(),modelUrl:'/game/Ranger_Mobile_Bow_Z90.glb?v=20261001a'};
  var THREE=null,GLTFLoader=null,renderer=null,scene=null,camera=null,root=null,mixer=null,actions={},host=null,lastAt=performance.now(),currentAction=null;

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

  function toast(text,col){
    try{if(typeof showPickup==='function')showPickup(text,col||'#91ffc1')}catch(_){}
  }

  function playerAvailable(){
    try{return typeof P!=='undefined'&&P&&typeof cam!=='undefined'&&cam&&typeof cv!=='undefined'&&cv&&typeof cameraZoom==='function'}catch(_){return false}
  }

  function faceDir(){
    try{
      var f=Number(P&&P.face);
      if(f===-1)return 6;
      if(f===1)return 2;
      if(f===8)return 0;
      if(Number.isFinite(f)&&f>=0&&f<=7)return Math.round(f);
    }catch(_){}
    return 4;
  }

  function desiredAnim(){
    try{
      var a=String(P&&P.anim||'').toLowerCase();
      if(a.indexOf('attack')>=0)return'attack';
      if(a==='run'||a.indexOf('walk')>=0||a.indexOf('move')>=0)return'run';
    }catch(_){}
    return'idle';
  }

  function switchAnim(name){
    name=String(name||'idle').toLowerCase();
    var next=actions[name]||actions.idle;
    if(!next||next===currentAction)return;
    try{
      next.enabled=true;next.reset();next.play();
      if(currentAction)currentAction.crossFadeTo(next,.12,false);
      currentAction=next;state.anim=name;
    }catch(_){}
  }

  function shortestAngle(a,b){
    var d=(b-a+Math.PI)%(Math.PI*2)-Math.PI;
    if(d<-Math.PI)d+=Math.PI*2;
    return a+d;
  }

  function placeHost(){
    if(!host||!playerAvailable())return false;
    try{
      var rect=cv.getBoundingClientRect();
      if(!rect.width||!rect.height)return false;
      var z=Math.max(.1,Number(cameraZoom())||1);
      var kx=rect.width/Math.max(1,cv.width),ky=rect.height/Math.max(1,cv.height);
      var sx=((Number(P.x)||0)-(Number(cam.x)||0))*z;
      var sy=((Number(P.y)||0)-(Number(cam.y)||0))*z;
      var x=rect.left+sx*kx,y=rect.top+sy*ky;
      var zoomScale=Math.max(.72,Math.min(1.45,z*Math.max(kx,ky)*1.75));
      host.style.left=x+'px';host.style.top=y+'px';
      host.style.transform='translate(-50%,-82%) scale('+zoomScale.toFixed(3)+')';
      return x>rect.left-160&&x<rect.right+160&&y>rect.top-220&&y<rect.bottom+120;
    }catch(_){return false}
  }

  async function init3D(){
    if(state.loading||state.ready)return;
    state.loading=true;
    try{
      THREE=await import('https://esm.sh/three@0.180.0');
      var lm=await import('https://esm.sh/three@0.180.0/examples/jsm/loaders/GLTFLoader.js');
      GLTFLoader=lm.GLTFLoader;

      host=document.createElement('div');
      host.id='ppaRanger3DTestLayer';
      host.style.cssText='position:fixed;width:118px;height:156px;left:-999px;top:-999px;pointer-events:none;z-index:4;transform-origin:50% 82%;overflow:visible;contain:layout style paint;';
      document.body.appendChild(host);

      renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,powerPreference:'high-performance'});
      renderer.setPixelRatio(1);
      renderer.setSize(118,156,false);
      renderer.setClearColor(0x000000,0);
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.domElement.style.width='118px';renderer.domElement.style.height='156px';renderer.domElement.style.display='block';
      host.appendChild(renderer.domElement);

      scene=new THREE.Scene();
      camera=new THREE.PerspectiveCamera(28,118/156,.01,50);
      camera.position.set(0,1.25,5.25);camera.lookAt(0,1.12,0);
      scene.add(new THREE.HemisphereLight(0xffffff,0x29314a,2.35));
      var sun=new THREE.DirectionalLight(0xffffff,2.7);sun.position.set(3,6,5);scene.add(sun);

      root=new THREE.Group();scene.add(root);
      var gltf=await new GLTFLoader().loadAsync(state.modelUrl);
      var model=gltf.scene;root.add(model);
      var box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
      var sc=2.34/Math.max(.001,size.y);
      model.scale.setScalar(sc);
      model.position.set(-center.x*sc,-box.min.y*sc,-center.z*sc);

      mixer=new THREE.AnimationMixer(model);
      (gltf.animations||[]).forEach(function(clip){
        var n=String(clip.name||'').toLowerCase();
        if(n.indexOf('idle')>=0&&!actions.idle)actions.idle=mixer.clipAction(clip);
        else if(n.indexOf('run')>=0&&!actions.run)actions.run=mixer.clipAction(clip);
        else if(n.indexOf('attack')>=0&&!actions.attack)actions.attack=mixer.clipAction(clip);
      });
      switchAnim('idle');
      state.ready=true;state.loading=false;
      toast('RANGER 3D TEST · ON','#91ffc1');
      requestAnimationFrame(frame);
    }catch(e){
      state.loading=false;state.error=String(e&&e.message||e||'3D load error');
      console.warn('[PPA Ranger 3D]',e);toast('RANGER 3D · LOAD ERROR','#ff7b7b');
    }
  }

  function frame(now){
    if(!state.ready)return;
    var dt=Math.max(0,Math.min(.05,(now-lastAt)/1000));lastAt=now;
    state.frames++;
    if(now-state.lastFpsAt>=1000){state.fps=Math.round(state.frames*1000/(now-state.lastFpsAt));state.frames=0;state.lastFpsAt=now}

    var isArcher=currentClass()==='archer';
    var visible=isArcher&&state.enabled&&playerAvailable()&&!(P&&P.dead)&&placeHost()&&!document.hidden;
    if(host)host.style.display=visible?'block':'none';
    if(visible){
      switchAnim(desiredAnim());
      try{if(mixer)mixer.update(dt)}catch(_){}
      try{
        var dir=faceDir();state.face=dir;
        var target=(dir-4)*(Math.PI/4);
        var desired=shortestAngle(root.rotation.y,target);
        root.rotation.y+=(desired-root.rotation.y)*Math.min(1,dt*14);
      }catch(_){}
      try{renderer.render(scene,camera)}catch(_){}
    }
    requestAnimationFrame(frame);
  }

  function boot(){
    if(currentClass()==='archer'&&playerAvailable()){init3D();return}
    setTimeout(boot,450);
  }

  window.PPA_RANGER3D={
    enable:function(v){state.enabled=v!==false;if(host)host.style.display=state.enabled?'block':'none';return state.enabled},
    toggle:function(){state.enabled=!state.enabled;if(host)host.style.display=state.enabled?'block':'none';return state.enabled},
    diag:function(){return Object.assign({},state,{classKey:currentClass(),playerReady:playerAvailable()})}
  };
  window.PPA_RANGER_3D_DIAG=function(){return window.PPA_RANGER3D.diag()};

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
