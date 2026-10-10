(function(){
  'use strict';

  var fx=[];

  window.PPA_REMOTE_COMBAT_FX_RECEIVE=function(m){
    try{
      if(!m||!m.from)return;
      var now=Date.now();
      var ang=Number(m.ang);
      if(!Number.isFinite(ang)){
        var sx=Number(m.x),sy=Number(m.y),tx=Number(m.tx),ty=Number(m.ty);
        if([sx,sy,tx,ty].every(Number.isFinite))ang=Math.atan2(ty-sy,tx-sx);
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

  window.PPA_LOCAL_COMBAT_FX=function(d){
    try{
      var m=Object.assign({from:'local'},d||{});
      window.PPA_REMOTE_COMBAT_FX_RECEIVE(m);
      return true;
    }catch(_){return false}
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
          // Remote cannonball uses the same world/projectile layer as local shots.
          // Slightly stronger outline keeps it readable on dark dungeon floors.
          cx.fillStyle='rgba(255,146,52,.34)';
          cx.beginPath();cx.arc(x,y,11,0,Math.PI*2);cx.fill();
          cx.fillStyle='#24272b';cx.strokeStyle='#f0a34f';cx.lineWidth=2.4;
          cx.beginPath();cx.arc(x,y,7.5,0,Math.PI*2);cx.fill();cx.stroke();
          cx.fillStyle='rgba(255,229,174,.92)';
          cx.beginPath();cx.arc(x-2.2,y-2.2,2.2,0,Math.PI*2);cx.fill();
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
      if(window.__PPA_REMOTE_COMBAT_FX_V2)return true;
      window.PPA_REMOTE_COMBAT_FX_DRAW=drawFx;
      window.PPA_REMOTE_COMBAT_FX_DIAG=function(){return{queued:fx.length,ready:true}};
      window.__PPA_REMOTE_COMBAT_FX_V2=true;
      return true;
    }catch(e){console.warn('PPA remote combat fx',e);return false}
  }

  function boot(){install()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();