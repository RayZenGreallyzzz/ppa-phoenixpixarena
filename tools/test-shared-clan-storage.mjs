import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {buildClanVaultMove,sharedClanStorageOperation} from '../src/shared-clan-storage.js';
const sql=new DatabaseSync(':memory:');
sql.exec("CREATE TABLE clans(id TEXT PRIMARY KEY,storage_unlocked INTEGER,leader_id TEXT);"+
 "CREATE TABLE clan_members(clan_id TEXT,telegram_id TEXT PRIMARY KEY,role TEXT);"+
 "CREATE TABLE clan_meta(clan_id TEXT PRIMARY KEY,storage_json TEXT,permissions_json TEXT,events_json TEXT,history_json TEXT,updated_at INTEGER);"+
 "CREATE TABLE saves(telegram_id TEXT PRIMARY KEY,version INTEGER,state_json TEXT,updated_at INTEGER)");
const json=JSON.stringify,clone=x=>structuredClone(x);
const item=(uid,enh=7)=>({uid,name:'Исходный предмет '+uid,slot:'wings',
 rarity:'legendary',enh,enhBaseStats:{atk:200},stats:{atk:400,magicResist:9},
 petEnhancementBonuses:{},bm:887,visualClassKey:'mage'});
const hero=uid=>({classKey:'mage',ppa:10500,gram:7,
 bag:[item(uid)],equipped:{weapon:null},storage:{personal:[],premium:[]}});
const originalHero=hero('player-a-+7'),clanGear=item('clan-+5',5);
const permissions={
 ownerA:{canDeposit:true,withdrawMode:'selected',allowed:{'clan-+5':1}},
 ownerB:{canDeposit:false,withdrawMode:'none',allowed:{}}
};
sql.prepare('INSERT INTO clans VALUES(?,?,?)').run('clan1',1,'ownerB');
sql.prepare('INSERT INTO clan_members VALUES(?,?,?)').run('clan1','ownerA','member');
sql.prepare('INSERT INTO clan_members VALUES(?,?,?)').run('clan1','ownerB','leader');
sql.prepare('INSERT INTO clan_meta VALUES(?,?,?,?,?,?)').run(
 'clan1',json([clanGear]),json(permissions),json([]),json([]),100);
sql.prepare('INSERT INTO saves VALUES(?,?,?,?)').run('ownerA',6,json(originalHero),100);
sql.prepare('INSERT INTO saves VALUES(?,?,?,?)').run('ownerB',2,json(hero('leader-bag')),100);
let injection=null, writes=0;
const db={prepare(query){const stmt=sql.prepare(query.replace(/\?(\d+)/g,'?'));
 let bound=[];
 return {bind(...args){bound=args;return this},
  first(){return stmt.get(...bound)||null},
  run(){const result=stmt.run(...bound);return{meta:{changes:Number(result.changes)}}}};
},async batch(statements){
 sql.exec('BEGIN IMMEDIATE');
 try {
  if(injection){const fn=injection;injection=null;fn();}
  for(const stm of statements){stm.run();}
  sql.exec('COMMIT');writes++;
 }catch(e){sql.exec('ROLLBACK');throw e;}
 }};
const env={DB:db,PPA_CLAN_STORAGE_ACTIONS_ENABLED:'1'};
const state=async owner=>(await sharedClanStorageOperation(env,owner,'state',{})).data;
const action=async(owner,base,requestId,what,uid)=>sharedClanStorageOperation(env,owner,'action',{
 action:what,uid,version:base.state.version,clanRevision:base.state.clanRevision,requestId});
let snapshot=await state('ownerA');
assert.equal(snapshot.state.bag[0].enh,7);
assert.equal(snapshot.state.items[0].enh,5);
assert.equal(snapshot.state.items[0].canTake,true);
assert.equal(snapshot.state.canDeposit,true);
assert.equal(snapshot.state.version,6);
const x=await action('ownerA',snapshot,'a'.repeat(32),'put','player-a-+7');
assert.equal(x.status,200,JSON.stringify(x));
assert.equal(writes,1);
assert.equal(sql.prepare('SELECT version FROM saves WHERE telegram_id=?').get('ownerA').version,7);
assert.equal(JSON.parse(sql.prepare('SELECT state_json FROM saves WHERE telegram_id=?').get('ownerA').state_json).bag.length,0);
let stored=JSON.parse(sql.prepare('SELECT storage_json FROM clan_meta WHERE clan_id=?').get('clan1').storage_json);
assert.equal(stored.length,2);
assert.deepEqual(stored[1],item('player-a-+7'),'Item transformed or lost its +7 stats');
assert.deepEqual(await action('ownerA',snapshot,'a'.repeat(32),'put','player-a-+7'),x);
assert.equal(writes,1,'Replay produced duplicate item');
assert.equal((await action('ownerA',snapshot,'b'.repeat(32),'put','player-a-+7')).data.code,'CLAN_STORAGE_CONFLICT');
assert.equal(writes,1);

snapshot=await state('ownerA');
const take=await action('ownerA',snapshot,'c'.repeat(32),'take','clan-+5');
assert.equal(take.status,200,JSON.stringify(take));
const current=JSON.parse(sql.prepare('SELECT state_json FROM saves WHERE telegram_id=?').get('ownerA').state_json);
assert.equal(current.bag[0].uid,'clan-+5');
assert.equal(current.bag[0].enh,5);
const rights=JSON.parse(sql.prepare('SELECT permissions_json FROM clan_meta').get().permissions_json);
assert.equal(rights.ownerA.allowed['clan-+5'],undefined,'Selected permission not consumed');
const other=JSON.parse(sql.prepare('SELECT state_json FROM saves WHERE telegram_id=?').get('ownerB').state_json);
assert.equal(other.bag[0].uid,'leader-bag');
const reject=await action('ownerA',await state('ownerA'),'d'.repeat(32),'take','player-a-+7');
assert.equal(reject.data.code,'CLAN_STORAGE_PERMISSION');
const unauthorized=await action('ownerA',await state('ownerA'),'e'.repeat(32),'take','no-item');
assert.equal(unauthorized.status,403);

// Simulate member removal between permission check and atomic DB.batch:
// both saves and clan meta must rollback together.
snapshot=await state('ownerA');
injection=()=>sql.prepare('DELETE FROM clan_members WHERE telegram_id=?').run('ownerA');
const fail=await action('ownerA',snapshot,'f'.repeat(32),'put','clan-+5');
assert.equal(fail.status,409,JSON.stringify(fail));
assert.equal(writes,2,'Failed transfer counted as committed');
assert.equal(sql.prepare('SELECT version FROM saves WHERE telegram_id=?').get('ownerA').version,8);
assert.equal(JSON.parse(sql.prepare('SELECT storage_json FROM clan_meta').get().storage_json).length,1);
assert.equal(JSON.parse(sql.prepare('SELECT state_json FROM saves WHERE telegram_id=?').get('ownerA').state_json).bag[0].uid,'clan-+5');
assert.equal(sql.prepare('SELECT role FROM clan_members WHERE telegram_id=?').get('ownerA').role,'member',
 'Failed batch must restore the removed member too');

// Simulate the save changing after readContext, before CAS. No clan write.
snapshot=await state('ownerA');
injection=()=>sql.prepare('UPDATE saves SET version=version+1 WHERE telegram_id=?').run('ownerA');
const conflict=await action('ownerA',snapshot,'1'.repeat(32),'put','clan-+5');
assert.equal(conflict.status,409);
assert.equal(JSON.parse(sql.prepare('SELECT storage_json FROM clan_meta').get().storage_json).length,1);
assert.equal(JSON.parse(sql.prepare('SELECT state_json FROM saves WHERE telegram_id=?').get('ownerA').state_json).bag.length,1);

// Clan storage changed by another player before the action; safe rollback.
snapshot=await state('ownerA');
injection=()=>sql.prepare("UPDATE clan_meta SET storage_json='[]' WHERE clan_id=?").run('clan1');
const clanConflict=await action('ownerA',snapshot,'2'.repeat(32),'put','clan-+5');
assert.equal(clanConflict.status,409);
assert.equal(JSON.parse(sql.prepare('SELECT state_json FROM saves WHERE telegram_id=?').get('ownerA').state_json).bag.length,1);

// Limit, UID collision, wrong permissions, and unlocked state fail without writes.
const fixture={
 owner:'ownerA',clanId:'clan1',member:{role:'member'},
 unlocked:true,save:hero('a'),items:[item('b')],permissions:{ownerA:{canDeposit:true,withdrawMode:'all'}}};
assert.equal(buildClanVaultMove(fixture,'put','a').status,200);
const dup=clone(fixture);dup.items.push(item('a'));
assert.equal(buildClanVaultMove(dup,'put','a').data.code,'CLAN_STORAGE_UID_COLLISION');
const full=clone(fixture);full.items=Array.from({length:500},(_,i)=>item('x'+i));
assert.equal(buildClanVaultMove(full,'put','a').data.code,'CLAN_STORAGE_FULL');
const locked=clone(fixture);locked.unlocked=false;
assert.equal(buildClanVaultMove(locked,'put','a').data.code,'CLAN_STORAGE_LOCKED');
const denied=clone(fixture);denied.permissions.ownerA.canDeposit=false;
assert.equal(buildClanVaultMove(denied,'put','a').data.code,'CLAN_STORAGE_PERMISSION');
const off=await sharedClanStorageOperation({...env,PPA_CLAN_STORAGE_ACTIONS_ENABLED:'0'},'ownerA','action',{
 action:'put',uid:'clan-+5',version:8,clanRevision:'a'.repeat(64),requestId:'3'.repeat(32)});
assert.equal(off.status,404);
console.log('PPA_ATOMIC_CLAN_STORAGE_OK real_uid=1 original_plus7=1 permissions=1 selected_quota=1 concurrent_member=1 save_conflict=1 clan_conflict=1 rollback_both=1 idempotency=1');
