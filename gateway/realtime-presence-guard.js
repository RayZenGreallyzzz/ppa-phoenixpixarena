(function(){
  'use strict';

  var state={
    roomSource:null,wrapped:false,lastResync:0,lastSeenRoom:'',started:false,
    lastHeartbeat:0,lastHeal:0,applyOriginal:null,applyWrapped:false,shadow:new Map()
  };

  function canonical(v){
    var s=String(v==null?'':v).trim();
    var k=s.toLowerCase();
    if(!k||k==='offline'||k==='local'||k==='none'||k==='null'||k==='undefined')return 'safe';
    return s;
  }

  function captureRoomSource(){
    try{
      var fn=window.ppaOnlineRoomKey;
      if(typeof fn==='function'&&!fn.__ppaPresenceGuard)state.roomSource=fn;
    }catch(_){}
  }

  function rawRoom(){
    try{if(typeof state.roomSource==='function')return state.roomSource()}catch(_){}
    try{var d=window.PPA_REALTIME_DIAG&&window.PPA_REALTIME_DIAG();if(d&&d.room)return d.room}catch(_){}
    return 'safe';
  }

  function installRoomBridge(){
    try{
      captureRoomSource();
      var wrapped=function(){return canonical(rawRoom())};
      wrapped.__ppaPresenceGuard=true;
      window.ppaOnlineRoomKey=wrapped;
      state.wrapped=true;
      return true;
    }catch(_){return false}
  }

  function diag(){try{return window.PPA_REALTIME_DIAG?window.PPA_REALTIME_DIAG():null}catch(_){return null}}
  function visibleCount(){try{return window.PPA_ONLINE&&PPA_ONLINE.remotes?PPA_ONLINE.remotes.size:0}catch(_){return 0}}

  function rememberPacket(p){
    try{
      if(!p||typeof p!=='object')return;
      var id=String(p.i||p.id||'');if(!id)return;
      state.shadow.set(id,{packet:Object.assign({},p),at:Date.now(),room:canonical(rawRoom())});
    }catch(_){}
  }

  function installApplyBridge(){
    if(state.applyWrapped)return true;
    try{
      var fn=null;
      try{if(typeof ppaOnlineApplyPacket==='function')fn=ppaOnlineApplyPacket}catch(_){}
      if(!fn&&typeof window.ppaOnlineApplyPacket==='function')fn=window.ppaOnlineApplyPacket;
      if(typeof fn!=='function')return false;
      if(fn.__ppaRtShadow){state.applyOriginal=fn.__ppaOriginal||fn;state.applyWrapped=true;return true}
      state.applyOriginal=fn;
      var wrapped=function(p,presence){rememberPacket(p);return fn.apply(this,arguments)};
      wrapped.__ppaRtShadow=true;wrapped.__ppaOriginal=fn;
      try{window.ppaOnlineApplyPacket=wrapped}catch(_){}
      try{ppaOnlineApplyPacket=wrapped}catch(_){}
      state.applyWrapped=true;
      return true;
    }catch(_){return false}
  }

  function syncLegacyState(d){
    try{
      if(!window.PPA_ONLINE)return;
      PPA_ONLINE.connected=!!(d&&d.connected);PPA_ONLINE.enabled=!!(d&&d.connected);
      if(d&&d.room)PPA_ONLINE.roomKey=canonical(d.room);
      if(d&&Number.isFinite(Number(d.ping))){
        var p=Math.max(0,Math.round(Number(d.ping)));
        PPA_ONLINE.ping=p;PPA_ONLINE.pingMs=p;PPA_ONLINE.latency=p;PPA_ONLINE.latencyMs=p;
      }
      if(d&&Number.isFinite(Number(d.online)))PPA_ONLINE.onlineCount=Math.max(0,Math.round(Number(d.online)));
    }catch(_){}
  }

  function selfState(){
    try{
      var p=null;
      try{if(typeof P!=='undefined'&&P)p=P}catch(_){}
      if(!p&&window.P)p=window.P;
      if(!p)return null;
      var x=Number(p.x),y=Number(p.y);if(!Number.isFinite(x)||!Number.isFinite(y))return null;
      var hp=Number(p.hp),mhp=Number(p.mhp),face=Number(p.face),lvl=Number(p.lvl),bm=Number(p.bm);
      return {
        type:'move',x:x,y:y,
        h:Number.isFinite(hp)?Math.max(0,Math.round(hp)):0,
        m:Number.isFinite(mhp)?Math.max(1,Math.round(mhp)):1,
        f:Number.isFinite(face)?Math.max(1,Math.min(8,Math.round(face))):1,
        a:String(p.anim||'idle').slice(0,12),
        l:Number.isFinite(lvl)?Math.max(1,Math.floor(lvl)):1,
        b:Number.isFinite(bm)?Math.max(0,Math.round(bm)):0
      };
    }catch(_){return null}
  }

  function heartbeat(d){
    if(!d||!d.connected||typeof window.PPA_RT_SEND!=='function')return;
    var now=Date.now();if(now-state.lastHeartbeat<850)return;
    var s=selfState();if(!s)return;
    if(window.PPA_RT_SEND(s))state.lastHeartbeat=now;
  }

  function healShadow(d){
    var now=Date.now();if(now-state.lastHeal<320)return;state.lastHeal=now;
    if(!state.applyOriginal||!window.PPA_ONLINE||!PPA_ONLINE.remotes)return;
    var room=canonical((d&&d.room)||rawRoom());
    state.shadow.forEach(function(v,id){
      if(!v||v.room!==room||now-v.at>12000){state.shadow.delete(id);return}
      if(PPA_ONLINE.remotes.has(id))return;
      try{state.applyOriginal(v.packet,true)}catch(_){}
      try{
        var r=PPA_ONLINE.remotes.get(id);
        if(r){r.id=id;r.i=id;r.__ppaPid=id;r.__ppaRtAt=now;r.__ppaRoom=room}
      }catch(_){}
    });
  }

  function maybeResync(d){
    if(!d||!d.connected||!window.PPA_REALTIME_RESYNC)return;
    var now=Date.now(),localRoom=canonical(rawRoom());
    if(state.lastSeenRoom!==localRoom){
      state.lastSeenRoom=localRoom;state.shadow.clear();
      if(now-state.lastResync>150){state.lastResync=now;try{window.PPA_REALTIME_RESYNC()}catch(_){}}
      return;
    }
    var online=Math.max(0,Number(d.online)||0),empty=visibleCount()===0;
    var wait=empty&&online>1?650:2200;
    if(now-state.lastResync>wait){state.lastResync=now;try{window.PPA_REALTIME_RESYNC()}catch(_){}}
  }

  function tick(){
    installRoomBridge();installApplyBridge();
    var d=diag();syncLegacyState(d);heartbeat(d);healShadow(d);maybeResync(d);
  }

  function boot(){
    if(state.started)return;state.started=true;
    captureRoomSource();installRoomBridge();installApplyBridge();
    setTimeout(tick,180);setInterval(tick,240);
    document.addEventListener('visibilitychange',function(){if(!document.hidden){state.lastResync=0;state.lastHeartbeat=0;setTimeout(tick,60)}},{passive:true});
    window.addEventListener('pageshow',function(){state.lastResync=0;state.lastHeartbeat=0;setTimeout(tick,60)},{passive:true});
  }

  window.PPA_PRESENCE_GUARD_DIAG=function(){return{room:state.lastSeenRoom,shadow:state.shadow.size,visible:visibleCount(),heartbeatAgo:Date.now()-state.lastHeartbeat,resyncAgo:Date.now()-state.lastResync}};

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
