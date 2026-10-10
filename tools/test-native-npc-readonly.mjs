import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NATIVE_NPC_SERVICES, projectNativeNpcReadOnly } from '../src/native-npc-readonly.js';

const sample = {
  gold: 270, ppa: 85, gram: 3.5, arenaTokens: 12,
  pvp: { rating: 1240, wins: 8, losses: 2 },
  blackMarket: { refreshAt: Date.now() + 100000, offers: [{ id: 'saved-actual-offer', price: 120 }] },
  storage: { personal: [{ uid: 'keep-1' }], clan: [], premium: [] },
};
const unchanged = JSON.stringify(sample);
const arena = projectNativeNpcReadOnly('arena', sample);
assert.equal(arena.arenaTokens, 12);
assert.equal(arena.rating, 1240);
assert.equal(arena.attemptsRemaining, null);
assert.equal(arena.matchmakingEnabled, false);
assert.equal(arena.actionsEnabled, false);
assert.equal(projectNativeNpcReadOnly('merchant', {}, 100).currency.gold, null);
assert.equal(projectNativeNpcReadOnly('forged-not-a-service', sample), null);
const bm = projectNativeNpcReadOnly('blackmarket', sample);
assert.equal(bm.offers.length, 1);
assert.equal(projectNativeNpcReadOnly('blackmarket', sample, sample.blackMarket.refreshAt + 10).offers.length, 0);
assert.equal(projectNativeNpcReadOnly('storage', sample).storageCount.personal, 1);
assert.equal(JSON.stringify(sample), unchanged, 'server projection must not mutate the existing save');
assert.equal(NATIVE_NPC_SERVICES.length, 9);

const worker = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
const a=worker.indexOf('async function handlePhoenixGameApi(');
const b=worker.indexOf('\nasync function handlePhoenixLauncherApi(',a);
assert(a >= 0 && b > a);
const source = worker.slice(a,b);
const calls={read:[],auth:0,writes:0};
const deps={
  ensurePhoenixAuthSchema:async()=>{},
  phoenixGameSessionFromRequest:async(_req)=>{
    calls.auth++;
    return {gameId:'phoenix-pix-arena',accountId:'px_owner'};
  },
  phoenixAccountRow:async(_env,accountId)=>{
    assert.equal(accountId,'px_owner');
    return {telegram_id:'12345678'};
  },
  loadSave:async(_env,telegramId)=>{
    assert.equal(telegramId,'12345678','must never use client-provided Telegram ID');
    calls.read.push(telegramId);
    return {ok:true,version:19,updatedAt:3333,state:sample};
  },
  NATIVE_NPC_SERVICES,
  projectNativeNpcReadOnly,
  json:(data,status=200)=>({status,data}),
  apiError:(message,status,code)=>({status,data:{ok:false,code,message}}),
  console:{error:()=>{}}
};
const handle = new Function(...Object.keys(deps),source+'\nreturn handlePhoenixGameApi;')(...Object.values(deps));
const url={pathname:'/api/game/npc/arena',searchParams:{get:()=> 'evil-other-user'}};
const request={method:'GET',json:async()=>{throw new Error('GET must not parse body');}};
const env={PPA_GODOT_NPC_READ_ENABLED:'1',PPA_GODOT_STATE_READ_ENABLED:'1'};
assert.equal((await handle(request,{},url)).status,404,'off by default');
assert.equal((await handle(request,{PPA_GODOT_NPC_READ_ENABLED:'1'},url)).status,404,'must also require save read flag');
assert.equal(calls.read.length,0,'disabled route must not touch saves');
const result=await handle(request,env,url);
assert.equal(result.status,200);
assert.equal(result.data.service,'arena');
assert.equal(result.data.readOnly,true);
assert.equal(result.data.version,19);
assert.equal(result.data.data.arenaTokens,12);
assert.deepEqual(calls.read,['12345678']);
assert.equal((await handle({method:'POST'},env,url)).status,405);
assert.equal((await handle(request,env,{pathname:'/api/game/npc/admin'})).status,404);
assert.equal(calls.read.length,1);
assert.equal(calls.writes,0);
const routeStart=source.indexOf("if (url.pathname.startsWith('/api/game/npc/'))");
const routeEnd=source.indexOf('// Godot connects to the SAME',routeStart);
const onlyRoute=source.slice(routeStart,routeEnd);
assert(!/saveGameState|\.run\(/.test(onlyRoute),'native NPC route must not mutate a save');
console.log('PPA_GODOT_NATIVE_NPC_READONLY_OK owners=1 versioned_save=1 gating=1 9_services=1 money=1 arena=1 no_mutations=1');
