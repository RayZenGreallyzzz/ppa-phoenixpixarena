import fs from 'node:fs';
import zlib from 'node:zlib';

const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const raw=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
const src=raw.replace(/data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/=]+/g,'[DATA_IMAGE]');
const built=fs.readFileSync('public/index.html','utf8');

function one(label,text,needle,before=1200,after=2600){
  const i=text.indexOf(needle);
  console.log(`\n===== ${label} =====`);
  console.log(`needle=${JSON.stringify(needle)} index=${i}`);
  if(i>=0){
    console.log(text.slice(Math.max(0,i-before),Math.min(text.length,i+after)).replace(/\n/g,' '));
  }
}

function regex(label,text,re,before=1000,after=2200){
  const m=re.exec(text);
  console.log(`\n===== ${label} =====`);
  console.log(`match=${m?JSON.stringify(m[0]):'NONE'} index=${m?m.index:-1}`);
  if(m){
    console.log(text.slice(Math.max(0,m.index-before),Math.min(text.length,m.index+after)).replace(/\n/g,' '));
  }
}

one('SAVE WARNING FINAL',built,'СЕЙВ ЗАЩИЩЕН');
one('SAVE WARNING ALT FINAL',built,'старые данные НЕ перезаписали облако');
one('QUEUE ATTACK PACKED',src,'function queueAttack');
one('QUEUE ATTACK FINAL',built,'function queueAttack');
one('PRESENCE STATE PACKED',src,'presenceState');
one('O_REMOTES FINAL',built,'O_REMOTES');
regex('REMOTE MAP FINAL',built,/(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*new Map\(\)/);
regex('SAVE PROTECTION RELATED FINAL',built,/(?:toast|notify|showToast|msg|message)[\s\S]{0,300}?(?:облако|сейв|старые данные)/i);
