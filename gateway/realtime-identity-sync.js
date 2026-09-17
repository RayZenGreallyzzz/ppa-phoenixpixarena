(function(){
  'use strict';
  var lastClan=null,lastName=null,lastReconnect=0;
  function current(){
    try{
      if(typeof CLAN_LOCAL_STATE==='undefined'||!CLAN_LOCAL_STATE||!CLAN_LOCAL_STATE.connected)return null;
      var clan=(CLAN_LOCAL_STATE.clan&&CLAN_LOCAL_STATE.clan.id)?String(CLAN_LOCAL_STATE.clan.id):'';
      var name=String((typeof INV!=='undefined'&&INV&&INV.playerName)||window.PPA_PLAYER_NAME||'').trim();
      return {clan:clan,name:name};
    }catch(_){return null}
  }
  setInterval(function(){
    if(typeof window.PPA_REALTIME_RECONNECT!=='function')return;
    var v=current();if(!v)return;
    if(lastClan===null){lastClan=v.clan;lastName=v.name;return}
    if(v.clan===lastClan&&v.name===lastName)return;
    lastClan=v.clan;lastName=v.name;
    if(Date.now()-lastReconnect<3000)return;
    lastReconnect=Date.now();
    window.PPA_REALTIME_RECONNECT();
  },1500);
})();
