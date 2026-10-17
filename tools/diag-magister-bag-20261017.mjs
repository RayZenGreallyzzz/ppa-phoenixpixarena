import fs from 'node:fs';
const h=fs.readFileSync('public/index.html','utf8');
function around(label,needle,limit=12,left=600,right=2200){let p=-1,n=0;while((p=h.indexOf(needle,p+1))>=0){n++;if(n<=limit)console.log('\n=== '+label+' #'+n+' @'+p+' ===\n'+h.slice(Math.max(0,p-left),p+right))}console.log('MATCH '+label+' '+n);}
around('clanState-occurrences','clanState',16,520,850);
around('clan bag assignments','CLAN_LOCAL_STATE.bag',12,500,1000);
around('clanReady','clanReady',12,550,1300);
around('openClanMenu','function openClanMenu()',1,100,1200);
around('serverClanSet','window.PPA_SET_CLAN_STATE=function(state)',1,80,3000);
around('keeper bag','function sendStorageState()',1,100,780);
around('clan sync','function clanStorageSyncRuntime()',1,100,900);
around('clan render message','d.type===&#x27;clanState&#x27;',3,450,600);
around('ui ready','function sendClanState()',1,80,850);
around('hydrated save','function loadGame(',3,200,1100);
around('sync image item','function storageItemForUi(',1,100,750);
around('updateBag','INV.bag=',18,330,650);
