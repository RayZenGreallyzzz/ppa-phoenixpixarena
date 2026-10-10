(function(){
  'use strict';
  // PPA_REALTIME_IDENTITY_INBAND_20261003
  var lastClan=null,lastName=null;
  function current(){
    try{
      if(typeof CLAN_LOCAL_STATE==='undefined'||!CLAN_LOCAL_STATE||!CLAN_LOCAL_STATE.connected)return null;
      var clan=(CLAN_LOCAL_STATE.clan&&CLAN_LOCAL_STATE.clan.id)?String(CLAN_LOCAL_STATE.clan.id):'';
      var name=String((typeof INV!=='undefined'&&INV&&INV.playerName)||window.PPA_PLAYER_NAME||'').trim();
      return {clan:clan,name:name};
    }catch(_){return null}
  }
  function sync(v){
    if(!v||typeof window.PPA_REALTIME_IDENTITY_SYNC!=='function')return false;
    return window.PPA_REALTIME_IDENTITY_SYNC(v.name);
  }
  setInterval(function(){
    var v=current();if(!v)return;
    if(lastClan===null){lastClan=v.clan;lastName=v.name;sync(v);return}
    if(v.clan===lastClan&&v.name===lastName)return;
    lastClan=v.clan;lastName=v.name;
    sync(v);
  },1500);
})();
