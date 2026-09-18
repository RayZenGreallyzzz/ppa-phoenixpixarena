(function(){
  'use strict';

  var seq=0, applying=0, lastRoom='', lastRegister=0;

  function rt(){try{return window.PPA_REALTIME_DIAG?window.PPA_REALTIME_DIAG():null}catch(_){return null}}
  function room(){var d=rt();return String((d&&d.room)||'')}
  function active(){try{return typeof P!=='undefined'&&P&&P.scene==='dungeon'&&/^dungeon-/.test(room())&&typeof window.PPA_RT_SEND==='function'}catch(_){return false}}
  function selfId(){try{return String((typeof PPA_ONLINE!=='undefined'&&PPA_ONLINE&&PPA_ONLINE.selfId)||'')}catch(_){return''}}
  function partyId(){try{return String((window.PPA_PARTY_STATE&&window.PPA_PARTY_STATE.partyId)||'')}catch(_){return''}}
  function keyOf(e){if(!e||e.isBoss||e.si==null)return'';var si=Math.floor(Number(e.si));return Number.isFinite(si)&&si>=0&&si<10000?'s'+si:''}
  function siOf(key){var m=String(key||'').match(/^s(\d{1,4})$/);return m?Number(m[1]):-1}
  function entities(){try{return (typeof EN!=='undefined'&&Array.isArray(EN))?EN:[]}catch(_){return[]}}
  function find(key){var a=entities();for(var i=0;i<a.length;i++)if(keyOf(a[i])===key)return a[i];return null}
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
      var now=Date.now(),r=room();
      if(!force&&r===lastRoom&&now-lastRegister<2500)return true;
      var rows=[];
      entities().forEach(function(e){
        var key=keyOf(e);if(!key)return;
        var mhp=Math.max(1,Number(e.mhp)||Number(e.hp)||1);
        rows.push([key,Math.round(mhp*100)/100]);
      });
      if(!rows.length)return false;
      lastRoom=r;lastRegister=now;
      return !!window.PPA_RT_SEND({type:'mob-catalog',room:r,rows:rows});
    }catch(_){return false}
  }
  window.PPA_MOB_SERVER_REGISTER=function(){return register(true)};

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
    if(!/^s\d{1,4}$/.test(key)||!Number.isFinite(hp)||!Number.isFinite(mhp))return;
    var e=find(key);
    if(hp>0){
      if(!e){
        var si=siOf(key);
        try{if(si>=0&&typeof spawnMobAtPoint==='function')spawnMobAtPoint(si,true)}catch(_){}
        e=find(key);
      }
      if(!e)return;
      e.__ppaEventKiller='';e.__ppaEventParty='';
      applying++;
      try{e.mhp=Math.max(1,mhp);e.hp=Math.min(e.mhp,Math.max(1,hp))}finally{applying--}
      return;
    }
    if(!e)return;
    e.__ppaEventKiller=killer;e.__ppaEventParty=party;e.__ppaServerRespawnAt=respawnAt;
    applying++;
    try{e.hp=0}finally{applying--}
  }

  window.PPA_DUNGEON_MOB_EVENT_RECEIVE=function(m){
    try{
      if(!m||String(m.room||'')!==room())return;
      if(m.type==='mob-authority-snapshot'){
        var rows=Array.isArray(m.rows)?m.rows:[];
        for(var i=0;i<rows.length;i++)applyRow(rows[i]);
        return;
      }
      if(m.type==='mob-authority'){
        applyRow([m.key,m.hp,m.mhp,m.respawnAt,m.killer,m.party]);
        return;
      }
    }catch(err){console.warn('PPA authoritative mob receive',err)}
  };

  function tick(){
    installDropGuard();
    if(!active()){lastRoom='';return}
    register(false);
  }

  function boot(){
    installDropGuard();
    setTimeout(function(){register(true)},600);
    setInterval(tick,1000);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)setTimeout(function(){register(true)},400)},{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();