import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {nativeClanOperation, nativeClanCommand} from '../src/native-clan-actions.js';
import {executeNativeCommandOnce} from '../src/native-action-ledger.js';
import {handleClanOnline} from '../src/clan-online.js';

// Real SQLite, offline only. This runs the production canonical clan rules,
// native adapter and command ledger, not a duplicate implementation.
const sql = new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE players(telegram_id TEXT PRIMARY KEY,telegram_username TEXT,telegram_first_name TEXT,
  telegram_last_name TEXT,nickname TEXT,nickname_key TEXT,class_key TEXT,created_at INTEGER,updated_at INTEGER,last_auth_at INTEGER);
  CREATE TABLE saves(telegram_id TEXT PRIMARY KEY,version INTEGER,state_json TEXT,updated_at INTEGER);`);
const db = {prepare(query) {
  const converted = query.replace(/\?(\d+)/g, '$p$1');
  let params = [];
  const statement = {bind(...args) {params=args;return statement;},
    args() {return Object.fromEntries([...converted.matchAll(/\$p(\d+)/g)]
      .map(m=>['p'+m[1], params[Number(m[1])-1]]));},
    first() {return sql.prepare(converted).get(statement.args()) || null;},
    all() {return {results:sql.prepare(converted).all(statement.args())};},
    run() {const r=sql.prepare(converted).run(statement.args());return {meta:{changes:Number(r.changes)}};}};
  return statement;
}};
const env={DB:db,PPA_GODOT_CLAN_ACTIONS_ENABLED:'1',BOT_TOKEN:'offline-test-token-never-live'};
async function telegramClan(owner, operation='state', fields={}) {
  const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),
    user:JSON.stringify({id:Number(owner),username:'test_'+owner,first_name:'Test'})});
  const signed=[...params.entries()].map(([k,v])=>`${k}=${v}`).sort((a,b)=>a.localeCompare(b)).join('\n');
  const secret=createHmac('sha256','WebAppData').update(env.BOT_TOKEN).digest();
  params.set('hash',createHmac('sha256',secret).update(signed).digest('hex'));
  return handleClanOnline(new Request('https://offline.invalid/api/clan/'+operation,{method:'POST',
    headers:{'content-type':'application/json'},body:JSON.stringify({initData:params.toString(),...fields})}),env);
}
for(const [id,name] of [['10001','Alpha'],['10002','Beta'],['10003','Gamma']]) {
  sql.prepare('INSERT INTO players(telegram_id,nickname,class_key) VALUES(?,?,?)').run(id,name,'gnome');
  sql.prepare('INSERT INTO saves VALUES(?,?,?,?)').run(id,8,JSON.stringify({gold:2500000,bag:[{uid:'keep',enh:7}]}),123);
}
const id=n=>n.toString(16).padStart(32,'0');
let commandIndex=1;
const run=(owner,action,fields={})=>nativeClanOperation(env,owner,'action',{action,requestId:id(commandIndex++),...fields});
const beforeSaves=sql.prepare('SELECT * FROM saves ORDER BY telegram_id').all();
let result=await nativeClanOperation(env,'10001','state');
assert.equal(result.data.ownerId,'10001');
assert.deepEqual(result.data.state.members,[]);
assert.equal(result.data.state.clan,null);
const createRequest={action:'create',name:'Shared Clan',requestId:id(commandIndex++)};
result=await nativeClanOperation(env,'10001','action',createRequest);
assert.equal(result.status,200);
assert.equal(result.data.requestId,createRequest.requestId);
assert.equal(result.data.commandStatus,'done');
const clanId=result.data.state.clan.id;
assert.equal(result.data.state.clan.leaderId,'10001');
const again=await nativeClanOperation(env,'10001','action',createRequest);
assert.deepEqual(again,result,'retry returns the stored acknowledgement');
assert.equal(sql.prepare('SELECT COUNT(*) n FROM clans').get().n,1);
assert.equal((await nativeClanOperation(env,'10001','action',{...createRequest,name:'Different'})).data.code,'REQUEST_ID_REUSED');
const spoof={action:'apply',name:'Shared Clan',ownerId:'10001',telegramId:'10001',state:{gold:999},requestId:id(commandIndex++)};
result=await nativeClanOperation(env,'10002','action',spoof);
assert.equal(result.status,200);
assert.equal(result.data.state.self.id,'10002');
let leader=await nativeClanOperation(env,'10001','state');
const application=leader.data.state.applications[0];
assert.equal(application.telegramId,'10002');
assert.equal((await run('10003','acceptApplication',{applicationId:application.id})).status,409);
assert.equal((await run('10001','acceptApplication',{applicationId:application.id})).status,200);
assert.equal((await run('10002','kickMember',{memberId:'10001'})).status,403);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM clan_members').get().n,2);
assert.equal((await run('10001','setPermissions',{memberId:'10002',permissions:{canDeposit:true,withdrawMode:'all'}})).status,200);
assert.deepEqual((await nativeClanOperation(env,'10002','state')).data.state.permissions['10002'],
  {canDeposit:true,withdrawMode:'all',allowed:{}});
assert.equal((await run('10001','setAuthority',{memberId:'10002',authority:{manageStorageRights:true}})).status,200);
assert.equal((await run('10002','setPermissions',{memberId:'10002',permissions:{canDeposit:false,withdrawMode:'none'}})).status,200,
  'delegated original authority is honored');
assert.equal((await telegramClan('10002','action',{action:'setPermissions',memberId:'10002',
  permissions:{canDeposit:true,withdrawMode:'all'}})).status,200,'same delegated rights work through real Telegram authentication');
assert.equal((await run('10002','setAuthority',{memberId:'10001',authority:{manageMembers:true}})).status,403,
  'delegated member cannot become a leader');
assert.equal((await run('10001','leaveClan')).status,409,'leader cannot orphan another member');
await run('10001','transferLeadership',{memberId:'10002'});
assert.equal(sql.prepare('SELECT leader_id FROM clans').get().leader_id,'10002');
assert.equal((await run('10001','kickMember',{memberId:'10002'})).status,403);
assert.equal((await run('10002','kickMember',{memberId:'10001'})).status,200);
assert.equal((await run('10002','upgradeBonus',{bonusKey:'hp'})).status,409,'no invented clan points');
const meta=sql.prepare('SELECT progress_json FROM clan_meta WHERE clan_id=?').get(clanId);
const progress=JSON.parse(meta.progress_json);progress.coins=500;
sql.prepare('UPDATE clan_meta SET progress_json=? WHERE clan_id=?').run(JSON.stringify(progress),clanId);
const bonusRequest={action:'upgradeBonus',bonusKey:'hp',requestId:id(commandIndex++)};
const upgraded=await nativeClanOperation(env,'10002','action',bonusRequest);
assert.equal(upgraded.data.state.clanProgress.bonuses.hp,1);
assert.deepEqual(await nativeClanOperation(env,'10002','action',bonusRequest),upgraded);
assert.equal((await nativeClanOperation(env,'10002','state')).data.state.clanProgress.bonuses.hp,1,'retry must not spend twice');
assert.equal((await run('10002','upgradeBonus',{bonusKey:'hp'})).status,409,'one point cannot buy a second level');
assert.equal((await run('10002','castleCaptured',{reward:{gold:100000}})).status,400);
assert.equal((await run('10002','put',{item:{uid:'forged'}})).status,400,'no client-owned inventory copy is trusted');
assert.deepEqual(sql.prepare('SELECT * FROM saves ORDER BY telegram_id').all(),beforeSaves,'membership must preserve every original save');
assert.deepEqual(nativeClanCommand({action:'setAuthority',memberId:'10001',authority:{manageMembers:true,admin:true}}),
  {service:'clan',action:'setAuthority',memberId:'10001',authority:{acceptMembers:false,viewClanHistory:false,manageStorageRights:false,manageMembers:true}});
assert.equal(nativeClanCommand({action:'setPermissions',memberId:'10001',permissions:{withdrawMode:'selected',allowed:{forged:1}}}),null);
assert.equal((await nativeClanOperation({...env,PPA_GODOT_CLAN_ACTIONS_ENABLED:'0'},'10002','action',createRequest)).status,404);

// Persisted concurrency, interrupted handler, replay and hash rejection.
let release;
let executions=0;
const blocked=executeNativeCommandOnce(env,'10003',id(900),{action:'test'},async()=>{
  executions++; await new Promise(resolve=>{release=resolve;}); return {status:200,data:{ok:true}};
});
while(!release) await new Promise(resolve=>setImmediate(resolve));
assert.equal((await executeNativeCommandOnce(env,'10003',id(900),{action:'test'},()=>assert.fail('duplicate execution'))).data.code,'COMMAND_PENDING');
assert.equal((await executeNativeCommandOnce(env,'10003',id(901),{action:'second'},()=>assert.fail('parallel execution'))).data.code,'OWNER_COMMAND_PENDING');
release();await blocked;
assert.equal(executions,1);
assert.equal((await executeNativeCommandOnce(env,'10003',id(902),{action:'interrupt'},()=>{throw Error('interruption');})).data.code,'COMMAND_UNCONFIRMED');
assert.equal((await executeNativeCommandOnce(env,'10003',id(902),{action:'interrupt'},()=>assert.fail('unsafe retry'))).data.code,'COMMAND_PENDING');

// Exercise the actual worker route with a signed-session test dependency.
const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const start=worker.indexOf('async function handlePhoenixGameApi('),end=worker.indexOf('\nasync function handlePhoenixLauncherApi(',start);
const calls=[];
let authorized=true,gameId='phoenix-pix-arena';
const deps={ensurePhoenixAuthSchema:async()=>{},
  phoenixGameSessionFromRequest:async()=>{if(!authorized)throw Object.assign(Error('expired'),{status:401});return{accountId:'signed-account',gameId};},
  phoenixAccountRow:async()=>({telegram_id:'10002'}),nativeClanOperation:async(_env,owner,op,body)=>{calls.push({owner,op,body});return{status:200,data:{ok:true}};},
  json:(data,status=200)=>({data,status}),apiError:(message,status,code)=>({status,data:{ok:false,message,code}}),console:{error:()=>{}}};
const handle=new Function(...Object.keys(deps),worker.slice(start,end)+';return handlePhoenixGameApi;')(...Object.values(deps));
const url={pathname:'/api/game/clan/action'};
const request={method:'POST',json:async()=>({ownerId:'10001',telegramId:'10001',action:'create'})};
const gated={PPA_GODOT_CLAN_READ_ENABLED:'1',PPA_GODOT_CLAN_ACTIONS_ENABLED:'1'};
assert.equal((await handle(request,{},url)).status,404);
assert.equal((await handle(request,{PPA_GODOT_CLAN_READ_ENABLED:'1'},url)).status,404);
assert.equal(calls.length,0);
authorized=false;assert.equal((await handle(request,gated,url)).status,401);authorized=true;
gameId='other';assert.equal((await handle(request,gated,url)).status,403);gameId='phoenix-pix-arena';
assert.equal((await handle(request,gated,url)).status,200);assert.equal(calls[0].owner,'10002');

// Keep legacy rules byte-identical except the member-ID projection and the
// durable version of the existing client-side 24h leave restriction.
const source=readFileSync(new URL('../src/clan-online.js',import.meta.url),'utf8');
const legacy=source.slice(0,source.indexOf('// Called only after worker.js'))
  .replace('SELECT telegram_id,clan_id,role,joined_at FROM clan_members WHERE telegram_id=?1',
    'SELECT clan_id,role,joined_at FROM clan_members WHERE telegram_id=?1')
  .replace('const base={connected:true,joinBlockedUntil:await clanJoinBlocked(env,id),clan:null','const base={connected:true,clan:null')
  .replace('const blocked=await clanJoinBlocked(env,id);','const s=await saveRow(env,id),blocked=Number(s&&s.state&&s.state.clanJoinBlockedUntil)||0;')
  .replace("   if((await clanJoinBlocked(env,id))>Date.now())return jr({ok:false,message:'После выхода новый клан будет доступен через 24 часа.'},409);\n",'')
  .replace('await clanRecordLeaveCooldown(env,id);return jr({ok:true,state:await state(env,id,p,true),message:',
    'return jr({ok:true,state:await state(env,id,p,true),message:');
const hash=createHash('sha256').update(legacy.trimEnd()).digest('hex');
assert.equal(hash,'e94449f2010d336db78a99f8539f90678e418de49c2f0e35d278a2b5e3831761','other canonical Telegram clan code must remain identical');
const unauth=await handleClanOnline(new Request('https://offline.invalid/api/clan/state',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),env);
assert.equal(unauth.status,401,'Telegram authentication must not be bypassed');
const fromTelegram=await telegramClan('10002');
assert.equal(fromTelegram.status,200);
assert.deepEqual((await fromTelegram.json()).state,(await nativeClanOperation(env,'10002','state')).data.state,
  'both clients must read the same actual clan and membership');
assert.equal(sql.prepare('SELECT leader_id FROM clans WHERE id=?').get(clanId).leader_id,'10002');
// Native leave has the SAME 24h rule even when no Telegram UI has ever run.
// The authoritative table survives stale saves and one-time client resets.
sql.prepare('INSERT INTO players(telegram_id,nickname,class_key) VALUES(?,?,?)').run('10004','Delta','gnome');
const leaveSave={gold:500,bag:[{uid:'unchanged'}],hp:37,mp:19};
sql.prepare('INSERT INTO saves VALUES(?,?,?,?)').run('10004',8,JSON.stringify(leaveSave),123);
assert.equal((await run('10004','create',{name:'Leave Test'})).status,200);
const left=await run('10004','leaveClan');
assert.equal(left.status,200);
assert.equal(left.data.state.clan,null);
assert(left.data.state.joinBlockedUntil>=Date.now()+24*3600000-2000);
assert(left.data.state.joinBlockedUntil<=Date.now()+24*3600000);
assert.equal((await run('10004','apply',{name:'Shared Clan'})).status,409);
assert.equal((await run('10004','create',{name:'Bypass'})).status,409);
assert.equal((await telegramClan('10004','action',{action:'apply',name:'Shared Clan'})).status,409,
  'switching to Telegram cannot bypass native leave cooldown');
assert.deepEqual(JSON.parse(sql.prepare('SELECT state_json FROM saves WHERE telegram_id=?').get('10004').state_json),leaveSave,
  'cooldown must not rewrite wallet, items or health');
sql.prepare('UPDATE clan_join_cooldowns SET blocked_until=? WHERE telegram_id=?').run(Date.now()-1000,'10004');
assert.equal((await run('10004','apply',{name:'Shared Clan'})).status,200,'server expiry restores normal requests');
// Existing Telegram leave records the same durable cooldown, without changing
// its save version or requiring a new frontend save-version protocol.
await run('10002','acceptApplication',{applicationId:(await nativeClanOperation(env,'10002','state')).data.state.applications[0].id});
assert.equal((await telegramClan('10004','action',{action:'leaveClan'})).status,200);
assert.equal((await run('10004','create',{name:'Bypass Telegram'})).status,409);
assert.equal(sql.prepare('SELECT version FROM saves WHERE telegram_id=?').get('10004').version,8);
console.log('PPA_NATIVE_CANONICAL_CLAN_OK membership=1 roles=1 one_save=1 identity=1 durable_replay=1 interrupted_no_retry=1 telegram_rules_shared=1 authority_lookup_fixed=1 shared_24h_cooldown=1');
