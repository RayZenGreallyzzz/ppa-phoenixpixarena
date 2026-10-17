import fs from 'node:fs';
const s=fs.readFileSync('public/index.html','utf8');
const needles=[
 ['keeper-clan-access','clanAccess:clanAccessUi()',190,1500],
 ['keeper-clan-pilot','warehouseV2Pilot:!!CLAN_LOCAL_STATE.warehouseV2Pilot',300,700],
 ['keeper-button-update','function updateClanButtons()',200,2900],
 ['keeper-put','document.getElementById(&#x27;put&#x27;).onclick',300,1550],
 ['keeper-state-msg','if(d.type===&#x27;storageState&#x27;)',200,1500],
 ['clan-state-handler','if(d.type===&#x27;clanState&#x27;)',380,1900],
 ['clan-state-handler2','d.type===&#x27;clanState&#x27;',380,1600],
 ['clan-script-init','let STATE=',180,1300],
 ['clan-sync-runtime','function clanStorageSyncRuntime()',100,1600],
 ['send-clan','function sendClanState()',100,850],
 ['open-clan','function openClanMenu()',100,1500],
 ['server-state-set','window.PPA_SET_CLAN_STATE=function(state)',100,2500],
 ['v2-client','function ppaClanStorageTransferV2(',100,2700],
 ['keeper-pilot-disabled','if(!ST.warehouseV2Pilot)',100,650],
 ['clan-pilot-block','if(!STATE.warehouseV2Pilot)',100,650],
 ['send-storage','function sendStorageState()',100,1900],
 ['item-ui','function storageItemForUi(',80,1750],
 ['save-object','window.ppaBuildSaveObject',200,650]
];
for(const [name,needle,before,after] of needles){
 const p=s.indexOf(needle);
 console.log('\n=== '+name+' @'+p+' ===');
 if(p>=0)console.log(s.slice(Math.max(0,p-before),p+after));
}
for(const needle of ['clanState','STATE.bag','CLAN_LOCAL_STATE.bag','warehouseV2Pilot','function updateClanButtons']) {
 const results=[];let pos=-1;while((pos=s.indexOf(needle,pos+1))>=0){results.push(pos);if(results.length>40)break}
 console.log('\nLOC '+needle+':'+results.join(','));
}
