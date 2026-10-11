import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {NativePveAuthorityStateLab} from '../src/native-pve-authority-state-lab.js';
import {NativePveHitGeometryLab} from '../src/native-pve-hit-geometry-lab.js';
import {ORIGINAL_CLASS_BASE} from '../src/native-original-class-rune-parity.js';

// No live socket, Cloudflare, Telegram state, mob-hit-event, D1 or rewards.
const now=1_800_000_000_000;
const room='dungeon-1-20-i1';
const socket={};
const evidence={signedNative:true,pid:'p:'+'a'.repeat(32),ownerId:'11',room};
const actors=new NativePveAuthorityStateLab();
const actorSeed={origin:'synthetic-pve-test-only',pid:evidence.pid,
  ownerId:evidence.ownerId,room,classKey:'gnome',saveVersion:10,
  revision:1,hp:500,maxHp:500,mp:200,maxMp:200,
  position:{x:400,y:500,serverAt:now-100},
  skillRanks:{},cooldownUntil:{},statusEffects:[]};
assert.equal(actors.startFixture(socket,evidence,actorSeed,now).ok,true);
const lab=new NativePveHitGeometryLab(actors);
const seed={origin:'synthetic-server-mob-only',room,key:'s0',generation:1,
  revision:1,hp:300,maxHp:300,
  position:{x:450,y:500,serverAt:now-100},radius:15,barriers:[]};
assert.equal(lab.seedSyntheticMob(seed,now).ok,true);
const original=JSON.stringify(seed);
const basic={type:'dungeon-combat-intent',room,key:'s0',action:'basic',
 requestId:'hit_12345678'};
const check=(packet=basic,at=now,ev=evidence,ws=socket)=>
  lab.referenceBasicHit(ws,ev,packet,at);
const ok=check();
assert.equal(ok.ok,true);
assert.equal(ok.code,'SYNTHETIC_HIT_GEOMETRY_REFERENCE_ONLY');
assert.equal(ok.damage,null);
assert.equal(ok.readOnly,true);
assert.equal(ok.canAttack,false);
assert.equal(ok.canReceiveRewards,false);
assert.equal(ok.candidate.generation,1);
assert.equal(ok.candidate.distance,50);
assert.equal(ok.candidate.referenceReach,ORIGINAL_CLASS_BASE.gnome.range+15);
assert(Object.isFrozen(ok.candidate));
assert.equal(JSON.stringify(seed),original);
assert.equal(check().code,'REPLAYED_HIT_INTENT');
assert.equal(check({...basic,requestId:'hit_12345679'}).code,'REFERENCE_ATTACK_COOLDOWN');
assert.equal(check({...basic,requestId:'hit_12345679'},now+1200).ok,true);
assert.equal(check({...basic,requestId:'hit_12345680'},now+2000).code,
 'SERVER_ACTOR_POSITION_STALE');
// A newer actor server-only tick restores freshness, without trusting client.
assert.equal(actors.applySyntheticServerTick(socket,evidence,{
 origin:'synthetic-server-tick-only',revision:2,hp:500,mp:200,
 position:{x:400,y:500,serverAt:now+1200},cooldownUntil:{},
 statusEffects:[]},now+1200).ok,true);

// Strict incoming protocol: cannot choose speed, damage, geometry or spawn.
for(const forbidden of [
 {...basic,requestId:'hit_12345681',damage:999999},
 {...basic,requestId:'hit_12345682',position:{x:450,y:500}},
 {...basic,requestId:'hit_12345683',spawnGeneration:2},
 {...basic,requestId:'hit_12345684',attackRange:10000},
 {...basic,requestId:'hit_12345685',cooldown:0},
 {...basic,requestId:'hit_12345686',hp:1000},
 {...basic,requestId:'hit_12345687',reward:{gold:1000}},
 {...basic,requestId:'hit_12345688',ownerId:'22'},
 {...basic,requestId:'hit_12345689',room:'dungeon-21-40-i1'}
]){
 assert.equal(check(forbidden,now+1300).ok,false,JSON.stringify(forbidden));
}
assert.equal(check({...basic,requestId:'hit_12345690',action:'skill',
 skillId:'gnome_buckshot'},now+1300).code,'SKILL_GEOMETRY_NOT_PORTED');
assert.equal(check({...basic,requestId:'hit_12345691'},now+1300,
 {...evidence,ownerId:'22'}).code,'VERIFIED_ACTOR_NOT_PRESENT');
assert.equal(check({...basic,requestId:'hit_12345692'},now+1300,
 {...evidence,room:'dungeon-21-40-i1'}).code,'VERIFIED_ACTOR_NOT_PRESENT');

// The old spawn cannot be registered again, including a dead-then-live clone.
assert.equal(lab.seedSyntheticMob(seed,now+1300).code,'MOB_GENERATION_REPLAYED');
assert.equal(lab.tickSyntheticMob({
 origin:'synthetic-server-mob-tick-only',room,key:'s0',generation:1,
 revision:2,hp:300,position:{x:2000,y:2000,serverAt:now+1300}
},now+1300).ok,true);
assert.equal(check({...basic,requestId:'hit_12345693'},now+1300).code,
 'OUT_OF_REFERENCE_RANGE');
assert.equal(lab.tickSyntheticMob({
 origin:'synthetic-server-mob-tick-only',room,key:'s0',generation:1,
 revision:2,hp:300,position:{x:450,y:500,serverAt:now+1350}
},now+1400).code,'STALE_MOB_GENERATION_OR_REVISION');
assert.equal(lab.tickSyntheticMob({
 origin:'synthetic-server-mob-tick-only',room,key:'s0',generation:1,
 revision:3,hp:0,position:{x:450,y:500,serverAt:now+1400}
},now+1400).ok,true);
assert.equal(check({...basic,requestId:'hit_12345694'},now+1400).code,'TARGET_DEAD');

// New generation has fresh HP but must carry its own generation number.
assert.equal(lab.seedSyntheticMob({...seed,generation:2,
 position:{x:450,y:500,serverAt:now+1500},
 barriers:[{minX:420,minY:475,maxX:430,maxY:525}]},now+1500).ok,true);
assert.equal(check({...basic,requestId:'hit_12345695'},now+1500).code,
 'SYNTHETIC_LINE_OF_SIGHT_BLOCKED');
// A different mob can be tracked without old monster state bleed-through.
const near={...seed,key:'s1',generation:1,
 position:{x:450,y:500,serverAt:now+1600},barriers:[]};
assert.equal(lab.seedSyntheticMob(near,now+1600).ok,true);
assert.equal(check({...basic,key:'s1',requestId:'hit_12345696'},now+1600).code,
 'REFERENCE_ATTACK_COOLDOWN');

// Reposition using the owner-fenced, synthetic server-only tick.
assert.equal(actors.applySyntheticServerTick(socket,evidence,{
 origin:'synthetic-server-tick-only',revision:3,hp:500,mp:200,
 position:{x:400,y:500,serverAt:now+2400},
 cooldownUntil:{},statusEffects:[]},now+2400).ok,true);
const fresh=check({...basic,key:'s1',requestId:'hit_12345697'},now+2400);
assert.equal(fresh.ok,true);
assert.equal(fresh.candidate.generation,1);
assert.equal(fresh.canAttack,false);

// Update mob too old => stale target, irrespective of actor freshness.
assert.equal(check({...basic,key:'s1',requestId:'hit_12345698'},now+4000).code,
 'SERVER_ACTOR_POSITION_STALE');
assert.equal(lab.seedSyntheticMob({
 ...seed,key:'s2',generation:1,
 position:{x:410,y:500,serverAt:now-6000}},now+2400).ok,true);
assert.equal(check({...basic,key:'s2',requestId:'hit_12345699'},now+2400).code,
 'SERVER_MOB_POSITION_STALE');

for (const invalid of [
 {...seed,generation:3,hp:301},
 {...seed,generation:3,damage:100000},
 {...seed,generation:3,position:{x:-1,y:400,serverAt:now}},
 {...seed,generation:3,barriers:[{minX:50,minY:30,maxX:20,maxY:100}]},
 {...seed,generation:3,room:'safe'},
 {...seed,generation:3,origin:'telegram-client-mob-catalog'}
]){
 assert.equal(lab.seedSyntheticMob(invalid,now).ok,false,JSON.stringify(invalid));
}
assert.equal(lab.clearSocket(socket),true);
assert.equal(lab.clearSocket(socket),false);
const reboot=new NativePveHitGeometryLab(actors);
assert.equal(reboot.referenceBasicHit(socket,evidence,basic,now+2400).code,
 'SERVER_MOB_GENERATION_MISSING');

// No live route/wallet/Telegram save can call into this fixture-only lab.
const realtime=readFileSync(new URL('../src/realtime-stable.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
assert(!realtime.includes('NativePveHitGeometryLab'));
assert(!worker.includes('NativePveHitGeometryLab'));
const implementation=readFileSync(new URL('../src/native-pve-hit-geometry-lab.js',import.meta.url),'utf8');
assert(!/\.run\(|\.batch\(|saveGameState|\.fetch\(/.test(implementation));
console.log('PPA_NATIVE_HIT_GEOMETRY_LAB_OK class_range=1 mob_gen=1 moving_target=1 wall_LOS=1 stale_pos=1 replay=1 server_cooldown_reference=1 no_damage=1 no_live_route=1');
