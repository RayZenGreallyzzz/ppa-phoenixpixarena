import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const h=fs.readFileSync('public/index.html','utf8');
const server=fs.readFileSync('src/clan-online.js','utf8');
function verify(name,present){assert.ok(present,'Missing '+name);}
verify('server protects inventory even when UI bypassed',server.includes("if(a==='put'||a==='take'||a==='putMany'||a==='takeMany')return jr({ok:false,code:'CLAN_STORAGE_READONLY'"));
verify('keeper buttons disabled',h.includes('put.disabled=true;putAll.disabled=true;take.disabled=true;takeAll.disabled=true;'));
verify('clan master callbacks blocked',h.includes('Клановый склад временно только для просмотра&#x27;);return;'));
verify('parent single transfer guard',h.includes("if(d.mode==='clan'||d.source==='clanMenu'){try{showPickup("));
verify('parent mass transfer guard',h.includes("else if(d.type==='storageMoveAll'){if(d.mode==='clan')"));
verify('parent sorting guard',h.includes("else if(d.type==='storageSort'){if(d.mode==='clan')"));
verify('personal and premium calls remain',h.includes("else storageMove(d.mode,d.direction,d.idx,d.source);")&&h.includes('else storageMoveAll(d.mode,d.direction,d.source);'));
verify('clear button retained',h.includes('ОЧИСТИТЬ ВЕСЬ КЛАНОВЫЙ СКЛАД'));
function extract(start,end){
  const i=h.indexOf(start);assert.ok(i>=0,'Missing '+start);
  const j=h.indexOf(end,i);assert.ok(j>i,'Missing end '+end);
  return h.slice(i,j);
}
const inventory={bag:[{uid:'potion-stack',kind:'consumable',refId:'hp_potion_medium',count:15}],storage:{personal:[],clan:[],premium:[]}};
const moved=extract('function storageMove(mode,direction,idx,source){','function storageMoveAll(mode,direction,source){');
const bulk=extract('function storageMoveAll(mode,direction,source){','function storageSort(mode,by){');
const ctx={INV:inventory,showPickup(){},console};
vm.runInNewContext(moved+'\n'+bulk+
"storageMove('clan','put',0,'keeper');storageMove('clan','take',0,'clanMenu');storageMoveAll('clan','put','keeper');storageMoveAll('clan','take','keeper');",ctx);
assert.equal(inventory.bag.length,1,'potion stack must still be in personal bag');
assert.equal(inventory.bag[0].count,15,'all 15 potions retained');
assert.equal(inventory.storage.clan.length,0,'clan warehouse untouched');
assert.equal(inventory.storage.personal.length,0,'personal warehouse untouched');
assert.equal(inventory.storage.premium.length,0,'premium warehouse untouched');
console.log('PASS: Keeper and Clan Master clan actions blocked at server, parent dispatcher, button UI, local function; personal/premium routing preserved; 15 potion stack safe.');
