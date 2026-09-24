(function(){
  'use strict';

  var installed=false,originalTrack=null,applying=0,lastState=null,lastRequest=0,lastHitAt=0;

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
  function lockBoss(b){
    if(!b||b.__ppaClanBossRtLocked)return b;
    var hp=Math.max(0,Number(b.hp)||0),mhp=Math.max(1,Number(b.mhp)||hp||1);
    try{
      Object.defineProperty(b,'hp',{configurable:true,enumerable:true,get:function(){return hp},set:function(v){if(applying>0||!activeRoom())hp=Math.max(0,Number(v)||0)}});
      Object.defineProperty(b,'mhp',{configurable:true,enumerable:true,get:function(){return mhp},set:function(v){if(applying>0||!activeRoom())mhp=Math.max(1,Number(v)||1)}});
      Object.defineProperty(b,'__ppaClanBossRtLocked',{value:true,configurable:true});
    }catch(_){}
    return b;
  }
  function apply(st){
    if(!st||typeof st!=='object')return false;
    lastState=Object.assign({},st);
    try{if(window.PPA_SET_CLAN_BOSS_STATE)window.PPA_SET_CLAN_BOSS_STATE(lastState)}catch(_){}
    var b=lockBoss(boss());
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
    var now=Date.now();lastHitAt=now;
    var b=boss(),bossId=String(lastState&&lastState.bossId||b&&b.clanBossId||b&&b.id||'clan_boss_1');
    send({type:'clan-boss-hit',bossId:bossId,amount:Math.round(amount*100)/100,event:'cb:'+now+':'+Math.random().toString(36).slice(2,8)});
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
  window.PPA_CLAN_BOSS_RT_START=function(st){apply(st);setTimeout(function(){request(true)},120);return true};
  window.PPA_CLAN_BOSS_RT_HIT=hit;
  window.PPA_CLAN_BOSS_RT_DIAG=function(){return{installed:installed,scene:inScene(),room:(rtDiag()||{}).room||'',clanId:clanId(),state:lastState,bossLocked:!!(boss()&&boss().__ppaClanBossRtLocked),lastRequest:lastRequest,lastHitAt:lastHitAt}};

  setInterval(function(){
    installTrack();
    if(inScene()){
      lockBoss(boss());
      request(false);
    }
  },350);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(installTrack,50)},{once:true});else setTimeout(installTrack,50);
})();