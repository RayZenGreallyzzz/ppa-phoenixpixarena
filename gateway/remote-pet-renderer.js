(function(){
  'use strict';

  var lastPet=null,lastSent=0,installedPacket=false,installedDraw=false;
  var IMG_CACHE=new Map();

  function localPetName(){
    try{
      var it=typeof INV!=='undefined'&&INV&&INV.equipped?INV.equipped.pet:null;
      if(!it)return '';
      return String(it.name||it.n||it.petName||'').trim().slice(0,48);
    }catch(_){return ''}
  }

  function sendPet(force){
    try{
      if(typeof window.PPA_RT_SEND!=='function')return;
      var now=Date.now(),name=localPetName();
      if(!force&&name===lastPet&&now-lastSent<4000)return;
      lastPet=name;lastSent=now;
      window.PPA_RT_SEND({type:'pet-state',pet:name});
    }catch(_){}
  }

  function onlineMap(){
    try{return (typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE&&PPA_ONLINE.remotes)?PPA_ONLINE.remotes:null}catch(_){return null}
  }

  function installPacketHook(){
    try{
      if(installedPacket)return true;
      if(typeof ppaOnlineApplyPacket!=='function')return false;
      var base=ppaOnlineApplyPacket;
      var wrapped=function(p,presence){
        var out=base(p,presence);
        try{
          if(p&&p.pt!==undefined){
            var id=String(p.i||p.id||''),map=onlineMap(),r=id&&map?map.get(id):null;
            if(r)r.petName=String(p.pt||'').trim().slice(0,48);
          }
        }catch(_){}
        return out;
      };
      ppaOnlineApplyPacket=wrapped;
      try{window.ppaOnlineApplyPacket=wrapped}catch(_){}
      installedPacket=true;
      return true;
    }catch(_){return false}
  }

  function petArt(name,dir){
    try{
      if(typeof PET_DIR_ART==='undefined'||!PET_DIR_ART)return '';
      var a=PET_DIR_ART[name];if(!a)return '';
      return a[dir]||a.S||a.E||a.W||a.N||'';
    }catch(_){return ''}
  }

  function imageFor(src){
    if(!src)return null;
    try{if(typeof getCachedImage==='function')return getCachedImage(src)}catch(_){}
    var im=IMG_CACHE.get(src);
    if(!im){im=new Image();im.src=src;IMG_CACHE.set(src,im)}
    return im;
  }

  function facingFromMove(dx,dy,r){
    if(Math.hypot(dx,dy)>.18){
      if(Math.abs(dy)>Math.abs(dx))return dy>0?'S':'N';
      return dx>0?'E':'W';
    }
    return Number(r&&r.face)<0?'W':'E';
  }

  function drawPet(r,now){
    try{
      var name=String(r&&r.petName||'');if(!name)return;
      if(typeof cx==='undefined'||typeof cam==='undefined'||typeof cv==='undefined'||typeof cameraZoom!=='function')return;

      var px=Number(r.x),py=Number(r.y);if(!Number.isFinite(px)||!Number.isFinite(py))return;
      var mdx=(Number(r.tx)||px)-px,mdy=(Number(r.ty)||py)-py;
      var ml=Math.hypot(mdx,mdy),dxn=0,dyn=0;
      if(ml>.12){dxn=mdx/ml;dyn=mdy/ml}
      else if(Number(r.face)<0){dxn=-1}else{dxn=1}

      var tx=px-dxn*48-dyn*14,ty=py-dyn*48+dxn*14+12;
      if(!Number.isFinite(r.__ppaPetX)||!Number.isFinite(r.__ppaPetY)||Math.hypot(r.__ppaPetX-px,r.__ppaPetY-py)>300){
        r.__ppaPetX=tx;r.__ppaPetY=ty;r.__ppaPetDir=facingFromMove(mdx,mdy,r);r.__ppaPetAt=now;
      }

      var dt=Math.max(1,Math.min(100,now-(Number(r.__ppaPetAt)||now)));r.__ppaPetAt=now;
      var ddx=tx-r.__ppaPetX,ddy=ty-r.__ppaPetY,dd=Math.hypot(ddx,ddy);
      var alpha=1-Math.exp(-dt/115);
      if(dd>.4){r.__ppaPetX+=ddx*alpha;r.__ppaPetY+=ddy*alpha;r.__ppaPetDir=facingFromMove(ddx,ddy,r)}
      var dir=r.__ppaPetDir||facingFromMove(mdx,mdy,r),src=petArt(name,dir),im=imageFor(src);
      if(!im||!im.complete||!im.naturalWidth)return;

      var sx=r.__ppaPetX-cam.x,sy=r.__ppaPetY-cam.y;
      var vw=cv.width/cameraZoom(),vh=cv.height/cameraZoom();
      if(sx<-80||sy<-100||sx>vw+80||sy>vh+100)return;

      var scale=(typeof PHONE_REMOTE_PLAYER_VISUAL_SCALE==='number'?PHONE_REMOTE_PLAYER_VISUAL_SCALE:1);
      var size=Math.max(34,Math.min(56,48*scale));
      var bob=Math.sin(now*.008+String(r.id||'').length)*1.4;
      cx.save();
      cx.imageSmoothingEnabled=false;
      cx.globalAlpha=.94;
      cx.fillStyle='rgba(0,0,0,.28)';cx.beginPath();cx.ellipse(sx,sy+size*.31,size*.25,size*.08,0,0,Math.PI*2);cx.fill();
      cx.drawImage(im,Math.round(sx-size/2),Math.round(sy-size*.64+bob),Math.round(size),Math.round(size));
      cx.restore();
    }catch(_){}
  }

  function installDrawHook(){
    try{
      if(installedDraw)return true;
      if(typeof ppaOnlineDrawRemote!=='function')return false;
      var base=ppaOnlineDrawRemote;
      var wrapped=function(r,now,nearCount){
        var out=base(r,now,nearCount);
        drawPet(r,now||Date.now());
        return out;
      };
      ppaOnlineDrawRemote=wrapped;
      try{window.ppaOnlineDrawRemote=wrapped}catch(_){}
      installedDraw=true;
      return true;
    }catch(_){return false}
  }

  function boot(){
    installPacketHook();installDrawHook();sendPet(true);
    var tries=0,t=setInterval(function(){
      installPacketHook();installDrawHook();sendPet(false);
      if(++tries>80&&installedPacket&&installedDraw)clearInterval(t);
    },250);
    setInterval(function(){sendPet(false)},1000);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(function(){sendPet(true)},180)},{passive:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();