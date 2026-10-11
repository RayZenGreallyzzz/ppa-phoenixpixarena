import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {readFileSync} from 'node:fs';

// Audit ORIGINAL Telegram PPA PvE damage code without executing gameplay.
// Only checksum-locked PPA01..PPA12 source; no player state, network or writes.
const original=Buffer.concat(Array.from({length:12},(_,i)=>
  readFileSync(new URL('../PPA'+String(i+1).padStart(2,'0')+'.bin',import.meta.url))));
const unpacked=zlib.gunzipSync(original);
const sha=crypto.createHash('sha256').update(unpacked).digest('hex');
assert.equal(sha,'a23969659df17d6f303e688c296f4a2de67b4be8b702693a1760afb4971e43b7');
const src=unpacked.toString('utf8');
const heads=[
  ['HIT_PACKET','mob-hit-event'],['MOB_DAMAGE','mobDamage'],
  ['MOB_HIT','mobHit'],['APPLY_MOB','applyMob'],
  ['ENEMY_DAMAGE','enemyDamage'],['DAMAGE_DEALT','damageDealt'],
  ['CRIT_DAMAGE','critDmg'],['ARMOR_PEN','armorPen'],
  ['MONSTER_DEF','mob.def'],['PLAYER_ATK','hero.atk'],
  ['ATTACK_DAMAGE','attackDamage'],['MOB_DEF','mobDef'],
  ['DEAL_DAMAGE','dealDamage'],['DO_DAMAGE','doDamage'],
  ['APPLY_DAMAGE','applyDamage'],['CALC_DAMAGE','calcDamage'],
  ['BASIC_ATTACK','function basicAttack'],['ATTACK_TARGET','attackTarget']
];
for(const [label,needle] of heads){
  let from=0,found=0;
  for(let n=0;n<6;n++){
    const at=src.indexOf(needle,from);
    if(at<0)break;
    from=at+needle.length; found++;
    const sample=src.slice(Math.max(0,at-170),Math.min(src.length,at+400))
      .replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]{50,}/gi,'[embedded image omitted]')
      .replace(/[\r\n\t]+/g,' ');
    console.log('PPA_ORIGINAL_'+label+'_MATCH '+n+' '+JSON.stringify(sample));
  }
  console.log('PPA_ORIGINAL_'+label+'_FOUND '+found);
}
const explicit=[
 ['BASIC_ATTACK_ROLL','function basicAttackRoll(',2600],
 ['BASIC_ATTACK_PLAYER_RANGE','function playerBasicRange(',550],
 ['BONUS_DAMAGE_MULT','function clanDamageMulFor(',1300],
 ['SHOP_DAMAGE_MULT','function shopDamageMul(',800],
 ['BASIC_ATTACK_PLAYER','basicAttackRoll(target)',1400],
 ['MOB_HIT_APPLY','function hitEnemy(',1100],
 ['MOB_HIT_HANDLER','function damageEnemy(',1000]
];
for(const [label,term,n] of explicit){
  const at=src.indexOf(term);
  const found=at>=0;
  console.log('PPA_DAMAGE_EXACT_'+label+'_FOUND '+found);
  if(found){
    const sample=src.slice(at,at+n).replace(/[\\r\\n\\t]+/g,' ')
      .replace(/data:image[^ ]{50,}/gi,'[image]');
    console.log('PPA_DAMAGE_EXACT_'+label+'_SOURCE '+JSON.stringify(sample));
  }
}
console.log('PPA_ORIGINAL_PVE_DAMAGE_SOURCE_AUDIT_OK sha256='+sha+' bytes='+unpacked.length);
