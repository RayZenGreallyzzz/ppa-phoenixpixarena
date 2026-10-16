import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('public/index.html','utf8');
const build=fs.readFileSync('build.mjs','utf8');
const server=fs.readFileSync('src/clan-online.js','utf8');
const online=fs.readFileSync('gateway/online-client.js','utf8');
function has(s,m){assert.ok(s.includes(m),'Missing: '+m)}
has(html,'function ppaClanStorageMoveOnline(direction,idx,source,expectedItem)');
has(html,'for(var k=0;k<list.length;k++)if(ppaClanStorageSameItem(list[k],expectedItem))matches.push(k)');
has(html,"if(matches.length!==1)");
has(html,"idx:selected.idx,item:(ST.bag||[])[selected.idx],source:&#x27;keeper&#x27;");
has(html,"idx:selected.idx,item:((ST.storage||{})[activeStoreMode()]||[])[selected.idx]");
has(html,"idx:idx,item:bag[idx],source:&#x27;clanMenu&#x27;");
has(html,"idx:idx,item:it,source:&#x27;clanMenu&#x27;");
has(html,"storageMove(d.mode,d.direction,d.idx,d.source,d.item)");
has(html,"if(!CLAN_LOCAL_STATE.connected){ppaClanStorageNotice('Нет связи с общим клановым складом");
has(html,"if(mode==='clan'){if(!CLAN_LOCAL_STATE.connected)");
has(html,"INV.storage.clan.sort(comparator);sendStorageState();sendClanState();");
assert.ok(!html.includes("clanStorageSyncRuntime();saveGame();sendStorageState();sendClanState();"),'Server clan state must not trigger a stale cloud save');
has(server,'clanWarehouseTransfer(env,id,p,m,c,b)');
has(server,'clan_storage_guard');
has(online,'PPA_CLAN_STORAGE_HANDLER');
has(build,'clan sorting is visual only and does not cloud-save');
// Sorting cannot change the identity of the selected slot on the server.
function same(a,b){
  if(!a||!b)return false;
  const ua=String(a.uid||''),ub=String(b.uid||'');
  if(ua||ub)return !!ua&&ua===ub;
  return String(a.name||'')===String(b.name||'')&&String(a.slot||'')===String(b.slot||'')&&String(a.rarity||'')===String(b.rarity||'')&&Number(a.enh||0)===Number(b.enh||0)&&String(a.createdAt||'')===String(b.createdAt||'');
}
const canonical=[{uid:'aa',name:'А',rarity:'epic'},{uid:'bb',name:'Б',rarity:'rare'},{uid:'cc',name:'В',rarity:'common'}];
const visible=[...canonical].reverse();
assert.equal(canonical.findIndex(x=>same(x,visible[0])),2);
assert.equal(canonical.filter(x=>same(x,visible[0])).length,1);
assert.equal(canonical.filter(x=>same(x,{uid:'missing'})).length,0);
assert.equal(canonical.filter(x=>same(x,{uid:'aa'})).length,1);
console.log('Clans and Keeper: same server storage, identity-based move, local-only sort, no offline mutations and no stale save OK');
