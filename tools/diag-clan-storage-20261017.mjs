import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>'PPA'+String(i+1).padStart(2,'0')+'.bin');
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
const generated=fs.readFileSync('public/index.html','utf8');
function report(label,s){
  console.log('--- '+label+' '+s.length+' chars ---');
  for(const needle of ['function renderStorage(', 'clanMoveBtn','clanInspectCard','clanStorageMove','PPA_CLAN_STORAGE_HANDLER','type:\'clanStorage', 'type:&#x27;clanStorage','function storageMove(','function clanStorageMove(', 'storageMove(', 'clanMove', 'storageAccess', 'canWithdraw']){
    let index=-1,k=0,all=[];while((index=s.indexOf(needle,index+1))>=0){k++;if(all.length<5)all.push(index)}
    console.log('NEEDLE '+JSON.stringify(needle)+' count='+k+' indexes='+JSON.stringify(all));
    for(const pos of all.slice(0,needle==='clanMoveBtn'?3:1)){
      const radius=needle==='function renderStorage('?6500:needle==='clanMoveBtn'?3700:needle==='function storageMove('?4000:2400;
      console.log('EXCERPT '+needle+' @'+pos+'\n'+s.slice(Math.max(0,pos-400),pos+radius)+'\nEND');
    }
  }
}
report('ORIGINAL',src);
report('BUILT',generated);
