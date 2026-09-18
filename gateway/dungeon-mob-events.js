(function(){
  'use strict';

  var seq=0, applying=0, lastRoom='', lastRegister=0, catalogRoom='', authReady=false;
  var authority=new Map();

  function rt(){try{return window.PPA_REALTIME_DIAG?window.PPA_REALTIME_DIAG():null}catch(_){return null}}
  function room(){var d=rt();return String((d&&d.room)||'')}
  function active(){try{return typeof P!=='undefined'&&P&&P.scene==='dungeon'&&/^dungeon-/.test(room())&&typeof window.PPA_RT_SEND==='function'}catch(_){return false}}
  function selfId(){try{return String((typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE&&PPA_ONLINE.selfId)||'')}catch(_){return''}}
  function partyId(){try{return String((window.PPA_PARTY_STATE&&window.PPA_PARTY_STATE.partyId)||'')}catch(_){return''}}
  function keyOf(e){if(!e||e.isBoss||e.si==null)return'';var si=Math.floor(Number(e.si));return Number.isFinite(si)&&si>=0&&si<10000?'s'+si:''}
  function siOf(key){var m=String(key||'').match(/^s(\d{1,4})$/);return m?Number(m[1]):-1}
  function entities(){try{return (typeof EN!=='undefined'&&Array.isArray(EN))?EN:[]}catch(_){return[]}}
  function find(key){var a=entities();for(var i=0;i<a.length;i++)if(keyOf(a[i])===key)return a[i];return null}
  function currentCatalog(){
    var rows=[];
    try{
      if(typeof DG_ACTIVE_SPAWNS!=='undefined'&&Array.isArray(DG_ACTIVE_SPAWNS)){
        for(var si=0;si<DG_ACTIVE_SPAWNS.length;si++){
          var lvl=(typeof DG_SPAWN_LVL!=='undefined'&&DG_SPAWN_LVL)?Number(DG_SPAWN_LVL[si])||1:1;
          var t=(typeof mobByLvl==='function')?mobByLvl(lvl):null;
          var mhp=Math.max(1,Number(t&&t.hp)||1);
          var p=DG_ACTIVE_SPAWNS[si]||[0,0];
          var scale=(typeof DG_SCALE!=='undefined'&&Number(DG_SCALE))||1;
          var x=Number(p[0]||0)*scale,y=Number(p[1]||0)*scale;
          rows.push([
            's'+si,Math.round(mhp*100)/100,
            Math.round(x*10)/10,Math.round(y*10)/10,
            Math.max(.1,Number(t&&t.sp)||1),
            Math.max(8,Number(t&&t.sz)||30)
          ]);
        }
        if(rows.length)return rows;
      }
    }catch(_){}
    // Offline/legacy fallback only.
    entities().forEach(function(e){
      var key=keyOf(e);if(!key)return;
      var mhp=Math.max(1,Number(e.mhp)||Number(e.hp)||1);
      rows.push([key,Math.round(mhp*100)/100]);
    });
    return rows;
  }
  function quarantineLocalMobs(){
    entities().forEach(function(e){
      if(!keyOf(e))return;
      e.__ppaAwaitAuthority=true;
      applying++;
      try{e.hp=0}catch(_){}
      applying--;
    });
  }

  function lockProp(e,name){
    try{
      if(!e||e.__ppaServerLocks&&e.__ppaServerLocks[name])return;
      var value=e[name];
      if(!e.__ppaServerLocks)Object.defineProperty(e,'__ppaServerLocks',{value:{},configurable:true});
      Object.defineProperty(e,name,{
        configurable:true,enumerable:true,
        get:function(){return value},
        set:function(v){
          // In an online dungeon only the authoritative bridge may move/facing-control mobs.
          // Old single-player AI is still allowed offline.
          if(applying>0||!active())value=v;
        }
      });
      e.__ppaServerLocks[name]=1;
    }catch(_){}
  }

  function lockServerMob(e){
    if(!e||!keyOf(e))return;
    lockProp(e,'x');lockProp(e,'y');
    lockProp(e,'aggro');
    lockProp(e,'spiderDir');lockProp(e,'spiderMoving');
    lockProp(e,'animDir');lockProp(e,'animMoving');
  }

  function isServerMode(){return active()}
  window.PPA_SERVER_MOBS_ACTIVE=isServerMode;

  function rewardAllowed(e){
    try{
      if(!active()||!keyOf(e))return true;
      var killer=String((e&&e.__ppaEventKiller)||'');
      var party=String((e&&e.__ppaEventParty)||'');
      if(!killer)return false;
      if(killer===selfId())return true;
      var mine=partyId();
      return !!(mine&&party&&mine===party);
    }catch(_){return false}
  }
  window.PPA_MOB_REWARD_ELIGIBLE=rewardAllowed;

  function installDropGuard(){
    try{
      if(typeof dropLoot!=='function'||dropLoot.__ppaServerGuard)return;
      var base=dropLoot;
      var wrapped=function(e){
        if(e&&!e.isBoss&&!rewardAllowed(e))return;
        return base.apply(this,arguments);
      };
      wrapped.__ppaServerGuard=1;dropLoot=wrapped;
      try{window.dropLoot=wrapped}catch(_){}
    }catch(_){}
  }

  function register(force){
    try{
      if(!active())return false;
      var now=Date.now(),r=room(),rows=currentCatalog();
      if(!rows.length)return false;
      if(!force&&r===lastRoom&&now-lastRegister<2500)return true;

      // First authoritative handshake for this instance:
      // send the original local roster, then hide/quarantine it. From this
      // point onward ONLY the server snapshot decides which spawn ids exist.
      var firstForRoom=(catalogRoom!==r);
      if(firstForRoom){
        catalogRoom=r;
        authReady=false;
        authority.clear();
      }

      lastRoom=r;lastRegister=now;
      var ok=!!window.PPA_RT_SEND({type:'mob-catalog',room:r,rows:rows});
      if(ok&&firstForRoom)quarantineLocalMobs();
      return ok;
    }catch(_){return false}
  }

  window.PPA_MOB_SERVER_REGISTER=function(){return register(true)};
  window.PPA_MOB_SERVER_DIAG=function(){
    return {
      room:room(),ready:authReady,count:authority.size,
      mobs:entities().filter(function(e){return !!keyOf(e)}).length,
      locked:entities().filter(function(e){return !!(e&&e.__ppaServerLocks&&e.__ppaServerLocks.x)}).length
    };
  };

  window.PPA_MOB_EVENT_DAMAGE=function(e,amount){
    try{
      if(applying||!active())return false;
      var key=keyOf(e),dmg=Number(amount),mhp=Math.max(1,Number(e&&e.mhp)||Number(e&&e.hp)||1);
      if(!key||!Number.isFinite(dmg)||dmg<=0)return false;
      register(false);
      var id=(selfId()||'self')+':'+Date.now().toString(36)+':'+(++seq);
      return !!window.PPA_RT_SEND({
        type:'mob-hit-event',room:room(),key:key,amount:Math.round(dmg*100)/100,
        mhp:Math.round(mhp*100)/100,event:id
      });
    }catch(_){return false}
  };

  function applyRow(row){
    if(!Array.isArray(row)||row.length<4)return;
    var key=String(row[0]||''),hp=Number(row[1]),mhp=Number(row[2]),respawnAt=Number(row[3])||0;
    var killer=String(row[4]||''),party=String(row[5]||'');
    var x=Number(row[6]),y=Number(row[7]),aggro=!!row[8],dir=Number(row[9]),moving=!!row[10],target=String(row[11]||'');
    if(!/^s\d{1,4}$/.test(key)||!Number.isFinite(hp)||!Number.isFinite(mhp))return;

    authority.set(key,{
      hp:hp,mhp:mhp,respawnAt:respawnAt,killer:killer,party:party,
      x:Number.isFinite(x)?x:null,y:Number.isFinite(y)?y:null,
      aggro:aggro,dir:Number.isFinite(dir)?dir:1,moving:moving,target:target
    });

    var e=find(key);
    if(hp>0){
      if(!e){
        var si=siOf(key);
        try{
          if(si>=0&&typeof spawnMobAtPoint==='function'){
            window.__PPA_SERVER_SPAWN_CALL=true;
            try{spawnMobAtPoint(si,true)}finally{window.__PPA_SERVER_SPAWN_CALL=false}
          }
        }catch(_){window.__PPA_SERVER_SPAWN_CALL=false}
        e=find(key);
      }
      if(!e)return;
      lockServerMob(e);
      e.__ppaAwaitAuthority=false;
      e.__ppaEventKiller='';e.__ppaEventParty='';
      e.__ppaServerTarget=target;
      applying++;
      try{
        e.mhp=Math.max(1,mhp);
        e.hp=Math.min(e.mhp,Math.max(1,hp));
        if(Number.isFinite(x)){e.x=x;e.__ppaServerX=x}
        if(Number.isFinite(y)){e.y=y;e.__ppaServerY=y}
        e.aggro=aggro;
        if(Number.isFinite(dir)){
          e.spiderDir=dir;e.animDir=dir;e.__ppaServerDir=dir;
        }
        e.spiderMoving=moving;e.animMoving=moving;e.__ppaServerMoving=moving;
      }finally{applying--}
      return;
    }

    // Dead is also authoritative. If local spawn has not been created yet,
    // keeping it in authority Map is enough; reconcile() will remove it later.
    if(!e)return;
    lockServerMob(e);
    e.__ppaAwaitAuthority=false;
    e.__ppaEventKiller=killer;e.__ppaEventParty=party;e.__ppaServerRespawnAt=respawnAt;
    e.__ppaServerTarget=target;
    applying++;
    try{e.hp=0}finally{applying--}
  }

  function reconcileAuthority(){
    if(!active()||!authReady)return;
    authority.forEach(function(st,key){
      var e=find(key);
      if(Number(st.hp)>0){
        if(!e){
          var si=siOf(key);
          try{
            if(si>=0&&typeof spawnMobAtPoint==='function'){
              window.__PPA_SERVER_SPAWN_CALL=true;
              try{spawnMobAtPoint(si,false)}finally{window.__PPA_SERVER_SPAWN_CALL=false}
            }
          }catch(_){window.__PPA_SERVER_SPAWN_CALL=false}
          e=find(key);
        }
        if(e&&(Number(e.hp)<=0||e.__ppaAwaitAuthority)){
          e.__ppaAwaitAuthority=false;
          applying++;
          try{
            e.mhp=Math.max(1,Number(st.mhp)||1);
            e.hp=Math.min(e.mhp,Math.max(1,Number(st.hp)||1));
          }finally{applying--}
        }
      }else if(e&&Number(e.hp)>0){
        e.__ppaEventKiller=String(st.killer||'');
        e.__ppaEventParty=String(st.party||'');
        applying++;
        try{e.hp=0}finally{applying--}
      }
      e=find(key);
      if(e&&Number(st.hp)>0){
        lockServerMob(e);
        e.__ppaServerTarget=String(st.target||'');
        applying++;
        try{
          if(Number.isFinite(Number(st.x)))e.x=Number(st.x);
          if(Number.isFinite(Number(st.y)))e.y=Number(st.y);
          e.aggro=!!st.aggro;
          var d=Number(st.dir);
          if(Number.isFinite(d)){e.spiderDir=d;e.animDir=d}
          e.spiderMoving=!!st.moving;e.animMoving=!!st.moving;
        }finally{applying--}
      }
    });
  }

  window.PPA_DUNGEON_MOB_EVENT_RECEIVE=function(m){
    try{
      if(!m||String(m.room||'')!==room())return;
      if(m.type==='mob-authority-snapshot'){
        var rows=Array.isArray(m.rows)?m.rows:[];
        if(catalogRoom!==room()&&rows.length===0)return;
        authority.clear();
        for(var i=0;i<rows.length;i++)applyRow(rows[i]);
        authReady=true;
        reconcileAuthority();
        return;
      }
      if(m.type==='mob-authority'){
        applyRow([m.key,m.hp,m.mhp,m.respawnAt,m.killer,m.party,m.x,m.y,m.aggro,m.dir,m.moving,m.target]);
        authReady=true;
        reconcileAuthority();
        return;
      }
      if(m.type==='mob-position'){
        var rows=Array.isArray(m.rows)?m.rows:[];
        for(var j=0;j<rows.length;j++){
          var r=rows[j];if(!Array.isArray(r)||r.length<7)continue;
          var st=authority.get(String(r[0]||''))||{hp:1,mhp:1,respawnAt:0,killer:'',party:''};
          applyRow([
            r[0],st.hp,st.mhp,st.respawnAt,st.killer,st.party,
            r[1],r[2],r[3],r[4],r[5],r[6]
          ]);
        }
        authReady=true;
        reconcileAuthority();
        return;
      }
    }catch(err){console.warn('PPA authoritative mob receive',err)}
  };

  function tick(){
    installDropGuard();
    if(!active()){
      lastRoom='';catalogRoom='';authReady=false;authority.clear();
      return;
    }
    register(false);
    reconcileAuthority();
  }

  function boot(){
    installDropGuard();
    setTimeout(function(){register(true)},600);
    setInterval(tick,1000);
    setInterval(reconcileAuthority,33);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(function(){register(true)},400)},{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();