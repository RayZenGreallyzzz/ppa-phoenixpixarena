(function(){
  'use strict';

  var S={
    started:false,room:'',seq:0,lastSend:0,lastHeartbeat:0,
    states:new Map(),hp:new Map(),tombs:new Map(),seen:0,
    owned:0,remoteOwned:0,synced:0,lastNetAt:0,intentUntil:0,lastIntentAt:0
  };
  var APPLYING=0;

  function canonicalRoom(v){
    var r=String(v==null?'':v).trim().toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,72);
    return r||'safe';
  }
  function rtDiag(){try{return window.PPA_REALTIME_DIAG?window.PPA_REALTIME_DIAG():null}catch(_){return null}}
  function room(){var d=rtDiag();return canonicalRoom(d&&d.room||'safe')}
  function onlineState(){try{return (typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE)?PPA_ONLINE:null}catch(_){return null}}
  function selfId(){var o=onlineState();return String((o&&o.selfId)||'')}
  function localParty(){try{return String((window.PPA_PARTY_STATE&&window.PPA_PARTY_STATE.partyId)||'')}catch(_){return ''}}
  function entities(){try{return (typeof EN!=='undefined'&&Array.isArray(EN))?EN:[]}catch(_){return []}}
  function player(){try{return (typeof P!=='undefined'&&P)?P:null}catch(_){return null}}
  function active(){
    var p=player(),d=rtDiag(),r=room();
    return !!(p&&p.scene==='dungeon'&&d&&d.connected&&/^dungeon-/.test(r)&&typeof window.PPA_RT_SEND==='function');
  }
  function n(v,def){v=Number(v);return Number.isFinite(v)?v:(def||0)}
  function r1(v){return Math.round(n(v,0)*10)/10}
  function r2(v){return Math.round(n(v,0)*100)/100}
  function mobKey(e){
    if(!e||e.isBoss||e.si===undefined||e.si===null)return '';
    var si=Math.floor(Number(e.si));
    return Number.isFinite(si)&&si>=0&&si<10000?'s'+si:'';
  }
  function findMob(key){
    var a=entities();
    for(var i=0;i<a.length;i++)if(mobKey(a[i])===key)return a[i];
    return null;
  }
  function send(o){
    try{
      if(!active())return false;
      o.room=room();
      return !!window.PPA_RT_SEND(o);
    }catch(_){return false}
  }

  function rewardEligible(killer,party){
    killer=String(killer||'');party=String(party||'');
    if(!killer)return false;
    if(killer===selfId())return true;
    var lp=localParty();
    return !!(party&&lp&&party===lp);
  }

  function applyRewardFlag(e,killer,party){
    if(!e)return;
    e.__ppaLootEligible=rewardEligible(killer,party);
    e.__ppaRewardKiller=String(killer||'');
    e.__ppaRewardParty=String(party||'');
  }

  // The base game awards XP/kills locally whenever an entity reaches 0 HP.
  // Realtime deaths happen on every client, so only the killer (or killer's
  // current party) is allowed to receive combat credit.
  window.PPA_MOB_REWARD_ELIGIBLE=function(e){
    try{
      if(!active()||!mobKey(e))return true;
      return !!(e&&e.__ppaLootEligible===true);
    }catch(_){return true}
  };

  function installDropGuard(){
    try{
      if(window.__PPA_DUNGEON_DROP_GUARD_V297)return true;
      if(typeof dropLoot!=='function')return false;
      var base=dropLoot;
      dropLoot=function(e){
        if(active()&&mobKey(e)&&e&&e.__ppaLootEligible!==true)return;
        return base(e);
      };
      try{window.dropLoot=dropLoot}catch(_){}
      window.__PPA_DUNGEON_DROP_GUARD_V297=true;
      return true;
    }catch(_){return false}
  }

  function markTomb(key,at,serverTs){
    key=String(key||'');if(!key)return;
    var now=Date.now(),raw=Number(at),srv=Number(serverTs),until=0;
    if(Number.isFinite(raw)&&Number.isFinite(srv)){
      var ttl=Math.max(250,Math.min(60000,raw-srv));
      until=now+ttl;
    }else until=Math.max(now+250,Number.isFinite(raw)?raw:0);
    var old=S.tombs.get(key)||0;
    if(until>old)S.tombs.set(key,until);
  }

  function markCombatIntent(ms){
    var now=Date.now();
    S.lastIntentAt=now;
    S.intentUntil=Math.max(S.intentUntil,now+Math.max(250,Number(ms)||900));
  }
  function isCombatControl(t){
    if(!t||!t.closest)return false;
    return !!t.closest('#bAtk,#s1,#s2,#s3,#s4');
  }
  function armCombatIntent(){
    document.addEventListener('pointerdown',function(e){
      if(isCombatControl(e.target))markCombatIntent(e.target&&e.target.id==='bAtk'?1200:2200);
    },true);
    document.addEventListener('touchstart',function(e){
      if(isCombatControl(e.target))markCombatIntent(e.target&&e.target.id==='bAtk'?1200:2200);
    },{capture:true,passive:true});
  }
  function damageAllowed(e){
    var now=Date.now();
    if(now<=S.intentUntil){
      if(e)e.__ppaCombatTrackedUntil=Math.max(Number(e.__ppaCombatTrackedUntil)||0,now+15000);
      return true;
    }
    return !!(e&&now<Number(e.__ppaCombatTrackedUntil||0));
  }

  function sendDamage(e,key,before,after){
    var amount=Math.max(0,Number(before)-Number(after));
    if(!(amount>0)||!key||!damageAllowed(e))return false;
    var id=(selfId()||'self')+':'+(++S.seq)+':'+Date.now().toString(36);
    return send({type:'mob-damage',key:key,amount:r2(amount),before:r2(before),event:id});
  }

  function localCombatEvidence(e){
    try{
      var p=player();
      if(e&&Number(e.flash)>0)return true;
      if(p&&(p.attacking||Number(p.shootT)>0||Number(p.shootCD)>0)){
        if(!e||p.tid==null||String(p.tid)===String(e.id))return true;
        if(e&&e.aggro)return true;
      }
      return false;
    }catch(_){return false}
  }

  function hookHp(e){
    if(!e||e.__ppaMobSyncHook)return;
    var key=mobKey(e);if(!key)return;
    var hp=Number(e.hp);if(!Number.isFinite(hp))hp=0;
    try{
      Object.defineProperty(e,'hp',{
        configurable:true,enumerable:true,
        get:function(){return hp},
        set:function(v){
          var nv=Number(v);if(!Number.isFinite(nv))return;
          var old=hp;
          if(APPLYING||!active()||!(nv<old)||old<=0){hp=nv;return}
          if(e.__ppaLethalPending&&nv<old)return;

          // Hold lethal damage at 0.01 until the current JS turn finishes.
          // The base game also writes hp=0 for non-combat cleanup/despawn paths;
          // treating every decrease as an attack was creating "mobs die by themselves".
          var lethal=nv<=0,token=(Number(e.__ppaDamageToken)||0)+1;
          e.__ppaDamageToken=token;
          if(lethal){e.__ppaLethalPending=true;hp=Math.min(old,0.01)}
          else hp=nv;

          Promise.resolve().then(function(){
            if(Number(e.__ppaDamageToken)!==token)return;
            if(!active())return;
            if(!damageAllowed(e)){
              hp=old;
              e.__ppaLethalPending=false;
              return;
            }
            S.hp.set(key,{hp:Math.max(0,nv),at:Date.now()});
            if(!sendDamage(e,key,old,nv)){
              hp=old;
              e.__ppaLethalPending=false;
              S.hp.delete(key);
              return;
            }
            if(!lethal)hp=nv;
          });
        }
      });
      e.__ppaMobSyncHook=1;
      e.__ppaMobSyncBaseSp=Number.isFinite(Number(e.sp))?Number(e.sp):0;
    }catch(_){}
  }

  function setHp(e,hp){
    if(!e||!Number.isFinite(Number(hp)))return;
    APPLYING++;
    try{e.hp=Math.max(0,Number(hp))}catch(_){}
    APPLYING--;
  }

  function candidates(){
    var out=[],p=player(),sid=selfId(),now=Date.now(),o=onlineState();
    if(p&&sid&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y)))out.push({id:sid,x:Number(p.x),y:Number(p.y)});
    try{
      if(o&&o.remotes)o.remotes.forEach(function(r,id){
        if(!r)return;
        var x=Number(r.x),y=Number(r.y),rid=String(r.id||r.i||id||'');
        if(!rid||rid===sid||!Number.isFinite(x)||!Number.isFinite(y))return;
        var at=Number(r.__ppaRtAt||0);if(at&&now-at>4000)return;
        out.push({id:rid,x:x,y:y});
      });
    }catch(_){}
    return out;
  }

  function ownerFor(e,players){
    var sid=selfId();if(!sid)return '';
    var hx=Number(e&&e.hx),hy=Number(e&&e.hy);
    if(!Number.isFinite(hx)||!Number.isFinite(hy)){hx=Number(e&&e.x)||0;hy=Number(e&&e.y)||0}
    var best='',bd=Infinity;
    for(var i=0;i<players.length;i++){
      var q=players[i],dx=q.x-hx,dy=q.y-hy,d=dx*dx+dy*dy;
      if(d<bd-0.01||(Math.abs(d-bd)<=0.01&&String(q.id)<best)){best=String(q.id);bd=d}
    }
    return best||sid;
  }

  function relevant(e,players){
    if(!e)return false;
    if(e.aggro||Number(e.hp)<Number(e.mhp))return true;
    var x=Number(e.x)||0,y=Number(e.y)||0;
    for(var i=0;i<players.length;i++){
      var dx=players[i].x-x,dy=players[i].y-y;
      if(dx*dx+dy*dy<=900*900)return true;
    }
    return false;
  }

  function restoreSpeed(e){
    if(!e)return;
    if(Number.isFinite(Number(e.__ppaMobSyncBaseSp)))e.sp=Number(e.__ppaMobSyncBaseSp);
  }
  function freezeSpeed(e){
    if(!e)return;
    if(!Number.isFinite(Number(e.__ppaMobSyncBaseSp)))e.__ppaMobSyncBaseSp=Number(e.sp)||0;
    e.sp=0;
  }

  function applyRemoteState(e,st){
    if(!e||!st)return;
    e.x=st.x;e.y=st.y;
    if(st.aggro!==null)e.aggro=!!st.aggro;
    if(st.animDir!==null)e.animDir=st.animDir;
    if(st.animMoving!==null)e.animMoving=!!st.animMoving;
    if(st.spiderDir!==null)e.spiderDir=st.spiderDir;
    if(st.spiderMoving!==null)e.spiderMoving=!!st.spiderMoving;
  }

  function receiveState(m){
    var now=Date.now(),rows=Array.isArray(m.rows)?m.rows:[],from=String(m.from||'');
    for(var i=0;i<rows.length;i++){
      var z=rows[i];if(!Array.isArray(z)||z.length<5)continue;
      var key=String(z[0]||'');if(!/^s\d{1,4}$/.test(key))continue;
      var x=Number(z[1]),y=Number(z[2]),hp=Number(z[3]);
      if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(hp))continue;
      S.states.set(key,{from:from,x:x,y:y,aggro:z[5]==null?null:Number(z[5])!==0,
        animDir:z[6]==null?null:Number(z[6]),animMoving:z[7]==null?null:Number(z[7])!==0,
        spiderDir:z[8]==null?null:Number(z[8]),spiderMoving:z[9]==null?null:Number(z[9])!==0,at:now});
      // Position/animation snapshots are not death authority.
      // Positive HP is useful for late joiners; zero HP is accepted only through mob-dead/mob-hp.
      if(hp>0)S.hp.set(key,{hp:hp,at:now});
    }
    var dead=Array.isArray(m.dead)?m.dead:[];
    for(var j=0;j<dead.length;j++){
      var d=dead[j];if(!Array.isArray(d)||d.length<2)continue;
      var dk=String(d[0]||''),at=Number(d[1]);
      if(/^s\d{1,4}$/.test(dk)&&Number.isFinite(at)){
        markTomb(dk,at,m.ts);
        var de=findMob(dk);
        if(de){hookHp(de);applyRewardFlag(de,d[2],d[3]);de.__ppaLethalPending=false;setHp(de,0)}
      }
    }
    S.lastNetAt=now;
  }

  function receiveHp(m){
    var key=String(m.key||''),hp=Number(m.hp),now=Date.now();
    if(!/^s\d{1,4}$/.test(key)||!Number.isFinite(hp))return;
    S.hp.set(key,{hp:Math.max(0,hp),at:now});
    var e=findMob(key);
    if(e){
      hookHp(e);
      e.__ppaLethalPending=false;
      if(hp<=0)applyRewardFlag(e,m.killer,m.party);
      setHp(e,hp);
    }
    if(hp<=0&&Number.isFinite(Number(m.respawnAt)))markTomb(key,Number(m.respawnAt),m.ts);
    S.lastNetAt=now;
  }

  function receiveDead(m){
    var key=String(m.key||''),at=Number(m.respawnAt);
    if(!/^s\d{1,4}$/.test(key)||!Number.isFinite(at))return;
    markTomb(key,at,m.ts);
    var e=findMob(key);
    if(e){hookHp(e);applyRewardFlag(e,m.killer,m.party);e.__ppaLethalPending=false;setHp(e,0)}
    S.lastNetAt=Date.now();
  }

  window.PPA_DUNGEON_MOB_NET_RECEIVE=function(m){
    try{
      if(!m||canonicalRoom(m.room)!==room())return;
      if(m.type==='mob-state')receiveState(m);
      else if(m.type==='mob-hp')receiveHp(m);
      else if(m.type==='mob-dead')receiveDead(m);
    }catch(e){console.warn('PPA dungeon mob receive',e)}
  };

  function rowFor(e,key){
    return [key,r1(e.x),r1(e.y),r2(e.hp),r2(e.mhp),e.aggro?1:0,
      e.animDir==null?null:Number(e.animDir),e.animMoving?1:0,
      e.spiderDir==null?null:Number(e.spiderDir),e.spiderMoving?1:0];
  }

  function sendRows(rows){
    var chunk=16;
    for(var i=0;i<rows.length;i+=chunk)send({type:'mob-state',rows:rows.slice(i,i+chunk)});
  }

  function tick(){
    var now=Date.now(),r=room();
    if(r!==S.room){
      S.room=r;S.states.clear();S.hp.clear();S.tombs.clear();S.lastSend=0;S.lastHeartbeat=0;
    }
    if(!active())return;

    S.tombs.forEach(function(at,key){if(now>=at){S.tombs.delete(key);S.hp.delete(key);S.states.delete(key)}});

    var list=entities(),ps=candidates(),sid=selfId(),rows=[];
    var owned=0,remoteOwned=0,synced=0,seen=0;
    for(var i=0;i<list.length;i++){
      var e=list[i],key=mobKey(e);if(!key)continue;
      seen++;hookHp(e);

      var tomb=S.tombs.get(key)||0;
      if(tomb>now){setHp(e,0);continue}

      var h=S.hp.get(key);
      if(h&&now-h.at<3500&&Number.isFinite(Number(h.hp))&&Number(h.hp)>0&&!e.__ppaLethalPending)setHp(e,h.hp);

      var owner=ownerFor(e,ps);
      if(owner&&owner!==sid){
        remoteOwned++;freezeSpeed(e);
        var st=S.states.get(key);
        if(st&&st.from===owner&&now-st.at<1800){applyRemoteState(e,st);synced++}
      }else{
        owned++;restoreSpeed(e);
        if(relevant(e,ps))rows.push(rowFor(e,key));
      }
    }
    S.seen=seen;S.owned=owned;S.remoteOwned=remoteOwned;S.synced=synced;

    if(now-S.lastSend>=180){
      S.lastSend=now;
      if(rows.length){sendRows(rows);S.lastHeartbeat=now}
      else if(now-S.lastHeartbeat>=700){send({type:'mob-state',rows:[]});S.lastHeartbeat=now}
    }
  }

  function boot(){
    if(S.started)return;S.started=true;
    installDropGuard();
    setTimeout(installDropGuard,250);
    armCombatIntent();
    setInterval(tick,50);
    document.addEventListener('visibilitychange',function(){if(!document.hidden){S.lastSend=0;S.lastHeartbeat=0}},{passive:true});
  }

  window.PPA_MOB_SYNC_DIAG=function(){return{
    room:S.room,active:active(),seen:S.seen,owned:S.owned,remoteOwned:S.remoteOwned,
    synced:S.synced,tombs:S.tombs.size,states:S.states.size,netAge:S.lastNetAt?Date.now()-S.lastNetAt:null
  }};

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();