(function(){
  'use strict';

  var pingSamples=[],lastHtml='',stressPanel=null,stressCount=0;

  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function clsPing(v){return v==null?'d':(v<=90?'g':(v<=180?'w':'b'))}
  function stablePing(v){
    if(!Number.isFinite(Number(v)))return null;
    pingSamples.push(Math.max(0,Math.round(Number(v))));
    if(pingSamples.length>7)pingSamples.shift();
    var a=pingSamples.slice().sort(function(x,y){return x-y});
    return a[Math.floor(a.length/2)];
  }

  function adminStressAllowed(){
    return window.PPA_ADMIN_EVENT_REWARD_AUTHORIZED===true &&
      typeof window.PPA_ONLINE_STRESS==='function';
  }

  function actualStressCount(){
    try{
      var o=(typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE)?PPA_ONLINE:null;
      if(o&&o.debugRemotes&&typeof o.debugRemotes.size==='number')return Math.max(0,Number(o.debugRemotes.size)||0);
    }catch(_){}
    return stressCount;
  }

  function setStress(n){
    n=Math.max(0,Math.min(18,Math.floor(Number(n)||0)));
    if(!adminStressAllowed())return false;
    try{
      if(n===0){
        if(typeof window.PPA_ONLINE_STRESS_OFF==='function')window.PPA_ONLINE_STRESS_OFF();
        else window.PPA_ONLINE_STRESS(0);
      }else{
        window.PPA_ONLINE_STRESS(n);
      }
      stressCount=n;
      refreshStressPanel();
      try{if(typeof showPickup==='function')showPickup(n?('STRESS · '+n+' REMOTE ИГРОКОВ'):'STRESS · OFF',n?'#ffd36a':'#9dff91')}catch(_){}
      return true;
    }catch(e){
      console.warn('PPA admin stress control',e);
      return false;
    }
  }

  function ensureStressPanel(){
    if(stressPanel&&stressPanel.isConnected)return stressPanel;
    var p=document.createElement('div');
    p.id='ppaAdminStressControl';
    p.style.cssText='position:fixed;z-index:2147483000;display:none;box-sizing:border-box;padding:5px 6px;border:1px solid rgba(203,145,58,.72);border-radius:7px;background:rgba(13,11,8,.93);box-shadow:0 3px 12px rgba(0,0,0,.65);color:#e9c77d;font:700 8px/1.2 monospace;white-space:nowrap;pointer-events:auto;touch-action:manipulation';
    var title=document.createElement('span');
    title.textContent='LOCAL STRESS ';
    title.style.cssText='margin-right:4px;color:#d7b36d';
    p.appendChild(title);
    // PPA_PLAYER3D_IDLE_THRESHOLD_20261005
    // Exact low-count buttons for finding the first visible-player FPS cliff.
    [0,1,2,3,5].forEach(function(n){
      var b=document.createElement('button');
      b.type='button';b.dataset.stress=String(n);b.textContent=n===0?'OFF':String(n);
      b.style.cssText='min-width:30px;height:25px;margin:0 2px;padding:0 6px;border:1px solid #76522b;border-radius:5px;background:#21160d;color:#e4bd73;font:800 8px monospace;touch-action:manipulation';
      b.addEventListener('click',function(ev){
        try{ev.preventDefault();ev.stopPropagation()}catch(_){}
        setStress(n);
      },{passive:false});
      p.appendChild(b);
    });
    document.body.appendChild(p);
    stressPanel=p;
    return p;
  }

  function refreshStressPanel(){
    try{
      var box=document.getElementById('ppaPerfMonitorSafe');
      var allowed=adminStressAllowed();
      if(!allowed||!box||box.style.display==='none'){
        if(stressPanel)stressPanel.style.display='none';
        return;
      }
      var p=ensureStressPanel(),r=box.getBoundingClientRect();
      p.style.display='block';
      p.style.right=Math.max(6,Math.round(innerWidth-r.right))+'px';
      p.style.top=Math.min(innerHeight-40,Math.max(6,Math.round(r.bottom+6)))+'px';
      var actual=actualStressCount();
      p.querySelectorAll('button[data-stress]').forEach(function(b){
        var on=Number(b.dataset.stress)===actual;
        b.style.background=on?'#5b3512':'#21160d';
        b.style.color=on?'#ffe3a0':'#e4bd73';
        b.style.borderColor=on?'#d69a45':'#76522b';
      });
    }catch(_){}
  }

  window.PPA_ADMIN_STRESS_SET=setStress;
  window.PPA_ADMIN_STRESS_DIAG=function(){
    return {authorized:window.PPA_ADMIN_EVENT_REWARD_AUTHORIZED===true,available:typeof window.PPA_ONLINE_STRESS==='function',count:actualStressCount()};
  };

  function refresh(){
    try{
      var box=document.getElementById('ppaPerfMonitorSafe');
      if(!box||box.style.display==='none'){refreshStressPanel();return}
      box.style.height='auto';
      box.style.minHeight='0';
      box.style.maxHeight='none';
      box.style.overflow='visible';
      var d=window.PPA_REALTIME_DIAG?window.PPA_REALTIME_DIAG():null;
      if(!d){refreshStressPanel();return}

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
      var ma=null;try{ma=window.PPA_MOB_SERVER_DIAG?window.PPA_MOB_SERVER_DIAG():null}catch(_){}
      var authLine='';
      if(ma){
        authLine='<div class="'+(ma.ready?'g':'w')+'">MOB '+(ma.ready?'READY':'WAIT')+
          ' A'+Math.max(0,Number(ma.count)||0)+'/'+Math.max(0,Number(ma.catalog)||0)+
          ' L'+Math.max(0,Number(ma.mobs)||0)+' K'+esc(ma.keyHash||'—')+
          ' A'+esc(ma.authHash||'—')+' L'+esc(ma.localHash||'—')+
          ' Δ'+Math.max(0,Number(ma.maxDelta)||0)+'</div>';
      }else if(String(room).indexOf('dungeon-')===0){
        authLine='<div class="b">MOB BRIDGE OFF</div>';
      }
      var instLine=inst?('<div class="d">INSTANCE '+inst+' · '+roomPeers+' / '+cap+'</div>'):'';
      var stress=actualStressCount();
      var stressLine=stress?('<div class="w">LOCAL STRESS '+stress+'</div>'):'';

      var html='<div><span class="'+fcls+'">FPS '+fps+'</span> &nbsp; <span class="'+clsPing(ping)+'">PING '+(ping==null?'—':ping+' ms')+'</span></div>'+
        '<div class="d">PLAYERS '+players+' · ROOM '+roomPeers+' · VISIBLE '+visible+' / '+drawn+'</div>'+stressLine+instLine+authLine+
        '<div class="d">WS '+(d.connected?'✓':'×')+' · RX AGE '+(age==null?'—':age+' ms')+'</div>'+
        '<div class="d">BUILD '+esc(window.PPA_CLIENT_BUILD||'—')+'</div>'+
        '<div class="d">CLIENT '+esc(room)+'</div>'+
        '<div class="d">SERVER '+esc(serverRoom)+'</div>'+mobLine;
      if(html!==lastHtml){lastHtml=html;box.innerHTML=html}
      refreshStressPanel();
    }catch(_){}
  }

  setInterval(refresh,1500);
})();