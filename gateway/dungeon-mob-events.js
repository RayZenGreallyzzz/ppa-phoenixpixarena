(function(){
  'use strict';

  var seq=0, applying=0, lastRoom='', lastRegister=0, catalogRoom='', authReady=false, serverMode=false;
  var authority=new Map(), deadUntil=new Map(), entityCache=new Map(), entityCacheLen=-1, entityCacheAt=0, diagCache=null, diagCacheAt=0, catalogCount=0;

  function rt(){try{return window.PPA_REALTIME_DIAG?window.PPA_REALTIME_DIAG():null}catch(_){return null}}
  function room(){var d=rt();return String((d&&d.room)||'')}
  function active(){try{return typeof P!=='undefined'&&P&&P.scene==='dungeon'&&/^dungeon-/.test(room())&&typeof window.PPA_RT_SEND==='function'}catch(_){return false}}
  function selfId(){try{return String((typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE&&PPA_ONLINE.selfId)||'')}catch(_){return''}}
  function partyId(){try{return String((window.PPA_PARTY_STATE&&window.PPA_PARTY_STATE.partyId)||'')}catch(_){return''}}
  function keyOf(e){if(!e||e.isBoss||e.si==null)return'';var si=Math.floor(Number(e.si));return Number.isFinite(si)&&si>=0&&si<10000?'s'+si:''}
  function siOf(key){var m=String(key||'').match(/^s(\d{1,4})$/);return m?Number(m[1]):-1}
  function entities(){try{return (typeof EN!=='undefined'&&Array.isArray(EN))?EN:[]}catch(_){return[]}}
  function rebuildEntityCache(force){
    var a=entities(),now=Date.now();
    if(!force&&entityCacheLen===a.length&&now-entityCacheAt<1000)return;
    entityCache.clear();
    for(var i=0;i<a.length;i++){var k=keyOf(a[i]);if(k)entityCache.set(k,a[i])}
    entityCacheLen=a.length;entityCacheAt=now;
  }
  function find(key){
    rebuildEntityCache(false);
    return entityCache.get(String(key||''))||null;
  }
  function cacheEntity(e){var k=keyOf(e);if(k){entityCache.set(k,e);entityCacheLen=entities().length;entityCacheAt=Date.now()}}

  var MATERIALIZE_R=1450;
  function shouldMaterialize(st){
    try{
      if(!st||!(Number(st.hp)>0))return false;
      var x=Number(st.x),y=Number(st.y);
      if(!Number.isFinite(x)||!Number.isFinite(y))return false;
      if(typeof P==='undefined'||!P)return false;
      return Math.hypot(x-Number(P.x||0),y-Number(P.y||0))<=MATERIALIZE_R;
    }catch(_){return false}
  }
  function removeEntity(e){
    try{
      var a=entities(),i=a.indexOf(e);
      if(i>=0)a.splice(i,1);
      var k=keyOf(e);if(k)entityCache.delete(k);
      entityCacheLen=a.length;entityCacheAt=Date.now();
    }catch(_){}
  }
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
            Math.max(8,Number(t&&t.sz)||30),
            Math.max(1,Number(t&&t.atk)||Number(t&&t.dmg)||1)
          ]);
        }
        if(rows.length){catalogCount=rows.length;return rows;}
      }
    }catch(_){}
    // Offline/legacy fallback only.
    entities().forEach(function(e){
      var key=keyOf(e);if(!key)return;
      var mhp=Math.max(1,Number(e.mhp)||Number(e.hp)||1);
      rows.push([key,Math.round(mhp*100)/100]);
    });
    catalogCount=rows.length;
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
          // This setter is hit by the legacy AI many times per frame. Do not call
          // PPA_REALTIME_DIAG/active() here; use the cached serverMode flag.
          if(applying>0||!serverMode)value=v;
        }
      });
      e.__ppaServerLocks[name]=1;
    }catch(_){}
  }

  function lockServerMob(e){
    if(!e||!keyOf(e))return;
    lockProp(e,'hp');
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
      serverMode=active();
      if(!serverMode)return false;
      var now=Date.now(),r=room(),rows=currentCatalog();
      if(!rows.length)return false;

      // The realtime server rejects inbound WS messages >4096 bytes.
      // Full dungeon catalog is ~400 mobs, so always send small ordered chunks.
      if(!force&&catalogRoom===r&&authReady)return true;

      var firstForRoom=(catalogRoom!==r);
      if(firstForRoom){
        catalogRoom=r;
        authReady=false;
        authority.clear();
      }

      var chunkSize=36,total=Math.ceil(rows.length/chunkSize),ok=true;
      for(var n=0;n<total;n++){
        var part=rows.slice(n*chunkSize,(n+1)*chunkSize);
        ok=!!window.PPA_RT_SEND({
          type:'mob-catalog',room:r,rows:part,
          batch:n,batches:total,done:n===total-1
        })&&ok;
      }
      if(ok){
        lastRoom=r;lastRegister=now;
        if(firstForRoom)quarantineLocalMobs();
      }
      return ok;
    }catch(_){return false}
  }

  window.PPA_MOB_SERVER_REGISTER=function(){return register(true)};
  function hash32(str){
    var h=2166136261>>>0;
    str=String(str||'');
    for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)>>>0}
    return ('00000000'+h.toString(16)).slice(-8);
  }

  window.PPA_MOB_SERVER_DIAG=function(){
    var now=Date.now();
    if(diagCache&&now-diagCacheAt<2000)return diagCache;
    rebuildEntityCache(true);
    var arr=entities(),mobs=0,locked=0,maxDelta=0;
    authority.forEach(function(st,key){
      var e=entityCache.get(key);
      if(e){
        mobs++;
        if(e.__ppaServerLocks&&e.__ppaServerLocks.x)locked++;
        var ax=Number(st.x),ay=Number(st.y),lx=Number(e.x),ly=Number(e.y);
        if(Number.isFinite(ax)&&Number.isFinite(ay)&&Number.isFinite(lx)&&Number.isFinite(ly)){
          maxDelta=Math.max(maxDelta,Math.hypot(ax-lx,ay-ly));
        }
      }
    });
    var rd=rt()||{};
    diagCache={
      room:room(),serverRoom:String(rd.serverRoom||''),instance:Number(rd.dungeonInstance)||0,
      ready:authReady,count:authority.size,catalog:catalogCount||authority.size,
      mobs:mobs,locked:locked,dead:deadUntil.size,keyHash:'ok',authHash:'ok',localHash:'near',
      maxDelta:Math.round(maxDelta),samples:[]
    };
    diagCacheAt=now;
    return diagCache;
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
    var x=Number(row[6]),y=Number(row[7]),aggro=!!row[8],dir=Number(row[9]),moving=!!row[10],target=String(row[11]||''),sz=Number(row[12]);
    if(!/^s\d{1,4}$/.test(key)||!Number.isFinite(hp)||!Number.isFinite(mhp))return;

    var now=Date.now(),tomb=Number(deadUntil.get(key)||0);
    if(hp<=0&&respawnAt>now){
      deadUntil.set(key,respawnAt);
      tomb=respawnAt;
    }else if(hp>0&&respawnAt===0&&tomb&&now>=tomb){
      deadUntil.delete(key);
      tomb=0;
    }
    // WebSocket order should already protect this, but this guard also covers
    // reconnect/snapshot races: positive state cannot revive a still-dead mob.
    if(hp>0&&tomb>now){
      hp=0;
      respawnAt=tomb;
      aggro=false;moving=false;target='';
    }

    authority.set(key,{
      hp:hp,mhp:mhp,respawnAt:respawnAt,killer:killer,party:party,
      x:Number.isFinite(x)?x:null,y:Number.isFinite(y)?y:null,
      aggro:aggro,dir:Number.isFinite(dir)?dir:1,moving:moving,target:target,
      sz:Number.isFinite(sz)?sz:null
    });

    var e=find(key);
    if(hp>0){
      var _st=authority.get(key);
      if(!e&&!shouldMaterialize(_st))return;
      if(!e){
        var si=siOf(key);
        try{
          if(si>=0&&typeof spawnMobAtPoint==='function'){
            window.__PPA_SERVER_SPAWN_CALL=true;
            try{spawnMobAtPoint(si,true)}finally{window.__PPA_SERVER_SPAWN_CALL=false}
          }
        }catch(_){window.__PPA_SERVER_SPAWN_CALL=false}
        e=find(key);
        if(e)cacheEntity(e);
      }
      if(!e)return;
      cacheEntity(e);
      lockServerMob(e);
      e.__ppaAwaitAuthority=false;
      e.__ppaEventKiller='';e.__ppaEventParty='';
      e.__ppaServerTarget=target;
      applying++;
      try{
        e.mhp=Math.max(1,mhp);
        e.hp=Math.min(e.mhp,Math.max(1,hp));
        if(Number.isFinite(sz)&&sz>0)e.sz=sz;
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
    var changed=false;
    authority.forEach(function(st,key){
      var e=find(key),near=shouldMaterialize(st);
      if(Number(st.hp)>0){
        if(!near){
          if(e){removeEntity(e);changed=true}
          return;
        }
        if(!e){
          var si=siOf(key);
          try{
            if(si>=0&&typeof spawnMobAtPoint==='function'){
              window.__PPA_SERVER_SPAWN_CALL=true;
              try{spawnMobAtPoint(si,false)}finally{window.__PPA_SERVER_SPAWN_CALL=false}
            }
          }catch(_){window.__PPA_SERVER_SPAWN_CALL=false}
          e=find(key);
          if(e){cacheEntity(e);changed=true}
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
          if(Number.isFinite(Number(st.sz))&&Number(st.sz)>0)e.sz=Number(st.sz);
          e.aggro=!!st.aggro;
          var d=Number(st.dir);
          if(Number.isFinite(d)){e.spiderDir=d;e.animDir=d}
          e.spiderMoving=!!st.moving;e.animMoving=!!st.moving;
        }finally{applying--}
      }
    });
    if(changed)rebuildEntityCache(true);
  }

  function pruneToAuthority(){
    if(!authReady)return;
    try{
      var a=entities(),seen=new Set();
      for(var i=a.length-1;i>=0;i--){
        var e=a[i],key=keyOf(e);
        if(!key)continue;
        if(!authority.has(key)||seen.has(key)){
          a.splice(i,1);
          continue;
        }
        seen.add(key);
      }
      rebuildEntityCache(true);
    }catch(_){}
  }

  window.PPA_DUNGEON_MOB_EVENT_RECEIVE=function(m){
    try{
      if(!m||String(m.room||'')!==room())return;
      if(m.type==='mob-authority-snapshot'){
        var rows=Array.isArray(m.rows)?m.rows:[];
        if(catalogRoom!==room()&&rows.length===0)return;
        if(m.reset!==false){authority.clear();deadUntil.clear();}
        for(var i=0;i<rows.length;i++)applyRow(rows[i]);
        if(m.done!==false){
          authReady=true;
          pruneToAuthority();
          reconcileAuthority();
        }
        return;
      }
      if(m.type==='mob-authority'){
        applyRow([m.key,m.hp,m.mhp,m.respawnAt,m.killer,m.party,m.x,m.y,m.aggro,m.dir,m.moving,m.target,m.sz]);
        authReady=true;
        return;
      }
      if(m.type==='mob-position'){
        var rows=Array.isArray(m.rows)?m.rows:[];
        for(var j=0;j<rows.length;j++){
          var r=rows[j];if(!Array.isArray(r)||r.length<7)continue;
          var st=authority.get(String(r[0]||''))||{hp:1,mhp:1,respawnAt:0,killer:'',party:''};
          applyRow([
            r[0],st.hp,st.mhp,st.respawnAt,st.killer,st.party,
            r[1],r[2],r[3],r[4],r[5],r[6],st.sz
          ]);
        }
        authReady=true;
        return;
      }
      if(m.type==='mob-attack'){
        var key=String(m.key||''),e=find(key),target=String(m.target||'');
        if(!e&&target&&target===selfId()){
          var st=authority.get(key);
          if(st){
            var si=siOf(key);
            try{
              if(si>=0&&typeof spawnMobAtPoint==='function'){
                window.__PPA_SERVER_SPAWN_CALL=true;
                try{spawnMobAtPoint(si,false)}finally{window.__PPA_SERVER_SPAWN_CALL=false}
              }
            }catch(_){window.__PPA_SERVER_SPAWN_CALL=false}
            e=find(key);if(e)cacheEntity(e);
          }
        }
        if(e){
          lockServerMob(e);
          e.__ppaServerTarget=target;
          e.atkAnim=12;
          e.atkCD=50;
          var dir=Number(m.dir);
          applying++;
          try{
            if(Number.isFinite(Number(m.x)))e.x=Number(m.x);
            if(Number.isFinite(Number(m.y)))e.y=Number(m.y);
            if(Number.isFinite(dir)){e.spiderDir=dir;e.animDir=dir}
            e.spiderMoving=false;e.animMoving=false;
          }finally{applying--}
        }
        if(target&&target===selfId()){
          try{
            var dodged=Math.random()*100<(Number(P&&P.dodge)||0);
            if(dodged){
              if(typeof showPickup==='function')showPickup('Уворот!','#88ffcc');
            }else{
              var raw=Math.max(1,Number(m.dmg)||1);
              var dealt=(typeof playerDmg==='function')?playerDmg(raw):raw;
              P.hp=Math.max(0,Number(P.hp||0)-Math.max(1,Number(dealt)||1));
            }
            if(typeof PT!=='undefined'&&Array.isArray(PT)&&P){
              for(var q=0;q<6;q++)PT.push({x:P.x,y:P.y-15,vx:(Math.random()-.5)*5,vy:(Math.random()-.5)*5,life:12,ml:12,sz:2+Math.random()*2,col:'#ff0000'});
            }
          }catch(_){}
        }
        return;
      }
    }catch(err){console.warn('PPA authoritative mob receive',err)}
  };

  function tick(){
    installDropGuard();
    serverMode=active();
    if(!serverMode){
      lastRoom='';catalogRoom='';authReady=false;authority.clear();deadUntil.clear();
      entityCache.clear();entityCacheLen=-1;diagCache=null;
      return;
    }
    register(false);
    // Legacy AI transform writes are hard-locked. A 1 Hz sanity reconcile is
    // enough; position packets already apply their changed rows immediately.
    reconcileAuthority();
  }

  function boot(){
    installDropGuard();
    serverMode=active();
    setTimeout(function(){register(true)},600);
    setInterval(tick,1000);
    document.addEventListener('visibilitychange',function(){
      if(!document.hidden){serverMode=active();setTimeout(function(){register(true)},400)}
    },{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();