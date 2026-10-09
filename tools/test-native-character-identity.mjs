import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Test actual handler source with no Cloudflare account, production D1 or game writes.
const src = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
const a = src.indexOf('async function handlePhoenixGameApi(');
const b = src.indexOf('\nasync function handlePhoenixLauncherApi(', a);
assert(a > 0 && b > a);
const handlerSrc = src.slice(a,b);
assert(handlerSrc.includes("PPA_GODOT_CHARACTER_REGISTER_ENABLED"));
assert(handlerSrc.includes("registerCharacter(env, telegramId, body.nickname, classKey)"), 'must reuse original save+newbie registration');
assert(!handlerSrc.includes("body.telegramId"), 'client must not choose a Telegram account');
assert(src.includes('CREATE TABLE IF NOT EXISTS phoenix_character_identity'), 'stable 1:1 character identity registry missing');
assert(src.includes('LEFT JOIN phoenix_character_identity ci ON ci.account_id=a.account_id'));

function harness({linked='77770001',gameId='phoenix-pix-arena',authenticated=true,registerOk=true}={}) {
  const calls={registration:[], bindings:[]};
  const deps={
    ensurePhoenixAuthSchema:async()=>{},
    phoenixGameSessionFromRequest:async()=>{
      if(!authenticated)throw Object.assign(new Error('Missing'),{status:401,code:'GAME_SESSION_MISSING'});
      return {accountId:'px_test',gameId};
    },
    phoenixAccountRow:async(_env,accountId)=>{
      assert.equal(accountId,'px_test');
      return {telegram_id:linked,email:linked?'':'demo@example.test',nickname:''};
    },
    phoenixBindExistingCharacterIdentity:async(_env,accountId)=>{
      calls.bindings.push(accountId);
      return {characterId:'pc_test',legacyTelegramId:linked};
    },
    registerCharacter:async(_env,id,nickname,classKey)=>{
      calls.registration.push({id,nickname,classKey});
      return registerOk?{ok:true,profile:{nickname,classKey},save:{version:1},newbieChestGranted:true}
        :{ok:false,status:409,code:'NICK_TAKEN'};
    },
    phoenixAccountPayload:row=>({accountId:'px_test',telegramId:row.telegram_id||null}),
    json:(data,status=200)=>({status,data}),
    apiError:(message,status,code)=>({status,data:{ok:false,code,message}}),
    console:{error(){}},
  };
  const handle=new Function(...Object.keys(deps),handlerSrc+'\nreturn handlePhoenixGameApi;')(...Object.values(deps));
  return {handle,calls};
}
const url={pathname:'/api/game/character/register',searchParams:{get:()=> 'malicious'}};
const request={method:'POST',json:async()=>({nickname:'TestHero',classKey:'archer',telegramId:'attacker'})};
const env={PPA_GODOT_CHARACTER_REGISTER_ENABLED:'1'};
let h=harness();
assert.equal((await h.handle(request,{},url)).status,404,'registration must fail closed by default');
assert.equal(h.calls.registration.length,0);
let success=await h.handle(request,env,url);
assert.equal(success.status,200);
assert.equal(success.data.newbieChestGranted,true);
assert.equal(success.data.characterId,'pc_test');
assert.deepEqual(h.calls.registration,[{id:'77770001',nickname:'TestHero',classKey:'archer'}]);
assert.deepEqual(h.calls.bindings,['px_test']);
assert.equal((await h.handle({method:'GET'},env,url)).status,405);
assert.equal((await harness({authenticated:false}).handle(request,env,url)).status,401);
assert.equal((await harness({gameId:'other'}).handle(request,env,url)).status,403);
assert.equal((await harness({linked:''}).handle(request,env,url)).data.code,'EMAIL_CHARACTER_REGISTRATION_NOT_READY');
assert.equal((await harness({registerOk:false}).handle(request,env,url)).status,409);
const badClass=await h.handle({method:'POST',json:async()=>({nickname:'TestHero',classKey:'unknown'})},env,url);
assert.equal(badClass.data.code,'INVALID_CLASS');
assert.equal(h.calls.registration.length,1,'invalid class must not call registration');

// Real metadata-only binder: no writes to players, saves or legacy identity.
const start=src.indexOf('async function phoenixBindExistingCharacterIdentity(');
const end=src.indexOf('\nasync function phoenixEnsureAccountForTelegram(',start);
assert(start>0&&end>start);
const bindSrc=src.slice(start,end);
assert(!/UPDATE saves|INSERT INTO saves|UPDATE players|DELETE FROM/.test(bindSrc));
function bindHarness({telegramId='77770001',nickname='ExistingHero',version=9,otherOwner=false}={}) {
  const state={links:new Map(),writes:[]};
  const id=telegramId;
  const env={DB:{prepare(sql){return{bind(...args){return{
    async first(){
      if(sql.includes('FROM saves'))return version?{version}:null;
      if(sql.includes('WHERE account_id=?1'))return state.links.get(args[0])||null;
      if(sql.includes('WHERE legacy_telegram_id=?1')){
        for(const [owner,linked] of state.links)if(linked.legacy_telegram_id===args[0])return{account_id:owner,character_id:linked.character_id};
        return otherOwner?{account_id:'another_owner',character_id:'pc_other'}:null;
      }
      throw Error('unexpected read '+sql);
    },
    async run(){
      assert(sql.includes('INSERT OR IGNORE INTO phoenix_character_identity'));
      state.writes.push(sql);
      if(!state.links.has(args[0]))state.links.set(args[0],{character_id:args[1],legacy_telegram_id:args[2]});
      return {meta:{changes:1}};
    },
  };}};}}};
  const deps={
    phoenixAccountRow:async()=>({telegram_id:id,nickname}),
    phoenixRandomToken:()=> 'test-unique',
    Date,
  };
  const bind=new Function(...Object.keys(deps),bindSrc+'\nreturn phoenixBindExistingCharacterIdentity;')(...Object.values(deps));
  return {bind,env,state};
}
let x=bindHarness();
assert.deepEqual(await x.bind(x.env,'px_test'),{characterId:'pc_test-unique',legacyTelegramId:'77770001'});
assert.deepEqual(await x.bind(x.env,'px_test'),{characterId:'pc_test-unique',legacyTelegramId:'77770001'});
assert.equal(x.state.writes.length,1,'identity binding must be idempotent');
x=bindHarness({nickname:''});
assert.equal(await x.bind(x.env,'px_test'),null);
assert.equal(x.state.writes.length,0);
x=bindHarness({version:0});
assert.equal(await x.bind(x.env,'px_test'),null);
x=bindHarness({otherOwner:true});
await assert.rejects(()=>x.bind(x.env,'px_test'),err=>err.code==='CHARACTER_IDENTITY_CONFLICT');
console.log('PPA_UNIFIED_ACCOUNT_IDENTITY_OK single_legacy_save=1 stable_character_id=1 email_not_fabricated=1 authenticated_register=1 gated=1 idempotent=1');
