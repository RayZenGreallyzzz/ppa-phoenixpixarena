import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {sharpenOriginalPPAItem, ENH_CHANCE_GAME, ENH_CHANCE_RUNE_GAME} from '../src/shared-sharpen.js';
import {sharedForgeOperation} from '../src/shared-forge.js';

const packed=Buffer.concat(Array.from({length:12},(_,i)=>readFileSync(
 new URL('../PPA'+String(i+1).padStart(2,'0')+'.bin',import.meta.url))));
const original=gunzipSync(packed).toString('utf8');
assert.equal(createHash('sha256').update(original).digest('hex'),
 'a23969659df17d6f303e688c296f4a2de67b4be8b702693a1760afb4971e43b7');
function legacyFn(name){
 const start=original.indexOf('function '+name+'(');
 assert(start>=0,'Missing original '+name);
 const end=original.indexOf('\n}\n',start)+2;
 assert(end>start&&end-start<12000,'Original '+name+' function unexpectedly complex');
 return original.slice(start,end);
}
function legacyConst(name){
 const start=original.indexOf('const '+name+'=');
 assert(start>=0,'Missing original '+name);
 const end=original.indexOf(';',start)+1;
 assert(end>start);
 return original.slice(start,end);
}
const names=['itemBM','syncItemBM','cloneNumericStats','ensureEnhBaseStats',
 'sharpenRoundStat','awakeningBonusForItem','awakeningStatLabel',
 'applyAwakeningExtras','petEnhBonusAtLevel','petBonusLabel',
 'applyPetEnhancementExtras','applyEnhancementStats','blacksmithEnhance'];
const program=[legacyConst('ENH_STAT_BONUS'),legacyConst('PET_ENH_PLUS5_BONUS'),
 "const STELLAR_GUARDIAN_NAME='Звёздный Хранитель';",
 ...names.map(legacyFn),
 'const ENH_CHANCE_GAME={1:43,2:35,3:27,4:19,5:12,6:7,7:3};',
 'const ENH_CHANCE_RUNE_GAME={1:55,2:47,3:40,4:33,5:27,6:23,7:19};'
].join('\n');
assert.deepEqual(ENH_CHANCE_GAME.slice(1),[43,35,27,19,12,7,3]);
assert.deepEqual(ENH_CHANCE_RUNE_GAME.slice(1),[55,47,40,33,27,23,19]);
const copy=v=>JSON.parse(JSON.stringify(v));
const item=(slot,rarity,enh)=>({
 uid:'original_item_uid',name:'Оригинальная вещь',slot,rarity,enh,
 classKey:'mage',petName:slot==='pet'?'Лунный лис':'',
 stats:{atk:55,def:19,hp:135,spd:3,crit:6,magicResist:5},
 ...(enh>0?{enhBaseStats:{atk:55,def:19,hp:135,spd:3,crit:6,magicResist:5}}:{})
});
const stateFor=v=>({classKey:'mage',bag:[v],stones:{normal:25,premium:25,rune:25},
 ppa:30000,feathers:{phoenix:60}});
let comparisons=0;
function compare(slot,rarity,level,stone,roll){
 const input=stateFor(item(slot,rarity,level)),unchanged=copy(input),gold=copy(input);
 const dice=Object.create(Math); dice.random=()=>roll/100;
 const ctx=vm.createContext({Math:dice,INV:gold,smithNotify(){},V238_SMITH_ENH_CTX:null});
 vm.runInContext(program,ctx);
 ctx.blacksmithEnhance(0,stone);
 const actual=sharpenOriginalPPAItem(input,'original_item_uid',stone,roll);
 assert.deepEqual(input,unchanged,'Helper modified original save');
 if(level===7||(level>=5&&stone.startsWith('normal'))){
  assert.equal(actual.status,409,'Blocked enhancement unexpectedly accepted');
  assert.deepEqual(gold,unchanged);
  return;
 }
 assert.equal(actual.status,200,'Original upgrade rejected: '+slot+'/'+rarity+'/'+level+'/'+stone);
 assert.deepEqual(copy(actual.state.stones),gold.stones,'Stone debit differs');
 assert.equal(actual.state.bag.length,gold.bag.length,'Original destroyed or kept a different item');
 if(gold.bag.length){
  const left=copy(actual.state.bag[0]),right=copy(gold.bag[0]);
  for(const key of ['enh','stats','bm','enhBaseStats','awakeningBonuses',
   'awakeningText','petEnhancementBonuses','bonusText']){
   assert.deepEqual(left[key],right[key],
    slot+'/'+rarity+'/'+level+'/'+stone+'/roll='+roll+'/'+key);
  }
 }
 comparisons++;
}
for(const slot of ['weapon','helmet','armor','gloves','ring','legs','boots',
 'necklace','artifact','cloak','wings','pet']){
 for(const rarity of ['common','uncommon','rare','epic','legendary']){
  for(const level of [0,1,4,5,6,7]){
   for(const stone of ['normal','normal_rune','premium','premium_rune']){
    for(const roll of [0,99])compare(slot,rarity,level,stone,roll);
   }
  }
 }
}
const initial=stateFor(item('weapon','epic',0));
initial.stones.rune=0;
assert.equal(sharpenOriginalPPAItem(initial,'original_item_uid','normal_rune',0).status,409);
assert.equal(sharpenOriginalPPAItem(initial,'other','normal',0).status,409);
assert.equal(sharpenOriginalPPAItem(initial,'original_item_uid','guarantee',0).status,400);
const special=stateFor(item('pet','epic',5));
special.bag[0].stellarGuardian=true;
assert.equal(sharpenOriginalPPAItem(special,'original_item_uid','premium',0).data.code,
 'SHARPEN_SPECIAL_NOT_READY');

// Production command deduplication ledger with isolated in-memory D1 emulator.
const sqlite=new DatabaseSync(':memory:');
const db={prepare(sql){const stmt=sqlite.prepare(sql.replace(/\?(\d+)/g,'?'));let values=[];
 return {bind(...args){values=args;return this;},
 first(){return stmt.get(...values)||null},
 run(){const r=stmt.run(...values);return {meta:{changes:Number(r.changes)}}}}}};
const saves=new Map([['a',{version:8,state:stateFor(item('weapon','epic',0))}],
 ['b',{version:3,state:stateFor(item('ring','rare',2))}]]);
let writes=0;
const persist={
 load:async id=>({ok:true,...structuredClone(saves.get(id))}),
 save:async(id,state,version)=>{
  const old=saves.get(id);
  if(old.version!==version)return {ok:false,status:409,code:'SAVE_VERSION_CONFLICT'};
  saves.set(id,{version:version+1,state});writes++;return {ok:true,version:version+1};
 }
};
const other=structuredClone(saves.get('b'));
const env={DB:db,PPA_FORGE_ENHANCE_ENABLED:'1',PPA_FORGE_ACTIONS_ENABLED:'0'};
const command={action:'enhance',uid:'original_item_uid',stone:'premium',
 version:8,requestId:'a'.repeat(32),success:true,ownerId:'b',roll:0};
const a=await sharedForgeOperation(env,'a','action',command,persist);
assert.equal(a.status,200,JSON.stringify(a));
assert.equal(saves.get('a').version,9);
assert.equal(writes,1);
assert.deepEqual(saves.get('b'),other,'Cross-account spend');
assert.deepEqual(await sharedForgeOperation(env,'a','action',command,persist),a);
assert.equal(writes,1,'Replay repeated the same enhancement');
const stale=await sharedForgeOperation(env,'a','action',
 {...command,requestId:'b'.repeat(32)},persist);
assert.equal(stale.data.code,'SAVE_VERSION_CONFLICT');
const disabled=await sharedForgeOperation({...env,PPA_FORGE_ENHANCE_ENABLED:'0'},'a','action',
 {...command,version:9,requestId:'c'.repeat(32)},persist);
assert.equal(disabled.status,404);
console.log('PPA_SHARED_SHARPEN_PARITY_OK comparisons='+comparisons+
 ' categories=12 rarities=5 stone_modes=4 stat_parity=1 failures=1 idempotency=1 owner=1');
