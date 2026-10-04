(function(){
  'use strict';
  if(window.__PPA_REMOTE_PLAYER3D_DISPATCH_V2)return;
  window.__PPA_REMOTE_PLAYER3D_DISPATCH_V2=true;

  const PPA_3D_STRESS_CLASSES=['tank','barbarian','paladin','gnome','archer','mage','assassin','priest'];

  function classKey(v){
    var s=String(v||'').trim(),l=s.toLowerCase();
    if(PPA_3D_STRESS_CLASSES.includes(l))return l;
    try{if(typeof classKeyFromName==='function'){var k=String(classKeyFromName(s)||'').toLowerCase();if(k)return k}}catch(_){}
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
  function stress(r){return !!(r&&r.__ppaDebugRemote)||/^BOT\s*\d+$/i.test(String(r&&r.name||''))}
  function stressClass(r){
    var explicit=classKey(r&&r.__ppaDebugClass);
    if(explicit)return explicit;
    var m=String(r&&r.name||'').match(/BOT\s*(\d+)/i);
    var n=m?Math.max(1,Number(m[1])||1):0;
    if(!n){
      var seed=String((r&&(r.i||r.id||r.pid))||'1'),h=0;
      for(var i=0;i<seed.length;i++)h=(h*31+seed.charCodeAt(i))>>>0;
      n=(h%PPA_3D_STRESS_CLASSES.length)+1;
    }
    return PPA_3D_STRESS_CLASSES[(n-1)%PPA_3D_STRESS_CLASSES.length];
  }
  function finite(v){v=Number(v);return Number.isFinite(v)?v:null}

  var hitMetrics=null,hitMetricsAt=0;
  function canvasHitMetrics(now){
    try{
      now=Number(now)||Date.now();
      if(hitMetrics&&now-hitMetricsAt<120)return hitMetrics;
      var rect=cv.getBoundingClientRect(),z=Math.max(.1,Number(cameraZoom())||1);
      if(!rect||rect.width<2||rect.height<2)return null;
      if(!hitMetrics)hitMetrics={left:0,top:0,z:1,kx:1,ky:1};
      hitMetrics.left=rect.left;hitMetrics.top=rect.top;hitMetrics.z=z;
      hitMetrics.kx=rect.width/Math.max(1,cv.width);hitMetrics.ky=rect.height/Math.max(1,cv.height);
      hitMetricsAt=now;
      return hitMetrics;
    }catch(_){return null}
  }

  // Renderer-only interpolation. Never mutate r.x/r.y or r.lastDrawAt here:
  // those fields belong to realtime/gameplay and are also used by targeting.
  // PPA_PLAYER3D_REMOTE_SCRATCH_20261003: visual position and anchor objects are
  // retained on the remote record instead of allocating two objects every draw.
  function visualPosition(r,now){
    var tx=finite(r.tx),ty=finite(r.ty),rx=finite(r.x),ry=finite(r.y);
    if(tx===null)tx=rx;if(ty===null)ty=ry;
    if(tx===null||ty===null)return null;

    var sceneToken=String(r.scene==null?'':r.scene);
    if(r.__ppa3DScene!==sceneToken){
      r.__ppa3DScene=sceneToken;
      r.__ppa3DX=rx===null?tx:rx;
      r.__ppa3DY=ry===null?ty:ry;
      r.__ppa3DLastAt=now;
    }
    if(!Number.isFinite(Number(r.__ppa3DX))||!Number.isFinite(Number(r.__ppa3DY))){
      r.__ppa3DX=rx===null?tx:rx;
      r.__ppa3DY=ry===null?ty:ry;
    }

    var dt=Math.max(0,Math.min(100,now-(Number(r.__ppa3DLastAt)||now)));
    r.__ppa3DLastAt=now;
    var dx=tx-Number(r.__ppa3DX),dy=ty-Number(r.__ppa3DY);
    if(Math.hypot(dx,dy)>220){
      r.__ppa3DX=tx;r.__ppa3DY=ty;
    }else{
      var alpha=1-Math.exp(-dt/105);
      r.__ppa3DX+=dx*alpha;r.__ppa3DY+=dy*alpha;
    }
    var out=r.__ppa3DVisualPosition;
    if(!out)out=r.__ppa3DVisualPosition={x:0,y:0};
    out.x=Number(r.__ppa3DX);out.y=Number(r.__ppa3DY);
    return out;
  }

  var installed=false;
  function install(){
    if(installed)return true;
    if(typeof ppaOnlineDrawRemote!=='function')return false;
    var fallback=ppaOnlineDrawRemote;
    var draw=function(r,now,nearCount){
      if(!r||!r.hasPos)return false;

      // PPA_PLAYER3D_ARENA_STRESS_20261005
      // Stress bots used to be forced back to the old 2D sprite path. Keep them
      // on exactly the same unified Player3D renderer as real remote players so
      // arena load tests measure the real GLB + AnimationMixer cost.
      var freshKey=classKey(r.cls||r.classKey||r.className);
      if(!freshKey&&stress(r))freshKey=stressClass(r);
      if(freshKey)r.__ppa3DClass=freshKey;
      var key=freshKey||classKey(r.__ppa3DClass);
      if(!key){r.__ppa3DMissingClass=true;return fallback(r,now,nearCount)}
      r.__ppa3DMissingClass=false;

      var pos=visualPosition(r,now);
      if(!pos)return false;
      var sx=pos.x-Number(cam.x||0),sy=pos.y-Number(cam.y||0),z=Math.max(.1,Number(cameraZoom())||1);
      var vw=cv.width/z,vh=cv.height/z;
      if(sx<-120||sy<-170||sx>vw+120||sy>vh+170)return false;

      // Gameplay target size remains independent of GLB dimensions. These are
      // screen-space affordances only; canonical realtime coordinates stay intact.
      var targetBody=Math.max(30,Number(r.sz)||30);
      var m=canvasHitMetrics(now);
      if(m){
        r.__ppaHitX=sx;r.__ppaHitY=sy;r.__ppaHitBody=targetBody;r.__ppaHitAt=now;
        r.__ppaClientX=m.left+sx*m.z*m.kx;r.__ppaClientY=m.top+sy*m.z*m.ky;
        r.__ppaUntargetable=Number(r.hiddenUntil)>Date.now();
        r.__ppaClientRadius=r.__ppaUntargetable?0:58;
        r.__ppaClientAt=now;
      }

      var anchor=r.__ppa3DAnchor;
      if(!anchor)anchor=r.__ppa3DAnchor={classKey:'',worldX:0,worldY:0,nearCount:0,scene:null};
      anchor.classKey=key;anchor.worldX=pos.x;anchor.worldY=pos.y;anchor.nearCount=nearCount;
      anchor.scene=r.scene!=null?r.scene:(typeof P!=='undefined'&&P?P.scene:null);
      try{if(window.PPA_PLAYER3D&&typeof PPA_PLAYER3D.remote==='function')PPA_PLAYER3D.remote(r,anchor)}catch(_){}
      return true;
    };
    ppaOnlineDrawRemote=draw;try{window.ppaOnlineDrawRemote=draw}catch(_){}
    installed=true;return true;
  }
  function boot(){if(install())return;setTimeout(boot,200)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();