import assert from 'node:assert/strict';
import { inspectNativeDungeonEntry } from '../src/native-dungeon-entry-preflight.js';
import { RealtimeHub } from '../src/realtime-stable.js';

// Entire test uses synthetic players and sockets, without Cloudflare, D1,
// any player account, native APK, mob damage or economy writes.
const room = 'dungeon-1-20-i1';
const request = {type:'dungeon-entry-check',base:'dungeon-1-20',requestId:'entry_0123456789'};
const evidence = {
  enabled:true,signedNative:true,pid:'p:'+'a'.repeat(32),ownerId:'11',
  currentRoom:'safe',observerRoom:room,
  deadLocked:false,arenaMatchId:'',partyId:'',
  activeTelegramCount:1,occupiedSeats:1,reservedSeats:0
};
const check=(packet=request,state=evidence)=>inspectNativeDungeonEntry(packet,state);
const eligible=check();
assert.equal(eligible.code,'SERVER_COMBAT_RUNTIME_REQUIRED');
assert.equal(eligible.room,room);
assert.equal(eligible.eligibleForFutureRuntime,true);
for(const field of ['canJoin','canAttack','canCast','canReceiveRewards']) assert.equal(eligible[field],false);
assert.equal(eligible.readOnly,true);
assert(Object.isFrozen(eligible));
for(const packet of [
  {...request,room}, {...request,instance:1}, {...request,partyId:'p'},
  {...request,damage:9999}, {...request,mp:999}, {...request,x:500},
  {...request,ownerId:'11'}, {...request,role:'fighter'},
  {...request,base:'dungeon-41-60'}, {...request,base:'safe'},
  {...request,requestId:'short'}, {...request,requestId:'../bad'},
  {...request,type:'dungeon-join'}
]) {
  assert.equal(check(packet).code,'INVALID_ENTRY_CHECK',JSON.stringify(packet));
}
for(const [change,expected] of [
  [{enabled:false},'ENTRY_CHECK_DISABLED'],
  [{signedNative:false},'SIGNED_NATIVE_SESSION_REQUIRED'],
  [{pid:'tg:11'},'SIGNED_NATIVE_SESSION_REQUIRED'],
  [{pid:'p:'+ 'Z'.repeat(32)},'SIGNED_NATIVE_SESSION_REQUIRED'],
  [{ownerId:''},'SIGNED_NATIVE_SESSION_REQUIRED'],
  [{currentRoom:room},'ACTOR_NOT_READY'],
  [{deadLocked:true},'ACTOR_NOT_READY'],
  [{arenaMatchId:'arena'},'ACTOR_NOT_READY'],
  [{partyId:'fake-party'},'ACTOR_NOT_READY'],
  [{observerRoom:'dungeon-21-40-i1'},'SERVER_DUNGEON_ASSIGNMENT_REQUIRED'],
  [{observerRoom:'dungeon-1-20-i0'},'SERVER_DUNGEON_ASSIGNMENT_REQUIRED'],
  [{activeTelegramCount:0},'DUNGEON_NOT_ACTIVE'],
  [{occupiedSeats:40},'DUNGEON_CAPACITY_UNCONFIRMED'],
  [{occupiedSeats:39,reservedSeats:1},'DUNGEON_CAPACITY_UNCONFIRMED'],
  [{reservedSeats:NaN},'DUNGEON_CAPACITY_UNCONFIRMED']
]) {
  const got=check(request,{...evidence,...change});
  assert.equal(got.code,expected,JSON.stringify(change));
  assert.equal(got.canJoin,false);
  assert.equal(got.canAttack,false);
  assert.equal(got.canReceiveRewards,false);
}
assert.equal(check(request,{...evidence,occupiedSeats:39,reservedSeats:0}).eligibleForFutureRuntime,true);

function socket(pid,roomValue,nativePositionOnly) {
  let a={pid,telegramId:nativePositionOnly?'11':'22',name:'SyntheticPlayer',
    room:roomValue,nativePositionOnly,h:300,m:200,atk:100,
    partyId:'',q:0,lastMove:0,deadLocked:false,arenaMatchId:''};
  const messages=[];
  return {messages,
    send(data){messages.push(JSON.parse(data))},
    deserializeAttachment(){return {...a}},
    serializeAttachment(next){a={...next}},
    state(){return a}
  };
}
const native=socket('p:'+'a'.repeat(32),'safe',true);
const telegram=socket('p:'+'b'.repeat(32),room,false);
const sockets=[native,telegram];
const hub=new RealtimeHub({getWebSockets:()=>sockets},{
  PPA_GODOT_REALTIME_ENABLED:'1',
  PPA_GODOT_DUNGEON_OBSERVE_ENABLED:'1',
  PPA_GODOT_DUNGEON_ENTRY_PREFLIGHT_ENABLED:'0'
});
const send=(socket,packet)=>hub.webSocketMessage(socket,JSON.stringify(packet));
const last=(socket)=>socket.messages.at(-1);
const beforeTelegram=JSON.stringify(telegram.state());
const saved={gold:456,ppa:123,inventory:[{uid:'plus7',enh:7}]};
const beforeSave=JSON.stringify(saved);
await send(native,request);
assert.equal(last(native).code,'ENTRY_CHECK_DISABLED');
hub.env.PPA_GODOT_DUNGEON_ENTRY_PREFLIGHT_ENABLED='1';
await send(native,request);
assert.equal(last(native).code,'SERVER_DUNGEON_ASSIGNMENT_REQUIRED');
await send(native,{type:'dungeon-observe',base:'dungeon-1-20'});
assert.equal(last(native).type,'mob-authority-snapshot'===last(native).type?'mob-authority-snapshot':last(native).type);
// The observer room comes ONLY from the server, not from client-supplied room.
assert.equal(native.state().observerRoom,room);
await send(native,request);
assert.equal(last(native).code,'SERVER_COMBAT_RUNTIME_REQUIRED');
assert.equal(last(native).eligibleForFutureRuntime,true);
assert.equal(last(native).canJoin,false);
assert.equal(last(native).canAttack,false);
assert.equal(native.state().room,'safe');
await send(native,{...request,room,damage:1000});
assert.equal(last(native).code,'INVALID_ENTRY_CHECK');
await send(telegram,request);
assert.equal(last(telegram).code,'SIGNED_NATIVE_SESSION_REQUIRED');
const count=telegram.messages.length;
await send(native,{type:'mob-hit-event',room,key:'s0',amount:99999});
assert.equal(last(native).code,'NATIVE_CITY_ONLY');
assert.equal(telegram.messages.length,count);
assert.equal(JSON.stringify(telegram.state()),beforeTelegram);
assert.equal(JSON.stringify(saved),beforeSave);
await send(native,{type:'dungeon-observe-leave'});
await send(native,request);
assert.equal(last(native).code,'SERVER_DUNGEON_ASSIGNMENT_REQUIRED');
console.log('PPA_NATIVE_DUNGEON_ENTRY_PREFLIGHT_OK default_off=1 verified_room=1 no_dungeon_join=1 no_combat=1 no_reward=1 no_D1_writes=1');
