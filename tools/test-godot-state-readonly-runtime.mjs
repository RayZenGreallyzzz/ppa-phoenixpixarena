import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Execute the ACTUAL deployed-style JS handler inside in-memory test doubles.
// This file never authenticates against production, touches D1, or sends a write.
const src = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
const start = src.indexOf("async function handlePhoenixGameApi(");
const end = src.indexOf("\nasync function handlePhoenixLauncherApi(", start);
assert(start >= 0 && end > start);
const handlerSrc = src.slice(start, end);

function makeHarness({linkedTelegramId="tg-own",saveExists=true}={}){
  const reads=[],logs=[];
  let loaded=0;
  const deps={
    ensurePhoenixAuthSchema: async()=>{},
    phoenixGameSessionFromRequest: async request=>{
      if(request.noSession)throw Object.assign(new Error("Missing"),{status:401,code:"GAME_SESSION_MISSING"});
      return {accountId:"account-own", gameId:request.gameId??"phoenix-pix-arena"};
    },
    phoenixAccountRow: async(_env,accountId)=>{
      assert.equal(accountId,"account-own");
      return {telegram_id:linkedTelegramId};
    },
    loadSave:async(_env,id)=>{
      reads.push(id);loaded++;
      return {ok:true,version:28,profile:{telegramId:id},state:saveExists?{lvl:43,hp:1130,mp:240,bag:[{id:"safe_test_item"}]}:null,updatedAt:12345};
    },
    json:(data,status=200)=>({status,data}),
    apiError:(message,status=400,code="BAD_REQUEST")=>({status,data:{ok:false,code,message}}),
    console:{error:(...xs)=>logs.push(xs.map(String))}
  };
  const fn=new Function(...Object.keys(deps),handlerSrc+"\nreturn handlePhoenixGameApi;");
  const handle=fn(...Object.values(deps));
  return {handle,reads,logs,get loaded(){return loaded;}};
}
const url={pathname:"/api/game/state",searchParams:new URLSearchParams("telegramId=tg-other")};
const enabledEnv={PPA_GODOT_STATE_READ_ENABLED:"1"};
let h=makeHarness();
const own=await h.handle({method:"GET"}, enabledEnv,url);
assert.equal(own.status,200);
assert.equal(own.data.ok,true);
assert.equal(own.data.readOnly,true);
assert.equal(own.data.gameId,"phoenix-pix-arena");
assert.equal(own.data.version,28);
assert.equal(own.data.state.hp,1130);
assert.equal(own.data.state.bag[0].id,"safe_test_item");
assert.deepEqual(h.reads,["tg-own"]);
const spoof=await h.handle({method:"GET",telegramId:"tg-other"}, enabledEnv,url);
assert.equal(spoof.status,200);
assert.equal(spoof.data.profile.telegramId,"tg-own");
assert.deepEqual(h.reads,["tg-own","tg-own"]);
const rejectGame=await h.handle({method:"GET",gameId:"unrelated-game"}, enabledEnv,url);
assert.equal(rejectGame.status,403);
assert.equal(rejectGame.data.code,"GAME_SESSION_WRONG_GAME");
const rejectPost=await h.handle({method:"POST",json:async()=>({telegramId:"tg-other",state:{hp:9999}})}, enabledEnv,url);
assert.equal(rejectPost.status,405);
const rejectNoAuth=await h.handle({method:"GET",noSession:true}, enabledEnv,url);
assert.equal(rejectNoAuth.status,401);
assert.equal(rejectNoAuth.data.code,"GAME_SESSION_MISSING");
assert.equal(h.loaded,2, "Denied queries never touch the player's save");
const unlinked=makeHarness({linkedTelegramId:""});
const noLink=await unlinked.handle({method:"GET"}, enabledEnv,url);
assert.equal(noLink.status,409);
assert.equal(noLink.data.code,"TELEGRAM_NOT_LINKED");
assert.equal(unlinked.loaded,0);
const defaultOff=makeHarness();
const offResponse=await defaultOff.handle({method:"GET"}, {},url);
assert.equal(offResponse.status,404);
assert.equal(offResponse.data.code,"NOT_FOUND");
assert.equal(defaultOff.loaded,0);
const invalidFlag=await defaultOff.handle({method:"GET"}, {PPA_GODOT_STATE_READ_ENABLED:"true"},url);
assert.equal(invalidFlag.status,404);
assert.equal(defaultOff.loaded,0);
console.log("PPA_NATIVE_STATE_RUNTIME_OK own_data=1 spoof_ignored=1 foreign_game_denied=1 posts_denied=1 unauth_denied=1 unlinked_denied=1 default_off=1 invalid_flag_off=1 writes=0");
