import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

const src=fs.readFileSync('src/clan-online.js','utf8').replace('export async function handleClanOnline','async function handleClanOnline');
const context=vm.createContext({crypto:webcrypto,TextEncoder,URLSearchParams,Response,console,setTimeout});
vm.runInContext(src,context);
vm.runInContext("reqClan=async function(env,id){return {m:{role:env.DB.role},c:{id:env.DB.clan_id,leader_id:env.DB.leader_id,storage_unlocked:1}}};metaRow=async function(env,cid){return env.DB.data.meta[cid]};saveRow=async function(env,id){const r=env.DB.data.saves[id];return r?{row:JSON.parse(JSON.stringify(r)),state:JSON.parse(r.state_json)}:null};state=async function(env,id){const s=JSON.parse(env.DB.data.meta[env.DB.clan_id].storage_json);return {storage:{used:s.length,items:s}}}",context);
const transfer=vm.runInContext('clanWarehouseTransferV2',context);
const action=vm.runInContext('action',context);
const clone=x=>JSON.parse(JSON.stringify(x));
const id='777',p={nickname:'Test'};
const gear={uid:'unique_helmet_123',name:'Шлем героя',kind:'gear',slot:'helmet',rarity:'epic',enh:7,count:1,stats:{hp:999},img:'hero.png'};
const potion={uid:'hp_medium',name:'Среднее зелье HP',kind:'consumable',refId:'hp_medium',rarity:'common',count:15,icon:'🍷',extra:{potency:123}};
const pet={uid:'pet_123456',name:'Волк',kind:'gear',slot:'pet',petName:'Волк',rarity:'legendary',count:1,enh:4,stats:{magic:77},dirSprites:{S:'abc'},img:'pet.png'};
const resources={uid:'monster_blood',name:'Кровь монстра',kind:'resource',refId:'monster_blood',count:99,rarity:'rare'};
function mockDb(bag=[],warehouse=[]){
  const s={bag:clone(bag),gold:1234,storage:{personal:[{name:'safe-personal'}],premium:[{name:'safe-premium'}],clan:[{name:'old mirror ignored'}]},pets:{active:'wolf'},consumables:{hp:99}};
  const meta={alpha:{clan_id:'alpha',storage_json:JSON.stringify(warehouse),history_json:'[]',permissions_json:'{}',updated_at:1},
    beta:{clan_id:'beta',storage_json:JSON.stringify([{name:'other clan'}]),history_json:'[]',permissions_json:'{}',updated_at:1}};
  const db={role:'leader',clan_id:'alpha',leader_id:id,data:{meta,saves:{[id]:{version:12,state_json:JSON.stringify(s)}},ops:{}},forceConflict:false,
    prepare(sql){return {bind(...args){return{sql,args,async first(){
      if(sql.startsWith('SELECT operation,actor_id FROM clan_warehouse_ops_v2'))return db.data.ops[args[0]]||null;
      throw Error('unexpected SELECT: '+sql);
    }}}}},
    async batch(stmts){
      const saved=clone(this.data),out=[];
      try{
        for(const q of stmts){
          const a=q.args,sql=q.sql;
          if(sql.startsWith('UPDATE saves SET version=')){
            const [nextVersion,nextRaw,time,owner,version,oldRaw,cid,oldStorage,oldHistory]=a;
            const current=this.data.saves[owner],m=this.data.meta[cid];
            const ok=!this.forceConflict&&current&&current.version===version&&current.state_json===oldRaw&&m&&m.storage_json===oldStorage&&m.history_json===oldHistory;
            if(ok){current.version=nextVersion;current.state_json=nextRaw;current.updated_at=time}
            out.push({meta:{changes:ok?1:0}});
          }else if(sql.startsWith('UPDATE clan_meta SET storage_json=')){
            const [nextStorage,nextHistory,time,cid,oldStorage,oldHistory,owner,nextVersion,nextRaw]=a;
            const m=this.data.meta[cid],save=this.data.saves[owner];
            const ok=m&&m.storage_json===oldStorage&&m.history_json===oldHistory&&save&&save.version===nextVersion&&save.state_json===nextRaw;
            if(ok){m.storage_json=nextStorage;m.history_json=nextHistory;m.updated_at=time}
            out.push({meta:{changes:ok?1:0}});
          }else if(sql.startsWith('INSERT INTO clan_warehouse_ops_v2')){
            const [opId,cid,actor,operation,ts,owner,oldVersion,oldRaw,clanId,oldStore,oldHistory]=a;
            const save=this.data.saves[owner],m=this.data.meta[clanId];
            if(this.data.ops[opId])throw Error('UNIQUE: repeated operation ID');
            if(!(save&&save.version===oldVersion&&save.state_json===oldRaw&&m&&m.storage_json===oldStore&&m.history_json===oldHistory))throw Error('CHECK(old) failed, rollback');
            this.data.ops[opId]={id:opId,actor_id:actor,operation,completed_at:ts,ok:1};out.push({meta:{changes:1}});
          }else if(sql.startsWith('UPDATE clan_warehouse_ops_v2 SET ok=')){
            const [owner,nextVersion,nextRaw,clanId,newStore,newHistory,opId]=a;
            const save=this.data.saves[owner],m=this.data.meta[clanId],op=this.data.ops[opId];
            if(!(op&&save&&save.version===nextVersion&&save.state_json===nextRaw&&m&&m.storage_json===newStore&&m.history_json===newHistory))throw Error('CHECK(new) failed, rollback');
            out.push({meta:{changes:1}});
          }else throw Error('Unexpected batch SQL: '+sql);
        }
        return out;
      }catch(err){this.data=saved;throw err}
    }
  };return db;
}
const nextReq=(()=>{let n=1;return ()=>('atomic_case_'+String(n++).padStart(9,'0'))})();
const call=async(db,actionType,attrs={})=>transfer({DB:db,CLAN_WAREHOUSE_TRANSFER_V2:'ENABLED_FOR_TEST'},id,p,{action:actionType,requestId:nextReq(),source:'keeper',...attrs});
const read=async r=>await r.json();
let db=mockDb([potion]);
const baseOther=JSON.stringify(db.data.meta.beta),before=JSON.parse(db.data.saves[id].state_json);
let r=await call(db,'put',{bagIndex:0,item:clone(potion)});
assert.equal(r.status,200);assert.equal((await read(r)).ok,true);
assert.equal(JSON.parse(db.data.saves[id].state_json).bag.length,0);
assert.deepEqual(JSON.parse(db.data.meta.alpha.storage_json)[0],potion,'entire 15-potion stack and all metadata retained');
assert.deepEqual(JSON.parse(db.data.saves[id].state_json).storage.personal,before.storage.personal,'personal storage untouched');
assert.deepEqual(JSON.parse(db.data.saves[id].state_json).storage.premium,before.storage.premium,'premium storage untouched');
assert.equal(JSON.stringify(db.data.meta.beta),baseOther,'other clan unchanged');
assert.equal(JSON.parse(db.data.meta.alpha.history_json).length,1,'one server log line for successful operation');
const afterPut=clone(db.data);
const nonce=Object.values(afterPut.ops)[0].id.split(':').pop();
r=await transfer({DB:db},id,p,{action:'put',requestId:nonce,bagIndex:0,item:clone(potion)});
assert.equal((await read(r)).duplicate,true,'same request only acknowledged, not replayed');
assert.deepEqual(db.data,afterPut,'replay must change nothing including history');
r=await call(db,'take',{storageIndex:0,item:clone(potion)});
assert.equal((await read(r)).ok,true);
assert.deepEqual(JSON.parse(db.data.saves[id].state_json).bag[0],potion);
assert.equal(JSON.parse(db.data.meta.alpha.storage_json).length,0);
assert.equal(JSON.parse(db.data.meta.alpha.history_json).length,2,'one line per committed transfer');
db=mockDb([gear,pet,resources]); const saveInitial=clone(db.data);
for(const entry of [gear,pet,resources]){
  r=await call(db,'put',{bagIndex:0,item:clone(entry)});
  assert.equal((await read(r)).ok,true);
}
assert.deepEqual(JSON.parse(db.data.meta.alpha.storage_json),[gear,pet,resources],'helmet, pet, resources preserved');
assert.deepEqual(JSON.parse(db.data.saves[id].state_json).storage.premium,JSON.parse(saveInitial.saves[id].state_json).storage.premium);
r=await call(db,'take',{storageIndex:1,item:clone(pet)});
assert.equal((await read(r)).ok,true);
assert.deepEqual(JSON.parse(db.data.saves[id].state_json).bag[0],pet,'pet stats and visual data intact');
db=mockDb([potion]);const old=clone(db.data);
await assert.rejects(()=>call(db,'put',{bagIndex:0,item:{...potion,count:10}}),/количество уже изменились/);
assert.deepEqual(db.data,old,'mismatched potion stack never consumed');
await assert.rejects(()=>call(db,'put',{bagIndex:0,item:{uid:potion.uid,name:potion.name,count:15}}),/количество уже изменились/);
assert.deepEqual(db.data,old,'old client lacking kind/refId cannot burn potions');
db.forceConflict=true;
await assert.rejects(()=>call(db,'put',{bagIndex:0,item:clone(potion)}),/одновременно/);
assert.deepEqual(db.data,old,'CAS conflict rollback touches neither bag nor warehouse nor op log');
db=mockDb([potion,potion]);const repeated='same_requested_once_12345';
const parallel=await Promise.all([
  transfer({DB:db},id,p,{action:'put',requestId:repeated,bagIndex:0,item:clone(potion)}),
  transfer({DB:db},id,p,{action:'put',requestId:repeated,bagIndex:0,item:clone(potion)})
]);
const results=await Promise.all(parallel.map(read));
assert.equal(results.filter(x=>x.duplicate).length,1,'one concurrent request recognized as duplicate');
assert.equal(JSON.parse(db.data.saves[id].state_json).bag.length,1);
assert.equal(JSON.parse(db.data.meta.alpha.storage_json).length,1,'one of two identical stacks transferred');
assert.equal(Object.keys(db.data.ops).length,1,'durable op guard retained');
db=mockDb([gear],[gear]);const duplicated=clone(db.data);
await assert.rejects(()=>call(db,'put',{bagIndex:0,item:clone(gear)}),/уникальный предмет уже есть/);
assert.deepEqual(db.data,duplicated,'unique gear cannot duplicate');
db=mockDb([],Array.from({length:1},()=>clone(gear)));
db.data.saves[id].state_json=JSON.stringify({...JSON.parse(db.data.saves[id].state_json),bag:Array.from({length:100},(_,i)=>({uid:'gear'+i,name:'gear'+i}))});
await assert.rejects(()=>call(db,'take',{storageIndex:0,item:clone(gear)}),/Сумка заполнена/);
db=mockDb([potion]);db.role='member';
await assert.rejects(()=>call(db,'put',{bagIndex:0,item:clone(potion)}),/разрешения/);
db=mockDb([potion]);const denied=clone(db.data);
const blocked=await action({DB:db,CLAN_WAREHOUSE_TRANSFER_V2:''},id,p,{action:'put',bagIndex:0,item:clone(potion),requestId:nextReq()});
assert.equal(blocked.status,423,'live production remains read-only without flag');
assert.deepEqual(db.data,denied,'production read-only request has zero DB changes');
const html=fs.readFileSync('public/index.html','utf8');
assert.ok(html.includes('put.disabled=true;putAll.disabled=true;take.disabled=true;takeAll.disabled=true;'),'both UI paths remain frozen');
console.log('PASS V2 (feature disabled): potion x15, gear/pet/resources, exact serialisation, personal/premium unaffected, replay and concurrent dedup, conflict rollback, permission/full bag checks, production read-only.');
