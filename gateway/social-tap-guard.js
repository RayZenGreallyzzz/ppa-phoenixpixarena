(function(){
  'use strict';

  var lastOpenAt=0;

  function remoteId(remote,key){
    try{if(window.PPA_REMOTE_PID){var v=window.PPA_REMOTE_PID(remote);if(v)return String(v)}}catch(_){}
    return String((remote&&(remote.id||remote.i||remote.__ppaPid))||key||'');
  }

  function interactiveTarget(t){
    if(!t||!t.closest)return false;
    return !!t.closest('#ppaPlayerCard,#ppaFriendsPanel,#ppaSocialShade,#ppaChatBox,#chatBox,#premiumPanel,#gramWalletPanel,#invPanel,#inventoryPanel,#charPanel,#eventsPanel,#auctionPanel,#smithPanel,#clanPanel,button,input,textarea,select,a,[role="button"]');
  }

  function canvasInfo(){
    var c=document.getElementById('c');if(!c)return null;
    var r=c.getBoundingClientRect();if(!r.width||!r.height)return null;
    var z=1;try{z=Math.max(.1,Number(typeof cameraZoom==='function'?cameraZoom():1)||1)}catch(_){}
    var camX=0,camY=0;try{camX=Number(cam&&cam.x)||0;camY=Number(cam&&cam.y)||0}catch(_){}
    return {c:c,r:r,z:z,kx:r.width/Math.max(1,c.width),ky:r.height/Math.max(1,c.height),camX:camX,camY:camY};
  }

  function pointsFor(remote,info){
    var out=[];
    function push(x,y,rad){if(Number.isFinite(x)&&Number.isFinite(y))out.push({x:x,y:y,rad:rad})}

    var cx=Number(remote&&remote.__ppaClientX),cy=Number(remote&&remote.__ppaClientY),cr=Number(remote&&remote.__ppaClientRadius);
    if(Number.isFinite(cx)&&Number.isFinite(cy))push(cx,cy,Number.isFinite(cr)?cr:56);

    var hx=Number(remote&&remote.__ppaHitX),hy=Number(remote&&remote.__ppaHitY),hb=Number(remote&&remote.__ppaHitBody);
    if(Number.isFinite(hx)&&Number.isFinite(hy)){
      push(info.r.left+hx*info.z*info.kx,info.r.top+hy*info.z*info.ky,Math.max(44,(Number.isFinite(hb)?hb:30)*info.z*Math.max(info.kx,info.ky)*2));
    }

    var wx=Number(remote&&remote.x),wy=Number(remote&&remote.y);
    if(Number.isFinite(wx)&&Number.isFinite(wy)){
      push(info.r.left+(wx-info.camX)*info.z*info.kx,info.r.top+(wy-info.camY)*info.z*info.ky,58);
    }
    return out;
  }

  function findRemoteAt(x,y){
    if(!window.PPA_ONLINE||!PPA_ONLINE.remotes||typeof PPA_ONLINE.remotes.forEach!=='function')return null;
    var info=canvasInfo();if(!info)return null;
    var best=null,bestD=1e9;
    PPA_ONLINE.remotes.forEach(function(remote,key){
      if(!remote)return;
      var id=remoteId(remote,key);if(!id)return;
      var pts=pointsFor(remote,info);
      for(var i=0;i<pts.length;i++){
        var d=Math.hypot(x-pts[i].x,y-pts[i].y),rad=Math.max(42,Math.min(92,Number(pts[i].rad)||56));
        if(d<=rad&&d<bestD){bestD=d;best=remote}
      }
    });
    return best;
  }

  function openRemote(remote,e){
    if(!remote||!window.PPA_SOCIAL_OPEN_PLAYER)return false;
    var now=Date.now();if(now-lastOpenAt<180)return true;lastOpenAt=now;
    try{
      var id=remoteId(remote,'');
      if(id){remote.id=id;remote.i=id;remote.__ppaPid=id}
      if(e){e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation()}
      window.PPA_SOCIAL_OPEN_PLAYER(remote);
      return true;
    }catch(err){console.warn('PPA social tap open',err);return false}
  }

  function handlePoint(x,y,e){
    if(interactiveTarget(e&&e.target))return false;
    var r=findRemoteAt(Number(x),Number(y));
    return r?openRemote(r,e):false;
  }

  function onPointer(e){
    if(e.button!=null&&e.button!==0)return;
    handlePoint(e.clientX,e.clientY,e);
  }
  function onTouchStart(e){
    if(!e.touches||!e.touches.length)return;
    var t=e.touches[0];handlePoint(t.clientX,t.clientY,e);
  }

  window.addEventListener('pointerdown',onPointer,true);
  window.addEventListener('touchstart',onTouchStart,{capture:true,passive:false});

  window.PPA_SOCIAL_TAP_DIAG=function(x,y){
    var r=findRemoteAt(Number(x),Number(y));
    return r?{ok:true,id:remoteId(r,''),name:String(r.name||r.n||'Игрок'),clientX:Number(r.__ppaClientX)||null,clientY:Number(r.__ppaClientY)||null}:{ok:false,remotes:(window.PPA_ONLINE&&PPA_ONLINE.remotes)?PPA_ONLINE.remotes.size:0};
  };
})();
