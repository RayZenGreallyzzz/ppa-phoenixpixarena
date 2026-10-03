import fs from 'node:fs';

function replaceOnce(src, from, to, label){
  const n=src.split(from).length-1;
  if(n!==1)throw new Error(`${label}: expected exactly 1 match, found ${n}`);
  return src.replace(from,to);
}

// 1) Client transport: identity refresh must never tear down WebSocket.
{
  const path='gateway/realtime-client.js';
  let src=fs.readFileSync(path,'utf8');
  const from="  window.PPA_REALTIME_RESYNC=resyncRoom;\n  window.PPA_REALTIME_RECONNECT=function(){try{if(RT.ws)RT.ws.close(4000,'Identity refresh')}catch(_){};setTimeout(connect,250)};";
  const to="  window.PPA_REALTIME_RESYNC=resyncRoom;\n  // PPA_REALTIME_IDENTITY_INBAND_20261003: metadata refresh stays on the live socket.\n  window.PPA_REALTIME_IDENTITY_SYNC=function(name){\n    var clean=String(name||'').trim().slice(0,24);\n    return send({type:'identity-sync',name:clean});\n  };\n  // Keep a manual recovery hook for diagnostics only. Identity/profile updates must not call it.\n  window.PPA_REALTIME_RECONNECT=function(){try{if(RT.ws)RT.ws.close(4001,'Manual reconnect')}catch(_){};setTimeout(connect,250)};";
  src=replaceOnce(src,from,to,'realtime client identity transport');
  fs.writeFileSync(path,src);
}

// 2) Poller: detect identity changes, but update them in-band instead of reconnecting.
{
  const path='gateway/realtime-identity-sync.js';
  const src=`(function(){\n  'use strict';\n  // PPA_REALTIME_IDENTITY_INBAND_20261003\n  var lastClan=null,lastName=null;\n  function current(){\n    try{\n      if(typeof CLAN_LOCAL_STATE==='undefined'||!CLAN_LOCAL_STATE||!CLAN_LOCAL_STATE.connected)return null;\n      var clan=(CLAN_LOCAL_STATE.clan&&CLAN_LOCAL_STATE.clan.id)?String(CLAN_LOCAL_STATE.clan.id):'';\n      var name=String((typeof INV!=='undefined'&&INV&&INV.playerName)||window.PPA_PLAYER_NAME||'').trim();\n      return {clan:clan,name:name};\n    }catch(_){return null}\n  }\n  function sync(v){\n    if(!v||typeof window.PPA_REALTIME_IDENTITY_SYNC!=='function')return false;\n    return window.PPA_REALTIME_IDENTITY_SYNC(v.name);\n  }\n  setInterval(function(){\n    var v=current();if(!v)return;\n    if(lastClan===null){lastClan=v.clan;lastName=v.name;sync(v);return}\n    if(v.clan===lastClan&&v.name===lastName)return;\n    lastClan=v.clan;lastName=v.name;\n    sync(v);\n  },1500);\n})();\n`;
  fs.writeFileSync(path,src);
}

// 3) Profile/registration: notify the live realtime socket instead of forcing reconnect.
{
  const path='gateway/ppa-bridge.js';
  let src=fs.readFileSync(path,'utf8');
  const reconnect="try{if(window.PPA_REALTIME_RECONNECT)setTimeout(function(){window.PPA_REALTIME_RECONNECT()},60)}catch(_){}";
  const count=src.split(reconnect).length-1;
  if(count!==2)throw new Error(`ppa bridge reconnect hooks: expected 2, found ${count}`);
  src=src.replace(reconnect,"try{if(window.PPA_REALTIME_IDENTITY_SYNC)setTimeout(function(){window.PPA_REALTIME_IDENTITY_SYNC(nickname)},60)}catch(_){}");
  src=src.replace(reconnect,"try{if(window.PPA_REALTIME_IDENTITY_SYNC)setTimeout(function(){window.PPA_REALTIME_IDENTITY_SYNC(nickname)},60)}catch(_){}");
  fs.writeFileSync(path,src);
}

// 4) Server: accept identity refresh in-band; name is sanitized and clan remains server-authoritative.
{
  const path='src/realtime-stable.js';
  let src=fs.readFileSync(path,'utf8');
  const marker="    if (m.type === 'player-pk-toggle') {";
  const insert=`    if (m.type === 'identity-sync') {\n      // PPA_REALTIME_IDENTITY_INBAND_20261003\n      a.name = cleanName(m.name || a.name || 'Игрок');\n      if (this.env && this.env.DB && a.telegramId) {\n        try {\n          const row = await this.env.DB.prepare(\n            'SELECT cm.clan_id,c.name AS clan_name FROM clan_members cm LEFT JOIN clans c ON c.id=cm.clan_id WHERE cm.telegram_id=?1 LIMIT 1'\n          ).bind(String(a.telegramId)).first();\n          a.clanId = row && row.clan_id ? String(row.clan_id).slice(0,80) : '';\n          a.clanName = row && row.clan_name ? String(row.clan_name).trim().slice(0,24) : '';\n        } catch (_) {}\n      }\n      a.lastSeenAt = now;\n      ws.serializeAttachment(a);\n      const identityRoom = cleanRoom(a.room);\n      this.roomBroadcast(identityRoom,{type:'move',player:packetFromAtt(a),room:identityRoom},ws);\n      wsJson(ws,{type:'identity-synced',name:cleanName(a.name),clanId:String(a.clanId||''),clanName:String(a.clanName||''),ts:now});\n      return;\n    }\n\n`;
  src=replaceOnce(src,marker,insert+marker,'server identity-sync insertion');
  fs.writeFileSync(path,src);
}

console.log('Realtime identity migration applied: metadata updates are in-band; no identity-triggered WebSocket teardown.');
