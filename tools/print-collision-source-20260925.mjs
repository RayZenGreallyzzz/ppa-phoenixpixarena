import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8');
for(const name of ['dungeon21ReferenceStats','applyDungeon21MobStats','applyDungeon41MobStats']){
  const p=src.indexOf('function '+name);
  if(p<0){console.log('MISSING '+name);continue}
  console.log('\n===== '+name+' =====\n');
  console.log(src.slice(p,Math.min(src.length,p+9000)));
}

// trigger dungeon mob stats exact 20260927
