(function(){
  'use strict';
  window.PPA_REALTIME_V2_ACTIVE=true;

  var RT={
    ws:null,connecting:false,retry:0,retryTimer:0,lastMove:0,lastRoom:'',lastRoomSync:0,
    pendingRoom:'',pendingSince:0,lastX:null,lastY:null,lastHp:null,lastMhp:null,lastFace:null,
    lastAnim:'',lastLevel:null,lastBm:null,lastAtk:null,lastDef:null,lastRange:null,lastCrit:null,lastCritDmg:null,lastAtkSpd:null,
    onlineCount:0,started:false,pingSent:0,pingMs:null,
    lastServerAt:0,lastSnapshotAt:0,serverRoom:'',roomPeers:null,
    assignBase:'',assignAt:0,dungeonInstance:0,dungeonCapacity:40,
    arenaRoom:'',arenaLeavingUntil:0,
    arenaQueuePromise:null,arenaQueueResolve:null,arenaQueueTimer:0,arenaQueueMode:''
  };

  function tg(){try{return window.Telegram&&window.Telegram.WebApp}catch(_){return null}}
  function initData(){var t=tg();return t&&t.initData?String(t.initData):''}
  function canonicalRoom(v){
    var r=String(v==null?'':v).trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,72);
    if(!r||r==='offline'||r==='local'||r==='none'||r==='null'||r==='undefined')return 'safe';
    return r;
  }
  function dungeonInfo(v){
    var r=canonicalRoom(v);
    if(r.indexOf('dungeon-')!==0)return null;
    var m=r.match(/^(dungeon-[a-z0-9_-]*?)-i([1-9]\d*)$/);
    if(m)return{base:m[1],room:r,instance:Math.max(1,Number(m[2])||1)};
    return{base:r,room:'',instance:0};
  }
  function rawRoom(){
    try{
      if(RT.arenaRoom)return canonicalRoom(RT.arenaRoom);
      if(RT.arenaLeavingUntil>Date.now())return 'safe';
      // 41-60 must use a dungeon-* room or server-authoritative mobs/bosses never activate.
      if(typeof P!=='undefined'&&P&&P.scene==='dungeon'&&typeof DUNGEON_MODE!=='undefined'){
        if(DUNGEON_MODE==='41-60')return 'dungeon-41-60';
        if(DUNGEON_MODE==='21+')return 'dungeon-21-40';
        if(DUNGEON_MODE==='1-20')return 'dungeon-1-20';
      }
      return canonicalRoom(typeof ppaOnlineRoomKey==='function'?ppaOnlineRoomKey():'safe');
    }catch(_){return RT.lastRoom||'safe'}
  }
  function room(){
    var raw=rawRoom(),want=dungeonInfo(raw),cur=dungeonInfo(RT.lastRoom);
    if(want&&cur&&cur.instance&&want.base===cur.base)return RT.lastRoom;
    return raw;
  }
  function mobileUi(){try{return innerWidth<=900||matchMedia('(pointer:coarse)').matches}catch(_){return false}}
  function selfLevel(){try{return Math.max(1,Math.floor(Number(P&&P.lvl)||1))}catch(_){return 1}}
  function selfBm(){try{return Math.max(0,Math.round(Number(P&&P.bm)||0))}catch(_){return 0}}
  function selfClass(){
    var vals=[];
    try{if(typeof P!=='undefined'&&P)vals.push(P.classKey,P.cls,P.className,P._saved&&P._saved.cls)}catch(_){}
    try{if(typeof INV!=='undefined'&&INV)vals.push(INV.classKey,INV.cls,INV.className)}catch(_){}
    try{var z=JSON.parse(localStorage.getItem('pxSave')||'null');if(z)vals.push(z.classKey,z.cls,z.className)}catch(_){}
    for(var i=0;i<vals.length;i++){
      var v=String(vals[i]||'').trim(),l=v.toLowerCase();
      if(['tank','barbarian','paladin','gnome','archer','mage','assassin','priest'].indexOf(l)>=0)return l;
      try{if(typeof classKeyFromName==='function'){var k=String(classKeyFromName(v)||'').toLowerCase();if(k)return k}}catch(_){}
      if(l.indexOf('страж')>=0||l.indexOf('tank')>=0)return'tank';
      if(l.indexOf('бер')>=0||l.indexOf('barb')>=0)return'barbarian';
      if(l.indexOf('пал')>=0)return'paladin';
      if(l.indexOf('гном')>=0||l.indexOf('cannon')>=0)return'gnome';
      if(l.indexOf('луч')>=0||l.indexOf('archer')>=0)return'archer';
      if(l.indexOf('маг')>=0||l.indexOf('mage')>=0)return'mage';
      if(l.indexOf('асс')>=0||l.indexOf('assassin')>=0)return'assassin';
      if(l.indexOf('жр')>=0||l.indexOf('priest')>=0)return'priest';
    }
    return'';
  }
  function badgeText(){var s='ONLINE · '+Math.max(1,RT.onlineCount||1);if(Number.isFinite(RT.pingMs))s+=' · '+Math.round(RT.pingMs)+' ms';return s}

  function disableLegacyOnline(){
    try{
      window.PPA_REALTIME_V2_ACTIVE=true;
      try{if(typeof PPAOnlineTick==='function')PPAOnlineTick=function(){}}catch(_){}
      try{if(typeof ppaOnlineCleanup==='function')ppaOnlineCleanup=function(){}}catch(_){}
      try{if(typeof PPAOnlineInit==='function')PPAOnlineInit=function(){return Promise.resolve()}}catch(_){}
      try{if(typeof window.PPAOnlineTick==='function')window.PPAOnlineTick=function(){}}catch(_){}
      try{if(typeof window.ppaOnlineCleanup==='function')window.ppaOnlineCleanup=function(){}}catch(_){}
      try{if(typeof window.PPAOnlineInit==='function')window.PPAOnlineInit=function(){return Promise.resolve()}}catch(_){}
      if(window.PPA_ONLINE){
        var old=PPA_ONLINE;
        try{if(old.channel&&old.channel.untrack)old.channel.untrack()}catch(_){}
        try{if(old.supabase&&old.channel&&old.supabase.removeChannel)old.supabase.removeChannel(old.channel)}catch(_){}
        old.channel=null;old.pendingChannel=null;old.supabase=null;old.connecting=false;old.retryAt=0;
      }
    }catch(_){}
  }

  function fixOnlineBadge(){
    try{
      var el=document.getElementById('ppaOnlineBadge');if(!el)return;
      if(mobileUi()){
        el.style.position='fixed';el.style.display='block';el.style.visibility='visible';
        el.style.left='50%';el.style.right='auto';el.style.top='8px';el.style.transform='translateX(-50%)';
        el.style.padding='2px 6px';el.style.fontSize='9px';el.style.lineHeight='1.1';el.style.maxWidth='190px';el.style.whiteSpace='nowrap';
        el.style.opacity='0.95';el.style.pointerEvents='none';el.style.zIndex='9999';
      }else{
        el.style.position='fixed';el.style.left='8px';el.style.right='auto';el.style.top='8px';el.style.transform='none';
        el.style.padding='5px 8px';el.style.fontSize='10px';el.style.lineHeight='normal';el.style.maxWidth='none';el.style.whiteSpace='normal';el.style.opacity='1';el.style.pointerEvents='auto';
      }
    }catch(_){}
  }
  function status(text,col){try{if(typeof ppaOnlineSetStatus==='function'){ppaOnlineSetStatus(text,col);fixOnlineBadge()}}catch(_){}}
  function refreshBadge(){if(RT.ws&&RT.ws.readyState===WebSocket.OPEN)status(badgeText(),'#9fffc1')}
  function send(o){try{if(RT.ws&&RT.ws.readyState===WebSocket.OPEN){RT.ws.send(JSON.stringify(o));return true}}catch(_){}return false}

  function arenaQueueStatus(text,on){
    try{
      var el=document.getElementById('ppaArenaQueueStatus');
      if(!el){
        el=document.createElement('div');el.id='ppaArenaQueueStatus';
        el.style.cssText='position:fixed;left:50%;top:72px;transform:translateX(-50%);z-index:10080;display:none;max-width:82vw;padding:8px 12px;border:1px solid rgba(255,199,82,.65);border-radius:8px;background:rgba(10,12,15,.94);color:#ffd36d;font:700 11px/1.2 monospace;text-align:center;pointer-events:none;text-shadow:0 1px 2px #000';
        document.body.appendChild(el);
      }
      el.textContent=String(text||'');
      el.style.display=on?'block':'none';
    }catch(_){}
  }
  function arenaQueueNotice(text){
    text=String(text||'');
    try{if(typeof sendArenaMenuNotice==='function')sendArenaMenuNotice(text)}catch(_){}
    try{if(typeof showPickup==='function')showPickup(text,'#ffd36d')}catch(_){}
  }
  function arenaQueueResolve(data){
    var fn=RT.arenaQueueResolve;
    RT.arenaQueueResolve=null;RT.arenaQueuePromise=null;RT.arenaQueueMode='';
    if(RT.arenaQueueTimer){clearTimeout(RT.arenaQueueTimer);RT.arenaQueueTimer=0}
    if(fn)try{fn(data||{matched:false})}catch(_){}
  }
  function clearRemotes(){try{if(typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE.remotes)PPA_ONLINE.remotes.clear()}catch(_){}}
  function deleteRemote(id){try{if(typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE.remotes)PPA_ONLINE.remotes.delete(String(id||''))}catch(_){}}

  function applyPlayer(p,presence){
    try{
      if(typeof ppaOnlineApplyPacket==='function')ppaOnlineApplyPacket(p,!!presence);
      var id=String((p&&(p.i||p.id))||'');
      if(id&&typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE.remotes){
        var r=PPA_ONLINE.remotes.get(id);
        if(r){
          var lv=Number(p.l!=null?p.l:p.level),bm=Number(p.b!=null?p.b:p.bm),seq=Number(p.q!=null?p.q:p.seq),face=Number(p.f);
          if(Number.isFinite(lv))r.level=Math.max(1,Math.floor(lv));
          if(Number.isFinite(bm))r.bm=Math.max(0,Math.round(bm));
          if(Number.isFinite(face))r.face=face;
          if(p.c!==undefined&&String(p.c||''))r.cls=String(p.c||'');
          if(p.p!==undefined)r.partyId=String(p.p||'');
          if(p.av!==undefined)r.arenaSide=String(p.av||'');
          if(p.am!==undefined)r.arenaMatchId=String(p.am||'');
          if(p.hu!==undefined)r.hiddenUntil=Math.max(0,Number(p.hu)||0);
          if(Number.isFinite(Number(p.df)))r.def=Math.max(0,Number(p.df)||0);
          if(Number.isFinite(Number(p.at)))r.atk=Math.max(1,Number(p.at)||1);
          if(Number.isFinite(Number(p.ar)))r.attackRange=Math.max(60,Number(p.ar)||60);
          if(Number.isFinite(Number(p.cr)))r.crit=Math.max(0,Number(p.cr)||0);
          if(Number.isFinite(Number(p.cd)))r.critDmg=Math.max(100,Number(p.cd)||180);
          if(Number.isFinite(Number(p.as)))r.atkSpd=Math.max(.35,Number(p.as)||1);
          if(presence&&Number.isFinite(seq))r.lastSeq=Math.max(0,seq);
          r.lastNetAt=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
          r.id=id;r.i=id;r.__ppaPid=id;r.__ppaRtAt=Date.now();r.__ppaRoom=RT.lastRoom;
        }
      }
    }catch(e){console.warn('Realtime player packet',e)}
  }

  function reconcileSnapshot(players){
    var now=Date.now();
    (Array.isArray(players)?players:[]).forEach(function(p){applyPlayer(p,true)});
    RT.lastSnapshotAt=now;
    RT.roomPeers=(Array.isArray(players)?players.length:0)+1;
    // Never delete live remotes merely because one snapshot is temporarily empty.
    // Real room changes clear locally and the server emits explicit leave events.
  }

  function selfName(){try{return String((INV&&INV.playerName)||window.PPA_PLAYER_NAME||'Игрок').slice(0,24)}catch(_){return 'Игрок'}}

  function ensureFullsize(){
    var t=tg();if(!t)return;
    try{if(typeof t.ready==='function')t.ready()}catch(_){}
    try{if(typeof t.disableVerticalSwipes==='function')t.disableVerticalSwipes()}catch(_){}
    try{if(t.isFullscreen&&typeof t.exitFullscreen==='function')t.exitFullscreen()}catch(_){}
    try{if(typeof t.expand==='function')t.expand()}catch(_){}
    setTimeout(fixOnlineBadge,60);
  }

  function armFullsize(){
    try{
      window.addEventListener('pageshow',function(){setTimeout(ensureFullsize,80)},{passive:true});
      document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(ensureFullsize,100)},{passive:true});
      window.addEventListener('resize',fixOnlineBadge,{passive:true});
      window.addEventListener('orientationchange',function(){setTimeout(function(){ensureFullsize();fixOnlineBadge()},180)},{passive:true});
      var t=tg();
      if(t&&typeof t.onEvent==='function'){
        t.onEvent('activated',function(){setTimeout(ensureFullsize,80)});
        t.onEvent('viewportChanged',function(){setTimeout(fixOnlineBadge,80)});
        t.onEvent('fullscreenChanged',function(){if(t.isFullscreen)setTimeout(ensureFullsize,80)});
      }
    }catch(_){}
  }

  async function ticket(){
    var d=initData();if(!d)throw new Error('Telegram initData отсутствует');
    var r=await fetch('/api/realtime/ticket',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({initData:d}),credentials:'same-origin',cache:'no-store'});
    var j=null;try{j=await r.json()}catch(_){j=null}
    if(!r.ok||!j||!j.ok)throw new Error((j&&j.message)||('Realtime HTTP '+r.status));
    return j;
  }

  function scheduleReconnect(){
    if(RT.retryTimer)return;
    RT.retry=Math.min(8000,RT.retry?Math.round(RT.retry*1.7):1200);
    RT.retryTimer=setTimeout(function(){RT.retryTimer=0;connect()},RT.retry);
  }

  function setConnected(on){
    try{
      if(typeof PPA_ONLINE!=='undefined'){
        PPA_ONLINE.connected=!!on;PPA_ONLINE.enabled=!!on;
        if(on){PPA_ONLINE.roomKey=RT.lastRoom||room();PPA_ONLINE.selfName=selfName()}
      }
    }catch(_){}
    if(on)refreshBadge();
    else status('ONLINE · переподключение…','#ffb37d');
  }

  function commitRoom(wanted){
    wanted=canonicalRoom(wanted);
    if(RT.lastRoom&&wanted!==RT.lastRoom)clearRemotes();
    RT.lastRoom=wanted;RT.pendingRoom='';RT.pendingSince=0;RT.roomPeers=null;
    var d=dungeonInfo(wanted);RT.dungeonInstance=d&&d.instance?d.instance:0;
    try{if(typeof PPA_ONLINE!=='undefined')PPA_ONLINE.roomKey=RT.lastRoom}catch(_){}
  }

  function sendRoom(force){
    var now=Date.now(),raw=rawRoom(),wantD=dungeonInfo(raw),curD=dungeonInfo(RT.lastRoom);
    if(wantD){
      if(curD&&curD.instance&&curD.base===wantD.base){
        RT.assignBase='';RT.assignAt=0;
        if(!force&&now-RT.lastRoomSync<1200)return;
        if(send({type:'room',room:RT.lastRoom}))RT.lastRoomSync=now;
        return;
      }
      if(!force&&RT.assignBase===wantD.base&&now-RT.assignAt<900)return;
      RT.assignBase=wantD.base;RT.assignAt=now;
      if(send({type:'room-request',base:wantD.base}))RT.lastRoomSync=now;
      return;
    }

    RT.assignBase='';RT.assignAt=0;
    var wanted=raw;
    if(!RT.lastRoom){commitRoom(wanted)}
    else if(wanted!==RT.lastRoom){
      if(force)commitRoom(wanted);
      else{
        if(RT.pendingRoom!==wanted){RT.pendingRoom=wanted;RT.pendingSince=now;return}
        if(now-RT.pendingSince<420)return;
        commitRoom(wanted);
      }
    }else{RT.pendingRoom='';RT.pendingSince=0}
    if(!force&&now-RT.lastRoomSync<1200)return;
    if(send({type:'room',room:RT.lastRoom}))RT.lastRoomSync=now;
  }

  function resyncRoom(){
    if(!RT.ws||RT.ws.readyState!==WebSocket.OPEN)return false;
    var raw=rawRoom(),wantD=dungeonInfo(raw),curD=dungeonInfo(RT.lastRoom);
    if(wantD){
      if(!(curD&&curD.instance&&curD.base===wantD.base)){sendRoom(true);return true}
      var okD=send({type:'room',room:RT.lastRoom});
      if(okD){RT.lastRoomSync=Date.now();sendMove(true)}
      return okD;
    }
    if(!RT.lastRoom||raw!==RT.lastRoom)commitRoom(raw);
    var ok=send({type:'room',room:RT.lastRoom});
    if(ok){RT.lastRoomSync=Date.now();sendMove(true)}
    return ok;
  }

  function sendMove(force){
    if(!RT.ws||RT.ws.readyState!==WebSocket.OPEN)return;
    var raw=rawRoom(),wantD=dungeonInfo(raw),curD=dungeonInfo(RT.lastRoom);
    if(wantD&&!(curD&&curD.instance&&curD.base===wantD.base))return;
    var now=Date.now();if(!force&&now-RT.lastMove<220)return;
    try{
      var x=Number(P.x)||0,y=Number(P.y)||0,h=Math.max(0,Math.round(Number(P.hp)||0)),m=Math.max(1,Math.round(Number(P.mhp)||1)),f=Number(P.face)||1,a=String(P.anim||'idle').slice(0,12),l=selfLevel(),b=selfBm(),c=selfClass();
      var atk=Math.max(1,Number(P.atk)||1),df=Math.max(0,Number(P.def)||0),ar=Math.max(60,Number(P.attackRange)||60),cr=Math.max(0,Number(P.crit)||0),cd=Math.max(100,Number(P.critDmg)||180),as=Math.max(.35,Number(P.atkSpd)||1);
      var changed=RT.lastX===null||Math.abs(x-RT.lastX)>.35||Math.abs(y-RT.lastY)>.35||h!==RT.lastHp||m!==RT.lastMhp||f!==RT.lastFace||a!==RT.lastAnim||l!==RT.lastLevel||b!==RT.lastBm||atk!==RT.lastAtk||df!==RT.lastDef||ar!==RT.lastRange||cr!==RT.lastCrit||cd!==RT.lastCritDmg||as!==RT.lastAtkSpd;
      if(!force&&!changed&&now-RT.lastMove<900)return;
      RT.lastMove=now;RT.lastX=x;RT.lastY=y;RT.lastHp=h;RT.lastMhp=m;RT.lastFace=f;RT.lastAnim=a;RT.lastLevel=l;RT.lastBm=b;RT.lastAtk=atk;RT.lastDef=df;RT.lastRange=ar;RT.lastCrit=cr;RT.lastCritDmg=cd;RT.lastAtkSpd=as;
      send({type:'move',room:RT.lastRoom||room(),x:x,y:y,h:h,m:m,f:f,a:a,l:l,b:b,c:c,at:atk,df:df,ar:ar,cr:cr,cd:cd,as:as});
    }catch(_){}
  }

  function syncPartyAllies(m){
    try{
      window.PPA_PARTY_STATE=m||{partyId:'',members:[]};
      var ids=new Set((m&&Array.isArray(m.members)?m.members:[]).map(function(x){return String(x.id||'')}));
      var arr=[];
      if(typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE.remotes)PPA_ONLINE.remotes.forEach(function(r,id){if(ids.has(String(id)))arr.push(r)});
      window.PPA_PARTY_ALLIES=arr;
      if(window.PPA_SOCIAL_ON_PARTY_STATE)window.PPA_SOCIAL_ON_PARTY_STATE(window.PPA_PARTY_STATE);
    }catch(_){}
  }

  function partyNotice(text,ok){
    try{if(typeof showPickup==='function')showPickup(String(text||''),ok===false?'#ff8d8d':'#8dffad')}catch(_){}
    try{if(window.PPA_SOCIAL_NOTICE)window.PPA_SOCIAL_NOTICE(String(text||''),ok)}catch(_){}
  }

  function receive(m){
    if(!m||typeof m!=='object')return;
    RT.lastServerAt=Date.now();
    if(m.type==='hello'){
      try{if(typeof PPA_ONLINE!=='undefined'){PPA_ONLINE.selfId=String(m.pid||PPA_ONLINE.selfId||'');PPA_ONLINE.selfName=String(m.name||selfName())}}catch(_){}
      sendRoom(true);sendMove(true);return;
    }
    if(m.type==='room-assigned'){
      var desired=dungeonInfo(rawRoom()),base=canonicalRoom(m.base||'');
      if(!desired||desired.base!==base)return;
      var assigned=dungeonInfo(m.room);
      if(!assigned||!assigned.instance||assigned.base!==base)return;
      commitRoom(assigned.room);
      RT.assignBase='';RT.assignAt=0;RT.serverRoom=assigned.room;
      RT.dungeonInstance=assigned.instance;
      if(Number.isFinite(Number(m.capacity)))RT.dungeonCapacity=Math.max(1,Number(m.capacity)||40);
      if(Number.isFinite(Number(m.roomCount)))RT.roomPeers=Math.max(1,Number(m.roomCount)||1);
      RT.lastRoomSync=Date.now();
      sendMove(true);
      return;
    }
    if(m.type==='pong'){
      if(m.room)RT.serverRoom=canonicalRoom(m.room);
      if(Number.isFinite(Number(m.roomCount)))RT.roomPeers=Math.max(1,Number(m.roomCount)||1);
      if(RT.pingSent){var ms=Math.max(0,Date.now()-RT.pingSent);RT.pingMs=Number.isFinite(RT.pingMs)?(RT.pingMs*.65+ms*.35):ms;RT.pingSent=0;refreshBadge()}
      if(RT.serverRoom&&RT.serverRoom!==canonicalRoom(RT.lastRoom))resyncRoom();
      return;
    }
    if(m.type==='online'){
      RT.onlineCount=Math.max(0,Number(m.count)||0);
      if(m.room)RT.serverRoom=canonicalRoom(m.room);
      if(Number.isFinite(Number(m.roomCount)))RT.roomPeers=Math.max(1,Number(m.roomCount)||1);
      refreshBadge();return;
    }
    if(m.type==='snapshot'){
      if(canonicalRoom(m.room)!==canonicalRoom(RT.lastRoom))return;
      RT.serverRoom=canonicalRoom(m.room);reconcileSnapshot(m.players);return;
    }
    if(m.type==='player-combat-fx'){
      try{if(window.PPA_REMOTE_COMBAT_FX_RECEIVE)window.PPA_REMOTE_COMBAT_FX_RECEIVE(m)}catch(_){}
      return;
    }
    if(String(m.type||'').indexOf('arena-')===0){
      if(m.type==='arena-queue-state'){
        if(m.state==='waiting'){arenaQueueNotice(m.message||'1×1 · ждём соперника…');arenaQueueStatus('ПОДБОР СОПЕРНИКА 1×1 · ОЖИДАНИЕ…',true)}
        else if(m.state==='cancelled'){arenaQueueStatus('',false);arenaQueueResolve({matched:false,message:m.message||'Поиск отменён'})}
      }
      if(m.type==='arena-match'&&m.room){
        RT.arenaRoom=canonicalRoom(m.room);
        RT.arenaLeavingUntil=0;
        commitRoom(RT.arenaRoom);
        RT.serverRoom=RT.arenaRoom;
        RT.lastRoomSync=Date.now();
        arenaQueueStatus('СОПЕРНИК НАЙДЕН · ВХОД НА АРЕНУ',true);arenaQueueNotice('СОПЕРНИК НАЙДЕН · вход на арену');setTimeout(function(){arenaQueueStatus('',false)},1400);
        arenaQueueResolve({
          matched:true,mode:String(m.mode||'1x1'),matchId:String(m.matchId||''),
          side:String(m.side||'blue'),room:RT.arenaRoom,
          opponentId:String(m.opponentId||''),opponentName:String(m.opponentName||'Игрок')
        });
      }
      try{if(window.PPA_ARENA_NET_RECEIVE)window.PPA_ARENA_NET_RECEIVE(m)}catch(_){}
      return;
    }
    if(m.type==='move'){if(m.player)applyPlayer(m.player,false);return}
    if(m.type==='join'){if(m.player)applyPlayer(m.player,true);return}
    if(m.type==='leave'){deleteRemote(m.id);return}
    if(m.type==='mob-hit-event'||m.type==='mob-authority'||m.type==='mob-authority-snapshot'||m.type==='mob-position'||m.type==='mob-attack'||m.type==='boss-special'){
      try{if(window.PPA_DUNGEON_MOB_EVENT_RECEIVE)window.PPA_DUNGEON_MOB_EVENT_RECEIVE(m)}catch(_){}
      return;
    }
    if(m.type==='mob-state'||m.type==='mob-hp'||m.type==='mob-dead'){
      try{if(window.PPA_DUNGEON_MOB_NET_RECEIVE)window.PPA_DUNGEON_MOB_NET_RECEIVE(m)}catch(_){}
      return;
    }
    if(m.type==='party-invite'){
      try{
        if(window.PPA_SOCIAL_ON_PARTY_INVITE){window.PPA_SOCIAL_ON_PARTY_INVITE(m.from||{});return}
        var f=m.from||{},ok=window.confirm('Игрок '+String(f.name||'Игрок')+' приглашает в группу.\nПринять?');
        send({type:ok?'party-accept':'party-decline',from:String(f.id||'')});
      }catch(_){}
      return;
    }
    if(m.type==='party-state'){syncPartyAllies(m);return}
    if(m.type==='group-skill'){
      try{
        var kind=String(m.skill||''),pct=Math.max(0,Number(m.pct)||0),now=Date.now();
        if(kind==='priest_healing_light'&&pct>0&&typeof P!=='undefined'&&P&&!P.dead&&Number(P.hp)>0){
          P.hp=Math.min(Math.max(1,Number(P.mhp)||1),Number(P.hp||0)+Math.max(1,Math.round(Math.max(1,Number(P.mhp)||1)*pct/100)));
          if(typeof showPickup==='function')showPickup('ИСЦЕЛЯЮЩИЙ СВЕТ · союзник','#fff2b2');
        }else if(kind==='priest_holy_barrier'&&typeof P!=='undefined'&&P){
          var red=Math.max(0,Math.min(45,Number(m.reduction)||0)),dur=Math.max(500,Math.min(6500,Number(m.durationMs)||6000));
          if(!P.v189Buffs)P.v189Buffs={};
          P.v189Buffs.dr={v:red,until:now+dur};
          if(typeof showPickup==='function')showPickup('СВЯЩЕННЫЙ БАРЬЕР · '+Math.round(red)+'%','#fff1aa');
        }else if(kind==='priest_divine_rebirth'&&typeof P!=='undefined'&&P&&(P.dead||Number(P.hp)<=0)){
          var rp=Math.max(1,Math.min(55,Number(m.pct)||35));
          P.hp=Math.max(1,Math.round(Math.max(1,Number(P.mhp)||1)*rp/100));
          P.dead=false;P.aiRootUntil=0;P.aiSlowUntil=0;P.aiDotUntil=0;
          try{var over=document.getElementById('over');if(over)over.style.display='none'}catch(_){}
          if(typeof showPickup==='function')showPickup('БОЖЕСТВЕННОЕ ВОЗРОЖДЕНИЕ · '+rp+'% HP','#fff4bb');
        }
      }catch(_){}
      return
    }
    if(m.type==='party-notice'){partyNotice(m.message,m.ok);return}
    if(m.type==='chat'){try{if(window.PPA_CHAT_RECEIVE)window.PPA_CHAT_RECEIVE(m.channel,m.from,m.text,{target:m.target||''})}catch(_){}return}
    if(m.type==='chat-error'){try{if(window.PPA_CHAT_RECEIVE)window.PPA_CHAT_RECEIVE(m.channel||'general','Система',m.message||'Ошибка чата',{system:true})}catch(_){}return}
  }

  async function connect(){
    if(RT.connecting||!initData())return;
    if(RT.ws&&(RT.ws.readyState===WebSocket.OPEN||RT.ws.readyState===WebSocket.CONNECTING))return;
    disableLegacyOnline();
    RT.connecting=true;status('ONLINE · подключение…','#cceeff');
    try{
      var t=await ticket(),proto=location.protocol==='https:'?'wss:':'ws:';
      var ws=new WebSocket(proto+'//'+location.host+'/api/realtime/ws?ticket='+encodeURIComponent(t.ticket));
      RT.ws=ws;
      ws.onopen=function(){if(RT.ws!==ws)return;RT.connecting=false;RT.retry=0;RT.pingMs=null;RT.pingSent=0;RT.lastServerAt=Date.now();RT.lastRoomSync=0;RT.serverRoom='';RT.roomPeers=null;setConnected(true);sendRoom(true);sendMove(true)};
      ws.onmessage=function(ev){if(RT.ws!==ws)return;try{receive(JSON.parse(ev.data))}catch(_){}};
      ws.onclose=function(){if(RT.ws!==ws)return;RT.ws=null;RT.connecting=false;RT.pingMs=null;RT.pingSent=0;RT.lastServerAt=0;RT.lastRoomSync=0;RT.serverRoom='';RT.roomPeers=null;clearRemotes();syncPartyAllies({partyId:'',members:[]});setConnected(false);scheduleReconnect()};
      ws.onerror=function(){};
    }catch(e){RT.connecting=false;console.warn('PPA realtime connect',e);setConnected(false);scheduleReconnect()}
  }

  window.addEventListener('ppa-chat-send',function(ev){
    var d=ev&&ev.detail?ev.detail:{};
    if(!send({type:'chat',channel:String(d.channel||'general'),target:String(d.target||''),text:String(d.text||'').slice(0,180)})){
      try{if(window.PPA_CHAT_RECEIVE)window.PPA_CHAT_RECEIVE(d.channel||'general','Система','Чат переподключается…',{system:true})}catch(_){}
    }
  });

  setInterval(function(){
    if(!RT.ws||RT.ws.readyState!==WebSocket.OPEN)return;
    disableLegacyOnline();sendRoom(false);sendMove(false);
  },120);

  setInterval(function(){
    if(!RT.ws||RT.ws.readyState!==WebSocket.OPEN)return;
    var now=Date.now();
    if(RT.pingSent&&now-RT.pingSent>10000){
      try{RT.ws.close(4002,'Ping timeout')}catch(_){}
      return;
    }
    if(!RT.pingSent){RT.pingSent=now;send({type:'ping',room:RT.lastRoom||room(),clientTs:now})}
  },5000);

  window.PPA_RT_SEND=send;
  window.PPA_PVP_QUEUE_HANDLER=function(info){
    info=info||{};
    var mode=String(info.mode||'1x1').toLowerCase().replace('×','x');
    if(mode!=='1x1')return Promise.resolve({matched:false,message:'Сначала проверяем живой 1×1'});
    if(RT.arenaQueuePromise)return RT.arenaQueuePromise;
    if(!RT.ws||RT.ws.readyState!==WebSocket.OPEN){
      arenaQueueNotice('АРЕНА · ONLINE переподключается');
      return Promise.resolve({matched:false,message:'ONLINE переподключается'});
    }
    RT.arenaQueueMode=mode;
    RT.arenaQueuePromise=new Promise(function(resolve){RT.arenaQueueResolve=resolve});
    if(!send({type:'arena-queue-join',mode:mode})){
      arenaQueueResolve({matched:false,message:'Не удалось войти в очередь'});
      return Promise.resolve({matched:false,message:'Не удалось войти в очередь'});
    }
    arenaQueueNotice('1×1 · ПОИСК СОПЕРНИКА…');arenaQueueStatus('ПОДБОР СОПЕРНИКА 1×1 · ОЖИДАНИЕ…',true);
    RT.arenaQueueTimer=setTimeout(function(){
      try{send({type:'arena-queue-cancel',mode:mode})}catch(_){}
      arenaQueueStatus('',false);arenaQueueResolve({matched:false,message:'Соперник пока не найден'});
    },90000);
    return RT.arenaQueuePromise;
  };
  window.PPA_RT_COMBAT_FX=function(d){
    try{
      d=d||{};
      var kind=String(d.kind||'');
      if(['gnome-cannon','archer-arrow','melee'].indexOf(kind)<0)return false;
      return send({
        type:'player-combat-fx',kind:kind,
        x:Number(d.x)||0,y:Number(d.y)||0,tx:Number(d.tx)||0,ty:Number(d.ty)||0,
        ang:Number.isFinite(Number(d.ang))?Number(d.ang):0,
        animMs:Math.max(240,Math.min(700,Math.round(Number(d.animMs)||480)))
      });
    }catch(_){return false}
  };
  window.PPA_PLAYER_STEALTH=function(ms){
    ms=Math.max(0,Math.min(3000,Math.round(Number(ms)||0)));
    return send({type:'player-stealth',duration:ms});
  };
  window.PPA_REMOTE_PLAYER_TARGETABLE=function(r){
    try{return !(r&&Number(r.hiddenUntil)>Date.now())}catch(_){return true}
  };
  window.PPA_GROUP_SKILL_HANDLER=function(d){
    try{
      d=d||{};
      var skill=String(d.skill||'');
      if(['priest_healing_light','priest_holy_barrier','priest_divine_rebirth'].indexOf(skill)<0)return false;
      var target=d.target||null,targetId=String((target&&(target.id||target.i||target.__ppaPid))||'');
      return send({
        type:'group-skill',skill:skill,rank:Math.max(1,Math.min(3,Math.round(Number(d.rank)||1))),
        pct:Math.max(0,Math.min(55,Number(d.pct)||0)),
        reduction:Math.max(0,Math.min(45,Number(d.reduction)||0)),
        durationMs:Math.max(0,Math.min(6500,Math.round(Number(d.durationMs)||0))),
        target:targetId
      });
    }catch(_){return false}
  };
  window.PPA_RT_ARENA_CLEAR=function(){
    arenaQueueStatus('',false);
    RT.arenaRoom='';
    RT.arenaLeavingUntil=Date.now()+1400;
    commitRoom('safe');
    RT.lastRoomSync=0;
    setTimeout(function(){if(RT.arenaLeavingUntil<=Date.now())RT.arenaLeavingUntil=0},1500);
    return true;
  };
  window.PPA_REALTIME_RESYNC=resyncRoom;
  window.PPA_REALTIME_RECONNECT=function(){try{if(RT.ws)RT.ws.close(4000,'Identity refresh')}catch(_){};setTimeout(connect,250)};
  window.PPA_REALTIME_DIAG=function(){var d=dungeonInfo(RT.lastRoom);return{connected:!!(RT.ws&&RT.ws.readyState===WebSocket.OPEN),room:RT.lastRoom,serverRoom:RT.serverRoom,roomPeers:RT.roomPeers,online:RT.onlineCount,ping:Number.isFinite(RT.pingMs)?Math.round(RT.pingMs):null,retry:RT.retry,mode:'fullsize',fullscreen:!!(tg()&&tg().isFullscreen),party:(window.PPA_PARTY_STATE&&window.PPA_PARTY_STATE.partyId)||'',dungeonBase:d?d.base:'',dungeonInstance:d&&d.instance?d.instance:0,dungeonCapacity:RT.dungeonCapacity||40,serverAge:RT.lastServerAt?Date.now()-RT.lastServerAt:null}};

  function boot(){
    if(RT.started)return;RT.started=true;disableLegacyOnline();ensureFullsize();armFullsize();
    setTimeout(ensureFullsize,300);setTimeout(fixOnlineBadge,350);setTimeout(connect,250);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();