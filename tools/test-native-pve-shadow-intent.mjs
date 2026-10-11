import assert from 'node:assert/strict';
import {RealtimeHub} from '../src/realtime-stable.js';

// Actual Durable Object dispatch with synthetic WebSocket attachments.
// No production Worker, D1 writes, purchases, damage, drops, or XP.
const room='dungeon-1-20-i1';
const intent={type:'dungeon-combat-intent',room,key:'s0',
  action:'basic',requestId:'shadow_attack_12345678'};
function socket(pid,telegramId,startRoom,nativePositionOnly) {
  let state={pid,telegramId,room:startRoom,nativePositionOnly,
    name:'SyntheticPPA',partyId:'',q:0,lastMove:0,
    deadLocked:false,arenaMatchId:'',h:999999,m:999999,atk:999999};
  const messages=[];
  return {messages,send(message){messages.push(JSON.parse(message))},
    deserializeAttachment(){return {...state}},
    serializeAttachment(next){state={...next}},
    state(){return state}};
}
const native=socket('p:'+'a'.repeat(32),'11','safe',true);
const telegram=socket('p:'+'b'.repeat(32),'22',room,false);
const sockets=[native,telegram];
const hub=new RealtimeHub({getWebSockets:()=>sockets},{
  PPA_GODOT_REALTIME_ENABLED:'1',
  PPA_GODOT_DUNGEON_OBSERVE_ENABLED:'1',
  PPA_GODOT_PVE_PREFLIGHT_ENABLED:'1',
  PPA_GODOT_DUNGEON_ENTRY_PREFLIGHT_ENABLED:'0'
});
const serverMob={hp:300,mhp:300,x:410,y:510,dir:0,level:15,dmg:40};
hub.mobStores().health.set(hub.mobCompound(room,'s0'),serverMob);
const priorMob=JSON.stringify(serverMob);
const priorTelegram=JSON.stringify(telegram.state());
const syntheticSave={gold:1000,ppa:500,bag:[{uid:'gear-7',enh:7}]};
const priorSave=JSON.stringify(syntheticSave);
const send=(ws,packet)=>hub.webSocketMessage(ws,JSON.stringify(packet));
const last=ws=>ws.messages.at(-1);

await send(native,{type:'dungeon-observe',base:'dungeon-1-20'});
assert.equal(native.state().observerRoom,room);

// Original default-OFF admission flow remains backward-compatible.
await send(native,intent);
assert.equal(last(native).type,'dungeon-combat-preflight');
assert.equal(last(native).reason,'SERVER_COMBAT_PROFILE_REQUIRED');
assert.equal(last(native).canAttack,false);

hub.env.PPA_GODOT_DUNGEON_ENTRY_PREFLIGHT_ENABLED='1';
await send(native,intent);
assert.equal(last(native).type,'dungeon-combat-preflight-rejected');
assert.equal(last(native).code,'SHADOW_EXPIRED_OR_REPLACED');

const entry={type:'dungeon-entry-check',base:'dungeon-1-20',
  requestId:'shadow_entry_1234567'};
await send(native,entry);
assert.equal(last(native).code,'SERVER_COMBAT_RUNTIME_REQUIRED');
assert.equal(last(native).canJoin,false);

await send(native,intent);
assert.equal(last(native).type,'dungeon-combat-preflight');
assert.equal(last(native).canAttack,false);
assert.equal(last(native).readOnly,true);
assert.equal(last(native).readiness.canAttack,false);
assert.deepEqual(last(native).readiness.blockers,['SERVER_COMBAT_RUNTIME_MISSING']);

await send(native,intent);
assert.equal(last(native).type,'dungeon-combat-preflight-rejected');
assert.equal(last(native).code,'REPLAYED_SHADOW_REQUEST');
await send(native,{...intent,requestId:'shadow_attack_12345679'});
assert.equal(last(native).type,'dungeon-combat-preflight');

await send(native,{...intent,requestId:'shadow_forged_123456',damage:999999});
assert.equal(last(native).code,'UNTRUSTED_FIELD');
await send(native,{...intent,requestId:'shadow_wrong_123456',room:'dungeon-21-40-i1'});
assert.equal(last(native).code,'UNCONFIRMED_DUNGEON');
await send(native,{...intent,requestId:'shadow_fake_123456',maxMp:999999});
assert.equal(last(native).code,'UNTRUSTED_FIELD');

const skill={...intent,action:'skill',skillId:'gnome_buckshot',
  requestId:'shadow_skill_123456'};
await send(native,skill);
assert.equal(last(native).code,'SERVER_SKILL_NOT_READY');
await send(native,skill);
assert.equal(last(native).code,'REPLAYED_SHADOW_REQUEST');

const current=native.state();
const shadow=hub.nativeDungeonShadows().inspect(native,{
  signedNative:true,pid:current.pid,ownerId:current.telegramId,
  currentRoom:current.room,observerRoom:current.observerRoom
},Date.now());
assert.equal(shadow.ok,true);
for (const prop of ['hp','mp','maxHp','maxMp','position','cooldownUntil','statusEffects'])
  assert.equal(shadow[prop],null,'Client stats became authoritative: '+prop);
for(const prop of ['canJoin','canAttack','canCast','canReceiveRewards'])
  assert.equal(shadow[prop],false);

const priorMessages=telegram.messages.length;
await send(native,{type:'mob-hit-event',room,key:'s0',amount:1_000_000});
assert.equal(last(native).code,'NATIVE_CITY_ONLY');
assert.equal(telegram.messages.length,priorMessages);
assert.equal(JSON.stringify(serverMob),priorMob);
assert.equal(JSON.stringify(telegram.state()),priorTelegram);
assert.equal(JSON.stringify(syntheticSave),priorSave);

await send(native,{type:'dungeon-observe-leave'});
await send(native,intent);
assert.equal(last(native).code,'UNCONFIRMED_DUNGEON');
await send(native,{type:'dungeon-observe',base:'dungeon-1-20'});
await send(native,intent);
assert.equal(last(native).code,'SHADOW_EXPIRED_OR_REPLACED');
await send(native,entry);
await send(native,intent);
assert.equal(last(native).type,'dungeon-combat-preflight');
assert.equal(last(native).canAttack,false);
console.log('PPA_NATIVE_SHADOW_INTENT_OK staged=1 replay_rejected=1 bad_room_denied=1 fake_vitals_denied=1 leave_revokes=1 old_mode_unchanged=1 no_damage=1 no_payouts=1');
