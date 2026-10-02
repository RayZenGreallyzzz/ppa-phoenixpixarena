(function(){
  'use strict';
  if(window.__PPA_REMOTE_PLAYER3D_DISPATCH_V1)return;
  window.__PPA_REMOTE_PLAYER3D_DISPATCH_V1=true;

  function classKey(v){
    var s=String(v||'').trim(),l=s.toLowerCase();
    if(['tank','barbarian','paladin','gnome','archer','mage','assassin','priest'].includes(l))return l;
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

  var hitMetrics=null,hitMetricsAt=0;
  function canvasHitMetrics(now){
    try{
      now=Number(now)||Date.now();
      if(hitMetrics&&now-hitMetricsAt<120)return hitMetrics;
      var rect=cv.getBoundingClientRect(),z=Math.max(.1,Number(cameraZoom())||1);
      hitMetrics={left:rect.left,top:rect.top,z:z,kx:rect.width/Math.max(1,cv.width),ky:rect.height/Math.max(1,cv.height)};
      hitMetricsAt=now;
      return hitMetrics;
    }catch(_){return hitMetrics}
  }

  var installed=false;
  function install(){
    if(installed)return true;
    if(typeof ppaOnlineDrawRemote!=='function')return false;
    var fallback=ppaOnlineDrawRemote;
    var draw=function(r,now,nearCount){
      if(!r||!r.hasPos)return false;
      if(stress(r))return fallback(r,now,nearCount);
      var key=classKey(r.cls||r.classKey||r.className);
      if(!key){r.__ppa3DMissingClass=true;return false}
      r.__ppa3DMissingClass=false;

      var dt=Math.max(0,Math.min(100,now-(r.lastDrawAt||now)));r.lastDrawAt=now;
      var alpha=1-Math.exp(-dt/105);r.x+=(r.tx-r.x)*alpha;r.y+=(r.ty-r.y)*alpha;
      var sx=r.x-cam.x,sy=r.y-cam.y,z=Math.max(.1,Number(cameraZoom())||1);
      var vw=cv.width/z,vh=cv.height/z;if(sx<-120||sy<-170||sx>vw+120||sy>vh+170)return false;

      // Gameplay target size is independent of GLB/sprite dimensions.
      // Server-provided r.sz wins; otherwise use the established 30-world-unit fallback.
      var targetBody=Math.max(30,Number(r.sz)||30);
      var m=canvasHitMetrics(now);
      if(m){
        r.__ppaHitX=sx;r.__ppaHitY=sy;r.__ppaHitBody=targetBody;r.__ppaHitAt=now;
        r.__ppaClientX=m.left+sx*m.z*m.kx;r.__ppaClientY=m.top+sy*m.z*m.ky;
        r.__ppaUntargetable=Number(r.hiddenUntil)>Date.now();
        // Touch affordance only; never feeds collision/combat/model scale.
        r.__ppaClientRadius=r.__ppaUntargetable?0:58;
        r.__ppaClientAt=now;
      }

      var anchor={classKey:key,worldX:Number(r.x),worldY:Number(r.y),nearCount:nearCount};
      try{if(window.PPA_PLAYER3D&&typeof PPA_PLAYER3D.remote==='function')PPA_PLAYER3D.remote(r,anchor)}catch(_){}
      return true;
    };
    ppaOnlineDrawRemote=draw;try{window.ppaOnlineDrawRemote=draw}catch(_){}
    installed=true;return true;
  }
  function boot(){if(install())return;setTimeout(boot,200)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();