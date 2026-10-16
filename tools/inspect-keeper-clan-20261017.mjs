import fs from 'node:fs';
const source=fs.readFileSync('public/index.html','utf8');
const tests=[
 ["keeper-html","function renderStorage(",9500],
 ["keeper-card","function inspectStorageItem(",1300],
 ["keeper-events","type:'storageMove'",2600],
 ["keeper-message","type:&#x27;storageMove&#x27;",2600],
 ["keeper-selection","selected={side:side,idx:i}",2000],
 ["sync-clan","function clanStorageSyncRuntime(",1700],
 ["server-to-client","window.PPA_SET_CLAN_STATE=function(state){",3900],
 ["send-clan","function sendClanState(",2900],
 ["keeper-sync","function sendStorageState(",1400],
 ["wallet-ready","window.PPA_CLAN_STORAGE_HANDLER",800],
 ["storage-move-call","function ppaClanStorageMoveOnline(",2900],
 ["clan-menu","function renderStorage(){",7600],
 ["keeper-mode","mode==='clan'",3000],
 ["storage-sort","function storageSort(",2300]
];
for(const [name,needle,len] of tests){
  const pos=source.indexOf(needle);
  console.log('\n=== '+name+' @'+pos+' ===');
  if(pos>=0)console.log(source.slice(pos,pos+len));
}
