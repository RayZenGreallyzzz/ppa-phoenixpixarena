import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import zlib from 'node:zlib';
// SAFE targeted audit of the checksum-locked original Telegram source.
// No network, no game execution, no credentials or player save writes.
const chunks=Array.from({length:12},(_,i)=>readFileSync(
  new URL('../PPA'+String(i+1).padStart(2,'0')+'.bin',import.meta.url)));
const sourceBytes=zlib.gunzipSync(Buffer.concat(chunks));
const hash=crypto.createHash('sha256').update(sourceBytes).digest('hex');
assert.equal(hash,'a23969659df17d6f303e688c296f4a2de67b4be8b702693a1760afb4971e43b7');
const src=sourceBytes.toString('utf8');
const keys=[
  ['PASSIVE_META','const PASSIVE_META=',2200],
  ['PASSIVE_APPLY','function applyPassive',1400],
  ['PASSIVE_BONUS','function passiveBonus',1800],
  ['PASSIVE_BUFF','function passive',1100],
  ['PASSIVE_LOOP','const meta=PASSIVE_META[sk.id]',2200],
  ['SKILL_RANK','function skillRank(',550],
  ['ACTIVE_DISPATCH','if(!sk)return;const rank=skillRank(sk.id)',1700],
  ['ACTIVE_SKILL','function castClassSkill(',1500],
  ['ACTIVE_RANK_HELPER','const V189_RANK=',950],
  ['CLAN_HP','function clanHpMul(',1800],
  ['CLAN_MP','function clanMpMul(',1800],
  ['CLAN_INCOMING','function clanSiegeIncomingMul(',1200],
  ['CLASS_SKILLS','const CLASS_SKILLS=',1500],
  ['GRIMOIRE_CATALOG','const GRIMOIRE_CATALOG=',350],
];
// Exact numeric passive registry. The original client has separate V189
// passive metadata and an ordered GRIMOIRE_CATALOG class -> skill list.
const vm=(await import('node:vm')).default;
const objectLiteral=(prefix)=>{
  const pos=src.indexOf(prefix);
  assert(pos>=0,'Original passive symbol missing: '+prefix);
  const start=src.indexOf('{',pos+prefix.length);
  let depth=0, quote='',escape=false;
  for(let i=start;i<src.length;i++){
    const c=src[i];
    if(quote){
      if(escape){escape=false;continue}
      if(c==='\\\\'){escape=true;continue}
      if(c===quote)quote='';
      continue;
    }
    if(c==="'"||c==='"'||c==='\\`'){quote=c;continue}
    if(c==='{')depth++;
    else if(c==='}' && --depth===0)
      return src.slice(start,i+1);
  }
  throw Error('Unbalanced object: '+prefix);
};
const meta=vm.runInNewContext('('+objectLiteral('const PASSIVE_META=')+')',
  Object.create(null),{timeout:3000});
const catalog=vm.runInNewContext('('+objectLiteral('const GRIMOIRE_CATALOG=')+')',
  Object.create(null),{timeout:3000});
const passiveMap={};
for(const [ck,cat] of Object.entries(catalog)){
  if(!Array.isArray(cat.passive))continue;
  passiveMap[ck]=cat.passive.map(sk=>{
    const d=meta[sk.id];
    assert(d&&typeof d.k==='string'&&Array.isArray(d.v)&&
      d.v.length===3&&d.v.every(Number.isFinite),
      'Unknown original V189 passive '+ck+'.'+sk.id);
    return {id:sk.id,k:d.k,v:Array.from(d.v)};
  });
}
console.log('PASSIVE_REGISTRY_JSON='+JSON.stringify(passiveMap));
console.log('PASSIVE_COUNT='+Object.values(passiveMap).reduce((n,v)=>n+v.length,0));
console.log('PPA_ORIGINAL_SKILLS_CLAN_CHECKSUM_OK '+hash);
for(const [name,term,n] of keys){
  const pos=src.indexOf(term);
  const sample=pos>=0?src.slice(pos,pos+n).replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]{100,}/g,'[image stripped]'):'';
  console.log('SKILL_'+name+'_FOUND='+(pos>=0)+
    ' HEAD='+JSON.stringify(sample));
}
