import assert from 'node:assert/strict';
import {auditNativePveReadiness} from '../src/native-pve-readiness-guard.js';
import {validateNativePveIntent} from '../src/native-pve-combat-intent.js';
import {ORIGINAL_ACTIVE_SKILLS} from '../src/native-original-active-catalog.generated.js';
import {ORIGINAL_CLASS_BASE} from '../src/native-original-class-rune-parity.js';

// Pure synthetic test; no Cloudflare, player auth, combat, D1 or economy writes.
const now=1800000000;
const raw={type:'dungeon-combat-intent',room:'dungeon-1-20-i2',
  key:'s4',action:'skill',skillId:'gnome_buckshot',
  requestId:'qa_skill_12345678'};
const parsed=validateNativePveIntent(raw);
assert.equal(parsed.ok,true);
const intent=parsed.intent;
const id={pid:'p:'+'1'.repeat(32),ownerId:'telegram-owner-a',
  room:intent.room};
const actor={
  origin:'server-dungeon-combat-runtime-v1',
  ownerId:id.ownerId,pid:id.pid,participating:true,observer:false,
  room:intent.room,dead:false,classKey:'gnome',
  position:{x:410,y:530,room:intent.room,serverAt:now-100},
  mp:400,maxMp:1000,
  skillRanks:{gnome_buckshot:4},
  cooldownUntil:{gnome_buckshot:now-500},
  seenRequestIds:[],
  statusEffects:[
    {id:'server-applied-buff',expiresAt:now+4000},
    {id:'old-expired-buff',expiresAt:now-1}
  ],
  buffsVersion:4
};
const mob={room:intent.room,key:intent.key,hp:300,mhp:350,x:450,y:540};
const originals=JSON.stringify({actor,mob,id,intent});
const check=(a=actor,m=mob,i=intent,auth=id)=>
  auditNativePveReadiness(i,a,m,now,auth);
let result=check();
assert.equal(result.canAttack,false);
assert.equal(result.canCast,false);
assert.equal(result.canReceiveRewards,false);
assert.equal(result.combatProfileAuthoritative,false);
assert.equal(result.checks.participation,'SERVER_PARTICIPANT_REFERENCE');
assert.equal(result.checks.identity,'SIGNED_OWNER_MATCH');
assert.equal(result.checks.target,'SERVER_MOB_PRESENT');
assert.equal(result.checks.position,'SERVER_POSITION_FRESH');
assert.equal(result.checks.distance,'SKILL_GEOMETRY_NOT_SERVER_VERIFIED');
assert.equal(result.checks.mana,'SERVER_MANA_REFERENCE');
assert.equal(result.checks.cooldown,'SERVER_COOLDOWNS_REFERENCE');
assert.equal(result.checks.skill,'CLASS_SKILL_REFERENCE');
assert.equal(result.reference.skillManaPercent,10);
assert.equal(result.reference.manaCostEstimate,100);
assert(result.reference.skillCooldownSeconds>0);
assert.deepEqual(result.reference.activeEffects,[
  {id:'server-applied-buff',expiresAt:now+4000}
]);
assert(result.blockers.includes('SERVER_DAMAGE_AND_SETTLEMENT_NOT_READY'));
assert(!('damage' in result) && !('loot' in result));
assert.equal(JSON.stringify({actor,mob,id,intent}),originals);

const failed=(a,m,i,auth,key,code)=>{
  const res=check(a,m,i,auth);
  assert.equal(res.canAttack,false);
  assert.equal(res.canCast,false);
  assert.equal(res.checks[key],code,JSON.stringify(res));
};
failed(null,mob,intent,id,'participation','SERVER_COMBAT_RUNTIME_MISSING');
failed({...actor,origin:'telegram-client-payload'},mob,intent,id,
  'participation','SERVER_COMBAT_RUNTIME_MISSING');
failed({...actor,ownerId:'different-user'},mob,intent,id,
  'identity','SIGNED_OWNER_MISMATCH');
failed({...actor,pid:'p:forged'},mob,intent,id,
  'identity','SIGNED_OWNER_MISMATCH');
failed({...actor,observer:true},mob,intent,id,
  'participation','SERVER_COMBAT_PARTICIPATION_REQUIRED');
failed({...actor,participating:false},mob,intent,id,
  'participation','SERVER_COMBAT_PARTICIPATION_REQUIRED');
failed({...actor,room:'dungeon-1-20-i9'},mob,intent,id,
  'participation','SERVER_COMBAT_PARTICIPATION_REQUIRED');
failed({...actor,dead:true},mob,intent,id,
  'participation','SERVER_COMBAT_PARTICIPATION_REQUIRED');
failed(actor,mob,intent,{...id,room:'safe'},
  'participation','SERVER_COMBAT_PARTICIPATION_REQUIRED');
failed(actor,{...mob,hp:0},intent,id,'target','SERVER_MOB_UNVERIFIED');
failed(actor,{...mob,key:'s888'},intent,id,'target','SERVER_MOB_UNVERIFIED');
failed(actor,{...mob,x:NaN},intent,id,'target','SERVER_MOB_UNVERIFIED');
failed({...actor,position:{...actor.position,serverAt:now-1900}},
  mob,intent,id,'position','SERVER_POSITION_STALE_OR_MISSING');
failed({...actor,position:{...actor.position,serverAt:now+1000}},
  mob,intent,id,'position','SERVER_POSITION_STALE_OR_MISSING');
failed({...actor,position:{...actor.position,x:99999}},
  mob,intent,id,'position','SERVER_POSITION_STALE_OR_MISSING');
failed({...actor,mp:50},mob,intent,id,'mana','MANA_BELOW_REFERENCE_COST');
failed({...actor,mp:NaN},mob,intent,id,'mana','SERVER_MANA_MISSING');
failed({...actor,maxMp:0},mob,intent,id,'mana','SERVER_MANA_MISSING');
failed({...actor,cooldownUntil:{gnome_buckshot:now+6000}},mob,intent,id,
  'cooldown','SKILL_ON_REFERENCE_COOLDOWN');
failed({...actor,cooldownUntil:{}},mob,intent,id,
  'cooldown','SKILL_COOLDOWN_HISTORY_MISSING');
failed({...actor,cooldownUntil:null},mob,intent,id,
  'cooldown','SERVER_COOLDOWNS_MISSING');
failed({...actor,seenRequestIds:[intent.requestId]},mob,intent,id,
  'replay','REPLAYED_REQUEST_ID');
failed({...actor,seenRequestIds:null},mob,intent,id,
  'replay','SERVER_REQUEST_HISTORY_MISSING');
failed({...actor,statusEffects:[{id:'x',expiresAt:NaN}]},mob,intent,id,
  'buffs','SERVER_BUFF_STATE_MISSING');
failed({...actor,statusEffects:null},mob,intent,id,
  'buffs','SERVER_BUFF_STATE_MISSING');
failed({...actor,skillRanks:{gnome_buckshot:0}},mob,intent,id,
  'skill','SKILL_NOT_VERIFIED_FOR_CLASS_OR_RANK');
failed({...actor,classKey:'mage'},mob,intent,id,
  'skill','SKILL_NOT_VERIFIED_FOR_CLASS_OR_RANK');
failed({...actor,classKey:'unknown'},mob,intent,id,
  'distance','SERVER_CLASS_UNVERIFIED');
const tooFar={...actor,position:{x:2700,y:2700,
  room:intent.room,serverAt:now-100}};
const far=check(tooFar);
assert.equal(far.checks.distance,'SKILL_GEOMETRY_NOT_SERVER_VERIFIED');
assert(far.blockers.includes('OUT_OF_CLASS_RANGE_REFERENCE'));
assert.equal(far.canAttack,false);
const basic={...intent,action:'basic',skillId:null};
const basicRes=check(actor,mob,basic,id);
assert.equal(basicRes.checks.skill,'BASIC_ACTION_REFERENCE');
assert.equal(basicRes.checks.cooldown,'BASIC_ATTACK_TIMING_NOT_SERVER_VERIFIED');
assert.equal(basicRes.canAttack,false);
assert(result.reference.originalClassRange===ORIGINAL_CLASS_BASE.gnome.range);
assert.equal(ORIGINAL_ACTIVE_SKILLS.gnome.find(x=>x.id==='gnome_buckshot').mp,10);

// Original socket is still a nonparticipant OBSERVER. This is the actual
// current server state; the pure all-green fixture above does not mint it.
const nativeObserver={...actor,room:'safe',observer:true,participating:false};
const stage=check(nativeObserver);
assert.equal(stage.checks.participation,'SERVER_COMBAT_PARTICIPATION_REQUIRED');
assert.equal(stage.canAttack,false);
assert.equal(JSON.stringify({actor,mob,id,intent}),originals);
console.log('PPA_NATIVE_PVE_READINESS_GUARDS_OK owner=bound observer=denied forged_stats=ignored stale_position=denied distance=reference mana=reference cooldown=reference buff_expiry=server_only replay=denied skills=class_bound no_mob_damage=1 no_cooldown_mutation=1 no_D1_writes=1');
