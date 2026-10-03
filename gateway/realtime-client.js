(function(){
  'use strict';
  window.PPA_REALTIME_V2_ACTIVE=true;

  var RT={
    ws:null,connecting:false,retry:0,retryTimer:0,lastMove:0,lastRoom:'',lastRoomSync:0,
    pendingRoom:'',pendingSince:0,lastX:null,lastY:null,lastHp:null,lastMhp:null,lastDead:null,lastFace:null,
    lastAnim:'',lastLevel:null,lastBm:null,lastAtk:null,lastDef:null,lastRange:null,lastCrit:null,lastCritDmg:null,lastAtkSpd:null,
    onlineCount:0,started:false,pingSent:0,pingMs:null,
    serverClockOffset:0,serverClockReady:false,
    lastServerAt:0,lastSnapshotAt:0,serverRoom:'',roomPeers:null,
    assignBase:'',assignAt:0,dungeonInstance:0,dungeonCapacity:40,
    selfPid:'',serverDeadLocked:false,pkTargetId:'',pkAutoTarget:false,pkLastAttack:0,arenaRoom:'',arenaLeavingUntil:0,arenaMatchId:'',arenaSide:'',arenaOpponentId:'',arenaOpponentName:'',arenaLastAttack:0,arenaLastRoundToken:'',arenaAutoTarget:false,arenaAutoTick:0,
    arenaQueuePromise:null,arenaQueueResolve:null,arenaQueueTimer:0,arenaQueueMode:'',
    clanBossRoom:'',clanBossId:'',clanBossState:null,clanBossSeq:0,
    clanBossEnterPromise:null,clanBossEnterResolve:null,clanBossEnterTimer:0,clanBossRequestId:'',
    clanBossEnteringUntil:0,clanBossSceneSeen:false,clanBossReconnectId:'',clanBossDefeatShown:false
  };
  window.PPA_SERVER_NOW=function(){
    return Date.now()+(RT.serverClockReady?Number(RT.serverClockOffset)||0:0);
  };
  window.PPA_SERVER_CLOCK_OFFSET=function(){
    return RT.serverClockReady?(Number(RT.serverClockOffset)||0):0;
  };
  window.PPA_SERVER_CLOCK_READY=function(){return RT.serverClockReady===true};

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
      if(RT.clanBossRoom)return canonicalRoom(RT.clanBossRoom);
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
  function badgeText(){
    var siege=false;try{siege=typeof P!=='undefined'&&P&&String(P.scene||'')==='clansiege'}catch(_){}
    if(siege)return Number.isFinite(RT.pingMs)?Math.round(RT.pingMs)+' ms':'… ms';
    var s='ONLINE · '+Math.max(1,RT.onlineCount||1);
    if(Number.isFinite(RT.pingMs))s+=' · '+Math.round(RT.pingMs)+' ms';
    return s;
  }

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
      var _siege=false;try{_siege=typeof P!=='undefined'&&P&&String(P.scene||'')==='clansiege'}catch(_){}
      if(mobileUi()){
        el.style.position='fixed';el.style.display='block';el.style.visibility='visible';
        if(_siege){
          el.style.left='auto';el.style.right='8px';el.style.top='58px';el.style.transform='none';
          el.style.padding='2px 4px';el.style.fontSize='8px';el.style.lineHeight='1.05';el.style.maxWidth='64px';
        }else{
          el.style.left='50%';el.style.right='auto';el.style.top='8px';el.style.transform='translateX(-50%)';
          el.style.padding='2px 6px';el.style.fontSize='9px';el.style.lineHeight='1.1';el.style.maxWidth='190px';
        }
        el.style.whiteSpace='nowrap';el.style.opacity='0.95';el.style.pointerEvents='none';el.style.zIndex='9999';
      }else{
        el.style.position='fixed';
        if(_siege){el.style.left='auto';el.style.right='8px';el.style.top='58px';}
        else{el.style.left='8px';el.style.right='auto';el.style.top='8px';}
        el.style.transform='none';
        el.style.padding='5px 8px';el.style.fontSize='10px';el.style.lineHeight='normal';el.style.maxWidth='none';el.style.whiteSpace='normal';el.style.opacity='1';el.style.pointerEvents='auto';
      }
    }catch(_){}
  }
  function status(text,col){try{if(typeof ppaOnlineSetStatus==='function'){ppaOnlineSetStatus(text,col);fixOnlineBadge()}}catch(_){}}
  function refreshBadge(){if(RT.ws&&RT.ws.readyState===WebSocket.OPEN)status(badgeText(),'#9fffc1')}
  function send(o){try{if(RT.ws&&RT.ws.readyState===WebSocket.OPEN){RT.ws.send(JSON.stringify(o));return true}}catch(_){}return false}

  function clanBossEntity(){
    try{
      if(typeof EN==='undefined'||!Array.isArray(EN))return null;
      for(var i=0;i<EN.length;i++)if(EN[i]&&EN[i].isClanBoss)return EN[i];
    }catch(_){}
    return null;
  }
  function clanBossApplyState(st,serverTs){
    if(!st||typeof st!=='object')return false;
    RT.clanBossState=Object.assign({},st);
    RT.clanBossId=String(st.bossId||RT.clanBossId||'');
    try{if(window.PPA_SET_CLAN_BOSS_STATE)window.PPA_SET_CLAN_BOSS_STATE(RT.clanBossState)}catch(_){}
    try{if(window.PPA_CLAN_BOSS_CHEST_STATE)window.PPA_CLAN_BOSS_CHEST_STATE(RT.clanBossState.chest||null,Number(serverTs)||0)}catch(_){}
    try{
      var b=clanBossEntity();
      if(b){
        b.__ppaClanBossServer=true;
        b.bossId=String(st.bossId||RT.clanBossId||b.bossId||'');
        b.clanBossId=b.bossId;
        if(Number.isFinite(Number(st.bossMaxHp)))b.mhp=Math.max(1,Number(st.bossMaxHp));
        if(Number.isFinite(Number(st.bossHp)))b.hp=Math.max(0,Math.min(Math.max(1,Number(b.mhp)||1),Number(st.bossHp)));
      }
    }catch(_){}
    return true;
  }
  function clanBossResolve(result){
    var fn=RT.clanBossEnterResolve;
    RT.clanBossEnterResolve=null;RT.clanBossEnterPromise=null;RT.clanBossRequestId='';
    if(RT.clanBossEnterTimer){clearTimeout(RT.clanBossEnterTimer);RT.clanBossEnterTimer=0}
    if(fn)try{fn(result||{ok:false,message:'Клановый рейд не подтверждён'})}catch(_){}
  }
  function clanBossEnter(bossId){
    bossId=String(bossId||'');
    if(bossId!=='clan_boss_1'&&bossId!=='clan_boss_2')return Promise.resolve({ok:false,message:'Неизвестный клановый босс'});
    if(RT.clanBossEnterPromise)return RT.clanBossEnterPromise;
    if(!RT.ws||RT.ws.readyState!==WebSocket.OPEN)return Promise.resolve({ok:false,message:'ONLINE переподключается'});
    RT.clanBossId=bossId;RT.clanBossSeq=0;RT.clanBossSceneSeen=false;RT.clanBossEnteringUntil=Date.now()+6000;
    RT.clanBossRequestId='cb:'+Date.now().toString(36)+':'+Math.random().toString(36).slice(2,8);
    RT.clanBossEnterPromise=new Promise(function(resolve){RT.clanBossEnterResolve=resolve});
    if(!send({type:'clan-boss-enter',bossId:bossId,requestId:RT.clanBossRequestId})){
      clanBossResolve({ok:false,message:'Не удалось отправить вход к боссу'});
      return Promise.resolve({ok:false,message:'Не удалось отправить вход к боссу'});
    }
    RT.clanBossEnterTimer=setTimeout(function(){
      clanBossResolve({ok:false,message:'Сервер клан-босса не ответил'});
    },8000);
    return RT.clanBossEnterPromise;
  }
  function clanBossLeave(sendServer){
    try{if(sendServer!==false&&RT.clanBossRoom)send({type:'clan-boss-leave',bossId:RT.clanBossId||''})}catch(_){}
    RT.clanBossRoom='';RT.clanBossId='';RT.clanBossState=null;RT.clanBossSeq=0;
    RT.clanBossEnteringUntil=0;RT.clanBossSceneSeen=false;RT.clanBossReconnectId='';RT.clanBossDefeatShown=false;
    try{if(window.PPA_CLAN_BOSS_CHEST_STATE)window.PPA_CLAN_BOSS_CHEST_STATE(null)}catch(_){}
    if(RT.clanBossEnterPromise)clanBossResolve({ok:false,message:'Вход к боссу отменён'});
    commitRoom('safe');RT.lastRoomSync=0;
    return true;
  }
  function clanBossDamage(e,amount,meta){
    try{
      if(!RT.clanBossRoom||!RT.clanBossId||typeof P==='undefined'||!P||P.scene!=='clanboss1')return false;
      var st=RT.clanBossState||{};
      if(String(st.status||'')!=='fighting'&&st.active!==true)return false;
      var dmg=Number(amount);
      if(!Number.isFinite(dmg)||dmg<=0)return false;
      var seq=++RT.clanBossSeq;
      return send({
        type:'clan-boss-hit',bossId:RT.clanBossId,seq:seq,
        amount:Math.round(dmg*100)/100,
        bx:Number(e&&e.x)||0,by:Number(e&&e.y)||0,
        kind:String(meta&&meta.kind||'').slice(0,16)
      });
    }catch(_){return false}
  }
  function clanBossChestOpen(){
    try{
      if(!RT.clanBossRoom||!RT.clanBossId)return false;
      return send({type:'clan-boss-chest-open',bossId:RT.clanBossId});
    }catch(_){return false}
  }
  function clanBossChestComplete(){
    try{
      if(!RT.clanBossRoom||!RT.clanBossId)return false;
      return send({type:'clan-boss-chest-complete',bossId:RT.clanBossId});
    }catch(_){return false}
  }

  function clanBossRewardIds(){
    try{
      var a=JSON.parse(localStorage.getItem('ppaClanBossRewardIdsV1')||'[]');
      return Array.isArray(a)?a:[];
    }catch(_){return []}
  }
  function clanBossRewardSeen(id){
    id=String(id||'');if(!id)return false;
    return clanBossRewardIds().indexOf(id)>=0;
  }
  function clanBossRewardRemember(id){
    id=String(id||'');if(!id)return;
    try{
      var a=clanBossRewardIds().filter(function(x){return String(x)!==id});
      a.unshift(id);if(a.length>120)a.length=120;
      localStorage.setItem('ppaClanBossRewardIdsV1',JSON.stringify(a));
    }catch(_){}
  }
  function clanBossApplyRewardPacket(reward,attempt){
    reward=reward&&typeof reward==='object'?reward:null;
    if(!reward||!reward.rewardId)return false;
    var id=String(reward.rewardId||'');
    if(clanBossRewardSeen(id)){
      send({type:'clan-boss-reward-ack',rewardId:id});
      return true;
    }
    if(!window.PPA_CLAN_BOSS_SPAWN_REWARD){
      if((attempt||0)<10)setTimeout(function(){clanBossApplyRewardPacket(reward,(attempt||0)+1)},180);
      return false;
    }
    var ok=false;
    try{ok=window.PPA_CLAN_BOSS_SPAWN_REWARD(reward)!==false}catch(e){console.warn('Clan boss reward apply',e)}
    if(!ok)return false;
    clanBossRewardRemember(id);
    send({type:'clan-boss-reward-ack',rewardId:id});
    return true;
  }

  function clanBossTick(){
    try{
      var now=Date.now(),sceneNow=(typeof P!=='undefined'&&P)?String(P.scene||''):'';
      if(RT.clanBossRoom){
        if(sceneNow==='clanboss1'){
          RT.clanBossSceneSeen=true;
          if(RT.clanBossState)clanBossApplyState(RT.clanBossState);
        }else if(RT.clanBossSceneSeen&&now>RT.clanBossEnteringUntil){
          clanBossLeave(true);
        }
        return;
      }
      if(sceneNow==='clanboss1'&&!RT.clanBossEnterPromise&&!RT.clanBossReconnectId&&RT.ws&&RT.ws.readyState===WebSocket.OPEN){
        if(typeof changeScene==='function')changeScene('safe');
      }
    }catch(_){}
  }

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
          if(p.g!==undefined)r.clanId=String(p.g||'').slice(0,80);
          if(p.cn!==undefined)r.clanName=String(p.cn||'').trim().slice(0,24);
          if(p.p!==undefined)r.partyId=String(p.p||'');
          if(p.av!==undefined)r.arenaSide=String(p.av||'');
          if(p.am!==undefined)r.arenaMatchId=String(p.am||'');
          if(p.pt!==undefined)r.petName=String(p.pt||'').trim().slice(0,48);
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
      var x=Number(P.x)||0,y=Number(P.y)||0,h=Math.max(0,Math.round(Number(P.hp)||0)),m=Math.max(1,Math.round(Number(P.mhp)||1)),dead=(P.dead||h<=0)?1:0,f=Number(P.face)||1,a=String(P.anim||'idle').slice(0,12),l=selfLevel(),b=selfBm(),c=selfClass();
      var atk=Math.max(1,Number(P.atk)||1),df=Math.max(0,Number(P.def)||0),ar=Math.max(60,Number(P.attackRange)||60),cr=Math.max(0,Number(P.crit)||0),cd=Math.max(100,Number(P.critDmg)||180),as=Math.max(.35,Number(P.atkSpd)||1);
      var changed=RT.lastX===null||Math.abs(x-RT.lastX)>.35||Math.abs(y-RT.lastY)>.35||h!==RT.lastHp||m!==RT.lastMhp||dead!==RT.lastDead||f!==RT.lastFace||a!==RT.lastAnim||l!==RT.lastLevel||b!==RT.lastBm||atk!==RT.lastAtk||df!==RT.lastDef||ar!==RT.lastRange||cr!==RT.lastCrit||cd!==RT.lastCritDmg||as!==RT.lastAtkSpd;
      if(!force&&!changed&&now-RT.lastMove<900)return;
      RT.lastMove=now;RT.lastX=x;RT.lastY=y;RT.lastHp=h;RT.lastMhp=m;RT.lastDead=dead;RT.lastFace=f;RT.lastAnim=a;RT.lastLevel=l;RT.lastBm=b;RT.lastAtk=atk;RT.lastDef=df;RT.lastRange=ar;RT.lastCrit=cr;RT.lastCritDmg=cd;RT.lastAtkSpd=as;
      send({type:'move',room:RT.lastRoom||room(),x:x,y:y,h:h,m:m,dead:dead,f:f,a:a,l:l,b:b,c:c,at:atk,df:df,ar:ar,cr:cr,cd:cd,as:as});
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
    if(m.type==='clan-boss-entered'){
      if(RT.clanBossRequestId&&m.requestId&&String(m.requestId)!==String(RT.clanBossRequestId))return;
      RT.clanBossRoom=canonicalRoom(m.room||'');
      RT.clanBossId=String(m.bossState&&m.bossState.bossId||RT.clanBossId||'');
      RT.clanBossReconnectId='';
      RT.clanBossEnteringUntil=Date.now()+6000;
      RT.clanBossSceneSeen=false;RT.clanBossSeq=0;
      commitRoom(RT.clanBossRoom);RT.serverRoom=RT.clanBossRoom;RT.lastRoomSync=Date.now();
      clanBossApplyState(m.bossState||{},Number(m.ts)||0);
      clanBossResolve({ok:true,bossState:m.bossState||{},message:'Рейд запущен.'});
      sendMove(true);
      return;
    }
    if(m.type==='clan-boss-state'){
      if(m.room&&RT.clanBossRoom&&canonicalRoom(m.room)!==canonicalRoom(RT.clanBossRoom))return;
      clanBossApplyState(m.bossState||{},Number(m.ts)||0);
      return;
    }
    if(m.type==='clan-boss-reward'){
      clanBossApplyRewardPacket(m.reward||{},0);
      return;
    }
    if(m.type==='clan-boss-chest-state'){
      try{if(window.PPA_CLAN_BOSS_CHEST_STATE)window.PPA_CLAN_BOSS_CHEST_STATE(m.chest||null,Number(m.ts)||0)}catch(_){}
      return;
    }
    if(m.type==='clan-boss-chest-opened'){
      try{if(window.PPA_CLAN_BOSS_CHEST_STATE)window.PPA_CLAN_BOSS_CHEST_STATE(m.chest||null,Number(m.ts)||0)}catch(_){}
      try{if(window.PPA_CLAN_BOSS_CHEST_OPENED)window.PPA_CLAN_BOSS_CHEST_OPENED(m||{})}catch(_){}
      return;
    }
    if(m.type==='clan-boss-chest-reject'){
      try{if(typeof showPickup==='function')showPickup(String(m.reason||'Сундук недоступен'),'#ff9c72')}catch(_){}
      return;
    }
    if(m.type==='clan-boss-defeated'){
      clanBossApplyState(m.bossState||Object.assign({},RT.clanBossState||{},{active:false,status:'cooldown',bossHp:0,bossReadyAt:Number(m.cooldownUntil)||0,cooldownUntil:Number(m.cooldownUntil)||0}),Number(m.ts)||0);
      if(!RT.clanBossDefeatShown){
        RT.clanBossDefeatShown=true;
        try{if(typeof showPickup==='function')showPickup('КЛАНОВЫЙ БОСС ПОВЕРЖЕН · ОТКАТ 12 ЧАСОВ','#ffd36a')}catch(_){}
      }
      return;
    }
    if(m.type==='clan-boss-reject'){
      var msg=String(m.reason||'Клановый рейд отклонён');
      if(m.bossState)clanBossApplyState(m.bossState,Number(m.ts)||0);
      if(RT.clanBossEnterPromise)clanBossResolve({ok:false,message:msg,bossState:m.bossState||null});
      if(RT.clanBossReconnectId){
        RT.clanBossReconnectId='';
        try{if(typeof changeScene==='function'&&typeof P!=='undefined'&&P&&P.scene==='clanboss1')changeScene('safe')}catch(_){}
      }
      return;
    }
    if(m.type==='clan-boss-left'){
      clanBossLeave(false);
      return;
    }
    if(m.type==='hello'){
      RT.selfPid=String(m.pid||RT.selfPid||'');
      try{if(typeof PPA_ONLINE!=='undefined'){PPA_ONLINE.selfId=RT.selfPid||String(PPA_ONLINE.selfId||'');PPA_ONLINE.selfName=String(m.name||selfName())}}catch(_){}
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
      var recvAt=Date.now(),sentAt=Math.max(0,Number(m.clientTs)||0),serverAt=Math.max(0,Number(m.ts)||0);
      if(serverAt>0&&sentAt>0&&recvAt>=sentAt){
        var midpoint=sentAt+(recvAt-sentAt)/2;
        var sample=serverAt-midpoint;
        RT.serverClockOffset=RT.serverClockReady?(RT.serverClockOffset*.75+sample*.25):sample;
        RT.serverClockReady=true;
      }
      if(m.room)RT.serverRoom=canonicalRoom(m.room);
      if(Number.isFinite(Number(m.roomCount)))RT.roomPeers=Math.max(1,Number(m.roomCount)||1);
      if(RT.pingSent){var ms=Math.max(0,recvAt-RT.pingSent);RT.pingMs=Number.isFinite(RT.pingMs)?(RT.pingMs*.65+ms*.35):ms;RT.pingSent=0;refreshBadge()}
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
    if(m.type==='player-death-state'){
      RT.serverDeadLocked=!!m.locked;
      if(RT.serverDeadLocked&&typeof P!=='undefined'&&P){
        P.hp=0;P.attacking=false;
      }
      return;
    }
    if(m.type==='player-respawn-state'){
      RT.serverDeadLocked=false;
      if(m.room){
        commitRoom(canonicalRoom(m.room));
        RT.serverRoom=canonicalRoom(m.room);
      }
      try{
        if(typeof P!=='undefined'&&P){
          if(Number.isFinite(Number(m.h)))P.hp=Math.max(1,Number(m.h));
          if(Number.isFinite(Number(m.m)))P.mhp=Math.max(1,Number(m.m));
        }
      }catch(_){}
      sendMove(true);
      return;
    }
    if(String(m.type||'').indexOf('player-pk-')===0){
      try{
        var self=String(RT.selfPid||(window.PPA_ONLINE&&PPA_ONLINE.selfId)||'');
        if(m.type==='player-pk-hit'||m.type==='player-pk-skill-hit'){
          var tid=String(m.target||''),aid=String(m.attacker||'');
          if(tid===self&&typeof P!=='undefined'&&P){
            P.hp=Math.max(0,Number(m.hp)||0);
            if(P.hp<=0){P.attacking=false;RT.serverDeadLocked=true}
          }
          if(aid===self&&typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE.remotes){
            var pr=PPA_ONLINE.remotes.get(tid);
            if(pr&&Number.isFinite(Number(m.hp)))pr.hp=Math.max(0,Number(m.hp));
            if(m.killed&&window.PPA_PK_CLEAR_TARGET)window.PPA_PK_CLEAR_TARGET();
          }
          try{
            if(typeof showPickup==='function'){
              var pd=Math.max(1,Math.round(Number(m.damage)||1));
              if(aid===self)showPickup((m.crit?'КРИТ · ':'')+'ПК · −'+pd,m.crit?'#ffd36a':'#ff9a72');
              else if(tid===self)showPickup('ПК · ПО ТЕБЕ −'+pd,'#ff6f62');
            }
          }catch(_){}
        }else if(m.type==='player-pk-control'){
          if(String(m.target||'')===self&&typeof P!=='undefined'&&P){
            var pn=Date.now(),pdu=Math.max(100,Number(m.duration)||0);
            if(String(m.kind)==='root')P.aiRootUntil=Math.max(Number(P.aiRootUntil)||0,pn+pdu);
            else if(String(m.kind)==='slow'){P.aiSlowMul=Math.max(.3,Math.min(.95,Number(m.mul)||.55));P.aiSlowUntil=Math.max(Number(P.aiSlowUntil)||0,pn+pdu)}
          }
        }else if(m.type==='player-pk-state'){
          try{if(window.PPA_PK_SERVER_STATE)window.PPA_PK_SERVER_STATE(!!m.enabled)}catch(_){}
        }else if(m.type==='player-pk-reject'){
          try{if(typeof showPickup==='function')showPickup('ПК · '+String(m.reason||'атака отклонена'),'#ff8b72')}catch(_){}
        }
      }catch(e){console.warn('PK receive',e)}
      return;
    }
    if(String(m.type||'').indexOf('arena-')===0){
      if(m.type==='arena-queue-state'){
        if(m.state==='waiting'){arenaQueueNotice(m.message||'1×1 · ждём соперника…');arenaQueueStatus('ПОДБОР СОПЕРНИКА 1×1 · ОЖИДАНИЕ…',true)}
        else if(m.state==='cancelled'){arenaQueueStatus('',false);arenaQueueResolve({matched:false,message:m.message||'Поиск отменён'})}
      }

      if(m.type==='arena-match'&&m.room){
        RT.arenaRoom=canonicalRoom(m.room);
        RT.arenaMatchId=String(m.matchId||'');
        RT.arenaSide=String(m.side||'blue');
        RT.arenaOpponentId=String(m.opponentId||'');
        RT.arenaOpponentName=String(m.opponentName||'Игрок');
        RT.arenaLeavingUntil=0;
        commitRoom(RT.arenaRoom);
        RT.serverRoom=RT.arenaRoom;
        RT.lastRoomSync=Date.now();
        arenaQueueStatus('СОПЕРНИК НАЙДЕН · ВХОД НА АРЕНУ',true);
        arenaQueueNotice('СОПЕРНИК НАЙДЕН · вход на арену');
        setTimeout(function(){arenaQueueStatus('',false)},1400);
        arenaQueueResolve({
          matched:true,mode:String(m.mode||'1x1'),matchId:String(m.matchId||''),
          side:String(m.side||'blue'),room:RT.arenaRoom,
          opponentId:String(m.opponentId||''),opponentName:String(m.opponentName||'Игрок')
        });
      }

      if(m.type==='arena-hit'||m.type==='arena-skill-hit'){
        try{
          var selfId=String(RT.selfPid||(window.PPA_ONLINE&&PPA_ONLINE.selfId)||'');
          var targetId=String(m.target||''),attackerId=String(m.attacker||'');
          if(targetId===selfId&&typeof P!=='undefined'&&P){
            P.hp=Math.max(0,Number(m.hp)||0);
            if(P.hp<=0){P.dead=true;P.attacking=false}
          }
          if(attackerId===selfId&&typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE.remotes){
            var rr=PPA_ONLINE.remotes.get(targetId);
            if(rr&&Number.isFinite(Number(m.hp)))rr.hp=Math.max(0,Number(m.hp));
          }
          try{
            if(typeof showPickup==='function'){
              var dmg=Math.max(1,Math.round(Number(m.damage)||1));
              if(attackerId===selfId)showPickup((m.crit?'КРИТ · ':'')+(m.type==='arena-skill-hit'?'НАВЫК · −':'УДАР · −')+dmg,m.crit?'#ffd36a':'#ffb07a');
              else if(targetId===selfId)showPickup((m.type==='arena-skill-hit'?'НАВЫК СОПЕРНИКА · −':'СОПЕРНИК · −')+dmg,'#ff8f78');
            }
          }catch(_){}
          if(m.roundOver){
            var token=String(m.roundToken||m.ts||'');
            if(token&&RT.arenaLastRoundToken!==token){
              RT.arenaLastRoundToken=token;
              setTimeout(function(){
                try{
                  if(typeof P!=='undefined'&&P){
                    P.dead=false;P.hp=Math.max(1,Number(P.mhp)||1);P.mp=Math.max(0,Number(P.mmp)||0);
                    P.tid=null;P.attacking=false;P.shootCD=0;
                    var ov=document.getElementById('over');if(ov)ov.style.display='none';
                  }
                  if(window.PPA_PVP_ROUND_RESULT)window.PPA_PVP_ROUND_RESULT(String(m.winner||''));
                }catch(_){}
              },40);
            }
          }
        }catch(e){console.warn('Arena core hit receive',e)}
      }

      if(m.type==='arena-control'){
        try{
          var mine=String(RT.selfPid||(window.PPA_ONLINE&&PPA_ONLINE.selfId)||'');
          if(String(m.target||'')===mine&&typeof P!=='undefined'&&P){
            var an=Date.now(),dur=Math.max(100,Number(m.duration)||0);
            if(String(m.kind)==='root')P.aiRootUntil=Math.max(Number(P.aiRootUntil)||0,an+dur);
            else if(String(m.kind)==='slow'){
              P.aiSlowMul=Math.max(.3,Math.min(.95,Number(m.mul)||.55));
              P.aiSlowUntil=Math.max(Number(P.aiSlowUntil)||0,an+dur);
            }
          }
        }catch(_){}
      }

      if(m.type==='arena-opponent-left'){
        arenaQueueNotice('АРЕНА · соперник вышел');
        try{if(window.PPA_PVP_MATCH_CANCELLED)window.PPA_PVP_MATCH_CANCELLED({refund:false})}catch(_){}
        try{if(window.PPA_RT_ARENA_CLEAR)window.PPA_RT_ARENA_CLEAR()}catch(_){}
        try{if(typeof changeScene==='function')changeScene('safe')}catch(_){}
      }

      // Combat-only module still receives the match packet so skill targeting knows
      // the confirmed opponent, but core realtime owns hit/control/result application.
      try{
        if(window.PPA_ARENA_NET_RECEIVE &&
           (m.type==='arena-match'||m.type==='arena-reject'))window.PPA_ARENA_NET_RECEIVE(m);
      }catch(_){}
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
      ws.onopen=function(){if(RT.ws!==ws)return;RT.connecting=false;RT.retry=0;RT.pingMs=null;RT.pingSent=0;RT.lastServerAt=Date.now();RT.lastRoomSync=0;RT.serverRoom='';RT.roomPeers=null;setConnected(true);sendRoom(true);sendMove(true);try{send({type:'player-pk-toggle',enabled:!!(window.PPA_PK_ACTIVE&&window.PPA_PK_ACTIVE())})}catch(_){};if(RT.clanBossReconnectId){var _cb=RT.clanBossReconnectId;setTimeout(function(){clanBossEnter(_cb)},80)}};
      ws.onmessage=function(ev){if(RT.ws!==ws)return;try{receive(JSON.parse(ev.data))}catch(_){}};
      ws.onclose=function(){if(RT.ws!==ws)return;if(RT.clanBossRoom&&RT.clanBossId&&RT.clanBossSceneSeen)RT.clanBossReconnectId=RT.clanBossId;RT.clanBossRoom='';RT.ws=null;RT.connecting=false;RT.pingMs=null;RT.pingSent=0;RT.lastServerAt=0;RT.lastRoomSync=0;RT.serverRoom='';RT.roomPeers=null;clearRemotes();syncPartyAllies({partyId:'',members:[]});setConnected(false);scheduleReconnect()};
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
    disableLegacyOnline();sendRoom(false);sendMove(false);clanBossTick();
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

  function arenaRemoteById(id){
    try{
      id=String(id||'');if(!id||typeof PPA_ONLINE==='undefined'||!PPA_ONLINE.remotes)return null;
      return PPA_ONLINE.remotes.get(id)||null;
    }catch(_){return null}
  }
  function arenaRemotePos(r){
    return{
      x:Number.isFinite(Number(r&&r.tx))?Number(r.tx):Number(r&&r.x),
      y:Number.isFinite(Number(r&&r.ty))?Number(r.ty):Number(r&&r.y)
    };
  }
  function arenaBasicRangeClient(){
    var cls='';
    try{cls=String(selfClass()||'').toLowerCase()}catch(_){}
    var map={tank:72,barbarian:78,paladin:74,assassin:48,gnome:360,archer:420,mage:390,priest:330};
    return Number(map[cls])||Math.max(60,Math.min(480,Number(P&&P.attackRange)||60));
  }
  function arenaClientIsMelee(){
    var cls='';try{cls=String(selfClass()||'').toLowerCase()}catch(_){}
    return cls==='tank'||cls==='barbarian'||cls==='paladin'||cls==='assassin';
  }

  function arenaJoystickActive(){
    try{
      var x=(typeof jX!=='undefined')?Number(jX)||0:0;
      var y=(typeof jY!=='undefined')?Number(jY)||0:0;
      return Math.abs(x)>0.04||Math.abs(y)>0.04;
    }catch(_){return false}
  }
  function arenaSetFacingTo(tx,ty){
    try{
      var sx=Number(P.x)||0,sy=Number(P.y)||0,dx=Number(tx)-sx,dy=Number(ty)-sy;
      if(!Number.isFinite(dx)||!Number.isFinite(dy)||(!dx&&!dy))return;
      var ang=Math.atan2(dy,dx);
      P.meleeAng=ang;
      if(typeof dir8Canonical==='function')P.dir8=dir8Canonical(Math.cos(ang),Math.sin(ang));
      if(Math.abs(dx)>.1)P.face=dx<0?-1:1;
    }catch(_){}
  }
  function arenaAutoMoveVector(){
    try{
      if(!RT.arenaAutoTarget||!RT.arenaMatchId||!arenaCombatReady())return null;

      // Any real joystick movement CANCELS the whole attack order.
      // It does not pause and resume after release.
      if(arenaJoystickActive()){
        RT.arenaAutoTarget=false;
        try{if(typeof P!=='undefined'&&P){P.tid=null}}catch(_){}
        return null;
      }

      var r=arenaRemoteById(RT.arenaOpponentId);
      if(!r)return null;
      if(Number(r.hiddenUntil)>Date.now()){
        RT.arenaAutoTarget=false;
        return null;
      }

      var rp=arenaRemotePos(r),sx=Number(P.x)||0,sy=Number(P.y)||0;
      if(!Number.isFinite(rp.x)||!Number.isFinite(rp.y))return null;

      var range=arenaBasicRangeClient();
      var cls=String(selfClass()||'').toLowerCase();
      var stopPad=cls==='assassin'?4:(arenaClientIsMelee()?8:34);
      var dx=rp.x-sx,dy=rp.y-sy,dist=Math.max(.001,Math.hypot(dx,dy));

      arenaSetFacingTo(rp.x,rp.y);

      if(dist<=range+stopPad){
        // Auto-target only approaches. It NEVER attacks or holds movement.
        // Once the target is in range, full manual joystick/attack control returns.
        RT.arenaAutoTarget=false;
        arenaSetFacingTo(rp.x,rp.y);
        return null;
      }

      // Important: do NOT mutate P.x/P.y here.
      // The normal game update consumes this vector, applies P.sp,
      // pvpSlide collision and proper run animation.
      return {x:dx/dist,y:dy/dist};
    }catch(e){
      console.warn('Arena auto move vector',e);
      RT.arenaAutoTarget=false;
      return null;
    }
  }
  function pkActive(){
    try{return !!(window.PPA_PK_ACTIVE&&window.PPA_PK_ACTIVE())}catch(_){return false}
  }
  function pkFindNearest(){
    try{
      if(typeof PPA_ONLINE==='undefined'||!PPA_ONLINE.remotes)return null;
      var best=null,bd=Infinity,now=Date.now();
      PPA_ONLINE.remotes.forEach(function(r){
        if(!r)return;
        var id=String(r.id||r.i||r.__ppaPid||'');
        if(!id||id===String(RT.selfPid||''))return;
        if(Number(r.hp)<=0||Number(r.hiddenUntil)>now)return;
        var p=arenaRemotePos(r);
        if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return;
        var d=Math.hypot(p.x-Number(P.x||0),p.y-Number(P.y||0));
        if(d<bd){bd=d;best=r}
      });
      return best;
    }catch(_){return null}
  }
  function pkTarget(){
    var r=RT.pkTargetId?arenaRemoteById(RT.pkTargetId):null;
    if(r&&Number(r.hp)>0&&Number(r.hiddenUntil)<=Date.now())return r;
    r=pkFindNearest();
    RT.pkTargetId=r?String(r.id||r.i||r.__ppaPid||''):'';
    return r;
  }

  function pkNearestMob(){
    try{
      var e=null;
      if(typeof findNear==='function')e=findNear();
      if(!e||Number(e.hp)<=0)return null;
      var d;
      try{d=(typeof smartAttackDistance==='function')?Number(smartAttackDistance(e)):Math.hypot(Number(e.x)-Number(P.x),Number(e.y)-Number(P.y))}catch(_){d=Math.hypot(Number(e.x)-Number(P.x),Number(e.y)-Number(P.y))}
      if(!Number.isFinite(d))return null;
      return{target:e,distance:d};
    }catch(_){return null}
  }
  function pkNearestPlayerInfo(){
    try{
      var r=pkFindNearest();if(!r)return null;
      var p=arenaRemotePos(r),d=Math.hypot(Number(p.x)-Number(P.x),Number(p.y)-Number(P.y));
      if(!Number.isFinite(d))return null;
      return{target:r,distance:d};
    }catch(_){return null}
  }
  function pkChooseBasicKind(){
    var mob=pkNearestMob(),pl=pkNearestPlayerInfo();
    if(!pl){RT.pkTargetId='';return'mob'}
    if(!mob){
      RT.pkTargetId=String(pl.target&&(pl.target.id||pl.target.i||pl.target.__ppaPid)||'');
      return'player';
    }
    if(pl.distance<mob.distance){
      RT.pkTargetId=String(pl.target&&(pl.target.id||pl.target.i||pl.target.__ppaPid)||'');
      return'player';
    }
    RT.pkTargetId='';
    return'mob';
  }
  function pkAttackMixed(){
    try{
      if(!pkActive())return false;
      if(pkChooseBasicKind()==='player')return pkTryBasicDirect();
      RT.pkAutoTarget=false;RT.pkTargetId='';
      try{if(typeof queueAttack==='function'){queueAttack();return true}}catch(_){}
      return false;
    }catch(_){return false}
  }
  function pkAutoMoveVector(){
    try{
      if(!RT.pkAutoTarget||!pkActive())return null;
      if(arenaJoystickActive()){
        RT.pkAutoTarget=false;RT.pkTargetId='';
        try{if(typeof P!=='undefined'&&P)P.tid=null}catch(_){}
        return null;
      }
      var r=pkTarget();if(!r){RT.pkAutoTarget=false;return null}
      var rp=arenaRemotePos(r),sx=Number(P.x)||0,sy=Number(P.y)||0;
      if(!Number.isFinite(rp.x)||!Number.isFinite(rp.y))return null;
      var range=arenaBasicRangeClient(),cls=String(selfClass()||'').toLowerCase();
      var stopPad=cls==='assassin'?4:(arenaClientIsMelee()?8:34);
      var dx=rp.x-sx,dy=rp.y-sy,dist=Math.max(.001,Math.hypot(dx,dy));
      arenaSetFacingTo(rp.x,rp.y);
      if(dist<=range+stopPad){RT.pkAutoTarget=false;return null}
      return{x:dx/dist,y:dy/dist};
    }catch(e){console.warn('PK auto move',e);RT.pkAutoTarget=false;return null}
  }
  function pkTryBasicDirect(){
    try{
      if(!pkActive())return false;
      if(typeof P==='undefined'||!P||P.dead||P.scene==='safe'||P.scene==='pvp1'||P.scene==='pvpteam'||P.scene==='clansiege')return false;
      var r=pkTarget();
      if(!r){
        try{if(typeof showPickup==='function')showPickup('ПК · игроков рядом нет','#c6b99f')}catch(_){}
        return true;
      }
      // Switching the mixed PK attack to a player must cancel any previous
      // native smart-attack order against a mob, otherwise it resumes later.
      try{if(typeof cancelSmartAttack==='function')cancelSmartAttack()}catch(_){};
      var id=String(r.id||r.i||r.__ppaPid||'');
      var rp=arenaRemotePos(r),sx=Number(P.x)||0,sy=Number(P.y)||0;
      if(!Number.isFinite(rp.x)||!Number.isFinite(rp.y))return true;
      var range=arenaBasicRangeClient(),clsNow=String(selfClass()||'').toLowerCase();
      var dist=Math.hypot(rp.x-sx,rp.y-sy),slack=clsNow==='assassin'?6:(arenaClientIsMelee()?12:58);
      P.tid=id;
      if(dist>range+slack){
        RT.pkAutoTarget=true;
        arenaSetFacingTo(rp.x,rp.y);
        try{if(typeof showPickup==='function')showPickup('ПК · цель выбрана · подбегаю','#ffb06b')}catch(_){}
        return true;
      }
      RT.pkAutoTarget=false;
      var now=Date.now(),rate=Math.max(.35,Math.min(4.5,Number(P.atkSpd)||1));
      var minMs=Math.max(180,Math.round(1000/rate*.82));
      if(now-RT.pkLastAttack<minMs)return true;
      RT.pkLastAttack=now;
      var atk=Math.max(1,Number(P.atk)||1),def=Math.max(0,Number(r.def)||0);
      var critChance=Math.max(0,Math.min(95,Number(P.crit)||0));
      var crit=Math.random()*100<critChance,critMul=crit?Math.max(1,(Number(P.critDmg)||180)/100):1;
      var damage=Math.max(1,Math.floor((10+atk)*critMul-def));
      if(!send({type:'player-pk-hit',target:id,amount:damage,crit:crit,range:range})){
        try{if(typeof showPickup==='function')showPickup('ПК · ONLINE переподключается','#ff987a')}catch(_){}
        return true;
      }
      arenaSetFacingTo(rp.x,rp.y);
      try{
        P.attacking=true;P.anim='attack';P.animFrame=0;P.animTimer=0;P.shootT=1;P.recoil=1;
        P.shootCD=Math.max(1,Math.round(60/rate));
      }catch(_){}
      try{
        var cls=String(selfClass()||'').toLowerCase();
        var kind=cls==='gnome'?'gnome-cannon':(cls==='archer'?'archer-arrow':'melee');
        if(window.PPA_RT_COMBAT_FX)window.PPA_RT_COMBAT_FX({kind:kind,x:sx,y:sy,tx:rp.x,ty:rp.y,ang:Math.atan2(rp.y-sy,rp.x-sx),animMs:420});
      }catch(_){}
      if(Number(P.smokeUntil)>now){P.smokeUntil=0;P.smokeDodgeBonus=0;try{send({type:'player-stealth',duration:0})}catch(_){}}
      return true;
    }catch(e){console.warn('PK direct basic',e);return false}
  }

  function arenaCombatReady(){
    try{
      if(!RT.arenaMatchId||!RT.arenaRoom||!RT.arenaOpponentId)return false;
      if(typeof P==='undefined'||!P||(P.scene!=='pvp1'&&P.scene!=='pvpteam'))return false;
      if(window.PPA_PVP_CAN_DAMAGE&&!window.PPA_PVP_CAN_DAMAGE())return false;
      return !P.dead&&Number(P.hp)>0;
    }catch(_){return false}
  }
  function arenaTryBasicDirect(){
    try{
      if(!RT.arenaMatchId||!RT.arenaOpponentId)return false;
      if(typeof P==='undefined'||!P||(P.scene!=='pvp1'&&P.scene!=='pvpteam'))return false;
      if(!arenaCombatReady()){
        try{if(typeof showPickup==='function')showPickup('АРЕНА · подготовка к раунду','#d9ba82')}catch(_){}
        return true;
      }
      var r=arenaRemoteById(RT.arenaOpponentId);
      if(!r){
        try{if(typeof showPickup==='function')showPickup('АРЕНА · синхронизация соперника…','#ffd36d')}catch(_){}
        return true;
      }
      if(Number(r.hiddenUntil)>Date.now()){
        try{if(typeof showPickup==='function')showPickup('АРЕНА · соперник скрыт','#a9a0c9')}catch(_){}
        return true;
      }
      var rp=arenaRemotePos(r),sx=Number(P.x)||0,sy=Number(P.y)||0;
      if(!Number.isFinite(rp.x)||!Number.isFinite(rp.y))return true;
      var range=arenaBasicRangeClient();
      var clsNow=String(selfClass()||'').toLowerCase();
      var dist=Math.hypot(rp.x-sx,rp.y-sy),slack=clsNow==='assassin'?6:(arenaClientIsMelee()?12:58);
      if(dist>range+slack){
        RT.arenaAutoTarget=true;
        arenaSetFacingTo(rp.x,rp.y);
        try{if(typeof showPickup==='function')showPickup('АРЕНА · цель выбрана · подбегаю','#ffd36d')}catch(_){}
        return true;
      }
      RT.arenaAutoTarget=false;
      var now=Date.now(),rate=Math.max(.35,Math.min(4.5,Number(P.atkSpd)||1));
      var minMs=Math.max(180,Math.round(1000/rate*.82));
      if(now-RT.arenaLastAttack<minMs)return true;
      RT.arenaLastAttack=now;

      var atk=Math.max(1,Number(P.atk)||1),def=Math.max(0,Number(r.def)||0);
      var critChance=Math.max(0,Math.min(95,Number(P.crit)||0));
      var crit=Math.random()*100<critChance;
      var critMul=crit?Math.max(1,(Number(P.critDmg)||180)/100):1;
      var penPct=0;
      try{
        var ck=typeof classBaseKey==='function'?String(classBaseKey()||''):'';
        penPct=((ck==='mage'||ck==='priest')?Number(P.magicPen)||0:Number(P.armorPen)||0)/100;
      }catch(_){}
      penPct=Math.max(0,Math.min(.60,penPct));
      var raw=(10+atk)*critMul,effDef=def*(1-penPct);
      var damage=Math.max(1,Math.floor(raw-effDef));

      if(!send({type:'arena-hit',matchId:RT.arenaMatchId,target:RT.arenaOpponentId,amount:damage,crit:crit,range:range})){
        try{if(typeof showPickup==='function')showPickup('АРЕНА · ONLINE переподключается','#ff987a')}catch(_){}
        return true;
      }
      try{
        var attackAng=Math.atan2(rp.y-sy,rp.x-sx);
        arenaSetFacingTo(rp.x,rp.y);
        P.attacking=true;P.anim='attack';P.animFrame=0;P.animTimer=0;P.shootT=1;P.recoil=1;
        P.shootCD=Math.max(1,Math.round(60/rate));
      }catch(_){}
      try{
        var cls='';
        try{cls=String(typeof classBaseKey==='function'?classBaseKey():'').toLowerCase()}catch(_){}
        var kind=cls==='gnome'?'gnome-cannon':(cls==='archer'?'archer-arrow':'melee');
        if(window.PPA_RT_COMBAT_FX)window.PPA_RT_COMBAT_FX({kind:kind,x:sx,y:sy,tx:rp.x,ty:rp.y,ang:Math.atan2(rp.y-sy,rp.x-sx),animMs:420});
      }catch(_){}
      if(Number(P.smokeUntil)>now){
        P.smokeUntil=0;P.smokeDodgeBonus=0;
        try{send({type:'player-stealth',duration:0})}catch(_){}
      }
      return true;
    }catch(e){console.warn('Arena direct basic',e);return false}
  }

  function bindArenaSmartMovement(){
    if(window.__PPA_ARENA_SMART_MOVE_BOUND)return;
    window.__PPA_ARENA_SMART_MOVE_BOUND=true;
    try{
      var base=window.updateSmartAttackInput;
      if(typeof base!=='function')return;
      window.updateSmartAttackInput=function(){
        if(RT.arenaAutoTarget&&RT.arenaMatchId){
          var mv=arenaAutoMoveVector();
          if(mv)return mv;
          if(arenaJoystickActive())return null;
        }
        if(RT.pkAutoTarget&&pkActive()){
          var pm=pkAutoMoveVector();
          if(pm)return pm;
          if(arenaJoystickActive())return null;
        }
        return base();
      };
    }catch(e){console.warn('Arena smart movement bind',e)}
  }

  function bindArenaAttackCapture(){
    if(window.__PPA_ARENA_ATTACK_CAPTURE)return;
    window.__PPA_ARENA_ATTACK_CAPTURE=true;
    var blockUntil=0;
    function isAttackTarget(ev){
      try{
        var t=ev&&ev.target;
        return !!(t&&((t.id==='bAtk')||(t.closest&&t.closest('#bAtk'))));
      }catch(_){return false}
    }
    function stop(ev){
      try{ev.preventDefault()}catch(_){}
      try{ev.stopPropagation()}catch(_){}
      try{ev.stopImmediatePropagation()}catch(_){}
    }
    document.addEventListener('pointerdown',function(ev){
      if(!isAttackTarget(ev))return;
      if(RT.arenaMatchId){stop(ev);blockUntil=Date.now()+550;arenaTryBasicDirect();return}
      if(pkActive()){stop(ev);blockUntil=Date.now()+550;pkAttackMixed();return}
    },true);
    ['touchstart','touchend','click'].forEach(function(type){
      document.addEventListener(type,function(ev){
        if(!isAttackTarget(ev))return;
        var arenaNow=!!RT.arenaMatchId,pkNow=!arenaNow&&pkActive();if(!arenaNow&&!pkNow)return;
        if(Date.now()<=blockUntil||type!=='click')stop(ev);
        if(type==='click'&&Date.now()>blockUntil){stop(ev);blockUntil=Date.now()+550;if(arenaNow)arenaTryBasicDirect();else pkAttackMixed()}
      },true);
    });
  }

  function bindServerRespawnConfirm(){
    if(window.__PPA_SERVER_RESPAWN_CONFIRM_BOUND)return;
    var base=window.respawnAfterDeath;
    if(typeof base!=='function')return;
    window.__PPA_SERVER_RESPAWN_CONFIRM_BOUND=true;
    window.respawnAfterDeath=function(){
      var wasDead=false;
      try{wasDead=!!(P&&(P.dead||Number(P.hp)<=0))}catch(_){}
      var result=base.apply(this,arguments);
      if(wasDead){
        RT.serverDeadLocked=false;
        RT.pkTargetId='';RT.pkAutoTarget=false;
        try{if(window.PPA_PK_SET)window.PPA_PK_SET(false)}catch(_){}
        try{
          send({
            type:'player-respawn-confirm',
            wasDead:1,
            room:room(),
            scene:String(P&&P.scene||'safe'),
            x:Number(P&&P.x)||0,y:Number(P&&P.y)||0,
            h:Math.max(1,Math.round(Number(P&&P.hp)||1)),
            m:Math.max(1,Math.round(Number(P&&P.mhp)||1))
          });
        }catch(_){}
      }
      return result;
    };
  }

  window.PPA_RT_SEND=send;
  window.PPA_CLAN_BOSS_ENTER=clanBossEnter;
window.PPA_CLAN_BOSS_CHEST_OPEN=clanBossChestOpen;
window.PPA_CLAN_BOSS_CHEST_COMPLETE=clanBossChestComplete;
window.PPA_CLAN_BOSS_SELF_PID=function(){return String(RT.selfPid||'')};
  window.PPA_CLAN_BOSS_DAMAGE=clanBossDamage;
  window.PPA_CLAN_BOSS_SERVER_ACTIVE=function(){try{return !!(RT.clanBossRoom&&typeof P!=='undefined'&&P&&P.scene==='clanboss1')}catch(_){return false}};
  window.ppaClanBossTrackDamageLocal=function(amount){
    if(window.PPA_CLAN_BOSS_SERVER_ACTIVE&&window.PPA_CLAN_BOSS_SERVER_ACTIVE())return amount;
    try{if(typeof clanBossTrackDamage==='function')return clanBossTrackDamage(amount)}catch(_){}
    return amount;
  };
  window.PPA_CLAN_BOSS_LEAVE=function(){return clanBossLeave(true)};
  window.PPA_PK_CLEAR_TARGET=function(){RT.pkTargetId='';RT.pkAutoTarget=false;try{if(P)P.tid=null}catch(_){};return true};
  window.PPA_PK_TARGET_ID=function(){return String(RT.pkTargetId||'')};
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
      var fxX=Number(d.x)||0,fxY=Number(d.y)||0;
      // PPA_GNOME_FX_3D_MUZZLE_20261002
      if(kind==='gnome-cannon'){
        try{
          var muzzle=window.PPA_PLAYER3D&&typeof window.PPA_PLAYER3D.muzzle==='function'?window.PPA_PLAYER3D.muzzle('local'):null;
          if(muzzle&&Number.isFinite(Number(muzzle.x))&&Number.isFinite(Number(muzzle.y))){fxX=Number(muzzle.x);fxY=Number(muzzle.y)}
        }catch(_){}
      }
      return send({
        type:'player-combat-fx',kind:kind,
        x:fxX,y:fxY,tx:Number(d.tx)||0,ty:Number(d.ty)||0,
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
    RT.arenaRoom='';RT.arenaMatchId='';RT.arenaSide='';RT.arenaOpponentId='';RT.arenaOpponentName='';RT.arenaLastAttack=0;RT.arenaLastRoundToken='';RT.arenaAutoTarget=false;
    RT.arenaLeavingUntil=Date.now()+1400;
    commitRoom('safe');
    RT.lastRoomSync=0;
    setTimeout(function(){if(RT.arenaLeavingUntil<=Date.now())RT.arenaLeavingUntil=0},1500);
    return true;
  };
  window.PPA_ARENA_MATCH_END=function(){
    try{
      var mid=RT.arenaMatchId;
      if(mid||RT.arenaRoom)send({type:'arena-leave',matchId:mid||''});
    }catch(_){}
    try{if(window.PPA_ARENA_COMBAT_CLEAR)window.PPA_ARENA_COMBAT_CLEAR()}catch(_){}
    return window.PPA_RT_ARENA_CLEAR();
  };
  window.PPA_REALTIME_RESYNC=resyncRoom;
  // PPA_REALTIME_IDENTITY_INBAND_20261003: metadata refresh stays on the live socket.
  window.PPA_REALTIME_IDENTITY_SYNC=function(name){
    var clean=String(name||'').trim().slice(0,24);
    return send({type:'identity-sync',name:clean});
  };
  // Keep a manual recovery hook for diagnostics only. Identity/profile updates must not call it.
  window.PPA_REALTIME_RECONNECT=function(){try{if(RT.ws)RT.ws.close(4001,'Manual reconnect')}catch(_){};setTimeout(connect,250)};
  window.PPA_REALTIME_DIAG=function(){var d=dungeonInfo(RT.lastRoom);return{connected:!!(RT.ws&&RT.ws.readyState===WebSocket.OPEN),room:RT.lastRoom,serverRoom:RT.serverRoom,roomPeers:RT.roomPeers,online:RT.onlineCount,ping:Number.isFinite(RT.pingMs)?Math.round(RT.pingMs):null,retry:RT.retry,mode:'fullsize',fullscreen:!!(tg()&&tg().isFullscreen),party:(window.PPA_PARTY_STATE&&window.PPA_PARTY_STATE.partyId)||'',dungeonBase:d?d.base:'',dungeonInstance:d&&d.instance?d.instance:0,dungeonCapacity:RT.dungeonCapacity||40,serverAge:RT.lastServerAt?Date.now()-RT.lastServerAt:null,serverClockReady:RT.serverClockReady,serverClockOffset:Math.round(Number(RT.serverClockOffset)||0),selfPid:RT.selfPid,arenaMatchId:RT.arenaMatchId,arenaSide:RT.arenaSide,arenaOpponentId:RT.arenaOpponentId,arenaCombatReady:arenaCombatReady(),pkActive:pkActive(),pkTargetId:RT.pkTargetId,serverDeadLocked:RT.serverDeadLocked,clanBossRoom:RT.clanBossRoom,clanBossId:RT.clanBossId,clanBossState:RT.clanBossState}};

  function boot(){
    if(RT.started)return;RT.started=true;disableLegacyOnline();ensureFullsize();armFullsize();bindServerRespawnConfirm();bindArenaSmartMovement();bindArenaAttackCapture();
    setTimeout(ensureFullsize,300);setTimeout(fixOnlineBadge,350);setTimeout(connect,250);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();