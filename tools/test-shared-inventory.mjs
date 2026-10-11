import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {originalInventoryMove,sharedInventoryOperation} from '../src/shared-inventory.js';

const packed=Buffer.concat(Array.from({length:12},(_,i)=>
 readFileSync(new URL('../PPA'+String(i+1).padStart(2,'0')+'.bin',import.meta.url))));
const source=gunzipSync(packed).toString('utf8');
assert.equal(createHash('sha256').update(source).digest('hex'),
 'a23969659df17d6f303e688c296f4a2de67b4be8b702693a1760afb4971e43b7');
function legacyFn(name){
 const i=source.indexOf('function '+name+'(');
 assert(i>=0,'Missing Telegram '+name);
 const end=source.indexOf('\nfunction ',i+13);
 assert(end>i&&end-i<5000,'Original '+name+' body drift');
 return source.slice(i,end);
}
const program=legacyFn('equipFromBag')+'\n'+legacyFn('unequipSlot');
const slots=['weapon','helmet','armor','gloves','ring','legs','boots',
 'necklace','artifact','cloak','wings','pet'];
const clone=x=>JSON.parse(JSON.stringify(x));
const hero=(slot,swap=false)=>({
 classKey:'mage',cls:'mage',name:'Exact PPA player',hp:100,gram:5,ppa:800,
 stones:{normal:9,premium:10,rune:5},
 bag:[{uid:'new_'+slot,slot,classKey:'mage',className:'Маг',rarity:'epic',enh:5,
  name:'Новая вещь',stats:{atk:13},bm:135}],
 equipped:{[slot]:swap?{uid:'old_'+slot,slot,classKey:'mage',name:'Старая +7',
  enh:7,stats:{atk:100},bm:450}:null}
});
let tested=0;
for(const slot of slots)for(const swapped of [true,false]){
 const initial=hero(slot,swapped),expected=clone(initial),before=clone(initial);
 const ctx={INV:expected,currentGearClassKey:()=>expected.classKey,
  CLASS_DISPLAY:{mage:'Маг'},showPickup(){},recomputeStats(){},resetPetFollower(){}};
 vm.runInNewContext(program,ctx);
 ctx.equipFromBag(0);
 const result=originalInventoryMove(initial,'equip','new_'+slot);
 assert.equal(result.status,200,slot);
 assert.deepEqual(clone(result.state),expected,'Original PPA equip swap differs: '+slot);
 assert.deepEqual(initial,before,'Helper mutated original save');
 const un=originalInventoryMove(result.state,'unequip',slot);
 assert.equal(un.status,200,slot);
 ctx.unequipSlot(slot);
 assert.deepEqual(clone(un.state),expected,'Original PPA unequip differs: '+slot);
 assert.equal(un.state.bag.at(-1).uid,'new_'+slot);
 tested++;
}
const restricted=hero('weapon');restricted.bag[0].classKey='assassin';
assert.equal(originalInventoryMove(restricted,'equip','new_weapon').data.code,'CLASS_MISMATCH');
const old=clone(restricted);
assert.deepEqual(restricted,old);
const invalid=hero('weapon');
invalid.bag.push(clone(invalid.bag[0]));
assert.equal(originalInventoryMove(invalid,'equip','new_weapon').data.code,'INVENTORY_ITEM_MISSING');
const full=hero('weapon');
full.bag=Array.from({length:100},(_,i)=>({uid:'item_'+i,slot:'armor'}));
full.equipped.weapon={uid:'existing',slot:'weapon',enh:7};
assert.equal(originalInventoryMove(full,'unequip','weapon').data.code,'BAG_FULL');
assert.equal(full.equipped.weapon.enh,7);
assert.equal(originalInventoryMove(hero('weapon'),'unequip','weapon').data.code,'SLOT_EMPTY');
assert.equal(originalInventoryMove(hero('weapon'),'equip','foreign').status,409);

const sql=new DatabaseSync(':memory:');
const db={prepare(query){let stmt=sql.prepare(query.replace(/\?(\d+)/g,'?'));let args=[];
 return {bind(...p){args=p;return this;},first(){return stmt.get(...args)||null},
 run(){const r=stmt.run(...args);return {meta:{changes:Number(r.changes)}}}}}};
const saves=new Map([['ownerA',{version:8,state:hero('weapon',true)}],
 ['ownerB',{version:3,state:hero('ring',true)}]]);
const originalB=structuredClone(saves.get('ownerB'));
let writes=0;
const persistence={
 load:async id=>({ok:true,...structuredClone(saves.get(id))}),
 save:async(id,state,version)=>{
  const x=saves.get(id);
  if(!x||x.version!==version)return{ok:false,status:409,code:'SAVE_VERSION_CONFLICT'};
  saves.set(id,{version:version+1,state});writes++;return{ok:true,version:version+1};
 }
};
const env={DB:db,PPA_INVENTORY_ACTIONS_ENABLED:'1'};
const req={requestId:'d'.repeat(32),action:'equip',uid:'new_weapon',
 version:8,ownerId:'ownerB',rarity:'legendary',enh:7,bag:[{uid:'fake'}]};
const first=await sharedInventoryOperation(env,'ownerA','action',req,persistence);
assert.equal(first.status,200,JSON.stringify(first));
assert.equal(first.data.receipt.replacedUid,'old_weapon');
assert.equal(saves.get('ownerA').state.equipped.weapon.uid,'new_weapon');
assert.equal(saves.get('ownerA').state.bag[0].uid,'old_weapon');
assert.equal(writes,1);
assert.deepEqual(saves.get('ownerB'),originalB,'Foreign player inventory changed');
assert.deepEqual(await sharedInventoryOperation(env,'ownerA','action',req,persistence),
 first,'Duplicate request repeated the swap');
assert.equal(writes,1);
const stale=await sharedInventoryOperation(env,'ownerA','action',
 {...req,requestId:'e'.repeat(32)},persistence);
assert.equal(stale.data.code,'SAVE_VERSION_CONFLICT');
const snapshot=await sharedInventoryOperation(env,'ownerA','state',{},persistence);
assert.equal(snapshot.status,200);
assert.equal(snapshot.data.state.equipped.weapon.uid,'new_weapon');
assert.equal(snapshot.data.state.version,9);
const unequip=await sharedInventoryOperation(env,'ownerA','action',
 {action:'unequip',slot:'weapon',version:9,requestId:'f'.repeat(32)},persistence);
assert.equal(unequip.status,200);
assert.equal(saves.get('ownerA').state.bag.at(-1).uid,'new_weapon');
assert.equal(saves.get('ownerA').state.equipped.weapon,null);
assert.equal(writes,2);
const off=await sharedInventoryOperation({...env,PPA_INVENTORY_ACTIONS_ENABLED:'0'},
 'ownerA','action',{action:'equip',uid:'new_weapon',version:10,requestId:'1'.repeat(32)},persistence);
assert.equal(off.status,404);
console.log('PPA_SHARED_INVENTORY_ORIGINAL_OK comparison='+tested+
 ' 12_slots=1 swap=1 class=1 full_bag=1 uid=1 no_shadow_inventory=1 no_cross_owner=1 dedup=1 version=1');
