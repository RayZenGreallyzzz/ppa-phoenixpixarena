(function(){
  'use strict';

  var state={roomSource:null,wrapped:false,lastResync:0,lastSeenRoom:'',started:false};

  function canonical(v){
    var s=String(v==null?'':v).trim();
    var k=s.toLowerCase();
    if(!k||k==='offline'||k==='local'||k==='none'||k==='null'||k==='undefined')return 'safe';
    return s;
  }

  function captureRoomSource(){
    try{
      var fn=window.ppaOnlineRoomKey;
      if(typeof fn==='function'&&!fn.__ppaPresenceGuard){
        state.roomSource=fn;
      }
    }catch(_){}
  }

  function rawRoom(){
    try{
      if(typeof state.roomSource==='function')return state.roomSource();
    }catch(_){}
    try{
      var d=window.PPA_REALTIME_DIAG&&window.PPA_REALTIME_DIAG();
      if(d&&d.room)return d.room;
    }catch(_){}
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

  function diag(){
    try{return window.PPA_REALTIME_DIAG?window.PPA_REALTIME_DIAG():null}catch(_){return null}
  }

  function visibleCount(){
    try{return window.PPA_ONLINE&&PPA_ONLINE.remotes?PPA_ONLINE.remotes.size:0}catch(_){return 0}
  }

  function syncLegacyState(d){
    try{
      if(!window.PPA_ONLINE)return;
      PPA_ONLINE.connected=!!(d&&d.connected);
      PPA_ONLINE.enabled=!!(d&&d.connected);
      if(d&&d.room)PPA_ONLINE.roomKey=canonical(d.room);
      if(d&&Number.isFinite(Number(d.ping))){
        var p=Math.max(0,Math.round(Number(d.ping)));
        PPA_ONLINE.ping=p;
        PPA_ONLINE.pingMs=p;
        PPA_ONLINE.latency=p;
        PPA_ONLINE.latencyMs=p;
      }
      if(d&&Number.isFinite(Number(d.online))){
        PPA_ONLINE.onlineCount=Math.max(0,Math.round(Number(d.online)));
      }
    }catch(_){}
  }

  function maybeResync(d){
    if(!d||!d.connected||!window.PPA_REALTIME_RESYNC)return;
    var now=Date.now();
    var room=canonical(d.room||rawRoom());
    var localRoom='';
    try{localRoom=canonical(rawRoom())}catch(_){localRoom=room}

    // Scene/room changes (city -> dungeon -> city) must request a fresh snapshot.
    if(state.lastSeenRoom!==localRoom){
      state.lastSeenRoom=localRoom;
      if(now-state.lastResync>250){
        state.lastResync=now;
        try{window.PPA_REALTIME_RESYNC()}catch(_){}
      }
      return;
    }

    // The old local online prototype can still clear remotes on transitions.
    // If the realtime socket says other players are online but none are visible,
    // ask the authoritative room hub for a fresh snapshot instead of staying empty.
    var online=Math.max(0,Number(d.online)||0);
    if(online>1&&visibleCount()===0&&now-state.lastResync>700){
      state.lastResync=now;
      try{window.PPA_REALTIME_RESYNC()}catch(_){}
    }
  }

  function tick(){
    installRoomBridge();
    var d=diag();
    syncLegacyState(d);
    maybeResync(d);
  }

  function boot(){
    if(state.started)return;state.started=true;
    captureRoomSource();installRoomBridge();
    setTimeout(tick,250);
    setInterval(tick,280);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(tick,80)},{passive:true});
    window.addEventListener('pageshow',function(){setTimeout(tick,80)},{passive:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
