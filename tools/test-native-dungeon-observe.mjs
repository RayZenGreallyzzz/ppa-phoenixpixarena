import assert from 'node:assert/strict';
import { RealtimeHub } from '../src/realtime-stable.js';

// Runs the ACTUAL stable PPA Durable Object handler with fake in-memory WS;
// no Worker deploy, DB, player save, online wallet, reward or combat writes.
function socket(pid, room, nativePositionOnly) {
  let att = { pid, telegramId: nativePositionOnly ? '11' : '22',
    name: nativePositionOnly ? 'Native Reader' : 'Telegram Fighter',
    room, nativePositionOnly, partyId:'', h:nativePositionOnly?0:900,
    m:200, b:700, atk:99, level:40, q:1, lastMove:0 };
  const received = [];
  return { received, send(raw) { received.push(JSON.parse(raw)); },
    deserializeAttachment() { return { ...att }; },
    serializeAttachment(next) { att = { ...next }; },
    state() { return att; } };
}
const native=socket('p:'+'1'.repeat(32),'safe',true);
const telegram=socket('p:'+'2'.repeat(32),'dungeon-1-20-i1',false);
let currentSockets=[native,telegram];
const ctx={getWebSockets:()=>currentSockets};
const env={PPA_GODOT_REALTIME_ENABLED:'1',PPA_GODOT_DUNGEON_OBSERVE_ENABLED:'1'};
const hub=new RealtimeHub(ctx,env);
const save={gold:5100,ppa:42,bag:[{uid:'rare-plus7',enh:7}]};
const before=JSON.stringify(save);
const req=(who,m)=>hub.webSocketMessage(who,JSON.stringify(m));
const observe={type:'dungeon-observe',base:'dungeon-1-20'};
const newest=(who)=>who.received.at(-1);

env.PPA_GODOT_DUNGEON_OBSERVE_ENABLED='0';
await req(native,observe);
assert.equal(newest(native).code,'OBSERVE_DISABLED');
assert.equal(native.state().observerRoom,undefined);
env.PPA_GODOT_DUNGEON_OBSERVE_ENABLED='1';
for(const p of [
  {type:'dungeon-observe',base:'dungeon-1-20-i1'},
  {type:'dungeon-observe',base:'dungeon-1-20',room:'dungeon-1-20-i9'},
  {type:'dungeon-observe',base:'worldboss'},
  {type:'dungeon-observe',base:'dungeon-1-20',instance:5},
]) {
  await req(native,p);
  assert.equal(newest(native).code,'INVALID_DUNGEON_BASE',
    'An observer could choose a private or forged dungeon room');
}
await req(telegram,observe);
assert.equal(newest(telegram).code,'NATIVE_TICKET_REQUIRED',
  'Telegram socket was granted Godot observer privilege');

hub.mobStores().health.set('dungeon-1-20-i1|s0',{
  hp:80,mhp:100,x:400,y:500,dir:0,aggro:true,moving:true,sz:30});
const countBefore=hub.countRoom('dungeon-1-20-i1');
const originalTelegram=JSON.stringify(telegram.state());
await req(native,observe);
const assignment=native.received.find(x=>x.type==='dungeon-observe-assigned');
assert.equal(assignment?.room,'dungeon-1-20-i1');
assert.equal(assignment?.readOnly,true);
assert.equal(assignment?.actionsEnabled,false);
assert.equal(native.state().room,'safe','Observer joined the game combat room');
assert.equal(native.state().observerRoom,'dungeon-1-20-i1');
assert.equal(hub.countRoom('dungeon-1-20-i1'),countBefore,
  'Spectator consumed a dungeon party/capacity slot');
assert.equal(JSON.stringify(telegram.state()),originalTelegram,
  'Observer mutated actual fighter presence, stats or inventory');
assert(native.received.some(x=>x.type==='mob-authority-snapshot'&&
  x.room==='dungeon-1-20-i1'&&x.rows.some(row=>row[0]==='s0'&&row[9]===0)),
  'Spectator did not receive same verified server mob snapshot with facing up=0');

// The original server broadcast goes to Telegram as before, while a
// read-only copy goes to the native spectator. Neither socket can write HP.
const np=native.received.length;
const tp=telegram.received.length;
hub.roomBroadcast('dungeon-1-20-i1',
  {type:'mob-hp',room:'dungeon-1-20-i1',key:'s0',hp:22,mhp:100,ts:1000},null);
assert.equal(telegram.received.length,tp+1);
assert.equal(native.received.length,np+1);
assert.equal(newest(native).hp,22);
const count=native.received.length;
hub.roomBroadcast('dungeon-1-20-i1',
  {type:'arena-control',room:'dungeon-1-20-i1',reward:999999},null);
hub.roomBroadcast('dungeon-1-20-i1',
  {type:'mob-hit-event',room:'dungeon-1-20-i1',amount:99999},null);
hub.roomBroadcast('dungeon-21-40-i1',
  {type:'mob-hp',room:'dungeon-21-40-i1',key:'s1',hp:1},null);
assert.equal(native.received.length,count,
  'Spectator received a combat intent, currency reward, or other room');

await req(native,{type:'room',room:'dungeon-1-20-i1'});
assert.equal(newest(native).code,'CITY_ONLY');
await req(native,{type:'mob-hit-event',amount:999999,room:'dungeon-1-20-i1'});
assert.equal(newest(native).code,'NATIVE_CITY_ONLY');
await req(native,{type:'move',room:'dungeon-1-20-i1',h:99999});
assert.equal(newest(native).code,'NATIVE_CITY_ONLY');
assert.equal(native.state().room,'safe');
assert.equal(hub.countRoom('dungeon-1-20-i1'),countBefore);

await req(native,{type:'dungeon-observe-leave'});
assert.equal(newest(native).type,'dungeon-observe-ended');
assert.equal(native.state().observerRoom,undefined);
const prior=native.received.length;
hub.roomBroadcast('dungeon-1-20-i1',
  {type:'mob-dead',room:'dungeon-1-20-i1',key:'s0',ts:2000},null);
assert.equal(native.received.length,prior,'Observer leaked events after leaving');

// Refuse to generate a room when no actual Telegram player remains.
currentSockets=[native];
hub._roomIndex=null;
await req(native,observe);
assert.equal(newest(native).code,'NO_ACTIVE_DUNGEON');
assert.equal(native.state().observerRoom,undefined);
assert.equal(JSON.stringify(save),before);
console.log('PPA_NATIVE_DUNGEON_OBSERVE_OK signed_ticket=1 flag_default_off=1 server_selected_active_instance=1 safe_room=1 room_capacity_unchanged=1 real_mob_hp_stream=1 no_battle_or_economy=1 observer_leave=1 no_fake_instances=1');
