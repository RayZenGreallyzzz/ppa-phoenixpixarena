import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

const code=fs.readFileSync('src/clan-online.js','utf8').replace('export async function handleClanOnline','async function handleClanOnline');
const ctx=vm.createContext({TextEncoder,crypto:webcrypto,Response,console,URLSearchParams,setTimeout,clearTimeout});
vm.runInContext(code,ctx);
vm.runInContext('state=async function(env,id){return {connected:true,storage:{items:JSON.parse(env.DB.data.meta.storage_json)}}}',ctx);
const transfer=vm.runInContext('clanWarehouseTransfer',ctx);
function clone(x){return JSON.parse(JSON.stringify(x))}
function makeDb(items,bag){
  const data={save:{version:9,state_json:JSON.stringify({bag:clone(bag),storage:{clan:clone(items)},gold:500})},
    meta:{storage_json:JSON.stringify(items),permissions_json:'{}',history_json:'[]'},
    guard:[]};
  const db={
    data,failAfterRead:false,
    prepare(sql){return {bind(...params){
      return {sql,params,async first(){
        if(sql.startsWith('SELECT * FROM clan_meta'))return clone(db.data.meta);
        if(sql.startsWith('SELECT version,state_json FROM saves'))return clone(db.data.save);
        if(sql.startsWith('SELECT ok FROM clan_storage_guard'))return db.data.guard.includes(params[0])?{ok:1}:null;
        throw new Error('Unexpected SELECT '+sql);
      }};
    }}},
    async batch(statements){
      if(this.failAfterRead){this.failAfterRead=false;this.data.save.version+=1}
      const old=clone(this.data);
      try{
        for(const x of statements){
          const p=x.params,s=x.sql;
          if(s.startsWith('UPDATE saves SET state_json')){
            if(this.data.save.version===p[4]){this.data.save.state_json=p[0];this.data.save.version=p[1]}
          }else if(s.startsWith('UPDATE clan_meta SET storage_json')){
            if(this.data.meta.storage_json===p[5]&&this.data.meta.permissions_json===p[6]&&this.data.meta.history_json===p[7]){
              this.data.meta.storage_json=p[0];this.data.meta.permissions_json=p[1];this.data.meta.history_json=p[2];
            }
          }else if(s.startsWith('INSERT INTO clan_storage_guard')){
            if(this.data.guard.includes(p[0]))throw new Error('UNIQUE guard already committed');
            if(!(this.data.save.version===p[2]&&this.data.save.state_json===p[3]&&this.data.meta.storage_json===p[5]&&this.data.meta.permissions_json===p[6]&&this.data.meta.history_json===p[7]))throw new Error('CAS guard failed');
            this.data.guard.push(p[0]);
          }else throw new Error('Unexpected transactional SQL '+s);
        }
      }catch(e){this.data.save=old.save;this.data.meta=old.meta;this.data.guard=old.guard;throw e}
    }
  };
  return db;
}
const id='777',p={nickname:'Tester'},m={role:'leader'},c={id:'guild1',storage_unlocked:1};
const items=Array.from({length:12},(_,i)=>({uid:'item-'+i,name:'Sword '+i,rarity:'rare',enh:i,createdAt:300+i,count:1,stats:{atk:4+i}}));
const bag=[{uid:'bag1',name:'Dagger',rarity:'common',stats:{atk:2}}];
const db=makeDb(items,bag);
let resp=await transfer({DB:db},id,p,m,c,{action:'take',requestId:'operation_000000000001',storageIndex:5,item:items[5],source:'clanMenu'});
assert.equal(resp.status,200);assert.equal((await resp.json()).reload,true);
assert.equal(JSON.parse(db.data.meta.storage_json).length,11,'one server item removed');
assert.equal(JSON.parse(db.data.save.state_json).bag.length,2,'one bag item added');
assert.deepEqual(JSON.parse(db.data.save.state_json).bag[1],items[5],'full item data retained');
const afterFirst=clone(db.data);
resp=await transfer({DB:db},id,p,m,c,{action:'take',requestId:'operation_000000000001',storageIndex:5,item:items[5],source:'clanMenu'});
assert.equal(resp.status,200);
assert.equal((await resp.json()).duplicate,true,'same request is acknowledged as already processed');
assert.deepEqual(db.data,afterFirst,'identical request cannot move an extra item');
assert.equal(db.data.guard.length,1,'unique request ID stays recorded permanently');
const before=clone(db.data);
await assert.rejects(()=>transfer({DB:db},id,p,m,c,{action:'take',requestId:'operation_000000000002',storageIndex:5,item:items[5]}),/изменился/);
assert.deepEqual(db.data,before,'stale request cannot duplicate/remove a second item');

const full=makeDb(items,Array.from({length:100},(_,i)=>({uid:'x'+i,name:'X'})));
await assert.rejects(()=>transfer({DB:full},id,p,m,c,{action:'take',requestId:'operation_000000000003',storageIndex:0,item:items[0]}),/заполнен/);
assert.equal(JSON.parse(full.data.meta.storage_json).length,12,'full bag does not consume warehouse item');

const notLeader=makeDb(items,bag);
await assert.rejects(()=>transfer({DB:notLeader},id,p,{role:'member'},c,{action:'take',requestId:'operation_000000000004',storageIndex:0,item:items[0]}),/Нет права/);
assert.equal(JSON.parse(notLeader.data.meta.storage_json).length,12,'unauthorized take blocked');

const conflict=makeDb(items,bag);conflict.failAfterRead=true;
await assert.rejects(()=>transfer({DB:conflict},id,p,m,c,{action:'take',requestId:'operation_000000000005',storageIndex:0,item:items[0]}),/изменились одновременно/);
assert.equal(JSON.parse(conflict.data.meta.storage_json).length,12,'failed transaction rolls back warehouse');
assert.equal(JSON.parse(conflict.data.save.state_json).bag.length,1,'failed transaction rolls back inventory');

const deposit=makeDb(items,bag);
resp=await transfer({DB:deposit},id,p,m,c,{action:'put',requestId:'operation_000000000006',bagIndex:0,item:bag[0]});
assert.equal(resp.status,200);
assert.equal(JSON.parse(deposit.data.meta.storage_json).length,13,'server deposited full gear');
assert.equal(JSON.parse(deposit.data.save.state_json).bag.length,0,'deposited item removed from cloud bag');
assert.deepEqual(JSON.parse(deposit.data.meta.storage_json)[12],bag[0],'metadata and stats not stripped');


const lookalikes=[{uid:'same-a',name:'Кольцо',rarity:'rare',enh:0},{uid:'same-b',name:'Кольцо',rarity:'rare',enh:0}];
const double=makeDb(lookalikes,bag);
let same=await transfer({DB:double},id,p,m,c,{action:'take',requestId:'repeat_same_card_0001',storageIndex:0,item:lookalikes[0]});
assert.equal(same.status,200);
same=await transfer({DB:double},id,p,m,c,{action:'take',requestId:'repeat_same_card_0001',storageIndex:0,item:lookalikes[0]});
assert.equal((await same.json()).duplicate,true,'second delivery is a no-op');
assert.equal(JSON.parse(double.data.meta.storage_json).length,1,'one of the two lookalike items remains');
assert.equal(JSON.parse(double.data.save.state_json).bag.length,2,'one of two moved to bag');
const duplicatedUid=makeDb([{uid:'abc',name:'Test',slot:'ring',rarity:'rare'}],[{uid:'abc',name:'Test',slot:'ring',rarity:'rare'}]);
await assert.rejects(()=>transfer({DB:duplicatedUid},id,p,m,c,{action:'take',requestId:'reject_duplicate_uid_0001',storageIndex:0,item:{uid:'abc',name:'Test',slot:'ring',rarity:'rare'}}),/уже присутствует/);
assert.equal(JSON.parse(duplicatedUid.data.meta.storage_json).length,1,'existing duplicate UID cannot be withdrawn again');
const partialUi=makeDb([{uid:'ui1',name:'Шлем',slot:'helmet',rarity:'epic',enh:4,refId:'original-asset',count:1}],bag);
const uiResp=await transfer({DB:partialUi},id,p,m,c,{action:'take',requestId:'ui_missing_optional_0001',storageIndex:0,item:{uid:'ui1',name:'Шлем',slot:'helmet',rarity:'epic',enh:4,count:1}});
assert.equal(uiResp.status,200,'Keeper item can omit optional refId without being rejected');

const html=fs.readFileSync('public/index.html','utf8');
assert.ok(html.includes('function ppaClanStorageMoveOnline(direction,idx,source,expectedItem)'));
assert.ok(html.includes("req.storageIndex=idx"),'clan withdraw binds exact server slot');
assert.ok(html.includes("if(mode==='clan'){\n    if(!CLAN_LOCAL_STATE.connected)"),'online clan move is not speculative local transfer');
assert.ok(html.includes("type:'clanStorageNotice'"),'user-visible feedback');
assert.ok(html.includes('requestId:operationId'),'each click has a retry-safe request ID');
console.log('Clan warehouse: existing 12 items preserved, atomic take/put, conflicts, permissions, and UI route OK.');
