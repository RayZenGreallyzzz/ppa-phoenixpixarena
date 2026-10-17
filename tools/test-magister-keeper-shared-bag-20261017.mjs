import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8');
const start=html.indexOf("var PPA_CLAN_BAG_LAST_SYNC='';");
const end=html.indexOf("function clanNotice(text){",start);
assert.ok(start>=0&&end>start&&end-start<2800,'Magister bag sender and refresh extracted');
const clanCode=html.slice(start,end);
const keeperStart=html.indexOf('function sendStorageState(){');
const keeperEnd=html.indexOf('function openStorage(){',keeperStart);
assert.ok(keeperStart>=0&&keeperEnd>keeperStart&&keeperEnd-keeperStart<2500);
const keeperCode=html.slice(keeperStart,keeperEnd);
assert.ok(!clanCode.includes('saveGame('),'display refresh must never save player inventory');
assert.ok(!clanCode.includes('INV.bag.splice'),'display refresh must never transfer items');

const potion={uid:'hp10',name:'Среднее зелье HP',kind:'consumable',refId:'hp_medium',count:10,img:'potion.png'};
const pet={uid:'pet1',name:'Волк',kind:'pet',count:1};
const inv={bag:[structuredClone(potion)],storage:{personal:[],premium:[],clan:[]},gold:309585,gram:.2,ppa:156404};
const posts={clan:[],storage:[]},timers=[];
const frame={style:{display:'block'},contentWindow:{postMessage:x=>posts.clan.push(structuredClone(x))}};
const storageFrame={style:{display:'block'},contentWindow:{postMessage:x=>posts.storage.push(structuredClone(x))}};
let saveCalls=0;
const ctx={console,INV:inv,CLAN_LOCAL_STATE:{bag:[],storage:{used:0,items:[]},warehouseV2Pilot:true},document:{getElementById(name){return name==='clanFrame'?frame:name==='storageFrame'?storageFrame:null}},
 clanFrameEl(){return frame},setInterval(fn,ms){timers.push({fn,ms})},
 clanStorageSyncRuntime(){/* simulate stale mirror; sender must bypass it */},
 clanBossSyncUi(){},clanSiegeMenuState(){return{}},clanCastleRewardState(){return{}},
 normalizeStorage(){},storageItemForUi(it){return{uid:it.uid,name:it.name,count:it.count,kind:it.kind,refId:it.refId}},
 clanAccessUi(){return{isLeader:true,storageUnlocked:true}},
 premiumStorageAccess(){return true},accountActivated(){return true},accountAuctionSlots(){return 10},accountLifetimePaidGram(){return 1},
 saveGame(){saveCalls++}
};
vm.createContext(ctx);
vm.runInContext(clanCode+'\n'+keeperCode,ctx);
assert.equal(timers.length,1,'display refresh timer installed');
ctx.sendStorageState();
ctx.sendClanState();
assert.deepEqual(posts.clan.at(-1).state.bag,posts.storage.at(-1).state.bag,
 'Keeper and Magister receive the exact same current bag list');
assert.equal(posts.clan.at(-1).state.bag[0].count,10);
assert.equal(posts.clan.at(-1).state.storage.used,0);
assert.equal(posts.clan.at(-1).state.warehouseV2Pilot,true);
assert.equal(ctx.CLAN_LOCAL_STATE.bag.length,1,'old empty local clan bag corrected');
let n=posts.clan.length;
timers[0].fn();
assert.equal(posts.clan.length,n,'no redundant refresh while bag unchanged');
inv.bag.push(structuredClone(pet));
timers[0].fn();
assert.equal(posts.clan.at(-1).state.bag.length,2,'open Magister refreshes when bag changes');
assert.equal(posts.clan.at(-1).state.bag[1].uid,'pet1','new bag item displayed');
n=posts.clan.length;
timers[0].fn();
assert.equal(posts.clan.length,n,'unchanged bag does not constantly rerender');
frame.style.display='none';
inv.bag.shift();
timers[0].fn();
assert.equal(posts.clan.length,n,'hidden Magister is not refreshed');
frame.style.display='block';
timers[0].fn();
assert.equal(posts.clan.at(-1).state.bag.length,1,'reopen Magister refreshes from latest bag even if state was stale');
assert.equal(posts.clan.at(-1).state.bag[0].uid,'pet1');
assert.equal(saveCalls,0,'display synchronization never saves / overwrites cloud');
console.log('PASS: Magister+Keeper show same potion x10 from INV.bag, reactive refresh, no re-render spam, reopen hydration, no save or inventory mutation.');
