(function(){
  'use strict';

  var installed=false,originalTrack=null,applying=0,lastState=null,lastRequest=0,lastHitAt=0,lastHitAmount=0,lastHitTokenAt=0,lastSpawnTry=0,lastSpawnMethod='';

  function inScene(){try{return typeof P!=='undefined'&&P&&P.scene==='clanboss1'}catch(_){return false}}
  function rtDiag(){try{return window.PPA_REALTIME_DIAG?window.PPA_REALTIME_DIAG():null}catch(_){return null}}
  function clanState(){return window.PPA_SERVER_CLAN_STATE||null}
  function clanId(){var s=clanState();return String(s&&s.clan&&s.clan.id||'')}
  function activeRoom(){var d=rtDiag(),r=String(d&&d.room||'');return inScene()&&!!clanId()&&r.indexOf('clanboss-')===0}
  function send(o){try{return !!(window.PPA_RT_SEND&&window.PPA_RT_SEND(o))}catch(_){return false}}
  function boss(){
    try{
      if(typeof EN==='undefined'||!Array.isArray(EN))return null;
      for(var i=0;i<EN.length;i++)if(EN[i]&&EN[i].isClanBoss)return EN[i];
    }catch(_){}
    return null;
  }
  function trySpawnFn(name,fn){
    if(typeof fn!=='function'||/draw|render|update|tick|damage|track|reward|drop|state|diag|receive|apply|hit/i.test(String(name||'')))return null;
    try{
      var src=Function.prototype.toString.call(fn);
      if(src.indexOf('isClanBoss')<0)return null;
      if(src.indexOf('EN.push')<0&&src.indexOf('.push(')<0)return null;
      lastSpawnMethod=String(name||'anonymous');
      try{fn(lastState&&lastState.bossId,lastState)}catch(_){try{fn(lastState)}catch(__){try{fn()}catch(___){}}}
      return boss();
    }catch(_){return null}
  }
  function ensureBoss(force){
    if(!inScene()||!lastState||lastState.active!==true||!(Number(lastState.bossHp)>0))return boss();
    var b=boss();if(b)return b;
    var now=Date.now();if(!force&&now-lastSpawnTry<250)return null;lastSpawnTry=now;

    var names=['spawnClanBoss','spawnClanBoss1','spawnClanRaidBoss','createClanBoss','makeClanBoss','clanBossSpawn','startClanBossFight','startClanBoss1'];
    for(var i=0;i<names.length;i++){
      try{b=trySpawnFn(names[i],window[names[i]])}catch(_){}
      if(b)return b;
    }

    try{
      var keys=Object.getOwnPropertyNames(window);
      for(var k=0;k<keys.length;k++){
        var name=keys[k],fn=null;
        try{fn=window[name]}catch(_){continue}
        if(typeof fn!=='function')continue;
        b=trySpawnFn(name,fn);
        if(b)return b;
      }
    }catch(_){}

    return null;
  }
  function lockBoss(b){
    if(!b||b.__ppaClanBossRtLocked)return b;
    var hp=Math.max(0,Number(b.hp)||0),mhp=Math.max(1,Number(b.mhp)||hp||1);
    try{
      Object.defineProperty(b,'hp',{configurable:true,enumerable:true,get:function(){return hp},set:function(v){
        var next=Math.max(0,Number(v)||0);
        if(applying>0||!activeRoom()){hp=next;return}
        if(next<hp)hit(hp-next);
      }});
      Object.defineProperty(b,'mhp',{configurable:true,enumerable:true,get:function(){return mhp},set:function(v){if(applying>0||!activeRoom())mhp=Math.max(1,Number(v)||1)}});
      Object.defineProperty(b,'__ppaClanBossRtLocked',{value:true,configurable:true});
    }catch(_){}
    return b;
  }
  function apply(st){
    if(!st||typeof st!=='object')return false;
    lastState=Object.assign({},st);
    try{if(window.PPA_SET_CLAN_BOSS_STATE)window.PPA_SET_CLAN_BOSS_STATE(lastState)}catch(_){}
    var b=lockBoss(boss()||ensureBoss(true));
    if(b){
      applying++;
      try{
        if(Number.isFinite(Number(lastState.bossMaxHp)))b.mhp=Math.max(1,Number(lastState.bossMaxHp));
        if(Number.isFinite(Number(lastState.bossHp)))b.hp=Math.max(0,Math.min(Number(b.mhp)||Number(lastState.bossMaxHp)||1,Number(lastState.bossHp)));
        b.__ppaClanBossServer=true;
        b.__ppaClanBossStatus=String(lastState.status||'');
      }finally{applying--}
    }
    if((String(lastState.status)==='defeated'||String(lastState.status)==='cooldown')&&Number(lastState.bossHp)<=0){
      try{if(typeof showPickup==='function'&&!window.__PPA_CLAN_BOSS_DEFEAT_SHOWN){window.__PPA_CLAN_BOSS_DEFEAT_SHOWN=true;showPickup('КЛАНОВЫЙ БОСС ПОВЕРЖЕН · ОТКАТ 6 ЧАСОВ','#ffd36a')}}catch(_){}
    }else window.__PPA_CLAN_BOSS_DEFEAT_SHOWN=false;
    return true;
  }
  function request(force){
    if(!inScene()||!clanId())return false;
    var now=Date.now();if(!force&&now-lastRequest<1800)return false;lastRequest=now;
    return send({type:'clan-boss-state-request'});
  }
  function hit(amount){
    amount=Math.max(0,Number(amount)||0);
    if(!(amount>0)||!activeRoom())return false;
    var now=Date.now(),rounded=Math.round(amount*100)/100;
    if(Math.abs(rounded-lastHitAmount)<0.01&&now-lastHitTokenAt<70)return true;
    lastHitAmount=rounded;lastHitTokenAt=now;lastHitAt=now;
    var b=boss(),bossId=String(lastState&&lastState.bossId||b&&b.clanBossId||b&&b.id||'clan_boss_1');
    send({type:'clan-boss-hit',bossId:bossId,amount:rounded,event:'cb:'+now+':'+Math.random().toString(36).slice(2,8)});
    return true;
  }
  function installTrack(){
    if(installed)return true;
    var fn=null;
    try{if(typeof clanBossTrackDamage==='function')fn=clanBossTrackDamage}catch(_){}
    if(typeof fn!=='function')fn=window.clanBossTrackDamage;
    if(typeof fn!=='function')return false;
    originalTrack=fn;
    var wrapped=function(amount){
      if(activeRoom()){
        hit(amount);
        var b=lockBoss(boss());
        if(b&&lastState&&Number.isFinite(Number(lastState.bossHp))){
          applying++;try{b.hp=Math.max(0,Number(lastState.bossHp)||0)}finally{applying--}
        }
        return amount;
      }
      return originalTrack.apply(this,arguments);
    };
    wrapped.__ppaClanBossRealtime=true;
    window.clanBossTrackDamage=wrapped;
    try{clanBossTrackDamage=wrapped}catch(_){}
    installed=true;
    return true;
  }

  window.PPA_CLAN_BOSS_RT_RECEIVE=function(m){
    if(!m||typeof m!=='object')return;
    if(m.type==='clan-boss-state'&&m.bossState)apply(m.bossState);
    if(m.type==='clan-boss-defeated'){
      var s=Object.assign({},lastState||{},{
        active:false,status:'defeated',bossHp:0,
        cooldownUntil:Number(m.cooldownUntil)||0,bossReadyAt:Number(m.cooldownUntil)||0
      });apply(s);
    }
    if(m.type==='clan-boss-reject')request(true);
  };
  window.PPA_CLAN_BOSS_RT_APPLY_STATE=apply;
  window.PPA_CLAN_BOSS_RT_START=function(st){apply(st);setTimeout(function(){ensureBoss(true);apply(lastState);request(true)},120);setTimeout(function(){ensureBoss(true);apply(lastState)},500);return true};
  window.PPA_CLAN_BOSS_RT_HIT=hit;
  window.PPA_CLAN_BOSS_RT_DIAG=function(){var b=boss();return{installed:installed,scene:inScene(),room:(rtDiag()||{}).room||'',clanId:clanId(),state:lastState,bossPresent:!!b,bossLocked:!!(b&&b.__ppaClanBossRtLocked),entityCount:(typeof EN!=='undefined'&&Array.isArray(EN)?EN.length:-1),lastSpawnMethod:lastSpawnMethod,lastSpawnTry:lastSpawnTry,lastRequest:lastRequest,lastHitAt:lastHitAt,lastHitAmount:lastHitAmount}};

  setInterval(function(){
    installTrack();
    if(inScene()){
      var b=boss()||ensureBoss(false);
      if(b&&lastState)apply(lastState);else lockBoss(b);
      request(false);
    }
  },350);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(installTrack,50)},{once:true});else setTimeout(installTrack,50);
})();