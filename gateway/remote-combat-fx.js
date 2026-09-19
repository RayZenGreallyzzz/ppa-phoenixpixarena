(function(){
  'use strict';

  var fx=[];

  function remote(id){
    try{
      if(typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE&&PPA_ONLINE.remotes)return PPA_ONLINE.remotes.get(String(id||''))||null;
    }catch(_){}
    return null;
  }

  function dirFromAngle(a){
    a=Number(a);
    if(!Number.isFinite(a))return 2;
    var oct=Math.round(a/(Math.PI/4));
    return ((oct+2)+8)%8;
  }

  window.PPA_REMOTE_COMBAT_FX_RECEIVE=function(m){
    try{
      if(!m||!m.from)return;
      var r=remote(m.from),now=Date.now();
      var ang=Number(m.ang);
      if(!Number.isFinite(ang)){
        var sx=Number(m.x),sy=Number(m.y),tx=Number(m.tx),ty=Number(m.ty);
        if([sx,sy,tx,ty].every(Number.isFinite))ang=Math.atan2(ty-sy,tx-sx);
      }
      if(r){
        r.__ppaAttackUntil=now+Math.max(260,Math.min(700,Number(m.animMs)||480));
        r.__ppaAttackDir=dirFromAngle(ang);
        r.__ppaAttackAngle=ang;
        r.anim='attack';
        if(Number.isFinite(ang))r.face=Math.cos(ang)<0?-1:1;
      }

      var kind=String(m.kind||'');
      if(kind!=='gnome-cannon'&&kind!=='archer-arrow')return;

      var x=Number(m.x),y=Number(m.y),tx=Number(m.tx),ty=Number(m.ty);
      if(![x,y,tx,ty].every(Number.isFinite))return;
      var dist=Math.max(1,Math.hypot(tx-x,ty-y));
      var speed=kind==='gnome-cannon'?420:720;
      var dur=Math.max(120,Math.min(1300,dist/speed*1000));
      fx.push({
        kind:kind,from:String(m.from||''),born:now,dur:dur,
        x:x,y:y,tx:tx,ty:ty,ang:Number.isFinite(ang)?ang:Math.atan2(ty-y,tx-x)
      });
      if(fx.length>40)fx.splice(0,fx.length-40);
    }catch(_){}
  };

  function drawFx(){
    try{
      if(typeof cx==='undefined'||typeof cam==='undefined')return;
      var now=Date.now();
      for(var i=fx.length-1;i>=0;i--){
        var f=fx[i],t=(now-f.born)/Math.max(1,f.dur);
        if(t>=1){fx.splice(i,1);continue}
        if(t<0)t=0;
        var ease=t;
        var wx=f.x+(f.tx-f.x)*ease,wy=f.y+(f.ty-f.y)*ease;
        var x=wx-cam.x,y=wy-cam.y;
        cx.save();
        if(f.kind==='gnome-cannon'){
          cx.fillStyle='rgba(214,125,42,.28)';
          cx.beginPath();cx.arc(x,y,10,0,Math.PI*2);cx.fill();
          cx.fillStyle='#24272b';cx.strokeStyle='#d68a3d';cx.lineWidth=2;
          cx.beginPath();cx.arc(x,y,7,0,Math.PI*2);cx.fill();cx.stroke();
          cx.fillStyle='rgba(255,221,155,.78)';
          cx.beginPath();cx.arc(x-2,y-2,2,0,Math.PI*2);cx.fill();
        }else{
          cx.translate(x,y);cx.rotate(f.ang);
          cx.fillStyle='#b98b55';cx.fillRect(-10,-1,16,2);
          cx.fillStyle='#d9dde0';cx.beginPath();cx.moveTo(10,0);cx.lineTo(5,-3);cx.lineTo(5,3);cx.closePath();cx.fill();
          cx.fillStyle='#556b3b';cx.fillRect(-11,-3,4,2);cx.fillRect(-11,1,4,2);
        }
        cx.restore();
      }
    }catch(_){}
  }

  function install(){
    try{
      if(window.__PPA_REMOTE_COMBAT_FX_V1)return true;
      if(typeof drawOnlinePlayers!=='function')return false;
      var base=drawOnlinePlayers;
      var wrapped=function(){
        var v=base.apply(this,arguments);
        drawFx();
        return v;
      };
      drawOnlinePlayers=wrapped;
      try{window.drawOnlinePlayers=wrapped}catch(_){}
      window.__PPA_REMOTE_COMBAT_FX_V1=true;
      return true;
    }catch(e){console.warn('PPA remote combat fx',e);return false}
  }

  function boot(){if(install())return;setTimeout(boot,250)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();