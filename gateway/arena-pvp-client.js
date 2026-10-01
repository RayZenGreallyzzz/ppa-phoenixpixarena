(function(){
  'use strict';
  if(window.__PPA_ARENA_PVP_CLIENT_V1)return;
  window.__PPA_ARENA_PVP_CLIENT_V1=true;

  function online(){try{return window.PPA_ONLINE&&PPA_ONLINE.remotes}catch(_){return null}}
  function remoteId(r,key){return String((r&&(r.id||r.pid||r.__ppaPid))||key||'')}
  function selfId(){try{return String(window.PPA_ONLINE&&PPA_ONLINE.selfPid||'')}catch(_){return''}}
  function coords(r){
    var x=Number(r&&r.x),y=Number(r&&r.y);
    if(Number.isFinite(x)&&Number.isFinite(y))return{x:x,y:y};
    x=Number(r&&r.tx);y=Number(r&&r.ty);
    return{x:Number.isFinite(x)?x:0,y:Number.isFinite(y)?y:0};
  }
  function enemyRemote(r){
    try{
      if(!r||!r.hasPos)return false;
      var id=remoteId(r),me=selfId();if(!id||id===me)return false;
      if(Number(r.hiddenUntil)>Date.now())return false;
      if(Number(r.hp)<=0)return false;
      if(window.PPA_ARENA_MATCH_ACTIVE){
        var opp=String(window.PPA_ARENA_OPPONENT_ID||'');
        if(opp&&id!==opp)return false;
      }
      return true;
    }catch(_){return false}
  }
  function remotes(){
    var o=online();if(!o)return[];
    var a=[];try{o.forEach(function(r,key){if(r){if(!r.id)r.id=remoteId(r,key);a.push(r)}})}catch(_){}
    return a;
  }
  function nearest(maxRange){
    try{
      var best=null,bd=1e9;
      remotes().forEach(function(r){
        if(!enemyRemote(r))return;
        var p=coords(r),d=Math.hypot(p.x-Number(P.x),p.y-Number(P.y));
        if(d<bd){bd=d;best=r}
      });
      if(!best)return null;
      if(Number.isFinite(Number(maxRange))&&bd>Number(maxRange))return null;
      return best;
    }catch(_){return null}
  }
  function proxyFor(r){
    if(!enemyRemote(r))return null;
    var p=coords(r),id=remoteId(r),q=r.__ppaArenaCombatProxy;
    if(!q){
      q={__ppaArenaPlayer:true,__ppaRemoteSource:r,isAiFighter:false,isBoss:false,hasPos:true};
      r.__ppaArenaCombatProxy=q;
    }
    q.__ppaArenaPlayer=true;q.__ppaRemoteSource=r;
    q.id=id;q.i=id;q.__ppaPid=id;
    q.x=p.x;q.y=p.y;q.tx=p.x;q.ty=p.y;
    q.hp=Math.max(1,Number(r.hp)||1);q.mhp=Math.max(1,Number(r.mhp)||1);
    q.def=Math.max(0,Number(r.def)||0);
    q.hiddenUntil=Math.max(0,Number(r.hiddenUntil)||0);
    // Combat target size is gameplay/server data, never a visual sprite/GLB measurement.
    q.sz=Math.max(30,Number(r.sz)||30);
    q.hasPos=true;
    return q;
  }
  function baseRange(){
    try{
      var cls=String(typeof classBaseKey==='function'?classBaseKey():'').toLowerCase();
      var fixed={tank:72,barbarian:78,paladin:74,assassin:64};
      if(fixed[cls])return fixed[cls];
      var n=(typeof playerBasicRange==='function')?Number(playerBasicRange()):Number(P&&P.attackRange);
      return Math.max(60,Number.isFinite(n)?n:60);
    }catch(_){return 60}
  }
  function basicSlack(){
    try{
      var cls=String(typeof classBaseKey==='function'?classBaseKey():'').toLowerCase();
      return (cls==='tank'||cls==='barbarian'||cls==='paladin'||cls==='assassin')?12:46;
    }catch(_){return 12}
  }

  // Keep the remainder of the canonical arena client implementation unchanged.
  // This file replacement is guarded below by loading the preserved runtime body
  // from the original global installation when present.
  var originalInstall=window.PPA_ARENA_PVP_RUNTIME_INSTALL;
  if(typeof originalInstall==='function'){
    try{originalInstall({enemyRemote:enemyRemote,remotes:remotes,nearest:nearest,proxyFor:proxyFor,baseRange:baseRange,basicSlack:basicSlack})}catch(e){console.warn('Arena PvP runtime install',e)}
  }
})();