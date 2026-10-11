import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NativePveAuthorityStateLab} from '../src/native-pve-authority-state-lab.js';
import {ORIGINAL_ACTIVE_SKILLS} from '../src/native-original-active-catalog.generated.js';

// SYNTHETIC ONLY. No Cloudflare, D1, original Telegram or Godot writes.
const now=1_800_000_000_000;
const room='dungeon-1-20-i2';
const evidence={signedNative:true,pid:'p:'+'1'.repeat(32),
  ownerId:'22222',room};
const seed={origin:'synthetic-pve-test-only',ownerId:evidence.ownerId,
  pid:evidence.pid,room,saveVersion:81,revision:3,classKey:'gnome',
  maxHp:1000,hp:600,maxMp:500,mp:180,
  position:{x:420,y:530,serverAt:now-100},
  skillRanks:{gnome_buckshot:4},
  cooldownUntil:{gnome_buckshot:now-1000},
  statusEffects:[{id:'defense_boost',expiresAt:now+7000}]};
const lab=new NativePveAuthorityStateLab(),sock={};
const original=JSON.stringify(seed);
assert.equal(ORIGINAL_ACTIVE_SKILLS.gnome.some(s=>s.id==='gnome_buckshot'),true);
let current=lab.startFixture(sock,evidence,seed,now);
assert.equal(current.ok,true);
assert.equal(current.code,'SYNTHETIC_STATE_ONLY');
assert.equal(current.hp,600);
assert.equal(current.mp,180);
assert.equal(current.saveVersion,81);
assert.equal(current.position.room,room);
assert.equal(current.position.serverAt,now-100);
assert.equal(current.origin,'synthetic-pve-test-only');
for(const name of ['canAttack','canCast','canJoin','canReceiveRewards','participating'])
  assert.equal(current[name],false,name);
assert.equal(current.observer,true);
assert.equal(current.readOnly,true);
assert(Object.isFrozen(current));
assert(Object.isFrozen(current.position));
assert(Object.isFrozen(current.cooldownUntil));
assert(Object.isFrozen(current.statusEffects));
assert(Object.isFrozen(current.statusEffects[0]));
assert.equal(JSON.stringify(seed),original);
seed.hp=1;seed.position.x=2500;seed.cooldownUntil.gnome_buckshot=now+100000;
seed.statusEffects[0].expiresAt=now+999999;
assert.equal(lab.inspect(sock,evidence,now).hp,600,'caller mutated internal HP');
assert.equal(lab.inspect(sock,evidence,now).position.x,420,'caller mutated internal position');
assert.equal(lab.inspect(sock,evidence,now).cooldownUntil.gnome_buckshot,now-1000);
assert.equal(lab.inspect(sock,evidence,now).statusEffects[0].expiresAt,now+7000);

const possible=lab.checkAbilityReference(sock,evidence,'gnome_buckshot',now);
assert.equal(possible.ok,true);
assert.equal(possible.code,'REFERENCE_ONLY_NOT_CASTABLE');
assert(possible.cooldownSecondsReference>0);
assert.equal(possible.mpCostEstimate,50);
assert.equal(possible.canCast,false);
assert.equal(lab.checkAbilityReference(sock,evidence,'priest_heal',now).code,'SKILL_CLASS_OR_RANK_UNVERIFIED');

const tick={origin:'synthetic-server-tick-only',revision:4,hp:540,mp:40,
  position:{x:430,y:540,serverAt:now+100},
  cooldownUntil:{gnome_buckshot:now+20_000},
  statusEffects:[{id:'defense_boost',expiresAt:now+8000}]};
const newNow=now+200;
current=lab.applySyntheticServerTick(sock,evidence,tick,newNow);
assert.equal(current.ok,true);
assert.equal(current.hp,540);
assert.equal(current.mp,40);
assert.equal(current.revision,4);
assert.equal(current.position.x,430);
assert.equal(lab.checkAbilityReference(sock,evidence,'gnome_buckshot',newNow).code,'SERVER_SKILL_ON_COOLDOWN');
assert.equal(lab.applySyntheticServerTick(sock,evidence,tick,newNow).code,'INVALID_OR_REPLAYED_SERVER_TICK');
assert.equal(lab.inspect(sock,evidence,newNow).hp,540);
for(const bad of [
 {...tick,revision:5,origin:'websocket-player-move'},
 {...tick,revision:5,hp:999999},
 {...tick,revision:5,mp:999999},
 {...tick,revision:5,damage:999999},
 {...tick,revision:5,loot:{ppa:1000}},
 {...tick,revision:5,position:{x:430,y:540,serverAt:now+5000}},
 {...tick,revision:5,position:{x:430,y:540,serverAt:now-5000}},
 {...tick,revision:6}
]) {
 assert.equal(lab.applySyntheticServerTick(sock,evidence,bad,newNow).code,
   'INVALID_OR_REPLAYED_SERVER_TICK',JSON.stringify(bad));
}
assert.equal(lab.inspect(sock,{...evidence,ownerId:'99999'},newNow).ok,false);
assert.equal(lab.inspect(sock,{...evidence,room:'dungeon-21-40-i2'},newNow).ok,false);
assert.equal(lab.inspect(sock,{...evidence,signedNative:false},newNow).ok,false);

// New owner-bound socket fences an old socket; stale socket cannot revoke it.
const replace={}, nextSeed={...seed,hp:500,mp:200,
  position:{x:400,y:500,serverAt:newNow},revision:10,
  cooldownUntil:{gnome_buckshot:0},
  statusEffects:[]};
assert.equal(lab.startFixture(replace,evidence,nextSeed,newNow).ok,true);
assert.equal(lab.inspect(sock,evidence,newNow).ok,false);
assert.equal(lab.revoke(sock),false);
assert.equal(lab.inspect(replace,evidence,newNow).ok,true);
assert.equal(lab.inspect(replace,evidence,newNow+30_000).ok,false,
  'expired state stayed valid');
assert.equal(lab.revoke(replace),true);
assert.equal(lab.inspect(replace,evidence,newNow).ok,false);

// Missing provenance, profile, or authoritative vitals MUST NOT be inferred
// from legacy client save fields, even when their numbers look reasonable.
for (const patch of [
  {origin:'telegram-client-hp'},{origin:'godot-client-position'},
  {saveVersion:-1},{classKey:'unknown'},{room:'safe'},
  {hp:10000000},{mp:10000000},{maxHp:0},{maxMp:0},
  {position:{x:-1,y:500,serverAt:now}},
  {statusEffects:[{id:'b',expiresAt:NaN}]},
  {skillRanks:{gnome_buckshot:9}},
  {skillRanks:{priest_heal:1}},
  {gold:1000},{atk:9999},
]) {
 const source={...nextSeed, ...patch};
 assert.equal(lab.startFixture({},evidence,source,newNow).ok,false,
   'unverified fixture accepted '+JSON.stringify(patch));
}

// Neither the realtime handler nor the API imports this prototype.
// A synthetic in-memory tick must not become a production attack or D1 write.
const realtime=readFileSync(new URL('../src/realtime-stable.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
assert(!realtime.includes('NativePveAuthorityStateLab'));
assert(!worker.includes('NativePveAuthorityStateLab'));
assert(!/\bDB\b|\bsaveGameState\b|\bwrangler\b/.test(
 readFileSync(new URL('../src/native-pve-authority-state-lab.js',import.meta.url),'utf8')));
console.log('PPA_NATIVE_PVE_AUTHORITY_LAB_OK owner=1 cloned_seed=1 hp_mp_ticks=1 revision_replay=1 class_skills=1 cooldown=1 no_live_route=1 no_D1=1 no_damage=1 no_rewards=1');
