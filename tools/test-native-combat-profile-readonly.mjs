import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectNativeCombatProfileReadOnly } from '../src/native-combat-profile-readonly.js';

// Real D1 save *shape*, synthetic personal values. It is NOT certified PvE
// damage data until Telegram JS stat/skill calculations are ported.
const first={
  ok:true,version:81,updatedAt:1000000,
  profile:{classKey:'gnome',nickname:'Test-Dwarf'},
  state:{
    lvl:42,statPts:9,statAlloc:{atk:50,hp:40,mp:12,def:8},
    equipped:{
      weapon:{uid:'weapon-7',enh:7,stats:{atk:100000000}},
      pet:{uid:'pet-1',enh:5},
      wings:{uid:'wings-2',enh:0}
    },
    skillRanks:{grapeshot:5,smoke:1},
    hp:99999999,atk:99999999,attackRange:50000,
    gold:600,ppa:150,gram:23,
    bag:[{uid:'protected-legendary',enh:7}]
  }
};
const original=JSON.stringify(first);
const view=projectNativeCombatProfileReadOnly(first);
assert.equal(view.source,'original-telegram-ppa-d1-save');
assert.equal(view.version,81);
assert.equal(view.candidate.level,42);
assert.equal(view.candidate.registeredClass,'gnome');
assert.equal(view.candidate.classMatchesSave,true);
assert.equal(view.candidate.equipped.weapon.enhance,7,
  'A real +7 gear must not be silently lowered to +5');
assert.equal(view.candidate.skillRanks.grapeshot,5);
assert.equal(view.candidate.allocatedStats.atk,50);
assert.equal(view.candidate.statPointsRemaining,9);
assert.equal(view.candidate.equipped.pet.enhance,5);
assert.equal(view.candidate.equipped.armor,null);
for (const field of ['readOnly','actionsEnabled','canAttack','canCast',
  'canReceiveRewards','authoritativeCombatStats']) {
  assert.deepEqual(view[field],field==='readOnly'?true:
    field==='authoritativeCombatStats'?null:false, field+' must fail closed');
}
assert(view.blockedReasons.includes('SERVER_DAMAGE_AND_REWARD_SETTLEMENT_NOT_READY'));
assert(!('hp' in view.candidate) && !('atk' in view.candidate) &&
  !('gold' in view) && !('gram' in view) && !('bag' in view),
  'Unverified client attack/HP/economy data leaked into effective combat profile');
view.candidate.equipped.weapon.enhance=0;
view.candidate.skillRanks.grapeshot=0;
assert.equal(first.state.equipped.weapon.enh,7,'Read projection altered legacy +7 save');
assert.equal(first.state.skillRanks.grapeshot,5,'Read projection altered original skill rank');
assert.equal(JSON.stringify(first),original,'Combat projection modified D1 source');

const conflicting={...first,profile:{classKey:'mage'},
  state:{...first.state,cls:'gnome',classKey:'gnome'}};
const conflict=projectNativeCombatProfileReadOnly(conflicting);
assert.equal(conflict.candidate.registeredClass,'mage');
assert.equal(conflict.candidate.classMatchesSave,false);
assert(conflict.blockedReasons.includes('CLASS_SAVE_CONFLICT'));
assert.equal(conflict.canAttack,false);
const missing=projectNativeCombatProfileReadOnly({
  state:{classKey:'gnome',lvl:40,atk:2000},version:99,profile:null});
assert.equal(missing.canAttack,false);
assert(missing.blockedReasons.includes('REGISTERED_CLASS_MISSING'));
assert.equal(missing.candidate.equipped.weapon,null);
assert.equal(missing.candidate.allocatedStats.atk,null);
assert.equal(projectNativeCombatProfileReadOnly({
  state:{},bootstrapFromProfile:true,profile:{classKey:'gnome'}}),null);
assert.equal(projectNativeCombatProfileReadOnly({state:null}),null);

const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const a=worker.indexOf('async function handlePhoenixGameApi(');
const b=worker.indexOf('\nasync function handlePhoenixLauncherApi(',a);
assert(a>=0&&b>a,'Worker game API route not found');
const slice=worker.slice(a,b);
const calls={auth:0,reads:[],writes:0};
let signedGame='phoenix-pix-arena',tgOwner='11111',saved=first;
const deps={
  ensurePhoenixAuthSchema: async()=>{},
  phoenixGameSessionFromRequest:async()=>{calls.auth++;return {gameId:signedGame,accountId:'verified-phoenix-account'};},
  phoenixAccountRow:async(_env,id)=>{assert.equal(id,'verified-phoenix-account');return {telegram_id:tgOwner};},
  loadSave:async(_env,telegramId)=>{calls.reads.push(telegramId);return saved;},
  projectNativeCombatProfileReadOnly,
  json:(data,status=200)=>({status,data}),
  apiError:(message,status=400,code='BAD_REQUEST')=>({status,data:{ok:false,code,message}}),
  console:{error:()=>{}},
  saveGameState:async()=>{calls.writes++;throw Error('Unexpected save write');}
};
const handle=new Function(...Object.keys(deps),
  slice+'\nreturn handlePhoenixGameApi;')(...Object.values(deps));
const url={pathname:'/api/game/combat/profile',
  searchParams:new URLSearchParams('ownerId=22222&telegramId=22222&atk=999999&damage=99999')};
const get={method:'GET',json:async()=>{throw Error('Never read body on GET');}};
const gate={PPA_GODOT_STATE_READ_ENABLED:'1',PPA_GODOT_COMBAT_PROFILE_READ_ENABLED:'1'};
for(const e of [{},{PPA_GODOT_STATE_READ_ENABLED:'1'},
  {PPA_GODOT_COMBAT_PROFILE_READ_ENABLED:'1'}]){
  const p=await handle(get,e,url);
  assert.equal(p.status,404,'Both read gates required');
}
assert.equal(calls.auth,0,'Feature flag off triggered authentication');
assert.equal(calls.reads.length,0,'Feature flag off queried private D1');
assert.equal((await handle({method:'POST'},gate,url)).status,405);
assert.equal(calls.reads.length,0);
signedGame='different-game';
assert.equal((await handle(get,gate,url)).status,403);
assert.equal(calls.reads.length,0);
signedGame='phoenix-pix-arena';
tgOwner='';
assert.equal((await handle(get,gate,url)).status,409);
assert.equal(calls.reads.length,0);
tgOwner='11111';
const result=await handle(get,gate,url);
assert.equal(result.status,200);
assert.equal(result.data.ownerId,'11111','Client-specified Telegram owner used instead of signed owner');
assert.equal(result.data.version,81);
assert.equal(result.data.combat.version,81);
assert.equal(result.data.combat.candidate.equipped.weapon.enhance,7);
assert.equal(result.data.combat.authoritativeCombatStats,null);
assert.equal(result.data.combat.canAttack,false);
assert.deepEqual(calls.reads,['11111']);
saved={...first,bootstrapFromProfile:true,state:{}};
assert.equal((await handle(get,gate,url)).status,409,'No actual D1 row should fail closed');
assert.equal(calls.writes,0);
const loc=slice.indexOf("if (url.pathname === '/api/game/combat/profile')");
const stop=slice.indexOf('// Native clan UI',loc);
assert(loc>0 && stop>loc && !/saveGameState|\.run\(/.test(slice.slice(loc,stop)),
  'Combat read route must not contain save mutations');
console.log('PPA_NATIVE_COMBAT_PROFILE_AUDIT_OK D1_saved_level=1 original_enh7=1 original_skillrank=1 verified_owner=1 flags_default_off=1 no_authoritative_damage=1 read_only=1 no_writes=1');
