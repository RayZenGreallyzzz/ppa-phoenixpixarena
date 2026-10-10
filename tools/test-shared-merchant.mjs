import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash,createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {MERCHANT_OFFERS,merchantPurchase,sharedMerchantOperation} from '../src/shared-merchant.js';

// Execute the original checksum-locked merchant, including its actual grant
// field mapping, for every offer/quantity/balance combination.
const packed=Buffer.concat(Array.from({length:12},(_,i)=>readFileSync(new URL(`../PPA${String(i+1).padStart(2,'0')}.bin`,import.meta.url))));
const source=gunzipSync(packed).toString('utf8');
assert.equal(createHash('sha256').update(source).digest('hex'),'a23969659df17d6f303e688c296f4a2de67b4be8b702693a1760afb4971e43b7');
const catalogStart=source.indexOf('var MERCHANT_DB={');
const catalogEnd=source.indexOf('\n};',catalogStart)+3;
const functionStart=source.indexOf('function merchantBuy(id,qty){');
const functionEnd=source.indexOf('\nfunction ',functionStart+1);
assert(catalogStart>0 && catalogEnd>catalogStart && functionStart>0 && functionEnd>functionStart);
const context=vm.createContext({merchantNotice(){},showPickup(){},saveGame(){},sendInvState(){},sendMerchantState(){},updateUI(){}});
vm.runInContext(source.slice(catalogStart,catalogEnd)+'\n'+source.slice(functionStart,functionEnd),context);
let comparisons=0;
for (const offer of MERCHANT_OFFERS) {
  assert.equal(context.MERCHANT_DB[offer.id].price,offer.price);
  assert.equal(context.MERCHANT_DB[offer.id].name,offer.name);
  assert.equal(context.MERCHANT_DB[offer.id].currency || 'gold',offer.currency);
  for (const qty of [1,2,17,999]) for (const enough of [false,true]) for (const existing of [0,8]) {
    const original={gold:enough?99999999:0,ppa:enough?99999999:0,
      potions:{hp:existing,hpMedium:existing,hpLarge:existing,mp:existing,mpMedium:existing,mpLarge:existing},
      consumables:{magicSmall:existing,atkSpeedSmall:existing,speedSmall:existing,physSmall:existing,xpScroll:existing,portalStone:existing},
      hp:113,mp:42,equip:{weapon:{uid:'old',enh:7}},bag:[{uid:'unchanged'}],materials:{ruby:29},lvl:42};
    const before=structuredClone(original);
    context.INV=structuredClone(original);
    context.merchantBuy(offer.id,qty);
    const actual=merchantPurchase(original,offer.id,qty);
    assert.deepEqual(actual.status===200?actual.state:original,JSON.parse(JSON.stringify(context.INV)),offer.id);
    assert.deepEqual(original,before,'pure rules cannot mutate their input');
    comparisons++;
  }
}

// Use actual Worker save/load handlers with SQLite, including save history,
// profile binding, progress guards and compare-and-swap. No fake persistence.
const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const executable=worker.replace(/^import .*;\n/gm,'').replace('export default {','const workerDefault = {');
const runtime=new Function('sharedMerchantOperation',executable+';return {loadSave,saveGameState,handleApi};')(sharedMerchantOperation);
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(`CREATE TABLE players(telegram_id TEXT PRIMARY KEY,telegram_username TEXT,telegram_first_name TEXT,telegram_last_name TEXT,
  nickname TEXT,nickname_key TEXT,class_key TEXT,created_at INTEGER,updated_at INTEGER,last_auth_at INTEGER);
  CREATE TABLE saves(telegram_id TEXT PRIMARY KEY,version INTEGER,state_json TEXT,updated_at INTEGER);`);
let beforeUpdate=null;
const db={prepare(query) {
  const converted=query.replace(/\?(\d+)/g,'$p$1');let params=[];
  const statement={bind(...args){params=args;return statement;},
    args(){return Object.fromEntries([...converted.matchAll(/\$p(\d+)/g)].map(m=>['p'+m[1],params[Number(m[1])-1]]));},
    first(){return sqlite.prepare(converted).get(statement.args())||null;},
    all(){return{results:sqlite.prepare(converted).all(statement.args())};},
    run(){if (beforeUpdate && /UPDATE saves\s+SET version/.test(query)){const fn=beforeUpdate;beforeUpdate=null;fn();}
      const result=sqlite.prepare(converted).run(statement.args());return {meta:{changes:Number(result.changes)}};}};
  return statement;
}};
const env={DB:db,BOT_TOKEN:'offline-never-live',PPA_MERCHANT_READ_ENABLED:'1',PPA_MERCHANT_ACTIONS_ENABLED:'1'};
const initial={playerName:'Alpha',nickname:'Alpha',telegramId:'10001',profileTelegramId:'10001',gatewayProfileBound:true,
  cls:'gnome',classKey:'gnome',gold:10000,ppa:1000,potions:{hp:4},consumables:{},bag:[{uid:'keep'}],
  hp:113,mp:42,lvl:42,xp:123,statPts:3,statAlloc:{str:2},premiumShop:{statPointsPurchased:0,auctionSlotGram:0,autoAttackUnlocked:false,purchasedBundles:{}},
  materials:{ruby:29},equip:{weapon:{uid:'old',enh:7}}};
for(const id of ['10001','10002']) {
  sqlite.prepare('INSERT INTO players(telegram_id,nickname,class_key) VALUES(?,?,?)').run(id,id==='10001'?'Alpha':'Beta','gnome');
  sqlite.prepare('INSERT INTO saves VALUES(?,?,?,?)').run(id,8,JSON.stringify(initial),123);
}
const persistence={load:id=>runtime.loadSave(env,id),save:(id,state,version)=>runtime.saveGameState(env,id,state,version)};
const requestId=n=>n.toString(16).padStart(32,'0');
const read=id=>JSON.parse(sqlite.prepare('SELECT state_json FROM saves WHERE telegram_id=?').get(id).state_json);
const untouched=sqlite.prepare('SELECT * FROM saves WHERE telegram_id=?').get('10002');
let state=await sharedMerchantOperation(env,'10001','state',{},persistence);
assert.equal(state.data.state.offers.length,12);
const order={action:'buy',id:'hp_small',qty:3,version:8,requestId:requestId(1),price:0,ownerId:'10002',state:{gold:99999999}};
const bought=await sharedMerchantOperation(env,'10001','action',order,persistence);
assert.equal(bought.status,200);assert.equal(bought.data.requestId,order.requestId);assert.equal(bought.data.commandStatus,'done');
assert.equal(read('10001').gold,9700);assert.equal(read('10001').potions.hp,7);assert.equal(bought.data.state.version,9);
assert.deepEqual(await sharedMerchantOperation(env,'10001','action',order,persistence),bought,'lost-response replay must not buy twice');
assert.equal(read('10001').gold,9700);assert.equal(read('10001').potions.hp,7);
assert.deepEqual(sqlite.prepare('SELECT * FROM saves WHERE telegram_id=?').get('10002'),untouched,'client owner cannot change another save');
for (const field of ['hp','mp','lvl','xp','statPts','statAlloc','premiumShop','bag','materials','equip'])
  assert.deepEqual(read('10001')[field],initial[field],field+' changed during purchase');
assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM save_history WHERE telegram_id=?').get('10001').n,1);
const stale=await sharedMerchantOperation(env,'10001','action',{...order,requestId:requestId(2)},persistence);
assert.equal(stale.data.code,'SAVE_VERSION_CONFLICT');assert.equal(read('10001').gold,9700);
// Concurrent Telegram save between read and write: original CAS must reject
// the purchase without charging money or issuing a potion.
beforeUpdate=()=>sqlite.prepare('UPDATE saves SET version=10 WHERE telegram_id=?').run('10001');
const raced=await sharedMerchantOperation(env,'10001','action',{...order,version:9,requestId:requestId(3)},persistence);
assert.equal(raced.data.code,'SAVE_VERSION_CONFLICT');assert.equal(read('10001').gold,9700);assert.equal(read('10001').potions.hp,7);
assert.equal((await sharedMerchantOperation({...env,PPA_MERCHANT_ACTIONS_ENABLED:'0'},'10001','action',order,persistence)).status,404);
assert.equal((await sharedMerchantOperation(env,'10001','action',{...order,qty:1.1},persistence)).status,400);
assert.equal(merchantPurchase(initial,'unknown',1).status,400);

// Real authenticated Telegram typed route shares precisely this handler.
const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:10001,first_name:'Alpha'})});
const signed=[...params.entries()].map(([k,v])=>`${k}=${v}`).sort((a,b)=>a.localeCompare(b)).join('\n');
const secret=createHmac('sha256','WebAppData').update(env.BOT_TOKEN).digest();
params.set('hash',createHmac('sha256',secret).update(signed).digest('hex'));
const telegram=await runtime.handleApi(new Request('https://offline.invalid/api/merchant/action',{method:'POST',
  headers:{'content-type':'application/json'},body:JSON.stringify({initData:params.toString(),...order,version:10,requestId:requestId(4)})}),env);
assert.equal(telegram.status,200);assert.equal(read('10001').gold,9400);assert.equal(read('10001').potions.hp,10);
// Execute the actual native HTTP route. Only Phoenix authentication is stubbed
// offline; dispatch, rules and persistence are the production functions.
const start=worker.indexOf('async function handlePhoenixGameApi('),end=worker.indexOf('\nasync function handlePhoenixLauncherApi(',start);
let authCalls=0,authorized=true,gameId='phoenix-pix-arena',linkedOwner='10001';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
const deps={ensurePhoenixAuthSchema:async()=>{},phoenixGameSessionFromRequest:async()=>{
  authCalls++;if(!authorized)throw Object.assign(Error('expired'),{status:401});return {accountId:'signed',gameId};},
  phoenixAccountRow:async()=>({telegram_id:linkedOwner}),loadSave:runtime.loadSave,saveGameState:runtime.saveGameState,
  sharedMerchantOperation,json:response,apiError:(message,status,code)=>response({ok:false,message,code},status),console:{error:()=>{}}};
const nativeRoute=new Function(...Object.keys(deps),worker.slice(start,end)+';return handlePhoenixGameApi;')(...Object.values(deps));
const nativeUrl={pathname:'/api/game/merchant/action'};
const nativeRequest={method:'POST',json:async()=>({...order,id:'mp_small',qty:1,version:11,requestId:requestId(5),ownerId:'10002'})};
assert.equal((await nativeRoute(nativeRequest,{},nativeUrl)).status,404);assert.equal(authCalls,0);
authorized=false;assert.equal((await nativeRoute(nativeRequest,env,nativeUrl)).status,401);authorized=true;
gameId='other';assert.equal((await nativeRoute(nativeRequest,env,nativeUrl)).status,403);gameId='phoenix-pix-arena';
linkedOwner='';assert.equal((await nativeRoute(nativeRequest,env,nativeUrl)).status,409);linkedOwner='10001';
const native=await nativeRoute(nativeRequest,env,nativeUrl);
assert.equal(native.status,200);assert.equal((await native.json()).ownerId,'10001');
assert.equal(read('10001').gold,9300);assert.equal(read('10001').potions.mp,1);assert.equal(read('10001').mp,42);
assert.deepEqual(sqlite.prepare('SELECT * FROM saves WHERE telegram_id=?').get('10002'),untouched);
console.log(`PPA_SHARED_MERCHANT_OK original_comparisons=${comparisons} products=12 identity=1 prices_server=1 existing_save=1 replay=1 concurrent_save_rejected=1 telegram_auth=1 native_auth=1 damage_unchanged=1`);
