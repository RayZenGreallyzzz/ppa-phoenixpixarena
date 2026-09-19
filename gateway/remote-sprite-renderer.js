(function(){
  'use strict';

  function classKey(v){
    var s=String(v||'').trim(),l=s.toLowerCase();
    if(['tank','barbarian','paladin','gnome','archer','mage','assassin','priest'].includes(l))return l;
    try{if(typeof classKeyFromName==='function'){var k=classKeyFromName(s);if(k)return k}}catch(_){}
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

  function remoteDir(r,dx,dy){
    // Movement owns facing; attack FX must not rotate a player who is still running.
    var d=Math.hypot(dx,dy),face=Number(r&&r.face);
    if(d>.35){
      var oct=Math.round(Math.atan2(dy,dx)/(Math.PI/4));
      r.__ppaRemoteDir=((oct+2)+8)%8;
      r.__ppaRemoteFace=Number.isFinite(face)?face:null;
    }else if(Number.isFinite(face)){
      var next=null;
      if(face===-1)next=6;
      else if(face===1)next=2;
      else if(face>=0&&face<=7)next=Math.round(face);
      else if(face===8)next=0;
      if(next!==null&&(r.__ppaRemoteFace!==face||!Number.isFinite(Number(r.__ppaRemoteDir)))){
        r.__ppaRemoteDir=next;
        r.__ppaRemoteFace=face;
      }
    }else if(!Number.isFinite(Number(r.__ppaRemoteDir))){
      r.__ppaRemoteDir=2;
    }
    return Number(r.__ppaRemoteDir)||0;
  }

  function stampClientHit(r,sx,sy,body){
    try{
      var rect=cv.getBoundingClientRect(),z=Math.max(.1,Number(cameraZoom())||1);
      var kx=rect.width/Math.max(1,cv.width),ky=rect.height/Math.max(1,cv.height);
      r.__ppaClientX=rect.left+sx*z*kx;
      r.__ppaClientY=rect.top+sy*z*ky;
      var hidden=Number(r&&r.hiddenUntil)>Date.now();
      r.__ppaClientRadius=hidden?0:Math.max(42,Math.min(82,Math.max(28,body*.78)*z*Math.max(kx,ky)*2.15));
      r.__ppaUntargetable=hidden;
      r.__ppaClientAt=Date.now();
    }catch(_){}
  }

  function install(){
    try{
      if(window.__PPA_REMOTE_CLASS_SPRITES_V280)return true;
      if(typeof ppaOnlineDrawRemote!=='function'||typeof v174AiSpriteCfg!=='function'||typeof phoneCharacterDrawHeight!=='function')return false;
      var fallback=ppaOnlineDrawRemote;

      var drawRemoteSprite=function(r,now,nearCount){
        if(!r||!r.hasPos)return false;
        var key=classKey(r.cls);
        if(!key){
          if(!r.__ppaClassWaitAt)r.__ppaClassWaitAt=Date.now();
          if(Date.now()-r.__ppaClassWaitAt<3000)return false;
          return fallback(r,now,nearCount);
        }
        r.__ppaClassWaitAt=0;

        var mdx=(Number(r.tx)||0)-(Number(r.x)||0),mdy=(Number(r.ty)||0)-(Number(r.y)||0);
        var moving=Math.hypot(mdx,mdy)>.55||String(r.anim||'')==='run';
        var anim=String(r.anim||'').toLowerCase();
        if(!['idle','run','attack'].includes(anim))anim=moving?'run':'idle';
        var cfg=v174AiSpriteCfg({aiClass:key,aiAnim:anim});
        if(!cfg||!cfg.anim||!cfg.anim.img||!cfg.anim.img.complete||!cfg.anim.img.naturalWidth)return fallback(r,now,nearCount);

        var dt=Math.max(0,Math.min(100,now-(r.lastDrawAt||now)));r.lastDrawAt=now;
        var alpha=1-Math.exp(-dt/105);r.x+=(r.tx-r.x)*alpha;r.y+=(r.ty-r.y)*alpha;
        var sx=r.x-cam.x,sy=r.y-cam.y;
        var vw=cv.width/cameraZoom(),vh=cv.height/cameraZoom();
        if(sx<-100||sy<-150||sx>vw+100||sy>vh+150)return false;

        var sc=(P.scene==='clansiege'&&typeof CLAN_SIEGE_PLAYER_VISUAL_SCALE==='number')?CLAN_SIEGE_PLAYER_VISUAL_SCALE:1;
        var remoteScale=(typeof PHONE_REMOTE_PLAYER_VISUAL_SCALE==='number'?PHONE_REMOTE_PLAYER_VISUAL_SCALE:1);
        var baseSize=60,scSafe=Math.max(.01,Number(sc)||1);
        var body=Math.max(8,phoneCharacterBodySize(baseSize,sc)-10/scSafe)*sc*remoteScale;
        if(key==='gnome')body*=.72;
        var dh=Math.max(8,phoneCharacterDrawHeight(baseSize*cfg.scale,sc)-10/scSafe)*sc*remoteScale;
        var dw=dh;
        var bob=String(anim)==='run'?Math.sin(now*.012+(r.id||'').length)*1.6:Math.sin(now*.004+(r.id||'').length)*.7;
        var dir=remoteDir(r,mdx,mdy),row=cfg.rowMap&&cfg.rowMap[dir]!=null?cfg.rowMap[dir]:0;
        var flip=(key==='gnome'&&typeof GNOME_FLIP_BY_DIR!=='undefined')?!!GNOME_FLIP_BY_DIR[dir]:false;
        var a=cfg.anim,frame=Math.floor(now/(1000/Math.max(1,a.fps)))%Math.max(1,a.frames);
        var drawY=sy+body*.40-cfg.foot*dh+bob;

        r.__ppaHitX=sx;
        r.__ppaHitY=sy;
        r.__ppaHitBody=Math.max(26,body*.72);
        r.__ppaHitAt=now;
        stampClientHit(r,sx,sy,body);

        cx.save();
        var hidden=Number(r.hiddenUntil)>Date.now();
        r.__ppaUntargetable=hidden;
        if(hidden)cx.globalAlpha=.38;
        cx.imageSmoothingEnabled=false;
        cx.fillStyle='rgba(0,0,0,.40)';cx.beginPath();cx.ellipse(sx,sy+body*.45,body*.38,body*.14,0,0,Math.PI*2);cx.fill();
        if(flip){
          cx.save();cx.translate(Math.round(sx),0);cx.scale(-1,1);
          cx.drawImage(a.img,frame*a.fw,row*a.fh,a.fw,a.fh,Math.round(-dw/2),Math.round(drawY),Math.round(dw),Math.round(dh));
          cx.restore();
        }else{
          cx.drawImage(a.img,frame*a.fw,row*a.fh,a.fw,a.fh,Math.round(sx-dw/2),Math.round(drawY),Math.round(dw),Math.round(dh));
        }

        var dist=Math.hypot(r.x-P.x,r.y-P.y),topY=drawY-4;
        if(r.mhp>0&&dist<650){
          var bw=Math.max(30,36*remoteScale);cx.fillStyle='rgba(0,0,0,.68)';cx.fillRect(sx-bw/2,topY-5,bw,4);
          cx.fillStyle='#47dd78';cx.fillRect(sx-bw/2,topY-5,bw*Math.max(0,Math.min(1,(r.hp||0)/r.mhp)),4);
        }
        if(nearCount<=14||dist<360){
          cx.textAlign='center';cx.textBaseline='bottom';cx.lineJoin='round';
          if(r.clanName){
            cx.font='700 8px Georgia, serif';cx.lineWidth=2.2;cx.strokeStyle='rgba(8,12,20,.94)';cx.strokeText('['+String(r.clanName).slice(0,18)+']',sx,topY-18);
            cx.fillStyle='#a9cfff';cx.fillText('['+String(r.clanName).slice(0,18)+']',sx,topY-18);
          }
          cx.font='600 10px Georgia, serif';cx.lineWidth=2.4;cx.strokeStyle='rgba(18,8,5,.92)';cx.strokeText(String(r.name||'Игрок').slice(0,18),sx,topY-8);
          cx.fillStyle='#f2d39a';cx.fillText(String(r.name||'Игрок').slice(0,18),sx,topY-8);
        }
        cx.textAlign='left';cx.textBaseline='alphabetic';cx.restore();
        return true;
      };

      ppaOnlineDrawRemote=drawRemoteSprite;
      try{window.ppaOnlineDrawRemote=drawRemoteSprite}catch(_){}
      window.__PPA_REMOTE_CLASS_SPRITES_V280=true;
      return true;
    }catch(e){console.warn('PPA remote sprite renderer',e);return false}
  }

  function boot(){if(install())return;setTimeout(boot,300)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
