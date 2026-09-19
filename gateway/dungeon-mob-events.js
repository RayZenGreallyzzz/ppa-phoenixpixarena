(function(){
  'use strict';

  var seq=0, applying=0, lastRoom='', lastRegister=0, catalogRoom='', authReady=false, serverMode=false, worldCycle='';
  var authority=new Map(), deadUntil=new Map(), entityCache=new Map(), entityCacheLen=-1, entityCacheAt=0, diagCache=null, diagCacheAt=0, catalogCount=0, smoothEntities=new Set(), smoothRaf=0, smoothLast=0;

  function rt(){try{return window.PPA_REALTIME_DIAG?window.PPA_REALTIME_DIAG():null}catch(_){return null}}
  function room(){var d=rt();return String((d&&d.room)||'')}
  function active(){try{if(typeof P==='undefined'||!P||typeof window.PPA_RT_SEND!=='function')return false;var r=room();return (P.scene==='dungeon'&&/^dungeon-/.test(r))||(P.scene==='worldboss'&&r==='worldboss')}catch(_){return false}}
  function selfId(){try{return String((typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE&&PPA_ONLINE.selfId)||'')}catch(_){return''}}
  function partyId(){try{return String((window.PPA_PARTY_STATE&&window.PPA_PARTY_STATE.partyId)||'')}catch(_){return''}}
  function keyOf(e){if(!e)return'';if(e.isWorldCrystalBoss)return'wtitan';if(e.isDungeon60Boss)return'b60';if(e.isDungeon21Boss&&!e.isArenaBoss)return'b40';if(e.isDungeonPhoenixBoss)return'p20';if(e.isBoss||e.si==null)return'';var si=Math.floor(Number(e.si));return Number.isFinite(si)&&si>=0&&si<10000?'s'+si:''}
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
  function tagServerEntity(e){
    try{
      if(!e)return e;
      e.__ppaServerEntity=true;
      e.__ppaServerRoom=room();
      return e;
    }catch(_){return e}
  }
  function isTaggedServerEntity(e){
    try{
      return !!(e&&(e.__ppaServerEntity||e.__ppaServerRoom||e.__ppaServerLocks||
        Number.isFinite(Number(e.__ppaServerAt))||Number.isFinite(Number(e.__ppaServerX))));
    }catch(_){return false}
  }
  function cleanupServerEntities(){
    try{
      var a=entities(),changed=false;
      for(var i=a.length-1;i>=0;i--){
        if(isTaggedServerEntity(a[i])){
          try{smoothEntities.delete(a[i])}catch(_){}
          a.splice(i,1);changed=true;
        }
      }
      smoothEntities.clear();
      if(changed)rebuildEntityCache(true);
    }catch(_){}
  }
  function materializeKey(key,fx){
    key=String(key||'');
    try{
      if(key==='wtitan'&&typeof spawnWorldCrystalBoss==='function'){
        window.__PPA_SERVER_SPAWN_CALL=true;
        try{var wt=spawnWorldCrystalBoss();if(wt){tagServerEntity(wt);cacheEntity(wt)}return tagServerEntity(wt||find(key)||null)}finally{window.__PPA_SERVER_SPAWN_CALL=false}
      }
      if(key==='p20'&&typeof spawnBoss==='function'){
        window.__PPA_SERVER_SPAWN_CALL=true;
        try{spawnBoss();var ph=find(key);if(ph){tagServerEntity(ph);cacheEntity(ph)}return tagServerEntity(ph||null)}finally{window.__PPA_SERVER_SPAWN_CALL=false}
      }
      if(key==='b40'&&typeof spawnDungeon21Boss==='function'){
        window.__PPA_SERVER_SPAWN_CALL=true;
        try{var l=spawnDungeon21Boss();var b40=l||find(key);if(b40){tagServerEntity(b40);cacheEntity(b40)}return tagServerEntity(b40||null)}finally{window.__PPA_SERVER_SPAWN_CALL=false}
      }
      if(key==='b60'){
        if(typeof window.PPA_DRAGON60_SPAWN_FROM_SERVER==='function'){
          var b=window.PPA_DRAGON60_SPAWN_FROM_SERVER();
          if(b){tagServerEntity(b);cacheEntity(b)}
          return tagServerEntity(b||null);
        }
        return null;
      }
      var si=siOf(key);
      if(si>=0&&typeof spawnMobAtPoint==='function'){
        window.__PPA_SERVER_SPAWN_CALL=true;
        try{spawnMobAtPoint(si,!!fx)}finally{window.__PPA_SERVER_SPAWN_CALL=false}
        var e=find(key);if(e){tagServerEntity(e);cacheEntity(e)}return tagServerEntity(e||null);
      }
    }catch(_){window.__PPA_SERVER_SPAWN_CALL=false}
    return null;
  }

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
      try{smoothEntities.delete(e)}catch(_){}
      entityCacheLen=a.length;entityCacheAt=Date.now();
    }catch(_){}
  }
  function currentCatalog(){
    var rows=[];
    try{
      if(typeof P!=='undefined'&&P&&P.scene==='worldboss'){
        var pos=(typeof WORLD_CRYSTAL_BOSS_POS!=='undefined'&&WORLD_CRYSTAL_BOSS_POS)||{x:0,y:0};
        var resetAt=0;try{if(typeof worldBossNextResetAt==='function')resetAt=Number(worldBossNextResetAt())||0}catch(_){}
        rows.push(['wtitan',
          Math.max(1,Number(typeof WORLD_CRYSTAL_BOSS_HP!=='undefined'?WORLD_CRYSTAL_BOSS_HP:70000)||70000),
          Math.round(Number(pos.x||0)*10)/10,Math.round(Number(pos.y||0)*10)/10,
          .1,142,Math.max(1,Number(typeof WORLD_CRYSTAL_PROJECTILE_DAMAGE!=='undefined'?WORLD_CRYSTAL_PROJECTILE_DAMAGE:14)||14),
          resetAt
        ]);
        catalogCount=rows.length;return rows;
      }
      if(typeof DG_ACTIVE_SPAWNS!=='undefined'&&Array.isArray(DG_ACTIVE_SPAWNS)){
        for(var si=0;si<DG_ACTIVE_SPAWNS.length;si++){
          var lvl=(typeof DG_SPAWN_LVL!=='undefined'&&DG_SPAWN_LVL)?Number(DG_SPAWN_LVL[si])||1:1;
          var t=(typeof mobByLvl==='function')?mobByLvl(lvl):null;
          var spec=t?{
            lvl:Number(t.lvl)||lvl,type:t,hp:Number(t.hp)||1,mhp:Number(t.hp)||1,
            sp:Number(t.sp)||1,sz:Number(t.sz)||30,dmg:Number(t.atk)||Number(t.dmg)||1,
            def:Number(t.def)||0,xp:Number(t.xp)||0,gold:Number(t.gold)||0
          }:null;
          // Catalog must use the SAME scaled stats as the local entity factory.
          // Otherwise server authority would overwrite 21–40 / 41–60 mobs with
          // their old 1–20 base HP and damage.
          try{
            if(spec&&typeof DUNGEON_MODE!=='undefined'&&DUNGEON_MODE==='21+'&&typeof applyDungeon21MobStats==='function')spec=applyDungeon21MobStats(spec,si);
            else if(spec&&typeof DUNGEON_MODE!=='undefined'&&DUNGEON_MODE==='41-60'&&typeof applyDungeon41MobStats==='function')spec=applyDungeon41MobStats(spec,si);
          }catch(_){}
          var mhp=Math.max(1,Number(spec&&spec.mhp)||Number(spec&&spec.hp)||Number(t&&t.hp)||1);
          var p=DG_ACTIVE_SPAWNS[si]||[0,0];
          var scale=(typeof DG_SCALE!=='undefined'&&Number(DG_SCALE))||1;
          var x=Number(p[0]||0)*scale,y=Number(p[1]||0)*scale;
          var roomIndex=Number(p[2]),rb=null;
          try{if(Number.isFinite(roomIndex)&&typeof dgRoomBounds==='function')rb=dgRoomBounds(roomIndex)}catch(_){}
          rows.push([
            's'+si,Math.round(mhp*100)/100,
            Math.round(x*10)/10,Math.round(y*10)/10,
            Math.max(.1,Number(spec&&spec.sp)||Number(t&&t.sp)||1),
            Math.max(8,Number(spec&&spec.sz)||Number(t&&t.sz)||30),
            Math.max(1,Number(spec&&spec.dmg)||Number(t&&t.atk)||Number(t&&t.dmg)||1),
            0,
            Math.max(1,Math.round(Number(spec&&spec.lvl)||Number(lvl)||1)),
            Number.isFinite(roomIndex)?Math.round(roomIndex):-1,
            rb?Math.round(Number(rb.minX)*10)/10:null,
            rb?Math.round(Number(rb.minY)*10)/10:null,
            rb?Math.round(Number(rb.maxX)*10)/10:null,
            rb?Math.round(Number(rb.maxY)*10)/10:null
          ]);
        }
        if(typeof DG_BOSS_IMG!=='undefined'&&Array.isArray(DG_BOSS_IMG)){
          var bp=null;
          try{
            if(typeof dgNearestWalk==='function')bp=dgNearestWalk(Number(DG_BOSS_IMG[0]||0)*scale,Number(DG_BOSS_IMG[1]||0)*scale);
          }catch(_){}
          var bx=bp&&Number.isFinite(Number(bp.x))?Number(bp.x):Number(DG_BOSS_IMG[0]||0)*scale;
          var by=bp&&Number.isFinite(Number(bp.y))?Number(bp.y):Number(DG_BOSS_IMG[1]||0)*scale;
          bx=Math.round(bx*10)/10;by=Math.round(by*10)/10;
          if(typeof DUNGEON_MODE!=='undefined'&&DUNGEON_MODE==='1-20'){
            rows.push(['p20',2613,bx,by,.1,150,85]);
          }else if(typeof DUNGEON_MODE!=='undefined'&&DUNGEON_MODE==='21+'){
            rows.push(['b40',
              Math.max(1,Number(typeof DUNGEON21_BOSS_HP!=='undefined'?DUNGEON21_BOSS_HP:9000)||9000),
              bx,by,.1,150,
              Math.max(1,Number(typeof DUNGEON21_BOSS_STAFF_DMG!=='undefined'?DUNGEON21_BOSS_STAFF_DMG:190)||190)
            ]);
          }else if(typeof DUNGEON_MODE!=='undefined'&&DUNGEON_MODE==='41-60'){
            rows.push(['b60',27000,bx,by,1.05,180,180]);
          }
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
    // Never fake-kill a legacy/local entity while waiting for the first server
    // snapshot: boss death handlers would otherwise award loot/start cooldowns.
    // Remove local copies silently; authoritative rows materialize the real ones.
    try{
      var a=entities();
      for(var i=a.length-1;i>=0;i--){
        if(keyOf(a[i]))a.splice(i,1);
      }
      rebuildEntityCache(true);
    }catch(_){}
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

  function visualDir(serverDir){
    var d=Math.round(Number(serverDir));
    // All animated dungeon mob atlases use the original local-AI rows:
    // 0=up/back, 1=down/front, 2=left, 3=right.
    return d>=0&&d<=3?d:1;
  }

  function bossDirName(serverDir){
    var d=Math.round(Number(serverDir));
    return d===0?'up':d===1?'down':d===2?'left':'right';
  }
  function applyBossVisualDir(e,serverDir,moving){
    if(!e||!Number.isFinite(Number(serverDir)))return;
    var d=Math.round(Number(serverDir)),name=bossDirName(d);
    try{
      if(e.isDungeon21Boss)e.d21Dir=name;
      if(e.isWorldCrystalBoss)e.wbDir=name;
      if(e.isDungeonPhoenixBoss)e.face=(d===2?-1:(d===3?1:(e.face||1)));
      if(e.isDungeon60Boss)e.face=(d===2?-1:(d===3?1:(e.face||1)));
      e.__ppaServerDir=d;e.__ppaServerMoving=!!moving;
    }catch(_){}
  }

  function lockServerMob(e){
    if(!e||!keyOf(e))return;
    lockProp(e,'hp');
    lockProp(e,'x');lockProp(e,'y');
    lockProp(e,'aggro');
    lockProp(e,'spiderDir');lockProp(e,'spiderMoving');
    lockProp(e,'animDir');lockProp(e,'animMoving');
    lockProp(e,'d21Dir');lockProp(e,'wbDir');
    if(e.isDungeonPhoenixBoss)lockProp(e,'fireCD');
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

  function installBossRuntimeGuards(){
    try{
      [['spawnBoss','spawn'],['spawnDungeon21Boss','spawn'],['spawnWorldCrystalBoss','spawn'],
       ['phoenixDungeonAoeUpdate','ai'],['dungeon21BossUpdate','ai'],['worldCrystalBossUpdate','ai']].forEach(function(pair){
        var name=pair[0],kind=pair[1],base=window[name];
        if(typeof base!=='function'||base.__ppaServerBossGuard)return;
        var wrapped=function(){
          if(active()){
            if(kind==='spawn'&&!window.__PPA_SERVER_SPAWN_CALL)return null;
            if(kind==='ai')return;
          }
          return base.apply(this,arguments);
        };
        wrapped.__ppaServerBossGuard=1;
        wrapped.__ppaServerBossBase=base;
        try{window[name]=wrapped}catch(_){}
      });
    }catch(_){}
  }

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

      var chunkSize=22,total=Math.ceil(rows.length/chunkSize),ok=true;
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
    if(!(/^s\d{1,4}$/.test(key)||key==='p20'||key==='b40'||key==='b60'||key==='wtitan')||!Number.isFinite(hp)||!Number.isFinite(mhp))return;

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
        e=materializeKey(key,true);
      }
      if(!e)return;
      tagServerEntity(e);
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
        if(Number.isFinite(x)&&Number.isFinite(y)){
          var _now=Date.now(),_prevX=Number(e.__ppaServerX),_prevY=Number(e.__ppaServerY),_prevAt=Number(e.__ppaServerAt)||0;
          var _netDt=_prevAt>0?Math.max(16,_now-_prevAt):0;
          if(_netDt>0&&_netDt<1500&&Number.isFinite(_prevX)&&Number.isFinite(_prevY)){
            e.__ppaServerVX=(x-_prevX)*1000/_netDt;
            e.__ppaServerVY=(y-_prevY)*1000/_netDt;
          }else{
            e.__ppaServerVX=0;e.__ppaServerVY=0;
          }
          e.__ppaServerX=x;e.__ppaServerY=y;e.__ppaServerAt=_now;
          var _dx=x-Number(e.x||0),_dy=y-Number(e.y||0),_dist=Math.hypot(_dx,_dy);
          if(!Number.isFinite(Number(e.x))||!Number.isFinite(Number(e.y))||_dist>180||e.__ppaSmoothReady!==true){
            e.x=x;e.y=y;e.__ppaSmoothReady=true;
          }
          e.__ppaTargetX=x;e.__ppaTargetY=y;
          smoothEntities.add(e);
        }
        e.aggro=aggro;
        if(Number.isFinite(dir)){
          var vd=visualDir(dir);
          e.spiderDir=vd;e.animDir=vd;e.__ppaServerDir=dir;e.__ppaVisualDir=vd;applyBossVisualDir(e,dir,moving);
        }
        e.spiderMoving=moving;e.animMoving=moving;e.__ppaServerMoving=moving;
      }finally{applying--}
      return;
    }

    // Dead is also authoritative. If local spawn has not been created yet,
    // keeping it in authority Map is enough; reconcile() will remove it later.
    if(key==='wtitan'){
      try{if(typeof worldBossMarkKilled==='function')worldBossMarkKilled()}catch(_){}
    }
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
          e=materializeKey(key,false);if(e)changed=true;
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
          if(Number.isFinite(Number(st.x))&&Number.isFinite(Number(st.y))){
            var _tx=Number(st.x),_ty=Number(st.y),_dd=Math.hypot(_tx-Number(e.x||0),_ty-Number(e.y||0));
            e.__ppaServerX=_tx;e.__ppaServerY=_ty;
            if(_dd>150||e.__ppaSmoothReady!==true){e.x=_tx;e.y=_ty;e.__ppaSmoothReady=true}
            else{e.__ppaTargetX=_tx;e.__ppaTargetY=_ty;smoothEntities.add(e)}
          }
          if(Number.isFinite(Number(st.sz))&&Number(st.sz)>0)e.sz=Number(st.sz);
          e.aggro=!!st.aggro;
          var d=Number(st.dir);
          if(Number.isFinite(d)){var vd=visualDir(d);e.spiderDir=vd;e.animDir=vd;e.__ppaServerDir=d;e.__ppaVisualDir=vd;applyBossVisualDir(e,d,!!st.moving)}
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
      if(!m)return;
      // A scene transition can beat realtime room switching by a few frames.
      // Drop late dungeon packets so they can never respawn enemies in town.
      if(!active()){cleanupServerEntities();return}
      if(String(m.room||'')!==room())return;
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
      if(m.type==='boss-special'){
        var bk=String(m.key||''),be=find(bk),phase=String(m.phase||''),kind=String(m.kind||''),now=Date.now();
        if(!be){
          var bst=authority.get(bk);
          if(bst&&Number(bst.hp)>0)be=materializeKey(bk,false);
        }
        if(be){
          lockServerMob(be);
          var bd=Number(m.dir);
          applying++;
          try{
            if(Number.isFinite(bd))applyBossVisualDir(be,bd,false);
            if(kind==='phoenix-aoe'){
              if(phase==='telegraph'){
                be.phoenixAoePending=true;be.phoenixAoeImpactAt=Number(m.impactAt)||now+700;be.phoenixAoeFxUntil=(Number(m.impactAt)||now+700)+350;
              }else if(phase==='impact'){
                be.phoenixAoePending=false;be.phoenixAoeFxUntil=now+350;
              }
            }else if(kind==='lord40-aoe'){
              if(phase==='telegraph'){
                be.d21AoePending=true;be.d21AoeImpactAt=Number(m.impactAt)||now+700;be.d21AoeFxUntil=(Number(m.impactAt)||now+700)+350;be.d21State='attack';be.d21ActionUntil=(Number(m.impactAt)||now+700)+200;
              }else if(phase==='impact'){
                be.d21AoePending=false;be.d21AoeFxUntil=now+350;be.d21State='attack';be.d21ActionUntil=now+250;
              }
            }else if(kind==='phoenix-fire'&&phase==='launch'){
              be.spit=26;
              try{
                if(typeof PR!=='undefined'&&Array.isArray(PR)){
                  var sx=Number(be.x),sy=Number(be.y)-10,tx=Number(m.tx),ty=Number(m.ty);
                  var dx=tx-sx,dy=ty-sy,base=Math.atan2(dy,dx),targetId=String(m.target||'');
                  for(var fk=-1;fk<=1;fk++){
                    var fa=base+fk*.26,fs=4.4;
                    PR.push({x:sx,y:sy,vx:Math.cos(fa)*fs,vy:Math.sin(fa)*fs,life:170,dmg:Math.max(1,Number(m.dmg)||85),dmgType:'magic',__ppaServerTarget:targetId});
                  }
                }
              }catch(_){}
            }else if(kind==='titan-aoe'){
              if(phase==='telegraph'){
                be.wbAoePending=true;be.wbAoeImpactAt=Number(m.impactAt)||now+620;be.wbState='stomp';be.wbActionUntil=(Number(m.impactAt)||now+620)+100;
                try{if(typeof WORLD_CRYSTAL_STOMP_FX!=='undefined')WORLD_CRYSTAL_STOMP_FX={x:be.x,y:be.y+10,born:now,duration:700}}catch(_){}
              }else if(phase==='impact'){
                be.wbAoePending=false;be.wbState='aoe';be.wbActionUntil=now+900;
                try{if(typeof WORLD_CRYSTAL_AOE_FX!=='undefined'&&typeof WORLD_CRYSTAL_AOE_RADIUS!=='undefined')WORLD_CRYSTAL_AOE_FX={x:be.x,y:be.y+8,born:now,duration:950,r:WORLD_CRYSTAL_AOE_RADIUS}}catch(_){}
              }
            }else if(kind==='titan-crystal'&&phase==='launch'){
              be.wbState='throw';be.wbActionUntil=now+520;
              try{
                if(typeof WORLD_CRYSTAL_PROJECTILES!=='undefined'&&Array.isArray(WORLD_CRYSTAL_PROJECTILES)){
                  var sx=Number(be.x),sy=Number(be.y)-105,tx=Number(m.tx),ty=Number(m.ty)-18;
                  var dx=tx-sx,dy=ty-sy,dist=Math.max(1,Math.hypot(dx,dy)),speed=8.5;
                  WORLD_CRYSTAL_PROJECTILES.push({x:sx,y:sy,vx:dx/dist*speed,vy:dy/dist*speed,life:220,born:now,angle:Math.atan2(dy,dx),dmg:Math.max(1,Number(m.dmg)||14),__ppaServerTarget:String(m.target||'')});
                }
              }catch(_){}
            }
          }finally{applying--}
        }
        if(phase==='impact'){
          var targets=Array.isArray(m.targets)?m.targets:[],mine=selfId();
          if(targets.indexOf(mine)>=0){
            try{
              var dodge=(typeof effectivePlayerDodge==='function')?Number(effectivePlayerDodge())||0:Number(P&&P.dodge)||0;
              if(Math.random()*100<dodge){
                if(typeof showPickup==='function')showPickup('Уворот!','#88ffcc');
              }else{
                var raw=Math.max(1,Number(m.dmg)||1),dtype=String(m.damageType||'magic');
                var dealt=(typeof playerDmg==='function')?playerDmg(raw,dtype):raw;
                P.hp=Math.max(0,Number(P.hp||0)-Math.max(1,Number(dealt)||1));
                if(typeof showPickup==='function')showPickup(kind==='phoenix-aoe'?'Огненный AOE · −'+Math.max(1,Math.round(dealt)):kind==='lord40-aoe'?'AOE Скверны · −'+Math.max(1,Math.round(dealt)):'Кристальный удар · −'+Math.max(1,Math.round(dealt)),kind==='lord40-aoe'?'#a8ff62':'#66bbff');
              }
            }catch(_){}
          }
        }
        return;
      }
      if(m.type==='mob-attack'){
        var key=String(m.key||''),e=find(key),target=String(m.target||'');
        if(!e&&target&&target===selfId()){
          var st=authority.get(key);
          if(st){
            e=materializeKey(key,false);
          }
        }
        if(e){
          lockServerMob(e);
          e.__ppaServerTarget=target;
          e.atkAnim=12;
          e.atkCD=50;
          if(e.isDungeon60Boss&&typeof window.PPA_DRAGON60_ON_ATTACK==='function')window.PPA_DRAGON60_ON_ATTACK(e,m);
          if(e.isDungeon21Boss){e.d21State='attack';e.d21ActionUntil=Date.now()+520}
          if(e.isWorldCrystalBoss){e.wbState='throw';e.wbActionUntil=Date.now()+520}
          var dir=Number(m.dir);
          applying++;
          try{
            if(Number.isFinite(Number(m.x))&&Number.isFinite(Number(m.y))){
              var _ax=Number(m.x),_ay=Number(m.y),_ad=Math.hypot(_ax-Number(e.x||0),_ay-Number(e.y||0));
              e.__ppaServerX=_ax;e.__ppaServerY=_ay;
              if(_ad>150||e.__ppaSmoothReady!==true){e.x=_ax;e.y=_ay;e.__ppaSmoothReady=true}
              else{e.__ppaTargetX=_ax;e.__ppaTargetY=_ay;smoothEntities.add(e)}
            }
            if(Number.isFinite(dir)){var vd=visualDir(dir);e.spiderDir=vd;e.animDir=vd;e.__ppaServerDir=dir;e.__ppaVisualDir=vd;applyBossVisualDir(e,dir,false)}
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

  function smoothServerMovement(ts){
    smoothRaf=requestAnimationFrame(smoothServerMovement);
    try{
      if(serverMode&&typeof P!=='undefined'&&P&&P.scene!=='dungeon'&&P.scene!=='worldboss'){
        serverMode=false;cleanupServerEntities();
      }
    }catch(_){}
    if(!serverMode||!smoothEntities.size){smoothLast=ts;return}
    var dt=smoothLast?Math.max(8,Math.min(50,ts-smoothLast)):16;smoothLast=ts;
    // Pure interpolation only. No velocity prediction/extrapolation:
    // it removes overshoot, side-jumps and "robot" corrections on mobile.
    var alpha=1-Math.exp(-dt/52);
    smoothEntities.forEach(function(e){
      try{
        if(!e||!keyOf(e)||!(Number(e.hp)>0)){smoothEntities.delete(e);return}
        var tx=Number(e.__ppaServerX),ty=Number(e.__ppaServerY);
        if(!Number.isFinite(tx)||!Number.isFinite(ty)){smoothEntities.delete(e);return}
        var x=Number(e.x),y=Number(e.y),dx=tx-x,dy=ty-y,d=Math.hypot(dx,dy);
        applying++;
        try{
          if(!Number.isFinite(x)||!Number.isFinite(y)||d>140){e.x=tx;e.y=ty}
          else{e.x=x+dx*alpha;e.y=y+dy*alpha}
        }finally{applying--}
        if(d<0.22){
          applying++;
          try{e.x=tx;e.y=ty}finally{applying--}
          if(!e.__ppaServerMoving)smoothEntities.delete(e);
        }
      }catch(_){smoothEntities.delete(e)}
    });
  }

  function tick(){
    installDropGuard();
    installBossRuntimeGuards();
    serverMode=active();
    if(!serverMode){
      cleanupServerEntities();
      lastRoom='';catalogRoom='';authReady=false;authority.clear();deadUntil.clear();
      entityCache.clear();entityCacheLen=-1;diagCache=null;
      return;
    }
    if(typeof P!=='undefined'&&P&&P.scene==='worldboss'){
      var cyc='';try{if(typeof worldBossDailyKey==='function')cyc=String(worldBossDailyKey()||'')}catch(_){}
      if(cyc&&worldCycle!==cyc){worldCycle=cyc;authReady=false;register(true)}else register(false);
    }else register(false);
    // Legacy AI transform writes are hard-locked. A 1 Hz sanity reconcile is
    // enough; position packets already apply their changed rows immediately.
    reconcileAuthority();
  }

  function boot(){
    installDropGuard();
    if(!smoothRaf){smoothLast=0;smoothRaf=requestAnimationFrame(smoothServerMovement)}
    installBossRuntimeGuards();
    serverMode=active();
    setTimeout(function(){register(true)},600);
    setInterval(tick,1000);
    document.addEventListener('visibilitychange',function(){
      if(!document.hidden){serverMode=active();setTimeout(function(){register(true)},400)}
    },{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();