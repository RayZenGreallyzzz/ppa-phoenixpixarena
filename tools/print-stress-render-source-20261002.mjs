import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
const clean=s=>s.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g,'data:image/...;base64,[REMOVED]');
function emit(label,pos,pre=3500,post=9000){if(pos<0)return;console.log(`\n===== ${label} @${pos} =====\n`+clean(src.slice(Math.max(0,pos-pre),Math.min(src.length,pos+post))))}
function scan(term,max=20){let p=0,n=0;while((p=src.indexOf(term,p))>=0&&n<max){emit(term+' '+(++n),p);p+=term.length}}
for(const term of ['PPA_ONLINE_STRESS','debugRemotes','ppaOnlineDrawRemote','drawnLast','BOT 1','LOCAL STRESS'])scan(term,20);
