(function(){
  'use strict';

  var pingSamples=[];

  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function clsPing(v){return v==null?'d':(v<=90?'g':(v<=180?'w':'b'))}
  function stablePing(v){
    if(!Number.isFinite(Number(v)))return null;
    pingSamples.push(Math.max(0,Math.round(Number(v))));
    if(pingSamples.length>7)pingSamples.shift();
    var a=pingSamples.slice().sort(function(x,y){return x-y});
    return a[Math.floor(a.length/2)];
  }

  function refresh(){
    try{
      var box=document.getElementById('ppaPerfMonitorSafe');
      if(!box||box.style.display==='none')return;
      var d=window.PPA_REALTIME_DIAG?window.PPA_REALTIME_DIAG():null;
      if(!d)return;

      var text=box.textContent||'';
      var fm=text.match(/FPS\s+(\d+)/i);
      var fps=fm?Number(fm[1]):0;
      var fcls=fps>=55?'g':(fps>=40?'w':'b');
      var ping=stablePing(d.ping);
      var visible=0,drawn=0;
      try{
        var o=(typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE)?PPA_ONLINE:null;
        visible=o&&o.remotes?o.remotes.size:0;drawn=o?Number(o.drawnLast||0):0;
      }catch(_){}
      var players=d.connected?Math.max(1,Number(d.online)||1):1;
      var age=Number.isFinite(Number(d.serverAge))?Math.max(0,Math.round(Number(d.serverAge))):null;
      var room=d.connected?String(d.room||'safe'):'offline';
      var serverRoom=d.connected?String(d.serverRoom||'—'):'offline';
      var roomPeers=Number.isFinite(Number(d.roomPeers))?Math.max(1,Math.round(Number(d.roomPeers))):'—';
      var inst=Math.max(0,Math.round(Number(d.dungeonInstance)||0)),cap=Math.max(1,Math.round(Number(d.dungeonCapacity)||40));
      var md=null;try{md=window.PPA_MOB_SYNC_DIAG?window.PPA_MOB_SYNC_DIAG():null}catch(_){}
      var mobLine=(md&&md.active)?('<div class="d">MOBS SYNC '+Math.max(0,Number(md.synced)||0)+' · REM '+Math.max(0,Number(md.remoteOwned)||0)+' · DEAD '+Math.max(0,Number(md.tombs)||0)+'</div>'):'';
      var instLine=inst?('<div class="d">INSTANCE '+inst+' · '+roomPeers+' / '+cap+'</div>'):'';

      box.innerHTML='<div><span class="'+fcls+'">FPS '+fps+'</span> &nbsp; <span class="'+clsPing(ping)+'">PING '+(ping==null?'—':ping+' ms')+'</span></div>'+
        '<div class="d">PLAYERS '+players+' · ROOM '+roomPeers+' · VISIBLE '+visible+' / '+drawn+'</div>'+instLine+
        '<div class="d">WS '+(d.connected?'✓':'×')+' · SERVER '+(age==null?'—':age+' ms')+'</div>'+
        '<div class="d">CLIENT '+esc(room)+'</div>'+
        '<div class="d">SERVER '+esc(serverRoom)+'</div>'+mobLine;
    }catch(_){}
  }

  setInterval(refresh,250);
})();