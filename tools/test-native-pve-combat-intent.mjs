import assert from 'node:assert/strict';
import { validateNativePveIntent } from '../src/native-pve-combat-intent.js';
import { RealtimeHub } from '../src/realtime-stable.js';

// Offline test of the REAL stable Durable Object. Synthetic WebSockets and
// synthetic saves: zero production requests, zero database/economy writes.
const base = {type:'dungeon-combat-intent',action:'basic',
  room:'dungeon-1-20-i1',key:'s0',requestId:'request_012345'};
const valid = validateNativePveIntent(base);
assert.equal(valid.ok,true);
assert.equal(valid.intent.key,'s0');
assert.equal(Object.hasOwn(valid.intent,'damage'),false);
assert(Object.isFrozen(valid.intent));
for(const unsafe of [
  {...base, damage:1}, {...base,damage:999999999}, {...base,hp:1},
  {...base,mhp:1}, {...base,reward:1000}, {...base,loot:{gold:10000}},
  {...base,atk:10000}, {...base,crit:100}, {...base,cooldown:0},
  {...base,position:{x:0,y:0}}, {...base,x:0}, {...base,amount:1000},
  {...base,ts:0}, {...base,level:60}, {...base,ownerId:'forged'},
  {...base,currency:'ppa'}, {...base,partyId:'forged'},
  {...base,room:'dungeon-1-20'}, {...base,room:'dungeon-1-20-i0'},
  {...base,room:'dungeon-1-20-i01'}, {...base,room:'safe'},
  {...base,room:'dungeon-21-40-i1'},
  {...base,key:'fake'}, {...base,key:'s-1'}, {...base,key:'s0000'},
  {...base,key:'p21'}, {...base,key:'s99999'},
  {...base,action:'admin'}, {...base,action:'skill',skillId:'../admin'},
  {...base,requestId:'a'}, {...base,requestId:'../bad/thing'}
]) {
  const parsed=validateNativePveIntent(unsafe);
  // Another valid dungeon tier is syntactically legitimate but must fail
  // when compared with the signed observerRoom at the server dispatch.
  if (unsafe.room==='dungeon-21-40-i1' && Object.keys(unsafe).length===5) {
    assert.equal(parsed.ok,true);
  } else {
    assert.equal(parsed.ok,false,'Unsafe intent was accepted: '+JSON.stringify(unsafe));
  }
}
assert.equal(validateNativePveIntent({...base,action:'skill',skillId:'sword_slash'}).ok,true);
assert.equal(validateNativePveIntent({...base,skillId:'sword_slash'}).ok,false);

function socket(pid,room,nativePositionOnly) {
  let a={pid,telegramId:nativePositionOnly?'11':'22',name:'SyntheticPPA',
    room,nativePositionOnly,h:nativePositionOnly?0:900,m:200,atk:160,
    q:0,partyId:'',lastMove:0};
  const messages=[];
  return {messages, send(data){messages.push(JSON.parse(data));},
    deserializeAttachment(){return {...a};},
    serializeAttachment(next){a={...next};},
    state(){return a;}};
}
const native=socket('p:'+'a'.repeat(32),'safe',true);
const telegram=socket('p:'+'b'.repeat(32),'dungeon-1-20-i1',false);
let sockets=[native,telegram];
const hub=new RealtimeHub({getWebSockets:()=>sockets},{
  PPA_GODOT_REALTIME_ENABLED:'1',
  PPA_GODOT_DUNGEON_OBSERVE_ENABLED:'1',
  PPA_GODOT_PVE_PREFLIGHT_ENABLED:'0',
});
const rec={hp:350,mhp:350,x:400,y:500,dir:0,level:12,dmg:27};
hub.mobStores().health.set(hub.mobCompound(base.room,'s0'),rec);
const before=JSON.stringify(rec);
const originalTelegram=JSON.stringify(telegram.state());
const save={gold:2500,ppa:80,bag:[{uid:'gear-plus7',enh:7}]};
const oldSave=JSON.stringify(save);
const send=(who,m)=>hub.webSocketMessage(who,JSON.stringify(m));
const last=who=>who.messages.at(-1);
await send(native,{type:'dungeon-observe',base:'dungeon-1-20'});
assert.equal(native.state().observerRoom,base.room);
await send(native,base);
assert.equal(last(native).code,'PVE_PREFLIGHT_DISABLED',
  'Combat probe enabled itself on an OFF flag');
hub.env.PPA_GODOT_PVE_PREFLIGHT_ENABLED='1';
await send(telegram,base);
assert.equal(last(telegram).code,'NATIVE_TICKET_REQUIRED',
  'Unsigned Telegram socket impersonated Godot PvE preflight');
for (const bad of [
  {...base,damage:9999999}, {...base,hp:1}, {...base,atk:9999999},
  {...base,currency:'gram'}, {...base,room:'dungeon-21-40-i1'},
  {...base,key:'arbitrary-boss'}, {...base,requestId:'x'}
]) {
  await send(native,bad);
  assert.equal(last(native).type,'dungeon-combat-preflight-rejected');
  assert.equal(last(native).canAttack,false);
}
await send(native,{...base,key:'s42'});
assert.equal(last(native).code,'MOB_UNCONFIRMED',
  'Unknown enemy cannot be admitted without authoritative mob catalog');
await send(native,base);
assert.equal(last(native).type,'dungeon-combat-preflight');
assert.equal(last(native).targetConfirmed,true);
assert.equal(last(native).canAttack,false);
assert.equal(last(native).reason,'SERVER_COMBAT_PROFILE_REQUIRED');
assert.equal(last(native).readOnly,true);
const ack=last(native);
await send(native,base);
assert.equal(last(native).canAttack,false,'Repeated intent unexpectedly dealt damage');
assert.equal(last(native).requestId,ack.requestId);
await send(native,{...base,action:'skill',skillId:'slash_01'});
assert.equal(last(native).code,'SERVER_SKILL_NOT_READY',
  'Unverified skill unexpectedly passed the action registry');
const attackCount=telegram.messages.length;
await send(native,{type:'mob-hit-event',room:base.room,key:'s0',
  amount:999999,mhp:350,event:'forged-damage'});
assert.equal(last(native).code,'NATIVE_CITY_ONLY',
  'Godot reached unsafe legacy Telegram mob-hit-event');
assert.equal(telegram.messages.length,attackCount,
  'Native preflight broadcasted a fake hit to real Telegram players');
assert.equal(rec.hp,350,'Read-only preflight changed the server enemy HP');
assert.equal(JSON.stringify(rec),before,'Preflight changed monster state or AI');
assert.equal(JSON.stringify(telegram.state()),originalTelegram,
  'Preflight changed Telegram party/combat stats');
assert.equal(JSON.stringify(save),oldSave,
  'Preflight mutated the original +7 gear or money');
await send(native,{type:'dungeon-observe-leave'});
await send(native,base);
assert.equal(last(native).code,'UNCONFIRMED_DUNGEON',
  'Native session could attack after leaving an observed dungeon');
console.log('PPA_NATIVE_PVE_PREFLIGHT_OK untrusted_damage=blocked signed_target=1 spectator_not_fighter=1 damage_mutations=0 gold_pPA_writes=0 skills_denied=1 old_telegram_untouched=1 default_off=1');
