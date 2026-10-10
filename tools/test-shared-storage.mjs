import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {moveOriginalPersonalStorage,sharedStorageOperation} from '../src/shared-storage.js';

const packed=Buffer.concat(Array.from({length:12},(_,i)=>
  readFileSync(new URL('../PPA'+String(i+1).padStart(2,'0')+'.bin',import.meta.url))));
const original=gunzipSync(packed).toString('utf8');
assert.equal(createHash('sha256').update(original).digest('hex'),
 'a23969659df17d6f303e688c296f4a2de67b4be8b702693a1760afb4971e43b7');
function fn(name){
 const i=original.indexOf('function '+name+'('),j=original.indexOf('\nfunction ',i+13);
 assert(i>=0&&j>i&&j-i<4500,name+' original changed');
 return original.slice(i,j);
}
const source=fn('storageMove'),copy=x=>JSON.parse(JSON.stringify(x));
const newState=(slot='weapon')=>({classKey:'mage',gold:300,ppa:50000,
  stones:{normal:3,premium:3,rune:2},
  bag:[{uid:'item_'+slot,name:'Вещь +7',slot,rarity:'legendary',enh:7,
    enhBaseStats:{atk:180},stats:{atk:345,magicResist:18},bm:3405,
    special:{level:7}}],
  equipped:{},storage:{personal:[],clan:[],premium:[]}
});
let comparisons=0;
for(const slot of ['weapon','helmet','armor','gloves','ring','legs','boots',
 'necklace','artifact','cloak','wings','pet']){
 const input=newState(slot),before=copy(input),expected=copy(input);
 const ctx={INV:expected,normalizeStorage(){},storageCap:m=>m==='personal'?200:0,
  storageSync(){},premiumStorageAccess(){return false;},
  clanStorageUnlocked(){return false;},clanCanDeposit(){return false;},
  clanCanWithdrawItem(){return false;},clanLogStorage(){},clanStorageServerEvent(){}};
 vm.runInNewContext(source,ctx);
 ctx.storageMove('personal','put',0,'keeper');
 const put=moveOriginalPersonalStorage(input,'put','item_'+slot);
 assert.equal(put.status,200,slot+' put');
 assert.deepEqual(copy(put.state),expected,slot+' deposit vs original PPA');
 assert.deepEqual(input,before,'Original state unexpectedly modified');
 assert.equal(put.state.storage.personal[0].enh,7);
 assert.deepEqual(put.state.storage.personal[0].enhBaseStats,{atk:180});
 ctx.storageMove('personal','take',0,'keeper');
 const take=moveOriginalPersonalStorage(put.state,'take','item_'+slot);
 assert.equal(take.status,200,slot+' take');
 assert.deepEqual(copy(take.state),expected,slot+' withdraw vs original PPA');
 comparisons+=2;
}
const full=newState();
full.storage.personal=Array.from({length:200},(_,i)=>({uid:'vault_'+i}));
assert.equal(moveOriginalPersonalStorage(full,'put','item_weapon').data.code,'STORAGE_FULL');
const bagFull=newState();
bagFull.storage.personal.push(bagFull.bag.shift());
bagFull.bag=Array.from({length:100},(_,i)=>({uid:'bag_'+i}));
assert.equal(moveOriginalPersonalStorage(bagFull,'take','item_weapon').data.code,'STORAGE_FULL');
const duplicated=newState();
duplicated.storage.personal.push(copy(duplicated.bag[0]));
assert.equal(moveOriginalPersonalStorage(duplicated,'put','item_weapon').data.code,'STORAGE_DUPLICATE_UID');
const missing=newState();
assert.equal(moveOriginalPersonalStorage(missing,'put','someone_else').status,409);
assert.deepEqual(missing,newState());
const oldSave=newState();
delete oldSave.storage;
const legacy=moveOriginalPersonalStorage(oldSave,'put','item_weapon');
assert.equal(legacy.status,200);
assert.equal(legacy.state.storage.personal[0].uid,'item_weapon');
assert(!oldSave.storage);
const noUid=newState();
delete noUid.bag[0].uid;
assert.equal(moveOriginalPersonalStorage(noUid,'put','item_weapon').status,409);

const sqlite=new DatabaseSync(':memory:');
const db={prepare(sql){const stmt=sqlite.prepare(sql.replace(/\?(\d+)/g,'?'));let args=[];
 return {bind(...x){args=x;return this},first(){return stmt.get(...args)||null},
 run(){const r=stmt.run(...args);return{meta:{changes:Number(r.changes)}}}}}};
const saves=new Map([['ownerA',{version:12,state:newState('weapon')}],
 ['ownerB',{version:31,state:newState('ring')}]]);
const other=structuredClone(saves.get('ownerB'));
let writes=0;
const persistence={load:async id=>({ok:true,...structuredClone(saves.get(id))}),
 save:async(id,state,version)=>{
  const prev=saves.get(id);if(prev.version!==version)return{ok:false,status:409,code:'SAVE_VERSION_CONFLICT'};
  saves.set(id,{state,version:version+1});writes++;return{ok:true,version:version+1};
 }};
const env={DB:db,PPA_PERSONAL_STORAGE_ACTIONS_ENABLED:'1'};
const command={action:'put',uid:'item_weapon',version:12,requestId:'d'.repeat(32),
 ownerId:'ownerB',name:'fake',enh:0,success:true};
const put=await sharedStorageOperation(env,'ownerA','action',command,persistence);
assert.equal(put.status,200,JSON.stringify(put));
assert.equal(put.data.state.personal[0].enh,7);
assert.equal(saves.get('ownerA').state.storage.personal[0].bm,3405);
assert.deepEqual(saves.get('ownerB'),other,'Other player affected');
assert.deepEqual(await sharedStorageOperation(env,'ownerA','action',command,persistence),put);
assert.equal(writes,1,'Replay duplicated item');
assert.equal((await sharedStorageOperation(env,'ownerA','action',
 {...command,requestId:'e'.repeat(32)},persistence)).data.code,'SAVE_VERSION_CONFLICT');
const take=await sharedStorageOperation(env,'ownerA','action',
 {action:'take',uid:'item_weapon',version:13,requestId:'f'.repeat(32)},persistence);
assert.equal(take.status,200);
assert.equal(writes,2);
assert.equal(saves.get('ownerA').state.bag[0].enh,7);
assert.equal(saves.get('ownerA').state.storage.personal.length,0);
assert.equal((await sharedStorageOperation({...env,PPA_PERSONAL_STORAGE_ACTIONS_ENABLED:'0'},
 'ownerA','action',{action:'put',uid:'item_weapon',version:14,requestId:'a'.repeat(32)},persistence)).status,404);
console.log('PPA_ORIGINAL_PERSONAL_STORAGE_OK original_cases='+comparisons+
 ' 200_capacity=1 100_bag=1 duplicate_guard=1 legacy_save=1 unchanged_plus7=1 owner=1 version=1 replay=1');
