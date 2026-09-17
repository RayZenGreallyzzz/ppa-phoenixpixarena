(function(){
  'use strict';

  var lastOpenAt=0;

  function canvasInfo(){
    var c=document.getElementById('c')||window.cv;
    if(!c||!c.getBoundingClientRect)return null;
    var r=c.getBoundingClientRect();
    if(!r.width||!r.height)return null;
    var z=1;
    try{z=Math.max(.1,Number(typeof cameraZoom==='function'?cameraZoom():1)||1)}catch(_){}
    return {c:c,r:r,z:z,sx:r.width/Math.max(1,c.width),sy:r.height/Math.max(1,c.height)};
  }

  function remoteId(remote,key){
    try{if(window.PPA_REMOTE_PID){var v=window.PPA_REMOTE_PID(remote);if(v)return String(v)}}catch(_){}
    return String((remote&&(remote.id||remote.i||remote.__ppaPid))||key||'');
  }

  function interactiveTarget(t){
    if(!t||!t.closest)return false;
    return !!t.closest('#ppaPlayerCard,#ppaFriendsPanel,#ppaSocialShade,#ppaChatBox,#chatBox,#premiumPanel,#gramWalletPanel,#invPanel,#inventoryPanel,#charPanel,#eventsPanel,#auctionPanel,#smithPanel,#clanPanel,button,input,textarea,select,a,[role="button"]');
  }

  function candidatePoints(remote,info){
    var out=[];
    var wx=Number(remote&&remote.x),wy=Number(remote&&remote.y);
    var hx=Number(remote&&remote.__ppaHitX),hy=Number(remote&&remote.__ppaHitY);
    var cx=0,cy=0;
    try{cx=Number(cam&&cam.x)||0;cy=Number(cam&&cam.y)||0}catch(_){}

    function push(x,y){if(Number.isFinite(x)&&Number.isFinite(y))out.push({x:x,y:y})}

    // Main renderer path: world -> camera relative -> zoom -> CSS pixels.
    if(Number.isFinite(wx)&&Number.isFinite(wy)){
      var rx=wx-cx,ry=wy-cy;
      push(info.r.left+rx*info.z*info.sx,info.r.top+ry*info.z*info.sy);
      // Some phone/tablet branches already bake zoom into their canvas transform.
      push(info.r.left+rx*info.sx,info.r.top+ry*info.sy);
    }

    // Sprite renderer publishes camera-relative draw coordinates too.
    if(Number.isFinite(hx)&&Number.isFinite(hy)){
      push(info.r.left+hx*info.z*info.sx,info.r.top+hy*info.z*info.sy);
      push(info.r.left+hx*info.sx,info.r.top+hy*info.sy);
    }
    return out;
  }

  function findRemoteAt(clientX,clientY){
    if(!window.PPA_ONLINE||!PPA_ONLINE.remotes||typeof PPA_ONLINE.remotes.forEach!=='function')return null;
    var info=canvasInfo();if(!info)return null;
    var best=null,bestDist=1e9;
    PPA_ONLINE.remotes.forEach(function(remote,key){
      if(!remote)return;
      var id=remoteId(remote,key);if(!id)return;
      var pts=candidatePoints(remote,info);
      var body=Math.max(34,Number(remote.__ppaHitBody)||34);
      var radius=Math.max(38,Math.min(72,body*info.z*info.sx*2.1));
      for(var i=0;i<pts.length;i++){
        var d=Math.hypot(clientX-pts[i].x,clientY-pts[i].y);
        if(d<=radius&&d<bestDist){bestDist=d;best=remote}
      }
    });
    return best;
  }

  function openRemote(remote,e){
    if(!remote||!window.PPA_SOCIAL_OPEN_PLAYER)return false;
    var now=Date.now();if(now-lastOpenAt<220)return true;lastOpenAt=now;
    try{
      var id=remoteId(remote,'');
      if(id){remote.id=id;remote.i=id;remote.__ppaPid=id}
      if(e){e.preventDefault();e.stopPropagation();if(e.stopImmediatePropagation)e.stopImmediatePropagation()}
      window.PPA_SOCIAL_OPEN_PLAYER(remote);
      return true;
    }catch(_){return false}
  }

  function onPointer(e){
    if(e.button!=null&&e.button!==0)return;
    if(interactiveTarget(e.target))return;
    var remote=findRemoteAt(Number(e.clientX),Number(e.clientY));
    if(remote)openRemote(remote,e);
  }

  function onTouch(e){
    if(!e.changedTouches||!e.changedTouches.length)return;
    if(interactiveTarget(e.target))return;
    var t=e.changedTouches[0],remote=findRemoteAt(Number(t.clientX),Number(t.clientY));
    if(remote)openRemote(remote,e);
  }

  document.addEventListener('pointerdown',onPointer,true);
  // Old Android WebViews occasionally do not dispatch PointerEvent consistently.
  document.addEventListener('touchend',onTouch,{capture:true,passive:false});

  window.PPA_SOCIAL_TAP_DIAG=function(x,y){
    var r=findRemoteAt(Number(x),Number(y));
    return r?{ok:true,id:remoteId(r,''),name:String(r.name||r.n||'Игрок')}:{ok:false};
  };
})();
