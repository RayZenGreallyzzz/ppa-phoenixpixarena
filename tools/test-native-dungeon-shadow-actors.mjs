import assert from 'node:assert/strict';
import {NativeDungeonShadowActors} from '../src/native-dungeon-shadow-actors.js';
import {inspectNativeDungeonEntry} from '../src/native-dungeon-entry-preflight.js';
import {RealtimeHub} from '../src/realtime-stable.js';

// Synthetic signed owners and WebSockets only. No Cloudflare, D1, player data,
// combat, HP/MP mutation, loot, awards or Telegram changes.
const now=1_800_000_000_000;
const room='dungeon-1-20-i1';
const packet={type:'dungeon-entry-check',base:'dungeon-1-20',requestId:'shadow_12345678'};
const evidence={enabled:true,signedNative:true,pid:'p:'+'a'.repeat(32),
  ownerId:'11',currentRoom:'safe',observerRoom:room,
  deadLocked:false,arenaMatchId:'',partyId:'',
  activeTelegramCount:1,occupiedSeats:1,reservedSeats:0};
const accepted=inspectNativeDungeonEntry(packet,evidence);
assert.equal(accepted.code,'SERVER_COMBAT_RUNTIME_REQUIRED');
const registry=new NativeDungeonShadowActors();
const sockA={};
const staged=registry.stage(sockA,evidence,accepted,now);
assert.equal(staged.ok,true);
assert.equal(staged.code,'SHADOW_OBSERVER_ONLY');
assert.equal(staged.origin,'server-dungeon-shadow-v1');
assert.equal(staged.observer,true);
assert.equal(staged.participating,false);
for(const field of ['hp','maxHp','mp','maxMp','position','cooldownUntil','statusEffects'])
  assert.equal(staged[field],null,field+' was forged');
for(const field of ['canJoin','canAttack','canCast','canReceiveRewards'])
  assert.equal(staged[field],false);
assert.equal(registry.recordRequest(sockA,evidence,'hit_12345678',now).code,'SERVER_COMBAT_RUNTIME_REQUIRED');
assert.equal(registry.recordRequest(sockA,evidence,'hit_12345678',now).code,'REPLAYED_SHADOW_REQUEST');
assert.equal(registry.recordRequest(sockA,evidence,'invalid id',now).code,'INVALID_REQUEST_ID');
assert.equal(registry.inspect(sockA,{...evidence,ownerId:'22'},now).ok,false);
assert.equal(registry.inspect(sockA,evidence,now).ok,false,'wrong owner did not revoke old lease');
assert.equal(registry.stage(sockA,evidence,accepted,now).ok,true);
assert.equal(registry.inspect(sockA,{...evidence,observerRoom:'dungeon-1-20-i2'},now).ok,false);
assert.equal(registry.stage(sockA,evidence,accepted,now).ok,true);
assert.equal(registry.inspect(sockA,evidence,now+30_000).ok,false,'expired shadow survived');
assert.equal(registry.stage(sockA,evidence,accepted,now).ok,true);
const sockB={};
assert.equal(registry.stage(sockB,evidence,accepted,now+1).ok,true);
assert.equal(registry.inspect(sockA,evidence,now+1).ok,false,'old socket retained owner lease');
assert.equal(registry.inspect(sockB,evidence,now+1).ok,true);
assert.equal(registry.revoke(sockA),false,'stale socket evicted replacement');
assert.equal(registry.inspect(sockB,evidence,now+1).ok,true);
assert.equal(registry.stage({},evidence,{...accepted,canAttack:true},now).ok,false);
assert.equal(registry.stage({},evidence,{...accepted,room:'dungeon-21-40-i1'},now).ok,false);
assert.equal(registry.stage({},evidence,{...accepted,eligibleForFutureRuntime:false},now).ok,false);
assert.equal(registry.stage({},evidence,{...accepted,readOnly:false},now).ok,false);
assert.equal(registry.stage({},evidence,{...accepted,canJoin:true},now).ok,false);
assert.equal(registry.stage({}, {...evidence,signedNative:false},accepted,now).ok,false);

// Real Durable Object WebSocket dispatch, still with fake in-memory sockets.
function socket(pid,currentRoom,nativePositionOnly,telegramId) {
  let state={pid,telegramId,room:currentRoom,nativePositionOnly,
    name:'Synthetic',partyId:'',q:0,lastMove:0,deadLocked:false,arenaMatchId:''};
  const messages=[];
  return {messages,send(data){messages.push(JSON.parse(data))},
    deserializeAttachment(){return {...state}},
    serializeAttachment(next){state={...next}},
    state(){return state}};
}
const native=socket('p:'+'a'.repeat(32),'safe',true,'11');
const telegram=socket('p:'+'b'.repeat(32),room,false,'22');
const sockets=[native,telegram];
const hub=new RealtimeHub({getWebSockets:()=>sockets},{
  PPA_GODOT_REALTIME_ENABLED:'1',
  PPA_GODOT_DUNGEON_OBSERVE_ENABLED:'1',
  PPA_GODOT_DUNGEON_ENTRY_PREFLIGHT_ENABLED:'1'
});
const send=(ws,message)=>hub.webSocketMessage(ws,JSON.stringify(message));
const last=ws=>ws.messages.at(-1);
const beforeTelegram=JSON.stringify(telegram.state());
await send(native,{type:'dungeon-observe',base:'dungeon-1-20'});
assert.equal(native.state().observerRoom,room);
await send(native,packet);
assert.equal(last(native).code,'SERVER_COMBAT_RUNTIME_REQUIRED');
const state={signedNative:true,pid:native.state().pid,ownerId:native.state().telegramId,
  currentRoom:native.state().room,observerRoom:room};
assert.equal(hub.nativeDungeonShadows().inspect(native,state,Date.now()).ok,true);
await send(native,{...packet,damage:100_000});
assert.equal(last(native).code,'INVALID_ENTRY_CHECK');
assert.equal(hub.nativeDungeonShadows().inspect(native,state,Date.now()).ok,false,
  'invalid admission did not revoke shadow');
await send(native,packet);
assert.equal(hub.nativeDungeonShadows().inspect(native,state,Date.now()).ok,true);
await send(native,{type:'dungeon-observe-leave'});
assert.equal(hub.nativeDungeonShadows().inspect(native,state,Date.now()).ok,false,
  'observer leave did not revoke shadow');
assert.equal(native.state().room,'safe','shadow moved native socket into live dungeon');
assert.equal(JSON.stringify(telegram.state()),beforeTelegram,'Telegram stats were changed');
await send(native,{type:'mob-hit-event',room,key:'s0',amount:999999});
assert.equal(last(native).code,'NATIVE_CITY_ONLY');
const reboot=new NativeDungeonShadowActors();
assert.equal(reboot.inspect(native,state,Date.now()).ok,false,'shadow restored after simulated reboot');
console.log('PPA_NATIVE_DUNGEON_SHADOW_OK owner_bound=1 replay_denied=1 replaced_socket_fenced=1 expired=1 observer_only=1 no_fake_vitals=1 no_damage=1 no_rewards=1');
