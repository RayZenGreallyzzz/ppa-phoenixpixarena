import fs from 'node:fs';
const s=fs.readFileSync('public/index.html','utf8');
for(const [name,needle,before,after] of [
 ['storageMove','function storageMove(mode,direction,idx,source)',200,4800],
 ['storageMoveAll','function storageMoveAll(mode,direction,source)',150,4000],
 ['storageSync','function storageSync(',150,1800],
 ['clanStorageServerEvent','function clanStorageServerEvent(',250,3500],
 ['clanStorageSyncRuntime','function clanStorageSyncRuntime(',150,1200],
 ['PPA_SET_CLAN_STATE','window.PPA_SET_CLAN_STATE=function',100,2900],
 ['message storageMove',"else if(d.type==='storageMove')",1800,1000],
 ['storageSort','function storageSort(',150,1500],
 ['sendClanState','function sendClanState(',150,1000],
 ['sendStorageState','function sendStorageState(',150,1600],
 ['storage item ui','function storageItemForUi(',150,2300],
 ['game save','function saveGame(',150,2300],
 ['game save object','window.ppaBuildSaveObject=',150,1000],
 ['storage item UI gear','function storageItemForUi(',0,1000],
 ['clan bag','function trBag(',150,1000]
]){
 const p=s.indexOf(needle);console.log('\n=== '+name+' @'+p+' ===');
 if(p>=0)console.log(s.slice(Math.max(0,p-before),p+after));
}
const needles=['clanStorageServerEvent(', 'storageMove(mode,', "type:'storageMove'", 'INV.storage.clan=', 'INV.storage.clan.push(', 'INV.storage.clan.splice(', 'function normalizeStorage(', 'storageMoveAll(', 'storageReady'];
for(const n of needles){let p=-1,i=0,h=[];while((p=s.indexOf(n,p+1))>=0){i++;if(h.length<8)h.push(p)}console.log('LOC '+n+' '+i+' '+JSON.stringify(h))}
