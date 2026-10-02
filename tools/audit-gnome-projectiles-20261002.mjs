import fs from 'node:fs';
import zlib from 'node:zlib';
const parts=Array.from({length:12},(_,i)=>`PPA${String(i+1).padStart(2,'0')}.bin`);
const src=zlib.gunzipSync(Buffer.concat(parts.map(p=>fs.readFileSync(p)))).toString('utf8').replace(/data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/=]+/g,'[DATA_IMAGE]');
const compact=s=>s.replace(/\s+/g,' ').trim();
function extractFunction(name){
  const sig=`function ${name}(`, start=src.indexOf(sig);
  if(start<0)return `NOT FOUND: ${name}`;
  const brace=src.indexOf('{',start); let depth=0, quote='', esc=false;
  for(let i=brace;i<src.length;i++){
    const c=src[i];
    if(quote){if(esc)esc=false;else if(c==='\\')esc=true;else if(c===quote)quote='';continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='{')depth++; else if(c==='}'&&--depth===0)return compact(src.slice(start,i+1));
  }
  return compact(src.slice(start,start+10000));
}
function contexts(term,radius=700){
  const a=[];let p=0,n=0;
  while((p=src.indexOf(term,p))>=0){n++;a.push(`\n[${term} #${n} @${p}]\n${compact(src.slice(Math.max(0,p-radius),Math.min(src.length,p+term.length+radius)))}`);p+=term.length;}
  return `COUNT ${term}: ${n}\n`+a.join('\n');
}
const sections=[
  '=== FUNCTION gnomeFireCannonball ===\n'+extractFunction('gnomeFireCannonball'),
  '=== PLAYER_CANNONBALLS CONTEXTS ===\n'+contexts('PLAYER_CANNONBALLS',1000),
  '=== queueAttack ===\n'+extractFunction('queueAttack'),
  '=== findNearBasic ===\n'+extractFunction('findNearBasic'),
  '=== melee ===\n'+extractFunction('melee'),
  '=== PvP CONTEXTS ===\n'+contexts("P.scene==='pvp1'",900),
  '=== pvpCombat CONTEXTS ===\n'+contexts('pvpCombat',900),
];
const text=sections.join('\n\n')+'\n';
fs.writeFileSync('gnome-projectile-audit.txt',text);
console.log(text);
