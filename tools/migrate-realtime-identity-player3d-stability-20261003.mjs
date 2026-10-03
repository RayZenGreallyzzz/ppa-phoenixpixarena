import fs from 'node:fs';

function replaceOne(src,from,to,label){
  const n=src.split(from).length-1;
  if(n!==1)throw new Error(`${label}: expected 1 target, found ${n}`);
  return src.replace(from,to);
}

// 1) Realtime identity refresh must stay on the existing WebSocket.
// Legacy online teardown is already performed once in boot(); never move it
// into a hot loop or reconnect path.
const rtPath='gateway/realtime-client.js';
let rt=fs.readFileSync(rtPath,'utf8');
rt=replaceOne(
  rt,
  "    if(m.type==='hello'){",
  "    if(m.type==='identity-state'){\n      try{\n        if(m.ok!==false&&typeof PPA_ONLINE!=='undefined'){\n          PPA_ONLINE.selfName=String(m.name||PPA_ONLINE.selfName||selfName());\n          PPA_ONLINE.selfClanId=String(m.clanId||'');\n          PPA_ONLINE.selfClanName=String(m.clanName||'');\n        }\n      }catch(_){}\n      return;\n    }\n    if(m.type==='hello'){",
  'identity-state receive hook'
);
rt=replaceOne(
  rt,
  "setInterval(function(){\n    if(!RT.ws||RT.ws.readyState!==WebSocket.OPEN)return;\n    disableLegacyOnline();sendRoom(false);sendMove(false);clanBossTick();\n  },120);",
  "setInterval(function(){\n    if(!RT.ws||RT.ws.readyState!==WebSocket.OPEN)return;\n    sendRoom(false);sendMove(false);clanBossTick();\n  },120);",
  'remove legacy teardown from 120ms hot loop'
);
rt=replaceOne(
  rt,
  "  window.PPA_REALTIME_RESYNC=resyncRoom;\n  window.PPA_REALTIME_RECONNECT=function(){try{if(RT.ws)RT.ws.close(4000,'Identity refresh')}catch(_){};setTimeout(connect,250)};",
  "  window.PPA_REALTIME_RESYNC=resyncRoom;\n  window.PPA_REALTIME_REFRESH_IDENTITY=function(){return send({type:'identity-refresh'})};\n  window.PPA_REALTIME_RECONNECT=function(){try{if(RT.ws)RT.ws.close(4000,'Manual reconnect')}catch(_){};setTimeout(connect,250)};",
  'identity refresh API'
);
if(rt.includes("disableLegacyOnline();sendRoom(false)"))throw new Error('legacy teardown still runs in realtime hot loop');
if(!rt.includes("PPA_REALTIME_REFRESH_IDENTITY"))throw new Error('identity refresh client API missing');
if(!rt.includes("function boot(){\n    if(RT.started)return;RT.started=true;disableLegacyOnline();"))throw new Error('legacy teardown is not owned by boot');
fs.writeFileSync(rtPath,rt,'utf8');

// 2) Identity watcher no longer closes a healthy socket. It merely asks the
// authoritative server to refresh nickname/clan from D1 for this Telegram ID.
const identityPath='gateway/realtime-identity-sync.js';
const identity=`(function(){
  'use strict';
  var lastClan=null,lastName=null;
  function current(){
    try{
      if(typeof CLAN_LOCAL_STATE==='undefined'||!CLAN_LOCAL_STATE||!CLAN_LOCAL_STATE.connected)return null;
      var clan=(CLAN_LOCAL_STATE.clan&&CLAN_LOCAL_STATE.clan.id)?String(CLAN_LOCAL_STATE.clan.id):'';
      var name=String((typeof INV!=='undefined'&&INV&&INV.playerName)||window.PPA_PLAYER_NAME||'').trim();
      return {clan:clan,name:name};
    }catch(_){return null}
  }
  setInterval(function(){
    if(typeof window.PPA_REALTIME_REFRESH_IDENTITY!=='function')return;
    var v=current();if(!v)return;
    if(lastClan===null){lastClan=v.clan;lastName=v.name;return}
    if(v.clan===lastClan&&v.name===lastName)return;
    lastClan=v.clan;lastName=v.name;
    window.PPA_REALTIME_REFRESH_IDENTITY();
  },1500);
})();
`;
fs.writeFileSync(identityPath,identity,'utf8');

// 3) Server refreshes identity from authenticated D1 records, never from
// client-supplied nickname/clan data, and keeps the same websocket/room.
const serverPath='src/realtime-stable.js';
let server=fs.readFileSync(serverPath,'utf8');
server=replaceOne(
  server,
  "    if (m.type === 'clan-boss-enter') {",
  `    if (m.type === 'identity-refresh') {
      try {
        const player = this.env && this.env.DB
          ? await this.env.DB.prepare('SELECT nickname,class_key FROM players WHERE telegram_id=?1 LIMIT 1').bind(String(a.telegramId || '')).first()
          : null;
        const member = this.env && this.env.DB
          ? await this.env.DB.prepare('SELECT cm.clan_id,c.name AS clan_name FROM clan_members cm LEFT JOIN clans c ON c.id=cm.clan_id WHERE cm.telegram_id=?1 LIMIT 1').bind(String(a.telegramId || '')).first()
          : null;
        if (player && player.nickname) a.name = cleanName(player.nickname);
        const refreshedClass = cleanClass(player && player.class_key);
        if (refreshedClass) a.classKey = refreshedClass;
        a.clanId = member && member.clan_id ? String(member.clan_id).slice(0, 80) : '';
        a.clanName = member && member.clan_id ? String(member.clan_name || '').trim().slice(0, 24) : '';
        a.lastSeenAt = now;
        ws.serializeAttachment(a);
        const identityRoom = cleanRoom(a.room);
        wsJson(ws, { type:'identity-state', ok:true, name:a.name, clanId:a.clanId, clanName:a.clanName, classKey:a.classKey, room:identityRoom, ts:now });
        this.roomBroadcast(identityRoom, { type:'move', player:packetFromAtt(a), room:identityRoom, ts:now }, ws);
        if (a.partyId) this.sendPartyState(a.partyId);
      } catch (err) {
        console.warn('PPA realtime identity refresh', err);
        wsJson(ws, { type:'identity-state', ok:false, ts:now });
      }
      return;
    }

    if (m.type === 'clan-boss-enter') {`,
  'server identity refresh handler'
);
if(!server.includes("m.type === 'identity-refresh'"))throw new Error('server identity refresh handler missing');
fs.writeFileSync(serverPath,server,'utf8');

// 4) Local Player3D is persistent across transient canonical-state gaps.
// mapReady already hides the renderer outside the game; deleting the GLB after
// an arbitrary 1.5s gap only causes visible reload/flicker during hydration/reconnect.
const p3Path='gateway/player-3d-unified-runtime.js';
let p3=fs.readFileSync(p3Path,'utf8');
p3=replaceOne(
  p3,
  "  let localStateMissingSince=0,localSceneToken=null;",
  "  let localSceneToken=null;",
  'remove local missing-state destroy timer'
);
const oldSync=`  function syncLocalFromGame(now){
    try{
      if(typeof P==='undefined'||!P)throw new Error('local state unavailable');
      const cls=localClass(),x=Number(P.x),y=Number(P.y);
      if(!cls||!Number.isFinite(x)||!Number.isFinite(y))throw new Error('local state incomplete');
      const nextScene=String(P.scene==null?'':P.scene);
      if(localSceneToken!==null&&localSceneToken!==nextScene){
        const current=instances.get('local');
        if(current){
          current.lastWX=null;current.lastWY=null;current.movingUntil=0;
          current.lastMotionYaw=0;current.hasMotionYaw=false;
          if(current.root)current.root.visible=false;
        }
      }
      localSceneToken=nextScene;
      localStateMissingSince=0;
      localAnchor.classKey=cls;
      localAnchor.worldX=x;
      localAnchor.worldY=y;
      localAnchor.scene=nextScene;
      upsert('local','local',cls,null,localAnchor);
      return true;
    }catch(_){
      if(!localStateMissingSince)localStateMissingSince=now;
      if(now-localStateMissingSince>1500){
        const e=instances.get('local');
        if(e)removeEntry('local',e);
        localSceneToken=null;
      }
      return false;
    }
  }
`;
const newSync=`  function syncLocalFromGame(now){
    try{
      if(typeof P==='undefined'||!P)return false;
      const x=Number(P.x),y=Number(P.y);
      if(!Number.isFinite(x)||!Number.isFinite(y))return false;
      const cls=localClass()||normalizeClass(localAnchor.classKey);
      if(!cls)return false;
      const nextScene=String(P.scene==null?'':P.scene);
      if(localSceneToken!==null&&localSceneToken!==nextScene){
        const current=instances.get('local');
        if(current){
          current.lastWX=null;current.lastWY=null;current.movingUntil=0;
          current.lastMotionYaw=0;current.hasMotionYaw=false;
          if(current.root)current.root.visible=false;
        }
      }
      localSceneToken=nextScene;
      localAnchor.classKey=cls;
      localAnchor.worldX=x;
      localAnchor.worldY=y;
      localAnchor.scene=nextScene;
      upsert('local','local',cls,null,localAnchor);
      return true;
    }catch(_){return false}
  }
`;
p3=replaceOne(p3,oldSync,newSync,'persistent local Player3D lifecycle');
if(p3.includes('localStateMissingSince'))throw new Error('local Player3D destroy timer survived');
fs.writeFileSync(p3Path,p3,'utf8');

// 5) Cache bumps so deployed Telegram WebViews cannot reuse the old runtimes.
const postPath='tools/postbuild-player-3d-unified-20261002.mjs';
let post=fs.readFileSync(postPath,'utf8');
post=post.replaceAll('player-3d-unified-runtime.js?v=20261003u13','player-3d-unified-runtime.js?v=20261003u14');
if(!post.includes('player-3d-unified-runtime.js?v=20261003u14'))throw new Error('Player3D u14 cache bump missing');
fs.writeFileSync(postPath,post,'utf8');

const buildPath='build.mjs';
let build=fs.readFileSync(buildPath,'utf8');
build=replaceOne(build,"const CLIENT_BUILD = 'v631-dwarf-muzzle-axis-20261002';","const CLIENT_BUILD = 'v632-realtime-identity-player3d-stability-20261003';",'client cache key');
fs.writeFileSync(buildPath,build,'utf8');

console.log('Applied realtime identity no-reconnect + persistent local Player3D lifecycle migration.');
