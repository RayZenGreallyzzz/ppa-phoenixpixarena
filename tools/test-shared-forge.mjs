import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { EPIC_GEAR, craftOriginalEpicGear, sharedForgeOperation } from '../src/shared-forge.js';

const packed=Buffer.concat(Array.from({length:12},(_,i)=>readFileSync(
  new URL('../PPA'+String(i+1).padStart(2,'0')+'.bin',import.meta.url))));
const original=gunzipSync(packed).toString('utf8');
assert.equal(createHash('sha256').update(original).digest('hex'),
  'a23969659df17d6f303e688c296f4a2de67b4be8b702693a1760afb4971e43b7');
const decoded=s=>s.replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&amp;/g,'&');
const start=original.indexOf('const GEAR=[{&quot;');
assert(start>0,'Original Telegram blacksmith GEAR JSON not present');
const end=original.indexOf('];',start)+1;
assert(end>start&&end-start<9000);
const legacyGear=JSON.parse(decoded(original.slice(start+'const GEAR='.length,end)));
console.log('PPA_ORIGINAL_GEAR_SLOTS',JSON.stringify(legacyGear.map(x=>({slot:x.slot,name:x.name,price:x.price,mats:x.mats}))));
assert.equal(legacyGear.length,7);
for(const [i,g] of legacyGear.entries()){
 const offer=EPIC_GEAR.find(x=>x.slot===g.slot);
 assert(offer,g.slot);
 assert.equal(offer.name,g.name);
 assert.equal(offer.price,g.price);
 assert.equal(offer.icon,g.icon);
 assert.deepEqual(offer.materials.map(x=>x.name),[...g.mats,'Перо Феникса']);
 assert.deepEqual(offer.materials.map(x=>x.count),[24*18,16*18,8*18,2]);
}
const nmstart=original.indexOf('var CLASS_ITEM_NAMES=');
const nmend=original.indexOf('};',nmstart)+1;
assert(nmstart>0&&nmend>nmstart);
const originalNames=JSON.parse(original.slice(nmstart+'var CLASS_ITEM_NAMES='.length,nmend));

function legacyFn(name, endMark) {
 const pos=original.indexOf('function '+name+'(');
 assert(pos>=0,name+' missing');
 const next=original.indexOf(endMark,pos);
 assert(next>pos,name+' end missing');
 return original.slice(pos,next).trim();
}
const scoreCode=legacyFn('itemBM','\nfunction ');
const wardCode=legacyFn('applyGearMagicWard','\nfunction ');
const statsCode=original.slice(original.indexOf('function craftStats('),original.indexOf('\nconst WING_DIR_ART=',original.indexOf('function craftStats(')));
const ctx=vm.createContext({});
vm.runInContext(scoreCode+'\n'+wardCode+'\n'+statsCode,ctx);
const validClasses=['tank','paladin','barbarian','mage','priest','archer','assassin','gnome'];
const initial=(cls='gnome')=>({
 playerName:'Original Hero',nickname:'Original Hero',telegramId:'10001',profileTelegramId:'10001',
 gatewayProfileBound:true,cls,classKey:cls,ppa:50000,gold:17,gram:8,lvl:35,hp:711,mp:124,
 bag:[{uid:'real_existing_+7',slot:'weapon',enh:7,rarity:'legendary',stats:{atk:500}}],
 equip:{weapon:{uid:'equipped_+7',enh:7,stats:{atk:400}}},
 materials:Object.fromEntries(EPIC_GEAR.flatMap(x=>x.materials.filter(m=>m.name!=='Перо Феникса')).map(x=>[x.name,10000])),
 feathers:{phoenix:100},skillRanks:{fireball:3},stones:{normal:3},runes:{atk:3}
});
let cases=0;
for(const cls of validClasses)for(const offer of EPIC_GEAR){
 const state=initial(cls),copy=structuredClone(state);
 const crafted=craftOriginalEpicGear(state,offer.id,'craft_abcdefghijklmnopqrstuvwxyz1234567890');
 assert.equal(crafted.status,200,cls+'/'+offer.id);
 assert.deepEqual(state,copy,'original state changed');
 const item=crafted.state.bag.at(-1);
 assert.equal(item.name,originalNames[cls][offer.slot]);
 assert.equal(item.classKey,cls);
 assert.equal(item.slot,offer.slot);
 assert.equal(item.enh,0);
 assert.equal(item.rarity,'epic');
 const originalItem={stats:JSON.parse(JSON.stringify(ctx.craftStats('gear',offer.slot,item.name,'epic'))),
  slot:offer.slot,rarity:'epic'};
 ctx.applyGearMagicWard(originalItem);
 assert.deepEqual(item.stats,originalItem.stats,cls+'/'+offer.id);
 if(originalItem.bm!==undefined) assert.equal(item.bm,originalItem.bm);
 assert.equal(crafted.state.ppa,copy.ppa-offer.price);
 for(const req of offer.materials){
  const c=req.name==='Перо Феникса'?crafted.state.feathers.phoenix:crafted.state.materials[req.name];
  const previous=req.name==='Перо Феникса'?copy.feathers.phoenix:copy.materials[req.name];
  assert.equal(c,previous-req.count);
 }
 for(const k of ['equip','skillRanks','stones','runes','lvl','hp','mp','gold','gram'])
  assert.deepEqual(crafted.state[k],copy[k],k);
 cases++;
}
const id=EPIC_GEAR[0].id;
for(const [name,mutate,code] of [
 ['insufficient PPA',x=>x.ppa=1,'PPA_NOT_ENOUGH'],
 ['missing resources',x=>delete x.materials,'RESOURCES_NOT_READY'],
 ['missing feather',x=>x.feathers.phoenix=0,'MATERIALS_NOT_ENOUGH'],
 ['unknown materials',x=>delete x.materials[EPIC_GEAR[0].materials[0].name],'MATERIALS_NOT_ENOUGH'],
 ['full bag',x=>{while(x.bag.length<100)x.bag.push({uid:String(x.bag.length)})},'BAG_FULL_OR_INVALID'],
 ['unknown class',x=>{x.classKey='fake';x.cls='fake'},'CLASS_NOT_VERIFIED']]) {
 const state=initial(); mutate(state);const before=structuredClone(state);
 const result=craftOriginalEpicGear(state,id,'craft_abcdefghijklmnopqrstuvwxyz1234567890');
 assert.equal(result.data.code,code,name);
 assert.deepEqual(state,before,name+' changed state');
}
assert.equal(craftOriginalEpicGear(initial(),'gear:epic:unknown','craft_abcdefghijklmnopqrstuvwxyz1234567890').status,400);

// Same production D1 idempotency ledger; fake app persistence only in memory.
const sql=new DatabaseSync(':memory:');
const db={prepare(query){
 const stmt=sql.prepare(query.replace(/\?(\d+)/g,'?'));
 let args=[];
 return {bind(...xs){args=xs;return this},first(){return stmt.get(...args)||null},
   run(){const result=stmt.run(...args);return{meta:{changes:Number(result.changes)}}}};
}};
const saves=new Map([['10001',{version:6,state:initial()}],['10002',{version:9,state:initial('mage')} ]]);
let writeCount=0;
const persistence={
 async load(owner){const save=saves.get(owner);return save?{ok:true,...structuredClone(save)}:{ok:false}},
 async save(owner,state,version){
  const record=saves.get(owner);
  if(!record||record.version!==version)return{ok:false,status:409,code:'SAVE_VERSION_CONFLICT'};
  saves.set(owner,{version:version+1,state});writeCount++;
  return {ok:true,version:version+1};
 }
};
const env={DB:db,PPA_FORGE_ACTIONS_ENABLED:'1'};
const first={action:'craft',id,version:6,requestId:'f'.repeat(32),clientPrice:0,
  ownerId:'10002',state:{ppa:9999999999}};
const originalOther=structuredClone(saves.get('10002'));
const bought=await sharedForgeOperation(env,'10001','action',first,persistence);
assert.equal(bought.status,200,JSON.stringify(bought));
assert.equal(bought.data.contract,'ppa-forge-v1');
assert.equal(bought.data.state.version,7);
assert.equal(writeCount,1);
assert.equal(saves.get('10001').state.bag.length,2);
assert.deepEqual(await sharedForgeOperation(env,'10001','action',first,persistence),bought,
  'Double replay minted a second item');
assert.equal(writeCount,1);
assert.deepEqual(saves.get('10002'),originalOther,'Wrong player mutated');
const stale=await sharedForgeOperation(env,'10001','action',
  {...first,requestId:'e'.repeat(32)},persistence);
assert.equal(stale.data.code,'SAVE_VERSION_CONFLICT');
assert.equal(writeCount,1);
const denied=await sharedForgeOperation({...env,PPA_FORGE_ACTIONS_ENABLED:'0'},
  '10001','action',{...first,version:7,requestId:'d'.repeat(32)},persistence);
assert.equal(denied.status,404);
const current=await sharedForgeOperation(env,'10001','state',{},persistence);
assert.equal(current.status,200);
assert.equal(current.data.state.offers.length,7);
assert.equal(current.data.state.wallet.ppa,saves.get('10001').state.ppa);
console.log('PPA_SHARED_FORGE_EPIC_OK legacy_recipes=7 class_items='+cases+
  ' real_legacy_stats=1 version_cas=1 idempotent=1 no_cross_account=1 original_bag=1');
