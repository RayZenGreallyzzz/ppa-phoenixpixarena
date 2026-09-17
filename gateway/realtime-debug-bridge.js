(function(){
  'use strict';

  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function clsPing(v){return v==null?'d':(v<=90?'g':(v<=180?'w':'b'))}

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
      var ping=Number.isFinite(Number(d.ping))?Math.max(0,Math.round(Number(d.ping))):null;
      var visible=0,drawn=0;
      try{visible=window.PPA_ONLINE&&PPA_ONLINE.remotes?PPA_ONLINE.remotes.size:0;drawn=window.PPA_ONLINE?Number(PPA_ONLINE.drawnLast||0):0}catch(_){}
      var players=d.connected?Math.max(1,Number(d.online)||1):1;
      var age=Number.isFinite(Number(d.serverAge))?Math.max(0,Math.round(Number(d.serverAge))):null;
      var room=d.connected?String(d.room||'safe'):'offline';

      box.innerHTML='<div><span class="'+fcls+'">FPS '+fps+'</span> &nbsp; <span class="'+clsPing(ping)+'">PING '+(ping==null?'—':ping+' ms')+'</span></div>'+
        '<div class="d">PLAYERS '+players+' · VISIBLE '+visible+' / '+drawn+'</div>'+
        '<div class="d">WS '+(d.connected?'✓':'×')+' · SERVER '+(age==null?'—':age+' ms')+'</div>'+
        '<div class="d">ROOM '+esc(room)+'</div>';
    }catch(_){}
  }

  setInterval(refresh,250);
})();
